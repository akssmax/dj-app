import { describe, expect, it } from "vitest"
import { demoTracks } from "./tracks"
import type { Track } from "./types"
import {
  cuePairPlan,
  discoverTransitions,
  upcomingPairs,
} from "./transition-explorer"
import { cueOptions } from "./cue-suggestions"
import { sectionEnergy } from "./planner"
import { recommendTracks, scopedTracks } from "./library-scope"
import { defaultDatabase } from "./storage"

const track: Track = {
  ...demoTracks[0],
  duration: 240,
  bpm: 120,
  camelot: "8A",
  energy: 5,
  analysis: {
    bpm: 120,
    beatOffset: 0,
    peaks: [],
    energyCurve: Array.from({ length: 240 }, (_, i) => (i < 96 ? 0.3 : 0.8)),
    key: "Am",
    camelot: "8A",
    energy: 5,
    confidence: 0.7,
  },
}
const next: Track = { ...track, id: "next", title: "Next" }

describe("transition exploration", () => {
  it("compares cues throughout both tracks and retains named and memory cues", () => {
    const choices = discoverTransitions(
      { ...track, memoryCues: [17.5] },
      next,
      {
        outCues: [41.2],
        outLabels: ["Hook"],
        inCues: [89.1],
        inLabels: ["Verse"],
      }
    )
    const bass = choices.find((choice) => choice.plan.id === "bass")!
    expect(
      bass.pairs.some(
        (pair) => pair.out.position === 41.2 && pair.incoming.position === 89.1
      )
    ).toBe(true)
    expect(
      bass.exits.some((cue) => cue.position === 17.5 && cue.source === "saved")
    ).toBe(true)
    expect(bass.entries.some((cue) => cue.position > next.duration / 2)).toBe(
      true
    )
    expect(
      bass.pairs.find((pair) => pair.out.position === 41.2)?.out.label
    ).toContain("Hook")
    const options = cueOptions(track, [0], ["Intro"], "entry")
    expect(options.filter((cue) => cue.position === 0)).toHaveLength(1)
  })
  it("keeps every executable cue pair within both track endings and materializes its exact anchors", () => {
    const choices = discoverTransitions(track, next, {
      outRate: 1.04,
      incomingRate: 1.04,
    })
    for (const choice of choices)
      for (const pair of choice.pairs) {
        const plan = cuePairPlan(track, next, pair, {
          outRate: 1.04,
          incomingRate: 1.04,
        })!
        expect(plan).toBeDefined()
        expect(plan.outStart).toBe(pair.out.position)
        expect(plan.inStart).toBe(pair.incoming.position)
        expect(plan.outStart + plan.duration).toBeLessThan(track.duration)
        expect(plan.inStart + plan.duration * plan.rate).toBeLessThan(
          next.duration
        )
        expect(plan.duration / 1.04).toBeCloseTo(pair.duration)
        expect(Number.isFinite(pair.score)).toBe(true)
      }
  })
  it("ranks aligned cues above off-bar cues and hides passed exits for live recommendations", () => {
    const choice = discoverTransitions(track, next, {
      outCues: [64, 64.5],
      inCues: [32],
      outLabels: [],
      inLabels: [],
    }).find((item) => item.plan.id === "bass")!
    const aligned = choice.pairs.find(
      (pair) => pair.out.position === 64 && pair.incoming.position === 32
    )!
    const offBar = choice.pairs.find(
      (pair) => pair.out.position === 64.5 && pair.incoming.position === 32
    )!
    expect(aligned.phaseError).toBe(0)
    expect(aligned.score).toBeGreaterThan(offBar.score)
    expect(
      upcomingPairs(choice, 120).every((pair) => pair.out.position >= 119.99)
    ).toBe(true)
    expect(upcomingPairs(choice, track.duration)).toEqual([])
  })
  it("uses only native-tempo routines when tempos are distant or unknown", () => {
    for (const bpm of [null, 72]) {
      const choices = discoverTransitions(track, { ...next, bpm })
      expect(choices.length).toBeGreaterThan(0)
      expect(choices.every((choice) => !choice.plan.beatmatch)).toBe(true)
      expect(choices.some((choice) => choice.plan.execution === "echo")).toBe(
        true
      )
    }
  })
  it("handles corrupt loudness samples and avoids calling missing data a measured quiet section", () => {
    const malformed = {
      ...track,
      analysis: { ...track.analysis!, energyCurve: [NaN, Infinity, 0.5, 1] },
    }
    expect(sectionEnergy(malformed, 0, 2)).toBeNull()
    expect(sectionEnergy(malformed, 2, 2)).toBe(0.75)
    const choices = discoverTransitions(
      { ...track, analysis: undefined },
      { ...next, analysis: undefined }
    )
    expect(
      choices
        .flatMap((choice) => choice.pairs)
        .every((pair) =>
          pair.reasons.every((reason) => !reason.includes("measured"))
        )
    ).toBe(true)
  })
  it("bounds suggested grids on long recordings without discarding saved cues", () => {
    const long = { ...track, duration: 72000 }
    const cues = cueOptions(long, [71990], ["Finale"], "exit")
    expect(cues.length).toBeLessThan(103)
    expect(
      cues.some((cue) => cue.position === 71990 && cue.label.includes("Finale"))
    ).toBe(true)
    expect(
      cues.some((cue) => cue.position > 70000 && cue.source === "grid")
    ).toBe(true)
  })
  it("ranks unique songs only in the selected collection and offers future cue plans", () => {
    const other = { ...next, id: "excluded", title: "Outside folder" }
    const db = {
      ...defaultDatabase,
      collections: [
        {
          id: "crate",
          name: "Crate",
          kind: "playlist" as const,
          trackIds: [track.id, next.id],
          createdAt: 0,
        },
      ],
    }
    const pool = scopedTracks([track, next, other], db, "collection:crate")
    const result = recommendTracks(
      track,
      [...pool, next],
      undefined,
      1,
      "maintain",
      {
        position: 130,
        cues: { [next.id]: [64] },
        labels: { [next.id]: ["Break"] },
      }
    )
    expect(result.map((item) => item.track.id)).toEqual([next.id])
    expect(result[0].choices.length).toBeGreaterThan(1)
    expect(result[0].plan.outStart).toBeGreaterThanOrEqual(130)
    expect(
      result[0].choices.some(({ choice }) =>
        choice.entries.some((cue) => cue.label.includes("Break"))
      )
    ).toBe(true)
    expect(recommendTracks(track, pool, next.id, 1, "maintain")).toEqual([])
    expect(recommendTracks(track, [], undefined, 1, "maintain")).toEqual([])
  })
})
