import { World } from './World';
import { Vehicle } from '../vehicles/Vehicle';
import { IUpdatable } from '../interfaces/IUpdatable';

// Procedural engine sound: 2-layer Web Audio synthesis (sawtooth +
// square exhaust through a lowpass + bandpass-filtered noise intake)
// modulated by chassis speed. No sample files needed; the timbre is
// shaped per-vehicle via EngineProfile.
//
// Pattern adapted from manuelhintermayr-portfolio/three-js
// useEngineSound — reshaped from a React hook into a per-vehicle
// IUpdatable owned by the Vehicle base class. Master volume is read
// each frame from world.params.Master_Volume (the same value that
// drives THREE.AudioListener for positional audio) so the existing
// SettingsModal volume slider applies here too without any extra
// wiring. Browser autoplay policy: the AudioContext starts suspended
// until the first user gesture, so engine sound only becomes audible
// after the player clicks/keypresses (the title screen gesture
// usually satisfies it).

export interface EngineProfile
{
	idleFreq: number;
	maxFreq: number;
	exhaustGain: number;
	intakeGain: number;
	exhaustLowpass: number;
	speedDivisor: number;
}

export const ENGINE_PROFILES: { [name: string]: EngineProfile } =
{
	car:      { idleFreq: 55, maxFreq: 220, exhaustGain: 0.30, intakeGain: 0.15, exhaustLowpass: 200, speedDivisor: 40 },
	heli:     { idleFreq: 80, maxFreq: 250, exhaustGain: 0.25, intakeGain: 0.20, exhaustLowpass: 350, speedDivisor: 25 },
	airplane: { idleFreq: 70, maxFreq: 280, exhaustGain: 0.28, intakeGain: 0.22, exhaustLowpass: 300, speedDivisor: 60 },
	boat:     { idleFreq: 45, maxFreq: 180, exhaustGain: 0.32, intakeGain: 0.10, exhaustLowpass: 150, speedDivisor: 20 },
	rocket:   { idleFreq: 30, maxFreq: 110, exhaustGain: 0.40, intakeGain: 0.25, exhaustLowpass: 120, speedDivisor: 80 },
};

interface EngineNodes
{
	ctx: AudioContext;
	exhaustOsc1: OscillatorNode;
	exhaustOsc2: OscillatorNode;
	exhaustFilter: BiquadFilterNode;
	exhaustGain: GainNode;
	intakeSource: AudioBufferSourceNode;
	intakeFilter: BiquadFilterNode;
	intakeGain: GainNode;
	compressor: DynamicsCompressorNode;
	masterGain: GainNode;
}

const IDLE_RPM = 800;
const MAX_RPM = 6000;

export class EngineSound implements IUpdatable
{
	public updateOrder: number = 11;

	private world: World;
	private vehicle: Vehicle;
	private profile: EngineProfile;
	private nodes: EngineNodes | null = null;
	private rpm: number = IDLE_RPM;
	private active: boolean = false;

	constructor(vehicle: Vehicle, world: World, profile: EngineProfile)
	{
		this.vehicle = vehicle;
		this.world = world;
		this.profile = profile;
	}

	public update(_timeStep: number, unscaledTimeStep: number): void
	{
		const enabled = !!this.world.params?.Engine_Sound;
		const occupied = this.vehicle.controllingCharacter !== undefined;
		const shouldPlay = enabled && occupied;

		if (shouldPlay && !this.active)
		{
			this.start();
			this.active = true;
		}
		else if (!shouldPlay && this.active)
		{
			this.stop();
			this.active = false;
		}

		const n = this.nodes;
		if (n === null || n.ctx.state === 'closed') return;

		// Browser autoplay policy can leave the context suspended until
		// the first user gesture. Try resuming each frame — cheap, and
		// the browser ignores it once already running.
		if (n.ctx.state === 'suspended')
		{
			n.ctx.resume();
		}

		const dt = Math.min(unscaledTimeStep, 0.05);

		const v = this.vehicle.collision.velocity;
		const speed = Math.sqrt(v.x * v.x + v.z * v.z);
		const speedFactor = Math.min(speed / this.profile.speedDivisor, 1);

		const targetRPM = IDLE_RPM + (MAX_RPM - IDLE_RPM) * speedFactor;
		this.rpm += (targetRPM - this.rpm) * Math.min(1, dt * 5);
		const rpmFactor = (this.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM);

		const baseFreq = this.profile.idleFreq + (this.profile.maxFreq - this.profile.idleFreq) * rpmFactor;
		n.exhaustOsc1.frequency.value = baseFreq;
		n.exhaustOsc2.frequency.value = baseFreq * 0.5;
		n.exhaustFilter.frequency.value = this.profile.exhaustLowpass + rpmFactor * 400;
		n.exhaustGain.gain.value = this.profile.exhaustGain * (0.7 + rpmFactor * 0.3);

		n.intakeFilter.frequency.value = 600 + rpmFactor * 1200;
		n.intakeGain.gain.value = speedFactor > 0.1
			? this.profile.intakeGain * speedFactor * (0.5 + rpmFactor)
			: 0;

		// Master gain follows world.params.Master_Volume so the existing
		// SettingsModal slider drives engine + positional audio together.
		const master = (this.world.params?.Master_Volume ?? 80) / 100;
		const now = n.ctx.currentTime;
		n.masterGain.gain.setTargetAtTime(master, now, 0.1);
	}

	public dispose(): void
	{
		if (this.active) this.stop();
		this.active = false;
	}

	private start(): void
	{
		if (this.nodes !== null) return;

		const ctx = new AudioContext();

		const compressor = ctx.createDynamicsCompressor();
		compressor.threshold.value = -24;
		compressor.knee.value = 30;
		compressor.ratio.value = 12;
		compressor.attack.value = 0.003;
		compressor.release.value = 0.25;

		const masterGain = ctx.createGain();
		masterGain.gain.value = (this.world.params?.Master_Volume ?? 80) / 100;
		compressor.connect(masterGain);
		masterGain.connect(ctx.destination);

		const exhaustOsc1 = ctx.createOscillator();
		exhaustOsc1.type = 'sawtooth';
		exhaustOsc1.frequency.value = this.profile.idleFreq;

		const exhaustOsc2 = ctx.createOscillator();
		exhaustOsc2.type = 'square';
		exhaustOsc2.frequency.value = this.profile.idleFreq * 0.5;

		const exhaustFilter = ctx.createBiquadFilter();
		exhaustFilter.type = 'lowpass';
		exhaustFilter.frequency.value = this.profile.exhaustLowpass;

		const exhaustGain = ctx.createGain();
		exhaustGain.gain.value = this.profile.exhaustGain;

		exhaustOsc1.connect(exhaustFilter);
		exhaustOsc2.connect(exhaustFilter);
		exhaustFilter.connect(exhaustGain);
		exhaustGain.connect(compressor);

		exhaustOsc1.start();
		exhaustOsc2.start();

		const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
		const noiseData = noiseBuffer.getChannelData(0);
		for (let i = 0; i < noiseData.length; i++)
		{
			noiseData[i] = Math.random() * 2 - 1;
		}

		const intakeSource = ctx.createBufferSource();
		intakeSource.buffer = noiseBuffer;
		intakeSource.loop = true;

		const intakeFilter = ctx.createBiquadFilter();
		intakeFilter.type = 'bandpass';
		intakeFilter.frequency.value = 800;
		intakeFilter.Q.value = 2;

		const intakeGain = ctx.createGain();
		intakeGain.gain.value = 0;

		intakeSource.connect(intakeFilter);
		intakeFilter.connect(intakeGain);
		intakeGain.connect(compressor);

		intakeSource.start();

		this.nodes =
		{
			ctx,
			exhaustOsc1, exhaustOsc2, exhaustFilter, exhaustGain,
			intakeSource, intakeFilter, intakeGain,
			compressor, masterGain,
		};
		this.rpm = IDLE_RPM;
	}

	private stop(): void
	{
		const n = this.nodes;
		if (n === null) return;

		const now = n.ctx.currentTime;
		n.masterGain.gain.setTargetAtTime(0, now, 0.05);

		// Defer hard-stop slightly so the gain ramp is audible. setTimeout
		// handle isn't tracked because dispose() can also reach this — both
		// paths converge on .ctx.close() being safe to call multiple times.
		setTimeout(() =>
		{
			try
			{
				n.exhaustOsc1.stop();
				n.exhaustOsc2.stop();
				n.intakeSource.stop();
				n.ctx.close();
			}
			catch (_e)
			{
				// Already stopped — nothing to do.
			}
		}, 200);

		this.nodes = null;
	}
}
