import type { LinkedFile } from "./linked-files"

export type DeckId = "A" | "B"
export type EnergyRating = 1 | 2 | 3 | 4 | 5
export const padModes = [
  "hotcue",
  "padfx1",
  "beatjump",
  "sampler",
  "keyboard",
  "padfx2",
  "beatloop",
  "keyshift",
] as const
export type PadMode = (typeof padModes)[number]
export type Track = {
  id: string
  title: string
  artist: string
  genre: string
  url: string
  duration: number
  bpm: number | null
  key: string | null
  camelot: string | null
  energy: number | null
  color: string
  source: "demo" | "local"
  /** Attribution for bundled tracks, shown in Track credits. */
  credit?: {
    url: string
    artistUrl: string
    license: string
    licenseUrl: string
  }
  file?: Blob
  linkedFile?: LinkedFile
  available?: boolean
  analysis?: Analysis
  grid?: { bpm: number; offset: number; originalBpm: number | null }
  /** Your key (Camelot) when analysis got it wrong; always wins. */
  keyOverride?: string
  /** Your arrangement sections when analysis got them wrong; always win. */
  sectionOverride?: {
    start: number
    end: number
    label: "intro" | "build" | "drop" | "breakdown" | "body" | "outro"
  }[]
  /** Stems prepared for this track (see stem-store.ts). */
  stems?: {
    /** "opus": stored on this device; "pcm": this session only. */
    format: "opus" | "pcm"
    device: "gpu" | "cpu"
    preparedAt: string
  }
  memoryCues?: number[]
}
/** Per-window RMS levels aligned with Analysis.peaks. */
export type WaveBands = {
  rms: number[]
  low: number[]
  mid: number[]
  high: number[]
}
export type Analysis = {
  analyzedAt?: string
  peaks: number[]
  bands?: WaveBands
  /** Per-second vocal / lead-melody presence 0–1 (estimate). */
  vocals?: number[]
  /** Version of the vocal detector that produced `vocals`. */
  vocalsVersion?: number
  /** Detected arrangement changes, seconds on the bar grid. */
  sections?: number[]
  /** Start of the first 16-bar phrase, aligned to detected changes. */
  phraseOffset?: number
  energyCurve: number[]
  bpm: number | null
  beatOffset: number
  key: string | null
  camelot: string | null
  energy: number
  confidence: number
  /** How steady the detected beatgrid is, 0–1; absent on older analyses. */
  gridConfidence?: number
  /** Key per stretch between arrangement changes. */
  keySections?: {
    start: number
    end: number
    key: string | null
    camelot: string | null
    confidence: number
  }[]
  /** The master's tuning offset in semitones (−0.5…0.5). */
  tuning?: number
  /** Per-second level of each stem (vocals, drums, bass, other), 0–1. */
  stemLevels?: Record<"vocals" | "drums" | "bass" | "other", number[]>
  /** Version of the analysis that produced this (see ANALYSIS_VERSION). */
  analysisVersion?: number
  /** Every detected beat and bar start (seconds), when beat tracking ran. */
  beats?: number[]
  downbeats?: number[]
  /** The tracked beats fit one tempo; false for live or drifting tempo. */
  steadyTempo?: boolean
  /** What produced the grid: the beat-tracking model or signal processing. */
  method?: "model" | "dsp"
}
export type DeckState = {
  track: Track | null
  playing: boolean
  loading: boolean
  analysisStatus: "idle" | "running" | "error"
  analysisError: string | null
  position: number
  rate: number
  volume: number
  trim: number
  low: number
  mid: number
  high: number
  filter: number
  loop: number | null
  cues: (number | null)[]
  cueLabels: (string | null)[]
  syncTo: DeckId | null
  meter: number
  inputMeter: number
  quantize: boolean
  slip: boolean
  slipPosition: number | null
  fx: {
    type: "echo" | "reverb"
    enabled: boolean
    amount: number
    beats: number
  }
  echoOut: boolean
  padMode: PadMode
  padBank: number
  activePads: number[]
  tempoRange: number
  keyShift: number
  keyLock: boolean
  /** Stem levels when the track's stems are loaded on this deck. */
  stems: { vocals: number; drums: number; bass: number; melody: number } | null
  /** "full": vocals, drums, bass, melody; "vocals": vocals + instrumental. */
  stemLayout: "full" | "vocals" | null
  headphoneCue: boolean
  jogTouched: boolean
  loopAdjust: "in" | "out" | null
  memoryCues: number[]
  shiftPressed: boolean
  samplerSlots: { name: string; playing: boolean }[]
}
export type Transition = {
  id: string
  name: string
  description: string
  labels: string[]
  difficulty: 1 | 2 | 3 | 4
  bars: number
  duration: number
  outStart: number
  inStart: number
  score: number
  /** What raised or lowered the score, relative to a neutral 60. */
  scoreParts?: { label: string; value: number }[]
  /** A long beatmatched overlap in compatible keys without pitch shift. */
  keySafe?: boolean
  beatmatch: boolean
  rate: number
  reasons: string[]
  warnings: string[]
  execution:
    | "blend"
    | "bass"
    | "long"
    | "filter"
    | "echo"
    | "reverb"
    | "loop"
    | "cut"
    | "fade"
  incomingRate: number
  anchors?: { out: number | null; incoming: number | null }
  bassSwapAt?: number
  cuePhaseWarning?: string
  /** Voice/lead overlap during the mix, 0–1; null if not analyzed. */
  vocalClash?: number | null
  /** Mixing family of the pair, e.g. "House" or "House → Hip-hop / pop". */
  genre?: string
  crossGenre?: boolean
  /** 1 = same tempo, 2 = incoming at half time, 0.5 = double time. */
  tempoRelation?: 1 | 2 | 0.5
  /** Ride the outgoing deck from `from` to `to` (rate) starting at `start`
   * (outgoing track seconds), finishing as the transition begins. */
  tempoRamp?: {
    from: number
    to: number
    bars: number
    start: number
    /** The incoming deck stretches part of the way: a smaller ramp. */
    meet?: boolean
  }
  /** Play length the plan was made for, so revalidation uses the same. */
  pace?: MixPace
  steps: { at: number; label: string; why: string }[]
  /** Automatic effects for this transition (Auto-FX). */
  fx?: FXCue[]
  /** Stem level changes during the transition (stem routines). */
  stemMoves?: StemMove[]
}

/** One stem's level moving from `from` to `to` between two points of a
 * transition's progress (0–1). */
export type StemMove = {
  deck: "out" | "in"
  stem: "vocals" | "drums" | "bass" | "melody"
  from: number
  to: number
  start: number
  end: number
}
export type FXKind =
  | "echo"
  | "reverb"
  | "sweep"
  | "riser"
  | "roll"
  | "brake"
  | "spinback"
  | "gate"
  | "flanger"
  | "filterIn"
  /** Echo on the vocal stem only (needs stems on the deck). */
  | "vocalEcho"
/** One automatic effect, placed on the outgoing track's beat grid. */
export type FXCue = {
  kind: FXKind
  deck: "out" | "in"
  /** Start in outgoing-track seconds from the transition start; negative
   * values are build-ups before it. */
  at: number
  /** Length in outgoing-track seconds. */
  length: number
  /** Depth, 0–1. */
  amount: number
  /** Echo time or roll size in beats. */
  beats?: number
  label: string
}
export type MixIntent = "maintain" | "lift" | "ease"
/**
 * How long each track plays before the next mix:
 * - full: play to the outro (radio-edit style, long sets)
 * - dj: leave after the second drop or chorus, like most club DJs
 * - quick: leave after the first drop, for fast party / mashup sets
 */
export type MixPace = "full" | "dj" | "quick"
