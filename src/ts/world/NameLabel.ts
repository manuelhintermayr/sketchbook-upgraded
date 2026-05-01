import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

// Pattern adapted from tkkaushik369/socketControl's PlayerClient.setUID
// (https://github.com/tkkaushik369/socketControl/.../PlayerClient.ts) —
// a CSS2DObject hovered above the character at +1.2 units. The .me
// flavour gets a different background colour so the player can spot
// themselves at a glance.
export function attachNameLabel(target: THREE.Object3D, name: string, isPlayer = false): CSS2DObject
{
	const div = document.createElement('div');
	div.className = 'name-label' + (isPlayer ? ' me' : '');
	div.textContent = name;

	const label = new CSS2DObject(div);
	label.position.set(0, 1.2, 0);
	target.add(label);
	return label;
}
