import * as ort from "onnxruntime-web/wasm"
import { analyzeTrack, refreshStructure } from "./analyze"
import type { BeatModelRun } from "./beat-model"
import { loadModel, MODELS } from "./models"

// The WebAssembly runtime is bundled with the app (no CDN); one thread
// avoids needing cross-origin isolation.
ort.env.wasm.numThreads = 1

/** The beat-tracking model, or undefined when it can't load (offline). */
async function beatModel(): Promise<BeatModelRun | undefined> {
  try {
    const session = await ort.InferenceSession.create(
      await loadModel(MODELS.beats),
      { executionProviders: ["wasm"] }
    )
    return async (spect, frames) => {
      const out = await session.run({
        [session.inputNames[0]]: new ort.Tensor("float32", spect, [
          1,
          frames,
          128,
        ]),
      })
      return {
        beat: out.beat.data as Float32Array,
        downbeat: out.downbeat.data as Float32Array,
      }
    }
  } catch {
    return undefined
  }
}

self.onmessage = async (
  event: MessageEvent<{
    samples?: Float32Array
    channels?: Float32Array[]
    sampleRate: number
    waveformOnly?: boolean
    bpm?: number | null
    beatOffset?: number
    /** Use the downloaded beat-tracking model (default on). */
    useModels?: boolean
  }>
) => {
  const { sampleRate } = event.data
  const channels = event.data.channels ?? [event.data.samples!]
  if (event.data.waveformOnly) {
    self.postMessage(
      refreshStructure(
        channels,
        sampleRate,
        event.data.bpm ?? null,
        event.data.beatOffset ?? 0
      )
    )
    return
  }
  const model = event.data.useModels === false ? undefined : await beatModel()
  self.postMessage(await analyzeTrack(channels, sampleRate, model))
}
