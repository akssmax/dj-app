import { fft } from "./structure"

/**
 * Key and harmony from a chromagram:
 * - the master's tuning is measured from spectral peaks, so a track a
 *   quarter-tone sharp still maps to the right notes;
 * - only spectral peaks count, which keeps drums out of the chroma;
 * - a minor key and its relative major share every note, so the tonic is
 *   read from the chord and bass note that open each 4-bar phrase.
 */
export type Chromagram = {
  /** Seconds per frame. */
  hop: number
  chroma: Float32Array[]
  bass: Float32Array[]
  /** Tuning offset in semitones (−0.5…0.5). */
  tuning: number
}

const N = 4096

const notes = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"]
const wheels = [
  [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1],
  [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10],
]
// Krumhansl–Kessler major and minor key profiles.
const profiles = [
  [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
]

export function chromagram(
  channels: Float32Array[],
  sampleRate: number
): Chromagram {
  // Downsample ×2 by averaging: 4096-point frames then resolve ~5 Hz.
  const length = Math.floor((channels[0]?.length ?? 0) / 2)
  const rate = sampleRate / 2
  const mono = new Float32Array(length)
  for (const channel of channels)
    for (let i = 0; i < length; i++)
      mono[i] +=
        (channel[2 * i] + (channel[2 * i + 1] ?? 0)) / (2 * channels.length)
  const window = Float64Array.from(
    { length: N },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))
  )
  const re = new Float64Array(N),
    im = new Float64Array(N)
  const spectra: { bin: number; magnitude: number }[][] = []
  let tuneX = 0,
    tuneY = 0
  for (let start = 0; start + N <= length; start += N) {
    for (let i = 0; i < N; i++) {
      re[i] = mono[start + i] * window[i]
      im[i] = 0
    }
    fft(re, im)
    const magnitude = new Float64Array(N / 2)
    for (let bin = 1; bin < N / 2; bin++)
      magnitude[bin] = Math.hypot(re[bin], im[bin])
    let mean = 0
    for (let bin = 1; bin < N / 2; bin++) mean += magnitude[bin]
    mean /= N / 2
    // Spectral peaks between 30 Hz and 2.1 kHz, with parabolic interpolation.
    const peaks: { bin: number; magnitude: number }[] = []
    const lo = Math.ceil((30 * N) / rate),
      hi = Math.floor((2100 * N) / rate)
    for (let bin = Math.max(2, lo); bin < hi; bin++) {
      const m = magnitude[bin]
      if (m <= mean * 2 || m < magnitude[bin - 1] || m < magnitude[bin + 1])
        continue
      const a = magnitude[bin - 1],
        c = magnitude[bin + 1]
      const offset = (0.5 * (a - c)) / (a - 2 * m + c || 1)
      const exact = bin + Math.max(-0.5, Math.min(0.5, offset))
      peaks.push({ bin: exact, magnitude: Math.sqrt(m) })
      const frequency = (exact * rate) / N
      if (frequency > 100) {
        const midi = 69 + 12 * Math.log2(frequency / 440)
        const angle = 2 * Math.PI * (midi - Math.round(midi))
        tuneX += Math.cos(angle) * m
        tuneY += Math.sin(angle) * m
      }
    }
    spectra.push(peaks)
  }
  const tuning = Math.atan2(tuneY, tuneX) / (2 * Math.PI)
  const chroma: Float32Array[] = [],
    bass: Float32Array[] = []
  for (const peaks of spectra) {
    const c = new Float32Array(12),
      b = new Float32Array(12)
    const pitchOf = (bin: number) => {
      const midi = 69 + 12 * Math.log2((bin * rate) / N / 440) - tuning
      const pitch = Math.round(midi)
      return {
        pc: ((pitch % 12) + 12) % 12,
        fit: Math.max(0, 1 - 2 * Math.abs(midi - pitch)),
      }
    }
    let bassPeak = 0
    for (const peak of peaks) {
      const frequency = (peak.bin * rate) / N
      if (frequency >= 65) {
        const { pc, fit } = pitchOf(peak.bin)
        // Weight by how close the peak sits to the tempered pitch.
        c[pc] += peak.magnitude * fit
      }
      if (frequency < 200) bassPeak = Math.max(bassPeak, peak.magnitude)
    }
    // The bass note is the lowest strong peak; its overtones (an octave
    // and a fifth up) would otherwise vote for the wrong root.
    const root = peaks.find(
      (peak) => (peak.bin * rate) / N < 200 && peak.magnitude >= bassPeak * 0.4
    )
    if (root) {
      const { pc, fit } = pitchOf(root.bin)
      b[pc] += root.magnitude * fit
    }
    chroma.push(c)
    bass.push(b)
  }
  return { hop: N / rate, chroma, bass, tuning }
}

function sumFrames(frames: Float32Array[], from = 0, to = frames.length) {
  const total = new Float64Array(12)
  for (let f = Math.max(0, from); f < Math.min(frames.length, to); f++)
    for (let k = 0; k < 12; k++) total[k] += frames[f][k]
  return total
}

/** How much the harmony changes at a time: chroma before vs after, 0–1. */
export function harmonyChange(gram: Chromagram, time: number, span: number) {
  const at = Math.round(time / gram.hop),
    width = Math.max(1, Math.round(span / gram.hop))
  const before = sumFrames(gram.chroma, at - width, at),
    after = sumFrames(gram.chroma, at, at + width)
  let dot = 0,
    a = 0,
    b = 0
  for (let k = 0; k < 12; k++) {
    dot += before[k] * after[k]
    a += before[k] ** 2
    b += after[k] ** 2
  }
  return a && b ? 1 - dot / Math.sqrt(a * b) : 0
}

function correlate(chroma: ArrayLike<number>, profile: number[], root: number) {
  let cm = 0,
    pm = 0
  for (let k = 0; k < 12; k++) {
    cm += chroma[k] / 12
    pm += profile[k] / 12
  }
  let dot = 0,
    ca = 0,
    pa = 0
  for (let k = 0; k < 12; k++) {
    const c = chroma[(k + root) % 12] - cm,
      p = profile[k] - pm
    dot += c * p
    ca += c * c
    pa += p * p
  }
  return dot / (Math.sqrt(ca * pa) || 1)
}

export type KeyResult = {
  key: string | null
  camelot: string | null
  confidence: number
}

/**
 * The key of a span of frames. `phraseStarts` are times of bars that start
 * 4-bar phrases; the bass there counts double when choosing between a
 * minor key and its relative major.
 */
export function estimateKey(
  gram: Chromagram,
  from = 0,
  to = gram.chroma.length,
  phraseStarts: number[] = []
): KeyResult {
  const chroma = sumFrames(gram.chroma, from, to)
  const total = chroma.reduce((a, b) => a + b, 0)
  if (total <= 0) return { key: null, camelot: null, confidence: 0 }
  const scores: { score: number; root: number; mode: 0 | 1 }[] = []
  for (const mode of [0, 1] as const)
    for (let root = 0; root < 12; root++)
      scores.push({
        score: correlate(chroma, profiles[mode], root),
        root,
        mode,
      })
  scores.sort((a, b) => b.score - a.score)
  let winner = scores[0]
  if (winner.score < 0.3) return { key: null, camelot: null, confidence: 0 }
  // A major key and its relative minor share every note: let the bass decide.
  const relative =
    winner.mode === 0
      ? { root: (winner.root + 9) % 12, mode: 1 as const }
      : { root: (winner.root + 3) % 12, mode: 0 as const }
  const relativeScore = scores.find(
    (s) => s.root === relative.root && s.mode === relative.mode
  )!
  // Tonic evidence: phrases usually open on the tonic chord. Compare the
  // two candidates' triads at phrase starts, with the bass note there.
  const evidence = (root: number, mode: 0 | 1) => {
    const third = (root + (mode ? 3 : 4)) % 12,
      fifth = (root + 7) % 12
    let support = 0
    for (const time of phraseStarts) {
      const f = Math.round(time / gram.hop)
      if (f < from || f >= to) continue
      const chord = sumFrames(gram.chroma, f, f + 3),
        bass = sumFrames(gram.bass, f, f + 3)
      const sum = chord.reduce((a, b) => a + b, 0) || 1
      const bassSum = bass.reduce((a, b) => a + b, 0) || 1
      support +=
        (chord[root] + chord[third] + chord[fifth]) / sum +
        (0.5 * bass[root]) / bassSum
    }
    return support
  }
  let ambiguous = false
  if (winner.score - relativeScore.score < 0.2) {
    ambiguous = true
    if (
      evidence(relativeScore.root, relativeScore.mode) >
      evidence(winner.root, winner.mode) * 1.05
    )
      winner = relativeScore
  }
  const runnerUp = scores.find(
    (s) =>
      !(s.root === winner.root && s.mode === winner.mode) &&
      !(s.root === relativeScore.root && s.mode === relativeScore.mode) &&
      !(s.root === relative.root && s.mode === relative.mode)
  )!
  const margin = winner.score - runnerUp.score
  const confidence = Math.max(
    0.1,
    Math.min(0.95, (0.35 + margin / 0.2) * (ambiguous ? 0.8 : 1))
  )
  return {
    key: notes[winner.root] + (winner.mode ? "m" : " maj"),
    camelot: `${wheels[winner.mode][winner.root]}${winner.mode ? "A" : "B"}`,
    confidence: Math.round(confidence * 100) / 100,
  }
}

/** Every Camelot key with its musical name, 1A … 12B. */
export const camelotKeys = [0, 1]
  .flatMap((mode) =>
    Array.from({ length: 12 }, (_, i) => {
      const number = i + 1
      const root = wheels[mode].indexOf(number)
      return {
        camelot: `${number}${mode ? "A" : "B"}`,
        name: notes[root] + (mode ? "m" : " maj"),
      }
    })
  )
  .sort(
    (a, b) =>
      parseInt(a.camelot) - parseInt(b.camelot) ||
      a.camelot.localeCompare(b.camelot)
  )
