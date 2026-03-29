import * as THREE from 'three';
import { World } from './World';
import { IUpdatable } from '../interfaces/IUpdatable';
import { Character } from '../characters/Character';
import { TriggerCube } from './TriggerCube';

interface ProximityPromptParams
{
	text?: string;
	maxInteractDistance?: number;
	interactionCooldown?: number;
	onInteract: (player: Character) => void;
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
	public updateOrder = 13;

	private world: World | null = null;
	private trigger: TriggerCube;

	private label: HTMLDivElement;
	private inside = false;
	private lastInteract = 0;
	private params: Required<ProximityPromptParams>;

	private boundKeyDown: (e: KeyboardEvent) => void;

	constructor(center: THREE.Vector3, params: ProximityPromptParams)
	{
		this.params = {
			text: params.text ?? 'Press E to interact',
			maxInteractDistance: params.maxInteractDistance ?? 3,
			interactionCooldown: params.interactionCooldown ?? 1000,
			onInteract: params.onInteract,
		};

		const r = this.params.maxInteractDistance;
		this.trigger = new TriggerCube(
			center,
			new THREE.Vector3(r * 2, r * 2, r * 2),
			() => { this.inside = true; this.label.style.visibility = 'visible'; },
			() => { this.inside = false; this.label.style.visibility = 'hidden'; },
		);

		this.label = document.createElement('div');
		this.label.className = 'proximity-prompt';
		this.label.textContent = this.params.text;
		this.label.style.cssText = [
			'position:absolute', 'top:55%', 'left:50%', 'transform:translate(-50%,-50%)',
			'padding:6px 14px', 'background:rgba(0,0,0,0.55)', 'color:#fff',
			'font-family:sans-serif', 'font-size:14px', 'border-radius:4px',
			'pointer-events:none', 'visibility:hidden', 'z-index:10',
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
		const now = Date.now();
		if (now - this.lastInteract < this.params.interactionCooldown) return;
		this.lastInteract = now;
		const player = this.world?.characters[0];
		if (player) this.params.onInteract(player);
	}
}
