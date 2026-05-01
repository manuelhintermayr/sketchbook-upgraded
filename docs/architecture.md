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
│  World (src/ts/world/World.ts)                                  │
│    renderer • physicsWorld • graphicsWorld • camera             │
│    LoadingManager • InputManager • CameraOperator               │
│    Sky • Ocean • Grass • Speakers                               │
│    PauseMenu • SettingsModal • DialogBox singleton              │
│    scenarios[] • paths[] • characters[] • vehicles[]            │
│    updatables[] (sorted by IUpdatable.updateOrder)              │
│    audioListener • gui (lil-gui)                                │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Per-frame loop                                                 │
│    requestAnimationFrame → render(world)                        │
│      update(timeStep)  →  for each updatables: u.update()       │
│      composer.render() / renderer.render()                      │
│      labelRenderer.render()  ← CSS2D name tags                  │
└─────────────────────────────────────────────────────────────────┘
```

## Update order (lower runs first)

| Order | Class |
|---:|---|
| 3 | `InputManager` — drains mouse/keyboard buffers, dispatches to receiver |
| 4 | `CameraOperator` — orbit/free-cam input, position lerp |
| 5 | `Sky` — sun position, day/night cycle, CSM frustum sync |
| 5 | `ShapeEntity` — copies CANNON interpolated transform onto its mesh |
| 6 | `RaceContent` — per-frame plane crossings against checkpoints |
| 10 | `Character`, `Vehicle` — physics step, state-machine update, control input |
| 10 | `Ocean` — wave shader uniforms, normal-map scroll |
| 10 | `Grass` — shader time uniform, player-position uniform for windshield bend |
| 11 | `Speaker` — currently a no-op (audio runs from THREE itself) |
| 12 | `TriggerCube` — AABB containment check vs. player |
| 13 | `ProximityPrompt` — no-op (relies on TriggerCube + keydown) |

`updateOrder` is the IUpdatable contract; lil-gui's onChange handlers and Scenario.launch don't run inside this loop.

## World construction sequence

```
Sketchbook.World(scenePath)
  ├─ generateHTML()        ← injects #loading-screen, #ui-container, #planet-menu
  ├─ initStats()
  ├─ createParamsGUI()     ← lil-gui panel + scenarioGUIFolder
  ├─ new PauseMenu(this)   ← Esc handler installed but disabled
  ├─ new SettingsModal(this)
  ├─ new InputManager / CameraOperator / Sky / etc
  └─ if scenePath:
        loadingManager = new LoadingManager(this)
        loadingManager.onFinishedCallback = () => Swal.fire("Welcome…").then(() => {
            UIManager.setUserInterfaceVisible(true)
            pauseMenu.enable()              ← Esc now works
        })
        if string: loadingManager.loadGLTF(path, gltf => loadScene(gltf))
        else (BaseScene): loadScene({scene: instance.scene})
```

`loadScene(gltf)` walks every node, branches on `userData`, and registers entities. After parsing, it adds the map switcher entry to the Scenarios folder and calls `injectDefaultSceneNPCs()` (which programmatically adds Anna/Ben/Carla/Dieter on the Inthenew map).

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

- `THREE.WebGLRenderer` with PCF shadows, ACES tone mapping, dpi from `window.devicePixelRatio`.
- `EffectComposer` with `RenderPass` + `FXAAShader` (toggle via `params.FXAA`).
- `CSM` (cascaded shadow maps from three.js examples) attached to `Sky`. `csm.setupMaterial(child.material)` is called for every loaded mesh during `loadScene`.
- `CSS2DRenderer` runs after the WebGL render to project name-tag divs above their world-space anchor. Lives at `world.labelRenderer`, has its own absolutely-positioned overlay div with `pointer-events: none`.

## Audio

- `THREE.AudioListener` is attached lazily to `world.camera` the first time a `Speaker` is constructed. Stored at `world.audioListener` so `SettingsModal` can call `setMasterVolume(v / 100)`.
- `Speaker` builds an HTML `<audio>` element, wraps it in `THREE.PositionalAudio.setMediaElementSource(el)`, attaches to its own Object3D in the scene.
- Browser autoplay-policy gating: every Speaker that fails to autoplay registers itself on a static queue; a single `pointerdown`/`keydown` listener on `window` (set up by Speaker, but in practice the title-screen gesture satisfies it) plays everything queued.

## UI shell (May 2026 ui-system pass)

| Component | File | Open / close trigger |
|---|---|---|
| TitleScreen | `src/ts/world/TitleScreen.ts` | Shown by index.html before `new World()`; resolves on first user gesture |
| Loading bar | `src/ts/core/UIManager.ts` (`setLoadingProgress`) | Driven by `LoadingManager` per `xhr.progress` and `doneLoading` |
| PauseMenu | `src/ts/world/PauseMenu.ts` | Esc (after `enable()`); buttons: Resume, Settings, Restart, Reload |
| SettingsModal | `src/ts/world/SettingsModal.ts` | PauseMenu → Settings; writes through lil-gui controllers |
| DialogBox | `src/ts/world/DialogBox.ts` | Singleton; opened by `ProximityPrompt` when `dialog` param is set |
| ErrorOverlay | `src/ts/world/ErrorOverlay.ts` | `window.onerror` + `unhandledrejection` (installed by index.html) |
| NameLabel | `src/ts/world/NameLabel.ts` | `attachNameLabel(character, name, isPlayer)` from spawn points |

All overlays are `position: fixed; z-index: var(--z-modal)` (or higher for `--z-toast` = error). Tokens in `src/css/modules/tokens.css`. Dark mode swap via `class="dark"` on `<html>`.

## Persistence

- `localStorage['Sketchbook_Settings_v1']` (or similar) — full lil-gui state via `gui.save()`/`gui.load()`. Restored on World construction; persisted on every change via `gui.onFinishChange`.
- `localStorage['sketchbook.map']` — selected map id. Read by `index.html` before constructing World; written by the Scenarios-panel map dropdown.

## Sandbox scenes (BaseScene subclasses)

`src/ts/world/sandboxes/BaseScene.ts` is an abstract class with a `THREE.Scene` and three vehicle-mesh slots (kept for upstream compat — Sketchbook always loads vehicles from `.glb`, so the slots are unused). Subclasses (`TestScene`, `Test2Scene`, `Test3Scene`, `Example`) populate `this.scene` with meshes carrying the same userData markers as a `.glb`. `World` accepts either a string `.glb` path or a `BaseScene` instance — the latter is wrapped in a `{scene: …}` fake-GLTF and runs through the same `loadScene` path.

## Map switcher

`World.addMapSwitcher()` (called from `loadScene`) adds a `Map` dropdown to the Scenarios folder with seven options: Inthenew (default), `sc-v03`, `sc-v04`, `sc-test`, `sc-test2`, `sc-test3`, `sc-example`. Selecting writes to `localStorage['sketchbook.map']` and reloads the page. `index.html` reads the value on next load and dispatches to either `glbPaths[…]` or `new sceneClasses[…]()`.
