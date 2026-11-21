#!/usr/bin/env python3
"""Lounge / downtempo loops for Beelot, one per table theme: composed as MIDI, played by sampled instruments.

Each track is 32 bars in four parts (A, A with the melody, B, A with the melody varied). It has its own key, mode, tempo,
chord progression and instruments: a voice-led comping part, a pad, a bass line that approaches the next chord, a groove,
an arpeggio and a melody built from a motif that is answered, sequenced and resolved. Every note is slightly late or early and
every velocity slightly different, as a player would. Everything is seeded: the same script gives the same MIDI.

The MIDI is rendered by FluidSynth with the GeneralUser GS soundfont (free for any use, including commercial music), the
reverb tail is folded back onto the start so that the loop has no seam, and the level is set to the loudness of the tracks
the application has always had.

    python3 compose.py OUTDIR [theme ...]     writes OUTDIR/<theme>.mid, .wav and .ogg
    SOUNDFONT=/path/GeneralUser.sf2 python3 compose.py ...   uses another soundfont (default: the distribution's)

Needs python3 with numpy, fluidsynth and ffmpeg (with libvorbis).
"""
import os
import random
import struct
import subprocess
import sys
import wave

import numpy as np

SR = 44100
PPQ = 480
STEP = PPQ // 4  # a sixteenth
BAR = 16 * STEP
BARS = 32
TAIL_BARS = 3
THEMES = ["comic", "classic-green", "midnight", "sunset", "forest", "ruby", "gilded"]
SOUNDFONTS = ["/usr/share/minuet/soundfonts/GeneralUser-v1.47.sf2", "/usr/share/soundfonts/GeneralUser-GS.sf2",
              "/usr/share/soundfonts/default.sf2"]
TARGET_LUFS = -9.0

MODES = {
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "major": [0, 2, 4, 5, 7, 9, 11],
    "lydian": [0, 2, 4, 6, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "phrygian_dom": [0, 1, 4, 5, 7, 8, 10],
    "harmonic_minor": [0, 2, 3, 5, 7, 8, 11],
}
QUALITY = {"m7": [0, 3, 7, 10], "maj7": [0, 4, 7, 11], "7": [0, 4, 7, 10], "m": [0, 3, 7], "M": [0, 4, 7],
           "m9": [0, 3, 7, 10, 14], "maj9": [0, 4, 7, 11, 14], "sus": [0, 5, 7, 10], "7b9": [0, 4, 7, 10, 13]}

# General MIDI programs.
PIANO, EPIANO, EPIANO2, VIBES, NYLON, JAZZ_GUITAR, HARP, KALIMBA = 0, 4, 5, 11, 24, 26, 46, 108
UPRIGHT, FINGER_BASS, FRETLESS = 32, 33, 35
STRINGS, WARM_PAD, NEWAGE_PAD, FLUTE, PAN_FLUTE, OBOE, KOTO, SITAR = 48, 89, 88, 73, 75, 68, 107, 104
BRUSH_KIT, STANDARD_KIT = 40, 0

# Drum notes.
KICK, SIDE_STICK, SNARE, CLAP, HAT, PEDAL_HAT, OPEN_HAT = 36, 37, 38, 39, 42, 44, 46
SHAKER, MARACAS, TAMB, BONGO_HI, BONGO_LO, CONGA_MUTE, CONGA_HI, CONGA_LO, CLAVES = 82, 70, 54, 60, 61, 62, 63, 64, 75

# Channels.
COMP, PAD, BASS, LEAD, ARP, COUNTER, DRUMS = 0, 1, 2, 3, 4, 5, 9


# ---------------------------------------------------------------- MIDI file
def vlq(n):
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))


class Midi:
    def __init__(self, bpm):
        self.events = []  # (tick, order, bytes)
        self.bpm = bpm

    def program(self, ch, program, volume, pan, reverb, chorus=0):
        bank = [(0xB0 | ch, 0, 0)] if ch != DRUMS else []
        for status, a, b in bank + [(0xB0 | ch, 7, volume), (0xB0 | ch, 10, pan), (0xB0 | ch, 91, reverb),
                                   (0xB0 | ch, 93, chorus), (0xC0 | ch, program, None)]:
            self.events.append((0, 0, bytes([status, a]) + (bytes([b]) if b is not None else b"")))

    def note(self, ch, tick, dur, pitch, vel):
        tick = max(0, int(tick))
        vel = max(1, min(127, int(vel)))
        self.events.append((tick, 2, bytes([0x90 | ch, pitch, vel])))
        self.events.append((tick + max(1, int(dur)), 1, bytes([0x80 | ch, pitch, 0])))

    def save(self, path):
        track = bytearray()
        track += b"\x00\xff\x51\x03" + struct.pack(">I", int(60_000_000 / self.bpm))[1:]
        track += b"\x00\xff\x58\x04\x04\x02\x18\x08"
        last = 0
        for tick, _, data in sorted(self.events, key=lambda e: (e[0], e[1])):
            track += vlq(tick - last) + data
            last = tick
        track += b"\x00\xff\x2f\x00"
        with open(path, "wb") as f:
            f.write(b"MThd" + struct.pack(">IHHH", 6, 0, 1, PPQ) + b"MTrk" + struct.pack(">I", len(track)) + bytes(track))


# ---------------------------------------------------------------- harmony
class Harmony:
    def __init__(self, key, mode, chords):
        self.key = key
        self.scale = MODES[mode]
        self.chords = chords  # one (offset, quality) per bar of an 8-bar period

    def chord(self, bar):
        offset, quality = self.chords[bar % len(self.chords)]
        root = self.key + offset
        return root, QUALITY[quality]

    def chord_pcs(self, bar):
        root, ivs = self.chord(bar)
        return {(root + i) % 12 for i in ivs}

    def scale_pcs(self):
        return {(self.key + s) % 12 for s in self.scale}

    def scale_notes(self, lo, hi):
        pcs = self.scale_pcs()
        return [p for p in range(lo, hi + 1) if p % 12 in pcs]


def voicing(root, ivs, previous, rng, lo=53, hi=76):
    """A rootless voicing (third, fifth, seventh, ninth) that moves as little as possible from the previous one."""
    tones = [(root + i) % 12 for i in ivs[1:]]
    chosen = []
    for pc in tones:
        candidates = [p for p in range(lo, hi + 1) if p % 12 == pc]
        target = min(previous, key=lambda q: abs(q - candidates[len(candidates) // 2])) if previous else 64
        chosen.append(min(candidates, key=lambda p: (abs(p - target), p)))
    return sorted(set(chosen))


# ---------------------------------------------------------------- the player's hands
class Feel:
    def __init__(self, rng, swing, late_ms=6, bpm=90):
        self.rng, self.swing = rng, swing
        self.ticks_per_ms = bpm * PPQ / 60000

    def at(self, bar, step, push=0.0):
        """The tick of a sixteenth, swung, with a human's small errors. `push` > 0 is behind the beat, in ms."""
        shift = 0
        if step % 4 == 2:
            shift = int(self.swing * 80)
        elif step % 2 == 1:
            shift = int(self.swing * 40)
        jitter = self.rng.gauss(push, 6) * self.ticks_per_ms
        return bar * BAR + step * STEP + shift + int(jitter)

    def vel(self, base, spread=7):
        return base + self.rng.randint(-spread, spread)


# ---------------------------------------------------------------- the parts
def comping(m, h, feel, rng, spec, bars_on):
    pattern = spec["comp_pattern"]
    previous = None
    for bar in range(BARS):
        root, ivs = h.chord(bar)
        previous = voicing(root, ivs, previous, rng)
        if bar not in bars_on:
            continue
        for step, length, vel in pattern:
            t = feel.at(bar, step)
            for k, p in enumerate(previous):
                m.note(COMP, t + k * 6, length * STEP - 8, p, feel.vel(vel))


def pad_part(m, h, feel, spec, bars_on):
    hold = spec.get("pad_hold", 2)
    previous = None
    for bar in range(0, BARS, hold):
        if bar not in bars_on:
            continue
        root, ivs = h.chord(bar)
        notes = voicing(root, ivs, previous, random.Random(bar), 48, 70)[:3]
        previous = notes
        for p in notes:
            m.note(PAD, bar * BAR + feel.rng.randint(0, 40), hold * BAR - 30, p, spec["pad_vel"])
        m.note(PAD, bar * BAR, hold * BAR - 30, root - 12 if root - 12 >= 36 else root, spec["pad_vel"] - 8)


def bass_part(m, h, feel, rng, spec, bars_on):
    kind = spec["bass"]
    for bar in range(BARS):
        if bar not in bars_on:
            continue
        root, ivs = h.chord(bar)
        base = 28 + (root - 28) % 12
        if base < 31:
            base += 12
        fifth = base + 7
        next_root, _ = h.chord(bar + 1)
        nb = 28 + (next_root - 28) % 12
        if nb < 31:
            nb += 12
        approach = nb - 1 if rng.random() < 0.5 else nb + 1
        third = base + (ivs[1])
        if kind == "long":
            notes = [(0, 12, base, 92), (12, 3, fifth if rng.random() < 0.6 else base + 12, 70), (15, 1, approach, 60)]
        elif kind == "sync":
            notes = [(0, 6, base, 95), (6, 4, base, 74), (10, 3, fifth, 80), (13, 2, approach, 70)]
        elif kind == "pulse":
            notes = [(s, 2, base if s % 8 != 6 else fifth, 88 if s % 8 == 0 else 68) for s in range(0, 16, 2)]
            notes[-1] = (14, 2, approach, 66)
        elif kind == "walk":
            notes = [(0, 4, base, 92), (4, 4, third, 78), (8, 4, fifth, 82), (12, 4, approach, 76)]
        elif kind == "bossa":
            notes = [(0, 6, base, 92), (6, 2, fifth, 70), (8, 6, base + 12 if rng.random() < 0.3 else base, 84), (14, 2, fifth, 66)]
        else:
            notes = [(0, 16, base, 90)]
        for step, length, pitch, vel in notes:
            m.note(BASS, feel.at(bar, step, 4), length * STEP - 10, pitch, feel.vel(vel, 5))


DRUM_GROOVES = {
    # name: {note: [(step, vel)]} over one bar
    "chill": {KICK: [(0, 100), (10, 80)], SIDE_STICK: [(4, 80), (12, 84)], HAT: [(s, 62 if s % 4 == 0 else 44) for s in range(0, 16, 2)],
              SNARE: [(7, 24), (15, 20)], OPEN_HAT: [(14, 40)]},
    "lounge": {KICK: [(0, 96), (8, 84), (11, 66)], SIDE_STICK: [(4, 76), (12, 80)],
               HAT: [(s, 58 if s % 4 == 0 else 42) for s in range(0, 16, 2)], SHAKER: [(s, 36) for s in range(1, 16, 2)]},
    "soft": {KICK: [(0, 90)], SNARE: [(4, 56), (12, 60), (7, 18)], PEDAL_HAT: [(2, 56), (6, 50), (10, 56), (14, 50)],
             HAT: [(s, 34) for s in range(0, 16, 4)]},
    "bossa": {KICK: [(0, 92), (6, 72), (8, 88), (14, 70)], SIDE_STICK: [(0, 70), (3, 66), (6, 70), (10, 68), (12, 70)],
              HAT: [(s, 54 if s % 4 == 0 else 38) for s in range(0, 16, 2)], SHAKER: [(s, 32) for s in range(1, 16, 2)]},
    "oriental": {KICK: [(0, 70)], CONGA_LO: [(0, 104), (6, 94), (10, 100)], CONGA_HI: [(4, 84), (8, 80), (12, 86), (14, 76)],
                 CONGA_MUTE: [(3, 44), (11, 44), (15, 40)], MARACAS: [(s, 44 if s % 4 == 0 else 34) for s in range(0, 16, 2)]},
}


def drums_part(m, feel, rng, spec, bars_on, fills):
    groove = DRUM_GROOVES[spec["groove"]]
    for bar in range(BARS):
        if bar not in bars_on:
            continue
        light = bar < 8 or bar >= 30
        for note, hits in groove.items():
            for step, vel in hits:
                if light and note in (OPEN_HAT, SNARE) and step != 4:
                    continue
                if rng.random() < 0.04:  # a hit a player leaves out
                    continue
                v = feel.vel(vel * (0.8 if light else 1.0), 5)
                m.note(DRUMS, feel.at(bar, step), STEP, note, v)
        if bar in fills:
            fill = [(12, CONGA_HI, 70), (13, CONGA_MUTE, 60), (14, CONGA_LO, 80), (15, CONGA_HI, 74)] if spec["groove"] == "oriental" else \
                [(12, SNARE, 50), (13, SNARE, 58), (14, SNARE, 68), (15, SNARE, 78)]
            for step, note, vel in fill:
                m.note(DRUMS, feel.at(bar, step), STEP, note, feel.vel(vel, 4))


def arp_part(m, h, feel, rng, spec, bars_on):
    direction = spec["arp"]
    for bar in range(BARS):
        if bar not in bars_on:
            continue
        root, ivs = h.chord(bar)
        tones = [root + i for i in ivs]
        pool = sorted({60 + (t - 60) % 24 for t in tones} | {72 + (t - 60) % 12 for t in tones})
        pool = [p for p in pool if spec["arp_range"][0] <= p <= spec["arp_range"][1]] or pool
        order = pool if direction == "up" else list(reversed(pool))
        for k, step in enumerate(range(0, 16, 2)):
            if rng.random() < 0.18:
                continue
            p = order[(k * (1 if direction == "up" else 1)) % len(order)]
            if k % 8 == 4 and rng.random() < 0.5:
                p = order[(k + 2) % len(order)]
            m.note(ARP, feel.at(bar, step, 2), STEP * 3, p, feel.vel(spec["arp_vel"] + (8 if step % 8 == 0 else 0), 6))


RHYTHMS = [
    [(0, 3), (3, 1), (4, 4), (10, 2), (12, 4)],
    [(0, 2), (2, 2), (4, 3), (8, 2), (10, 2), (12, 4)],
    [(2, 2), (4, 2), (6, 2), (8, 6), (14, 2)],
    [(0, 4), (4, 2), (6, 1), (7, 1), (8, 4), (12, 2), (14, 2)],
    [(0, 6), (6, 2), (8, 2), (10, 2), (12, 4)],
    [(1, 3), (4, 4), (8, 3), (11, 1), (12, 4)],
]


def make_motif(rng, spec):
    """A two-bar motif: onsets and durations over 32 sixteenths, and a contour as scale steps from the first note."""
    bar1 = list(rng.choice(RHYTHMS))
    bar2 = list(rng.choice(RHYTHMS))
    if spec.get("sparse"):
        bar1, bar2 = bar1[:4], bar2[:4]
    onsets = [(s, d) for s, d in bar1] + [(16 + s, d) for s, d in bar2]
    steps = [0]
    for _ in onsets[1:]:
        steps.append(steps[-1] + rng.choice([-2, -1, -1, 1, 1, 1, 2, 0]))
    return onsets, steps


def play_phrase(m, h, feel, rng, spec, motif, bar0, anchor, transpose, ending, channel, vel, ornament, octave=0):
    """One two-bar phrase: the motif's contour from `anchor` (a scale index), strong beats and the end on chord tones."""
    onsets, steps = motif
    lo, hi = spec["range"]
    notes = h.scale_notes(lo, hi)
    idx = min(range(len(notes)), key=lambda i: abs(notes[i] - anchor))
    for k, ((step, dur), move) in enumerate(zip(onsets, steps)):
        bar = bar0 + step // 16
        i = max(0, min(len(notes) - 1, idx + move + transpose))
        pitch = notes[i]
        last = k == len(onsets) - 1
        if last or step % 8 == 0 and dur >= 3:
            pcs = h.chord_pcs(bar)
            near = [n for n in notes if n % 12 in pcs]
            if last and ending == "root":
                root, _ = h.chord(bar)
                near = [n for n in notes if n % 12 == root % 12] or near
            elif last and ending == "third":
                _, ivs = h.chord(bar)
                root, _ = h.chord(bar)
                near = [n for n in notes if n % 12 == (root + ivs[1]) % 12] or near
            pitch = min(near or notes, key=lambda n: abs(n - pitch))
        pitch += 12 * octave
        t = feel.at(bar, step % 16, 12)
        length = dur * STEP * (0.95 if last else 0.85) + (STEP * 2 if last else 0)
        if ornament and not last and rng.random() < ornament:
            grace = notes[min(len(notes) - 1, max(0, i + 1))] + 12 * octave
            m.note(channel, t - 50, 40, grace, feel.vel(vel - 22, 4))
        m.note(channel, t, length, pitch, feel.vel(vel + (6 if step % 8 == 0 else 0), 6))


def lead_parts(m, h, feel, rng, spec):
    motif = make_motif(rng, spec)
    answer = (motif[0], [s + rng.choice([-1, 0, 1]) if i < len(motif[1]) - 2 else s for i, s in enumerate(motif[1])])
    mid = sum(spec["range"]) // 2
    ornament = spec.get("ornament", 0.0)
    vel = spec["lead_vel"]

    def period(bar0, anchor, octave=0, variation=False, vel_shift=0, instrument_channel=LEAD):
        cadence = ["third", "root"] if not variation else ["root", "third"]
        play_phrase(m, h, feel, rng, spec, motif, bar0, anchor, 0, cadence[0], instrument_channel, vel + vel_shift, ornament, octave)
        play_phrase(m, h, feel, rng, spec, answer, bar0 + 2, anchor + 2, -1, "none", instrument_channel, vel + vel_shift, ornament, octave)
        play_phrase(m, h, feel, rng, spec, motif, bar0 + 4, anchor + (3 if variation else 0), 1 if variation else 0, "third", instrument_channel,
                    vel + vel_shift, ornament, octave)
        play_phrase(m, h, feel, rng, spec, answer, bar0 + 6, anchor - (2 if variation else 0), 0, cadence[1], instrument_channel,
                    vel + vel_shift - 4, ornament, octave)

    period(8, mid)
    period(16, mid + 3, variation=True, vel_shift=6)
    # the last part: the melody again, thinner, and the last two bars are left to the groove for the loop to breathe
    play_phrase(m, h, feel, rng, spec, motif, 24, mid, 0, "third", LEAD, vel - 2, ornament)
    play_phrase(m, h, feel, rng, spec, answer, 26, mid + 1, 0, "none", LEAD, vel - 4, ornament)
    play_phrase(m, h, feel, rng, spec, motif, 28, mid + 2, -1, "root", LEAD, vel - 8, ornament)

    # a second voice in B: long notes on the chord, a sixth above the root
    for bar in range(16, 24, 2):
        root, ivs = h.chord(bar)
        top = root + 12 + ivs[1] if root + 12 + ivs[1] < 80 else root + ivs[1]
        m.note(COUNTER, feel.at(bar, 0, 15), 2 * BAR - 60, top, spec["counter_vel"])


# ---------------------------------------------------------------- the tracks
def C(*pairs):
    return list(pairs)


STAB = [(0, 3, 56), (6, 2, 50), (10, 4, 54)]
SLOW = [(0, 6, 54), (6, 2, 44), (10, 6, 50)]
BOSSA = [(0, 3, 52), (3, 3, 46), (6, 4, 50), (10, 3, 48), (13, 3, 44)]
HELD = [(0, 14, 48)]
OFFBEAT = [(2, 2, 52), (6, 2, 46), (10, 2, 52), (14, 2, 46)]

TRACKS = {
    # The cheerful default: a mellow groove, a Rhodes, a kalimba and a flute (D dorian).
    "comic": dict(bpm=96, seed=11, key=62, mode="dorian", swing=0.35, groove="chill", bass="sync", arp="up", arp_range=(72, 91),
                  comp=(EPIANO, 52, 50, 24), pad=(WARM_PAD, 50, 70, 70), bass_prog=FINGER_BASS, lead=(FLUTE, 80, 64, 70), arp_prog=KALIMBA,
                  counter=(VIBES, 66, 40), kit=STANDARD_KIT, comp_pattern=OFFBEAT, pad_vel=52, lead_vel=76, arp_vel=44, counter_vel=48,
                  range=(69, 88), ornament=0.1,
                  chords=C((0, "m9"), (0, "m9"), (5, "maj9"), (5, "maj9"), (-2, "maj7"), (-2, "maj7"), (7, "m7"), (7, "7"))),
    # Jazzy lounge: felt piano, brushes, a walking bass (F major).
    "classic-green": dict(bpm=88, seed=21, key=65, mode="major", swing=0.6, groove="soft", bass="walk", arp="down", arp_range=(67, 88),
                          comp=(PIANO, 64, 46, 30), pad=(STRINGS, 44, 60, 80), bass_prog=UPRIGHT, lead=(VIBES, 80, 70, 64), arp_prog=HARP,
                          counter=(FLUTE, 62, 40), kit=BRUSH_KIT, comp_pattern=STAB, pad_vel=40, lead_vel=74, arp_vel=36, counter_vel=44,
                          range=(65, 86), ornament=0.0,
                          chords=C((0, "maj9"), (-3, "m7"), (2, "m7"), (7, "7"), (0, "maj9"), (-3, "m7"), (2, "m7"), (7, "7"))),
    # Dark, slow, oriental: oud and a hand drum (A phrygian dominant).
    "midnight": dict(bpm=82, seed=31, key=57, mode="phrygian_dom", swing=0.0, groove="oriental", bass="long", arp=None, arp_range=(60, 84),
                     comp=(NYLON, 54, 36, 30), pad=(STRINGS, 54, 80, 110), bass_prog=FRETLESS, lead=(NYLON, 100, 64, 80), arp_prog=NYLON,
                     counter=(PAN_FLUTE, 60, 40), kit=STANDARD_KIT, comp_pattern=SLOW, pad_vel=46, lead_vel=84, arp_vel=44,
                     counter_vel=50, range=(60, 80), ornament=0.35, sparse=True,
                     chords=C((0, "m7"), (0, "m7"), (1, "maj7"), (1, "maj7"), (0, "m7"), (-2, "maj7"), (7, "7"), (7, "7"))),
    # Warm bossa-lounge: nylon guitar, flute and a vibraphone (C lydian).
    "sunset": dict(bpm=100, seed=41, key=60, mode="lydian", swing=0.25, groove="bossa", bass="bossa", arp="up", arp_range=(72, 93),
                   comp=(NYLON, 60, 44, 24), pad=(STRINGS, 44, 70, 90), bass_prog=UPRIGHT, lead=(FLUTE, 80, 60, 70), arp_prog=VIBES,
                   counter=(OBOE, 62, 40), kit=BRUSH_KIT, comp_pattern=BOSSA, pad_vel=38, lead_vel=76, arp_vel=36, counter_vel=42,
                   range=(67, 88), ornament=0.05,
                   chords=C((0, "maj9"), (0, "maj9"), (9, "m9"), (9, "m9"), (2, "m7"), (7, "7"), (0, "maj9"), (7, "sus"))),
    # Airy and organic: kalimba, harp and flute (D dorian, slower).
    "forest": dict(bpm=90, seed=51, key=62, mode="dorian", swing=0.2, groove="chill", bass="long", arp="down", arp_range=(66, 91),
                   comp=(HARP, 56, 42, 30), pad=(NEWAGE_PAD, 50, 64, 100), bass_prog=UPRIGHT, lead=(FLUTE, 80, 66, 78), arp_prog=KALIMBA,
                   counter=(PAN_FLUTE, 60, 38), kit=STANDARD_KIT, comp_pattern=SLOW, pad_vel=46, lead_vel=72, arp_vel=48, counter_vel=42,
                   range=(66, 90), ornament=0.08, sparse=True,
                   chords=C((0, "m7"), (0, "m7"), (-2, "maj7"), (-2, "maj7"), (3, "maj7"), (3, "maj7"), (-4, "maj7"), (7, "m7"))),
    # Warm and sensual: oud, a Rhodes and a darbuka (E phrygian dominant).
    "ruby": dict(bpm=94, seed=61, key=64, mode="phrygian_dom", swing=0.0, groove="oriental", bass="sync", arp="up", arp_range=(64, 88),
                 comp=(EPIANO2, 58, 52, 30), pad=(STRINGS, 50, 70, 100), bass_prog=FINGER_BASS, lead=(NYLON, 100, 70, 70), arp_prog=NYLON,
                 counter=(PAN_FLUTE, 62, 40), kit=STANDARD_KIT, comp_pattern=STAB, pad_vel=44, lead_vel=86, arp_vel=44, counter_vel=50,
                 range=(64, 84), ornament=0.3,
                 chords=C((0, "m7"), (0, "m7"), (-4, "maj7"), (-4, "maj7"), (-2, "maj7"), (-2, "maj7"), (-1, "7"), (0, "m7"))),
    # Opulent and slow: a grand piano, strings and a plucked lead (Bb harmonic minor).
    "gilded": dict(bpm=86, seed=71, key=58, mode="harmonic_minor", swing=0.2, groove="lounge", bass="pulse", arp="up", arp_range=(65, 91),
                   comp=(PIANO, 60, 48, 40), pad=(STRINGS, 52, 80, 120), bass_prog=FINGER_BASS, lead=(HARP, 90, 64, 90), arp_prog=HARP,
                   counter=(OBOE, 64, 44), kit=STANDARD_KIT, comp_pattern=HELD, pad_vel=58, lead_vel=82, arp_vel=38, counter_vel=54,
                   range=(65, 86), ornament=0.15,
                   chords=C((0, "m9"), (0, "m9"), (-4, "maj7"), (-4, "maj7"), (-7, "maj7"), (-2, "7"), (0, "m9"), (7, "7"))),
}


def compose(name, spec, path):
    rng = random.Random(spec["seed"])
    h = Harmony(spec["key"], spec["mode"], spec["chords"])
    feel = Feel(rng, spec["swing"], bpm=spec["bpm"])
    m = Midi(spec["bpm"])
    program, volume, reverb, pan = spec["comp"]
    m.program(COMP, program, volume, pan, reverb)
    program, volume, reverb, chorus = spec["pad"]
    m.program(PAD, program, volume, 64, reverb, chorus)
    program, volume, reverb, chorus = spec["lead"]
    m.program(LEAD, program, volume, 56, reverb, chorus)
    program, volume, reverb = spec["counter"]
    m.program(COUNTER, program, volume, 96, reverb, 40)
    m.program(BASS, spec["bass_prog"], 80, 64, 14)
    m.program(ARP, spec["arp_prog"], 60, 104, 60, 30)
    m.program(DRUMS, spec["kit"], 100, 64, 28)

    everything = set(range(BARS))
    comping(m, h, feel, rng, spec, everything)
    pad_part(m, h, feel, spec, everything)
    bass_part(m, h, feel, rng, spec, everything)
    drums_part(m, feel, rng, spec, everything - {0, 1}, fills={7, 15, 23})
    if spec["arp"]:
        arp_part(m, h, feel, rng, spec, set(range(4, 8)) | set(range(12, 30)))
    lead_parts(m, h, feel, rng, spec)
    m.save(path)


def soundfont():
    path = os.environ.get("SOUNDFONT") or next((p for p in SOUNDFONTS if os.path.exists(p)), None)
    if not path:
        sys.exit("No soundfont: set SOUNDFONT to a GeneralUser GS .sf2 file")
    return path


def render(name, spec, outdir):
    mid, wav, ogg = (f"{outdir}/{name}.{ext}" for ext in ("mid", "wav", "ogg"))
    compose(name, spec, mid)
    raw = f"{outdir}/{name}.raw.wav"
    subprocess.run(["fluidsynth", "-ni", "-q", "-g", "0.7", "-r", str(SR), "-R", "1", "-C", "1",
                    "-o", "synth.reverb.room-size=0.75", "-o", "synth.reverb.damp=0.35", "-o", "synth.reverb.width=80",
                    "-o", "synth.reverb.level=0.55", "-o", "synth.chorus.level=0.8", "-o", "synth.chorus.depth=4",
                    "-F", raw, soundfont(), mid], check=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
    with wave.open(raw) as w:
        data = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").reshape(-1, 2).astype(np.float64) / 32768
    loop = int(round(BARS * 16 * 60 / spec["bpm"] / 4 * SR))
    tail = data[loop:loop + int(TAIL_BARS * 16 * 60 / spec["bpm"] / 4 * SR)]
    out = data[:loop].copy()
    out[:len(tail)] += tail  # the reverb that runs past the end is what the start of the next pass hears
    with wave.open(wav, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(out, -1, 1) * 32767).astype("<i2").tobytes())
    os.remove(raw)
    # Level: the loudness the application's tracks have always had, with a limiter for the peaks.
    measured = subprocess.run(["ffmpeg", "-nostats", "-i", wav, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    lufs = float(measured.split("I:")[-1].split("LUFS")[0])
    gain = TARGET_LUFS - lufs
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af",
                    f"highpass=f=28,volume={gain:.2f}dB,treble=g=2.5:f=6500,lowshelf=g=-2.5:f=140,alimiter=limit=0.8:attack=5:release=60:level=disabled",
                    "-c:a", "libvorbis", "-q:a", "2", ogg], check=True)
    return BARS * 16 * 60 / spec["bpm"] / 4


def main(argv):
    outdir = argv[1] if len(argv) > 1 else "."
    os.makedirs(outdir, exist_ok=True)
    for name in argv[2:] or THEMES:
        print(f"{name}: {render(name, TRACKS[name], outdir):.0f} s")


if __name__ == "__main__":
    main(sys.argv)
