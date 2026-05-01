import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { World } from './World';
import { IWorldEntity } from '../interfaces/IWorldEntity';
import { EntityType } from '../enums/EntityType';
import { CollisionGroups } from '../enums/CollisionGroups';
import { attachNameLabel } from './NameLabel';

// Wandering dogs and cats around the player spawn. Each animal runs
// a small state machine — dogs notice the player and approach to bark,
// cats flee. Both can be tamed by repeated interaction (the threshold
// is low because Sketchbook sessions are short — gives a quick payoff).
//
// Movement is graphics-only: animals are not physics bodies. They
// query the cannon trimesh terrain via raycast for ground height each
// frame, which is cheap (≤18 raycasts per frame) and avoids needing
// a separate per-animal RigidBody.
//
// Pattern adapted from manuelhintermayr-portfolio/three-js
// WanderingAnimals — reshaped from a React useFrame hook into an
// IWorldEntity. The portfolio used a procedural simplex terrain
// height function; here we raycast against the actual cannon physics
// world so the animals stay on whatever map is loaded.

const DOG_COUNT = 8;
const CAT_COUNT = 10;
const SPAWN_INNER = 18;   // keep clear of the spawn pad
const SPAWN_OUTER = 80;   // Inthenew map's playable area is ~200 wide

const DOG_NOTICE = 15;
const DOG_BARK_DIST = 3;
const DOG_PURSUE_SPEED = 3;
const DOG_GIVEUP = 10;

const CAT_FLEE_DIST = 10;
const CAT_FLEE_SPEED = 10;

const TAME_THRESHOLD = 2;
const TAME_FOLLOW_DIST = 5;
const TAME_FOLLOW_SPEED = 2.5;

const WANDER_SPEED = 1.5;

type AnimalKind = 'dog' | 'cat';
type AnimalState = 'idle' | 'wander' | 'flee' | 'approach' | 'bark' | 'tame';

interface Animal
{
	kind: AnimalKind;
	position: THREE.Vector3;
	velocity: THREE.Vector3;
	heading: number;
	state: AnimalState;
	stateTimer: number;
	target: THREE.Vector3;
	animPhase: number;
	scale: number;
	interactionCount: number;
	homePosition: THREE.Vector3;
	// Empty Object3D added to graphicsWorld; its position is updated
	// each frame to match the instanced animal so its CSS2D label
	// follows along. The label itself lives as a child of this anchor.
	labelAnchor: THREE.Object3D;
}

// Mulberry32 — small deterministic PRNG so spawn placement is the same
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

function buildDogGeometry(): THREE.BufferGeometry
{
	const body = new THREE.SphereGeometry(1, 6, 6);
	body.scale(0.35, 0.25, 0.6);
	body.translate(0, 0.35, 0);

	const head = new THREE.SphereGeometry(0.18, 6, 6);
	head.translate(0, 0.45, 0.55);

	const tail = new THREE.ConeGeometry(0.06, 0.3, 4);
	tail.rotateX(-0.6);
	tail.translate(0, 0.45, -0.55);

	return mergeGeometries([body, head, tail], false);
}

function buildCatGeometry(): THREE.BufferGeometry
{
	const body = new THREE.SphereGeometry(1, 6, 6);
	body.scale(0.2, 0.18, 0.45);
	body.translate(0, 0.28, 0);

	const head = new THREE.SphereGeometry(0.14, 6, 6);
	head.translate(0, 0.35, 0.4);

	const earL = new THREE.ConeGeometry(0.05, 0.12, 3);
	earL.translate(-0.08, 0.5, 0.4);
	const earR = new THREE.ConeGeometry(0.05, 0.12, 3);
	earR.translate(0.08, 0.5, 0.4);

	const tail = new THREE.CylinderGeometry(0.03, 0.02, 0.4, 4);
	tail.rotateX(-0.8);
	tail.translate(0, 0.35, -0.45);

	return mergeGeometries([body, head, earL, earR, tail], false);
}

const _toPlayer = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _rayStart = new CANNON.Vec3();
const _rayEnd = new CANNON.Vec3();
const _rayResult = new CANNON.RaycastResult();

export class WanderingAnimals implements IWorldEntity
{
	public updateOrder: number = 10;
	public entityType: EntityType = EntityType.Decoration;

	private world: World | null = null;
	private animals: Animal[] = [];
	private dogMesh: THREE.InstancedMesh;
	private catMesh: THREE.InstancedMesh;

	constructor()
	{
		const dogGeo = buildDogGeometry();
		const catGeo = buildCatGeometry();
		const dogMat = new THREE.MeshStandardMaterial({ color: 0xb5651d, roughness: 0.8 });
		const catMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });

		this.dogMesh = new THREE.InstancedMesh(dogGeo, dogMat, DOG_COUNT);
		this.catMesh = new THREE.InstancedMesh(catGeo, catMat, CAT_COUNT);
		this.dogMesh.castShadow = true;
		this.dogMesh.receiveShadow = true;
		this.catMesh.castShadow = true;
		this.catMesh.receiveShadow = true;
		// InstancedMesh's bounding sphere doesn't account for instance
		// positions so frustum-culling would clip them at the wrong
		// distance. 18 instances is cheap enough to skip culling.
		this.dogMesh.frustumCulled = false;
		this.catMesh.frustumCulled = false;
	}

	public addToWorld(world: World): void
	{
		this.world = world;

		// Spawn animals only after the trimesh terrain has been added to
		// the physics world (otherwise the height raycasts come back
		// empty and everything spawns at y=0 inside the ocean).
		this.spawn();

		world.graphicsWorld.add(this.dogMesh);
		world.graphicsWorld.add(this.catMesh);
		world.sky.csm.setupMaterial(this.dogMesh.material as THREE.Material);
		world.sky.csm.setupMaterial(this.catMesh.material as THREE.Material);

		// Attach label anchors + CSS2D tags. WorldLabels distance-culls
		// at 30 units and feature-gates on params.Animal_Labels (off by
		// default — opt-in via the Settings panel, otherwise the spawn
		// looks busy).
		for (const animal of this.animals)
		{
			world.graphicsWorld.add(animal.labelAnchor);
			const text = animal.kind === 'dog' ? 'Hund' : 'Katze';
			const className = animal.kind === 'dog' ? 'name-label animal dog' : 'name-label animal cat';
			attachNameLabel(animal.labelAnchor, text, false, {
				className,
				maxDistance: 30,
				feature: 'Animal_Labels',
			});
		}
	}

	public removeFromWorld(world: World): void
	{
		world.graphicsWorld.remove(this.dogMesh);
		world.graphicsWorld.remove(this.catMesh);
		for (const animal of this.animals)
		{
			world.graphicsWorld.remove(animal.labelAnchor);
		}
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
			_toPlayer.subVectors(animal.position, playerPos);
			_toPlayer.y = 0;
			const playerDist = _toPlayer.length();

			animal.stateTimer -= dt;

			if (animal.kind === 'cat')
			{
				this.updateCat(animal, playerDist, playerPos);
			}
			else
			{
				this.updateDog(animal, playerDist, playerPos);
			}

			const targetSpeed = this.targetSpeedFor(animal.state);
			if (targetSpeed > 0)
			{
				_toTarget.subVectors(animal.target, animal.position);
				_toTarget.y = 0;
				const dist = _toTarget.length();
				if (dist > 0.5)
				{
					_dir.copy(_toTarget).normalize();
					animal.heading = Math.atan2(_dir.x, _dir.z);
					animal.velocity.lerp(_dir.multiplyScalar(targetSpeed), dt * 3);
				}
				else
				{
					animal.velocity.multiplyScalar(0.9);
				}
			}
			else
			{
				animal.velocity.multiplyScalar(0.9);
			}

			animal.position.addScaledVector(animal.velocity, dt);

			// Keep the label anchor on top of the animal. CSS2DObject
			// uses the world position of its parent, so updating the
			// anchor each frame is what makes the tag follow.
			animal.labelAnchor.position.set(
				animal.position.x,
				animal.position.y + 0.7,
				animal.position.z,
			);

			// Stick to terrain. Ocean would pull the y to a low number;
			// if the raycast misses (animal wandered off the map edge),
			// nudge them back home.
			const groundY = this.queryGroundHeight(animal.position.x, animal.position.z);
			if (groundY === null || groundY < 0.5)
			{
				animal.target.copy(animal.homePosition);
				animal.state = 'wander';
				animal.stateTimer = 3;
			}
			else
			{
				animal.position.y = groundY;
			}

			animal.animPhase += dt * (animal.velocity.length() * 2 + 0.5);
		}

		this.writeInstances();
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
				const radius = SPAWN_INNER + rng() * (SPAWN_OUTER - SPAWN_INNER);
				const x = Math.cos(angle) * radius;
				const z = Math.sin(angle) * radius;

				const y = this.queryGroundHeight(x, z);
				if (y === null || y < 1) continue;

				const scale = kind === 'dog' ? 0.8 + rng() * 0.4 : 0.5 + rng() * 0.3;
				const pos = new THREE.Vector3(x, y, z);

				const labelAnchor = new THREE.Object3D();
				labelAnchor.position.copy(pos);

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
				});
				placed++;
			}
		};

		place('dog', DOG_COUNT);
		place('cat', CAT_COUNT);
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

	private updateCat(cat: Animal, playerDist: number, playerPos: THREE.Vector3): void
	{
		const isTame = cat.interactionCount >= TAME_THRESHOLD;

		if (isTame)
		{
			if (playerDist > CAT_FLEE_DIST)
			{
				this.transitionToIdleOrWander(cat);
			}
			else if (playerDist < TAME_FOLLOW_DIST)
			{
				cat.state = 'idle';
				cat.stateTimer = 1;
			}
			else
			{
				cat.target.set(playerPos.x, 0, playerPos.z);
				cat.state = 'tame';
			}
			return;
		}

		if (cat.state !== 'flee' && playerDist < CAT_FLEE_DIST)
		{
			cat.state = 'flee';
			cat.stateTimer = 3 + Math.random() * 2;
			cat.interactionCount++;
			_toPlayer.subVectors(cat.position, playerPos);
			_toPlayer.y = 0;
			_toPlayer.normalize().multiplyScalar(40);
			cat.target.set(cat.position.x + _toPlayer.x, 0, cat.position.z + _toPlayer.z);
			return;
		}

		if (cat.stateTimer <= 0 && cat.state !== 'flee')
		{
			this.transitionToIdleOrWander(cat);
		}

		if (cat.state === 'flee' && cat.stateTimer <= 0)
		{
			cat.state = 'idle';
			cat.stateTimer = 2 + Math.random() * 3;
		}
	}

	private updateDog(dog: Animal, playerDist: number, playerPos: THREE.Vector3): void
	{
		const isTame = dog.interactionCount >= TAME_THRESHOLD;

		if (isTame)
		{
			if (playerDist > DOG_NOTICE)
			{
				this.transitionToIdleOrWander(dog);
			}
			else if (playerDist < TAME_FOLLOW_DIST)
			{
				dog.state = 'idle';
				dog.stateTimer = 1;
			}
			else
			{
				dog.target.set(playerPos.x, 0, playerPos.z);
				dog.state = 'tame';
			}
			return;
		}

		if (dog.state !== 'approach' && dog.state !== 'bark' && playerDist < DOG_NOTICE)
		{
			dog.state = 'approach';
			dog.stateTimer = 10;
		}

		if (dog.state === 'approach')
		{
			dog.target.set(playerPos.x, 0, playerPos.z);

			if (playerDist < DOG_BARK_DIST * 2)
			{
				dog.state = 'bark';
				dog.stateTimer = 3 + Math.random() * 2;
				dog.interactionCount++;
			}

			if (playerDist > DOG_NOTICE + DOG_GIVEUP)
			{
				dog.state = 'wander';
				dog.stateTimer = 3;
				dog.target.copy(dog.homePosition);
			}
		}

		if (dog.state === 'bark')
		{
			_toPlayer.subVectors(playerPos, dog.position);
			_toPlayer.y = 0;
			const dist = _toPlayer.length();
			if (dist > DOG_BARK_DIST)
			{
				dog.target.set(playerPos.x, 0, playerPos.z);
			}
			else
			{
				dog.velocity.multiplyScalar(0.8);
			}

			if (playerDist > DOG_NOTICE + DOG_GIVEUP)
			{
				dog.state = 'wander';
				dog.stateTimer = 3;
				dog.target.copy(dog.homePosition);
			}

			if (dog.stateTimer <= 0)
			{
				if (playerDist < DOG_NOTICE)
				{
					dog.state = 'approach';
					dog.stateTimer = 5;
				}
				else
				{
					dog.state = 'idle';
					dog.stateTimer = 3;
				}
			}
		}

		if ((dog.state === 'idle' || dog.state === 'wander') && dog.stateTimer <= 0)
		{
			this.transitionToIdleOrWander(dog);
		}
	}

	private transitionToIdleOrWander(animal: Animal): void
	{
		if (Math.random() < 0.5)
		{
			animal.state = 'idle';
			animal.stateTimer = 2 + Math.random() * 4;
		}
		else
		{
			animal.state = 'wander';
			animal.stateTimer = 2 + Math.random() * 3;
			const wanderAngle = animal.heading + (Math.random() - 0.5) * Math.PI;
			const wanderDist = 10 + Math.random() * 20;
			animal.target.set(
				animal.position.x + Math.cos(wanderAngle) * wanderDist,
				0,
				animal.position.z + Math.sin(wanderAngle) * wanderDist,
			);
		}
	}

	private targetSpeedFor(state: AnimalState): number
	{
		switch (state)
		{
			case 'flee':     return CAT_FLEE_SPEED;
			case 'approach': return DOG_PURSUE_SPEED;
			case 'bark':     return DOG_PURSUE_SPEED * 0.5;
			case 'tame':     return TAME_FOLLOW_SPEED;
			case 'wander':   return WANDER_SPEED;
			default:         return 0;
		}
	}

	private writeInstances(): void
	{
		let dogIdx = 0;
		let catIdx = 0;

		for (const animal of this.animals)
		{
			_dummy.position.copy(animal.position);
			_dummy.rotation.set(0, -animal.heading, 0);
			_dummy.scale.setScalar(animal.scale);

			// Bobbing while moving — adds a tiny bit of life.
			const speed = animal.velocity.length();
			if (speed > 0.3)
			{
				_dummy.position.y += Math.sin(animal.animPhase * 8) * 0.05 * Math.min(speed / 5, 1);
			}

			_dummy.updateMatrix();

			if (animal.kind === 'dog')
			{
				this.dogMesh.setMatrixAt(dogIdx++, _dummy.matrix);
			}
			else
			{
				this.catMesh.setMatrixAt(catIdx++, _dummy.matrix);
			}
		}

		this.dogMesh.instanceMatrix.needsUpdate = true;
		this.catMesh.instanceMatrix.needsUpdate = true;
	}
}
