import * as THREE from 'three';

import { World } from './World';
import { IWorldEntity } from '../interfaces/IWorldEntity';
import { EntityType } from '../enums/EntityType';
import { UpdateOrder } from '../enums/UpdateOrder';
import { Noise } from './Perlin';
import { GrassShader } from './GrassShader';

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

		this.grassMaterial = new THREE.ShaderMaterial({
			uniforms: {
				map: { value: texture },
				alphaMap: { value: alphaMap },
				time: { value: 0 },
				playerPos: { value: new THREE.Vector3() },
			},
			vertexShader: GrassShader.vertexShader,
			fragmentShader: GrassShader.fragmentShader,
			side: THREE.DoubleSide,
		});

		const grassMesh = new THREE.Mesh(instanced_geometry, this.grassMaterial);

		// Skip grass instances past 30 units to keep the draw call cheap
		// when the player has wandered off the lawn.
		const grassLod = new THREE.LOD();
		grassLod.addLevel(grassMesh, 0);
		grassLod.addLevel(new THREE.Mesh(), 30);

		grassLod.position.copy(transform.position);

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

		if (this.world.characters.length)
		{
			this.grassMaterial.uniforms.playerPos.value.copy(this.world.characters[0].position);
		}
	}
}
