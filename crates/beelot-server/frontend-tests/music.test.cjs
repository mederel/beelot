"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const m = require("../static/music.js");
const theme = require("../static/theme.js");
const sw = require("../static/sw.js");

const staticDir = path.join(__dirname, "..", "static");

test("every theme has a track named like the theme, and an unknown theme falls back to comic", () => {
  for (const name of m.MUSIC_THEMES) assert.equal(m.musicTrack(name), `/music/${name}.ogg`);
  assert.equal(m.musicTrack("nope"), "/music/comic.ogg");
  assert.equal(m.musicTrack(undefined), "/music/comic.ogg");
});

test("the themes of the page are exactly the themes with music, and each file is a short Ogg Vorbis loop", () => {
  const html = fs.readFileSync(path.join(staticDir, "index.html"), "utf8");
  const themes = [...html.matchAll(/name="theme"[^>]*value="([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual([...themes].sort(), [...m.MUSIC_THEMES].sort());
  for (const name of m.MUSIC_THEMES) {
    const bytes = fs.readFileSync(path.join(staticDir, "music", `${name}.ogg`));
    assert.equal(bytes.subarray(0, 4).toString("latin1"), "OggS", name);
    assert.ok(bytes.includes(Buffer.from("vorbis")), name);
    assert.ok(bytes.length > 100_000 && bytes.length < 1_000_000, `${name}: ${bytes.length} bytes`);
  }
  assert.ok(Object.keys(theme.LOCKED_THEMES).every((x) => m.MUSIC_THEMES.includes(x)));
});

test("the volume maps to a gain and a bad stored value gives the medium one", () => {
  assert.equal(m.musicGain("low"), 0.12);
  assert.equal(m.musicGain("high"), 0.45);
  assert.equal(m.musicGain("loud"), m.MUSIC_VOLUMES.medium);
  assert.equal(m.musicGain(null), m.MUSIC_VOLUMES.medium);
  assert.equal(m.musicVolumeLevel("constructor"), "medium");
});

test("music is off unless stored as true, and wanted only at a visible table", () => {
  assert.equal(m.musicEnabled(null), false);
  assert.equal(m.musicEnabled("false"), false);
  assert.equal(m.musicEnabled("true"), true);
  const on = { enabled: true, view: "table", visible: true };
  assert.equal(m.musicWanted(on), true);
  assert.equal(m.musicWanted({ ...on, enabled: false }), false);
  assert.equal(m.musicWanted({ ...on, view: "home" }), false);
  assert.equal(m.musicWanted({ ...on, visible: false }), false);
});

function fakeAudio(playResult = () => Promise.resolve()) {
  return { paused: true, volume: 1, src: "", loop: false, plays: 0,
    play() { this.plays += 1; this.paused = false; return playResult(); },
    pause() { this.paused = true; } };
}
function clock() {
  const q = [];
  return { schedule: (f) => q.push(f), run() { while (q.length) q.shift()(); } };
}

test("the player loops the track, fades in to the gain and fades out to a pause", async () => {
  const audio = fakeAudio(); const c = clock();
  const p = m.createMusicPlayer(audio, c.schedule);
  p.update({ want: true, src: "/music/comic.ogg", gain: 0.25 });
  c.run();
  assert.equal(audio.src, "/music/comic.ogg");
  assert.equal(audio.loop, true);
  assert.ok(Math.abs(audio.volume - 0.25) < 1e-9);
  p.update({ want: false, src: "/music/comic.ogg", gain: 0.25 });
  c.run();
  assert.equal(audio.paused, true);
});

test("a theme change swaps the track after a fade and does not restart the same track", () => {
  const audio = fakeAudio(); const c = clock();
  const p = m.createMusicPlayer(audio, c.schedule);
  p.update({ want: true, src: "/music/comic.ogg", gain: 0.25 }); c.run();
  p.update({ want: true, src: "/music/comic.ogg", gain: 0.45 }); c.run();
  assert.equal(audio.plays, 1);
  assert.ok(Math.abs(audio.volume - 0.45) < 1e-9);
  p.update({ want: true, src: "/music/ruby.ogg", gain: 0.45 }); c.run();
  assert.equal(audio.src, "/music/ruby.ogg");
  assert.equal(audio.plays, 2);
});

test("a start the browser refuses is tried again at the next gesture", async () => {
  let refuse = true;
  const audio = fakeAudio(() => (refuse ? Promise.reject(new Error("NotAllowed")) : Promise.resolve()));
  const c = clock();
  const p = m.createMusicPlayer(audio, c.schedule);
  p.update({ want: true, src: "/music/comic.ogg", gain: 0.25 }); c.run();
  await new Promise((r) => setImmediate(r));
  assert.equal(p.blocked, true);
  audio.paused = true; refuse = false;
  p.gesture(); c.run();
  await new Promise((r) => setImmediate(r));
  assert.equal(audio.plays, 2);
  assert.equal(p.blocked, false);
});

test("the music is not cached by the service worker", () => {
  assert.equal(sw.cacheable(new URL("https://x.test/music/comic.ogg"), "GET", "https://x.test"), false);
  assert.equal(sw.cacheable(new URL("https://x.test/app.js"), "GET", "https://x.test"), true);
});

test("the page wires the settings, the script and the translations", () => {
  const html = fs.readFileSync(path.join(staticDir, "index.html"), "utf8");
  assert.match(html, /id="music-enabled"/);
  assert.match(html, /name="music-volume"/);
  assert.match(html, /<script src="\/music.js"><\/script>/);
  for (const file of ["i18n.js", "i18n-nl.js"]) {
    const text = fs.readFileSync(path.join(staticDir, file), "utf8");
    for (const key of ["Music", "Music volume", "Low", "Medium", "High"]) assert.ok(text.includes(`"${key}":`), `${file} ${key}`);
  }
});
