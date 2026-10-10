import { beatOffset } from "./beatgrid"
import type { Track, Transition } from "./types"

export type SuggestedCue = {
  id: string
  position: number
  label: string
  why: string
}
export type CueOption = {
  position: number
  label: string
  source?: "saved" | "grid"
}

// These are grid/loudness suggestions, not detected drops or vocal boundaries.
export function cueOptions(
  track: Track,
  cues: (number | null)[],
  labels: (string | null)[],
  role: "entry" | "exit"
): CueOption[] {
  const saved = cues.flatMap((position, index) =>
    position !== null &&
    Number.isFinite(position) &&
    position >= 0 &&
    position < track.duration
      ? [
          {
            position,
            label: `Hot cue ${index + 1}${labels[index] ? ` · ${labels[index]}` : ""}`,
            source: "saved" as const,
          },
        ]
      : []
  )
  for (const position of track.memoryCues ?? []) {
    if (
      Number.isFinite(position) &&
      position >= 0 &&
      position < track.duration &&
      !saved.some((cue) => Math.abs(cue.position - position) < 0.01)
    )
      saved.push({ position, label: "Memory cue", source: "saved" })
  }
  if (
    !track.bpm ||
    !Number.isFinite(track.bpm) ||
    track.bpm <= 0 ||
    !Number.isFinite(track.duration)
  )
    return saved
  const phrase = (64 * 60) / track.bpm
  const offset = beatOffset(track)
  const curve = track.analysis?.energyCurve
  const candidates: { position: number; cost: number; label: string }[] = []
  const scanStride = Math.max(1, Math.ceil(track.duration / phrase / 1000))
  for (let n = 0; n * phrase < track.duration; n += scanStride) {
    const position = offset + n * phrase
    if (position >= track.duration - (role === "entry" ? 4 : 0.1)) break
    if (
      position < 0 ||
      saved.some((cue) => Math.abs(cue.position - position) < 0.01)
    )
      continue
    const window = (
      curve?.slice(Math.floor(position), Math.ceil(position + 8)) ?? []
    ).filter(Number.isFinite)
    const energy = window.length
      ? window.reduce((sum, value) => sum + value, 0) / window.length
      : 0
    candidates.push({
      position,
      cost: energy,
      label: `Estimated phrase ${n + 1}`,
    })
  }
  // Every suggested 16-bar anchor is available. Very long recordings retain a
  // bounded, evenly distributed grid plus the quietest sections and saved cues.
  const selected = new Map<number, CueOption>()
  const stride = Math.max(1, Math.ceil(candidates.length / 96))
  for (let index = 0; index < candidates.length; index += stride) {
    const candidate = candidates[index]
    selected.set(candidate.position, { ...candidate, source: "grid" })
  }
  for (const candidate of [...candidates]
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 2))
    selected.set(candidate.position, { ...candidate, source: "grid" })
  const lastBar =
    offset +
    Math.floor((track.duration - 0.1 - offset) / (phrase / 16)) * (phrase / 16)
  if (
    lastBar >= 0 &&
    !saved.some((cue) => Math.abs(cue.position - lastBar) < 0.01)
  )
    selected.set(lastBar, {
      position: lastBar,
      label: "Estimated final downbeat",
      source: "grid",
    })
  return [...saved, ...selected.values()].sort(
    (a, b) => a.position - b.position
  )
}

export function transitionAnnotations(
  track: Track | null,
  plan: Transition | undefined,
  outgoing: boolean
) {
  if (!track || !plan)
    return {
      cues: [] as SuggestedCue[],
      zones: [] as { start: number; end: number; label: string }[],
    }
  const start = outgoing ? plan.outStart : plan.inStart
  const length = plan.duration * (outgoing ? 1 : plan.rate)
  const beat = 60 / (track.bpm ?? 120)
  const clamp = (time: number) =>
    Math.max(0, Math.min(track.duration - 0.01, time))
  const fx = plan.execution === "echo" || plan.execution === "reverb"
  const launch = fx && !outgoing ? 0.25 : 0
  const cues: SuggestedCue[] = [
    {
      id: "start",
      position: clamp(start),
      label: outgoing ? (plan.execution === "cut" ? "CUT" : "EXIT") : "ENTRY",
      why: outgoing
        ? "Start the selected handoff here."
        : "Launch the incoming track from this point.",
    },
  ]
  if (plan.bars && !fx) {
    cues.push({
      id: "middle",
      position: clamp(start + length * (plan.bassSwapAt ?? 0.5)),
      label: ["bass", "long", "loop", "filter"].includes(plan.execution)
        ? "BASS SWAP"
        : "TAKEOVER",
      why:
        plan.steps.find((step) => step.at === (plan.bassSwapAt ?? 0.5))?.why ??
        "Pass the musical focus to the incoming track.",
    })
    if (outgoing && plan.execution !== "loop")
      cues.push({
        id: "end",
        position: clamp(start + length),
        label: "HANDOFF",
        why: "The incoming track becomes the only dry source.",
      })
  }
  // An outgoing loop repeats its first four beats; the later timeline does not play.
  if (outgoing && plan.execution === "loop") cues.splice(1)
  const zoneLength =
    plan.execution === "cut"
      ? beat * 4
      : outgoing && plan.execution === "loop"
        ? beat * 4
        : length * (1 - launch)
  const zones = [
    {
      start: clamp(start),
      end: Math.min(track.duration, start + zoneLength),
      label:
        plan.execution === "cut"
          ? "CUT ON DOWNBEAT"
          : outgoing
            ? plan.execution === "loop"
              ? "4-BEAT LOOP"
              : "EXIT ZONE"
            : "ENTRY ZONE",
    },
  ]
  if (
    ["bass", "long", "filter", "loop"].includes(plan.execution) &&
    !(outgoing && plan.execution === "loop")
  ) {
    zones.push({
      start: clamp(start + length * (plan.bassSwapAt ?? 0.5)),
      end: Math.min(
        track.duration,
        start + length * (plan.bassSwapAt ?? 0.5) + beat * 4
      ),
      label: "BASS EXCHANGE",
    })
  }
  return { cues, zones }
}
