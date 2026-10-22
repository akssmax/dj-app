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
  file?: Blob
  linkedFile?: LinkedFile
  available?: boolean
  analysis?: Analysis
  grid?: { bpm: number; offset: number; originalBpm: number | null }
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
  energyCurve: number[]
  bpm: number | null
  beatOffset: number
  key: string | null
  camelot: string | null
  energy: number
  confidence: number
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
  steps: { at: number; label: string; why: string }[]
}
export type MixIntent = "maintain" | "lift" | "ease"
