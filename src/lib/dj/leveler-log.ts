import type { matchLoudness } from "./loudness"
import type { MixIntent, MixPace, Track, Transition } from "./types"

// Diagnostics for the automix leveler: one record per transition with what
// it measured, what it cut and why. Read it from the console as
// `cueLeveler` (see installLevelerDebug). Changes no audio.

type Levels = ReturnType<typeof matchLoudness>
export type LevelerMode = MixIntent | "set" | "manual"
export type LevelerContext = {
  mode: LevelerMode
  intent: MixIntent | null
  pace: MixPace | null
}
export type LevelerCause = {
  cause:
    | "fx-reserve"
    | "overlap-headroom"
    | "boost-capped"
    | "matched-to-quiet-section"
    | "anchored-to-target"
    | "quieter-after-mix"
    | "louder-after-mix"
    | "stem-routine"
  db?: number
  detail?: string
}
export type LevelerRecord = {
  at: string
  sim?: boolean
  mode: LevelerMode
  intent: MixIntent | null
  pace: MixPace | null
  routine: string
  execution: Transition["execution"]
  seconds: number
  out: { title: string; trim: number; section: string | null; at: number }
  in: { title: string; trim: number; section: string | null; at: number }
  inTrimDuringMix: number
  settledInTrim: number
  /** Deepest cut on the incoming deck while they overlap (dB, ≥ 0). */
  dipDb: number
  /** Deepest cut on the outgoing deck (dB, ≥ 0). */
  outDipDb: number
  /** Incoming main-section level after the mix minus the outgoing's (dB). */
  stepDb: number | null
  diagnostics: Levels["diagnostics"]
  causes: LevelerCause[]
}

const stemRoutines = [
  "vocalout",
  "acapella",
  "instrumentalin",
  "stembass",
  "drumswap",
]
const quietSections = ["intro", "outro", "breakdown", "build"]
const round = (v: number) => Math.round(v * 10) / 10

export function levelerCauses(
  d: Levels["diagnostics"],
  r: Pick<LevelerRecord, "routine" | "dipDb" | "stepDb" | "out" | "in">
) {
  const causes: LevelerCause[] = []
  if (r.dipDb >= 1.5) {
    const fx = d.inHeadroomDb - d.inHeadroomWithoutFxReserveDb
    if (fx >= 1) causes.push({ cause: "fx-reserve", db: round(fx) })
    if (d.inHeadroomWithoutFxReserveDb >= 1.5)
      causes.push({
        cause: "overlap-headroom",
        db: d.inHeadroomWithoutFxReserveDb,
      })
  }
  if (r.stepDb !== null && r.stepDb <= -3) {
    const capped =
      d.desiredTrimDb !== null && d.desiredTrimDb > 6 && r.stepDb < 0
    causes.push(
      capped
        ? {
            cause: "boost-capped",
            db: r.stepDb,
            detail: `wanted +${d.desiredTrimDb} dB, capped at +6`,
          }
        : d.basis === "body"
          ? {
              cause: "anchored-to-target",
              db: r.stepDb,
              detail: `set level held within 3 dB of the target (reference ${d.referenceDb} dB)`,
            }
          : r.out.section && quietSections.includes(r.out.section)
            ? {
                cause: "matched-to-quiet-section",
                db: r.stepDb,
                detail: `outgoing measured in its ${r.out.section}, incoming in its ${r.in.section ?? "?"}`,
              }
            : { cause: "quieter-after-mix", db: r.stepDb }
    )
  } else if (r.stepDb !== null && r.stepDb >= 3)
    causes.push({ cause: "louder-after-mix", db: r.stepDb })
  if (stemRoutines.includes(r.routine))
    causes.push({
      cause: "stem-routine",
      detail: "plays without some stems; the leveler measured the full mix",
    })
  return causes
}

export function levelerRecord(
  context: LevelerContext,
  plan: Transition,
  tracks: { out: Track; in: Track },
  trims: { out: number; in: number },
  sections: { out: string | null; in: string | null },
  levels: Levels,
  sim = false
): LevelerRecord {
  const d = levels.diagnostics
  const dipDb = round(d.inHeadroomDb - d.faderScaleDb),
    outDipDb = round(d.outHeadroomDb - d.faderScaleDb)
  const stepDb =
    d.inBodyDb !== null && d.outBodyDb !== null
      ? round(d.inBodyDb + levels.settledInTrim - (d.outBodyDb + trims.out))
      : null
  const base = {
    routine: plan.id,
    dipDb,
    outDipDb,
    stepDb,
    out: {
      title: tracks.out.title,
      trim: round(trims.out),
      section: sections.out,
      at: round(plan.outStart),
    },
    in: {
      title: tracks.in.title,
      trim: round(trims.in),
      section: sections.in,
      at: round(plan.inStart),
    },
  }
  return {
    at: new Date().toISOString(),
    ...(sim ? { sim } : {}),
    ...context,
    ...base,
    execution: plan.execution,
    seconds: round(plan.duration),
    inTrimDuringMix: round(levels.inTrim),
    settledInTrim: round(levels.settledInTrim),
    diagnostics: d,
    causes: levelerCauses(d, base),
  }
}

const STORE = "cue.levelerLog"
const LIMIT = 300
let context: LevelerContext = { mode: "manual", intent: null, pace: null }
let log: LevelerRecord[] = []
try {
  log = JSON.parse(globalThis.localStorage.getItem(STORE) ?? "[]")
} catch {
  log = []
}

/** Automix says which mode chose the next transition (manual otherwise). */
export function setLevelerContext(next: LevelerContext | null) {
  context = next ?? { mode: "manual", intent: null, pace: null }
}
export const levelerContext = () => context

function verbose() {
  try {
    return (
      import.meta.env.DEV ||
      globalThis.localStorage.getItem("cue.levelerDebug") === "1"
    )
  } catch {
    return false
  }
}

export function line(r: LevelerRecord) {
  const causes = r.causes
    .map((c) => `${c.cause}${c.db !== undefined ? ` ${c.db}dB` : ""}`)
    .join(", ")
  return `${r.sim ? "[sim] " : ""}${r.mode} · ${r.routine} · ${r.out.title} → ${r.in.title} · dip ${r.dipDb} dB · after ${r.stepDb ?? "?"} dB${causes ? ` · ${causes}` : ""}`
}

export function pushLeveler(record: LevelerRecord) {
  log = [...log, record].slice(-LIMIT)
  try {
    globalThis.localStorage.setItem(STORE, JSON.stringify(log))
  } catch {
    // Storage full or blocked: the in-memory log still works this session.
  }
  if (verbose()) {
    console.groupCollapsed(`[leveler] ${line(record)}`)
    console.log(record)
    console.groupEnd()
  }
}

export const levelerLog = () => log
export function clearLevelerLog() {
  log = []
  try {
    globalThis.localStorage.removeItem(STORE)
  } catch {
    // Nothing stored.
  }
}

/** Per-mode averages and how often each cause shows up. */
export function levelerSummary(records = log) {
  const modes = [...new Set(records.map((r) => r.mode))]
  return Object.fromEntries(
    modes.map((mode) => {
      const rows = records.filter((r) => r.mode === mode)
      const steps = rows.flatMap((r) => (r.stepDb === null ? [] : [r.stepDb]))
      const causes: Record<string, number> = {}
      for (const r of rows)
        for (const c of r.causes) causes[c.cause] = (causes[c.cause] ?? 0) + 1
      return [
        mode,
        {
          transitions: rows.length,
          avgDipDb: round(rows.reduce((s, r) => s + r.dipDb, 0) / rows.length),
          dipsOver3dB: rows.filter((r) => r.dipDb >= 3).length,
          avgStepDb: steps.length
            ? round(steps.reduce((s, v) => s + v, 0) / steps.length)
            : null,
          dropsAfterMixOver3dB: steps.filter((v) => v <= -3).length,
          routines: rows.reduce<Record<string, number>>(
            (all, r) => ({ ...all, [r.routine]: (all[r.routine] ?? 0) + 1 }),
            {}
          ),
          causes,
        },
      ]
    })
  )
}

export function levelerRows(records = log) {
  return records.map((r) => ({
    mode: r.mode,
    routine: r.routine,
    pair: `${r.out.title} → ${r.in.title}`,
    sections: `${r.out.section ?? "?"} → ${r.in.section ?? "?"}`,
    dipDb: r.dipDb,
    stepDb: r.stepDb,
    trim: `${r.out.trim} / ${r.inTrimDuringMix} → ${r.settledInTrim}`,
    causes: r.causes.map((c) => c.cause).join(", "),
  }))
}
