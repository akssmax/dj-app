import { useMemo, useState } from "react"
import { Meter } from "./meter"
import { beatOffset as gridOffset } from "@/lib/dj/beatgrid"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useDJ, useEngine, useTransitionPlan } from "./provider"
import { Icon } from "./icons"
import type { WaveformZone } from "./waveform"
import { Artwork, Waveform } from "./waveform"
import { ScrollingWaveform } from "./scrolling-waveform"
import { DeckFX, DeckTools } from "./performance-tools"
import { formatTime } from "@/lib/dj/tracks"
import { deckOutputWarning, effectiveDeckRate } from "@/lib/dj/engine"
import type { DeckId } from "@/lib/dj/types"
import {
  ChannelCue,
  ControllerControls,
  MixerOptions,
} from "./controller-controls"
import { PerformancePads } from "./performance-pads"
import { transitionAnnotations } from "@/lib/dj/cue-suggestions"
import { TRACK_DRAG_TYPE } from "@/lib/dj/mix-fit"

export function Deck({
  id,
  zone,
  learning = false,
}: {
  id: DeckId
  zone?: WaveformZone
  learning?: boolean
}) {
  const { engine, notify, tracks, loadTrack } = useDJ(),
    [dropTarget, setDropTarget] = useState(false),
    deck = useEngine((state) => {
      const d = state[id],
        other = state[id === "A" ? "B" : "A"]
      return {
        track: d.track,
        position: d.position,
        playing: d.playing,
        loading: d.loading,
        analysisStatus: d.analysisStatus,
        analysisError: d.analysisError,
        rate: d.rate,
        keyShift: d.keyShift,
        keyLock: d.keyLock,
        tempoRange: d.tempoRange,
        cues: d.cues,
        cueLabels: d.cueLabels,
        syncTo: d.syncTo,
        audioWarning: deckOutputWarning(state, id),
        otherReady: !!other.track && !other.loading,
        queued:
          state.auto &&
          state.autoOut !== id &&
          !!state.autoPlan &&
          ["echo", "reverb"].includes(state.autoPlan.execution) &&
          state.transition < 0.25,
      }
    })
  const track = deck.track,
    color = id === "A" ? "lime" : "orange"
  const beatLength = 60 / (track?.bpm ?? 120)
  const phraseStart = Math.max(
    0,
    Math.floor((deck.position - gridOffset(track)) / (beatLength * 64)) *
      beatLength *
      64 +
      gridOffset(track)
  )
  const { outId, plan } = useTransitionPlan()
  const annotations = useMemo(
    () => transitionAnnotations(track, plan, id === outId),
    [track, plan, id, outId]
  )
  const mixZone =
    zone ??
    (plan
      ? id === outId
        ? {
            start: plan.outStart,
            end: plan.outStart + plan.duration,
            label: "EXIT / BLEND ZONE",
          }
        : {
            start: plan.inStart,
            end: plan.inStart + plan.duration * plan.rate,
            label: "ENTER / BLEND ZONE",
          }
      : undefined)
  const value = (input: number | readonly number[]) =>
    typeof input === "number" ? input : input[0]
  const enabled = !!track && !deck.loading
  const audioWarning = deck.audioWarning
  const phraseBeats = track?.bpm
    ? Math.max(0, ((deck.position - gridOffset(track)) * track.bpm) / 60) % 64
    : null
  const phraseCaption =
    phraseBeats === null
      ? "4/4"
      : phraseBeats < 1
        ? "16-BAR PHRASE · NOW"
        : `NEXT PHRASE · ${Math.ceil((64 - phraseBeats) / 4)} BARS`
  return (
    <Card
      className={`deck deck-${color} ${dropTarget ? "is-drop-target" : ""}`}
      // Library rows can be dragged onto a deck to load them.
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(TRACK_DRAG_TYPE)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
        setDropTarget(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDropTarget(false)
      }}
      onDrop={(event) => {
        const dropped = tracks.find(
          (item) => item.id === event.dataTransfer.getData(TRACK_DRAG_TYPE)
        )
        setDropTarget(false)
        if (!dropped) return
        event.preventDefault()
        void loadTrack(id, dropped)
      }}
    >
      <div className="deck-topline">
        <div>
          <span className={`deck-letter text-${color}`}>{id}</span>
          <span className="eyebrow">DECK {id}</span>
        </div>
        <Button
          variant="ghost"
          size="xs"
          className="deck-analyze"
          disabled={!enabled || deck.analysisStatus === "running"}
          aria-label={`Analyze deck ${id} track`}
          aria-busy={deck.analysisStatus === "running"}
          title={
            track?.analysis?.analyzedAt
              ? `Last analyzed ${new Date(track.analysis.analyzedAt).toLocaleString()}. Refresh metadata without interrupting playback.`
              : "Analyze tempo, key, energy and waveform in the background. Saved cues and corrected grids are preserved."
          }
          onClick={async () => {
            const success = await engine?.analyze(id)
            if (success && engine?.state[id].track?.id === track?.id)
              notify(
                `Deck ${id} analysis refreshed. Smart transition and next-track suggestions updated.`
              )
          }}
        >
          <Icon name="sparkles" size={14} />
          {deck.analysisStatus === "running"
            ? "Analyzing…"
            : deck.analysisStatus === "error"
              ? "Retry analysis"
              : track?.analysis
                ? "Re-analyze"
                : "Analyze"}
        </Button>
        <Badge
          variant="outline"
          className={`deck-status ${deck.playing ? "is-playing" : ""}`}
        >
          <span className="status-dot" />
          {deck.loading
            ? "LOADING"
            : deck.playing
              ? deck.queued
                ? "QUEUED"
                : "PLAYING"
              : "READY"}
        </Badge>
      </div>
      <div className="track-heading">
        <Artwork color={track?.color} />
        <div className="track-heading-text">
          <h2>{track?.title ?? "Load a track"}</h2>
          <p>{track?.artist ?? "Your next selection"}</p>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  void engine
                    ?.setKeyLock(id, !deck.keyLock)
                    .catch((error) => notify(String(error)))
                }
                aria-label={`Deck ${id} key lock`}
                aria-pressed={deck.keyLock}
                className={deck.keyLock ? `text-${color}` : undefined}
              />
            }
          >
            <Icon name="link" />
          </TooltipTrigger>
          <TooltipContent>
            {deck.keyLock
              ? "Key lock on · tempo preserves pitch"
              : "Enable key lock to preserve pitch while changing tempo"}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="deck-screen">
        <div className="deck-metrics">
          <div>
            <span className="metric-caption">TEMPO</span>
            <strong>
              {track?.bpm
                ? (track.bpm * effectiveDeckRate(deck)).toFixed(1)
                : "—"}
              <small>BPM</small>
            </strong>
          </div>
          <div>
            <span className="metric-caption">KEY · EST.</span>
            <strong className="key-value">
              {track?.camelot ?? "—"}
              <small>{track?.key ?? "Analyzing"}</small>
            </strong>
          </div>
          <div className="deck-time">
            <span className="metric-caption">ELAPSED / REMAINING</span>
            <strong>
              {formatTime(deck.position)}
              <small>
                −{formatTime((track?.duration ?? 0) - deck.position)}
              </small>
            </strong>
          </div>
        </div>
        <ScrollingWaveform
          id={id}
          zone={mixZone}
          suggested={annotations.cues}
          highlights={annotations.zones.slice(1)}
          caption={`${learning ? "practice · " : ""}${track?.grid ? "grid ✓" : "est. grid"} · ${phraseCaption.toLowerCase().replace("16-bar phrase", "phrase")}`}
        />
        <Waveform
          key={track?.id ?? "empty"}
          compact
          track={track}
          position={deck.position}
          color={color}
          onSeek={(pos) => engine?.seek(id, pos)}
          plan={plan}
          cues={deck.cues}
          cueLabels={deck.cueLabels}
          zone={mixZone}
          suggested={annotations.cues}
          highlights={annotations.zones}
          viewRange={
            learning
              ? { start: phraseStart, end: phraseStart + beatLength * 128 }
              : undefined
          }
        />
      </div>
      <div
        className="deck-audio-status"
        role={audioWarning ? "status" : undefined}
      >
        {(audioWarning || deck.analysisError) && (
          <span className="text-orange" role="status">
            {audioWarning ?? deck.analysisError}
          </span>
        )}
        <Button
          variant="ghost"
          size="xs"
          aria-label={`Reset deck ${id} audio`}
          onClick={() => engine?.resetChannel(id)}
          disabled={!enabled}
        >
          Reset audio
        </Button>
      </div>
      <div className="deck-transport">
        <div className="transport-main">
          <Button
            variant="outline"
            className="cue-button"
            disabled={!enabled}
            onClick={() => engine?.cue(id)}
          >
            CUE
          </Button>
          <Button
            className={`play-button play-${color}`}
            disabled={!enabled}
            onClick={() => void engine?.toggle(id)}
            aria-label={`${deck.playing ? "Pause" : "Play"} deck ${id}`}
          >
            <Icon name={deck.playing ? "pause" : "play"} size={19} />
          </Button>
          <Button
            variant={deck.syncTo ? "secondary" : "outline"}
            className="sync-button"
            disabled={!enabled || !deck.otherReady}
            aria-label={`Sync deck ${id} to deck ${id === "A" ? "B" : "A"}`}
            aria-pressed={!!deck.syncTo}
            onClick={() => {
              if (engine?.sync(id))
                notify(
                  `Deck ${id} follows ${id === "A" ? "B" : "A"}: tempo and four-beat bar aligned. Verify the grid by ear.`
                )
            }}
          >
            <Icon name="link" size={13} />
            {deck.syncTo ? `SYNC ${deck.syncTo}` : "SYNC"}
          </Button>
          {deck.syncTo && (
            <Button
              variant="ghost"
              aria-label={`Release deck ${id} sync`}
              onClick={() => engine?.releaseSync(id)}
            >
              Unlink
            </Button>
          )}
        </div>
        <div className="tempo-adjust">
          <span>{((deck.rate - 1) * 100).toFixed(1)}%</span>
          <Slider
            value={[deck.rate]}
            min={1 - deck.tempoRange}
            max={1 + deck.tempoRange}
            step={0.001}
            onValueChange={(v) => engine?.setParam(id, "rate", value(v))}
            aria-label={`Deck ${id} tempo`}
            disabled={!enabled}
          />
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Reset deck ${id} tempo`}
            onClick={() => engine?.setParam(id, "rate", 1)}
          >
            ↺
          </Button>
        </div>
      </div>
      <DeckTools id={id} />
      <PerformancePads id={id} />
      <DeckFX id={id} />
    </Card>
  )
}

type KnobParameter = "trim" | "high" | "mid" | "low" | "filter"

function MixerKnob({
  id,
  parameter,
  label,
}: {
  id: DeckId
  parameter: KnobParameter
  label: string
}) {
  const { engine } = useDJ()
  const value = useEngine((state) => state[id][parameter])
  const maximum =
    parameter === "filter" ? 1 : parameter === "trim" && value < 0 ? 24 : 12
  return (
    <div className="eq-control">
      <span>{label}</span>
      <div
        className="knob"
        style={
          {
            "--rotation": `${(value / maximum) * 125}deg`,
          } as React.CSSProperties
        }
      >
        <div className="knob-indicator" />
        <Slider
          className="knob-input"
          value={[value]}
          min={parameter === "filter" ? -1 : parameter === "trim" ? -24 : -12}
          max={parameter === "filter" ? 1 : 12}
          step={parameter === "filter" ? 0.01 : 0.5}
          onValueChange={(v) =>
            engine?.setParam(id, parameter, Array.isArray(v) ? v[0] : v)
          }
          aria-label={`Deck ${id} ${parameter}`}
        />
      </div>
      <small>
        {parameter === "filter"
          ? Math.abs(value) < 0.02
            ? "OFF"
            : value < 0
              ? "LPF"
              : "HPF"
          : `${value > 0 ? "+" : ""}${value.toFixed(1)}`}
      </small>
    </div>
  )
}

function ChannelMeter({ id }: { id: DeckId }) {
  return <Meter value={useEngine((state) => state[id].meter)} />
}

function ChannelFader({ id }: { id: DeckId }) {
  const { engine } = useDJ()
  const volume = useEngine((state) => state[id].volume)
  return (
    <div className="channel-fader">
      <Slider
        orientation="vertical"
        value={[volume]}
        min={0}
        max={1}
        step={0.01}
        onValueChange={(v) =>
          engine?.setParam(id, "volume", Array.isArray(v) ? v[0] : v)
        }
        aria-label={`Deck ${id} volume`}
      />
      <ChannelMeter id={id} />
      <span className="fader-value">{Math.round(volume * 100)}%</span>
    </div>
  )
}

function Crossfader() {
  const { engine } = useDJ()
  const crossfade = useEngine((state) => state.crossfade)
  const auto = useEngine((state) => state.auto)
  return (
    <>
      <div className="crossfade-header">
        <span className="text-lime">A</span>
        <span>
          {auto
            ? "AUTOMIX · CHANNELS · 50%"
            : `CROSSFADE ${Math.round(crossfade * 100)}%`}
        </span>
        <span className="text-orange">B</span>
      </div>
      <Slider
        className="crossfader"
        value={[crossfade]}
        min={0}
        max={1}
        step={0.01}
        onValueChange={(v) => engine?.setCrossfade(Array.isArray(v) ? v[0] : v)}
        aria-label="Crossfader"
      />
    </>
  )
}

function MasterControl() {
  const { engine } = useDJ()
  const master = useEngine((state) => state.master)
  return (
    <div className="master-control">
      <Icon name="volume" size={14} />
      <Slider
        value={[master]}
        min={0}
        max={1}
        step={0.01}
        onValueChange={(v) => engine?.setMaster(Array.isArray(v) ? v[0] : v)}
        aria-label="Master volume"
      />
      <span>MASTER</span>
    </div>
  )
}

export function Mixer() {
  return (
    <Card className="mixer">
      <div className="mixer-heading">
        <span className="eyebrow">MIXER</span>
        <MixerOptions />
      </div>
      <div className="mixer-channels">
        {(["A", "B"] as DeckId[]).map((id) => (
          <div className={`mixer-channel channel-${id}`} key={id}>
            <span
              className={`channel-label text-${id === "A" ? "lime" : "orange"}`}
            >
              {id}
            </span>
            {(["trim", "high", "mid", "low", "filter"] as const).map(
              (parameter, i) => (
                <MixerKnob
                  key={parameter}
                  id={id}
                  parameter={parameter}
                  label={["TRIM", "HI", "MID", "LOW", "FILTER"][i]}
                />
              )
            )}
            <ChannelCue id={id} />
            <ChannelFader id={id} />
          </div>
        ))}
      </div>
      <Crossfader />
      <MasterControl />
      <ControllerControls />
    </Card>
  )
}
