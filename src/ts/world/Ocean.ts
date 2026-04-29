import * as THREE from 'three';

import { World } from './World';
import { IUpdatable } from '../interfaces/IUpdatable';

// Wave-based ocean adapted from Inthenew/Sketchbook (MIT). Replaces the
// original swift502 fragment-only WaterShader: the original was a flat
// surface, this one displaces the existing ocean mesh in the vertex
// stage and exposes getWaveHeightAt() so vehicles (boats) can ride the
// waves.
//
// Inthenew's upstream tiles a 2x2 grid of 1000-unit planes around the
// origin (their map is wider than the original level). We instead apply
// the shader directly to the ocean mesh authored in world.glb so the
// water stays exactly where the level designer placed it, in size and
// position.
//
// IMPORTANT: the wave formula in moveWave() (GLSL injected via
// onBeforeCompile below) and getWaveHeightAt() (TypeScript) MUST stay in
// sync. If you change one, change the other.
export class Ocean implements IUpdatable
{
	public updateOrder = 10;
	public material: THREE.MeshStandardMaterial;
	public clock: THREE.Clock;

	public mesh: THREE.Mesh;
	public oceanY: number;
	private world: World;
	private waterNormalMap: THREE.Texture | null = null;

	private readonly uniforms = {
		time: { value: 0 },
		// 'grid' controls horizontal wave wavelength: lower numbers tighten
		// the waves. Inthenew used 1000 across a 1000-unit tile; we keep
		// that ratio relative to whatever our ocean mesh's xz extent is.
		grid: { value: 1000 },
	};

	constructor(object: THREE.Mesh, world: World)
	{
		this.world = world;
		this.mesh = object;

		const worldPos = new THREE.Vector3();
		object.getWorldPosition(worldPos);
		this.oceanY = worldPos.y;

		this.clock = new THREE.Clock();
		this.material = this.createWaveMaterial();
		object.material = this.material;

		this.loadNormalMap();
	}

	private loadNormalMap(): void
	{
		const txtrLoader = new THREE.TextureLoader();
		txtrLoader.load('src/img/water/waternormals.jpg', (texture) =>
		{
			texture.magFilter = THREE.LinearFilter;
			texture.minFilter = THREE.LinearMipmapLinearFilter;
			texture.generateMipmaps = true;
			texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
			texture.repeat.set(8, 8);
			texture.needsUpdate = true;
			this.waterNormalMap = texture;
			this.material.normalMap = texture;
			this.material.needsUpdate = true;
		});
	}

	private createWaveMaterial(): THREE.MeshStandardMaterial
	{
		const mat = new THREE.MeshStandardMaterial({
			color: 0x113355,
			metalness: 0.5,
			roughness: 0.6,
			name: 'ocean.001',
		});
		// Inject vertex displacement + height-based color via
		// onBeforeCompile so we keep three's lighting and normal map
		// pipeline.
		mat.onBeforeCompile = (shader) =>
		{
			shader.uniforms.time = this.uniforms.time;
			shader.uniforms.grid = this.uniforms.grid;

			shader.vertexShader = shader.vertexShader.replace(
				'void main() {',
				`
				uniform float time;
				uniform float grid;
				varying float vHeight;

				vec3 moveWave(vec3 p) {
					float num = 0.7;
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

					return retVal;
				}

				void main() {
				`,
			);

			shader.vertexShader = shader.vertexShader.replace(
				'#include <begin_vertex>',
				`
				#include <begin_vertex>
				transformed = moveWave(transformed);
				vHeight = transformed.y;
				`,
			);

			shader.fragmentShader = 'varying float vHeight;\n' + shader.fragmentShader;
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <color_fragment>',
				`
				#include <color_fragment>
				diffuseColor.rgb = mix(vec3(0.03125, 0.0625, 0.5), vec3(0.1, 0.2, 0.6), smoothstep(-3.0, 3.0, vHeight));
				`,
			);
		};
		return mat;
	}

	// CPU mirror of moveWave() above. Returns the world-space y at world
	// coordinate (x, z) and time t. Note: the GLSL function works in the
	// mesh's LOCAL space (modelMatrix is applied to verts before being fed
	// to it, but the wave displacement is in local y), so we transform to
	// the ocean mesh's local frame, sample, and add the mesh's world y.
	public getWaveHeightAt(x: number, z: number, t: number): number
	{
		const localPos = new THREE.Vector3(x, 0, z);
		this.mesh.worldToLocal(localPos);
		// The plane geometry was rotated -PI/2 around X in Inthenew's
		// upstream code so XZ became XY in local space. World.glb's ocean
		// mesh keeps the plane's natural XY orientation, so 'z' here is
		// actually the plane's local y. Use the right axes for the formula.
		const localX = localPos.x;
		const localZ = localPos.z;

		const num = 0.7;
		const kzx = 360.0 / this.uniforms.grid.value;
		const toRadians = (angle: number): number =>
		{
			if (angle > 360) angle -= 360;
			return angle * Math.PI / 180;
		};

		let y = num * 3.0 * Math.sin(toRadians(50.0 * t - 1.0 * localX * kzx - 2.0 * localZ * kzx));
		y += num * 2.0 * Math.sin(toRadians(25.0 * t - 3.0 * localX * kzx));
		y += num * 2.0 * Math.sin(toRadians(15.0 * t - 3.0 * localZ * kzx));
		y += num * 0.5 * Math.sin(toRadians(50.0 * t + 4.0 * localX * kzx + 8.0 * localZ * kzx));
		y += num * 0.5 * Math.sin(toRadians(50.0 * t + 8.0 * localX * kzx));

		return y + this.oceanY;
	}

	public update(_timeStep: number): void
	{
		this.uniforms.time.value = this.clock.getElapsedTime();

		// Subtle scroll on the normal map for additional surface motion.
		if (this.waterNormalMap)
		{
			this.waterNormalMap.offset.x -= 0.00005;
			this.waterNormalMap.offset.y += 0.000025;
		}
	}
}
