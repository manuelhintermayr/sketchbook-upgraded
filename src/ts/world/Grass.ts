import * as THREE from 'three';

import { World } from './World';
import { IWorldEntity } from '../interfaces/IWorldEntity';
import { EntityType } from '../enums/EntityType';
import { UpdateOrder } from '../enums/UpdateOrder';
import { RenderLayer } from '../enums/RenderLayers';
import { Noise } from './Perlin';
import { GrassShader } from './GrassShader';
import { WanderingAnimals } from './animals/WanderingAnimals';

// Instanced-blade grass field, ported from tkkaushik369/socketControl (MIT).
// Based on "Realistic real-time grass rendering" by Eddie Lee, 2010
// (https://www.eddietree.com/grass), via three.js InstancedBufferGeometry.
//
// A scenario marks a flat plane in world.glb with material name 'grass'.
// World.loadScene picks that up and instantiates this class with the
// mesh's transform; the original mesh is hidden behind the blade field.
export class Grass implements IWorldEntity
{
	public updateOrder: number = UpdateOrder.World;
	public entityType: EntityType = EntityType.Grass;

	public groundMaterial: THREE.Material;
	public grassMaterial: THREE.ShaderMaterial;

	private world: World;
	private meshes: THREE.Object3D[] = [];

	constructor(transform: THREE.Object3D, world: World, instances: number = 300000)
	{
		this.world = world;

		const joints = 3;
		const w_ = 0.02;
		const h_ = 0.2;

		const noise = new Noise();
		noise.seed(Math.random());

		const ground_geometry = new THREE.PlaneGeometry(transform.scale.x * 2, transform.scale.z * 2);
		this.groundMaterial = new THREE.MeshBasicMaterial({ color: 0x002300 });

		const base_geometry = new THREE.PlaneGeometry(w_, h_, 1, joints);
		base_geometry.translate(0, h_ / 2, 0);

		const instanced_geometry = new THREE.InstancedBufferGeometry();
		instanced_geometry.index = base_geometry.index;
		instanced_geometry.attributes.position = base_geometry.attributes.position;
		instanced_geometry.attributes.uv = base_geometry.attributes.uv;

		const offsets: number[] = [];
		const orientations: number[] = [];
		const stretches: number[] = [];
		const halfRootAngleSin: number[] = [];
		const halfRootAngleCos: number[] = [];

		let quaternion_0 = new THREE.Quaternion();
		const quaternion_1 = new THREE.Quaternion();
		let x: number, y: number, z: number, w: number;

		const min = -0.25;
		const max = 0.25;

		for (let i = 0; i < instances; i++)
		{
			x = Math.random() * transform.scale.x * 2 - transform.scale.x;
			z = Math.random() * transform.scale.z * 2 - transform.scale.z;
			y = 0;
			offsets.push(x, y, z);

			let angle = Math.PI - Math.random() * (2 * Math.PI);
			halfRootAngleSin.push(Math.sin(0.5 * angle));
			halfRootAngleCos.push(Math.cos(0.5 * angle));

			let RotationAxis = new THREE.Vector3(0, 1, 0);
			x = RotationAxis.x * Math.sin(angle / 2.0);
			y = RotationAxis.y * Math.sin(angle / 2.0);
			z = RotationAxis.z * Math.sin(angle / 2.0);
			w = Math.cos(angle / 2.0);
			quaternion_0.set(x, y, z, w).normalize();

			angle = Math.random() * (max - min) + min;
			RotationAxis = new THREE.Vector3(1, 0, 0);
			x = RotationAxis.x * Math.sin(angle / 2.0);
			y = RotationAxis.y * Math.sin(angle / 2.0);
			z = RotationAxis.z * Math.sin(angle / 2.0);
			w = Math.cos(angle / 2.0);
			quaternion_1.set(x, y, z, w).normalize();

			quaternion_0 = this.multiplyQuaternions(quaternion_0, quaternion_1);

			angle = Math.random() * (max - min) + min;
			RotationAxis = new THREE.Vector3(0, 0, 1);
			x = RotationAxis.x * Math.sin(angle / 2.0);
			y = RotationAxis.y * Math.sin(angle / 2.0);
			z = RotationAxis.z * Math.sin(angle / 2.0);
			w = Math.cos(angle / 2.0);
			quaternion_1.set(x, y, z, w).normalize();

			quaternion_0 = this.multiplyQuaternions(quaternion_0, quaternion_1);

			orientations.push(quaternion_0.x, quaternion_0.y, quaternion_0.z, quaternion_0.w);

			if (i < instances / 3)
			{
				stretches.push(Math.random() * 1.8);
			}
			else
			{
				stretches.push(Math.random());
			}
		}

		const offsetAttribute = new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3);
		const stretchAttribute = new THREE.InstancedBufferAttribute(new Float32Array(stretches), 1);
		const halfRootAngleSinAttribute = new THREE.InstancedBufferAttribute(new Float32Array(halfRootAngleSin), 1);
		const halfRootAngleCosAttribute = new THREE.InstancedBufferAttribute(new Float32Array(halfRootAngleCos), 1);
		const orientationAttribute = new THREE.InstancedBufferAttribute(new Float32Array(orientations), 4);

		instanced_geometry.setAttribute('offset', offsetAttribute);
		instanced_geometry.setAttribute('orientation', orientationAttribute);
		instanced_geometry.setAttribute('stretch', stretchAttribute);
		instanced_geometry.setAttribute('halfRootAngleSin', halfRootAngleSinAttribute);
		instanced_geometry.setAttribute('halfRootAngleCos', halfRootAngleCosAttribute);

		ground_geometry.computeBoundingSphere();
		instanced_geometry.boundingSphere = null;
		if (ground_geometry.boundingSphere !== null)
		{
			instanced_geometry.boundingSphere = ground_geometry.boundingSphere.clone();
		}

		const loader = new THREE.TextureLoader();
		loader.crossOrigin = '';
		const texture = loader.load('src/img/grass/blade_diffuse.jpg');
		const alphaMap = loader.load('src/img/grass/blade_alpha.jpg');

		// Pre-allocate the pushers array so Three.js can pick it up as a
		// fixed-size uniform (matches `uniform vec3 pushers[MAX_PUSHERS]`
		// in the shader). update() rewrites the contents in-place each
		// frame; the slots past pusherCount are ignored on the GPU.
		const pusherSlots: THREE.Vector3[] = [];
		const pusherRadii: number[] = [];
		for (let i = 0; i < 16; i++)
		{
			pusherSlots.push(new THREE.Vector3(1e6, 0, 0));
			pusherRadii.push(1.0);
		}

		this.grassMaterial = new THREE.ShaderMaterial({
			uniforms: {
				map: { value: texture },
				alphaMap: { value: alphaMap },
				time: { value: 0 },
				pushers: { value: pusherSlots },
				pusherRadii: { value: pusherRadii },
				pusherCount: { value: 0 },
			},
			vertexShader: GrassShader.vertexShader,
			fragmentShader: GrassShader.fragmentShader,
			side: THREE.DoubleSide,
		});

		const grassMesh = new THREE.Mesh(instanced_geometry, this.grassMaterial);

		// Skip grass instances past 60 units to keep the draw call cheap
		// when the player has wandered off the lawn. Was 30 - tighter
		// but the pop into the flat lambert base was too obvious from
		// medium-distance shots. 60 buys a much smoother transition for
		// the cost of ~600k extra triangles inside that ring; modern
		// GPUs handle it without a frame-rate hit.
		const grassLod = new THREE.LOD();
		grassLod.addLevel(grassMesh, 0);
		grassLod.addLevel(new THREE.Mesh(), 60);

		grassLod.position.copy(transform.position);

		// Move every node in the LOD onto OutlineSkip - outlining 300k
		// grass blades looks like static, and the depth pre-pass would
		// pay the full instanced draw call for nothing.
		grassLod.traverse(child => child.layers.set(RenderLayer.OutlineSkip));

		this.meshes.push(grassLod);
	}

	private multiplyQuaternions(q1: THREE.Quaternion, q2: THREE.Quaternion): THREE.Quaternion
	{
		const x = q1.x * q2.w + q1.y * q2.z - q1.z * q2.y + q1.w * q2.x;
		const y = -q1.x * q2.z + q1.y * q2.w + q1.z * q2.x + q1.w * q2.y;
		const z = q1.x * q2.y - q1.y * q2.x + q1.z * q2.w + q1.w * q2.z;
		const w = -q1.x * q2.x - q1.y * q2.y - q1.z * q2.z + q1.w * q2.w;
		return new THREE.Quaternion(x, y, z, w);
	}

	public addToWorld(world: World): void
	{
		this.meshes.forEach((mesh) => world.graphicsWorld.add(mesh));
	}

	public removeFromWorld(world: World): void
	{
		this.meshes.forEach((mesh) => world.graphicsWorld.remove(mesh));
	}

	public update(timeStep: number): void
	{
		this.grassMaterial.uniforms.time.value += timeStep;
		this.refreshPushers();
	}

	// Collect every world-space "object on the lawn" the shader should
	// bend blades around: the player + every vehicle + every visible
	// animal. Each blade only checks the closest few pushers (loop in
	// shader caps at MAX_PUSHERS), so on crowded scenes we trim by
	// camera distance to keep nearby pushers winning over a parked car
	// on the other side of the map.
	private refreshPushers(): void
	{
		const slots = this.grassMaterial.uniforms.pushers.value as THREE.Vector3[];
		const radii = this.grassMaterial.uniforms.pusherRadii.value as number[];
		const camPos = this.world.camera.position;

		const candidates: { pos: THREE.Vector3; radius: number; distSq: number }[] = [];
		const consider = (p: THREE.Vector3, radius: number): void =>
		{
			const dx = p.x - camPos.x;
			const dz = p.z - camPos.z;
			candidates.push({ pos: p, radius, distSq: dx * dx + dz * dz });
		};

		// Player + every NPC (Anna / Ben / Carla / Dieter live in
		// world.characters too). 0.8 m roughly matches a person's
		// shoulder-width plus a little aura - the original single-
		// pusher path used 1.0 effective so this stays close.
		for (const c of this.world.characters) consider(c.position, 0.8);

		// Vehicles. Each per-frame pusher is sized to roughly the
		// footprint that actually touches the lawn - the shader's
		// vertical tolerance then gates anything hovering above it.
		//
		//  - Car: low-slung chassis above the wheels.
		//  - Boat: hull is broad and at water level when on land.
		//  - Helicopter: heli.glb has no wheel markers, so push from a
		//    virtual skid below chassis (see inline note).
		//  - Airplane: GLB-authored wheels carry the ground contact;
		//    chassis itself is skipped.
		//  - Rocket: stands vertically on the pad, no horizontal
		//    footprint in the grass. Skipped.
		for (const v of this.world.vehicles)
		{
			if (v.entityType === EntityType.Car) consider(v.position, 1.5);
			else if (v.entityType === EntityType.Boat) consider(v.position, 2.0);
			else if (v.entityType === EntityType.Helicopter)
			{
				// heli.glb has no wheel markers - skids are part of the
				// chassis mesh. Approximate them with a virtual pusher
				// 1.2 m below chassis center; when the heli is on the
				// ground that lands roughly at blade level (vertical
				// tolerance kicks in), when it's airborne it lifts out
				// of tolerance and stops pushing.
				consider(new THREE.Vector3(v.position.x, v.position.y - 1.2, v.position.z), 1.5);
			}
			// Airplane chassis is skipped; the GLB-authored wheels
			// handle ground contact. RocketShip too.

			for (const w of v.wheels) consider(w.wheelObject.position, 0.5);
		}

		// Animals - dogs and cats are small. 0.5 m ring per body.
		const wa = WanderingAnimals.getInstance();
		if (wa !== null)
		{
			for (const p of wa.getAnimalPositions()) consider(p, 0.5);
		}

		// Sort closest-first, then write the top MAX_PUSHERS into the
		// uniform slots in-place.
		candidates.sort((a, b) => a.distSq - b.distSq);
		const max = slots.length;
		const count = Math.min(candidates.length, max);
		for (let i = 0; i < count; i++)
		{
			slots[i].copy(candidates[i].pos);
			radii[i] = candidates[i].radius;
		}
		this.grassMaterial.uniforms.pusherCount.value = count;
	}
}
