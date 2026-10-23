import type { WaveBands } from "./types"

/**
 * Track structure for transition planning:
 * - `vocals`: per-second presence (0–1) of a foreground voice or lead melody.
 *   Heuristic, no model: centered in the stereo field, tonal (not noisy),
 *   in the 200–4000 Hz voice band, with syllable-like level changes.
 * - `sections`: times (s) where the arrangement changes, on the bar grid.
 * - `phraseOffset`: where 16-bar phrases start, aligned to those changes
 *   instead of assuming the first detected beat is a phrase start.
 */
export type TrackStructure = {
  vocals: number[]
  sections: number[]
  phraseOffset: number
}

const FRAME = 2048

/** Bump when vocal detection changes so saved tracks are re-measured. */
export const VOCALS_VERSION = 2

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size
    for (let start = 0; start < n; start += size)
      for (let k = 0; k < size / 2; k++) {
        const cos = Math.cos(step * k),
          sin = Math.sin(step * k),
          a = start + k,
          b = a + size / 2
        const tr = re[b] * cos - im[b] * sin,
          ti = re[b] * sin + im[b] * cos
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
  }
}

const ramp = (value: number, low: number, high: number) =>
  Math.min(1, Math.max(0, (value - low) / (high - low)))

/** Per-second vocal/lead presence, 0–1. */
export function vocalPresence(channels: Float32Array[], sampleRate: number) {
  const left = channels[0],
    right = channels[1] ?? channels[0],
    stereo = channels.length > 1
  const length = channels.length ? left.length : 0
  // Analyze every other frame: ~10 frames per second is plenty for stats.
  const hop = FRAME * 2
  const window = Float64Array.from(
    { length: FRAME },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1))
  )
  const lowBin = Math.ceil((200 * FRAME) / sampleRate),
    highBin = Math.floor((4000 * FRAME) / sampleRate)
  const frames: {
    time: number
    center: number
    side: number
    total: number
    flatness: number
  }[] = []
  const re = new Float64Array(FRAME),
    im = new Float64Array(FRAME)
  for (let start = 0; start + FRAME <= length; start += hop) {
    // One complex FFT carries both the center (L+R) and side (L−R) signals.
    for (let i = 0; i < FRAME; i++) {
      const l = left[start + i],
        r = right[start + i]
      re[i] = ((l + r) / 2) * window[i]
      im[i] = ((l - r) / 2) * window[i]
    }
    fft(re, im)
    let center = 0,
      side = 0,
      total = 0,
      logSum = 0,
      linearSum = 0,
      count = 0
    for (let k = 1; k < FRAME / 2; k++) {
      const mirror = FRAME - k
      const cr = (re[k] + re[mirror]) / 2,
        ci = (im[k] - im[mirror]) / 2,
        sr = (im[k] + im[mirror]) / 2,
        si = (re[mirror] - re[k]) / 2
      const c = cr * cr + ci * ci,
        s = sr * sr + si * si
      total += c
      if (k < lowBin || k > highBin) continue
      center += c
      side += s
      logSum += Math.log(c + 1e-12)
      linearSum += c
      count++
    }
    const flatness = count
      ? Math.exp(logSum / count) / (linearSum / count + 1e-12)
      : 1
    frames.push({ time: start / sampleRate, center, side, total, flatness })
  }
  const seconds = Math.ceil(length / sampleRate)
  const peak = Math.max(1e-9, ...frames.map((frame) => frame.total))
  const raw: number[] = []
  const features: {
    second: number
    centered: number
    tonal: number
    share: number
    swing: number
  }[] = []
  for (let second = 0; second < seconds; second++) {
    const inside = frames.filter(
      (frame) => frame.time >= second && frame.time < second + 1
    )
    const total = inside.reduce((sum, f) => sum + f.total, 0)
    if (!inside.length || total / inside.length < peak * 1e-4) {
      raw.push(0)
      continue
    }
    const center = inside.reduce((sum, f) => sum + f.center, 0),
      side = inside.reduce((sum, f) => sum + f.side, 0)
    const tonal =
      1 - inside.reduce((sum, f) => sum + f.flatness, 0) / inside.length
    // Level swing (syllables) over tonal or quiet frames only: loud noisy
    // frames are drum hits, whose rhythm would otherwise look like speech.
    const loudest = Math.max(...inside.map((f) => f.center)),
      cleanest = Math.min(...inside.map((f) => f.flatness))
    // A frame is a hit when it is clearly noisier than this second's
    // cleanest frame (claps, snares and noise sweeps over a tonal bed).
    const voiced = inside.filter(
      (f) =>
        f.center < loudest * 0.05 || f.flatness <= Math.max(0.12, cleanest * 3)
    )
    const levels = (voiced.length >= 3 ? voiced : inside).map((f) =>
      Math.log10(f.center + loudest * 1e-4 + 1e-12)
    )
    const mean = levels.reduce((sum, v) => sum + v, 0) / levels.length
    const swing = Math.sqrt(
      levels.reduce((sum, v) => sum + (v - mean) ** 2, 0) / levels.length
    )
    features.push({
      second,
      centered: center / (center + side + 1e-12),
      tonal,
      share: center / (total + 1e-12),
      swing,
    })
    raw.push(0)
  }
  // Score against this track's own accompaniment. A voice pulls the voice
  // band toward the centre compared with the track's typical stereo spread
  // (its median second); fixed thresholds missed voices over dense drums.
  // Tested by mixing speech into instrumentals: about 80% of vocal seconds
  // found, against about 50% before, at a similar false-alarm rate.
  const median = (values: number[]) =>
    [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)] ?? 0
  const live = features.filter((f) => f.share > 0)
  const baseCentered = median(live.map((f) => f.centered)),
    baseShare = median(live.map((f) => f.share))
  // Mono files carry no stereo cue: tone, voice-band share and syllables.
  const stereoCue = stereo && baseCentered < 0.95
  for (const f of features) {
    const classic =
      ramp(f.tonal, 0.55, 0.85) *
      ramp(f.share, 0.15, 0.45) *
      ramp(f.swing, 0.06, 0.22)
    if (!stereoCue) {
      raw[f.second] = classic
      continue
    }
    const lift = (f.centered - baseCentered) / Math.max(0.05, 1 - baseCentered)
    raw[f.second] = Math.max(
      ramp(lift, 0.3, 0.7) *
        (0.6 + 0.4 * ramp(f.tonal, 0.4, 0.75)) *
        ramp(f.share / (baseShare + 1e-12), 0.5, 0.9),
      classic * ramp(lift, 0.1, 0.4)
    )
  }
  // A 3-second median removes one-off blips from fills and FX.
  return raw.map((_, i) => {
    const near = raw.slice(Math.max(0, i - 1), i + 2).sort((a, b) => a - b)
    return Math.round(near[Math.floor(near.length / 2)] * 100) / 100
  })
}

/**
 * Bar-level novelty from band levels and vocals; the 16-bar phrase phase that
 * best lines up with those changes; and the strongest change points.
 */
export function phraseStructure(
  bands: WaveBands,
  vocals: number[],
  duration: number,
  bpm: number | null,
  beatOffset: number
): Omit<TrackStructure, "vocals"> {
  if (!bpm || !bands.rms.length || duration <= 0)
    return { sections: [], phraseOffset: beatOffset }
  const bar = (60 / bpm) * 4
  const perSecond = bands.rms.length / duration
  const level = (values: number[], from: number, to: number) => {
    const a = Math.max(0, Math.floor(from * perSecond)),
      b = Math.min(values.length, Math.ceil(to * perSecond))
    let sum = 0
    for (let i = a; i < b; i++) sum += values[i]
    return b > a ? sum / (b - a) : 0
  }
  const scale = (values: number[]) =>
    Math.max(
      1e-6,
      [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ?? 0
    )
  const scales = [scale(bands.low), scale(bands.mid), scale(bands.high)]
  const bars: number[][] = []
  for (let t = beatOffset; t + bar <= duration; t += bar)
    bars.push([
      level(bands.low, t, t + bar) / scales[0],
      level(bands.mid, t, t + bar) / scales[1],
      level(bands.high, t, t + bar) / scales[2],
      level(vocals, t, t + bar) * 1.5,
    ])
  const span = 4
  const novelty = bars.map((_, index) => {
    if (index < span || index + span > bars.length) return 0
    let distance = 0
    for (let feature = 0; feature < 4; feature++) {
      let before = 0,
        after = 0
      for (let k = 0; k < span; k++) {
        before += bars[index - 1 - k][feature]
        after += bars[index + k][feature]
      }
      distance += Math.abs(after - before) / span
    }
    return distance
  })
  // Phrase phase: the bar shift (0–15) whose 16-bar lines catch most change.
  let shift = 0,
    best = -Infinity
  for (let candidate = 0; candidate < 16; candidate++) {
    let sum = 0,
      count = 0
    for (let index = candidate; index < novelty.length; index += 16) {
      sum += novelty[index]
      count++
    }
    const score = count ? sum / count : 0
    if (score > best + 1e-9) {
      best = score
      shift = candidate
    }
  }
  let phraseOffset = beatOffset + shift * bar
  while (phraseOffset - bar * 16 >= 0) phraseOffset -= bar * 16
  const mean =
    novelty.reduce((sum, v) => sum + v, 0) / Math.max(1, novelty.length)
  const deviation = Math.sqrt(
    novelty.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
      Math.max(1, novelty.length)
  )
  const sections = novelty
    .map((value, index) => ({ value, index }))
    .filter(
      ({ value, index }) =>
        value > mean + deviation &&
        value >= (novelty[index - 1] ?? 0) &&
        value >= (novelty[index + 1] ?? 0)
    )
    // Arrangement changes land on 4-bar lines relative to the phrase grid.
    .map(({ index }) => {
      const phraseBars = Math.round((index - shift) / 4) * 4 + shift
      return Math.round((beatOffset + phraseBars * bar) * 100) / 100
    })
    .filter(
      (time, i, all) => time >= 0 && time < duration && all.indexOf(time) === i
    )
  return { sections, phraseOffset: Math.round(phraseOffset * 1000) / 1000 }
}

/** Median of tempo estimates within 4% of each other; null if they disagree. */
export function consensusTempo(estimates: (number | null)[]) {
  const values = estimates.filter((v): v is number => !!v && v > 0)
  if (!values.length) return null
  let bestGroup: number[] = []
  for (const value of values) {
    const group = values.filter((other) => Math.abs(other / value - 1) <= 0.04)
    if (group.length > bestGroup.length) bestGroup = group
  }
  const sorted = [...bestGroup].sort((a, b) => a - b)
  return Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10
}

/**
 * How far the beatgrid can be trusted, 0–1: whether the tempo windows agree
 * and how evenly the detected beats are spaced. Long beatmatched blends need
 * a steady grid; shaky ones should fall back to short or FX exits.
 */
export function gridConfidence(estimates: (number | null)[], beats: number[]) {
  const bpm = consensusTempo(estimates)
  if (!bpm) return 0
  const values = estimates.filter((v): v is number => !!v && v > 0)
  const agreement =
    values.filter((v) => Math.abs(v / bpm - 1) <= 0.015).length /
    Math.max(1, estimates.length)
  const intervals = beats.slice(1).map((beat, i) => beat - beats[i])
  let steadiness = 0.5
  if (intervals.length >= 8) {
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const spread = Math.sqrt(
      intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length
    )
    steadiness = Math.max(0, Math.min(1, 1 - (spread / mean) * 5))
  }
  return Math.round((agreement * 0.5 + steadiness * 0.5) * 100) / 100
}
