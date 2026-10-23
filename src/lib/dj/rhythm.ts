import { fft } from "./structure"

/**
 * Rhythm analysis on an onset-strength envelope (spectral flux):
 * - refine a rough tempo and find the beat phase from the whole track,
 *   not from the first detected onset (which is often an off-beat hat);
 * - pick between tempo octaves using where the kick lands;
 * - choose which beat of the bar is "1" from kick accents and harmony
 *   changes, since chords and basslines change on downbeats.
 */
export type OnsetEnvelope = {
  /** Seconds per envelope frame. */
  hop: number
  /** Time of frame 0's centre: onsets register there, not at its start. */
  start: number
  /** Full-band and low-band (kick/bass) onset strength, ≥ 0. */
  all: Float32Array
  low: Float32Array
}

const FRAME = 1024,
  HOP = 512

export function onsetEnvelope(
  channels: Float32Array[],
  sampleRate: number
): OnsetEnvelope {
  const length = channels[0]?.length ?? 0
  const frames = Math.max(0, Math.floor((length - FRAME) / HOP) + 1)
  const all = new Float32Array(frames),
    low = new Float32Array(frames)
  const window = Float64Array.from(
    { length: FRAME },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1))
  )
  const lowBins = Math.max(2, Math.round((150 * FRAME) / sampleRate))
  const re = new Float64Array(FRAME),
    im = new Float64Array(FRAME)
  let previous = new Float64Array(FRAME / 2)
  let current = new Float64Array(FRAME / 2)
  for (let f = 0; f < frames; f++) {
    const start = f * HOP
    for (let i = 0; i < FRAME; i++) {
      let sum = 0
      for (const channel of channels) sum += channel[start + i] ?? 0
      re[i] = (sum / channels.length) * window[i]
      im[i] = 0
    }
    fft(re, im)
    let fluxAll = 0,
      fluxLow = 0
    for (let bin = 1; bin < FRAME / 2; bin++) {
      // Log magnitude keeps quiet hats and loud kicks on one scale.
      const magnitude = Math.log1p(100 * Math.hypot(re[bin], im[bin]))
      current[bin] = magnitude
      const rise = Math.max(0, magnitude - previous[bin])
      fluxAll += rise
      if (bin <= lowBins) fluxLow += rise
    }
    all[f] = fluxAll
    low[f] = fluxLow
    ;[previous, current] = [current, previous]
  }
  return { hop: HOP / sampleRate, start: FRAME / 2 / sampleRate, all, low }
}

/** Envelope value at a time, linearly interpolated; 0 outside. */
function at(values: Float32Array, hop: number, time: number, start = 0) {
  const x = (time - start) / hop,
    i = Math.floor(x)
  if (i < 0 || i + 1 >= values.length) return 0
  return values[i] + (values[i + 1] - values[i]) * (x - i)
}

/** Strongest onset within ±window seconds of a time. */
function peakNear(
  values: Float32Array,
  hop: number,
  time: number,
  window = 0.035,
  start = 0
) {
  const from = Math.max(0, Math.floor((time - start - window) / hop)),
    to = Math.min(values.length - 1, Math.ceil((time - start + window) / hop))
  let best = 0
  for (let i = from; i <= to; i++) best = Math.max(best, values[i])
  return best
}

/** Sum of onset strength on a beat comb across the whole track. */
function combScore(
  values: Float32Array,
  hop: number,
  period: number,
  phase: number,
  start = 0
) {
  const duration = values.length * hop + start
  let sum = 0,
    count = 0
  for (let t = phase; t < duration; t += period) {
    sum += at(values, hop, t, start)
    count++
  }
  return count ? sum / count : 0
}

/**
 * Refine a rough BPM (±1%) and find the beat phase that lines the comb up
 * with the onsets of the whole track.
 */
export function refineBeat(env: OnsetEnvelope, roughBpm: number) {
  // Hats spread across hundreds of bins and would win a raw sum; scale both
  // bands to their means and weight the kick and bass band double.
  const meanOf = (values: Float32Array) =>
    values.reduce((a, b) => a + b, 0) / Math.max(1, values.length) || 1
  const all = meanOf(env.all),
    low = meanOf(env.low)
  const signal = new Float32Array(env.all.length)
  for (let i = 0; i < signal.length; i++)
    signal[i] = env.all[i] / all + (2 * env.low[i]) / low
  let best = { bpm: roughBpm, phase: 0, score: -Infinity }
  const score = (bpm: number) => {
    const period = 60 / bpm
    let top = { phase: 0, score: -Infinity }
    for (let phase = 0; phase < period; phase += env.hop / 2) {
      const value = combScore(signal, env.hop, period, phase, env.start)
      if (value > top.score) top = { phase, score: value }
    }
    return top
  }
  for (let bpm = roughBpm * 0.99; bpm <= roughBpm * 1.01; bpm += 0.02) {
    const top = score(bpm)
    if (top.score > best.score) best = { bpm, ...top }
  }
  // Most releases sit on a whole BPM: prefer it when it fits almost as well.
  const whole = Math.round(best.bpm)
  if (Math.abs(whole - best.bpm) < 0.15) {
    const top = score(whole)
    if (top.score >= best.score * 0.985) best = { bpm: whole, ...top }
  }
  return { bpm: Math.round(best.bpm * 100) / 100, phase: best.phase }
}

/**
 * Halve a doubled tempo: when kicks land only on every other beat and half
 * the tempo is a common one (70–135 BPM), the music is at half that speed
 * (hats on the off-beats doubled the estimate).
 */
export function correctOctave(env: OnsetEnvelope, bpm: number, phase: number) {
  if (bpm < 150) return { bpm, phase }
  const period = 60 / bpm,
    half = bpm / 2
  if (half < 70 || half > 135) return { bpm, phase }
  const even = combScore(env.low, env.hop, period * 2, phase, env.start),
    odd = combScore(env.low, env.hop, period * 2, phase + period, env.start)
  if (even > odd * 2.2) return { bpm: half, phase }
  if (odd > even * 2.2) return { bpm: half, phase: phase + period }
  return { bpm, phase }
}

/**
 * Which beat of the bar is 1: the phase (0–3) with the strongest kick
 * accents and the most harmony changes. `harmonyChange(t0, t1)` returns
 * how much the harmony between beats differs, 0–1.
 */
export function downbeatPhase(
  env: OnsetEnvelope,
  bpm: number,
  phase: number,
  duration: number,
  harmonyChange?: (time: number) => number
) {
  const beat = 60 / bpm
  const scores = [0, 0, 0, 0],
    kick = [0, 0, 0, 0],
    harmony = [0, 0, 0, 0]
  let index = 0
  for (let t = phase; t < duration - beat; t += beat, index++) {
    kick[index % 4] += peakNear(env.low, env.hop, t, 0.035, env.start)
    if (harmonyChange) harmony[index % 4] += harmonyChange(t)
  }
  const norm = (values: number[]) => {
    const total = values.reduce((a, b) => a + b, 0)
    return values.map((v) => (total > 0 ? v / total : 0.25))
  }
  const k = norm(kick),
    h = norm(harmony)
  for (let p = 0; p < 4; p++) scores[p] = k[p] + 2 * h[p]
  const best = scores.indexOf(Math.max(...scores))
  const sorted = [...scores].sort((a, b) => b - a)
  return {
    /** Time of the first downbeat at or after 0. */
    first: phase + best * beat,
    /** How clearly one phase wins, 0–1. */
    confidence: Math.max(0, Math.min(1, (sorted[0] - sorted[1]) / 0.15)),
  }
}

/** Fraction of grid beats with a real onset nearby: how well the grid fits. */
export function gridFit(env: OnsetEnvelope, bpm: number, phase: number) {
  const beat = 60 / bpm,
    duration = env.all.length * env.hop
  let mean = 0
  for (const value of env.all) mean += value
  mean /= Math.max(1, env.all.length)
  let hits = 0,
    count = 0
  for (let t = phase; t < duration; t += beat, count++)
    if (peakNear(env.all, env.hop, t, 0.03, env.start) > mean * 1.5) hits++
  return count ? hits / count : 0
}

export type BeatGrid = {
  bpm: number
  /** First downbeat (seconds), on the fitted grid. */
  beatOffset: number
  /** The beats fit one tempo within ±20 ms; false for live or drifting tempo. */
  steady: boolean
  /** How well the grid and its downbeats can be trusted, 0–1. */
  confidence: number
}

/**
 * A constant grid fitted to tracked beats: least-squares tempo and phase,
 * the bar phase most downbeats agree on, and how steady the beats are.
 * null when there are too few beats to judge.
 */
export function gridFromBeats(
  beats: number[],
  downbeats: number[]
): BeatGrid | null {
  if (beats.length < 16) return null
  const intervals = beats
    .slice(1)
    .map((b, i) => b - beats[i])
    .sort((a, b) => a - b)
  const median = intervals[Math.floor(intervals.length / 2)]
  if (!(median > 0.25 && median < 1.2)) return null
  // Progressive least-squares fit: fit the first 32 beats, then twice as
  // many, and so on, numbering every beat against the current grid and
  // leaving out beats more than 15% of a beat off it (extra or spurious
  // peaks). Each step's error is small enough that the numbering can't
  // slip by a whole beat.
  let period = median,
    origin = beats[0]
  let used: number[] = []
  for (let span = 32; ; span *= 2) {
    const window = beats.slice(0, Math.min(span, beats.length))
    let sk = 0,
      st = 0,
      skk = 0,
      skt = 0,
      count = 0
    used = []
    for (const t of window) {
      const k = Math.round((t - origin) / period)
      if (Math.abs(t - (origin + k * period)) > period * 0.15) continue
      used.push(t)
      sk += k
      st += t
      skk += k * k
      skt += k * t
      count++
    }
    if (count >= 8) {
      const slope = (count * skt - sk * st) / (count * skk - sk * sk || 1)
      if (slope > 0) {
        origin = (st - slope * sk) / count
        period = slope
      }
    }
    if (window.length === beats.length) break
  }
  let squared = 0
  for (const t of used) {
    const k = Math.round((t - origin) / period)
    squared += (t - (origin + k * period)) ** 2
  }
  const rms = Math.sqrt(squared / Math.max(1, used.length))
  let bpm = 60 / period
  if (Math.abs(bpm - Math.round(bpm)) < 0.05) bpm = Math.round(bpm)
  bpm = Math.round(bpm * 100) / 100
  // Bar phase: which grid beat (mod 4) the downbeats land on.
  const votes = [0, 0, 0, 0]
  for (const t of downbeats) {
    const k = Math.round((t - origin) / period)
    votes[((k % 4) + 4) % 4]++
  }
  const phase = votes.indexOf(Math.max(...votes))
  const agreement = downbeats.length ? votes[phase] / downbeats.length : 0
  const beat = 60 / bpm,
    bar = beat * 4
  let first = origin + phase * period
  first -= Math.floor(first / bar) * bar
  const steady = rms < 0.02
  return {
    bpm,
    beatOffset: Math.round(first * 1000) / 1000,
    steady,
    confidence:
      Math.round((0.6 * Math.max(0, 1 - rms / 0.04) + 0.4 * agreement) * 100) /
      100,
  }
}
