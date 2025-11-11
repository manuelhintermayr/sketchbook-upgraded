import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import Swal from 'sweetalert2';

import { CameraOperator } from '../core/CameraOperator';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader  } from 'three/examples/jsm/shaders/FXAAShader.js';
import WebGL from 'three/examples/jsm/capabilities/WebGL.js';

import Stats from 'stats.js';
import GUI from 'lil-gui';
import CannonDebugger from 'cannon-es-debugger';
import * as _ from 'lodash';

import { InputManager } from '../core/InputManager';
import * as Utils from '../core/FunctionLibrary';
import { LoadingManager } from '../core/LoadingManager';
import { InfoStack } from '../core/InfoStack';
import { UIManager } from '../core/UIManager';
import { IWorldEntity } from '../interfaces/IWorldEntity';
import { IUpdatable } from '../interfaces/IUpdatable';
import { Character } from '../characters/Character';
import { Path } from './Path';
import { CollisionGroups } from '../enums/CollisionGroups';
import { BoxCollider } from '../physics/colliders/BoxCollider';
import { TrimeshCollider } from '../physics/colliders/TrimeshCollider';
import { CylinderCollider } from '../physics/colliders/CylinderCollider';
import { Vehicle } from '../vehicles/Vehicle';
import { Helicopter } from '../vehicles/Helicopter';
import { Airplane } from '../vehicles/Airplane';
import { Car } from '../vehicles/Car';
import { Boat } from '../vehicles/Boat';
import { RocketShip } from '../vehicles/RocketShip';
import { Scenario } from './Scenario';
import { Sky } from './Sky';
import { Ocean } from './Ocean';
import { Grass } from './Grass';
import { Speaker } from './Speaker';
import { NPCSpawnPoint } from './NPCSpawnPoint';

export class World
{
	public renderer: THREE.WebGLRenderer;
	public camera: THREE.PerspectiveCamera;
	public composer: any;
	public stats: Stats;
	public graphicsWorld: THREE.Scene;
	public sky: Sky;
	public physicsWorld: CANNON.World;
	public parallelPairs: any[];
	public physicsFrameRate: number;
	public physicsFrameTime: number;
	public physicsMaxPrediction: number;
	public renderDelta: number;
	public logicDelta: number;
	public requestDelta: number;
	private stopwatchLastTime: number = performance.now();
	public sinceLastFrame: number;
	public justRendered: boolean;
	public params: any;
	public inputManager: InputManager;
	public cameraOperator: CameraOperator;
	public timeScaleTarget: number = 1;
	public console: InfoStack;
	public cannonDebugRenderer: ReturnType<typeof CannonDebugger> | undefined;
	private cannonDebugMeshes: THREE.Mesh[] = [];
	public scenarios: Scenario[] = [];
	public characters: Character[] = [];
	public vehicles: Vehicle[] = [];
	public cars: Car[] = [];
	public helicopters: Helicopter[] = [];
	public airplanes: Airplane[] = [];
	public ocean: Ocean | null = null;
	public paths: Path[] = [];
	public lapCounter: HTMLElement;
	public onMoon: boolean = false;
	public scenarioGUIFolder: any;
	public updatables: IUpdatable[] = [];

	private lastScenarioID: string;

	constructor(worldScenePath?: any)
	{
		const scope = this;

		// WebGL 2 not supported
		if (!WebGL.isWebGL2Available())
		{
			Swal.fire({
				icon: 'warning',
				title: 'WebGL compatibility',
				text: 'This browser doesn\'t seem to have the required WebGL 2 capabilities. The application may not work correctly.',
				footer: '<a href="https://get.webgl.org/" target="_blank">Click here for more information</a>',
				showConfirmButton: false,
				buttonsStyling: false
			});
		}

		// Renderer
		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.0;
		// Black space behind the Sky shell; Sky.update() hides the shell
		// once the camera leaves Earth's atmosphere, revealing this color.
		this.renderer.setClearColor(0x000000, 1);
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		//this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		// Note: Soft shadows leads to animation errors with car tires

		this.generateHTML();

		// Lap counter overlay (Inthenew/Sketchbook). Initially hidden;
		// Scenario.launch() flips visibility when a tracked race starts.
		this.lapCounter = document.createElement('h1');
		this.lapCounter.id = 'laps';
		this.lapCounter.innerHTML = 'Lap: 0';
		this.lapCounter.style.position = 'absolute';
		this.lapCounter.style.top = '0';
		this.lapCounter.style.left = '50px';
		this.lapCounter.style.visibility = 'hidden';
		document.body.appendChild(this.lapCounter);

		// Z toggles the controls overlay (ported from Inthenew). Listened
		// at document level so it works whichever input receiver is
		// active — character, vehicle, or free camera.
		document.addEventListener('keydown', (e) =>
		{
			if (e.code === 'KeyZ' && !e.repeat) this.toggleControlsOverlay();
		});

		// Auto window resize
		function onWindowResize(): void
		{
			scope.camera.aspect = window.innerWidth / window.innerHeight;
			scope.camera.updateProjectionMatrix();
			scope.renderer.setSize(window.innerWidth, window.innerHeight);
			fxaaPass.uniforms['resolution'].value.set(1 / (window.innerWidth * pixelRatio), 1 / (window.innerHeight * pixelRatio));
			scope.composer.setSize(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
		}
		window.addEventListener('resize', onWindowResize, false);

		// Three.js scene
		this.graphicsWorld = new THREE.Scene();
		// far=1010 (swift502 default) clips the moon at distance ~12320 and
		// the rocketship's max-Y plane at 5200. Inthenew sets far=2e10;
		// 50000 is plenty for the authored geometry while still keeping
		// the depth buffer well-conditioned.
		this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 50000);

		// Passes
		let renderPass = new RenderPass( this.graphicsWorld, this.camera );
		let fxaaPass = new ShaderPass( FXAAShader );

		// FXAA
		let pixelRatio = this.renderer.getPixelRatio();
		fxaaPass.material['uniforms'].resolution.value.x = 1 / ( window.innerWidth * pixelRatio );
		fxaaPass.material['uniforms'].resolution.value.y = 1 / ( window.innerHeight * pixelRatio );

		// Composer
		this.composer = new EffectComposer( this.renderer );
		this.composer.addPass( renderPass );
		this.composer.addPass( fxaaPass );

		// Physics
		this.physicsWorld = new CANNON.World();
		this.physicsWorld.gravity.set(0, -9.81, 0);
		this.physicsWorld.broadphase = new CANNON.SAPBroadphase(this.physicsWorld);
		//this.physicsWorld.solver.iterations = 10; NOW DEFAULT for GSSolver
		this.physicsWorld.allowSleep = true;

		this.parallelPairs = [];
		this.physicsFrameRate = 60;
		this.physicsFrameTime = 1 / this.physicsFrameRate;
		this.physicsMaxPrediction = this.physicsFrameRate;

		// RenderLoop
		this.stopwatchLastTime = performance.now();
		this.renderDelta = 0;
		this.logicDelta = 0;
		this.sinceLastFrame = 0;
		this.justRendered = false;

		// Stats (FPS, Frame time, Memory). Upstream stats.js shows one panel
		// at a time and toggles on click; Sketchbook historically rendered
		// FPS + MS + MB side-by-side inside the UI container, hidden by
		// default until the Debug_FPS toggle is flipped. Replicate that.
		this.stats = new Stats();
		this.stats.dom.id = 'statsBox';
		this.stats.dom.style.display = 'none';
		document.getElementById('ui-container').appendChild(this.stats.dom);
		for (const panel of Array.from(this.stats.dom.children) as HTMLElement[])
		{
			panel.style.display = 'inline-block';
		}
		// Create right panel GUI
		this.createParamsGUI(scope);

		// Initialization
		this.inputManager = new InputManager(this, this.renderer.domElement);
		this.cameraOperator = new CameraOperator(this, this.camera, this.params.Mouse_Sensitivity);
		this.sky = new Sky(this);

		// Day / night cycle (ported from Inthenew/Sketchbook).
		// Mirror sky.phi back into params.Sun_Elevation (folded over 180 so
		// it stays in the slider's 0..180 range) so the listen()-bound
		// Sun_Elevation slider visibly tracks the sun while the cycle runs.
		setInterval(() =>
		{
			if (scope.params.Has_Day_Night_Cycle)
			{
				let phi = scope.sky.phi + 0.01 * scope.params.Time_Scale;
				if (!scope.params.Has_Night_Time && phi >= 180) phi = 0;
				else if (scope.params.Has_Night_Time && phi >= 360) phi = 0;
				scope.sky.phi = phi;
				scope.params.Sun_Elevation = phi <= 180 ? phi : 360 - phi;
			}
		}, 10);

		// Load scene if path is supplied. The argument is either a string
		// path to a .glb (loaded async via GLTFLoader) or a BaseScene
		// instance from src/ts/world/sandboxes (built synchronously in
		// its constructor). Both paths funnel into loadScene().
		if (worldScenePath !== undefined)
		{
			let loadingManager = new LoadingManager(this);
			loadingManager.onFinishedCallback = () =>
			{
				this.update(1, 1);
				this.setTimeScale(1);

				Swal.fire({
					title: 'Welcome to Sketchbook!',
					text: 'Feel free to explore the world and interact with available vehicles. There are also various scenarios ready to launch from the right panel.',
					footer: '<a href="https://github.com/swift502/Sketchbook" target="_blank">GitHub page</a><a href="https://discord.gg/fGuEqCe" target="_blank">Discord server</a>',
					confirmButtonText: 'Okay',
					buttonsStyling: false
				}).then((result) => {
					if (result.isConfirmed) {
						UIManager.setUserInterfaceVisible(true);
					}
				})
			};
			if (typeof worldScenePath === 'string')
			{
				loadingManager.loadGLTF(worldScenePath, (gltf) =>
				{
					this.loadScene(loadingManager, gltf);
				}
				);
			}
			else if (worldScenePath && worldScenePath.scene instanceof THREE.Object3D)
			{
				// BaseScene instance — build a synthetic GLTF-shaped object
				// and feed it through the same loadScene path. A throwaway
				// tracker entry keeps the loading-screen accounting honest
				// in case no other async loads (vehicle GLBs) follow.
				const entry = loadingManager.addLoadingEntry('sandbox-scene');
				const fakeGltf = { scene: worldScenePath.scene, animations: worldScenePath.sceneAnimations || [] };
				this.loadScene(loadingManager, fakeGltf);
				loadingManager.doneLoading(entry);
			}
		}
		else
		{
			UIManager.setUserInterfaceVisible(true);
			UIManager.setLoadingScreenVisible(false);
			Swal.fire({
				icon: 'success',
				title: 'Hello world!',
				text: 'Empty Sketchbook world was succesfully initialized. Enjoy the blueness of the sky.',
				buttonsStyling: false
			});
		}

		this.render(this);
	}

	// Update
	// Handles all logic updates.
	public update(timeStep: number, unscaledTimeStep: number): void
	{
		this.updatePhysics(timeStep);

		// Pipe Free_Cam_Speed (1..100, default 25 = upstream feel) into
		// CameraOperator's movementSpeed scalar. The base of 0.06 was the
		// original swift502 default at slider value 25; scale linearly.
		this.cameraOperator.movementSpeed = (this.params.Free_Cam_Speed / 25) * 0.06;

		// Update registred objects
		this.updatables.forEach((entity) => {
			entity.update(timeStep, unscaledTimeStep);
		});

		// Lerp time scale
		this.params.Time_Scale = THREE.MathUtils.lerp(this.params.Time_Scale, this.timeScaleTarget, 0.2);

		// Physics debug
		if (this.params.Debug_Physics) this.cannonDebugRenderer?.update();
	}

	public updatePhysics(timeStep: number): void
	{
		// ADD PRE-STEPS for all characters and vehicles
		this.characters.forEach((char) => {
			if (typeof char.physicsPreStep == 'function')
			{
				char.physicsPreStep(char.characterCapsule.body, char)
			}
		})

		this.vehicles.forEach((vehicle) => {
			if (vehicle instanceof Car)
			{
				vehicle.physicsPreStep(vehicle.collision, vehicle)
			} else if (vehicle instanceof Helicopter)
			{
				vehicle.physicsPreStep(vehicle.collision, vehicle)
			} else if (vehicle instanceof Airplane)
			{
				vehicle.physicsPreStep(vehicle.collision, vehicle)
			} else if (vehicle instanceof Boat)
			{
				vehicle.physicsPreStep(vehicle.collision, vehicle)
			} else if (vehicle instanceof RocketShip)
			{
				vehicle.physicsPreStep(vehicle.collision, vehicle)
			}
		})

		// Switch to lunar gravity while the player is on the moon. Moon
		// surface gravity is ~1.62 m/s^2, ~1/6 of Earth's. Inthenew left
		// this commented out as WIP; we activate it now that the rocket
		// flight reliably sets/clears world.onMoon.
		const baseG = this.onMoon ? -1.62 : -9.81;
		const targetGravityY = baseG * (this.params?.Gravity_Scale ?? 1);
		if (this.physicsWorld.gravity.y !== targetGravityY)
		{
			this.physicsWorld.gravity.set(0, targetGravityY, 0);
		}

		// Step the physics world
		this.physicsWorld.step(this.physicsFrameTime, timeStep);

		this.characters.forEach((char) => {
			if (typeof char.physicsPostStep == 'function')
			{
				char.physicsPostStep(char.characterCapsule.body, char)
			}

			if (this.isOutOfBounds(char.characterCapsule.body.position))
			{
				this.outOfBoundsRespawn(char.characterCapsule.body);
			}
		});

		this.vehicles.forEach((vehicle) => {

			if (this.isOutOfBounds(vehicle.rayCastVehicle.chassisBody.position))
			{
				let worldPos = new THREE.Vector3();
				vehicle.spawnPoint.getWorldPosition(worldPos);
				//worldPos.setComponent(1, worldPos.getComponent(1) + 1);
				let worldPos_CANNON = new CANNON.Vec3(worldPos.x, worldPos.y+1, worldPos.z)
				//worldPos.y += 1;
				this.outOfBoundsRespawn(vehicle.rayCastVehicle.chassisBody, worldPos_CANNON);
			}
		});
	}

	public isOutOfBounds(position: CANNON.Vec3): boolean
	{
		let inside = position.x > -211.882 && position.x < 211.882 &&
					position.z > -169.098 && position.z < 153.232 &&
					position.y > 0.107;
		let belowSeaLevel = position.y < 14.989;

		return !inside && belowSeaLevel;
	}

	public outOfBoundsRespawn(body: CANNON.Body, position?: CANNON.Vec3): void
	{
		let newPos = position || new CANNON.Vec3(0, 16, 0);
		let newQuat = new CANNON.Quaternion(0, 0, 0, 1);

		body.position.copy(newPos);
		body.interpolatedPosition.copy(newPos);
		body.quaternion.copy(newQuat);
		body.interpolatedQuaternion.copy(newQuat);
		body.velocity.setZero();
		body.angularVelocity.setZero();
	}

	/**
	 * Rendering loop.
	 * Implements fps limiter and frame-skipping
	 * Calls world's "update" function before rendering.
	 * @param {World} world 
	 */
	public render(world: World): void
	{
		this.requestDelta = this.stopwatchDelta();

		requestAnimationFrame(() =>
		{
			world.render(world);
		});

		// Getting timeStep
		let unscaledTimeStep = (this.requestDelta + this.renderDelta + this.logicDelta) ;
		let timeStep = unscaledTimeStep * this.params.Time_Scale;
		timeStep = Math.min(timeStep, 1 / 30);    // min 30 fps

		// Logic
		world.update(timeStep, unscaledTimeStep);

		// Measuring logic time
		this.logicDelta = this.stopwatchDelta();

		// Frame limiting
		let interval = 1 / 60;
		this.sinceLastFrame += this.requestDelta + this.renderDelta + this.logicDelta;
		this.sinceLastFrame %= interval;

		// Stats end
		this.stats.end();
		this.stats.begin();

		// Actual rendering with a FXAA ON/OFF switch
		if (this.params.FXAA) this.composer.render();
		else this.renderer.render(this.graphicsWorld, this.camera);

		// Measuring render time
		this.renderDelta = this.stopwatchDelta();
	}

	// Returns seconds elapsed since the previous call. Replaces the
	// now-deprecated THREE.Clock which was used the same way (three calls
	// per frame to measure request/logic/render phases).
	private stopwatchDelta(): number
	{
		const now = performance.now();
		const delta = (now - this.stopwatchLastTime) / 1000;
		this.stopwatchLastTime = now;
		return delta;
	}

	public setTimeScale(value: number): void
	{
		this.params.Time_Scale = value;
		this.timeScaleTarget = value;
	}

	public add(worldEntity: IWorldEntity): void
	{
		worldEntity.addToWorld(this);
		this.registerUpdatable(worldEntity);

		// Apply the current Vehicles-folder tuning to freshly spawned cars
		// so settings restored from localStorage (or changed mid-session
		// before this car existed) take effect immediately.
		if (worldEntity instanceof Car && this.params)
		{
			worldEntity.updateWheelProps('frictionSlip', this.params.Friction_Slip);
			worldEntity.updateWheelProps('suspensionStiffness', this.params.Suspension_Stiffness);
			worldEntity.updateWheelProps('maxSuspensionTravel', this.params.Max_Suspension);
			worldEntity.updateWheelProps('dampingCompression', this.params.Damping_Compression);
			worldEntity.updateWheelProps('dampingRelaxation', this.params.Damping_Relaxation);
			worldEntity.updateCarSpeed(this.params.Engine_Force);
		}
	}

	public registerUpdatable(registree: IUpdatable): void
	{
		this.updatables.push(registree);
		this.updatables.sort((a, b) => (a.updateOrder > b.updateOrder) ? 1 : -1);
	}

	public remove(worldEntity: IWorldEntity): void
	{
		worldEntity.removeFromWorld(this);
		this.unregisterUpdatable(worldEntity);
	}

	public unregisterUpdatable(registree: IUpdatable): void
	{
		_.pull(this.updatables, registree);
	}

	public loadScene(loadingManager: LoadingManager, gltf: any): void
	{
		gltf.scene.traverse((child) => {
			if (child.hasOwnProperty('userData'))
			{
				if (child.type === 'Mesh')
				{
					child.geometry = child.geometry.toNonIndexed();
					Utils.setupMeshProperties(child);
					this.sky.csm.setupMaterial(child.material);

					if (child.material.name === 'ocean' || child.material.name === 'ocean.001')
					{
						this.ocean = new Ocean(child, this);
						this.registerUpdatable(this.ocean);
					}

					// socketControl-style instanced grass field. Any mesh in
					// world.glb whose material is named 'grass' becomes a
					// shimmering 300k-blade lawn anchored at the mesh's
					// transform; the original mesh stays as the dark base.
					if (child.material.name === 'grass')
					{
						const grass = new Grass(child, this);
						this.add(grass);
					}

					// Inthenew's map tags the moon-surface mesh with name
					// 'Layer0_001' (an Adobe Illustrator export artifact).
					// Inthenew loaded an external Farmers Almanac photo here;
					// we use the DALL-E moon-with-flowers texture instead.
					if (child.name === 'Layer0_001')
					{
						const tex = new THREE.TextureLoader().load('src/img/moon-with-flowers.png');
						tex.colorSpace = THREE.SRGBColorSpace;
						child.material = new THREE.MeshBasicMaterial({ map: tex });
					}
				}

				if (child.userData.hasOwnProperty('data'))
				{
					if (child.userData.data === 'physics')
					{
						if (child.userData.hasOwnProperty('type')) 
						{
							//child.geometry = child.geometry.toNonIndexed();

							// Convex doesn't work! Stick to boxes!
							if (child.userData.type === 'box')
							{
								let phys = new BoxCollider({size: new THREE.Vector3(child.scale.x, child.scale.y, child.scale.z)});
								phys.body.position.copy(new CANNON.Vec3(child.position.x, child.position.y, child.position.z));
								phys.body.quaternion.copy(new CANNON.Quaternion(child.quaternion.x, child.quaternion.y, child.quaternion.z, child.quaternion.w));
								phys.body.updateAABB();

								phys.body.shapes.forEach((shape) => {
									shape.collisionFilterMask = ~CollisionGroups.TrimeshColliders;
								});

								//console.log("Box: ");
								//console.log(phys.body);

								this.physicsWorld.addBody(phys.body);
							}
							else if (child.userData.type === 'trimesh')
							{
								let phys = new TrimeshCollider(child, {});

								//console.log("TriMesh: ");
								//console.log(phys.body);

								this.physicsWorld.addBody(phys.body);
							}
							else if (child.userData.type === 'cylinder')
							{
								// socketControl-style cylinder shape. Authored
								// scale.x is read as radius, scale.y as height
								// (Sketchbook convention — empties are
								// uniformly scaled and rotated).
								const phys = new CylinderCollider({
									radius: child.scale.x,
									height: child.scale.y,
									segment: 12,
								});
								phys.body.position.copy(new CANNON.Vec3(child.position.x, child.position.y, child.position.z));
								phys.body.quaternion.copy(new CANNON.Quaternion(child.quaternion.x, child.quaternion.y, child.quaternion.z, child.quaternion.w));
								phys.body.updateAABB();
								phys.body.shapes.forEach((shape) => {
									shape.collisionFilterMask = ~CollisionGroups.TrimeshColliders;
								});
								this.physicsWorld.addBody(phys.body);
							}

							child.visible = false;
						}
					}

					if (child.userData.data === 'path')
					{
						this.paths.push(new Path(child));
					}

					if (child.userData.data === 'scenario')
					{
						this.scenarios.push(new Scenario(child, this));
					}

					// socketControl-style positional audio source. The map
					// marker carries the audio asset path; Speaker handles
					// the autoplay-policy gating so multiple sources start
					// together on the first user gesture.
					if (child.userData.data === 'speaker' && typeof child.userData.audio === 'string')
					{
						const sp = new Speaker(child.userData.audio, this);
						sp.position.copy(child.getWorldPosition(new THREE.Vector3()));
						this.add(sp);
					}
				}
			}
		});

		this.graphicsWorld.add(gltf.scene);

		// Map switcher in the Scenarios panel — sits below the scenario
		// list and reloads the page with the alternate world.glb. Default
		// (no localStorage entry) is the Inthenew map; the SocketControl
		// map is opt-in and persists across reloads.
		this.addMapSwitcher();

		// Hand-placed NPCs around the Inthenew default spawn — gives the
		// world some visible occupants without authoring markers in
		// Blender. Tied to the default scenario so they re-spawn alongside
		// it and get cleared on switch like other entities.
		this.injectDefaultSceneNPCs();

		// Launch default scenario
		let defaultScenarioID: string;
		for (const scenario of this.scenarios) {
			if (scenario.default) {
				defaultScenarioID = scenario.id;
				break;
			}
		}
		if (defaultScenarioID !== undefined) this.launchScenario(defaultScenarioID, loadingManager);
	}

	private addMapSwitcher(): void
	{
		// Default = Inthenew (v0.6). Five socketControl maps follow:
		// the two GLB-backed Sketchbook variants (v0.3 with grass material,
		// v0.4 with their full scenario set), plus four code-built test
		// sandboxes (test, test2, test3, example) that BaseScene
		// subclasses construct procedurally at runtime.
		const stored = localStorage.getItem('sketchbook.map');
		const choices: { [label: string]: string } = {
			'Inthenew (v0.6, default)': 'inthenew',
			'sketchbook v0.3 (socketControl)': 'sc-v03',
			'sketchbook v0.4 (socketControl)': 'sc-v04',
			'test (socketControl sandbox)': 'sc-test',
			'test2 (socketControl sandbox)': 'sc-test2',
			'test3 (socketControl sandbox)': 'sc-test3',
			'example (socketControl sandbox)': 'sc-example',
		};
		const validValues: string[] = [];
		for (const k in choices) validValues.push(choices[k]);
		this.params.Map = (stored !== null && validValues.indexOf(stored) !== -1) ? stored : 'inthenew';

		this.scenarioGUIFolder.add(this.params, 'Map', choices)
			.onChange((value: string) =>
			{
				localStorage.setItem('sketchbook.map', value);
				location.reload();
			});
	}

	private injectDefaultSceneNPCs(): void
	{
		// Only the Inthenew map has the Default-spawn layout these
		// coordinates were eyeballed against; SocketControl maps have
		// their own scene topology and don't get NPCs here.
		const stored = localStorage.getItem('sketchbook.map');
		if (stored && stored !== 'inthenew') return;

		const defaultScenario = this.scenarios.find((s) => s.id === 'default');
		if (defaultScenario === undefined) return;

		// Picked from poking around the Inthenew default spawn — a few
		// figures standing in a loose arc near the player spawn, plus one
		// further out so the world doesn't look empty after walking.
		const npcPositions: { x: number, y: number, z: number, faceX?: number, faceZ?: number }[] = [
			{ x: 5, y: 18, z: -5, faceX: -1, faceZ: 0 },
			{ x: -5, y: 18, z: -5, faceX: 1, faceZ: 0 },
			{ x: 0, y: 18, z: 1, faceX: 0, faceZ: -1 },
			{ x: -2, y: 18, z: -12, faceX: 0, faceZ: 1 },
		];

		for (const p of npcPositions)
		{
			const marker = new THREE.Object3D();
			marker.position.set(p.x, p.y, p.z);
			if (p.faceX !== undefined && p.faceZ !== undefined)
			{
				// Sketchbook's getForward reads the marker's local -Z;
				// orient the marker so its forward matches our desired
				// facing.
				marker.lookAt(p.x + p.faceX, p.y, p.z + p.faceZ);
			}
			defaultScenario.rootNode.add(marker);
			defaultScenario.spawnPoints.push(new NPCSpawnPoint(marker));
		}
	}

	public launchScenario(scenarioID: string, loadingManager?: LoadingManager): void
	{
		this.lastScenarioID = scenarioID;

		// Reset cross-scenario world state so a Shift+R from the moon or a
		// scenario switch with the planet menu open lands the player
		// cleanly back on Earth.
		this.onMoon = false;
		document.getElementById('planet-menu')?.classList.add('planet-menu-hidden');

		this.clearEntities();

		// Launch default scenario
		if (!loadingManager) loadingManager = new LoadingManager(this);
		for (const scenario of this.scenarios) {
			if (scenario.id === scenarioID || scenario.spawnAlways) {
				scenario.launch(loadingManager, this);
			}
		}
	}

	public restartScenario(): void
	{
		if (this.lastScenarioID !== undefined)
		{
			document.exitPointerLock();
			this.launchScenario(this.lastScenarioID);
		}
		else
		{
			console.warn('Can\'t restart scenario. Last scenarioID is undefined.');
		}
	}

	public clearEntities(): void
	{
		for (let i = 0; i < this.characters.length; i++) {
			this.remove(this.characters[i]);
			i--;
		}

		for (let i = 0; i < this.vehicles.length; i++) {
			this.remove(this.vehicles[i]);
			i--;
		}
	}

	public scrollTheTimeScale(scrollAmount: number): void
	{
		// Changing time scale with scroll wheel
		const timeScaleBottomLimit = 0.003;
		const timeScaleChangeSpeed = 1.3;
	
		if (scrollAmount > 0)
		{
			this.timeScaleTarget /= timeScaleChangeSpeed;
			if (this.timeScaleTarget < timeScaleBottomLimit) this.timeScaleTarget = 0;
		}
		else
		{
			this.timeScaleTarget *= timeScaleChangeSpeed;
			if (this.timeScaleTarget < timeScaleBottomLimit) this.timeScaleTarget = timeScaleBottomLimit;
			this.timeScaleTarget = Math.min(this.timeScaleTarget, 1);
		}
	}

	public toggleControlsOverlay(): void
	{
		const controls = document.getElementById('controls');
		if (!controls) return;
		controls.style.display = controls.style.display === 'none' ? '' : 'none';
	}

	public updateControls(controls: any): void
	{
		let html = '';
		html += '<h2 class="controls-title">Controls:</h2>';

		controls.forEach((row) =>
		{
			html += '<div class="ctrl-row">';
			row.keys.forEach((key) => {
				if (key === '+' || key === 'and' || key === 'or' || key === '&') html += '&nbsp;' + key + '&nbsp;';
				else html += '<span class="ctrl-key">' + key + '</span>';
			});

			html += '<span class="ctrl-desc">' + row.desc + '</span></div>';
		});

		document.getElementById('controls').innerHTML = html;
	}

	private generateHTML(): void
	{
		// Fonts
		const fontHrefs = [
			'https://fonts.googleapis.com/css2?family=Alfa+Slab+One&display=swap',
			'https://fonts.googleapis.com/css2?family=Solway:wght@400;500;700&display=swap',
			'https://fonts.googleapis.com/css2?family=Cutive+Mono&display=swap',
		];
		for (const href of fontHrefs)
		{
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = href;
			document.head.appendChild(link);
		}

		// Loader
		document.body.insertAdjacentHTML('beforeend', `
			<div id="loading-screen">
				<div id="loading-screen-background"></div>
				<h1 id="main-title" class="sb-font">Sketchbook 0.6</h1>
				<div class="cubeWrap">
					<div class="cube">
						<div class="faces1"></div>
						<div class="faces2"></div>
					</div>
				</div>
				<div id="loading-text">Loading...</div>
			</div>
		`);

		// UI
		document.body.insertAdjacentHTML('beforeend', `
			<div id="ui-container" style="display: none;">
				<div class="github-corner">
					<a href="https://github.com/swift502/Sketchbook" target="_blank" title="Fork me on GitHub">
						<svg viewbox="0 0 100 100" fill="currentColor">
							<title>Fork me on GitHub</title>
							<path d="M0 0v100h100V0H0zm60 70.2h.2c1 2.7.3 4.7 0 5.2 1.4 1.4 2 3 2 5.2 0 7.4-4.4 9-8.7 9.5.7.7 1.3 2
							1.3 3.7V99c0 .5 1.4 1 1.4 1H44s1.2-.5 1.2-1v-3.8c-3.5 1.4-5.2-.8-5.2-.8-1.5-2-3-2-3-2-2-.5-.2-1-.2-1
							2-.7 3.5.8 3.5.8 2 1.7 4 1 5 .3.2-1.2.7-2 1.2-2.4-4.3-.4-8.8-2-8.8-9.4 0-2 .7-4 2-5.2-.2-.5-1-2.5.2-5
							0 0 1.5-.6 5.2 1.8 1.5-.4 3.2-.6 4.8-.6 1.6 0 3.3.2 4.8.7 2.8-2 4.4-2 5-2z"></path>
						</svg>
					</a>
				</div>
				<div class="left-panel">
					<div id="controls" class="panel-segment flex-bottom"></div>
				</div>
			</div>
		`);

		// Planet selection modal (Inthenew/Sketchbook). RocketShip flips
		// 'planet-menu-hidden' off once the liftoff sequence reaches
		// apogee, then handles clicks via addEventListener (Inthenew used
		// jQuery here, we do it in vanilla DOM during construction).
		document.body.insertAdjacentHTML('beforeend', `
			<div id="planet-menu" class="planet-menu-hidden">
				<h1 class="planet-heading">Which planet do you want to go to?</h1>
				<div class="planet-item" id="earth">
					<img src="src/img/hemisphere-earth.png" alt="Earth">
					<p>Earth</p>
				</div>
				<div class="planet-item" id="moon">
					<img src="src/img/full-moon.png" alt="Moon">
					<p>Moon</p>
				</div>
			</div>
		`);

		// Canvas
		document.body.appendChild(this.renderer.domElement);
		this.renderer.domElement.id = 'canvas';
	}

	private createParamsGUI(scope: World): void
	{
		this.params = {
			Pointer_Lock: true,
			Mouse_Sensitivity: 0.3,
			Time_Scale: 1,
			Shadows: true,
			FXAA: true,
			Debug_Physics: false,
			Debug_FPS: false,
			Sun_Elevation: 50,
			Sun_Rotation: 145,
			Has_Day_Night_Cycle: false,
			Has_Night_Time: false,
			Gravity_Scale: 1,
			Free_Cam_Speed: 25,
			// Per-car raycast-vehicle tunables (defaults from Inthenew).
			Friction_Slip: 0.8,
			Suspension_Stiffness: 20,
			Max_Suspension: 1,
			Damping_Compression: 2,
			Damping_Relaxation: 2,
			Engine_Force: 10,
		};

		const gui = new GUI();

		// Scenario
		this.scenarioGUIFolder = gui.addFolder('Scenarios');
		this.scenarioGUIFolder.open();

		// World
		let worldFolder = gui.addFolder('World');
		worldFolder.add(this.params, 'Time_Scale', 0, 1).listen()
			.onChange((value) =>
			{
				scope.timeScaleTarget = value;
			});
		worldFolder.add(this.params, 'Sun_Elevation', 0, 180).listen()
			.onChange((value) =>
			{
				scope.sky.phi = value;
			});
		worldFolder.add(this.params, 'Sun_Rotation', 0, 360).listen()
			.onChange((value) =>
			{
				scope.sky.theta = value;
			});
		worldFolder.add(this.params, 'Has_Day_Night_Cycle').listen()
			.onChange((value) =>
			{
				scope.params.Has_Day_Night_Cycle = value;
			});
		worldFolder.add(this.params, 'Has_Night_Time').listen()
			.onChange((value) =>
			{
				scope.params.Has_Night_Time = value;
			});
		// Gravity_Scale 0..2 lets the player toggle between zero-g and
		// double-g without rebuilding. updatePhysics reads params.Gravity_Scale
		// every step so this takes effect immediately.
		worldFolder.add(this.params, 'Gravity_Scale', 0, 2);
		// Free_Cam_Speed is read by CameraOperator when in free-cam mode.
		worldFolder.add(this.params, 'Free_Cam_Speed', 1, 100);

		// Per-car raycast-vehicle tuning (ported from Inthenew). Each
		// slider's onChange iterates the spawned cars and pushes the new
		// value into their cannon wheelInfos / engine factor. Defaults
		// match the constants the cars are constructed with.
		const vehiclesFolder = gui.addFolder('Vehicles');
		const applyToAllCars = (property: string, value: number, asEngineForce = false) =>
		{
			for (const v of scope.vehicles)
			{
				if (v instanceof Car)
				{
					if (asEngineForce) v.updateCarSpeed(value);
					else v.updateWheelProps(property, value);
				}
			}
		};
		vehiclesFolder.add(this.params, 'Friction_Slip', 0, 5)
			.onChange((v) => applyToAllCars('frictionSlip', v));
		vehiclesFolder.add(this.params, 'Suspension_Stiffness', 0, 100)
			.onChange((v) => applyToAllCars('suspensionStiffness', v));
		vehiclesFolder.add(this.params, 'Max_Suspension', 0, 5)
			.onChange((v) => applyToAllCars('maxSuspensionTravel', v));
		vehiclesFolder.add(this.params, 'Damping_Compression', 0, 10)
			.onChange((v) => applyToAllCars('dampingCompression', v));
		vehiclesFolder.add(this.params, 'Damping_Relaxation', 0, 10)
			.onChange((v) => applyToAllCars('dampingRelaxation', v));
		vehiclesFolder.add(this.params, 'Engine_Force', 1, 50)
			.onChange((v) => applyToAllCars('', v, true));

		// Input
		let settingsFolder = gui.addFolder('Settings');
		settingsFolder.add(this.params, 'FXAA');
		settingsFolder.add(this.params, 'Shadows')
			.onChange((enabled) =>
			{
				if (enabled)
				{
					this.sky.csm.lights.forEach((light) => {
						light.castShadow = true;
					});
				}
				else
				{
					this.sky.csm.lights.forEach((light) => {
						light.castShadow = false;
					});
				}
			});
		settingsFolder.add(this.params, 'Pointer_Lock')
			.onChange((enabled) =>
			{
				scope.inputManager.setPointerLock(enabled);
			});
		settingsFolder.add(this.params, 'Mouse_Sensitivity', 0, 1)
			.onChange((value) =>
			{
				scope.cameraOperator.setSensitivity(value, value * 0.8);
			});
		settingsFolder.add(this.params, 'Debug_Physics')
			.onChange((enabled) =>
			{
				if (enabled)
				{
					// cannon-es-debugger adds meshes to the scene as the physics
					// world changes but does not expose a cleanup method. Track
					// them via onInit so we can remove them again when the user
					// turns debug rendering back off.
					this.cannonDebugMeshes = [];
					this.cannonDebugRenderer = CannonDebugger(
						this.graphicsWorld,
						this.physicsWorld,
						{
							onInit: (_body, mesh) => this.cannonDebugMeshes.push(mesh),
						},
					);
				}
				else
				{
					for (const mesh of this.cannonDebugMeshes)
					{
						this.graphicsWorld.remove(mesh);
					}
					this.cannonDebugMeshes = [];
					this.cannonDebugRenderer = undefined;
				}

				scope.characters.forEach((char) =>
				{
					char.raycastBox.visible = enabled;
				});
			});
		settingsFolder.add(this.params, 'Debug_FPS')
			.onChange((enabled) =>
			{
				UIManager.setFPSVisible(enabled);
			});

		// Settings persistence (ported from Inthenew/Sketchbook).
		// Snapshot defaults before restoring so Reset_World_Settings can
		// fall back to them. lil-gui's controller.load() triggers onChange
		// internally, so all side effects (sky.phi, shadows, sensitivity,
		// ...) reapply automatically when the saved state is loaded.
		const SETTINGS_KEY = 'sketchbook-settings';
		const defaultWorldState = worldFolder.save();
		const persist = () =>
		{
			localStorage.setItem(SETTINGS_KEY, JSON.stringify(gui.save()));
		};

		const savedSettings = localStorage.getItem(SETTINGS_KEY);
		if (savedSettings)
		{
			try
			{
				gui.load(JSON.parse(savedSettings));
			}
			catch (e)
			{
				console.warn('[Sketchbook] Failed to load saved settings:', e);
				localStorage.removeItem(SETTINGS_KEY);
			}
		}

		gui.onFinishChange(persist);

		worldFolder.add({
			Reset_World_Settings: () =>
			{
				worldFolder.load(defaultWorldState);
				persist();
			},
		}, 'Reset_World_Settings');

		gui.open();
	}
}