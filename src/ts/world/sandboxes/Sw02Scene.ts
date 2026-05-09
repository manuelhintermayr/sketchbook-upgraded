import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { BaseScene } from './BaseScene';

// Loads the actual swift502 v0.2.0 `test_world/scene.glb` (vendored in
// this fork as `build/assets/world_v02.glb`) as the visual base, then
// translates its v0.2-era `extras.physics` / `extras.visible` / `extras.mass`
// userData into Sketchbook's current `userData.data='physics' / 'spawn'`
// dispatch format. Adds player + Bob (FollowCharacter) + John (Random)
// spawns at the same coordinates the v0.2 `examples/characters.html`
// demo used.
//
// The v0.2 GLB has 28 nodes: a textured ground sphere, a few dynamic
// objects (Icosphere / Cone / Cylinder / Cube_Quad with `mass=1`),
// several invisible convex collider proxies, and one trimesh proxy.
// The convex / trimesh distinction collapses to the closest match in
// Sketchbook's current collider toolkit (TrimeshCollider for the
// trimesh tag; box-AABB approximation for static convex; dynamic
// shape spawns for the mass-having ones).
//
// Loading is async (GLTFLoader is callback-based), so the public
// constructor takes a pre-loaded scene root and a static `createAsync()`
// helper handles the load + instantiation pair. index.html dispatches
// through the helper for sw-v02.
export class Sw02Scene extends BaseScene
{
	public static createAsync(): Promise<Sw02Scene>
	{
		return new Promise((resolve, reject) =>
		{
			const loader = new GLTFLoader();
			loader.load(
				'build/assets/world_v02.glb',
				(gltf) => resolve(new Sw02Scene(gltf.scene)),
				undefined,
				(err) => reject(err),
			);
		});
	}

	constructor(loadedRoot: THREE.Object3D)
	{
		super();

		this.scene.add(loadedRoot);

		// Walk the loaded scene and translate v0.2-era userData
		// (`extras` came through as `userData` at load time) into
		// Sketchbook's current dispatch format. Done in-place because
		// the loader hands us a fresh tree per session.
		const dynamicSpawns: THREE.Object3D[] = [];
		loadedRoot.traverse((node: any) =>
		{
			const ud = node.userData;
			if (ud === undefined) return;

			// Hide invisible-marker proxies but otherwise leave the mesh
			// alone (their userData below adds the matching collider).
			if (ud.visible === 'false')
			{
				node.visible = false;
			}

			// dynamic mass>0 nodes become spawn-shape markers; cannon
			// will give them a body so the player can push them.
			if (ud.mass !== undefined && parseFloat(ud.mass) > 0)
			{
				const subtype = node.name && node.name.toLowerCase().includes('sphere') ? 'sphere' : 'box';
				dynamicSpawns.push(makeShapeSpawn(node, subtype, parseFloat(ud.mass)));
				return;
			}

			// trimesh-tagged nodes get a trimesh collider (the v0.2
			// scene used this for the curved sphere ground).
			if (ud.physics === 'trimesh')
			{
				ud.data = 'physics';
				ud.type = 'trimesh';
				return;
			}

			// convex-tagged nodes get an axis-aligned box approximation
			// of their bounding box - Sketchbook has no convex-hull
			// collider, and the cubes / cylinders that this collapses
			// to in the v0.2 scene are mostly box-shaped anyway.
			if (ud.physics === 'convex')
			{
				ud.data = 'physics';
				ud.type = 'box';
				return;
			}
		});

		// The dynamic shape spawns need to be added to a scenario so
		// SceneLoader picks them up - sandboxes route spawn markers
		// through the same dispatcher as the GLB-driven path.
		const scenario = new THREE.Object3D();
		scenario.userData = {
			name: 'swift502 v0.2 test world',
			data: 'scenario',
			default: 'true',
			desc_title: 'swift502 v0.2',
			desc_content: 'The original test_world.glb plus character + AI spawns.',
			camera_angle: 0,
		};

		// Player spawn at the v0.2 demo's hand-picked coordinate from
		// `examples/characters.html`.
		const playerSpawn = new THREE.Object3D();
		playerSpawn.position.set(1.13, 3, -2.2);
		playerSpawn.userData = { data: 'spawn', type: 'player', name: 'user' };
		scenario.add(playerSpawn);

		// John (Random) at (5, 2, 1) and Bob (FollowCharacter) at
		// (-5, 2, 3) - exactly the v0.2 demo's roster + positions.
		const john = new THREE.Object3D();
		john.position.set(5, 2, 1);
		john.userData = { data: 'spawn', type: 'character_ai', name: 'John', behaviour: 'random' };
		scenario.add(john);

		const bob = new THREE.Object3D();
		bob.position.set(-5, 2, 3);
		bob.userData = { data: 'spawn', type: 'character_ai', name: 'Bob', behaviour: 'follow' };
		scenario.add(bob);

		for (const spawn of dynamicSpawns) scenario.add(spawn);

		this.scene.add(scenario);
	}
}

// Detach the world-positioned mesh from its parent and re-emit it as
// a `data: 'spawn', type: 'shape'` marker so ShapeSpawnPoint can wire
// up a dynamic CANNON body. Returns the new marker; caller decides
// where to add it (always under a scenario container).
function makeShapeSpawn(
	source: THREE.Object3D,
	subtype: 'box' | 'sphere',
	mass: number,
): THREE.Object3D
{
	const worldPos = new THREE.Vector3();
	source.getWorldPosition(worldPos);
	source.visible = false; // the visual gets re-created by ShapeEntity

	const marker = new THREE.Object3D();
	marker.position.copy(worldPos);
	marker.userData = {
		data: 'spawn',
		type: 'shape',
		subtype,
		mass: String(mass),
		name: source.name || 'sw02-shape',
	};
	if (subtype === 'sphere') marker.userData.radius = '0.5';
	return marker;
}
