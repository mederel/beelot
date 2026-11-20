#!/usr/bin/env python3
"""Original, gentle cartoon-style loops for Beelot (soft instruments, brushes, a warm room), synthesised with numpy and scipy.

Each track is written as a chord progression, a rhythm for the melody, a bass and a drum pattern; the melody is a
seeded walk through the scale that lands on chord tones on the strong beats. Everything is deterministic: the same
script gives the same four files. The tails of the reverb are folded back onto the start, so the loops are seamless.
"""
import random
import sys
import wave

import numpy as np

SR = 44100


# ---------------------------------------------------------------- notes
def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "mixo": [0, 2, 4, 5, 7, 9, 10],
}
QUALITY = {  # chord tones above the root
    "": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "m7": [0, 3, 7, 10], "dim": [0, 3, 6], "6": [0, 4, 7, 9],
    "maj7": [0, 4, 7, 11],
}
NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def chord(name):
    root = NAMES[name[0]]
    rest = name[1:]
    if rest.startswith("b"):
        root -= 1
        rest = rest[1:]
    elif rest.startswith("#"):
        root += 1
        rest = rest[1:]
    return root, QUALITY[rest]


# ---------------------------------------------------------------- instruments (each returns a mono array)
def env(n, attack, decay_tau, sustain=0.0, release=0.01):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(attack, 1e-4)) * (sustain + (1 - sustain) * np.exp(-t / decay_tau))
    r = int(release * SR)
    if r and n > r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def marimba(f, dur, vel):
    """A soft wooden bar: a round tone with a short, quiet overtone."""
    n = int((dur + 0.5) * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.45) + 0.12 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.06)
    return x * np.minimum(1, t / 0.006) * vel * 0.9


def xylophone(f, dur, vel):
    """Vibraphone-like: warm, with a slow shimmer (it replaces the hard xylophone)."""
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    shimmer = 1 + 0.12 * np.sin(2 * np.pi * 4.5 * t)
    x = np.sin(2 * np.pi * f * t) * shimmer * np.exp(-t / 0.6) + 0.1 * np.sin(2 * np.pi * 3.9 * f * t) * np.exp(-t / 0.12)
    return x * np.minimum(1, t / 0.008) * vel * 0.8


def glock(f, dur, vel):
    """A small, soft bell."""
    n = int((dur + 0.7) * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.5) + 0.12 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t / 0.15)
    return x * np.minimum(1, t / 0.005) * vel * 0.4


def pizz(f, dur, vel):
    """A plucked string (Karplus-Strong), darker and rounder."""
    n = int((dur + 0.3) * SR)
    period = max(2, int(SR / f))
    rng = np.random.default_rng(int(f * 10))
    buf = rng.uniform(-1, 1, period)
    for _ in range(3):
        buf = np.convolve(buf, np.ones(3) / 3, mode="same")
    out = np.empty(n)
    for i in range(n):
        j = i % period
        out[i] = buf[j]
        buf[j] = 0.5 * (buf[j] + buf[(j + 1) % period]) * 0.994
    return out * np.minimum(1, np.arange(n) / SR / 0.004) * vel * 2.0


def tuba(f, dur, vel):
    """A warm low brass: few harmonics, a soft attack."""
    n = int((dur + 0.12) * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for k in range(1, 5):
        x += np.sin(2 * np.pi * f * k * t) / k ** 1.6
    return x * env(n, 0.03, 0.5, 0.5, 0.08) * vel * 0.6


def clarinet(f, dur, vel):
    """A mellow reed (odd harmonics, quiet), with a slow vibrato and a little breath."""
    n = int((dur + 0.1) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.003 * np.sin(2 * np.pi * 4.8 * t) * np.minimum(1, t / 0.35)
    x = np.zeros(n)
    for k, g in ((1, 1.0), (3, 0.28), (5, 0.1), (7, 0.04)):
        x += g * np.sin(2 * np.pi * f * vib * k * t)
    x += 0.012 * np.random.default_rng(int(f)).standard_normal(n)
    return x * env(n, 0.05, 1.0, 0.85, 0.12) * vel * 0.55


def kazoo(f, dur, vel):
    """A flute (it replaces the buzzy kazoo): nearly pure, with breath and vibrato."""
    n = int((dur + 0.1) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.0 * t) * np.minimum(1, t / 0.3)
    x = np.sin(2 * np.pi * f * vib * t) + 0.12 * np.sin(4 * np.pi * f * vib * t)
    x += 0.02 * np.random.default_rng(int(f) + 1).standard_normal(n)
    return x * env(n, 0.06, 1.0, 0.85, 0.12) * vel * 0.5


def uke(f, dur, vel):
    n = int((dur + 0.3) * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for k in range(1, 4):
        x += np.sin(2 * np.pi * f * k * t) * np.exp(-t / (0.3 / k ** 0.5)) / k ** 1.3
    return x * np.minimum(1, t / 0.004) * vel * 0.5


def piano_stab(f, dur, vel):
    """A felt piano: soft hammer, quick fade."""
    n = int((dur + 0.35) * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for k in range(1, 5):
        x += np.sin(2 * np.pi * f * k * t) * np.exp(-t / (0.5 / k ** 0.7)) / k ** 1.6
    return x * np.minimum(1, t / 0.008) * vel * 0.55


def noise_burst(dur, tau, lo=0, hi=1.0, seed=1):
    n = int(dur * SR)
    x = np.random.default_rng(seed).standard_normal(n)
    if hi < 1.0 or lo > 0:
        spec = np.fft.rfft(x)
        freqs = np.fft.rfftfreq(n, 1 / SR) / (SR / 2)
        spec[(freqs < lo) | (freqs > hi)] = 0
        x = np.fft.irfft(spec, n)
    return x * np.exp(-np.arange(n) / SR / tau)


def kick(vel):
    """A soft low thump (a felt beater on a big drum)."""
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = 50 + 40 * np.exp(-t / 0.05)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.006) * np.exp(-t / 0.1) * vel * 0.7


def snare(vel):
    """A brush: a short swish of filtered noise, no crack."""
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    return noise_burst(0.16, 0.05, 0.06, 0.4, 3)[:n] * np.minimum(1, t / 0.012) * vel * 0.5


def hat(vel):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    return noise_burst(0.08, 0.02, 0.2, 0.55, 5)[:n] * np.minimum(1, t / 0.01) * vel * 0.18


def woodblock(vel, high=True):
    """A soft tick, low and short."""
    f = 700 if high else 520
    n = int(0.1 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * np.minimum(1, t / 0.003) * np.exp(-t / 0.03) * vel * 0.35


def slide_whistle(f0, f1, dur, vel):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.05, 1.0, 0.9, 0.1) * vel * 0.15


INSTR = {"marimba": marimba, "xylo": xylophone, "glock": glock, "pizz": pizz, "tuba": tuba, "clar": clarinet,
         "kazoo": kazoo, "uke": uke, "stab": piano_stab}


# ---------------------------------------------------------------- sequencing
class Mix:
    def __init__(self, seconds):
        self.n = int(seconds * SR)
        self.tail = SR * 3
        self.buf = np.zeros((self.n + self.tail, 2))
        self.rng = np.random.default_rng(7)

    def add(self, sample, at, pan=0.0, gain=1.0):
        # A player is never exact: a few milliseconds of timing and a little strength vary from note to note.
        at = max(0.0, at + self.rng.normal(0, 0.007))
        gain = gain * self.rng.uniform(0.85, 1.08)
        i = int(at * SR)
        if i >= self.n:
            return
        end = min(len(self.buf), i + len(sample))
        s = sample[: end - i] * gain
        left = np.cos((pan + 1) * np.pi / 4)
        right = np.sin((pan + 1) * np.pi / 4)
        self.buf[i:end, 0] += s * left
        self.buf[i:end, 1] += s * right


def reverb(x, mix=0.16):
    """A warm room: the sound convolved with a darkened, decaying noise (about 1.6 s)."""
    from scipy.signal import butter, fftconvolve, sosfilt
    rng = np.random.default_rng(5)
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t / 0.4)[:, None]
    ir = sosfilt(butter(2, 3200, "low", fs=SR, output="sos"), ir, axis=0)
    ir *= np.minimum(1, t / 0.02)[:, None]
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
    wet = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return x + wet * mix * 3.0


def render(spec, path_base):
    bpm = spec["bpm"] * 0.86
    beat = 60.0 / bpm
    bars = len(spec["chords"])
    seconds = bars * 4 * beat
    mix = Mix(seconds)
    rng = random.Random(spec["seed"])
    scale = SCALES[spec["scale"]]
    key = spec["key"]
    swing = spec.get("swing", 0.0)

    def when(bar, eighth):
        """Time in seconds of an eighth-note slot, with swing on the off-beats."""
        t = (bar * 8 + eighth) * 0.5 * beat
        if eighth % 2 == 1:
            t += swing * 0.5 * beat
        return t

    def scale_notes(lo, hi):
        notes = []
        for octave in range(-1, 9):
            for degree in scale:
                m = 12 * octave + key + degree
                if lo <= m <= hi:
                    notes.append(m)
        return sorted(notes)

    lo, hi = spec["range"]
    spec = dict(spec, range=(max(55, lo - 5), min(84, hi - 6)))
    mel_notes = scale_notes(*spec["range"])
    rest_rng = random.Random(spec["seed"] + 5)
    cur = len(mel_notes) // 2

    # Harmony: chord tones per bar (a bar may change chord at beat 3 when two chords are given).
    def bar_chords(bar):
        c = spec["chords"][bar]
        return c if isinstance(c, list) else [c]

    def tones_at(bar, eighth):
        cs = bar_chords(bar)
        name = cs[0] if len(cs) == 1 or eighth < 4 else cs[1]
        root, q = chord(name)
        return name, root, q

    # Bass and comping
    for bar in range(bars):
        for half in range(2):
            name, root, q = tones_at(bar, half * 4)
            bass_m = 36 + (root + key) % 12
            if bass_m < 36:
                bass_m += 12
            style = spec["bass"]
            if style == "oompah":
                mix.add(tuba(hz(bass_m), beat * 0.45, 0.9), when(bar, half * 4), -0.15, spec["mix"]["bass"])
                mix.add(tuba(hz(bass_m + 7), beat * 0.4, 0.7), when(bar, half * 4 + 2), -0.15, spec["mix"]["bass"])
            elif style == "walk":
                tones = [bass_m, bass_m + q[1] if len(q) > 1 else bass_m + 4, bass_m + 7, bass_m + 5 + (0 if q[1] == 4 else -1)]
                for k in range(2):
                    n_ = tones[(k + half * 2) % 4]
                    mix.add(pizz(hz(n_), beat * 0.9, 0.9), when(bar, half * 4 + k * 2), -0.2, spec["mix"]["bass"])
            elif style == "gallop":
                for k, off in enumerate((0, 1, 2, 3)):
                    n_ = bass_m + (0 if k % 2 == 0 else 7)
                    mix.add(tuba(hz(n_), beat * 0.22, 0.85), when(bar, half * 4 + off), -0.1, spec["mix"]["bass"])
            elif style == "tango":
                for off, step in ((0, 0), (3, 0), (4, 7), (6, 0)):
                    if half == 0 and off >= 4:
                        continue
                    if half == 1 and off < 4:
                        continue
                    mix.add(pizz(hz(bass_m + step), beat * 0.45, 0.95), when(bar, off), -0.15, spec["mix"]["bass"])
            elif style == "bounce":
                for k, off in enumerate((0, 3)):
                    n_ = bass_m + (0 if k == 0 else 7)
                    mix.add(pizz(hz(n_), beat * 0.6, 0.95), when(bar, half * 4 + off), -0.15, spec["mix"]["bass"])
            # comping chords on the off-beats
            comp = spec["comp"]
            voicing = [60 + (root + key) % 12 - (12 if (root + key) % 12 > 6 else 0) + tone for tone in q]
            if comp == "offbeat":
                for off in (1, 3):
                    for m in voicing:
                        mix.add(piano_stab(hz(m), beat * 0.3, 0.6), when(bar, half * 4 + off), 0.25, spec["mix"]["comp"] / len(voicing) * 1.6)
            elif comp == "strum":
                for off in (0, 1, 3) if half == 0 else (1, 2, 3):
                    for j, m in enumerate(voicing):
                        mix.add(uke(hz(m + 12), beat * 0.4, 0.7), when(bar, half * 4 + off) + j * 0.012, 0.3, spec["mix"]["comp"] / len(voicing) * 1.6)
            elif comp == "tremolo":
                for off in range(4):
                    for m in voicing[:2]:
                        mix.add(xylophone(hz(m + 12), beat * 0.2, 0.5), when(bar, half * 4 + off) + 0.0, 0.3, spec["mix"]["comp"] / 2)
            elif comp == "arp":
                for k in range(4):
                    m = voicing[k % len(voicing)] + 12
                    mix.add(marimba(hz(m), beat * 0.3, 0.55), when(bar, half * 4 + k) , 0.35, spec["mix"]["comp"])

    # Melody: a phrase of four bars played twice, the second time with another ending.
    patterns = spec["rhythms"]
    phrase_cache = {}
    for bar in range(bars):
        phrase, pos = divmod(bar, 4)
        section = (bar // 8)
        key_ = (section % spec.get("sections", 2), pos)
        pattern_rng = random.Random(spec["seed"] * 100 + key_[0] * 10 + pos)
        pat = patterns[pattern_rng.randrange(len(patterns))]
        if key_ in phrase_cache and (bar // 4) % 2 == 1 and pos < 3:
            pat, steps = phrase_cache[key_]
        else:
            steps = None
        made = []
        for slot in range(8):
            if not pat[slot]:
                made.append(None)
                continue
            name, root, q = tones_at(bar, slot)
            chord_pcs = {(root + key + tone) % 12 for tone in q}
            if steps is not None and slot < len(steps) and steps[slot] is not None:
                cur = steps[slot]
            else:
                move = rng.choice((-2, -1, -1, 0, 1, 1, 2, 3)) if slot else rng.choice((-1, 0, 1, 2))
                if mel_notes[cur] > spec["range"][1] - 4:
                    move = -abs(move) - 1
                if mel_notes[cur] < spec["range"][0] + 4:
                    move = abs(move) + 1
                cur = max(0, min(len(mel_notes) - 1, cur + move))
                if slot % 4 == 0 or pat[slot] == 2:  # strong beat: snap to the nearest chord tone
                    best = min(range(max(0, cur - 3), min(len(mel_notes), cur + 4)),
                               key=lambda i: (0 if mel_notes[i] % 12 in chord_pcs else 9, abs(i - cur)))
                    cur = best
            made.append(cur)
        if pos == 3:  # end of phrase: finish on the chord root (the tonic at the end of a section)
            last = max(i for i, v in enumerate(made) if v is not None) if any(v is not None for v in made) else None
            if last is not None:
                _, root, q = tones_at(bar, last)
                target = (bar // 4) % 2 == 1 or bar == bars - 1
                pc = (key if target and bar == bars - 1 else root + key) % 12
                made[last] = min(range(len(mel_notes)), key=lambda i: (mel_notes[i] % 12 != pc, abs(i - cur)))
                cur = made[last]
        phrase_cache[key_] = (pat, made)
        for slot, idx in enumerate(made):
            if idx is None:
                continue
            if slot % 4 != 0 and pat[slot] != 2 and rest_rng.random() < 0.3:
                continue  # let the melody breathe
            length = 0.5
            nxt = next((s for s in range(slot + 1, 8) if pat[s]), 8)
            length = (nxt - slot) * 0.5 * beat * max(spec.get("legato", 0.85), 0.9)
            m = mel_notes[idx]
            inst = INSTR[spec["lead"][(bar // 8) % len(spec["lead"])]]
            vel = 0.85 if slot % 4 == 0 else 0.7
            mix.add(inst(hz(m), length, vel), when(bar, slot), -0.1, spec["mix"]["lead"])
            if spec.get("echo"):
                mix.add(glock(hz(m + 12), length, 0.5), when(bar, slot) + 0.5 * beat, 0.4, spec["mix"]["lead"] * 0.18)

    # Drums
    for bar in range(bars):
        for slot in range(8):
            t = when(bar, slot)
            d = spec["drums"]
            if d == "swing":
                if slot in (0, 4):
                    mix.add(kick(0.7), t, 0, 0.5)
                if slot in (2, 6):
                    mix.add(woodblock(0.7, slot == 2), t, 0.2, 0.7)
                if slot in (1, 3, 5, 7):
                    mix.add(hat(0.5), t, -0.2, 0.6)
            elif d == "tiptoe":
                if slot == 0:
                    mix.add(kick(0.5), t, 0, 0.4)
                if slot in (2, 6):
                    mix.add(woodblock(0.8, False), t, -0.3, 0.8)
                if slot in (3, 7) and bar % 2 == 1:
                    mix.add(woodblock(0.5, True), t, 0.3, 0.6)
            elif d == "polka":
                if slot in (0, 4):
                    mix.add(kick(0.8), t, 0, 0.55)
                if slot in (2, 6):
                    mix.add(snare(0.65), t, 0.1, 0.6)
                mix.add(hat(0.4 if slot % 2 else 0.6), t, -0.25, 0.5)
            elif d == "bossa":
                if slot in (0, 3, 4, 7):
                    mix.add(kick(0.45), t, 0, 0.35)
                if slot in (0, 3, 6, 2, 4):
                    mix.add(woodblock(0.45, slot in (0, 3, 6)), t, 0.25, 0.4)
                mix.add(hat(0.3), t, -0.25, 0.4)
            elif d == "folk":
                if slot in (0, 4):
                    mix.add(kick(0.5), t, 0, 0.35)
                if slot in (2, 6):
                    mix.add(woodblock(0.7, slot == 2), t, 0.2, 0.55)
                if slot % 2 == 1:
                    mix.add(hat(0.3), t, -0.2, 0.4)
            elif d == "tango":
                if slot in (0, 4):
                    mix.add(kick(0.75), t, 0, 0.5)
                if slot in (3, 6):
                    mix.add(woodblock(0.8, False), t, 0.25, 0.7)
                if slot in (2, 6):
                    mix.add(snare(0.35), t, 0.1, 0.4)
            elif d == "march":
                if slot in (0, 4):
                    mix.add(kick(0.8), t, 0, 0.55)
                if slot in (2, 6):
                    mix.add(snare(0.7), t, 0.1, 0.6)
                if slot in (1, 3, 5, 7):
                    mix.add(hat(0.35), t, -0.2, 0.4)
            elif d == "chase":
                if slot % 2 == 0:
                    mix.add(kick(0.75), t, 0, 0.5)
                if slot in (2, 6):
                    mix.add(snare(0.8), t, 0.1, 0.7)
                mix.add(woodblock(0.5 if slot % 2 else 0.7, slot % 4 < 2), t, 0.25, 0.45)
                mix.add(hat(0.5), t, -0.25, 0.5)
        if bar % 8 == 7 and spec.get("fill", False):
            for k in range(4):
                mix.add(snare(0.5 + 0.1 * k), when(bar, 4 + k), 0.1, 0.6)
            mix.add(slide_whistle(hz(72 + key), hz(96 + key), beat * 1.5, 0.8), when(bar, 4) - 0.0, 0.0, 0.4)

    out = reverb(mix.buf, spec.get("reverb", 0.16))
    # Fold the tail back onto the start so that the loop is seamless.
    n = mix.n
    out[: len(out) - n] += out[n:]
    out = out[:n]
    # A little more body and a softer top: the synthesised percussion and marimbas are bright.
    from scipy.signal import butter, sosfilt
    low = sosfilt(butter(2, 260, "low", fs=SR, output="sos"), out, axis=0)
    out = out + low * spec.get("bass_boost", 0.5)
    out = sosfilt(butter(2, 5500, "low", fs=SR, output="sos"), out, axis=0)
    out = np.tanh(out * 0.8)
    out *= 10 ** (-4 / 20) / np.max(np.abs(out))
    pcm = (out * 32767).astype(np.int16)
    wav_path = path_base + ".wav"
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return wav_path, seconds


R = lambda *slots: [int(c) for c in slots]
TRACKS = {
    # 1: ragtime / swing, the main table theme.
    "01-tricky-table": dict(
        bpm=116, seed=11, key=0, scale="major", swing=0.22, range=(64, 88), lead=["marimba", "clar"], bass="oompah", comp="offbeat",
        drums="swing", echo=False, legato=0.8, sections=2,
        chords=["C", "C", "A7", "A7", "D7", "D7", "G7", "G7", "C", "E7", "A7", "A7", "D7", "G7", "C", "G7",
                "F", "F", "C", "A7", "D7", "D7", "G7", "G7", "C", "A7", "D7", "G7", "C", "F", "C", "C"],
        rhythms=[R(2, 0, 1, 1, 2, 0, 1, 0), R(2, 1, 1, 0, 2, 0, 0, 1), R(1, 1, 2, 0, 1, 1, 2, 0), R(2, 0, 0, 1, 1, 0, 2, 0)],
        mix=dict(lead=0.5, bass=0.45, comp=0.3)),
    # 2: tiptoe, a sneaky one for the bidding.
    "02-sneaky-cat": dict(
        bpm=100, seed=23, key=2, scale="minor", swing=0.0, range=(62, 86), lead=["xylo", "marimba"], bass="walk", comp="tremolo",
        drums="tiptoe", echo=True, legato=0.55, sections=2, reverb=0.2,
        chords=["Dm", "Dm", "Gm", "Gm", "Dm", "Bb", "A7", "A7", "Dm", "Dm", "Gm", "Gm", "Bb", "A7", "Dm", "A7",
                "Gm", "Gm", "Dm", "Dm", "Bb", "Bb", "A7", "A7", "Dm", "Gm", "Dm", "Bb", "A7", "A7", "Dm", "Dm"],
        rhythms=[R(2, 0, 1, 0, 1, 0, 2, 0), R(0, 1, 2, 0, 1, 0, 1, 1), R(2, 0, 0, 1, 2, 0, 1, 0), R(1, 0, 2, 0, 0, 1, 2, 0)],
        mix=dict(lead=0.5, bass=0.5, comp=0.18)),
    # 3: sunny polka.
    "03-sunny-morning": dict(
        bpm=132, seed=37, key=7, scale="major", swing=0.0, range=(67, 91), lead=["glock", "kazoo"], bass="bounce", comp="strum",
        drums="polka", echo=False, legato=0.7, sections=2,
        chords=["G", "G", "D7", "D7", "G", "C", "D7", "G", "G", "Em", "C", "D7", "G", "C", "D7", "G",
                "C", "C", "G", "G", "D7", "D7", "G", "G", "C", "D7", "G", "Em", "C", "D7", "G", "G"],
        rhythms=[R(2, 1, 1, 1, 2, 0, 1, 0), R(2, 0, 2, 0, 1, 1, 2, 0), R(1, 1, 2, 1, 1, 0, 2, 0), R(2, 1, 0, 1, 2, 1, 1, 0)],
        mix=dict(lead=0.55, bass=0.4, comp=0.3)),
    # 4: chase, for the last tricks.
    "04-chase-scene": dict(
        bpm=158, seed=41, key=9, scale="minor", swing=0.0, range=(62, 88), lead=["clar", "xylo"], bass="gallop", comp="arp",
        drums="chase", echo=False, legato=0.6, sections=2, reverb=0.14,
        chords=["Am", "Am", "Dm", "Dm", "Am", "E7", "Am", "E7", "Am", "Am", "F", "F", "Dm", "E7", "Am", "E7",
                "F", "F", "C", "C", "Dm", "Dm", "E7", "E7", "Am", "F", "Dm", "E7", "Am", "Dm", "E7", "Am"],
        rhythms=[R(2, 1, 1, 1, 2, 1, 1, 1), R(2, 0, 1, 1, 2, 0, 1, 1), R(1, 1, 2, 1, 1, 1, 2, 0), R(2, 1, 1, 0, 1, 1, 2, 1)],
        mix=dict(lead=0.5, bass=0.45, comp=0.22)),
    # Themes of the table (one per theme of the interface, named like it).
    "classic-green": dict(
        bpm=94, seed=51, key=5, scale="major", swing=0.3, range=(65, 86), lead=["clar", "marimba"], bass="walk", comp="offbeat",
        drums="swing", echo=False, legato=0.85, sections=2, reverb=0.2, fill=False,
        chords=["F6", "F6", "Dm7", "Dm7", "Gm7", "C7", "F6", "C7", "F6", "A7", "Dm7", "Dm7", "Gm7", "C7", "F6", "C7",
                "Bb", "Bb", "F6", "F6", "Gm7", "C7", "F6", "Gm7", "F6", "Dm7", "Gm7", "C7", "F6", "Bb", "F6", "F6"],
        rhythms=[R(2, 0, 0, 1, 2, 0, 1, 0), R(1, 0, 2, 0, 1, 1, 2, 0), R(2, 0, 1, 0, 0, 1, 2, 0), R(0, 1, 2, 0, 2, 0, 0, 1)],
        mix=dict(lead=0.5, bass=0.5, comp=0.22)),
    "sunset": dict(
        bpm=104, seed=61, key=0, scale="major", swing=0.0, range=(64, 88), lead=["glock", "marimba"], bass="bounce", comp="strum",
        drums="bossa", echo=True, legato=0.9, sections=2, reverb=0.22, fill=False,
        chords=["Cmaj7", "Cmaj7", "Am7", "Am7", "Dm7", "G7", "Cmaj7", "G7", "Cmaj7", "E7", "Am7", "Am7", "Dm7", "G7", "Cmaj7", "G7",
                "Fmaj7", "Fmaj7", "Cmaj7", "Cmaj7", "Dm7", "G7", "Cmaj7", "A7", "Dm7", "G7", "Cmaj7", "Am7", "Dm7", "G7", "Cmaj7", "Cmaj7"],
        rhythms=[R(2, 0, 1, 1, 0, 1, 2, 0), R(1, 0, 2, 0, 1, 0, 2, 1), R(2, 1, 0, 1, 2, 0, 0, 1), R(0, 1, 2, 0, 1, 1, 2, 0)],
        mix=dict(lead=0.55, bass=0.45, comp=0.3)),
    "forest": dict(
        bpm=122, seed=71, key=2, scale="major", swing=0.12, range=(66, 90), lead=["clar", "xylo"], bass="bounce", comp="arp",
        drums="folk", echo=False, legato=0.7, sections=2, reverb=0.24,
        chords=["D", "D", "G", "G", "D", "Bm", "A7", "A7", "D", "F#7", "Bm", "Bm", "G", "A7", "D", "A7",
                "G", "G", "D", "D", "Em", "Em", "A7", "A7", "D", "G", "D", "Bm", "G", "A7", "D", "D"],
        rhythms=[R(2, 1, 1, 0, 2, 1, 1, 0), R(2, 0, 1, 1, 2, 0, 2, 0), R(1, 1, 2, 0, 1, 1, 2, 0), R(2, 1, 0, 1, 1, 2, 0, 1)],
        mix=dict(lead=0.55, bass=0.42, comp=0.28)),
    "ruby": dict(
        bpm=112, seed=81, key=9, scale="minor", swing=0.0, range=(62, 86), lead=["clar", "kazoo"], bass="tango", comp="offbeat",
        drums="tango", echo=False, legato=0.75, sections=2, reverb=0.17,
        chords=["Am", "Am", "Dm", "Dm", "Am", "E7", "Am", "E7", "Am", "A7", "Dm", "Dm", "Bb", "E7", "Am", "E7",
                "Dm", "Dm", "Am", "Am", "Bb", "Bb", "E7", "E7", "Am", "Dm", "Am", "Bb", "E7", "E7", "Am", "Am"],
        rhythms=[R(2, 0, 0, 1, 2, 0, 1, 0), R(2, 0, 1, 1, 0, 2, 0, 1), R(1, 0, 2, 0, 2, 0, 1, 0), R(2, 1, 0, 0, 2, 0, 0, 1)],
        mix=dict(lead=0.5, bass=0.5, comp=0.28)),
    "gilded": dict(
        bpm=102, seed=91, key=10, scale="major", swing=0.0, range=(65, 91), lead=["kazoo", "glock"], bass="oompah", comp="offbeat",
        drums="march", echo=True, legato=0.8, sections=2, reverb=0.28,
        chords=["Bb", "Bb", "Gm", "Gm", "Eb", "F7", "Bb", "F7", "Bb", "D7", "Gm", "Gm", "Eb", "F7", "Bb", "F7",
                "Eb", "Eb", "Bb", "Bb", "Cm", "F7", "Bb", "Bb", "Bb", "Gm", "Eb", "F7", "Bb", "Eb", "Bb", "Bb"],
        rhythms=[R(2, 1, 1, 0, 2, 0, 2, 0), R(2, 0, 2, 0, 1, 1, 2, 0), R(2, 1, 0, 1, 2, 0, 1, 1), R(1, 1, 2, 0, 2, 1, 1, 0)],
        mix=dict(lead=0.52, bass=0.45, comp=0.3)),
}

# The seven themes of the table: the music has the name of its theme. Comic is the ragtime, Midnight the tiptoeing cat.
TRACKS["comic"] = TRACKS.pop("01-tricky-table")
TRACKS["midnight"] = TRACKS.pop("02-sneaky-cat")
TRACKS["extra-sunny-morning"] = TRACKS.pop("03-sunny-morning")
TRACKS["extra-chase-scene"] = TRACKS.pop("04-chase-scene")
THEMES = ["comic", "classic-green", "midnight", "sunset", "forest", "ruby", "gilded"]

if __name__ == "__main__":
    outdir = sys.argv[1]
    only = sys.argv[2:] or THEMES
    for name in only:
        path, seconds = render(TRACKS[name], f"{outdir}/{name}")
        print(name, f"{seconds:.1f}s", path, flush=True)
