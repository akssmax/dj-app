import { describe, expect, it, vi } from "vitest"
import {
  linkedTrackAvailable,
  checkLinkedTracks,
  readLinkedFile,
  scanMusicFolder,
  folderCollections,
  filenameMetadata,
  ignoredEntry,
  reopenFolder,
  sameFileTime,
} from "./linked-files"
import type { FileHandle, FolderHandle, LinkedFolder } from "./linked-files"
import { recommendTracks } from "./library-scope"

vi.mock("music-metadata", () => ({
  parseBlob: vi.fn(async () => ({
    common: { title: "Music" },
    format: { duration: 120 },
  })),
}))
function file(name = "song.mp3", lastModified = 1): FileHandle {
  return {
    kind: "file",
    name,
    queryPermission: vi.fn(async () => "granted" as const),
    getFile: vi.fn(async () => new File(["audio"], name, { lastModified })),
  }
}
function directory(
  name: string,
  children: (FileHandle | FolderHandle)[]
): FolderHandle {
  return {
    kind: "directory",
    name,
    queryPermission: vi.fn(async () => "granted" as const),
    async *entries() {
      for (const child of children) yield [child.name, child]
    },
  }
}
const folder = (children: (FileHandle | FolderHandle)[]): LinkedFolder => ({
  id: "usb",
  name: "USB",
  handle: directory("USB", children),
})
describe("linked music folders", () => {
  it("limits startup file reads and stops scheduling them when cancelled", async () => {
    const tracks = await scanMusicFolder(folder([file("song.mp3")]), [])
    let active = 0,
      max = 0,
      calls = 0
    const releases: (() => void)[] = []
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...tracks[0],
      id: `track-${i}`,
      linkedFile: {
        ...tracks[0].linkedFile!,
        handle: {
          ...tracks[0].linkedFile!.handle,
          getFile: async () => {
            calls++
            active++
            max = Math.max(max, active)
            await new Promise<void>((resolve) => releases.push(resolve))
            active--
            return new File(["audio"], "song.mp3", { lastModified: 1 })
          },
        },
      },
    }))
    const controller = new AbortController()
    const checking = checkLinkedTracks(many, controller.signal)
    await Promise.resolve()
    await Promise.resolve()
    expect(max).toBe(4)
    controller.abort()
    releases.forEach((release) => release())
    const result = await checking
    expect(calls).toBe(4)
    expect(result).toHaveLength(12)
    expect(result[11]).toBe(many[11])
  })

  it("builds separate nested folder scopes without including similarly named siblings", async () => {
    const root = folder([
      directory("House", [
        file("root.mp3"),
        directory("Album", [file("deep.mp3")]),
      ]),
      directory("House 2", [file("other.mp3")]),
    ])
    const tracks = await scanMusicFolder(root, [])
    const collections = folderCollections(root, tracks)
    expect(collections.find((c) => c.id === "usb")?.trackIds).toHaveLength(3)
    expect(
      collections.find((c) => c.name === "USB / House")?.trackIds
    ).toHaveLength(2)
    expect(
      collections.find((c) => c.name === "USB / House / Album")?.trackIds
    ).toEqual([
      tracks.find((t) => t.linkedFile?.path === "House/Album/deep.mp3")!.id,
    ])
    expect(folderCollections(root, tracks)).toEqual(collections)
  })
  it("reads artist and title from filenames without treating chart ranks as BPM", () => {
    expect(
      filenameMetadata(
        "105 - 12A - Gabry Ponte, Brooklyn Bounce - Bass, Beats & Melody (Extended Mix).mp3"
      )
    ).toEqual({
      artist: "Gabry Ponte, Brooklyn Bounce",
      title: "Bass, Beats & Melody (Extended Mix)",
    })
    expect(filenameMetadata("simple.mp3")).toEqual({
      artist: "Unknown artist",
      title: "simple",
    })
  })
  it("scans subfolders and stores handles without audio copies", async () => {
    const tracks = await scanMusicFolder(
      folder([directory("House", [file(), file("notes.txt")])]),
      []
    )
    expect(tracks).toHaveLength(1)
    expect(tracks[0].linkedFile?.path).toBe("House/song.mp3")
    expect(tracks[0].file).toBeUndefined()
    expect(await readLinkedFile(tracks[0].linkedFile!)).toBeInstanceOf(File)
  })
  it("keeps stable IDs and analysis on reconnect, and flags removed files", async () => {
    const original = await scanMusicFolder(
      folder([file(), file("removed.mp3")]),
      []
    )
    original[0].bpm = 128
    const rescanned = await scanMusicFolder(folder([file()]), original)
    expect(rescanned[0].id).toBe(original[0].id)
    expect(rescanned[0].bpm).toBe(128)
    expect(rescanned[1].available).toBe(false)
    expect(rescanned[0].linkedFile?.handle).not.toBe(
      original[0].linkedFile?.handle
    )
  })
  it("rejects changed files until rescan refreshes their metadata", async () => {
    const handle = file()
    const original = await scanMusicFolder(folder([handle]), [])
    original[0].bpm = 128
    vi.mocked(handle.getFile).mockResolvedValue(
      new File(["audio"], handle.name, { lastModified: 2 })
    )
    await expect(readLinkedFile(original[0].linkedFile!)).rejects.toThrow(
      "changed"
    )
    const rescanned = await scanMusicFolder(folder([handle]), original)
    expect(rescanned[0].id).toBe(original[0].id)
    expect(rescanned[0].bpm).toBeNull()
    expect(await linkedTrackAvailable(rescanned[0])).toBe(true)
  })
  it("checks permission without requesting access and skips unavailable recommendations", async () => {
    const handle = file()
    const tracks = await scanMusicFolder(folder([handle]), [])
    vi.mocked(handle.queryPermission).mockResolvedValue("prompt")
    expect(await linkedTrackAvailable(tracks[0])).toBe(false)
    await expect(readLinkedFile(tracks[0].linkedFile!)).rejects.toThrow(
      "Reconnect"
    )
    const unavailable = { ...tracks[0], available: false }
    expect(
      recommendTracks(null, [unavailable], undefined, 1, "maintain")
    ).toEqual([])
    const denied = folder([handle])
    vi.mocked(denied.handle.queryPermission).mockResolvedValue("denied")
    await expect(scanMusicFolder(denied, tracks)).rejects.toThrow("Reconnect")
  })
  it("continues scanning when an individual file disappears", async () => {
    const missing = file("missing.mp3")
    vi.mocked(missing.getFile).mockRejectedValue(new Error("NotFoundError"))
    const tracks = await scanMusicFolder(folder([missing, file()]), [])
    expect(tracks).toHaveLength(1)
  })

  it("skips macOS AppleDouble files and drive housekeeping folders", async () => {
    const tracks = await scanMusicFolder(
      folder([
        file("._song.mp3"),
        file(".DS_Store"),
        directory(".Trashes", [file("deleted.mp3")]),
        directory("System Volume Information", [file("x.wav")]),
        directory("House", [file(), file("._song.mp3")]),
      ]),
      []
    )
    expect(tracks.map((track) => track.linkedFile?.path)).toEqual([
      "House/song.mp3",
    ])
    expect(ignoredEntry("$RECYCLE.BIN")).toBe(true)
    expect(ignoredEntry("Songs")).toBe(false)
  })
  it("treats FAT timezone and daylight-saving shifts as the same file", async () => {
    const hour = 60 * 60 * 1000
    expect(sameFileTime(1000, 1000 + hour)).toBe(true)
    expect(sameFileTime(1000, 1000 - 5.5 * hour)).toBe(true)
    expect(sameFileTime(1000, 1000 + hour + 1500)).toBe(true)
    expect(sameFileTime(1000, 1001)).toBe(false)
    expect(sameFileTime(1000, 1000 + 37 * 60 * 1000)).toBe(false)
    expect(sameFileTime(1000, 1000 + 15 * hour)).toBe(false)
    // A clock change keeps the track, its cues and analysis without a rescan.
    const handle = file("song.mp3", 10_000)
    const original = await scanMusicFolder(folder([handle]), [])
    original[0].bpm = 128
    vi.mocked(handle.getFile).mockResolvedValue(
      new File(["audio"], handle.name, { lastModified: 10_000 + hour })
    )
    expect(await readLinkedFile(original[0].linkedFile!)).toBeInstanceOf(File)
    const rescanned = await scanMusicFolder(folder([handle]), original)
    expect(rescanned[0].bpm).toBe(128)
    // A real edit (different size) is still rejected.
    vi.mocked(handle.getFile).mockResolvedValue(
      new File(["longer audio"], handle.name, { lastModified: 10_000 + hour })
    )
    await expect(readLinkedFile(original[0].linkedFile!)).rejects.toThrow(
      "changed"
    )
  })
  it("re-requests access to a saved folder before asking to pick it again", async () => {
    const saved = folder([file()])
    saved.handle.requestPermission = vi.fn(async () => "granted" as const)
    expect(await reopenFolder(saved)).toBe(true)
    expect(saved.handle.requestPermission).toHaveBeenCalledWith({
      mode: "read",
    })
    saved.handle.requestPermission = vi.fn(async () => "denied" as const)
    expect(await reopenFolder(saved)).toBe(false)
    saved.handle.requestPermission = vi.fn(async () => {
      throw new DOMException("gone", "NotFoundError")
    })
    expect(await reopenFolder(saved)).toBe(false)
    // Browsers without requestPermission fall back to the current state.
    const legacy = folder([file()])
    expect(await reopenFolder(legacy)).toBe(true)
  })
})
