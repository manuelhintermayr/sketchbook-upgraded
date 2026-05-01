// Pre-game title screen. Lives in index.html before any World instance
// exists — bootstraps the fonts and styles itself, then resolves a
// promise on first user gesture so the caller can build the World.
//
// The first user gesture also unblocks browser audio autoplay, which
// is what Speaker relies on for in-world positional audio.

const FONT_HREFS = [
	'https://fonts.googleapis.com/css2?family=Alfa+Slab+One&display=swap',
	'https://fonts.googleapis.com/css2?family=Solway:wght@300;400;500;700;800&display=swap',
	'https://fonts.googleapis.com/css2?family=Catamaran:wght@400;500;700;800&display=swap',
	'https://fonts.googleapis.com/css2?family=Cutive+Mono&display=swap',
];

export interface TitleScreenOptions
{
	title?: string;
	version?: string;
	prompt?: string;
}

// Show the title screen and resolve when the player presses any key
// or clicks. Caller is responsible for instantiating the World after.
export function showTitleScreen(options: TitleScreenOptions = {}): Promise<void>
{
	const title = options.title ?? 'Sketchbook';
	const version = options.version ?? 'Version 0.6';
	const prompt = options.prompt ?? 'Click or press any key to start';

	// Inject fonts so the title screen looks right even before main.css
	// has had a chance to attach them (it does it inside World).
	for (const href of FONT_HREFS)
	{
		const existing = document.querySelector(`link[href="${href}"]`);
		if (existing) continue;
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = href;
		document.head.appendChild(link);
	}

	const wrap = document.createElement('div');
	wrap.id = 'title-screen';
	wrap.innerHTML = `
		<div class="title-text">${escapeHtml(title)}</div>
		<div class="title-version">${escapeHtml(version)}</div>
		<div class="cube-bounce">
			<div class="cubeWrap">
				<div class="cube">
					<div class="faces1"></div>
					<div class="faces2"></div>
				</div>
			</div>
		</div>
		<p class="title-prompt">${formatPrompt(prompt)}</p>
	`;
	document.body.appendChild(wrap);

	return new Promise<void>((resolve) =>
	{
		let dismissed = false;
		const dismiss = () =>
		{
			if (dismissed) return;
			dismissed = true;
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('pointerdown', onPointer);
			wrap.classList.add('fade-out');
			window.setTimeout(() =>
			{
				wrap.remove();
				resolve();
			}, 400);
		};
		const onKeyDown = (_e: KeyboardEvent) => dismiss();
		const onPointer = (_e: PointerEvent) => dismiss();
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('pointerdown', onPointer);
	});
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

function formatPrompt(prompt: string): string
{
	// Wrap key names in <kbd> for the styled keycap look.
	return escapeHtml(prompt).replace(/\b(any key|Esc|Space|Enter|F)\b/gi, '<kbd>$1</kbd>');
}
