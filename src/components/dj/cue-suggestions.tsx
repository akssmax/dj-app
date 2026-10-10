import { memo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import type { SuggestedCue } from "@/lib/dj/cue-suggestions"
import type { DeckId } from "@/lib/dj/types"
import { formatTime } from "@/lib/dj/tracks"
import { useDJ, useEngine } from "./provider"

export const CueSuggestions = memo(function CueSuggestionsView({
  id,
  cues,
  outgoing,
}: {
  id: DeckId
  cues: SuggestedCue[]
  outgoing: boolean
}) {
  const { engine, setTransitionCue, notify } = useDJ()
  const deck = useEngine((state) => ({
    track: state[id].track,
    loading: state[id].loading,
    cues: state[id].cues,
  }))
  const [selected, setSelected] = useState<{
    cue: SuggestedCue
    trackId: string
  } | null>(null)
  const valid = selected?.trackId === deck.track?.id && !deck.loading
  return (
    <>
      <div
        className="suggested-cue-actions"
        aria-label={`Deck ${id} suggested cue points`}
      >
        <span className="muted">Suggested cues</span>
        {cues.map((cue) => {
          const slot = deck.cues.findIndex(
            (saved) => saved !== null && Math.abs(saved - cue.position) < 0.01
          )
          return (
            <Button
              key={cue.id}
              variant="outline"
              disabled={deck.loading}
              onClick={() =>
                deck.track && setSelected({ cue, trackId: deck.track.id })
              }
              aria-label={`Review deck ${id} ${cue.label} cue at ${formatTime(cue.position)}`}
            >
              {cue.label} <span>{formatTime(cue.position)}</span>
              {slot >= 0 && <Badge variant="secondary">{slot + 1}</Badge>}
            </Button>
          )
        })}
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="suggested-cue-dialog">
          <DialogTitle>
            Deck {id} · {selected?.cue.label} ·{" "}
            {formatTime(selected?.cue.position ?? 0)}
          </DialogTitle>
          <DialogDescription>
            {selected?.cue.why} This is an estimated grid cue. Audition the
            arrangement.
          </DialogDescription>
          <Button
            disabled={!valid}
            onClick={() => {
              if (!selected || !valid) return
              setTransitionCue(
                selected.trackId,
                outgoing ? "exit" : "entry",
                selected.cue.position
              )
              notify(`Deck ${id} ${outgoing ? "exit" : "entry"} cue selected.`)
              setSelected(null)
            }}
          >
            Use as {outgoing ? "exit" : "entry"} cue
          </Button>
          <Button
            variant="outline"
            disabled={!valid}
            onClick={() => {
              if (!selected || !valid) return
              const slot = engine?.saveSuggestedCue(
                id,
                selected.cue.position,
                selected.cue.label
              )
              notify(
                slot != null
                  ? `Saved to deck ${id} hot cue ${slot + 1}.`
                  : "All eight hot cues are occupied. Clear a pad to save another cue."
              )
              if (slot != null) setSelected(null)
            }}
          >
            Save as hot cue
          </Button>
          <Button
            variant="outline"
            disabled={!valid}
            onClick={() => {
              if (selected && valid) engine?.seek(id, selected.cue.position)
              setSelected(null)
            }}
          >
            Seek deck {id} to cue
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
})
