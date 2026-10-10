import { memo, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { padModes } from "@/lib/dj/types"
import type { DeckId, PadMode } from "@/lib/dj/types"
import { padFXPresets } from "@/lib/dj/pad-fx"
import { formatTime } from "@/lib/dj/tracks"
import { useDJ, useEngine } from "./provider"

const modeLabels: Record<PadMode, string> = {
  hotcue: "Hot cues",
  padfx1: "Pad FX 1",
  beatjump: "Beat jump",
  sampler: "Sampler",
  keyboard: "Keyboard",
  padfx2: "Pad FX 2",
  beatloop: "Beat loop",
  keyshift: "Key shift",
}
function HoldFXPad({
  id,
  index,
  active,
}: {
  id: DeckId
  index: number
  active: boolean
}) {
  const { engine } = useDJ()
  const held = useRef(false)
  const release = () => {
    if (held.current) {
      held.current = false
      engine?.padFX(id, index, false)
    }
  }
  useEffect(() => {
    const up = () => {
      if (held.current) {
        held.current = false
        engine?.padFX(id, index, false)
      }
    }
    const hide = () => {
      if (document.hidden) up()
    }
    window.addEventListener("blur", up)
    document.addEventListener("visibilitychange", hide)
    return () => {
      up()
      window.removeEventListener("blur", up)
      document.removeEventListener("visibilitychange", hide)
    }
  }, [engine, id, index])
  return (
    <Button
      variant="outline"
      className={`cue-pad ${active ? "cue-set" : ""}`}
      aria-pressed={active}
      aria-label={`Deck ${id} hold ${padFXPresets[index].label}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        held.current = true
        engine?.padFX(id, index, true)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onBlur={release}
      onKeyDown={(event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          event.preventDefault()
          held.current = true
          engine?.padFX(id, index, true)
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault()
          release()
        }
      }}
    >
      <span>{(index % 8) + 1}</span>
      <small>{padFXPresets[index].label}</small>
    </Button>
  )
}
export const PerformancePads = memo(function PerformancePadsView({
  id,
}: {
  id: DeckId
}) {
  const { engine } = useDJ()
  const deck = useEngine((state) => {
    const d = state[id]
    return {
      mode: d.padMode,
      bank: d.padBank,
      shift: d.shiftPressed,
      cues: d.cues,
      labels: d.cueLabels,
      active: d.activePads,
      slots: d.samplerSlots,
      track: d.track,
      loading: d.loading,
      loop: d.loop,
      key: d.keyShift,
    }
  })
  const [clear, setClear] = useState(false)
  const [edit, setEdit] = useState<{
    index: number
    trackId: string
    label: string
  } | null>(null)
  const openEditor = (index: number) => {
    if (!deck.track || deck.loading || deck.cues[index] === null) return
    setClear(false)
    setEdit({ index, trackId: deck.track.id, label: deck.labels[index] ?? "" })
  }
  const validEdit =
    edit &&
    edit.trackId === deck.track?.id &&
    deck.cues[edit.index] !== null &&
    !deck.loading
  const enabled = !!deck.track && !deck.loading
  const press = (index: number, shifted: boolean) => {
    if (!engine) return
    if (
      shifted &&
      (deck.mode === "keyboard" || deck.mode === "keyshift") &&
      index < 6
    )
      return
    if (deck.mode === "hotcue") {
      const recall = deck.cues[index] !== null
      engine.hotcue(id, index, clear || shifted)
      if (recall && !clear && !shifted) void engine.play(id)
    } else if (deck.mode === "beatjump")
      engine.beatjump(
        id,
        [-1, 1, -2, 2, -4, 4, -8, 8][index] * Math.pow(2, deck.bank)
      )
    else
      engine.handleControllerAction({
        type:
          deck.mode === "sampler"
            ? "sampler"
            : deck.mode === "beatloop"
              ? "beatloop"
              : deck.mode === "keyboard"
                ? "keyboard"
                : "keyshift",
        deck: id,
        value:
          deck.mode === "beatloop"
            ? [0.25, 0.5, 1, 2, 4, 8, 16, 32][index]
            : index,
        shifted,
      })
  }
  const label = (index: number) => {
    if (deck.mode === "hotcue")
      return deck.cues[index] === null ? "+ SET" : formatTime(deck.cues[index])
    if (deck.mode === "sampler") return deck.slots[index].name
    if (deck.mode === "beatjump") {
      const beats = [-1, 1, -2, 2, -4, 4, -8, 8][index] * Math.pow(2, deck.bank)
      return `${beats > 0 ? "+" : ""}${beats} beats`
    }
    if (deck.mode === "beatloop")
      return `${[0.25, 0.5, 1, 2, 4, 8, 16, 32][index]} beats`
    return `${deck.bank + index >= 0 ? "+" : ""}${deck.bank + index} semitones`
  }
  const fx = deck.mode === "padfx1" || deck.mode === "padfx2"
  return (
    <div>
      <Tabs
        value={deck.mode}
        onValueChange={(mode) => engine?.setPadMode(id, mode as PadMode)}
        className="deck-tabs"
      >
        <TabsList variant="line" className="performance-mode-tabs">
          {padModes.map((mode) => (
            <TabsTrigger key={mode} value={mode}>
              {modeLabels[mode]}
            </TabsTrigger>
          ))}
        </TabsList>
        {padModes.map((mode) => (
          <TabsContent key={mode} value={mode}>
            <div className="cue-pads">
              {Array.from({ length: 8 }, (_, index) => {
                const fxIndex =
                  (deck.mode === "padfx2" ? 16 : 0) +
                  (deck.shift ? 8 : 0) +
                  index
                return fx ? (
                  <HoldFXPad
                    key={index}
                    id={id}
                    index={fxIndex}
                    active={deck.active.includes(fxIndex)}
                  />
                ) : (
                  <Button
                    key={index}
                    variant="outline"
                    className={`cue-pad ${(mode === "hotcue" && deck.cues[index] !== null) || (mode === "sampler" && deck.slots[index].playing) || (mode === "keyshift" && deck.key === deck.bank + index) ? "cue-set" : ""}`}
                    disabled={mode !== "sampler" && !enabled}
                    onClick={(event) =>
                      press(index, deck.shift || event.shiftKey)
                    }
                    onContextMenu={(event) => {
                      if (mode !== "hotcue") return
                      event.preventDefault()
                      openEditor(index)
                    }}
                    onKeyDown={(event) => {
                      if (
                        mode === "hotcue" &&
                        (event.key === "ContextMenu" ||
                          (event.shiftKey && event.key === "F10"))
                      ) {
                        event.preventDefault()
                        openEditor(index)
                      }
                    }}
                    title={
                      mode === "hotcue"
                        ? (deck.labels[index] ??
                          "Right-click to label or remove")
                        : undefined
                    }
                    aria-label={`Deck ${id} ${modeLabels[mode]} pad ${index + 1} ${label(index)}${mode === "hotcue" && deck.labels[index] ? ` · ${deck.labels[index]}` : ""}`}
                  >
                    <span>{index + 1}</span>
                    <small>{label(index)}</small>
                    {mode === "hotcue" && deck.labels[index] && (
                      <span className="cue-pad-label">
                        {deck.labels[index]}
                      </span>
                    )}
                  </Button>
                )
              })}
            </div>
            <div className="cue-pad-tools">
              <span>
                {fx
                  ? "Hold to apply · release to restore"
                  : mode === "sampler"
                    ? "Shift: stop a sample, or load a 4-beat track clip"
                    : mode === "hotcue"
                      ? "Tap to set or play · Shift to clear"
                      : mode === "keyboard" || mode === "keyshift"
                        ? "Pitch changes independently of tempo · Shift pads 7/8 adjust the range"
                        : "Jump and loop sizes follow the beatgrid"}
              </span>
              {mode === "hotcue" && (
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={!enabled || !deck.cues.some((cue) => cue !== null)}
                  onClick={() =>
                    openEditor(deck.cues.findIndex((cue) => cue !== null))
                  }
                >
                  Edit cues
                </Button>
              )}
              {mode === "hotcue" && (
                <Button
                  size="xs"
                  variant={clear ? "secondary" : "ghost"}
                  aria-pressed={clear}
                  onClick={() => setClear(!clear)}
                >
                  {clear ? "Done clearing" : "Clear cues"}
                </Button>
              )}
              {fx || mode === "sampler" ? (
                <Button
                  size="xs"
                  variant={deck.shift ? "secondary" : "ghost"}
                  aria-pressed={deck.shift}
                  onClick={() =>
                    engine?.handleControllerAction({
                      type: "shift",
                      deck: id,
                      value: deck.shift ? 0 : 1,
                    })
                  }
                >
                  Shift pads
                </Button>
              ) : null}
              {["beatjump", "keyboard", "keyshift"].includes(mode) && (
                <div>
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={`Deck ${id} smaller pad bank`}
                    onClick={() =>
                      engine?.handleControllerAction({
                        type: "padBank",
                        deck: id,
                        value: -1,
                      })
                    }
                  >
                    −
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={`Deck ${id} larger pad bank`}
                    onClick={() =>
                      engine?.handleControllerAction({
                        type: "padBank",
                        deck: id,
                        value: 1,
                      })
                    }
                  >
                    +
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
      <Dialog
        open={!!validEdit}
        onOpenChange={(open) => !open && setEdit(null)}
      >
        <DialogContent className="cue-edit-dialog">
          <DialogTitle>Deck {id} · Edit hot cue</DialogTitle>
          <DialogDescription>
            Rename or remove a saved point. Editing keeps playback in place.
          </DialogDescription>
          {edit && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (validEdit && engine?.renameCue(id, edit.index, edit.label))
                  setEdit(null)
              }}
            >
              <Select
                value={String(edit.index)}
                onValueChange={(value) => value !== null && openEditor(+value)}
              >
                <SelectTrigger aria-label={`Deck ${id} cue to edit`}>
                  <SelectValue>
                    Cue {edit.index + 1} ·{" "}
                    {formatTime(deck.cues[edit.index] ?? 0)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {deck.cues.map(
                    (cue, index) =>
                      cue !== null && (
                        <SelectItem key={index} value={String(index)}>
                          Cue {index + 1} · {formatTime(cue)}
                          {deck.labels[index] ? ` · ${deck.labels[index]}` : ""}
                        </SelectItem>
                      )
                  )}
                </SelectContent>
              </Select>
              <label htmlFor={`cue-label-${id}`}>
                Cue label
                <Input
                  id={`cue-label-${id}`}
                  maxLength={32}
                  autoFocus
                  placeholder="Intro, bass swap, vocal, drop…"
                  value={edit.label}
                  onChange={(event) =>
                    setEdit({ ...edit, label: event.target.value })
                  }
                />
              </label>
              <div className="coach-row-actions">
                <Button type="submit">Save label</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (!validEdit) return
                    engine?.hotcue(id, edit.index, true)
                    setEdit(null)
                  }}
                >
                  Remove cue {edit.index + 1}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEdit(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <div className="loop-controls controller-loop-controls">
        <Button
          size="xs"
          variant="outline"
          disabled={!enabled}
          onClick={() =>
            engine?.handleControllerAction({
              type: "loopIn",
              deck: id,
              value: 1,
            })
          }
        >
          In
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={!enabled}
          onClick={() =>
            engine?.handleControllerAction({
              type: "loopOut",
              deck: id,
              value: 1,
            })
          }
        >
          Out
        </Button>
        <Button
          size="xs"
          variant={deck.loop ? "secondary" : "outline"}
          disabled={!deck.track?.bpm}
          onClick={() => engine?.loop(id, deck.loop ? null : 4)}
        >
          {deck.loop ? `Exit ${deck.loop}-beat loop` : "4-beat loop"}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={!deck.loop}
          onClick={() => engine?.loop(id, deck.loop! / 2)}
        >
          ½
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={!deck.loop}
          onClick={() => engine?.loop(id, deck.loop! * 2)}
        >
          ×2
        </Button>
      </div>
    </div>
  )
})
