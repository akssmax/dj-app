import { describe, expect, it } from "vitest"
import { dropStaleDemos } from "./stale-demos"
import { demoTracks } from "./tracks"
import type { Track } from "./types"

describe("replaced demo tracks", () => {
  const current = demoTracks[0]
  it("drops a saved demo whose audio file changed, with its cues", () => {
    // The old bundled "club" was Club Diver; the new one has the same id.
    const old: Track = {
      ...current,
      title: "Club Diver",
      url: "/audio/club-diver.mp3",
    }
    const db = {
      tracks: [old],
      cues: { [current.id]: [12, null], other: [1] },
      cueLabels: { [current.id]: ["DROP", null] },
    }
    const clean = dropStaleDemos(db)
    expect(clean.tracks).toEqual([])
    expect(clean.cues).toEqual({ other: [1] })
    expect(clean.cueLabels).toEqual({})
  })
  it("keeps saved data for the current demos and your own tracks", () => {
    const saved: Track = { ...current, keyOverride: "8A" }
    const local = { id: "mine", source: "local" } as Track
    const db = {
      tracks: [saved, local],
      cues: { [current.id]: [4] },
      cueLabels: {},
    }
    expect(dropStaleDemos(db)).toBe(db)
  })
})
