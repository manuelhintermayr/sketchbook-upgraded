import '../css/main.css';
export { World } from './world/World';

// Procedural sandbox scenes ported from tkkaushik369/socketControl —
// surfaced here so index.html can `new Sketchbook.TestScene()` etc.
// and pass the instance into the World constructor as an alternative
// to a .glb path.
export { TestScene } from './world/sandboxes/TestScene';
export { Test2Scene } from './world/sandboxes/Test2Scene';
export { Test3Scene } from './world/sandboxes/Test3Scene';
export { Example } from './world/sandboxes/ExampleScene';

// Pre-game UI helpers usable directly from index.html before the World
// is built.
export { showTitleScreen } from './world/ui/TitleScreen';
export { installErrorOverlay } from './world/ui/ErrorOverlay';

// Touch controls — auto-installs on touch devices. No-op on desktop,
// so it's safe to import unconditionally.
import { TouchControls } from './core/TouchControls';
TouchControls.install();
