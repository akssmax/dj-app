import { describe, expect, it } from "vitest"
import { demoTracks } from "./tracks"
import { defaultDatabase } from "./storage"
import {
  hasQueryFields,
  lastPlayedMap,
  matchesLibraryQuery,
  parseLibraryQuery,
  setlistText,
} from "./library-query"
import { scopedTracks } from "./library-scope"
import { libraryAnalyzable } from "./library-analysis"
import type { Track } from "./types"

const track = (id: string, extra: Partial<Track> = {}): Track => ({
  ...demoTracks[0],
  id,
  title: id,
  artist: "Artist",
  genre: "House",
  bpm: 124,
  camelot: "8A",
  energy: 6,
  ...extra,
})

describe("library search fields", () => {
  it("parses tempo ranges, keys, genres and freshness", () => {
    const query = parseLibraryQuery(
      "bpm:120-128 key:8A~ genre:house deep fresh:30"
    )
    expect(query.bpm).toEqual([120, 128])
    expect(query.keys).toEqual({ values: ["8A"], compatible: true })
    expect(query.genre).toBe("house")
    expect(query.freshDays).toBe(30)
    expect(query.text).toEqual(["deep"])
    expect(hasQueryFields(query)).toBe(true)
    expect(hasQueryFields(parseLibraryQuery("deep house"))).toBe(false)
    expect(parseLibraryQuery("bpm:>125").bpm).toEqual([125, Infinity])
    expect(parseLibraryQuery("bpm:128").bpm).toEqual([127, 129])
  })
  it("matches compatible keys, energy ratings and words in any order", () => {
    const match = (t: Track, q: string, ratings = {}) =>
      matchesLibraryQuery(t, parseLibraryQuery(q), { ratings })
    expect(match(track("a", { camelot: "9A" }), "key:8A~")).toBe(true)
    expect(match(track("a", { camelot: "3B" }), "key:8A~")).toBe(false)
    expect(match(track("a", { camelot: "9A" }), "key:8A")).toBe(false)
    expect(match(track("a", { bpm: 131 }), "bpm:120-128")).toBe(false)
    expect(match(track("a"), "energy:4+", { a: 5 })).toBe(true)
    expect(match(track("a"), "energy:4+", { a: 2 })).toBe(false)
    // Without a rating, analysis energy (1–10) maps to 1–5.
    expect(match(track("a", { energy: 9 }), "energy:4+")).toBe(true)
    expect(match(track("Night Drive"), "drive night")).toBe(true)
  })
  it("excludes recently played tracks with fresh:", () => {
    const now = Date.parse("2026-10-23T12:00:00Z")
    const lastPlayed = lastPlayedMap([
      { trackId: "old", at: "2026-08-01T00:00:00Z" },
      { trackId: "new", at: "2026-10-20T00:00:00Z" },
    ])
    const fresh = parseLibraryQuery("fresh:30")
    expect(matchesLibraryQuery(track("old"), fresh, { lastPlayed, now })).toBe(
      true
    )
    expect(matchesLibraryQuery(track("new"), fresh, { lastPlayed, now })).toBe(
      false
    )
    expect(
      matchesLibraryQuery(track("never"), fresh, { lastPlayed, now })
    ).toBe(true)
  })
})

describe("smart crates and history", () => {
  const tracks = [
    track("warm", { bpm: 122, camelot: "8A" }),
    track("peak", { bpm: 128, camelot: "9A" }),
    track("slow", { bpm: 100, camelot: "8A" }),
  ]
  it("re-evaluates a smart crate rule against the whole library", () => {
    const database = {
      ...defaultDatabase,
      collections: [
        {
          id: "c1",
          name: "Warm-up",
          kind: "smart" as const,
          trackIds: [],
          query: "bpm:120-126",
        },
      ],
    }
    expect(
      scopedTracks(tracks, database, "collection:c1").map((t) => t.id)
    ).toEqual(["warm"])
    const grown = [...tracks, track("new", { bpm: 124 })]
    expect(
      scopedTracks(grown, database, "collection:c1").map((t) => t.id)
    ).toEqual(["warm", "new"])
  })
  it("lists played tracks under history and exports a setlist", () => {
    const history = [
      { trackId: "peak", at: "2026-10-23T21:04:00" },
      { trackId: "warm", at: "2026-10-23T21:09:00" },
    ]
    const database = { ...defaultDatabase, history }
    expect(
      scopedTracks(tracks, database, "history")
        .map((t) => t.id)
        .sort()
    ).toEqual(["peak", "warm"])
    expect(setlistText(history, tracks)).toBe(
      "21:04  Artist – peak\n21:09  Artist – warm"
    )
  })
})

describe("background analysis sources", () => {
  it("queues demo audio and offline copies, not unreachable files", () => {
    expect(libraryAnalyzable(track("demo", { source: "demo" }))).toBe(true)
    expect(
      libraryAnalyzable(
        track("copy", { source: "local", url: "", file: new Blob() })
      )
    ).toBe(true)
    expect(libraryAnalyzable(track("none", { source: "local", url: "" }))).toBe(
      false
    )
  })
})
