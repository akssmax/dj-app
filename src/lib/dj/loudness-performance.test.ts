import { describe, expect, it, vi } from "vitest"
import { measureLoudness, prepareLoudness } from "./loudness"

function fixture() {
  const sampleRate = 44100
  const channels = Array.from({ length: 2 }, (_, c) =>
    Float32Array.from(
      { length: sampleRate * 4 },
      (_sample, i) => (c ? -1 : 1) * 0.2 * Math.sin(i * 0.07)
    )
  )
  channels[1][channels[1].length - 1] = 0.9
  channels[0][9000] = NaN
  let reads = 0
  const counted = channels.map(
    (samples) =>
      new Proxy(samples, {
        get(target, key) {
          if (typeof key === "string" && /^\d+$/.test(key)) reads++
          return Reflect.get(target, key, target)
        },
      })
  )
  return {
    buffer: {
      length: channels[0].length,
      sampleRate,
      numberOfChannels: channels.length,
      getChannelData: (c: number) => counted[c],
    },
    raw: {
      length: channels[0].length,
      sampleRate,
      numberOfChannels: channels.length,
      getChannelData: (c: number) => channels[c],
    },
    resetReads: () => {
      reads = 0
    },
    reads: () => reads,
  }
}

describe("prepared section loudness", () => {
  it("keeps exact stereo RMS and whole-track peaks while bounding hot-path sample reads", async () => {
    const source = fixture()
    const yieldTask = vi.fn(async () => {})
    expect(await prepareLoudness(source.buffer, () => true, yieldTask)).toBe(
      true
    )
    expect(yieldTask).toHaveBeenCalled()
    for (const [start, duration] of [
      [0.137, 2.237],
      [0, 4],
      [3.999, 8],
      [1.1, 0.013],
      [8, 2],
      [0.5, -2],
    ]) {
      source.resetReads()
      const actual = measureLoudness(source.buffer, start, duration)
      const expected = measureLoudness(source.raw, start, duration)
      expect(actual.rms).toBeCloseTo(expected.rms, 10)
      expect(actual.peak).toBe(expected.peak)
      expect(actual.usable).toBe(expected.usable)
      expect(source.reads()).toBeLessThan(4096 * 2 * 2 * 2)
    }
  })
  it("abandons a replaced deck without caching incomplete peak protection", async () => {
    const source = fixture()
    let current = true
    const prepared = await prepareLoudness(
      source.raw,
      () => current,
      async () => {
        current = false
      }
    )
    expect(prepared).toBe(false)
    expect(measureLoudness(source.raw, 0, 1).peak).toBeCloseTo(0.9)
  })
})
