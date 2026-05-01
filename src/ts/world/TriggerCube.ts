import * as THREE from 'three';
import { World } from './World';
import { IUpdatable } from '../interfaces/IUpdatable';
import { Character } from '../characters/Character';

// Volume that fires onEnter / onExit when the player walks into it.
// Concept ported from iErcann/Notblox (back/src/ecs/entity/TriggerCube),
// reshaped into a single Sketchbook IUpdatable.
//
// Center can be either a static THREE.Vector3 or a function — the
// function form lets the trigger follow a moving target (e.g. an NPC
// that walks a path) without manually re-anchoring it each frame.
export type TriggerCenter = THREE.Vector3 | (() => THREE.Vector3);

export class TriggerCube implements IUpdatable
{
	public updateOrder = 12;

	private centerSource: TriggerCenter;
	private size: THREE.Vector3;
	private box: THREE.Box3;
	private wasInside = false;
	private world: World | null = null;

	private onEnter: (c: Character) => void;
	private onExit: ((c: Character) => void) | undefined;

	private debug: THREE.Mesh | undefined;

	constructor(
		centerSource: TriggerCenter,
		size: THREE.Vector3,
		onEnter: (c: Character) => void,
		onExit?: (c: Character) => void,
		showDebug = false,
	)
	{
		this.centerSource = centerSource;
		this.size = size.clone();
		this.box = new THREE.Box3().setFromCenterAndSize(this.currentCenter(), this.size);
		this.onEnter = onEnter;
		this.onExit = onExit;

		if (showDebug)
		{
			this.debug = new THREE.Mesh(
				new THREE.BoxGeometry(size.x, size.y, size.z),
				new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.25 }),
			);
			this.debug.position.copy(this.currentCenter());
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

		const center = this.currentCenter();
		this.box.setFromCenterAndSize(center, this.size);
		if (this.debug) this.debug.position.copy(center);

		const inside = this.box.containsPoint(player.position);
		if (inside && !this.wasInside) this.onEnter(player);
		else if (!inside && this.wasInside) this.onExit?.(player);
		this.wasInside = inside;
	}

	private currentCenter(): THREE.Vector3
	{
		return typeof this.centerSource === 'function' ? this.centerSource() : this.centerSource;
	}
}
