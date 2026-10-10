import { memo, useEffect, useMemo, useRef, useState } from "react"
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
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

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
    }))
  const [sort, setSort] = useState(false),
    [dragging, setDragging] = useState(false)
  const [playlistOpen, setPlaylistOpen] = useState(false),
    [playlistName, setPlaylistName] = useState("")
  const favoriteIds = useMemo(
    () => new Set(database.favorites),
    [database.favorites]
  )
  const queueIds = useMemo(() => new Set(database.queue), [database.queue])
  const filtered = useMemo(() => {
    const result = [...scopeTracks]
    if (libraryTab === "queue") {
      const order = new Map(database.queue.map((id, index) => [id, index]))
      result.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    } else if (sort) result.sort((a, b) => (a.bpm ?? 0) - (b.bpm ?? 0))
    return result
  }, [scopeTracks, libraryTab, database.queue, sort])
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
  }, [libraryTab, search, genre, sort])
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
            variant="outline"
            disabled={!ready || !folderLinkSupported || scanningFolder !== null}
            onClick={() => void linkMusicFolder()}
          >
            Connect folder
          </Button>
          <ImportButton compact />
          <ImportButton compact folder />
          <Button
            variant="outline"
            onClick={() => setPlaylistOpen(true)}
            disabled={!filtered.length}
          >
            Save playlist
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
                placeholder="Search tracks or artists…"
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
          </div>
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
                  <TableHead className="number-cell">#</TableHead>
                  <TableHead className="track-name-cell">
                    TRACK / ARTIST
                  </TableHead>
                  <TableHead className="load-cell">LOAD TO</TableHead>
                  <TableHead className="bpm-cell">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="table-sort"
                      onClick={() => setSort(!sort)}
                    >
                      BPM
                      <Icon name="down" size={11} />
                    </Button>
                  </TableHead>
                  <TableHead>
                    KEY <span className="table-estimate">EST.</span>
                  </TableHead>
                  <TableHead className="genre-cell">GENRE</TableHead>
                  <TableHead>TIME</TableHead>
                  <TableHead className="waveform-cell">WAVEFORM</TableHead>
                  <TableHead />
                  <TableHead
                    className="energy-cell"
                    title="Your energy rating: 1 star is low, 5 stars is high. Click the selected star again to clear."
                  >
                    ENERGY
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
        <span>
          Drop files to import <Icon name="upload" size={12} />
        </span>
      </div>
      <Dialog open={playlistOpen} onOpenChange={setPlaylistOpen}>
        <DialogContent>
          <DialogTitle>Save this view as a playlist</DialogTitle>
          <DialogDescription>
            Include the {filtered.length} tracks currently visible in{" "}
            {scopeLabel}. Your filters define the playlist.
          </DialogDescription>
          <Input
            aria-label="Playlist name"
            placeholder="Playlist name"
            value={playlistName}
            onChange={(event) => setPlaylistName(event.target.value)}
          />
          <Button
            disabled={!playlistName.trim() || !filtered.length}
            onClick={() => {
              createPlaylist(
                playlistName,
                filtered.map((track) => track.id)
              )
              setPlaylistOpen(false)
              setPlaylistName("")
            }}
          >
            Save playlist
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
}: TrackRowProps) {
  return (
    <TableRow
      key={track.id}
      aria-rowindex={index + 2}
      className={`${selected ? "midi-selected" : ""} ${
        loadedA ? "track-loaded-a" : loadedB ? "track-loaded-b" : ""
      }`}
    >
      <TableCell className="number-cell">
        {loadedA || loadedB ? (
          <Icon name="music" size={14} />
        ) : (
          String(index + 1).padStart(2, "0")
        )}
      </TableCell>
      <TableCell className="track-name-cell">
        <div className="library-track">
          <Artwork color={track.color} small />
          <div>
            <strong title={track.linkedFile?.path ?? track.title}>
              {track.title}
            </strong>
            <span>{track.artist}</span>
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
      <TableCell className="bpm-cell mono">{track.bpm ?? "—"}</TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={`key-badge ${loadedA ? "key-lime" : loadedB ? "key-orange" : ""}`}
        >
          {track.camelot ?? "—"}
        </Badge>
      </TableCell>
      <TableCell className="genre-cell muted">{track.genre}</TableCell>
      <TableCell className="mono muted">{formatTime(track.duration)}</TableCell>
      <TableCell className="waveform-cell">
        {track.analysis && <MiniWaveform track={track} />}
        {!track.analysis && (
          <span className="muted" title={analysisError}>
            {analyzing
              ? "Analyzing…"
              : analysisError
                ? "Failed"
                : track.available === false || !track.linkedFile
                  ? "—"
                  : "Queued"}
          </span>
        )}
        {analysisError && !track.analysis && track.available !== false && (
          <Button size="xs" variant="ghost" onClick={() => retry(track.id)}>
            Retry
          </Button>
        )}
      </TableCell>
      <TableCell>
        <div className="track-actions">
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
                <Icon name="star" size={16} className="size-4" />
              </Button>
            )
          })}
        </div>
      </TableCell>
    </TableRow>
  )
})

const MiniWaveform = memo(function WaveformView({ track }: { track: Track }) {
  const peaks = track.analysis!.peaks
  const path = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => {
        const peak = peaks[Math.floor((i * peaks.length) / 80)] ?? 0
        const height = Math.max(1, (Number.isFinite(peak) ? peak : 0) * 22)
        return `M${i * 3 + 1},${12 - height / 2}v${height}`
      }).join(" "),
    [peaks]
  )
  return (
    <svg
      className="library-mini-waveform"
      viewBox="0 0 240 24"
      role="img"
      aria-label={`Waveform for ${track.title}`}
    >
      <path d={path} />
    </svg>
  )
})
