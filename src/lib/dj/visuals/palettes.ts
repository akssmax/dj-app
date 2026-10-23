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
export function linearPalette(index: number, out = new Float32Array(12)) {
  palettes[index].colors.forEach((hex, i) => {
    for (let c = 0; c < 3; c++)
      out[i * 3 + c] = ((parseInt(hex.slice(1 + c * 2, 3 + c * 2), 16) / 255) **
        2.2)
  })
  return out
}
