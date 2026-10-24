import type { AutomationChannel } from "./automation"
import type { AutomixOptions } from "./automix-session"
import { emptyDeck } from "./engine"
import type { DJEngine } from "./engine"
import {
  clearLevelerLog,
  levelerLog,
  levelerRecord,
  levelerRows,
  levelerSummary,
  line,
} from "./leveler-log"
import type { LevelerMode, LevelerRecord } from "./leveler-log"
import { recommendTracks } from "./library-scope"
import { readLinkedFile } from "./linked-files"
import { loudnessProfile, matchLoudness, prepareLoudness } from "./loudness"
import { sectionAt } from "./sections"
import { arcAt, arcStep } from "./set-plan"
import type { MixIntent, Track } from "./types"

// Replays automix's track and routine choices over the library for each
// energy mode, running the real leveler on decoded audio. Nothing plays.

type Profile = NonNullable<ReturnType<typeof loudnessProfile>>
const profiles = new Map<string, Profile | null>()

async function profile(track: Track) {
  if (profiles.has(track.id)) return profiles.get(track.id) ?? null
  let result: Profile | null = null
  try {
    const file = track.linkedFile
      ? await readLinkedFile(track.linkedFile)
      : track.file
    const bytes = file
      ? await file.arrayBuffer()
      : await (await fetch(track.url)).arrayBuffer()
    // Decoded once, reduced to section totals, then released.
    const buffer = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(
      bytes
    )
    await prepareLoudness(buffer)
    result = loudnessProfile(buffer)
  } catch (error) {
    console.warn(`[leveler sim] skipped ${track.title}:`, error)
  }
  profiles.set(track.id, result)
  return result
}

// A freshly loaded deck, as automix leaves it before a mix.
const channel = (trim: number): AutomationChannel => {
  const deck = emptyDeck()
  return { ...deck, fx: { ...deck.fx }, volume: 0.8, trim }
}

export async function simulateLeveler(
  options: AutomixOptions,
  {
    steps = 10,
    modes = ["set", "ease", "maintain", "lift"] as LevelerMode[],
    start,
  }: { steps?: number; modes?: LevelerMode[]; start?: string } = {}
) {
  const pool = options.pool.filter(
    (t) => t.available !== false && t.bpm && t.analysis
  )
  const first =
    pool.find((t) => t.id === start || t.title === start) ?? pool.at(0)
  if (!first) {
    console.warn("[leveler sim] no analyzed tracks in the current view")
    return []
  }
  const records: LevelerRecord[] = []
  for (const mode of modes) {
    const settings = { ...options.session.setPlan, follow: true }
    const played = new Set<string>([first.id])
    const history: Track[] = []
    let out = first,
      position = 0,
      trim = 0
    for (let i = 0; i < steps; i++) {
      const fraction = i / steps
      const set =
        mode === "set"
          ? {
              now: arcAt(settings, fraction),
              ahead: [1, 2].map((k) =>
                arcAt(settings, fraction + arcStep(settings, steps + 1) * k)
              ),
              history: [...history, out],
              used: [],
            }
          : undefined
      const intent: MixIntent =
        set?.now.intent ??
        (mode === "ease" || mode === "lift" ? mode : "maintain")
      const pace = set?.now.pace ?? options.session.mixPace
      const pick = recommendTracks(out, pool, undefined, 1, intent, {
        position,
        recent: records.slice(-6).map((r) => r.routine),
        technique: options.session.transitionTechnique,
        transitionCues: options.session.transitionCues,
        cues: options.cues,
        labels: options.labels,
        played,
        lookahead: true,
        pace,
        fx: { amount: options.session.fxAmount, recent: [] },
        taste: { saved: options.saved, ratings: options.ratings },
        set,
        limit: 1,
      }).at(0)
      if (!pick) break
      const [a, b] = await Promise.all([profile(out), profile(pick.track)])
      played.add(pick.track.id)
      if (!a || !b) {
        out = pick.track
        position = 0
        trim = 0
        continue
      }
      const plan = pick.plan
      const levels = matchLoudness(
        a,
        b,
        plan,
        { out: channel(trim), incoming: channel(0) },
        0.8
      )
      const record = levelerRecord(
        {
          mode,
          intent,
          pace,
        },
        plan,
        { out, in: pick.track },
        { out: trim, in: 0 },
        {
          out: sectionAt(out, plan.outStart)?.label ?? null,
          in: sectionAt(pick.track, plan.inStart)?.label ?? null,
        },
        levels,
        true
      )
      records.push(record)
      console.log(`[leveler] ${line(record)}`)
      history.push(out)
      out = pick.track
      position = plan.inStart + plan.duration * plan.rate
      trim = levels.settledInTrim
    }
  }
  console.table(levelerRows(records))
  console.log("[leveler sim] summary", levelerSummary(records))
  return records
}

/** `cueLeveler` in the console: the live log, summaries and the sim. */
export function installLevelerDebug(
  getOptions: () => AutomixOptions,
  engine: DJEngine
) {
  const api = {
    /**
     * Sample the master output for `seconds` while you play: per-second RMS
     * (dBFS) with transitions marked, so a level hole shows as a number.
     */
    watch: async (seconds = 120) => {
      const rows: {
        t: number
        db: number | null
        /** Transition progress (0–1) while one is under way, else null. */
        mix: number | null
        /** Each deck's trim (dB) and fader. */
        A: string
        B: string
      }[] = []
      const started = Date.now()
      let sum = 0,
        count = 0
      while (Date.now() - started < seconds * 1000) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        const level = engine.readMasterLevel()
        if (level !== null) {
          sum += level * level
          count++
        }
        const t = Math.floor((Date.now() - started) / 1000)
        if (t > (rows.at(-1)?.t ?? -1)) {
          const rms = count ? Math.sqrt(sum / count) : 0
          const { A, B, transition } = engine.state
          const deck = (d: typeof A) =>
            `${d.playing ? "▶" : "·"} ${d.trim.toFixed(1)} dB · ${d.volume.toFixed(2)}`
          rows.push({
            t,
            db: rms > 0 ? Math.round(20 * Math.log10(rms) * 10) / 10 : null,
            mix:
              engine.state.auto && transition > 0 && transition < 1
                ? Math.round(transition * 100) / 100
                : null,
            A: deck(A),
            B: deck(B),
          })
          sum = 0
          count = 0
        }
      }
      console.table(rows)
      return rows
    },
    log: () => levelerLog(),
    table: () => console.table(levelerRows()),
    summary: () => levelerSummary(),
    clear: clearLevelerLog,
    verbose: (on = true) => {
      try {
        if (on) localStorage.setItem("cue.levelerDebug", "1")
        else localStorage.removeItem("cue.levelerDebug")
      } catch {
        // Storage blocked.
      }
    },
    download: () => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(levelerLog(), null, 2)], {
          type: "application/json",
        })
      )
      const a = document.createElement("a")
      a.href = url
      a.download = `leveler-log-${new Date().toISOString().slice(0, 19)}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
    sim: (opts?: Parameters<typeof simulateLeveler>[1]) =>
      simulateLeveler(getOptions(), opts),
  }
  ;(globalThis as { cueLeveler?: typeof api }).cueLeveler = api
  return () => {
    delete (globalThis as { cueLeveler?: typeof api }).cueLeveler
  }
}
