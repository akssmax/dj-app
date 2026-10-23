import { trackFamily } from "./genre"
import { vocalAt } from "./planner"
import type { FXCue, FXKind, MixIntent, Track, Transition } from "./types"

export type FXAmount = "off" | "subtle" | "expressive"

type Context = {
  amount: FXAmount
  intent: MixIntent
  /** FX used by recent transitions, oldest first: a kind or "none". */
  recent: string[]
  /** Outgoing-track seconds available before the transition starts. */
  room: number
}

const layered = ["blend", "bass", "long", "filter", "loop"]

/**
 * Effects a DJ would add to this transition, timed on the beat grid.
 * One main effect per handover (a build may combine sweep, riser and roll),
 * a budget across the set (Subtle ≈ 1 in 3, Expressive ≈ 2 in 3) and never
 * the same effect twice in a row.
 */
export function planFX(
  plan: Transition,
  out: Track,
  incoming: Track,
  context: Context
): FXCue[] {
  if (context.amount === "off") return []
  const expressive = context.amount === "expressive"
  const used = context.recent.slice(-2).filter((kind) => kind !== "none")
  if (expressive ? used.length >= 2 : used.length > 0) return []
  const beat = 60 / (out.bpm || 120),
    bar = beat * 4,
    duration = plan.duration
  const cue = (
    kind: FXKind,
    deck: FXCue["deck"],
    at: number,
    length: number,
    amount: number,
    label: string,
    beats?: number
  ): FXCue => ({ kind, deck, at, length, amount, label, beats })
  // Builds before the transition start need room on the outgoing track.
  const build = (bars: number) =>
    Math.min(bars * bar, Math.floor(context.room / bar) * bar)
  const exitVocal =
    (vocalAt(out, plan.outStart + Math.max(0, duration - bar * 2), bar * 2) ??
      0) >= 0.35
  const family = trackFamily(out).family
  const options: FXCue[][] = []

  // Big tempo drop without a beatmatch (128 → 90): a brake hides the jump.
  if (
    !plan.beatmatch &&
    out.bpm &&
    incoming.bpm &&
    incoming.bpm / out.bpm < 0.84 &&
    Math.abs(incoming.bpm / out.bpm - 0.5) > 0.04 &&
    ["cut", "echo", "fade"].includes(plan.execution)
  )
    options.push([
      cue(
        "brake",
        "out",
        -beat * 2,
        beat * 2,
        1,
        "Brake into the slower track"
      ),
    ])

  // Lift into a drop swap: high-pass build and riser, a roll in the last bar.
  const room = build(expressive ? 16 : 8)
  if (
    plan.id === "dropswap" &&
    (context.intent === "lift" || expressive) &&
    room >= bar * 4
  )
    options.push([
      cue(
        "sweep",
        "out",
        -room,
        room,
        expressive ? 0.85 : 0.6,
        `Filter build over ${Math.round(room / bar)} bars`
      ),
      ...(expressive || context.intent === "lift"
        ? [
            cue(
              "riser",
              "out",
              -room,
              room,
              expressive ? 0.8 : 0.5,
              "Noise riser"
            ),
          ]
        : []),
      ...(expressive && plan.beatmatch
        ? [cue("roll", "out", -bar, bar, 1, "Loop roll 1 → ¼ beat", 1)]
        : []),
    ])

  // Short exits: catch the last beat in an echo (a spinback for hip-hop).
  if (["cut", "fade"].includes(plan.execution) && plan.id !== "dropswap")
    options.push(
      expressive && family === "hiphop"
        ? [cue("spinback", "out", -beat, beat, 1, "Spinback on the last beat")]
        : [
            cue(
              "echo",
              "out",
              -beat,
              beat * 2,
              0.7,
              "Echo catches the last beat",
              expressive ? 0.75 : 1
            ),
          ]
    )

  // A vocal still running at the end of a blend: echo its last word out.
  if (layered.includes(plan.execution) && exitVocal)
    options.push([
      cue(
        "echo",
        "out",
        Math.max(0, duration - beat * 2),
        beat * 2,
        0.6,
        "Echo out the last vocal phrase",
        1
      ),
    ])

  // Easing or long blends: the incoming track opens from a low-pass.
  if (
    plan.execution === "long" ||
    (context.intent === "ease" && layered.includes(plan.execution))
  )
    options.push([
      cue(
        "filterIn",
        "in",
        0,
        duration * 0.5,
        1,
        "Incoming opens from low-pass"
      ),
      ...(expressive && family === "techno" && plan.execution === "long"
        ? [
            cue(
              "gate",
              "out",
              duration * 0.25,
              duration * 0.25,
              0.5,
              "Eighth-note gate on the outgoing groove",
              0.5
            ),
          ]
        : []),
    ])

  // Ease through a breakdown or fade: a reverb wash.
  if (
    ["fade"].includes(plan.execution) ||
    (context.intent === "ease" && plan.id === "crossover")
  )
    options.push([cue("reverb", "out", 0, duration * 0.6, 0.5, "Reverb wash")])

  // Lift during a layered blend: wash the outgoing track out with a sweep,
  // with a riser into the bass swap when expressive.
  if (context.intent === "lift" && ["bass", "blend"].includes(plan.execution)) {
    const swap = (plan.bassSwapAt ?? 0.5) * duration
    options.push([
      cue(
        "sweep",
        "out",
        swap,
        duration - swap,
        0.5,
        "High-pass sweep clears the outgoing track"
      ),
      ...(expressive && swap >= bar * 4
        ? [
            cue(
              "riser",
              "out",
              Math.max(0, swap - bar * 8),
              Math.min(swap, bar * 8),
              0.6,
              "Riser into the bass swap"
            ),
          ]
        : []),
    ])
  }

  // Expressive techno long blends: a slow flanger on the outgoing groove.
  if (expressive && family === "techno" && plan.execution === "long")
    options.push([
      cue(
        "flanger",
        "out",
        duration * 0.3,
        duration * 0.4,
        0.4,
        "Slow flanger"
      ),
    ])

  const last = context.recent.at(-1)
  return options.find((cues) => cues.length && cues[0].kind !== last) ?? []
}

/** The main effect of a cue list, for the set's FX budget. */
export function primaryFX(cues: FXCue[] | undefined) {
  return cues?.[0]?.kind ?? "none"
}

/** Short description of planned effects, e.g. "Filter build + Noise riser". */
export function describeFX(cues: FXCue[] | undefined) {
  return (cues ?? []).map((cue) => cue.label).join(" + ")
}
