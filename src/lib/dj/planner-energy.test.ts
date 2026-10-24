import { describe, expect, it } from "vitest"
import { demoTracks } from "./tracks"
import type { Track } from "./types"
import {
  planTransitions,
  quietOverlap,
  sectionEnergy,
  swapTooShort,
} from "./planner"

// 240 s at 120 BPM: a quiet, ambient 64 s intro and outro around a loud
// body, the shape that left a hole between two demo tracks.
const shaped = (id: string): Track => ({
  ...demoTracks[0],
  id,
  duration: 240,
  bpm: 120,
  camelot: "8A",
  energy: 6,
  analysis: {
    bpm: 120,
    beatOffset: 0,
    peaks: [],
    energyCurve: Array.from({ length: 240 }, (_, i) =>
      i < 64 || i >= 176 ? 0.15 : 0.9
    ),
    key: "Am",
    camelot: "8A",
    energy: 6,
    confidence: 0.8,
  },
})

describe("energy through the mix", () => {
  it("scores two quiet sides as a hole and anything louder as fine", () => {
    expect(quietOverlap(0.1, 0.1)).toBeGreaterThan(0.5)
    expect(quietOverlap(0.1, 0.6)).toBe(0)
    expect(quietOverlap(null, 0.1)).toBe(0)
  })
  it("doesn't blend an outro into an intro when a louder pairing exists", () => {
    const out = shaped("out"),
      incoming = shaped("in")
    for (const [intent, pace] of [
      ["maintain", "full"],
      ["maintain", "dj"],
      ["lift", "quick"],
    ] as const) {
      const blend = planTransitions(out, incoming, 120, {
        intent,
        pace,
      }).find((plan) => plan.id === "blend")!
      expect(
        quietOverlap(
          sectionEnergy(out, blend.outStart, blend.duration),
          sectionEnergy(incoming, blend.inStart, blend.duration * blend.rate)
        )
      ).toBe(0)
    }
  })
  it("needs 8 bars for a bass swap", () => {
    expect(swapTooShort("bass", 4 * 4 * 0.5, 0.5)).toBe(true)
    expect(swapTooShort("bass", 8 * 4 * 0.5, 0.5)).toBe(false)
    expect(swapTooShort("echo", 2, 0.5)).toBe(false)
    // Four bars before the end of the track: no bass swap is offered there.
    const out = shaped("out")
    const late = planTransitions(out, shaped("in"), 240 - 4 * 4 * 0.5 - 1)
    expect(late.some((plan) => ["bass", "long"].includes(plan.execution))).toBe(
      false
    )
  })
})
