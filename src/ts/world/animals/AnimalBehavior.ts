import * as THREE from 'three';

// Domain definition for the wandering-animals system: the data each
// animal carries each frame, the state-machine alphabet, the tuning
// constants, and the abstract behavior strategy that every animal
// kind implements. Subclasses (DogBehavior, CatBehavior) live in
// their own files and only encode the species-specific reactions to
// the player; the common helpers (idle/wander coin flip, tame
// follow loop, tame predicate) are inherited.
//
// All mutable state lives on the Animal record - behaviors are
// stateless singletons reused across every animal of their kind.

export type AnimalKind = 'dog' | 'cat';
export type AnimalState = 'idle' | 'wander' | 'flee' | 'approach' | 'bark' | 'tame';

// Distance at which dogs notice the player and start approaching.
export const DOG_NOTICE = 15;
// Distance the dog tries to maintain while barking.
export const DOG_BARK_DIST = 3;
// Speed used for both 'approach' (full) and 'bark' (half) movement.
export const DOG_PURSUE_SPEED = 3;
// Player has to walk this far past DOG_NOTICE before the dog gives up.
export const DOG_GIVEUP = 10;

// Distance at which cats start fleeing.
export const CAT_FLEE_DIST = 10;
export const CAT_FLEE_SPEED = 10;

// Both kinds: after this many interactions (cat flees, dog barks) the
// animal flips to 'tame' and follows the player at a polite distance.
export const TAME_THRESHOLD = 2;
export const TAME_FOLLOW_DIST = 5;
export const TAME_FOLLOW_SPEED = 2.5;

// Generic 'wander' speed shared by both kinds.
export const WANDER_SPEED = 1.5;

export interface Animal
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
	// Cached ground Y from the most recent raycast hit. Cannon trimesh
	// raycasts are expensive (~60µs each on Inthenew's terrain) and
	// 18 animals × 60 fps would be 1080 raycasts/sec just for ground
	// tracking. We refresh the cache on a throttle and lerp the visible
	// Y toward it between samples.
	targetGroundY: number;
	groundQueryTimer: number;
	// Strategy reference - DOG_BEHAVIOR or CAT_BEHAVIOR singleton from
	// the matching subclass file. Lets WanderingAnimals.update
	// polymorphically dispatch to the right state machine without an
	// `if (kind === ...)` branch per animal.
	behavior: AnimalBehavior;
}

// State → speed table used by the manager when integrating velocity.
// Lives here (not on the manager) because the values are part of the
// behavior tuning surface - keeping them next to the constants they
// derive from makes the relationship obvious.
export function targetSpeedFor(state: AnimalState): number
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

export abstract class AnimalBehavior
{
	public abstract update(animal: Animal, playerDist: number, playerPos: THREE.Vector3): void;

	protected isTame(animal: Animal): boolean
	{
		return animal.interactionCount >= TAME_THRESHOLD;
	}

	// Coin-flip transition between idle (stand still N seconds) and
	// wander (pick a random direction + walk N seconds). Used by both
	// kinds when nothing else is happening.
	protected transitionToIdleOrWander(animal: Animal): void
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

	// Tame animals follow the player at a polite distance; idle when too
	// close, transition out when the player has wandered off. Same
	// shape for dogs and cats - only the "give up" radius differs (cat:
	// original flee distance; dog: original notice distance).
	protected updateTame(
		animal: Animal,
		playerDist: number,
		playerPos: THREE.Vector3,
		giveUpDist: number,
	): void
	{
		if (playerDist > giveUpDist)
		{
			// Only flip from 'tame' to idle/wander once. If we're
			// already in idle/wander from a previous frame, run the
			// state's timer down before re-randomising - calling
			// transitionToIdleOrWander every frame picked a fresh
			// wander target each tick, which made the pet spin in
			// place at 60 Hz.
			if (animal.state === 'tame')
			{
				this.transitionToIdleOrWander(animal);
			}
			else if ((animal.state === 'idle' || animal.state === 'wander') && animal.stateTimer <= 0)
			{
				this.transitionToIdleOrWander(animal);
			}
		}
		else if (playerDist < TAME_FOLLOW_DIST)
		{
			animal.state = 'idle';
			animal.stateTimer = 1;
		}
		else
		{
			animal.target.set(playerPos.x, 0, playerPos.z);
			animal.state = 'tame';
		}
	}
}
