import type { WaveBands } from "./types"

// 20 ms windows preserve transients when zoomed; long tracks are bounded.
function windowStep(length: number, sampleRate: number) {
  return Math.max(1, Math.ceil(length / 32768), Math.round(sampleRate * 0.02))
}

export function measurePeaks(channels: Float32Array[], sampleRate: number) {
  const length = channels[0]?.length ?? 0
  const step = windowStep(length, sampleRate)
  const peaks: number[] = []
  for (let i = 0; i < length; i += step) {
    let peak = 0
    for (const channel of channels)
      for (let j = i; j < Math.min(i + step, length); j++)
        peak = Math.max(peak, Math.abs(channel[j]))
    peaks.push(peak)
  }
  return peaks
}

export function waveformPath(
  peaks: number[],
  fullDuration: number,
  start: number,
  end: number,
  height: number
) {
  if (!peaks.length || end <= start) return ""
  const first = Math.max(0, Math.floor((start / fullDuration) * peaks.length))
  const last = Math.min(
    peaks.length,
    Math.ceil((end / fullDuration) * peaks.length)
  )
  const bin = Math.max(1, Math.ceil((last - first) / 640))
  const width = Math.max(
    0.7,
    ((bin * fullDuration) / peaks.length / (end - start)) * 800 - 0.7
  )
  const path: string[] = []
  for (let i = first; i < last; i += bin) {
    let peak = 0
    for (let j = i; j < Math.min(last, i + bin); j++)
      peak = Math.max(peak, peaks[j])
    const x =
      (((i / peaks.length) * fullDuration - start) / (end - start)) * 800
    const h = Math.max(2, peak * (height - 15)),
      y = (height - h) / 2
    path.push(
      `M${x.toFixed(2)},${y.toFixed(2)}h${width.toFixed(2)}v${h.toFixed(2)}h-${width.toFixed(2)}Z`
    )
  }
  return path.join("")
}

const LOW_HZ = 180,
  HIGH_HZ = 2500

/** Butterworth biquad (RBJ cookbook), transposed direct form II. */
function biquad(kind: "low" | "high", hz: number, sampleRate: number) {
  const w = (2 * Math.PI * hz) / sampleRate,
    cos = Math.cos(w),
    alpha = Math.sin(w) / Math.SQRT2,
    a0 = 1 + alpha
  const edge = kind === "low" ? (1 - cos) / 2 : (1 + cos) / 2
  const b0 = edge / a0,
    b1 = (kind === "low" ? 1 - cos : -(1 + cos)) / a0,
    b2 = b0,
    a1 = (-2 * cos) / a0,
    a2 = (1 - alpha) / a0
  let z1 = 0,
    z2 = 0
  return (input: number) => {
    const output = b0 * input + z1
    z1 = b1 * input - a1 * output + z2
    z2 = b2 * input - a2 * output
    return output
  }
}

/** RMS per window for the full signal and three bands, aligned with
 * measurePeaks: low < 180 Hz, mid 180–2500 Hz, high > 2500 Hz. Cascaded
 * biquads give 24 dB/octave edges so a kick does not light up the mids. */
export function measureBands(
  channels: Float32Array[],
  sampleRate: number
): WaveBands {
  const length = channels[0]?.length ?? 0
  const step = windowStep(length, sampleRate)
  const low = [
      biquad("low", LOW_HZ, sampleRate),
      biquad("low", LOW_HZ, sampleRate),
    ],
    mid = [
      biquad("high", LOW_HZ, sampleRate),
      biquad("high", LOW_HZ, sampleRate),
      biquad("low", HIGH_HZ, sampleRate),
      biquad("low", HIGH_HZ, sampleRate),
    ],
    high = [
      biquad("high", HIGH_HZ, sampleRate),
      biquad("high", HIGH_HZ, sampleRate),
    ]
  const run = (filters: ((input: number) => number)[], input: number) => {
    for (const filter of filters) input = filter(input)
    return input
  }
  const bands: WaveBands = { rms: [], low: [], mid: [], high: [] }
  const round = (value: number) => Math.round(value * 1000) / 1000
  for (let i = 0; i < length; i += step) {
    const end = Math.min(i + step, length)
    let full = 0,
      lowSum = 0,
      midSum = 0,
      highSum = 0
    for (let j = i; j < end; j++) {
      let sample = 0
      for (const channel of channels) sample += channel[j]
      sample /= channels.length
      const lowBand = run(low, sample),
        midBand = run(mid, sample),
        highBand = run(high, sample)
      full += sample * sample
      lowSum += lowBand * lowBand
      midSum += midBand * midBand
      highSum += highBand * highBand
    }
    const count = Math.max(1, end - i)
    bands.rms.push(round(Math.sqrt(full / count)))
    bands.low.push(round(Math.sqrt(lowSum / count)))
    bands.mid.push(round(Math.sqrt(midSum / count)))
    bands.high.push(round(Math.sqrt(highSum / count)))
  }
  return bands
}

const scales = new WeakMap<WaveBands, [number, number, number, number]>()
/** 99th-percentile level per band, so one spike cannot flatten a track. */
export function bandScale(bands: WaveBands) {
  let scale = scales.get(bands)
  if (!scale) {
    const percentile = (values: number[]) => {
      const sample = values.filter((_, i) => i % 4 === 0).sort((a, b) => a - b)
      return Math.max(0.0001, sample[Math.floor(sample.length * 0.99)] ?? 0)
    }
    scale = [
      percentile(bands.rms),
      percentile(bands.low),
      percentile(bands.mid),
      percentile(bands.high),
    ]
    scales.set(bands, scale)
  }
  return scale
}

export type WaveColumn = {
  peak: number
  rms: number
  low: number
  mid: number
  high: number
}

/** Aggregate windows into one column per pixel for a time range. Columns
 * outside the track are null; levels are normalized to 0–1. */
export function waveColumns(
  peaks: number[],
  bands: WaveBands | undefined,
  duration: number,
  start: number,
  end: number,
  columns: number
): (WaveColumn | null)[] {
  const result: (WaveColumn | null)[] = []
  if (!peaks.length || duration <= 0 || end <= start || columns < 1)
    return result
  const perSecond = peaks.length / duration,
    span = (end - start) / columns
  const scale = bands ? bandScale(bands) : null
  for (let column = 0; column < columns; column++) {
    const t0 = start + column * span
    if (t0 + span <= 0 || t0 >= duration) {
      result.push(null)
      continue
    }
    const first = Math.max(0, Math.floor(t0 * perSecond)),
      last = Math.min(
        peaks.length,
        Math.max(first + 1, Math.ceil((t0 + span) * perSecond))
      )
    let peak = 0,
      rms = 0,
      low = 0,
      mid = 0,
      high = 0
    for (let i = first; i < last; i++) {
      peak = Math.max(peak, peaks[i])
      if (bands && scale) {
        rms += bands.rms[i] / scale[0]
        low += bands.low[i] / scale[1]
        mid += bands.mid[i] / scale[2]
        high += bands.high[i] / scale[3]
      }
    }
    // Peaks keep the loudest window; band levels average so zoomed-out
    // columns show the mix instead of saturating on any one transient.
    const windows = last - first
    rms /= windows
    low /= windows
    mid /= windows
    high /= windows
    result.push({
      peak: Math.min(1, peak),
      rms: Math.min(1, bands ? rms : peak * 0.6),
      low: Math.min(1, low),
      mid: Math.min(1, mid),
      high: Math.min(1, high),
    })
  }
  return result
}
