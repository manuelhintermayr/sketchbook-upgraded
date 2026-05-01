import * as THREE from 'three';
import { World } from './World';

// Depth-edge outline pass. Renders the scene's depth into a float
// render target with an override material, then runs a Sobel kernel
// on it via a fullscreen quad to find depth discontinuities — the
// classic Tron / toon outline look. Blends additively over whatever
// the main render produced.
//
// Pattern adapted from manuelhintermayr-portfolio/three-js
// OutlineEffect — reshaped from a React useFrame hook with
// useThree() to a vanilla TS class that World.render() calls
// explicitly. Owns its render target and shader materials, so a
// disabled toggle costs nothing per frame (the renderPass call is
// guarded externally).
//
// This is a separate pass deliberately, not an EffectComposer
// ShaderPass, because the composer's RenderPass doesn't expose the
// depth buffer in a way the Sobel kernel can sample. A standalone
// pre-pass into a depth-encoded RT is the cheapest option.

const DEPTH_VERTEX = /* glsl */`
varying float vDepth;
void main()
{
	vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
	vDepth = -mvPos.z;
	gl_Position = projectionMatrix * mvPos;
}
`;

const DEPTH_FRAGMENT = /* glsl */`
uniform float cameraNear;
uniform float cameraFar;
varying float vDepth;
void main()
{
	float depth = (vDepth - cameraNear) / (cameraFar - cameraNear);
	gl_FragColor = vec4(vec3(depth), 1.0);
}
`;

const OUTLINE_VERTEX = /* glsl */`
varying vec2 vUv;
void main()
{
	vUv = uv;
	gl_Position = vec4(position, 1.0);
}
`;

const OUTLINE_FRAGMENT = /* glsl */`
uniform sampler2D depthTex;
uniform vec2 resolution;
uniform vec3 outlineColor;
uniform float outlineStrength;
uniform float depthThreshold;

varying vec2 vUv;

void main()
{
	vec2 texel = 1.0 / resolution;

	float tl = texture2D(depthTex, vUv + vec2(-texel.x,  texel.y)).r;
	float tc = texture2D(depthTex, vUv + vec2(     0.0,  texel.y)).r;
	float tr = texture2D(depthTex, vUv + vec2( texel.x,  texel.y)).r;
	float ml = texture2D(depthTex, vUv + vec2(-texel.x,      0.0)).r;
	float mr = texture2D(depthTex, vUv + vec2( texel.x,      0.0)).r;
	float bl = texture2D(depthTex, vUv + vec2(-texel.x, -texel.y)).r;
	float bc = texture2D(depthTex, vUv + vec2(     0.0, -texel.y)).r;
	float br = texture2D(depthTex, vUv + vec2( texel.x, -texel.y)).r;

	float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
	float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;
	float edge = sqrt(gx * gx + gy * gy);

	float outline = smoothstep(depthThreshold * 0.5, depthThreshold, edge);
	gl_FragColor = vec4(outlineColor, outline * outlineStrength);
}
`;

export class OutlineEffect
{
	private world: World;
	private depthRT: THREE.WebGLRenderTarget;
	private depthMat: THREE.ShaderMaterial;
	private outlineMat: THREE.ShaderMaterial;
	private quadScene: THREE.Scene;
	private orthoCam: THREE.OrthographicCamera;

	constructor(world: World)
	{
		this.world = world;

		const pr = world.renderer.getPixelRatio();
		const w = Math.floor(window.innerWidth * pr);
		const h = Math.floor(window.innerHeight * pr);

		this.depthRT = new THREE.WebGLRenderTarget(w, h, {
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
		});

		this.depthMat = new THREE.ShaderMaterial({
			vertexShader: DEPTH_VERTEX,
			fragmentShader: DEPTH_FRAGMENT,
			uniforms: {
				cameraNear: { value: 0.1 },
				cameraFar: { value: 50000 },
			},
		});

		this.outlineMat = new THREE.ShaderMaterial({
			vertexShader: OUTLINE_VERTEX,
			fragmentShader: OUTLINE_FRAGMENT,
			uniforms: {
				depthTex: { value: this.depthRT.texture },
				resolution: { value: new THREE.Vector2(w, h) },
				outlineColor: { value: new THREE.Color(0x222222) },
				outlineStrength: { value: 1.0 },
				depthThreshold: { value: 0.003 },
			},
			transparent: true,
			depthTest: false,
			depthWrite: false,
		});

		const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.outlineMat);
		this.quadScene = new THREE.Scene();
		this.quadScene.add(quad);

		this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

		window.addEventListener('resize', () => this.onResize());
	}

	private onResize(): void
	{
		const pr = this.world.renderer.getPixelRatio();
		const w = Math.floor(window.innerWidth * pr);
		const h = Math.floor(window.innerHeight * pr);
		this.depthRT.setSize(w, h);
		this.outlineMat.uniforms.resolution.value.set(w, h);
	}

	// Called by World.render() after the main composer/renderer pass,
	// before labelRenderer. No-op when params.Outlines is false.
	public renderPass(): void
	{
		if (!this.world.params?.Outlines) return;

		const renderer = this.world.renderer;
		const scene = this.world.graphicsWorld;
		const camera = this.world.camera;

		// Keep camera near/far in sync — Sky / camera-empty userData
		// occasionally tweaks far for in-space rendering. Cheap to push
		// each frame.
		this.depthMat.uniforms.cameraNear.value = camera.near;
		this.depthMat.uniforms.cameraFar.value = camera.far;

		// 1. Override every material with the linear-depth shader and
		//    render to the depth RT. Restoring afterwards is critical —
		//    without it the next composer.render would draw flat depth
		//    onto the screen.
		const origOverride = scene.overrideMaterial;
		scene.overrideMaterial = this.depthMat;
		renderer.setRenderTarget(this.depthRT);
		renderer.render(scene, camera);
		scene.overrideMaterial = origOverride;
		renderer.setRenderTarget(null);

		// 2. Blend the Sobel-edge quad over the framebuffer additively.
		const prevAutoClear = renderer.autoClear;
		renderer.autoClear = false;
		renderer.render(this.quadScene, this.orthoCam);
		renderer.autoClear = prevAutoClear;
	}
}
