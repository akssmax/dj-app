import { harmonicCompatibility } from "./planner"
import type { EnergyRating, Track } from "./types"

/**
 * Library search with DJ fields, e.g. `bpm:120-128 key:8A~ energy:4+ deep`.
 *
 * - bpm:128 (±1), bpm:120-128, bpm:>125, bpm:<100
 * - key:8A, key:8A,9B, key:8A~ (8A and harmonically compatible keys)
 * - genre:house, artist:name (substring)
 * - energy:4, energy:4+, energy:2-3 (your 1–5 rating, else analysis)
 * - fresh:30 (not played in the last 30 days)
 * Anything else matches title, artist or file path.
 */
export type LibraryQuery = {
  text: string[]
  bpm?: [number, number]
  keys?: { values: string[]; compatible: boolean }
  genre?: string
  artist?: string
  energy?: [number, number]
  freshDays?: number
}

const range = (value: string, tolerance: number): [number, number] | null => {
  const span = value.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/)
  if (span) return [Math.min(+span[1], +span[2]), Math.max(+span[1], +span[2])]
  const above =
    value.match(/^>(\d+(?:\.\d+)?)$/) ?? value.match(/^(\d+(?:\.\d+)?)\+$/)
  if (above) return [+above[1], Infinity]
  const below = value.match(/^<(\d+(?:\.\d+)?)$/)
  if (below) return [-Infinity, +below[1]]
  const exact = value.match(/^(\d+(?:\.\d+)?)$/)
  return exact ? [+exact[1] - tolerance, +exact[1] + tolerance] : null
}

export function parseLibraryQuery(input: string): LibraryQuery {
  const query: LibraryQuery = { text: [] }
  for (const token of input.trim().toLowerCase().split(/\s+/).filter(Boolean)) {
    const [, field, value] = token.match(/^(\w+):(.+)$/) ?? []
    if (field === "bpm" && range(value, 1)) query.bpm = range(value, 1)!
    else if (field === "key") {
      const compatible = value.endsWith("~")
      const values = value
        .replace(/~$/, "")
        .split(",")
        .map((key) => key.toUpperCase())
        .filter((key) => /^(1[0-2]|[1-9])[AB]$/.test(key))
      if (values.length) query.keys = { values, compatible }
      else query.text.push(token)
    } else if (field === "genre") query.genre = value
    else if (field === "artist") query.artist = value
    else if (field === "energy" && range(value, 0))
      query.energy = range(value, 0)!
    else if (field === "fresh" && /^\d+$/.test(value)) query.freshDays = +value
    else query.text.push(token)
  }
  return query
}

/** True when the query uses any DJ field (worth saving as a smart crate). */
export function hasQueryFields(query: LibraryQuery) {
  return !!(
    query.bpm ||
    query.keys ||
    query.genre ||
    query.artist ||
    query.energy ||
    query.freshDays
  )
}

export function matchesLibraryQuery(
  track: Track,
  query: LibraryQuery,
  context: {
    ratings?: Partial<Record<string, EnergyRating>>
    lastPlayed?: Map<string, number>
    now?: number
  } = {}
) {
  const haystack =
    `${track.title} ${track.artist} ${track.linkedFile?.path ?? ""}`.toLowerCase()
  if (!query.text.every((word) => haystack.includes(word))) return false
  if (
    query.bpm &&
    !(track.bpm && track.bpm >= query.bpm[0] && track.bpm <= query.bpm[1])
  )
    return false
  if (query.keys) {
    const camelot = track.camelot
    if (!camelot) return false
    const ok = query.keys.values.some((key) =>
      query.keys!.compatible
        ? harmonicCompatibility(key, camelot) >= 0.9
        : key === camelot
    )
    if (!ok) return false
  }
  if (query.genre && !track.genre.toLowerCase().includes(query.genre))
    return false
  if (query.artist && !track.artist.toLowerCase().includes(query.artist))
    return false
  if (query.energy) {
    const rating =
      context.ratings?.[track.id] ??
      (track.energy ? Math.max(1, Math.round(track.energy / 2)) : null)
    if (rating === null || rating < query.energy[0] || rating > query.energy[1])
      return false
  }
  if (query.freshDays) {
    const last = context.lastPlayed?.get(track.id)
    const now = context.now ?? Date.now()
    if (last !== undefined && now - last < query.freshDays * 86_400_000)
      return false
  }
  return true
}

/** Latest play time per track from the history log. */
export function lastPlayedMap(history: { trackId: string; at: string }[]) {
  const map = new Map<string, number>()
  for (const entry of history) {
    const time = Date.parse(entry.at)
    if (Number.isFinite(time) && time > (map.get(entry.trackId) ?? -Infinity))
      map.set(entry.trackId, time)
  }
  return map
}

/** Plain-text setlist for sharing: "21:04  Artist – Title". */
export function setlistText(
  history: { trackId: string; at: string }[],
  tracks: Track[]
) {
  const byId = new Map(tracks.map((track) => [track.id, track]))
  return history
    .map((entry) => {
      const track = byId.get(entry.trackId)
      const time = new Date(entry.at)
      const clock = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`
      return track ? `${clock}  ${track.artist} – ${track.title}` : null
    })
    .filter(Boolean)
    .join("\n")
}
