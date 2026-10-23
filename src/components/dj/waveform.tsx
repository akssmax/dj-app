import { beatOffset as gridOffset } from "@/lib/dj/beatgrid"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import type { Track, Transition } from "@/lib/dj/types"
import { formatTime } from "@/lib/dj/tracks"
import { waveColumns } from "@/lib/dj/wave-peaks"
import { labelSections } from "@/lib/dj/sections"
import {
  drawSectionStrip,
  drawVocalLane,
  drawWave,
  fitCanvas,
  readPalette,
} from "./wave-canvas"
import { useDJ } from "./provider"
import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { SuggestedCue } from "@/lib/dj/cue-suggestions"
import {
  bindTimelineGestures,
  boundTimeline,
  panTimeline,
  zoomTimeline,
} from "@/lib/dj/timeline-zoom"
import type { TimelineRange } from "@/lib/dj/timeline-zoom"
import { Icon } from "./icons"

export type WaveformZone = { start: number; end: number; label: string }

// Shared so an empty deck's peaks keep one identity; a fresh [] each render
// re-ran the paint effect, which set state, which rendered again: forever.
const NO_PEAKS: number[] = []

export function Artwork({
  color = "lime",
  small = false,
}: {
  color?: string
  small?: boolean
}) {
  return (
    <div
      className={`artwork artwork-${color} ${small ? "artwork-small" : ""}`}
      aria-hidden="true"
    >
      <div className="art-orbit" />
      <div className="art-orbit orbit-two" />
      <span>c.</span>
    </div>
  )
}

export function Waveform({
  track,
  position = 0,
  color = "lime",
  onSeek,
  plan,
  compact = false,
  cues = [],
  cueLabels = [],
  zone,
  viewRange,
  suggested = [],
  highlights = [],
  zoomable = false,
  heading,
}: {
  track: Track | null
  position?: number
  color?: string
  onSeek?: (position: number) => void
  plan?: Transition
  compact?: boolean
  cues?: (number | null)[]
  cueLabels?: (string | null)[]
  zone?: WaveformZone
  viewRange?: { start: number; end: number }
  suggested?: SuggestedCue[]
  highlights?: WaveformZone[]
  zoomable?: boolean
  heading?: ReactNode
}) {
  const peaks = track?.analysis?.peaks ?? NO_PEAKS
  const { theme, waveStyle } = useDJ()
  const fullDuration = track?.duration || 1
  const minimum = Math.min(fullDuration, Math.max(1, 240 / (track?.bpm || 120)))
  const baseline = boundTimeline(
    viewRange ?? { start: 0, end: fullDuration },
    fullDuration,
    minimum
  )
  const [manualView, setManualView] = useState<{
    track: string
    range: TimelineRange
  } | null>(null)
  const range =
    zoomable && manualView && manualView.track === track?.id
      ? boundTimeline(manualView.range, fullDuration, minimum)
      : baseline
  const { start, end } = range
  const waveform = useRef<HTMLDivElement>(null)
  const liveRange = useRef(range)
  useEffect(() => {
    liveRange.current = range
  }, [range.start, range.end])
  useEffect(() => {
    if (!zoomable || !track || !waveform.current) return
    const id = track.id
    return bindTimelineGestures(waveform.current, {
      duration: fullDuration,
      minimum,
      getRange: () => liveRange.current,
      onChange: (next) => {
        liveRange.current = next
        setManualView({ track: id, range: next })
      },
    })
  }, [zoomable, track?.id, fullDuration, minimum])
  const changeView = (next: TimelineRange) => {
    if (!track) return
    liveRange.current = next
    setManualView({ track: track.id, range: next })
  }
  const zoom = (factor: number) =>
    changeView(
      zoomTimeline(
        range,
        factor,
        position >= start && position <= end
          ? (position - start) / (end - start)
          : 0.5,
        fullDuration,
        minimum
      )
    )
  const deckName = color === "lime" ? "A" : "B"
  const duration = Math.max(0.01, end - start)
  const x = (seconds: number) => ((seconds - start) / duration) * 800
  const visibleZone =
    zone ??
    (plan
      ? {
          start: plan.outStart,
          end: plan.outStart + plan.duration,
          label: "MIX OUT",
        }
      : null)
  const showZone =
    visibleZone && visibleZone.start < end && visibleZone.end > start
  const width = 800,
    height = compact ? 48 : 120
  const barLength = track?.bpm ? 240 / track.bpm : 8
  const beatOffset = gridOffset(track)
  const firstBar = Math.max(0, Math.floor((start - beatOffset) / barLength))
  const barCount = Math.min(800, Math.ceil(duration / barLength) + 2)
  const bands = track?.analysis?.bands
  const canvas = useRef<HTMLCanvasElement>(null)
  const plot = useRef<SVGSVGElement>(null)
  const [plotBox, setPlotBox] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  })
  // The canvas sits under the SVG's content box so overlays keep their geometry.
  useEffect(() => {
    const svg = plot.current,
      container = waveform.current
    if (!svg || !container) return
    const measure = () => {
      const box = svg.getBoundingClientRect(),
        parent = container.getBoundingClientRect(),
        style = getComputedStyle(svg)
      const top = parseFloat(style.paddingTop) || 0,
        bottom = parseFloat(style.paddingBottom) || 0
      setPlotBox({
        left: box.left - parent.left - container.clientLeft,
        top: box.top - parent.top - container.clientTop + top,
        width: box.width,
        height: Math.max(0, box.height - top - bottom),
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])
  // Dim (played) and bright copies of the waveform, painted only when the
  // track, view, size or theme changes. Playback just composites the two
  // at the playhead instead of repainting every column 20 times a second.
  const layers = useRef<{
    dim: HTMLCanvasElement
    bright: HTMLCanvasElement
  } | null>(null)
  const [painted, setPainted] = useState(0)
  useEffect(() => {
    const element = canvas.current
    if (!element || !plotBox.width) return
    fitCanvas(element)
    layers.current ??= {
      dim: document.createElement("canvas"),
      bright: document.createElement("canvas"),
    }
    const { width: w, height: h } = element
    if (!peaks.length) {
      layers.current.dim.width = layers.current.bright.width = 0
      setPainted((n) => n + 1)
      return
    }
    const columns = waveColumns(peaks, bands, fullDuration, start, end, w)
    const palette = readPalette(element)
    for (const [layer, played] of [
      [layers.current.dim, true],
      [layers.current.bright, false],
    ] as const) {
      layer.width = w
      layer.height = h
      const paint = layer.getContext("2d")
      if (!paint) continue
      drawWave(paint, columns, palette, !!bands, played ? w : 0, waveStyle)
      drawVocalLane(paint, track?.analysis?.vocals, start, end, palette)
      if (track) drawSectionStrip(paint, labelSections(track), start, end)
    }
    setPainted((n) => n + 1)
  }, [
    peaks,
    track?.analysis?.vocals,
    bands,
    fullDuration,
    start,
    end,
    plotBox,
    color,
    theme,
    waveStyle,
  ])
  useEffect(() => {
    const element = canvas.current,
      context = element?.getContext("2d"),
      cached = layers.current
    if (!element || !context) return
    context.clearRect(0, 0, element.width, element.height)
    if (!cached?.dim.width || cached.dim.width !== element.width) return
    const { width: w, height: h } = element
    const split = Math.max(
      0,
      Math.min(w, Math.round(((position - start) / (end - start)) * w))
    )
    if (split > 0) context.drawImage(cached.dim, 0, 0, split, h, 0, 0, split, h)
    if (split < w)
      context.drawImage(
        cached.bright,
        split,
        0,
        w - split,
        h,
        split,
        0,
        w - split,
        h
      )
  }, [painted, position, start, end])
  // Up to 800 grid lines: rebuilt only when the view changes, not on every
  // position update.
  const grid = useMemo(
    () =>
      !compact &&
      Array.from({ length: barCount }, (_, i) => {
        const bar = firstBar + i
        const barX = x(beatOffset + bar * barLength)
        return (
          <line
            key={i}
            x1={barX}
            x2={barX}
            y1="0"
            y2={height}
            stroke="currentColor"
            strokeOpacity={
              bar % 32 === 0
                ? 0.42
                : bar % 16 === 0
                  ? 0.28
                  : bar % 8 === 0
                    ? 0.16
                    : 0.05
            }
            strokeWidth={bar % 16 === 0 ? 1.5 : 0.5}
          />
        )
      }),
    [
      compact,
      barCount,
      firstBar,
      beatOffset,
      barLength,
      start,
      duration,
      height,
    ]
  )
  const cueLanes: number[] = []
  const visibleSuggestions = suggested
    .filter((cue) => cue.position >= start && cue.position <= end)
    .sort((a, b) => a.position - b.position)
    .map((cue) => {
      const fraction = (cue.position - start) / duration
      let lane = cueLanes.findIndex((last) => fraction - last >= 0.32)
      if (lane < 0) lane = cueLanes.length
      cueLanes[lane] = fraction
      return { ...cue, fraction, lane }
    })
  return (
    <>
      {zoomable && (
        <div
          className="timeline-toolbar"
          aria-label={`Deck ${deckName} timeline controls`}
        >
          <div className="timeline-heading">
            {heading ?? <span>Timeline</span>}
          </div>
          <div className="timeline-zoom-controls">
            <span
              className="timeline-scale"
              title="Pinch to zoom. Scroll horizontally to pan."
            >
              {(fullDuration / duration).toFixed(1)}×
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!track || duration >= fullDuration - 0.01}
              onClick={() => zoom(0.5)}
              aria-label={`Zoom out deck ${deckName} timeline`}
              title="Zoom out"
            >
              −
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!track || duration <= minimum + 0.01}
              onClick={() => zoom(2)}
              aria-label={`Zoom in deck ${deckName} timeline`}
              title="Zoom in"
            >
              +
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={!track}
              onClick={() => {
                liveRange.current = baseline
                setManualView(null)
              }}
              aria-label={`Fit deck ${deckName} timeline`}
              title="Reset timeline view"
            >
              Fit
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!track || start <= 0.01}
              onClick={() =>
                changeView(panTimeline(range, -duration / 2, fullDuration))
              }
              aria-label={`Pan deck ${deckName} timeline earlier`}
              title="Earlier"
            >
              <Icon name="left" size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!track || end >= fullDuration - 0.01}
              onClick={() =>
                changeView(panTimeline(range, duration / 2, fullDuration))
              }
              aria-label={`Pan deck ${deckName} timeline later`}
              title="Later"
            >
              <Icon name="right" size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!track || duration >= fullDuration - 0.01}
              onClick={() =>
                changeView(
                  boundTimeline(
                    {
                      start: position - duration / 2,
                      end: position + duration / 2,
                    },
                    fullDuration,
                    minimum
                  )
                )
              }
              aria-label={`Center deck ${deckName} timeline on playhead`}
              title="Center playhead"
            >
              <Icon name="headphones" size={14} />
            </Button>
          </div>
        </div>
      )}
      <div
        ref={waveform}
        data-view-start={start}
        data-view-end={end}
        className={`waveform waveform-${color} ${compact ? "waveform-compact" : ""}`}
      >
        <canvas
          ref={canvas}
          className="waveform-canvas"
          aria-hidden="true"
          style={plotBox}
        />
        <svg
          ref={plot}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={
            peaks.length
              ? `Measured waveform for ${track?.title}`
              : "Waveform analysis pending"
          }
        >
          {grid}
          {showZone && (
            <rect
              x={x(Math.max(start, visibleZone.start))}
              width={
                ((Math.min(end, visibleZone.end) -
                  Math.max(start, visibleZone.start)) /
                  duration) *
                width
              }
              y="0"
              height={height}
              fill="currentColor"
              opacity="0.12"
            />
          )}
          {highlights
            .filter(
              (highlight) => highlight.start < end && highlight.end > start
            )
            .map((highlight) => (
              <rect
                key={highlight.label}
                x={x(Math.max(start, highlight.start))}
                width={Math.max(
                  2,
                  x(Math.min(end, highlight.end)) -
                    x(Math.max(start, highlight.start))
                )}
                y="0"
                height={height}
                fill="currentColor"
                opacity="0.18"
              />
            ))}
          {!peaks.length && (
            <>
              <line
                x1="0"
                x2={width}
                y1={height / 2}
                y2={height / 2}
                stroke="currentColor"
                strokeOpacity="0.3"
              />
            </>
          )}
          {cues.map((cue, i) =>
            cue !== null && cue >= start && cue <= end ? (
              <g key={i}>
                <line
                  x1={x(cue)}
                  x2={x(cue)}
                  y1="0"
                  y2={height}
                  stroke={`var(--hot-${i + 1}, currentColor)`}
                  strokeWidth="1.5"
                />
              </g>
            ) : null
          )}
          {suggested
            .filter((cue) => cue.position >= start && cue.position <= end)
            .map((cue) => (
              <line
                key={cue.id}
                x1={x(cue.position)}
                x2={x(cue.position)}
                y1="0"
                y2={height}
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            ))}
          <line
            x1={x(position)}
            x2={x(position)}
            y1="0"
            y2={height}
            stroke="var(--foreground)"
            strokeWidth="2"
          />
        </svg>
        {!peaks.length && (
          <span className="waveform-pending">Analyzing waveform…</span>
        )}
        {!compact &&
          cues.map((cue, i) =>
            cue !== null && cue >= start && cue <= end ? (
              <span
                className="wave-cue-label"
                key={i}
                title={`Cue ${i + 1}${cueLabels[i] ? ` · ${cueLabels[i]}` : ""} · ${formatTime(cue)}`}
                style={{
                  insetInlineStart: `${Math.min(94, ((cue - start) / duration) * 100)}%`,
                  background: `var(--hot-${i + 1})`,
                }}
              >
                {i + 1}
              </span>
            ) : null
          )}
        {!compact &&
          visibleSuggestions.map((cue) => (
            <span
              className="wave-suggested-label"
              key={cue.id}
              title={`${cue.label} · ${formatTime(cue.position)} · ${cue.why}`}
              style={{
                left: `${cue.fraction * 100}%`,
                transform: `translateX(-${cue.fraction * 100}%)`,
                marginBottom: `${cue.lane * 24}px`,
              }}
            >
              {cue.label}
            </span>
          ))}
        {onSeek && (
          <Slider
            className="waveform-seek"
            value={[Math.max(start, Math.min(end, position))]}
            min={start}
            max={end}
            step={0.1}
            onValueChange={(value) =>
              onSeek(Array.isArray(value) ? value[0] : value)
            }
            aria-label={`Seek deck ${color === "lime" ? "A" : "B"}`}
          />
        )}
        {!compact && (
          <div className="wave-time-labels">
            <span>{formatTime(start)}</span>
            <span>{formatTime(start + duration / 4)}</span>
            <span>{formatTime(start + duration / 2)}</span>
            <span>{formatTime(start + duration * 0.75)}</span>
            <span>{formatTime(end)}</span>
          </div>
        )}
        {showZone && !compact && (
          <span className="wave-zone">{visibleZone.label}</span>
        )}
      </div>
    </>
  )
}
