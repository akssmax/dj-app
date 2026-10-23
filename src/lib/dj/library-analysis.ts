import { readLinkedFile } from "./linked-files"
import { analysisOutdated } from "./structure"
import { demoTracks } from "./tracks"
import type { Analysis, Track } from "./types"

/** Tracks the background queue can read without a deck: linked files that
 * are reachable, offline copies, and bundled demo audio. */
export function libraryAnalyzable(track: Track) {
  return (
    (!!track.linkedFile && track.available !== false) ||
    !!track.file ||
    (track.source === "demo" && !!track.url)
  )
}

export async function libraryAudio(
  track: Track,
  signal: AbortSignal
): Promise<Blob> {
  if (track.linkedFile) return readLinkedFile(track.linkedFile)
  if (track.file) return track.file
  if (track.url) {
    const response = await fetch(track.url, { signal })
    if (!response.ok) throw new Error("Could not read this track's audio.")
    return response.blob()
  }
  throw new Error("This track has no audio source to analyze.")
}

/**
 * How many tracks the library analyses at once: one worker per two cores,
 * up to three, and one on low-memory devices (each job holds a decoded
 * track, about 85 MB for four minutes of stereo).
 */
export function analysisConcurrency() {
  if (typeof navigator === "undefined") return 1
  const cores = navigator.hardwareConcurrency || 2
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8
  if (memory < 4) return 1
  return Math.max(1, Math.min(3, Math.floor(cores / 2)))
}

/**
 * Analysis workers kept between tracks, so the WebAssembly runtime and the
 * beat model load once per worker instead of once per track.
 */
const idleWorkers: Worker[] = []
const takeWorker = () =>
  idleWorkers.pop() ??
  new Worker(new URL("./analysis.worker.ts", import.meta.url), {
    type: "module",
  })
const returnWorker = (worker: Worker) => {
  worker.onmessage = worker.onerror = worker.onmessageerror = null
  if (idleWorkers.length < analysisConcurrency()) idleWorkers.push(worker)
  else worker.terminate()
}

/** Stop and forget the idle analysis workers (tests, and page teardown). */
export function releaseAnalysisWorkers() {
  for (const worker of idleWorkers.splice(0)) worker.terminate()
}

// Decoding never starts playback or replaces a deck.
export async function analyzeLibraryTrack(
  track: Track,
  signal: AbortSignal,
  useModels = true
) {
  const file = await libraryAudio(track, signal)
  if (file.size > 80 * 1024 * 1024)
    throw new Error(
      "File exceeds the 80 MB analysis limit. Load a deck to play it."
    )
  signal.throwIfAborted()
  const context = new OfflineAudioContext(1, 1, 44100)
  const buffer = await context.decodeAudioData(await file.arrayBuffer())
  signal.throwIfAborted()
  const { duration, sampleRate } = buffer
  const analysis = await new Promise<Analysis>((resolve, reject) => {
    const worker = takeWorker()
    let finished = false
    const cleanup = (keep: boolean) => {
      finished = true
      clearTimeout(timer)
      signal.removeEventListener("abort", abort)
      if (keep) returnWorker(worker)
      else worker.terminate()
    }
    const fail = (error: Error) => {
      // A worker that failed or was cancelled mid-track is not reused.
      cleanup(false)
      reject(error)
    }
    const abort = () =>
      fail(new DOMException("Analysis cancelled", "AbortError"))
    const timer = setTimeout(
      () =>
        fail(
          new Error("Analysis timed out. Retry when the device is less busy.")
        ),
      // The beat model can add a one-time 10 MB download.
      180000
    )
    signal.addEventListener("abort", abort, { once: true })
    worker.onmessage = (event: MessageEvent<Analysis>) => {
      if (finished) return
      cleanup(true)
      resolve({ ...event.data, analyzedAt: new Date().toISOString() })
    }
    worker.onerror = () => fail(new Error("Audio analysis failed. Try again."))
    worker.onmessageerror = () =>
      fail(new Error("Could not read analysis. Try again."))
    try {
      // Nothing plays this buffer, so hand its audio to the worker instead
      // of copying it.
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
        buffer.getChannelData(c)
      )
      try {
        worker.postMessage(
          { channels, sampleRate, useModels },
          channels.map((c) => c.buffer)
        )
      } catch {
        // A browser that won't detach audio-buffer memory gets a copy.
        const copies = channels.map((c) => c.slice())
        worker.postMessage(
          { channels: copies, sampleRate, useModels },
          copies.map((c) => c.buffer)
        )
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)))
    }
  })
  return { analysis, duration }
}

export function mergeLibraryAnalysis(
  track: Track,
  analysis: Analysis,
  duration: number
): Track {
  return {
    ...track,
    analysis,
    duration,
    // A corrected grid or tag BPM stays; our own earlier estimate is replaced.
    bpm:
      track.grid?.bpm ??
      (track.analysis && track.bpm === track.analysis.bpm
        ? (analysis.bpm ?? track.bpm)
        : (track.bpm ?? analysis.bpm)),
    // A key you set by hand outlives re-analysis.
    key: track.keyOverride ? track.key : analysis.key,
    camelot: track.keyOverride ?? analysis.camelot,
    energy: analysis.energy,
  }
}

const needsAnalysis = (track?: Track) =>
  !track?.analysis || !track.analysis.vocals || analysisOutdated(track.analysis)

/** Adds the bundled demo-track analysis (`pnpm analyze:demo`) to a saved
 * library, so visitors can play the demo tracks without analyzing them. */
export async function withDemoAnalysis(
  tracks: Track[],
  url = "/analysis/demo.json"
): Promise<Track[]> {
  if (
    !demoTracks.some((demo) =>
      needsAnalysis(tracks.find((t) => t.id === demo.id))
    )
  )
    return tracks
  let bundled: Partial<Record<string, { duration: number; analysis: Analysis }>>
  try {
    const response = await fetch(url)
    if (!response.ok) return tracks
    bundled = await response.json()
  } catch {
    // Offline or missing: the decks and library analyze as usual.
    return tracks
  }
  let next = tracks
  for (const demo of demoTracks) {
    const saved = next.find((t) => t.id === demo.id),
      entry = bundled[demo.id]
    if (
      !needsAnalysis(saved) ||
      !entry ||
      needsAnalysis({ ...demo, analysis: entry.analysis })
    )
      continue
    // Demo tracks live in code; their analysis is stored as an override.
    const analyzed = mergeLibraryAnalysis(
      { ...demo, ...saved },
      entry.analysis,
      entry.duration
    )
    next = saved
      ? next.map((t) => (t === saved ? analyzed : t))
      : [...next, analyzed]
  }
  return next
}

export function linkedFingerprint(track: Track) {
  return `${track.id}:${track.linkedFile?.size}:${track.linkedFile?.lastModified}`
}

export function mergeScannedTracks(scanned: Track[], current: Track[]) {
  const latest = new Map(current.map((track) => [track.id, track]))
  return scanned.map((track) => {
    const saved = latest.get(track.id)
    // A worker or grid edit may finish while the directory scan is awaiting I/O.
    // Keep those updates only when they refer to the same file version.
    return saved && linkedFingerprint(saved) === linkedFingerprint(track)
      ? {
          ...track,
          ...saved,
          title: track.title,
          artist: track.artist,
          linkedFile: track.linkedFile,
          available: track.available,
        }
      : track
  })
}
