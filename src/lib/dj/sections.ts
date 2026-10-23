import type { Analysis, Track } from "./types"

export type SectionLabel =
  "intro" | "build" | "drop" | "breakdown" | "body" | "outro"
export type LabeledSection = { start: number; end: number; label: SectionLabel }

const cache = new WeakMap<Analysis, LabeledSection[]>()

/**
 * Label a track's arrangement like rekordbox phrase analysis (Intro, Up,
 * Chorus/Drop, Down, Outro) bar by bar, from levels analysis already stores:
 * bass (the bass and drum stems when prepared), mids, highs and loudness,
 * each relative to the track's own levels. Estimates only.
 *
 * - drop: 4+ bars with full bass and close to the track's fullest sound
 * - breakdown: 4+ bars with the bass pulled out, after the track has started
 * - build: the bars rising into a drop (riser, snare roll, filter sweep)
 * - intro / outro: before the first drop and the lighter tail after the last
 * - body: everything else (grooves with lighter elements between drops)
 */
export function labelSections(track: Track): LabeledSection[] {
  // Sections you edited by hand always win.
  if (track.sectionOverride?.length) return track.sectionOverride
  const analysis = track.analysis
  if (!analysis?.energyCurve.length || track.duration <= 0) return []
  const cached = cache.get(analysis)
  if (cached) return cached
  const duration = track.duration
  const bar = track.bpm ? 240 / track.bpm : 8
  const bands = analysis.bands
  const mean = (values: number[], from: number, to: number) => {
    const perSecond = values.length / duration
    const a = Math.max(0, Math.floor(from * perSecond)),
      b = Math.min(values.length, Math.max(a + 1, Math.ceil(to * perSecond)))
    let sum = 0
    for (let i = a; i < b; i++) sum += values[i]
    return b > a ? sum / (b - a) : 0
  }
  // Bars on the phrase grid; a partial bar before the grid joins the first.
  const origin =
    (((analysis.phraseOffset ?? analysis.beatOffset) % bar) + bar) % bar
  const starts = [0]
  for (let t = origin > 0.05 ? origin + bar : bar; t < duration - 0.5; t += bar)
    starts.push(t)
  const ends = [...starts.slice(1), duration]
  // With stems, "bass in" is the bass and drum stems themselves rather than
  // the low frequency band, which pads and kicks share.
  const stems = analysis.stemLevels
  const raw = starts.map((start, i) => {
    const end = ends[i],
      loud = mean(analysis.energyCurve, start, end)
    return {
      low: stems
        ? mean(stems.bass, start, end) + 0.6 * mean(stems.drums, start, end)
        : bands?.low.length
          ? mean(bands.low, start, end)
          : loud,
      mid: bands?.mid.length ? mean(bands.mid, start, end) : loud,
      high: bands?.high.length ? mean(bands.high, start, end) : loud,
      loud,
    }
  })
  // Each level relative to the track's own near-loudest bars.
  const p90 = (values: number[]) =>
    Math.max(
      1e-6,
      [...values].sort((x, y) => x - y)[Math.floor(values.length * 0.9)] ?? 0
    )
  const scale = {
    low: p90(raw.map((r) => r.low)),
    mid: p90(raw.map((r) => r.mid)),
    high: p90(raw.map((r) => r.high)),
    loud: p90(raw.map((r) => r.loud)),
  }
  const bars = raw.map((r) => {
    const low = r.low / scale.low,
      mid = r.mid / scale.mid,
      high = r.high / scale.high,
      loud = r.loud / scale.loud
    return {
      low,
      lift: (mid + high + loud) / 3,
      full: 0.35 * low + 0.25 * loud + 0.2 * mid + 0.2 * high,
    }
  })
  const peak = p90(bars.map((b) => b.full))
  const count = bars.length
  const isFull = bars.map((b) => b.low >= 0.6 && b.full >= peak * 0.86)
  // A fill of up to two bars inside a drop stays part of it.
  for (let i = 1; i < count - 1; i++)
    if (!isFull[i] && isFull[i - 1] && (isFull[i + 1] || isFull[i + 2]))
      isFull[i] = true
  const labels: SectionLabel[] = new Array<SectionLabel>(count).fill("body")
  const runs = (test: (i: number) => boolean, minimum: number) => {
    const found: [number, number][] = []
    for (let i = 0; i < count;) {
      if (!test(i)) {
        i++
        continue
      }
      let j = i
      while (j < count && test(j)) j++
      if (j - i >= minimum) found.push([i, j])
      i = j
    }
    return found
  }
  for (const [a, b] of runs((i) => isFull[i], 4)) labels.fill("drop", a, b)
  const firstBass = bars.findIndex((b) => b.low >= 0.6)
  const breakdowns = runs(
    (i) => bars[i].low < 0.45 && labels[i] !== "drop",
    4
  ).filter(([a]) => firstBass >= 0 && a > firstBass)
  for (const [a, b] of breakdowns) labels.fill("breakdown", a, b)
  // The bass coming back after a breakdown is a drop even when that part is
  // a little lighter than the track's fullest moment.
  for (const [, end] of breakdowns) {
    let i = end
    while (i < count && i - end < 4 && bars[i].low < 0.7) i++
    // It lasts until the energy steps down from how the drop arrived.
    const arrival =
      bars.slice(i, i + 4).reduce((sum, b) => sum + b.full, 0) /
      Math.max(1, Math.min(4, count - i))
    let j = i
    while (
      j < count &&
      bars[j].low >= 0.7 &&
      bars[j].full >= Math.max(peak * 0.7, arrival * 0.85)
    )
      j++
    if (j - i >= 4) labels.fill("drop", i, j)
  }
  const drops = runs((i) => labels[i] === "drop", 4)
  // Builds: the bars just before each drop that rise out of their low point,
  // or a short bass-on stretch after a breakdown; at most 16 bars.
  for (const [start] of drops) {
    let g = start
    while (g > 0 && labels[g - 1] !== "drop" && start - g < 16) g--
    if (start - g === 0) continue
    if (start - g <= 2 && g > 0) {
      labels.fill("build", g, start)
      continue
    }
    let low = g
    for (let i = g; i < start; i++) if (bars[i].lift < bars[low].lift) low = i
    const rise = bars[start - 1].lift - bars[low].lift
    let from = -1
    // A build holds the bass back while the rest climbs.
    if (rise >= 0.08)
      for (let i = low; i < start; i++)
        if (bars[i].lift >= bars[low].lift + rise * 0.35) {
          from = i
          break
        }
    if (from >= 0) {
      let held = start
      while (held > from && bars[held - 1].low < 0.7) held--
      from = held
    }
    if (from < 0) {
      // No rise: bass-on bars after a breakdown still lead into the drop.
      let i = start
      while (i > g && labels[i - 1] !== "breakdown" && bars[i - 1].low >= 0.45)
        i--
      if (i > g && labels[i - 1] === "breakdown") from = i
    }
    if (from >= 0 && from < start && (from > 0 || labels[0] !== "body"))
      labels.fill("build", from, start)
  }
  // Intro: everything before the first drop except the build into it.
  const firstDrop = drops.at(0)?.[0] ?? -1
  for (let i = 0; i < firstDrop; i++)
    if (labels[i] !== "build") labels[i] = "intro"
  // Outro: the lighter tail after the last drop.
  const lastDrop = drops.at(-1)?.[1] ?? count
  let tail = count
  while (tail > lastDrop && !isFull[tail - 1]) tail--
  if (count - tail >= 2) labels.fill("outro", tail, count)
  // Runs shorter than two bars (a fill, a transition bar) join the run
  // before them; builds may be short.
  for (let i = 1; i < count; i++)
    if (
      labels[i] !== labels[i - 1] &&
      labels[i] !== "build" &&
      (labels[i + 1] ?? labels[i - 1]) !== labels[i]
    )
      labels[i] = labels[i - 1]
  // Merge neighbours with the same label.
  const merged = labels.reduce<LabeledSection[]>((all, label, i) => {
    const last = all.at(-1)
    if (last?.label === label) last.end = ends[i]
    else all.push({ start: starts[i], end: ends[i], label })
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
