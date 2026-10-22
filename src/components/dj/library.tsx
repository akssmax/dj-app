import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  libraryWindow,
  LIBRARY_HEADER_HEIGHT,
  LIBRARY_ROW_HEIGHT,
} from "@/lib/dj/library-window"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { DJContextValue } from "./context"
import type { Track, EnergyRating } from "@/lib/dj/types"
import { useDJ, useEngine } from "./provider"
import { Artwork } from "./waveform"
import { FolderBrowser } from "./folder-browser"
import { Icon } from "./icons"
import { formatTime } from "@/lib/dj/tracks"
import { effectiveDeckRate, outgoingDeck } from "@/lib/dj/engine"
import { mixFit, sortTracks, TRACK_DRAG_TYPE } from "@/lib/dj/mix-fit"
import type { MixFit, SortKey, SortState } from "@/lib/dj/mix-fit"
import { waveColumns } from "@/lib/dj/wave-peaks"
import { drawWave, fitCanvas, readPalette } from "./wave-canvas"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  hasQueryFields,
  lastPlayedMap,
  parseLibraryQuery,
  setlistText,
} from "@/lib/dj/library-query"
import { libraryAnalyzable } from "@/lib/dj/library-analysis"
import { readLinkedFile } from "@/lib/dj/linked-files"

export function ImportButton({
  compact = false,
  folder = false,
}: {
  compact?: boolean
  folder?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null),
    { importFiles, importing } = useDJ()
  return (
    <>
      <Input
        ref={ref}
        className="hidden"
        tabIndex={-1}
        type="file"
        multiple
        {...(folder ? { webkitdirectory: "", directory: "" } : {})}
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.aiff,.opus"
        aria-label={folder ? "Choose music folder" : "Choose local music files"}
        onChange={(event) => {
          if (event.target.files) void importFiles(event.target.files)
          event.target.value = ""
        }}
      />
      <Button
        variant="outline"
        size={compact ? "sm" : "default"}
        onClick={() => ref.current?.click()}
        disabled={importing}
      >
        <Icon name="upload" size={15} />
        {importing ? "Importing…" : folder ? "Import folder" : "Import tracks"}
      </Button>
    </>
  )
}

const AUDIO_ACCEPT = "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.aiff,.opus"

/** One "Add music" menu for importing files or a folder as offline copies.
 * The file inputs live outside the menu so they survive it closing. */
function AddMusicMenu() {
  const files = useRef<HTMLInputElement>(null),
    folder = useRef<HTMLInputElement>(null),
    { importFiles, importing } = useDJ()
  const input = (ref: typeof files, directory: boolean) => (
    <Input
      ref={ref}
      className="hidden"
      tabIndex={-1}
      type="file"
      multiple
      {...(directory ? { webkitdirectory: "", directory: "" } : {})}
      accept={AUDIO_ACCEPT}
      aria-label={
        directory ? "Choose music folder" : "Choose local music files"
      }
      onChange={(event) => {
        if (event.target.files) void importFiles(event.target.files)
        event.target.value = ""
      }}
    />
  )
  return (
    <>
      {input(files, false)}
      {input(folder, true)}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" disabled={importing} />}
        >
          <Icon name="upload" size={15} />
          {importing ? "Importing…" : "Add music"}
          <Icon name="down" size={12} />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-56">
          <DropdownMenuItem onClick={() => files.current?.click()}>
            Import tracks · offline copy
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => folder.current?.click()}>
            Import folder · offline copy
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

/** Short "played …" label from a timestamp. */
function playedLabel(time: number | undefined, now: number) {
  if (time === undefined) return null
  const days = Math.floor((now - time) / 86_400_000)
  return days < 1
    ? "played today"
    : days === 1
      ? "played yesterday"
      : `played ${days}d ago`
}

/**
 * Plays a short preview of a track, on the headphone output when one is
 * connected, without touching the decks.
 */
function usePreview(
  sinkId: () => string | null,
  notify: (message: string) => void
) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null),
    objectUrl = useRef<string | null>(null)
  const stop = useCallback(() => {
    audio.current?.pause()
    audio.current = null
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = null
    setPlayingId(null)
  }, [])
  useEffect(() => stop, [stop])
  const toggle = useCallback(
    async (track: Track) => {
      if (playingId === track.id) return stop()
      stop()
      try {
        let url = track.url
        if (track.linkedFile || track.file) {
          const blob = track.linkedFile
            ? await readLinkedFile(track.linkedFile)
            : track.file!
          url = objectUrl.current = URL.createObjectURL(blob)
        }
        const player = new Audio(url)
        audio.current = player
        player.volume = 0.8
        const sink = sinkId()
        const setSink = (
          player as unknown as { setSinkId?: (id: string) => Promise<void> }
        ).setSinkId
        if (sink && setSink) await setSink.call(player, sink)
        // Start a third in, past most intros, and stop after 30 seconds.
        player.addEventListener(
          "loadedmetadata",
          () => {
            player.currentTime = Math.max(0, player.duration * 0.33)
          },
          { once: true }
        )
        player.addEventListener("timeupdate", () => {
          if (player.currentTime > player.duration * 0.33 + 30) stop()
        })
        player.addEventListener("ended", stop, { once: true })
        setPlayingId(track.id)
        await player.play()
      } catch (error) {
        stop()
        notify(error instanceof Error ? error.message : "Preview unavailable.")
      }
    },
    [playingId, sinkId, stop, notify]
  )
  return { playingId, toggle, stop }
}

export function Library() {
  const {
      tracks,
      selectedTrack,
      libraryTab,
      database,
      ready,
      favorite,
      setEnergyRating,
      enqueue,
      loadTrack,
      importFiles,
      scopeTracks,
      scopeLabel,
      libraryQuery: search,
      setLibraryQuery: setSearch,
      libraryGenre: genre,
      setLibraryGenre: setGenre,
      createPlaylist,
      createSmartCrate,
      addToPlaylist,
      engine,
      notify,
      folderLinkSupported,
      scanningFolder,
      linkMusicFolder,
      rescanMusicFolder,
      reconnectMusicFolder,
      libraryAnalysis,
    } = useDJ(),
    loaded = useEngine((state) => ({
      A: state.A.track?.id,
      B: state.B.track?.id,
    })),
    // Mix fit is measured against the deck you are mixing out of.
    reference = useEngine((state) => {
      const id = outgoingDeck(state)
      return {
        id,
        track: state[id].track,
        rate: effectiveDeckRate(state[id]),
      }
    })
  const [sort, setSort] = useState<SortState>(null),
    [mixableOnly, setMixableOnly] = useState(false),
    [dragging, setDragging] = useState(false),
    [selection, setSelection] = useState<Set<string>>(new Set()),
    [saveAsSmart, setSaveAsSmart] = useState(false)
  const preview = usePreview(
    useCallback(() => engine?.monitorSinkId() ?? null, [engine]),
    notify
  )
  const lastPlayed = useMemo(
    () => lastPlayedMap(database.history),
    [database.history]
  )
  const now = Date.now()
  const searchHasFields = hasQueryFields(parseLibraryQuery(search))
  const toggleSelected = useCallback(
    (id: string) =>
      setSelection((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    []
  )
  useEffect(() => setSelection(new Set()), [libraryTab])
  const fitFor = useCallback(
    (track: Track) =>
      reference.track && track.id !== reference.track.id
        ? mixFit(reference.track, reference.rate, track)
        : null,
    [reference.track, reference.rate]
  )
  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current?.key !== key
        ? { key, direction: key === "fit" || key === "energy" ? -1 : 1 }
        : current.direction === (key === "fit" || key === "energy" ? -1 : 1)
          ? { key, direction: current.direction === 1 ? -1 : 1 }
          : null
    )
  const [playlistOpen, setPlaylistOpen] = useState(false),
    [playlistName, setPlaylistName] = useState("")
  const favoriteIds = useMemo(
    () => new Set(database.favorites),
    [database.favorites]
  )
  const queueIds = useMemo(() => new Set(database.queue), [database.queue])
  const filtered = useMemo(() => {
    let result = [...scopeTracks]
    if (libraryTab === "queue") {
      const order = new Map(database.queue.map((id, index) => [id, index]))
      result.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    } else if (libraryTab === "history")
      result.sort(
        (a, b) => (lastPlayed.get(b.id) ?? 0) - (lastPlayed.get(a.id) ?? 0)
      )
    if (mixableOnly)
      result = result.filter((track) => {
        const fit = fitFor(track)
        return !fit || fit.overall === "good" || fit.overall === "ok"
      })
    return sortTracks(result, sort, {
      energy: database.energyRatings,
      fit: fitFor,
    })
  }, [
    scopeTracks,
    libraryTab,
    database.queue,
    database.energyRatings,
    lastPlayed,
    sort,
    mixableOnly,
    fitFor,
  ])
  const viewport = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(480)
  const range = libraryWindow(filtered.length, scrollTop, viewportHeight)
  useEffect(() => {
    const node = viewport.current
    if (!node) return
    const observer = new ResizeObserver(() =>
      setViewportHeight(node.clientHeight)
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (viewport.current) viewport.current.scrollTop = 0
    setScrollTop(0)
  }, [libraryTab, search, genre, sort, mixableOnly])
  const previousSelection = useRef(selectedTrack)
  useEffect(() => {
    if (previousSelection.current === selectedTrack) return
    previousSelection.current = selectedTrack
    const node = viewport.current
    const index = filtered.findIndex((track) => track.id === selectedTrack)
    if (!node || index < 0) return
    const top = index * LIBRARY_ROW_HEIGHT + LIBRARY_HEADER_HEIGHT
    if (top < node.scrollTop + LIBRARY_HEADER_HEIGHT)
      node.scrollTop = top - LIBRARY_HEADER_HEIGHT
    else if (top + LIBRARY_ROW_HEIGHT > node.scrollTop + node.clientHeight)
      node.scrollTop = top + LIBRARY_ROW_HEIGHT - node.clientHeight
  }, [selectedTrack, filtered])
  const tab = libraryTab
  const selectedFolder = database.linkedFolders.find(
    (folder) =>
      libraryTab === `collection:${folder.id}` ||
      libraryTab.startsWith(`collection:${folder.id}/path/`)
  )
  const unavailableCount = filtered.filter(
    (track) => track.available === false
  ).length
  const analyzedCount = filtered.filter((track) => track.analysis).length
  return (
    <Card
      className={`library-panel ${dragging ? "is-dragging" : ""}`}
      onDragOver={(e) => {
        // Rows dragged toward a deck are not file imports.
        if (!e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files.length) void importFiles(e.dataTransfer.files)
      }}
    >
      <div className="section-heading">
        <div>
          <Icon name="library" />
          <h2>Your library</h2>
          <Badge variant="secondary">{tracks.length}</Badge>
        </div>
        <div className="library-import-actions">
          <Button
            size="sm"
            disabled={!ready || !folderLinkSupported || scanningFolder !== null}
            onClick={() => void linkMusicFolder()}
            title="Link a USB drive or folder. Audio stays where it is."
          >
            <Icon name="usb" size={15} />
            Connect folder
          </Button>
          <AddMusicMenu />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSaveAsSmart(searchHasFields)
              setPlaylistOpen(true)
            }}
            disabled={!filtered.length}
          >
            Save view
          </Button>
        </div>
      </div>
      {!folderLinkSupported && (
        <p className="muted">
          Folder linking requires a supported browser such as desktop Chrome or
          Edge. You can import an offline copy here.
        </p>
      )}
      <div className="library-browser">
        <FolderBrowser />
        <div className="library-content">
          <div className="library-scope-heading">
            <div>
              <h3>{scopeLabel}</h3>
              <span className="muted">
                {filtered.length} tracks
                {selectedFolder ? ` · ${analyzedCount} analyzed` : ""}
                {unavailableCount ? ` · ${unavailableCount} unavailable` : ""}
              </span>
            </div>
            {selectedFolder && (
              <div className="folder-source-actions">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={scanningFolder !== null}
                  onClick={() => void rescanMusicFolder(selectedFolder.id)}
                >
                  {scanningFolder === selectedFolder.id
                    ? "Scanning…"
                    : "Rescan"}
                </Button>
                {unavailableCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!folderLinkSupported || scanningFolder !== null}
                    onClick={() => void reconnectMusicFolder(selectedFolder.id)}
                  >
                    Reconnect
                  </Button>
                )}
              </div>
            )}
          </div>
          {libraryAnalysis.activeId && (
            <div className="library-analysis-status" role="status">
              <span>
                Analyzing{" "}
                {tracks.find((t) => t.id === libraryAnalysis.activeId)?.title}
              </span>
              <span>Metadata saves automatically</span>
            </div>
          )}
          <div className="library-tools">
            <div className="search-field">
              <Icon name="search" size={16} />
              <Input
                placeholder="Search… try bpm:120-128 key:8A~ energy:4+"
                title="Fields: bpm:128, bpm:120-128, key:8A, key:8A~ (compatible), genre:house, artist:name, energy:4+, fresh:30 (not played in 30 days)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search library"
              />
            </div>
            <Select
              value={genre}
              onValueChange={(value) => setGenre(value ?? "all")}
            >
              <SelectTrigger size="sm" aria-label="Filter genre">
                <SelectValue>
                  {genre === "all" ? "All genres" : genre}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All genres</SelectItem>
                {Array.from(new Set(tracks.map((t) => t.genre))).map(
                  (availableGenre) => (
                    <SelectItem key={availableGenre} value={availableGenre}>
                      {availableGenre}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            {reference.track && (
              <Button
                variant="outline"
                size="sm"
                className="mixable-toggle"
                aria-pressed={mixableOnly}
                title={`Show tracks that mix easily out of deck ${reference.id}: tempo within 8% and compatible keys`}
                onClick={() => setMixableOnly(!mixableOnly)}
              >
                <span className="fit-dot" data-fit="good" />
                Mixes with {reference.id}
                <span className="mixable-reference">
                  {reference.track.bpm
                    ? `${(reference.track.bpm * reference.rate).toFixed(1)}`
                    : "—"}
                  {reference.track.camelot
                    ? ` · ${reference.track.camelot}`
                    : ""}
                </span>
              </Button>
            )}
          </div>
          {selection.size > 0 && (
            <div
              className="selection-bar"
              role="toolbar"
              aria-label="Selected tracks"
            >
              <strong>{selection.size} selected</strong>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  for (const id of selection) if (!queueIds.has(id)) enqueue(id)
                }}
              >
                Add to queue
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  for (const id of selection)
                    if (!favoriteIds.has(id)) favorite(id)
                }}
              >
                Favorite
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button size="xs" variant="outline" />}
                >
                  Add to playlist <Icon name="down" size={11} />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-48">
                  {database.collections
                    .filter((c) => c.kind === "playlist")
                    .map((c) => (
                      <DropdownMenuItem
                        key={c.id}
                        onClick={() => addToPlaylist(c.id, [...selection])}
                      >
                        {c.name}
                      </DropdownMenuItem>
                    ))}
                  <DropdownMenuItem
                    onClick={() => {
                      setSaveAsSmart(false)
                      setPlaylistOpen(true)
                    }}
                  >
                    New playlist from selection…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <span
                className="selection-rate"
                aria-label="Rate selected energy"
              >
                {([1, 2, 3, 4, 5] as const).map((level) => (
                  <Button
                    key={level}
                    size="xs"
                    variant="ghost"
                    aria-label={`Rate selected tracks energy ${level}`}
                    onClick={() => {
                      for (const id of selection) setEnergyRating(id, level)
                    }}
                  >
                    {level}
                  </Button>
                ))}
              </span>
              <Button
                size="xs"
                variant="ghost"
                className="selection-clear"
                onClick={() => setSelection(new Set())}
              >
                Clear
              </Button>
            </div>
          )}
          <div className="track-table-panel">
            <Table
              aria-rowcount={filtered.length + 1}
              containerProps={{
                ref: viewport,
                className: "library-table-viewport",
                tabIndex: 0,
                role: "region",
                "aria-label": "Scrollable track list",
                onScroll: (event) =>
                  setScrollTop(event.currentTarget.scrollTop),
              }}
            >
              <TableHeader>
                <TableRow>
                  <TableHead className="number-cell">
                    <SortHead
                      label="FIT"
                      sortKey="fit"
                      sort={sort}
                      onSort={toggleSort}
                      disabled={!reference.track}
                    />
                  </TableHead>
                  <TableHead className="track-name-cell">
                    <SortHead
                      label="TRACK"
                      sortKey="title"
                      sort={sort}
                      onSort={toggleSort}
                    />
                    <span className="sort-divider">/</span>
                    <SortHead
                      label="ARTIST"
                      sortKey="artist"
                      sort={sort}
                      onSort={toggleSort}
                    />
                  </TableHead>
                  <TableHead className="load-cell">LOAD</TableHead>
                  <TableHead className="bpm-cell">
                    <SortHead
                      label="BPM"
                      sortKey="bpm"
                      sort={sort}
                      onSort={toggleSort}
                    />
                  </TableHead>
                  <TableHead className="key-cell">
                    <SortHead
                      label="KEY"
                      sortKey="key"
                      sort={sort}
                      onSort={toggleSort}
                    />
                  </TableHead>
                  <TableHead className="waveform-cell">WAVEFORM</TableHead>
                  <TableHead className="genre-cell">
                    <SortHead
                      label="GENRE"
                      sortKey="genre"
                      sort={sort}
                      onSort={toggleSort}
                    />
                  </TableHead>
                  <TableHead className="time-cell">
                    <SortHead
                      label="TIME"
                      sortKey="time"
                      sort={sort}
                      onSort={toggleSort}
                    />
                  </TableHead>
                  <TableHead className="actions-cell" />
                  <TableHead
                    className="energy-cell"
                    title="Your energy rating: 1 star is low, 5 stars is high. Click the selected star again to clear."
                  >
                    <SortHead
                      label="ENERGY"
                      sortKey="energy"
                      sort={sort}
                      onSort={toggleSort}
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {range.before > 0 && (
                  <tr aria-hidden="true" className="library-spacer">
                    <td colSpan={10} style={{ height: range.before }} />
                  </tr>
                )}
                {filtered.slice(range.start, range.end).map((track, offset) => (
                  <LibraryTrackRow
                    key={track.id}
                    track={track}
                    index={range.start + offset}
                    selected={selectedTrack === track.id}
                    loadedA={loaded.A === track.id}
                    loadedB={loaded.B === track.id}
                    energyRating={database.energyRatings[track.id]}
                    isFavorite={favoriteIds.has(track.id)}
                    inQueue={queueIds.has(track.id)}
                    ready={ready}
                    analyzing={track.id === libraryAnalysis.activeId}
                    analysisError={libraryAnalysis.errors[track.id]}
                    loadTrack={loadTrack}
                    favorite={favorite}
                    enqueue={enqueue}
                    setEnergyRating={setEnergyRating}
                    retry={libraryAnalysis.retry}
                    fit={fitFor(track)}
                    checked={selection.has(track.id)}
                    toggleChecked={toggleSelected}
                    played={playedLabel(lastPlayed.get(track.id), now)}
                    previewing={preview.playingId === track.id}
                    togglePreview={preview.toggle}
                  />
                ))}
                {range.after > 0 && (
                  <tr aria-hidden="true" className="library-spacer">
                    <td colSpan={10} style={{ height: range.after }} />
                  </tr>
                )}
              </TableBody>
            </Table>
            {!filtered.length && (
              <div className="library-empty">
                <Icon name={tab === "local" ? "folder" : "music"} size={28} />
                <h3>
                  {search
                    ? "No matching tracks"
                    : tab === "local"
                      ? "Your music. Your device."
                      : tab === "favorites"
                        ? "Keep your favorites close."
                        : "Build your next mix."}
                </h3>
                <p>
                  {tab === "local"
                    ? "Drop audio files here or import MP3, WAV, FLAC, and more."
                    : tab === "queue"
                      ? "Use the + beside a track to add it to the automix queue."
                      : "Try another search or add tracks to this collection."}
                </p>
                {tab === "local" && <ImportButton />}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="library-footer">
        <span>
          <Icon name="folder" size={13} /> {filtered.length} tracks ·{" "}
          {formatTime(filtered.reduce((sum, track) => sum + track.duration, 0))}{" "}
          total
        </span>
        {libraryTab === "history" && database.history.length > 0 ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              const text = setlistText(database.history, tracks)
              const link = document.createElement("a")
              link.href = URL.createObjectURL(
                new Blob([text], { type: "text/plain" })
              )
              link.download = `cue-setlist-${new Date().toISOString().slice(0, 10)}.txt`
              link.click()
              URL.revokeObjectURL(link.href)
            }}
          >
            <Icon name="download" size={12} /> Export setlist
          </Button>
        ) : (
          <span>
            Drop files to import <Icon name="upload" size={12} />
          </span>
        )}
      </div>
      <Dialog open={playlistOpen} onOpenChange={setPlaylistOpen}>
        <DialogContent>
          <DialogTitle>
            {saveAsSmart ? "Save as a smart crate" : "Save as a playlist"}
          </DialogTitle>
          <DialogDescription>
            {saveAsSmart
              ? `A smart crate keeps the rule “${search.trim()}” and updates as your library changes.`
              : selection.size
                ? `Save the ${selection.size} selected tracks as a playlist.`
                : `Include the ${filtered.length} tracks currently visible in ${scopeLabel}.`}
          </DialogDescription>
          {searchHasFields && !selection.size && (
            <div className="save-kind" role="radiogroup" aria-label="Save as">
              <Button
                size="sm"
                variant="outline"
                role="radio"
                aria-checked={saveAsSmart}
                onClick={() => setSaveAsSmart(true)}
              >
                Smart crate · keeps updating
              </Button>
              <Button
                size="sm"
                variant="outline"
                role="radio"
                aria-checked={!saveAsSmart}
                onClick={() => setSaveAsSmart(false)}
              >
                Playlist · these {filtered.length} tracks
              </Button>
            </div>
          )}
          <Input
            aria-label={saveAsSmart ? "Crate name" : "Playlist name"}
            placeholder={saveAsSmart ? "Crate name" : "Playlist name"}
            value={playlistName}
            onChange={(event) => setPlaylistName(event.target.value)}
          />
          <Button
            disabled={!playlistName.trim() || !filtered.length}
            onClick={() => {
              if (saveAsSmart) createSmartCrate(playlistName, search.trim())
              else
                createPlaylist(
                  playlistName,
                  selection.size
                    ? [...selection]
                    : filtered.map((track) => track.id)
                )
              setPlaylistOpen(false)
              setPlaylistName("")
              setSelection(new Set())
            }}
          >
            {saveAsSmart ? "Save crate" : "Save playlist"}
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

type TrackRowProps = {
  track: Track
  index: number
  selected: boolean
  loadedA: boolean
  loadedB: boolean
  energyRating: EnergyRating | undefined
  isFavorite: boolean
  inQueue: boolean
  ready: boolean
  analyzing: boolean
  analysisError: string | undefined
  loadTrack: DJContextValue["loadTrack"]
  favorite: DJContextValue["favorite"]
  enqueue: DJContextValue["enqueue"]
  setEnergyRating: DJContextValue["setEnergyRating"]
  retry: DJContextValue["libraryAnalysis"]["retry"]
  fit: MixFit | null
  checked: boolean
  toggleChecked: (id: string) => void
  played: string | null
  previewing: boolean
  togglePreview: (track: Track) => void
}
const LibraryTrackRow = memo(function TrackRowView({
  track,
  index,
  selected,
  loadedA,
  loadedB,
  energyRating,
  isFavorite,
  inQueue,
  ready,
  analyzing,
  analysisError,
  loadTrack,
  favorite,
  enqueue,
  setEnergyRating,
  retry,
  fit,
  checked,
  toggleChecked,
  played,
  previewing,
  togglePreview,
}: TrackRowProps) {
  const draggable = track.available !== false
  return (
    <TableRow
      key={track.id}
      aria-rowindex={index + 2}
      data-fit={fit?.overall}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData(TRACK_DRAG_TYPE, track.id)
        event.dataTransfer.effectAllowed = "copy"
      }}
      aria-selected={checked}
      className={`${selected ? "midi-selected" : ""} ${checked ? "is-checked" : ""} ${
        loadedA ? "track-loaded-a" : loadedB ? "track-loaded-b" : ""
      }`}
    >
      <TableCell className="number-cell">
        <input
          type="checkbox"
          className="row-check"
          checked={checked}
          onChange={() => toggleChecked(track.id)}
          aria-label={`Select ${track.title}`}
        />
        {loadedA || loadedB ? (
          <Icon name="music" size={14} />
        ) : (
          <span
            className="fit-dot"
            data-fit={fit?.overall ?? "unknown"}
            title={fitTitle(fit)}
          />
        )}
      </TableCell>
      <TableCell className="track-name-cell">
        <div className="library-track">
          <Artwork color={track.color} small />
          <div>
            <strong title={track.linkedFile?.path ?? track.title}>
              {track.title}
            </strong>
            <span>
              {track.artist}
              {played && <em className="played-label"> · {played}</em>}
            </span>
          </div>
        </div>
        {track.available === false && (
          <small className="track-unavailable">
            Unavailable · reconnect folder
          </small>
        )}
      </TableCell>
      <TableCell className="load-cell">
        <div className="load-buttons">
          <Button
            size="icon-xs"
            variant="outline"
            className={loadedA ? "loaded-a" : ""}
            disabled={track.available === false}
            onClick={() => void loadTrack("A", track)}
            aria-label={`Load ${track.title} to deck A`}
          >
            A
          </Button>
          <Button
            size="icon-xs"
            variant="outline"
            className={loadedB ? "loaded-b" : ""}
            disabled={track.available === false}
            onClick={() => void loadTrack("B", track)}
            aria-label={`Load ${track.title} to deck B`}
          >
            B
          </Button>
        </div>
      </TableCell>
      <TableCell className="bpm-cell mono">
        <span>{track.bpm ? Math.round(track.bpm * 10) / 10 : "—"}</span>
        {fit?.gap != null && (
          <small data-fit={fit.tempo} title={fitTitle(fit)}>
            {fit.gap >= 0 ? "+" : "−"}
            {Math.abs(fit.gap).toFixed(1)}%
            {fit.multiple === 2 ? " ×2" : fit.multiple === 0.5 ? " ½" : ""}
          </small>
        )}
      </TableCell>
      <TableCell className="key-cell">
        <Badge
          variant="outline"
          data-fit={fit?.key}
          style={keyHue(track.camelot)}
          className={`key-badge ${loadedA ? "key-lime" : loadedB ? "key-orange" : ""}`}
        >
          {track.camelot ?? "—"}
        </Badge>
      </TableCell>
      <TableCell className="waveform-cell">
        {track.analysis && <MiniWaveform track={track} />}
        {!track.analysis && (
          <span className="muted" title={analysisError}>
            {analyzing
              ? "Analyzing…"
              : analysisError
                ? "Failed"
                : libraryAnalyzable(track)
                  ? "Queued"
                  : "—"}
          </span>
        )}
        {analysisError && !track.analysis && track.available !== false && (
          <Button size="xs" variant="ghost" onClick={() => retry(track.id)}>
            Retry
          </Button>
        )}
      </TableCell>
      <TableCell className="genre-cell muted">{track.genre}</TableCell>
      <TableCell className="time-cell mono muted">
        {formatTime(track.duration)}
      </TableCell>
      <TableCell className="actions-cell">
        <div className="track-actions">
          <Button
            size="icon-xs"
            variant="ghost"
            className={previewing ? "is-previewing" : ""}
            disabled={track.available === false}
            aria-label={`${previewing ? "Stop preview of" : "Preview"} ${track.title}`}
            title="Preview on headphones (or main output) without loading a deck"
            onClick={() => togglePreview(track)}
          >
            <Icon name={previewing ? "stop" : "headphones"} size={14} />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            className={isFavorite ? "is-favorite" : ""}
            aria-label={`${isFavorite ? "Unfavorite" : "Favorite"} ${track.title}`}
            onClick={() => favorite(track.id)}
          >
            <Icon name="heart" size={14} />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`${inQueue ? "Remove" : "Add"} ${track.title} ${inQueue ? "from" : "to"} queue`}
            onClick={() => enqueue(track.id)}
          >
            <Icon name={inQueue ? "tick" : "add"} size={14} />
          </Button>
        </div>
      </TableCell>
      <TableCell className="energy-cell">
        <div
          className="energy-rating"
          role="group"
          aria-label={`${track.title} energy: ${energyRating ? `${energyRating} out of 5 stars` : "unrated"}`}
        >
          {([1, 2, 3, 4, 5] as const).map((stars) => {
            const label =
              energyRating === stars
                ? `Clear energy rating for ${track.title}`
                : `Rate ${track.title} energy ${stars} out of 5 stars`
            return (
              <Button
                key={stars}
                size="icon-xs"
                variant="ghost"
                className={`energy-star ${stars <= (energyRating ?? 0) ? "is-rated" : ""}`}
                disabled={!ready}
                aria-label={label}
                aria-pressed={energyRating === stars}
                title={label}
                onClick={() =>
                  setEnergyRating(
                    track.id,
                    energyRating === stars ? null : stars
                  )
                }
              >
                <span className="energy-segment" aria-hidden="true" />
              </Button>
            )
          })}
        </div>
      </TableCell>
    </TableRow>
  )
})

const MiniWaveform = memo(function WaveformView({ track }: { track: Track }) {
  const { theme, waveStyle } = useDJ()
  const canvas = useRef<HTMLCanvasElement>(null)
  const analysis = track.analysis!
  useEffect(() => {
    const element = canvas.current,
      context = element?.getContext("2d")
    if (!element || !context) return
    fitCanvas(element)
    context.clearRect(0, 0, element.width, element.height)
    drawWave(
      context,
      waveColumns(
        analysis.peaks,
        analysis.bands,
        track.duration,
        0,
        track.duration,
        element.width
      ),
      readPalette(element),
      !!analysis.bands,
      0,
      waveStyle
    )
  }, [analysis, track.duration, theme, waveStyle])
  return (
    <canvas
      ref={canvas}
      className="library-mini-waveform"
      role="img"
      aria-label={`Waveform for ${track.title}`}
    />
  )
})

/** Camelot wheel color: hue steps 30° per number; B (major) is lighter. */
function keyHue(camelot: string | null) {
  const match = camelot?.match(/^(1[0-2]|[1-9])([AB])$/)
  if (!match) return undefined
  return {
    "--key-hue": String((+match[1] - 1) * 30),
    "--key-light": match[2] === "B" ? "68%" : "58%",
  } as React.CSSProperties
}

function fitTitle(fit: MixFit | null) {
  if (!fit) return "Load a track on the playing deck to see mix fit"
  const tempo =
    fit.gap === null
      ? "tempo unknown"
      : `${fit.gap >= 0 ? "+" : "−"}${Math.abs(fit.gap).toFixed(1)}% tempo${fit.multiple === 1 ? "" : " (half/double time)"}`
  const key =
    fit.key === "unknown"
      ? "key unknown"
      : fit.key === "good"
        ? "compatible key"
        : "key clash"
  const label = {
    good: "Easy mix",
    ok: "Workable",
    poor: "Hard mix",
    unknown: "Fit unknown",
  }[fit.overall]
  return `${label} · ${tempo} · ${key}`
}

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
  disabled = false,
}: {
  label: string
  sortKey: SortKey
  sort: SortState
  onSort: (key: SortKey) => void
  disabled?: boolean
}) {
  const active = sort?.key === sortKey
  return (
    <Button
      variant="ghost"
      size="xs"
      className="table-sort"
      data-active={active || undefined}
      disabled={disabled}
      aria-label={`Sort by ${label.toLowerCase()}${active ? (sort.direction === 1 ? ", ascending" : ", descending") : ""}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active && (
        <Icon
          name="down"
          size={11}
          className={sort.direction === 1 ? "sort-asc" : undefined}
        />
      )}
    </Button>
  )
}
