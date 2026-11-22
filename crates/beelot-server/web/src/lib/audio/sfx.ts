// The sound kit of US-198: every sound is synthesised with the Web Audio API, so there are no audio files. The voices are
// FM marimbas and bells, filtered noise for the paper of the cards, and pitch-dropping sines for the thocks, through one
// bus with a compressor and a short generated reverb so that the sounds sit together. The "Sound effects" switch
// (`beelot.sound-enabled`) silences them; nothing plays before the browser allows audio (the first tap).

import { KEYS, local } from "$lib/storage";

type Wave = OscillatorType;

interface Voice {
  ctx: AudioContext;
  out: AudioNode;
  wet: AudioNode;
  at: number;
}

// Notes (Hz) of the kit: a D major pentatonic for the good news, its relative minor for the rest.
const N = {
  D3: 146.83,
  A3: 220,
  D4: 293.66,
  F4: 349.23,
  Fs4: 369.99,
  A4: 440,
  B4: 493.88,
  D5: 587.33,
  E5: 659.25,
  Fs5: 739.99,
  A5: 880,
  B5: 987.77,
  D6: 1174.66,
  E6: 1318.51,
  Fs6: 1479.98,
  A6: 1760
};

let noiseBuffer: AudioBuffer | null = null;

function noiseOf(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

// A small room: stereo noise that decays over 1.4 s.
function impulse(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 1.4);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3.2;
  }
  return buffer;
}

const vary = (value: number, amount = 0.06) => value * (1 + (Math.random() * 2 - 1) * amount);

function envelope(ctx: AudioContext, start: number, attack: number, decay: number, peak: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  return gain;
}

function connect(voice: Voice, node: AudioNode, send = 0): void {
  node.connect(voice.out);
  if (send > 0) {
    const sendGain = voice.ctx.createGain();
    sendGain.gain.value = send;
    node.connect(sendGain).connect(voice.wet);
  }
}

// A plain oscillator with a percussive envelope and an optional glide.
function tone(
  v: Voice,
  {
    freq,
    to,
    start = 0,
    dur = 0.15,
    vol = 0.1,
    type = "sine" as Wave,
    attack = 0.005,
    send = 0.1
  }: { freq: number; to?: number; start?: number; dur?: number; vol?: number; type?: Wave; attack?: number; send?: number }
) {
  const t = v.at + start;
  const osc = v.ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  const gain = envelope(v.ctx, t, attack, dur, vol);
  osc.connect(gain);
  connect(v, gain, send);
  osc.start(t);
  osc.stop(t + attack + dur + 0.05);
}

// Two-operator FM: `ratio` 4 sounds like a marimba, 1.4 or 3.5 like a bell; `bright` is the modulation index.
function fm(
  v: Voice,
  {
    freq,
    start = 0,
    dur = 0.5,
    vol = 0.1,
    ratio = 4,
    bright = 2.2,
    send = 0.18
  }: { freq: number; start?: number; dur?: number; vol?: number; ratio?: number; bright?: number; send?: number }
) {
  const t = v.at + start;
  const carrier = v.ctx.createOscillator();
  const modulator = v.ctx.createOscillator();
  const depth = v.ctx.createGain();
  carrier.frequency.setValueAtTime(freq, t);
  modulator.frequency.setValueAtTime(freq * ratio, t);
  depth.gain.setValueAtTime(freq * bright, t);
  depth.gain.exponentialRampToValueAtTime(Math.max(freq * 0.02, 0.01), t + dur * 0.5);
  modulator.connect(depth).connect(carrier.frequency);
  const gain = envelope(v.ctx, t, 0.004, dur, vol);
  carrier.connect(gain);
  connect(v, gain, send);
  carrier.start(t);
  modulator.start(t);
  carrier.stop(t + dur + 0.1);
  modulator.stop(t + dur + 0.1);
}

const marimba = (v: Voice, freq: number, start = 0, vol = 0.12, dur = 0.42) => fm(v, { freq, start, vol, dur, ratio: 4, bright: 1.6, send: 0.12 });
const bell = (v: Voice, freq: number, start = 0, vol = 0.08, dur = 0.9) => fm(v, { freq, start, vol, dur, ratio: 3.5, bright: 2.8, send: 0.3 });
const glass = (v: Voice, freq: number, start = 0, vol = 0.06, dur = 1.1) => fm(v, { freq, start, vol, dur, ratio: 1.4, bright: 1.2, send: 0.35 });

// Filtered noise: the paper of a card, a swish, a shimmer.
function noise(
  v: Voice,
  {
    start = 0,
    dur = 0.08,
    vol = 0.12,
    type = "bandpass" as BiquadFilterType,
    freq = 2000,
    to,
    q = 0.9,
    send = 0.05
  }: { start?: number; dur?: number; vol?: number; type?: BiquadFilterType; freq?: number; to?: number; q?: number; send?: number }
) {
  const t = v.at + start;
  const source = v.ctx.createBufferSource();
  source.buffer = noiseOf(v.ctx);
  const filter = v.ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, t);
  if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const gain = envelope(v.ctx, t, 0.003, dur, vol);
  source.connect(filter).connect(gain);
  connect(v, gain, send);
  source.start(t, Math.random() * 0.5);
  source.stop(t + dur + 0.05);
}

const thock = (v: Voice, freq = 150, start = 0, vol = 0.16) => tone(v, { freq: vary(freq), to: freq * 0.45, start, dur: 0.07, vol, send: 0.02 });

const SOUNDS = {
  tap: (v: Voice) => tone(v, { freq: vary(620, 0.03), to: 420, dur: 0.035, vol: 0.05, send: 0 }),
  toggle: (v: Voice) => {
    tone(v, { freq: 700, to: 980, dur: 0.05, vol: 0.05, send: 0 });
  },
  card: (v: Voice) => {
    noise(v, { dur: 0.035, vol: 0.2, type: "highpass", freq: vary(3200, 0.15), q: 0.7 });
    noise(v, { dur: 0.06, vol: 0.14, freq: vary(1300, 0.15), q: 1.2 });
    thock(v, 165, 0.004, 0.14);
  },
  flip: (v: Voice) => noise(v, { dur: 0.07, vol: 0.08, type: "highpass", freq: vary(4200), to: 2400, q: 0.6 }),
  deal: (v: Voice) => {
    noise(v, { dur: 0.1, vol: 0.09, freq: vary(5200, 0.12), to: 1600, q: 1.4 });
    thock(v, 210, 0.08, 0.05);
  },
  collect: (v: Voice) => {
    noise(v, { dur: 0.22, vol: 0.07, freq: 3600, to: 700, q: 0.8, send: 0.1 });
  },
  turn: (v: Voice) => {
    glass(v, N.B5, 0, 0.05, 0.7);
    glass(v, N.E6, 0.11, 0.05, 0.9);
  },
  bid: (v: Voice) => {
    marimba(v, N.A4, 0, 0.11);
    marimba(v, N.D5, 0.08, 0.12);
  },
  pass: (v: Voice) => {
    marimba(v, N.Fs4, 0, 0.09, 0.3);
    tone(v, { freq: 330, to: 270, dur: 0.12, vol: 0.03, type: "triangle", start: 0.01 });
  },
  coinche: (v: Voice) => {
    tone(v, { freq: 120, to: 42, dur: 0.22, vol: 0.32, send: 0.05 });
    noise(v, { dur: 0.12, vol: 0.18, freq: 900, q: 0.6 });
    bell(v, N.Fs5, 0.03, 0.07, 1.1);
    bell(v, N.A5, 0.05, 0.05, 1.1);
  },
  trickWin: (v: Voice) => {
    bell(v, N.D6, 0, 0.06, 0.6);
    bell(v, N.Fs6, 0.06, 0.055, 0.7);
    bell(v, N.A6, 0.12, 0.05, 0.9);
  },
  trickLose: (v: Voice) => {
    marimba(v, N.A4, 0, 0.07, 0.3);
    marimba(v, N.Fs4, 0.09, 0.06, 0.35);
  },
  roundWin: (v: Voice) => {
    [N.D5, N.Fs5, N.A5, N.D6].forEach((freq, i) => marimba(v, freq, i * 0.08, 0.11));
    glass(v, N.A6, 0.34, 0.05, 1.2);
    noise(v, { start: 0.3, dur: 0.6, vol: 0.03, type: "highpass", freq: 7000, send: 0.4 });
  },
  roundLose: (v: Voice) => {
    [N.A4, N.F4, N.D4].forEach((freq, i) => marimba(v, freq, i * 0.11, 0.09, 0.5));
  },
  matchWin: (v: Voice) => {
    [N.D5, N.Fs5, N.A5, N.D6, N.Fs6].forEach((freq, i) => marimba(v, freq, i * 0.075, 0.12));
    [N.D5, N.Fs5, N.A5, N.D6].forEach((freq) => bell(v, freq, 0.45, 0.045, 1.8));
    for (let i = 0; i < 6; i += 1) noise(v, { start: 0.5 + i * 0.09, dur: 0.05, vol: 0.06, type: "highpass", freq: vary(6000, 0.3), send: 0.3 });
  },
  capot: (v: Voice) => {
    noise(v, { dur: 0.5, vol: 0.06, freq: 400, to: 6000, q: 1.6, send: 0.25 });
    [N.D5, N.A5, N.D6, N.Fs6, N.A6].forEach((freq, i) => bell(v, freq, 0.35 + i * 0.05, 0.05, 1.2));
  },
  coincheWon: (v: Voice) => {
    tone(v, { freq: 120, to: 42, dur: 0.2, vol: 0.26 });
    [N.D5, N.Fs5, N.A5, N.D6].forEach((freq, i) => marimba(v, freq, 0.12 + i * 0.07, 0.11));
  },
  defended: (v: Voice) => {
    marimba(v, N.E5, 0, 0.11);
    bell(v, N.B5, 0.08, 0.06, 0.8);
  },
  belote: (v: Voice) => {
    tone(v, { freq: 600, to: 1250, dur: 0.22, vol: 0.04, type: "triangle", send: 0.3 });
    glass(v, N.E6, 0.12, 0.06, 0.9);
    glass(v, N.B5 * 2, 0.2, 0.045, 1.1);
  },
  contractLost: (v: Voice) => {
    marimba(v, N.D4, 0, 0.11, 0.5);
    tone(v, { freq: 262, to: 220, dur: 0.3, vol: 0.05, type: "triangle", start: 0.05 });
    tone(v, { freq: 220, to: 175, dur: 0.4, vol: 0.05, type: "triangle", start: 0.36 });
  },
  correct: (v: Voice) => {
    marimba(v, N.A5, 0, 0.11);
    bell(v, N.D6, 0.08, 0.06, 0.8);
  },
  wrong: (v: Voice) => {
    tone(v, { freq: 210, to: 160, dur: 0.18, vol: 0.06, type: "triangle", send: 0 });
    tone(v, { freq: 180, to: 140, dur: 0.2, vol: 0.05, type: "triangle", start: 0.11, send: 0 });
  },
  refuse: (v: Voice) => {
    thock(v, 120, 0, 0.09);
    thock(v, 100, 0.07, 0.07);
  },
  reaction: (v: Voice) => tone(v, { freq: 380, to: 920, dur: 0.07, vol: 0.06, send: 0.1 }),
  invite: (v: Voice) => {
    glass(v, N.A5, 0, 0.06, 0.8);
    glass(v, N.D6, 0.14, 0.06, 1);
  },
  unlock: (v: Voice) => {
    [N.D6, N.E6, N.Fs6, N.A6].forEach((freq, i) => bell(v, freq, i * 0.06, 0.05, 1));
  }
} satisfies Record<string, (v: Voice) => void>;

export type SoundName = keyof typeof SOUNDS;

class SoundKit {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private wet: ConvolverNode | null = null;
  private override: boolean | null = null;

  enabled(): boolean {
    if (this.override !== null) return this.override;
    return local.getItem(KEYS.soundEnabled) !== "false";
  }

  setEnabled(on: boolean): void {
    this.override = on;
    local.setItem(KEYS.soundEnabled, String(on));
  }

  private context(): AudioContext | null {
    if (!this.ctx) {
      const Context = globalThis.AudioContext ?? (globalThis as any).webkitAudioContext;
      if (!Context) return null;
      const ctx: AudioContext = new Context();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;
      const master = ctx.createGain();
      master.gain.value = 0.9;
      const reverb = ctx.createConvolver();
      reverb.buffer = impulse(ctx);
      const reverbLevel = ctx.createGain();
      reverbLevel.gain.value = 0.5;
      reverb.connect(reverbLevel).connect(compressor);
      master.connect(compressor).connect(ctx.destination);
      this.ctx = ctx;
      this.out = master;
      this.wet = reverb;
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  play(name: SoundName): void {
    if (!this.enabled()) return;
    try {
      const ctx = this.context();
      if (!ctx || !this.out || !this.wet) return;
      SOUNDS[name]({ ctx, out: this.out, wet: this.wet, at: ctx.currentTime + 0.005 });
    } catch {
      /* sound is a nicety; it never breaks the game */
    }
  }
}

export const sfx = new SoundKit();
export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];
