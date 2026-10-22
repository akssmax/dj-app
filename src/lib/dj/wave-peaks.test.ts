import { describe, expect, it } from "vitest"
import { measureBands, measurePeaks, waveColumns } from "./wave-peaks"

const sine = (hz: number, seconds = 1, rate = 44100) =>
  Float32Array.from(
    { length: rate * seconds },
    (_, i) => 0.8 * Math.sin((2 * Math.PI * hz * i) / rate)
  )
const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length

describe("measureBands", () => {
  it("aligns band windows with peak windows", () => {
    const tone = sine(440)
    const bands = measureBands([tone], 44100)
    const peaks = measurePeaks([tone], 44100)
    for (const band of [bands.rms, bands.low, bands.mid, bands.high])
      expect(band).toHaveLength(peaks.length)
  })

  it("puts a 60 Hz tone in the low band", () => {
    const bands = measureBands([sine(60)], 44100)
    expect(mean(bands.low)).toBeGreaterThan(mean(bands.mid) * 2)
    expect(mean(bands.low)).toBeGreaterThan(mean(bands.high) * 2)
  })

  it("puts an 800 Hz tone in the mid band", () => {
    const bands = measureBands([sine(800)], 44100)
    expect(mean(bands.mid)).toBeGreaterThan(mean(bands.low) * 2)
    expect(mean(bands.mid)).toBeGreaterThan(mean(bands.high))
  })

  it("puts an 8 kHz tone in the high band", () => {
    const bands = measureBands([sine(8000)], 44100)
    expect(mean(bands.high)).toBeGreaterThan(mean(bands.low) * 4)
    expect(mean(bands.high)).toBeGreaterThan(mean(bands.mid) * 2)
  })
})

describe("waveColumns", () => {
  const tone = sine(120, 4)
  const peaks = measurePeaks([tone], 44100),
    bands = measureBands([tone], 44100)

  it("returns one normalized column per pixel", () => {
    const columns = waveColumns(peaks, bands, 4, 0, 4, 300)
    expect(columns).toHaveLength(300)
    for (const column of columns) {
      expect(column).not.toBeNull()
      for (const value of Object.values(column!)) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })

  it("leaves time outside the track empty for the centered view", () => {
    const columns = waveColumns(peaks, bands, 4, -2, 2, 100)
    expect(columns.slice(0, 49).every((column) => column === null)).toBe(true)
    expect(columns.slice(51).every((column) => column !== null)).toBe(true)
  })

  it("falls back to peak levels without band data", () => {
    const [column] = waveColumns(peaks, undefined, 4, 1, 1.5, 1)
    expect(column!.peak).toBeGreaterThan(0.7)
    expect(column!.low).toBe(0)
  })
})
