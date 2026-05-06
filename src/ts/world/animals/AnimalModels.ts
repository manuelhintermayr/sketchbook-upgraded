import * as THREE from 'three';

// Hierarchical low-poly cat / dog models with animatable parts. Pattern
// adapted from manuelhintermayr-portfolio/low-poly-cat-game (HTML demo)
// reshaped to a TS module that returns a typed model record. Each
// model exposes the references the per-frame animator needs (body,
// head, legs, tail segments, ears) so WanderingAnimals can drive idle
// breath / walk-cycle / run-cycle / jump pose poses without poking
// into nested Three.Object3D children at random.

export interface ColorScheme
{
	main: number;
	dark: number;
	light: number;
	nose: number;
	eye: number;
}

// A handful of colour palettes per species. Reused across the
// per-animal scale + heading variations so dogs and cats look like a
// real population instead of clones.
export const CAT_SCHEMES: ColorScheme[] =
[
	{ main: 0xe0e0e0, dark: 0x9c9c9c, light: 0xffffff, nose: 0xffb7c5, eye: 0x66cc66 }, // grey tabby
	{ main: 0xe8b97a, dark: 0xa86a2a, light: 0xfde9c4, nose: 0xff8888, eye: 0xeebb33 }, // ginger
	{ main: 0x222222, dark: 0x111111, light: 0x444444, nose: 0xff8899, eye: 0x88ee44 }, // black
	{ main: 0xc89070, dark: 0x6e3a1a, light: 0xf8e2c8, nose: 0xff9999, eye: 0x88aaee }, // tortoiseshell
];

export const DOG_SCHEMES: ColorScheme[] =
[
	{ main: 0xb5651d, dark: 0x6f3d10, light: 0xe5b070, nose: 0x222222, eye: 0x4a2e15 }, // brown
	{ main: 0xefd3a4, dark: 0xa07a4a, light: 0xfff0d0, nose: 0x222222, eye: 0x3a2410 }, // golden
	{ main: 0x4a3220, dark: 0x2a1a10, light: 0x7a5a40, nose: 0x111111, eye: 0x2a1a08 }, // dark brown
	{ main: 0xd0d0d0, dark: 0x808080, light: 0xffffff, nose: 0x222222, eye: 0x4a2e15 }, // white-grey
];

// Common contract every animal model satisfies. WanderingAnimals only
// reaches into these named handles - never the raw Three children -
// so the cat / dog implementations stay swappable.
export interface AnimalModel
{
	group: THREE.Group;
	body: THREE.Group;
	head: THREE.Group;
	tail: THREE.Object3D[];
	legs: { fl: AnimalLeg; fr: AnimalLeg; bl: AnimalLeg; br: AnimalLeg };
	ears: { left: THREE.Object3D; right: THREE.Object3D };
	// Mouth-open mesh for voice animation. Hidden by default
	// (scale.y ≈ 0); the animator scales it up while voiceFraction > 0
	// so meowing cats and barking dogs visibly open their mouth.
	mouthOpen: THREE.Mesh;
	// Resting body Y inside the parent group (so idle breath returns
	// to it and walk-cycle bobs around it).
	restY: number;
}

// A 2-segment leg: thigh swings around the hip, shin around the knee.
// The animator rotates these about the X axis to drive the gait.
export interface AnimalLeg
{
	thigh: THREE.Object3D;
	shin: THREE.Object3D;
}

function mat(color: number): THREE.MeshStandardMaterial
{
	return new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
}

const _blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, flatShading: true });
const _eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true });

function applyShadow(obj: THREE.Object3D): void
{
	obj.traverse((child) =>
	{
		if ((child as THREE.Mesh).isMesh)
		{
			child.castShadow = true;
			child.receiveShadow = true;
		}
	});
}

function makeLeg(furMat: THREE.MeshStandardMaterial, lightMat: THREE.MeshStandardMaterial, x: number, z: number): AnimalLeg
{
	const thigh = new THREE.Group();
	thigh.position.set(x, 0.65, z);
	const upper = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.5, 0.27), furMat);
	upper.position.y = -0.25;
	thigh.add(upper);

	const shin = new THREE.Group();
	shin.position.y = -0.5;
	thigh.add(shin);
	const lower = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.45, 0.23), furMat);
	lower.position.y = -0.225;
	shin.add(lower);
	const paw = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.36), lightMat);
	paw.position.set(0, -0.5, 0.04);
	shin.add(paw);

	return { thigh, shin };
}

// Multi-segment tail rooted at `rootY`/`rootZ` on the parent group.
// Each segment is the child of the previous one, so a rotation on
// segment N propagates to N+1..N+last - same chain the cat-game
// animator uses for the slow tail sway.
function makeTail(parent: THREE.Object3D, segCount: number, rootY: number, rootZ: number, baseSize: number,
	furMat: THREE.MeshStandardMaterial, darkMat: THREE.MeshStandardMaterial, tipMat: THREE.MeshStandardMaterial): THREE.Object3D[]
{
	const root = new THREE.Group();
	root.position.set(0, rootY, rootZ);
	parent.add(root);

	const segs: THREE.Object3D[] = [];
	let p: THREE.Object3D = root;
	for (let i = 0; i < segCount; i++)
	{
		const seg = new THREE.Group();
		seg.position.z = i === 0 ? -0.05 : -0.27;
		const size = baseSize - i * 0.022;
		const segMesh = new THREE.Mesh(
			new THREE.BoxGeometry(size, size, 0.28),
			i === segCount - 1 ? tipMat : (i % 2 === 0 ? furMat : darkMat),
		);
		segMesh.position.z = -0.14;
		seg.add(segMesh);
		p.add(seg);
		segs.push(seg);
		p = seg;
	}
	return segs;
}

export function buildCatModel(scheme: ColorScheme): AnimalModel
{
	const root = new THREE.Group();
	const cat = new THREE.Group();
	root.add(cat);

	const furMat = mat(scheme.main);
	const darkMat = mat(scheme.dark);
	const whiteMat = mat(scheme.light);
	const noseMat = mat(scheme.nose);
	const eyeMat = mat(scheme.eye);

	// Body
	const body = new THREE.Group();
	const torso = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.95, 2.1), furMat);
	body.add(torso);
	const belly = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.4, 1.7), whiteMat);
	belly.position.y = -0.3;
	body.add(belly);
	const restY = 1.05;
	body.position.y = restY;
	cat.add(body);

	// Head
	const head = new THREE.Group();
	head.position.set(0, 1.35, 1.25);
	cat.add(head);
	const headBox = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.95, 0.95), furMat);
	head.add(headBox);
	const snout = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.45, 0.45), whiteMat);
	snout.position.set(0, -0.18, 0.5);
	head.add(snout);
	const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.14, 4), noseMat);
	nose.position.set(0, 0.0, 0.76);
	nose.rotation.x = Math.PI / 2;
	nose.rotation.y = Math.PI / 4;
	head.add(nose);

	// Mouth-open block - hidden by default, scaled up while meowing
	// to show an open mouth. Sits flat against the snout's underside.
	const mouthOpen = new THREE.Mesh(
		new THREE.BoxGeometry(0.22, 0.18, 0.07),
		mat(0x2a0d10),
	);
	mouthOpen.position.set(0, -0.27, 0.72);
	mouthOpen.scale.y = 0.001;
	head.add(mouthOpen);

	// Eyes (simple - no pupil tracking in v1)
	const makeEye = (x: number): THREE.Object3D =>
	{
		const g = new THREE.Group();
		const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), eyeMat);
		eye.scale.z = 0.55;
		g.add(eye);
		const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.22, 0.04), _blackMat);
		pupil.position.z = 0.09;
		g.add(pupil);
		const shine = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), _eyeWhiteMat);
		shine.position.set(0.05, 0.07, 0.11);
		g.add(shine);
		g.position.set(x, 0.15, 0.4);
		head.add(g);
		return g;
	};
	makeEye(-0.27);
	makeEye(0.27);

	// Ears
	const makeEar = (x: number, side: number): THREE.Object3D =>
	{
		const eg = new THREE.Group();
		eg.position.set(x, 0.55, -0.05);
		const outer = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.55, 4), furMat);
		eg.add(outer);
		const inner = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 4), mat(scheme.nose));
		inner.position.set(0, -0.05, 0.05);
		eg.add(inner);
		eg.rotation.z = side * 0.18;
		eg.rotation.x = -0.08;
		head.add(eg);
		return eg;
	};
	const leftEar = makeEar(-0.34, 1);
	const rightEar = makeEar(0.34, -1);

	// Legs
	const legs = {
		fl: makeLeg(furMat, whiteMat, -0.45, 0.7),
		fr: makeLeg(furMat, whiteMat, 0.45, 0.7),
		bl: makeLeg(furMat, whiteMat, -0.45, -0.75),
		br: makeLeg(furMat, whiteMat, 0.45, -0.75),
	};
	cat.add(legs.fl.thigh, legs.fr.thigh, legs.bl.thigh, legs.br.thigh);

	// Tail - 7 segments for the iconic flowing cat tail
	const tail = makeTail(cat, 7, 1.15, -1.0, 0.22, furMat, darkMat, whiteMat);

	applyShadow(root);
	return { group: root, body, head, tail, legs, ears: { left: leftEar, right: rightEar }, mouthOpen, restY };
}

export function buildDogModel(scheme: ColorScheme): AnimalModel
{
	const root = new THREE.Group();
	const dog = new THREE.Group();
	root.add(dog);

	const furMat = mat(scheme.main);
	const darkMat = mat(scheme.dark);
	const lightMat = mat(scheme.light);
	const noseMat = mat(scheme.nose);
	const eyeMat = mat(scheme.eye);

	// Body - chunkier than the cat
	const body = new THREE.Group();
	const torso = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.05, 2.3), furMat);
	body.add(torso);
	const belly = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.85), lightMat);
	belly.position.y = -0.32;
	body.add(belly);
	const restY = 1.15;
	body.position.y = restY;
	dog.add(body);

	// Head - longer snout than cat
	const head = new THREE.Group();
	head.position.set(0, 1.45, 1.4);
	dog.add(head);
	const headBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.95, 1.0), furMat);
	head.add(headBox);
	const snout = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), furMat);
	snout.position.set(0, -0.2, 0.62);
	head.add(snout);
	const nose = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.18), noseMat);
	nose.position.set(0, -0.05, 0.96);
	head.add(nose);

	// Mouth-open block under the snout - shown while barking.
	const mouthOpen = new THREE.Mesh(
		new THREE.BoxGeometry(0.32, 0.18, 0.1),
		mat(0x2a0d10),
	);
	mouthOpen.position.set(0, -0.32, 0.86);
	mouthOpen.scale.y = 0.001;
	head.add(mouthOpen);

	// Eyes
	const makeEye = (x: number): THREE.Object3D =>
	{
		const g = new THREE.Group();
		const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), eyeMat);
		eye.scale.z = 0.6;
		g.add(eye);
		const shine = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), _eyeWhiteMat);
		shine.position.set(0.04, 0.05, 0.09);
		g.add(shine);
		g.position.set(x, 0.2, 0.42);
		head.add(g);
		return g;
	};
	makeEye(-0.27);
	makeEye(0.27);

	// Floppy ears (rotated outward, hanging forward)
	const makeEar = (x: number, side: number): THREE.Object3D =>
	{
		const eg = new THREE.Group();
		eg.position.set(x, 0.4, 0.0);
		const ear = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.18), darkMat);
		ear.position.y = -0.25;
		eg.add(ear);
		eg.rotation.z = side * 0.32;
		head.add(eg);
		return eg;
	};
	const leftEar = makeEar(-0.45, 1);
	const rightEar = makeEar(0.45, -1);

	// Legs - same shape as cat but stockier
	const legs = {
		fl: makeLeg(furMat, lightMat, -0.5, 0.78),
		fr: makeLeg(furMat, lightMat, 0.5, 0.78),
		bl: makeLeg(furMat, lightMat, -0.5, -0.85),
		br: makeLeg(furMat, lightMat, 0.5, -0.85),
	};
	dog.add(legs.fl.thigh, legs.fr.thigh, legs.bl.thigh, legs.br.thigh);

	// Shorter perky tail (4 segs)
	const tail = makeTail(dog, 4, 1.3, -1.05, 0.24, furMat, darkMat, lightMat);
	// Default carry the dog tail upward
	if (tail.length > 0) tail[0].rotation.x = -0.6;

	applyShadow(root);
	return { group: root, body, head, tail, legs, ears: { left: leftEar, right: rightEar }, mouthOpen, restY };
}

// Per-frame animation driver. Picks idle / walk / run pose from the
// motion state + speed. Mutates the model handles in-place. Same
// shape the cat-game's animation block uses but as a pure function
// the manager calls once per animal per frame.
export function applyAnimalAnimation(model: AnimalModel, opts:
{
	t: number;
	speed: number;
	isDog: boolean;
	moving: boolean;
	running: boolean;
	// 0..1, lifecycle of the active voice (1 = just started, 0 = done).
	// Drives mouth-open scale and the dog's bark head-shake.
	voiceFraction: number;
}): void
{
	const { t, speed, isDog, moving, running, voiceFraction } = opts;
	const restY = model.restY;

	// Mouth opens during voices. Smooth-step in/out so the open isn't
	// a hard pop. Cats hold mouth open for the full meow; dogs jaw-
	// snap on each bark - here we approximate with the same fade
	// (synth duration is ~0.45 s, voiceFraction handles the timing).
	const mouthScale = voiceFraction > 0
		? Math.max(0.001, voiceFraction)
		: 0.001;
	model.mouthOpen.scale.y = mouthScale;

	if (!moving)
	{
		// Idle: breath pulse, gentle tail sway, settle legs.
		const breath = Math.sin(t * 1.6) * (isDog ? 0.03 : 0.025);
		model.body.scale.set(1 + breath, 1 + breath, 1 + breath * 0.5);
		model.body.position.y = restY;
		model.body.rotation.x *= 0.85;

		if (isDog)
		{
			model.tail.forEach((seg, i) =>
			{
				const phase = t * 7 - i * 0.35;
				seg.rotation.y = Math.sin(phase) * (0.3 + i * 0.05);
				if (i === 0) seg.rotation.x = -0.6 + Math.cos(phase * 0.5) * 0.05;
				else seg.rotation.x = Math.cos(phase) * 0.05;
			});
			model.ears.left.rotation.z = 0.32;
			model.ears.right.rotation.z = -0.32;
		}
		else
		{
			model.tail.forEach((seg, i) =>
			{
				const phase = t * 1.4 - i * 0.45;
				seg.rotation.y = Math.sin(phase) * (0.18 + i * 0.04);
				const lift = i === 0 ? -0.35 : 0;
				seg.rotation.x = lift + Math.cos(phase * 0.8) * 0.04;
			});
			model.ears.left.rotation.z = 0.18;
			model.ears.right.rotation.z = -0.18;
			model.ears.left.rotation.x = -0.08;
			model.ears.right.rotation.x = -0.08;
		}

		// Dogs barking jerk their head down on each woof; idle cats
		// just sway their head gently. voiceFraction > 0 overrides
		// the lazy idle motion with the bark snap.
		if (isDog && voiceFraction > 0)
		{
			model.head.rotation.x = -0.18 + voiceFraction * 0.25;
			model.head.rotation.y = Math.sin(t * 18) * 0.06;
		}
		else
		{
			model.head.rotation.y = Math.sin(t * 0.5) * 0.12;
			model.head.rotation.x = Math.sin(t * 0.7) * 0.04;
		}

		for (const k in model.legs)
		{
			const leg = model.legs[k as 'fl' | 'fr' | 'bl' | 'br'];
			leg.thigh.rotation.x *= 0.85;
			leg.shin.rotation.x *= 0.85;
		}
		return;
	}

	// Walk / run: leg cycle. Cat-game pattern - diagonal pair (FL+BR
	// vs FR+BL) for walk, near-synced front/back pair for run gallop.
	const cycleSpeed = running ? 13 : 8;
	const amp = running ? 0.75 : 0.5;
	const c = t * cycleSpeed;

	if (!running)
	{
		model.legs.fl.thigh.rotation.x = Math.sin(c) * amp;
		model.legs.br.thigh.rotation.x = Math.sin(c) * amp;
		model.legs.fr.thigh.rotation.x = Math.sin(c + Math.PI) * amp;
		model.legs.bl.thigh.rotation.x = Math.sin(c + Math.PI) * amp;
		model.legs.fl.shin.rotation.x = Math.max(0, Math.sin(c - 0.7)) * 0.5;
		model.legs.br.shin.rotation.x = Math.max(0, Math.sin(c - 0.7)) * 0.5;
		model.legs.fr.shin.rotation.x = Math.max(0, Math.sin(c + Math.PI - 0.7)) * 0.5;
		model.legs.bl.shin.rotation.x = Math.max(0, Math.sin(c + Math.PI - 0.7)) * 0.5;
		model.body.position.y = restY + Math.abs(Math.sin(c * 2)) * 0.04;
		model.body.rotation.x = Math.sin(c * 2) * 0.025;
	}
	else
	{
		const front = Math.sin(c) * amp;
		const back = Math.sin(c + Math.PI * 0.6) * amp;
		model.legs.fl.thigh.rotation.x = front;
		model.legs.fr.thigh.rotation.x = front - 0.08;
		model.legs.bl.thigh.rotation.x = back;
		model.legs.br.thigh.rotation.x = back - 0.08;
		model.legs.fl.shin.rotation.x = Math.max(0, Math.sin(c - 0.6)) * 0.65;
		model.legs.fr.shin.rotation.x = Math.max(0, Math.sin(c - 0.7)) * 0.65;
		model.legs.bl.shin.rotation.x = Math.max(0, Math.sin(c + Math.PI * 0.6 - 0.6)) * 0.65;
		model.legs.br.shin.rotation.x = Math.max(0, Math.sin(c + Math.PI * 0.6 - 0.7)) * 0.65;
		model.body.position.y = restY + Math.abs(Math.sin(c)) * 0.18;
		model.body.rotation.x = Math.sin(c) * 0.09;
	}

	if (isDog)
	{
		model.tail.forEach((seg, i) =>
		{
			const phase = t * 8 - i * 0.35;
			seg.rotation.y = Math.sin(phase) * 0.28;
			if (i === 0) seg.rotation.x = -0.6 + Math.sin(c) * 0.08;
			else seg.rotation.x = Math.sin(c) * 0.04;
		});
		const bounce = Math.sin(c * 2) * 0.22;
		model.ears.left.rotation.x = bounce;
		model.ears.right.rotation.x = bounce;
		model.ears.left.rotation.z = 0.32 + Math.sin(c) * 0.08;
		model.ears.right.rotation.z = -0.32 - Math.sin(c) * 0.08;
	}
	else
	{
		model.tail.forEach((seg, i) =>
		{
			const phase = c * 0.5 - i * 0.35;
			seg.rotation.y = Math.sin(phase) * 0.12;
			seg.rotation.x = (i === 0 ? -0.55 : 0) + Math.sin(phase) * 0.08;
		});
		const earBack = running ? -0.35 : -0.12;
		model.ears.left.rotation.x = earBack;
		model.ears.right.rotation.x = earBack;
		model.ears.left.rotation.z = 0.18;
		model.ears.right.rotation.z = -0.18;
	}

	model.head.rotation.y *= 0.85;
	model.head.rotation.x = Math.sin(c) * 0.03;
	model.body.scale.set(1, 1, 1);

	// `speed` arg unused right now but kept on the signature: future
	// tweaks (paw-step audio, anim-blend factor) will read it.
	void speed;
}
