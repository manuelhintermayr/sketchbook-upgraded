import GUI from 'lil-gui';
import CannonDebugger from 'cannon-es-debugger';

import { World } from '../World';
import { UIManager } from '../../core/UIManager';
import { Car } from '../../vehicles/Car';

// Builds the lil-gui debug panel and the params object that backs it.
// All onChange wiring lives here so that callers (SettingsModal, the
// pause-menu Settings card) can route writes through the matching
// controller's setValue() and inherit the side effects for free —
// CSM enable/disable, pointer-lock toggling, mouse sensitivity push
// to CameraOperator, etc.
//
// Persistence: the entire gui state snapshot serializes into
// localStorage('sketchbook-settings') on every onFinishChange and
// reloads on construction. lil-gui's gui.load() triggers each
// controller's onChange, so the side effects reapply automatically
// without a manual replay loop.
//
// Side effects assigned to world by the time this returns:
//   - world.params         the source-of-truth value bag
//   - world.gui            the lil-gui root
//   - world.scenarioGUIFolder  the open Scenarios folder Scenario.launch
//                              and the map switcher add into
export function createParamsGUI(world: World): void
{
	world.params = {
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
		// Audio mix — Master applies to all positional sources via the
		// shared THREE.AudioListener attached to the camera; the others
		// are reserved for future per-bus routing (currently no SFX/
		// music separation in the engine).
		Master_Volume: 80,
		Music_Volume: 60,
		SFX_Volume: 75,
		Camera_Shake: true,
		Engine_Sound: true,
		Ambient_Sound: true,
		Outlines: false,
		Bloom: false,
		Depth_Of_Field: false,
		Animal_Labels: false,
	};

	const gui = new GUI();
	world.gui = gui;

	// Scenario
	world.scenarioGUIFolder = gui.addFolder('Scenarios');
	world.scenarioGUIFolder.open();

	// World
	const worldFolder = gui.addFolder('World');
	worldFolder.add(world.params, 'Time_Scale', 0, 1).listen()
		.onChange((value) =>
		{
			world.timeScaleTarget = value;
		});
	worldFolder.add(world.params, 'Sun_Elevation', 0, 180).listen()
		.onChange((value) =>
		{
			world.sky.phi = value;
		});
	worldFolder.add(world.params, 'Sun_Rotation', 0, 360).listen()
		.onChange((value) =>
		{
			world.sky.theta = value;
		});
	worldFolder.add(world.params, 'Has_Day_Night_Cycle').listen()
		.onChange((value) =>
		{
			world.params.Has_Day_Night_Cycle = value;
		});
	worldFolder.add(world.params, 'Has_Night_Time').listen()
		.onChange((value) =>
		{
			world.params.Has_Night_Time = value;
		});
	// Gravity_Scale 0..2 lets the player toggle between zero-g and
	// double-g without rebuilding. updatePhysics reads
	// params.Gravity_Scale every step so this takes effect immediately.
	worldFolder.add(world.params, 'Gravity_Scale', 0, 2);
	// Free_Cam_Speed is read by CameraOperator when in free-cam mode.
	worldFolder.add(world.params, 'Free_Cam_Speed', 1, 100);

	// Per-car raycast-vehicle tuning (ported from Inthenew). Each
	// slider's onChange iterates the spawned cars and pushes the new
	// value into their cannon wheelInfos / engine factor. Defaults
	// match the constants the cars are constructed with.
	const vehiclesFolder = gui.addFolder('Vehicles');
	const applyToAllCars = (property: string, value: number, asEngineForce = false) =>
	{
		for (const v of world.vehicles)
		{
			if (v instanceof Car)
			{
				if (asEngineForce) v.updateCarSpeed(value);
				else v.updateWheelProps(property, value);
			}
		}
	};
	vehiclesFolder.add(world.params, 'Friction_Slip', 0, 5)
		.onChange((v) => applyToAllCars('frictionSlip', v));
	vehiclesFolder.add(world.params, 'Suspension_Stiffness', 0, 100)
		.onChange((v) => applyToAllCars('suspensionStiffness', v));
	vehiclesFolder.add(world.params, 'Max_Suspension', 0, 5)
		.onChange((v) => applyToAllCars('maxSuspensionTravel', v));
	vehiclesFolder.add(world.params, 'Damping_Compression', 0, 10)
		.onChange((v) => applyToAllCars('dampingCompression', v));
	vehiclesFolder.add(world.params, 'Damping_Relaxation', 0, 10)
		.onChange((v) => applyToAllCars('dampingRelaxation', v));
	vehiclesFolder.add(world.params, 'Engine_Force', 1, 50)
		.onChange((v) => applyToAllCars('', v, true));

	// Input
	const settingsFolder = gui.addFolder('Settings');
	settingsFolder.add(world.params, 'FXAA');
	settingsFolder.add(world.params, 'Shadows')
		.onChange((enabled) =>
		{
			world.sky.csm.lights.forEach((light) =>
			{
				light.castShadow = !!enabled;
			});
		});
	settingsFolder.add(world.params, 'Pointer_Lock')
		.onChange((enabled) =>
		{
			world.inputManager.setPointerLock(enabled);
		});
	settingsFolder.add(world.params, 'Mouse_Sensitivity', 0, 1)
		.onChange((value) =>
		{
			world.cameraOperator.setSensitivity(value, value * 0.8);
		});
	settingsFolder.add(world.params, 'Debug_Physics')
		.onChange((enabled) =>
		{
			if (enabled)
			{
				// cannon-es-debugger adds meshes to the scene as the physics
				// world changes but does not expose a cleanup method. Track
				// them via onInit so we can remove them again when the user
				// turns debug rendering back off.
				world.cannonDebugMeshes = [];
				world.cannonDebugRenderer = CannonDebugger(
					world.graphicsWorld,
					world.physicsWorld,
					{
						onInit: (_body, mesh) => world.cannonDebugMeshes.push(mesh),
					},
				);
			}
			else
			{
				for (const mesh of world.cannonDebugMeshes)
				{
					world.graphicsWorld.remove(mesh);
				}
				world.cannonDebugMeshes = [];
				world.cannonDebugRenderer = undefined;
			}

			world.characters.forEach((char) =>
			{
				char.raycastBox.visible = enabled;
			});
		});
	settingsFolder.add(world.params, 'Debug_FPS')
		.onChange((enabled) =>
		{
			UIManager.setFPSVisible(enabled);
		});
	settingsFolder.add(world.params, 'Camera_Shake');
	settingsFolder.add(world.params, 'Engine_Sound');
	settingsFolder.add(world.params, 'Ambient_Sound');
	settingsFolder.add(world.params, 'Outlines');
	settingsFolder.add(world.params, 'Bloom');
	settingsFolder.add(world.params, 'Depth_Of_Field');
	settingsFolder.add(world.params, 'Animal_Labels');

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
