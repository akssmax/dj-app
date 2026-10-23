import { describe, expect, it } from "vitest"
import { bandLevel, logSpectrum } from "./features"
import { idlePalette, linearPalette, paletteForCamelot } from "./palettes"

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
