import * as THREE from 'three';

import { World } from './World';
import { IUpdatable } from '../interfaces/IUpdatable';

// Wave-based ocean ported from Inthenew/Sketchbook (MIT). Replaces the
// original swift502 fragment-only WaterShader: the original was a flat
// surface, this one displaces a tiled plane in the vertex stage and
// exposes getWaveHeightAt() so vehicles (boats) can ride the waves.
//
// IMPORTANT: the wave formula in moveWave() (GLSL injected via
// onBeforeCompile below) and getWaveHeightAt() (TypeScript) MUST stay in
// sync. If you change one, change the other.
export class Ocean implements IUpdatable
{
	public updateOrder = 10;
	public material: THREE.MeshBasicMaterial;
	public clock: THREE.Clock;

	private world: World;

	// Grid of plane tiles tiled around the origin so the visible ocean
	// extends GrdRCs * GrdSiz units total in each axis.
	private readonly GrdSiz = 1000;
	private readonly segNum = 200;
	private readonly GrdRCs = 2;

	private waveGeometry: THREE.PlaneGeometry | null = null;
	private waveMaterial: THREE.MeshStandardMaterial | null = null;
	private waterNormalMap: THREE.Texture | null = null;
	private tiles: THREE.Mesh[] = [];
	private tileXOffsets: number[] = [];
	private tileZOffsets: number[] = [];
	private tileBaseY: number;
	private loaded = false;

	private readonly uniforms = {
		time: { value: 0 },
		grid: { value: 1000 },
	};

	constructor(object: THREE.Mesh, world: World)
	{
		this.world = world;

		// Hide the original ocean plane carried in world.glb — we render the
		// tiled wave grid on top of (and around) its position instead.
		this.material = new THREE.MeshBasicMaterial({
			color: 'skyblue',
			transparent: true,
			opacity: 0,
		});
		object.material = this.material;

		// Inherit the y of the original ocean mesh so the vertical position
		// stays consistent with whatever the level designer placed in Blender.
		const worldPos = new THREE.Vector3();
		object.getWorldPosition(worldPos);
		this.tileBaseY = worldPos.y;

		this.clock = new THREE.Clock();
		this.createOcean();
	}

	private createOcean(): void
	{
		const loadingManager = new THREE.LoadingManager();
		loadingManager.onLoad = () =>
		{
			this.initTiles();
		};

		const txtrLoader = new THREE.TextureLoader(loadingManager);
		txtrLoader.load('src/img/water/waternormals.jpg', (texture) =>
		{
			texture.magFilter = THREE.LinearFilter;
			texture.minFilter = THREE.LinearMipmapLinearFilter;
			texture.generateMipmaps = true;
			texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
			texture.offset.set(0, 0);
			texture.repeat.set(1, 1);
			texture.needsUpdate = true;
			this.waterNormalMap = texture;
		});
	}

	private initTiles(): void
	{
		this.waveGeometry = new THREE.PlaneGeometry(this.GrdSiz, this.GrdSiz, this.segNum, this.segNum);
		this.waveGeometry.rotateX(-Math.PI * 0.5);

		this.waveMaterial = new THREE.MeshStandardMaterial({
			normalMap: this.waterNormalMap,
			metalness: 0.5,
			roughness: 0.6,
			name: 'ocean.001',
		});
		// Custom vertex displacement + height-based color, injected via
		// onBeforeCompile so we keep three's lighting + normal map pipeline.
		this.waveMaterial.onBeforeCompile = (shader) =>
		{
			shader.uniforms.time = this.uniforms.time;
			shader.uniforms.grid = this.uniforms.grid;
			shader.uniforms.noWaveCenter = { value: new THREE.Vector2(0.0, 0.0) };
			shader.uniforms.noWaveHalfSize = { value: new THREE.Vector2(180.0, 140.0) };
			shader.uniforms.noWaveHalfSize2 = { value: new THREE.Vector2(300.0, 330.0) };

			shader.vertexShader = shader.vertexShader.replace(
				'void main() {',
				`
				uniform float time;
				uniform float grid;
				uniform vec2 noWaveCenter;
				uniform vec2 noWaveHalfSize;
				uniform vec2 noWaveHalfSize2;
				varying float vHeight;
				varying float vInvisible;

				vec3 moveWave(vec3 p) {
					float num = 0.7;
					vec4 worldPos = modelMatrix * vec4(p, 1.0);
					vec3 retVal = p;
					float ang;
					float kzx = 360.0 / grid;

					ang = 50.0 * time + -1.0 * p.x * kzx + -2.0 * p.z * kzx;
					if (ang > 360.0) ang -= 360.0;
					ang = ang * 3.14159265 / 180.0;
					retVal.y = num * 3.0 * sin(ang);

					ang = 25.0 * time + -3.0 * p.x * kzx;
					if (ang > 360.0) ang -= 360.0;
					ang = ang * 3.14159265 / 180.0;
					retVal.y += num * 2.0 * sin(ang);

					ang = 15.0 * time - 3.0 * p.z * kzx;
					if (ang > 360.0) ang -= 360.0;
					ang = ang * 3.14159265 / 180.0;
					retVal.y += num * 2.0 * sin(ang);

					ang = 50.0 * time + 4.0 * p.x * kzx + 8.0 * p.z * kzx;
					if (ang > 360.0) ang -= 360.0;
					ang = ang * 3.14159265 / 180.0;
					retVal.y += num * 0.5 * sin(ang);

					ang = 50.0 * time + 8.0 * p.x * kzx;
					if (ang > 360.0) ang -= 360.0;
					ang = ang * 3.14159265 / 180.0;
					retVal.y += num * 0.5 * sin(ang);

					float inZone = 0.0;
					if (abs(worldPos.x - noWaveCenter.x) < noWaveHalfSize.x &&
							abs(worldPos.z - noWaveCenter.y) < noWaveHalfSize.y) {
						inZone = 1.0;
						retVal.y = -100.0;
					} else if (abs(worldPos.x - noWaveCenter.x) < noWaveHalfSize2.x &&
								abs(worldPos.z - noWaveCenter.y) < noWaveHalfSize2.y) {
						retVal.y = 8.5;
					} else {
						retVal.y += 3.6;
					}
					vInvisible = inZone;
					return retVal;
				}

				void main() {
				`
			);

			shader.vertexShader = shader.vertexShader.replace(
				'#include <begin_vertex>',
				`
				#include <begin_vertex>
				transformed = moveWave(transformed);
				vHeight = transformed.y;
				`
			);

			shader.fragmentShader = 'varying float vHeight;\nvarying float vInvisible;\n' + shader.fragmentShader;
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <color_fragment>',
				`
				#include <color_fragment>
				if(vInvisible > 0.5) { discard; }
				diffuseColor.rgb = mix(vec3(0.03125, 0.0625, 0.5), vec3(0.1, 0.2, 0.6), smoothstep(0.0, 6.0, vHeight));
				`
			);
		};

		// Lay out a GrdRCs x GrdRCs grid of tiles centered on origin.
		let zx = -0.5 * this.GrdRCs * this.GrdSiz + 0.5 * this.GrdSiz;
		for (let i = 0; i < this.GrdRCs; i++)
		{
			this.tileZOffsets[i] = zx;
			this.tileXOffsets[i] = zx;
			zx += this.GrdSiz;
		}

		let n = 0;
		for (let z = 0; z < this.GrdRCs; z++)
		{
			for (let x = 0; x < this.GrdRCs; x++)
			{
				const tile = new THREE.Mesh(this.waveGeometry, this.waveMaterial);
				tile.position.set(this.tileXOffsets[x], this.tileBaseY, -this.tileZOffsets[z]);
				this.world.graphicsWorld.add(tile);
				this.tiles[n] = tile;
				n++;
			}
		}
		this.loaded = true;
	}

	// Compute the water height at world coordinate (x, z) and time t. Uses
	// the same multi-sine stack as the GLSL moveWave() above so boat physics
	// can ride the visible waves. Returns 'inner-zone' if the sample is
	// inside the no-wave dock area (caller decides what to do).
	public getWaveHeightAt(x: number, z: number, t: number): number | 'inner-zone'
	{
		const gridSize = this.GrdSiz;
		const segmentSize = gridSize / this.segNum;
		const totalSize = this.GrdRCs * gridSize;

		const oceanX = x + totalSize / 2;
		const oceanZ = z + totalSize / 2;
		const tileXIndex = Math.floor(oceanX / gridSize);
		const tileZIndex = Math.floor(oceanZ / gridSize);
		const tileIndex = tileZIndex * this.GrdRCs + tileXIndex;

		if (tileIndex < 0 || tileIndex >= this.tiles.length) return 12;
		const tile = this.tiles[tileIndex];
		if (!tile) return 12;

		const localXFull = x - tile.position.x;
		const localZFull = z - tile.position.z;
		const vertexX = Math.round((localXFull + gridSize / 2) / segmentSize) * segmentSize - gridSize / 2;
		const vertexZ = Math.round((localZFull + gridSize / 2) / segmentSize) * segmentSize - gridSize / 2;

		if (!isFinite(vertexX) || !isFinite(vertexZ))
		{
			return 8.5 + tile.position.y + 0.1;
		}

		const num = 0.7;
		const kzx = 360.0 / this.uniforms.grid.value;
		const toRadians = (angle: number): number =>
		{
			if (angle > 360) angle -= 360;
			return angle * Math.PI / 180;
		};

		let y = num * 3.0 * Math.sin(toRadians(50.0 * t - 1.0 * vertexX * kzx - 2.0 * vertexZ * kzx));
		y += num * 2.0 * Math.sin(toRadians(25.0 * t - 3.0 * vertexX * kzx));
		y += num * 2.0 * Math.sin(toRadians(15.0 * t - 3.0 * vertexZ * kzx));
		y += num * 0.5 * Math.sin(toRadians(50.0 * t + 4.0 * vertexX * kzx + 8.0 * vertexZ * kzx));
		y += num * 0.5 * Math.sin(toRadians(50.0 * t + 8.0 * vertexX * kzx));

		const worldX = tile.position.x + vertexX;
		const worldZ = tile.position.z + vertexZ;
		const noWaveCenter = { x: 0.0, z: 0.0 };
		const noWaveHalfSize = { x: 180.0, z: 140.0 };
		const noWaveHalfSize2 = { x: 300.0, z: 330.0 };

		if (Math.abs(worldX - noWaveCenter.x) < noWaveHalfSize.x
			&& Math.abs(worldZ - noWaveCenter.z) < noWaveHalfSize.z)
		{
			return 'inner-zone';
		}
		if (Math.abs(worldX - noWaveCenter.x) < noWaveHalfSize2.x
			&& Math.abs(worldZ - noWaveCenter.z) < noWaveHalfSize2.z)
		{
			return 8.5 + tile.position.y + 0.1;
		}
		return y + 3.6 + tile.position.y + 0.1;
	}

	public update(_timeStep: number): void
	{
		if (!this.loaded) return;
		this.uniforms.time.value = this.clock.getElapsedTime();

		// Subtle scroll on the normal map for additional surface motion.
		if (this.waterNormalMap)
		{
			this.waterNormalMap.offset.x -= 0.00005;
			this.waterNormalMap.offset.y += 0.000025;
		}
	}
}
