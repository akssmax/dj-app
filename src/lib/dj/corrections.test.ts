import { describe, expect, it } from "vitest"
import { demoTracks } from "./tracks"
import { keyAt } from "./planner"
import { labelSections } from "./sections"
import { mergeLibraryAnalysis } from "./library-analysis"
import type { Analysis, Track } from "./types"

const analysis: Analysis = {
  peaks: [0.5],
  energyCurve: Array.from({ length: 200 }, () => 0.8),
  bpm: 128,
  beatOffset: 0,
  key: "A minor",
  camelot: "8A",
  energy: 5,
  confidence: 0.6,
  keySections: [
    { start: 0, end: 100, key: "C maj", camelot: "8B", confidence: 0.9 },
  ],
}
const track: Track = {
  ...demoTracks[0],
  duration: 200,
  analysis,
  camelot: "8A",
}

describe("your corrections", () => {
  it("uses your key over the detected and per-section keys", () => {
    expect(keyAt(track, 50)).toBe("8B")
    expect(keyAt({ ...track, keyOverride: "3A", camelot: "3A" }, 50)).toBe("3A")
  })
  it("keeps your key when the track is analyzed again", () => {
    const fixed = { ...track, keyOverride: "3A", camelot: "3A", key: "Bbm" }
    const merged = mergeLibraryAnalysis(
      fixed,
      { ...analysis, camelot: "9A" },
      200
    )
    expect(merged.camelot).toBe("3A")
  })
  it("uses your sections over detection", () => {
    const sections = [
      { start: 0, end: 60, label: "intro" as const },
      { start: 60, end: 200, label: "drop" as const },
    ]
    expect(labelSections({ ...track, sectionOverride: sections })).toEqual(
      sections
    )
  })
})
