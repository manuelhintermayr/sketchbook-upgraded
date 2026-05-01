import { World } from './World';

// Settings modal opened from the pause menu. Each control writes its
// value into world.params and forwards through the matching lil-gui
// controller's setValue() so existing onChange wiring (shadow CSM,
// pointer-lock toggle, mouse sensitivity, etc.) fires too. That keeps
// the lil-gui debug panel and this modal as two views over one source
// of truth.
export class SettingsModal
{
	private world: World;
	private overlay: HTMLDivElement;
	private isOpen = false;

	constructor(world: World)
	{
		this.world = world;
		this.overlay = this.build();
		document.body.appendChild(this.overlay);
	}

	public open(): void
	{
		if (this.isOpen) return;
		this.isOpen = true;
		this.refresh();
		this.overlay.classList.add('visible');
	}

	public close(): void
	{
		if (!this.isOpen) return;
		this.isOpen = false;
		this.overlay.classList.remove('visible');
	}

	// Pull every control back to the current params value — called on
	// open so the modal reflects whatever the lil-gui panel has done
	// in the meantime.
	private refresh(): void
	{
		const p = this.world.params;
		this.setRange('Master_Volume', p.Master_Volume);
		this.setRange('Music_Volume', p.Music_Volume);
		this.setRange('SFX_Volume', p.SFX_Volume);
		this.setRange('Mouse_Sensitivity', p.Mouse_Sensitivity);
		this.setRange('Free_Cam_Speed', p.Free_Cam_Speed);
		this.setRange('Gravity_Scale', p.Gravity_Scale);
		this.setToggle('Shadows', p.Shadows);
		this.setToggle('FXAA', p.FXAA);
		this.setToggle('Pointer_Lock', p.Pointer_Lock);
		this.setToggle('Has_Day_Night_Cycle', p.Has_Day_Night_Cycle);
		this.setToggle('Debug_FPS', p.Debug_FPS);
	}

	private build(): HTMLDivElement
	{
		const wrap = document.createElement('div');
		wrap.id = 'settings-modal';
		wrap.innerHTML = `
			<div class="settings-container">
				<div class="settings-header">
					<h2 class="settings-title">Settings</h2>
					<button class="settings-close" data-close aria-label="Close">&times;</button>
				</div>

				<div class="settings-card">
					<h3>Graphics</h3>
					${this.toggleRow('Shadows', 'Shadows', 'Cascaded shadow maps')}
					${this.toggleRow('FXAA', 'Anti-aliasing', 'FXAA post-process')}
					${this.toggleRow('Has_Day_Night_Cycle', 'Day / night cycle', 'Sun moves automatically')}
					${this.toggleRow('Debug_FPS', 'FPS counter', 'Show stats.js box')}
				</div>

				<div class="settings-card">
					<h3>Audio</h3>
					${this.rangeRow('Master_Volume', 'Master volume', 0, 100, 1, 'All in-world positional audio')}
					${this.rangeRow('Music_Volume', 'Music', 0, 100, 1, 'Reserved — no separate music bus yet')}
					${this.rangeRow('SFX_Volume', 'Sound effects', 0, 100, 1, 'Reserved — no SFX bus yet')}
				</div>

				<div class="settings-card">
					<h3>Controls</h3>
					${this.rangeRow('Mouse_Sensitivity', 'Mouse sensitivity', 0, 1, 0.01, 'Camera look speed')}
					${this.rangeRow('Free_Cam_Speed', 'Free-camera speed', 1, 100, 1, 'Shift+C movement')}
					${this.rangeRow('Gravity_Scale', 'Gravity scale', 0, 2, 0.05, '0 = zero-g, 1 = Earth, 2 = double')}
					${this.toggleRow('Pointer_Lock', 'Pointer lock', 'Click captures the cursor')}
				</div>

				<div class="settings-footer">
					<button class="btn-gold" data-close>Done</button>
				</div>
			</div>
		`;

		wrap.addEventListener('click', (e) =>
		{
			if (e.target === wrap) this.close();
		});
		wrap.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) =>
		{
			b.addEventListener('click', () => this.close());
		});
		wrap.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((input) =>
		{
			input.addEventListener('input', () => this.applyRange(input));
		});
		wrap.querySelectorAll<HTMLButtonElement>('.toggle').forEach((toggle) =>
		{
			toggle.addEventListener('click', () => this.applyToggle(toggle));
		});

		return wrap;
	}

	private toggleRow(key: string, label: string, desc: string): string
	{
		return `
			<div class="setting-row">
				<div>
					<div class="setting-label">${label}</div>
					<div class="setting-desc">${desc}</div>
				</div>
				<div class="setting-control">
					<button type="button" class="toggle" data-toggle="${key}" aria-label="${label}"></button>
				</div>
			</div>
		`;
	}

	private rangeRow(key: string, label: string, min: number, max: number, step: number, desc: string): string
	{
		return `
			<div class="setting-row">
				<div>
					<div class="setting-label">${label}</div>
					<div class="setting-desc">${desc}</div>
				</div>
				<div class="setting-control">
					<input type="range" min="${min}" max="${max}" step="${step}" data-range="${key}">
					<span class="setting-value" data-value="${key}">0</span>
				</div>
			</div>
		`;
	}

	private setRange(key: string, value: number): void
	{
		const input = this.overlay.querySelector<HTMLInputElement>(`[data-range="${key}"]`);
		const valueEl = this.overlay.querySelector<HTMLSpanElement>(`[data-value="${key}"]`);
		if (input) input.value = String(value);
		if (valueEl) valueEl.textContent = formatValue(value);
	}

	private setToggle(key: string, value: boolean): void
	{
		const toggle = this.overlay.querySelector<HTMLButtonElement>(`[data-toggle="${key}"]`);
		if (toggle) toggle.classList.toggle('active', !!value);
	}

	private applyRange(input: HTMLInputElement): void
	{
		const key = input.dataset.range || '';
		const numeric = parseFloat(input.value);
		const valueEl = this.overlay.querySelector<HTMLSpanElement>(`[data-value="${key}"]`);
		if (valueEl) valueEl.textContent = formatValue(numeric);
		this.write(key, numeric);
	}

	private applyToggle(toggle: HTMLButtonElement): void
	{
		const key = toggle.dataset.toggle || '';
		const next = !toggle.classList.contains('active');
		toggle.classList.toggle('active', next);
		this.write(key, next);
	}

	// Forward to lil-gui so the existing onChange handlers fire
	// (e.g. CSM enable/disable, sensitivity push to CameraOperator).
	// Falls back to a direct param mutation for fields that don't have
	// a controller, plus the Master_Volume audio listener push.
	private write(key: string, value: any): void
	{
		this.world.params[key] = value;

		const controller = this.findController(key);
		if (controller !== null)
		{
			controller.setValue(value);
		}

		if (key === 'Master_Volume')
		{
			this.world.setMasterVolume(value);
		}
	}

	private findController(property: string): any
	{
		const gui = this.world.gui;
		if (!gui || typeof gui.controllersRecursive !== 'function') return null;
		const found = gui.controllersRecursive().find((c: any) => c.property === property);
		return found ?? null;
	}
}

function formatValue(v: number): string
{
	return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
