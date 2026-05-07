import * as THREE from 'three';
import * as CANNON from 'cannon-es';

import { World } from '../World';
import { IWorldEntity } from '../../interfaces/IWorldEntity';
import { EntityType } from '../../enums/EntityType';
import { UpdateOrder } from '../../enums/UpdateOrder';
import { CollisionGroups } from '../../enums/CollisionGroups';
import { attachNameLabel } from '../ui/NameLabel';
import { t } from '../../i18n';

import { Animal, AnimalKind, MEOW_DURATION, TAME_FOLLOW_DIST, TAME_THRESHOLD, targetSpeedFor } from './AnimalBehavior';
import { DOG_BEHAVIOR } from './DogBehavior';
import { CAT_BEHAVIOR } from './CatBehavior';
import { applyAnimalAnimation, buildCatModel, buildDogModel, CAT_SCHEMES, DOG_SCHEMES } from './AnimalModels';
import { AnimalVoiceBus } from './AnimalVoices';

// Voice fade in seconds. 0.45 covers the bark; cat meow runs longer
// (set via MEOW_DURATION on a per-animal basis, see playVoice).
const BARK_VOICE_DURATION = 0.45;

// Wandering dogs and cats around the player spawn. This file is the
// *manager*: it owns the per-animal hierarchical model groups, the
// spawn placement, the cannon dynamic body for each animal, the
// off-map raycasts, and the CSS2D label anchors. All per-animal
// state-machine decisions live in DogBehavior / CatBehavior; the
// visual model + per-limb animation lives in AnimalModels.ts.
//
// Each animal carries a small DYNAMIC cannon body (sphere) so the
// physics world resolves three things automatically:
//
//   - terrain: body sits on the trimesh, no manual ground-snap math
//   - player: capsule-vs-sphere collision so the boxman can bump a
//     dog out of the way
//   - other animals: sphere-vs-sphere so dogs and cats don't walk
//     through each other
//
// Manager only writes body.velocity.x/z each frame from the AI's
// desired motion; cannon does the rest, including jumps (we kick
// body.velocity.y at the start, gravity pulls it back, the body's
// 'collide' event flips the airborne flag back off on touch-down).
//
// Pattern adapted from manuelhintermayr-portfolio/three-js
// WanderingAnimals + the low-poly-cat-game HTML demo. The portfolio
// used InstancedMesh; we replaced that with per-animal Three.Groups
// because the cat-game-style animations (idle breath, walk-cycle,
// run-cycle, jump pose) need independent per-limb transforms.

const DOG_COUNT = 1;
const CAT_COUNT = 2;
const SPAWN_INNER = 18;   // keep clear of the spawn pad
const SPAWN_OUTER = 80;   // Inthenew map's playable area is ~200 wide

// Off-map detection re-samples the trimesh every 100ms per animal. Y
// is no longer lerped (cannon owns position now); the raycast only
// catches animals that have walked off the terrain so they can be
// redirected home.
const GROUND_QUERY_INTERVAL_S = 0.1;

// Mulberry32 - small deterministic PRNG so spawn placement is the same
// on every page load (otherwise reload would scramble the world).
function mulberry32(seed: number): () => number
{
	return () =>
	{
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const _toPlayer = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _rayStart = new CANNON.Vec3();
const _rayEnd = new CANNON.Vec3();
const _rayResult = new CANNON.RaycastResult();

// Cat-game models are authored at "real" scale (cat ≈ 2 units long,
// dog ≈ 2.3 units long). Sketchbook needs them lawn-mower sized so
// the lawn isn't dwarfed - shrink the whole top group uniformly. Per-
// animal `scale` (set in spawn()) multiplies on top for population
// variation. Halved from the first-pass values (was 0.45 / 0.55) so
// the herd looks like wildlife instead of like livestock.
const CAT_BASE_SCALE = 0.225;
const DOG_BASE_SCALE = 0.275;

// Cannon body radius per kind. Sphere collider sized to the visible
// model footprint - cats slimmer, dogs stockier. Kept conservative
// so animals don't visibly clip into the player capsule on contact.
const CAT_BODY_RADIUS = 0.28;
const DOG_BODY_RADIUS = 0.38;
// Body mass - light enough that the player capsule (mass 1) shoves
// them out of the way easily, heavy enough that animal-vs-animal
// nudges read as actual contact instead of vanishing through.
const ANIMAL_MASS = 0.25;
// Linear damping on the dynamic body. Light - we drive velocity each
// frame from the AI (so cannon's damping isn't the speed control),
// but a tiny non-zero damping kills the residual sideways drift from
// collision response.
const ANIMAL_DAMPING = 0.1;

export class WanderingAnimals implements IWorldEntity
{
	public updateOrder: number = UpdateOrder.World;
	public entityType: EntityType = EntityType.Decoration;

	private world: World | null = null;
	private animals: Animal[] = [];
	private voiceBus: AnimalVoiceBus | null = null;

	private static singleton: WanderingAnimals | null = null;
	public static getInstance(): WanderingAnimals | null { return WanderingAnimals.singleton; }
	public getAnimalPositions(): THREE.Vector3[]
	{
		const out: THREE.Vector3[] = [];
		for (const a of this.animals) out.push(a.position);
		return out;
	}

	constructor()
	{
		WanderingAnimals.singleton = this;
	}

	public addToWorld(world: World): void
	{
		this.world = world;
		this.voiceBus = new AnimalVoiceBus(world);

		// Spawn animals only after the trimesh terrain has been added to
		// the physics world (otherwise the height raycasts come back
		// empty and everything spawns at y=0 inside the ocean).
		this.spawn();

		// Each animal owns its own Three.Group + cannon body. Add both
		// to the world here. Models hook into CSM for shadows; bodies
		// get a 'collide' listener so we can flip airborne off the
		// instant they touch terrain (or anything else).
		for (const animal of this.animals)
		{
			world.graphicsWorld.add(animal.model.group);
			animal.model.group.traverse((child) =>
			{
				const m = (child as THREE.Mesh).material;
				if (m && (m as THREE.Material).isMaterial) world.sky.csm.setupMaterial(m as THREE.Material);
			});
			world.physicsWorld.addBody(animal.body);
			animal.body.addEventListener('collide', () =>
			{
				// First contact after a kick - flip airborne off so the
				// animator drops the jump pose. State machine is left
				// alone unless still in 'jump' (a behaviour transition
				// mid-air may have already changed it).
				if (animal.airborne)
				{
					animal.airborne = false;
					if (animal.state === 'jump')
					{
						animal.state = 'idle';
						animal.stateTimer = 0.5 + Math.random() * 1.5;
					}
				}
			});
		}

		// Attach label anchors + CSS2D tags. WorldLabels distance-culls
		// at 10 units and feature-gates on params.Animal_Labels (off by
		// default - opt-in via the Settings panel, otherwise the spawn
		// looks busy with 18 tags floating).
		for (const animal of this.animals)
		{
			world.graphicsWorld.add(animal.labelAnchor);
			const text = animal.kind === 'dog' ? t('animal.dog') : t('animal.cat');
			const className = animal.kind === 'dog' ? 'name-label animal dog' : 'name-label animal cat';
			attachNameLabel(animal.labelAnchor, text, false, {
				className,
				maxDistance: 10,
				feature: 'Animal_Labels',
			});
		}
	}

	public removeFromWorld(world: World): void
	{
		for (let i = 0; i < this.animals.length; i++)
		{
			const animal = this.animals[i];
			world.graphicsWorld.remove(animal.model.group);
			world.graphicsWorld.remove(animal.labelAnchor);
			world.physicsWorld.removeBody(animal.body);
			if (animal.kind === 'cat' && this.voiceBus !== null)
			{
				this.voiceBus.stopPurrLoop('cat-' + i);
			}
		}
		this.voiceBus = null;
		this.world = null;
	}

	public update(_timeStep: number, unscaledTimeStep: number): void
	{
		if (this.world === null) return;

		const dt = Math.min(unscaledTimeStep, 0.05);
		const player = this.world.characters[0];
		if (player === undefined) return;
		const playerPos = player.position;

		for (const animal of this.animals)
		{
			// Sync graphics-side position from the cannon body. Body
			// is the source of truth for x/y/z now; AI just steers
			// horizontal velocity, cannon handles collision + gravity.
			animal.position.set(
				animal.body.position.x,
				animal.body.position.y,
				animal.body.position.z,
			);

			_toPlayer.subVectors(animal.position, playerPos);
			_toPlayer.y = 0;
			const playerDist = _toPlayer.length();

			animal.stateTimer -= dt;
			animal.behavior.update(animal, playerDist, playerPos);

			// AI -> body velocity. Compute the desired horizontal speed
			// from the state machine + target, then write it on the
			// cannon body. We never touch body.velocity.y unless we're
			// kicking off a jump - that's the only way to keep gravity
			// + collision response consistent.
			//
			// animal.velocity is the AI's *intended* horizontal motion
			// (what the animator should see). body.velocity gets the
			// same value but cannon will modify it through damping +
			// collision response, so reading it back wouldn't match
			// what the animation should portray.
			const targetSpeed = targetSpeedFor(animal.state);
			let desiredVx = 0;
			let desiredVz = 0;
			if (targetSpeed > 0)
			{
				_toTarget.subVectors(animal.target, animal.position);
				_toTarget.y = 0;
				const dist = _toTarget.length();
				if (dist > 0.5)
				{
					_dir.copy(_toTarget).normalize();
					animal.heading = Math.atan2(_dir.x, _dir.z);
					desiredVx = _dir.x * targetSpeed;
					desiredVz = _dir.z * targetSpeed;
				}
			}
			animal.body.velocity.x = desiredVx;
			animal.body.velocity.z = desiredVz;
			animal.velocity.set(desiredVx, 0, desiredVz);

			// Off-map detection - throttled raycast spots animals that
			// have walked off the trimesh edge (ocean rim, ramp gaps)
			// where cannon collision finds nothing to land on. Redirect
			// them home before they fall into oblivion.
			animal.groundQueryTimer -= dt;
			if (animal.groundQueryTimer <= 0)
			{
				animal.groundQueryTimer = GROUND_QUERY_INTERVAL_S;
				const queryY = this.queryGroundHeight(animal.position.x, animal.position.z);
				if (queryY === null || queryY < 0.5)
				{
					animal.target.copy(animal.homePosition);
					animal.state = 'wander';
					animal.stateTimer = 3;
				}
			}

			// Keep the label anchor on top of the animal. CSS2DObject
			// uses the world position of its parent, so updating the
			// anchor each frame is what makes the tag follow.
			animal.labelAnchor.position.set(
				animal.position.x,
				animal.position.y + 0.7,
				animal.position.z,
			);

			// Pure time driver - matches the cat-game reference where
			// animTime += dt and the leg-cycle frequency comes solely
			// from cycleSpeed (13 run / 8 walk) inside AnimalModels.
			// Earlier velocity-coupled drivers stacked on top of that
			// and gave 4+ Hz leg flicker at sprint speed.
			animal.animPhase += dt;

			// Voice trigger queue. Behaviours set animal.pendingVoice on
			// state transitions (cat -> meow, dog approach -> bark);
			// here we fire the synth + start the mouth-animation timer.
			// Wrapped in try/catch so a broken AudioContext (autoplay
			// rejection, browser quirk, suspended state) can't crash
			// the for-loop and freeze every other animal's state
			// machine. Mouth animation still plays from voiceTimer.
			if (animal.pendingVoice !== null && this.voiceBus !== null)
			{
				try { this.voiceBus.play(animal.pendingVoice, animal.position); }
				catch (_e) { /* audio failed, animation still runs */ }
				animal.voiceTimer = animal.pendingVoice === 'meow' ? MEOW_DURATION : BARK_VOICE_DURATION;
				animal.pendingVoice = null;
			}
			if (animal.voiceTimer > 0) animal.voiceTimer = Math.max(0, animal.voiceTimer - dt);

			// Drive the visual model: position / rotation / per-frame
			// limb animation. Replaces the old InstancedMesh matrix
			// write - each animal now has its own transform tree.
			this.applyModel(animal, dt);
		}

		// Purr loops for tame cats sitting near the player. Toggled per
		// animal each frame: start when conditions are met, stop the
		// moment the cat moves away or stops being tame. Multiple
		// nearby tame cats can purr at once - each loop is independent.
		this.updatePurrLoops(playerPos);

		// Per-frame master volume sync - keeps voices following
		// Master_Volume slider changes without having to wire an
		// onChange handler. Wrapped because the voice bus's audio
		// graph might be in a degraded state on some browsers.
		if (this.voiceBus !== null)
		{
			try { this.voiceBus.updateMasterVolume(); }
			catch (_e) { /* silent; volume will retry next frame */ }
		}
	}

	private updatePurrLoops(playerPos: THREE.Vector3): void
	{
		if (this.voiceBus === null) return;
		for (let i = 0; i < this.animals.length; i++)
		{
			const animal = this.animals[i];
			if (animal.kind !== 'cat') continue;
			const id = 'cat-' + i;
			const dx = animal.position.x - playerPos.x;
			const dz = animal.position.z - playerPos.z;
			const dist = Math.sqrt(dx * dx + dz * dz);
			const tame = animal.interactionCount >= TAME_THRESHOLD;
			const shouldPurr = tame && dist < TAME_FOLLOW_DIST;
			try
			{
				if (shouldPurr && !this.voiceBus.hasPurrLoop(id))
				{
					this.voiceBus.startPurrLoop(id, animal.position);
				}
				else if (!shouldPurr && this.voiceBus.hasPurrLoop(id))
				{
					this.voiceBus.stopPurrLoop(id);
				}
			}
			catch (_e) { /* audio failed; loop state will retry next frame */ }
		}
	}

	private spawn(): void
	{
		if (this.world === null) return;

		const rng = mulberry32(456);
		this.animals.length = 0;

		const place = (kind: AnimalKind, count: number): void =>
		{
			let placed = 0;
			let attempts = 0;
			while (placed < count && attempts < count * 50)
			{
				attempts++;
				const angle = rng() * Math.PI * 2;
				const spawnRadius = SPAWN_INNER + rng() * (SPAWN_OUTER - SPAWN_INNER);
				const x = Math.cos(angle) * spawnRadius;
				const z = Math.sin(angle) * spawnRadius;

				const y = this.queryGroundHeight(x, z);
				if (y === null || y < 1) continue;

				// Per-population variation on top of the species base
				// scale (CAT_BASE_SCALE / DOG_BASE_SCALE in module
				// scope) so dogs and cats look like a real population
				// instead of clones.
				const scale = kind === 'dog' ? 0.85 + rng() * 0.3 : 0.7 + rng() * 0.35;
				const pos = new THREE.Vector3(x, y, z);

				const labelAnchor = new THREE.Object3D();
				labelAnchor.position.copy(pos);

				// Pick a random colour scheme from the species palette.
				const schemes = kind === 'dog' ? DOG_SCHEMES : CAT_SCHEMES;
				const scheme = schemes[Math.floor(rng() * schemes.length)];
				const model = kind === 'dog' ? buildDogModel(scheme) : buildCatModel(scheme);
				const baseScale = kind === 'dog' ? DOG_BASE_SCALE : CAT_BASE_SCALE;
				model.group.scale.setScalar(baseScale * scale);
				model.group.position.copy(pos);

				// Sphere body, sized to the visible footprint. Spawn it
				// half a body-radius above the terrain so it doesn't
				// start interpenetrating and shoot upward on the first
				// physics step.
				const radius = kind === 'dog' ? DOG_BODY_RADIUS : CAT_BODY_RADIUS;
				const body = new CANNON.Body({
					mass: ANIMAL_MASS,
					shape: new CANNON.Sphere(radius),
					position: new CANNON.Vec3(x, y + radius + 0.05, z),
					collisionFilterGroup: CollisionGroups.Animals,
					// Collide with terrain (Default + TrimeshColliders for
					// the actual ground), the player capsule (Characters),
					// and other animal bodies. Ocean / iris / etc. live on
					// other groups and we don't want to bump them.
					collisionFilterMask: CollisionGroups.Default | CollisionGroups.Characters
						| CollisionGroups.TrimeshColliders | CollisionGroups.Animals,
					linearDamping: ANIMAL_DAMPING,
					fixedRotation: true,  // sphere shouldn't roll about
				});
				body.allowSleep = false;

				this.animals.push(
				{
					kind,
					position: pos.clone(),
					velocity: new THREE.Vector3(),
					heading: rng() * Math.PI * 2,
					state: 'idle',
					stateTimer: rng() * 5,
					target: pos.clone(),
					animPhase: rng() * Math.PI * 2,
					scale,
					interactionCount: 0,
					homePosition: pos.clone(),
					labelAnchor,
					// Stagger first raycast across the interval so all 18
					// animals don't sample on the same frame and tank it.
					groundQueryTimer: rng() * GROUND_QUERY_INTERVAL_S,
					behavior: kind === 'dog' ? DOG_BEHAVIOR : CAT_BEHAVIOR,
					model,
					pendingVoice: null,
					voiceTimer: 0,
					body,
					airborne: false,
					bodyRadius: radius,
				});
				placed++;
			}
		};

		place('dog', DOG_COUNT);
		place('cat', CAT_COUNT);
	}

	// Per-frame transform sync for one animal: world position from
	// physics-light integrator above, heading-driven yaw, then the
	// model-internal limb / tail / ear animation in AnimalModels.
	private applyModel(animal: Animal, _dt: number): void
	{
		const g = animal.model.group;
		// body.position.y is the sphere centre, which sits 1 radius
		// above the ground after collision. The visual model has its
		// FOOT_OFFSET shift inside, so plant the root at body bottom
		// (= body.position.y - radius) and the paws land flush.
		g.position.set(
			animal.position.x,
			animal.position.y - animal.bodyRadius,
			animal.position.z,
		);
		// heading = atan2(dx, dz). Three.js Y-rotation is CCW-from-above
		// positive; rotating the model's +Z forward axis by +heading
		// lines it up with the target direction. The old InstancedMesh
		// path used -heading, but that flipped models 180° east/west -
		// invisible on simple spheres, but obvious now that cats/dogs
		// have a clear nose/tail axis (a dog "approaching" the player
		// was actually walking backwards).
		g.rotation.y = animal.heading;

		const speed = animal.velocity.length();
		const moving = speed > 0.3;
		const running = speed > 4;
		// 0..1 fade for mouth-open / bark-shake animation. Length of
		// the active voice is encoded in voiceTimer; we map it to a
		// linear fade for the model. Dog bark-shake reads the same
		// fraction so a "louder" early bark snaps the head harder.
		const voiceMax = animal.kind === 'cat' ? MEOW_DURATION : BARK_VOICE_DURATION;
		const voiceFraction = animal.voiceTimer > 0 ? animal.voiceTimer / voiceMax : 0;
		applyAnimalAnimation(animal.model, {
			t: animal.animPhase,
			speed,
			isDog: animal.kind === 'dog',
			moving,
			running,
			voiceFraction,
			jumping: animal.airborne,
			velocityY: animal.body.velocity.y,
		});
	}

	// Cast a ray straight down from y=100 into the cannon physics world.
	// The trimesh ground is on Default group so the default mask catches
	// it. Returns null if no hit, which signals the caller to bail out
	// (animal probably wandered off the map).
	private queryGroundHeight(x: number, z: number): number | null
	{
		if (this.world === null) return null;
		_rayStart.set(x, 100, z);
		_rayEnd.set(x, -10, z);
		_rayResult.reset();
		const hit = this.world.physicsWorld.raycastClosest(
			_rayStart, _rayEnd,
			{ collisionFilterMask: CollisionGroups.Default, skipBackfaces: true },
			_rayResult,
		);
		return hit ? _rayResult.hitPointWorld.y : null;
	}

}
