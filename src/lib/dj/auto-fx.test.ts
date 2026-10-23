import { describe, expect, it } from "vitest"
import { demoTracks } from "./tracks"
import { describeFX, planFX, primaryFX } from "./auto-fx"
import type { Track, Transition } from "./types"

const track = (extra: Partial<Track> = {}): Track => ({
  ...demoTracks[0],
  duration: 300,
  bpm: 128,
  genre: "House",
  ...extra,
})
const beat = 60 / 128,
  bar = beat * 4
const plan = (extra: Partial<Transition>): Transition => ({
  id: "bass",
  name: "Bass",
  description: "",
  labels: [],
  difficulty: 1,
  bars: 16,
  duration: bar * 16,
  outStart: 180,
  inStart: 0,
  score: 80,
  beatmatch: true,
  rate: 1,
  incomingRate: 1,
  reasons: [],
  warnings: [],
  execution: "bass",
  steps: [],
  ...extra,
})
const context = (extra: Partial<Parameters<typeof planFX>[3]> = {}) => ({
  amount: "subtle" as const,
  intent: "maintain" as const,
  recent: [],
  room: 120,
  ...extra,
})

describe("Auto-FX rules", () => {
  it("adds nothing when Auto-FX is off", () => {
    const cut = plan({ id: "cut", execution: "cut", duration: 0.08 })
    expect(planFX(cut, track(), track(), context({ amount: "off" }))).toEqual(
      []
    )
  })

  it("builds into a drop swap on the bar grid when lifting", () => {
    const drop = plan({ id: "dropswap", execution: "cut", duration: 0.08 })
    const cues = planFX(drop, track(), track(), context({ intent: "lift" }))
    expect(cues.map((c) => c.kind)).toEqual(["sweep", "riser"])
    for (const cue of cues) {
      expect(cue.at).toBeLessThan(0)
      expect(cue.at + cue.length).toBeCloseTo(0)
      expect((-cue.at / bar) % 1).toBeCloseTo(0)
    }
    expect(describeFX(cues)).toContain("8 bars")
  })

  it("adds a loop roll in the last bar when expressive", () => {
    const drop = plan({ id: "dropswap", execution: "cut", duration: 0.08 })
    const cues = planFX(
      drop,
      track(),
      track(),
      context({ amount: "expressive", intent: "lift" })
    )
    const roll = cues.find((c) => c.kind === "roll")!
    expect(roll.at).toBeCloseTo(-bar)
    expect(cues.find((c) => c.kind === "sweep")!.at).toBeCloseTo(-16 * bar)
  })

  it("skips a build without room before the transition", () => {
    const drop = plan({ id: "dropswap", execution: "cut", duration: 0.08 })
    expect(
      planFX(drop, track(), track(), context({ intent: "lift", room: bar * 2 }))
        .length
    ).toBe(0)
  })

  it("echoes out a short exit and brakes into a much slower track", () => {
    const cut = plan({
      id: "cut",
      execution: "cut",
      duration: 0.08,
      beatmatch: false,
    })
    expect(primaryFX(planFX(cut, track(), track(), context()))).toBe("echo")
    expect(primaryFX(planFX(cut, track(), track({ bpm: 90 }), context()))).toBe(
      "brake"
    )
  })

  it("opens long blends from a low-pass on the incoming deck", () => {
    const long = plan({ id: "long", execution: "long", duration: bar * 32 })
    const [cue] = planFX(long, track(), track(), context())
    expect(cue).toMatchObject({ kind: "filterIn", deck: "in", at: 0 })
  })
})

describe("Auto-FX budget", () => {
  const cut = plan({ id: "cut", execution: "cut", duration: 0.08 })
  const fx = (amount: "subtle" | "expressive", recent: string[]) =>
    primaryFX(planFX(cut, track(), track(), context({ amount, recent })))

  it("keeps Subtle to about one transition in three", () => {
    expect(fx("subtle", ["none", "none"])).toBe("echo")
    expect(fx("subtle", ["echo", "none"])).toBe("none")
    expect(fx("subtle", ["none", "echo"])).toBe("none")
  })

  it("lets Expressive use about two in three, never the same twice", () => {
    expect(fx("expressive", ["sweep", "echo"])).toBe("none")
    expect(fx("expressive", ["none", "sweep"])).toBe("echo")
    expect(fx("expressive", ["none", "echo"])).toBe("none")
  })
})
