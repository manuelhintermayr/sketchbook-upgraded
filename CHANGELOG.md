# Changelog

All notable changes to this project are documented here. Earlier
versions (0.4 through 0.7) are summarised at the bottom; the bulk of
the file is the 0.8.0 release on top, where every commit is listed
with the same level of detail the README timeline used to carry.

The format follows [Keep a Changelog](https://keepachangelog.com/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

A second wave on the `claude/external-features` branch: animals got a
full overhaul (hierarchical models, voices, real cannon physics, jump),
two new ambient creature managers (birds, butterflies), a procedural
SFX bus that finally fills the silence around player actions, a touch-
controls rewrite, dialog UX fixes for mobile, and a handful of numeric
bug fixes that were hiding behind defensive layers in the audio bus.

### Animals (5-phase pass)

- **Hierarchical models with per-limb animation** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/e995195)) - dogs and cats now build as Three.Groups with body / head / tail / leg / ear handles, replacing the previous InstancedMesh. Per-frame animator drives idle-breathe, walk-cycle, run-cycle and jump pose independently. 18 draw calls instead of 2; modern GPUs eat the trade for the silhouette + motion gain.
- **Procedural voices** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/e63d2e2)) - per-state Web Audio synth: dog bark on approach (square saw + bandpass burst), cat meow when threatened (FM sine sweep), cat purr-loop near tamed cats (LFO-modulated sawtooth). Mouth animation timed off the same voiceTimer the synth ramps. Plus smaller-scale rebalancing + orientation fix.
- **Real cannon physics + collision + jump** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/33e9df2)) - each animal gets a dynamic cannon sphere on the new `Animals` collision group. Cannon resolves terrain, player capsule, and animal-vs-animal contact instead of the manual ground-snap path. Jump is a real arc: kick `body.velocity.y`, gravity pulls back, the body's `collide` event flips airborne off on landing. `airborne` flag decoupled from state so a behaviour transition mid-jump can't strand the vertical physics. Speeds re-tuned to the cat-game reference (walk 3.8, run 8.5), animation driver moved to pure time so the leg-cycle doesn't double-couple to velocity.
- **Tame behaviour: closer follow + face-tracking** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/fec5c1a) / Phase 3) - tamed pets close to 3 m (was 5), face the player every frame even while idle, and the dog pins position + heading inside bark range so it visibly tracks the player while barking.
- **Counts trimmed to a calm baseline** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/6bd1ca6)) - 1 dog, 2 cats, 2 birds, 2 butterflies. The default scene was reading as a busy zoo with the original counts (8 / 10 / 7 / 8).

### New ambient entities

- **Flying birds as positional audio** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/896eec2)) - new `Birds.ts` manager + `BirdSound.ts`: each bird orbits a re-anchored centre on a circular path, flaps wings on a sin-cycle, banks into turns. Per-bird `THREE.PositionalAudio` with FM-chirp synth (sine carrier + sine modulator + bandpass) replaces the old global bird-chirp synth in `AmbientSound`. Chirps fall off with distance instead of playing flat across the world. Each bird carries a kinematic cannon sphere so contact with the player capsule resolves cleanly.
- **Ambient butterflies** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/f4486d5)) - new `Butterflies.ts`: 2 butterflies drift around the player on a Lissajous-style path (cos + sin with co-prime frequency multipliers so motion never loops cleanly). Player-anchored on first update, `HEIGHT_MIN` 0.4 over body-centre + `Y_DRIFT_AMP` 0.25 + a hard floor of 0.2 m so they can't sink below the terrain. Distance-culled at 30 m, DoubleSide wing material, kinematic cannon sphere on the Animals collision group.

### Audio

- **Procedural SFX bus** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/8e2d304)) - new `SfxBus.ts`. Centralises every UI / player-action / race / vehicle / iris SFX so the rest of the codebase only sees `world.sfxBus.playX()`. Each play* method builds its tiny synth on demand and lets the browser GC the nodes once the burst finishes. Hooked into Walk + Sprint footsteps (player only, 0.42 s walk cadence / 0.28 s sprint), Jump kickoff, Drop landing (force-scaled), race checkpoint + lap fanfare, Dialog open whoosh, ProximityPrompt + PauseMenu UI ticks, IrisTransition whoosh, Vehicle crash (350 ms throttle, impact > 4), door clunk, RocketShip liftoff boom. New `Sfx_Sounds` toggle in the Settings folder.
- **Bundled background music** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/30fdb40)) - new `BackgroundMusic.ts`. Looped shuffle through bundled tracks, gated by `params.Background_Music` and scaled by `Master_Volume * Music_Volume`.
- **AmbientSound trimmed** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/896eec2)) - bird-chirp synth, BIRD_GAIN, modulator/carrier/filter/gain and the chirpTimeout scheduler all removed. Wind + water only now; bird audio moved to per-bird PositionalAudio.

### UI

- **Touch controls rewrite** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/2d50e7d)) - virtual joystick now appears anywhere on the canvas (drag-to-spawn) instead of a fixed corner, and the action button cluster is fully context-aware: foot-near-NPC shows E/F, in-vehicle shows brake + vehicle-specific extras (V/X for car/boat, ascend/descend + Q/E yaw for aircraft, ascend/descend for rocket), passenger shows seat-switch only, dialog hides everything. ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/9c29da2)) adds the Q/E aircraft yaw buttons. ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/2be850c)) localises the labels and adds touch-aware prompt strings ("Touch the icon to talk to Anna" instead of "Press E"). ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/b68a94c)) reformats the cluster as a 2-column staircase so the primary action sits over the joystick thumb.
- **NPC dialog overhaul** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/70ec0ad)) - participants are dialogFreeze'd (both player and NPC stop moving and drop their actions), every other on-screen UI surface is hidden via `html.dialog-active`, the NPC rotates to face the player. Esc hint dropped (every dialog has an `end` choice).
- **Mobile dialog layout** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/c86397c)) - on `@media (max-width: 600px)` the dialog splits into two free-standing cards: speech bubble pinned to the top (avatar + speaker + scrollable text band, max-height 28vh), choices float at the bottom of the viewport via `position: fixed`. The list itself becomes a mini-card so the per-button bg tokens (only ~4% alpha) stay readable against the game render. World stays visible in the gap between them. `backdrop-filter` dropped from `.dialog-box` on mobile - it makes the box the containing block for any position:fixed descendant and was pinning the choices to the bubble's bottom.
- **"Map & Scenarios" folder rename + map on top** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/47012ae)) - `Scenarios` folder renamed; `addMapSwitcher` now runs at the start of `loadScene` so the map dropdown lands above the scenario buttons (logical flow: pick world → start scenario).
- **Dark mode toggle in title screen + Settings** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/27eb7f7)).
- **Dark mode reaches the rest of the UI** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/329806b)) - dialog, SweetAlert, lil-gui follow the toggle.
- **Pointer-lock dropped** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/594cb4a)) - drag-to-look only. Pointer-lock was inconsistent across browsers and broke iframe embeds.
- **Shared `#debug-stack` column** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/940b16f)) - FPS box + lil-gui live in the same flex column instead of overlapping.
- **Name labels: 10 m cull + lower y-offset** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/ce77fb8)) - WorldLabels uses Three's `visible` flag now instead of toggling DOM display, cheaper for the CSS2D pass.
- **Welcome dialog mentions recently added features** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/53e048c)).

### Performance / cleanup

- **Drop Bloom + Depth-of-Field** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/ae39cc3)) - the post-FX cost wasn't justifying the visual gain on integrated GPUs. The composer pipeline now ends at FXAA.
- **Outline pass fades at distance** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/b68fa85)) - moon outlines no longer bleed through the earth-side scene.
- **Livelier ocean shader** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/3f59e8b)) - deeper trough, brighter crest, faster scroll.
- **Lawn responds to all entities** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/23ce1cf)) - grass pushers extend to vehicles + animals, lighter base Lambert material so the meadow doesn't go black past the LOD cut.

### Audit follow-ups (post-`989fa06`)

- **Hot-path allocations dropped** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/add8e1e)) - Character.feetRaycast no longer allocates two CANNON.Vec3 + a rayCastOptions object every physics step (module-scoped scratches reused across characters); Character.inputReceiverUpdate's viewVector copies into the existing field-bound vector instead of replacing it; Grass.refreshPushers pools its candidate objects in a grow-only field array; WorldLabels switches to squared-distance to drop one Math.sqrt per label per frame.
- **Audio helpers extracted** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/49e4d75) + [commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/82e24b3)) - new `audio/AudioHelpers.ts` exports `getMasterVolume(world)` (replaces 6 inline copies) and `ensureAudioListener(world)` (replaces 4 lazy-create-and-attach blocks). Speaker's `<audio>` + `<source>` DOM construction also moved here as `createMediaAudioElement(audioUrl)`, so the Speaker class no longer touches DOM directly.
- **mulberry32 PRNG dedupe + audio file moves** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/cf00079)) - mulberry32 lifted from three duplicate copies (Birds / Butterflies / WanderingAnimals) into core/FunctionLibrary; BirdSound + AnimalVoices moved from `world/animals/` to `world/audio/` (they're audio classes, not tier-specific). Plus three quick-wins: Character moveVector strict `=== 0` -> `lengthSq() < 1e-6` epsilon, Ocean.getWaveHeightAt's per-call lambda + Math.PI/180 inline -> module-scoped DEG2RAD constant, Butterflies distance cull moved BEFORE the body.position write so far-away butterflies stop hitting cannon's broadphase.
- **Master_Audio master mute switch** - new `params.Master_Audio` flag, default reads `localStorage['sketchbook.soundMuted']` (so the title-screen mute button persists). When off, every audio source goes silent: `getMasterVolume` returns 0 for the continuous synths, and `World.applyAudioListenerVolume()` zeroes the THREE.AudioListener for the 3D-positional path (BirdSound / CharacterSfx / Speaker). Sub-toggles in the settings UI grey out while master is off; toggling either side (title, settings, debug panel) mirrors the `sketchbook.soundMuted` key so all three views stay in sync.
- **Sound_Effects unified flag** - the three internal toggles (Engine_Sound / Ambient_Sound / Sfx_Sounds) collapsed into one player-facing `Sound_Effects` flag. EngineSound, AmbientSound, BirdSound, SfxBus, CharacterSfx and AnimalVoices all gate on this single flag; Background_Music keeps its own toggle.
- **Sun_Cycle rename + dependent toggle** - `Has_Day_Night_Cycle` renamed to `Sun_Cycle` in params + UI (the old name only described half of what it does - "automatic sun movement"). `Has_Night_Time` now greys out via lil-gui's `enable(false)` while Sun_Cycle is off, since it has no effect there.
- **Map & Scenarios folder reorder** - the lil-gui scenario folder now nests a `Scenarios` sub-folder lazily on first launch link, so the layout is `Map dropdown` first (top), `Scenarios` collapsible second. Plus all top-level folders (Map & Scenarios, World, Vehicles, Settings) ship collapsed by default; only the root gui is open. Force-close after gui.load so a previous session's open state doesn't leak through.
- **Title screen + Settings UX** - title-screen has a sound mute icon next to the dark-mode toggle (writes `sketchbook.soundMuted`); Settings modal grew a `General` card on top with language picker (en / de / es, reload via iris-wipe) + Dark mode + Reset-settings button (wipes every persisted key + reload). i18n's `formatPrompt` keycap regex extended for German / Spanish key names.
- **Settings persistence on every change** - SettingsModal.write now calls `gui.save()` directly after `controller.setValue`. Lil-gui only fires `onFinishChange` on slider drag-end, not on toggle clicks, so a modal toggle would otherwise not persist until the player touched a slider too.
- **Bidirectional sync between Settings + lil-gui debug panel** - SettingsModal hooks `gui.onChange` (gui-wide event); when the modal is open, any value change in the debug panel re-fires the matching modal toggle / range so both views always show the same state.
- **ProximityPrompt safety net** - per-frame `update()` now does a redundant distance check (throttled to every 10th frame) and force-hides the prompt label if the player has drifted past 2x the configured radius. Catches stale labels left behind by a desynced TriggerCube enter/exit pair (player teleport, dialogFreeze yanking velocity, NPC moving past at speed).
- **Bird + Butterfly fixed-Y band** - the swarms used to anchor on the player's spawn-time y, leaving them stranded in the sky on maps where the player drops to ground after spawn. Both managers now use absolute world-Y bands (Butterflies 1.0..1.5 m, Birds 5..14 m) for height; X/Z stay player-relative so the swarm stays in view horizontally.
- **Labels unified gate** - the old `Animal_Labels` flag renamed to `Labels` and now gates the player tag ("Du") and NPC name tags too (the player + NPC labels were always-on previously). Default `true` so all tags ship visible; one toggle hides the lot.
- **Outlines default off** - the depth-Sobel toon outline costs ~10-15 FPS on integrated GPUs. Default flipped back to off (was off in 0.8.0 too); the High preset still flips it on, players who want the look can enable it explicitly.
- **FPS counter actually starts shown** - `Debug_FPS` default `true` was set on the params object but `UIManager.setFPSVisible` wasn't called at boot (only on the lil-gui onChange), so the counter stayed hidden until the player toggled it twice. Apply the initial state once after the controller is registered.
- **Per-character PositionalAudio** - footsteps / jump / land / door clunk moved from the global SfxBus to per-Character `CharacterSfx` instances, each with their own THREE.PositionalAudio attached to the body (refDistance 4, rolloff 1.5, maxDistance 35). NPCs get their own audio too - Anna walking the loop now fades with distance, AI driver's door clunk lands at the vehicle, not the player.
- **AmbientSound water gate tightened** - cam.y < 25 (matches almost any spawn) -> `Math.abs(cam.y - 12) < 10` (only when the player is within 10 m of the ocean's y-level). Spawn-pad players no longer hear surf they aren't near.

### Fixed

- **RocketShip liftoff stage NaN** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/4cd340c)) - root cause: `LIFTOFF_STAGES` has 4 entries, but `stage` was incremented without a bound check. If the player drops `enginePower` mid-ascent the climb slows below the targetY cutoff, `stage` hits 4, `LIFTOFF_STAGES[4]` is undefined, undefined * enginePower = NaN, and that NaN seeps into `body.velocity` → EngineSound throws `'AudioParam.value: non-finite'`. Fix clamps the index with `Math.min`; EngineSound also got a defensive layer (frame-skip on non-finite speedSq + reset `this.rpm` to IDLE_RPM if it has accumulated NaN).
- **Critical numeric + leak bugs from the audit pass** - three independent guards: (1) Car / Boat gear off-by-one - `gearsMaxSpeeds[gear-1]` returned undefined at gear 0, divisor went NaN, engine force wrote NaN into cannon's body.velocity; clamp gear to `[1..maxGears]` before the lookup. (2) `SimulatorBase` `1 / fps` with fps = 0 yielded Infinity; clamp `Math.max(1, value)` in constructor + `setFPS`. (3) Cannon body 'collide' listeners on WanderingAnimals + Vehicle were anonymous functions that pinned the entity in memory across scenario switches; stash the listener as a field, removeEventListener in `removeFromWorld`. Verified via heap snapshot diff: Body count grows ~+13 over 10 scenario switches now (was ~+250).
- **Per-character positional SFX** - footsteps / jump / land / door clunk moved out of the global `SfxBus` into a new `CharacterSfx` attached per Character (player + NPCs alike), modelled exactly like `EngineSound` per Vehicle. Each character emits its own sounds through a `THREE.PositionalAudio` with `refDistance: 4`, `rolloff: 1.5`, `maxDistance: 35`, attenuated by the listener-on-camera. Anna walking the loop now fades with distance instead of needing a behaviour gate; an AI driver entering its vehicle gets the door clunk at the vehicle, not at the player. The earlier "is player" guards (`world.characters[0] === this.character` and the later `behaviour === undefined` fallback) are gone - every character has audio. Initial step timer in Walk / Sprint dropped to 0 so the first step lands the moment the state is entered instead of waiting half an interval. `SfxBus` keeps the player-UI sounds: race checkpoint + lap, dialog whoosh, ProximityPrompt + PauseMenu ticks, IrisTransition, vehicle crash and rocket boom.
- **Camera no longer clips through floor on steep down-look** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/5cf4610)).
- **Wheels locked to chassis at speed** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/6cd2387)) - cannon-es interpolation timing matched.
- **Tamed pets stop spinning when player wanders off** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/fec5c1a)).
- **Em-dashes replaced repo-wide with hyphens** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/3030b3f)).

## [0.8.0] - 2026-05-02

The first big release of the `claude/external-features` branch:
front-of-screen UI overhaul, a wave of new gameplay features, and a
long performance + architecture pass. ~50 commits, ~50% of `World.ts`
deleted, three new `world/` subfolders, ~3500 per-second allocations
eliminated from hot paths.

### UI

- **Design tokens** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/e0970713087556920b1ce28d259923068035cbfb)) - central `tokens.css` (~50 colour / typography / spacing / shadow / motion custom properties; `class="dark"` on `<html>` flips the surface palette to dark mode). All existing CSS modules refactored to reference the tokens - no more scattered magic numbers.
- **Title screen** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/e0970713087556920b1ce28d259923068035cbfb)) - bouncing cube + "press any key" gate that doubles as the audio-autoplay user gesture.
- **Loading screen** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/e0970713087556920b1ce28d259923068035cbfb)) - live percentage + bar driven by `LoadingManager`.
- **Pause menu** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/e0970713087556920b1ce28d259923068035cbfb)) - opens on Esc and actually pauses (timeScale=0, exits pointer lock, restores prior state on Resume) with Resume / Settings / Restart Scenario / Reload.
- **Settings modal** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/e0970713087556920b1ce28d259923068035cbfb)) - Graphics / Audio / Controls cards that write through lil-gui controllers so every existing `onChange` handler (CSM, pointer-lock, mouse sensitivity) keeps firing.
- **Quality presets in Settings** - graphics card opens with a Low / High preset row that flips Shadows + Outlines + Bloom + Depth of Field together. The individual toggles still work for fine-tuning; the presets are shortcuts for the four settings that matter most for FPS on integrated GPUs and mobile.
- **Branching NPC dialog** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/e0970713087556920b1ce28d259923068035cbfb)) - layered on top of `ProximityPrompt` (portrait, speaker line, numbered choices, mouse + 1–9 keys, auto-closes when the player walks away - Anna / Ben / Carla / Dieter all got hand-written 3-node trees explaining the world).
- **Dialog typewriter** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/08f05dc281dfe962df47acc0faa353e327fcfe6c)) - NPC dialog text reveals one character at a time (28ms cadence). Choices stay hidden until the line finishes. Click the bar or press E / Enter / Space to skip.
- **Error overlay** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/e0970713087556920b1ce28d259923068035cbfb)) - catches `window.onerror` + `unhandledrejection` into a frosted card with stack + Reload + Copy details.
- **Floating CSS2D name tags** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/e0970713087556920b1ce28d259923068035cbfb)) - player tagged "Du" in blue, NPCs in their own names.
- **Iris transition** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/4c887795129adefc4a9adb82577ef65bea37c0d9)) - singleton CSS clip-path overlay (700ms cubic-bezier circle wipe). Wired into the map switcher, scenario restart, and pause-menu reload - replaces the earlier white-flash `location.reload()` look with a clean black iris.
- **Centralised world labels** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/cc03c9d3333de6dc261c3b453d1537bf7195b539)) - `WorldLabels` registry on top of the existing CSS2DRenderer that adds distance culling and feature-flag gating. `attachNameLabel` keeps its old signature (back-compat) and gains options for `maxDistance`/`feature`. Wandering animals use it for opt-in "Hund" / "Katze" tags.
- **Touch controls** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/3dd1be5548ec0cc77cafd45141b0bb04498d2bba)) - virtual joystick + jump / action / sprint buttons + drag-to-look camera area, auto-mounted on touch devices. Synthesises KeyboardEvent / MouseEvent pairs so InputManager handles them as if from a hardware keyboard / mouse.
- **i18n + language picker** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/dbbe34030fe6384fd22953899fecb31d730fef3f)) - flat translation table (en / de / es), `t(key, vars)` lookup, persisted to `localStorage`. Title screen shows a language picker at the bottom; pause menu, settings modal, and error overlay are translated.
- **HUD controls list fixes** - two related bugs: X (Switch seats) now shows in the driving HUD whenever the vehicle's GLB authored connectedSeats (Car / Helicopter), and the HUD no longer freezes on the AI-driver vehicle's controls list at scenario start. Previously `Character.startControllingVehicle` ran `vehicle.inputReceiverInit()` for AI-driven vehicles too, overwriting the player's WASD list before the player had moved.
- **Common controls helper** - extract the duplicated on-screen-help rows shared across Character + 5 vehicles (V / F / Shift+R / Shift+C) into `commonGlobalControls()` + `commonVehicleControls()` in `core/CommonControls.ts`. Cuts 18 duplicated bullet rows down to 5 central definitions; future tweaks to a global shortcut now touch one file instead of six.

### New Features

- **Camera Shake** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/b9dd34c550f8da366970f9a0009558fa77af45f7)) - sineNoise-based per-frame camera offset triggered by vehicle hard landings; static fire-and-forget API, three presets (collision / land / boost), quadratic decay envelope, toggle in Settings.
- **Stuck / flip auto-recovery** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/cf9cb1060d441713e23e4e8630a817a46bf12c72)) - Vehicle base method that watches a per-frame distance-traveled window and an upside-down timer; lifts and yaw-resets when either threshold trips, fires a `collision` camera shake on recovery. Per-subclass opt-out (boats / rockets fully off, air vehicles flip-only).
- **Auto-recovery threshold widened: 100° → 80°** - `UPSIDE_DOWN_THRESHOLD` was inherited from Inthenew at `cos(100°)`, which means a vehicle had to be tilted past 100° from vertical (i.e. genuinely upside-down) before flip-recovery would even start counting. A heli or car that landed cleanly on its side at 90° was below the threshold and just stayed there. Drop to `cos(80°)` so anything past horizontal counts; a 45° hill still reads upY ≈ 0.7 so non-flipped parked vehicles aren't caught.
- **Procedural engine sound** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/181e92140fa35381ea41f6ba234175943d8dbf6e)) - per-vehicle Web Audio synthesiser (2-layer exhaust + intake), RPM modulated by chassis speed, five timbre profiles (car / heli / airplane / boat / rocket). Master_Volume routes through the same slider that already drives THREE.AudioListener for positional audio.
- **Outline effect** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/32449e442e2a3080c8fd540ca3a3b6b307017889)) - depth-Sobel pass: pre-renders the scene's linear depth to a render target, then blends a Sobel kernel over the framebuffer via a fullscreen quad. Plays well with the existing FXAA composer, no shader rewrite needed; toggle in Settings.
- **Ambient soundscape** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/1573870e6fff3b17e4e5c04e38dc40eb876cd839)) - procedural wind / bird-chirp / water Web Audio synthesis with proximity-gated water gain (only audible near the ocean). Same Master_Volume bus as engine + positional audio.
- **Wandering animals** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/4c5a13e8c121fa5c4d1663de764b4526f375e1e5)) - 8 dogs + 10 cats spawned deterministically around the Inthenew spawn, each running a small state machine (idle / wander / approach / bark / flee / tame). Geometry merges primitive shapes - no GLTF asset; ground height is queried via cannon raycast so the animals adapt to any map.
- **Star field at night** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/5037501e5807a68853d608bf735ad90802bd4f33)) - 2000 points on the upper hemisphere of a camera-anchored shell with a twinkle shader. nightFactor is derived from sun position, so they fade in at dusk and stay full in space.
- **Bloom + Depth-of-Field** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/34920c47808b0b1d560fc9893e2b79222311d688)) - three's `UnrealBloomPass` + `BokehPass` added to the existing composer pipeline; bloom strength ramps at night, DoF focus tightens while driving. Toggles per pass - no new dependency.

### Performance

- **Pool Vector3 / Quaternion scratches in physics paths** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/3c03ef3ce2dc5af26779994ad155535991295583)) - `physicsPreStep` / `physicsPostStep` / wheel-update / springRotation across Helicopter, Airplane, Car, Vehicle and Character ran at 60 Hz per instance and allocated ~3500 throwaway objects per second. Move them to module-scoped scratches that get `.set()` / `.copy()` into each call. Pure GC pressure relief.
- **Clamp renderer pixelRatio** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/0b4734efed746ae72507d97e5678b7662f43a1cd)) - cap `setPixelRatio` at 2. Phones and tablets often report DPR 3–4 which forces the GPU to render 9–16× the pixels per frame for sharpness gains the eye barely registers past 2×. Desktop displays unaffected.
- **Halve CSM shadow map size** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/efb5dd48d8bbc819e3442b788a96168bb506d09b)) - `shadowMapSize` 2048 → 1024 across the 3 cascades. Drops shadow-pass work from ~12.6 MP/frame to ~3.15 MP and saves ~37 MB VRAM, with barely visible quality loss on an organic sandbox scene.
- **GPU shader pre-compile** - `LoadingManager.doneLoading` now awaits `renderer.compileAsync(scene, camera)` before lifting the loading screen. Three.js otherwise compiles each unique material+light permutation lazily on first sight, which causes a 20–200 ms frame stall the first time the player turns toward an as-yet-unrendered car / NPC / ocean tile. compileAsync walks the scene up front and yields between programs so the loading screen stays responsive.
- **Outline pass - layer skip + distance-aware threshold** - the depth pre-pass that drives the toon outline shader used to render the entire scene under an override material, including 300k grass-blade instances, 2000 star points, the sky shell, both celestial bodies, and the wave tiles. New `RenderLayer.OutlineSkip` layer (in `enums/RenderLayers.ts`); Sky/Stars/Earth/Moon/Grass/Ocean opt onto it; `OutlineEffect.renderPass` strips that bit on the camera before the depth pre-pass and re-enables it after. Sobel shader gains a `depthFalloff` term so distant pixels need a bigger depth gap to register as an edge, killing the flicker that linear-depth precision used to produce on far terrain. Net: depth pre-pass goes from "everything in the scene" to "Character + Vehicles + NPCs + buildings only".
- **Outline depth RT: HalfFloat instead of Float** - the depth pre-pass writes a normalised value in [0..1] that the Sobel kernel only ever compares against a 0.003 threshold, so 32-bit float per channel was overkill. Switching the render-target to `HalfFloatType` halves its VRAM and write/read bandwidth (~16 MB → 8 MB at 1080p, more on Retina) with no visible quality change.
- **Outline pass: scale-invariant threshold + skinned-mesh fix** - the custom DEPTH_VERTEX shader sampled `position` directly, so SkinnedMesh characters and animated NPCs rendered into the depth RT in *bind pose* - the Sobel kernel then drew the outline of the rest-position skeleton offset from the actually-animated body on screen. Switch the override to `THREE.MeshDepthMaterial`, which wires the skinning + morph-target chunks via three's standard pipeline. Depth threshold becomes ratio-based (`edge / max(avgDepth, 1e-6)` against a tunable `relativeThreshold`); a clean object-vs-background silhouette gives ratio ≈ 8 at every distance, smooth interior surfaces stay near 0.
- **Animal raycast throttle** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/60daa7d24bde7dab4e6d274848e409096c0d4b8a)) - ground-height ray for each wandering animal now fires every 100 ms instead of every frame, with a per-animal stagger so they don't all sample the same tick. Y-position lerps between samples so motion stays smooth. Cuts ~1080 raycasts/sec on the default spawn down to ~180.
- **Animal frustum culling** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/b9e1f60d0cf327138c1716bbb2ed3f8995088473)) - per-animal AABB check skips updates for off-screen instances.
- **SettingsModal lil-gui controller cache** - `SettingsModal.findController` walked `gui.controllersRecursive()` and linear-searched the result on every settings change. With ~40 controllers across the lil-gui folder tree, that's a fresh tree-walk and ~40 string compares for *every* `input` event a slider drag fires (30–50 per drag). Build the index once on the first lookup and cache it as a `Map<string, controller>` - drag now resolves through O(1) `Map.get`. Lazy-built so the cache catches the gui after World finishes wiring it up.
- **defaultDialogs locale-keyed cache** - `getDefaultDialogs()` is called once per scenario launch but the same tree was rebuilt from scratch on every Shift+R / map-switch even when the player hadn't touched the language. Add a module-level cache keyed on the current locale so a stable language reuses the previous tree; the moment the title-screen language picker fires it invalidates and the next launch rebuilds in the new locale.
- **Hoist defaultDialogs out of NPC spawn loop** - `getDefaultDialogs()` builds the full Anna/Ben/Carla/Dieter dialog tree (≈ 36 i18n lookups + four nested object literals). It was being called *inside* the NPC spawn loop in `injectDefaultSceneNPCs`, so each scenario launch reconstructed the entire tree once per NPC (4×). Hoist the call ahead of the loop - single build per launch.
- **MapSwitcher: drop redundant validValues array** - `addMapSwitcher` was building a fresh `string[]` of all valid map ids just to call `.indexOf(stored)` on it once. Replace with a direct `for ... in` lookup against the existing `choices` map - same logic, no intermediate allocation.

### Refactoring / Internals

- **world/ folder reorganisation + World god-class split** - `src/ts/world/` had ~26 files at root (spawn points, UI overlays, scenarios, render entities, postprocess) and a 1306-LOC `World` class doing renderer setup, HTML scaffolding, lil-gui wiring, scene loading, NPC injection, and orchestration all at once. Group cohesive feature domains into subfolders (`world/spawn/`, `world/ui/`, `world/scenarios/`) and pull six setup-shaped responsibilities out of World into single-function helpers under `world/setup/` and `world/loading/`: `bootstrapHTML`, `setupRendererPipeline`, `addMapSwitcher`, `injectDefaultSceneNPCs`, `injectWanderingAnimals`, `createParamsGUI`, plus `loadScene` for the GLTF userData dispatcher. World.ts: 1306 → 636 LOC (-51%); root of `world/` dropped from 26 files to 14, with the rest grouped by domain. Pure relocation - public surface (`world.renderer`, `world.composer`, etc.) preserved so the four external consumers (LoadingManager, OutlineEffect) still work unchanged.
- **Vehicle.ts: extract StuckRecovery helper** - the stuck/flip auto-recovery logic (sample window, flip timer, cooldown, lift+yaw-only reset) was ~110 LOC inline on the Vehicle base - three concerns mixed into one class. Pull it into `vehicles/StuckRecovery.ts` as a self-contained helper that takes a `(body, noDirectionPressed)` pair in its constructor. Vehicle holds an instance, calls `update(timeStep)` while a driver is in the seat and `reset()` otherwise. Subclasses that opt out (Helicopter / Airplane stuck-only, Boat / Rocket both gates) flip the public flags on the helper instead of on Vehicle itself. Vehicle.ts: 685 → ~575 LOC, behaviour preserved 1:1.
- **Audio base class extraction** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/53bd1ac34d1fa8042c2a222c998bd7a55554d5e5)) - pull the shared Web Audio plumbing (shared `THREE.AudioListener` context, master gain, lifecycle) out of `EngineSound` / `AmbientSound` into a `ProceduralAudio` base. All four audio modules moved under `world/audio/`. Stops every audio source from spinning up its own `AudioContext` (browsers cap around 6 per tab).
- **Animal Dog/Cat strategy split** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/b9e1f60d0cf327138c1716bbb2ed3f8995088473)) - the per-species AI lives in `DogBehavior` / `CatBehavior` strategy classes, while the shared idle/wander/tame logic stays in an `AnimalBehavior` base. Each behaviour is exported as a singleton - stateless, one instance shared across every animal.
- **Semantic UpdateOrder enum** ([commit](https://github.com/manuelhintermayr/sketchbook-upgraded/commit/01ebcb68c8a7b7e0257b873692c0df42b00d847c)) - replace 17 hand-picked `updateOrder` magic numbers (`1`, `2`, `3`, `4`, `5`, `6`, `10`, `11`, `12`, `13`, `14`, `15`) with named slots (`CharacterPhysics → VehiclePhysics → Input → Camera → Environment → Scenarios → World → Audio → Triggers → Prompts → Labels → PostCamera`), spaced by 10 so a new slot can squeeze between two existing ones without renumbering. Relative order preserved 1:1 - pure naming/documentation. Also fixes two stale comments that cited the old wrong values.

### Fixed

- **RocketShip flight-timer cleanup on world removal** - `RocketShip` keeps five `setInterval` handles for the liftoff staging, the cruise velocity push, and the descent velocity push. A scenario switch (Shift+R, map change) mid-flight removed the rocket from the world but left the timers ticking - they kept writing into a detached cannon body's `velocity` / `position` until eventually a stale `clear` from the next scenario landed. Override `removeFromWorld` to call the existing `stopLiftoff` / `cancelTravelTimers` / `cancelDropTimers` and hide the planet menu so dangling listeners can't fire either.
- **Speaker pendingResume queue cleanup** - `Speaker.pendingResume` is a static array that parks audio elements waiting for the first user gesture (browser autoplay policy). Once a click or keypress lands the queue plays everything and clears. If a scenario switch happens *before* that first gesture though, the Speaker's `removeFromWorld` only paused and detached the dom element - the static array still held a reference, blocking GC, and the eventual gesture would call `.play()` on a removed dom node. `removeFromWorld` now splices the element out of the queue so the static state stays in sync with what's actually live.

## [0.7.5] - 2026-03

Notblox features port ([iErcann](https://github.com/iErcann)).

### Added

- **TriggerCube** + **ProximityPrompt** entity pair from
  [iErcann/Notblox](https://github.com/iErcann/Notblox), reshaped for
  single-player. The multiplayer / ECS layer is dropped, the entities
  themselves become single-player Sketchbook-style classes. They
  underpin in-game NPC interaction prompts and any future "step into
  a zone to do X" mechanic.

## [0.7.0] - 2025-11

socketControl features port ([tkkaushik369](https://github.com/tkkaushik369)).

### Added

- Curve-based race tracking with checkpoint planes.
- Instanced grass field with LOD.
- 3D positional audio Speaker.
- CylinderCollider + SphereCollider.
- ShapeSpawnPoint for dynamic box/sphere primitives.
- NPC system (standing or path-following) with floating name tags via
  a CSS2D pass.
- sketchbook v0.3 + v0.4 maps from socketControl.
- Four code-built sandbox scenes (`test`, `test2`, `test3`, `example`).
- Scenarios-panel map switcher.
- THREE.js Editor compatibility (`ThreejsEditor/project.json`).

### Skipped

- Water (Inthenew's wave ocean is better), extended character states
  (already in upstream), all multiplayer / ECS / networking plumbing.

## [0.6.0] - 2025-08

[Inthenew](https://github.com/Inthenew) port - day / night cycle,
boats, rocketship.

### Added

- Day / night cycle with sky shader and sun position controls.
- Wave-based ocean with vertex displacement and a height query that
  boats actually ride; replaces the original flat water.
- Boats with wave-aware physics and a Boat Race scenario.
- Lap tracking on the three car races.
- Rocketship - chassis, smoke particles, planet-select modal,
  Earth ↔ Moon flight + auto-landing.
- Earth + Moon visible as celestial bodies; lunar gravity (~1.62
  m/s²) on the moon.
- Vehicles GUI tuning sliders.
- Free-camera quality-of-life: `T` teleport, `Z` overlay toggle,
  return-to-forward slerp.

### Notes

Inthenew squashes upstream commits, so each feature was re-ported
individually with `--author="inthenew <matthew@slocum.io>"` and the
original date. The level (`build/assets/world.glb`) was replaced with
Inthenew's so all the hand-tuned coordinates stay in sync.

Asset re-creation: Inthenew's upstream hotlinked six third-party
images that couldn't legally be vendored (DeviantArt fan-art, an
anonymous Imgur upload, Farmers Almanac and Adobe Stock photos, a
Future plc CDN asset, a Wikimedia photo with attribution
requirements). All replaced with DALL-E generated equivalents shipped
under `src/img/`.

## [0.5.1] - 2024-09

[cjmott](https://github.com/cjmott) toolchain modernisation.

### Changed

- Updated the codebase to run on the latest version of all packages.
- Switched from `cannon.js` (no longer maintained) to `cannon-es`.
- Updated to the new version of THREE.js, replacing `Geometry` and
  `Face3` with `BufferGeometry`.
- Updated the sky shaders to use a THREE.js example.

### Follow-up: 2026-04 - version 0.4.1.2

A second pass on top of cjmott's work: dependencies updated to
current versions (TypeScript 6, ESLint, three.js r183, webpack 5),
legacy in-repo utility copies replaced with maintained npm packages
(lil-gui, stats.js, cannon-es-debugger), unused legacy files dropped.
Behaviour and architecture preserved.

## [0.5.0] - 2024-02

Joy-Con port ([barhatsor](https://github.com/barhatsor)).

### Added

- Joy-Con / gamepad support originally written by
  [Bar Hatsor](https://github.com/barhatsor) in
  [benhatsor/Joycon-Sketchbook](https://github.com/benhatsor/Joycon-Sketchbook).
  Original commits preserved via `format-patch` / `am`.

### Notes

The controller layer only synthesises keyboard/mouse events, so the
engine itself is untouched. The unpinned `cdn.cde.run/Joycon.min.js`
was vendored under `vendor/joycon/`.

## [0.4.0] - 2023-02

Final update from the original author
[swift502](https://github.com/swift502).

> As I have no more interest in developing this project, it comes to
> a conclusion. […] If you wish to modify Sketchbook feel free to
> fork it.
