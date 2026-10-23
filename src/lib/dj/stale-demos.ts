import { demoTracks } from "./tracks"
import type { LibraryDatabase } from "./storage"

/**
 * Drop saved records of demo tracks that have since been replaced.
 *
 * Demo tracks live in code and the library saves analysis and cues under
 * their id. When the bundled demos changed, the old "club" (Club Diver)
 * shared an id with the new "club" (Club No Copyright): its saved record
 * overrode the new demo's title and audio file, so the deck tried to load a
 * file that no longer exists and never finished loading. A saved demo whose
 * audio file differs from the bundled one belongs to the old track, so it
 * goes, with its cue points.
 */
export function dropStaleDemos<
  T extends Pick<LibraryDatabase, "tracks" | "cues" | "cueLabels">,
>(db: T): T {
  const stale = new Set(
    db.tracks
      .filter((track) => {
        if (track.source !== "demo") return false
        const bundled = demoTracks.find((demo) => demo.id === track.id)
        return !!bundled && !!track.url && track.url !== bundled.url
      })
      .map((track) => track.id)
  )
  if (!stale.size) return db
  const keep = <TValue>(record: Record<string, TValue>) =>
    Object.fromEntries(Object.entries(record).filter(([id]) => !stale.has(id)))
  return {
    ...db,
    tracks: db.tracks.filter((track) => !stale.has(track.id)),
    cues: keep(db.cues),
    cueLabels: keep(db.cueLabels),
  }
}
