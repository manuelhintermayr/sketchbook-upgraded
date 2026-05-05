import { World } from '../World';
import { ProceduralAudio } from './ProceduralAudio';

// Procedural ambient atmosphere - wind (filtered white noise), bird
// chirps (FM-synthesised sine bursts on a Poisson-ish schedule), and
// water (bandpass-filtered noise modulated by an LFO, gated by
// camera proximity to the ocean). All procedural - no sample files.
//
// Lifecycle (start / stop / master volume sync / autoplay-resume) is
// inherited from ProceduralAudio; this file only builds the synth
// graph and updates per-frame water-proximity gating.

const WIND_GAIN = 0.08;
const BIRD_GAIN = 0.05;
const WATER_GAIN = 0.12;

interface AmbientNodes
{
	windSource: AudioBufferSourceNode;
	windLowpass: BiquadFilterNode;
	windHighpass: BiquadFilterNode;
	windGain: GainNode;
	birdCarrier: OscillatorNode;
	birdModulator: OscillatorNode;
	birdModGain: GainNode;
	birdFilter: BiquadFilterNode;
	birdGain: GainNode;
	waterSource: AudioBufferSourceNode;
	waterFilter: BiquadFilterNode;
	waterLfo: OscillatorNode;
	waterLfoGain: GainNode;
	waterGain: GainNode;
}

export class AmbientSound extends ProceduralAudio
{
	protected readonly masterMix = 0.7;

	private nodes: AmbientNodes | null = null;
	private chirpTimeout: ReturnType<typeof setTimeout> | undefined;

	constructor(world: World)
	{
		super(world);
	}

	protected shouldPlay(): boolean
	{
		return !!this.world.params?.Ambient_Sound;
	}

	protected buildSynth(ctx: AudioContext, master: GainNode): void
	{
		const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
		const noiseData = noiseBuffer.getChannelData(0);
		for (let i = 0; i < noiseData.length; i++)
		{
			noiseData[i] = Math.random() * 2 - 1;
		}

		// Wind - looped white noise through a low + highpass to land in
		// the rumbly mid-low range a real outdoor breeze sits in.
		const windSource = ctx.createBufferSource();
		windSource.buffer = noiseBuffer;
		windSource.loop = true;

		const windLowpass = ctx.createBiquadFilter();
		windLowpass.type = 'lowpass';
		windLowpass.frequency.value = 400;
		windLowpass.Q.value = 0.5;

		const windHighpass = ctx.createBiquadFilter();
		windHighpass.type = 'highpass';
		windHighpass.frequency.value = 100;
		windHighpass.Q.value = 0.5;

		const windGain = ctx.createGain();
		windGain.gain.value = WIND_GAIN;

		windSource.connect(windLowpass);
		windLowpass.connect(windHighpass);
		windHighpass.connect(windGain);
		windGain.connect(master);
		windSource.start();

		// Birds - FM synthesis on a sine carrier; modulator frequency
		// shifts each chirp burst for variety. Gain is normally 0 and
		// briefly pulsed by scheduleChirp.
		const birdCarrier = ctx.createOscillator();
		birdCarrier.type = 'sine';
		birdCarrier.frequency.value = 2000;

		const birdModulator = ctx.createOscillator();
		birdModulator.type = 'sine';
		birdModulator.frequency.value = 8;

		const birdModGain = ctx.createGain();
		birdModGain.gain.value = 500;

		const birdFilter = ctx.createBiquadFilter();
		birdFilter.type = 'bandpass';
		birdFilter.frequency.value = 3000;
		birdFilter.Q.value = 2;

		const birdGain = ctx.createGain();
		birdGain.gain.value = 0;

		birdModulator.connect(birdModGain);
		birdModGain.connect(birdCarrier.frequency);
		birdCarrier.connect(birdFilter);
		birdFilter.connect(birdGain);
		birdGain.connect(master);
		birdCarrier.start();
		birdModulator.start();

		// Water - bandpass-filtered noise with a slow LFO sweeping the
		// filter centre. Gated by proximity to the ocean each frame.
		const waterSource = ctx.createBufferSource();
		waterSource.buffer = noiseBuffer;
		waterSource.loop = true;

		const waterFilter = ctx.createBiquadFilter();
		waterFilter.type = 'bandpass';
		waterFilter.frequency.value = 300;
		waterFilter.Q.value = 1;

		const waterLfo = ctx.createOscillator();
		waterLfo.type = 'sine';
		waterLfo.frequency.value = 0.15;

		const waterLfoGain = ctx.createGain();
		waterLfoGain.gain.value = 100;

		const waterGain = ctx.createGain();
		waterGain.gain.value = 0;

		waterLfo.connect(waterLfoGain);
		waterLfoGain.connect(waterFilter.frequency);
		waterSource.connect(waterFilter);
		waterFilter.connect(waterGain);
		waterGain.connect(master);
		waterSource.start();
		waterLfo.start();

		this.nodes =
		{
			windSource, windLowpass, windHighpass, windGain,
			birdCarrier, birdModulator, birdModGain, birdFilter, birdGain,
			waterSource, waterFilter, waterLfo, waterLfoGain, waterGain,
		};

		this.scheduleChirp();
	}

	protected teardownSynth(): void
	{
		if (this.chirpTimeout !== undefined)
		{
			clearTimeout(this.chirpTimeout);
			this.chirpTimeout = undefined;
		}

		const n = this.nodes;
		if (n === null) return;
		try
		{
			n.windSource.stop();
			n.birdCarrier.stop();
			n.birdModulator.stop();
			n.waterSource.stop();
			n.waterLfo.stop();
		}
		catch (_e)
		{
			// Already stopped.
		}
		this.nodes = null;
	}

	protected updateSynth(_unscaledTimeStep: number): void
	{
		const n = this.nodes;
		if (n === null || this.ctx === null) return;

		// Water proximity - Sketchbook's Inthenew ocean sits at y=12, the
		// wave grid covers a large area around the origin. Near-water is
		// any time the camera is below ~25 and Ocean exists. Cheap
		// approximation; getWaveHeightAt would be more accurate but
		// allocates per call which is wasted for an on/off gate.
		const cam = this.world.camera.position;
		const nearWater = this.world.ocean !== null && cam.y < 25;
		n.waterGain.gain.setTargetAtTime(nearWater ? WATER_GAIN : 0, this.ctx.currentTime, 0.3);
	}

	// FM-synthesised bird chirp scheduler. Pokes birdCarrier frequency +
	// briefly opens birdGain for a short burst; reschedules itself on a
	// random 2-7s delay. Cleared in teardownSynth so a stop doesn't
	// leave a dangling timer poking dead nodes.
	private scheduleChirp(): void
	{
		const delay = 2000 + Math.random() * 5000;
		this.chirpTimeout = setTimeout(() =>
		{
			const n = this.nodes;
			if (n === null || this.ctx === null || this.ctx.state === 'closed') return;

			const now = this.ctx.currentTime;
			const chirpCount = 1 + Math.floor(Math.random() * 4);
			const chirpDuration = 0.1 + Math.random() * 0.2;

			for (let c = 0; c < chirpCount; c++)
			{
				const t = now + c * (chirpDuration + 0.05);
				n.birdCarrier.frequency.setValueAtTime(1500 + Math.random() * 2000, t);
				n.birdModulator.frequency.setValueAtTime(5 + Math.random() * 15, t);
				n.birdGain.gain.linearRampToValueAtTime(BIRD_GAIN, t + 0.02);
				n.birdGain.gain.linearRampToValueAtTime(0, t + chirpDuration);
			}

			this.scheduleChirp();
		}, delay);
	}
}
