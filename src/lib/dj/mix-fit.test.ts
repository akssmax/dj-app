import { describe, expect, it } from "vitest"
import { demoTracks } from "./tracks"
import { camelotRank, mixFit, sortTracks } from "./mix-fit"
import type { Track } from "./types"

const track = (id: string, extra: Partial<Track>): Track => ({
  ...demoTracks[0],
  id,
  title: id,
  ...extra,
})

describe("mix fit", () => {
  const playing = { bpm: 128, camelot: "8B" }
  it("rates easy, workable and hard mixes from tempo and key", () => {
    expect(mixFit(playing, 1, { bpm: 126, camelot: "9B" }).overall).toBe("good")
    expect(mixFit(playing, 1, { bpm: 122, camelot: "8A" }).overall).toBe("ok")
    expect(mixFit(playing, 1, { bpm: 128, camelot: "3A" }).overall).toBe("ok")
    expect(mixFit(playing, 1, { bpm: 100, camelot: "8B" }).overall).toBe("poor")
  })
  it("uses the playing deck's effective tempo and reports the change", () => {
    // Deck pitched up 5%: 134.4 BPM; a 134 BPM track is now an easy match.
    const fit = mixFit(playing, 1.05, { bpm: 134, camelot: "8B" })
    expect(fit.tempo).toBe("good")
    expect(fit.gap).toBeCloseTo(0.3, 1)
  })
  it("recognises half and double time", () => {
    const fit = mixFit(playing, 1, { bpm: 64, camelot: "8B" })
    expect(fit.multiple).toBe(2)
    expect(fit.tempo).toBe("good")
  })
  it("stays unknown without tempo or key data", () => {
    expect(mixFit(playing, 1, { bpm: null, camelot: null }).overall).toBe(
      "unknown"
    )
    expect(mixFit(playing, 1, { bpm: 127, camelot: null }).key).toBe("unknown")
  })
})

describe("library sorting", () => {
  const tracks = [
    track("b", { title: "Bravo", bpm: 124, camelot: "10A", duration: 200 }),
    track("a", { title: "alpha", bpm: null, camelot: "2B", duration: 300 }),
    track("c", { title: "Charlie", bpm: 120, camelot: null, duration: 100 }),
  ]
  const ids = (list: Track[]) => list.map((t) => t.id)
  it("orders keys around the Camelot wheel", () => {
    expect(camelotRank("1A")).toBeLessThan(camelotRank("1B"))
    expect(camelotRank("1B")).toBeLessThan(camelotRank("2A"))
    expect(camelotRank("12B")).toBeLessThan(camelotRank(null))
    expect(ids(sortTracks(tracks, { key: "key", direction: 1 }))).toEqual([
      "a",
      "b",
      "c",
    ])
  })
  it("sorts both ways and always keeps missing values last", () => {
    expect(ids(sortTracks(tracks, { key: "bpm", direction: 1 }))).toEqual([
      "c",
      "b",
      "a",
    ])
    expect(ids(sortTracks(tracks, { key: "bpm", direction: -1 }))).toEqual([
      "b",
      "c",
      "a",
    ])
    expect(ids(sortTracks(tracks, { key: "title", direction: 1 }))).toEqual([
      "a",
      "b",
      "c",
    ])
    expect(sortTracks(tracks, null)).toBe(tracks)
  })
  it("sorts by mix fit, best first", () => {
    const fit = (t: Track) =>
      mixFit({ bpm: 120, camelot: "8B" }, 1, { bpm: t.bpm, camelot: t.camelot })
    expect(
      ids(sortTracks(tracks, { key: "fit", direction: -1 }, { fit }))[0]
    ).toBe("c")
  })
})
