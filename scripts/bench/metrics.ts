import type { Analysis } from "../../src/lib/dj/types"

/** Tempo within ±4% (Accuracy 1), or at a ×2 / ×½ / ×3 / ×⅓ octave (Accuracy 2). */
export function tempoScore(estimate: number | null, truth: number) {
  if (!estimate) return { acc1: false, acc2: false }
  const near = (value: number) => Math.abs(value / truth - 1) <= 0.04
  return {
    acc1: near(estimate),
    acc2: [1, 2, 0.5, 3, 1 / 3].some((m) => near(estimate * m)),
  }
}

/** F-measure of event times with a ± tolerance window (seconds). */
export function fMeasure(
  estimates: number[],
  truth: number[],
  tolerance = 0.07
) {
  if (!estimates.length || !truth.length) return 0
  const used = new Set<number>()
  let hits = 0
  for (const t of truth) {
    let best = -1,
      bestGap = tolerance
    estimates.forEach((e, i) => {
      const gap = Math.abs(e - t)
      if (!used.has(i) && gap <= bestGap) {
        best = i
        bestGap = gap
      }
    })
    if (best >= 0) {
      used.add(best)
      hits++
    }
  }
  const precision = hits / estimates.length,
    recall = hits / truth.length
  return precision + recall
    ? (2 * precision * recall) / (precision + recall)
    : 0
}

/**
 * MIREX key score: same key 1, a fifth apart 0.5, relative 0.3, parallel
 * 0.2, anything else 0. Keys as Camelot codes.
 */
export function keyScore(estimate: string | null, truth: string) {
  if (!estimate) return 0
  if (estimate === truth) return 1
  const n = (c: string) => parseInt(c),
    letter = (c: string) => c.at(-1)
  const step = (a: number, b: number) =>
    Math.min(Math.abs(a - b), 12 - Math.abs(a - b))
  if (letter(estimate) === letter(truth) && step(n(estimate), n(truth)) === 1)
    return 0.5
  if (letter(estimate) !== letter(truth) && n(estimate) === n(truth)) return 0.3
  // Parallel: same tonic, other mode (e.g. C major 8B ↔ C minor 5A).
  const parallel =
    letter(truth) === "B"
      ? ((n(truth) + 8) % 12) + 1
      : ((n(truth) + 2) % 12) + 1
  if (letter(estimate) !== letter(truth) && n(estimate) === parallel) return 0.2
  return 0
}

/** Beats and downbeats the analysis implies across the track. */
export function predictedGrid(analysis: Analysis, duration: number) {
  // A steady track plays on its fitted grid; raw tracked beats only matter
  // when the tempo moves.
  if (analysis.beats?.length && analysis.steadyTempo === false)
    return {
      beats: analysis.beats,
      downbeats:
        analysis.downbeats ?? analysis.beats.filter((_, i) => i % 4 === 0),
    }
  const bpm = analysis.bpm
  if (!bpm) return { beats: [], downbeats: [] }
  const beat = 60 / bpm,
    bar = beat * 4
  const origin = analysis.phraseOffset ?? analysis.beatOffset
  const first = origin - Math.floor(origin / bar) * bar
  const beats: number[] = [],
    downbeats: number[] = []
  for (
    let t = analysis.beatOffset - Math.floor(analysis.beatOffset / beat) * beat;
    t < duration;
    t += beat
  )
    beats.push(t)
  for (let t = first; t < duration; t += bar) downbeats.push(t)
  return { beats, downbeats }
}

export const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
