import { trackFamily } from "./genre"
import type { MixIntent, MixPace, Track } from "./types"

export type SetArc = "journey" | "peak" | "sunset" | "flat"
export type SetPhase = "warmup" | "build" | "peak" | "close"

export type SetSettings = {
  /** Automix follows the arc for energy goal, pace and tempo. */
  follow: boolean
  /** Planned length in minutes; 0 = until the playlist runs out. */
  minutes: number
  arc: SetArc
  /** Start and peak BPM; null = follow the tracks' own tempos. */
  tempo: { start: number; peak: number } | null
}

export const defaultSetSettings: SetSettings = {
  follow: true,
  minutes: 60,
  arc: "journey",
  tempo: null,
}

export const arcOptions: { id: SetArc; label: string; hint: string }[] = [
  {
    id: "journey",
    label: "Warm-up → Peak → Close",
    hint: "Start low, build to a peak around two thirds in, then bring it down",
  },
  {
    id: "peak",
    label: "Peak time",
    hint: "A short warm-up, then high energy almost all the way",
  },
  {
    id: "sunset",
    label: "Sunset / wind-down",
    hint: "Start warm and ease the energy down through the set",
  },
  { id: "flat", label: "Flat", hint: "Keep a steady groove at one level" },
]

/** Energy (1–10) at the start of each phase, and where the phase begins. */
const shapes: Record<
  SetArc,
  { phase: SetPhase; from: number; energy: [number, number] }[]
> = {
  journey: [
    { phase: "warmup", from: 0, energy: [4, 5] },
    { phase: "build", from: 0.25, energy: [5, 8] },
    { phase: "peak", from: 0.55, energy: [8, 9] },
    { phase: "close", from: 0.85, energy: [9, 5] },
  ],
  peak: [
    { phase: "warmup", from: 0, energy: [6, 7] },
    { phase: "build", from: 0.1, energy: [7, 8] },
    { phase: "peak", from: 0.3, energy: [8, 9] },
    { phase: "close", from: 0.9, energy: [9, 7] },
  ],
  sunset: [
    { phase: "peak", from: 0, energy: [7, 7] },
    { phase: "close", from: 0.3, energy: [7, 3] },
  ],
  flat: [{ phase: "build", from: 0, energy: [6, 6] }],
}

/** The routines each part of a set leans on, with their share of the mixes. */
export const phasePalette: Record<SetPhase, Partial<Record<string, number>>> = {
  warmup: { long: 0.3, blend: 0.3, filterin: 0.2, reverb: 0.1, bass: 0.2 },
  build: {
    bass: 0.3,
    filter: 0.2,
    breakswap: 0.2,
    blend: 0.2,
    loop: 0.1,
  },
  peak: {
    dropswap: 0.25,
    doubledrop: 0.15,
    cut: 0.15,
    echo: 0.15,
    roll: 0.1,
    fakedrop: 0.1,
    filter: 0.1,
  },
  close: { long: 0.3, crossover: 0.2, reverb: 0.2, blend: 0.2, fade: 0.1 },
}

export type ArcPoint = {
  phase: SetPhase
  /** Target track energy, 1–10. */
  energy: number
  intent: MixIntent
  /** Target BPM, or null to follow the tracks. */
  bpm: number | null
  pace: MixPace
}

function energyAt(arc: SetArc, fraction: number) {
  const f = Math.max(0, Math.min(1, fraction))
  const parts = shapes[arc]
  let index = 0
  for (let i = 0; i < parts.length; i++) if (parts[i].from <= f) index = i
  const part = parts[Math.max(0, index)]
  const end = parts[index + 1]?.from ?? 1
  const local = end > part.from ? (f - part.from) / (end - part.from) : 0
  return {
    phase: part.phase,
    energy: part.energy[0] + (part.energy[1] - part.energy[0]) * local,
  }
}

/** The set's targets at a point in it (0 = start, 1 = end). */
export function arcAt(settings: SetSettings, fraction: number): ArcPoint {
  const { phase, energy } = energyAt(settings.arc, fraction)
  const ahead = energyAt(settings.arc, fraction + 0.06).energy
  // At the peak, keep pushing unless the arc is already coming down.
  const intent: MixIntent =
    ahead - energy > 0.25 || (phase === "peak" && ahead >= energy)
      ? "lift"
      : ahead - energy < -0.25
        ? "ease"
        : "maintain"
  // Tempo follows the energy: start BPM at the arc's lowest point, peak BPM
  // at its highest.
  const levels = shapes[settings.arc].flatMap((part) => part.energy)
  const low = Math.min(...levels),
    high = Math.max(...levels)
  const bpm = settings.tempo
    ? settings.tempo.start +
      (settings.tempo.peak - settings.tempo.start) *
        (high > low ? (energy - low) / (high - low) : 0)
    : null
  return {
    phase,
    energy,
    intent,
    bpm: bpm === null ? null : Math.round(bpm * 10) / 10,
    pace: phase === "build" || phase === "peak" ? "dj" : "full",
  }
}

/** Points along the whole arc, for drawing it. */
export function arcCurve(settings: SetSettings, points = 48) {
  return Array.from({ length: points + 1 }, (_, i) => {
    const fraction = i / points
    return { fraction, ...arcAt(settings, fraction) }
  })
}

/** A start and peak tempo the playlist can actually reach. */
export function suggestTempo(pool: Track[]) {
  const tempos = pool
    .map((track) => track.bpm)
    .filter((bpm): bpm is number => !!bpm && bpm > 60 && bpm < 200)
    .sort((a, b) => a - b)
  if (tempos.length < 2) return null
  const at = (q: number) => tempos[Math.floor((tempos.length - 1) * q)]
  return { start: Math.round(at(0.2)), peak: Math.round(at(0.8)) }
}

/**
 * How far into the set we are: by the clock for a timed set, by tracks
 * played for one that runs until the playlist ends.
 */
export function setProgress(
  settings: SetSettings,
  elapsedSeconds: number,
  played: number,
  remaining: number
) {
  if (settings.minutes > 0)
    return Math.max(0, Math.min(1, elapsedSeconds / (settings.minutes * 60)))
  return played + remaining > 0 ? played / (played + remaining) : 0
}

/**
 * Score a candidate against the set: energy and tempo targets, no artist
 * repeats, no same-vibe runs, and a key path that doesn't ping-pong.
 * Higher is better; 0 is neutral.
 */
export function setFit(
  track: Track,
  target: ArcPoint,
  history: Track[]
): { score: number; notes: string[] } {
  let score = 0
  const notes: string[] = []
  if (track.energy !== null) {
    const gap = Math.abs(track.energy - target.energy)
    score -= gap * 3
    if (gap <= 1)
      notes.push(`energy ${track.energy} fits ${phaseLabel(target.phase)}`)
  }
  if (target.bpm && track.bpm) {
    // Half/double-time tracks count at the nearest octave.
    const gap = Math.min(
      ...[0.5, 1, 2].map(
        (m) => Math.abs(track.bpm! * m - target.bpm!) / target.bpm!
      )
    )
    score -= Math.min(20, gap * 150)
    if (gap <= 0.02) notes.push(`near the ${target.bpm} BPM target`)
  }
  const last = history.at(-1),
    recentArtists = history.slice(-4).map((t) => t.artist.toLowerCase())
  const artist = track.artist.toLowerCase()
  if (artist && last && last.artist.toLowerCase() === artist) score -= 40
  else if (artist && recentArtists.includes(artist)) score -= 15
  if (last) {
    const sameFamily = trackFamily(last).family === trackFamily(track).family
    const sameEnergy =
      last.energy !== null &&
      track.energy !== null &&
      Math.abs(last.energy - track.energy) <= 0.5
    const vocal = (t: Track) => {
      const v = t.analysis?.vocals
      return v?.length
        ? v.filter((x) => x >= 0.35).length / v.length > 0.3
        : null
    }
    if (sameFamily && sameEnergy && vocal(last) === vocal(track)) score -= 6
    // Key ping-pong: straight back to the key from two tracks ago.
    const before = history.at(-2)
    if (
      before?.camelot &&
      track.camelot === before.camelot &&
      last.camelot !== before.camelot
    )
      score -= 4
  }
  return { score, notes }
}

export function phaseLabel(phase: SetPhase) {
  return phase === "warmup"
    ? "the warm-up"
    : phase === "build"
      ? "the build"
      : phase === "peak"
        ? "the peak"
        : "the close"
}

/**
 * Set-phase adjustment for a routine: favoured routines for this part of the
 * set gain; ones used beyond their share of the phase so far lose.
 */
export function phaseBonus(id: string, phase: SetPhase, usedInPhase: string[]) {
  const share = phasePalette[phase][id]
  const used = usedInPhase.filter((other) => other === id).length
  const overused =
    usedInPhase.length >= 2 &&
    used / usedInPhase.length > (share ?? 0.05) + 0.15
  // Punchy exits feel abrupt while the room warms up or winds down.
  const abrupt =
    (phase === "warmup" || phase === "close") &&
    ["cut", "dropswap", "fakedrop", "roll", "backspin", "brake"].includes(id)
  // Long washes stall the peak.
  const slow =
    phase === "peak" &&
    ["long", "reverb", "crossover", "fade", "filterin"].includes(id)
  if (overused) return -6
  return (
    (share ? Math.round(3 + share * 20) : 0) - (abrupt ? 4 : 0) - (slow ? 8 : 0)
  )
}

/**
 * How far along the arc one track moves the set: about 3½ minutes per track
 * at DJ pace, or an even share of the playlist when the set has no length.
 */
export function arcStep(settings: SetSettings, tracksInSet: number) {
  return settings.minutes > 0
    ? 210 / (settings.minutes * 60)
    : 1 / Math.max(1, tracksInSet)
}
