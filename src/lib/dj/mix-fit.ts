import { harmonicCompatibility } from "./planner"
import type { Track } from "./types"

export type Fit = "good" | "ok" | "poor" | "unknown"
export type MixFit = {
  tempo: Fit
  key: Fit
  overall: Fit
  /** Signed tempo change (%) needed to match the reference, after any
   * half/double-time relationship. */
  gap: number | null
  /** 2 or 0.5 when the match is half/double time. */
  multiple: 1 | 2 | 0.5
  score: number
}

/**
 * How easily `track` mixes out of the playing reference: tempo within a
 * beatmatch range (3% easy, 8% workable) and Camelot-compatible keys.
 */
export function mixFit(
  reference: Pick<Track, "bpm" | "camelot">,
  rate: number,
  track: Pick<Track, "bpm" | "camelot">
): MixFit {
  let tempo: Fit = "unknown",
    gap: number | null = null,
    multiple: MixFit["multiple"] = 1
  if (reference.bpm && track.bpm) {
    const target = reference.bpm * rate
    for (const candidate of [1, 2, 0.5] as const) {
      const change =
        ((target - track.bpm * candidate) / (track.bpm * candidate)) * 100
      if (gap === null || Math.abs(change) < Math.abs(gap) - 0.5) {
        gap = change
        multiple = candidate
      }
    }
    const size = Math.abs(gap!)
    tempo = size <= 3 ? "good" : size <= 8 ? "ok" : "poor"
  }
  let key: Fit = "unknown"
  if (reference.camelot && track.camelot)
    key =
      harmonicCompatibility(reference.camelot, track.camelot) >= 0.9
        ? "good"
        : "poor"
  const points = { good: 2, ok: 1, unknown: 1, poor: 0 }
  const score = points[tempo] * 2 + points[key] - (multiple === 1 ? 0 : 0.5)
  const overall: Fit =
    tempo === "poor"
      ? "poor"
      : tempo === "unknown" && key === "unknown"
        ? "unknown"
        : score >= 5
          ? "good"
          : score >= 3
            ? "ok"
            : "poor"
  return { tempo, key, overall, gap, multiple, score }
}

export type SortKey =
  "title" | "artist" | "bpm" | "key" | "genre" | "time" | "energy" | "fit"
export type SortState = { key: SortKey; direction: 1 | -1 } | null

/** Camelot order around the wheel: 1A, 1B, 2A … 12B; unknown keys last. */
export function camelotRank(camelot: string | null) {
  const match = camelot?.match(/^(1[0-2]|[1-9])([AB])$/)
  return match ? +match[1] * 2 + (match[2] === "B" ? 1 : 0) : Infinity
}

/** Stable sort; tracks missing the sorted value always go last. */
export function sortTracks(
  tracks: Track[],
  sort: SortState,
  context: {
    energy?: Record<string, number | undefined>
    fit?: (track: Track) => MixFit | null
  } = {}
) {
  if (!sort) return tracks
  const value = (track: Track): number | string | null => {
    switch (sort.key) {
      case "title":
        return track.title.toLowerCase()
      case "artist":
        return track.artist.toLowerCase()
      case "genre":
        return track.genre.toLowerCase()
      case "bpm":
        return track.bpm
      case "key": {
        const rank = camelotRank(track.camelot)
        return Number.isFinite(rank) ? rank : null
      }
      case "time":
        return track.duration || null
      case "energy":
        return context.energy?.[track.id] ?? track.energy
      case "fit":
        return context.fit?.(track)?.score ?? null
    }
  }
  return tracks
    .map((track, index) => ({ track, index, value: value(track) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null)
        return a.value === b.value
          ? a.index - b.index
          : a.value === null
            ? 1
            : -1
      const order =
        typeof a.value === "string"
          ? a.value.localeCompare(b.value as string)
          : a.value - (b.value as number)
      return order * sort.direction || a.index - b.index
    })
    .map((entry) => entry.track)
}

/** Drag-and-drop payload type for moving a library row onto a deck. */
export const TRACK_DRAG_TYPE = "application/x-cue-track"
