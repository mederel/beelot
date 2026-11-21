// The table's music (US-164): one loop per table theme, named like the theme. It is off until the player turns it on in
// Settings, plays only while a table is on screen and the page is visible, and its settings stay on the device. Browsers
// refuse sound before a first tap, so a refused start is retried at the next gesture, silently.
"use strict";

const MUSIC_KEY = "beelot.music-enabled";
const MUSIC_VOLUME_KEY = "beelot.music-volume";
const MUSIC_THEMES = ["comic", "classic-green", "midnight", "sunset", "forest", "ruby", "gilded"];
const MUSIC_VOLUMES = { low: 0.12, medium: 0.25, high: 0.45 };
const MUSIC_DEFAULT_VOLUME = "medium";
const MUSIC_FADE_MS = 400;

function musicTrack(theme) {
  return `/music/${MUSIC_THEMES.includes(theme) ? theme : "comic"}.ogg`;
}

function musicVolumeLevel(stored) {
  return Object.hasOwn(MUSIC_VOLUMES, stored) ? stored : MUSIC_DEFAULT_VOLUME;
}

function musicGain(level) {
  return MUSIC_VOLUMES[musicVolumeLevel(level)];
}

// Music is wanted when the player asked for it, a table is shown (cards, lobby or auction) and the page is visible.
function musicWanted({ enabled, view, visible }) {
  return enabled === true && view === "table" && visible === true;
}

// The player's switch: off unless stored as "true".
function musicEnabled(stored) {
  return stored === "true";
}

// A player that follows the settings it is given; `audio` is an HTMLAudioElement (or anything shaped like one) and
// `schedule` a setTimeout, both passed in so that a test can drive them.
function createMusicPlayer(audio, schedule) {
  let track = null;
  let target = 0;
  let fading = 0;
  let blocked = false;

  function fadeTo(volume, done) {
    const token = (fading += 1);
    const steps = 8;
    const from = audio.volume;
    let step = 0;
    const tick = () => {
      if (token !== fading) return;
      step += 1;
      audio.volume = from + (volume - from) * (step / steps);
      if (step < steps) schedule(tick, MUSIC_FADE_MS / steps);
      else if (done) done();
    };
    tick();
  }

  function start() {
    const attempt = audio.play();
    if (attempt && typeof attempt.then === "function") {
      attempt.then(() => { blocked = false; }, () => { blocked = true; });
    }
  }

  return {
    // Applies what is wanted now: `want` is whether to play, `src` the track, `gain` the volume.
    update({ want, src, gain }) {
      target = gain;
      if (!want) {
        if (!audio.paused) fadeTo(0, () => audio.pause());
        return;
      }
      if (track !== src) {
        const begin = () => {
          track = src;
          audio.src = src;
          audio.loop = true;
          audio.volume = 0;
          start();
          fadeTo(target, null);
        };
        if (audio.paused) begin();
        else fadeTo(0, begin);
        return;
      }
      if (audio.paused) {
        audio.volume = 0;
        start();
      }
      fadeTo(target, null);
    },
    // Called at a tap or a key: the start a browser refused is tried again.
    gesture() {
      if (blocked && audio.paused && track) {
        start();
        fadeTo(target, null);
      }
    },
    get blocked() { return blocked; },
  };
}

if (typeof window !== "undefined" && typeof Audio !== "undefined" && typeof document !== "undefined") {
  let player = null;
  const read = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  };
  // Called by the page after a setting, a theme or a view changes (app.js, app-core.js).
  window.syncMusic = function syncMusic() {
    const enabled = musicEnabled(read(MUSIC_KEY));
    if (!player) {
      if (!enabled) return;
      const audio = new Audio();
      audio.preload = "none";
      player = createMusicPlayer(audio, (callback, ms) => window.setTimeout(callback, ms));
    }
    const view = window.viewForPath ? window.viewForPath(window.location.pathname) : "";
    player.update({
      want: musicWanted({ enabled, view, visible: document.visibilityState !== "hidden" }),
      src: musicTrack(document.body.dataset.theme),
      gain: musicGain(read(MUSIC_VOLUME_KEY)),
    });
  };
  document.addEventListener("visibilitychange", () => window.syncMusic());
  for (const type of ["pointerdown", "keydown"]) {
    document.addEventListener(type, () => player && player.gesture(), { passive: true });
  }
}

export { MUSIC_KEY, MUSIC_VOLUME_KEY, MUSIC_THEMES, MUSIC_VOLUMES, musicTrack, musicVolumeLevel, musicGain, musicWanted, musicEnabled, createMusicPlayer };
