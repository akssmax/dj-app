import MusicTempo from "music-tempo"
import type { Analysis } from "./types"
import { measureBands, measurePeaks } from "./wave-peaks"
import { consensusTempo, phraseStructure, vocalPresence } from "./structure"

// FFT + Krumhansl-Schmuckler profiles: a provisional global key, not ground truth.
function keyEstimate(samples: Float32Array, sampleRate: number) {
  const n = 8192,
    chroma = new Float64Array(12)
  const re = new Float64Array(n),
    im = new Float64Array(n)
  for (let frame = 0; frame < 20; frame++) {
    const start = Math.floor((samples.length * (frame + 1)) / 22)
    for (let i = 0; i < n; i++) {
      re[i] =
        (samples[start + i] ?? 0) *
        (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)))
      im[i] = 0
    }
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1
      for (; j & bit; bit >>= 1) j ^= bit
      j ^= bit
      if (i < j) {
        const v = re[i]
        re[i] = re[j]
        re[j] = v
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      for (let startBlock = 0; startBlock < n; startBlock += len) {
        for (let j = 0; j < len / 2; j++) {
          const angle = (-2 * Math.PI * j) / len,
            a = startBlock + j,
            b = a + len / 2
          const tr = re[b] * Math.cos(angle) - im[b] * Math.sin(angle),
            ti = re[b] * Math.sin(angle) + im[b] * Math.cos(angle)
          re[b] = re[a] - tr
          im[b] = im[a] - ti
          re[a] += tr
          im[a] += ti
        }
      }
    }
    for (let bin = 1; bin < n / 2; bin++) {
      const frequency = (bin * sampleRate) / n
      if (frequency < 65 || frequency > 2100) continue
      const midi = Math.round(69 + 12 * Math.log2(frequency / 440))
      chroma[(midi + 120) % 12] += Math.sqrt(Math.hypot(re[bin], im[bin]))
    }
  }
  const profiles = [
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  ]
  const scores: { score: number; root: number; mode: number }[] = []
  for (let mode = 0; mode < 2; mode++)
    for (let root = 0; root < 12; root++) {
      const profile = profiles[mode],
        cm = chroma.reduce((a, b) => a + b, 0) / 12,
        pm = profile.reduce((a, b) => a + b, 0) / 12
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
      scores.push({ score: dot / (Math.sqrt(ca * pa) || 1), root, mode })
    }
  scores.sort((a, b) => b.score - a.score)
  const winner = scores[0]
  if (winner.score < 0.3) return { key: null, camelot: null, confidence: 0 }
  const notes = [
    "C",
    "D♭",
    "D",
    "E♭",
    "E",
    "F",
    "G♭",
    "G",
    "A♭",
    "A",
    "B♭",
    "B",
  ]
  const wheels = [
    [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1],
    [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10],
  ]
  return {
    key: notes[winner.root] + (winner.mode ? "m" : " maj"),
    camelot: `${wheels[winner.mode][winner.root]}${winner.mode ? "A" : "B"}`,
    confidence: Math.min(0.85, Math.max(0.1, winner.score)),
  }
}

self.onmessage = (
  event: MessageEvent<{
    samples?: Float32Array
    channels?: Float32Array[]
    sampleRate: number
    waveformOnly?: boolean
    bpm?: number | null
    beatOffset?: number
  }>
) => {
  const { sampleRate } = event.data
  const channels = event.data.channels ?? [event.data.samples!]
  if (event.data.waveformOnly) {
    // Refresh for tracks analyzed by an older version: waveform bands plus
    // structure, keeping the saved tempo and grid.
    const bands = measureBands(channels, sampleRate),
      vocals = vocalPresence(channels, sampleRate),
      duration = (channels[0]?.length ?? 0) / sampleRate
    self.postMessage({
      peaks: measurePeaks(channels, sampleRate),
      bands,
      vocals,
      ...phraseStructure(
        bands,
        vocals,
        duration,
        event.data.bpm ?? null,
        event.data.beatOffset ?? 0
      ),
    })
    return
  }
  const samples = new Float32Array(channels[0].length)
  for (const channel of channels)
    for (let i = 0; i < channel.length; i++)
      samples[i] += channel[i] / channels.length
  const peaks = measurePeaks(channels, sampleRate),
    bands = measureBands(channels, sampleRate),
    energyCurve: number[] = []
  for (let i = 0; i < samples.length; i += sampleRate) {
    let sum = 0,
      count = 0
    for (let j = i; j < Math.min(i + sampleRate, samples.length); j += 16) {
      sum += samples[j] ** 2
      count++
    }
    energyCurve.push(Math.sqrt(sum / Math.max(1, count)))
  }
  // Tempo from three windows (start, middle, three quarters) so one intro or
  // breakdown cannot decide it; the beat phase comes from the start window.
  const tempoAt = (from: number, seconds: number) => {
    try {
      const start = Math.floor(Math.max(0, from) * sampleRate)
      const window = samples.subarray(
        start,
        Math.min(samples.length, start + sampleRate * seconds)
      )
      if (window.length < sampleRate) return null
      const tempo = new MusicTempo(window, {
        hopSize: Math.round(sampleRate * 0.01),
        timeStep: Math.round(sampleRate * 0.01) / sampleRate,
      })
      return {
        bpm: Math.round(tempo.tempo * 10) / 10,
        first: (tempo.beats[0] ?? 0) + start / sampleRate,
      }
    } catch {
      /* Quiet, ambient, or non-rhythmic passages have no reliable tempo. */
      return null
    }
  }
  const duration = samples.length / sampleRate
  const opening = tempoAt(0, 45)
  const bpm = consensusTempo([
    opening?.bpm ?? null,
    tempoAt(duration * 0.5 - 15, 30)?.bpm ?? null,
    tempoAt(duration * 0.75 - 15, 30)?.bpm ?? null,
  ])
  const beatOffset = opening?.first ?? 0
  const vocals = vocalPresence(channels, sampleRate)
  const structure = phraseStructure(bands, vocals, duration, bpm, beatOffset)
  const key = keyEstimate(samples, sampleRate)
  const avg =
    energyCurve.reduce((a, b) => a + b, 0) / Math.max(1, energyCurve.length)
  const result: Analysis = {
    peaks,
    bands,
    vocals,
    ...structure,
    energyCurve,
    bpm,
    beatOffset,
    ...key,
    energy: Math.min(10, Math.max(1, Math.round(avg * 28))),
  }
  self.postMessage(result)
}
