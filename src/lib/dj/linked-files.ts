import type { Track } from "./types"
import type { LibraryDatabase } from "./storage"

export interface FileHandle {
  kind: "file"
  name: string
  getFile: () => Promise<File>
  queryPermission: (options: { mode: "read" }) => Promise<PermissionState>
}
type PermissionRequest = (options: { mode: "read" }) => Promise<PermissionState>
export interface FolderHandle {
  kind: "directory"
  name: string
  isSameEntry?: (other: FolderHandle) => Promise<boolean>
  entries: () => AsyncIterableIterator<[string, FileHandle | FolderHandle]>
  queryPermission: (options: { mode: "read" }) => Promise<PermissionState>
  requestPermission?: PermissionRequest
}
export type LinkedFolder = { id: string; name: string; handle: FolderHandle }

/** Names a USB scan must ignore: macOS AppleDouble files ("._song.mp3") and
 * other dot-files, plus OS housekeeping folders on FAT/exFAT/NTFS drives. */
export function ignoredEntry(name: string) {
  return (
    name.startsWith(".") ||
    /^(System Volume Information|\$RECYCLE\.BIN|RECYCLER|Thumbs\.db|desktop\.ini)$/i.test(
      name
    )
  )
}

/**
 * FAT and exFAT drives store local time, so after a timezone or daylight-saving
 * change every file reads as shifted by whole hours (or 15-minute zones).
 * A non-zero shift of that shape, within FAT's 2 s rounding, is the same file.
 */
export function sameFileTime(a: number, b: number) {
  const shift = Math.abs(a - b)
  if (shift === 0) return true
  const zone = 15 * 60 * 1000,
    zones = Math.round(shift / zone)
  return (
    zones >= 1 &&
    shift <= 14 * 60 * 60 * 1000 &&
    Math.abs(shift - zones * zone) <= 2000
  )
}
const sameFile = (
  file: File,
  link: Pick<LinkedFile, "size" | "lastModified">
) =>
  file.size === link.size && sameFileTime(file.lastModified, link.lastModified)

/**
 * Saved folder handles survive restarts and replugs; usually only the
 * permission lapsed. Ask for it again (one "Allow" click) before falling back
 * to the folder picker. Must run inside the user's click.
 */
export async function reopenFolder(folder: LinkedFolder) {
  try {
    const state = folder.handle.requestPermission
      ? await folder.handle.requestPermission({ mode: "read" })
      : await folder.handle.queryPermission({ mode: "read" })
    return state === "granted"
  } catch {
    return false
  }
}

export function filenameMetadata(name: string) {
  const stem = name.replace(/\.[^.]+$/, "")
  // Some collections prefix filenames with a chart rank and Camelot key.
  // The rank is not a BPM estimate.
  const clean = stem.replace(/^\d+\s+-\s+(?:1[0-2]|[1-9])[AB]\s+-\s+/i, "")
  const divider = clean.indexOf(" - ")
  return divider > 0
    ? { artist: clean.slice(0, divider), title: clean.slice(divider + 3) }
    : { artist: "Unknown artist", title: clean }
}

export function folderCollections(
  folder: LinkedFolder,
  tracks: Track[]
): LibraryDatabase["collections"] {
  const linked = tracks.filter((t) => t.linkedFile?.folderId === folder.id)
  const paths = new Set<string>()
  for (const track of linked) {
    const parts = track.linkedFile!.path.split("/").slice(0, -1)
    for (let i = 1; i <= parts.length; i++)
      paths.add(parts.slice(0, i).join("/"))
  }
  return [
    {
      id: folder.id,
      name: folder.name,
      kind: "folder",
      trackIds: linked.map((t) => t.id),
    },
    ...[...paths].sort().map((path) => ({
      id: `${folder.id}/path/${encodeURIComponent(path)}`,
      name: `${folder.name} / ${path.split("/").join(" / ")}`,
      kind: "folder" as const,
      trackIds: linked
        .filter((t) => t.linkedFile!.path.startsWith(path + "/"))
        .map((t) => t.id),
    })),
  ]
}
export type LinkedFile = {
  folderId: string
  path: string
  handle: FileHandle
  size: number
  lastModified: number
}
type PickerWindow = {
  showDirectoryPicker?: (options: { mode: "read" }) => Promise<FolderHandle>
}
export function folderAccessSupported() {
  return (
    typeof window !== "undefined" &&
    typeof (window as PickerWindow).showDirectoryPicker === "function"
  )
}
export async function pickMusicFolder() {
  const picker = (window as PickerWindow).showDirectoryPicker
  if (!picker)
    throw new Error(
      "Folder linking requires a supported browser such as desktop Chrome or Edge. Use Import offline copy instead."
    )
  return picker.call(window, { mode: "read" })
}
export async function readLinkedFile(link: LinkedFile) {
  if ((await link.handle.queryPermission({ mode: "read" })) !== "granted")
    throw new Error(
      "Folder access needs permission. Use Reconnect folder in the library."
    )
  const file = await link.handle.getFile()
  if (!sameFile(file, link))
    throw new Error("This file changed. Rescan its folder before loading it.")
  return file
}
export async function linkedTrackAvailable(track: Track) {
  if (!track.linkedFile) return true
  try {
    await readLinkedFile(track.linkedFile)
    return true
  } catch {
    return false
  }
}
// Bound USB I/O at startup instead of opening the whole library simultaneously.
export async function checkLinkedTracks(tracks: Track[], signal?: AbortSignal) {
  const result = [...tracks]
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(4, tracks.length) }, async () => {
      while (cursor < tracks.length && !signal?.aborted) {
        const index = cursor++
        const track = tracks[index]
        if (track.linkedFile)
          result[index] = {
            ...track,
            available: await linkedTrackAvailable(track),
          }
      }
    })
  )
  return result
}

export async function scanMusicFolder(folder: LinkedFolder, previous: Track[]) {
  if ((await folder.handle.queryPermission({ mode: "read" })) !== "granted")
    throw new Error("Folder permission is unavailable. Use Reconnect folder.")
  const found: Track[] = []
  const old = new Map(
    previous
      .filter((track) => track.linkedFile?.folderId === folder.id)
      .map((track) => [track.linkedFile!.path, track])
  )
  const walk = async (directory: FolderHandle, prefix = "") => {
    for await (const [name, handle] of directory.entries()) {
      if (ignoredEntry(name)) continue
      const path = prefix + name
      if (handle.kind === "directory") {
        await walk(handle, path + "/")
        continue
      }
      if (!/\.(mp3|wav|ogg|m4a|aac|flac|aiff|aif|opus|webm)$/i.test(name))
        continue
      let file: File
      try {
        file = await handle.getFile()
      } catch {
        continue
      }
      const existing = old.get(path)
      const linkedFile: LinkedFile = {
        folderId: folder.id,
        path,
        handle,
        size: file.size,
        lastModified: file.lastModified,
      }
      if (existing?.linkedFile && sameFile(file, existing.linkedFile)) {
        const fallback = filenameMetadata(name)
        found.push({
          ...existing,
          ...(existing.artist === "Unknown artist" &&
          existing.title === name.replace(/\.[^.]+$/, "")
            ? fallback
            : {}),
          linkedFile,
          available: true,
        })
        continue
      }
      const { parseBlob } = await import("music-metadata")
      const metadata = await parseBlob(file, {
        duration: true,
        skipCovers: true,
      }).catch(() => undefined)
      found.push({
        id: existing?.id ?? `linked-${folder.id}-${encodeURIComponent(path)}`,
        title: metadata?.common.title ?? filenameMetadata(name).title,
        artist: metadata?.common.artist ?? filenameMetadata(name).artist,
        genre: metadata?.common.genre?.[0] ?? "Local file",
        url: "",
        duration: metadata?.format.duration ?? 0,
        bpm: metadata?.common.bpm ?? null,
        key: null,
        camelot: null,
        energy: null,
        color: existing?.color ?? "blue",
        source: "local",
        linkedFile,
        available: true,
      })
    }
  }
  await walk(folder.handle)
  const present = new Set(found.map((track) => track.id))
  return [
    ...found,
    ...previous
      .filter(
        (track) =>
          track.linkedFile?.folderId === folder.id && !present.has(track.id)
      )
      .map((track) => ({ ...track, available: false })),
  ]
}
