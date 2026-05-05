import * as THREE from 'three';

import {
	AnimalBehavior,
	Animal,
	CAT_FLEE_DIST,
} from './AnimalBehavior';

// Module-scoped scratch vector - reused across every cat update each
// frame to dodge per-call Vector3 allocations.
const _toPlayer = new THREE.Vector3();

// Cat state machine: idle → player too close → flee in the radial-out
// direction → calm down. Repeated player encounters tip the cat into
// 'tame' (handled by AnimalBehavior.updateTame).
class CatBehavior extends AnimalBehavior
{
	public update(cat: Animal, playerDist: number, playerPos: THREE.Vector3): void
	{
		if (this.isTame(cat))
		{
			this.updateTame(cat, playerDist, playerPos, CAT_FLEE_DIST);
			return;
		}

		// Player too close → pick a flee target ~40 units in the radial-
		// out direction, transition to flee state. Counts as one
		// interaction toward taming.
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
}

// Singleton - CatBehavior is stateless; one instance is shared across
// every cat. Exporting only the singleton (not the class) keeps the
// surface tight: there's no reason to ever construct another one.
export const CAT_BEHAVIOR: AnimalBehavior = new CatBehavior();
