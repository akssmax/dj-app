import { afterEach, describe, expect, it, vi } from "vitest"
import {
  analyzeLibraryTrack,
  linkedFingerprint,
  mergeLibraryAnalysis,
  mergeScannedTracks,
} from "./library-analysis"
import type { Track, Analysis } from "./types"

const analysis: Analysis = {
  bpm: 127,
  peaks: [0.2, 0.5],
  energyCurve: [0.2],
  energy: 6,
  key: "Am",
  camelot: "8A",
  beatOffset: 0.2,
  confidence: 0.6,
}
const track = (): Track => ({
  id: "usb-song",
  title: "Song",
  artist: "Artist",
  genre: "House",
  url: "",
  duration: 0,
  bpm: 125,
  key: null,
  camelot: null,
  energy: null,
  color: "blue",
  source: "local",
  linkedFile: {
    folderId: "usb",
    path: "song.mp3",
    size: 5,
    lastModified: 1,
    handle: {
      kind: "file",
      name: "song.mp3",
      queryPermission: vi.fn(async () => "granted" as const),
      getFile: vi.fn(
        async () => new File(["audio"], "song.mp3", { lastModified: 1 })
      ),
    },
  },
})

afterEach(() => vi.unstubAllGlobals())
describe("background library analysis", () => {
  it("keeps analysis completed during a folder scan, but clears it for changed files", () => {
    const scanned = track()
    const latest = mergeLibraryAnalysis(scanned, analysis, 120)
    expect(mergeScannedTracks([scanned], [latest])[0].analysis).toBe(analysis)
    const changed = {
      ...scanned,
      linkedFile: { ...scanned.linkedFile!, lastModified: 2 },
    }
    expect(mergeScannedTracks([changed], [latest])[0].analysis).toBeUndefined()
    expect(
      mergeScannedTracks([{ ...scanned, available: false }], [latest])[0]
        .available
    ).toBe(false)
  })
  it("preserves tag BPM, corrected grids, and memory cues while adding measured metadata", () => {
    const original = {
      ...track(),
      grid: { bpm: 129, offset: 1, originalBpm: 125 },
      memoryCues: [12],
    }
    const result = mergeLibraryAnalysis(original, analysis, 120)
    expect(result.bpm).toBe(129)
    expect(result.grid).toBe(original.grid)
    expect(result.memoryCues).toBe(original.memoryCues)
    expect(mergeLibraryAnalysis(track(), analysis, 120).bpm).toBe(125)
    expect(
      mergeLibraryAnalysis({ ...track(), bpm: null }, analysis, 120).bpm
    ).toBe(127)
    expect(result.analysis).toBe(analysis)
    expect(result.duration).toBe(120)
    expect(result.file).toBeUndefined()
  })
  it("invalidates stale analysis results when the linked file changes", () => {
    const original = track()
    expect(
      linkedFingerprint({
        ...original,
        linkedFile: { ...original.linkedFile!, lastModified: 2 },
      })
    ).not.toBe(linkedFingerprint(original))
  })
  it("decodes without starting audio, records the result, and terminates its worker", async () => {
    const terminate = vi.fn()
    const decode = vi.fn(async () => ({
      duration: 120,
      numberOfChannels: 1,
      sampleRate: 44100,
      getChannelData: () => new Float32Array([0.1, 0.2]),
    }))
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        decodeAudioData = decode
      }
    )
    vi.stubGlobal(
      "Worker",
      class {
        terminate = terminate
        onmessage?: (event: { data: Analysis }) => void
        postMessage() {
          queueMicrotask(() => this.onmessage?.({ data: analysis }))
        }
      }
    )
    const result = await analyzeLibraryTrack(
      track(),
      new AbortController().signal
    )
    expect(result.duration).toBe(120)
    expect(result.analysis.analyzedAt).toBeTruthy()
    expect(decode).toHaveBeenCalledOnce()
    expect(terminate).toHaveBeenCalledOnce()
  })
  it("cancels an active worker and does not analyze files without read permission", async () => {
    const terminate = vi.fn()
    const controller = new AbortController()
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        async decodeAudioData() {
          return {
            numberOfChannels: 1,
            sampleRate: 44100,
            getChannelData: () => new Float32Array(1),
          }
        }
      }
    )
    vi.stubGlobal(
      "Worker",
      class {
        terminate = terminate
        postMessage() {
          controller.abort()
        }
      }
    )
    await expect(
      analyzeLibraryTrack(track(), controller.signal)
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(terminate).toHaveBeenCalledOnce()
    const denied = track()
    vi.mocked(denied.linkedFile!.handle.queryPermission).mockResolvedValue(
      "prompt"
    )
    await expect(
      analyzeLibraryTrack(denied, new AbortController().signal)
    ).rejects.toThrow("Reconnect")
    expect(denied.linkedFile!.handle.getFile).not.toHaveBeenCalled()
  })
})
