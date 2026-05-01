import * as THREE from 'three';
import { ISpawnPoint } from '../interfaces/ISpawnPoint';
import { World } from './World';
import { Character } from '../characters/Character';
import { FollowPath } from '../characters/character_ai/FollowPath';
import { LoadingManager } from '../core/LoadingManager';
import * as Utils from '../core/FunctionLibrary';
import { attachNameLabel } from './NameLabel';

let anonymousNpcCounter = 1;

// Static "multiplayer-style" NPC. Spawns the same boxman model the
// player uses but never calls takeControl(), so the character settles
// into Idle and stays put. Useful for populating scenarios with
// background figures that look alive but aren't networked.
//
// If the marker carries userData.first_node, the NPC instead gets a
// FollowPath behaviour rooted at that node — same convention as the AI
// vehicle drivers already use, so an NPC can wander a path without any
// extra plumbing.
export class NPCSpawnPoint implements ISpawnPoint
{
	private object: THREE.Object3D;
	private firstAINode: string | undefined;

	constructor(object: THREE.Object3D)
	{
		this.object = object;
		if (typeof object.userData.first_node === 'string')
		{
			this.firstAINode = object.userData.first_node;
		}
	}

	public spawn(loadingManager: LoadingManager, world: World): void
	{
		loadingManager.loadGLTF('build/assets/boxman.glb', (model) =>
		{
			const npc = new Character(model);

			const worldPos = new THREE.Vector3();
			this.object.getWorldPosition(worldPos);
			npc.setPosition(worldPos.x, worldPos.y, worldPos.z);

			const forward = Utils.getForward(this.object);
			npc.setOrientation(forward, true);

			world.add(npc);

			// Name tag — userData.name from the marker if authored,
			// otherwise auto-numbered NPC#1/NPC#2/… so the player can
			// still distinguish them.
			const tag = (typeof this.object.userData.name === 'string' && this.object.userData.name.length > 0)
				? this.object.userData.name
				: `NPC #${anonymousNpcCounter++}`;
			attachNameLabel(npc, tag, false);

			// Path-following NPC. Speed parameter mirrors the AI vehicle
			// drivers — see VehicleSpawnPoint where it picks 10 too.
			if (this.firstAINode !== undefined)
			{
				const node = this.findNode(world, this.firstAINode);
				if (node !== null) npc.setBehaviour(new FollowPath(node, 5));
				else console.error('NPC path node ' + this.firstAINode + ' not found.');
			}
		});
	}

	private findNode(world: World, nodeName: string): any
	{
		for (const path of world.paths)
		{
			for (const key in path.nodes)
			{
				if (Object.prototype.hasOwnProperty.call(path.nodes, key))
				{
					const n = path.nodes[key];
					if (n.object.name === nodeName) return n;
				}
			}
		}
		return null;
	}
}
