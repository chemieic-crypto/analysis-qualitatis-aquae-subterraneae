/**
 * Lightweight Web Audio API Indian Classical (Shastriya Sangeet) & Instrumental Raga Engine.
 * Serves as an instant offline / ambient studio fallback with authentic Indian pentatonic & heptatonic ragas
 * paired with a soothing Tanpura drone and plucked Sitar/Santoor/Bansuri harmonics.
 */

export interface AmbientRagaPreset {
  id: string;
  title: string;
  artist: string;
  category: "shastriya" | "instrumental";
  description: string;
  tonicHz: number;
  scaleRatios: number[];
  tempoMs: number;
  instrument: "sitar" | "bansuri" | "santoor";
}

export const AMBIENT_RAGA_PRESETS: AmbientRagaPreset[] = [
  {
    id: "raga-yaman",
    title: "Raga Yaman — Evening Alap (Sitar & Tanpura)",
    artist: "Shastriya Studio Synth",
    category: "shastriya",
    description: "Kalyan Thaat · Peaceful evening melody",
    tonicHz: 261.63, // C4 Sa
    scaleRatios: [1, 9 / 8, 5 / 4, 45 / 32, 3 / 2, 27 / 16, 15 / 8, 2],
    tempoMs: 520,
    instrument: "sitar",
  },
  {
    id: "raga-bhupali",
    title: "Raga Bhupali — Bansuri Meditation",
    artist: "Instrumental Studio Synth",
    category: "instrumental",
    description: "Pentatonic · Calm bamboo flute phrasing",
    tonicHz: 293.66, // D4 Sa
    scaleRatios: [1, 9 / 8, 5 / 4, 3 / 2, 27 / 16, 2],
    tempoMs: 600,
    instrument: "bansuri",
  },
  {
    id: "raga-desh",
    title: "Raga Desh — Monsoon Santoor",
    artist: "Instrumental Studio Synth",
    category: "instrumental",
    description: "Khamaj Thaat · Classical rain raga",
    tonicHz: 246.94, // B3 Sa
    scaleRatios: [1, 9 / 8, 4 / 3, 3 / 2, 15 / 8, 2, 9 / 4, 3 / 2, 16 / 9, 27 / 16],
    tempoMs: 440,
    instrument: "santoor",
  },
  {
    id: "raga-bhairavi",
    title: "Raga Bhairavi — Morning Devotional",
    artist: "Shastriya Studio Synth",
    category: "shastriya",
    description: "Bhairavi Thaat · Komal swaras",
    tonicHz: 220.0, // A3 Sa
    scaleRatios: [1, 16 / 15, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 9 / 5, 2],
    tempoMs: 560,
    instrument: "sitar",
  },
];

export class IndianRagaSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];
  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private stepIdx = 0;
  private currentPreset: AmbientRagaPreset | null = null;
  private volume = 0.7;
  private muted = false;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume * 0.45;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.volume * 0.45,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.volume * 0.45,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  public start(preset: AmbientRagaPreset): void {
    this.stop();
    const ctx = this.ensureContext();
    if (!this.masterGain) return;

    this.currentPreset = preset;
    this.stepIdx = 0;

    // Subtle Tanpura Drone (Sa - Pa - Sa)
    const droneFreqs = [preset.tonicHz * 0.5, preset.tonicHz * 0.75, preset.tonicHz];
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.14;

    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 650;

    droneGain.connect(droneFilter);
    droneFilter.connect(this.masterGain);

    this.droneOscs = droneFreqs.map((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx === 1 ? "triangle" : "sine";
      osc.frequency.value = freq;
      osc.connect(droneGain);
      osc.start();
      return osc;
    });

    const playNote = () => {
      if (!this.ctx || !this.masterGain || !this.currentPreset) return;
      const now = this.ctx.currentTime;
      const ratios = this.currentPreset.scaleRatios;
      // Melodic phrasing that gently ascends/descends like an Alap
      const pattern = [0, 1, 2, 3, 2, 4, 3, 5, 4, 2, 1, 0, 2, 4, 6, 4];
      const idx = pattern[this.stepIdx % pattern.length] % ratios.length;
      const freq = this.currentPreset.tonicHz * ratios[idx];
      this.stepIdx++;

      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      if (this.currentPreset.instrument === "bansuri") {
        osc.type = "sine";
        filter.type = "lowpass";
        filter.frequency.value = 1400;
        env.gain.setValueAtTime(0.001, now);
        env.gain.linearRampToValueAtTime(0.32, now + 0.14);
        env.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
      } else if (this.currentPreset.instrument === "santoor") {
        osc.type = "triangle";
        filter.type = "bandpass";
        filter.frequency.value = freq * 2;
        filter.Q.value = 1.6;
        env.gain.setValueAtTime(0.001, now);
        env.gain.linearRampToValueAtTime(0.38, now + 0.015);
        env.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      } else {
        // Sitar-like plucked harmonic shimmer
        osc.type = "sawtooth";
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(2200, now);
        filter.frequency.exponentialRampToValueAtTime(480, now + 0.8);
        env.gain.setValueAtTime(0.001, now);
        env.gain.linearRampToValueAtTime(0.24, now + 0.02);
        env.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
      }

      osc.frequency.setValueAtTime(freq, now);
      osc.connect(filter);
      filter.connect(env);
      env.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 1.25);
    };

    playNote();
    this.loopTimer = setInterval(playNote, preset.tempoMs);
  }

  public stop(): void {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    for (const osc of this.droneOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // already stopped
      }
    }
    this.droneOscs = [];
    this.currentPreset = null;
  }

  public destroy(): void {
    this.stop();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.masterGain = null;
    }
  }
}
