import { SAMPLE_RATE } from "./demucs"
import { decodeOpus, unpackStem } from "./stem-audio"
import type { EncodedStem, PackedStem } from "./stem-audio"
import { libraryAudio } from "./library-analysis"
import { deleteStems, readStems, saveStems } from "./storage"
import type { StemsWorkerResult } from "./stems.worker"
import type { Track } from "./types"

/** Stems a deck plays: vocals and drums stereo, bass mono, at 44.1 kHz. */
export type DeckStems = {
  vocals: Float32Array[]
  drums: Float32Array[]
  bass: Float32Array[]
}

/** Version 1 kept every packet as its own object; version 2 packs each
 * stem into one buffer. Both still load. */
type StoredStems =
  | { version: 1; vocals: EncodedStem; drums: EncodedStem; bass: EncodedStem }
  | { version: 2; vocals: PackedStem; drums: PackedStem; bass: PackedStem }

/** Stems from browsers that can't encode Opus live for this session only. */
const sessionStems = new Map<string, DeckStems>()

export type StemProgress = {
  stage: "download" | "separate" | "store"
  fraction: number
}

/**
 * Separate a track's stems in a worker and keep them: stored as Opus on
 * this device when possible. Returns what to record on the track.
 */
export async function prepareStems(
  track: Track,
  signal: AbortSignal,
  onProgress: (progress: StemProgress) => void
): Promise<{
  stems: NonNullable<Track["stems"]>
  levels: StemsWorkerResult["levels"]
  key: StemsWorkerResult["key"]
}> {
  const blob = await libraryAudio(track, signal)
  signal.throwIfAborted()
  const context = new OfflineAudioContext(2, 1, SAMPLE_RATE)
  const buffer = await context.decodeAudioData(await blob.arrayBuffer())
  signal.throwIfAborted()
  const channels = [0, Math.min(1, buffer.numberOfChannels - 1)].map((c) =>
    buffer.getChannelData(c).slice()
  )
  const worker = new Worker(new URL("./stems.worker.ts", import.meta.url), {
    type: "module",
  })
  try {
    const result = await new Promise<StemsWorkerResult>((resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("Stems cancelled", "AbortError")),
        { once: true }
      )
      worker.onmessage = (event) => {
        const message = event.data
        if (message.type === "progress") onProgress(message)
        else if (message.type === "error") reject(new Error(message.message))
        else resolve(message)
      }
      worker.onerror = () => reject(new Error("Stem separation failed."))
      worker.postMessage(
        {
          channels,
          bpm: track.grid?.bpm ?? track.bpm,
          beatOffset: track.grid?.offset ?? track.analysis?.beatOffset ?? 0,
        },
        channels.map((c) => c.buffer)
      )
    })
    const preparedAt = new Date().toISOString()
    if (result.stems.format === "opus") {
      const record: StoredStems = {
        version: 2,
        vocals: result.stems.vocals,
        drums: result.stems.drums,
        bass: result.stems.bass,
      }
      await saveStems(track.id, record)
      sessionStems.delete(track.id)
    } else {
      sessionStems.set(track.id, {
        vocals: result.stems.vocals,
        drums: result.stems.drums,
        bass: result.stems.bass,
      })
    }
    return {
      stems: { format: result.stems.format, device: result.device, preparedAt },
      levels: result.levels,
      key: result.key,
    }
  } finally {
    worker.terminate()
  }
}

/** Resample decoded 48 kHz Opus to 44.1 kHz with the browser's resampler. */
async function to44k(channels: Float32Array[], length: number) {
  const source = new OfflineAudioContext(channels.length, 1, 48000)
  const buffer = source.createBuffer(channels.length, channels[0].length, 48000)
  channels.forEach((c, i) => buffer.copyToChannel(new Float32Array(c), i))
  const context = new OfflineAudioContext(channels.length, length, SAMPLE_RATE)
  const node = context.createBufferSource()
  node.buffer = buffer
  node.connect(context.destination)
  node.start()
  const rendered = await context.startRendering()
  return Array.from({ length: channels.length }, (_, c) =>
    rendered.getChannelData(c)
  )
}

/** A track's stems for a deck, `length` samples at 44.1 kHz; null if none. */
export async function loadDeckStems(
  track: Track,
  length: number
): Promise<DeckStems | null> {
  if (!track.stems) return null
  const cached = sessionStems.get(track.id)
  if (cached) return cached
  const stored = await readStems<StoredStems>(track.id)
  if (!stored) return null
  const encoded: EncodedStem[] =
    stored.version === 2
      ? [stored.vocals, stored.drums, stored.bass].map(unpackStem)
      : [stored.vocals, stored.drums, stored.bass]
  const [vocals, drums, bass] = await Promise.all(
    encoded.map(async (stem) => to44k(await decodeOpus(stem), length))
  )
  return { vocals, drums, bass }
}

export async function removeStems(trackId: string) {
  sessionStems.delete(trackId)
  await deleteStems(trackId)
}
