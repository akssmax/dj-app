import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDJ, useEngine } from "./provider"
import { beatOffset } from "@/lib/dj/beatgrid"
import { camelotKeys } from "@/lib/dj/key"
import { labelSections } from "@/lib/dj/sections"
import type { SectionLabel } from "@/lib/dj/sections"
import { formatTime } from "@/lib/dj/tracks"
import type { DeckId } from "@/lib/dj/types"

const sectionLabels: SectionLabel[] = [
  "intro",
  "build",
  "drop",
  "breakdown",
  "body",
  "outro",
]

/**
 * Fix what analysis got wrong on a deck's track: the key, which beat is
 * "1", and the arrangement sections. Your fixes always win over analysis
 * and Automix trusts them fully.
 */
export function AnalysisFixes({ id }: { id: DeckId }) {
  const { engine, setTrackKey, setTrackSections, notify } = useDJ()
  const [open, setOpen] = useState(false)
  // The playhead only matters while the dialog is open.
  const deck = useEngine((state) => ({
    track: state[id].track,
    position: open ? Math.round(state[id].position * 4) / 4 : 0,
    loading: state[id].loading,
  }))
  const track = deck.track
  if (!track || deck.loading) return null
  const sections = labelSections(track)
  const bar = track.bpm ? 240 / track.bpm : 0
  /** Nearest bar line to a time on the current grid. */
  const toBar = (time: number) => {
    if (!bar) return time
    const origin = beatOffset(track)
    return Math.max(0, origin + Math.round((time - origin) / bar) * bar)
  }
  const save = (next: typeof sections) =>
    setTrackSections(
      track.id,
      next.map((s) => ({ start: s.start, end: s.end, label: s.label }))
    )
  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        title="Fix the key, beat 1 or sections when analysis got them wrong"
        onClick={() => setOpen(true)}
      >
        Fix
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="analysis-fixes">
          <DialogTitle>Fix analysis · {track.title}</DialogTitle>
          <DialogDescription>
            Your fixes always win over analysis, and Automix trusts them fully.
          </DialogDescription>
          <section className="fix-row">
            <span>
              <strong>Key</strong>
              <small>
                {track.keyOverride
                  ? `Detected ${track.analysis?.camelot ?? "—"}; yours is used.`
                  : "As detected."}
              </small>
            </span>
            <Select
              value={track.keyOverride ?? "auto"}
              onValueChange={(value) =>
                value && setTrackKey(track.id, value === "auto" ? null : value)
              }
            >
              <SelectTrigger aria-label="Track key">
                <SelectValue>
                  {track.keyOverride
                    ? `${track.camelot} · ${track.key}`
                    : `Detected · ${track.analysis?.camelot ?? "—"}`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  Detected · {track.analysis?.camelot ?? "—"}
                </SelectItem>
                {camelotKeys.map((k) => (
                  <SelectItem key={k.camelot} value={k.camelot}>
                    {k.camelot} · {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>
          <section className="fix-row">
            <span>
              <strong>Beat 1</strong>
              <small>
                Play to a bar's first beat, pause on it, then set it here. The
                tempo stays as it is.
              </small>
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!track.bpm}
              onClick={() => {
                if (!track.bpm) return
                const beat = 60 / track.bpm,
                  origin = beatOffset(track)
                // Keep the beat phase, move which beat counts as "1".
                const nearest =
                  origin + Math.round((deck.position - origin) / beat) * beat
                engine?.setBeatgrid(id, track.bpm, nearest % (beat * 4))
                notify(`Beat 1 set at ${formatTime(nearest)} on deck ${id}.`)
              }}
            >
              Beat 1 is at {formatTime(deck.position)}
            </Button>
          </section>
          <section className="fix-sections">
            <div className="fix-sections-head">
              <strong>Sections</strong>
              <span>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={!sections.length}
                  title="Split the section under the playhead at the nearest bar"
                  onClick={() => {
                    const at = toBar(deck.position)
                    const next = sections.flatMap((s) =>
                      at > s.start + 0.5 && at < s.end - 0.5
                        ? [
                            { ...s, end: at },
                            { ...s, start: at },
                          ]
                        : [s]
                    )
                    save(next)
                  }}
                >
                  Split at {formatTime(deck.position)}
                </Button>
                {track.sectionOverride && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setTrackSections(track.id, null)}
                  >
                    Use detected
                  </Button>
                )}
              </span>
            </div>
            <ol>
              {sections.map((s, i) => (
                <li key={`${s.start}-${i}`}>
                  <span className="fix-time">
                    {formatTime(s.start)}–{formatTime(s.end)}
                  </span>
                  <Select
                    value={s.label}
                    onValueChange={(value) =>
                      value &&
                      save(
                        sections.map((other, j) =>
                          j === i ? { ...other, label: value } : other
                        )
                      )
                    }
                  >
                    <SelectTrigger aria-label={`Section ${i + 1} label`}>
                      <SelectValue>{s.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {sectionLabels.map((label) => (
                        <SelectItem key={label} value={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={i === sections.length - 1}
                    title="Merge with the next section"
                    onClick={() =>
                      save(
                        sections
                          .map((other, j) =>
                            j === i
                              ? { ...other, end: sections[i + 1].end }
                              : other
                          )
                          .filter((_, j) => j !== i + 1)
                      )
                    }
                  >
                    Merge
                  </Button>
                </li>
              ))}
            </ol>
            {!sections.length && (
              <p className="muted">
                Sections appear once the track is analyzed.
              </p>
            )}
          </section>
        </DialogContent>
      </Dialog>
    </>
  )
}
