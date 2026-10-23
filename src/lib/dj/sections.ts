import type { Analysis, Track } from "./types"

export type SectionLabel =
  "intro" | "build" | "drop" | "breakdown" | "body" | "outro"
export type LabeledSection = { start: number; end: number; label: SectionLabel }

const cache = new WeakMap<Analysis, LabeledSection[]>()

/**
 * Label a track's arrangement like rekordbox phrase analysis (Intro, Up,
 * Chorus/Drop, Down, Outro) from data analysis already stores: detected
 * section changes, loudness per second and bass level. Estimates only.
 *
 * - drop: loud with full bass
 * - breakdown: bass pulled out after the track has started
 * - build: the stretch right before a drop when it is quieter than the drop
 * - intro / outro: the quieter stretches before the first and after the last
 *   loud section
 */
export function labelSections(track: Track): LabeledSection[] {
  const analysis = track.analysis
  if (!analysis?.energyCurve.length || track.duration <= 0) return []
  const cached = cache.get(analysis)
  if (cached) return cached
  const duration = track.duration
  const p95 = (values: number[]) =>
    Math.max(
      1e-6,
      [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ?? 0
    )
  const energyScale = p95(analysis.energyCurve)
  const low = analysis.bands?.low
  const lowScale = low?.length ? p95(low) : 1
  const mean = (
    values: number[],
    perSecond: number,
    from: number,
    to: number
  ) => {
    const a = Math.max(0, Math.floor(from * perSecond)),
      b = Math.min(values.length, Math.max(a + 1, Math.ceil(to * perSecond)))
    let sum = 0
    for (let i = a; i < b; i++) sum += values[i]
    return b > a ? sum / (b - a) : 0
  }
  // Boundaries: detected changes, merging slivers shorter than 4 bars.
  const bar = track.bpm ? 240 / track.bpm : 8
  const cuts = [0, ...(analysis.sections ?? []), duration]
    .filter((t) => t >= 0 && t <= duration)
    .sort((a, b) => a - b)
    .filter((t, i, all) => i === 0 || t - all[i - 1] >= bar * 4 - 0.01)
  if (duration - cuts[cuts.length - 1] > 0.01) cuts.push(duration)
  else cuts[cuts.length - 1] = duration
  const segments = cuts.slice(0, -1).map((start, i) => {
    const end = cuts[i + 1]
    return {
      start,
      end,
      energy: mean(analysis.energyCurve, 1, start, end) / energyScale,
      low: low?.length
        ? mean(low, low.length / duration, start, end) / lowScale
        : null,
    }
  })
  // Relative to this track's own loudest sections: a quiet master or a
  // flat downtempo track still has drops, and slightly softer late parts
  // are not mistaken for an outro.
  const maxEnergy = Math.max(1e-6, ...segments.map((s) => s.energy))
  const maxLow = Math.max(1e-6, ...segments.map((s) => s.low ?? 0))
  const loud = (s: (typeof segments)[number]) =>
    s.energy >= maxEnergy * 0.82 && (s.low === null || s.low >= maxLow * 0.6)
  const quiet = (s: (typeof segments)[number], share: number) =>
    s.energy < maxEnergy * share
  const firstLoud = segments.findIndex(loud)
  let lastLoud = -1
  segments.forEach((s, i) => {
    if (loud(s)) lastLoud = i
  })
  const labels: LabeledSection[] = segments.map((s, i) => {
    let label: SectionLabel = "body"
    if (loud(s)) label = "drop"
    else if (i < firstLoud && quiet(s, 0.8)) label = "intro"
    else if (i > lastLoud && quiet(s, 0.75)) label = "outro"
    else if (s.low !== null && s.low < maxLow * 0.45) label = "breakdown"
    // The stretch just before a drop that is clearly quieter builds into it.
    if (
      label !== "drop" &&
      loud(segments[i + 1] ?? s) &&
      i + 1 < segments.length &&
      s.end - s.start <= bar * 16 + 0.01 &&
      s.energy < segments[i + 1].energy - 0.1 &&
      (label === "body" || label === "breakdown" || label === "intro") &&
      i > 0
    )
      label = "build"
    return { start: s.start, end: s.end, label }
  })
  // Merge neighbours with the same label.
  const merged = labels.reduce<LabeledSection[]>((all, section) => {
    const last = all.at(-1)
    if (last?.label === section.label) last.end = section.end
    else all.push({ ...section })
    return all
  }, [])
  cache.set(analysis, merged)
  return merged
}

export function sectionAt(track: Track, time: number) {
  return labelSections(track).find((s) => time >= s.start && time < s.end)
}

/** Fraction of [start, start+length) that falls inside sections with a label. */
export function overlapWith(
  track: Track,
  label: SectionLabel,
  start: number,
  length: number
) {
  if (length <= 0) return 0
  let inside = 0
  for (const s of labelSections(track))
    if (s.label === label)
      inside += Math.max(
        0,
        Math.min(s.end, start + length) - Math.max(s.start, start)
      )
  return inside / length
}
