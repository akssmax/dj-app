import type { DeckStems } from "./stem-store"

/**
 * Stem playback on one deck with a single buffer source, so loops, slip,
 * sync and scratching keep working unchanged. The buffer holds the
 * original next to the stems:
 *
 *   full:   [orig L, orig R, vocals L, vocals R, drums L, drums R, bass]
 *   vocals: [orig L, orig R, vocals L, vocals R]   (low-memory devices)
 *
 * "Melody" (everything else) isn't stored: the output is the original
 * weighted by the melody gain plus each stored stem weighted by (its gain −
 * melody gain), so all gains at 1 plays the original exactly.
 */
export type StemGains = {
  vocals: number
  drums: number
  bass: number
  melody: number
}
export type StemLayout = "full" | "vocals"

export const allStemsOn: StemGains = { vocals: 1, drums: 1, bass: 1, melody: 1 }

/** Weights for the original and each stored stem. */
export function matrixWeights(gains: StemGains, layout: StemLayout) {
  const base = gains.melody
  return layout === "full"
    ? {
        original: base,
        vocals: gains.vocals - base,
        drums: gains.drums - base,
        bass: gains.bass - base,
      }
    : // Without drum and bass stems, "melody" is the whole instrumental.
      { original: base, vocals: gains.vocals - base, drums: 0, bass: 0 }
}

/** Which layout this device can hold for a track of `seconds`. */
export function stemLayoutFor(seconds: number): StemLayout {
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8
  return memory < 8 || seconds > 600 ? "vocals" : "full"
}

export function buildStemBuffer(
  context: BaseAudioContext,
  original: AudioBuffer,
  stems: DeckStems,
  layout: StemLayout
) {
  const planes = [
    original.getChannelData(0),
    original.getChannelData(Math.min(1, original.numberOfChannels - 1)),
    stems.vocals[0],
    stems.vocals[1] ?? stems.vocals[0],
    ...(layout === "full"
      ? [stems.drums[0], stems.drums[1] ?? stems.drums[0], stems.bass[0]]
      : []),
  ]
  const buffer = context.createBuffer(
    planes.length,
    original.length,
    original.sampleRate
  )
  planes.forEach((plane, c) =>
    buffer.copyToChannel(
      new Float32Array(plane.subarray(0, original.length)),
      c
    )
  )
  return buffer
}

export type StemMatrix = {
  layout: StemLayout
  input: ChannelSplitterNode
  output: ChannelMergerNode
  /** Weight gains per source, [left, right]. */
  weights: Record<"original" | "vocals" | "drums" | "bass", GainNode[]>
  /** The vocal stem alone, for a vocal-only echo (silent until used). */
  vocalTap: GainNode
}

export function createStemMatrix(
  context: BaseAudioContext,
  layout: StemLayout
): StemMatrix {
  const channels = layout === "full" ? 7 : 4
  const input = context.createChannelSplitter(channels),
    output = context.createChannelMerger(2)
  const pair = () => [context.createGain(), context.createGain()]
  const weights = {
    original: pair(),
    vocals: pair(),
    drums: pair(),
    bass: pair(),
  }
  const wire = (gains: GainNode[], left: number, right: number) => {
    input.connect(gains[0], left)
    input.connect(gains[1], right)
    gains[0].connect(output, 0, 0)
    gains[1].connect(output, 0, 1)
  }
  wire(weights.original, 0, 1)
  wire(weights.vocals, 2, 3)
  if (layout === "full") {
    wire(weights.drums, 4, 5)
    // Mono bass to both sides.
    wire(weights.bass, 6, 6)
  }
  const tapMerge = context.createChannelMerger(2),
    vocalTap = context.createGain()
  vocalTap.gain.value = 0
  input.connect(tapMerge, 2, 0)
  input.connect(tapMerge, 3, 1)
  tapMerge.connect(vocalTap)
  const matrix = { layout, input, output, weights, vocalTap }
  setStemGains(matrix, allStemsOn, 0)
  return matrix
}

export function setStemGains(
  matrix: StemMatrix,
  gains: StemGains,
  time: number
) {
  const w = matrixWeights(gains, matrix.layout)
  for (const key of ["original", "vocals", "drums", "bass"] as const)
    for (const node of matrix.weights[key]) {
      node.gain.cancelScheduledValues(time)
      node.gain.setTargetAtTime(w[key], time, 0.012)
    }
}
