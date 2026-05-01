# CLAUDE.md — Claude Code memory for sketchbook-upgraded

This file is loaded automatically by [Claude Code](https://claude.com/claude-code) at the start of every session in this repository. Keep it concise and current — re-read it before assuming anything.

## What this repo is

A maintained extension of [swift502/Sketchbook](https://github.com/swift502/Sketchbook) — a small web-based 3D game engine on three.js + cannon-es with third-person controls, vehicles, scripted scenarios. Curated features from later community forks (Inthenew, socketControl, Notblox, benhatsor) are merged in. See `README.md` for the full timeline.

Status: actively developed on branch `claude/external-features` (May 2026). Latest baseline: `e097071` (UI design system).

## Build / run / lint

```bash
npm install               # once
npm run build             # bundles build/sketchbook.min.js — required before first dev
npm run dev               # webpack-dev-server at http://localhost:8080
npm run lint              # ESLint over src/ts
npx tsc --noEmit          # type-check without emitting (faster than full build for sanity checks)
```

The bundle is **not** committed; do not assume `build/sketchbook.min.js` exists fresh — run `npm run build` first.

`build/assets/*.glb` and `build/assets/*.jpg` are committed (they're vendored level/vehicle models, not webpack output).

## Code conventions (match these — don't reformat)

- **Indentation:** tabs. ESLint will complain on spaces.
- **Quotes:** single (`'…'`).
- **Semicolons:** always.
- **Braces:** opening on next line for classes / functions / blocks (Allman):
  ```ts
  export class Foo
  {
      constructor()
      {
          ...
      }
  }
  ```
- **Imports:** group per area (three first, then cannon, then internal). No barrel files.
- **Comments:** sparse and *why*-focused. Don't narrate code that names itself. Don't reference issue numbers / commits / "added by X" — that's `git log` territory.
- **No emojis** in code or commits unless the user asks.
- **No new files** without need — prefer extending an existing one. Especially no `*.md` files unless explicitly requested.

## Architecture map

- `src/ts/sketchbook.ts` — bundle entry point, exports `Sketchbook.World`, the four sandbox classes, `showTitleScreen`, `installErrorOverlay`.
- `src/ts/world/World.ts` — god-class. Holds renderer, physics world, scenarios, registered updatables, lil-gui, audio listener, pause menu. ~1100 LOC. Search here first.
- `src/ts/core/` — shared infra: `LoadingManager`, `InputManager`, `CameraOperator`, `UIManager`, `FunctionLibrary` (math helpers).
- `src/ts/world/` — world entities (Ocean, Sky, Grass, Speaker, Race*, Trigger*, ProximityPrompt, NPCSpawnPoint, ShapeEntity, etc.) + UI shell (PauseMenu, SettingsModal, TitleScreen, ErrorOverlay, DialogBox, NameLabel). All implement `IUpdatable` or `IWorldEntity` from `src/ts/interfaces/`.
- `src/ts/world/sandboxes/` — procedural test scenes ported from socketControl (BaseScene + TestScene/Test2Scene/Test3Scene/ExampleScene). They build their world in the constructor by populating `this.scene` with userData markers.
- `src/ts/characters/` — Character class + state machine (Idle, Walk, Sprint, Falling, Drop*, JumpRunning, vehicle states, etc.) + character_ai/ behaviours (FollowPath, FollowTarget, RandomBehaviour).
- `src/ts/vehicles/` — Car, Helicopter, Airplane, Boat, RocketShip and their input states.
- `src/ts/physics/colliders/` — BoxCollider, SphereCollider, CylinderCollider, CapsuleCollider, TrimeshCollider — thin wrappers around CANNON shapes.
- `src/ts/enums/` — EntityType, CollisionGroups, GroundImpactData, etc.
- `src/css/main.css` — imports all module CSS. `tokens.css` defines every shared CSS custom property; everything else uses `var(--…)`.

For deeper pointers see `docs/architecture.md` and `docs/map-authoring.md`.

## Mental model: how a frame happens

1. `World.render()` → request RAF → compute timestep
2. `World.update(timeStep)` runs every registered `IUpdatable.update()` in `updateOrder` order. InputManager (3), CameraOperator, Sky (5), RaceContent (6), Speaker (11), TriggerCube (12), ProximityPrompt (13), Grass (10), Character/Vehicle physics (10).
3. `composer.render()` (FXAA) or direct `renderer.render()`.
4. `labelRenderer.render()` projects CSS2D name labels above their anchors.

`world.params.Time_Scale` is the throttle. `setTimeScale(0)` pauses the physics + state updates entirely (PauseMenu uses this).

## Map / level authoring

The level lives in `build/assets/world.glb` (the Inthenew default) plus two socketControl alternatives (`world_sc_v03.glb`, `world_sc_v04.glb`) plus four code-built sandboxes. All are switchable from the **Scenarios** GUI panel; the choice persists in `localStorage['sketchbook.map']`.

`World.loadScene(loadingManager, gltf)` walks every node in the scene and acts on `userData`:
- `data: 'physics'` + `type: box|trimesh|cylinder` → spawn matching CANNON body
- `data: 'spawn'` + `type: car|heli|airplane|boat|rocketship|player|npc|character_ai|character_follow|shape` → matching SpawnPoint
- `data: 'scenario'` → new Scenario container
- `data: 'path'` + nested `data: 'pathNode'` → Path graph (used by FollowPath AI + RaceContent)
- `data: 'speaker'` + `audio: '<url>'` → 3D positional audio source
- `material.name === 'ocean' | 'ocean.001'` → Ocean wave shader
- `material.name === 'grass'` → instanced grass field

For full list and example markers see `docs/map-authoring.md`.

## Things to NOT do

- Don't add multiplayer / Socket.io / ECS plumbing — explicit non-goal of this fork.
- Don't replace lil-gui with a custom panel — settings flow through it via `gui.controllersRecursive().find().setValue()` from the SettingsModal.
- Don't break commit attribution. When porting from a fork, use `--author="Original Author <email>"` and the original date so `git log` reflects who did the original work.
- Don't push to `main`/`master`. Active branch is `claude/external-features`. Other branches like `claude/inthenew-*` are historical.
- Don't downgrade dependencies. The April 2026 toolchain pass updated everything to current LTS.
- Don't use `Array.prototype.includes` blindly — `tsconfig.json` targets ES2015 in some paths. Use `indexOf(x) !== -1` if `tsc` complains.

## Ongoing TODO

The only outstanding item from `README.md`:
- Bring over remaining iErcann/Notblox features (priority: cannon → rapier migration).
- Optionally evaluate pmndrs/ecctrl or pmndrs/BVHEcctrl as a controller alternative.

Everything else listed there is shipped.
