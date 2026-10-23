import { fft } from "./structure"

/**
 * Beat and downbeat tracking with the Beat This! model (MIT, CPJKU).
 * This file holds the model's exact input and output handling:
 * - input: 22 050 Hz mono log-mel spectrogram, 1024-point STFT, hop 441
 *   (50 frames/s), 128 Slaney mel bands from 30 Hz to 11 kHz, magnitude
 *   divided by √1024, then log1p(1000·x);
 * - long tracks run in overlapping chunks, earlier chunks winning where
 *   they overlap (upstream `split_piece` / `aggregate_prediction`,
 *   `keep_first`). Upstream uses 1500-frame chunks; the published ONNX
 *   exports were traced at about 300 frames and go silent after frame
 *   ~285, so chunks here are 280 frames with 20-frame borders (measured by
 *   `pnpm bench:analysis`);
 * - output: peaks of the beat and downbeat logits above 0 (±3 frames),
 *   with downbeats snapped to the nearest beat.
 */
export const FPS = 50
const SR = 22050,
  N_FFT = 1024,
  HOP = 441,
  MELS = 128,
  CHUNK = 280,
  BORDER = 20

/** Run one spectrogram chunk [frames × 128] through the model. */
export type BeatModelRun = (
  spect: Float32Array,
  frames: number
) => Promise<{ beat: Float32Array; downbeat: Float32Array }>

/** Slaney mel filterbank (513 bins → 128 bands), as torchaudio builds it. */
function melFilterbank() {
  const fsp = 200 / 3,
    minLogHz = 1000,
    minLogMel = minLogHz / fsp,
    step = Math.log(6.4) / 27
  const toMel = (f: number) =>
    f < minLogHz ? f / fsp : minLogMel + Math.log(f / minLogHz) / step
  const toHz = (m: number) =>
    m < minLogMel ? m * fsp : minLogHz * Math.exp(step * (m - minLogMel))
  const bins = N_FFT / 2 + 1,
    low = toMel(30),
    high = toMel(11000)
  const points = Array.from({ length: MELS + 2 }, (_, i) =>
    toHz(low + ((high - low) * i) / (MELS + 1))
  )
  // Each band as its non-zero (bin, weight) pairs: about 1 000 weights in
  // all instead of a 513 × 128 matrix multiply per frame.
  return Array.from({ length: MELS }, (_, m) => {
    const weights: [number, number][] = []
    for (let f = 0; f < bins; f++) {
      const hz = (f * SR) / 2 / (bins - 1)
      const rise = (hz - points[m]) / (points[m + 1] - points[m]),
        fall = (points[m + 2] - hz) / (points[m + 2] - points[m + 1])
      const weight = Math.min(rise, fall)
      if (weight > 0) weights.push([f, weight])
    }
    return weights
  })
}

/** Mono at 22 050 Hz: channel mean, then linear resampling. */
function monoAt22k(channels: Float32Array[], sampleRate: number) {
  const length = channels[0]?.length ?? 0
  const mono = new Float32Array(length)
  for (const channel of channels)
    for (let i = 0; i < length; i++) mono[i] += channel[i] / channels.length
  if (sampleRate === SR) return mono
  if (sampleRate === SR * 2) {
    const out = new Float32Array(Math.floor(length / 2))
    for (let i = 0; i < out.length; i++)
      out[i] = (mono[2 * i] + mono[2 * i + 1]) / 2
    return out
  }
  const ratio = sampleRate / SR,
    out = new Float32Array(Math.floor(length / ratio))
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio,
      j = Math.floor(x)
    out[i] = mono[j] + ((mono[j + 1] ?? mono[j]) - mono[j]) * (x - j)
  }
  return out
}

/** The model's log-mel spectrogram, row-major [frames × 128]. */
export function logMelSpectrogram(
  channels: Float32Array[],
  sampleRate: number
) {
  const audio = monoAt22k(channels, sampleRate)
  const frames = Math.floor(audio.length / HOP) + 1
  const bank = melFilterbank()
  const window = Float64Array.from(
    { length: N_FFT },
    (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N_FFT)
  )
  const pad = N_FFT / 2
  // centre=True with reflect padding.
  const sample = (i: number) => {
    let j = i - pad
    if (j < 0) j = -j
    if (j >= audio.length) j = 2 * (audio.length - 1) - j
    return audio[Math.max(0, Math.min(audio.length - 1, j))]
  }
  const re = new Float64Array(N_FFT),
    im = new Float64Array(N_FFT),
    magnitude = new Float64Array(N_FFT / 2 + 1)
  const spect = new Float32Array(frames * MELS)
  const scale = 1 / Math.sqrt(N_FFT)
  for (let f = 0; f < frames; f++) {
    const start = f * HOP
    for (let n = 0; n < N_FFT; n++) {
      re[n] = sample(start + n) * window[n]
      im[n] = 0
    }
    fft(re, im)
    for (let k = 0; k <= N_FFT / 2; k++)
      magnitude[k] = Math.hypot(re[k], im[k]) * scale
    for (let m = 0; m < MELS; m++) {
      let sum = 0
      for (const [k, weight] of bank[m]) sum += magnitude[k] * weight
      spect[f * MELS + m] = Math.log1p(1000 * sum)
    }
  }
  return { spect, frames }
}

/** Frame logits for a whole track, chunked like upstream `keep_first`. */
export async function trackLogits(
  spect: Float32Array,
  frames: number,
  run: BeatModelRun
) {
  const starts: number[] = []
  for (let s = -BORDER; s < frames - BORDER; s += CHUNK - 2 * BORDER)
    starts.push(s)
  if (frames > CHUNK - 2 * BORDER)
    starts[starts.length - 1] = frames - (CHUNK - BORDER)
  const beat = new Float32Array(frames).fill(-1000),
    downbeat = new Float32Array(frames).fill(-1000)
  // Later chunks first, so earlier chunks overwrite the overlaps.
  for (const start of [...starts].reverse()) {
    const from = Math.max(start, 0),
      to = Math.min(start + CHUNK, frames)
    const left = Math.max(0, -start),
      right = Math.max(0, Math.min(BORDER, start + CHUNK - frames))
    const length = left + (to - from) + right
    const chunk = new Float32Array(length * MELS)
    chunk.set(spect.subarray(from * MELS, to * MELS), left * MELS)
    const out = await run(chunk, length)
    for (let i = BORDER; i < length - BORDER; i++) {
      const frame = start + i
      if (frame < 0 || frame >= frames) continue
      beat[frame] = out.beat[i]
      downbeat[frame] = out.downbeat[i]
    }
  }
  return { beat, downbeat }
}

/** Logit peaks above 0 within ±3 frames, adjacent frames merged, in
 * seconds, refined between frames by a parabola through the peak. */
function peaks(logits: Float32Array) {
  const found: number[] = []
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] <= 0) continue
    let isMax = true
    for (let k = -3; k <= 3 && isMax; k++)
      if ((logits[i + k] ?? -Infinity) > logits[i]) isMax = false
    if (isMax) found.push(i)
  }
  const merged: number[] = []
  for (let i = 0; i < found.length;) {
    let j = i
    while (j + 1 < found.length && found[j + 1] - found[j] <= 1) j++
    const centre = Math.round((found[i] + found[j]) / 2)
    const a = logits[centre - 1] ?? logits[centre],
      b = logits[centre],
      c = logits[centre + 1] ?? logits[centre]
    const denominator = a - 2 * b + c
    const offset = denominator < 0 ? (0.5 * (a - c)) / denominator : 0
    merged.push(centre + Math.max(-0.5, Math.min(0.5, offset)))
    i = j + 1
  }
  return merged.map((frame) => frame / FPS)
}

/** Beats and downbeats (seconds) from frame logits. */
export function decodeBeats(beat: Float32Array, downbeat: Float32Array) {
  const beats = peaks(beat)
  const downbeats = [
    ...new Set(
      peaks(downbeat).map((t) =>
        beats.reduce(
          (best, b) => (Math.abs(b - t) < Math.abs(best - t) ? b : best),
          beats[0] ?? t
        )
      )
    ),
  ].sort((a, b) => a - b)
  return {
    beats: beats.map((t) => Math.round(t * 1000) / 1000),
    downbeats: downbeats.map((t) => Math.round(t * 1000) / 1000),
  }
}

/** Beat and downbeat times for decoded audio. */
export async function trackBeats(
  channels: Float32Array[],
  sampleRate: number,
  run: BeatModelRun
) {
  const { spect, frames } = logMelSpectrogram(channels, sampleRate)
  const logits = await trackLogits(spect, frames, run)
  return decodeBeats(logits.beat, logits.downbeat)
}
