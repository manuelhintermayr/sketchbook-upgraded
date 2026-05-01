<p align="center">
	<a href="https://jblaha.art/sketchbook/latest"><img src="./src/img/thumbnail.png"></a>
	<br>
	<a href="https://jblaha.art/sketchbook/latest">Live demo (original by swift502)</a>
	<br>
</p>

# 📒 Sketchbook

Originally created by [swift502](https://github.com/swift502). This repository is a maintained fork with later updates from the community.

Simple web based game engine built on [three.js](https://github.com/mrdoob/three.js) and [cannon-es](https://github.com/pmndrs/cannon-es) focused on third-person character controls and related gameplay mechanics.

Mostly a playground for exploring how conventional third person gameplay mechanics found in modern games work and recreating them in a general way.

## Features

* World
	* Three.js scene
	* Cannon-es physics with adjustable Gravity_Scale (0–2×) and lunar gravity on the moon
	* Variable timescale
	* Frame skipping
	* FXAA anti-aliasing
	* Cascaded shadow maps (via three.js' built-in CSM)
	* Wave-based ocean with vertex displacement and a height query for buoyancy
	* Day / night cycle (toggle in the World GUI folder)
	* Earth and Moon visible as celestial bodies; sky shader hides above the launch apex so space reads as black
	* GUI settings persisted to localStorage with a reset button
* Characters
	* Third-person camera
	* Raycast character controller with capsule collisions
	* General state system
	* Character AI (path-following for cars and boats)
* Vehicles
	* Cars
	* Airplanes
	* Helicopters
	* Boats (with wave-riding physics)
	* RocketShip with smoke particles and a planet-select modal that flies the player Earth↔Moon
* Scenarios
	* Free roam (default and aviation)
	* Race tracks: Oval / Tunnel / Figure 8 with lap tracking, Boat Race
* Free camera (`Shift+C`)
	* Adjustable speed via Free_Cam_Speed slider
	* `T` teleports the player (or driven vehicle) to the camera target
	* `Z` toggles the on-screen controls overlay
* Input
	* Keyboard and mouse
	* Joy-Con / gamepad via [benhatsor/joycon.js](https://github.com/benhatsor/joycon.js)

## Usage

You can define your own scenes in Blender, and then read them with Sketchbook. Sketchbook needs to run on a local server such as [http-server](https://www.npmjs.com/package/http-server) or [webpack-dev-server](https://github.com/webpack/webpack-dev-server) to be able to load external assets.

1. Import:

```html
<script src="sketchbook.min.js"></script>
```

2. Load a glb scene defined in Blender:

```javascript
const world = new Sketchbook.World('scene.glb');
```

## Running locally

1. Install a current LTS version of [Node.js](https://nodejs.org/en/)
2. [Fork this repository](https://help.github.com/en/github/getting-started-with-github/fork-a-repo)
3. `npm install`
4. `npm run build` (produces `build/sketchbook.min.js`; required before the first `npm run dev` because the bundle is no longer committed)
5. `npm run dev` and open <http://localhost:8080>
6. `npm run lint` to run ESLint over `src/ts/`

## TODO (centralized roadmap)

Many great changes happened across forks over the years, but they are spread out and hard to track in one place. The items below collect the next major integration targets.

### Quality-of-life ideas beyond what's shipped

- **Boat-lap tracking.** The Boat Race scenario from Inthenew has AI racers but no lap counter (their README explicitly says "for now only oval races track laps"). A generic path-node-pass tracker — applicable to any race scenario — would turn Boat Race into a real race against the AI.
- Optional: replace the wave ocean with [J0SUKE/gpgpu-dynamic-normal-map](https://github.com/J0SUKE/gpgpu-dynamic-normal-map) for GPGPU-driven normals.

### Other forks worth mining

- Bring over features from [friuns2/SketchbookAI](https://github.com/friuns2/SketchbookAI) (excluding AI features).
- Bring over features from [tkkaushik369/socketControl](https://github.com/tkkaushik369/socketControl?tab=readme-ov-file) (excluding multiplayer).
- Bring over features from [iErcann/Notblox](https://github.com/iErcann/Notblox) (excluding multiplayer), with priority on moving from cannon to rapier.
	- Evaluate controller integration from [pmndrs/ecctrl](https://github.com/pmndrs/ecctrl) or [pmndrs/BVHEcctrl](https://github.com/pmndrs/BVHEcctrl).

---

# Project timeline

## May 2026 — version 0.6.0 — Inthenew port ([manuelhintermayr](https://github.com/manuelhintermayr))

Ports the bulk of [Inthenew/Sketchbook](https://github.com/Inthenew/Sketchbook) into this fork. The "0.6.0" label tracks the upstream feature set — the credit for the gameplay design and original implementation belongs to [Inthenew](https://github.com/Inthenew); this entry is about pulling that work in cleanly.

Highlights:

- **Day/night cycle** with two GUI toggles, settings persistence to `localStorage`, and a Reset_World_Settings button.
- **Wave-based ocean** (vertex displacement, height query for buoyancy) replacing the original flat fragment-shader water.
- **Boats** with wave-riding physics, AI path-following adapted to wave height, and a Boat Race scenario.
- **Lap tracking** for the three car races (Oval / Tunnel / Figure 8) with an on-screen counter.
- **Rocketship vehicle**: chassis collision, rotor visuals, additive smoke particle system, four-stage automated liftoff, planet-selection modal, Earth↔Moon flight animation, soft auto-landing on either pad.
- **Earth and Moon** as celestial bodies in the sky; the moon-surface mesh in the map gets its own texture; the sky shader hides above the launch apex so space reads as black.
- **Lunar gravity** kicks in on the moon (~1.62 m/s², matching the real moon).
- **Vehicles GUI folder** with six per-car tuning sliders (Friction_Slip, Suspension_Stiffness, Max_Suspension, Damping_Compression, Damping_Relaxation, Engine_Force) that apply to currently spawned cars and to any future spawns.
- **World GUI extras**: Gravity_Scale slider (0–2×), Free_Cam_Speed slider (1–100).
- **Free-camera quality-of-life**: `T` teleports the player (or driven vehicle) to the camera target, `Z` toggles the on-screen controls overlay, and the in-vehicle first-person camera slerps back to face forward after ~400 ms of no mouse movement.
- **Per-vehicle camera tweaks** via `viewBack` and `centerHere` userData on the GLB camera empty.

How the port is structured: Inthenew squashes everything into a few generic "Changes" commits, so granular `format-patch` per feature wasn't possible. Instead each feature ports as its own commit with `--author=inthenew <matthew@slocum.io>` and the original commit date, and the upstream commit SHA is referenced in the commit body. The level (`build/assets/world.glb`) was replaced with Inthenew's so the no-wave dock zone, the boat spawn marker, the race-track path nodes, the rocketship spawn and the rocket-island launch pad all line up with the ocean shader's hand-tuned constants and the rocketship's flight coordinates.

**Asset re-creation:** Inthenew's upstream hotlinks several third-party images that couldn't legally be vendored (DeviantArt fan-art for the Earth sphere, an Adobe Stock smoke particle, Future plc / Wikipedia / Farmers Almanac photos for the Earth and Moon, an anonymous Imgur upload, a dead Glitch CDN). All were replaced with DALL-E generated equivalents shipped in `src/img/` (`equirectangular-earth.png`, `equirectangular-moon.png`, `hemisphere-earth.png`, `full-moon.png`, `moon-with-flowers.png`, `smoke.png`). Visual style is comparable; licensing is clean.

Full technical details on branches `claude/inthenew-day-night-extras`, `claude/inthenew-boats-water`, and `claude/inthenew-rocketship-moon`.

## May 2026 — version 0.5.0 — Joy-Con port ([manuelhintermayr](https://github.com/manuelhintermayr))

Adds the Joy-Con / gamepad support originally written by [Bar Hatsor](https://github.com/barhatsor) in [benhatsor/Joycon-Sketchbook](https://github.com/benhatsor/Joycon-Sketchbook). The "0.5.0" label tracks Bar Hatsor's upstream feature; this entry is about integrating it cleanly.

The original commits were preserved via `git format-patch` / `git am`, so Bar Hatsor's authorship and timestamps remain intact in `git log`. The controller layer (`joycon-sketchbook.js`, `Client.js`, `vendor/joycon/Joycon.min.js`, `audio/horn.wav`) is loaded by `index.html` and only synthesizes keyboard/mouse events, so the engine itself is untouched. The unpinned `cdn.cde.run/Joycon.min.js` dependency was vendored under `vendor/joycon/`.

Full technical details on branch `claude/joycon-integration`.

## April 2026 update — toolchain re-modernisation ([manuelhintermayr](https://github.com/manuelhintermayr))

A second pass over the toolchain on top of [cjmott](https://github.com/cjmott)'s September 2024 work. Dependencies were updated, old vendored utilities were replaced with maintained npm packages, and unused legacy files were removed. The goal was to keep Sketchbook stable on current tooling while reducing technical debt — no gameplay changes here, those start in May.

Highlights:

- Updated core libraries and the build/lint toolchain to current versions (TypeScript 6, ESLint, three.js r183, webpack 5).
- Replaced legacy in-repo utility copies with actively maintained packages (lil-gui, stats.js, three's WebGL helper, cannon-es-debugger).
- Fixed a few runtime and compatibility issues discovered during the upgrade.
- Removed outdated or unused code paths and old build artifacts from version control.
- Kept behavior and architecture largely the same, but made the project easier to maintain.

Full technical details on branch `claude/migrate-libraries-ZsEcJ`.

## September 2024 — version 0.4.1 — [cjmott](https://github.com/cjmott) ([commit](https://github.com/cjmott/Sketchbook/commit/088fffc743818d13babeecd87c8ba3165cf13fcb))

> I plan to use Sketchbook as a basis to develop another project, so I have updated the code to run on the latest version of all the packages and switched from cannon.js, which is no longer maintained, to cannon-es.js. This version should build and run locally using `npm`.
>
> The biggest change has involved updating to the new version of THREE.js, which no longer supports the object types `Geometry` and `Face3`, replacing both with `BufferGeometry`. If playing around with the code, it is very important to keep in mind that indexed and non-indexed objects of type BufferGeometry behave very differently. The shape of a non-indexed BufferGeometry is fully defined by its vertices. That is *not* the case for an indexed BufferGeometry.
>
> Note that I have also updated the sky shaders to use an example provided on the THREE.js website. I may do the same with the water shaders, which now look very good but are very resource-intensive.
>
> I do not plan to make regular updates to this fork at the moment, but I may do so in the future.

## February 2023 — version 0.4 — [swift502](https://github.com/swift502) ([commit](https://github.com/swift502/Sketchbook-upgraded/commit/62f4b7986fd1ce1e4f91daba89ef032c20a6ce55)), final update from the original author

> As I have no more interest in developing this project, it comes to a conclusion. In order to remain honest about the true state of the project, I am archiving this repository.
>
> - If you wish to modify Sketchbook feel free to fork it.
> - To see if someone is currently maintaining a fork, check out the [Network Graph](https://github.com/swift502/Sketchbook/network).
> - The [NPM package](https://www.npmjs.com/package/sketchbook) name is available, and I'll give it away to anyone who asks for it. The package has never worked properly.

## Credits

Big thank you to the original author [swift502](https://github.com/swift502), to [cjmott](https://github.com/cjmott) for the September 2024 toolchain revival, to [Inthenew](https://github.com/Inthenew) for the boats / wave ocean / races / day-night work that this fork adopts, to [Bar Hatsor](https://github.com/barhatsor) for the Joy-Con integration, and to the following github users for contributing to Sketchbook over the years:

- [aleqsunder](https://github.com/aleqsunder)
- [barhatsor](https://github.com/barhatsor)
- [danshuri](https://github.com/danshuri)
- [Inthenew](https://github.com/Inthenew)
