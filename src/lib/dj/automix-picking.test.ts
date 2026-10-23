import { describe, expect, it } from "vitest"
import { demoTracks } from "./tracks"
import {
  lastLoudPhraseEnd,
  planTransitions,
  techniqueReadiness,
} from "./planner"
import { followFit, recommendTracks } from "./library-scope"
import { gridConfidence } from "./structure"
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

describe("vocal-aware transitions", () => {
  // 300 s tracks at 128 BPM: a 16-bar blend lasts 30 s.
  const sung = (from: number, to: number) =>
    Array.from({ length: 300 }, (_, t) => (t >= from && t < to ? 0.9 : 0))
  const withVocals = (vocals: number[], extra: Partial<Track> = {}) =>
    ({
      ...shaped((t) => (t < 240 ? 0.8 : 0.3)),
      ...extra,
      analysis: {
        ...shaped((t) => (t < 240 ? 0.8 : 0.3)).analysis!,
        vocals,
      },
    }) as Track

  it("blends on instrumental parts instead of voice over voice", () => {
    // Outgoing sings until 240 s; incoming starts singing at 32 s.
    const out = withVocals(sung(0, 240))
    const incoming = withVocals(sung(32, 300), { id: "next" })
    const bass = planTransitions(out, incoming, 0).find((p) => p.id === "bass")!
    expect(bass.outStart).toBeGreaterThanOrEqual(240)
    expect(bass.vocalClash).toBeLessThan(0.08)
    expect(bass.reasons.join(" ")).toContain("No vocal overlap")
  })

  it("prefers a short exit when voices would overlap anyway", () => {
    const out = withVocals(sung(0, 300))
    const incoming = withVocals(sung(0, 300), { id: "next" })
    const plans = planTransitions(out, incoming, 0)
    const long = plans.find((p) => p.id === "long")
    const blend = plans.find((p) => p.id === "blend")!
    expect(blend.vocalClash).toBeGreaterThan(0.5)
    expect(blend.warnings.join(" ")).toContain("overlap")
    // A cut or echo exit should now outrank any long overlap.
    const short = plans.find((p) => p.id === "cut" || p.id === "echo")!
    expect(short.score).toBeGreaterThan(blend.score)
    if (long) expect(short.score).toBeGreaterThan(long.score)
  })

  it("aligns phrases to the detected phrase offset", () => {
    const out = withVocals(sung(0, 0))
    const shifted = {
      ...out,
      analysis: { ...out.analysis!, phraseOffset: 7.5 },
    } as Track
    const incoming = withVocals(sung(0, 0), { id: "next" })
    const bass = planTransitions(shifted, incoming, 0).find(
      (p) => p.id === "bass"
    )!
    const phrase = (60 / 128) * 64
    const fromOrigin = (bass.outStart - 7.5) / phrase
    expect(Math.abs(fromOrigin - Math.round(fromOrigin))).toBeLessThan(0.001)
  })
})

describe("pair-aware auto pick", () => {
  // Quiet 20 s intro, full body, quiet outro from 240 s.
  const arranged = (extra: Partial<Track> = {}) =>
    shaped((t) => (t < 20 ? 0.3 : t < 240 ? 0.85 : 0.3), {
      genre: "House",
      ...extra,
    })
  const top = (intent: "maintain" | "lift" | "ease") =>
    planTransitions(arranged(), arranged({ id: "next" }), 0, { intent })[0]

  it("lets the energy goal change the routine, not only the score", () => {
    expect(["bass", "blend"]).toContain(top("maintain").id)
    expect(["filter", "dropswap", "cut", "echo", "loop"]).toContain(
      top("lift").id
    )
    expect(["long", "reverb", "crossover", "blend"]).toContain(top("ease").id)
  })

  it("explains every score with labelled parts around a neutral 60", () => {
    for (const plan of planTransitions(arranged(), arranged({ id: "n" }), 0)) {
      const sum = 60 + plan.scoreParts!.reduce((s, p) => s + p.value, 0)
      expect(plan.score).toBe(Math.round(Math.min(98, Math.max(1, sum))))
    }
  })

  it("marks the harmonic blend as a quality of a routine", () => {
    const plans = planTransitions(arranged(), arranged({ id: "n" }), 0)
    expect(plans.some((p) => p.id === "harmonic")).toBe(false)
    expect(plans.some((p) => p.keySafe)).toBe(true)
  })

  it("reports tempo and genre techniques honestly for a matched same-style pair", () => {
    const catalog = techniqueReadiness(
      planTransitions(arranged(), arranged({ id: "n" }), 0)
    )
    const status = (id: string) =>
      catalog.find((item) => item.technique.id === id)!.status
    expect(status("tempo")).toBe("Not for this pair")
    expect(status("genre")).toBe("Not for this pair")
    expect(status("harmonic")).toBe("Ready")
    expect(status("multideck")).toBe("Not supported yet")
  })
})

describe("beatgrid and key confidence", () => {
  const arranged = (extra: Partial<Track> = {}, grid?: number): Track => ({
    ...shaped((t) => (t < 20 ? 0.3 : t < 240 ? 0.85 : 0.3), {
      genre: "Techno",
      ...extra,
    }),
    ...(grid === undefined
      ? {}
      : {
          analysis: {
            ...shaped((t) => (t < 20 ? 0.3 : t < 240 ? 0.85 : 0.3)).analysis!,
            gridConfidence: grid,
          },
        }),
  })

  it("measures a steady grid as confident and a wandering one as shaky", () => {
    const steady = Array.from({ length: 32 }, (_, i) => i * 0.469)
    const wobbly = steady.map((t, i) => t + (i % 2 ? 0.09 : -0.07))
    expect(gridConfidence([128, 128, 128.4], steady)).toBeGreaterThan(0.9)
    expect(gridConfidence([128, 121, 133], wobbly)).toBeLessThan(0.5)
    expect(gridConfidence([null, null, null], [])).toBe(0)
  })

  it("drops long blends and favours short exits on a shaky grid", () => {
    const steady = planTransitions(
      arranged({}, 0.9),
      arranged({ id: "n" }, 0.9),
      0
    )
    const shaky = planTransitions(
      arranged({}, 0.3),
      arranged({ id: "n" }, 0.9),
      0
    )
    expect(steady.some((p) => p.id === "long")).toBe(true)
    expect(shaky.some((p) => p.id === "long")).toBe(false)
    const blend = shaky.find((p) => p.id === "blend")!
    expect(blend.warnings.join(" ")).toContain("unsteady")
  })

  it("does not call a blend key-safe when the key estimates are weak", () => {
    const weak = (id: string) =>
      ({
        ...arranged({ id }),
        analysis: { ...arranged().analysis!, confidence: 0.1 },
      }) as Track
    expect(
      planTransitions(weak("a"), weak("b"), 0).some((p) => p.keySafe)
    ).toBe(false)
  })
})

describe("your taste", () => {
  const arranged = (extra: Partial<Track> = {}) =>
    shaped((t) => (t < 20 ? 0.3 : t < 240 ? 0.85 : 0.3), {
      genre: "House",
      ...extra,
    })
  it("ranks a routine saved for this pair first", () => {
    const plans = planTransitions(arranged(), arranged({ id: "n" }), 0, {
      taste: { saved: "echo" },
    })
    expect(plans[0].id).toBe("echo")
    expect(plans[0].reasons[0]).toContain("saved")
  })
  it("nudges routines by your ratings for the style pair", () => {
    const plain = planTransitions(arranged(), arranged({ id: "n" }), 0)
    const liked = planTransitions(arranged(), arranged({ id: "n" }), 0, {
      taste: { ratings: { "House|filter": 2 } },
    })
    const score = (plans: typeof plain) =>
      plans.find((p) => p.id === "filter")!.score
    expect(score(liked)).toBe(Math.min(98, score(plain) + 6))
  })
})
