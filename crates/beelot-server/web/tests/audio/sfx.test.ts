// The synthesised sound kit: every sound builds its graph without error, nothing is created while sound is off or before
// the browser has audio, and a failing audio engine never reaches the game.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

// A Web Audio double: every node is a chainable stand-in, and each created node is counted.
function audioContext(state = "running") {
  const created: string[] = [];
  const node = (kind: string): any => {
    created.push(kind);
    const target: any = { connect: (next: unknown) => next, start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() };
    return new Proxy(target, {
      get: (object, name: string) =>
        name in object ? object[name] : ["gain", "frequency", "detune", "Q", "threshold", "knee", "ratio", "attack", "release", "pan"].includes(name) ? param() : undefined,
      set: (object, name: string, value) => ((object[name] = value), true)
    });
  };
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn()
  });
  class Context {
    static instances: Context[] = [];
    state = state;
    sampleRate = 8000;
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => {});
    constructor() {
      Context.instances.push(this);
    }
    createBuffer(channels: number, length: number) {
      return { sampleRate: this.sampleRate, getChannelData: () => new Float32Array(length), channels };
    }
    createBufferSource = () => node("source");
    createOscillator = () => node("oscillator");
    createGain = () => node("gain");
    createBiquadFilter = () => node("filter");
    createDynamicsCompressor = () => node("compressor");
    createConvolver = () => node("convolver");
    createStereoPanner = () => node("panner");
    createWaveShaper = () => node("shaper");
    createDelay = () => node("delay");
  }
  return { Context, created };
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => vi.unstubAllGlobals());

test("every sound of the kit plays through the audio graph", async () => {
  const { Context, created } = audioContext();
  vi.stubGlobal("AudioContext", Context);
  const { sfx, SOUND_NAMES } = await import("$lib/audio/sfx");
  assert.ok(SOUND_NAMES.length >= 10);
  for (const name of SOUND_NAMES) {
    const before = created.length;
    sfx.play(name);
    assert.ok(created.length > before, `${name} makes sound`);
  }
  assert.equal(Context.instances.length, 1, "one audio context serves the whole kit");
});

test("the kit has the sounds of invitations and unlocks", async () => {
  const { SOUND_NAMES } = await import("$lib/audio/sfx");
  for (const name of ["invite", "unlock"]) assert.ok(SOUND_NAMES.includes(name as never), name);
});

test("a suspended context is resumed by the first sound", async () => {
  const { Context } = audioContext("suspended");
  vi.stubGlobal("AudioContext", Context);
  const { sfx, SOUND_NAMES } = await import("$lib/audio/sfx");
  sfx.play(SOUND_NAMES[0]);
  assert.equal(Context.instances[0].resume.mock.calls.length, 1);
});

test("with sound off nothing is created, and the choice is stored", async () => {
  const { Context } = audioContext();
  vi.stubGlobal("AudioContext", Context);
  const { sfx, SOUND_NAMES } = await import("$lib/audio/sfx");
  sfx.setEnabled(false);
  assert.equal(sfx.enabled(), false);
  assert.equal(localStorage.getItem("beelot.sound-enabled"), "false");
  sfx.play(SOUND_NAMES[0]);
  assert.equal(Context.instances.length, 0);
  sfx.setEnabled(true);
  sfx.play(SOUND_NAMES[0]);
  assert.equal(Context.instances.length, 1);
});

test("sound is on unless the stored choice says false, even when storage is blocked", async () => {
  localStorage.setItem("beelot.sound-enabled", "false");
  const off = await import("$lib/audio/sfx");
  assert.equal(off.sfx.enabled(), false);
  vi.resetModules();
  const refuse = () => {
    throw new Error("blocked");
  };
  vi.stubGlobal("localStorage", { getItem: refuse, setItem: refuse });
  const blocked = await import("$lib/audio/sfx");
  assert.equal(blocked.sfx.enabled(), true);
});

test("a browser with no Web Audio plays nothing and breaks nothing", async () => {
  vi.stubGlobal("AudioContext", undefined);
  const { sfx, SOUND_NAMES } = await import("$lib/audio/sfx");
  sfx.play(SOUND_NAMES[0]);
});

test("an audio engine that throws never reaches the game", async () => {
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        throw new Error("no audio device");
      }
    }
  );
  const { sfx, SOUND_NAMES } = await import("$lib/audio/sfx");
  sfx.play(SOUND_NAMES[0]);
});
