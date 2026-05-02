# Architecture

In-depth notes on how the engine is wired together. Pair with `CLAUDE.md` / `context.md` for the high-level orientation, and with `git log` for *why*.

## Module layers

```
┌─────────────────────────────────────────────────────────────────┐
│  index.html                                                     │
│    Sketchbook.installErrorOverlay()                             │
│    Sketchbook.showTitleScreen() → Sketchbook.World(scenePath)   │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  World (src/ts/world/World.ts, ~636 LOC)                        │
│    renderer • composer • labelRenderer • camera • graphicsWorld │
│    physicsWorld • bloomPass • bokehPass • outlineEffect         │
│    LoadingManager • InputManager • CameraOperator • CameraShake │
│    Sky • ambientSound • worldLabels                             │
│    PauseMenu • SettingsModal • DialogBox singleton              │
│    scenarios[] • paths[] • characters[] • vehicles[]            │
│    updatables[] (sorted by IUpdatable.updateOrder)              │
│    audioListener • gui (lil-gui)                                │
│                                                                 │
│  Heavy setup is in helpers (called from constructor):           │
│    setup/RendererPipeline   — renderer + composer + post-FX     │
│    setup/HTMLBootstrap      — DOM scaffolding                   │
│    setup/ParamsGUI          — lil-gui panel + persistence       │
│    setup/MapSwitcher        — Scenarios-folder map dropdown     │
│    setup/DefaultNPCInjector — Anna/Ben/Carla/Dieter             │
│    setup/AnimalInjector     — wandering dogs/cats               │
│    loading/SceneLoader      — GLTF userData dispatcher          │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Per-frame loop                                                 │
│    requestAnimationFrame → render(world)                        │
│      update(timeStep)  →  for each updatables: u.update()       │
│      composer.render() / renderer.render()                      │
│      outlineEffect.renderPass()  ← if params.Outlines           │
│      labelRenderer.render()  ← CSS2D name tags                  │
└─────────────────────────────────────────────────────────────────┘
```

## Update order (lower runs first)

Slot constants are defined in `src/ts/enums/UpdateOrder.ts`. Each slot is spaced by 10 so a new entry can squeeze between two existing ones without renumbering everything.

| Slot (value) | Class(es) |
|---|---|
| `CharacterPhysics` (10) | `Character` — physics step, state-machine update, control input |
| `VehiclePhysics` (20) | `Vehicle` — physics step, control input, hard-landing detection, stuck-recovery |
| `Input` (30) | `InputManager` — drains mouse/keyboard buffers, dispatches to receiver. `InfoStack` shares the slot |
| `Camera` (40) | `CameraOperator` — orbit/free-cam input, position lerp |
| `Environment` (50) | `Sky` — sun position, day/night cycle, CSM frustum sync. `ShapeEntity` shares the slot |
| `Scenarios` (60) | `RaceContent` — per-frame plane crossings against checkpoints |
| `World` (100) | `Grass` (shader time / player-position uniforms), `Ocean` (wave / normal-map), `WanderingAnimals` (state machine + position lerp) |
| `Audio` (110) | `ProceduralAudio` (engine + ambient) — master-volume sync, oscillator parameter modulation; `Speaker` shares the slot |
| `Triggers` (120) | `TriggerCube` — AABB containment check vs. player |
| `Prompts` (130) | `ProximityPrompt` — no-op per frame (relies on TriggerCube + keydown) |
| `Labels` (140) | `WorldLabels` — distance-cull CSS2D name tags |
| `PostCamera` (150) | `CameraShake` — adds transient camera-position offset after CameraOperator finalises the frame's camera |

`updateOrder` is the IUpdatable contract; lil-gui's onChange handlers and Scenario.launch don't run inside this loop.

## World construction sequence

```
Sketchbook.World(scenePath)
  ├─ setupRendererPipeline(this)  ← renderer + composer + FXAA/Bloom/DoF + resize
  ├─ bootstrapHTML(this)          ← injects #loading-screen, #ui-container, #planet-menu, canvas
  ├─ initStats()
  ├─ createParamsGUI(this)        ← lil-gui panel + scenarioGUIFolder + persistence
  ├─ new PauseMenu(this)          ← Esc handler installed but disabled
  ├─ new SettingsModal(this)
  ├─ new InputManager / CameraOperator / Sky / CameraShake / OutlineEffect /
  │    AmbientSound / WorldLabels
  └─ if scenePath:
        loadingManager = new LoadingManager(this)
        loadingManager.onFinishedCallback = () => Swal.fire("Welcome…").then(() => {
            UIManager.setUserInterfaceVisible(true)
            pauseMenu.enable()              ← Esc now works
        })
        if string: loadingManager.loadGLTF(path, gltf => loadScene(this, lm, gltf))
        else (BaseScene): loadScene(this, lm, {scene: instance.scene})
```

`loadScene(world, lm, gltf)` (in `src/ts/world/loading/SceneLoader.ts`) walks every node, branches on `userData`, and registers entities. After parsing, it calls `addMapSwitcher(world)`, `injectDefaultSceneNPCs(world)` (programmatically adds Anna/Ben/Carla/Dieter on the Inthenew map), and `injectWanderingAnimals(world)` (8 dogs + 10 cats), then launches the default scenario.

## Lifecycle interfaces

```
IUpdatable           updateOrder: number
                     update(timeStep, unscaledTimeStep): void

IWorldEntity         extends IUpdatable
                     entityType: EntityType
                     addToWorld(world): void
                     removeFromWorld(world): void

ISpawnPoint          spawn(loadingManager, world): void

ICollider            options: any
                     body: CANNON.Body
```

`world.add(entity)` calls `addToWorld` and `registerUpdatable`. `world.remove(entity)` does the inverse.

## State machines

- **Character** — `src/ts/characters/character_states/`. ~25 states (Idle, Walk, Sprint, JumpIdle, JumpRunning, Falling, DropIdle, DropRunning, DropRolling, EndWalk, IdleRotateLeft/Right, StartWalk*, EnteringVehicle, Driving, ExitingVehicle, etc.). State changes via `character.setState(new Walk(this))`. Each state has `onInputChange()` and `update()`.
- **Vehicle entry** — `VehicleEntryInstance` orchestrates the multi-frame walk-up + door-open + sit sequence.
- **AI behaviours** — `RandomBehaviour`, `FollowTarget`, `FollowPath`. Set via `character.setBehaviour(new FollowPath(node, speed))`. Behaviours mutate `character.viewVector` etc; the same state machine renders them.

## Physics

- One `CANNON.World` per `World`. Gravity scaled by `params.Gravity_Scale` (lunar mode = 1.62 m/s²).
- `physicsFrameRate = 60`, fixed `physicsFrameTime = 1/60`. Substeps via `world.step(...)` inside `World.update()`.
- Collision groups in `enums/CollisionGroups.ts`. The most-used pattern: `~CollisionGroups.TrimeshColliders` so dynamic primitives don't catch on static meshes' edges.
- `CannonDebugRenderer` is wired (toggle via `params.Debug_Physics`).

## Rendering pipeline

Setup lives in `src/ts/world/setup/RendererPipeline.ts` and is called once from `World`'s constructor. Per-frame work runs from `World.render`.

- `THREE.WebGLRenderer` with PCF shadows, ACES tone mapping, `pixelRatio` capped at 2 (`Math.min(window.devicePixelRatio, 2)`).
- `EffectComposer` chain in order: `RenderPass` → `FXAAShader` → `UnrealBloomPass` → `BokehPass`. Bloom and DoF default to `enabled = false` so toggling them at runtime never has to rebuild the composer.
- `OutlineEffect` (in `src/ts/world/OutlineEffect.ts`) runs *after* the composer. Two-pass: depth pre-pass into a `HalfFloatType` render target via `MeshDepthMaterial` override (skips `RenderLayer.OutlineSkip` — sky / stars / earth / moon / grass / ocean), then a Sobel-edge fullscreen quad with a scale-invariant ratio threshold.
- `CSM` (cascaded shadow maps from three.js examples) attached to `Sky` with `shadowMapSize: 1024` × 3 cascades. `csm.setupMaterial(child.material)` is called for every loaded mesh during `loadScene`.
- `CSS2DRenderer` runs after the outline pass to project name-tag divs above their world-space anchor. Lives at `world.labelRenderer`, has its own absolutely-positioned overlay div with `pointer-events: none`. Distance culling is centralised through `WorldLabels` in `src/ts/world/ui/WorldLabels.ts`.
- GPU shader pre-compile: `LoadingManager.doneLoading` awaits `renderer.compileAsync(scene, camera)` before lifting the loading screen, so the first time the player turns toward an as-yet-unrendered asset doesn't stall the frame for shader compilation.

## Audio

All audio modules live in `src/ts/world/audio/` and share a single `THREE.AudioContext.getContext()` so the browser's ~6-context limit is never an issue, regardless of vehicle count.

- `ProceduralAudio` is the abstract base. Subclasses provide `shouldPlay()`, `buildSynth()`, `teardownSynth()`, `updateSynth()`. The base handles the master-gain ramp, lazy AudioContext acquisition, and the lifecycle so each subclass focuses on the oscillator graph.
- `EngineSound` (per-Vehicle) has 5 timbre profiles (car / heli / airplane / boat / rocket) selected via `vehicle.engineSoundProfile`. RPM is modulated by chassis speed.
- `AmbientSound` is the world-level wind / bird-chirp / water synth, with proximity-gated water gain (only audible near the ocean).
- `Speaker` is the map-driven 3D positional audio source — built from a `userData.data='speaker'` marker. It builds an HTML `<audio>` element, wraps it in `THREE.PositionalAudio.setMediaElementSource(el)`, attaches to its own Object3D in the scene.
- `THREE.AudioListener` is attached lazily to `world.camera` the first time a `Speaker` is constructed. Stored at `world.audioListener` so `SettingsModal` can call `setMasterVolume(v / 100)`.
- Browser autoplay-policy gating: every Speaker that fails to autoplay registers itself on a static queue; a single `pointerdown`/`keydown` listener on `window` plays everything queued. The queue cleans up on `removeFromWorld` so scenario switches before the first gesture don't leak references.

## UI shell (May 2026 ui-system pass)

All overlay files live under `src/ts/world/ui/` (moved there in the 0.8.0 reorganisation).

| Component | File | Open / close trigger |
|---|---|---|
| TitleScreen | `src/ts/world/ui/TitleScreen.ts` | Shown by index.html before `new World()`; resolves on first user gesture |
| Loading bar | `src/ts/core/UIManager.ts` (`setLoadingProgress`) | Driven by `LoadingManager` per `xhr.progress` and `doneLoading` |
| PauseMenu | `src/ts/world/ui/PauseMenu.ts` | Esc (after `enable()`); buttons: Resume, Settings, Restart, Reload |
| SettingsModal | `src/ts/world/ui/SettingsModal.ts` | PauseMenu → Settings; writes through lil-gui controllers (cached as a Map for O(1) lookup) |
| DialogBox | `src/ts/world/ui/DialogBox.ts` | Singleton; opened by `ProximityPrompt` when `dialog` param is set |
| IrisTransition | `src/ts/world/ui/IrisTransition.ts` | Singleton CSS clip-path wipe — used for map switches and scenario restarts |
| ErrorOverlay | `src/ts/world/ui/ErrorOverlay.ts` | `window.onerror` + `unhandledrejection` (installed by index.html) |
| NameLabel | `src/ts/world/ui/NameLabel.ts` | `attachNameLabel(character, name, isPlayer)` from spawn points |
| WorldLabels | `src/ts/world/ui/WorldLabels.ts` | Distance-culling registry on top of CSS2DRenderer; `attachNameLabel` goes through it |

All overlays are `position: fixed; z-index: var(--z-modal)` (or higher for `--z-toast` = error). Tokens in `src/css/modules/tokens.css`. Dark mode swap via `class="dark"` on `<html>`.

## Persistence

- `localStorage['sketchbook-settings']` — full lil-gui state via `gui.save()` / `gui.load()`. Restored on World construction (in `setup/ParamsGUI.ts`); persisted on every change via `gui.onFinishChange`.
- `localStorage['sketchbook.map']` — selected map id. Read by `index.html` before constructing World; written by the Scenarios-panel map dropdown (`setup/MapSwitcher.ts`).
- `localStorage['sketchbook.locale']` — selected language (en / de / es). Set by the title-screen language picker; read by `i18n` on module load.

## Sandbox scenes (BaseScene subclasses)

`src/ts/world/sandboxes/BaseScene.ts` is an abstract class with a `THREE.Scene` and three vehicle-mesh slots (kept for upstream compat — Sketchbook always loads vehicles from `.glb`, so the slots are unused). Subclasses (`TestScene`, `Test2Scene`, `Test3Scene`, `Example`) populate `this.scene` with meshes carrying the same userData markers as a `.glb`. `World` accepts either a string `.glb` path or a `BaseScene` instance — the latter is wrapped in a `{scene: …}` fake-GLTF and runs through the same `loadScene` path.

## Map switcher

`addMapSwitcher(world)` (in `src/ts/world/setup/MapSwitcher.ts`, called from `loadScene`) adds a `Map` dropdown to the Scenarios folder with seven options: Inthenew (default), `sc-v03`, `sc-v04`, `sc-test`, `sc-test2`, `sc-test3`, `sc-example`. Selecting writes to `localStorage['sketchbook.map']` and reloads the page (covered by an iris-wipe transition). `index.html` reads the value on next load and dispatches to either `glbPaths[…]` or `new sceneClasses[…]()`.
