import * as ort from "onnxruntime-web/webgpu"
import { separate, SAMPLE_RATE } from "./demucs"
import type { StemModelRun } from "./demucs"
import { loadModel, STEM_MODEL, STEM_MODEL_BYTES } from "./models"
import {
  encodeOpus,
  opusSupported,
  packedBuffers,
  packStem,
  stemLevels,
} from "./stem-audio"
import { chromagram, estimateKey } from "./key"
import type { KeyResult } from "./key"
import type { PackedStem, StemLevels } from "./stem-audio"

/**
 * Stem separation off the main thread: downloads the 126 MB htdemucs model
 * once, runs it on the GPU (WebGPU) when there is one and on the CPU
 * otherwise, measures stem levels for analysis and encodes the stems for
 * storage.
 *
 * In:  { channels: Float32Array[] (44.1 kHz stereo) }
 * Out: { type: "progress", stage, fraction }
 *      { type: "done", device, levels, stems }
 *      { type: "error", message }
 */
export type StemsWorkerResult = {
  type: "done"
  device: "gpu" | "cpu"
  levels: StemLevels
  /** Key from the bass and melody stems, drums removed. */
  key: KeyResult
  /** Opus-encoded vocals (stereo), drums (stereo) and bass (mono), or raw
   * 44.1 kHz audio when this browser can't encode Opus (not stored). */
  stems:
    | {
        format: "opus"
        vocals: PackedStem
        drums: PackedStem
        bass: PackedStem
      }
    | {
        format: "pcm"
        vocals: Float32Array[]
        drums: Float32Array[]
        bass: Float32Array[]
      }
}

// The WebAssembly runtime is bundled with the app; one thread avoids
// needing cross-origin isolation.
ort.env.wasm.numThreads = 1

// The fp16 input normalisation in piece 0 gives NaN on WebGPU: keep it on
// the CPU (from the model card).
const CPU_NODES = [
  "/ReduceMean",
  "/Sub",
  "/Pow",
  "/ReduceMean_1",
  "/Clip",
  "/Sqrt",
  "/Add",
  "/Div",
  "/ReduceMean_2",
  "/Sub_1",
  "/Pow_1",
  "/ReduceMean_3",
  "/Clip_1",
  "/Sqrt_1",
  "/Add_1",
  "/Div_1",
]

type Manifest = {
  pieces: { file: string; inputs: string[]; outputs: string[] }[]
}

const post = (message: unknown, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(message, transfer)

async function stemModel(): Promise<{
  run: StemModelRun
  device: "gpu" | "cpu"
}> {
  const manifest = (await (await fetch(STEM_MODEL.manifest)).json()) as Manifest
  let downloaded = 0
  const bytes: Uint8Array[] = []
  for (const piece of STEM_MODEL.pieces) {
    bytes.push(
      await loadModel(piece, (fraction) =>
        post({
          type: "progress",
          stage: "download",
          fraction: (downloaded + fraction * piece.bytes) / STEM_MODEL_BYTES,
        })
      )
    )
    downloaded += piece.bytes
  }
  const gpu =
    "gpu" in navigator &&
    !!(await (
      navigator as { gpu?: { requestAdapter: () => Promise<unknown> } }
    ).gpu
      ?.requestAdapter()
      .catch(() => null))
  // One at a time: the WebGPU provider can't create sessions in parallel.
  const sessions: ort.InferenceSession[] = []
  for (const [index, piece] of bytes.entries())
    sessions.push(
      await ort.InferenceSession.create(piece, {
        executionProviders: gpu
          ? [
              index === 0
                ? { name: "webgpu", forceCpuNodeNames: CPU_NODES }
                : "webgpu",
              "wasm",
            ]
          : ["wasm"],
        graphOptimizationLevel: "all",
      })
    )
  const run: StemModelRun = async (mix, mag) => {
    const map: Record<string, ort.Tensor> = {
      mix: new ort.Tensor("float32", mix, [1, 2, mix.length / 2]),
      mag: new ort.Tensor("float32", mag, [1, 4, 2048, mag.length / 4 / 2048]),
    }
    for (const [index, piece] of manifest.pieces.entries()) {
      const out = await sessions[index].run(
        Object.fromEntries(piece.inputs.map((name) => [name, map[name]]))
      )
      Object.assign(map, out)
      // Let the page draw between GPU submissions.
      if (gpu) await new Promise((resolve) => setTimeout(resolve, 2))
    }
    const x = (await map.x.getData()) as Float32Array,
      xt = (await map.xt.getData()) as Float32Array
    return { x, xt }
  }
  return { run, device: gpu ? "gpu" : "cpu" }
}

self.onmessage = async (
  event: MessageEvent<{
    channels: Float32Array[]
    bpm: number | null
    beatOffset: number
  }>
) => {
  try {
    const { run, device } = await stemModel()
    const stems = await separate(event.data.channels, run, (fraction) =>
      post({ type: "progress", stage: "separate", fraction })
    )
    const levels = stemLevels(stems, SAMPLE_RATE)
    // Key without drums: bass plus melody, phrases every 4 bars.
    const harmonic = [0, 1].map((c) =>
      Float32Array.from(stems.other[c], (v, i) => v + stems.bass[c][i])
    )
    const gram = chromagram(harmonic, SAMPLE_RATE)
    const { bpm, beatOffset } = event.data
    const phraseStarts: number[] = []
    if (bpm)
      for (
        let t = beatOffset;
        t < harmonic[0].length / SAMPLE_RATE;
        t += (240 / bpm) * 4
      )
        phraseStarts.push(t)
    const key = estimateKey(gram, 0, gram.chroma.length, phraseStarts)
    post({ type: "progress", stage: "store", fraction: 0 })
    const bass = [
      Float32Array.from(stems.bass[0], (v, i) => (v + stems.bass[1][i]) / 2),
    ]
    const result: StemsWorkerResult = (await opusSupported(2))
      ? {
          type: "done",
          device,
          levels,
          key,
          stems: {
            format: "opus",
            vocals: packStem(await encodeOpus(stems.vocals, SAMPLE_RATE)),
            drums: packStem(await encodeOpus(stems.drums, SAMPLE_RATE)),
            bass: packStem(await encodeOpus(bass, SAMPLE_RATE)),
          },
        }
      : {
          type: "done",
          device,
          levels,
          key,
          stems: {
            format: "pcm",
            vocals: stems.vocals,
            drums: stems.drums,
            bass,
          },
        }
    // Hand the audio over rather than copying it.
    post(
      result,
      result.stems.format === "opus"
        ? [result.stems.vocals, result.stems.drums, result.stems.bass].flatMap(
            packedBuffers
          )
        : [
            ...result.stems.vocals,
            ...result.stems.drums,
            ...result.stems.bass,
          ].map((channel) => channel.buffer as ArrayBuffer)
    )
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
