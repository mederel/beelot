#!/usr/bin/env python3
"""Lounge / downtempo loops for Beelot, one per table theme, synthesised with numpy and scipy.

A warm pad, a deep sub bass, a soft groove (kick, shaker, hand drum), a plucked arpeggio and a sparse lead (oud, flute,
felt piano) that plays a short phrase and answers it. Each theme has its key, mode, tempo and feel. Everything is
seeded: the same script gives the same files. The reverb tail is folded back onto the start, so the loops are seamless.

    python3 compose.py OUTDIR [theme ...]      writes OUTDIR/<theme>.wav (44.1 kHz stereo)
"""
import random
import sys
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
THEMES = ["comic", "classic-green", "midnight", "sunset", "forest", "ruby", "gilded"]

MODES = {
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "major": [0, 2, 4, 5, 7, 9, 11],
    "lydian": [0, 2, 4, 6, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "phrygian_dom": [0, 1, 4, 5, 7, 8, 10],
    "harmonic_minor": [0, 2, 3, 5, 7, 8, 11],
}
QUALITY = {"m7": [0, 3, 7, 10], "maj7": [0, 4, 7, 11], "7": [0, 4, 7, 10], "m": [0, 3, 7], "M": [0, 4, 7],
           "m9": [0, 3, 7, 10, 14], "maj9": [0, 4, 7, 11, 14], "sus": [0, 5, 7, 10]}


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def fade(n, attack, release):
    e = np.ones(n)
    a, r = min(n, int(attack * SR)), min(n, int(release * SR))
    if a:
        e[:a] = np.linspace(0, 1, a)
    if r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


# ---------------------------------------------------------------- instruments
def pad(f, dur, vel):
    """Soft strings: three slightly detuned voices with a few harmonics (low-passed afterwards on its bus)."""
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for cents in (-7, 0, 7):
        ff = f * 2 ** (cents / 1200)
        for k in range(1, 7):
            x += np.sin(2 * np.pi * ff * k * t + k) / k
    return x * fade(n, 0.9, 1.2) * vel * 0.12


def sub(f, dur, vel):
    n = int((dur + 0.1) * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(4 * np.pi * f * t) + 0.2 * np.sin(6 * np.pi * f * t)
    return x * fade(n, 0.015, 0.09) * np.exp(-t / (dur * 1.6 + 0.2)) * vel * 0.8


def pluck(f, dur, vel, bright=1.0, decay=0.6):
    """An oud-like pluck: harmonics that fade from the top, a tiny pitch drop at the start."""
    n = int((dur + 0.5) * SR)
    t = np.arange(n) / SR
    drop = 1 + 0.012 * np.exp(-t / 0.02)
    x = np.zeros(n)
    for k in range(1, 12):
        x += np.sin(2 * np.pi * f * k * drop * t) / k ** 1.1 * np.exp(-t / (decay / (1 + 0.45 * k * bright)))
    return x * np.minimum(1, t / 0.002) * vel * 0.7


def flute(f, dur, vel):
    n = int((dur + 0.25) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.0035 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, t / 0.4)
    x = np.sin(2 * np.pi * f * vib * t) + 0.1 * np.sin(4 * np.pi * f * vib * t)
    x += 0.03 * np.random.default_rng(int(f)).standard_normal(n)
    return x * fade(n, 0.07, 0.25) * vel * 0.5


def keys(f, dur, vel):
    """A felt piano / electric-piano blend."""
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for k, g in ((1, 1.0), (2, 0.4), (3, 0.18), (4, 0.08)):
        x += g * np.sin(2 * np.pi * f * k * t) * np.exp(-t / (0.9 / k ** 0.6))
    x += 0.25 * np.sin(2 * np.pi * f * 7 * t) * np.exp(-t / 0.03)
    return x * np.minimum(1, t / 0.006) * vel * 0.6


def kalimba(f, dur, vel):
    n = int((dur + 0.5) * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.45) + 0.2 * np.sin(2 * np.pi * 5.4 * f * t) * np.exp(-t / 0.06)
    return x * np.minimum(1, t / 0.003) * vel * 0.55


LEADS = {"oud": pluck, "flute": flute, "keys": keys, "kalimba": kalimba}


def noise(dur, tau, lo, hi, seed):
    n = int(dur * SR)
    x = np.random.default_rng(seed).standard_normal(n)
    sos = butter(2, [lo, hi], "band", fs=SR, output="sos")
    return sosfilt(sos, x) * np.exp(-np.arange(n) / SR / tau)


def kick(vel):
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t / 0.035)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.003) * np.exp(-t / 0.16) * vel * 0.9


def shaker(vel):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    return noise(0.09, 0.03, 5000, 9500, 11)[:n] * np.minimum(1, t / 0.012) * vel * 0.4


def clap(vel):
    return noise(0.22, 0.07, 900, 3500, 3) * vel * 0.55


def dum(vel):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    f = 80 + 70 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09) * vel * 0.7


def tek(vel):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    return (noise(0.12, 0.025, 1800, 6500, 8)[:n] * 0.7 + 0.35 * np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.03)) * vel * 0.45


def rim(vel):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.012) * vel * 0.3


# ---------------------------------------------------------------- mixing
class Bus:
    def __init__(self, n):
        self.buf = np.zeros((n, 2))

    def add(self, sample, i, pan, gain):
        if i < 0 or i >= len(self.buf):
            return
        end = min(len(self.buf), i + len(sample))
        s = sample[: end - i] * gain
        self.buf[i:end, 0] += s * np.cos((pan + 1) * np.pi / 4)
        self.buf[i:end, 1] += s * np.sin((pan + 1) * np.pi / 4)


def room(x, seconds=2.0, tau=0.55, damp=3600, seed=5):
    """A room made of a decaying, darkened noise, with a short pre-delay."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t / tau)[:, None]
    ir = sosfilt(butter(2, damp, "low", fs=SR, output="sos"), ir, axis=0)
    ir *= np.minimum(1, t / 0.03)[:, None]
    ir = np.concatenate([np.zeros((int(0.025 * SR), 2)), ir])
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
    return np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)


# ---------------------------------------------------------------- grooves (16 slots per bar)
GROOVES = {
    "chill": dict(kick=[0, 10], clap=[8], shaker=range(0, 16, 2), dum=[], tek=[], rim=[]),
    "lounge": dict(kick=[0, 4, 8, 12], clap=[4, 12], shaker=[2, 6, 10, 14], dum=[], tek=[], rim=[]),
    "oriental": dict(kick=[0], clap=[], shaker=range(0, 16, 2), dum=[0, 6, 10], tek=[4, 8, 12, 14], rim=[]),
    "bossa": dict(kick=[0, 6, 8, 14], clap=[], shaker=range(0, 16, 2), dum=[], tek=[], rim=[0, 3, 6, 10, 12]),
    "soft": dict(kick=[0], clap=[], shaker=[4, 12], dum=[], tek=[], rim=[2, 10]),
}
BASS = {  # (slot, length in slots, interval above the root)
    "long": [(0, 12, 0), (12, 4, 7)],
    "sync": [(0, 5, 0), (6, 4, 0), (10, 3, 7), (13, 3, 5)],
    "pulse": [(0, 3, 0), (4, 3, 0), (8, 3, 7), (12, 3, 0)],
}
RHYTHMS = [  # (slot, length): a lead phrase of one bar
    [(0, 6), (6, 2), (8, 8)], [(2, 4), (6, 2), (8, 4), (12, 4)], [(0, 3), (3, 3), (6, 4), (12, 4)],
    [(0, 8), (10, 2), (12, 4)], [(4, 4), (8, 2), (10, 2), (12, 4)], [(0, 2), (2, 2), (4, 8), (14, 2)],
]


def render(spec, path):
    bpm = spec["bpm"]
    sixteenth = 60.0 / bpm / 4
    bar_len = 16 * sixteenth
    chords = spec["chords"]
    bars = len(chords) * spec.get("repeats", 4)
    n = int(bars * bar_len * SR)
    tail = int(4 * SR)
    dry, wet, padbus, lowbus = (Bus(n + tail) for _ in range(4))
    rng = np.random.default_rng(spec["seed"])
    py = random.Random(spec["seed"])
    key = spec["key"]
    scale = MODES[spec["mode"]]
    swing = spec.get("swing", 0.08)

    def at(bar, slot):
        t = (bar * 16 + slot) * sixteenth
        if slot % 2:
            t += swing * sixteenth
        return int((t + rng.normal(0, 0.003)) * SR)

    def chord_at(bar):
        deg, q = chords[bar % len(chords)]
        return key + deg, QUALITY[q]

    groove = GROOVES[spec["groove"]]
    for bar in range(bars):
        root, q = chord_at(bar)
        # pad: the chord, root at the bottom
        base = 48 + (root - 48) % 12
        voicing = [base + q[0], base + q[2], base + q[1] + 12, base + q[-1] + (12 if q[-1] < 12 else 0)]
        for m in voicing:
            padbus.add(pad(hz(m), bar_len, 1.0), at(bar, 0), rng.uniform(-0.4, 0.4), spec["mix"]["pad"])
        # sub bass
        b0 = 36 + (root - 36) % 12
        for slot, length, interval in BASS[spec["bass"]]:
            lowbus.add(sub(hz(b0 + interval), length * sixteenth, 1.0), at(bar, slot), 0, spec["mix"]["bass"])
        # arpeggio
        if spec.get("arp"):
            tones = [voicing[0] + 12, voicing[1] + 12, voicing[2] + 12, voicing[1] + 24]
            order = [0, 1, 2, 3, 2, 1, 2, 1] if spec["arp"] == "up" else [0, 2, 1, 3, 1, 2, 1, 2]
            for k, idx in enumerate(order):
                inst = LEADS[spec.get("arp_instr", "kalimba")]
                wet.add(inst(hz(tones[idx]), 2 * sixteenth, 0.7 if k % 2 else 0.9), at(bar, k * 2), 0.3 if k % 2 else -0.3, spec["mix"]["arp"])
        # groove
        for slot in groove["kick"]:
            dry.add(kick(0.9), at(bar, slot), 0, spec["mix"]["drums"])
        for slot in groove["clap"]:
            wet.add(clap(0.8), at(bar, slot), 0.1, spec["mix"]["drums"] * 0.8)
        for slot in groove["shaker"]:
            dry.add(shaker(1.0 if slot % 4 == 2 else 0.6), at(bar, slot), 0.35, spec["mix"]["drums"] * 0.8)
        for slot in groove["dum"]:
            dry.add(dum(0.9), at(bar, slot), -0.1, spec["mix"]["drums"])
        for slot in groove["tek"]:
            dry.add(tek(0.8), at(bar, slot), 0.25, spec["mix"]["drums"] * 0.8)
        for slot in groove["rim"]:
            dry.add(rim(0.7), at(bar, slot), -0.25, spec["mix"]["drums"])

    # Lead: a phrase of two bars, answered by a variation; the pass after the first uses the second instrument.
    lo, hi = spec["range"]
    notes = sorted(12 * o + key % 12 + d for o in range(3, 8) for d in scale if lo <= 12 * o + key % 12 + d <= hi)
    cur = len(notes) // 2
    phrase = {}
    for bar in range(bars):
        pos = bar % 4
        half = bar // len(chords)
        inst = LEADS[spec["lead"][half % len(spec["lead"])]]
        if half == 0 and bar < spec.get("lead_rest", 2):
            continue  # an intro without the lead
        key_ = (bar % len(chords)) // 4 % 2, pos
        if key_ in phrase and pos in (0, 1):
            rhythm, picks = phrase[key_]
        else:
            rhythm = py.choice(RHYTHMS)
            picks = None
        root, q = chord_at(bar)
        tone_pcs = {(root + t) % 12 for t in q}
        made = []
        for k, (slot, length) in enumerate(rhythm):
            if picks is not None:
                cur = picks[k]
            else:
                cur = max(0, min(len(notes) - 1, cur + py.choice((-2, -1, -1, 1, 1, 2))))
                if k == 0:
                    cur = min(range(max(0, cur - 3), min(len(notes), cur + 4)), key=lambda i: (notes[i] % 12 not in tone_pcs, abs(i - cur)))
                if pos == 3 and k == len(rhythm) - 1:  # end of the phrase: the key note
                    cur = min(range(len(notes)), key=lambda i: (notes[i] % 12 != key % 12, abs(i - cur)))
            made.append(cur)
            vel = 0.9 if slot == 0 else 0.75
            if inst is pluck and slot and py.random() < 0.35 and cur > 0:  # a grace note
                grace = notes[max(0, cur - 1)]
                wet.add(inst(hz(grace), sixteenth, vel * 0.5), at(bar, slot) - int(0.07 * SR), -0.1, spec["mix"]["lead"] * 0.7)
            wet.add(inst(hz(notes[cur]), length * sixteenth * 0.95, vel), at(bar, slot), -0.05, spec["mix"]["lead"])
        phrase[key_] = (rhythm, made)

    # Buses: the pad and the bass are warmed, the room goes on what is melodic.
    pads = sosfilt(butter(2, 1500, "low", fs=SR, output="sos"), padbus.buf, axis=0)
    low = sosfilt(butter(2, 180, "low", fs=SR, output="sos"), lowbus.buf, axis=0)
    room_in = wet.buf + pads * 0.7
    mixed = dry.buf + low + pads + wet.buf * 0.8 + room(room_in) * spec.get("reverb", 0.55)
    mixed[: len(mixed) - n] += mixed[n:]  # fold the tail back: a seamless loop
    out = mixed[:n]
    # Filter the loop three times in a row and keep the middle one: no click where it wraps around.
    ring = np.concatenate([out, out, out])
    ring = sosfilt(butter(2, 40, "high", fs=SR, output="sos"), ring, axis=0)
    ring = sosfilt(butter(2, 11000, "low", fs=SR, output="sos"), ring, axis=0)
    out = ring[n: 2 * n]
    out = np.tanh(out * 0.9)
    out *= 10 ** (-2 / 20) / np.max(np.abs(out))
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((out * 32767).astype(np.int16).tobytes())
    return n / SR


def C(*pairs):
    return list(pairs)


TRACKS = {
    # The cheerful default: a mellow groove with a kalimba and a flute (D dorian).
    "comic": dict(bpm=96, seed=11, key=62, mode="dorian", groove="chill", bass="sync", lead=["flute", "keys"], arp="up",
                  range=(69, 86), mix=dict(pad=0.55, bass=0.75, arp=0.38, drums=0.45, lead=0.55),
                  chords=C((0, "m9"), (0, "m9"), (5, "maj9"), (5, "maj9"), (-2, "maj7"), (-2, "maj7"), (7, "m7"), (7, "7"))),
    # Jazzy lounge: felt piano, brushes, a walking pulse (F major).
    "classic-green": dict(bpm=88, seed=21, key=65, mode="major", groove="soft", bass="long", lead=["keys", "flute"], arp="down",
                          arp_instr="keys", range=(65, 84), mix=dict(pad=0.6, bass=0.7, arp=0.3, drums=0.5, lead=0.6),
                          chords=C((0, "maj9"), (-3, "m7"), (2, "m7"), (7, "7"), (0, "maj9"), (-3, "m7"), (2, "m7"), (7, "7"))),
    # Dark, slow, oriental: oud and a hand drum (A phrygian dominant).
    "midnight": dict(bpm=82, seed=31, key=57, mode="phrygian_dom", groove="oriental", bass="long", lead=["oud", "flute"], arp=None,
                     range=(64, 84), swing=0.0, mix=dict(pad=0.7, bass=0.85, arp=0.3, drums=0.55, lead=0.7), reverb=0.65,
                     chords=C((0, "m7"), (0, "m7"), (1, "maj7"), (1, "maj7"), (0, "m7"), (-2, "maj7"), (7, "7"), (7, "7"))),
    # Warm bossa-lounge: flute and a harp-like arpeggio (C lydian).
    "sunset": dict(bpm=100, seed=41, key=60, mode="lydian", groove="bossa", bass="sync", lead=["flute", "keys"], arp="up",
                   range=(67, 86), mix=dict(pad=0.55, bass=0.7, arp=0.38, drums=0.42, lead=0.6),
                   chords=C((0, "maj9"), (0, "maj9"), (9, "m9"), (9, "m9"), (2, "m7"), (7, "7"), (0, "maj9"), (7, "sus"))),
    # Airy and organic: kalimba arpeggio, flute (D dorian, slower).
    "forest": dict(bpm=90, seed=51, key=62, mode="dorian", groove="chill", bass="long", lead=["flute", "oud"], arp="down",
                   range=(66, 86), mix=dict(pad=0.6, bass=0.7, arp=0.42, drums=0.4, lead=0.6), reverb=0.65,
                   chords=C((0, "m7"), (0, "m7"), (-2, "maj7"), (-2, "maj7"), (3, "maj7"), (3, "maj7"), (-4, "maj7"), (7, "m7"))),
    # Warm and sensual: oud, darbuka (E phrygian dominant).
    "ruby": dict(bpm=94, seed=61, key=64, mode="phrygian_dom", groove="oriental", bass="sync", lead=["oud", "keys"], arp="up",
                 arp_instr="oud", range=(64, 83), swing=0.0, mix=dict(pad=0.6, bass=0.8, arp=0.3, drums=0.55, lead=0.7),
                 chords=C((0, "m7"), (0, "m7"), (-4, "maj7"), (-4, "maj7"), (-2, "maj7"), (-2, "maj7"), (-1, "7"), (0, "m7"))),
    # Opulent and slow: a big pad, a steady kick and a plucked lead (Bb harmonic minor).
    "gilded": dict(bpm=86, seed=71, key=58, mode="harmonic_minor", groove="lounge", bass="pulse", lead=["oud", "keys"], arp="up",
                   range=(65, 84), mix=dict(pad=0.75, bass=0.75, arp=0.3, drums=0.45, lead=0.65), reverb=0.7,
                   chords=C((0, "m9"), (0, "m9"), (-4, "maj7"), (-4, "maj7"), (-7, "maj7"), (-2, "7"), (0, "m9"), (7, "7"))),
}


def main(argv):
    outdir = argv[1] if len(argv) > 1 else "."
    for name in argv[2:] or THEMES:
        seconds = render(TRACKS[name], f"{outdir}/{name}.wav")
        print(f"{name}: {seconds:.0f} s")


if __name__ == "__main__":
    main(sys.argv)
