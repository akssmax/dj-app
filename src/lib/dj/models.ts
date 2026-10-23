/**
 * Machine-learning models Cue downloads once and keeps in the browser's
 * Cache Storage. All are MIT licensed (see docs/THIRD_PARTY.md); each URL is
 * pinned to a published revision so a model can't change underneath us.
 */
export type ModelInfo = {
  id: string
  url: string
  bytes: number
  license: string
  credit: string
}

export const MODELS = {
  beats: {
    id: "beat-this-small0",
    url: "https://huggingface.co/ashudesai/songbird-models/resolve/345312bf5604913b3c0d05815f93c81c4b114e4d/small0.onnx",
    bytes: 10_401_044,
    license: "MIT",
    credit:
      "Beat This! (Foscarin, Schlüter, Widmer, ISMIR 2024), CPJKU; ONNX export by ashudesai",
  },
} satisfies Record<string, ModelInfo>

/**
 * htdemucs (MIT, Meta AI) for the browser: mixed precision, split into 21
 * chained pieces so a GPU run never freezes the page (monteslu export,
 * MIT). The manifest lists each piece's inputs and outputs.
 */
const STEMS_BASE =
  "https://huggingface.co/monteslu/htdemucs-web-onnx/resolve/a4a57cc0cf707e5b9a3e6ad3c2c4b21fcbe608c1/"
export const STEM_MODEL = {
  manifest: `${STEMS_BASE}htdemucs_split_manifest.json`,
  credit:
    "Hybrid Transformer Demucs (Rouard, Massa, Défossez), Meta AI; browser ONNX export by monteslu",
  license: "MIT",
  pieces: [
    ["htdemucs_p00.onnx", 28110],
    ["htdemucs_p01.onnx", 16551977],
    ["htdemucs_p02.onnx", 293808],
    ["htdemucs_p03.onnx", 6207085],
    ["htdemucs_p04.onnx", 21052],
    ["htdemucs_p05.onnx", 36401],
    ["htdemucs_p06.onnx", 293435],
    ["htdemucs_p07.onnx", 6205601],
    ["htdemucs_p08.onnx", 16789948],
    ["htdemucs_p09.onnx", 12663168],
    ["htdemucs_p10.onnx", 12656234],
    ["htdemucs_p11.onnx", 12663251],
    ["htdemucs_p12.onnx", 12655956],
    ["htdemucs_p13.onnx", 22007636],
    ["htdemucs_p14.onnx", 5149584],
    ["htdemucs_p15.onnx", 884773],
    ["htdemucs_p16.onnx", 441716],
    ["htdemucs_p17.onnx", 184145],
    ["htdemucs_p18.onnx", 43437],
    ["htdemucs_p19.onnx", 73203],
    ["htdemucs_p20.onnx", 30725],
  ].map(([file, bytes]) => ({
    id: `htdemucs/${file}`,
    url: `${STEMS_BASE}${file}`,
    bytes,
    license: "MIT",
    credit: "htdemucs (Meta AI), monteslu ONNX export",
  })) as ModelInfo[],
}
export const STEM_MODEL_BYTES = STEM_MODEL.pieces.reduce(
  (sum, piece) => sum + piece.bytes,
  0
)

const CACHE = "cue-models-v1"

/**
 * The model's bytes: from Cache Storage when saved, otherwise downloaded and
 * saved. `onProgress` gets 0–1 while downloading.
 */
export async function loadModel(
  model: ModelInfo,
  onProgress?: (fraction: number) => void
): Promise<Uint8Array> {
  const cache =
    typeof caches === "undefined"
      ? null
      : await caches.open(CACHE).catch(() => null)
  const cached = await cache?.match(model.url)
  if (cached) {
    onProgress?.(1)
    return new Uint8Array(await cached.arrayBuffer())
  }
  const response = await fetch(model.url)
  if (!response.ok || !response.body)
    throw new Error(`Could not download ${model.id} (${response.status}).`)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onProgress?.(Math.min(1, received / model.bytes))
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  await cache
    ?.put(
      model.url,
      new Response(bytes, {
        headers: { "Content-Type": "application/octet-stream" },
      })
    )
    .catch(() => {})
  return bytes
}
