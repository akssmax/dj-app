import { memo, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { beatOffset } from "@/lib/dj/beatgrid"
import { useDJ, useEngine } from "./provider"
import { Waveform } from "./waveform"
import type { DeckId } from "@/lib/dj/types"

export const DeckTools = memo(function DeckToolsView({ id }: { id: DeckId }) {
  const { engine } = useDJ(),
    deck = useEngine((state) => ({
      track: state[id].track,
      loading: state[id].loading,
      quantize: state[id].quantize,
      slip: state[id].slip,
    }))
  const [editing, setEditing] = useState(false)
  return (
    <>
      <div className="deck-tool-strip">
        <Button
          variant={deck.quantize ? "secondary" : "outline"}
          aria-label={`Deck ${id} quantize`}
          aria-pressed={deck.quantize}
          onClick={() => engine?.setQuantize(id, !deck.quantize)}
        >
          Q · Quantize {deck.quantize ? "on" : "off"}
        </Button>
        <Button
          variant={deck.slip ? "secondary" : "outline"}
          aria-label={`Deck ${id} slip mode`}
          aria-pressed={deck.slip}
          onClick={() => engine?.setSlip(id, !deck.slip)}
        >
          Slip {deck.slip ? "on" : "off"}
        </Button>
        <Button
          variant="outline"
          disabled={!deck.track || deck.loading}
          onClick={() => setEditing(true)}
          aria-label={`Edit deck ${id} beatgrid`}
        >
          Edit grid
        </Button>
      </div>
      {editing && <BeatgridEditor id={id} onClose={() => setEditing(false)} />}
    </>
  )
})

function BeatgridEditor({ id, onClose }: { id: DeckId; onClose: () => void }) {
  const { engine, notify } = useDJ(),
    deck = useEngine((state) => ({
      track: state[id].track,
      position: state[id].position,
    })),
    track = deck.track!
  const [bpm, setBpm] = useState(String(track.bpm ?? 120))
  const [offset, setOffset] = useState(beatOffset(track).toFixed(3))
  const valid =
    Number.isFinite(+bpm) &&
    +bpm >= 40 &&
    +bpm <= 300 &&
    Number.isFinite(+offset) &&
    +offset >= 0 &&
    +offset < track.duration
  const preview = {
    ...track,
    bpm: valid ? +bpm : track.bpm,
    grid: {
      bpm: +bpm,
      offset: valid ? +offset : beatOffset(track),
      originalBpm: track.bpm,
    },
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="beatgrid-dialog">
        <DialogTitle>Deck {id} · Beatgrid editor</DialogTitle>
        <DialogDescription>
          Align the grid with the music. These corrections guide sync, cues,
          loops and transition zones.
        </DialogDescription>
        <strong>{track.title}</strong>
        <Waveform
          track={preview}
          position={deck.position}
          color={id === "A" ? "lime" : "orange"}
          viewRange={{
            start: Math.max(0, +offset - 2),
            end: Math.min(track.duration, +offset + (32 * 60) / (+bpm || 120)),
          }}
        />
        <div className="grid-editor-inputs">
          <label htmlFor={`grid-bpm-${id}`}>
            Grid BPM
            <Input
              id={`grid-bpm-${id}`}
              type="number"
              min={40}
              max={300}
              step={0.01}
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
            />
          </label>
          <label htmlFor={`grid-offset-${id}`}>
            First downbeat · seconds
            <Input
              id={`grid-offset-${id}`}
              type="number"
              min={0}
              max={track.duration}
              step={0.01}
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
            />
          </label>
        </div>
        <div className="grid-editor-actions">
          <Button
            variant="outline"
            onClick={() => setOffset(deck.position.toFixed(3))}
          >
            Set downbeat here
          </Button>
          <Button
            variant="outline"
            onClick={() => setOffset(Math.max(0, +offset - 0.01).toFixed(3))}
          >
            −10 ms
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setOffset(
                Math.min(track.duration - 0.01, +offset + 0.01).toFixed(3)
              )
            }
          >
            +10 ms
          </Button>
          <Button
            variant="outline"
            disabled={+bpm / 2 < 40}
            onClick={() => setBpm(String(+bpm / 2))}
          >
            ½ BPM
          </Button>
          <Button
            variant="outline"
            disabled={+bpm * 2 > 300}
            onClick={() => setBpm(String(+bpm * 2))}
          >
            2× BPM
          </Button>
        </div>
        <p className="muted">
          Listen for beat one, then check a later phrase. This is a
          constant-tempo grid; live drums or changing tempo can drift. Editing
          exits any active loop.
        </p>
        {!valid && (
          <p role="alert">
            Enter BPM from 40–300 and a downbeat inside the track.
          </p>
        )}
        <div className="grid-save-actions">
          <Button
            variant="ghost"
            disabled={!track.grid}
            onClick={() => {
              engine?.resetBeatgrid(id)
              notify("Original beatgrid restored.")
              onClose()
            }}
          >
            Restore original grid
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              engine?.setBeatgrid(id, +bpm, +offset)
              notify("Beatgrid saved on this device.")
              onClose()
            }}
          >
            Save beatgrid
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export const DeckFX = memo(function DeckFXView({ id }: { id: DeckId }) {
  const { engine } = useDJ(),
    deck = useEngine((state) => ({
      fx: state[id].fx,
      playing: state[id].playing,
      echoOut: state[id].echoOut,
    })),
    fx = deck.fx
  return (
    <div className="deck-fx" aria-label={`Deck ${id} effects`}>
      <div className="fx-heading">
        <span className="eyebrow">FX UNIT {id}</span>
        <span>POST-FADER · TAILS CONTINUE</span>
      </div>
      <div className="fx-controls">
        <Select
          value={fx.type}
          onValueChange={(type) => type && engine?.setFX(id, { type: type })}
        >
          <SelectTrigger aria-label={`Deck ${id} effect`}>
            <SelectValue>
              {fx.type === "echo" ? "Echo" : "Room reverb"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="echo">Echo</SelectItem>
            <SelectItem value="reverb">Room reverb</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={fx.enabled ? "default" : "outline"}
          aria-pressed={fx.enabled}
          aria-label={`Deck ${id} effect on`}
          onClick={() => engine?.setFX(id, { enabled: !fx.enabled })}
        >
          {fx.enabled ? "FX on" : "FX off"}
        </Button>
        {fx.type === "echo" && (
          <Select
            value={String(fx.beats)}
            onValueChange={(value) =>
              value && engine?.setFX(id, { beats: +value })
            }
          >
            <SelectTrigger aria-label={`Deck ${id} echo length`}>
              <SelectValue>
                {fx.beats} beat{fx.beats === 1 ? "" : "s"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {[0.25, 0.5, 0.75, 1, 1.5, 2].map((beats) => (
                <SelectItem value={String(beats)} key={beats}>
                  {beats} beat{beats === 1 ? "" : "s"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="fx-send">
        <span>Send {Math.round(fx.amount * 100)}%</span>
        <Slider
          value={[fx.amount]}
          min={0}
          max={1}
          step={0.01}
          aria-label={`Deck ${id} effect send`}
          onValueChange={(value) =>
            engine?.setFX(id, {
              amount: Array.isArray(value) ? value[0] : value,
            })
          }
        />
        <Button
          variant="outline"
          disabled={!deck.playing || deck.echoOut}
          aria-label={`Echo out deck ${id}`}
          onClick={() => engine?.echoOut(id)}
        >
          {deck.echoOut ? "Echoing…" : "Echo out"}
        </Button>
      </div>
    </div>
  )
})

export function RollPad({ id, beats }: { id: DeckId; beats: number }) {
  const { engine } = useDJ(),
    deck = useEngine((state) => ({
      playing: state[id].playing,
      track: state[id].track,
      loop: state[id].loop,
      rolling: state[id].slipPosition !== null,
    })),
    held = useRef(false)
  const begin = () => {
    if (!engine || !deck.playing) return
    held.current = true
    engine.setSlip(id, true)
    engine.loop(id, beats)
  }
  const end = () => {
    if (!held.current) return
    held.current = false
    if (engine?.state[id].loop === beats) engine.loop(id, null)
  }
  useEffect(
    () => () => {
      if (held.current && engine?.state[id].loop === beats)
        engine.loop(id, null)
    },
    [engine, id, beats]
  )
  return (
    <Button
      variant={deck.loop === beats && deck.rolling ? "secondary" : "outline"}
      disabled={!deck.playing || !deck.track?.bpm}
      aria-label={`Deck ${id} roll ${beats} beats`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        begin()
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault()
          begin()
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault()
          end()
        }
      }}
      onBlur={end}
    >
      {beats === 0.5 ? "½" : beats === 0.25 ? "¼" : beats}
    </Button>
  )
}
