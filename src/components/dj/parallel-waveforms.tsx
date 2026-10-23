import { useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useDJ, useEngine, useTransitionPlan } from "./provider"
import { effectiveDeckRate } from "@/lib/dj/engine"
import { beatOffset } from "@/lib/dj/beatgrid"
import { Waveform } from "./waveform"
import type { DeckId } from "@/lib/dj/types"
import { formatTime } from "@/lib/dj/tracks"
import { transitionAnnotations } from "@/lib/dj/cue-suggestions"
import { CueSuggestions } from "./cue-suggestions"

export function ParallelWaveforms() {
  const {
      engine,
      transitionPreview: preview,
      setTransitionPreview: setPreview,
    } = useDJ(),
    state = useEngine()
  const bars = state.controller.waveformBars
  const { outId, inId, plan } = useTransitionPlan()
  const both = state.A.playing && state.B.playing
  const bpmDifference =
    state.A.track?.bpm && state.B.track?.bpm
      ? Math.abs(
          state.A.track.bpm * effectiveDeckRate(state.A) -
            state.B.track.bpm * effectiveDeckRate(state.B)
        )
      : null
  const phase = (id: DeckId) =>
    ((state[id].position - beatOffset(state[id].track)) *
      (state[id].track?.bpm ?? 120)) /
    60
  const error = ((((phase("B") - phase("A") + 2) % 4) + 4) % 4) - 2
  // Stable between ticks so the memoized cue rows skip the 20 Hz redraw.
  const trackA = state.A.track,
    trackB = state.B.track
  const annotationsFor = useMemo(
    () => ({
      A: transitionAnnotations(trackA, plan, outId === "A"),
      B: transitionAnnotations(trackB, plan, outId === "B"),
    }),
    [trackA, trackB, plan, outId]
  )
  return (
    <Card className="parallel-panel">
      <div className="parallel-heading">
        <div>
          <strong>Parallel waveforms</strong>
          <span className="muted">
            Compare beat positions and phrase changes
          </span>
        </div>
        <Badge variant="outline">
          {both && bpmDifference !== null
            ? `${bpmDifference.toFixed(1)} BPM GAP · ${Math.abs(error).toFixed(2)} BEAT OFFSET`
            : "ESTIMATED GRID · LISTEN FIRST"}
        </Badge>
        <Select
          value={String(bars)}
          onValueChange={(value) => value && engine?.setWaveformBars(+value)}
        >
          <SelectTrigger aria-label="Waveform zoom">
            <SelectValue>{bars} bars</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {[4, 8, 16, 32].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} bars
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="waveform-view-tools">
        <div>
          <Button
            variant={!preview ? "secondary" : "outline"}
            aria-pressed={!preview}
            onClick={() => setPreview(false)}
          >
            Live waveforms
          </Button>
          <Button
            variant={preview ? "secondary" : "outline"}
            disabled={!plan}
            aria-pressed={preview}
            onClick={() => setPreview(true)}
          >
            Preview transition
          </Button>
        </div>
        <span className="muted">
          Dashed = suggested · numbered = saved hot cue
        </span>
      </div>
      {(["A", "B"] as DeckId[]).map((id) => {
        const deck = state[id]
        const annotations = annotationsFor[id]
        const anchor = annotations.cues[0]?.position ?? deck.position
        const plannedLength = plan
          ? plan.duration * (id === outId ? 1 : plan.rate)
          : 0
        const window = Math.max(
          (bars * 4 * 60) / (deck.track?.bpm ?? 120),
          preview ? plannedLength * 1.25 : 0
        )
        const start = Math.max(
          0,
          Math.min(
            (deck.track?.duration ?? window) - window,
            preview ? anchor - window * 0.1 : deck.position - window / 2
          )
        )
        const zone = plan
          ? id === outId
            ? {
                start: plan.outStart,
                end: plan.outStart + plan.duration,
                label: "EXIT ZONE",
              }
            : {
                start: plan.inStart,
                end: plan.inStart + plan.duration * plan.rate,
                label: "ENTRY ZONE",
              }
          : undefined
        return (
          <div className={`parallel-deck parallel-${id}`} key={id}>
            <div className="parallel-row">
              <div className="parallel-track">
                <strong>{id}</strong>
                <span>{deck.track?.title ?? "Load a track"}</span>
                <span>
                  {deck.track?.bpm
                    ? `${(deck.track.bpm * effectiveDeckRate(deck)).toFixed(1)} BPM`
                    : "—"}
                </span>
                {!preview &&
                  plan &&
                  (anchor < start || anchor > start + window) && (
                    <Button
                      variant="ghost"
                      onClick={() => setPreview(true)}
                      aria-label={`Preview deck ${id} transition cue`}
                    >
                      {id === outId ? "Exit" : "Entry"} {formatTime(anchor)} →
                    </Button>
                  )}
              </div>
              <Waveform
                track={deck.track}
                position={deck.position}
                color={id === "A" ? "lime" : "orange"}
                cues={deck.cues}
                cueLabels={deck.cueLabels}
                zone={preview ? undefined : zone}
                suggested={annotations.cues}
                highlights={annotations.zones}
                onSeek={(position) => engine?.seek(id, position)}
                viewRange={{ start, end: start + window }}
              />
            </div>
            <CueSuggestions
              id={id}
              cues={annotations.cues}
              outgoing={id === outId}
            />
          </div>
        )
      })}
      {plan && (
        <div className="waveform-recipe">
          <div className="recipe-heading">
            <strong>{plan.name}</strong>
            <Badge variant="outline">
              {outId} → {inId} ·{" "}
              {plan.beatmatch ? "TEMPO MATCH" : "NATIVE TEMPOS"}
            </Badge>
          </div>
          <div className="recipe-steps">
            {plan.steps.map((step, i) => (
              <Card
                key={step.label}
                className={`recipe-step ${state.auto && state.transition >= step.at && state.transition < (plan.steps[i + 1]?.at ?? 1.01) ? "current-step" : ""}`}
              >
                <span className="eyebrow">
                  {plan.bars
                    ? `BAR ${Math.floor(step.at * plan.bars) + 1}`
                    : "DOWNBEAT"}
                </span>
                <strong>{step.label}</strong>
                <p>{step.why}</p>
              </Card>
            ))}
          </div>
          <div className="recipe-zone-labels">
            <span>
              {outId} exit · {formatTime(plan.outStart)}
            </span>
            <span>
              {inId} entry · {formatTime(plan.inStart)}
            </span>
            <span>Estimated phrases · listen first</span>
          </div>
        </div>
      )}
    </Card>
  )
}
