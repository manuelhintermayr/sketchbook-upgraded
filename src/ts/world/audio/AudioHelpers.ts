import * as THREE from 'three';
import { World } from '../World';

// Cross-cutting helpers for the audio layer. These two utilities used
// to live as duplicated snippets in every audio class: the master-
// volume read in 6 places, the lazy AudioListener creation in 4. One
// place each now.

// World.params.Master_Volume is a 0..100 slider; audio nodes need a
// 0..1 gain factor. Default 80 mirrors the lil-gui default so silence
// before the first frame doesn't surprise.
export function getMasterVolume(world: World): number
{
	return (world.params?.Master_Volume ?? 80) / 100;
}

// Lazily create the world's AudioListener and attach it to the camera
// the first time something positional is built. Honours the persisted
// Master_Volume so the slider value carries through a page reload.
export function ensureAudioListener(world: World): THREE.AudioListener
{
	let listener = world.audioListener;
	if (listener === null)
	{
		listener = new THREE.AudioListener();
		world.camera.add(listener);
		world.audioListener = listener;
		const stored = world.params?.Master_Volume;
		if (typeof stored === 'number') listener.setMasterVolume(stored / 100);
	}
	return listener;
}

// Web-platform helper: build the <audio> + <source> DOM pair Speaker
// uses for sample-based positional sources, attach to body. Lifted out
// of Speaker so the domain class stops touching DOM directly.
export interface MediaAudioElements
{
	dom: HTMLAudioElement;
	source: HTMLSourceElement;
}

export function createMediaAudioElement(audioUrl: string): MediaAudioElements
{
	const dom = document.createElement('audio');
	dom.preload = 'auto';
	dom.loop = true;
	dom.crossOrigin = 'anonymous';
	dom.style.display = 'none';

	const source = document.createElement('source');
	source.src = audioUrl;
	dom.appendChild(source);
	document.body.appendChild(dom);

	return { dom, source };
}
