import { beatOffset as gridOffset } from "./beatgrid"
import { techniques } from "./lessons"
import type {
  FXCue,
  MixIntent,
  MixPace,
  StemMove,
  Track,
  Transition,
} from "./types"
import { pairProfile, profileBonus } from "./genre"
import { labelSections, overlapWith } from "./sections"
import { describeFX, planFX } from "./auto-fx"
import { phaseBonus } from "./set-plan"
import type { SetPhase } from "./set-plan"
import type { FXAmount } from "./auto-fx"

export function harmonicCompatibility(a: string | null, b: string | null) {
  if (
    !a ||
    !b ||
    !/^(?:[1-9]|1[0-2])[AB]$/.test(a) ||
    !/^(?:[1-9]|1[0-2])[AB]$/.test(b)
  )
    return 0.5
  if (a === b) return 1
  const an = parseInt(a),
    bn = parseInt(b)
  const distance = Math.min(Math.abs(an - bn), 12 - Math.abs(an - bn))
  if (an === bn) return 0.9
  if (a.at(-1) === b.at(-1) && distance === 1) return 0.95
  return 0.2
}
const camelotPattern = /^(?:[1-9]|1[0-2])[AB]$/

/** Move a Camelot key by semitones: each semitone is 7 steps on the wheel. */
export function shiftCamelot(camelot: string, semitones: number) {
  if (!camelotPattern.test(camelot)) return camelot
  const n = parseInt(camelot)
  return `${((((n - 1 + 7 * semitones) % 12) + 12) % 12) + 1}${camelot.at(-1)}`
}

/**
 * The keys as they will sound together. `relative` is the incoming deck's
 * pitch against the outgoing one in semitones. Off a whole semitone by more
 * than about 15 cents, the tracks sound detuned whatever their keys.
 */
export function heardKeys(
  out: string | null,
  incoming: string | null,
  relative: number
) {
  const whole = Math.round(relative)
  const detuned = Math.abs(relative - whole) > 0.15
  const heardIn =
    incoming && camelotPattern.test(incoming)
      ? shiftCamelot(incoming, whole)
      : incoming
  return {
    out,
    in: heardIn,
    detuned,
    cents: Math.round((relative - whole) * 100),
    compatibility: harmonicCompatibility(out, heardIn),
  }
}

/** +2 on the wheel or one semitone up: the classic energy-boost key moves. */
export function energyBoostMove(out: string, incoming: string) {
  if (!camelotPattern.test(out) || !camelotPattern.test(incoming)) return null
  if (incoming === shiftCamelot(out, 1)) return "+1 semitone"
  const n = parseInt(out)
  if (incoming === `${((n + 1) % 12) + 1}${out.at(-1)}`) return "+2 Camelot"
  return null
}

/** A ±1 semitone key shift that would make clashing keys compatible. */
export function keyShiftTip(out: string, incoming: string) {
  for (const shift of [1, -1])
    if (harmonicCompatibility(out, shiftCamelot(incoming, shift)) >= 0.9)
      return shift
  return null
}

type DeckKey = { shift: number; lock: boolean }
/** A deck's key settings for planning. */
export const deckKey = (deck: {
  keyShift: number
  keyLock: boolean
}): DeckKey => ({ shift: deck.keyShift, lock: deck.keyLock })
type Options = {
  outRate?: number
  incomingRate?: number
  intent?: MixIntent
  recent?: string[]
  outCue?: number | null
  inCue?: number | null
  /** Allow riding the outgoing tempo toward the incoming one (default on). */
  allowRamp?: boolean
  /** How much of each track plays before mixing out (default full). */
  pace?: MixPace
  /** Key shift / key lock on each deck, so keys are judged as heard. */
  outKey?: DeckKey
  inKey?: DeckKey
  /** Auto-FX amount and the effects used by recent transitions. */
  fx?: { amount: FXAmount; recent: string[] }
  /** Part of the set and the routines already used in it. */
  setPhase?: { phase: SetPhase; used: string[] }
  /** Your saved routine for this pair and ratings by style pair. */
  taste?: { saved?: string; ratings?: Record<string, number> }
}

/** Key for ratings: the pair's style label and the routine. */
export const ratingKey = (genre: string | undefined, technique: string) =>
  `${genre ?? "Mixed"}|${technique}`

/** Key for a saved transition between two tracks. */
export const pairKey = (outId: string, inId: string) => `${outId}>${inId}`
const definitions: {
  id: string
  lesson: string
  execution: Transition["execution"]
  bars: number
  needsTempo: boolean
}[] = [
  {
    id: "blend",
    lesson: "phrase",
    execution: "blend",
    bars: 16,
    needsTempo: true,
  },
  { id: "bass", lesson: "bass", execution: "bass", bars: 16, needsTempo: true },
  { id: "long", lesson: "long", execution: "long", bars: 32, needsTempo: true },
  {
    id: "filter",
    lesson: "filter",
    execution: "filter",
    bars: 8,
    needsTempo: true,
  },
  { id: "loop", lesson: "loop", execution: "loop", bars: 8, needsTempo: true },
  { id: "echo", lesson: "echo", execution: "echo", bars: 1, needsTempo: false },
  {
    id: "reverb",
    lesson: "reverb",
    execution: "reverb",
    bars: 2,
    needsTempo: false,
  },
  { id: "fade", lesson: "fade", execution: "fade", bars: 2, needsTempo: false },
  { id: "cut", lesson: "cut", execution: "cut", bars: 0, needsTempo: false },
]
export const transitionChoices = [
  ...definitions.map((recipe) => ({
    id: recipe.id,
    name:
      recipe.id === "blend"
        ? "Phrase blend"
        : techniques.find((t) => t.id === recipe.lesson)!.name,
  })),
  // Resolves to the best key-safe blend (see findPlan).
  { id: "harmonic", name: "Harmonic / Key Mixing" },
  { id: "dropswap", name: "Drop swap" },
  { id: "breakswap", name: "Breakdown swap" },
  { id: "crossover", name: "Breakdown crossover" },
  { id: "doubledrop", name: "Double drop" },
  { id: "fakedrop", name: "Fake drop → real drop" },
  { id: "roll", name: "Loop roll" },
  { id: "filterin", name: "Filter in" },
  { id: "brake", name: "Brake / vinyl stop" },
  { id: "backspin", name: "Backspin" },
  { id: "stembass", name: "Stem bass swap" },
  { id: "vocalout", name: "Vocal out" },
  { id: "instrumentalin", name: "Instrumental in" },
  { id: "acapella", name: "Acapella over" },
  { id: "drumswap", name: "Drum swap" },
]

/** Routines placed by the arrangement (drops, breakdowns), not by cues. */
export const arrangementRoutines = [
  "dropswap",
  "breakswap",
  "crossover",
  "doubledrop",
  "fakedrop",
]

/** Routines that keep a long beatmatched overlap, where keys matter most. */
const blendFamily = ["blend", "bass", "long", "breakswap"]

/**
 * Find a requested routine. "harmonic" is a quality of a blend rather than
 * a routine of its own: it resolves to the best key-safe blend.
 */
export function findPlan(plans: Transition[], id: string | null | undefined) {
  if (!id) return undefined
  if (id === "harmonic")
    return plans.find((p) => p.keySafe && blendFamily.includes(p.id))
  return plans.find((p) => p.id === id)
}

/** How each routine serves the energy goal, as a DJ would choose. */
const intentFit: Record<MixIntent, Record<string, number>> = {
  lift: {
    dropswap: 12,
    filter: 10,
    cut: 6,
    echo: 5,
    loop: 5,
    breakswap: 4,
    bass: 0,
    blend: -2,
    fade: -4,
    crossover: -4,
    long: -6,
    reverb: -6,
    doubledrop: 10,
    fakedrop: 9,
    roll: 7,
    backspin: 2,
    brake: -4,
    filterin: -4,
    drumswap: 5,
    stembass: 3,
    acapella: 3,
    vocalout: 2,
    instrumentalin: 2,
  },
  ease: {
    long: 10,
    reverb: 8,
    crossover: 7,
    blend: 5,
    fade: 4,
    breakswap: 3,
    bass: 1,
    echo: 1,
    filter: 0,
    loop: -2,
    cut: -8,
    dropswap: -8,
    filterin: 8,
    brake: 2,
    roll: -4,
    fakedrop: -6,
    doubledrop: -6,
    backspin: -6,
    vocalout: 4,
    acapella: 4,
    instrumentalin: 2,
    stembass: 1,
    drumswap: -2,
  },
  maintain: {
    bass: 6,
    blend: 5,
    long: 4,
    breakswap: 4,
    filter: 2,
    loop: 2,
    dropswap: 1,
    echo: 0,
    crossover: -1,
    fade: -1,
    reverb: -2,
    cut: -3,
    filterin: 3,
    doubledrop: 2,
    roll: 0,
    fakedrop: 0,
    brake: -4,
    backspin: -4,
    stembass: 6,
    vocalout: 4,
    instrumentalin: 4,
    acapella: 2,
    drumswap: 2,
  },
}

/** Small tie-breaker: with a beatmatch available, routines that use it lead. */
function routineBias(id: string, canMatch: boolean) {
  const matched: Record<string, number> = {
    bass: 4,
    long: 3,
    blend: 3,
    breakswap: 3,
    filter: 2,
    dropswap: 2,
    loop: 1,
    echo: -1,
    reverb: -3,
    fade: -3,
    cut: -3,
    crossover: -4,
    doubledrop: 2,
    filterin: 2,
    fakedrop: 1,
    roll: -1,
    brake: -4,
    backspin: -4,
    stembass: 4,
    vocalout: 3,
    instrumentalin: 3,
    acapella: 2,
    drumswap: 2,
  }
  const free: Record<string, number> = {
    echo: 4,
    cut: 3,
    crossover: 3,
    dropswap: 2,
    fade: 2,
    reverb: 1,
    brake: 3,
    backspin: 2,
    fakedrop: 2,
  }
  return (canMatch ? matched : free)[id] ?? 0
}

/**
 * Fit with the arrangement at the chosen points: a quiet DJ intro invites a
 * layered blend; an incoming track that starts at full energy, or an
 * outgoing one still at full energy, calls for a short or FX exit.
 */
function arrangementFit(
  execution: Transition["execution"],
  exit: number | null,
  entry: number | null
) {
  const layered = ["blend", "bass", "long", "filter", "loop"].includes(
    execution
  )
  const quick = ["cut", "echo"].includes(execution)
  let fit = 0
  if (entry !== null) {
    if (entry < 0.55 && layered) fit += 4
    if (entry > 0.8)
      fit += execution === "long" ? -8 : layered ? -5 : quick ? 5 : 0
  }
  if (exit !== null) {
    if (exit > 0.8)
      fit +=
        execution === "long"
          ? -6
          : quick || execution === "filter"
            ? 3
            : layered
              ? -3
              : 0
    if (exit < 0.45 && ["blend", "bass", "long"].includes(execution)) fit += 2
  }
  return fit
}

/** The strongest reasons behind a score, e.g. "Energy goal +10 · Vocals −9". */
export function scoreSummary(plan: Transition, count = 2) {
  const parts = plan.scoreParts ?? []
  const ups = parts
    .filter((p) => p.value >= 2)
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
  const down = parts
    .filter((p) => p.value <= -2)
    .sort((a, b) => a.value - b.value)
    .slice(0, 1)
  return [...ups, ...down]
    .map(
      (p) =>
        `${p.label} ${p.value > 0 ? "+" : "−"}${Math.abs(Math.round(p.value))}`
    )
    .join(" · ")
}

/** Sum labelled score parts into a 1–98 score. */
function total(parts: { label: string; value: number }[], cap = 98) {
  return Math.round(
    Math.min(cap, Math.max(1, 60 + parts.reduce((sum, p) => sum + p.value, 0)))
  )
}

export function transitionSteps(
  execution: Transition["execution"],
  swapAt = execution === "long" ? 0.75 : 0.5
): Transition["steps"] {
  const step = (at: number, label: string, why: string) => ({ at, label, why })
  switch (execution) {
    case "long":
      return [
        step(
          0,
          "Introduce percussion",
          "Raise the incoming channel with LOW and MID reduced; gently restore HI."
        ),
        step(
          0.25,
          "Exchange highs",
          "Reduce outgoing HI as incoming percussion becomes clear."
        ),
        step(
          0.4,
          "Exchange mids",
          "Restore incoming MID while reducing the outgoing melody."
        ),
        step(
          swapAt,
          "Exchange basslines",
          "Lower outgoing LOW before restoring incoming LOW on the selected phrase boundary."
        ),
        step(
          Math.min(0.95, swapAt + 0.04),
          "Close the outgoing channel",
          "Lower the outgoing channel fader and reset its EQ only after it is silent."
        ),
      ]
    case "fade":
      return [
        step(
          0,
          "Open the incoming channel",
          "Keep the crossfader centered and raise the incoming channel fader."
        ),
        step(
          0.5,
          "Exchange channel levels",
          "A smooth equal-power channel-fader exchange maintains level; EQ stays unchanged."
        ),
        step(
          0.85,
          "Close the outgoing channel",
          "Leave the incoming channel open as the outgoing fader reaches zero."
        ),
      ]
    case "bass":
      return [
        step(
          0,
          "Introduce percussion",
          "Incoming LOW is cut so the outgoing bass anchors the groove."
        ),
        step(
          swapAt,
          "Exchange basslines",
          "Remove the old bass before restoring the new one on the selected phrase boundary."
        ),
        step(
          0.85,
          "Release the outgoing track",
          "Let the new groove become dominant before completing the handoff."
        ),
      ]
    case "filter":
      return [
        step(
          0,
          "Introduce the next groove",
          "Incoming LOW stays down during the first half."
        ),
        step(
          swapAt,
          "Remove outgoing low end",
          "A gradual high-pass sweep makes space for the incoming bass."
        ),
        step(
          0.85,
          "Complete the handoff",
          "A restrained sweep avoids an abrupt loss of energy."
        ),
      ]
    case "loop":
      return [
        step(
          0,
          "Hold a four-beat groove",
          "A quantized outgoing loop holds a stable rhythm while the new track plays forward."
        ),
        step(
          swapAt,
          "Exchange basslines",
          "Only one full bassline anchors the blend."
        ),
        step(
          0.85,
          "Release the loop",
          "Remove the repeating groove once the new arrangement takes over."
        ),
      ]
    case "echo":
      return [
        step(
          0,
          "Catch the outgoing hit",
          "A tempo-synchronized one-beat echo carries the ending."
        ),
        step(
          0.25,
          "Launch the new track",
          "The dry source leaves quickly; its tail bridges the tempo or genre change."
        ),
        step(
          0.7,
          "Let the tail decay",
          "Stop feeding the echo so it does not muddy the new groove."
        ),
      ]
    case "reverb":
      return [
        step(
          0,
          "Create a short room tail",
          "High-pass the outgoing send to limit kick and bass in the reverb."
        ),
        step(
          0.25,
          "Bring in the next track",
          "An atmospheric tail connects the change without a long rhythmic overlap."
        ),
        step(
          0.7,
          "Clear the space",
          "Stop the send and let the finite tail fade."
        ),
      ]
    case "cut":
      return [
        step(
          0,
          "Cut on the downbeat",
          "A brief anti-click gain change keeps the handoff decisive with almost no overlap."
        ),
      ]
    default:
      return [
        step(
          0,
          "Start on the phrase",
          "Musical changes line up instead of arriving at random moments."
        ),
        step(
          0.5,
          "Pass the focus",
          "A smooth channel-fader exchange passes the focus with the crossfader centered."
        ),
        step(
          0.85,
          "Complete the handoff",
          "Listen for competing vocals or melodies even when keys and tempos fit."
        ),
      ]
  }
}
// Prefer an eight-bar phrase; shortened or off-grid cue plans use a bar boundary.
export function bassExchangeAt(
  start: number,
  duration: number,
  bpm: number,
  offset: number,
  long = false
) {
  const desired = start + duration * (long ? 0.75 : 0.5)
  for (const beats of [32, 4]) {
    const grid = (beats * 60) / bpm
    const point = offset + Math.round((desired - offset) / grid) * grid
    const progress = (point - start) / duration
    if (progress >= (long ? 0.6 : 0.25) && progress <= 0.85) return progress
  }
  return long ? 0.75 : 0.5
}

const energyProfiles = new WeakMap<
  number[],
  { sum: number[]; count: number[]; peak: number }
>()
export function sectionEnergy(track: Track, position: number, length: number) {
  const curve = track.analysis?.energyCurve
  if (!curve?.length) return null
  let profile = energyProfiles.get(curve)
  if (!profile) {
    profile = { sum: [0], count: [0], peak: 0.0001 }
    for (const value of curve) {
      const finite = Number.isFinite(value)
      profile.sum.push(profile.sum.at(-1)! + (finite ? Math.max(0, value) : 0))
      profile.count.push(profile.count.at(-1)! + (finite ? 1 : 0))
      if (finite) profile.peak = Math.max(profile.peak, value)
    }
    energyProfiles.set(curve, profile)
  }
  const start = Math.max(0, Math.min(curve.length, Math.floor(position)))
  const end = Math.max(
    start,
    Math.min(curve.length, Math.ceil(position + length))
  )
  const count = profile.count[end] - profile.count[start]
  return count
    ? (profile.sum[end] - profile.sum[start]) / count / profile.peak
    : null
}
const energyAt = sectionEnergy

/**
 * Beatgrid trust for a track: 1 when the DJ set the grid by hand, the
 * analysis estimate otherwise, null when unknown (older analyses).
 */
export function gridTrust(track: Track) {
  if (track.grid) return 1
  return track.analysis?.gridConfidence ?? null
}

/** The key (Camelot) around a time: its section's key when analysis found
 * one with some confidence, the whole-track key otherwise. */
export function keyAt(track: Track, time: number) {
  if (track.keyOverride) return track.camelot
  const section = track.analysis?.keySections?.find(
    (s) => time >= s.start && time < s.end && s.confidence >= 0.3
  )
  return section?.camelot ?? track.camelot
}

/** Where 16-bar phrases start: a corrected grid wins, then the detected
 * phrase alignment, then the first beat. */
export function phraseOrigin(track: Track) {
  return track.grid
    ? gridOffset(track)
    : (track.analysis?.phraseOffset ?? gridOffset(track))
}

/** Mean vocal/lead presence over a span; null when not analyzed. */
export function vocalAt(track: Track, start: number, length: number) {
  const curve = track.analysis?.vocals
  if (!curve?.length) return null
  const from = Math.max(0, Math.floor(start)),
    to = Math.min(curve.length, Math.max(from + 1, Math.ceil(start + length)))
  let sum = 0
  for (let i = from; i < to; i++) sum += curve[i]
  return to > from ? sum / (to - from) : 0
}

/**
 * How much foreground voice/lead plays over the other during a transition:
 * mean of outgoing × incoming presence across the overlap (0–1).
 */
export function vocalClash(
  out: Track,
  outStart: number,
  incoming: Track,
  inStart: number,
  duration: number,
  rate: number
) {
  const a = out.analysis?.vocals,
    b = incoming.analysis?.vocals
  if (!a?.length || !b?.length) return null
  const at = (curve: number[], time: number) =>
    curve[Math.max(0, Math.min(curve.length - 1, Math.floor(time)))] ?? 0
  const steps = Math.max(1, Math.round(duration))
  let sum = 0
  for (let k = 0; k < steps; k++)
    sum += at(a, outStart + k) * at(b, inStart + k * rate)
  // Cuts and one-beat FX exits barely overlap: count a fraction.
  return (sum / steps) * Math.min(1, duration / 2)
}

/** Phrase lines plus detected arrangement changes between two times. */
function candidateStarts(
  track: Track,
  origin: number,
  phrase: number,
  from: number,
  to: number
) {
  const times: number[] = []
  for (
    let t = origin + Math.ceil((from - origin) / phrase) * phrase;
    t <= to;
    t += phrase
  )
    times.push(t)
  for (const section of track.analysis?.sections ?? [])
    if (section >= from && section <= to) times.push(section)
  return [...new Set(times.map((t) => Math.round(t * 1000) / 1000))].sort(
    (x, y) => x - y
  )
}

/** End of the last 16-bar phrase that reaches ~75% of the track's loudest
 * phrase: everything after it is outro. 0 when loudness is unknown. */
export function lastLoudPhraseEnd(
  track: Track,
  offset: number,
  phrase: number
) {
  if (!track.analysis?.energyCurve.length || phrase <= 0) return 0
  const levels: [number, number][] = []
  for (let t = offset; t < track.duration; t += phrase) {
    const level = energyAt(track, t, Math.min(phrase, track.duration - t))
    if (level !== null) levels.push([t, level])
  }
  const peak = Math.max(0, ...levels.map(([, level]) => level))
  const last = levels.filter(([, level]) => level >= peak * 0.75).at(-1)
  return last ? Math.min(track.duration, last[0] + phrase) : 0
}
/**
 * Where a DJ would aim to leave the outgoing track, counted from `position`
 * (where it started playing). Club DJs rarely play extended mixes to the
 * end: they ride the first or second drop, then mix out as it finishes, so
 * the next track's energy takes over. null = play to the outro.
 */
export function exitTarget(
  track: Track,
  position: number,
  pace: MixPace,
  latest: number
): number | null {
  if (pace === "full") return null
  const bar = 240 / (track.bpm || 120)
  const minimum = position + (pace === "quick" ? 30 : 60)
  const drops = labelSections(track).filter(
    (s) => s.label === "drop" && s.end - bar * 8 > position && s.end >= minimum
  )
  const pick = pace === "quick" ? drops.at(0) : (drops.at(1) ?? drops.at(0))
  const remaining = Math.max(0, track.duration - position)
  const fallback =
    position +
    (pace === "quick"
      ? Math.min(90, Math.max(45, remaining * 0.3))
      : Math.min(180, Math.max(75, remaining * 0.5)))
  // A drop that runs for minutes (flat masters, one long groove) would keep
  // the track on to its outro: cap the play time like a DJ watching the
  // clock (about 1½ minutes quick, 3 minutes DJ pace).
  const cap = position + (pace === "quick" ? 90 : 180)
  return Math.min(
    latest,
    Math.max(minimum, Math.min(cap, pick?.end ?? fallback))
  )
}

export function planTransitions(
  out: Track,
  incoming: Track,
  position = 0,
  options: Options = {}
): Transition[] {
  if (
    !Number.isFinite(out.duration) ||
    !Number.isFinite(incoming.duration) ||
    out.duration < 0.1 ||
    incoming.duration < 0.1
  )
    return []
  position = Math.max(0, Number.isFinite(position) ? position : 0)
  if (position >= out.duration - 0.08) return []
  const outCue = options.outCue ?? null,
    inCue = options.inCue ?? null
  if (
    (outCue !== null &&
      (!Number.isFinite(outCue) ||
        outCue < position ||
        outCue >= out.duration - 0.02)) ||
    (inCue !== null &&
      (!Number.isFinite(inCue) ||
        inCue < 0 ||
        inCue >= incoming.duration - 0.02))
  )
    return []
  const outRate = Math.max(0.84, Math.min(1.16, options.outRate ?? 1)),
    existingInRate = Math.max(0.84, Math.min(1.16, options.incomingRate ?? 1))
  const bpm = out.bpm && out.bpm > 0 ? out.bpm : 120,
    beat = 60 / bpm,
    phrase = beat * 64
  const tempoKnown =
    !!out.bpm && out.bpm > 0 && !!incoming.bpm && incoming.bpm > 0
  const profile = pairProfile(out, incoming)
  // Tempo journey: beatmatch directly, at half/double time (174 ↔ 87), or
  // ride the outgoing deck toward the incoming tempo before the blend. How
  // far a track may be stretched follows the style (vocals expose it most).
  const fits = (r: number) =>
    Math.abs(r / existingInRate - 1) <= profile.maxStretch + 1e-9 &&
    r >= 0.84 &&
    r <= 1.16
  const relationFor = (r: number): 1 | 2 | 0.5 | null =>
    !tempoKnown
      ? null
      : (([1, 2, 0.5] as const).find((m) =>
          r === 0 ? false : fits((bpm / (incoming.bpm! * m)) * r)
        ) ?? null)
  let multiple = relationFor(outRate) ?? 1,
    mixOutRate = outRate,
    tempoRamp: Transition["tempoRamp"] = undefined
  if (
    tempoKnown &&
    relationFor(outRate) === null &&
    options.allowRamp !== false
  )
    for (const m of [1, 2, 0.5] as const) {
      const full = (existingInRate * incoming.bpm! * m) / bpm
      if (full < 0.84 || full > 1.16 || Math.abs(full / outRate - 1) > 0.16)
        continue
      // Meet partway: the incoming deck takes up to half its style's
      // stretch, the outgoing deck rides the rest, so neither is obvious.
      const share = profile.maxStretch / 2
      const partway = full * (full > outRate ? 1 - share : 1 + share)
      const meet = Math.abs(partway - outRate) < Math.abs(full - outRate)
      const to = meet ? partway : full
      const change = Math.abs(to - outRate) * bpm
      const bars = Math.min(
        64,
        Math.max(8, Math.ceil(change / profile.rampBpmPerBar / 4) * 4)
      )
      tempoRamp = { from: outRate, to, bars, start: 0, meet }
      multiple = m
      mixOutRate = to
      break
    }
  const ratio = tempoKnown ? bpm / (incoming.bpm! * multiple) : 1,
    targetRate = ratio * mixOutRate
  const canMatch = tempoKnown && fits(targetRate)
  const rampLength = tempoRamp ? tempoRamp.bars * 4 * beat : 0
  // Keys as heard: tempo moves pitch unless key lock is on, plus any key
  // shift. Only the pitch of one deck against the other matters.
  const outKey = options.outKey ?? { shift: 0, lock: false },
    inKey = options.inKey ?? { shift: 0, lock: false }
  const inRateHeard = canMatch ? targetRate : existingInRate
  const relative =
    (inKey.lock ? 0 : 12 * Math.log2(inRateHeard)) +
    inKey.shift -
    ((outKey.lock ? 0 : 12 * Math.log2(mixOutRate)) + outKey.shift)
  // Uncertain key estimates count less: pull them toward "unknown" (0.5).
  // A key you set by hand is certain.
  const keyConfidence = (track: Track) =>
    track.keyOverride ? 1 : (track.analysis?.confidence ?? 0.4)
  const keyTrust = Math.min(
    1,
    keyConfidence(out) / 0.4,
    keyConfidence(incoming) / 0.4
  )
  const intent = options.intent ?? "maintain"
  /** How two keys (Camelot) sit together as heard. */
  const keyFit = (outCamelot: string | null, inCamelot: string | null) => {
    const heard = heardKeys(outCamelot, inCamelot, relative)
    const move =
      intent === "lift" && heard.out && heard.in
        ? energyBoostMove(heard.out, heard.in)
        : null
    return {
      keys: heard,
      boost: move,
      harmonic:
        0.5 +
        ((move
          ? 0.8
          : // Slightly detuned (15–35 cents) still blends; further apart, not.
            Math.abs(heard.cents) > 35
            ? 0.3
            : heard.compatibility - (heard.detuned ? 0.1 : 0)) -
          0.5) *
          keyTrust,
    }
  }
  // Whole-track keys decide which routines are possible; each plan then
  // judges the keys of the sections that actually overlap.
  const { keys, harmonic } = keyFit(out.camelot, incoming.camelot)
  const pitchChanges = canMatch && Math.abs(relative) > 0.05
  const keyTip =
    keys.out && keys.in && harmonic < 0.5
      ? keyShiftTip(keys.out, keys.in)
      : null
  const offset = Math.max(0, phraseOrigin(out)),
    entry = inCue ?? Math.max(0, phraseOrigin(incoming))
  const vocalsKnown =
    !!out.analysis?.vocals?.length && !!incoming.analysis?.vocals?.length
  // A shaky beatgrid drifts over long overlaps: keep blends short.
  const trust = [gridTrust(out), gridTrust(incoming)].filter(
    (v): v is number => v !== null
  )
  const shakyGrid = trust.length > 0 && Math.min(...trust) < 0.5
  const pace = options.pace ?? "full"
  const energyDelta = ((incoming.energy ?? 5) - (out.energy ?? 5)) / 10
  const energyFit =
    1 -
    Math.min(
      1,
      Math.abs(
        energyDelta - (intent === "lift" ? 0.2 : intent === "ease" ? -0.2 : 0)
      )
    )
  const planned = definitions
    .filter(
      (d) =>
        (!d.needsTempo || canMatch) &&
        (d.id !== "long" ||
          (!shakyGrid &&
            harmonic >= 0.8 &&
            profile.longBars !== null &&
            multiple === 1 &&
            pace !== "quick"))
    )
    .flatMap((d): Transition[] => {
      const lesson = techniques.find((t) => t.id === d.lesson)!,
        match = d.needsTempo || (d.execution === "fade" && canMatch)
      const incomingRate = match ? targetRate : existingInRate,
        rate = incomingRate / mixOutRate
      // Blend lengths follow the genre (house 16, techno 32, DnB 16, hip-hop
      // 8 …); half/double-time pairings stay short.
      const styleBars =
        d.id === "long"
          ? (profile.longBars ?? d.bars)
          : ["blend", "bass", "harmonic"].includes(d.id)
            ? profile.blendBars
            : d.bars
      // Quick sets swap tracks fast: overlaps stay at 8 bars or less.
      const paceBars = pace === "quick" ? Math.min(styleBars, 8) : styleBars
      const requested =
        d.execution === "cut"
          ? 0.08 * mixOutRate
          : Math.min(
              (d.execution === "fade" && match ? 8 : paceBars) * 4 * beat,
              match && multiple !== 1 ? 8 * 4 * beat : Infinity
            )
      let duration = Math.min(
        requested,
        out.duration - (outCue ?? position) - 0.02,
        (incoming.duration - entry - 0.02) / rate
      )
      if (duration <= 0.02) return []
      if (match && duration < beat * 8) return []
      if (match && duration >= beat * 8)
        duration = Math.floor(duration / (beat * 8)) * beat * 8
      const latest = Math.max(position, out.duration - duration - 0.02)
      const target = exitTarget(out, position, pace, latest)
      const earliest = Math.max(
        position + (match ? rampLength : 0),
        target === null
          ? out.duration * 0.55
          : Math.min(target - phrase * 2, latest)
      )
      // Shorter paces keep the exit near the target: penalties for vocals
      // or drops may move it by a phrase, never back to the outro.
      const exitLatest =
        target === null
          ? latest
          : Math.max(
              earliest,
              Math.min(latest, target + phrase * (pace === "quick" ? 0.5 : 1))
            )
      const inLength = duration * rate
      const short = duration < beat * 8
      // Outro first: leave after the last high-energy phrase, so the mix
      // never cuts a final drop and never exits on a mid-track breakdown.
      // Instrumental stretches are preferred on both sides.
      // With a shorter pace, aim for the end of the chosen drop instead:
      // mixing out there hands the next drop to the incoming track.
      const loudEnd = lastLoudPhraseEnd(out, offset, phrase)
      const exitCost = (t: number) =>
        (target === null
          ? (t < loudEnd ? 1 + ((loudEnd - t) / out.duration) * 3 : 0) +
            ((latest - t) / out.duration) * 0.6
          : (Math.abs(t - target) / phrase) * 0.5) +
        (energyAt(out, t, Math.min(duration, phrase)) ?? 0.5) * 0.35 +
        (vocalAt(out, t, duration) ?? 0) * 0.8 +
        // Never start a blend over the outgoing drop or chorus.
        (short ? 0 : overlapWith(out, "drop", t, duration) * 1.5)
      const fallbackExit = Math.max(
        position,
        offset + Math.floor((exitLatest - offset) / phrase) * phrase
      )
      const exits =
        outCue !== null
          ? [{ t: outCue, cost: 0 }]
          : candidateStarts(out, offset, phrase, earliest, exitLatest)
              .map((t) => ({ t, cost: exitCost(t) }))
              .sort((x, y) => x.cost - y.cost)
              .slice(0, 6)
      const firstEntry = Math.max(
        0,
        Math.min(entry, incoming.duration - inLength - 0.02)
      )
      const entryCost = (t: number) =>
        (energyAt(incoming, t, inLength) ?? 1) +
        (t / incoming.duration) * 0.15 +
        (vocalAt(incoming, t, inLength) ?? 0) * 0.8
      // Song-based tracks have no DJ intro: short exits enter at the hook.
      const hook =
        profile.songMode && short && inCue === null
          ? labelSections(incoming).find((s) => s.label === "drop")
          : undefined
      // Mid-track entries: start the incoming build so its drop lands as the
      // blend finishes, the way DJs skip long extended-mix intros.
      const landings =
        pace !== "full" && inCue === null && match && !short
          ? labelSections(incoming)
              .filter((s) => s.label === "drop")
              .slice(0, 2)
              .map((s) => s.start - inLength)
              // Skip an intro, not half the track.
              .filter(
                (t) =>
                  t > firstEntry + 1 &&
                  t <= Math.min(incoming.duration * 0.35, 100)
              )
          : []
      const entries = hook
        ? [
            { t: hook.start, cost: entryCost(hook.start) - 0.6 },
            { t: firstEntry, cost: entryCost(firstEntry) },
          ]
        : inCue === null && match && incoming.analysis?.energyCurve.length
          ? [
              firstEntry,
              ...candidateStarts(
                incoming,
                entry,
                (60 / incoming.bpm!) * 64,
                entry + 0.01,
                Math.min(
                  incoming.duration * (pace === "full" ? 0.2 : 0.35),
                  pace === "full" ? 60 : 100,
                  incoming.duration - inLength
                )
              ),
            ]
              .map((t) => ({ t, cost: entryCost(t) }))
              .concat(
                landings.map((t) => ({ t, cost: entryCost(t) * 0.5 - 0.35 }))
              )
              .sort((x, y) => x.cost - y.cost)
              .slice(0, 4)
          : [{ t: firstEntry, cost: 0 }]
      // Choose the pair together: the cheapest exit and entry can still put
      // two voices on top of each other.
      let outStart = fallbackExit,
        inStart = firstEntry,
        bestCost = Infinity
      for (const exit of exits)
        for (const enter of entries) {
          const clash =
            vocalClash(out, exit.t, incoming, enter.t, duration, rate) ?? 0
          const cost = exit.cost + enter.cost + clash * 3
          if (cost < bestCost) {
            bestCost = cost
            outStart = exit.t
            inStart = enter.t
          }
        }
      outStart = outCue ?? Math.min(exitLatest, outStart)
      // Keys of the overlapping sections, when analysis found per-section keys.
      const fit = keyFit(
        keyAt(out, outStart + duration / 2),
        keyAt(incoming, inStart + inLength / 2)
      )
      const clash = vocalClash(out, outStart, incoming, inStart, duration, rate)
      // What an 8-bar blend at these points would stack: short exits earn
      // that back, because they avoid the overlap a blend would cause.
      const risk =
        vocalClash(out, outStart, incoming, inStart, beat * 32, rate) ?? 0
      if (match && tempoRamp && outStart < position + rampLength - 0.01)
        return []
      const exitEnergy = energyAt(out, outStart, duration)
      const cueBeatDifference = tempoKnown
        ? ((inStart - gridOffset(incoming)) * incoming.bpm!) / 60 -
          ((outStart - offset) * bpm) / 60
        : 0
      const cuePhaseError = Math.abs(
        cueBeatDifference - Math.round(cueBeatDifference / 4) * 4
      )
      const cuePhaseWarning =
        match && (outCue !== null || inCue !== null) && cuePhaseError > 0.05
          ? `Selected cues differ by ${cuePhaseError.toFixed(2)} beats within the bar. Audition them, choose phrase cues, or use a cut / FX exit.`
          : undefined
      const genreMatch = lesson.genres.some(
        (g) =>
          g !== "All genres" &&
          [out.genre, incoming.genre].some((genre) =>
            genre.toLowerCase().includes(g.toLowerCase())
          )
      )
      const genreFit = genreMatch || lesson.genres.includes("All genres")
      const longOverlap = match && duration > beat * 32,
        repeated = options.recent?.slice(-3).includes(d.id) ? 9 : 0
      const keySafe =
        blendFamily.includes(d.id) &&
        match &&
        duration >= beat * 32 &&
        fit.harmonic >= 0.9 &&
        !fit.boost &&
        !!out.camelot &&
        !!incoming.camelot &&
        !fit.keys.detuned
      const entryEnergy = energyAt(incoming, inStart, inLength)
      const scoreParts = [
        { label: "Routine", value: routineBias(d.id, canMatch) },
        {
          label: "Energy goal",
          value:
            (intentFit[intent][d.id] ?? 0) +
            // Quick sets favour fast handovers: echo outs and cuts.
            (pace === "quick" && ["cut", "echo"].includes(d.id) ? 6 : 0),
        },
        { label: "Energy match", value: energyFit * 6 },
        {
          // The lesson's own genre fit already rewards suitable styles;
          // the profile then only penalises what the style avoids.
          label: "Genre",
          value:
            (genreMatch ? 6 : genreFit ? 3 : 0) +
            (genreFit
              ? Math.min(0, profileBonus(profile, d.id))
              : profileBonus(profile, d.id)),
        },
        {
          label: "Arrangement",
          value:
            arrangementFit(d.execution, exitEnergy, entryEnergy) -
            (d.execution === "reverb" && (exitEnergy ?? 0.5) > 0.65 ? 12 : 0) -
            (!short && duration < requested - 0.001 ? 6 : 0),
        },
        {
          label: "Beatgrid",
          value: !shakyGrid
            ? 0
            : match && duration > beat * 32
              ? -6
              : ["echo", "cut", "fade", "reverb"].includes(d.execution)
                ? 3
                : 0,
        },
        {
          label: "Keys",
          value:
            (longOverlap ? (fit.harmonic - 0.5) * 10 * profile.keyWeight : 0) +
            (keySafe ? 2 : 0) +
            (fit.boost && longOverlap ? 3 : 0) -
            (fit.keys.detuned && longOverlap ? 5 : 0),
        },
        {
          // Two voices or leads at once: long blends suffer most. Short
          // exits earn back the clash a blend here would cause.
          label: "Vocals",
          value:
            -(clash ?? 0) *
              profile.vocalWeight *
              (duration >= beat * 32 ? 30 : duration >= beat * 8 ? 14 : 3) +
            (short ? risk * 28 : 0),
        },
        { label: "Variety", value: -repeated },
      ]
        .map((part) => ({ ...part, value: Math.round(part.value * 10) / 10 }))
        .filter((part) => part.value !== 0)
      const score = total(scoreParts)
      const warnings = [
        ...(cuePhaseWarning ? [cuePhaseWarning] : []),
        ...(shakyGrid && match && duration > beat * 32
          ? [
              "The beatgrid looks unsteady: a long overlap may drift. Check the grid or choose a short exit.",
            ]
          : []),
        ...(!tempoKnown
          ? [
              "Tempo unknown: FX timing and phrase zones use a provisional 120 BPM grid.",
            ]
          : !canMatch
            ? [
                "Tempo gap exceeds an 8% adjustment or the deck’s pitch range; no forced beatmatch.",
              ]
            : []),
        ...(pitchChanges && match && fit.keys.detuned
          ? [
              `Tempo change shifts pitch: the incoming track sounds about ${Math.abs(fit.keys.cents)} cents off the outgoing one. Keep melodic overlap short, or turn on key lock.`,
            ]
          : pitchChanges && match && fit.keys.in !== incoming.camelot
            ? [
                `Tempo change shifts pitch: the incoming key sounds as ${fit.keys.in}. Turn on key lock to keep ${incoming.camelot}.`,
              ]
            : []),
        ...(!out.camelot || !incoming.camelot
          ? ["Key analysis is incomplete. Listen for melody clashes."]
          : fit.harmonic < 0.8 && longOverlap
            ? [
                "Source keys are distant: reduce melodic overlap. A mix may still work by ear.",
              ]
            : []),
        ...(d.execution === "loop" &&
        (vocalAt(out, outStart, beat * 4) ?? 0) >= 0.35
          ? [
              "The looped bar carries a vocal or lead; a repeating voice is obvious. Audition it first.",
            ]
          : []),
        ...(d.execution === "reverb"
          ? [
              "Use sparingly on active drums; bass is filtered but arrangement still needs listening.",
            ]
          : []),
        ...(duration < requested - 0.001
          ? [
              "Limited space: this routine is shortened. Consider a cut or FX exit.",
            ]
          : []),
        ...(clash !== null && clash >= 0.2
          ? [
              `Vocals or lead melodies overlap in about ${Math.round(clash * 100)}% of this mix. Keep it short, or cut the incoming mids until the outgoing vocal ends.`,
            ]
          : []),
        vocalsKnown
          ? "Vocal and phrase detection are estimates; listen to the overlap."
          : "Phrase zones are estimates. Vocal detection runs after analysis.",
      ]
      const bassSwapAt = ["bass", "long", "filter", "loop"].includes(
        d.execution
      )
        ? bassExchangeAt(
            outStart,
            duration,
            bpm,
            offset,
            d.execution === "long"
          )
        : undefined
      return [
        {
          id: d.id,
          name: d.id === "blend" ? "Phrase blend" : lesson.name,
          description: lesson.why,
          labels: lesson.labels,
          difficulty: lesson.level,
          execution: d.execution,
          bars:
            d.bars === 0 ? 0 : Math.round((duration / (beat * 4)) * 10) / 10,
          duration,
          outStart,
          inStart,
          score,
          scoreParts,
          keySafe,
          beatmatch: match,
          rate,
          incomingRate,
          anchors: { out: outCue, incoming: inCue },
          cuePhaseWarning,
          vocalClash: clash,
          genre: profile.label,
          crossGenre: profile.crossGenre,
          tempoRelation: match ? multiple : 1,
          tempoRamp:
            match && tempoRamp
              ? { ...tempoRamp, start: outStart - rampLength }
              : undefined,
          pace,
          reasons: [
            match
              ? `Matches effective tempo at ${(bpm * mixOutRate).toFixed(1)} BPM`
              : "Native tempos retained; brief overlap avoids rhythmic conflict",
            ...(match && tempoRamp
              ? [
                  `Tempo ramp: deck rides ${(bpm * tempoRamp.from).toFixed(1)} → ${(bpm * tempoRamp.to).toFixed(1)} BPM over ${tempoRamp.bars} bars before the mix${tempoRamp.meet ? "; the incoming deck meets it partway" : ""}`,
                ]
              : []),
            ...(match && multiple !== 1
              ? [
                  `${multiple === 2 ? "Half-time" : "Double-time"} mix: ${incoming.bpm} BPM locks to ${(bpm * mixOutRate).toFixed(1)} at ${multiple === 2 ? "half" : "double"} speed`,
                ]
              : []),
            profile.crossGenre
              ? `Genre jump ${profile.label}: bridging transitions preferred`
              : `Style: ${profile.label} (${profile.blendBars}-bar blends)`,
            out.camelot && incoming.camelot
              ? `${fit.keys.out} → ${fit.keys.in}${fit.keys.in !== incoming.camelot ? ` (heard; source ${incoming.camelot})` : ""}: ${fit.boost ? `energy-boost key move (${fit.boost})` : keySafe ? "key-safe harmonic blend" : fit.keys.detuned && match ? "detuned by the tempo change" : fit.harmonic >= 0.8 ? "keys compatible" : "favor less melodic overlap"}`
              : "Keys unverified; audition the overlap",
            ...(keyTip && longOverlap
              ? [
                  `Tip: a ${keyTip > 0 ? "+1" : "−1"} key shift on the incoming deck makes the keys compatible`,
                ]
              : []),
            outCue !== null
              ? "Uses your selected outgoing cue"
              : target !== null
                ? `Mixes out at ${formatClock(outStart)} as the drop ends (${pace === "quick" ? "quick" : "DJ"} pace), so the next track takes over the energy`
                : exitEnergy !== null
                  ? outStart >= lastLoudPhraseEnd(out, offset, phrase)
                    ? "Exits in the outro, after the last high-energy phrase"
                    : "No clear outro; exits as late as the routine allows"
                  : "Exit estimated on the 16-bar grid",
            genreFit
              ? `Technique suits ${out.genre} / ${incoming.genre}`
              : "Choose by arrangement and listening, alongside genre",
            `Energy goal: ${intent}${repeated ? "; recent repeats ranked lower" : ""}`,
            short && risk >= 0.2
              ? `Short exit avoids a vocal clash: a blend here would overlap about ${Math.round(risk * 100)}%`
              : clash === null
                ? "Vocal overlap unknown until both tracks are analyzed"
                : clash < 0.08
                  ? "No vocal overlap: the blend sits on instrumental parts"
                  : `Vocal overlap about ${Math.round(clash * 100)}%`,
            ...(inCue !== null
              ? [
                  "Uses your selected incoming cue; audition phrasing before starting",
                ]
              : landings.includes(inStart)
                ? [
                    `Skips the intro: enters at ${formatClock(inStart)} so the incoming drop lands as the blend ends`,
                  ]
                : []),
          ],
          warnings,
          bassSwapAt,
          steps: transitionSteps(d.execution, bassSwapAt),
        },
      ]
    })
    .concat(
      structuralTransitions(out, incoming, position, {
        outCue,
        inCue,
        bpm,
        beat,
        canMatch,
        targetRate,
        existingInRate,
        mixOutRate,
        multiple,
        harmonic,
        intent,
        profile,
        firstEntry: Math.max(0, entry),
        tempoRamp,
        rampLength,
        pace,
        energyFit,
        recent: options.recent ?? [],
      })
    )
  return planned
    .concat(
      effectRoutines(planned, out, incoming, {
        intent,
        profile,
        beat,
        position,
        recent: options.recent ?? [],
      })
    )
    .concat(
      stemRoutines(planned, out, incoming, {
        intent,
        profile,
        recent: options.recent ?? [],
      })
    )
    .map((plan) => {
      const set = options.setPhase,
        taste = options.taste
      const rating = taste?.ratings?.[ratingKey(plan.genre, plan.id)] ?? 0
      const extra = [
        {
          label: "Set phase",
          value: set ? phaseBonus(plan.id, set.phase, set.used) : 0,
        },
        {
          label: "Saved for this pair",
          value: taste?.saved === plan.id ? 40 : 0,
        },
        { label: "Your ratings", value: Math.max(-9, Math.min(9, rating * 3)) },
      ].filter((part) => part.value !== 0)
      if (!extra.length) return plan
      const scoreParts = [...(plan.scoreParts ?? []), ...extra]
      return {
        ...plan,
        scoreParts,
        score: total(
          scoreParts,
          arrangementRoutines.includes(plan.id) ? 97 : 98
        ),
        reasons:
          taste?.saved === plan.id
            ? ["You saved this transition for this pair", ...plan.reasons]
            : plan.reasons,
      }
    })
    .sort((a, b) => b.score - a.score)
    .map((plan) => {
      // A routine built on an effect keeps it; others get Auto-FX.
      if (plan.fx?.length)
        return {
          ...plan,
          reasons: [...plan.reasons, `Effect: ${describeFX(plan.fx)}`],
        }
      const fx = planFX(plan, out, incoming, {
        amount: options.fx?.amount ?? "off",
        intent,
        recent: options.fx?.recent ?? [],
        room: Math.max(0, plan.outStart - position),
      })
      return fx.length
        ? {
            ...plan,
            fx,
            reasons: [...plan.reasons, `Auto-FX: ${describeFX(fx)}`],
          }
        : plan
    })
}

/**
 * Routines built on an effect, derived from planned exits: the same exit
 * and entry with the effect as the transition (brake, backspin, loop roll
 * on a cut; filter-in on a phrase blend).
 */
function effectRoutines(
  plans: Transition[],
  out: Track,
  incoming: Track,
  c: {
    intent: MixIntent
    profile: ReturnType<typeof pairProfile>
    beat: number
    position: number
    recent: string[]
  }
): Transition[] {
  const cut = plans.find((p) => p.id === "cut"),
    blend = plans.find((p) => p.id === "blend")
  const bar = c.beat * 4
  const tempoDrop = out.bpm && incoming.bpm ? incoming.bpm / out.bpm : 1
  const variant = (
    base: Transition,
    id: string,
    name: string,
    lessonId: string,
    fx: FXCue[],
    why: string,
    arrangement = 0
  ): Transition => {
    const technique = techniques.find((t) => t.id === lessonId)!
    const scoreParts = [
      ...(base.scoreParts ?? []).filter(
        (p) => !["Routine", "Energy goal", "Genre", "Variety"].includes(p.label)
      ),
      { label: "Routine", value: routineBias(id, base.beatmatch) },
      { label: "Energy goal", value: intentFit[c.intent][id] ?? 0 },
      { label: "Genre", value: profileBonus(c.profile, id) },
      { label: "Tempo jump", value: arrangement },
      { label: "Variety", value: c.recent.slice(-3).includes(id) ? -9 : 0 },
    ].filter((p) => p.value !== 0)
    return {
      ...base,
      id,
      name,
      description: why,
      labels: technique.labels,
      difficulty: technique.level,
      fx,
      scoreParts,
      score: total(scoreParts),
    }
  }
  const routines: Transition[] = []
  // A lead-in that has already passed is trimmed when the cues are scheduled.
  if (cut) {
    // A brake hides a big drop in tempo; backspins suit hip-hop and party sets.
    routines.push(
      variant(
        cut,
        "brake",
        "Brake / vinyl stop",
        "brake",
        [
          {
            kind: "brake",
            deck: "out",
            at: -c.beat * 2,
            length: c.beat * 2,
            amount: 1,
            label: "Brake over two beats",
          },
        ],
        "The outgoing record slows to a stop on the downbeat, then the next track starts: a clear reset that hides any tempo change.",
        tempoDrop < 0.84 ? 6 : 0
      ),
      variant(
        cut,
        "backspin",
        "Backspin",
        "backspin",
        [
          {
            kind: "spinback",
            deck: "out",
            at: -c.beat,
            length: c.beat,
            amount: 1,
            label: "Spinback on the last beat",
          },
        ],
        "The outgoing track spins back on the last beat and the next one drops in: a crowd-pleasing reset across any tempo."
      )
    )
    if (out.bpm)
      routines.push(
        variant(
          cut,
          "roll",
          "Loop roll",
          "roll",
          [
            {
              kind: "roll",
              deck: "out",
              at: -bar,
              length: bar,
              amount: 1,
              beats: 1,
              label: "Loop roll 1 → ¼ beat",
            },
          ],
          "A quantized loop on the outgoing track shrinks from one beat to a quarter, building tension before the next track lands."
        )
      )
  }
  if (blend)
    routines.push(
      variant(
        blend,
        "filterin",
        "Filter in",
        "filter",
        [
          {
            kind: "filterIn",
            deck: "in",
            at: 0,
            length: blend.duration * 0.5,
            amount: 1,
            label: "Incoming opens from low-pass",
          },
        ],
        "The next track rises out of a low-pass filter while the outgoing track keeps the groove, so it arrives gradually."
      )
    )
  return routines
}

/**
 * Routines built on stems, derived from planned blends: the same exit and
 * entry, with stem levels moving during the overlap. They need prepared
 * stems on the tracks involved (and loaded on the decks to sound).
 */
function stemRoutines(
  plans: Transition[],
  out: Track,
  incoming: Track,
  c: {
    intent: MixIntent
    profile: ReturnType<typeof pairProfile>
    recent: string[]
  }
): Transition[] {
  const outStems = !!out.stems,
    inStems = !!incoming.stems
  if (!outStems && !inStems) return []
  const blend = plans.find((p) => p.id === "blend"),
    bass = plans.find((p) => p.id === "bass"),
    long = plans.find((p) => p.id === "long")
  const vocal = (track: Track, start: number, length: number) =>
    vocalAt(track, start, length) ?? 0
  const variant = (
    base: Transition,
    id: string,
    name: string,
    lessonId: string,
    stemMoves: StemMove[],
    why: string,
    benefit: number,
    removesClash: boolean,
    steps: Transition["steps"]
  ): Transition => {
    const technique = techniques.find((t) => t.id === lessonId)!
    const scoreParts = [
      ...(base.scoreParts ?? []).filter(
        (p) =>
          !["Routine", "Energy goal", "Genre", "Variety"].includes(p.label) &&
          !(removesClash && p.label === "Vocals")
      ),
      { label: "Routine", value: routineBias(id, base.beatmatch) },
      { label: "Energy goal", value: intentFit[c.intent][id] ?? 0 },
      { label: "Genre", value: profileBonus(c.profile, id) },
      { label: "Stems", value: benefit },
      { label: "Variety", value: c.recent.slice(-3).includes(id) ? -9 : 0 },
    ]
      .map((p) => ({ ...p, value: Math.round(p.value * 10) / 10 }))
      .filter((p) => p.value !== 0)
    return {
      ...base,
      id,
      name,
      description: why,
      labels: technique.labels,
      difficulty: technique.level,
      execution:
        base.execution === "bass" && id !== "instrumentalin"
          ? "blend"
          : base.execution,
      stemMoves,
      vocalClash: removesClash ? 0 : base.vocalClash,
      scoreParts,
      score: total(scoreParts),
      steps,
      reasons: [
        `Uses prepared stems: ${why.charAt(0).toLowerCase()}${why.slice(1)}`,
        ...base.reasons,
      ],
    }
  }
  const step = (at: number, label: string, why: string) => ({ at, label, why })
  const routines: Transition[] = []
  const clashRelief = (base: Transition) =>
    Math.min(14, (base.vocalClash ?? 0) * 40)
  if (outStems && inStems && bass?.beatmatch) {
    const swap = bass.bassSwapAt ?? 0.5
    routines.push(
      variant(
        bass,
        "stembass",
        "Stem bass swap",
        "bass",
        [
          {
            deck: "in",
            stem: "bass",
            from: 0,
            to: 1,
            start: swap - 0.01,
            end: swap,
          },
          {
            deck: "out",
            stem: "bass",
            from: 1,
            to: 0,
            start: swap,
            end: swap + 0.01,
          },
        ],
        "The basslines swap exactly on the phrase while both kicks and grooves stay full.",
        4,
        false,
        [
          step(
            0,
            "Bring in the groove",
            "The incoming track plays without its bassline."
          ),
          step(
            swap,
            "Swap basslines",
            "The outgoing bass stem drops as the incoming one arrives."
          ),
          step(
            0.85,
            "Hand over",
            "The outgoing track fades out with no bass under it."
          ),
        ]
      )
    )
  }
  if (outStems && blend && vocal(out, blend.outStart, blend.duration) >= 0.25)
    routines.push(
      variant(
        blend,
        "vocalout",
        "Vocal out",
        "vocal",
        [
          { deck: "out", stem: "vocals", from: 1, to: 0, start: 0, end: 0.4 },
          ...(inStems
            ? [
                {
                  deck: "in" as const,
                  stem: "vocals" as const,
                  from: 0,
                  to: 1,
                  start: 0.45,
                  end: 0.6,
                },
              ]
            : []),
        ],
        "The outgoing vocal fades out while the incoming instrumental takes over.",
        clashRelief(blend) + 2,
        true,
        [
          step(
            0,
            "Fade the vocal",
            "The outgoing vocal stem lowers as the next track enters."
          ),
          step(
            0.45,
            "New voice",
            "The incoming vocal arrives only after the old one has gone."
          ),
          step(0.85, "Hand over", "The outgoing instrumental fades out."),
        ]
      )
    )
  if (
    inStems &&
    bass &&
    vocal(incoming, bass.inStart, bass.duration * bass.rate) >= 0.25
  )
    routines.push(
      variant(
        bass,
        "instrumentalin",
        "Instrumental in",
        "vocal",
        [{ deck: "in", stem: "vocals", from: 0, to: 1, start: 0.9, end: 1 }],
        "The incoming track enters without its vocal until the outgoing one has finished.",
        clashRelief(bass) + 2,
        true,
        [
          step(
            0,
            "Instrumental first",
            "The incoming vocal stem stays muted under the outgoing track."
          ),
          step(
            bass.bassSwapAt ?? 0.5,
            "Swap basslines",
            "The incoming bass takes over on the phrase."
          ),
          step(
            0.9,
            "Vocal in",
            "The incoming vocal returns once the outgoing track has gone."
          ),
        ]
      )
    )
  const acapellaBase = long ?? blend
  if (
    outStems &&
    acapellaBase?.beatmatch &&
    acapellaBase.keySafe &&
    vocal(out, acapellaBase.outStart, acapellaBase.duration) >= 0.35
  )
    routines.push(
      variant(
        acapellaBase,
        "acapella",
        "Acapella over",
        "acapella",
        [
          { deck: "out", stem: "drums", from: 1, to: 0, start: 0.05, end: 0.2 },
          { deck: "out", stem: "bass", from: 1, to: 0, start: 0.05, end: 0.2 },
          {
            deck: "out",
            stem: "melody",
            from: 1,
            to: 0,
            start: 0.05,
            end: 0.25,
          },
          ...(inStems
            ? [
                {
                  deck: "in" as const,
                  stem: "vocals" as const,
                  from: 0,
                  to: 1,
                  start: 0.9,
                  end: 1,
                },
              ]
            : []),
        ],
        "The outgoing vocal rides alone over the incoming instrumental, a live mashup.",
        clashRelief(acapellaBase) + 3,
        true,
        [
          step(
            0.05,
            "Strip to the acapella",
            "Drums, bass and melody leave the outgoing track."
          ),
          step(
            0.3,
            "Vocal over the new beat",
            "Matching keys let the acapella sit on the incoming groove."
          ),
          step(
            0.9,
            "Close",
            "The acapella fades and the incoming vocal returns."
          ),
        ]
      )
    )
  if (outStems && inStems && blend?.beatmatch)
    routines.push(
      variant(
        blend,
        "drumswap",
        "Drum swap",
        "percussion",
        [
          { deck: "in", stem: "bass", from: 0, to: 1, start: 0.5, end: 0.55 },
          { deck: "in", stem: "melody", from: 0, to: 1, start: 0.5, end: 0.6 },
          { deck: "in", stem: "vocals", from: 0, to: 1, start: 0.5, end: 0.6 },
          {
            deck: "out",
            stem: "drums",
            from: 1,
            to: 0,
            start: 0.45,
            end: 0.55,
          },
        ],
        "The incoming drums take over first, then the rest of the track follows.",
        2,
        false,
        [
          step(
            0,
            "New drums",
            "Only the incoming drum stem plays under the outgoing track."
          ),
          step(
            0.45,
            "Swap the beat",
            "The outgoing drums drop; the incoming bass and melody arrive."
          ),
          step(0.85, "Hand over", "The outgoing track fades out."),
        ]
      )
    )
  return routines
}

type StructuralContext = {
  outCue: number | null
  inCue: number | null
  bpm: number
  beat: number
  canMatch: boolean
  targetRate: number
  existingInRate: number
  mixOutRate: number
  multiple: 1 | 2 | 0.5
  harmonic: number
  intent: MixIntent
  profile: ReturnType<typeof pairProfile>
  firstEntry: number
  tempoRamp: Transition["tempoRamp"]
  rampLength: number
  pace: MixPace
  /** How well the pair's overall energy suits the goal, 0–1. */
  energyFit: number
  recent: string[]
}

/**
 * Transitions placed by the arrangement rather than the phrase grid:
 * - Drop swap (EDM, DnB, bass, genre jumps): the outgoing build resolves into
 *   the incoming drop. Works across tempos.
 * - Breakdown swap (trance / melodic): the incoming track starts under the
 *   outgoing breakdown so its drop lands as the breakdown ends.
 * - Breakdown crossover (unrelated tempos): fade the next track in during a
 *   bass-less breakdown, where there is no beat to clash.
 */
function structuralTransitions(
  out: Track,
  incoming: Track,
  position: number,
  c: StructuralContext
): Transition[] {
  if (c.outCue !== null || c.inCue !== null) return []
  const outSections = labelSections(out),
    inSections = labelSections(incoming)
  if (!outSections.length || !inSections.length) return []
  // Full pace swaps at the last drop / breakdown; shorter paces use the one
  // nearest the exit target, mid-track.
  const target = exitTarget(out, position, c.pace, out.duration)
  const earliest =
    target === null
      ? Math.max(position + 1, out.duration * 0.4)
      : Math.max(position + 30, target - c.beat * 4 * 32)
  const latestStart = target === null ? out.duration : target + c.beat * 4 * 16
  const nearest = <T extends { start: number }>(list: T[]) =>
    target === null
      ? list.at(-1)
      : [...list].sort(
          (a, b) => Math.abs(a.start - target) - Math.abs(b.start - target)
        )[0]
  const inDrop = inSections.find((s) => s.label === "drop")
  const lesson = (id: string) => techniques.find((t) => t.id === id)!
  const plans: Transition[] = []
  const build = (
    id: string,
    name: string,
    lessonId: string,
    execution: Transition["execution"],
    fields: {
      outStart: number
      inStart: number
      duration: number
      beatmatch: boolean
      /** Bonus for how precisely the arrangement sets this routine up. */
      arrangement: number
      why: string
      reasons: string[]
      bassSwapAt?: number
      /** The routine's own effects (always applied). */
      fx?: FXCue[]
    }
  ) => {
    const incomingRate = fields.beatmatch ? c.targetRate : c.existingInRate
    const rate = incomingRate / c.mixOutRate
    const clash = vocalClash(
      out,
      fields.outStart,
      incoming,
      fields.inStart,
      fields.duration,
      rate
    )
    const keySafe =
      fields.beatmatch && fields.duration > c.beat * 32 && c.harmonic >= 0.9
    const scoreParts = [
      { label: "Routine", value: routineBias(id, c.canMatch) },
      { label: "Energy goal", value: intentFit[c.intent][id] ?? 0 },
      { label: "Energy match", value: c.energyFit * 6 },
      { label: "Genre", value: profileBonus(c.profile, id) },
      {
        // Placed by the arrangement itself; shorter paces are about
        // mid-track moments, so favour them there.
        label: "Arrangement",
        value: fields.arrangement + (c.pace !== "full" ? 4 : 0),
      },
      {
        label: "Keys",
        value:
          (fields.beatmatch && fields.duration > c.beat * 16
            ? (c.harmonic - 0.5) * 10 * c.profile.keyWeight
            : 0) + (keySafe ? 2 : 0),
      },
      { label: "Vocals", value: -(clash ?? 0) * c.profile.vocalWeight * 14 },
      { label: "Variety", value: c.recent.slice(-3).includes(id) ? -9 : 0 },
    ]
      .map((part) => ({ ...part, value: Math.round(part.value * 10) / 10 }))
      .filter((part) => part.value !== 0)
    const score = total(scoreParts, 97)
    const technique = lesson(lessonId)
    plans.push({
      id,
      name,
      description: fields.why,
      labels: technique.labels,
      difficulty: technique.level,
      execution,
      bars:
        execution === "cut"
          ? 0
          : Math.round((fields.duration / (c.beat * 4)) * 10) / 10,
      duration: fields.duration,
      outStart: fields.outStart,
      inStart: fields.inStart,
      score,
      scoreParts,
      keySafe,
      beatmatch: fields.beatmatch,
      rate,
      incomingRate,
      anchors: { out: null, incoming: null },
      vocalClash: clash,
      genre: c.profile.label,
      crossGenre: c.profile.crossGenre,
      tempoRelation: fields.beatmatch ? c.multiple : 1,
      tempoRamp:
        fields.beatmatch && c.tempoRamp
          ? { ...c.tempoRamp, start: fields.outStart - c.rampLength }
          : undefined,
      bassSwapAt: fields.bassSwapAt,
      fx: fields.fx,
      pace: c.pace,
      reasons: [
        ...fields.reasons,
        c.profile.crossGenre
          ? `Genre jump ${c.profile.label}`
          : `Style: ${c.profile.label}`,
        clash === null
          ? "Vocal overlap unknown until both tracks are analyzed"
          : clash < 0.08
            ? "No vocal overlap"
            : `Vocal overlap about ${Math.round(clash * 100)}%`,
      ],
      warnings: [
        "Sections (intro, build, drop, breakdown) are estimated from loudness and bass; listen before relying on them.",
      ],
      steps: transitionSteps(execution, fields.bassSwapAt),
    })
  }
  // Drop swap: replace the outgoing track's last drop with the incoming one.
  const outDrop = nearest(
    outSections.filter(
      (s) =>
        s.label === "drop" &&
        s.start >= earliest &&
        s.start <= latestStart &&
        s.start <= out.duration - c.beat * 16
    )
  )
  if (
    outDrop &&
    inDrop &&
    (!c.tempoRamp || outDrop.start >= position + c.rampLength)
  )
    build("dropswap", "Drop swap", "drop", "cut", {
      outStart: outDrop.start,
      inStart: inDrop.start,
      duration: 0.08 * c.mixOutRate,
      beatmatch: c.canMatch,
      arrangement: 6,
      why: "The outgoing build resolves into the incoming drop, so the next track delivers the payoff. Works across tempos and genres.",
      reasons: [
        `${formatClock(outDrop.start)} build resolves into the incoming drop at ${formatClock(inDrop.start)}`,
      ],
    })
  const bar = c.beat * 4
  // Fake drop: the outgoing build stutters into a loop roll and stops; the
  // incoming track's last build bar plays, then its real drop lands.
  const rollRate = c.canMatch ? c.targetRate / c.mixOutRate : 1
  if (
    outDrop &&
    inDrop &&
    inDrop.start - bar * rollRate >= 0 &&
    outDrop.start - bar >= position &&
    (!c.tempoRamp || outDrop.start >= position + c.rampLength)
  )
    build("fakedrop", "Fake drop → real drop", "fake", "cut", {
      outStart: outDrop.start,
      inStart: inDrop.start - bar * rollRate,
      duration: 0.08 * c.mixOutRate,
      beatmatch: c.canMatch,
      arrangement: 5,
      fx: [
        {
          kind: "roll",
          deck: "out",
          at: -bar,
          length: bar,
          amount: 1,
          beats: 1,
          label: "Loop roll 1 → ¼ beat instead of the drop",
        },
      ],
      why: "The build promises a drop, stutters in a loop roll and stops; one bar later the next track's real drop hits.",
      reasons: [
        `Rolls the ${formatClock(outDrop.start)} build, then the incoming drop lands at ${formatClock(inDrop.start)}`,
      ],
    })
  // Double drop: both builds run together so both drops hit at once; the
  // incoming bass takes over on the drop and the outgoing track leaves
  // eight bars later. Needs a beatmatch and compatible keys.
  if (outDrop && inDrop && c.canMatch && c.harmonic >= 0.9) {
    const rate = c.targetRate / c.mixOutRate,
      quick = c.pace === "quick"
    const lead =
      Math.floor(
        Math.min(
          (quick ? 4 : 16) * bar,
          inDrop.start / rate,
          outDrop.start - Math.max(position, position + c.rampLength)
        ) /
          (4 * bar)
      ) *
      4 *
      bar
    const duration = lead + (quick ? 4 : 8) * bar
    if (
      lead >= (quick ? 4 : 8) * bar &&
      outDrop.start - lead + duration <= out.duration - 0.02 &&
      inDrop.start - lead * rate + duration * rate <= incoming.duration - 0.02
    )
      build("doubledrop", "Double drop", "double", "bass", {
        outStart: outDrop.start - lead,
        inStart: inDrop.start - lead * rate,
        duration,
        beatmatch: true,
        arrangement: 6,
        bassSwapAt: lead / duration,
        why: "Both builds run together and both drops hit at once; the incoming bassline takes the drop and the outgoing track bows out.",
        reasons: [
          `Builds line up over ${Math.round(lead / bar)} bars; both drops hit at ${formatClock(outDrop.start)}`,
        ],
      })
  }
  const breakdowns = outSections.filter(
    (s) =>
      s.label === "breakdown" &&
      s.start >= earliest &&
      s.start <= latestStart &&
      s.end - s.start >= c.beat * 32 &&
      s.end <= out.duration - 1
  )
  // Breakdown swap: needs a beatmatch and an incoming intro as long as the
  // breakdown, so the incoming drop lands on the outgoing release.
  const chosenBreakdown = nearest(breakdowns)
  for (const down of chosenBreakdown ? [chosenBreakdown] : []) {
    if (!c.canMatch || !inDrop) break
    const bars = Math.min(
      c.pace === "quick" ? 8 : 32,
      Math.floor((down.end - down.start) / (c.beat * 32)) * 8
    )
    const duration = bars * 4 * c.beat
    const rate = c.targetRate / c.mixOutRate
    const inStart = inDrop.start - duration * rate
    if (bars < 8 || inStart < 0) break
    build("breakswap", "Breakdown swap", "long", "bass", {
      outStart: down.end - duration,
      inStart,
      duration,
      beatmatch: true,
      arrangement: 6,
      bassSwapAt: 0.94,
      why: "The incoming track builds under the outgoing breakdown; when the breakdown resolves, the new drop arrives instead.",
      reasons: [
        `Starts under the ${bars}-bar breakdown; the incoming drop lands at its release (${formatClock(down.end)})`,
      ],
    })
  }
  // Breakdown crossover: no shared beat, so tempos may differ freely.
  const quiet = chosenBreakdown
  if (quiet) {
    const duration = Math.min(
      quiet.end - quiet.start,
      (c.pace === "quick" ? 8 : 16) * 4 * c.beat
    )
    build("crossover", "Breakdown crossover", "fade", "fade", {
      outStart: quiet.start,
      inStart: c.firstEntry,
      duration,
      beatmatch: false,
      arrangement: c.canMatch ? 0 : 6,
      why: "During a bass-less breakdown there is no beat to clash, so the next track can fade in at its own tempo.",
      reasons: [
        `Fades in during the ${formatClock(quiet.start)} breakdown at native tempos`,
      ],
    })
  }
  return plans
}

function formatClock(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

const family: Record<string, string> = {
  phrase: "blend",
  drop: "dropswap",
  double: "doubledrop",
  fake: "fakedrop",
  acapella: "acapella",
  mashup: "acapella",
  percussion: "drumswap",
}
export type ReadinessStatus =
  "Ready" | "Possible with prep" | "Not for this pair" | "Not supported yet"

/** Every lesson's status for the loaded pair, with the plan that performs it. */
export function techniqueReadiness(plans: Transition[]) {
  const top = plans[0]
  const result = (
    technique: (typeof techniques)[number],
    status: ReadinessStatus,
    reason: string,
    plan?: Transition
  ) => ({ technique, plan, status, reason })
  return techniques.map((technique) => {
    if (technique.id === "harmonic") {
      const plan = findPlan(plans, "harmonic")
      return plan
        ? result(
            technique,
            "Ready",
            `${plan.name} runs as a key-safe blend for this pair.`,
            plan
          )
        : result(
            technique,
            "Not for this pair",
            "Needs compatible keys, a long beatmatched overlap and no relative pitch shift."
          )
    }
    if (technique.id === "tempo") {
      const plan = plans.find(
        (p) => p.tempoRamp || (p.tempoRelation ?? 1) !== 1
      )
      if (plan)
        return result(
          technique,
          "Ready",
          plan.tempoRamp
            ? "A tempo ramp brings the decks together before the mix."
            : "A half/double-time beatmatch bridges the tempos.",
          plan
        )
      return plans.length > 0 && top.beatmatch && Math.abs(top.rate - 1) < 0.02
        ? result(
            technique,
            "Not for this pair",
            "The tempos already match; no tempo transition is needed."
          )
        : result(
            technique,
            "Possible with prep",
            "The gap is too wide to ride; an echo out, brake or breakdown crossover hides it.",
            plans.find((p) => ["echo", "crossover"].includes(p.id))
          )
    }
    if (technique.id === "genre") {
      if (!plans.length || !top.crossGenre)
        return result(
          technique,
          "Not for this pair",
          "Both tracks share a style; no genre switch is needed."
        )
      const plan = plans.find((p) =>
        ["echo", "dropswap", "crossover", "cut"].includes(p.id)
      )
      return plan
        ? result(
            technique,
            "Ready",
            `${top.genre}: ${plan.name} bridges the styles.`,
            plan
          )
        : result(
            technique,
            "Possible with prep",
            "Bridge the styles with a cut or FX exit on a phrase."
          )
    }
    const plan =
      technique.id === "vocal"
        ? plans.find((p) => p.id === "vocalout" || p.id === "instrumentalin")
        : plans.find((p) => p.id === (family[technique.id] ?? technique.id))
    if (plan)
      return result(
        technique,
        "Ready",
        "A working routine is available for this pair.",
        plan
      )
    if (["phrase", "bass", "long", "filter", "loop"].includes(technique.id))
      return result(
        technique,
        "Not for this pair",
        "Needs closer effective tempos; long blends also need compatible source keys."
      )
    if (["drop", "double", "fake"].includes(technique.id))
      return result(
        technique,
        "Possible with prep",
        "Needs a detected drop in both tracks; confirm both drop cues by ear."
      )
    if (["vocal", "acapella", "mashup", "percussion"].includes(technique.id))
      return result(
        technique,
        "Possible with prep",
        "Prepare stems for both tracks (on the deck or in the library); vocal routines also need a vocal in the overlap."
      )
    if (technique.id === "multideck")
      return result(
        technique,
        "Not supported yet",
        "Requires three or four decks; this engine currently has two."
      )
    if (["scratch", "baby", "backspin", "brake", "tone"].includes(technique.id))
      return result(
        technique,
        "Possible with prep",
        "A hands-on skill: practice it with the jog wheel, pitch and pads."
      )
    return result(
      technique,
      "Possible with prep",
      "Practice with prepared cues and manual controls; no automatic routine yet."
    )
  })
}
