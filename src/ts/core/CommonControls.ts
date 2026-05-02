import { t } from '../i18n';

// Shared rows for the on-screen controls HUD (the help overlay
// World.updateControls() drives). Returned as functions, not module
// constants, so t() resolves at call time and the strings reflect the
// current language — building them once at module load would freeze
// them in whatever locale was active first.

// Always-available shortcuts the world hands to every input receiver
// (player on foot AND every vehicle). Respawn + free-camera entry.
export function commonGlobalControls()
{
	return [
		{ keys: ['Shift', '+', 'R'], desc: t('controls.respawn') },
		{ keys: ['Shift', '+', 'C'], desc: t('controls.freeCamera') },
	];
}

// Vehicle-only common rows: view toggle + exit, then the global ones.
// Spread into each Vehicle's inputReceiverInit after its own bindings.
export function commonVehicleControls()
{
	return [
		{ keys: ['V'], desc: t('controls.viewSelect') },
		{ keys: ['F'], desc: t('controls.exitVehicle') },
		...commonGlobalControls(),
	];
}
