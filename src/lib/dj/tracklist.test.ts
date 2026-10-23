import { describe, expect, it } from "vitest"
import { tracklistCue, tracklistText } from "./tracklist"

const entries = [
  { at: 0, title: "Opener", artist: "A" },
  { at: 214.5, title: "Second", artist: "B", transition: "Bass swap" },
  { at: 3725, title: "Late", artist: "C" },
]

describe("tracklist export", () => {
  it("writes a timestamped text tracklist", () => {
    const text = tracklistText(entries, "Cue mix")
    expect(text).toContain("01. [0:00] A – Opener")
    expect(text).toContain("02. [3:34] B – Second  (Bass swap)")
    expect(text).toContain("03. [1:02:05] C – Late")
  })
  it("writes a CUE sheet with frame-accurate indexes", () => {
    const cue = tracklistCue(entries, "Cue mix", "mix.webm")
    expect(cue).toContain('FILE "mix.webm" WAVE')
    expect(cue).toContain("INDEX 01 00:00:00")
    expect(cue).toContain("INDEX 01 03:34:38")
    expect(cue).toContain('TITLE "Second"')
  })
})
