import { describe, expect, it, vi } from "vitest"
import { analyzeAudio, analyzeTrack } from "./analyze"
import { synthTrack } from "../../../scripts/bench/synth"
import type { SynthSpec } from "../../../scripts/bench/synth"

// Synthetic tracks with exact answers (scripts/bench/synth.ts). The full
// accuracy bench is `pnpm bench:analysis`; these guard the main behaviors.
const run = (spec: SynthSpec) => {
  const { channels, sampleRate, truth } = synthTrack(spec)
  return { analysis: analyzeAudio(channels, sampleRate), truth }
}

describe("tempo, beat phase and downbeat", () => {
  it("finds beat 1 even when off-beat hats come first", () => {
    const { analysis, truth } = run({
      name: "pickup",
      bpm: 126,
      root: 9,
      mode: "minor",
      pickup: 3,
    })
    expect(analysis.bpm).toBe(126)
    const bar = 240 / 126
    const error =
      (((analysis.beatOffset - truth.downbeats[0]) % bar) + bar) % bar
    expect(Math.min(error, bar - error)).toBeLessThan(0.03)
    expect(analysis.gridConfidence).toBeGreaterThan(0.5)
  }, 20000)

  it("halves a tempo doubled by off-beat hats", () => {
    const { analysis } = run({
      name: "hiphop",
      bpm: 92,
      root: 10,
      mode: "minor",
    })
    expect(analysis.bpm).toBe(92)
  }, 20000)
})

describe("key", () => {
  it("tells a minor key from its relative major", () => {
    const { analysis } = run({ name: "dm", bpm: 132, root: 2, mode: "minor" })
    expect(analysis.camelot).toBe("7A")
  }, 20000)

  it("corrects for a master tuned a third of a semitone sharp", () => {
    const { analysis } = run({
      name: "sharp",
      bpm: 122,
      root: 3,
      mode: "minor",
      cents: 35,
    })
    expect(analysis.camelot).toBe("2A")
    expect(analysis.tuning).toBeGreaterThan(0.25)
  }, 20000)

  it("reports a key per long section", () => {
    const { analysis } = run({
      name: "sections",
      bpm: 128,
      root: 0,
      mode: "major",
    })
    expect(analysis.keySections?.length).toBeGreaterThan(1)
    expect(analysis.keySections?.every((s) => s.end > s.start)).toBe(true)
  }, 20000)
})

describe("sections", () => {
  it("places arrangement changes on the right bars", () => {
    const { analysis, truth } = run({
      name: "arr",
      bpm: 124,
      root: 9,
      mode: "minor",
    })
    const bar = 240 / 124
    const found = analysis.sections ?? []
    // Intro→drop, drop→breakdown, build→drop and drop→outro within a bar.
    for (const boundary of [0, 1, 3, 4].map((i) => truth.boundaries[i]))
      expect(found.some((t) => Math.abs(t - boundary) < bar)).toBe(true)
  }, 20000)
})

describe("beat model gating", () => {
  it("skips the model when the fast grid is confident, and can force it", async () => {
    const { channels, sampleRate, truth } = synthTrack({
      name: "house-126-F",
      bpm: 126,
      root: 5,
      mode: "major",
    })
    const getModel = vi.fn(async () => undefined)
    const quick = await analyzeTrack(channels, sampleRate, getModel)
    expect(quick.gridConfidence ?? 0).toBeGreaterThanOrEqual(0.75)
    expect(getModel).not.toHaveBeenCalled()
    expect(quick.bpm).toBe(truth.bpm)
    // Forcing the model loads it; with none available the fast grid stays.
    const forced = await analyzeTrack(channels, sampleRate, getModel, Infinity)
    expect(getModel).toHaveBeenCalledOnce()
    expect(forced.bpm).toBe(truth.bpm)
  })
})
