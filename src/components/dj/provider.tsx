import {
  folderAccessSupported,
  pickMusicFolder,
  scanMusicFolder,
  checkLinkedTracks,
  folderCollections,
} from "@/lib/dj/linked-files"
import type { LinkedFolder } from "@/lib/dj/linked-files"
import { beatOffset as gridOffset } from "@/lib/dj/beatgrid"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import type { ReactNode } from "react"
import {
  DJEngine,
  outgoingDeck,
  emptyDeck,
  emptyController,
  effectiveDeckRate,
} from "@/lib/dj/engine"
import type { EngineState } from "@/lib/dj/engine"
import { DJContext, useDJ } from "./context"
import type { DJContextValue } from "./context"

import { demoTracks } from "@/lib/dj/tracks"
import { FLX4Feedback } from "@/lib/dj/flx4-feedback"
import { FLX4Decoder } from "@/lib/dj/midi"
import { MidiActivity } from "@/lib/dj/midi-activity"
import { MidiSession } from "@/lib/dj/midi-session"
import { AutomixSession, emptyAutomix } from "@/lib/dj/automix-session"
import { selectSnapshot } from "@/lib/dj/selection"
import { planTransitions } from "@/lib/dj/planner"
import {
  scopedTracks,
  scopeName,
  recommendTracks,
} from "@/lib/dj/library-scope"
import {
  defaultDatabase,
  readLibrary,
  savedDeck,
  writeLibrary,
  flushLibrary,
} from "@/lib/dj/storage"
import type { LibraryDatabase } from "@/lib/dj/storage"
import { scoreTransition } from "@/lib/dj/feedback"
import type { ManualAttempt, ManualReport } from "@/lib/dj/feedback"
import type { DeckId, Track, EnergyRating } from "@/lib/dj/types"
import {
  linkedFingerprint,
  mergeScannedTracks,
} from "@/lib/dj/library-analysis"
import { useLibraryAnalysis } from "./use-library-analysis"

export { useDJ }

export function DJProvider({ children }: { children: ReactNode }) {
  const [engine, setEngine] = useState<DJEngine | null>(null)
  const [automix, setAutomix] = useState(emptyAutomix)
  const automixRef = useRef<AutomixSession | null>(null)
  const [database, setDatabase] = useState(defaultDatabase)
  const dataRef = useRef(defaultDatabase),
    engineRef = useRef<DJEngine | null>(null)
  const libraryHydrated = useRef(false)
  const [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null),
    [importing, setImporting] = useState(false)
  const [folderLinkSupported, setFolderLinkSupported] = useState(false)
  const [scanningFolder, setScanningFolder] = useState<string | null>(null)
  const folderBusy = useRef(false)
  useEffect(() => setFolderLinkSupported(folderAccessSupported()), [])
  const libraryTab = database.session.libraryTab
  const [libraryQuery, setLibraryQuery] = useState("")
  const [libraryGenre, setLibraryGenre] = useState("all")
  const setLibraryTab = (nextTab: string) => {
    setLibraryQuery("")
    setLibraryGenre("all")
    update((db) => ({ ...db, session: { ...db.session, libraryTab: nextTab } }))
  }
  const [coachOpen, setCoachOpen] = useState(true),
    [report, setReport] = useState<ManualReport | null>(null)
  const [coachDetailsOpen, setCoachDetailsOpen] = useState(false)
  const [coachDetailsTab, setCoachDetailsTab] = useState<"explore" | "why">(
    "explore"
  )
  const [transitionPreview, setTransitionPreview] = useState(false)
  const [midi, setMidi] = useState({
    connected: false,
    name: "",
    supported: true,
    error: null as string | null,
    connecting: false,
  })
  const [midiActivity] = useState(() => new MidiActivity())
  const feedbackCleanup = useRef<(() => void) | null>(null)
  const midiSession = useRef(new MidiSession()),
    selectedRef = useRef(0),
    attempt = useRef<ManualAttempt | null>(null),
    lastFader = useRef(0)
  const dismissedZone = useRef("")
  const decoders = useRef(new Map<string, FLX4Decoder>())
  const browseArea = useRef<"tracks" | "collections">("tracks")
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null)
  const tracks = useMemo(
    () => [
      ...demoTracks.map((demo) => ({
        ...demo,
        ...database.tracks.find((t) => t.id === demo.id),
      })),
      ...database.tracks.filter((t) => t.source === "local"),
    ],
    [database.tracks]
  )
  const tracksRef = useRef(tracks)
  tracksRef.current = tracks
  const scopeTracks = useMemo(
    () =>
      scopedTracks(tracks, database, libraryTab, libraryQuery, libraryGenre),
    [
      tracks,
      database.collections,
      database.favorites,
      database.queue,
      libraryTab,
      libraryQuery,
      libraryGenre,
    ]
  )
  const scopeRef = useRef<Track[]>([])
  scopeRef.current = scopeTracks

  const notify = useCallback((value: string) => setMessage(value), [])
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 5000)
    return () => clearTimeout(timer)
  }, [message])
  const update = useCallback((fn: (db: LibraryDatabase) => LibraryDatabase) => {
    // Controls and engine callbacks can fire while IndexedDB is still loading.
    // Never replace a saved library with the temporary empty startup state.
    if (!libraryHydrated.current) return
    const next = fn(dataRef.current)
    if (next === dataRef.current) return
    dataRef.current = next
    setDatabase(next)
    void writeLibrary(next).catch(() =>
      setStorageError(
        "Device storage is unavailable or full. This session works, but changes may not survive a reload."
      )
    )
  }, [])
  useEffect(() => {
    const flush = () => {
      void flushLibrary()
    }
    const visibility = () => {
      if (document.visibilityState === "hidden") flush()
    }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", visibility)
    return () => {
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", visibility)
      flush()
    }
  }, [])
  const favorite = useCallback(
    (id: string) =>
      update((db) => ({
        ...db,
        favorites: db.favorites.includes(id)
          ? db.favorites.filter((x) => x !== id)
          : [...db.favorites, id],
      })),
    [update]
  )
  const setEnergyRating = useCallback(
    (id: string, rating: EnergyRating | null) =>
      update((db) => {
        // User ratings survive analysis and metadata updates independently.
        const energyRatings = { ...db.energyRatings }
        if (rating === null) delete energyRatings[id]
        else energyRatings[id] = rating
        return { ...db, energyRatings }
      }),
    [update]
  )
  const enqueue = useCallback(
    (id: string) =>
      update((db) => ({
        ...db,
        queue: db.queue.includes(id)
          ? db.queue.filter((x) => x !== id)
          : [...db.queue, id],
      })),
    [update]
  )

  const loadTrack = useCallback(
    async (id: DeckId, track: Track) => {
      const dj = engineRef.current
      if (!dj) return
      update((db) => ({ ...db, session: { ...db.session, [id]: track.id } }))
      await dj.load(
        id,
        track,
        dataRef.current.cues[track.id],
        dataRef.current.cueLabels[track.id]
      )
    },
    [update]
  )
  const saveLibraryAnalysis = useCallback(
    (original: Track, analyzed: Track) => {
      update((db) => ({
        ...db,
        tracks: db.tracks.map((current) =>
          current.id === original.id &&
          linkedFingerprint(current) === linkedFingerprint(original)
            ? {
                ...analyzed,
                ...current,
                analysis: analyzed.analysis,
                duration: analyzed.duration,
                bpm: current.grid?.bpm ?? current.bpm ?? analyzed.bpm,
                key: analyzed.key,
                camelot: analyzed.camelot,
                energy: analyzed.energy,
              }
            : current
        ),
      }))
    },
    [update]
  )
  const libraryAnalysis = useLibraryAnalysis(
    database.tracks,
    ready,
    saveLibraryAnalysis
  )

  useEffect(() => {
    let disposed = false
    const fileChecks = new AbortController()
    const dj = new DJEngine()
    engineRef.current = dj
    setEngine(dj)
    dj.onFileUnavailable = (id) =>
      update((db) => ({
        ...db,
        tracks: db.tracks.map((track) =>
          track.id === id ? { ...track, available: false } : track
        ),
      }))
    dj.onAnalysis = (track) =>
      update((db) => {
        const current = db.tracks.find((t) => t.id === track.id)
        // A rescan may replace a file while its old deck worker is finishing.
        if (current && linkedFingerprint(current) !== linkedFingerprint(track))
          return db
        return {
          ...db,
          tracks: current
            ? db.tracks.map((t) =>
                t.id === track.id
                  ? {
                      ...track,
                      linkedFile: current.linkedFile,
                      available: current.available,
                    }
                  : t
              )
            : [...db.tracks, track],
        }
      })
    dj.onCueChange = (id, cues, labels) =>
      update((db) => ({
        ...db,
        cues: { ...db.cues, [id]: cues },
        cueLabels: { ...db.cueLabels, [id]: labels },
      }))
    dj.onQuantizeChange = (id, enabled) =>
      update((db) => ({
        ...db,
        session: {
          ...db.session,
          quantize: { ...db.session.quantize, [id]: enabled },
        },
      }))
    dj.onTransition = (id) =>
      update((db) => ({
        ...db,
        session: {
          ...db.session,
          recentTransitions: [...db.session.recentTransitions, id].slice(-6),
        },
      }))
    const mix = new AutomixSession(
      dj,
      () => ({
        pool: scopeRef.current,
        session: dataRef.current.session,
        cues: dataRef.current.cues,
        labels: dataRef.current.cueLabels,
      }),
      loadTrack,
      setAutomix,
      notify
    )
    automixRef.current = mix
    setAutomix(emptyAutomix)
    void readLibrary()
      .then((stored) => {
        const db = {
          ...stored,
          tracks: stored.tracks,
        }
        if (disposed) return
        db.collections = [
          ...db.collections.filter(
            (c) =>
              !stored.linkedFolders.some(
                (f) => c.id === f.id || c.id.startsWith(`${f.id}/path/`)
              )
          ),
          ...stored.linkedFolders.flatMap((folder) =>
            folderCollections(folder, db.tracks)
          ),
        ]
        dataRef.current = db
        libraryHydrated.current = true
        setDatabase(db)
        void writeLibrary(db).catch(() =>
          setStorageError(
            "Library refresh could not be saved. Try requesting persistent storage in Settings."
          )
        )
        const all = [
          ...demoTracks.map((demo) => ({
            ...demo,
            ...db.tracks.find((t) => t.id === demo.id),
          })),
          ...db.tracks.filter((t) => t.source === "local"),
        ]
        const a = savedDeck(
            db,
            "A",
            all.filter((track) => track.available !== false)
          ),
          b = savedDeck(
            db,
            "B",
            all.filter((track) => track.available !== false)
          )
        dj.setMaster(db.session.master)
        dj.setQuantize("A", db.session.quantize.A)
        dj.setQuantize("B", db.session.quantize.B)
        void dj.load("A", a, db.cues[a.id], db.cueLabels[a.id])
        void dj.load("B", b, db.cues[b.id], db.cueLabels[b.id])
        setReady(true)
        // Render cached metadata and the saved layout immediately. Slow USB
        // permission/file checks must not block the library's first paint.
        void checkLinkedTracks(stored.tracks, fileChecks.signal)
          .then((checked) => {
            if (disposed) return
            const availability = new Map(
              checked.map((track) => [track.id, track])
            )
            update((current) => {
              const checkedTracks = current.tracks.map((track) => {
                const check = availability.get(track.id)
                if (
                  !check ||
                  linkedFingerprint(check) !== linkedFingerprint(track) ||
                  check.available === track.available
                )
                  return track
                return { ...track, available: check.available }
              })
              return checkedTracks.some(
                (track, index) => track !== current.tracks[index]
              )
                ? { ...current, tracks: checkedTracks }
                : current
            })
          })
          .catch(() => {})
      })
      .catch(() => {
        if (disposed) return
        setStorageError(
          "IndexedDB is unavailable. Your library and cue points cannot be saved in this browser."
        )
        setReady(true)
        void dj.load("A", demoTracks[0])
        void dj.load("B", demoTracks[1])
      })
    return () => {
      disposed = true
      libraryHydrated.current = false
      fileChecks.abort()
      feedbackCleanup.current?.()
      feedbackCleanup.current = null
      mix.dispose()
      automixRef.current = null
      dj.dispose()
      midiActivity.reset()
      engineRef.current = null
      midiSession.current.disconnect()
    }
  }, [loadTrack, update, midiActivity, notify])

  const connectFolder = async (id?: string, rescan = false) => {
    if (folderBusy.current) return
    folderBusy.current = true
    setScanningFolder(id ?? "new")
    const existing = dataRef.current.linkedFolders.find(
      (folder) => folder.id === id
    )
    try {
      const handle =
        rescan && existing ? existing.handle : await pickMusicFolder()
      if (existing && !rescan && handle.name !== existing.name)
        throw new Error(
          `Reconnect needs the original ${existing.name} folder. Use Connect music folder to add ${handle.name} separately.`
        )
      let matched = existing
      if (!matched && handle.isSameEntry) {
        for (const item of dataRef.current.linkedFolders) {
          if (await handle.isSameEntry(item.handle).catch(() => false)) {
            matched = item
            break
          }
        }
      }
      const folder: LinkedFolder = {
        id: matched?.id ?? crypto.randomUUID(),
        name: handle.name,
        handle,
      }
      const scanned = await scanMusicFolder(folder, dataRef.current.tracks)
      update((db) => ({
        ...db,
        linkedFolders: [
          ...db.linkedFolders.filter((item) => item.id !== folder.id),
          folder,
        ],
        tracks: [
          ...db.tracks.filter(
            (track) => track.linkedFile?.folderId !== folder.id
          ),
          ...mergeScannedTracks(scanned, db.tracks),
        ],
        collections: [
          ...db.collections.filter(
            (item) =>
              item.id !== folder.id && !item.id.startsWith(`${folder.id}/path/`)
          ),
          ...folderCollections(folder, scanned),
        ],
        session: { ...db.session, libraryTab: `collection:${folder.id}` },
      }))
      setLibraryQuery("")
      setLibraryGenre("all")
      notify(
        `${folder.name}: ${scanned.filter((track) => track.available !== false).length} linked tracks. Audio stays in the original folder.`
      )
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return
      if (rescan && existing)
        update((db) => ({
          ...db,
          tracks: db.tracks.map((track) =>
            track.linkedFile?.folderId === existing.id
              ? { ...track, available: false }
              : track
          ),
        }))
      notify(
        error instanceof Error
          ? error.message
          : "Folder access failed. Reconnect the folder and try again."
      )
    } finally {
      folderBusy.current = false
      setScanningFolder(null)
    }
  }

  const importFiles = async (files: FileList | File[]) => {
    setImporting(true)
    const batchIds: string[] = []
    const folderName = Array.from(files)
      .find((file) => file.webkitRelativePath)
      ?.webkitRelativePath.split("/")[0]
    let imported = 0,
      rejected = 0
    for (const file of Array.from(files)) {
      if (
        !/\.(mp3|wav|ogg|m4a|aac|flac|aiff|opus|webm)$/i.test(file.name) ||
        file.size > 80 * 1024 * 1024
      ) {
        rejected++
        continue
      }
      try {
        const hash = await crypto.subtle.digest(
          "SHA-256",
          await file.arrayBuffer()
        )
        const id =
          "local-" +
          Array.from(new Uint8Array(hash))
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("")
        if (dataRef.current.tracks.some((t) => t.id === id)) {
          batchIds.push(id)
          continue
        }
        const { parseBlob } = await import("music-metadata")
        const metadata = await parseBlob(file, {
          duration: true,
          skipCovers: true,
        })
        const track: Track = {
          id,
          title: metadata.common.title ?? file.name.replace(/\.[^.]+$/, ""),
          artist: metadata.common.artist ?? "Unknown artist",
          genre: metadata.common.genre?.[0] ?? "Local file",
          url: "",
          file,
          duration: metadata.format.duration ?? 0,
          bpm: metadata.common.bpm ?? null,
          key: null,
          camelot: null,
          energy: null,
          color: ["blue", "purple", "pink", "orange"][imported % 4],
          source: "local",
        }
        update((db) => ({ ...db, tracks: [...db.tracks, track] }))
        batchIds.push(id)
        imported++
      } catch {
        rejected++
      }
    }
    setImporting(false)
    if (folderName && batchIds.length) {
      const collectionId = crypto.randomUUID()
      update((db) => ({
        ...db,
        collections: [
          ...db.collections,
          {
            id: collectionId,
            name: folderName,
            kind: "folder",
            trackIds: [...new Set(batchIds)],
          },
        ],
        session: { ...db.session, libraryTab: `collection:${collectionId}` },
      }))
    } else setLibraryTab("local")
    notify(
      `${imported} track${imported === 1 ? "" : "s"} imported${rejected ? ` · ${rejected} unsupported or over 80 MB` : ""}. Audio stays on this device.`
    )
  }

  const handleMidi = useCallback(
    (event: MIDIMessageEvent) => {
      if (!event.data) return
      const port = (event.currentTarget as MIDIInput | null)?.id ?? "default"
      let decoder = decoders.current.get(port)
      if (!decoder) {
        decoder = new FLX4Decoder()
        decoders.current.set(port, decoder)
      }
      const action = decoder.decode(event.data),
        dj = engineRef.current
      midiActivity.record(action, event.data)
      if (!action || !dj) return
      const id = action.deck ?? "A"
      if (dj.handleControllerAction(action)) return
      if (action.type === "cue") dj.cueButton(id, action.value > 0)
      else if (action.type === "sync") dj.sync(id)
      else if (action.type === "hotcue") {
        const recalled = dj.state[id].cues[action.value] !== null
        dj.hotcue(id, action.value)
        if (recalled) void dj.play(id)
      } else if (action.type === "instantDouble") {
        if (dj.instantDouble(id))
          update((db) => ({
            ...db,
            session: { ...db.session, [id]: dj.state[id].track!.id },
          }))
      } else if (action.type === "browseRelated") {
        const related = recommendTracks(
          dj.state.A.track,
          scopeRef.current,
          dj.state.B.track?.id,
          dj.state.A.rate,
          dataRef.current.session.mixIntent
        ).at(0)
        if (related) {
          selectedRef.current = scopeRef.current.findIndex(
            (track) => track.id === related.track.id
          )
          setSelectedTrack(related.track.id)
          browseArea.current = "tracks"
          notify(`Related track selected: ${related.track.title}`)
        } else notify("No related tracks in the current library view.")
      } else if (action.type === "libraryView") {
        update((db) => ({
          ...db,
          session: { ...db.session, layout: "library" },
        }))
      } else if (action.type === "clearCue") dj.hotcue(id, action.value, true)
      else if (action.type === "loopIn") dj.setLoopIn(id)
      else if (action.type === "loopOut") dj.setLoopOut(id)
      else if (action.type === "jog") dj.jog(id, action.value)
      else if (action.type === "beatjump")
        dj.beatjump(id, action.value * Math.pow(2, dj.state[id].padBank))
      else if (action.type === "load") {
        if (dj.state[id].playing) {
          notify(`Pause deck ${id} before loading another track.`)
          return
        }
        const track = scopeRef.current.at(
          Math.min(selectedRef.current, scopeRef.current.length - 1)
        )
        if (track) void loadTrack(id, track)
      } else if (action.type === "loop")
        dj.loop(id, dj.state[id].loop ? null : 4)
      else if (action.type === "browseFocus") {
        browseArea.current =
          browseArea.current === "tracks" ? "collections" : "tracks"
        const element = document.querySelector<HTMLElement>(
          browseArea.current === "collections"
            ? '[aria-label="Loaded folder or playlist"]'
            : 'input[aria-label="Search library"]'
        )
        element?.focus()
        if (action.value < 0) {
          browseArea.current = "collections"
          document
            .querySelector<HTMLElement>(
              '[aria-label="Loaded folder or playlist"]'
            )
            ?.click()
        }
      } else if (action.type === "browse") {
        if (browseArea.current === "collections") {
          const tabs = [
            "all",
            "local",
            "favorites",
            "queue",
            ...dataRef.current.collections.map(
              (collection) => `collection:${collection.id}`
            ),
          ]
          const index = Math.max(
            0,
            tabs.indexOf(dataRef.current.session.libraryTab)
          )
          const nextTab =
            tabs[
              Math.max(
                0,
                Math.min(tabs.length - 1, index + Math.trunc(action.value))
              )
            ]
          setLibraryQuery("")
          setLibraryGenre("all")
          update((db) => ({
            ...db,
            session: { ...db.session, libraryTab: nextTab },
          }))
          return
        }
        selectedRef.current = Math.max(
          0,
          Math.min(
            scopeRef.current.length - 1,
            selectedRef.current + Math.trunc(action.value)
          )
        )
        setSelectedTrack(scopeRef.current[selectedRef.current]?.id ?? null)
      } else if (action.type === "seek")
        dj.seek(id, dj.state[id].position + action.value)
      else if (action.type === "crossfade") {
        // Apply the physical value before coaching and persistence work.
        dj.setCrossfade(action.value)
        const start =
          (lastFader.current <= 0.08 && action.value > 0.08) ||
          (lastFader.current >= 0.92 && action.value < 0.92)
        if (
          start &&
          !attempt.current &&
          dj.state.A.playing &&
          dj.state.B.playing
        ) {
          const out = lastFader.current < 0.5 ? dj.state.A : dj.state.B,
            incoming = lastFader.current < 0.5 ? dj.state.B : dj.state.A
          attempt.current = {
            startedAt: performance.now(),
            startPosition: out.position,
            beatOffset: gridOffset(out.track),
            bpm: out.track?.bpm ?? null,
            incomingBpm: incoming.track?.bpm ?? null,
            outgoingRate: out.rate,
            incomingRate: incoming.rate,
            eqMoves: 0,
            faderMoves: 0,
            target: lastFader.current < 0.5 ? "B" : "A",
          }
        }
        if (attempt.current) {
          attempt.current.faderMoves++
          if (
            (attempt.current.target === "B"
              ? action.value > 0.95
              : action.value < 0.05) &&
            attempt.current.faderMoves > 3
          ) {
            const feedback = scoreTransition(attempt.current, performance.now())
            setReport(feedback)
            attempt.current = null
            update((db) => ({
              ...db,
              reports: [feedback, ...db.reports].slice(0, 20),
            }))
          }
        }
        lastFader.current = action.value
      } else {
        if (
          attempt.current &&
          ["low", "mid", "high", "filter"].includes(action.type)
        )
          attempt.current.eqMoves++
        if (
          action.type === "volume" ||
          action.type === "trim" ||
          action.type === "low" ||
          action.type === "mid" ||
          action.type === "high" ||
          action.type === "filter" ||
          action.type === "rate"
        )
          dj.setParam(
            id,
            action.type,
            action.type === "rate"
              ? 1 + ((action.value - 1) * dj.state[id].tempoRange) / 0.08
              : action.value
          )
      }
    },
    [loadTrack, update, notify, midiActivity]
  )

  const connectMidi = useCallback(async () => {
    if (!("requestMIDIAccess" in navigator)) {
      setMidi((p) => ({
        ...p,
        error:
          "This browser does not support Web MIDI. Open Cue in Chrome or Edge.",
      }))
      return
    }
    setMidi((p) => ({ ...p, connecting: true, error: null }))
    // Call inside the connect click, before MIDI permission adds an await.
    void engineRef.current?.resumeAudio()
    feedbackCleanup.current?.()
    feedbackCleanup.current = null
    try {
      const access = await midiSession.current.connect(() =>
        navigator.requestMIDIAccess({ sysex: false })
      )
      if (!access) return
      let boundSignature: string | null = null
      const bind = () => {
        const inputs = Array.from(access.inputs.values()).filter(
          (input) => input.state === "connected"
        )
        const outputs = Array.from(access.outputs.values()).filter(
          (port) => port.state === "connected" && /FLX4/i.test(port.name ?? "")
        )
        const signature = [
          ...inputs.map((input) => input.id),
          ...outputs.map((output) => output.id),
        ]
          .sort()
          .join("|")
        if (signature === boundSignature) return
        boundSignature = signature
        feedbackCleanup.current?.()
        feedbackCleanup.current = null
        access.inputs.forEach((input) => {
          input.onmidimessage = null
        })
        const flx4Inputs = inputs.filter((input) =>
          /FLX4/i.test(input.name ?? "")
        )
        const flx4 = flx4Inputs.at(0)
        decoders.current.clear()
        midiActivity.reset()
        for (const input of flx4Inputs) input.onmidimessage = handleMidi
        const connected = inputs.length > 0,
          dj = engineRef.current
        if (dj) {
          dj.setHardwareConnected(connected)
          lastFader.current = dj.state.crossfade
          const feedback = outputs.map(
            (output) =>
              new FLX4Feedback((packet) => {
                try {
                  if (output.state === "connected") output.send(packet)
                } catch {
                  /* A disconnected output must not stop input. */
                }
              })
          )
          const refresh = () =>
            feedback.forEach((port) => port.update(dj.state))
          refresh()
          const unsubscribe = dj.subscribe(refresh)
          feedbackCleanup.current = () => {
            unsubscribe()
            feedback.forEach((port) => port.clear())
          }
        }
        setMidi({
          connected,
          name: flx4?.name ?? inputs[0]?.name ?? "",
          supported: !!flx4,
          error:
            connected && !flx4
              ? "Controller detected. This build maps the Pioneer DDJ-FLX4 only."
              : null,
          connecting: false,
        })
        if (connected) {
          notify(
            flx4
              ? "FLX4 mapping loaded. Automix is disabled; the transition coach is ready."
              : "Controller connected. Automix is disabled. FLX4 is the supported mapping."
          )
        }
      }
      access.onstatechange = bind
      bind()
      if (
        !Array.from(access.inputs.values()).some(
          (input) => input.state === "connected"
        )
      )
        notify("MIDI enabled. Plug in your FLX4 with a data-capable USB cable.")
    } catch (error) {
      setMidi((p) => ({
        ...p,
        connecting: false,
        error:
          error instanceof Error
            ? error.message
            : "MIDI permission was denied.",
      }))
    }
  }, [handleMidi, notify, midiActivity])
  const disconnectMidi = useCallback(() => {
    feedbackCleanup.current?.()
    feedbackCleanup.current = null
    midiSession.current.disconnect()
    decoders.current.clear()
    midiActivity.reset()
    if (engineRef.current) engineRef.current.setHardwareConnected(false)
    attempt.current = null
    setMidi({
      connected: false,
      name: "",
      supported: true,
      error: null,
      connecting: false,
    })
    notify("Controller input disconnected from Cue.")
  }, [notify, midiActivity])
  useEffect(() => {
    // Physical MIDI is not a browser activation gesture. Unlock the existing
    // graph on the first studio interaction, without starting either deck.
    const unlock = () => void engineRef.current?.resumeAudio()
    document.addEventListener("pointerdown", unlock, true)
    document.addEventListener("keydown", unlock, true)
    return () => {
      document.removeEventListener("pointerdown", unlock, true)
      document.removeEventListener("keydown", unlock, true)
    }
  }, [])
  useEffect(() => {
    // Re-bind without asking again if this origin already has MIDI permission.
    const permissions = (navigator as { permissions?: Permissions }).permissions
    void permissions
      ?.query({ name: "midi" })
      .then((result) => {
        if (result.state === "granted") void connectMidi()
      })
      .catch(() => {})
  }, [connectMidi])
  useEffect(() => {
    if (!engine) return
    const planningInputs = selectSnapshot((state: EngineState) => ({
      outId: outgoingDeck(state),
      a: state.A.track,
      b: state.B.track,
      aRate: effectiveDeckRate(state.A),
      bRate: effectiveDeckRate(state.B),
      intent: dataRef.current.session.mixIntent,
      technique: dataRef.current.session.transitionTechnique,
      cues: dataRef.current.session.transitionCues,
      recent: dataRef.current.session.recentTransitions,
    }))
    let previous: ReturnType<typeof planningInputs> | undefined
    let plan: ReturnType<typeof planTransitions>[number] | undefined
    return engine.subscribe(() => {
      if (!engine.hardwareLocked) return
      const outId = outgoingDeck(engine.state),
        out = engine.state[outId],
        incoming = engine.state[outId === "A" ? "B" : "A"]
      if (!out.playing || !out.track || !incoming.track) return
      const inputs = planningInputs(engine.state)
      if (inputs !== previous) {
        previous = inputs
        const plans = planTransitions(out.track, incoming.track, 0, {
          outRate: effectiveDeckRate(out),
          incomingRate: effectiveDeckRate(incoming),
          intent: inputs.intent,
          recent: inputs.recent,
          outCue: inputs.cues[out.track.id]?.exit,
          inCue: inputs.cues[incoming.track.id]?.entry,
        })
        plan = plans.find((p) => p.id === inputs.technique) ?? plans.at(0)
      }
      const zone = `${out.track.id}:${incoming.track.id}`
      if (!plan) return
      if (
        out.position >= plan.outStart - (16 * 60) / (out.track.bpm ?? 120) &&
        dismissedZone.current !== zone
      ) {
        dismissedZone.current = zone
        setReport(null)
        setCoachOpen(true)
      }
    })
  }, [engine])
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,[role=slider],[role=dialog],[role=combobox]"
        ) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.repeat
      )
        return
      const dj = engineRef.current
      if (!dj) return
      if (e.key.toLowerCase() === "a") {
        e.preventDefault()
        void dj.toggle("A")
      }
      if (e.key.toLowerCase() === "b") {
        e.preventDefault()
        void dj.toggle("B")
      }
      if (e.key.toLowerCase() === "q") dj.cue("A")
      if (e.key.toLowerCase() === "w") dj.cue("B")
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [])

  const value: DJContextValue = {
    engine,
    automix,
    startAutomix: async (out) => {
      // Resume in the switch's activation gesture, before decoding the next track.
      void engineRef.current?.resumeAudio()
      await automixRef.current?.start(out)
    },
    stopAutomix: () => automixRef.current?.stop(),
    resetAutomixHistory: () => automixRef.current?.resetHistory(),
    database,
    tracks,
    ready,
    storageError,
    message,
    notify,
    loadTrack,
    importFiles,
    importing,
    folderLinkSupported,
    scanningFolder,
    linkMusicFolder: () => connectFolder(),
    rescanMusicFolder: (id) => connectFolder(id, true),
    reconnectMusicFolder: (id) => connectFolder(id),
    libraryAnalysis,
    libraryTab,
    setLibraryTab,
    libraryQuery,
    setLibraryQuery,
    libraryGenre,
    setLibraryGenre,
    scopeTracks,
    scopeLabel: scopeName(database, libraryTab),
    createPlaylist: (name, trackIds) => {
      const id = crypto.randomUUID()
      update((db) => ({
        ...db,
        collections: [
          ...db.collections,
          {
            id,
            name: name.trim(),
            kind: "playlist",
            trackIds: [...new Set(trackIds)],
          },
        ],
        session: { ...db.session, libraryTab: `collection:${id}` },
      }))
      setLibraryQuery("")
      setLibraryGenre("all")
    },
    midi,
    midiActivity,
    connectMidi,
    disconnectMidi,
    coachOpen,
    setCoachOpen,
    coachDetailsOpen,
    setCoachDetailsOpen,
    coachDetailsTab,
    setCoachDetailsTab,
    report,
    clearReport: () => setReport(null),
    favorite,
    setEnergyRating,
    enqueue,
    completeLesson: (id) =>
      update((db) => ({
        ...db,
        completedLessons: db.completedLessons.includes(id)
          ? db.completedLessons
          : [...db.completedLessons, id],
      })),
    saveSession: () => {
      const dj = engineRef.current
      if (!dj) return
      update((db) => ({
        ...db,
        session: {
          ...db.session,
          A: dj.state.A.track?.id ?? "edm",
          B: dj.state.B.track?.id ?? "lift",
          master: dj.state.master,
        },
      }))
      notify(
        "Session saved on this device. Analysis and cue points save automatically."
      )
    },
    selectedTrack,
    sidebarCollapsed: database.session.sidebarCollapsed,
    setSidebarCollapsed: (sidebarCollapsed) =>
      update((db) => ({ ...db, session: { ...db.session, sidebarCollapsed } })),
    direction: database.session.direction,
    setDirection: (direction) =>
      update((db) => ({ ...db, session: { ...db.session, direction } })),
    theme: database.session.theme,
    density: database.session.density,
    setDensity: (density) =>
      update((db) => ({ ...db, session: { ...db.session, density } })),
    waveStyle: database.session.waveStyle,
    setWaveStyle: (waveStyle) =>
      update((db) => ({ ...db, session: { ...db.session, waveStyle } })),
    setTheme: (theme) =>
      update((db) => ({ ...db, session: { ...db.session, theme } })),
    layout: database.session.layout,
    setLayout: (layout) =>
      update((db) => ({ ...db, session: { ...db.session, layout } })),
    setMixIntent: (mixIntent) => {
      update((db) => ({ ...db, session: { ...db.session, mixIntent } }))
      automixRef.current?.refresh()
    },
    setTransitionCue: (trackId, role, position) => {
      engineRef.current?.cancelAuto()
      update((db) => ({
        ...db,
        session: {
          ...db.session,
          transitionCues: {
            ...db.session.transitionCues,
            [trackId]: {
              ...(db.session.transitionCues[trackId] ?? {
                entry: null,
                exit: null,
              }),
              [role]: position,
            },
          },
        },
      }))
    },
    setTransitionTechnique: (transitionTechnique) => {
      update((db) => ({
        ...db,
        session: { ...db.session, transitionTechnique },
      }))
      automixRef.current?.refresh()
    },
    transitionPreview,
    setTransitionPreview,
    selectTransitionPair: (outId, expectedOut, expectedIn, plan) => {
      const dj = engineRef.current
      const inId = outId === "A" ? "B" : "A"
      if (
        !dj ||
        dj.state[outId].track?.id !== expectedOut ||
        dj.state[inId].track?.id !== expectedIn ||
        dj.state[outId].loading ||
        dj.state[inId].loading ||
        !Number.isFinite(plan.outStart) ||
        !Number.isFinite(plan.inStart) ||
        plan.outStart < 0 ||
        plan.inStart < 0 ||
        plan.outStart >= dj.state[outId].track.duration ||
        plan.inStart >= dj.state[inId].track.duration
      )
        return false
      dj.cancelAuto()
      update((db) => ({
        ...db,
        session: {
          ...db.session,
          transitionTechnique: plan.id,
          transitionCues: {
            ...db.session.transitionCues,
            [expectedOut]: {
              ...(db.session.transitionCues[expectedOut] ?? {
                entry: null,
                exit: null,
              }),
              exit: plan.outStart,
            },
            [expectedIn]: {
              ...(db.session.transitionCues[expectedIn] ?? {
                entry: null,
                exit: null,
              }),
              entry: plan.inStart,
              ...(expectedOut === expectedIn ? { exit: plan.outStart } : {}),
            },
          },
        },
      }))
      return true
    },
  }
  return <DJContext.Provider value={value}>{children}</DJContext.Provider>
}

const fallbackEngine: EngineState = {
  A: { ...emptyDeck(), track: demoTracks[0], loading: true },
  B: { ...emptyDeck(), track: demoTracks[1], loading: true },
  crossfade: 0.5,
  channelMix: false,
  autoLevels: "",
  master: 0.7,
  auto: false,
  autoOut: null,
  autoPlan: null,
  transition: 0,
  autoStatus: "Ready when you are",
  recording: false,
  lastRecording: null,
  error: null,
  controller: emptyController(),
}

const noopSubscribe = () => () => {}
const wholeEngine = (state: EngineState) => state
export function useEngine<TValue = EngineState>(
  selector: (state: EngineState) => TValue = wholeEngine as (
    state: EngineState
  ) => TValue
) {
  const { engine } = useDJ()
  const select = useMemo(() => selectSnapshot(selector), [selector, engine])
  const snapshot = useCallback(
    () => select(engine?.getSnapshot() ?? fallbackEngine),
    [engine, select]
  )
  const serverSnapshot = useCallback(() => select(fallbackEngine), [select])
  return useSyncExternalStore(
    engine?.subscribe ?? noopSubscribe,
    snapshot,
    serverSnapshot
  )
}

export function useTransitionPlan() {
  const state = useEngine((current) => ({
      outId: current.autoOut ?? outgoingDeck(current),
      autoPlan: current.autoPlan,
      aTrack: current.A.track,
      aCues: current.A.cues,
      aCueLabels: current.A.cueLabels,
      aPlaying: current.A.playing,
      aLoading: current.A.loading,
      aPosition: current.A.position,
      aRate: effectiveDeckRate(current.A),
      aLow: current.A.low,
      bTrack: current.B.track,
      bCues: current.B.cues,
      bCueLabels: current.B.cueLabels,
      bPlaying: current.B.playing,
      bLoading: current.B.loading,
      bPosition: current.B.position,
      bRate: effectiveDeckRate(current.B),
      bLow: current.B.low,
    })),
    { database } = useDJ()
  const outId = state.outId,
    inId: DeckId = outId === "A" ? "B" : "A"
  const a = {
    track: state.aTrack,
    cues: state.aCues,
    cueLabels: state.aCueLabels,
    playing: state.aPlaying,
    loading: state.aLoading,
    position: state.aPosition,
    rate: state.aRate,
    low: state.aLow,
  }
  const b = {
    track: state.bTrack,
    cues: state.bCues,
    cueLabels: state.bCueLabels,
    playing: state.bPlaying,
    loading: state.bLoading,
    position: state.bPosition,
    rate: state.bRate,
    low: state.bLow,
  }
  const out = outId === "A" ? a : b,
    incoming = inId === "A" ? a : b
  const { mixIntent, transitionTechnique, recentTransitions, transitionCues } =
    database.session
  const outCue = out.track ? (transitionCues[out.track.id]?.exit ?? null) : null
  const inCue = incoming.track
    ? (transitionCues[incoming.track.id]?.entry ?? null)
    : null
  // Keep suggestions stable while listening. The engine revalidates live position on launch.
  const plans = useMemo(
    () =>
      out.track && incoming.track
        ? planTransitions(out.track, incoming.track, 0, {
            outRate: out.rate,
            incomingRate: incoming.rate,
            intent: mixIntent,
            recent: recentTransitions,
            outCue,
            inCue,
          })
        : [],
    [
      out.track,
      incoming.track,
      out.rate,
      incoming.rate,
      mixIntent,
      recentTransitions,
      outCue,
      inCue,
    ]
  )
  const plan =
    state.autoPlan ??
    plans.find((p) => p.id === transitionTechnique) ??
    plans.at(0)
  return { outId, inId, out, incoming, plans, plan, outCue, inCue }
}
