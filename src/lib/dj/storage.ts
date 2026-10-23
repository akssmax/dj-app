import { latestWriter } from "./latest-writer"
import type { LinkedFolder } from "./linked-files"
import { createStore, get, getMany, setMany } from "idb-keyval"
import type { DeckId, EnergyRating, MixIntent, MixPace, Track } from "./types"
import type { ManualReport } from "./feedback"
import type { StudioLayout, ThemeId } from "./themes"

export type LibraryDatabase = {
  version: 1
  tracks: Track[]
  linkedFolders: LinkedFolder[]
  cues: Record<string, (number | null)[]>
  cueLabels: Record<string, (string | null)[]>
  collections: {
    id: string
    name: string
    kind: "folder" | "playlist" | "smart"
    trackIds: string[]
    /** Smart crates: a library search rule (see library-query.ts). */
    query?: string
  }[]
  /** Tracks heard for at least 30 s, newest last (capped). */
  history: { trackId: string; at: string }[]
  favorites: string[]
  energyRatings: Partial<Record<string, EnergyRating>>
  queue: string[]
  completedLessons: string[]
  reports: ManualReport[]
  session: {
    A: string
    B: string
    master: number
    direction: "ltr" | "rtl"
    sidebarCollapsed: boolean
    theme: ThemeId
    layout: StudioLayout
    quantize: Record<DeckId, boolean>
    mixIntent: MixIntent
    mixPace: MixPace
    transitionTechnique: string | null
    recentTransitions: string[]
    transitionCues: Partial<
      Record<string, { entry: number | null; exit: number | null }>
    >
    libraryTab: string
    density: "dense" | "compact" | "comfortable"
    waveStyle: "spectrum" | "bands"
  }
}
export const defaultDatabase: LibraryDatabase = {
  version: 1,
  tracks: [],
  linkedFolders: [],
  cues: {},
  cueLabels: {},
  collections: [],
  history: [],
  favorites: [],
  energyRatings: {},
  queue: [],
  completedLessons: [],
  reports: [],
  session: {
    A: "edm",
    B: "lift",
    master: 0.7,
    direction: "ltr",
    sidebarCollapsed: false,
    theme: "studio",
    layout: "parallel",
    quantize: { A: false, B: false },
    mixIntent: "maintain",
    mixPace: "dj",
    transitionTechnique: null,
    recentTransitions: [],
    transitionCues: {},
    libraryTab: "all",
    density: "compact",
    waveStyle: "spectrum",
  },
}
let store: ReturnType<typeof createStore> | undefined
const getStore = () => (store ??= createStore("cue-library-v1", "library"))
type StoredDatabase = LibraryDatabase & { trackIds?: string[] }
let savedTracks = new Map<string, Track>()
export async function readLibrary(): Promise<LibraryDatabase> {
  const data = await get<StoredDatabase>("database", getStore())
  if (data?.version !== 1) return defaultDatabase
  // Old libraries stored every File and waveform in one record. Read both
  // formats; the next successful atomic commit migrates without losing data.
  const tracks = data.trackIds
    ? await getMany<Track>(
        data.trackIds.map((id) => `track:${id}`),
        getStore()
      )
    : data.tracks
  if (!tracks.every((track): track is Track => !!track))
    throw new Error("Saved library is incomplete.")
  // Hydration already read these records from IndexedDB. Treat them as saved
  // so the startup session refresh does not clone every audio/analysis record.
  // Legacy snapshots must still write all records to complete migration.
  savedTracks = data.trackIds
    ? new Map(tracks.map((track) => [track.id, track]))
    : new Map()
  return {
    ...defaultDatabase,
    ...data,
    tracks,
    session: { ...defaultDatabase.session, ...data.session },
  }
}
const writer = latestWriter<LibraryDatabase>(async (data) => {
  const changed: [IDBValidKey, unknown][] = data.tracks
    .filter((track) => savedTracks.get(track.id) !== track)
    .map((track) => [`track:${track.id}`, track])
  const snapshot: StoredDatabase = {
    ...data,
    tracks: [],
    trackIds: data.tracks.map((track) => track.id),
  }
  // Metadata and changed tracks commit together. Session/knob saves avoid
  // cloning unchanged audio Blobs and thousands of waveform samples.
  await setMany([["database", snapshot], ...changed], getStore())
  savedTracks = new Map(data.tracks.map((track) => [track.id, track]))
})
export const writeLibrary = writer.write
export const flushLibrary = writer.flush
export function savedDeck(data: LibraryDatabase, id: DeckId, tracks: Track[]) {
  return (
    tracks.find((t) => t.id === data.session[id]) ?? tracks[id === "A" ? 0 : 1]
  )
}
