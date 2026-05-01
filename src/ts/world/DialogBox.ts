// Branching NPC dialog. A Dialog is a map of nodes; each node has a
// speaker, body text, and a list of choices that can either jump to
// another node or end the conversation. The DialogBox singleton owns
// one DOM bar and renders the current node; it's opened by NPCs from
// their ProximityPrompt onInteract callback.

export interface DialogChoice
{
	label: string;
	next: string | 'end';
}

export interface DialogNode
{
	speaker: string;
	role?: string;
	portrait?: string;
	text: string;
	choices: DialogChoice[];
}

export interface Dialog
{
	start: string;
	nodes: { [id: string]: DialogNode };
}

let instance: DialogBox | null = null;

export class DialogBox
{
	private bar: HTMLDivElement;
	private speakerEl: HTMLDivElement;
	private textEl: HTMLDivElement;
	private choicesEl: HTMLDivElement;
	private portraitImg: HTMLDivElement;
	private portraitName: HTMLDivElement;
	private portraitRole: HTMLDivElement;

	private currentDialog: Dialog | null = null;
	private currentNodeId: string | null = null;
	private onClose: (() => void) | null = null;
	private boundKeyDown: (e: KeyboardEvent) => void;

	public static getInstance(): DialogBox
	{
		if (instance === null) instance = new DialogBox();
		return instance;
	}

	private constructor()
	{
		this.bar = document.createElement('div');
		this.bar.id = 'dialog-bar';
		this.bar.innerHTML = `
			<div class="dialog-dim"></div>
			<div class="dialog-box">
				<div class="dialog-portrait">
					<div class="portrait-img" data-portrait></div>
					<div class="portrait-name" data-name></div>
					<div class="portrait-role" data-role></div>
				</div>
				<div class="dialog-content">
					<div class="dialog-speaker" data-speaker></div>
					<div class="dialog-text" data-text></div>
					<div class="dialog-choices" data-choices role="menu"></div>
					<div class="dialog-hint">Press <span class="dialog-key">Esc</span> to leave</div>
				</div>
			</div>
		`;
		document.body.appendChild(this.bar);

		this.speakerEl = this.bar.querySelector('[data-speaker]') as HTMLDivElement;
		this.textEl = this.bar.querySelector('[data-text]') as HTMLDivElement;
		this.choicesEl = this.bar.querySelector('[data-choices]') as HTMLDivElement;
		this.portraitImg = this.bar.querySelector('[data-portrait]') as HTMLDivElement;
		this.portraitName = this.bar.querySelector('[data-name]') as HTMLDivElement;
		this.portraitRole = this.bar.querySelector('[data-role]') as HTMLDivElement;

		this.boundKeyDown = (e) => this.handleKeyDown(e);
		document.addEventListener('keydown', this.boundKeyDown);
	}

	public isOpen(): boolean
	{
		return this.currentDialog !== null;
	}

	public open(dialog: Dialog, onClose?: () => void): void
	{
		this.currentDialog = dialog;
		this.onClose = onClose ?? null;
		this.bar.classList.add('visible');
		this.goTo(dialog.start);
	}

	public close(): void
	{
		this.currentDialog = null;
		this.currentNodeId = null;
		this.bar.classList.remove('visible');
		if (this.onClose) this.onClose();
		this.onClose = null;
	}

	private goTo(nodeId: string): void
	{
		if (this.currentDialog === null) return;
		const node = this.currentDialog.nodes[nodeId];
		if (node === undefined)
		{
			console.error(`DialogBox: missing node "${nodeId}"`);
			this.close();
			return;
		}
		this.currentNodeId = nodeId;
		this.render(node);
	}

	private render(node: DialogNode): void
	{
		this.speakerEl.textContent = node.speaker;
		this.textEl.textContent = node.text;
		this.portraitName.textContent = node.speaker;
		this.portraitRole.textContent = node.role ?? '';
		this.portraitImg.textContent = node.portrait ?? node.speaker.charAt(0).toUpperCase();

		this.choicesEl.innerHTML = '';
		node.choices.forEach((choice, i) =>
		{
			const btn = document.createElement('button');
			btn.className = 'dialog-choice';
			btn.setAttribute('role', 'menuitem');
			btn.dataset.index = String(i);
			btn.innerHTML = `<span class="dialog-key">${i + 1}</span><span>${escapeHtml(choice.label)}</span>`;
			btn.addEventListener('click', () => this.pick(i));
			this.choicesEl.appendChild(btn);
		});

		const first = this.choicesEl.querySelector<HTMLButtonElement>('.dialog-choice');
		first?.focus();
	}

	private pick(i: number): void
	{
		if (this.currentDialog === null || this.currentNodeId === null) return;
		const node = this.currentDialog.nodes[this.currentNodeId];
		const choice = node.choices[i];
		if (choice === undefined) return;
		if (choice.next === 'end') this.close();
		else this.goTo(choice.next);
	}

	private handleKeyDown(e: KeyboardEvent): void
	{
		if (!this.isOpen()) return;
		if (e.code === 'Escape')
		{
			e.preventDefault();
			this.close();
			return;
		}
		// Number keys 1–9 pick a choice.
		const num = e.code.startsWith('Digit') ? parseInt(e.code.slice(5), 10) - 1
			: e.code.startsWith('Numpad') ? parseInt(e.code.slice(6), 10) - 1 : -1;
		if (num >= 0 && num < 9)
		{
			const btn = this.choicesEl.querySelector<HTMLButtonElement>(`.dialog-choice[data-index="${num}"]`);
			if (btn)
			{
				e.preventDefault();
				this.pick(num);
			}
		}
	}
}

function escapeHtml(s: string): string
{
	return s.replace(/[&<>"']/g, (c) =>
	{
		switch (c)
		{
			case '&': return '&amp;';
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '"': return '&quot;';
			case "'": return '&#39;';
			default: return c;
		}
	});
}
