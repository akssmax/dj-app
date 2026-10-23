import type { StemName } from "./demucs"

/**
 * Stem audio helpers:
 * - per-second stem levels for analysis (vocals, drums, bass, other);
 * - Lanczos resampling (stems are separated at 44.1 kHz, stored as Opus at
 *   48 kHz);
 * - Opus encode/decode with WebCodecs, with the encoder's delay measured by
 *   decoding once and cross-correlating, so stored stems line up with the
 *   original to the sample.
 */
export type StemLevels = Record<StemName, number[]>

/** Per-second RMS of each stem, scaled so the loudest second of the full
 * mix is 1. */
export function stemLevels(
  stems: Record<StemName, Float32Array[]>,
  sampleRate: number
): StemLevels {
  const names = Object.keys(stems) as StemName[]
  const length = stems[names[0]][0].length
  const seconds = Math.ceil(length / sampleRate)
  const rms = (channels: Float32Array[], second: number) => {
    const from = second * sampleRate,
      to = Math.min(length, from + sampleRate)
    let sum = 0
    for (const channel of channels)
      for (let i = from; i < to; i += 4) sum += channel[i] ** 2
    return Math.sqrt(sum / Math.max(1, ((to - from) / 4) * channels.length))
  }
  const mixPeak = Math.max(
    1e-9,
    ...Array.from({ length: seconds }, (_, s) => {
      let sum = 0
      for (const name of names) sum += rms(stems[name], s) ** 2
      return Math.sqrt(sum)
    })
  )
  const levels = {} as StemLevels
  for (const name of names)
    levels[name] = Array.from(
      { length: seconds },
      (_, s) => Math.round((rms(stems[name], s) / mixPeak) * 1000) / 1000
    )
  return levels
}

/** Windowed-sinc (Lanczos, a = 8) resampling of one channel. */
export function resample(signal: Float32Array, from: number, to: number) {
  if (from === to) return signal.slice()
  const ratio = from / to,
    out = new Float32Array(Math.round(signal.length / ratio))
  const a = 8,
    // When downsampling, widen the kernel to filter above the new Nyquist.
    scale = Math.max(1, ratio)
  const sinc = (x: number) =>
    x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
  for (let i = 0; i < out.length; i++) {
    const centre = i * ratio
    const lo = Math.floor(centre - a * scale) + 1,
      hi = Math.floor(centre + a * scale)
    let sum = 0,
      norm = 0
    for (let j = lo; j <= hi; j++) {
      const x = (j - centre) / scale
      const w = sinc(x) * sinc(x / a)
      if (j >= 0 && j < signal.length) sum += signal[j] * w
      norm += w
    }
    out[i] = norm ? sum / norm : 0
  }
  return out
}

export type EncodedStem = {
  channels: number
  sampleRate: number
  /** Samples of encoder delay to skip after decoding. */
  offset: number
  chunks: { data: ArrayBuffer; timestamp: number; key: boolean }[]
}

/**
 * One stem's Opus packets in a single buffer. A track's stems are tens of
 * thousands of small packets; as separate objects they were slow to pass
 * from the worker and to store, stalling the page. Packed, they transfer
 * without a copy and store as one record.
 */
export type PackedStem = {
  channels: number
  sampleRate: number
  offset: number
  data: ArrayBuffer
  sizes: Uint32Array
  timestamps: Float64Array
  keys: Uint8Array
}

export function packStem(stem: EncodedStem): PackedStem {
  const sizes = Uint32Array.from(stem.chunks, (c) => c.data.byteLength)
  const data = new Uint8Array(sizes.reduce((n, size) => n + size, 0))
  let at = 0
  for (const chunk of stem.chunks) {
    data.set(new Uint8Array(chunk.data), at)
    at += chunk.data.byteLength
  }
  return {
    channels: stem.channels,
    sampleRate: stem.sampleRate,
    offset: stem.offset,
    data: data.buffer,
    sizes,
    timestamps: Float64Array.from(stem.chunks, (c) => c.timestamp),
    keys: Uint8Array.from(stem.chunks, (c) => (c.key ? 1 : 0)),
  }
}

export function unpackStem(packed: PackedStem): EncodedStem {
  let at = 0
  return {
    channels: packed.channels,
    sampleRate: packed.sampleRate,
    offset: packed.offset,
    chunks: Array.from(packed.sizes, (size, i) => {
      const data = packed.data.slice(at, at + size)
      at += size
      return { data, timestamp: packed.timestamps[i], key: !!packed.keys[i] }
    }),
  }
}

/** The buffers to transfer when posting a packed stem. */
export const packedBuffers = (packed: PackedStem): ArrayBuffer[] => [
  packed.data,
  packed.sizes.buffer as ArrayBuffer,
  packed.timestamps.buffer as ArrayBuffer,
  packed.keys.buffer as ArrayBuffer,
]

const OPUS_RATE = 48000

export async function opusSupported(channels: number) {
  if (
    typeof AudioEncoder === "undefined" ||
    typeof AudioDecoder === "undefined"
  )
    return false
  const support = await AudioEncoder.isConfigSupported({
    codec: "opus",
    sampleRate: OPUS_RATE,
    numberOfChannels: channels,
    bitrate: channels * 80_000,
  }).catch(() => null)
  return !!support?.supported
}

/** Opus at 48 kHz, 80 kbit/s per channel. Input is at `sampleRate`. */
export async function encodeOpus(
  channels: Float32Array[],
  sampleRate: number
): Promise<EncodedStem> {
  const audio = channels.map((c) => resample(c, sampleRate, OPUS_RATE))
  const chunks: EncodedStem["chunks"] = []
  let failure: unknown
  const encoder = new AudioEncoder({
    output: (chunk) => {
      const data = new ArrayBuffer(chunk.byteLength)
      chunk.copyTo(data)
      chunks.push({
        data,
        timestamp: chunk.timestamp,
        key: chunk.type === "key",
      })
    },
    error: (error) => (failure = error),
  })
  encoder.configure({
    codec: "opus",
    sampleRate: OPUS_RATE,
    numberOfChannels: audio.length,
    bitrate: audio.length * 80_000,
  })
  const frame = 4800
  for (let start = 0; start < audio[0].length; start += frame) {
    const frames = Math.min(frame, audio[0].length - start)
    const planar = new Float32Array(frames * audio.length)
    audio.forEach((channel, c) =>
      planar.set(channel.subarray(start, start + frames), c * frames)
    )
    const data = new AudioData({
      format: "f32-planar",
      sampleRate: OPUS_RATE,
      numberOfFrames: frames,
      numberOfChannels: audio.length,
      timestamp: Math.round((start / OPUS_RATE) * 1e6),
      data: planar,
    })
    encoder.encode(data)
    data.close()
  }
  await encoder.flush()
  encoder.close()
  if (failure) throw failure
  const stem: EncodedStem = {
    channels: audio.length,
    sampleRate: OPUS_RATE,
    offset: 0,
    chunks,
  }
  // Measure the encoder delay on the first 3 s against the input.
  const decoded = await decodeOpus({ ...stem, offset: 0 })
  stem.offset = alignment(audio[0], decoded[0], 4000, OPUS_RATE * 3)
  return stem
}

/** Decoded channels at 48 kHz, with the encoder delay removed. */
export async function decodeOpus(stem: EncodedStem): Promise<Float32Array[]> {
  const parts: Float32Array[][] = Array.from(
    { length: stem.channels },
    () => []
  )
  let failure: unknown
  const decoder = new AudioDecoder({
    output: (data) => {
      for (let c = 0; c < stem.channels; c++) {
        const plane = new Float32Array(data.numberOfFrames)
        data.copyTo(plane, { planeIndex: c, format: "f32-planar" })
        parts[c].push(plane)
      }
      data.close()
    },
    error: (error) => (failure = error),
  })
  decoder.configure({
    codec: "opus",
    sampleRate: stem.sampleRate,
    numberOfChannels: stem.channels,
  })
  for (const chunk of stem.chunks)
    decoder.decode(
      new EncodedAudioChunk({
        type: chunk.key ? "key" : "delta",
        timestamp: chunk.timestamp,
        data: chunk.data,
      })
    )
  await decoder.flush()
  decoder.close()
  if (failure) throw failure
  return parts.map((list) => {
    const total = list.reduce((n, p) => n + p.length, 0)
    const joined = new Float32Array(total)
    let at = 0
    for (const part of list) {
      joined.set(part, at)
      at += part.length
    }
    return joined.subarray(stem.offset)
  })
}

/** Lag (0…maxLag samples) at which `delayed` best matches `reference`. */
export function alignment(
  reference: Float32Array,
  delayed: Float32Array,
  maxLag: number,
  window: number
) {
  let best = 0,
    bestScore = -Infinity
  const n = Math.min(window, reference.length, delayed.length - maxLag)
  for (let lag = 0; lag <= maxLag; lag++) {
    let score = 0
    for (let i = 0; i < n; i += 2) score += reference[i] * delayed[i + lag]
    if (score > bestScore) {
      bestScore = score
      best = lag
    }
  }
  return best
}
