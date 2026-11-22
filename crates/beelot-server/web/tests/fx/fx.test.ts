// The effects of the table: vibrations, the card flights, the particle bursts.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { boxOf, centre, flyPacket, pause } from "$lib/fx/flight";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
  document.body.replaceChildren();
  delete document.documentElement.dataset.effects;
});

// ---------------------------------------------------------------- haptics
async function haptics(supported: boolean) {
  vi.resetModules();
  const vibrate = vi.fn(() => true);
  if (supported) vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { vibrate }));
  return { module: await import("$lib/fx/haptics"), vibrate };
}

test("a buzz vibrates with its pattern when the phone can and the switch is on", async () => {
  localStorage.clear();
  const { module, vibrate } = await haptics(true);
  assert.equal(module.vibrationSupported, true);
  module.buzz("card");
  module.buzz("trick");
  assert.deepEqual(vibrate.mock.calls, [[12], [[10, 40, 18]]]);
});

test("the Vibration switch and the effects level off silence the buzz", async () => {
  localStorage.clear();
  const { module, vibrate } = await haptics(true);
  module.setVibration(false);
  assert.equal(module.vibrationEnabled(), false);
  module.buzz("win");
  module.setVibration(true);
  document.documentElement.dataset.effects = "off";
  module.buzz("win");
  assert.equal(vibrate.mock.calls.length, 0);
  document.documentElement.dataset.effects = "reduced";
  module.buzz("win");
  assert.equal(vibrate.mock.calls.length, 1);
});

test("a phone with no vibration, or one that refuses it, is never an error", async () => {
  const none = await haptics(false);
  assert.equal(none.module.vibrationSupported, false);
  none.module.buzz("card");
  const refusing = await haptics(true);
  refusing.vibrate.mockImplementation(() => {
    throw new Error("not allowed");
  });
  refusing.module.buzz("card");
});

test("a blocked storage leaves vibration on and keeps the choice for the page", async () => {
  const { module } = await haptics(true);
  const refuse = () => {
    throw new Error("blocked");
  };
  vi.stubGlobal("localStorage", { getItem: refuse, setItem: refuse });
  assert.equal(module.vibrationEnabled(), true);
  module.setVibration(false);
});

// ---------------------------------------------------------------- flight
test("the centre of a box, and the box of an element that is shown", () => {
  assert.deepEqual(centre({ left: 10, top: 20, width: 100, height: 40 }), { x: 60, y: 40 });
  assert.equal(boxOf(null), null);
  const element = document.createElement("div");
  element.getBoundingClientRect = () => ({ left: 1, top: 2, width: 30, height: 40 }) as DOMRect;
  assert.deepEqual(boxOf(element), { left: 1, top: 2, width: 30, height: 40 });
  element.getBoundingClientRect = () => ({ left: 1, top: 2, width: 0, height: 0 }) as DOMRect;
  assert.equal(boxOf(element), null, "an element that is not laid out has no box");
});

test("a packet of card backs flies from one box to the other and is removed when it lands", async () => {
  const layer = document.createElement("div");
  document.body.append(layer);
  let keyframes: Keyframe[] = [];
  let finish!: () => void;
  HTMLElement.prototype.animate = (frames: Keyframe[]) => {
    keyframes = frames;
    return { finished: new Promise<void>((resolve) => (finish = resolve)) } as unknown as Animation;
  };
  const landed = flyPacket(layer, { left: 0, top: 0, width: 10, height: 10 }, { left: 200, top: 100, width: 10, height: 10 }, 3, 340, 60);
  const packet = layer.querySelector(".deal-packet")!;
  assert.equal(packet.querySelectorAll(".deal-back").length, 3);
  assert.equal((packet as HTMLElement).style.getPropertyValue("--cw"), "60px");
  assert.equal(keyframes.length, 4);
  assert.equal(keyframes[0].opacity, 0);
  assert.equal(keyframes[3].opacity, 0);
  finish();
  await landed;
  assert.equal(layer.querySelector(".deal-packet"), null);
});

test("a flight that is cancelled still cleans up", async () => {
  const layer = document.createElement("div");
  HTMLElement.prototype.animate = () => ({ finished: Promise.reject(new DOMException("cancelled")) }) as unknown as Animation;
  await flyPacket(layer, { left: 0, top: 0, width: 1, height: 1 }, { left: 5, top: 5, width: 1, height: 1 }, 1, 100, 40);
  assert.equal(layer.children.length, 0);
});

test("pause resolves after the delay", async () => {
  vi.useFakeTimers();
  let done = false;
  pause(300).then(() => (done = true));
  await vi.advanceTimersByTimeAsync(299);
  assert.equal(done, false);
  await vi.advanceTimersByTimeAsync(1);
  assert.equal(done, true);
});

// ---------------------------------------------------------------- particles
function canvasContext() {
  const calls: string[] = [];
  const context = new Proxy({} as Record<string, unknown>, {
    get: (target, name: string) => (name in target ? target[name] : (...args: unknown[]) => void calls.push(name + args.length)),
    set: (target, name: string, value) => ((target[name] = value), true)
  });
  HTMLCanvasElement.prototype.getContext = (() => context) as never;
  return calls;
}

function animationFrames() {
  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => queue.push(callback));
  return () => queue.splice(0).forEach((callback) => callback(0));
}

beforeEach(() => vi.resetModules());

test("a burst puts one aria-hidden canvas on the page, draws it on each frame, and removes it when the particles are gone", async () => {
  const calls = canvasContext();
  const step = animationFrames();
  const { burst } = await import("$lib/fx/particles");
  burst("sparks", 50, 50);
  burst("confetti");
  assert.equal(document.querySelectorAll("canvas.burst-canvas").length, 1);
  assert.equal(document.querySelector("canvas")!.getAttribute("aria-hidden"), "true");
  step();
  assert.ok(calls.some((call) => call.startsWith("clearRect")));
  assert.ok(
    calls.some((call) => call.startsWith("fillRect")),
    "confetti strips are drawn"
  );
  for (let frame = 0; frame < 200 && document.querySelector("canvas"); frame += 1) step();
  assert.equal(document.querySelector("canvas"), null);
});

test("every kind of burst draws without error", async () => {
  canvasContext();
  const step = animationFrames();
  const { burst } = await import("$lib/fx/particles");
  for (const kind of ["confetti", "large-confetti", "light-confetti", "stars", "sparks"] as const) burst(kind, 10, 10);
  for (let frame = 0; frame < 200 && document.querySelector("canvas"); frame += 1) step();
  assert.equal(document.querySelector("canvas"), null);
});

test("a browser with no canvas drawing context shows nothing and breaks nothing", async () => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  animationFrames();
  const { burst } = await import("$lib/fx/particles");
  burst("stars");
});
