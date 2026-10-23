/** Node helpers shared by the analysis bench and the demo-analysis generator. */
import { join } from "node:path"
import { MPEGDecoder } from "mpg123-decoder"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import * as ort from "onnxruntime-web"
import type { BeatModelRun } from "../../src/lib/dj/beat-model"
import { MODELS } from "../../src/lib/dj/models"

export async function decodeMp3(path: string) {
  const decoder = new MPEGDecoder()
  await decoder.ready
  const { channelData, sampleRate } = decoder.decode(
    new Uint8Array(readFileSync(path))
  )
  decoder.free()
  return { channels: channelData, sampleRate }
}

/** The beat model, cached under scripts/bench/.cache (git-ignored). */
export async function beatModel(): Promise<BeatModelRun | undefined> {
  if (process.env.BENCH_MODEL === "off") return undefined
  const dir = join("scripts", "bench", ".cache"),
    file = join(dir, `${MODELS.beats.id}.onnx`)
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true })
    const response = await fetch(MODELS.beats.url)
    writeFileSync(file, new Uint8Array(await response.arrayBuffer()))
  }
  const session = await ort.InferenceSession.create(
    new Uint8Array(readFileSync(file))
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
}
