import { fft } from "./structure"

/**
 * Stem separation with Hybrid Transformer Demucs (htdemucs, MIT, Meta AI)
 * exported to ONNX (monteslu/htdemucs-web-onnx, MIT). The graph covers the
 * network; this file reproduces Demucs's own Python around it, so the
 * output matches `demucs.separate`:
 * - whole-track normalisation by the mono mix's mean and deviation;
 * - 7.8 s segments (343 980 samples at 44.1 kHz) with 25% overlap and
 *   triangular cross-fades (`apply_model`, `split=True`, `overlap=0.25`),
 *   short segments padded with real neighbouring audio (`TensorChunk`);
 * - per segment, the complex spectrogram input (`_spec`: 4096-point STFT,
 *   hop 1024, reflect padding, normalised) and, after the network, the
 *   frequency branch turned back into audio (`_mask`, `_ispec`) and added
 *   to the time branch.
 */
export const SAMPLE_RATE = 44100
export const SEGMENT = 343980
const N_FFT = 4096,
  HOP = 1024,
  BINS = 2048,
  FRAMES = Math.ceil(SEGMENT / HOP) // 336
export const SOURCES = ["drums", "bass", "other", "vocals"] as const
export type StemName = (typeof SOURCES)[number]

/** One run of the network on a segment: `mix` [2 × 343 980], `mag`
 * [4 × 2048 × 336] in, `x` [4 × 4 × 2048 × 336] and `xt` [4 × 2 × 343 980]
 * out, all row-major. */
export type StemModelRun = (
  mix: Float32Array,
  mag: Float32Array
) => Promise<{ x: Float32Array; xt: Float32Array }>

const hann = Float64Array.from(
  { length: N_FFT },
  (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N_FFT)
)

/** `_spec` for one channel: [2048 bins × 336 frames] real and imaginary. */
export function spec(signal: Float32Array) {
  // pad1d reflect: 1536 left, 1536 + (336·1024 − L) right.
  const pad = (HOP / 2) * 3,
    right = pad + FRAMES * HOP - signal.length
  const padded = new Float64Array(signal.length + pad + right)
  const reflect = (i: number, n: number) => {
    let j = i
    while (j < 0 || j >= n) j = j < 0 ? -j : 2 * (n - 1) - j
    return j
  }
  for (let i = 0; i < padded.length; i++)
    padded[i] = signal[reflect(i - pad, signal.length)]
  // torch.stft(center=True, reflect), normalized by 1/√4096; keep frames 2…337.
  const centre = N_FFT / 2,
    total = padded.length
  const re = new Float64Array(N_FFT),
    im = new Float64Array(N_FFT)
  const real = new Float32Array(BINS * FRAMES),
    imag = new Float32Array(BINS * FRAMES)
  const scale = 1 / Math.sqrt(N_FFT)
  for (let t = 0; t < FRAMES; t++) {
    const start = (t + 2) * HOP - centre
    for (let n = 0; n < N_FFT; n++) {
      re[n] = padded[reflect(start + n, total)] * hann[n]
      im[n] = 0
    }
    fft(re, im)
    for (let k = 0; k < BINS; k++) {
      real[k * FRAMES + t] = re[k] * scale
      imag[k * FRAMES + t] = im[k] * scale
    }
  }
  return { real, imag }
}

/** `_ispec` for one channel: [2048 × 336] complex back to `length` samples. */
export function ispec(real: Float32Array, imag: Float32Array, length: number) {
  // Pad 1 frequency bin and 2 frames each side, inverse STFT
  // (normalized, centre) to le = 1024·336 + 2·1536 samples, trim 1536.
  const pad = (HOP / 2) * 3,
    frames = FRAMES + 4,
    le = HOP * FRAMES + 2 * pad
  const out = new Float64Array(le + N_FFT),
    envelope = new Float64Array(le + N_FFT)
  const re = new Float64Array(N_FFT),
    im = new Float64Array(N_FFT)
  const scale = Math.sqrt(N_FFT)
  for (let t = 0; t < frames; t++) {
    const source = t - 2
    re.fill(0)
    im.fill(0)
    if (source >= 0 && source < FRAMES)
      for (let k = 0; k < BINS; k++) {
        // Inverse via the forward FFT of the conjugate, Hermitian-filled.
        const a = real[k * FRAMES + source] * scale,
          b = imag[k * FRAMES + source] * scale
        re[k] = a
        im[k] = -b
        if (k > 0) {
          re[N_FFT - k] = a
          im[N_FFT - k] = b
        }
      }
    fft(re, im)
    // Frame t covers [t·1024 − 2048, t·1024 + 2048) of the centred signal.
    const start = t * HOP
    for (let n = 0; n < N_FFT; n++) {
      out[start + n] += (re[n] / N_FFT) * hann[n]
      envelope[start + n] += hann[n] * hann[n]
    }
  }
  const signal = new Float32Array(length)
  const centre = N_FFT / 2
  for (let i = 0; i < length; i++) {
    const j = centre + pad + i
    signal[i] = envelope[j] > 1e-11 ? out[j] / envelope[j] : 0
  }
  return signal
}

/** Separate one 343 980-sample stereo segment into four stereo sources. */
async function separateSegment(
  left: Float32Array,
  right: Float32Array,
  run: StemModelRun
) {
  const mix = new Float32Array(2 * SEGMENT)
  mix.set(left, 0)
  mix.set(right, SEGMENT)
  const mag = new Float32Array(4 * BINS * FRAMES)
  ;[left, right].forEach((channel, c) => {
    const { real, imag } = spec(channel)
    mag.set(real, 2 * c * BINS * FRAMES)
    mag.set(imag, (2 * c + 1) * BINS * FRAMES)
  })
  const { x, xt } = await run(mix, mag)
  const plane = BINS * FRAMES
  return SOURCES.map((_, s) =>
    [0, 1].map((c) => {
      const real = x.subarray(
          (s * 4 + 2 * c) * plane,
          (s * 4 + 2 * c + 1) * plane
        ),
        imag = x.subarray(
          (s * 4 + 2 * c + 1) * plane,
          (s * 4 + 2 * c + 2) * plane
        )
      const audio = ispec(real, imag, SEGMENT)
      const time = xt.subarray((s * 2 + c) * SEGMENT, (s * 2 + c + 1) * SEGMENT)
      for (let i = 0; i < SEGMENT; i++) audio[i] += time[i]
      return audio
    })
  )
}

/**
 * Four stereo stems for a stereo track at 44.1 kHz. `onProgress` gets 0–1
 * after each segment; `signal` cancels between segments.
 */
export async function separate(
  channels: Float32Array[],
  run: StemModelRun,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal
): Promise<Record<StemName, Float32Array[]>> {
  const left = channels[0],
    right = channels[1] ?? channels[0],
    length = left.length
  // Whole-track normalisation by the mono mix (demucs.separate).
  let mean = 0
  for (let i = 0; i < length; i++) mean += (left[i] + right[i]) / 2
  mean /= length || 1
  let variance = 0
  for (let i = 0; i < length; i++)
    variance += ((left[i] + right[i]) / 2 - mean) ** 2
  const std = Math.sqrt(variance / Math.max(1, length - 1)) || 1
  const norm = (channel: Float32Array) =>
    Float32Array.from(channel, (v) => (v - mean) / std)
  const l = norm(left),
    r = norm(right)
  // Triangular weights over a segment, peak 1.
  const weight = new Float32Array(SEGMENT)
  const half = Math.floor(SEGMENT / 2)
  for (let i = 0; i < SEGMENT; i++)
    weight[i] = (i < half ? i + 1 : SEGMENT - i) / half
  const stride = Math.floor(0.75 * SEGMENT)
  const out = SOURCES.map(() => [
    new Float32Array(length),
    new Float32Array(length),
  ])
  const sum = new Float32Array(length)
  const offsets: number[] = []
  for (let offset = 0; offset < length; offset += stride) offsets.push(offset)
  for (const [index, offset] of offsets.entries()) {
    signal?.throwIfAborted()
    // TensorChunk.padded: centre the chunk, pulling real neighbouring audio.
    const chunkLength = Math.min(SEGMENT, length - offset)
    const delta = SEGMENT - chunkLength
    const start = offset - Math.floor(delta / 2)
    const take = (source: Float32Array) => {
      const segment = new Float32Array(SEGMENT)
      for (let i = 0; i < SEGMENT; i++) {
        const j = start + i
        segment[i] = j >= 0 && j < length ? source[j] : 0
      }
      return segment
    }
    const separated = await separateSegment(take(l), take(r), run)
    // center_trim back to the chunk, then weighted overlap-add.
    const trim = Math.floor(delta / 2)
    for (let s = 0; s < SOURCES.length; s++)
      for (let c = 0; c < 2; c++) {
        const target = out[s][c],
          source = separated[s][c]
        for (let i = 0; i < chunkLength; i++)
          target[offset + i] += weight[i] * source[trim + i]
      }
    for (let i = 0; i < chunkLength; i++) sum[offset + i] += weight[i]
    onProgress?.((index + 1) / offsets.length)
  }
  const result = {} as Record<StemName, Float32Array[]>
  SOURCES.forEach((name, s) => {
    result[name] = out[s].map((channel) => {
      for (let i = 0; i < length; i++)
        channel[i] = (channel[i] / (sum[i] || 1)) * std + mean
      return channel
    })
  })
  return result
}
