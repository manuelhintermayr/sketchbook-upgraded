import * as THREE from 'three';
import { World } from './World';
import { IUpdatable } from '../interfaces/IUpdatable';
import { UpdateOrder } from '../enums/UpdateOrder';
import { Character } from '../characters/Character';
import { TriggerCube, TriggerCenter } from './TriggerCube';
import { DialogBox, Dialog } from './ui/DialogBox';
import { t } from '../i18n';

export interface ProximityPromptParams
{
	text?: string;
	// Touch-mode variant of `text`. If unset, falls back to `text` -
	// keyboard-only prompts (e.g. environment triggers) don't need their
	// own touch label since touch devices won't see them anyway.
	touchText?: string;
	maxInteractDistance?: number;
	interactionCooldown?: number;
	// Either a flat callback (legacy Notblox-style) or a Dialog tree
	// rendered by the shared DialogBox singleton.
	onInteract?: (player: Character) => void;
	dialog?: Dialog;
	// Character to freeze alongside the player when the dialog opens -
	// typically the NPC the prompt is attached to. The dialog leaves
	// both standing still until the player picks a closing choice.
	targetCharacter?: Character;
}

// Single-player port of iErcann/Notblox's ProximityPrompt. The original
// is networked + ECS-based: a NetworkComponent the server attaches to
// any entity, plus a client system that draws a HUD label and forwards
// the E key. We collapse that to a TriggerCube + a screen-space DOM
// label + a document keydown listener.
//
// maxInteractDistance is mapped to a half-extent on each axis of the
// trigger cube; interactionCooldown is enforced locally via Date.now().
export class ProximityPrompt implements IUpdatable
{
	public updateOrder = UpdateOrder.Prompts;

	private world: World | null = null;
	private trigger: TriggerCube;

	private label: HTMLDivElement;
	private inside = false;
	private lastInteract = 0;
	private text: string;
	private touchText: string;
	private maxInteractDistance: number;
	private interactionCooldown: number;
	private onInteract: ((player: Character) => void) | undefined;
	private dialog: Dialog | undefined;
	private targetCharacter: Character | undefined;
	private kind: 'dialog' | 'interact';

	private boundKeyDown: (e: KeyboardEvent) => void;
	private boundTouchModeChange: () => void;

	constructor(center: TriggerCenter, params: ProximityPromptParams)
	{
		this.text = params.text ?? t('prompt.interact');
		this.touchText = params.touchText ?? params.text ?? t('prompt.interact.touch');
		this.maxInteractDistance = params.maxInteractDistance ?? 3;
		this.interactionCooldown = params.interactionCooldown ?? 1000;
		this.onInteract = params.onInteract;
		this.dialog = params.dialog;
		this.targetCharacter = params.targetCharacter;
		// Buttons split in TouchControls by kind - dialog gets the E
		// button, plain interact gets the F button. Vehicles aren't
		// ProximityPrompts so they're handled separately.
		this.kind = params.dialog !== undefined ? 'dialog' : 'interact';

		const r = this.maxInteractDistance;
		this.trigger = new TriggerCube(
			center,
			new THREE.Vector3(r * 2, r * 2, r * 2),
			() =>
			{
				this.inside = true;
				this.label.style.visibility = 'visible';
				if (this.world !== null) this.world.sfxBus.playUiTick();
				window.dispatchEvent(new CustomEvent('proximity-near', {
					detail: { kind: this.kind },
				}));
			},
			() =>
			{
				this.inside = false;
				this.label.style.visibility = 'hidden';
				window.dispatchEvent(new CustomEvent('proximity-far', {
					detail: { kind: this.kind },
				}));
				// No auto-close on walk-away. Both player and NPC are
				// dialogFreeze'd, so a stray onExit here is residual
				// velocity carrying the player out of the trigger box
				// - closing on that would yank the dialog mid-
				// typewriter. The dialog ends only via a choice (every
				// tree has an 'end' branch), matching the
				// "non-dismissable" rule.
			},
		);

		this.label = document.createElement('div');
		this.label.className = 'proximity-prompt';
		this.refreshLabelText();
		this.label.style.cssText = [
			'position:absolute', 'top:55%', 'left:50%', 'transform:translate(-50%,-50%)',
			'padding:6px 14px', 'background:rgba(0,0,0,0.55)', 'color:#fff',
			'font-family:var(--font-label)', 'font-size:14px', 'border-radius:4px',
			'pointer-events:none', 'visibility:hidden', 'z-index:30',
			'text-shadow:0 1px 2px rgba(0,0,0,0.5)',
		].join(';');

		this.boundKeyDown = this.onKeyDown.bind(this);
		this.boundTouchModeChange = () => this.refreshLabelText();
	}

	public addToWorld(world: World): void
	{
		this.world = world;
		this.trigger.addToWorld(world);
		document.body.appendChild(this.label);
		document.addEventListener('keydown', this.boundKeyDown);
		// Touch / interact button on the on-screen overlay. Both routes
		// land in the same interact() entrypoint so cooldown + dialog
		// gating apply equally.
		window.addEventListener('touch-interact', this.boundKeyDown as any);
		window.addEventListener('touchmode-change', this.boundTouchModeChange);
		world.registerUpdatable(this);
	}

	public removeFromWorld(world: World): void
	{
		this.trigger.removeFromWorld(world);
		this.label.remove();
		document.removeEventListener('keydown', this.boundKeyDown);
		window.removeEventListener('touch-interact', this.boundKeyDown as any);
		window.removeEventListener('touchmode-change', this.boundTouchModeChange);
		world.unregisterUpdatable(this);
		this.world = null;
	}

	private safetyTickCounter = 0;

	public update(_timeStep: number): void
	{
		// Safety net for the inside-flag / label-visibility pair: the
		// TriggerCube's onEnter / onExit can desync (player teleport,
		// dialogFreeze yanking velocity, NPC moving past at speed) and
		// leave the label stuck visible past the actual leave. We
		// re-verify with a real distance check, but only every 10
		// frames - the stale-label window we're guarding against is
		// much longer than 160ms anyway, and keeping this off the hot
		// path matters across all 4 NPC prompts.
		if (++this.safetyTickCounter < 10) return;
		this.safetyTickCounter = 0;

		if (!this.inside) return;
		const player = this.world?.characters[0];
		if (player === undefined) return;
		const targetPos = this.targetCharacter !== undefined ? this.targetCharacter.position : null;
		if (targetPos === null) return;
		const dx = player.position.x - targetPos.x;
		const dy = player.position.y - targetPos.y;
		const dz = player.position.z - targetPos.z;
		// 2x slack keeps the box-vs-sphere math forgiving (the cube's
		// diagonal is r*sqrt(3) = 2.6r, so a player can legitimately be
		// outside the cube but inside the inscribed sphere).
		const r = this.maxInteractDistance * 2;
		if (dx * dx + dy * dy + dz * dz > r * r)
		{
			this.inside = false;
			this.label.style.visibility = 'hidden';
			window.dispatchEvent(new CustomEvent('proximity-far', {
				detail: { kind: this.kind },
			}));
		}
	}

	private refreshLabelText(): void
	{
		const touch = document.documentElement.classList.contains('touch-active');
		this.label.textContent = touch ? this.touchText : this.text;
	}

	private onKeyDown(e: KeyboardEvent | CustomEvent): void
	{
		// Either a real keydown (E for dialog/interact) or a synthetic
		// touch-interact CustomEvent dispatched by TouchControls when the
		// E / F button is tapped.
		const isTouch = (e as CustomEvent).type === 'touch-interact';
		if (!isTouch)
		{
			const code = (e as KeyboardEvent).code;
			// Dialog prompts respond to E, plain interact prompts to F
			// (matches the on-screen button labels). Keep E for both
			// kinds so existing keyboard muscle memory still works for
			// non-dialog interacts.
			if (code !== 'KeyE' && code !== 'KeyF') return;
			if (this.kind === 'dialog' && code !== 'KeyE') return;
		}
		else
		{
			const detail = (e as CustomEvent).detail as { kind?: string } | undefined;
			if (detail?.kind !== this.kind) return;
		}
		if (!this.inside) return;
		// Don't trigger while another dialog is already open (also
		// guards against re-entering this same prompt's dialog).
		if (DialogBox.getInstance().isOpen()) return;
		const now = Date.now();
		if (now - this.interactionCooldown < this.lastInteract) return;
		this.lastInteract = now;
		const player = this.world?.characters[0];
		if (!player) return;

		if (this.dialog !== undefined)
		{
			const participants: Character[] = [player];
			if (this.targetCharacter !== undefined) participants.push(this.targetCharacter);
			DialogBox.getInstance().open(this.dialog, { participants });
		}
		if (this.onInteract !== undefined)
		{
			this.onInteract(player);
		}
	}
}
