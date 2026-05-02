import { World } from '../World';
import { t } from '../../i18n';

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

	// Lazy index of lil-gui controllers by property name. Built on the
	// first findController call so the cache picks up the gui after
	// World finishes wiring it. lil-gui's controllersRecursive walks the
	// folder tree on every call and we'd otherwise do that 30-50× during
	// a single slider drag.
	private controllerCache: Map<string, any> | null = null;

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
		this.setToggle('Camera_Shake', p.Camera_Shake);
		this.setToggle('Engine_Sound', p.Engine_Sound);
		this.setToggle('Ambient_Sound', p.Ambient_Sound);
		this.setToggle('Outlines', p.Outlines);
		this.setToggle('Bloom', p.Bloom);
		this.setToggle('Depth_Of_Field', p.Depth_Of_Field);
		this.setToggle('Animal_Labels', p.Animal_Labels);
	}

	private build(): HTMLDivElement
	{
		const wrap = document.createElement('div');
		wrap.id = 'settings-modal';
		// Card titles + button labels are translated via i18n.
		// Individual control labels stay in English to keep the per-row
		// description tight; full row translation would inflate the
		// translation table without much value to non-English players
		// who already know what "FXAA" or "Mouse Sensitivity" means.
		wrap.innerHTML = `
			<div class="settings-container">
				<div class="settings-header">
					<h2 class="settings-title">${t('settings.title')}</h2>
					<button class="settings-close" data-close aria-label="Close">&times;</button>
				</div>

				<div class="settings-card">
					<h3>${t('settings.graphics')}</h3>
					<div class="setting-row">
						<div>
							<div class="setting-label">${t('settings.presets')}</div>
							<div class="setting-desc">${t('settings.presetDesc')}</div>
						</div>
						<div class="setting-control">
							<button type="button" class="preset-btn" data-preset="low">${t('settings.presetLow')}</button>
							<button type="button" class="preset-btn" data-preset="high">${t('settings.presetHigh')}</button>
						</div>
					</div>
					${this.toggleRow('Shadows', 'Shadows', 'Cascaded shadow maps')}
					${this.toggleRow('FXAA', 'Anti-aliasing', 'FXAA post-process')}
					${this.toggleRow('Has_Day_Night_Cycle', 'Day / night cycle', 'Sun moves automatically')}
					${this.toggleRow('Outlines', 'Outlines', 'Depth-edge Sobel overlay (toon look)')}
					${this.toggleRow('Bloom', 'Bloom', 'Glow on bright pixels (stronger at night)')}
					${this.toggleRow('Depth_Of_Field', 'Depth of field', 'Bokeh blur — tighter focus while driving')}
					${this.toggleRow('Animal_Labels', 'Animal labels', 'Show floating Hund / Katze tags above animals')}
					${this.toggleRow('Debug_FPS', 'FPS counter', 'Show stats.js box')}
				</div>

				<div class="settings-card">
					<h3>${t('settings.audio')}</h3>
					${this.rangeRow('Master_Volume', 'Master volume', 0, 100, 1, 'All in-world positional + procedural audio')}
					${this.toggleRow('Engine_Sound', 'Engine sound', 'Procedural Web Audio engine while driving')}
					${this.toggleRow('Ambient_Sound', 'Ambient sound', 'Wind, birds, water (procedural)')}
					${this.rangeRow('Music_Volume', 'Music', 0, 100, 1, 'Reserved — no separate music bus yet')}
					${this.rangeRow('SFX_Volume', 'Sound effects', 0, 100, 1, 'Reserved — no SFX bus yet')}
				</div>

				<div class="settings-card">
					<h3>${t('settings.controls')}</h3>
					${this.rangeRow('Mouse_Sensitivity', 'Mouse sensitivity', 0, 1, 0.01, 'Camera look speed')}
					${this.rangeRow('Free_Cam_Speed', 'Free-camera speed', 1, 100, 1, 'Shift+C movement')}
					${this.rangeRow('Gravity_Scale', 'Gravity scale', 0, 2, 0.05, '0 = zero-g, 1 = Earth, 2 = double')}
					${this.toggleRow('Pointer_Lock', 'Pointer lock', 'Click captures the cursor')}
					${this.toggleRow('Camera_Shake', 'Camera shake', 'Shake on vehicle hard landings + recovery')}
				</div>

				<div class="settings-footer">
					<button class="btn-gold" data-close>${t('settings.done')}</button>
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
		wrap.querySelectorAll<HTMLButtonElement>('.preset-btn').forEach((btn) =>
		{
			btn.addEventListener('click', () => this.applyPreset(btn.dataset.preset as 'low' | 'high'));
		});

		return wrap;
	}

	// Quick toggles for the heavy graphics features. "Low" disables
	// shadows + every post-FX (the things that actually move the FPS
	// needle on integrated GPUs / mobile). "High" turns them all on so
	// users can flip back without remembering which row was where.
	private applyPreset(preset: 'low' | 'high'): void
	{
		const targets: { [k: string]: boolean } = preset === 'low'
			? { Shadows: false, Outlines: false, Bloom: false, Depth_Of_Field: false }
			: { Shadows: true,  Outlines: true,  Bloom: true,  Depth_Of_Field: true };
		for (const key in targets)
		{
			this.write(key, targets[key]);
		}
		this.refresh();
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
		if (this.controllerCache === null)
		{
			const gui = this.world.gui;
			if (!gui || typeof gui.controllersRecursive !== 'function') return null;
			this.controllerCache = new Map();
			for (const c of gui.controllersRecursive() as any[])
			{
				this.controllerCache.set(c.property, c);
			}
		}
		return this.controllerCache.get(property) ?? null;
	}
}

function formatValue(v: number): string
{
	return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
