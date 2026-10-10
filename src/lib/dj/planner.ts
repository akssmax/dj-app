import { beatOffset as gridOffset } from "./beatgrid"
import { techniques } from "./lessons"
import type { MixIntent, Track, Transition } from "./types"

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
export const transitionChoices = definitions.map((recipe) => ({
  id: recipe.id,
  name:
    recipe.id === "blend"
      ? "Phrase blend"
      : techniques.find((t) => t.id === recipe.lesson)!.name,
}))

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
  const ratio = tempoKnown ? bpm / incoming.bpm! : 1,
    targetRate = ratio * outRate
  const canMatch =
    tempoKnown &&
    Math.abs(targetRate / existingInRate - 1) <= 0.08 &&
    targetRate >= 0.84 &&
    targetRate <= 1.16
  const harmonic = harmonicCompatibility(out.camelot, incoming.camelot),
    pitchChanges = canMatch && Math.abs(ratio - 1) > 0.005
  const offset = Math.max(0, gridOffset(out)),
    entry = inCue ?? Math.max(0, gridOffset(incoming))
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
        (d.id !== "long" || harmonic >= 0.8)
    )
    .flatMap((d): Transition[] => {
      const lesson = techniques.find((t) => t.id === d.lesson)!,
        match = d.needsTempo || (d.execution === "fade" && canMatch)
      const incomingRate = match ? targetRate : existingInRate,
        rate = incomingRate / outRate
      const requested =
        d.execution === "cut"
          ? 0.08 * outRate
          : (d.execution === "fade" && match ? 8 : d.bars) * 4 * beat
      let duration = Math.min(
        requested,
        out.duration - (outCue ?? position) - 0.02,
        (incoming.duration - entry - 0.02) / rate
      )
      if (duration <= 0.02) return []
      if (match && duration < beat * 8) return []
      if (match && duration >= beat * 8)
        duration = Math.floor(duration / (beat * 8)) * beat * 8
      const latest = Math.max(position, out.duration - duration - 0.02),
        earliest = Math.max(position, out.duration * 0.55)
      let outStart = Math.max(
          position,
          offset + Math.floor((latest - offset) / phrase) * phrase
        ),
        bestCost = Infinity
      for (
        let t = offset + Math.ceil((earliest - offset) / phrase) * phrase;
        outCue === null && t <= latest;
        t += phrase
      ) {
        const cost =
          (energyAt(out, t, Math.min(duration, phrase)) ?? 0.5) +
          ((latest - t) / out.duration) * 0.2
        if (cost < bestCost) {
          bestCost = cost
          outStart = t
        }
      }
      outStart = outCue ?? Math.min(latest, outStart)
      let inStart = Math.max(
        0,
        Math.min(entry, incoming.duration - duration * rate - 0.02)
      )
      if (inCue === null && match && incoming.analysis?.energyCurve.length) {
        let best = energyAt(incoming, inStart, duration * rate) ?? 1
        const inPhrase = (60 / incoming.bpm!) * 64
        for (
          let t = entry + inPhrase;
          t <=
          Math.min(
            incoming.duration * 0.2,
            60,
            incoming.duration - duration * rate
          );
          t += inPhrase
        ) {
          const cost =
            (energyAt(incoming, t, duration * rate) ?? 1) +
            (t / incoming.duration) * 0.15
          if (cost < best) {
            best = cost
            inStart = t
          }
        }
      }
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
              (longOverlap ? (harmonic - 0.5) * 15 : 0) -
              (pitchChanges && longOverlap ? 5 : 0) -
              repeated -
              (d.execution === "reverb" && (exitEnergy ?? 0.5) > 0.65 ? 12 : 0)
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
        "Phrase and arrangement zones are estimates. No vocal or drop detection yet.",
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
          reasons: [
            match
              ? `Matches effective tempo at ${(bpm * outRate).toFixed(1)} BPM`
              : "Native tempos retained; brief overlap avoids rhythmic conflict",
            out.camelot && incoming.camelot
              ? `${out.camelot} → ${incoming.camelot}: ${harmonic >= 0.8 ? "source keys compatible" : "favor less melodic overlap"}${pitchChanges && match ? "; pitch shift applies" : ""}`
              : "Keys unverified; audition the overlap",
            outCue !== null
              ? "Uses your selected outgoing cue"
              : exitEnergy !== null
                ? "Lower-energy late phrase chosen from measured loudness"
                : "Exit estimated on the 16-bar grid",
            genreFit
              ? `Technique suits ${out.genre} / ${incoming.genre}`
              : "Choose by arrangement and listening, alongside genre",
            `Energy goal: ${intent}${repeated ? "; recent repeats ranked lower" : ""}`,
            ...(inCue !== null
              ? [
                  "Uses your selected incoming cue; audition phrasing before starting",
                ]
              : []),
          ],
          warnings,
          bassSwapAt,
          steps: transitionSteps(d.execution, bassSwapAt),
        },
      ]
    })
    .sort((a, b) => b.score - a.score)
}

const family: Record<string, string> = {
  phrase: "blend",
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
