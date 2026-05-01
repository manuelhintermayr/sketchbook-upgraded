import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { World } from './World';
import { IUpdatable } from '../interfaces/IUpdatable';

// Centralized registry for CSS2D world-space labels with distance
// culling. Sketchbook already uses three's CSS2DRenderer to project
// every name-tag div above its anchor (see World.labelRenderer); this
// class adds a per-frame visibility pass on top so labels hide when
// the camera is too far away to read them.
//
// Pattern adapted from manuelhintermayr-portfolio/three-js
// WorldLabels — ported from a manual screen-projection system to one
// that piggy-backs on Sketchbook's existing CSS2D pipeline. The big
// win: animals (and any future ad-hoc labels) get distance culling
// without each entity having to know about the camera.

export interface RegisterOptions
{
	maxDistance?: number;
	className?: string;
	feature?: string;
}

interface RegisteredLabel
{
	object: CSS2DObject;
	target: THREE.Object3D;
	maxDistance: number;
	feature: string | undefined;
}

const _temp = new THREE.Vector3();

export class WorldLabels implements IUpdatable
{
	public updateOrder: number = 14;

	private static instance: WorldLabels | undefined;
	private world: World;
	private labels: RegisteredLabel[] = [];

	public static getInstance(): WorldLabels | undefined
	{
		return WorldLabels.instance;
	}

	constructor(world: World)
	{
		this.world = world;
		WorldLabels.instance = this;
	}

	// Builds the CSS2DObject + div, registers it for distance culling,
	// returns the CSS2DObject so the caller can position it (typically
	// by adding it as a child of the anchor object3D). When the anchor
	// is removed from graphicsWorld the label leaves with it; callers
	// that re-create scenarios should also call unregister().
	public register(target: THREE.Object3D, text: string, options: RegisterOptions = {}): CSS2DObject
	{
		const div = document.createElement('div');
		div.className = options.className ?? 'name-label';
		div.textContent = text;

		const object = new CSS2DObject(div);
		object.position.set(0, 1.2, 0);
		target.add(object);

		this.labels.push({
			object,
			target,
			maxDistance: options.maxDistance ?? Infinity,
			feature: options.feature,
		});

		return object;
	}

	public unregister(object: CSS2DObject): void
	{
		const i = this.labels.findIndex((l) => l.object === object);
		if (i === -1) return;
		const entry = this.labels[i];
		entry.target.remove(entry.object);
		this.labels.splice(i, 1);
	}

	public update(_timeStep: number, _unscaledTimeStep: number): void
	{
		if (this.labels.length === 0) return;

		const camPos = this.world.camera.position;
		const params = this.world.params;

		for (const entry of this.labels)
		{
			const div = entry.object.element as HTMLElement;

			// Feature gate (e.g. animal labels off by default).
			if (entry.feature !== undefined && params !== undefined && params[entry.feature] === false)
			{
				if (div.style.display !== 'none') div.style.display = 'none';
				continue;
			}

			// Distance cull. CSS2D anchors via the target's world
			// position — fetch it through getWorldPosition so this works
			// for animals whose target Object3D moves each frame.
			entry.target.getWorldPosition(_temp);
			const dist = _temp.distanceTo(camPos);
			const visible = dist <= entry.maxDistance;

			if (visible && div.style.display === 'none') div.style.display = '';
			else if (!visible && div.style.display !== 'none') div.style.display = 'none';
		}
	}
}
