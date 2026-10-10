import { describe, expect, it, vi } from "vitest"
import {
  linkedTrackAvailable,
  checkLinkedTracks,
  readLinkedFile,
  scanMusicFolder,
  folderCollections,
  filenameMetadata,
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
})
