import { describe, expect, it } from "vitest"
import { demoTracks } from "./tracks"
import {
  energyBoostMove,
  heardKeys,
  keyShiftTip,
  planTransitions,
  shiftCamelot,
} from "./planner"
import type { Track } from "./types"

const track = (extra: Partial<Track>): Track => ({
  ...demoTracks[0],
  duration: 300,
  bpm: 128,
  camelot: "8A",
  genre: "House",
  energy: 5,
  ...extra,
  analysis: {
    peaks: [0.5],
    energyCurve: Array.from({ length: 300 }, (_, t) =>
      t < 20 ? 0.3 : t < 240 ? 0.85 : 0.3
    ),
    bpm: extra.bpm ?? 128,
    beatOffset: 0,
    key: null,
    camelot: extra.camelot ?? "8A",
    energy: 5,
    confidence: 0.8,
  },
})

describe("keys as heard", () => {
  it("moves seven steps round the wheel per semitone", () => {
    expect(shiftCamelot("8A", 1)).toBe("3A")
    expect(shiftCamelot("8A", -1)).toBe("1A")
    expect(shiftCamelot("12B", 2)).toBe("2B")
  })

  it("judges keys after the tempo change, with detuning in cents", () => {
    // +1 semitone of pitch turns 8A into 3A: no longer the same key.
    expect(heardKeys("3A", "8A", 1)).toMatchObject({
      in: "3A",
      detuned: false,
      compatibility: 1,
    })
    const off = heardKeys("8A", "8A", 0.3)
    expect(off.detuned).toBe(true)
    expect(off.cents).toBe(30)
  })

  it("recognises energy-boost moves and suggests a fixing key shift", () => {
    expect(energyBoostMove("8A", "10A")).toBe("+2 Camelot")
    expect(energyBoostMove("8A", "3A")).toBe("+1 semitone")
    expect(energyBoostMove("8A", "9A")).toBeNull()
    expect(keyShiftTip("8A", "1A")).toBe(1)
  })

  it("credits an energy-boost key move when lifting the energy", () => {
    const out = track({ id: "a" }),
      next = track({ id: "b", camelot: "10A" })
    const lift = planTransitions(out, next, 0, { intent: "lift" })
    const keep = planTransitions(out, next, 0, { intent: "maintain" })
    const liftBass = lift.find((p) => p.id === "bass")!
    expect(liftBass.reasons.join(" ")).toContain("energy-boost")
    const keyPart = (plans: typeof lift) =>
      plans
        .find((p) => p.id === "bass")!
        .scoreParts!.find((p) => p.label === "Keys")?.value ?? 0
    expect(keyPart(lift)).toBeGreaterThan(keyPart(keep))
  })

  it("uses key lock to keep the source key", () => {
    // 3% faster without key lock sounds half a semitone sharp.
    const out = track({ id: "a", bpm: 128 }),
      next = track({ id: "b", bpm: 124.3 })
    const free = planTransitions(out, next, 0).find((p) => p.id === "bass")!
    const locked = planTransitions(out, next, 0, {
      inKey: { shift: 0, lock: true },
    }).find((p) => p.id === "bass")!
    expect(free.keySafe).toBe(false)
    expect(free.warnings.join(" ")).toContain("cents")
    expect(locked.keySafe).toBe(true)
  })
})

describe("tempo stretch by style", () => {
  it("stretches hip-hop less than house", () => {
    const house = planTransitions(
      track({ id: "a", bpm: 100, genre: "House" }),
      track({ id: "b", bpm: 105, genre: "House" }),
      0,
      { allowRamp: false }
    )
    const hiphop = planTransitions(
      track({ id: "a", bpm: 100, genre: "Hip-hop" }),
      track({ id: "b", bpm: 105, genre: "Hip-hop" }),
      0,
      { allowRamp: false }
    )
    expect(house.some((p) => p.beatmatch)).toBe(true)
    expect(hiphop.some((p) => p.beatmatch)).toBe(false)
  })
})
