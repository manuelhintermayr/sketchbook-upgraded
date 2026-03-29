import * as THREE from 'three';
import { World } from './World';
import { IUpdatable } from '../interfaces/IUpdatable';
import { Character } from '../characters/Character';

// Volume that fires onEnter / onExit when the player walks into it.
// Concept ported from iErcann/Notblox (back/src/ecs/entity/TriggerCube),
// reshaped into a single Sketchbook IUpdatable since we don't run an
// ECS or a server-side rapier physics world.
//
// Rather than a CANNON sensor body, this uses a per-frame AABB check
// against world.characters[0]'s position — cheaper to set up, no
// collisionFilter wiring, and the cube isn't visible to the physics
// world either way.
export class TriggerCube implements IUpdatable
{
	public updateOrder = 12;

	private box: THREE.Box3;
	private wasInside = false;
	private world: World | null = null;

	private onEnter: (c: Character) => void;
	private onExit: ((c: Character) => void) | undefined;

	private debug: THREE.Mesh | undefined;

	constructor(
		center: THREE.Vector3,
		size: THREE.Vector3,
		onEnter: (c: Character) => void,
		onExit?: (c: Character) => void,
		showDebug = false,
	)
	{
		this.box = new THREE.Box3().setFromCenterAndSize(center, size);
		this.onEnter = onEnter;
		this.onExit = onExit;

		if (showDebug)
		{
			this.debug = new THREE.Mesh(
				new THREE.BoxGeometry(size.x, size.y, size.z),
				new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.25 }),
			);
			this.debug.position.copy(center);
		}
	}

	public addToWorld(world: World): void
	{
		this.world = world;
		if (this.debug) world.graphicsWorld.add(this.debug);
		world.registerUpdatable(this);
	}

	public removeFromWorld(world: World): void
	{
		this.world = null;
		if (this.debug) world.graphicsWorld.remove(this.debug);
		world.unregisterUpdatable(this);
	}

	public update(_timeStep: number): void
	{
		const player = this.world?.characters[0];
		if (!player) return;

		const inside = this.box.containsPoint(player.position);
		if (inside && !this.wasInside) this.onEnter(player);
		else if (!inside && this.wasInside) this.onExit?.(player);
		this.wasInside = inside;
	}
}
