import { afterEach, describe, expect, it, vi } from "vitest"

const { detect } = vi.hoisted(() => ({ detect: vi.fn() }))
vi.mock("music-tempo", () => ({
  default: class {
    tempo = 120
    beats = [0.5]
    constructor(samples: Float32Array, options: Record<string, number>) {
      detect(samples, options)
    }
  },
}))
afterEach(() => {
  vi.unstubAllGlobals()
  detect.mockClear()
})
describe("analysis sample timing", () => {
  it.each([22050, 44100, 48000])(
    "uses the actual %i Hz sample rate for tempo frame timing",
    async (sampleRate) => {
      vi.resetModules()
      const worker = {
        onmessage: undefined as
          | undefined
          | ((event: {
              data: { channels: Float32Array[]; sampleRate: number }
            }) => void),
        postMessage: vi.fn(),
      }
      vi.stubGlobal("self", worker)
      await import("./analysis.worker")
      worker.onmessage!({
        data: { channels: [new Float32Array(sampleRate)], sampleRate },
      })
      const options = detect.mock.calls[0][1]
      expect(options.timeStep).toBe(options.hopSize / sampleRate)
      expect(options.hopSize).toBe(Math.round(sampleRate * 0.01))
      expect(worker.postMessage).toHaveBeenCalledOnce()
      expect(worker.postMessage.mock.calls[0][0].energyCurve).toHaveLength(1)
    }
  )
})
