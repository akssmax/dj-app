import { describe, expect, it } from "vitest"
import { automationControls, automationFrame } from "./automation"
import { bassExchangeAt, planTransitions } from "./planner"
import { matchLoudness, measureLoudness } from "./loudness"
import { demoTracks } from "./tracks"
import { emptyDeck, deckMixGain, DJEngine } from "./engine"

const source = { ...demoTracks[0], duration: 240, bpm: 120, camelot: "8A" }
const next = { ...source, id: "next" }
const plans = planTransitions(source, next, 0, { outCue: 32, inCue: 16 })
const getPlan = (id: string) => plans.find((p) => p.id === id)!
const saved = emptyDeck()
function pcm(amplitude: number, seconds = 40, phaseReverse = false) {
  const sampleRate = 1000
  const data = Array.from({ length: 2 }, (_channel, c) =>
    Float32Array.from(
      { length: sampleRate * seconds },
      (_, i) =>
        amplitude * Math.sin(i * 0.1) * (c === 1 && phaseReverse ? -1 : 1)
    )
  )
  return {
    length: data[0].length,
    sampleRate,
    numberOfChannels: 2,
    getChannelData: (channel: number) => data[channel],
  }
}

describe("channel mixing recipes", () => {
  it("fades the channels through equal power without touching EQ", () => {
    const plan = getPlan("fade")
    const middle = automationFrame(plan, 0.5)
    expect(middle.outFader ** 2 + middle.inFader ** 2).toBeCloseTo(1)
    const control = automationControls(
      plan,
      0.5,
      { ...saved, low: -4, mid: 3, high: 2 },
      true,
      0.8,
      -2
    )
    expect(control).toMatchObject({ low: -4, mid: 3, high: 2, trim: -2 })
    expect(control.volume).toBeCloseTo(0.8 / Math.SQRT2)
    expect(plan.bars).toBe(8)
    expect(plan.beatmatch).toBe(true)
  })
  it("makes space before returning the incoming bass on a musical boundary", () => {
    const plan = getPlan("bass"),
      swap = plan.bassSwapAt!
    expect((plan.outStart + plan.duration * swap) / 2).toBeCloseTo(
      Math.round((plan.outStart + plan.duration * swap) / 2)
    )
    const before = automationFrame(plan, swap - 0.04)
    const at = automationFrame(plan, swap)
    const after = automationFrame(plan, swap + 0.04)
    expect(before.inLow).toBe(1)
    expect(before.outLow).toBe(0)
    expect(at.inLow).toBe(1)
    expect(at.outLow).toBe(1)
    expect(after.inLow).toBe(0)
    expect(after.outLow).toBe(1)
    expect(before.outFader).toBe(1)
    expect(before.inFader).toBeGreaterThan(0.6)
  })
  it("exchanges HI then MID then LOW for long blends and clears the outgoing channel", () => {
    const plan = getPlan("long")
    expect(plan.execution).toBe("long")
    const early = automationControls(plan, 0.2, saved, false, 0.8, 0)
    const middle = automationControls(plan, 0.55, saved, false, 0.8, 0)
    const end = automationControls(plan, 1, saved, false, 0.8, 0)
    expect(early.high).toBeGreaterThan(early.mid)
    expect(early.low).toBe(-12)
    expect(middle.high).toBe(0)
    expect(middle.mid).toBe(0)
    expect(middle.low).toBe(-12)
    expect(end).toMatchObject({ low: 0, mid: 0, high: 0, volume: 0.8 })
    expect(automationControls(plan, 1, saved, true, 0.8, 0).volume).toBe(0)
  })
  it("keeps shortened and off-grid bass exchanges inside the mix", () => {
    for (const start of [0, 7.13, 23.5])
      for (const duration of [1, 8, 24, 64]) {
        const at = bassExchangeAt(start, duration, 128, 0.25, true)
        expect(at).toBeGreaterThanOrEqual(0.6)
        expect(at).toBeLessThanOrEqual(0.85)
      }
  })
  it("preserves incoming tempo and bounds every scheduled control across all recipes", () => {
    for (const plan of plans)
      for (let n = 0; n <= 256; n++) {
        const value = automationControls(
          plan,
          n / 256,
          { ...saved, low: -12, mid: -10, high: 12 },
          false,
          0.8,
          -3
        )
        expect(value.rate).toBe(plan.incomingRate)
        expect(value.volume).toBeGreaterThanOrEqual(0)
        expect(value.volume).toBeLessThanOrEqual(0.8)
        for (const band of ["low", "mid", "high"] as const) {
          expect(value[band]).toBeGreaterThanOrEqual(-12)
          expect(value[band]).toBeLessThanOrEqual(12)
        }
      }
  })
  it("keeps channel gain at unity with the crossfader centered after a handoff", () => {
    const engine = new DJEngine()
    try {
      engine.state.channelMix = true
      engine.state.A.volume = 0
      engine.state.B.volume = 0.8
      expect(deckMixGain(engine.state, "B")).toBeCloseTo(0.8)
      expect(deckMixGain(engine.state, "A")).toBe(0)
    } finally {
      engine.dispose()
    }
  })
})

describe("measured section levels and headroom", () => {
  const plan = { ...getPlan("fade"), outStart: 0, inStart: 0 }
  it("measures stereo power without phase cancellation", () => {
    expect(measureLoudness(pcm(0.2, 40, true), 0, 8).rms).toBeCloseTo(
      measureLoudness(pcm(0.2), 0, 8).rms
    )
  })
  it("matches a track that is 6dB louder without changing the reference level", () => {
    const a = pcm(0.1),
      b = pcm(0.2)
    const levels = matchLoudness(
      a,
      b,
      plan,
      { out: saved, incoming: saved },
      0.8
    )
    expect(levels.matched).toBe(true)
    expect(levels.inTrim - levels.outTrim).toBeCloseTo(-6.0206, 3)
    expect(levels.outTrim).toBe(0)
  })
  it("samples the selected section rather than the entire track's average", () => {
    const a = pcm(0.1),
      b = pcm(0.2)
    for (let c = 0; c < 2; c++) b.getChannelData(c).fill(0.01, 0, 8000)
    const levels = matchLoudness(
      a,
      b,
      { ...plan, inStart: 12 },
      { out: saved, incoming: saved },
      0.8
    )
    expect(levels.inTrim).toBeCloseTo(-6.0206, 2)
  })
  it("caps boosts and never amplifies silence or very short sections", () => {
    const loud = pcm(0.1),
      quiet = pcm(0.00002)
    const boosted = matchLoudness(
      loud,
      quiet,
      plan,
      { out: saved, incoming: saved },
      0.8
    )
    expect(boosted.inTrim).toBeLessThanOrEqual(6)
    for (const b of [pcm(0), pcm(0.5, 0.05)]) {
      const levels = matchLoudness(
        loud,
        b,
        plan,
        { out: saved, incoming: saved },
        0.8
      )
      expect(levels.matched).toBe(false)
      expect(levels.inTrim).toBeLessThanOrEqual(0)
      expect(Number.isFinite(levels.inTrim)).toBe(true)
    }
  })
  it("does not let trims ratchet lower from mix to mix", () => {
    // The outgoing deck was already pulled to -11 dB; the next track at the
    // same loudness settles near unity instead of following it down.
    const levels = matchLoudness(
      pcm(0.1),
      pcm(0.1),
      plan,
      { out: { ...saved, trim: -11 }, incoming: saved },
      0.8
    )
    expect(levels.settledInTrim).toBeCloseTo(-3, 3)
    // Loud masters get overlap headroom, released after the mix.
    const loud = matchLoudness(
      pcm(0.99),
      pcm(0.99),
      plan,
      { out: saved, incoming: saved },
      1
    )
    expect(loud.inTrim).toBeLessThan(loud.settledInTrim)
    expect(loud.settledInTrim).toBeCloseTo(0, 3)
  })
  it("keeps the overlap's power-summed peak below -3dB including extreme positive EQ", () => {
    for (const recipe of [
      plan,
      { ...getPlan("bass"), outStart: 0, inStart: 0 },
    ]) {
      for (const boost of [0, 12]) {
        const original = { ...saved, low: boost, mid: boost, high: boost }
        const levels = matchLoudness(
          pcm(0.99),
          pcm(0.99),
          recipe,
          { out: original, incoming: original },
          1
        )
        for (let n = 0; n <= 256; n++) {
          const frame = automationFrame(recipe, n / 256)
          const peak = 0.99 * 10 ** ((boost * 3) / 20)
          const sum = Math.hypot(
            peak *
              10 ** (levels.outTrim / 20) *
              levels.outVolume *
              frame.outFader,
            peak * 10 ** (levels.inTrim / 20) * levels.inVolume * frame.inFader
          )
          expect(sum).toBeLessThanOrEqual(10 ** (-3 / 20) + 0.0001)
        }
      }
    }
  })
  it("leaves ordinary blends of two mastered tracks near full level", () => {
    // Two tracks peaking at -3 dBFS through the fade's overlap: a linear
    // peak sum demanded a cut; as power they fit as they are.
    const levels = matchLoudness(
      pcm(0.7),
      pcm(0.7),
      plan,
      { out: saved, incoming: saved },
      1
    )
    expect(levels.headroomDb).toBeLessThan(0.5)
  })
})

describe("stem moves", () => {
  it("moves a stem's level between two points of the transition", async () => {
    const { stemGainsAt } = await import("./automation")
    const plan = {
      stemMoves: [
        { deck: "out", stem: "vocals", from: 1, to: 0, start: 0, end: 0.4 },
        { deck: "in", stem: "vocals", from: 0, to: 1, start: 0.9, end: 1 },
      ],
    } as Parameters<typeof stemGainsAt>[0]
    expect(stemGainsAt(plan, "out", 0)!.vocals).toBe(1)
    expect(stemGainsAt(plan, "out", 0.5)!.vocals).toBe(0)
    expect(stemGainsAt(plan, "out", 0.5)!.drums).toBe(1)
    expect(stemGainsAt(plan, "in", 0.5)!.vocals).toBe(0)
    expect(stemGainsAt(plan, "in", 1)!.vocals).toBe(1)
  })
})
