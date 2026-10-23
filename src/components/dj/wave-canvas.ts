import type { WaveColumn } from "@/lib/dj/wave-peaks"

export type WavePalette = {
  deck: string
  foreground: string
  vocal: string
  low: string
  mid: string
  high: string
  played: number
}

const tokens = [
  "--wave-low",
  "--wave-mid",
  "--wave-high",
  "--foreground",
  "--vocal",
] as const

/** Resolve theme tokens to colors the canvas understands. The element's own
 * `color` is the deck color (set by the .waveform-<deck> class). */
export function readPalette(element: HTMLElement): WavePalette {
  const deck = getComputedStyle(element).color
  const previous = element.style.color
  const [low, mid, high, foreground, vocal] = tokens.map((token) => {
    element.style.color = `var(${token})`
    return getComputedStyle(element).color
  })
  element.style.color = previous
  return { deck, foreground, vocal, low, mid, high, played: 0.38 }
}

/** Fit a canvas bitmap to its CSS box at device resolution. */
export function fitCanvas(canvas: HTMLCanvasElement) {
  const ratio = Math.min(3, window.devicePixelRatio || 1),
    width = Math.max(1, Math.round(canvas.clientWidth * ratio)),
    height = Math.max(1, Math.round(canvas.clientHeight * ratio))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  return ratio
}

export type WaveStyle = "spectrum" | "bands"

// Spectrum primaries (Serato/Traktor convention): bass reads red, mids green,
// highs blue; mixes blend to orange, yellow, cyan, magenta and white.
const LOW_RGB = [255, 64, 40],
  MID_RGB = [70, 230, 110],
  HIGH_RGB = [70, 140, 255]
const swatches = new Map<number, string>()
/** Quantized column color so a frame reuses a few hundred fill strings. */
function spectrumColor(column: WaveColumn, light: boolean) {
  // Cubing the band levels lets the dominant band set the hue, so a kick
  // reads red and a hi-hat blue instead of every column averaging to white.
  const low = column.low ** 3,
    mid = column.mid ** 3,
    high = column.high ** 3
  const total = low + mid + high || 1
  const mix = [0, 1, 2].map(
    (i) => (low * LOW_RGB[i] + mid * MID_RGB[i] + high * HIGH_RGB[i]) / total
  )
  // Louder columns are brighter; light themes use deeper tones for contrast.
  const peak = Math.max(...mix, 1),
    brightness =
      (light ? 0.58 : 0.62) + (light ? 0.2 : 0.38) * Math.min(1, column.rms)
  // Push channels away from the brightest one for Traktor-like saturation.
  const [r, g, b] = mix.map((v) =>
    Math.round((Math.max(0, 1 - (1 - v / peak) * 1.45) * 255 * brightness) / 16)
  )
  const key = (r << 10) | (g << 5) | b
  let color = swatches.get(key)
  if (!color) {
    color = `rgb(${Math.min(255, r * 16)},${Math.min(255, g * 16)},${Math.min(255, b * 16)})`
    swatches.set(key, color)
  }
  return color
}

function isLight(color: string) {
  const [r = 0, g = 0, b = 0] = (color.match(/[\d.]+/g) ?? []).map(Number)
  // Foreground is dark on light themes; channels may be 0–1 (color()) or 0–255.
  const scale = Math.max(r, g, b) > 1 ? 255 : 1
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / scale < 0.5
}

/**
 * Draw one column per device pixel, mirrored around the center line.
 * - spectrum: each column is tinted by its band mix (peak envelope + body).
 * - bands: nested low / mid / high layers in the theme's wave colors.
 * Without band data, the deck color is used. Columns left of `playedUntil`
 * are dimmed.
 */
export function drawWave(
  context: CanvasRenderingContext2D,
  columns: (WaveColumn | null)[],
  palette: WavePalette,
  banded: boolean,
  playedUntil: number,
  style: WaveStyle = "spectrum"
) {
  const { width, height } = context.canvas,
    center = height / 2,
    reach = center * 0.94
  const scale = columns.length / width
  if (banded && style === "spectrum") {
    const light = isLight(palette.foreground)
    for (const [alpha, level] of [
      [0.42, (c: WaveColumn) => c.peak],
      [1, (c: WaveColumn) => Math.min(c.peak, c.rms * 0.82)],
    ] as const) {
      for (let x = 0; x < width; x++) {
        const column = columns[Math.floor(x * scale)]
        if (!column) continue
        context.globalAlpha = alpha * (x < playedUntil ? palette.played : 1)
        context.fillStyle = spectrumColor(column, light)
        const half = Math.max(0.5, level(column) * reach)
        context.fillRect(x, center - half, 1, half * 2)
      }
    }
    context.globalAlpha = 1
    return
  }
  const layers: [string, number, (column: WaveColumn) => number][] = banded
    ? [
        [palette.low, 0.3, (c) => c.peak],
        [palette.low, 1, (c) => Math.min(c.peak, c.low * 0.95)],
        [palette.mid, 1, (c) => Math.min(c.peak, c.mid * 0.6)],
        [palette.high, 0.95, (c) => Math.min(c.peak, c.high * 0.3)],
      ]
    : [
        [palette.deck, 0.35, (c) => c.peak],
        [palette.deck, 0.9, (c) => Math.min(c.peak, c.rms)],
      ]
  for (const [color, alpha, level] of layers) {
    context.fillStyle = color
    for (const played of [true, false]) {
      context.globalAlpha = alpha * (played ? palette.played : 1)
      context.beginPath()
      for (let x = 0; x < width; x++) {
        if (x < playedUntil !== played) continue
        const column = columns[Math.floor(x * scale)]
        if (!column) continue
        const half = Math.max(0.5, level(column) * reach)
        context.rect(x, center - half, 1, half * 2)
      }
      context.fill()
    }
  }
  context.globalAlpha = 1
}

/**
 * Thin lane along the top where vocals or a lead melody were detected, so
 * the transition planner's view of the track is visible while mixing.
 */
export function drawVocalLane(
  context: CanvasRenderingContext2D,
  vocals: number[] | undefined,
  start: number,
  end: number,
  palette: WavePalette
) {
  if (!vocals?.length || end <= start) return
  const { width, height } = context.canvas,
    lane = Math.max(2, Math.round(height * 0.05))
  context.fillStyle = palette.vocal
  context.globalAlpha = 0.85
  context.beginPath()
  for (let x = 0; x < width; x++) {
    const second = Math.floor(start + (x / width) * (end - start))
    if ((vocals[second] ?? 0) >= 0.35) context.rect(x, 0, 1, lane)
  }
  context.fill()
  context.globalAlpha = 1
}
