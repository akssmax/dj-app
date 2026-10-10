import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  defaultDatabase,
  readLibrary,
  writeLibrary,
  flushLibrary,
} from "./storage"
import { demoTracks } from "./tracks"

const { values, batches, failure } = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  batches: [] as [string, unknown][][],
  failure: { active: false },
}))
vi.mock("idb-keyval", () => ({
  createStore: () => ({}),
  get: async (key: string) => values.get(key),
  getMany: async (keys: string[]) => keys.map((key) => values.get(key)),
  setMany: async (entries: [string, unknown][]) => {
    if (failure.active) throw new Error("Storage full")
    batches.push(entries)
    entries.forEach(([key, value]) => values.set(key, value))
  },
}))
beforeEach(() => {
  values.clear()
  batches.length = 0
  failure.active = false
})
describe("incremental library storage", () => {
  it("does not rewrite persisted audio and analysis on startup", async () => {
    const song = { ...demoTracks[0], file: new Blob(["saved audio"]) }
    values.set("database", {
      ...defaultDatabase,
      tracks: [],
      trackIds: [song.id],
    })
    values.set(`track:${song.id}`, song)
    const loaded = await readLibrary()
    const save = writeLibrary({
      ...loaded,
      session: { ...loaded.session, layout: "library" },
    })
    await flushLibrary()
    await save
    expect(batches[0].map(([key]) => key)).toEqual(["database"])
    expect((await readLibrary()).tracks[0].file).toBe(song.file)
  })
  it("migrates an old library and only rewrites changed tracks afterwards", async () => {
    const song = {
      ...demoTracks[0],
      file: new Blob(["audio"]),
      analysis: { ...demoTracks[0].analysis! },
    }
    const original = {
      ...defaultDatabase,
      tracks: [song],
      favorites: [song.id],
    }
    values.set("database", original)
    expect((await readLibrary()).tracks[0]).toBe(song)
    const save = writeLibrary(original)
    await flushLibrary()
    await save
    expect(batches[0].map(([key]) => key)).toEqual([
      "database",
      `track:${song.id}`,
    ])
    expect((values.get("database") as typeof original).tracks).toEqual([])
    expect((await readLibrary()).tracks[0].file).toBe(song.file)
    const change = {
      ...original,
      session: { ...original.session, master: 0.8 },
    }
    const session = writeLibrary(change)
    await flushLibrary()
    await session
    expect(batches[1].map(([key]) => key)).toEqual(["database"])
    expect((await readLibrary()).favorites).toEqual([song.id])
    const updated = { ...song, title: "New metadata" }
    const metadata = writeLibrary({ ...change, tracks: [updated] })
    await flushLibrary()
    await metadata
    expect(batches[2].map(([key]) => key)).toEqual([
      "database",
      `track:${song.id}`,
    ])
    expect((await readLibrary()).tracks[0].title).toBe("New metadata")
  })
  it("does not treat a failed commit as saved", async () => {
    const song = { ...demoTracks[1] }
    const data = { ...defaultDatabase, tracks: [song] }
    failure.active = true
    const save = writeLibrary(data)
    const rejected = expect(save).rejects.toThrow("Storage full")
    await flushLibrary()
    await rejected
    failure.active = false
    const retry = writeLibrary(data)
    await flushLibrary()
    await retry
    expect(batches[0].map(([key]) => key)).toEqual([
      "database",
      `track:${song.id}`,
    ])
  })
})
