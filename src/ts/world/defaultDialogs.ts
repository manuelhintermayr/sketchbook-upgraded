import { Dialog } from './DialogBox';

// Hand-written conversation trees for the four programmatically-injected
// NPCs at the Inthenew default spawn (Anna, Ben, Carla, Dieter). Loaded
// from World.injectDefaultSceneNPCs.

export const DefaultDialogs: { [name: string]: { role: string; dialog: Dialog } } = {
	Anna: {
		role: 'Path Walker',
		dialog: {
			start: 'greet',
			nodes: {
				greet: {
					speaker: 'Anna',
					text: 'Hi there! Ben and I take turns walking this loop — it\'s a good way to keep an eye on the spawn area.',
					choices: [
						{ label: 'What\'s here to see?', next: 'tour' },
						{ label: 'Why are you walking in circles?', next: 'why' },
						{ label: 'See you around.', next: 'end' },
					],
				},
				tour: {
					speaker: 'Anna',
					text: 'Cars are parked behind you, the helipad is over the hill, the boats sit at the dock east of here, and the rocketship lives on the island.',
					choices: [
						{ label: 'Why are you walking in circles?', next: 'why' },
						{ label: 'Thanks!', next: 'end' },
					],
				},
				why: {
					speaker: 'Anna',
					text: 'I\'m a path-following NPC. There are four invisible nodes around this area and I just walk between them. Ben does the same in reverse.',
					choices: [
						{ label: 'What\'s here to see?', next: 'tour' },
						{ label: 'Got it.', next: 'end' },
					],
				},
			},
		},
	},
	Ben: {
		role: 'Path Walker',
		dialog: {
			start: 'greet',
			nodes: {
				greet: {
					speaker: 'Ben',
					text: 'Hey. If you bumped into Anna she\'ll have told you about the loop — same deal here, just the other way around.',
					choices: [
						{ label: 'Any tips for the races?', next: 'races' },
						{ label: 'Tell me about the rocket.', next: 'rocket' },
						{ label: 'See you around.', next: 'end' },
					],
				},
				races: {
					speaker: 'Ben',
					text: 'Oval and Figure-8 are car races. The Tunnel is faster but the curves bite. Boat Race uses the marina — get in a boat and drive over the start.',
					choices: [
						{ label: 'Tell me about the rocket.', next: 'rocket' },
						{ label: 'Cool, thanks.', next: 'end' },
					],
				},
				rocket: {
					speaker: 'Ben',
					text: 'It launches you to the moon. Get in, hold W to start the countdown, and a planet picker shows up at apogee. Lunar gravity is real — be careful with the controls up there.',
					choices: [
						{ label: 'Any tips for the races?', next: 'races' },
						{ label: 'Got it.', next: 'end' },
					],
				},
			},
		},
	},
	Carla: {
		role: 'Greeter',
		dialog: {
			start: 'greet',
			nodes: {
				greet: {
					speaker: 'Carla',
					text: 'Welcome to Sketchbook! Press Esc anytime if you need a pause menu — Resume, Settings, Restart, Reload.',
					choices: [
						{ label: 'How do I drive a car?', next: 'cars' },
						{ label: 'How do the controls work?', next: 'controls' },
						{ label: 'Bye!', next: 'end' },
					],
				},
				cars: {
					speaker: 'Carla',
					text: 'Walk up to a vehicle, press F to enter, then WASD to drive. Press F again to leave. Same goes for boats, helis and the rocket — Shift makes air vehicles boost.',
					choices: [
						{ label: 'How do the controls work?', next: 'controls' },
						{ label: 'Got it.', next: 'end' },
					],
				},
				controls: {
					speaker: 'Carla',
					text: 'WASD moves you, Space jumps, Shift sprints. Z toggles the on-screen control hint. Shift+C is the free camera; T teleports you there.',
					choices: [
						{ label: 'How do I drive a car?', next: 'cars' },
						{ label: 'Thanks!', next: 'end' },
					],
				},
			},
		},
	},
	Dieter: {
		role: 'Mechanic',
		dialog: {
			start: 'greet',
			nodes: {
				greet: {
					speaker: 'Dieter',
					text: 'You can tune the cars from the Vehicles folder in the right-hand debug panel — friction, suspension, engine force. Changes apply to anything you spawn next.',
					choices: [
						{ label: 'What can I tune exactly?', next: 'tuning' },
						{ label: 'What\'s in the World folder?', next: 'world' },
						{ label: 'Cool, thanks.', next: 'end' },
					],
				},
				tuning: {
					speaker: 'Dieter',
					text: 'Friction Slip, Suspension Stiffness, Max Suspension, Damping Compression, Damping Relaxation, and Engine Force. Crank Engine Force up if you want to launch off the ramps.',
					choices: [
						{ label: 'What\'s in the World folder?', next: 'world' },
						{ label: 'Got it.', next: 'end' },
					],
				},
				world: {
					speaker: 'Dieter',
					text: 'Time scale, sun position, day/night cycle, gravity scale (0–2x), free-cam speed. Plus a Reset button if you mess everything up.',
					choices: [
						{ label: 'What can I tune exactly?', next: 'tuning' },
						{ label: 'Thanks!', next: 'end' },
					],
				},
			},
		},
	},
};
