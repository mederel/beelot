// The table's music (US-164): one loop per table theme, named like the theme. It is off until the player turns it on in
// Settings, plays only while a table is on screen and the page is visible. Browsers refuse sound before a first tap, so a
// refused start is retried at the next gesture, silently.
export const MUSIC_KEY = "beelot.music-enabled";
export const MUSIC_VOLUME_KEY = "beelot.music-volume";
export const MUSIC_THEMES = ["comic", "classic-green", "midnight", "sunset", "forest", "ruby", "gilded"];
export const MUSIC_VOLUMES = { low: 0.12, medium: 0.25, high: 0.45 } as const;
export type MusicVolume = keyof typeof MUSIC_VOLUMES;
const MUSIC_DEFAULT_VOLUME: MusicVolume = "medium";
const MUSIC_FADE_MS = 400;

export function musicTrack(theme: string): string {
  return `/music/${MUSIC_THEMES.includes(theme) ? theme : "comic"}.ogg`;
}

export function musicVolumeLevel(stored: string | null | undefined): MusicVolume {
  return stored && Object.hasOwn(MUSIC_VOLUMES, stored) ? (stored as MusicVolume) : MUSIC_DEFAULT_VOLUME;
}

export function musicGain(level: string | null | undefined): number {
  return MUSIC_VOLUMES[musicVolumeLevel(level)];
}

// Music is wanted when the player asked for it, a table is shown (cards, lobby or auction) and the page is visible.
export function musicWanted({ enabled, view, visible }: { enabled: boolean; view: string; visible: boolean }): boolean {
  return enabled === true && view === "table" && visible === true;
}

export function musicEnabled(stored: string | null | undefined): boolean {
  return stored === "true";
}

interface AudioLike {
  volume: number;
  paused: boolean;
  src: string;
  loop: boolean;
  play(): Promise<void> | void;
  pause(): void;
}

// A player that follows the settings it is given; `audio` and `schedule` are passed in so that a test can drive them.
export function createMusicPlayer(audio: AudioLike, schedule: (callback: () => void, ms: number) => unknown) {
  let track: string | null = null;
  let target = 0;
  let fading = 0;
  let blocked = false;

  function fadeTo(volume: number, done: (() => void) | null) {
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
      attempt.then(
        () => {
          blocked = false;
        },
        () => {
          blocked = true;
        }
      );
    }
  }

  return {
    update({ want, src, gain }: { want: boolean; src: string; gain: number }) {
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
    gesture() {
      if (blocked && audio.paused && track) {
        start();
        fadeTo(target, null);
      }
    },
    get blocked() {
      return blocked;
    }
  };
}
