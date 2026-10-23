import { beatOffset as gridOffset } from "./beatgrid"
import { techniques } from "./lessons"
import type { MixIntent, MixPace, Track, Transition } from "./types"
import { pairProfile, profileBonus } from "./genre"
import { labelSections, overlapWith } from "./sections"

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
}
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
    id: "harmonic",
    lesson: "harmonic",
    execution: "bass",
    bars: 16,
    needsTempo: true,
  },
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
  { id: "dropswap", name: "Drop swap" },
  { id: "breakswap", name: "Breakdown swap" },
  { id: "crossover", name: "Breakdown crossover" },
]

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
  const minimum = position + (pace === "quick" ? 40 : 75)
  const drops = labelSections(track).filter(
    (s) => s.label === "drop" && s.end - bar * 8 > position && s.end >= minimum
  )
  const pick = pace === "quick" ? drops.at(0) : (drops.at(1) ?? drops.at(0))
  const remaining = Math.max(0, track.duration - position)
  const fallback =
    position +
    (pace === "quick"
      ? Math.min(120, Math.max(50, remaining * 0.35))
      : Math.min(240, Math.max(90, remaining * 0.55)))
  // A drop that runs for minutes (flat masters, one long groove) would keep
  // the track on to its outro: cap the play time like a DJ watching the
  // clock (about 2 minutes quick, 4 minutes DJ pace).
  const cap = position + (pace === "quick" ? 120 : 240)
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
  // Tempo journey: beatmatch directly, at half/double time (174 ↔ 87), or
  // ride the outgoing deck toward the incoming tempo before the blend.
  const fits = (r: number) =>
    Math.abs(r / existingInRate - 1) <= 0.08 && r >= 0.84 && r <= 1.16
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
      const to = (existingInRate * incoming.bpm! * m) / bpm
      if (to < 0.84 || to > 1.16 || Math.abs(to / outRate - 1) > 0.16) continue
      const change = Math.abs(to - outRate) * bpm
      const bars = Math.min(64, Math.max(16, Math.round((change * 2) / 4) * 4))
      tempoRamp = { from: outRate, to, bars, start: 0 }
      multiple = m
      mixOutRate = to
      break
    }
  const ratio = tempoKnown ? bpm / (incoming.bpm! * multiple) : 1,
    targetRate = ratio * mixOutRate
  const canMatch = tempoKnown && fits(targetRate)
  const rampLength = tempoRamp ? tempoRamp.bars * 4 * beat : 0
  const profile = pairProfile(out, incoming)
  const harmonic = harmonicCompatibility(out.camelot, incoming.camelot),
    pitchChanges = canMatch && Math.abs(ratio - 1) > 0.005
  const offset = Math.max(0, phraseOrigin(out)),
    entry = inCue ?? Math.max(0, phraseOrigin(incoming))
  const vocalsKnown =
    !!out.analysis?.vocals?.length && !!incoming.analysis?.vocals?.length
  const pace = options.pace ?? "full"
  const intent = options.intent ?? "maintain",
    energyDelta = ((incoming.energy ?? 5) - (out.energy ?? 5)) / 10
  const energyFit =
    1 -
    Math.min(
      1,
      Math.abs(
        energyDelta - (intent === "lift" ? 0.2 : intent === "ease" ? -0.2 : 0)
      )
    )
  return definitions
    .filter(
      (d) =>
        (!d.needsTempo || canMatch) &&
        (d.id !== "harmonic" ||
          (harmonic >= 0.9 &&
            !!out.camelot &&
            !!incoming.camelot &&
            !pitchChanges)) &&
        (d.id !== "long" ||
          (harmonic >= 0.8 && profile.longBars !== null && multiple === 1))
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
      const requested =
        d.execution === "cut"
          ? 0.08 * mixOutRate
          : Math.min(
              (d.execution === "fade" && match ? 8 : styleBars) * 4 * beat,
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
        offset + Math.floor((latest - offset) / phrase) * phrase
      )
      const exits =
        outCue !== null
          ? [{ t: outCue, cost: 0 }]
          : candidateStarts(out, offset, phrase, earliest, latest)
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
      outStart = outCue ?? Math.min(latest, outStart)
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
      const genreFit = lesson.genres.some(
        (g) =>
          g === "All genres" ||
          [out.genre, incoming.genre].some((genre) =>
            genre.toLowerCase().includes(g.toLowerCase())
          )
      )
      const longOverlap = match && duration > beat * 32,
        repeated = options.recent?.slice(-3).includes(d.id) ? 9 : 0
      const base = canMatch
        ? ["bass", "long"].includes(d.execution)
          ? 78
          : d.execution === "blend"
            ? 74
            : d.execution === "filter"
              ? 70
              : d.execution === "loop"
                ? 66
                : 52
        : d.execution === "echo"
          ? 78
          : d.execution === "cut"
            ? 74
            : d.execution === "fade"
              ? 69
              : 60
      const intentBonus =
        intent === "lift" && ["cut", "bass", "filter"].includes(d.id)
          ? 8
          : intent === "ease" && ["long", "reverb", "blend"].includes(d.id)
            ? 8
            : 0
      const score = Math.round(
        Math.min(
          98,
          Math.max(
            1,
            base +
              intentBonus +
              (genreFit ? 7 : 0) +
              energyFit * 6 +
              (longOverlap ? (harmonic - 0.5) * 15 * profile.keyWeight : 0) +
              // The lesson's own genre fit already rewards suitable styles;
              // the profile then only penalises what the style avoids.
              (genreFit
                ? Math.min(0, profileBonus(profile, d.id))
                : profileBonus(profile, d.id)) -
              (pitchChanges && longOverlap ? 5 : 0) -
              repeated -
              (d.execution === "reverb" && (exitEnergy ?? 0.5) > 0.65
                ? 12
                : 0) -
              // Two voices or leads at once: long blends suffer most.
              (clash ?? 0) *
                profile.vocalWeight *
                (duration >= beat * 32 ? 30 : duration >= beat * 8 ? 14 : 3) +
              (short ? risk * 28 : 0)
          )
        )
      )
      const warnings = [
        ...(cuePhaseWarning ? [cuePhaseWarning] : []),
        ...(!tempoKnown
          ? [
              "Tempo unknown: FX timing and phrase zones use a provisional 120 BPM grid.",
            ]
          : !canMatch
            ? [
                "Tempo gap exceeds an 8% adjustment or the deck’s pitch range; no forced beatmatch.",
              ]
            : []),
        ...(pitchChanges && match
          ? [
              "Tempo changes pitch; key lock is not available. Source-key compatibility may change.",
            ]
          : []),
        ...(!out.camelot || !incoming.camelot
          ? ["Key analysis is incomplete. Listen for melody clashes."]
          : harmonic < 0.8 && longOverlap
            ? [
                "Source keys are distant: reduce melodic overlap. A mix may still work by ear.",
              ]
            : []),
        ...(d.execution === "loop"
          ? [
              "Audition the loop first; vocal and melody density have not been detected.",
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
                  `Tempo ramp: deck rides ${(bpm * tempoRamp.from).toFixed(1)} → ${(bpm * tempoRamp.to).toFixed(1)} BPM over ${tempoRamp.bars} bars before the mix`,
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
              ? `${out.camelot} → ${incoming.camelot}: ${harmonic >= 0.8 ? "source keys compatible" : "favor less melodic overlap"}${pitchChanges && match ? "; pitch shift applies" : ""}`
              : "Keys unverified; audition the overlap",
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
      })
    )
    .sort((a, b) => b.score - a.score)
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
      : Math.max(position + 30, target - c.beat * 4 * 48)
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
      base: number
      why: string
      reasons: string[]
      bassSwapAt?: number
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
    const score = Math.round(
      Math.min(
        97,
        Math.max(
          1,
          fields.base +
            profileBonus(c.profile, id) +
            (c.intent === "lift" && id === "dropswap" ? 6 : 0) +
            // Shorter paces are about mid-track moments: favour them.
            (c.pace !== "full" ? 4 : 0) +
            (fields.beatmatch && fields.duration > c.beat * 16
              ? (c.harmonic - 0.5) * 12 * c.profile.keyWeight
              : 0) -
            (clash ?? 0) * c.profile.vocalWeight * 14
        )
      )
    )
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
      base: 68,
      why: "The outgoing build resolves into the incoming drop, so the next track delivers the payoff. Works across tempos and genres.",
      reasons: [
        `${formatClock(outDrop.start)} build resolves into the incoming drop at ${formatClock(inDrop.start)}`,
      ],
    })
  const breakdowns = outSections.filter(
    (s) =>
      s.label === "breakdown" &&
      s.start >= earliest &&
      s.end - s.start >= c.beat * 32 &&
      s.end <= out.duration - 1
  )
  // Breakdown swap: needs a beatmatch and an incoming intro as long as the
  // breakdown, so the incoming drop lands on the outgoing release.
  const chosenBreakdown = nearest(breakdowns)
  for (const down of chosenBreakdown ? [chosenBreakdown] : []) {
    if (!c.canMatch || !inDrop) break
    const bars = Math.min(
      32,
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
      base: 74,
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
    const duration = Math.min(quiet.end - quiet.start, 16 * 4 * c.beat)
    build("crossover", "Breakdown crossover", "fade", "fade", {
      outStart: quiet.start,
      inStart: c.firstEntry,
      duration,
      beatmatch: false,
      base: c.canMatch ? 56 : 73,
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
  tempo: "echo",
  genre: "cut",
}
export function techniqueReadiness(plans: Transition[]) {
  return techniques.map((technique) => {
    const plan = plans.find(
      (p) => p.id === (family[technique.id] ?? technique.id)
    )
    if (plan)
      return {
        technique,
        plan,
        status: "Available" as const,
        reason: "A working routine is available for this pair.",
      }
    const reason = ["phrase", "bass", "long", "filter", "loop"].includes(
      technique.id
    )
      ? "Needs closer effective tempos; long blends also need compatible source keys."
      : technique.id === "harmonic"
        ? "Needs compatible keys without relative pitch shift; key lock is not implemented."
        : ["drop", "double", "fake"].includes(technique.id)
          ? "Confirm both drop cues by ear; drop detection and automatic drop routines are planned."
          : ["vocal", "acapella", "mashup", "percussion"].includes(technique.id)
            ? "Requires verified sparse/vocal sections or prepared stems; no vocal separation or density detection yet."
            : technique.id === "multideck"
              ? "Requires three or four decks; this engine currently has two."
              : ["scratch", "baby", "backspin", "brake", "tone"].includes(
                    technique.id
                  )
                ? "Requires additional scratch, reverse, pitch or brake audio processing."
                : "Practice with prepared cues and manual controls; no automatic routine yet."
    return {
      technique,
      plan: undefined,
      status: "Needs preparation" as const,
      reason,
    }
  })
}
