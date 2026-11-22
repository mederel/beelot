// The music's rules and its player: one loop per theme, only while a table is on screen, faded in and out, and a start the
// browser refused is retried at the next gesture.
import assert from "node:assert/strict";
import { test } from "vitest";
import { MUSIC_THEMES, createMusicPlayer, musicEnabled, musicGain, musicTrack, musicVolumeLevel, musicWanted } from "$lib/audio/music";

test("every theme has its own loop, and an unknown theme plays the first", () => {
  for (const theme of MUSIC_THEMES) assert.equal(musicTrack(theme), `/music/${theme}.ogg`);
  assert.equal(musicTrack("nope"), "/music/comic.ogg");
});

test("the volume is one of three levels, medium by default", () => {
  assert.equal(musicVolumeLevel("high"), "high");
  assert.equal(musicVolumeLevel("loud"), "medium");
  assert.equal(musicVolumeLevel(null), "medium");
  assert.equal(musicGain("low"), 0.12);
  assert.equal(musicGain(undefined), 0.25);
});

test("music is off until turned on, and wanted only on a table of a visible page", () => {
  assert.equal(musicEnabled(null), false);
  assert.equal(musicEnabled("false"), false);
  assert.equal(musicEnabled("true"), true);
  assert.equal(musicWanted({ enabled: true, view: "table", visible: true }), true);
  assert.equal(musicWanted({ enabled: false, view: "table", visible: true }), false);
  assert.equal(musicWanted({ enabled: true, view: "home", visible: true }), false);
  assert.equal(musicWanted({ enabled: true, view: "table", visible: false }), false);
});

function rig(play: () => Promise<void> | void = () => Promise.resolve()) {
  const audio = { volume: 0, paused: true, src: "", loop: false, plays: 0, play() { this.plays += 1; this.paused = false; return play(); }, pause() { this.paused = true; } };
  const queue: (() => void)[] = [];
  const player = createMusicPlayer(audio, (callback) => queue.push(callback));
  const settle = () => {
    for (let guard = 0; guard < 100 && queue.length; guard += 1) queue.shift()!();
  };
  return { audio, player, settle };
}

test("a wanted track starts silent, loops, and fades up to the level", () => {
  const { audio, player, settle } = rig();
  player.update({ want: true, src: "/music/comic.ogg", gain: 0.25 });
  assert.equal(audio.src, "/music/comic.ogg");
  assert.equal(audio.loop, true);
  assert.equal(audio.plays, 1);
  assert.ok(audio.volume < 0.25);
  settle();
  assert.equal(audio.volume, 0.25);
});

test("when it is no longer wanted the music fades out and then pauses", () => {
  const { audio, player, settle } = rig();
  player.update({ want: true, src: "/music/comic.ogg", gain: 0.25 });
  settle();
  player.update({ want: false, src: "/music/comic.ogg", gain: 0.25 });
  assert.equal(audio.paused, false, "still fading");
  settle();
  assert.equal(audio.volume, 0);
  assert.equal(audio.paused, true);
  player.update({ want: false, src: "", gain: 0 });
});

test("a new theme fades the old loop out before the new one starts", () => {
  const { audio, player, settle } = rig();
  player.update({ want: true, src: "/music/comic.ogg", gain: 0.25 });
  settle();
  player.update({ want: true, src: "/music/ruby.ogg", gain: 0.25 });
  assert.equal(audio.src, "/music/comic.ogg");
  settle();
  assert.equal(audio.src, "/music/ruby.ogg");
  assert.equal(audio.volume, 0.25);
});

test("a change of level on the same track fades to the new gain without restarting it", () => {
  const { audio, player, settle } = rig();
  player.update({ want: true, src: "/music/comic.ogg", gain: 0.25 });
  settle();
  player.update({ want: true, src: "/music/comic.ogg", gain: 0.45 });
  settle();
  assert.equal(audio.volume, 0.45);
  assert.equal(audio.plays, 1);
});

test("a start the browser refused is blocked, and the next gesture retries it", async () => {
  let allow = false;
  const { audio, player, settle } = rig(() => (allow ? Promise.resolve() : Promise.reject(new Error("NotAllowedError"))));
  player.update({ want: true, src: "/music/comic.ogg", gain: 0.25 });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(player.blocked, true);
  audio.paused = true;
  allow = true;
  player.gesture();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(audio.plays, 2);
  assert.equal(player.blocked, false);
  settle();
  assert.equal(audio.volume, 0.25);
  // With nothing blocked a gesture does nothing.
  player.gesture();
  assert.equal(audio.plays, 2);
});

test("a newer fade replaces an older one", () => {
  const { audio, player, settle } = rig();
  player.update({ want: true, src: "/music/comic.ogg", gain: 0.25 });
  player.update({ want: true, src: "/music/comic.ogg", gain: 0.12 });
  settle();
  assert.equal(audio.volume, 0.12);
});
