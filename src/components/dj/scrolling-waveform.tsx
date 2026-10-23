import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { beatOffset } from "@/lib/dj/beatgrid"
import { waveColumns } from "@/lib/dj/wave-peaks"
import type { DeckId, Track } from "@/lib/dj/types"
import { useDJ, useEngine } from "./provider"
import type { WaveformZone } from "./waveform"
import type { SuggestedCue } from "@/lib/dj/cue-suggestions"
import { labelSections } from "@/lib/dj/sections"
import {
  drawSectionStrip,
  drawVocalLane,
  drawWave,
  fitCanvas,
  readPalette,
} from "./wave-canvas"
import type { WavePalette } from "./wave-canvas"

const ZOOMS = [4, 8, 16, 32]

/**
 * Playhead-centered waveform that scrolls with the track. It draws on every
 * animation frame from the engine's audio-clock position, so motion stays
 * smooth between the 50 ms state updates.
 */
/** Beats, stronger bars and labelled 16-beat marks across the whole canvas. */
function drawGrid(
  context: CanvasRenderingContext2D,
  track: Track,
  start: number,
  span: number,
  ratio: number,
  palette: WavePalette
) {
  const { width, height } = context.canvas,
    beat = 60 / (track.bpm || 120),
    offset = beatOffset(track),
    x = (seconds: number) => ((seconds - start) / span) * width
  // Bar numbers sit just under the vocal lane so it never covers them.
  const labelTop = Math.max(2, Math.round(height * 0.05)) + 3 * ratio
  context.font = `600 ${10 * ratio}px "Geist Mono Variable", monospace`
  context.textBaseline = "top"
  context.fillStyle = palette.high
  for (
    let index = Math.ceil((start - offset) / beat);
    offset + index * beat <= start + span;
    index++
  ) {
    const t = offset + index * beat
    if (t < 0 || t > track.duration) continue
    const px = Math.round(x(t)) + 0.5
    const bar = index % 4 === 0,
      phrase = index % 64 === 0
    context.globalAlpha = phrase ? 0.55 : bar ? 0.22 : 0.08
    context.fillRect(px, 0, phrase ? 2 * ratio : ratio, height)
    if (bar && index % 16 === 0) {
      context.globalAlpha = 0.6
      context.fillText(String(index / 4 + 1), px + 4 * ratio, labelTop)
    }
  }
  context.globalAlpha = 1
}

export function ScrollingWaveform({
  id,
  zone,
  suggested = [],
  highlights = [],
  caption,
}: {
  id: DeckId
  zone?: WaveformZone
  suggested?: SuggestedCue[]
  highlights?: WaveformZone[]
  caption?: string
}) {
  const { engine, theme, waveStyle } = useDJ()
  const deck = useEngine((state) => ({
    track: state[id].track,
    cues: state[id].cues,
    position: state[id].position,
    playing: state[id].playing,
    bars: state.controller.waveformBars,
  }))
  const canvas = useRef<HTMLCanvasElement>(null)
  // Everything the frame loop reads lives in a ref so the loop never restarts.
  const live = useRef({ deck, zone, engine, suggested, highlights, waveStyle })
  live.current = { deck, zone, engine, suggested, highlights, waveStyle }

  useEffect(() => {
    const element = canvas.current,
      context = element?.getContext("2d")
    if (!element || !context) return
    let frame = 0,
      palette: WavePalette | null = null,
      cueColors: string[] = [],
      last = ""
    const strip = {
      dim: document.createElement("canvas"),
      bright: document.createElement("canvas"),
      key: "",
      analysis: undefined as unknown,
      start: 0,
      span: 0,
    }
    const resize = new ResizeObserver(() => {
      last = ""
    })
    resize.observe(element)
    const render = () => {
      frame = requestAnimationFrame(render)
      const {
          deck: view,
          zone: band,
          engine: audio,
          suggested: marks,
          highlights: sections,
          waveStyle: style,
        } = live.current,
        track = view.track
      const position = view.playing
        ? (audio?.livePosition(id) ?? view.position)
        : view.position
      const ratio = fitCanvas(element)
      const key = `${position.toFixed(4)}|${element.width}|${track?.id}|${view.bars}|${view.cues.join()}|${band?.start}|${band?.end}|${marks.map((m) => m.position).join()}|${style}|${track?.analysis?.bands ? 1 : 0}|${track?.analysis?.vocals?.length ?? 0}`
      if (key === last) return
      last = key
      if (!palette) {
        palette = readPalette(element)
        cueColors = Array.from({ length: 8 }, (_, i) => {
          element.style.color = `var(--hot-${i + 1})`
          return getComputedStyle(element).color
        })
        element.style.color = ""
      }
      const { width, height } = element
      context.clearRect(0, 0, width, height)
      if (!track) return
      const bpm = track.bpm || 120,
        beat = 60 / bpm,
        span = view.bars * 4 * beat,
        start = position - span / 2,
        x = (seconds: number) => ((seconds - start) / span) * width
      const chip = (label: string, at: number, top: number, fill: string) => {
        const padding = 5 * ratio,
          textWidth = context.measureText(label).width,
          left = Math.max(2, Math.min(width - textWidth - padding * 2 - 2, at))
        context.globalAlpha = 0.92
        context.fillStyle = fill
        context.beginPath()
        context.roundRect(
          left,
          top,
          textWidth + padding * 2,
          15 * ratio,
          4 * ratio
        )
        context.fill()
        context.globalAlpha = 1
        context.fillStyle = "#111"
        context.fillText(label, left + padding, top + 3 * ratio)
      }
      context.font = `600 ${10 * ratio}px "Geist Mono Variable", monospace`
      context.textBaseline = "top"
      // Mix zone: tinted band with solid edges and rails, like a loop region.
      if (band && band.end > start && band.start < start + span) {
        const left = x(band.start),
          right = x(band.end)
        context.fillStyle = palette.deck
        context.globalAlpha = 0.18
        context.fillRect(left, 0, right - left, height)
        context.globalAlpha = 0.9
        context.fillRect(left, 0, right - left, 3 * ratio)
        context.fillRect(left, height - 3 * ratio, right - left, 3 * ratio)
        context.fillRect(left, 0, 2 * ratio, height)
        context.fillRect(right - 2 * ratio, 0, 2 * ratio, height)
        context.globalAlpha = 1
      }
      // Sections inside the zone (bass exchange…) get diagonal hatching.
      for (const section of sections) {
        if (section.end <= start || section.start >= start + span) continue
        const left = x(section.start),
          right = x(section.end)
        context.save()
        context.beginPath()
        context.rect(left, 0, right - left, height)
        context.clip()
        context.strokeStyle = palette.foreground
        context.globalAlpha = 0.14
        context.lineWidth = ratio
        for (let k = left - height; k < right; k += 8 * ratio) {
          context.moveTo(k, height)
          context.lineTo(k + height, 0)
        }
        context.stroke()
        context.restore()
      }
      // Grid, waveform and vocal lane come from a cached strip twice the
      // visible width; per frame it is only copied at the current offset.
      // Repainting ~2.5k columns every frame kept the GPU and CPU busy.
      const stripKey = `${width}|${height}|${track.id}|${view.bars}|${style}`
      if (
        stripKey !== strip.key ||
        track.analysis !== strip.analysis ||
        start < strip.start ||
        start + span > strip.start + strip.span
      ) {
        strip.key = stripKey
        strip.analysis = track.analysis
        strip.start = start - span / 2
        strip.span = span * 2
        const columns = waveColumns(
          track.analysis?.peaks ?? [],
          track.analysis?.bands,
          track.duration,
          strip.start,
          strip.start + strip.span,
          width * 2
        )
        for (const [layer, played] of [
          [strip.dim, true],
          [strip.bright, false],
        ] as const) {
          if (layer.width !== width * 2 || layer.height !== height) {
            layer.width = width * 2
            layer.height = height
          }
          const paint = layer.getContext("2d")
          if (!paint) continue
          paint.clearRect(0, 0, layer.width, layer.height)
          drawGrid(paint, track, strip.start, strip.span, ratio, palette)
          drawWave(
            paint,
            columns,
            palette,
            !!track.analysis?.bands,
            played ? layer.width : 0,
            style
          )
          drawVocalLane(
            paint,
            track.analysis?.vocals,
            strip.start,
            strip.start + strip.span,
            palette
          )
        }
      }
      const shift = Math.round(((start - strip.start) / span) * width),
        half = Math.round(width / 2)
      context.drawImage(strip.dim, shift, 0, half, height, 0, 0, half, height)
      context.drawImage(
        strip.bright,
        shift + half,
        0,
        width - half,
        height,
        half,
        0,
        width - half,
        height
      )
      drawSectionStrip(context, labelSections(track), start, start + span, true)
      // The strip sets its own font; chips are measured with this one.
      context.font = `600 ${10 * ratio}px "Geist Mono Variable", monospace`
      context.textBaseline = "top"
      // Suggested transition cues: dashed lines with labels along the bottom.
      context.setLineDash([4 * ratio, 3 * ratio])
      context.lineWidth = 1.5 * ratio
      context.strokeStyle = palette.foreground
      for (const mark of marks) {
        if (mark.position < start || mark.position > start + span) continue
        const px = Math.round(x(mark.position)) + 0.5
        context.globalAlpha = 0.75
        context.beginPath()
        context.moveTo(px, 0)
        context.lineTo(px, height)
        context.stroke()
        context.globalAlpha = 1
        chip(
          mark.label,
          px + 4 * ratio,
          height - 34 * ratio,
          palette.foreground
        )
      }
      context.setLineDash([])
      if (band && band.end > start && band.start < start + span)
        chip(band.label, x(band.start) + 4 * ratio, 6 * ratio, palette.deck)
      else if (band && band.start >= start + span) {
        // Zone ahead but off-screen: point at it with the distance in bars.
        const bars = Math.max(
          1,
          Math.round((band.start - position) / (beat * 4))
        )
        const label = `${band.label} · ${bars} bars ›`
        chip(label, width, height / 2 - 7 * ratio, palette.deck)
      }
      context.font = `${10 * ratio}px "Geist Mono Variable", monospace`
      // Hot cues as colored lines with numbered flags.
      view.cues.forEach((cue, i) => {
        if (cue === null || cue < start || cue > start + span) return
        const px = Math.round(x(cue))
        context.fillStyle = cueColors[i]
        context.fillRect(px, 0, 2 * ratio, height)
        context.fillRect(px, height - 16 * ratio, 14 * ratio, 16 * ratio)
        context.fillStyle = "#111"
        context.fillText(String(i + 1), px + 3 * ratio, height - 14 * ratio)
      })
      // Fixed center playhead.
      const center = Math.round(width / 2)
      context.fillStyle = palette.foreground
      context.shadowColor = palette.foreground
      context.shadowBlur = 6 * ratio
      context.fillRect(center - ratio, 0, 2 * ratio, height)
      context.shadowBlur = 0
      const notch = 5 * ratio
      context.beginPath()
      context.moveTo(center - notch, 0)
      context.lineTo(center + notch, 0)
      context.lineTo(center, notch)
      context.moveTo(center - notch, height)
      context.lineTo(center + notch, height)
      context.lineTo(center, height - notch)
      context.fill()
    }
    frame = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
    }
  }, [id, theme])

  const zoom = ZOOMS.indexOf(deck.bars)
  return (
    <div
      className={`scrolling-waveform waveform-${id === "A" ? "lime" : "orange"}`}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Deck ${id} scrolling waveform, ${deck.bars} bars visible`}
      />
      {caption && <span className="scrolling-caption">{caption}</span>}
      <div className="scrolling-zoom">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Show more bars"
          disabled={zoom >= ZOOMS.length - 1}
          onClick={() => engine?.setWaveformBars(ZOOMS[zoom + 1] ?? 32)}
        >
          −
        </Button>
        <span>{deck.bars} bars</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Show fewer bars"
          disabled={zoom <= 0}
          onClick={() => engine?.setWaveformBars(ZOOMS[zoom - 1] ?? 4)}
        >
          +
        </Button>
      </div>
    </div>
  )
}
