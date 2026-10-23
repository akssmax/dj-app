import { Button } from "@/components/ui/button"
import { useDJ, useEngine } from "./provider"
import { STEM_MODEL_BYTES } from "@/lib/dj/models"
import type { DeckId } from "@/lib/dj/types"

const stageLabel = {
  download: "Downloading model",
  separate: "Separating",
  store: "Saving",
}

/**
 * A deck's stems: four mute buttons once the track's stems are loaded,
 * otherwise "Prepare stems" (opt-in) with its progress.
 */
export function DeckStems({ id }: { id: DeckId }) {
  const { stems, notify } = useDJ()
  const engine = useDJ().engine
  const deck = useEngine((state) => ({
    track: state[id].track,
    stems: state[id].stems,
    layout: state[id].stemLayout,
    loading: state[id].loading,
  }))
  const track = deck.track
  if (!track || deck.loading) return null
  if (deck.stems) {
    const names =
      deck.layout === "full"
        ? (["vocals", "drums", "bass", "melody"] as const)
        : (["vocals", "melody"] as const)
    return (
      <div className="deck-stems" role="group" aria-label={`Deck ${id} stems`}>
        {names.map((name) => {
          const on = deck.stems![name] > 0
          const label =
            deck.layout === "vocals" && name === "melody"
              ? "Instrumental"
              : name
          return (
            <Button
              key={name}
              variant="outline"
              size="xs"
              aria-pressed={on}
              title={`${on ? "Mute" : "Bring back"} the ${label} on deck ${id}`}
              onClick={() => engine?.setStem(id, name, on ? 0 : 1)}
            >
              {label[0].toUpperCase() + label.slice(1)}
            </Button>
          )
        })}
      </div>
    )
  }
  const active = stems.active?.id === track.id ? stems.active : null
  const queued = stems.queue.includes(track.id)
  const error = stems.errors[track.id]
  if (track.stems)
    return <p className="deck-stems-status muted">Loading stems…</p>
  return (
    <div className="deck-stems">
      {active ? (
        <span className="deck-stems-status" role="status">
          {stageLabel[active.stage]} · {Math.round(active.fraction * 100)}%
        </span>
      ) : queued ? (
        <span className="deck-stems-status">Stems queued</span>
      ) : (
        <Button
          variant="ghost"
          size="xs"
          title={`Separate vocals, drums, bass and melody on this device. The first time downloads the ${Math.round(STEM_MODEL_BYTES / 1e6)} MB model; a graphics card makes it much faster.`}
          onClick={() => {
            stems.prepare([track.id])
            notify(`Preparing stems for ${track.title} in the background.`)
          }}
        >
          {error ? "Retry stems" : "Prepare stems"}
        </Button>
      )}
      {error && !active && !queued && (
        <span className="deck-stems-status" title={error}>
          Stems failed: {error}
        </span>
      )}
      {(active || queued) && (
        <Button variant="ghost" size="xs" onClick={stems.cancel}>
          Cancel
        </Button>
      )}
    </div>
  )
}
