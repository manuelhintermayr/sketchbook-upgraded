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
	* Cannon-es physics
	* Variable timescale
	* Frame skipping
	* FXAA anti-aliasing
	* Cascaded shadow maps (via three.js' built-in CSM)
* Characters
	* Third-person camera
	* Raycast character controller with capsule collisions
	* General state system
	* Character AI
* Vehicles
	* Cars
	* Airplanes
	* Helicopters
	* Boats (with wave-riding physics)
* World
	* Wave-based ocean with vertex displacement and a height query for buoyancy
	* Race scenarios with lap tracking (Oval / Tunnel / Figure 8)
	* AI path-following for cars and boats
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

- Bring over remaining features from [Inthenew/Sketchbook](https://github.com/Inthenew/Sketchbook). Boats, wave ocean, race scenarios, lap tracking and AI path-following for boats are integrated; rocketship, moon, day/night cycle settings save, free-cam-speed slider, teleport, and hide-controls are still pending.
	- Optional: explore replacing the wave ocean with [J0SUKE/gpgpu-dynamic-normal-map](https://github.com/J0SUKE/gpgpu-dynamic-normal-map) for GPGPU-based normals.
- Bring over features from [friuns2/SketchbookAI](https://github.com/friuns2/SketchbookAI) (excluding AI features).
- Bring over features from [tkkaushik369/socketControl](https://github.com/tkkaushik369/socketControl?tab=readme-ov-file) (excluding multiplayer).
- Bring over features from [iErcann/Notblox](https://github.com/iErcann/Notblox) (excluding multiplayer), with priority on moving from cannon to rapier.
	- Evaluate controller integration from [pmndrs/ecctrl](https://github.com/pmndrs/ecctrl) or [pmndrs/BVHEcctrl](https://github.com/pmndrs/BVHEcctrl).

---

# Project timeline

## April 2026 update — [manuelhintermayr](https://github.com/manuelhintermayr)

Continuing from [cjmott](https://github.com/cjmott)'s September 2024 work, this update focuses on modernization, cleanup, and long-term maintainability.

In short: dependencies were updated, old vendored code was replaced with maintained npm packages, and unused legacy files were removed. The goal was to keep Sketchbook stable on current tooling while reducing technical debt.

Highlights:

- Updated core libraries and the build/lint toolchain to current versions.
- Replaced legacy in-repo utility copies with actively maintained packages.
- Fixed a few runtime and compatibility issues discovered during the upgrade.
- Removed outdated or unused code paths and old build artifacts from version control.
- Kept behavior and architecture largely the same, but made the project easier to maintain.
- Integrated the Joy-Con / gamepad layer from [benhatsor/Joycon-Sketchbook](https://github.com/benhatsor/Joycon-Sketchbook). The original commits were preserved via `git format-patch` / `git am`, so [Bar Hatsor](https://github.com/barhatsor)'s authorship and timestamps remain intact in `git log`. The controller layer (`joycon-sketchbook.js`, `Client.js`, `vendor/joycon/Joycon.min.js`, `audio/horn.wav`) is loaded by `index.html` and only synthesizes keyboard/mouse events, so the engine itself is untouched. The previously external `cdn.cde.run/Joycon.min.js` dependency was vendored under `vendor/joycon/` to remove the unpinned CDN reference.
- Adopted boats, the wave-based ocean, three race scenarios with lap tracking, and AI path-following for boats from [Inthenew/Sketchbook](https://github.com/Inthenew/Sketchbook) (also MIT). Inthenew squashes everything into a few generic "Changes" commits, so granular `format-patch` per feature wasn't possible; instead each feature ports as its own commit with `--author=inthenew` and the original date, and the upstream commit SHA is referenced in the commit body. The level (`build/assets/world.glb`) was replaced with Inthenew's so the no-wave dock zone, the boat spawn marker, and the race-track path nodes line up with the ocean shader's hand-tuned constants.

Full technical details are available in the commit history on branches `claude/migrate-libraries-ZsEcJ`, `claude/joycon-integration`, `claude/inthenew-day-night-extras`, and `claude/inthenew-boats-water`.

## September 2024 update — [cjmott](https://github.com/cjmott) ([commit](https://github.com/cjmott/Sketchbook/commit/088fffc743818d13babeecd87c8ba3165cf13fcb))

> I plan to use Sketchbook as a basis to develop another project, so I have updated the code to run on the latest version of all the packages and switched from cannon.js, which is no longer maintained, to cannon-es.js. This version should build and run locally using `npm`.
>
> The biggest change has involved updating to the new version of THREE.js, which no longer supports the object types `Geometry` and `Face3`, replacing both with `BufferGeometry`. If playing around with the code, it is very important to keep in mind that indexed and non-indexed objects of type BufferGeometry behave very differently. The shape of a non-indexed BufferGeometry is fully defined by its vertices. That is *not* the case for an indexed BufferGeometry.
>
> Note that I have also updated the sky shaders to use an example provided on the THREE.js website. I may do the same with the water shaders, which now look very good but are very resource-intensive.
>
> I do not plan to make regular updates to this fork at the moment, but I may do so in the future.

## February 2023 — [swift502](https://github.com/swift502) ([commit](https://github.com/swift502/Sketchbook-upgraded/commit/62f4b7986fd1ce1e4f91daba89ef032c20a6ce55)), final update from the original author

> As I have no more interest in developing this project, it comes to a conclusion. In order to remain honest about the true state of the project, I am archiving this repository.
>
> - If you wish to modify Sketchbook feel free to fork it.
> - To see if someone is currently maintaining a fork, check out the [Network Graph](https://github.com/swift502/Sketchbook/network).
> - The [NPM package](https://www.npmjs.com/package/sketchbook) name is available, and I'll give it away to anyone who asks for it. The package has never worked properly.

## Credits

Big thank you to the original author [swift502](https://github.com/swift502), to [cjmott](https://github.com/cjmott) for the September 2024 toolchain revival, and to the following github users for contributing to Sketchbook over the years:

- [aleqsunder](https://github.com/aleqsunder)
- [barhatsor](https://github.com/barhatsor)
- [danshuri](https://github.com/danshuri)
