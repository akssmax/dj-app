/**
 * Hand-picked visual palettes, one per Camelot number so harmonic neighbours
 * (8A → 9A) drift to a related palette instead of jumping across the wheel.
 * Each runs shadow → body → accent → highlight.
 */
export const palettes = [
  { name: "Ultraviolet", colors: ["#0d0221", "#4b1d9e", "#e0218a", "#ffc2e8"] },
  { name: "Synthwave", colors: ["#080226", "#3a1cd6", "#ff3d81", "#ffbe7a"] },
  { name: "Sunset", colors: ["#140010", "#9c1340", "#ff6b3d", "#ffd56b"] },
  { name: "Ember", colors: ["#120400", "#7d1c04", "#ff7a1a", "#ffe08a"] },
  { name: "Citrus", colors: ["#081105", "#2e6b12", "#c4f02b", "#fffbb8"] },
  { name: "Lagoon", colors: ["#011413", "#00786d", "#2ef2c4", "#dcfff4"] },
  { name: "Aurora", colors: ["#020c1c", "#008f6e", "#3fd8ff", "#cdb2ff"] },
  { name: "Deep sea", colors: ["#010722", "#0a4ac2", "#12c4ff", "#c4f5ff"] },
  { name: "Cobalt rose", colors: ["#06031d", "#2d3bf0", "#ff4fa3", "#ffe2f0"] },
  { name: "Orchid", colors: ["#10011c", "#7a0fc7", "#ff5ee4", "#a6f4ff"] },
  { name: "Neon jungle", colors: ["#011008", "#00945a", "#b4ff3b", "#ff58d6"] },
  { name: "Magma", colors: ["#0b0006", "#64106a", "#ff2e63", "#ffb44d"] },
] as const

/** Shown while nothing with a key is playing. */
export const idlePalette = 6

/** Palette index for a Camelot key like "8A"; null keys fall back to idle. */
export function paletteForCamelot(camelot: string | null | undefined) {
  const number = Number.parseInt(camelot ?? "", 10)
  return number >= 1 && number <= 12 ? number - 1 : idlePalette
}

/** Palette as 12 linear-light floats (4 × RGB) for the shader. */
export function linearPalette(
  index: number,
  out: Float32Array = new Float32Array(12)
) {
  palettes[index].colors.forEach((hex, i) => {
    for (let c = 0; c < 3; c++)
      out[i * 3 + c] =
        (parseInt(hex.slice(1 + c * 2, 3 + c * 2), 16) / 255) ** 2.2
  })
  return out
}

export type ColorMode = "spectrum" | "theme" | "key"
export const colorModes: { id: ColorMode; label: string; hint: string }[] = [
  {
    id: "spectrum",
    label: "Spectrum",
    hint: "Every palette, shifting on phrases and drops",
  },
  {
    id: "theme",
    label: "Theme",
    hint: "The studio theme's deck and waveform colors",
  },
  {
    id: "key",
    label: "Key",
    hint: "Each track's Camelot key picks its palette",
  },
]

/** Linear-light RGB triples read from the active studio theme. */
export type ThemeColors = {
  deckA: number[]
  deckB: number[]
  low: number[]
  mid: number[]
}

/** sRGB 0–255 → linear light, as the shader expects. */
export const toLinear = (rgb: number[]) => rgb.map((v) => (v / 255) ** 2.2)

/**
 * A palette from theme colors: a deep wave-low shadow, a wave body, then the
 * two deck colors. `lead` 0–1 moves the accent from deck A's color to deck
 * B's as the mix moves across, so the playing deck owns the glow.
 */
export function themePalette(
  colors: ThemeColors,
  lead: number,
  out = new Float32Array(12)
) {
  const stops = [
    colors.low.map((v) => v * 0.08),
    colors.low.map((v, i) => v + (colors.mid[i] - v) * 0.3),
    colors.deckA.map((v, i) => v + (colors.deckB[i] - v) * lead),
    colors.deckB.map((v, i) => v + (colors.deckA[i] - v) * lead),
  ]
  stops.forEach((stop, s) => stop.forEach((v, c) => (out[s * 3 + c] = v)))
  return out
}

/** Rotate a palette's hue in place (the CSS hue-rotate matrix). */
export function rotateHue(palette: Float32Array, angle: number) {
  const cos = Math.cos(angle),
    sin = Math.sin(angle)
  const m = [
    0.213 + cos * 0.787 - sin * 0.213,
    0.715 - cos * 0.715 - sin * 0.715,
    0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143,
    0.715 + cos * 0.285 + sin * 0.14,
    0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787,
    0.715 - cos * 0.715 + sin * 0.715,
    0.072 + cos * 0.928 + sin * 0.072,
  ]
  for (let i = 0; i < palette.length; i += 3) {
    const r = palette[i],
      g = palette[i + 1],
      b = palette[i + 2]
    palette[i] = Math.max(0, m[0] * r + m[1] * g + m[2] * b)
    palette[i + 1] = Math.max(0, m[3] * r + m[4] * g + m[5] * b)
    palette[i + 2] = Math.max(0, m[6] * r + m[7] * g + m[8] * b)
  }
  return palette
}

/**
 * Blend per-deck palettes so a mix shows both: the deep stops follow the
 * louder deck slowly (gain²) while the bright stops take the incoming
 * deck's colors early (√gain).
 */
export function blendPalettes(
  decks: { colors: Float32Array; gain: number }[],
  out: Float32Array
) {
  out.fill(0)
  for (let stop = 0; stop < 4; stop++) {
    const exponent = stop < 2 ? 2 : 0.5
    let total = 0
    for (const { colors, gain } of decks) {
      const w = Math.max(gain, 0.0001) ** exponent
      for (let c = 0; c < 3; c++) out[stop * 3 + c] += colors[stop * 3 + c] * w
      total += w
    }
    for (let c = 0; c < 3; c++) out[stop * 3 + c] /= total || 1
  }
  return out
}
