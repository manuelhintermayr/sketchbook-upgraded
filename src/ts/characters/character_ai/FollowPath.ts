import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import * as Utils from '../../core/FunctionLibrary';

import { FollowTarget } from './FollowTarget';
import { ICharacterAI } from '../../interfaces/ICharacterAI';
import { PathNode } from '../../world/scenarios/PathNode';
import { Vehicle } from '../../vehicles/Vehicle';
import { EntityType } from '../../enums/EntityType';

const _source = new THREE.Vector3();
const _target = new THREE.Vector3();
const _viewVector = new THREE.Vector3();
const _targetToNextNode = new THREE.Vector3();
const _viewNorm = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _zeroAngVel = new CANNON.Vec3();

export class FollowPath extends FollowTarget implements ICharacterAI
{
	public nodeRadius: number;
	public reverse: boolean = false;

	private staleTimer: number = 0;
	private targetNode: PathNode;

	constructor(firstNode: PathNode, nodeRadius: number)
	{
		super(firstNode.object, 0);
		this.nodeRadius = nodeRadius;
		this.targetNode = firstNode;
	}

	public update(timeStep: number): void
	{
		super.update(timeStep);

		this.character.getWorldPosition(_source);
		this.target.getWorldPosition(_target);
		_viewVector.subVectors(_target, _source);
		_viewVector.y = 0;

		// All the throttle / reverse / stuck-detection branches below
		// only make sense when the character is driving a vehicle. NPCs
		// on foot (Anna / Ben walking the default-spawn loop) hit this
		// path too and would crash on .collision; skip the whole block
		// for them - FollowTarget already drives the on-foot motion.
		if (this.character.controlledObject !== undefined)
		{
			_targetToNextNode.subVectors(
				this.targetNode.nextNode.object.position,
				this.targetNode.object.position,
			);
			_targetToNextNode.y = 0;
			_targetToNextNode.normalize();
			const slowDownAngle = _viewNorm.copy(_viewVector).normalize().dot(_targetToNextNode);
			let speed = (this.character.controlledObject as unknown as Vehicle).collision.velocity.length();

			const isBoat = this.character.controlledObject.entityType === EntityType.Boat;

			if (!isBoat && slowDownAngle < 0.7 && _viewVector.length() < 50 && speed > 10)
			{
				this.character.controlledObject.triggerAction('reverse', true);
				this.character.controlledObject.triggerAction('throttle', false);
			}

			// Stuck-detection respawns the vehicle to the next path node. Boats
			// are always 'off the ground' and slow, so the wheel/speed heuristic
			// would teleport them constantly; skip it for Boat.
			if (!isBoat)
			{
				if (speed < 1 || (this.character.controlledObject as unknown as Vehicle).rayCastVehicle.numWheelsOnGround === 0) this.staleTimer += timeStep;
				else this.staleTimer = 0;
				if (this.staleTimer > 5)
				{
					this.targetNode.object.getWorldPosition(_worldPos);
					_worldPos.y += 3;
					(this.character.controlledObject as unknown as Vehicle).collision.position = Utils.cannonVector(_worldPos);
					(this.character.controlledObject as unknown as Vehicle).collision.interpolatedPosition = Utils.cannonVector(_worldPos);
					(this.character.controlledObject as unknown as Vehicle).collision.angularVelocity.copy(_zeroAngVel);
					(this.character.controlledObject as unknown as Vehicle).collision.quaternion.copy((this.character.controlledObject as unknown as Vehicle).collision.initQuaternion);
					this.staleTimer = 0;
				}
			}
		}

		// Path-progression - runs for both vehicle and on-foot cases.
		if (_viewVector.length() < this.nodeRadius)
		{
			if (this.reverse)
			{
				super.setTarget(this.targetNode.previousNode.object);
				this.targetNode = this.targetNode.previousNode;
			}
			else
			{
				super.setTarget(this.targetNode.nextNode.object);
				this.targetNode = this.targetNode.nextNode;
			}
		}
	}
}
