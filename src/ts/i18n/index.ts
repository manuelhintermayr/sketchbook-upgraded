// Lightweight i18n. Translation lookup is a flat map keyed by locale
// then by message id; t(locale, key, vars) supports {placeholder}
// substitution. Persisted via localStorage so a user's choice on the
// title-screen language picker carries across sessions.
//
// Pattern adapted from manuelhintermayr-portfolio/three-js i18n —
// reshaped from a Next-style module into a plain TS singleton with a
// pure t() function so it can be called from anywhere without a
// React context.

export type Locale = 'en' | 'de' | 'es';

const STORAGE_KEY = 'sketchbook.locale';
const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_LABELS: { [k in Locale]: string } =
{
	en: 'English',
	de: 'Deutsch',
	es: 'Español',
};

type LocaleMap = { [k in Locale]: string };

const TRANSLATIONS: { [key: string]: LocaleMap } =
{
	'title.prompt':
	{
		en: 'Click or press any key to start',
		de: 'Klicken oder Taste drücken, um zu starten',
		es: 'Haz clic o pulsa una tecla para empezar',
	},
	'title.languagePrompt':
	{
		en: 'Select language',
		de: 'Sprache wählen',
		es: 'Selecciona idioma',
	},

	'pause.title':       { en: 'PAUSED',           de: 'PAUSIERT',          es: 'PAUSADO' },
	'pause.resume':      { en: 'Resume',           de: 'Fortsetzen',        es: 'Reanudar' },
	'pause.settings':    { en: 'Settings',         de: 'Einstellungen',     es: 'Ajustes' },
	'pause.restart':     { en: 'Restart Scenario', de: 'Szenario neu starten', es: 'Reiniciar escenario' },
	'pause.reload':      { en: 'Reload Page',      de: 'Seite neu laden',   es: 'Recargar página' },
	'pause.hint':        { en: 'Press {key} to resume', de: '{key} drücken zum Fortsetzen', es: 'Pulsa {key} para reanudar' },

	'settings.title':    { en: 'Settings',         de: 'Einstellungen',     es: 'Ajustes' },
	'settings.graphics': { en: 'Graphics',         de: 'Grafik',            es: 'Gráficos' },
	'settings.audio':    { en: 'Audio',            de: 'Audio',             es: 'Audio' },
	'settings.controls': { en: 'Controls',         de: 'Steuerung',         es: 'Controles' },
	'settings.done':     { en: 'Done',             de: 'Fertig',            es: 'Listo' },

	'error.reload':      { en: 'Reload',           de: 'Neu laden',         es: 'Recargar' },
	'error.copy':        { en: 'Copy details',     de: 'Details kopieren',  es: 'Copiar detalles' },
};

function readStored(): Locale | null
{
	if (typeof window === 'undefined') return null;
	const stored = window.localStorage.getItem(STORAGE_KEY);
	if (stored === 'en' || stored === 'de' || stored === 'es') return stored;
	return null;
}

let current: Locale = readStored() ?? DEFAULT_LOCALE;

export function getLocale(): Locale
{
	return current;
}

export function setLocale(locale: Locale): void
{
	current = locale;
	if (typeof window !== 'undefined')
	{
		window.localStorage.setItem(STORAGE_KEY, locale);
	}
}

export function hasStoredLocale(): boolean
{
	return readStored() !== null;
}

// Translate. Falls back to English if a key is missing for the active
// locale (catches half-translated keys silently). Variables are
// substituted by simple {name} replacement.
export function t(key: string, vars?: { [k: string]: string }): string
{
	const map = TRANSLATIONS[key];
	if (map === undefined) return key;
	let str = map[current] ?? map.en;
	if (vars !== undefined)
	{
		for (const k in vars)
		{
			str = str.replace(`{${k}}`, vars[k]);
		}
	}
	return str;
}
