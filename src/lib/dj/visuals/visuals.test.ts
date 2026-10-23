import { describe, expect, it } from "vitest"
import { bandLevel, logSpectrum } from "./features"
import {
  blendPalettes,
  idlePalette,
  linearPalette,
  paletteForCamelot,
  rotateHue,
  themePalette,
} from "./palettes"

describe("visual palettes", () => {
  it("maps Camelot numbers to their own palette and unknown keys to idle", () => {
    expect(paletteForCamelot("8A")).toBe(7)
    expect(paletteForCamelot("12B")).toBe(11)
    expect(paletteForCamelot(null)).toBe(idlePalette)
    expect(paletteForCamelot("13A")).toBe(idlePalette)
  })
  it("converts colors to linear light", () => {
    const colors = linearPalette(0)
    expect(colors).toHaveLength(12)
    for (const value of colors) expect(value).toBeGreaterThanOrEqual(0)
    expect(Math.max(...colors)).toBeLessThanOrEqual(1)
  })
})

describe("spectrum features", () => {
  const bins = new Uint8Array(1024)
  // 48 kHz / 2048-point FFT: ~23.4 Hz per bin; fill 30–150 Hz only.
  for (let i = 2; i < 7; i++) bins[i] = 255
  it("measures energy inside a band", () => {
    expect(bandLevel(bins, 48000, 30, 150)).toBeGreaterThan(0.6)
    expect(bandLevel(bins, 48000, 5000, 14000)).toBe(0)
  })
  it("folds into log-spaced bars with bass first", () => {
    const out = logSpectrum(bins, 48000, new Uint8Array(64))
    expect(out[2]).toBeGreaterThan(0)
    expect(out[60]).toBe(0)
  })
})

describe("color modes", () => {
  const theme = {
    deckA: [1, 0, 0],
    deckB: [0, 0, 1],
    low: [0, 0.5, 0],
    mid: [0, 1, 0],
  }
  it("gives the glow to whichever deck leads the mix", () => {
    const a = themePalette(theme, 0),
      b = themePalette(theme, 1)
    expect([...a.slice(6, 9)]).toEqual([1, 0, 0])
    expect([...b.slice(6, 9)]).toEqual([0, 0, 1])
    // The shadow stays dark whatever the theme's background.
    expect(Math.max(...a.slice(0, 3))).toBeLessThan(0.1)
  })
  it("rotates hue without touching grays", () => {
    const gray = rotateHue(new Float32Array([0.4, 0.4, 0.4]), 1.3)
    for (const v of gray) expect(v).toBeCloseTo(0.4)
    const full = rotateHue(new Float32Array([0.8, 0.1, 0.3]), Math.PI * 2)
    expect(full[0]).toBeCloseTo(0.8)
  })
  it("lets an incoming deck own the highlights before the shadows", () => {
    const out = new Float32Array(12).fill(0),
      incoming = new Float32Array(12).fill(1)
    blendPalettes(
      [
        { colors: out.slice(), gain: 0.75 },
        { colors: incoming, gain: 0.25 },
      ],
      out
    )
    expect(out[9]).toBeGreaterThan(out[0])
    expect(out[9]).toBeGreaterThan(0.25)
    expect(out[0]).toBeLessThan(0.25)
  })
})
