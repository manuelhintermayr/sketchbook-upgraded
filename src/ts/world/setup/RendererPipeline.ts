import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { World } from '../World';
import { RenderLayer } from '../../enums/RenderLayers';

// Build the rendering pipeline — WebGL renderer, CSS2D label overlay,
// scene + camera, composer with FXAA / Bloom / DoF stacked in their
// canonical order, plus the window-resize handler that keeps every
// surface in sync. Bloom and DoF are added with `.enabled = false`
// so toggling them at runtime never has to rebuild the composer.
//
// Side effects assigned to world by the time this returns:
//   - world.renderer, world.labelRenderer
//   - world.graphicsWorld, world.camera
//   - world.composer, world.bloomPass, world.bokehPass
//
// Run before bootstrapHTML — that function appends
// world.renderer.domElement to <body> as the canvas, so the renderer
// has to exist first.
export function setupRendererPipeline(world: World): void
{
	// Renderer. Cap pixelRatio at 2 — phones/tablets often report
	// DPR 3-4, which forces the GPU to render 9-16× the pixels for
	// barely visible sharpness gain past 2×. Desktops (DPR 1-2) are
	// unaffected.
	world.renderer = new THREE.WebGLRenderer();
	world.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	world.renderer.setSize(window.innerWidth, window.innerHeight);
	world.renderer.toneMapping = THREE.ACESFilmicToneMapping;
	world.renderer.toneMappingExposure = 1.0;
	// Black space behind the Sky shell; Sky.update() hides the shell
	// once the camera leaves Earth's atmosphere, revealing this color.
	world.renderer.setClearColor(0x000000, 1);
	world.renderer.shadowMap.enabled = true;
	world.renderer.shadowMap.type = THREE.PCFShadowMap;
	//world.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	// Note: Soft shadows leads to animation errors with car tires

	// CSS2D label overlay — drives the name tags above each character.
	// Pattern is the one socketControl uses (a parallel renderer that
	// projects HTML divs to screen-space at the object's world
	// position). pointerEvents=none so labels never eat clicks.
	world.labelRenderer = new CSS2DRenderer();
	world.labelRenderer.setSize(window.innerWidth, window.innerHeight);
	world.labelRenderer.domElement.id = 'labelRenderer';
	world.labelRenderer.domElement.style.position = 'absolute';
	world.labelRenderer.domElement.style.top = '0';
	world.labelRenderer.domElement.style.pointerEvents = 'none';
	document.body.appendChild(world.labelRenderer.domElement);

	// Three.js scene
	world.graphicsWorld = new THREE.Scene();
	// far=1010 (swift502 default) clips the moon at distance ~12320 and
	// the rocketship's max-Y plane at 5200. Inthenew sets far=2e10;
	// 50000 is plenty for the authored geometry while still keeping
	// the depth buffer well-conditioned.
	world.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 50000);
	// Main camera sees both the default layer and the outline-skip
	// layer so background meshes (sky, stars, grass, ocean) still
	// render normally. OutlineEffect.renderPass strips this bit
	// briefly to skip them during the depth pre-pass.
	world.camera.layers.enable(RenderLayer.OutlineSkip);

	// Passes
	const renderPass = new RenderPass(world.graphicsWorld, world.camera);
	const fxaaPass = new ShaderPass(FXAAShader);

	// FXAA
	const pixelRatio = world.renderer.getPixelRatio();
	fxaaPass.material['uniforms'].resolution.value.x = 1 / (window.innerWidth * pixelRatio);
	fxaaPass.material['uniforms'].resolution.value.y = 1 / (window.innerHeight * pixelRatio);

	// Composer
	world.composer = new EffectComposer(world.renderer);
	world.composer.addPass(renderPass);
	world.composer.addPass(fxaaPass);

	// Bloom + Depth-of-Field. Both are added to the pipeline up-front
	// with .enabled=false so the FXAA toggle path doesn't have to
	// rebuild the composer when the player flips them on. Order:
	//   render → fxaa → bloom → bokeh
	// Bloom intensity adapts to time-of-day (stronger at night) and
	// DoF focus is tighter while driving — both updated per frame in
	// render().
	world.bloomPass = new UnrealBloomPass(
		new THREE.Vector2(window.innerWidth, window.innerHeight),
		0.5,    // strength
		0.4,    // radius
		0.85,   // luminanceThreshold
	);
	world.bloomPass.enabled = false;
	world.composer.addPass(world.bloomPass);

	world.bokehPass = new BokehPass(world.graphicsWorld, world.camera, {
		focus: 30,
		aperture: 0.0001,
		maxblur: 0.01,
	});
	world.bokehPass.enabled = false;
	world.composer.addPass(world.bokehPass);

	// Auto window resize. Captures fxaaPass and pixelRatio so the
	// FXAA shader's resolution uniform stays in sync with the new
	// surface size; everything else just resizes against window.inner*.
	window.addEventListener('resize', () =>
	{
		world.camera.aspect = window.innerWidth / window.innerHeight;
		world.camera.updateProjectionMatrix();
		world.renderer.setSize(window.innerWidth, window.innerHeight);
		fxaaPass.uniforms['resolution'].value.set(
			1 / (window.innerWidth * pixelRatio),
			1 / (window.innerHeight * pixelRatio),
		);
		world.composer.setSize(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
		world.labelRenderer.setSize(window.innerWidth, window.innerHeight);
	}, false);
}
