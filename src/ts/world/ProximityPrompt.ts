import * as THREE from 'three';
import { World } from './World';
import { IUpdatable } from '../interfaces/IUpdatable';
import { UpdateOrder } from '../enums/UpdateOrder';
import { Character } from '../characters/Character';
import { TriggerCube, TriggerCenter } from './TriggerCube';
import { DialogBox, Dialog } from './DialogBox';
import { t } from '../i18n';

export interface ProximityPromptParams
{
	text?: string;
	maxInteractDistance?: number;
	interactionCooldown?: number;
	// Either a flat callback (legacy Notblox-style) or a Dialog tree
	// rendered by the shared DialogBox singleton.
	onInteract?: (player: Character) => void;
	dialog?: Dialog;
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
	private maxInteractDistance: number;
	private interactionCooldown: number;
	private onInteract: ((player: Character) => void) | undefined;
	private dialog: Dialog | undefined;

	private boundKeyDown: (e: KeyboardEvent) => void;

	constructor(center: TriggerCenter, params: ProximityPromptParams)
	{
		this.text = params.text ?? t('prompt.interact');
		this.maxInteractDistance = params.maxInteractDistance ?? 3;
		this.interactionCooldown = params.interactionCooldown ?? 1000;
		this.onInteract = params.onInteract;
		this.dialog = params.dialog;

		const r = this.maxInteractDistance;
		this.trigger = new TriggerCube(
			center,
			new THREE.Vector3(r * 2, r * 2, r * 2),
			() => { this.inside = true; this.label.style.visibility = 'visible'; },
			() => {
				this.inside = false;
				this.label.style.visibility = 'hidden';
				// If the player walks away mid-conversation, close the
				// dialog automatically — keeps the UX focused.
				const dlg = DialogBox.getInstance();
				if (this.dialog && dlg.isOpen()) dlg.close();
			},
		);

		this.label = document.createElement('div');
		this.label.className = 'proximity-prompt';
		this.label.textContent = this.text;
		this.label.style.cssText = [
			'position:absolute', 'top:55%', 'left:50%', 'transform:translate(-50%,-50%)',
			'padding:6px 14px', 'background:rgba(0,0,0,0.55)', 'color:#fff',
			'font-family:var(--font-label)', 'font-size:14px', 'border-radius:4px',
			'pointer-events:none', 'visibility:hidden', 'z-index:30',
			'text-shadow:0 1px 2px rgba(0,0,0,0.5)',
		].join(';');

		this.boundKeyDown = this.onKeyDown.bind(this);
	}

	public addToWorld(world: World): void
	{
		this.world = world;
		this.trigger.addToWorld(world);
		document.body.appendChild(this.label);
		document.addEventListener('keydown', this.boundKeyDown);
		world.registerUpdatable(this);
	}

	public removeFromWorld(world: World): void
	{
		this.trigger.removeFromWorld(world);
		this.label.remove();
		document.removeEventListener('keydown', this.boundKeyDown);
		world.unregisterUpdatable(this);
		this.world = null;
	}

	public update(_timeStep: number): void { }

	private onKeyDown(e: KeyboardEvent): void
	{
		if (e.code !== 'KeyE') return;
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
			DialogBox.getInstance().open(this.dialog);
		}
		if (this.onInteract !== undefined)
		{
			this.onInteract(player);
		}
	}
}
