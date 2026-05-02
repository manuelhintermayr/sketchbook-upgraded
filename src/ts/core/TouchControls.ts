// On-screen touch controls. Auto-mounted on touch devices. Synthesises
// the same KeyboardEvent / MouseEvent pairs the existing Joycon layer
// already dispatches (Client.js → document) so the engine doesn't need
// to know about touch at all — InputManager picks them up like any
// other keyboard/mouse input.
//
// Layout: virtual joystick bottom-left for WASD, three action buttons
// bottom-right (jump / action / sprint), and camera-drag anywhere on
// the right half of the screen that isn't a button.
//
// Pattern adapted from manuelhintermayr-portfolio/three-js
// useCustomTouchControls + TouchCircles. The portfolio version pumps
// joystick state into ecctrl's joystick store; here we dispatch
// keyboard events instead to slot into Sketchbook's InputManager
// without touching the engine.

import { t } from '../i18n';

const JOYSTICK_RADIUS = 70;     // px — full deflection at this displacement
const JOYSTICK_DEADZONE = 0.2;  // ignore tiny finger jitter
const SPRINT_AUTO_THRESHOLD = 0.85; // auto-sprint when joystick is at the rim

type DirectionKey = 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD';

interface JoystickState
{
	active: boolean;
	fingerId: number;
	startX: number;
	startY: number;
	currentX: number;
	currentY: number;
}

export class TouchControls
{
	private static initialized: boolean = false;

	private root: HTMLDivElement;
	private joystickBase: HTMLDivElement;
	private joystickThumb: HTMLDivElement;
	private btnJump: HTMLButtonElement;
	private btnAction: HTMLButtonElement;
	private btnSprint: HTMLButtonElement;

	private joystick: JoystickState =
	{
		active: false,
		fingerId: -1,
		startX: 0,
		startY: 0,
		currentX: 0,
		currentY: 0,
	};

	// Track which direction keys we currently hold down so we can release
	// them cleanly when the finger leaves a quadrant.
	private heldDirections: Set<DirectionKey> = new Set();
	private sprintAuto: boolean = false;

	// Camera-drag finger (anywhere on the right half that isn't a button).
	private cameraFingerId: number = -1;
	private cameraLastX: number = 0;
	private cameraLastY: number = 0;
	private canvas: HTMLElement | null = null;

	public static install(): void
	{
		if (TouchControls.initialized) return;
		if (!('ontouchstart' in window) && navigator.maxTouchPoints === 0) return;
		TouchControls.initialized = true;
		new TouchControls();
	}

	private constructor()
	{
		this.root = document.createElement('div');
		this.root.id = 'touch-controls';

		this.joystickBase = document.createElement('div');
		this.joystickBase.id = 'touch-joystick-base';
		this.joystickThumb = document.createElement('div');
		this.joystickThumb.id = 'touch-joystick-thumb';
		this.joystickBase.appendChild(this.joystickThumb);
		this.root.appendChild(this.joystickBase);

		this.btnJump = this.makeActionButton('touch-btn-jump', t('touch.jump'), 'Space');
		this.btnAction = this.makeActionButton('touch-btn-action', t('touch.action'), 'KeyF');
		this.btnSprint = this.makeActionButton('touch-btn-sprint', t('touch.run'), 'ShiftLeft');
		this.root.appendChild(this.btnJump);
		this.root.appendChild(this.btnAction);
		this.root.appendChild(this.btnSprint);

		document.body.appendChild(this.root);

		this.canvas = document.getElementById('canvas');

		this.joystickBase.addEventListener('touchstart', (e) => this.onJoystickStart(e), { passive: false });
		this.joystickBase.addEventListener('touchmove', (e) => this.onJoystickMove(e), { passive: false });
		this.joystickBase.addEventListener('touchend', (e) => this.onJoystickEnd(e));
		this.joystickBase.addEventListener('touchcancel', (e) => this.onJoystickEnd(e));

		// Camera drag — listen on document so we catch any touch outside
		// the control widgets. The handlers ignore touches that landed on
		// a control by checking the target.
		document.addEventListener('touchstart', (e) => this.onCameraStart(e), { passive: false });
		document.addEventListener('touchmove', (e) => this.onCameraMove(e), { passive: false });
		document.addEventListener('touchend', (e) => this.onCameraEnd(e));
		document.addEventListener('touchcancel', (e) => this.onCameraEnd(e));
	}

	private makeActionButton(id: string, label: string, code: string): HTMLButtonElement
	{
		const btn = document.createElement('button');
		btn.id = id;
		btn.className = 'touch-action-btn';
		btn.textContent = label;

		const press = (e: Event): void =>
		{
			e.preventDefault();
			btn.classList.add('pressed');
			this.dispatchKey(code, true);
		};
		const release = (e: Event): void =>
		{
			e.preventDefault();
			btn.classList.remove('pressed');
			this.dispatchKey(code, false);
		};

		btn.addEventListener('touchstart', press, { passive: false });
		btn.addEventListener('touchend', release);
		btn.addEventListener('touchcancel', release);
		// Mouse fallback — handy on hybrid devices.
		btn.addEventListener('mousedown', press);
		btn.addEventListener('mouseup', release);
		btn.addEventListener('mouseleave', (e) =>
		{
			if (btn.classList.contains('pressed')) release(e);
		});

		return btn;
	}

	// --- Joystick ---------------------------------------------------------

	private onJoystickStart(e: TouchEvent): void
	{
		if (this.joystick.active) return;
		e.preventDefault();
		const touch = e.changedTouches[0];
		if (touch === undefined) return;

		const rect = this.joystickBase.getBoundingClientRect();
		this.joystick.active = true;
		this.joystick.fingerId = touch.identifier;
		this.joystick.startX = rect.left + rect.width / 2;
		this.joystick.startY = rect.top + rect.height / 2;
		this.joystick.currentX = touch.clientX;
		this.joystick.currentY = touch.clientY;
		this.joystickBase.classList.add('active');
		this.applyJoystick();
	}

	private onJoystickMove(e: TouchEvent): void
	{
		if (!this.joystick.active) return;
		const touch = this.findTouch(e.changedTouches, this.joystick.fingerId);
		if (touch === null) return;
		e.preventDefault();
		this.joystick.currentX = touch.clientX;
		this.joystick.currentY = touch.clientY;
		this.applyJoystick();
	}

	private onJoystickEnd(e: TouchEvent): void
	{
		if (!this.joystick.active) return;
		const touch = this.findTouch(e.changedTouches, this.joystick.fingerId);
		if (touch === null) return;
		this.joystick.active = false;
		this.joystick.fingerId = -1;
		this.joystickBase.classList.remove('active');
		this.joystickThumb.style.transform = 'translate(-50%, -50%)';
		this.releaseAllDirections();
		this.releaseSprintAuto();
	}

	private applyJoystick(): void
	{
		const dx = this.joystick.currentX - this.joystick.startX;
		const dy = this.joystick.currentY - this.joystick.startY;
		const len = Math.sqrt(dx * dx + dy * dy);
		const clampedLen = Math.min(len, JOYSTICK_RADIUS);
		const nx = len > 0 ? (dx / len) * clampedLen : 0;
		const ny = len > 0 ? (dy / len) * clampedLen : 0;

		// Move the visible thumb (px, relative to base centre).
		this.joystickThumb.style.transform =
			`translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;

		const normX = nx / JOYSTICK_RADIUS;
		const normY = ny / JOYSTICK_RADIUS;
		const magnitude = Math.sqrt(normX * normX + normY * normY);

		// Map quadrants to WASD with a small deadzone.
		this.setDirection('KeyA', normX < -JOYSTICK_DEADZONE);
		this.setDirection('KeyD', normX >  JOYSTICK_DEADZONE);
		this.setDirection('KeyW', normY < -JOYSTICK_DEADZONE);
		this.setDirection('KeyS', normY >  JOYSTICK_DEADZONE);

		// Auto-sprint at the rim — saves the player from juggling a
		// dedicated sprint button while moving.
		const wantSprint = magnitude > SPRINT_AUTO_THRESHOLD;
		if (wantSprint && !this.sprintAuto)
		{
			this.dispatchKey('ShiftLeft', true);
			this.sprintAuto = true;
		}
		else if (!wantSprint && this.sprintAuto)
		{
			this.dispatchKey('ShiftLeft', false);
			this.sprintAuto = false;
		}
	}

	private setDirection(code: DirectionKey, want: boolean): void
	{
		const has = this.heldDirections.has(code);
		if (want && !has)
		{
			this.heldDirections.add(code);
			this.dispatchKey(code, true);
		}
		else if (!want && has)
		{
			this.heldDirections.delete(code);
			this.dispatchKey(code, false);
		}
	}

	private releaseAllDirections(): void
	{
		for (const code of this.heldDirections)
		{
			this.dispatchKey(code, false);
		}
		this.heldDirections.clear();
	}

	private releaseSprintAuto(): void
	{
		if (this.sprintAuto)
		{
			this.dispatchKey('ShiftLeft', false);
			this.sprintAuto = false;
		}
	}

	// --- Camera drag ------------------------------------------------------

	private onCameraStart(e: TouchEvent): void
	{
		if (this.cameraFingerId !== -1) return;
		const touch = e.changedTouches[0];
		if (touch === undefined) return;
		if (this.isOnControlWidget(touch.target as HTMLElement)) return;
		// Right half of the screen only — left half overlaps with the
		// joystick zone.
		if (touch.clientX < window.innerWidth / 2) return;

		this.cameraFingerId = touch.identifier;
		this.cameraLastX = touch.clientX;
		this.cameraLastY = touch.clientY;
	}

	private onCameraMove(e: TouchEvent): void
	{
		if (this.cameraFingerId === -1) return;
		const touch = this.findTouch(e.changedTouches, this.cameraFingerId);
		if (touch === null) return;

		const dx = touch.clientX - this.cameraLastX;
		const dy = touch.clientY - this.cameraLastY;
		this.cameraLastX = touch.clientX;
		this.cameraLastY = touch.clientY;
		this.dispatchMouseMove(dx, dy);
	}

	private onCameraEnd(e: TouchEvent): void
	{
		if (this.cameraFingerId === -1) return;
		const touch = this.findTouch(e.changedTouches, this.cameraFingerId);
		if (touch === null) return;
		this.cameraFingerId = -1;
	}

	private isOnControlWidget(target: HTMLElement | null): boolean
	{
		while (target !== null && target !== document.body)
		{
			if (target.id === 'touch-joystick-base' ||
				target.id === 'touch-joystick-thumb' ||
				target.classList?.contains('touch-action-btn'))
			{
				return true;
			}
			target = target.parentElement;
		}
		return false;
	}

	private findTouch(list: TouchList, id: number): Touch | null
	{
		for (let i = 0; i < list.length; i++)
		{
			if (list[i].identifier === id) return list[i];
		}
		return null;
	}

	// --- Event dispatch ---------------------------------------------------
	// Mirror the Joycon layer (Client.js): keyboard events on document,
	// mouse events on the canvas. InputManager already listens for both.

	private dispatchKey(code: string, pressed: boolean): void
	{
		const evt = new KeyboardEvent(pressed ? 'keydown' : 'keyup', { code });
		document.dispatchEvent(evt);
	}

	private dispatchMouseMove(deltaX: number, deltaY: number): void
	{
		if (this.canvas === null) this.canvas = document.getElementById('canvas');
		if (this.canvas === null) return;

		// Wrap each delta in mousedown / mousemove / mouseup so InputManager
		// processes it whether or not pointer-lock is active. Same trick
		// the Joycon Client.js uses for its mouse synthesis.
		this.canvas.dispatchEvent(new MouseEvent('mousedown'));
		this.canvas.dispatchEvent(new MouseEvent('mousemove', {
			movementX: deltaX,
			movementY: deltaY,
		}));
		this.canvas.dispatchEvent(new MouseEvent('mouseup'));
	}
}
