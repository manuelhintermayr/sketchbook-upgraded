<p align="center">
	<a href="https://jblaha.art/sketchbook/latest"><img src="./src/img/thumbnail.png"></a>
	<br>
	<a href="https://jblaha.art/sketchbook/latest">Live demo (original by swift502)</a>
	<br>
</p>

# 📒 Sketchbook

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

---

# Project timeline

## April 2026 update — [manuelhintermayr](https://github.com/manuelhintermayr)

Continuing from [cjmott](https://github.com/cjmott)'s September 2024 work, this fork catches the codebase up to the current versions of three.js, cannon-es and the supporting toolchain, and clears out a significant amount of dead and vendored code that had accumulated over the years. Full commit history on the `claude/migrate-libraries-ZsEcJ` branch.

### Library migration

- **three.js `0.168.0` → `0.183.2`** (r168 → r183; latest stable at the time of writing).
- **three-csm** replaced with three.js' own built-in `CSM` from `three/examples/jsm/csm/CSM.js`. `three-csm@4.2.1` had not been updated since 2020 and still injected GLSL referencing `GeometricContext`, a struct three.js removed from its shader chunks around r155. Every `MeshPhongMaterial` in the scene (e.g. the `concrete` material) was failing to compile its fragment shader at runtime until this swap.
- **three-to-cannon** bumped `5.0.1` → `5.0.2`.
- **sweetalert2** `^11.12.4` → `^11.26.24`.
- **lodash** `^4.17.21` → `^4.18.1`.
- **webpack** `^5.94.0` → `^5.106.1`, **webpack-dev-server** `5.0.4` → `^5.2.3`.
- **Transitive audit fixes**: `nanoid` 3.3.7 → 3.3.11 (GHSA-mwcw-c2x4-8c55), `picomatch` 2.3.1 → 2.3.2 (GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj). Both were pulled in through dev tooling. `npm audit` now reports zero vulnerabilities.

### Runtime bug fixes

- **Dual three.js instances**: the production bundle was shipping both `three.cjs` *and* `three.module.js`, triggering `THREE.WARNING: Multiple instances of Three.js being imported.` at startup. Root cause was `tsconfig.json` with `module: "commonjs"`, so ts-loader translated our `import from 'three'` to `require('three')` and webpack resolved that through three's `"require"` exports condition (→ `three.cjs`), while `three-csm` and the `examples/jsm/*` modules resolved through the `"import"` condition (→ `three.module.js`). `src/lib/shaders/WaterShader.js` had a matching legacy `const THREE = require('three')` that pinned the problem in place. Fixed by switching the tsconfig to `module: "esnext"` and rewriting the stray `require()` call as a native import. Bundle size dropped from ~1.59 MiB to ~1.06 MiB just from collapsing the duplicate.
- **`THREE.Clock` deprecation**: Clock is `@deprecated` in r183. Sketchbook used it as a *destructive* stopwatch (three `getDelta()` calls per frame to measure request / logic / render phases), and `THREE.Timer` has non-destructive semantics that would break the existing timing logic. Replaced by a tiny `performance.now()`-based helper inside `World`.
- **Heightfield debug-renderer crash**: the vendored `CannonDebugRenderer.js` called `geometry.computeFaceNormals()` in its `HEIGHTFIELD` branch — a method that only existed on the legacy `Geometry` class, removed from three.js in r125. Fixed first with a one-line patch (`computeVertexNormals()`), then the whole vendored file was retired in favour of `cannon-es-debugger` from npm.
- **Absolute-from-root imports**: four files in `character_states/vehicles/` used `import ... from 'src/ts/vehicles/...'` which only worked because of a `baseUrl: "."` in tsconfig. Dropped when `baseUrl` was cleaned up and the imports switched to relative form.

### Toolchain modernization

- **TypeScript `5` → `6`**. Since TS 6 enables strict mode by default and the codebase was never written for it (~125 pre-existing `any`/null/initialization errors), `strict: false` is explicitly set. Upgrading to strict mode is a dedicated typing pass for another day.
- **`moduleResolution`: `node10` → `bundler`**, `module: commonjs` → `esnext`. Required explicit `.js` extensions on five `three/examples/jsm/*` imports, plus a `declare module '*.css'` shim at `src/ts/declarations.d.ts` for the side-effect CSS import.
- **ESLint + typescript-eslint** replaces the long-deprecated TSLint setup (`tslint.json` was never even wired to an npm script and had drifted out of sync with the code). Flat config at `eslint.config.mjs`. Running `eslint --fix` once auto-corrected ~250 latent tab/space and quote inconsistencies that had accumulated in `World.ts`, `Sky.ts`, `Car.ts`, `LoadingManager.ts`, `CharacterStateBase.ts` and `FunctionLibrary.ts`. An `npm run lint` script was added.

### Vendored code retired in favour of npm packages

The entire `src/lib/utils/` tree is gone. `src/lib/cannon/` is gone. `src/lib/shaders/` now contains only the custom `WaterShader.js`.

| Old (vendored) | New |
|---|---|
| `src/lib/utils/Detector.js` (73 LOC) | `three/examples/jsm/capabilities/WebGL.js` (`WebGL.isWebGL2Available()`) |
| `src/lib/utils/Stats.js` (176 LOC) | [`stats.js`](https://www.npmjs.com/package/stats.js) + `@types/stats.js` |
| `src/lib/utils/dat.gui.js` (2609 LOC) | [`lil-gui`](https://www.npmjs.com/package/lil-gui) (active successor; API-compatible) |
| `src/lib/cannon/CannonDebugRenderer.js` (248 LOC) | [`cannon-es-debugger`](https://www.npmjs.com/package/cannon-es-debugger) |
| `src/css/modules/dat.gui.css` (463 LOC) | dropped; `src/css/modules/statsBox.css` (12 LOC) carved out for the one rule that still matters |

### Dead / orphan code removed

- **jQuery** removed entirely (`@types/jquery` too). `World.generateHTML()` only used it to append `<link>` tags and a couple of DOM fragments; rewritten with `document.createElement` and `insertAdjacentHTML`. Bundle ~80 KiB smaller.
- **`src/ts/world/Sky_old.ts`** — dead since the sky was reimplemented on the official three.js example.
- **`src/ts/physics/colliders/ConvexCollider.ts`** — unreferenced and contained pre-BufferGeometry dead code (`this.mesh.geometry.vertices` / `.faces`, properties that were removed from three.js years ago).
- **`src/ts/physics/colliders/SphereCollider.ts`** — unreferenced orphan.
- **`src/lib/shaders/SkyShader.js`** — unreferenced; three.js' own `Sky` example is already in use via `src/ts/world/Sky.ts`.
- **Stale `cannon` path alias** in `tsconfig.json` and `webpack.common.js`, both pointing at `src/lib/cannon/cannon.js` — a file that hadn't existed in the repo for a long time.
- **Commented-out `three-to-cannon` import** in `TrimeshCollider.ts` referencing a deleted path.
- **`tsconfig.json`** trimmed: `baseUrl`, `paths`, `ignoreDeprecations` all removed.
- **Build output** (`build/sketchbook.min.js`, `build/sketchbook.min.js.LICENSE.txt`, `build/types/**`) is no longer tracked in git; only the hand-placed `build/assets/*.glb` scene/vehicle/character assets remain checked in. Run `npm install && npm run build` after cloning.

### Minor hygiene

- Renamed the `newSky` class to `Sky`. The `new` prefix only made sense while `Sky_old.ts` still existed; now it's gone and the file, class, and import name all agree. three.js' own `Sky` helper is imported under the alias `ThreeSky` to avoid the collision.
- Widened `World.cannonDebugRenderer` to `CannonDebugRenderer | undefined` so the existing "set to undefined on disable" code path is type-correct.

## September 2024 update — [cjmott](https://github.com/cjmott)

> I plan to use Sketchbook as a basis to develop another project, so I have updated the code to run on the latest version of all the packages and switched from cannon.js, which is no longer maintained, to cannon-es.js. This version should build and run locally using `npm`.
>
> The biggest change has involved updating to the new version of THREE.js, which no longer supports the object types `Geometry` and `Face3`, replacing both with `BufferGeometry`. If playing around with the code, it is very important to keep in mind that indexed and non-indexed objects of type BufferGeometry behave very differently. The shape of a non-indexed BufferGeometry is fully defined by its vertices. That is *not* the case for an indexed BufferGeometry.
>
> Note that I have also updated the sky shaders to use an example provided on the THREE.js website. I may do the same with the water shaders, which now look very good but are very resource-intensive.
>
> I do not plan to make regular updates to this fork at the moment, but I may do so in the future.

## February 2023 — [swift502](https://github.com/swift502), final update from the original author

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
