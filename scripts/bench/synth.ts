/**
 * Synthetic dance tracks with exactly known answers, for the analysis bench
 * and unit tests: tempo, every beat and downbeat, key, and section changes.
 *
 * Arrangement (bars): intro 8 (drums) · drop 16 (all) · breakdown 8 (no
 * kick or bass) · build 4 (riser, snare roll) · drop 16 · outro 8 (drums).
 * Harmony changes on each downbeat, like most dance music, and a lead-in
 * of off-beat hats before the first downbeat makes "first beat = beat 1"
 * wrong on purpose.
 */
export type SynthSpec = {
  name: string
  bpm: number
  /** Key root, 0 = C … 11 = B. */
  root: number
  mode: "major" | "minor"
  /** Seconds of silence before the lead-in. */
  offset?: number
  /** Beats of hats before the first downbeat (0–3). */
  pickup?: number
  /** Tuning offset in cents (e.g. +30 for a slightly sharp master). */
  cents?: number
  sampleRate?: number
}

export type SynthTruth = {
  bpm: number
  beats: number[]
  downbeats: number[]
  key: { root: number; mode: "major" | "minor"; camelot: string }
  /** Times where the arrangement changes (excluding start and end). */
  boundaries: number[]
  sections: { label: string; start: number; end: number }[]
}

const camelotWheels = {
  major: [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1],
  minor: [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10],
}
export const camelotOf = (root: number, mode: "major" | "minor") =>
  `${camelotWheels[mode][((root % 12) + 12) % 12]}${mode === "minor" ? "A" : "B"}`

/** Deterministic noise so fixtures never change between runs. */
function noiseSource(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return (s / 4294967296) * 2 - 1
  }
}

const layout = [
  { label: "intro", bars: 8 },
  { label: "drop", bars: 16 },
  { label: "breakdown", bars: 8 },
  { label: "build", bars: 4 },
  { label: "drop", bars: 16 },
  { label: "outro", bars: 8 },
] as const

export function synthTrack(spec: SynthSpec) {
  const sr = spec.sampleRate ?? 44100
  const beat = 60 / spec.bpm,
    bar = beat * 4
  const pickup = spec.pickup ?? 2
  const start = (spec.offset ?? 0.2) + pickup * beat // first downbeat
  const totalBars = layout.reduce((n, s) => n + s.bars, 0)
  const duration = start + totalBars * bar + 2
  const length = Math.ceil(duration * sr)
  const left = new Float32Array(length),
    right = new Float32Array(length)
  const tune = 2 ** ((spec.cents ?? 0) / 1200)
  const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12) * tune
  const rand = noiseSource(spec.bpm * 1000 + spec.root * 10 + pickup)

  // Chord roots (scale degrees in semitones) per bar, looping every 4 bars.
  const progression =
    spec.mode === "minor"
      ? [
          [0, 3, 7],
          [8, 0, 3],
          [3, 7, 10],
          [10, 2, 5],
        ] // i – VI – III – VII
      : [
          [0, 4, 7],
          [7, 11, 2],
          [9, 0, 4],
          [5, 9, 0],
        ] // I – V – vi – IV

  const add = (
    at: number,
    seconds: number,
    voice: (t: number, i: number) => number,
    pan = 0
  ) => {
    const from = Math.max(0, Math.floor(at * sr)),
      to = Math.min(length, Math.floor((at + seconds) * sr))
    const l = Math.cos(((pan + 1) * Math.PI) / 4),
      r = Math.sin(((pan + 1) * Math.PI) / 4)
    for (let i = from; i < to; i++) {
      const v = voice((i - from) / sr, i)
      left[i] += v * l
      right[i] += v * r
    }
  }
  const kick = (at: number, level = 0.9) =>
    add(at, 0.3, (t) => {
      const f = 45 + 75 * Math.exp(-t * 30)
      return level * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9)
    })
  const hat = (at: number, level = 0.12) => {
    let prev = 0
    add(
      at,
      0.05,
      () => {
        const n = rand(),
          v = n - prev
        prev = n
        return v * level
      },
      0.2
    )
  }
  const snare = (at: number, level = 0.25) =>
    add(at, 0.14, (t) => rand() * level * Math.exp(-t * 25), -0.1)
  const tone = (
    at: number,
    seconds: number,
    midi: number,
    level: number,
    harmonics: number,
    attack: number,
    pan = 0
  ) => {
    const f = hz(midi)
    add(
      at,
      seconds,
      (t) => {
        let v = 0
        for (let h = 1; h <= harmonics; h++)
          v += Math.sin(2 * Math.PI * f * h * t) / h
        const env = Math.min(1, t / attack) * Math.min(1, (seconds - t) / 0.02)
        return v * level * env
      },
      pan
    )
  }

  // Lead-in: off-beat hats only.
  for (let k = 0; k < pickup; k++) hat(start - (pickup - k) * beat + beat / 2)

  const sections: SynthTruth["sections"] = []
  const downbeats: number[] = [],
    beats: number[] = []
  let barIndex = 0
  const tonic = 48 + spec.root // C3-based
  for (const section of layout) {
    const sectionStart = start + barIndex * bar
    sections.push({
      label: section.label,
      start: sectionStart,
      end: sectionStart + section.bars * bar,
    })
    for (let b = 0; b < section.bars; b++, barIndex++) {
      const t0 = start + barIndex * bar
      downbeats.push(t0)
      const chord = progression[barIndex % 4]
      const drums = section.label !== "breakdown"
      const full = section.label === "drop"
      for (let q = 0; q < 4; q++) {
        const t = t0 + q * beat
        beats.push(t)
        if (drums && section.label !== "build") kick(t, q === 0 ? 1 : 0.85)
        if (drums) hat(t + beat / 2)
        if (full && (q === 1 || q === 3)) snare(t)
      }
      if (section.label === "build") {
        // Snare roll speeding up and a rising noise sweep.
        const hits = 4 * (1 + (b % 4))
        for (let k = 0; k < hits; k++)
          snare(t0 + (k * bar) / hits, 0.1 + 0.05 * (b % 4))
        add(t0, bar, (t) => rand() * 0.04 * ((b * bar + t) / (4 * bar)), 0)
      }
      // Bass: chord root in octave 2, eighth notes, in drops only.
      if (full)
        for (let e = 0; e < 8; e++)
          tone(
            t0 + (e * beat) / 2,
            beat / 2 - 0.01,
            tonic - 12 + chord[0],
            0.28,
            6,
            0.005
          )
      // Pad: the triad, sustained for the bar, in drops, breakdown and build.
      if (section.label !== "intro" && section.label !== "outro")
        chord.forEach((degree, n) =>
          tone(
            t0,
            bar,
            tonic + 12 + degree,
            0.06,
            4,
            0.2,
            n === 1 ? 0 : n === 0 ? -0.5 : 0.5
          )
        )
      // Lead: 16th-note arpeggio of chord tones in drops and breakdown.
      if (full || section.label === "breakdown")
        for (let s = 0; s < 16; s++)
          tone(
            t0 + (s * beat) / 4,
            beat / 4 - 0.01,
            tonic + 24 + chord[s % 3] + (s % 6 === 5 ? 12 : 0),
            0.05,
            2,
            0.004
          )
    }
  }
  // Normalize to −1 dBFS.
  let peak = 1e-9
  for (let i = 0; i < length; i++)
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
  const gain = 0.89 / peak
  for (let i = 0; i < length; i++) {
    left[i] *= gain
    right[i] *= gain
  }
  const truth: SynthTruth = {
    bpm: spec.bpm,
    beats,
    downbeats,
    key: {
      root: spec.root,
      mode: spec.mode,
      camelot: camelotOf(spec.root, spec.mode),
    },
    boundaries: sections.slice(1).map((s) => s.start),
    sections,
  }
  return { channels: [left, right], sampleRate: sr, truth }
}

/** The standard bench set: tempos and keys across dance styles. */
export const benchSpecs: SynthSpec[] = [
  { name: "house-124-Am", bpm: 124, root: 9, mode: "minor", pickup: 2 },
  { name: "house-126-F", bpm: 126, root: 5, mode: "major", pickup: 1 },
  { name: "techno-128-Fm", bpm: 128, root: 5, mode: "minor", pickup: 3 },
  { name: "techno-132-Dm", bpm: 132, root: 2, mode: "minor", pickup: 2 },
  { name: "trance-138-Gm", bpm: 138, root: 7, mode: "minor", pickup: 1 },
  { name: "edm-128-C", bpm: 128, root: 0, mode: "major", pickup: 2 },
  { name: "dnb-174-Em", bpm: 174, root: 4, mode: "minor", pickup: 3 },
  { name: "hiphop-92-Bbm", bpm: 92, root: 10, mode: "minor", pickup: 1 },
  { name: "pop-104-D", bpm: 104, root: 2, mode: "major", pickup: 2 },
  { name: "dubstep-140-C#m", bpm: 140, root: 1, mode: "minor", pickup: 2 },
  {
    name: "house-122-Ebm-sharp",
    bpm: 122,
    root: 3,
    mode: "minor",
    pickup: 2,
    cents: 35,
  },
  {
    name: "house-125-G-flat",
    bpm: 125,
    root: 7,
    mode: "major",
    pickup: 3,
    cents: -30,
  },
]
