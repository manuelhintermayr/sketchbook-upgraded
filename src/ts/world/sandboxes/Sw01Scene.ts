import * as THREE from 'three';
import { BaseScene } from './BaseScene';

// Recreates the swift502 v0.1.0 (October 2018) demo scene as it
// appeared in the live browser demo: a tiled platform, several
// dynamic spheres + a couple of static cubes for the player to push
// around / shelter behind, a wooden credit sign with grass at its
// base, and three characters (player + Bob with FollowCharacter +
// John with Random behaviour - the original demo's roster).
//
// The on-disk v0.1.0 source (`docs/js/index.js`) had only boxes +
// planks; the published demo evolved with spheres on top, which is
// what the v0.1.0 demo actually looked like in browsers. We recreate
// that visual here.

function addStaticBox(
	scene: THREE.Scene,
	x: number, y: number, z: number,
	w: number, h: number, d: number,
	color: number,
): void
{
	const vis = new THREE.Mesh(
		new THREE.BoxGeometry(),
		new THREE.MeshStandardMaterial({ color }),
	);
	vis.scale.set(w, h, d);
	vis.position.set(x, y, z);
	vis.castShadow = true;
	vis.receiveShadow = true;
	scene.add(vis);

	const phy = new THREE.Mesh(new THREE.BoxGeometry());
	phy.scale.copy(vis.scale);
	phy.position.copy(vis.position);
	phy.userData = { data: 'physics', type: 'box' };
	scene.add(phy);
}

// Approximation of the swift502 credits sign FBX: brown post + a
// vertical sign panel + crossed grass planes at the base. The
// original loaded a textured FBX; this rebuilds the silhouette with
// primitives.
function addSign(scene: THREE.Scene, x: number, z: number, scale: number): void
{
	const post = new THREE.Mesh(
		new THREE.BoxGeometry(),
		new THREE.MeshStandardMaterial({ color: 0x6b4a2a }),
	);
	post.scale.set(0.16 * scale, 1.2 * scale, 0.16 * scale);
	post.position.set(x, 0.6 * scale, z);
	post.castShadow = true;
	scene.add(post);

	const panel = new THREE.Mesh(
		new THREE.BoxGeometry(),
		new THREE.MeshStandardMaterial({ color: 0xa07a4a }),
	);
	panel.scale.set(0.6 * scale, 0.6 * scale, 0.06 * scale);
	panel.position.set(x, 0.95 * scale, z);
	panel.castShadow = true;
	scene.add(panel);

	const col = new THREE.Mesh(new THREE.BoxGeometry());
	col.scale.set(0.6 * scale, 1.2 * scale, 0.16 * scale);
	col.position.set(x, 0.6 * scale, z);
	col.userData = { data: 'physics', type: 'box' };
	scene.add(col);

	for (const a of [0, Math.PI / 2])
	{
		const grass = new THREE.Mesh(
			new THREE.PlaneGeometry(0.7 * scale, 0.3 * scale),
			new THREE.MeshStandardMaterial({ color: 0x4ea44e, side: THREE.DoubleSide }),
		);
		grass.position.set(x, 0.15 * scale, z);
		grass.rotation.y = a;
		scene.add(grass);
	}
}

export class Sw01Scene extends BaseScene
{
	constructor()
	{
		super();

		// Tiled ground platform - 16x16, with a wireframe grid overlay
		// for the visible tile lines that read in the v0.1 demo.
		const groundVis = new THREE.Mesh(
			new THREE.BoxGeometry(),
			new THREE.MeshStandardMaterial({ color: 0xeeeeee }),
		);
		groundVis.scale.set(16, 0.4, 16);
		groundVis.position.y = -0.2;
		groundVis.receiveShadow = true;
		this.scene.add(groundVis);

		const groundGrid = new THREE.GridHelper(16, 16, 0xa0a0a0, 0xa0a0a0);
		groundGrid.position.y = 0.001;
		this.scene.add(groundGrid);

		const groundPhy = new THREE.Mesh(new THREE.BoxGeometry());
		groundPhy.scale.copy(groundVis.scale);
		groundPhy.position.copy(groundVis.position);
		groundPhy.userData = { data: 'physics', type: 'box' };
		this.scene.add(groundPhy);

		// Two static cubes - a large one in the middle-back and a smaller
		// one on the right, matching the v0.1 demo's silhouette.
		addStaticBox(this.scene,  0, 1.5, -3,   3, 3, 3,    0xb8b8b8);
		addStaticBox(this.scene,  5, 1.0,  0,   1.6, 2, 1.6, 0xb8b8b8);

		// A cluster of dynamic spheres in the middle of the platform -
		// the v0.1 demo's signature "kick the spheres around" feature.
		// Spawn type `shape` + subtype `sphere` gives them mass + a
		// CANNON sphere collider so the player capsule can push them.
		const spheres: { x: number; z: number; r: number }[] = [
			{ x: -2.5, z:  0.5, r: 0.4 },
			{ x: -1.2, z:  0.0, r: 0.5 },
			{ x:  0.0, z:  0.3, r: 0.6 },
			{ x:  1.2, z:  0.0, r: 0.5 },
			{ x:  2.5, z:  0.5, r: 0.4 },
		];
		for (const s of spheres)
		{
			const sphereVis = new THREE.Mesh(
				new THREE.SphereGeometry(s.r, 16, 12),
				new THREE.MeshStandardMaterial({ color: 0x9a9aa6 }),
			);
			sphereVis.position.set(s.x, s.r + 0.4, s.z);
			sphereVis.castShadow = true;
			sphereVis.receiveShadow = true;
			this.scene.add(sphereVis);

			const sphereSpawn = new THREE.Mesh(new THREE.SphereGeometry(s.r));
			sphereSpawn.position.copy(sphereVis.position);
			sphereSpawn.userData = {
				data: 'spawn',
				type: 'shape',
				subtype: 'sphere',
				mass: 2,
				radius: s.r,
			};
			this.scene.add(sphereSpawn);
		}

		// Wooden credit sign with grass at the base - the v0.1 demo's
		// signature decoration on the left side of the platform.
		addSign(this.scene, -5, 1, 1.0);

		// Default scenario - player + Bob (FollowCharacter) + John
		// (Random), the v0.1 demo's exact roster.
		const scenario = new THREE.Object3D();
		scenario.userData = {
			name: 'swift502 v0.1 foundation',
			data: 'scenario',
			default: 'true',
			desc_title: 'swift502 v0.1',
			desc_content: 'Original 2018 demo: character physics + state machine + AI characters.',
			camera_angle: 0,
		};

		const playerSpawn = new THREE.Object3D();
		playerSpawn.position.set(1.13, 3, -2.2);
		playerSpawn.userData = { data: 'spawn', type: 'player', name: 'user' };
		scenario.add(playerSpawn);

		const bob = new THREE.Object3D();
		bob.position.set(-5, 2, 3);
		bob.userData = { data: 'spawn', type: 'character_ai', name: 'Bob', behaviour: 'follow' };
		scenario.add(bob);

		const john = new THREE.Object3D();
		john.position.set(5, 2, 1);
		john.userData = { data: 'spawn', type: 'character_ai', name: 'John', behaviour: 'random' };
		scenario.add(john);

		this.scene.add(scenario);
	}
}
