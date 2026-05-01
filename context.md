# context.md — AI agent onboarding

This file is a generic context primer for any AI coding assistant working on this repository (Cursor, Continue, Aider, Copilot Workspace, agent-mode Claude, etc.). [Claude Code](https://claude.com/claude-code) reads `CLAUDE.md` instead — same content, slightly different framing.

## TL;DR for fast bootstrapping

- **What:** maintained extension of the [swift502/Sketchbook](https://github.com/swift502/Sketchbook) 3D engine. Single-player only (no networking).
- **Stack:** TypeScript, three.js r183, cannon-es, lil-gui, webpack 5. ESLint enforced.
- **Branch:** `claude/external-features` is the active development line; `master` is upstream-aligned.
- **Build:** `npm install && npm run build` (required first), then `npm run dev` → <http://localhost:8080>.
- **Lint:** `npm run lint` (ESLint over `src/ts/`).
- **Type-check only:** `npx tsc --noEmit`.

## Repository tour

```
src/
├── css/
│   ├── main.css                    ← imports every module
│   └── modules/
│       ├── tokens.css              ← single source of truth for colour/typography/spacing
│       ├── pauseMenu.css, dialog.css, settingsModal.css, errorCard.css, titleScreen.css
│       └── …existing modules (base, leftPanel, loadingScreen, …)
├── img/                            ← DALL-E generated textures (Earth, Moon, smoke, …)
└── ts/
    ├── sketchbook.ts               ← bundle entry; re-exports public API
    ├── characters/                 ← Character + state machine + AI behaviours
    ├── core/                       ← LoadingManager, InputManager, CameraOperator, UIManager
    ├── enums/                      ← EntityType, CollisionGroups
    ├── interfaces/                 ← IUpdatable, IWorldEntity, ISpawnPoint, ICollider
    ├── physics/colliders/          ← Box, Sphere, Cylinder, Capsule, Trimesh wrappers
    ├── vehicles/                   ← Car, Helicopter, Airplane, Boat, RocketShip
    └── world/
        ├── World.ts                ← god-class; ~1100 LOC; everything starts here
        ├── Scenario.ts             ← parses scenario subtree, launches it
        ├── Sky.ts, Ocean.ts, Grass.ts, Speaker.ts
        ├── RaceCheckpoint.ts, RaceContent.ts
        ├── TriggerCube.ts, ProximityPrompt.ts, DialogBox.ts
        ├── NPCSpawnPoint.ts, defaultDialogs.ts, NameLabel.ts
        ├── PauseMenu.ts, SettingsModal.ts, TitleScreen.ts, ErrorOverlay.ts
        └── sandboxes/              ← BaseScene + Test/Test2/Test3/Example procedural scenes
build/assets/                       ← world.glb, world_sc_v03.glb, world_sc_v04.glb, vehicles
ui-guide/                           ← static HTML mockups for the design system (reference only)
ThreejsEditor/project.json          ← upstream THREE.js editor compat — leave as-is
```

## Project conventions (do not violate without asking)

| Topic | Convention |
|---|---|
| Indent | tabs |
| Quotes | `'single'` |
| Braces | Allman (opening on new line) |
| Semicolons | always |
| Comments | sparse, *why*-focused, no PR/commit refs |
| New files | extend existing first; no new `.md` unless requested |
| Commits | preserve upstream authorship via `--author=` when porting |
| Branches | work on `claude/external-features`; never push to `master` |
| Emojis | none in code/commits unless user requests |
| ECS / Multiplayer | **not adopted** — explicitly out of scope |

## Engine mental model

- **Frame loop:** `World.render()` (RAF) → `World.update(timeStep)` → every registered `IUpdatable.update()` in `updateOrder` order → `composer.render()` → `labelRenderer.render()` (CSS2D name tags).
- **Pause:** `world.setTimeScale(0)` freezes everything. `PauseMenu` uses this; `SettingsModal` adjusts `params.Master_Volume` etc. through lil-gui controllers so existing onChange handlers fire.
- **Updatables:** anything visible (Ocean, Grass, Speaker, RaceContent, TriggerCube, ProximityPrompt, Sky, Character, Vehicle) implements `IUpdatable` and is registered via `world.registerUpdatable()` (or `world.add()` which also registers).
- **Map authoring:** scenarios + spawns + physics + paths + grass + speakers all come from `userData` on nodes inside `world.glb`. Markers are documented in `docs/map-authoring.md`.

## Where to add things

| You want to… | Touch this |
|---|---|
| Add a new vehicle | `src/ts/vehicles/`, register in `EntityType`, recognise in `VehicleSpawnPoint` |
| Add a new world entity | implement `IUpdatable` (or `IWorldEntity` if it has add/remove lifecycle), add to `World.loadScene` if map-driven |
| Add a UI overlay | new file in `src/ts/world/`, new module in `src/css/modules/`, `@import` it from `src/css/main.css` |
| Add an in-game shortcut | `World.ts` listens to a few `keydown` directly (`KeyT`, `KeyZ`); `InputManager` handles per-receiver input |
| Add a setting | add to `World.params`, register a lil-gui controller, optionally add a row in `SettingsModal.refresh/build` |
| Add an NPC dialog | edit `src/ts/world/defaultDialogs.ts`, hand it to `NPCSpawnPoint` constructor |
| Add a new map marker convention | add a `userData.data === 'X'` branch in `World.loadScene` and document it in `docs/map-authoring.md` |

## Hard rules

1. **Do not** introduce networking, ECS frameworks, or Socket.io.
2. **Do not** push to `master` or force-push any shared branch without explicit permission.
3. **Do not** rename or move existing public API (`Sketchbook.World`, scene class exports, `createWelcomeScreenCallback`) without checking call sites in `index.html` and dependent forks.
4. **Do not** vendor copyrighted assets without checking license. The Inthenew port replaced six hotlinked images with DALL-E equivalents specifically because of this — see the `README.md` v0.6.0 section.
5. **Do not** add `*.md` documentation files spontaneously. The user will ask.

## Reference docs

- `README.md` — user-facing feature list + project timeline + credits.
- `CLAUDE.md` — Claude Code memory (~ same content as this file, slightly different audience).
- `docs/architecture.md` — deeper engine internals.
- `docs/map-authoring.md` — full userData marker reference.
- `docs/ui-system.md` — design tokens + UI overlay catalogue.
- `ui-guide/` — original HTML mockups that shaped the May-2026 UI pass; reference only.

## When unsure

Read `README.md`'s timeline first — it explains why each piece is the way it is. Then `git log --oneline` on the relevant file. Most architectural choices are documented in commit messages with the upstream author preserved.
