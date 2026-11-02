import * as THREE from 'three';
import { ICharacterAI } from '../../interfaces/ICharacterAI';
import * as Utils from '../../core/FunctionLibrary';
import { Vehicle } from '../../vehicles/Vehicle';
import { Character } from '../Character';
import { EntityType } from '../../enums/EntityType';

const _source = new THREE.Vector3();
const _target = new THREE.Vector3();
const _viewVector = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _FORWARD_Z = new THREE.Vector3(0, 0, 1);

export class FollowTarget implements ICharacterAI
{
	public character: Character;
	public isTargetReached: boolean;

	public target: THREE.Object3D;
	private stopDistance: number;

	constructor(target: THREE.Object3D, stopDistance: number = 1.3)
	{
		this.target = target;
		this.stopDistance = stopDistance;
	}

	public setTarget(target: THREE.Object3D): void
	{
		this.target = target;
	}

	public update(timeStep: number): void
	{
		if (this.character.controlledObject !== undefined)
		{
			this.character.getWorldPosition(_source);
			this.target.getWorldPosition(_target);

			_viewVector.subVectors(_target, _source);

			// Follow character
			if (_viewVector.length() > this.stopDistance)
			{
				this.isTargetReached = false;
			}
			else
			{
				this.isTargetReached = true;
			}

			_forward.copy(_FORWARD_Z).applyQuaternion((this.character.controlledObject as unknown as THREE.Object3D).quaternion);
			_viewVector.y = 0;
			_viewVector.normalize();
			let angle = Utils.getSignedAngleBetweenVectors(_forward, _viewVector);

			let goingForward = _forward.dot(Utils.threeVector((this.character.controlledObject as unknown as Vehicle).collision.velocity)) > 0;
			let speed = (this.character.controlledObject as unknown as Vehicle).collision.velocity.length();

			if (_forward.dot(_viewVector) < 0.0)
			{
				if (this.character.controlledObject.entityType === EntityType.Boat)
				{
					// Boats can't really reverse to face a target; nudge the
					// rudder so the hull starts swinging around instead.
					this.character.controlledObject.triggerAction('right', true);
					this.character.controlledObject.triggerAction('left', false);
				}
				else
				{
					this.character.controlledObject.triggerAction('reverse', true);
					this.character.controlledObject.triggerAction('throttle', false);
				}
			}
			else
			{
				this.character.controlledObject.triggerAction('throttle', true);
				this.character.controlledObject.triggerAction('reverse', false);
			}

			if (Math.abs(angle) > 0.15)
			{
				if (_forward.dot(_viewVector) > 0 || goingForward)
				{
					if (angle > 0)
					{
						this.character.controlledObject.triggerAction('left', true);
						this.character.controlledObject.triggerAction('right', false);
					}
					else
					{
						this.character.controlledObject.triggerAction('right', true);
						this.character.controlledObject.triggerAction('left', false);
					}
				}
				else
				{
					if (angle > 0)
					{
						this.character.controlledObject.triggerAction('right', true);
						this.character.controlledObject.triggerAction('left', false);
					}
					else
					{
						this.character.controlledObject.triggerAction('left', true);
						this.character.controlledObject.triggerAction('right', false);
					}
				}
			}
			else
			{
				this.character.controlledObject.triggerAction('left', false);
				this.character.controlledObject.triggerAction('right', false);
			}
		}
		else
		{
			_viewVector.subVectors(this.target.position, this.character.position);
			this.character.setViewVector(_viewVector);

			// Follow character
			if (_viewVector.length() > this.stopDistance)
			{
				this.isTargetReached = false;
				this.character.triggerAction('up', true);
			}
			// Stand still
			else
			{
				this.isTargetReached = true;
				this.character.triggerAction('up', false);
	
				// Look at character
				this.character.setOrientation(_viewVector);
			}
		}
	}
}
