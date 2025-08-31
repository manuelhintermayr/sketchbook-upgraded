import * as CANNON from 'cannon-es';
import * as THREE from 'three';

import { Vehicle } from './Vehicle';
import { IControllable } from '../interfaces/IControllable';
import { IWorldEntity } from '../interfaces/IWorldEntity';
import { KeyBinding } from '../core/KeyBinding';
import { EntityType } from '../enums/EntityType';

// Ported from Inthenew/Sketchbook (MIT). The rocketship reuses the
// helicopter rotor scaffolding (it has rotor-marked children for the
// engine glow / smoke nozzles) but is intentionally not pilotable in
// the conventional sense — there are no manual ascend/yaw controls.
//
// This file lands in three stages:
//   Block 1 (this commit): vehicle plumbing, rotor visuals, exit/view
//   Block 1 follow-up:     smoke particle system
//   Block 3:               auto-flight + planet menu + landing
type SmokeParticle = {
	particle: THREE.Vector3;
	lifetime: number;
	age: number;
};

const SMOKE_PARTICLE_COUNT = 200;

export class RocketShip extends Vehicle implements IControllable, IWorldEntity
{
	public entityType: EntityType = EntityType.RocketShip;
	public rotors: THREE.Object3D[] = [];

	protected enginePower = 0;
	protected smokeSystem!: THREE.Points;
	private smokeParticles: SmokeParticle[] = [];

	constructor(gltf: any)
	{
		super(gltf);

		this.readRocketShipData(gltf);
		this.initSmoke();

		this.actions = {
			ascend: new KeyBinding('ShiftLeft'),
			descend: new KeyBinding('Space'),
			exitVehicle: new KeyBinding('KeyF'),
			seat_switch: new KeyBinding('KeyX'),
			view: new KeyBinding('KeyV'),
		};
	}

	public noDirectionPressed(): boolean
	{
		return !this.actions.ascend.isPressed && !this.actions.descend.isPressed;
	}

	public update(timeStep: number): void
	{
		super.update(timeStep);

		// Engine power ramps up while a character is in the seat, decays
		// when they exit. Drives the rotor visuals and (later) the liftoff
		// thrust.
		if (this.controllingCharacter !== undefined)
		{
			this.enginePower = Math.min(1, this.enginePower + timeStep * 0.2);
		}
		else
		{
			this.enginePower = Math.max(0, this.enginePower - timeStep * 0.06);
		}

		// Spin the rotors at a rate proportional to engine power.
		for (const rotor of this.rotors)
		{
			rotor.rotateX(this.enginePower * timeStep * 30);
		}
	}

	// Block 3 will replace this stub with the auto-flight + landing logic.
	// World.updatePhysics dispatches per-vehicle physicsPreStep — left
	// empty here so the cannon solver handles the rocketship as a regular
	// chassis, parked on the launch pad, until Block 3 lands.
	public physicsPreStep(_body: CANNON.Body, _rocket: RocketShip): void
	{
		// intentionally empty — see Block 3
	}

	public onInputChange(): void
	{
		super.onInputChange();

		if (this.actions.exitVehicle.justPressed && this.controllingCharacter !== undefined)
		{
			this.forceCharacterOut();
		}
		if (this.actions.view.justPressed)
		{
			this.toggleFirstPersonView();
		}
	}

	public inputReceiverInit(): void
	{
		super.inputReceiverInit();
		this.world.updateControls([
			{ keys: ['Space'], desc: 'Blast off' },
			{ keys: ['V'], desc: 'View select' },
			{ keys: ['F'], desc: 'Exit vehicle' },
			{ keys: ['Shift', '+', 'R'], desc: 'Respawn' },
			{ keys: ['Shift', '+', 'C'], desc: 'Free camera' },
		]);
	}

	public readRocketShipData(gltf: any): void
	{
		gltf.scene.traverse((child: THREE.Object3D) =>
		{
			if (child.userData?.data === 'rotor')
			{
				this.rotors.push(child);
			}
		});
	}

	// Additive-blended point cloud parented to the rocket so the smoke
	// drifts down relative to the chassis. Initially hidden — Block 3
	// flips visibility on during the liftoff sequence.
	private initSmoke(): void
	{
		const texture = new THREE.TextureLoader().load('src/img/smoke.png');
		const material = new THREE.PointsMaterial({
			map: texture,
			blending: THREE.AdditiveBlending,
			transparent: true,
			depthWrite: false,
			size: 0.5,
		});

		const positions = new Float32Array(SMOKE_PARTICLE_COUNT * 3);
		for (let i = 0; i < positions.length; i++)
		{
			positions[i] = (Math.random() - 0.5) * 10;
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

		this.smokeSystem = new THREE.Points(geometry, material);
		this.smokeSystem.frustumCulled = false;
		this.smokeSystem.visible = false;
		super.add(this.smokeSystem);

		this.smokeParticles = Array.from({ length: SMOKE_PARTICLE_COUNT }, () => this.createParticle());
	}

	private createParticle(): SmokeParticle
	{
		return {
			particle: new THREE.Vector3(
				Math.random() - 0.5,
				(Math.random() - 0.5) * 2 - 1,
				Math.random() - 0.5,
			),
			// Particles live for 1-2 seconds. Inthenew's comment claimed
			// 1-3s, but the source code is +1, so the range is 1-2.
			lifetime: Math.random() + 1,
			age: 0,
		};
	}

	protected updateSmoke(delta: number): void
	{
		const positionAttribute = this.smokeSystem.geometry.getAttribute('position') as THREE.BufferAttribute;
		this.smokeParticles.forEach((data, i) =>
		{
			data.age += delta;
			if (data.age > data.lifetime)
			{
				Object.assign(data, this.createParticle());
			}
			const progress = data.age / data.lifetime;
			data.particle.y -= delta * 5 * (1 - progress);
			positionAttribute.setXYZ(i, data.particle.x, data.particle.y, data.particle.z);
		});
		positionAttribute.needsUpdate = true;
	}
}
