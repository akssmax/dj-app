import { describe, expect, it } from "vitest"
import { demoTracks } from "./tracks"
import {
  familyFromAnalysis,
  familyFromTag,
  pairProfile,
  profileBonus,
} from "./genre"
import { labelSections } from "./sections"
import { exitTarget, planTransitions } from "./planner"
import type { Track } from "./types"

describe("genre families", () => {
  it("maps tags to mixing families, most specific first", () => {
    expect(familyFromTag("Tech House")).toBe("house")
    expect(familyFromTag("Afro House")).toBe("afro")
    expect(familyFromTag("Melodic House & Techno")).toBe("trance")
    expect(familyFromTag("Drum & Bass")).toBe("dnb")
    expect(familyFromTag("Electro House")).toBe("edm")
    expect(familyFromTag("Hip-Hop")).toBe("hiphop")
    expect(familyFromTag("Dubstep")).toBe("bass")
    expect(familyFromTag("Electronic")).toBeNull()
    expect(familyFromTag("")).toBeNull()
  })
  it("estimates from the audio when the tag is vague", () => {
    const base = { ...demoTracks[0], genre: "Electronic" }
    expect(familyFromAnalysis({ ...base, bpm: 174 }).family).toBe("dnb")
    const sung = {
      ...base,
      bpm: 95,
      analysis: { ...base.analysis!, vocals: Array(100).fill(0.8) },
    } as Track
    expect(familyFromAnalysis(sung).family).toBe("hiphop")
  })
  it("merges two styles for a genre jump", () => {
    const house = { ...demoTracks[0], genre: "House" }
    const rap = { ...demoTracks[1], genre: "Hip-Hop" }
    const same = pairProfile(house, { ...house, id: "x" })
    expect(same.crossGenre).toBe(false)
    expect(same.blendBars).toBe(16)
    const jump = pairProfile(house, rap)
    expect(jump.crossGenre).toBe(true)
    expect(jump.blendBars).toBe(8)
    expect(jump.longBars).toBeNull()
    expect(jump.songMode).toBe(true)
    expect(profileBonus(jump, "echo")).toBeGreaterThan(
      profileBonus(jump, "long")
    )
  })
})

/** 240 s at 128 BPM with a labelled arrangement. */
function arranged(id: string, genre = "House", bpm = 128): Track {
  const duration = 240
  const plan: [number, number, number, number][] = [
    // start, end, loudness, bass
    [0, 30, 0.35, 0.8],
    [30, 100, 0.9, 1],
    [100, 130, 0.5, 0.15],
    [130, 140, 0.6, 0.8],
    [140, 200, 0.95, 1],
    [200, 240, 0.4, 0.8],
  ]
  const at = (t: number, index: 2 | 3) =>
    plan.find(([s, e]) => t >= s && t < e)?.[index] ?? 0.3
  return {
    ...demoTracks[0],
    id,
    genre,
    bpm,
    duration,
    camelot: "8A",
    analysis: {
      peaks: Array(duration * 50).fill(0.5),
      energyCurve: Array.from({ length: duration }, (_, t) => at(t, 2)),
      bands: {
        rms: Array(duration * 50).fill(0.5),
        low: Array.from({ length: duration * 50 }, (_, i) => at(i / 50, 3)),
        mid: Array(duration * 50).fill(0.5),
        high: Array(duration * 50).fill(0.5),
      },
      vocals: Array(duration).fill(0),
      sections: [30, 100, 130, 140, 200],
      phraseOffset: 0,
      bpm,
      beatOffset: 0,
      key: "A minor",
      camelot: "8A",
      energy: 6,
      confidence: 0.6,
    },
  }
}

describe("section labels", () => {
  it("labels intro, drops, breakdown, build and outro", () => {
    expect(labelSections(arranged("a")).map((s) => s.label)).toEqual([
      "intro",
      "drop",
      "breakdown",
      "build",
      "drop",
      "outro",
    ])
  })
})

describe("structure-aware transitions", () => {
  it("offers drop swap, breakdown swap and crossover when tempos match", () => {
    const plans = planTransitions(arranged("a"), arranged("b"))
    const drop = plans.find((p) => p.id === "dropswap")!
    expect(drop.outStart).toBe(140)
    expect(drop.inStart).toBe(30)
    const swap = plans.find((p) => p.id === "breakswap")!
    // Ends exactly where the outgoing breakdown releases.
    expect(swap.outStart + swap.duration).toBeCloseTo(130, 3)
    expect(swap.inStart + swap.duration * swap.rate).toBeCloseTo(30, 3)
    expect(plans.some((p) => p.id === "crossover")).toBe(true)
  })
  it("keeps drop swap and crossover across unrelated tempos", () => {
    const plans = planTransitions(
      arranged("a", "House", 128),
      arranged("b", "Dubstep", 100)
    )
    expect(plans.some((p) => p.id === "breakswap")).toBe(false)
    expect(plans.find((p) => p.id === "dropswap")?.beatmatch).toBe(false)
    expect(plans.find((p) => p.id === "crossover")?.beatmatch).toBe(false)
  })
  it("does not start a blend over the outgoing drop", () => {
    const plans = planTransitions(arranged("a"), arranged("b"))
    const blend = plans.find((p) => p.id === "blend")!
    const drop = labelSections(arranged("a")).find(
      (s) => s.label === "drop" && s.start === 140
    )!
    const overlap = Math.max(
      0,
      Math.min(drop.end, blend.outStart + blend.duration) -
        Math.max(drop.start, blend.outStart)
    )
    expect(overlap / blend.duration).toBeLessThan(0.5)
  })
})

describe("tempo journeys", () => {
  it("rides 124 BPM up to 140 before a beatmatched blend", () => {
    const out = { ...arranged("a"), bpm: 124 },
      next = { ...arranged("b"), bpm: 140 }
    const bass = planTransitions(out, next).find((p) => p.id === "bass")!
    expect(bass.beatmatch).toBe(true)
    expect(bass.tempoRamp?.to).toBeCloseTo(140 / 124, 4)
    expect(bass.incomingRate).toBeCloseTo(1, 4)
    expect(bass.tempoRamp!.start).toBeCloseTo(
      bass.outStart - bass.tempoRamp!.bars * 4 * (60 / 124),
      3
    )
    expect(bass.reasons.join(" ")).toContain("Tempo ramp")
  })
  it("never ramps beyond the ±16% pitch range", () => {
    const plans = planTransitions(
      { ...arranged("a"), bpm: 100 },
      { ...arranged("b"), bpm: 140 }
    )
    expect(plans.every((p) => !p.tempoRamp)).toBe(true)
  })
})

describe("mix pace", () => {
  it("aims for the end of the first or second drop", () => {
    const track = arranged("a")
    expect(exitTarget(track, 0, "full", 230)).toBeNull()
    expect(exitTarget(track, 0, "quick", 230)).toBe(100)
    expect(exitTarget(track, 0, "dj", 230)).toBe(200)
    // Entered mid-track: plays at least 75 s before a DJ-pace exit.
    expect(exitTarget(track, 40, "dj", 230)).toBe(200)
  })
  it("mixes out mid-track at quick pace instead of in the outro", () => {
    const full = planTransitions(arranged("a"), arranged("b")).find(
      (p) => p.id === "blend"
    )!
    const quick = planTransitions(arranged("a"), arranged("b"), 0, {
      pace: "quick",
    }).find((p) => p.id === "blend")!
    expect(quick.pace).toBe("quick")
    expect(quick.outStart).toBeLessThan(140)
    expect(quick.outStart).toBeLessThan(full.outStart)
    expect(quick.reasons.join(" ")).toContain("quick pace")
  })
  it("enters the incoming track so its drop lands as the blend ends", () => {
    const next = arranged("b")
    const plans = planTransitions(arranged("a"), next, 0, { pace: "dj" })
    const landing = plans.find((p) =>
      p.reasons.some((r) => r.startsWith("Skips the intro"))
    )
    expect(landing).toBeDefined()
    expect(landing!.inStart + landing!.duration * landing!.rate).toBeCloseTo(
      140,
      3
    )
  })
})
