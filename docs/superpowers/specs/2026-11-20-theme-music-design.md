# Design: a background music per table theme (US-164)

## Goal
An optional music that matches the table theme, off until the player turns it on.

## Decisions
- **Tracks**: seven loops of 76 to 94 s, one per theme, named like the theme, in `static/music/<theme>.ogg` (Vorbis, quality 2,
  about 1 MB each). Style: modern lounge / downtempo, in the spirit of chill-out compilations. They are composed by
  `tools/music/compose.py` as MIDI and played by sampled instruments (FluidSynth and the GeneralUser GS soundfont). The first
  version synthesised every sound with numpy and scipy and was found too electronic, then too muddy, then still thin: sampled
  instruments are the change that makes it sound played. A track is 32 bars in four parts: A (comping, pad, bass, light
  groove), A with the melody, B (the melody varied and higher, a second voice, a fuller groove) and A again, thinner; a
  fill ends each eight bars. The melody is a two-bar motif that is answered, sequenced and resolved on chord tones; the
  voicings move as little as possible; the bass approaches the next chord; every note is slightly early or late and every
  velocity differs. Each theme has its own key, mode, tempo, swing, progression and instruments (comic: D dorian, Rhodes,
  kalimba, flute; classic-green: F major, piano, brushes, walking bass, vibraphone; midnight: A phrygian dominant, nylon
  guitar as an oud, hand drum, pan flute; sunset: C lydian, bossa nylon guitar, flute; forest: D dorian, harp, kalimba;
  ruby: E phrygian dominant, oud, electric piano, darbuka; gilded: B-flat harmonic minor, piano and strings, plucked harp).
  The reverb tail is folded back onto the start, so the loop has no seam, and the loudness is set to about -11 LUFS.
- **Settings**: `beelot.music-enabled` ("true" only; off by default) and `beelot.music-volume` (low 0.12, medium 0.25, high 0.45).
  Music is not tied to the sound effects switch, which is on by default.
- **Playback**: `music.js` owns one `Audio` with `loop = true`, `preload = "none"`; it is created at the first time music is
  wanted. `syncMusic()` is called after the settings, the theme and the view change and when the page's visibility changes.
  Wanted = switch on, view is `table`, page visible. A change of track or of wanted state fades over 400 ms.
- **Autoplay**: `play()` refused by the browser is remembered; the next `pointerdown` or `keydown` tries again. Nothing is shown.
- **Offline**: the service worker does not cache `/music/` (ranges, size); without the network the music is silent.
- **Server**: `ServeDir` already serves `.ogg` as `audio/ogg` with range requests; the CSP (`default-src 'self'`) allows it.

## Risks
Musical taste cannot be checked by tests (the script's output is checked by loudness, peaks, the loop's seam and the melody's notes against its scale); the tracks are replaceable files with the same names. The package grows by about 2 MB over the first version.
