const test = require("node:test");
const assert = require("node:assert/strict");
const { sounds } = require("../static/sounds.js");
const { MOMENTS } = require("../static/celebrations.js");

// A stand-in for the Web Audio context that counts the sources a sound starts.
function stubContext() {
  const started = [];
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (kind) => ({
    kind,
    frequency: param(),
    gain: param(),
    Q: param(),
    connect: (next) => next,
    start() { started.push(kind); },
    stop() {},
  });
  return {
    started,
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    createOscillator: () => node("oscillator"),
    createGain: () => node("gain"),
    createBiquadFilter: () => node("filter"),
    createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => node("buffer"),
  };
}

test("every moment has a sound in the table", () => {
  for (const [kind, moment] of Object.entries(MOMENTS)) {
    assert.equal(typeof sounds[moment.sound], "function", `${kind} uses a missing sound: ${moment.sound}`);
  }
});

for (const name of ["capot", "coincheWon", "defended", "belote", "contractLost"]) {
  test(`the ${name} sound starts at least one source`, () => {
    const ctx = stubContext();
    sounds[name](ctx);
    assert.ok(ctx.started.length > 0);
  });
}
