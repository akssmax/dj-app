import { beatOffset } from "./beatgrid"
import { cueOptions } from "./cue-suggestions"
import type { CueOption } from "./cue-suggestions"
import { planTransitions, sectionEnergy } from "./planner"
import type { MixIntent, Track, Transition } from "./types"

export type CuePair = {
  id: string
  technique: string
  out: CueOption
  incoming: CueOption
  score: number
  bars: number
  duration: number
  reasons: string[]
  phaseError: number | null
  shortened: boolean
}
export type TransitionChoice = {
  plan: Transition
  pairs: CuePair[]
  exits: CueOption[]
  entries: CueOption[]
}
export type ExplorerOptions = {
  outRate?: number
  incomingRate?: number
  intent?: MixIntent
  recent?: string[]
  outCues?: (number | null)[]
  inCues?: (number | null)[]
  outLabels?: (string | null)[]
  inLabels?: (string | null)[]
  outCue?: number | null
  inCue?: number | null
}

function anchors(
  track: Track,
  options: CueOption[],
  extra: number | null | undefined,
  automatic: number
) {
  const points = [...options]
  for (const [position, label] of [
    [automatic, "Automatic phrase"],
    [extra, "Selected cue"],
  ] as const) {
    if (
      position != null &&
      Number.isFinite(position) &&
      position >= 0 &&
      position < track.duration - 0.02 &&
      !points.some((p) => Math.abs(p.position - position) < 0.01)
    )
      points.push({
        position,
        label,
        source: label === "Selected cue" ? "saved" : "grid",
      })
  }
  return points.sort((a, b) => a.position - b.position)
}

/** Explore cue pairs without creating audio nodes or restarting either deck. */
export function discoverTransitions(
  out: Track,
  incoming: Track,
  options: ExplorerOptions = {}
): TransitionChoice[] {
  const templates = planTransitions(out, incoming, 0, {
    ...options,
    outCue: null,
    inCue: null,
  })
  const outRate = options.outRate ?? 1
  const beat = 60 / (out.bpm ?? 120)
  const exits = anchors(
    out,
    cueOptions(out, options.outCues ?? [], options.outLabels ?? [], "exit"),
    options.outCue,
    templates[0]?.outStart ?? 0
  )
  const entries = anchors(
    incoming,
    cueOptions(incoming, options.inCues ?? [], options.inLabels ?? [], "entry"),
    options.inCue,
    templates[0]?.inStart ?? 0
  )
  return templates
    .flatMap((template): TransitionChoice[] => {
      const pairs: CuePair[] = []
      const exitEnergy = new Map(
        exits.map((cue) => [
          cue.position,
          sectionEnergy(
            out,
            cue.position,
            Math.min(32 * beat, template.duration)
          ),
        ])
      )
      const entryEnergy = new Map(
        entries.map((cue) => [
          cue.position,
          sectionEnergy(
            incoming,
            cue.position,
            Math.min(32 * beat, template.duration) * template.rate
          ),
        ])
      )
      for (const exit of exits)
        for (const entry of entries) {
          let duration = Math.min(
            template.duration,
            out.duration - exit.position - 0.02,
            (incoming.duration - entry.position - 0.02) / template.rate
          )
          if (template.beatmatch)
            duration = Math.floor(duration / (8 * beat)) * 8 * beat
          if (duration <= 0.02 || (template.beatmatch && duration < 8 * beat))
            continue
          const difference =
            out.bpm && incoming.bpm
              ? ((entry.position - beatOffset(incoming)) * incoming.bpm) / 60 -
                ((exit.position - beatOffset(out)) * out.bpm) / 60
              : null
          const phaseError =
            difference === null
              ? null
              : Math.abs(difference - Math.round(difference / 4) * 4)
          const quietOut = exitEnergy.get(exit.position),
            quietIn = entryEnergy.get(entry.position)
          const shortened = duration < template.duration - 0.001
          const energyGoal =
            options.intent === "lift"
              ? 0.2
              : options.intent === "ease"
                ? -0.2
                : 0
          const localFit =
            quietOut != null && quietIn != null
              ? Math.max(0, 1 - Math.abs(quietIn - quietOut - energyGoal))
              : 0.5
          const score = Math.round(
            Math.max(
              1,
              Math.min(
                99,
                template.score * 0.6 +
                  (template.beatmatch
                    ? phaseError !== null && phaseError < 0.05
                      ? 10
                      : -12
                    : 5) +
                  localFit * 8 +
                  (quietOut == null
                    ? 0
                    : (1 - quietOut) *
                      (template.execution === "reverb" ? 10 : 4)) +
                  (quietIn == null
                    ? 0
                    : (1 - quietIn) * (template.beatmatch ? 5 : 1)) +
                  (exit.position / out.duration) * 14 +
                  (1 - entry.position / incoming.duration) * 3 +
                  (exit.source === "saved" && exit.position > beat * 4
                    ? 3
                    : 0) +
                  (entry.source === "saved" ? 3 : 0) -
                  (shortened ? 14 * (1 - duration / template.duration) : 0)
              )
            )
          )
          pairs.push({
            id: `${template.id}:${exit.position}:${entry.position}`,
            technique: template.id,
            out: exit,
            incoming: entry,
            score,
            bars: template.bars
              ? Math.round((duration / (beat * 4)) * 10) / 10
              : 0,
            duration: duration / outRate,
            phaseError,
            shortened,
            reasons: [
              template.beatmatch
                ? phaseError !== null && phaseError < 0.05
                  ? "Bar downbeats align on the estimated grids"
                  : "Cue phases differ; audition or adjust the grid"
                : "Brief overlap keeps native tempos",
              ...(quietOut != null && quietOut < 0.55
                ? ["Quieter outgoing window in measured loudness"]
                : []),
              ...(quietIn != null && quietIn < 0.55
                ? ["Quieter incoming window leaves room for the blend"]
                : []),
              ...(exit.source === "saved" || entry.source === "saved"
                ? ["Includes a saved cue"]
                : []),
              ...(shortened ? ["Less space available: shortened routine"] : []),
            ],
          })
        }
      pairs.sort(
        (a, b) =>
          b.score - a.score ||
          b.out.position - a.out.position ||
          a.incoming.position - b.incoming.position
      )
      const validExits = new Set(pairs.map((pair) => pair.out.position))
      const validEntries = new Set(pairs.map((pair) => pair.incoming.position))
      return pairs.length
        ? [
            {
              plan: template,
              pairs,
              exits: exits.filter((p) => validExits.has(p.position)),
              entries: entries.filter((p) => validEntries.has(p.position)),
            },
          ]
        : []
    })
    .sort((a, b) => b.pairs[0].score - a.pairs[0].score)
}

export function cuePairPlan(
  out: Track,
  incoming: Track,
  pair: CuePair,
  options: ExplorerOptions = {}
) {
  return planTransitions(out, incoming, 0, {
    ...options,
    outCue: pair.out.position,
    inCue: pair.incoming.position,
  }).find((plan) => plan.id === pair.technique)
}

export function upcomingPairs(choice: TransitionChoice, position: number) {
  return choice.pairs.filter((pair) => pair.out.position >= position - 0.01)
}
