import MusicTempo from "music-tempo"
import type { Analysis } from "./types"
import { measureBands, measurePeaks } from "./wave-peaks"
import {
  consensusTempo,
  gridConfidence,
  ANALYSIS_VERSION,
  phraseStructure,
  VOCALS_VERSION,
  vocalPresence,
} from "./structure"
import {
  correctOctave,
  downbeatPhase,
  gridFit,
  gridFromBeats,
  onsetEnvelope,
  refineBeat,
} from "./rhythm"
import { trackBeats } from "./beat-model"
import type { BeatModelRun } from "./beat-model"
import { chromagram, estimateKey, harmonyChange } from "./key"

/** Waveform bands and structure for a track analyzed by an older version,
 * keeping its saved tempo and grid. */
export function refreshStructure(
  channels: Float32Array[],
  sampleRate: number,
  bpm: number | null,
  beatOffset: number
) {
  const bands = measureBands(channels, sampleRate),
    vocals = vocalPresence(channels, sampleRate),
    duration = (channels[0]?.length ?? 0) / sampleRate
  return {
    peaks: measurePeaks(channels, sampleRate),
    bands,
    vocals,
    vocalsVersion: VOCALS_VERSION,
    ...phraseStructure(bands, vocals, duration, bpm, beatOffset),
  }
}

/** Full local analysis of decoded audio: tempo, grid, key, energy, structure. */
export function analyzeAudio(
  channels: Float32Array[],
  sampleRate: number,
  /** Beats from the beat-tracking model, when it ran. */
  tracked?: { beats: number[]; downbeats: number[] }
): Analysis {
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
        beats: tempo.beats,
      }
    } catch {
      /* Quiet, ambient, or non-rhythmic passages have no reliable tempo. */
      return null
    }
  }
  const duration = samples.length / sampleRate
  const opening = tempoAt(0, 45)
  const estimates = [
    opening?.bpm ?? null,
    tempoAt(duration * 0.5 - 15, 30)?.bpm ?? null,
    tempoAt(duration * 0.75 - 15, 30)?.bpm ?? null,
  ]
  const rough = consensusTempo(estimates)
  // Refine tempo and beat phase against the whole track, fix doubled tempos,
  // then find which beat is "1" from kick accents and chord changes.
  const env = onsetEnvelope(channels, sampleRate)
  const gram = chromagram(channels, sampleRate)
  let bpm = rough,
    beatOffset = opening?.first ?? 0,
    downbeatConfidence = 0,
    fit = 0
  if (rough) {
    const refined = refineBeat(env, rough)
    const octave = correctOctave(env, refined.bpm, refined.phase)
    const down = downbeatPhase(env, octave.bpm, octave.phase, duration, (t) =>
      harmonyChange(gram, t, 60 / octave.bpm)
    )
    bpm = octave.bpm
    beatOffset = Math.round(down.first * 1000) / 1000
    downbeatConfidence = down.confidence
    fit = gridFit(env, bpm, beatOffset)
  }
  // The model's grid wins unless it can't hold one tempo while the
  // signal-processing grid fits the onsets well (a steady track the model
  // found confusing).
  const candidate = tracked
    ? gridFromBeats(tracked.beats, tracked.downbeats)
    : null
  const modelGrid =
    candidate && (candidate.steady || !rough || fit < 0.7) ? candidate : null
  if (modelGrid) {
    bpm = modelGrid.bpm
    beatOffset = modelGrid.beatOffset
    downbeatConfidence = modelGrid.confidence
    fit = gridFit(env, bpm, beatOffset)
  }
  const bar = bpm ? 240 / bpm : 0
  const vocals = vocalPresence(channels, sampleRate)
  const structure = phraseStructure(bands, vocals, duration, bpm, beatOffset)
  // 4-bar lines counted from the first downbeat.
  const phraseStarts: number[] = []
  if (bar)
    for (let t = beatOffset; t < duration; t += bar * 4) phraseStarts.push(t)
  const key = estimateKey(gram, 0, gram.chroma.length, phraseStarts)
  // A key per stretch between arrangement changes, when long enough to judge.
  const cuts = [0, ...structure.sections, duration]
  const keySections = bar
    ? cuts.slice(0, -1).flatMap((start, i) => {
        const end = cuts[i + 1]
        if (end - start < bar * 8) return []
        const result = estimateKey(
          gram,
          Math.floor(start / gram.hop),
          Math.ceil(end / gram.hop),
          phraseStarts
        )
        return result.camelot ? [{ start, end, ...result }] : []
      })
    : []
  const avg =
    energyCurve.reduce((a, b) => a + b, 0) / Math.max(1, energyCurve.length)
  const result: Analysis = {
    peaks,
    bands,
    vocals,
    vocalsVersion: VOCALS_VERSION,
    ...structure,
    energyCurve,
    bpm,
    beatOffset,
    gridConfidence: modelGrid
      ? Math.round(
          (modelGrid.confidence * 0.7 + fit * 0.3) *
            (modelGrid.steady ? 1 : 0.6) *
            100
        ) / 100
      : Math.round(
          (gridConfidence(estimates, opening?.beats ?? []) * 0.4 +
            fit * 0.4 +
            downbeatConfidence * 0.2) *
            100
        ) / 100,
    ...(modelGrid && tracked
      ? {
          beats: tracked.beats,
          downbeats: tracked.downbeats,
          steadyTempo: modelGrid.steady,
        }
      : {}),
    method: modelGrid ? "model" : "dsp",
    ...key,
    keySections,
    tuning: Math.round(gram.tuning * 100) / 100,
    analysisVersion: ANALYSIS_VERSION,
    energy: Math.min(10, Math.max(1, Math.round(avg * 28))),
  }
  return result
}

/**
 * Analysis with the beat-tracking model when one is available: its beats
 * and downbeats set the grid, and the signal-processing grid is the
 * fallback if the model fails or finds too few beats.
 */
export async function analyzeTrack(
  channels: Float32Array[],
  sampleRate: number,
  beatModel?: BeatModelRun
): Promise<Analysis> {
  if (beatModel)
    try {
      const tracked = await trackBeats(channels, sampleRate, beatModel)
      if (tracked.beats.length >= 16)
        return analyzeAudio(channels, sampleRate, tracked)
    } catch {
      /* Fall back to signal processing below. */
    }
  return analyzeAudio(channels, sampleRate)
}
