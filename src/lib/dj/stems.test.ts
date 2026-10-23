import { describe, expect, it } from "vitest"
import { ispec, SEGMENT, spec } from "./demucs"
import { allStemsOn, matrixWeights } from "./stem-matrix"
import { alignment, resample, stemLevels } from "./stem-audio"

describe("Demucs spectrogram", () => {
  it("reconstructs a segment exactly through _spec and _ispec", () => {
    const signal = Float32Array.from(
      { length: SEGMENT },
      (_, i) =>
        0.5 * Math.sin(i * 0.031) +
        0.2 * Math.sin(i * 0.0007) * Math.cos(i * 0.11)
    )
    const { real, imag } = spec(signal)
    const back = ispec(real, imag, SEGMENT)
    let error = 0,
      power = 0
    // Like torch, the edges lose two frames each (Demucs's design; its
    // triangular cross-fade gives them almost no weight): judge the rest.
    for (let i = SEGMENT / 12; i < (SEGMENT * 11) / 12; i++) {
      error += (back[i] - signal[i]) ** 2
      power += signal[i] ** 2
    }
    expect(10 * Math.log10(power / error)).toBeGreaterThan(100)
  })
})

describe("stem gains", () => {
  const mix = (gains: typeof allStemsOn, layout: "full" | "vocals") => {
    // original = vocals + drums + bass + melody, one sample each.
    const stems = { vocals: 0.4, drums: 0.3, bass: 0.2, melody: 0.1 }
    const original = 1
    const w = matrixWeights(gains, layout)
    return (
      original * w.original +
      stems.vocals * w.vocals +
      (layout === "full" ? stems.drums * w.drums + stems.bass * w.bass : 0)
    )
  }
  it("plays the original exactly with every stem up", () => {
    expect(mix(allStemsOn, "full")).toBeCloseTo(1)
    expect(mix(allStemsOn, "vocals")).toBeCloseTo(1)
  })
  it("removes exactly the muted stems", () => {
    expect(mix({ ...allStemsOn, vocals: 0 }, "full")).toBeCloseTo(0.6)
    expect(
      mix({ vocals: 0, drums: 0, bass: 1, melody: 0 }, "full")
    ).toBeCloseTo(0.2)
    expect(
      mix({ vocals: 1, drums: 1, bass: 1, melody: 0 }, "vocals")
    ).toBeCloseTo(0.4)
  })
})

describe("stem audio", () => {
  it("resamples a tone without changing its pitch", () => {
    const from = 44100,
      to = 48000
    const tone = Float32Array.from({ length: from }, (_, i) =>
      Math.sin((2 * Math.PI * 440 * i) / from)
    )
    const out = resample(tone, from, to)
    expect(out.length).toBe(to)
    const expected = Math.sin((2 * Math.PI * 440 * 24000) / to)
    expect(out[24000]).toBeCloseTo(expected, 2)
  })
  it("finds a codec delay by cross-correlation", () => {
    const reference = Float32Array.from(
      { length: 20000 },
      (_, i) => Math.sin(i * 0.37) * Math.sin(i * 0.011)
    )
    const delayed = new Float32Array(25000)
    delayed.set(reference, 312)
    expect(alignment(reference, delayed, 2000, 10000)).toBe(312)
  })
  it("measures per-second stem levels against the mix", () => {
    const second = 100
    const loud = Float32Array.from({ length: 2 * second }, (_, i) =>
      i < second ? 0.5 : 0
    )
    const silent = new Float32Array(2 * second)
    const levels = stemLevels(
      {
        vocals: [loud, loud],
        drums: [silent, silent],
        bass: [silent, silent],
        other: [silent, silent],
      },
      second
    )
    expect(levels.vocals[0]).toBeCloseTo(1)
    expect(levels.vocals[1]).toBe(0)
    expect(levels.drums[0]).toBe(0)
  })
})

describe("packed stems", () => {
  it("round-trips Opus packets through one buffer", async () => {
    const { packStem, unpackStem, packedBuffers } = await import("./stem-audio")
    const stem = {
      channels: 2,
      sampleRate: 48000,
      offset: 312,
      chunks: [
        { data: Uint8Array.of(1, 2, 3).buffer, timestamp: 0, key: true },
        { data: Uint8Array.of(4).buffer, timestamp: 20000, key: false },
        { data: Uint8Array.of(5, 6).buffer, timestamp: 40000, key: false },
      ],
    }
    const packed = packStem(stem)
    expect(packed.data.byteLength).toBe(6)
    expect(packedBuffers(packed)).toHaveLength(4)
    const back = unpackStem(packed)
    expect(back.offset).toBe(312)
    expect(back.chunks.map((c) => [...new Uint8Array(c.data)])).toEqual([
      [1, 2, 3],
      [4],
      [5, 6],
    ])
    expect(back.chunks.map((c) => [c.timestamp, c.key])).toEqual([
      [0, true],
      [20000, false],
      [40000, false],
    ])
  })
})
