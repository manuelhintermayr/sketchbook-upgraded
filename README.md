<p align="center">
	<a href="https://jblaha.art/sketchbook/latest"><img src="./src/img/thumbnail.png"></a>
	<br>
	<a href="https://jblaha.art/sketchbook/latest">Live demo (original by swift502)</a>
	<br>
</p>

# 📒 Sketchbook

A maintained extension of the original [swift502/Sketchbook](https://github.com/swift502) — a small web-based game engine on [three.js](https://github.com/mrdoob/three.js) and [cannon-es](https://github.com/pmndrs/cannon-es) with a focus on third-person controls, vehicles and scripted scenarios.

This fork pulls in the features from later community forks that I felt were worth keeping, rebuilds the project on current tooling (TypeScript, three.js r183, webpack 5; dependency baseline as of **1 May 2026**) and exposes everything through one engine. See the [project timeline](#project-timeline) for who did what.

## Features

### World

- Day / night cycle with a sky shader, sun position controls, and a black space backdrop above the launch apex.
- Earth and Moon visible as celestial bodies; lunar gravity (~1.62 m/s²) kicks in on the moon.
- Wave-based ocean with vertex displacement and a height query that boats actually ride.
- Procedural [300k-blade grass field](https://www.eddietree.com/grass) (instanced, 30-unit LOD) — wired to any map material called `grass`.
- 3D positional audio sources ("Speaker") with browser-autoplay handling.
- Variable timescale, FXAA, cascaded shadow maps, adjustable gravity (0–2×).
- Camera shake on vehicle hard landings (sineNoise-based, three presets: collision / land / boost).
- All settings persist to `localStorage` with a one-click reset.

### Characters & NPCs

- Third-person camera, raycast capsule controller, full state machine (Sprint, Walk, Idle, Jump, Falling, Drop variants…).
- AI path-following — same convention used by both the AI vehicle drivers and standing/wandering NPCs.
- Name labels float above every character via a CSS2D pass; the player is tagged "Du" and stands out in blue.
- Two example NPCs walk a small loop at the default spawn, two more flank the player on idle.

### Vehicles

- Cars (with per-vehicle tuning sliders for friction, suspension, damping and engine force).
- Airplanes, helicopters.
- Boats with wave-riding physics and wave-aware AI path-following.
- Rocketship — 4-stage liftoff, smoke particle trail, planet-selection modal, automated Earth↔Moon transfer with soft auto-landing.

### Scenarios & Maps

- Free-roam (default and aviation), Oval / Tunnel / Figure-8 car races, Boat Race, stunt ramps.
- Curve-based race-checkpoint system with a HUD lap counter.
- Switchable maps from the **Scenarios** GUI panel (persists across reloads):
	- `Inthenew (v0.6, default)` — the bundled extended map
	- `sketchbook v0.3 (socketControl)` — original Sketchbook map with the grass material
	- `sketchbook v0.4 (socketControl)` — original Sketchbook map, full scenario set
	- Four code-built sandboxes from socketControl: `test`, `test2`, `test3`, `example` (TypeScript, editable directly)
- Compatibility with the [official three.js editor](https://threejs.org/editor/) — the sandbox project file is vendored under `ThreejsEditor/`.

### Authoring & extensibility

Map markers in `userData` light up code-side features automatically:

| Marker | Effect |
|---|---|
| `material.name === 'grass'` | Instanced grass field |
| `userData.data === 'speaker'` + `audio` | 3D positional audio source |
| `userData.type === 'cylinder'` | CANNON cylinder collider |
| `userData.type === 'shape'` + `subtype: box`/`sphere` | Dynamic physics primitive |
| `userData.type === 'npc'` / `character_ai` / `character_follow` | Standing or path-following NPC |

### Input

- Keyboard + mouse, free camera (`Shift+C`, `T` to teleport, `Z` to toggle the controls overlay).
- Joy-Con / gamepad via [benhatsor/joycon.js](https://github.com/benhatsor/joycon.js).

## Usage

Sketchbook needs to run on a local server (e.g. `npm run dev`) to load assets.

```html
<script src="sketchbook.min.js"></script>
<script>
	const world = new Sketchbook.World('scene.glb');
	// or pass a sandbox instance:
	// const world = new Sketchbook.World(new Sketchbook.Test3Scene());
</script>
```

## Running locally

1. Install a current LTS version of [Node.js](https://nodejs.org/en/).
2. `npm install`
3. `npm run build` — required before the first `npm run dev` because `build/sketchbook.min.js` is no longer committed.
4. `npm run dev` and open <http://localhost:8080>.
5. `npm run lint` to run ESLint over `src/ts/`.

---

# Project timeline

> **Attribution policy:** every port below tries to preserve the original commits or at least the original authors via `git format-patch` / `git am` or `git commit --author="…" --date="…"`. The intent is to honour each upstream author's work — and only their work — in `git log`.

## May 2026 — portfolio polish pass ([manuelhintermayr](https://github.com/manuelhintermayr))

Adopts the highest-value pieces of [manuelhintermayr/portfolio three-js](https://github.com/manuelhintermayr/portfolio) — a separate React Three Fiber project with stronger feel/polish than this fork shipped with. Each feature ships as its own commit, ported from the React/Zustand idiom into Sketchbook's vanilla TypeScript + lil-gui idiom (Allman braces, IUpdatable pattern, lil-gui controllers as the source of truth).

- **Camera Shake** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/b9dd34c550f8da366970f9a0009558fa77af45f7)) — sineNoise-based per-frame camera offset triggered by vehicle hard landings; static fire-and-forget API, three presets (collision / land / boost), quadratic decay envelope, toggle in Settings.

## May 2026 — UI design system & in-game shell ([manuelhintermayr](https://github.com/manuelhintermayr)) ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/e0970713087556920b1ce28d259923068035cbfb))

Adopts the seven highest-value pieces of the in-house ui-guide design system: a central `tokens.css` (~50 colour / typography / spacing / shadow / motion custom properties — drops a `class="dark"` on `<html>` for dark mode), a real **title screen** (bouncing cube + "press any key" gate that doubles as the audio-autoplay user gesture), a **loading screen** with a live percentage + bar driven by `LoadingManager`, a **pause menu** on Esc that actually pauses (timeScale=0, exits pointer lock, restores prior state on Resume) with Resume / Settings / Restart Scenario / Reload, a **settings modal** with Graphics / Audio / Controls cards that writes through lil-gui controllers so every existing `onChange` handler (CSM, pointer-lock, mouse sensitivity) keeps firing, a **branching NPC dialog** system layered on top of `ProximityPrompt` (portrait, speaker line, numbered choices, mouse + 1–9 keys, auto-closes when the player walks away — Anna / Ben / Carla / Dieter all got hand-written 3-node trees explaining the world), and an **error overlay** that catches `window.onerror` + `unhandledrejection` into a frosted card with stack + Reload + Copy details. Floating CSS2D name tags above every character: the player is tagged "Du" in blue, NPCs in their own names. All existing CSS modules refactored to reference the new tokens — no more scattered magic numbers.

## May 2026 — external-features port ([manuelhintermayr](https://github.com/manuelhintermayr)) ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/c37b6f35b46354c8abaa7589a4a2a2d7a63d31c9))

Mines features from [tkkaushik369/socketControl](https://github.com/tkkaushik369/socketControl) (MIT) and [iErcann/Notblox](https://github.com/iErcann/Notblox), skipping their multiplayer layers entirely. Each feature ships as its own commit attributed to the upstream author where identifiable.

What landed: curve-based race tracking with checkpoint planes; instanced grass field with LOD; 3D positional audio Speaker; CylinderCollider + SphereCollider; ShapeSpawnPoint for dynamic box/sphere primitives; TriggerCube + ProximityPrompt; NPC system (standing or path-following) with floating name tags via a CSS2D pass; sketchbook v0.3 + v0.4 maps from socketControl plus four code-built sandbox scenes (`test`, `test2`, `test3`, `example`); Scenarios-panel map switcher; THREE.js Editor compatibility (`ThreejsEditor/project.json`).

Skipped: water (Inthenew's wave ocean is better), extended character states (already in upstream), all multiplayer/ECS/networking plumbing.

## May 2026 — version 0.6.0 — Inthenew port ([manuelhintermayr](https://github.com/manuelhintermayr)) ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/39683190407013aafda257406287e162f0363f2d))

Pulls in [Inthenew/Sketchbook](https://github.com/Inthenew/Sketchbook): day/night cycle, wave-based ocean replacing the original flat water, boats with wave-aware physics + Boat Race scenario, lap tracking on the three car races, the full Rocketship feature (chassis, smoke particles, planet-select modal, Earth↔Moon flight + auto-landing), Earth + Moon as celestial bodies, lunar gravity, Vehicles GUI tuning sliders, Free-camera quality-of-life (`T` teleport, `Z` overlay toggle, return-to-forward slerp).

Inthenew squashes upstream commits, so each feature was re-ported individually with `--author="inthenew <matthew@slocum.io>"` and the original date. The level (`build/assets/world.glb`) was replaced with Inthenew's so all the hand-tuned coordinates (no-wave dock zone, race paths, rocket island) stay in sync.

**Asset re-creation:** Inthenew's upstream hotlinked six third-party images that couldn't legally be vendored (DeviantArt fan-art, an anonymous Imgur upload, Farmers Almanac and Adobe Stock photos, a Future plc CDN asset, and a Wikimedia photo with attribution requirements). All were dropped and replaced with DALL-E generated equivalents shipped under `src/img/` — same intent and visual style, no licence baggage.

## May 2026 — version 0.5.0 — Joy-Con port ([manuelhintermayr](https://github.com/manuelhintermayr)) ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/afff1ec38b1768a85ee0c8e53cc1b3540cc04042))

Adds Joy-Con / gamepad support originally written by [Bar Hatsor](https://github.com/barhatsor) in [benhatsor/Joycon-Sketchbook](https://github.com/benhatsor/Joycon-Sketchbook). Original commits preserved via `format-patch` / `am`. The controller layer only synthesises keyboard/mouse events, so the engine itself is untouched. The unpinned `cdn.cde.run/Joycon.min.js` was vendored under `vendor/joycon/`.

## September 2024 — version 0.4.1 — [cjmott](https://github.com/cjmott) ([commit](https://github.com/cjmott/Sketchbook/commit/088fffc743818d13babeecd87c8ba3165cf13fcb))

> I plan to use Sketchbook as a basis to develop another project, so I have updated the code to run on the latest version of all the packages and switched from cannon.js, which is no longer maintained, to cannon-es.js. […] The biggest change has involved updating to the new version of THREE.js, which no longer supports the object types `Geometry` and `Face3`, replacing both with `BufferGeometry`. Note that I have also updated the sky shaders to use an example provided on the THREE.js website.

### April 2026 follow-up — toolchain re-modernisation ([manuelhintermayr](https://github.com/manuelhintermayr)) ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/1a99803b366f49385dfac80c76ab86371f154915))

A second pass on top of cjmott's work: dependencies updated to current versions (TypeScript 6, ESLint, three.js r183, webpack 5), legacy in-repo utility copies replaced with maintained npm packages (lil-gui, stats.js, cannon-es-debugger), unused legacy files dropped. Behaviour and architecture preserved — gameplay changes start in May.

## February 2023 — version 0.4 — [swift502](https://github.com/swift502) ([commit](https://github.com/swift502/Sketchbook-upgraded/commit/62f4b7986fd1ce1e4f91daba89ef032c20a6ce55)), final update from the original author

> As I have no more interest in developing this project, it comes to a conclusion. […] If you wish to modify Sketchbook feel free to fork it. The [NPM package](https://www.npmjs.com/package/sketchbook) name is available, and I'll give it away to anyone who asks for it. The package has never worked properly.

---

## TODO

- Bring over remaining features from [iErcann/Notblox](https://github.com/iErcann/Notblox) (excluding multiplayer), with priority on moving from cannon to rapier.
	- Evaluate controller integration from [pmndrs/ecctrl](https://github.com/pmndrs/ecctrl) or [pmndrs/BVHEcctrl](https://github.com/pmndrs/BVHEcctrl).

---

## Credits

- [swift502](https://github.com/swift502) — original Sketchbook engine.
- [cjmott](https://github.com/cjmott) — September 2024 toolchain revival (cannon-es, modern three.js).
- [Inthenew](https://github.com/Inthenew) — boats, wave ocean, races, day/night cycle, rocketship + moon, lunar gravity (v0.6.0 feature set).
- [Bar Hatsor (barhatsor)](https://github.com/barhatsor) — Joy-Con / gamepad integration.
- [tkkaushik369](https://github.com/tkkaushik369) — socketControl: race-checkpoint system, instanced grass field, Speaker, CylinderCollider, ShapeSpawnPoint, the four sandbox scenes, and the THREE.js editor workflow.
- [iErcann](https://github.com/iErcann) — Notblox: TriggerCube + ProximityPrompt design.
