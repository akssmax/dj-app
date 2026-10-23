import type { DeckState, Transition } from "./types"
import { allStemsOn } from "./stem-matrix"
import type { StemGains } from "./stem-matrix"

const clamp = (p: number) => Math.max(0, Math.min(1, p))
const ramp = (p: number, from: number, to: number) => {
  const x = clamp((p - from) / (to - from))
  return x * x * (3 - 2 * x)
}

export type AutomationChannel = Pick<
  DeckState,
  "volume" | "trim" | "low" | "mid" | "high" | "filter" | "fx" | "rate"
>

// The same recipe drives scheduled audio parameters, visible faders and EQ.
export function automationFrame(plan: Transition, progress: number) {
  const p = clamp(progress)
  const fx = plan.execution === "echo" || plan.execution === "reverb"
  const mix = fx
    ? ramp(p, 0.25, 0.45)
    : plan.execution === "cut"
      ? p
      : ramp(p, 0, 1)
  const long = plan.execution === "long"
  const bass = ["bass", "long", "loop", "filter"].includes(plan.execution)
  const swap = plan.bassSwapAt ?? (long ? 0.75 : 0.5)
  const width = Math.min(0.035, swap / 2, (1 - swap) / 2)
  return {
    mix,
    outFader: bass
      ? 1 - ramp(p, swap + width, 1)
      : Math.cos((mix * Math.PI) / 2),
    inFader: bass
      ? 0.72 * ramp(p, 0, Math.min(0.25, swap - width)) +
        0.28 * ramp(p, swap + width, 1)
      : Math.sin((mix * Math.PI) / 2),
    incomingDelay: fx ? 0.25 : 0,
    outLow: bass ? ramp(p, swap - width, swap) : 0,
    inLow: bass ? 1 - ramp(p, swap, swap + width) : 0,
    outMid: long ? -6 * ramp(p, 0.4, Math.max(0.6, swap)) : 0,
    inMid: long ? -6 * (1 - ramp(p, 0.25, 0.55)) : 0,
    outHigh: long ? -6 * ramp(p, 0.15, 0.35) : 0,
    inHigh: long ? -6 * (1 - ramp(p, 0, 0.25)) : 0,
    outFilter: plan.execution === "filter" ? p * 0.65 : fx ? 0.25 : 0,
    fxSend: fx ? 0.55 * (1 - ramp(p, 0.6, 0.7)) : 0,
    phase:
      [...plan.steps].reverse().find((step) => p >= step.at)?.label ??
      plan.name,
  }
}

export function automationControls(
  plan: Transition,
  progress: number,
  saved: AutomationChannel,
  outgoing: boolean,
  volume: number,
  trim: number
): AutomationChannel {
  const frame = automationFrame(plan, progress)
  const low = outgoing ? frame.outLow : frame.inLow
  return {
    ...saved,
    rate: outgoing ? saved.rate : plan.incomingRate,
    volume: volume * (outgoing ? frame.outFader : frame.inFader),
    trim,
    low: saved.low + (Math.min(saved.low, -12) - saved.low) * low,
    mid: Math.max(-12, saved.mid + (outgoing ? frame.outMid : frame.inMid)),
    high: Math.max(-12, saved.high + (outgoing ? frame.outHigh : frame.inHigh)),
    filter:
      outgoing && ["filter", "echo", "reverb"].includes(plan.execution)
        ? Math.max(0, saved.filter, frame.outFilter)
        : saved.filter,
    fx:
      outgoing && ["echo", "reverb"].includes(plan.execution)
        ? {
            type: plan.execution as "echo" | "reverb",
            enabled: frame.fxSend > 0,
            amount: frame.fxSend,
            beats: 1,
          }
        : { ...saved.fx, enabled: false },
  }
}

/** A deck's stem levels at a point of the transition, or null when the plan
 * doesn't move that deck's stems. */
export function stemGainsAt(
  plan: Transition,
  deck: "out" | "in",
  progress: number
): StemGains | null {
  const moves = plan.stemMoves?.filter((move) => move.deck === deck)
  if (!moves?.length) return null
  const gains: StemGains = { ...allStemsOn }
  for (const move of moves) {
    const t = ramp(
      clamp(progress),
      move.start,
      Math.max(move.start + 1e-6, move.end)
    )
    gains[move.stem] = move.from + (move.to - move.from) * t
  }
  return gains
}
