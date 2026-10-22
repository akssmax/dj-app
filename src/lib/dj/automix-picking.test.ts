import { describe, expect, it } from "vitest"
import { demoTracks } from "./tracks"
import { lastLoudPhraseEnd, planTransitions } from "./planner"
import { followFit, recommendTracks } from "./library-scope"
import type { Track } from "./types"

const base: Track = {
  ...demoTracks[0],
  duration: 300,
  bpm: 128,
  camelot: "8B",
  key: "C maj",
  energy: 5,
  analysis: {
    peaks: [0.5],
    energyCurve: [],
    bpm: 128,
    beatOffset: 0,
    key: "C maj",
    camelot: "8B",
    energy: 5,
    confidence: 0.8,
  },
}
/** One loudness value per second, from a function of time. */
const shaped = (
  level: (second: number) => number,
  extra: Partial<Track> = {}
) =>
  ({
    ...base,
    ...extra,
    analysis: {
      ...base.analysis!,
      energyCurve: Array.from({ length: 300 }, (_, t) => level(t)),
    },
  }) as Track

describe("outro-first exits", () => {
  const phrase = (60 / 128) * 64 // 30 s
  it("finds the end of the last loud phrase", () => {
    // Loud body until 210 s, quiet outro after.
    const track = shaped((t) => (t < 210 ? 0.8 : 0.2))
    expect(lastLoudPhraseEnd(track, 0, phrase)).toBe(210)
  })
  it("exits after the last drop instead of on a mid-track breakdown", () => {
    // Breakdown at 150–180 s is the quietest section before the outro, but
    // the drop returns until 240 s; the exit must wait for the outro.
    const out = shaped((t) =>
      t >= 150 && t < 180 ? 0.15 : t < 240 ? 0.85 : 0.3
    )
    const incoming = shaped(() => 0.6, { id: "next" })
    const [plan] = planTransitions(out, incoming, 0)
    expect(plan.outStart).toBeGreaterThanOrEqual(240)
    expect(plan.reasons.join(" ")).toContain("outro")
  })
  it("exits as late as possible when the track stays loud to the end", () => {
    const out = shaped(() => 0.8)
    const incoming = shaped(() => 0.6, { id: "next" })
    const plans = planTransitions(out, incoming, 0)
    const blend = plans.find((plan) => plan.id === "blend")!
    expect(blend.outStart + blend.duration).toBeGreaterThanOrEqual(
      out.duration - phrase
    )
  })
})

describe("lookahead track picking", () => {
  const out = { ...base, id: "out", artist: "Artist A" }
  const make = (id: string, extra: Partial<Track>) => ({
    ...base,
    id,
    title: id,
    artist: `Artist ${id}`,
    ...extra,
  })

  it("rates follow-ups by tempo, key and energy direction", () => {
    const near = make("near", { bpm: 129, camelot: "9B", energy: 6 })
    const far = make("far", { bpm: 100, camelot: "3A", energy: 2 })
    expect(followFit(out, near, "lift")).toBeGreaterThan(
      followFit(out, far, "lift")
    )
  })

  it("prefers a pick that leaves good next moves", () => {
    // Both candidates mix equally well from the current track; only one
    // leads somewhere: the rest of the pool sits near 6A.
    const bridge = make("bridge", { camelot: "7B" })
    const deadEnd = make("deadend", { camelot: "9B" })
    const pool = [
      bridge,
      deadEnd,
      make("x", { camelot: "6B" }),
      make("y", { camelot: "6B" }),
    ]
    const withLookahead = recommendTracks(out, pool, undefined, 1, "maintain", {
      lookahead: true,
      limit: 4,
    })
    const ids = withLookahead.map((r) => r.track.id)
    expect(ids.indexOf("bridge")).toBeLessThan(ids.indexOf("deadend"))
    expect(withLookahead[0].reason).toContain("follow-ups")
  })

  it("ranks the same artist back to back lower", () => {
    const same = make("same", { artist: "Artist A" })
    const other = make("other", {})
    const [first] = recommendTracks(
      out,
      [same, other],
      undefined,
      1,
      "maintain"
    )
    expect(first.track.id).toBe("other")
  })
})
