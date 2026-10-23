import { describe, expect, it } from "vitest"
import { demoTracks } from "./tracks"
import { recommendTracks } from "./library-scope"
import {
  arcAt,
  arcStep,
  defaultSetSettings,
  phaseBonus,
  setFit,
  setProgress,
  suggestTempo,
} from "./set-plan"
import type { SetSettings } from "./set-plan"
import type { Track } from "./types"

const keys = ["8A", "9A", "8B", "7A", "9B", "10A", "6A", "7B"]
const make = (i: number, extra: Partial<Track> = {}): Track => ({
  ...demoTracks[0],
  id: `t${i}`,
  title: `Track ${i}`,
  artist: `Artist ${i % 14}`,
  genre: "House",
  duration: 300,
  bpm: 118 + (i % 8) * 2,
  camelot: keys[i % keys.length],
  energy: 2 + (i % 8),
  ...extra,
})
const pool = Array.from({ length: 40 }, (_, i) => make(i))
const settings: SetSettings = {
  ...defaultSetSettings,
  minutes: 60,
  tempo: { start: 120, peak: 130 },
}

describe("set arc", () => {
  it("warms up, builds to a peak and closes", () => {
    const at = (f: number) => arcAt(settings, f)
    expect(at(0.1).phase).toBe("warmup")
    expect(at(0.4)).toMatchObject({ phase: "build", intent: "lift" })
    expect(at(0.7).phase).toBe("peak")
    expect(at(0.95)).toMatchObject({ phase: "close", intent: "ease" })
    expect(at(0.7).energy).toBeGreaterThan(at(0.1).energy + 3)
    expect(at(0.7).bpm!).toBeGreaterThan(at(0.1).bpm!)
    expect(at(0.7).pace).toBe("dj")
  })

  it("suggests a reachable tempo path from the playlist", () => {
    expect(suggestTempo(pool)).toEqual({ start: 120, peak: 130 })
  })

  it("never plays the same artist back to back and avoids key ping-pong", () => {
    const last = make(1, { artist: "Same", camelot: "9A" }),
      before = make(2, { camelot: "8A" })
    const target = arcAt(settings, 0.5)
    const repeat = setFit(make(3, { artist: "Same" }), target, [last])
    const fresh = setFit(make(3, { artist: "Other" }), target, [last])
    expect(repeat.score).toBeLessThan(fresh.score - 30)
    const pingPong = setFit(make(4, { camelot: "8A" }), target, [before, last])
    const onward = setFit(make(4, { camelot: "10A" }), target, [before, last])
    expect(pingPong.score).toBeLessThan(onward.score)
  })

  it("rewards the routines of each part of the set until they are overused", () => {
    expect(phaseBonus("long", "warmup", [])).toBeGreaterThan(0)
    expect(phaseBonus("dropswap", "peak", [])).toBeGreaterThan(0)
    expect(phaseBonus("cut", "warmup", [])).toBeLessThan(0)
    expect(phaseBonus("long", "warmup", ["long", "long", "long"])).toBeLessThan(
      0
    )
  })
})

describe("mixing a whole set", () => {
  // Fourteen tracks over an hour: pick each from the pool with the arc.
  const simulate = () => {
    let out = make(0, { energy: 4, bpm: 120 })
    const history: Track[] = [out],
      used: string[] = [],
      played = new Set([out.id])
    const picks: {
      track: Track
      target: ReturnType<typeof arcAt>
      plan: string
    }[] = []
    for (let i = 1; i <= 14; i++) {
      const fraction = i / 15
      const now = arcAt(settings, fraction)
      const [next] = recommendTracks(out, pool, undefined, 1, now.intent, {
        played,
        lookahead: true,
        pace: now.pace,
        set: {
          now,
          ahead: [
            arcAt(settings, fraction + 1 / 15),
            arcAt(settings, fraction + 2 / 15),
          ],
          history,
          used,
        },
        limit: 1,
      })
      picks.push({ track: next.track, target: now, plan: next.plan.id })
      used.push(next.plan.id)
      history.push(next.track)
      played.add(next.track.id)
      out = next.track
    }
    return picks
  }
  const picks = simulate()

  it("follows the energy arc", () => {
    const error =
      picks.reduce(
        (sum, p) => sum + Math.abs((p.track.energy ?? 5) - p.target.energy),
        0
      ) / picks.length
    expect(error).toBeLessThanOrEqual(1.5)
  })

  it("drifts tempo gradually", () => {
    const steps = picks
      .slice(1)
      .map((p, i) => Math.abs(p.track.bpm! - picks[i].track.bpm!))
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length
    expect(mean).toBeLessThanOrEqual(3)
  })

  it("never repeats an artist back to back", () => {
    for (let i = 1; i < picks.length; i++)
      expect(picks[i].track.artist).not.toBe(picks[i - 1].track.artist)
  })

  it("shifts from blends early towards short, punchy routines at the peak", () => {
    const blends = ["long", "blend", "bass", "filterin", "breakswap"]
    const share = (phase: string) => {
      const inPhase = picks.filter((p) => p.target.phase === phase)
      return (
        inPhase.filter((p) => blends.includes(p.plan)).length /
        Math.max(1, inPhase.length)
      )
    }
    expect(share("warmup")).toBeGreaterThan(share("peak"))
  })
})

describe("looking ahead", () => {
  it("avoids a pick that leaves nowhere good to go next", () => {
    const out = make(0, { energy: 5, bpm: 124, camelot: "8A" })
    // The energy target fits now (5) but its key (8B) clashes with all that
    // could follow, against a near fit (9A) that leads on to 10A.
    const dead = make(1, { energy: 5, bpm: 124, camelot: "8B", artist: "X" })
    const bridge = make(2, { energy: 6, bpm: 124, camelot: "9A", artist: "Z" })
    const onward = [3, 4, 5, 6].map((i) =>
      make(i, { energy: 6, bpm: 124, camelot: "10A", artist: `Y${i}` })
    )
    const now = arcAt({ ...settings, arc: "flat", tempo: null }, 0.5)
    const [pick] = recommendTracks(
      out,
      [dead, bridge, ...onward],
      undefined,
      1,
      now.intent,
      {
        lookahead: true,
        set: { now, ahead: [now, now], history: [out], used: [] },
        limit: 1,
      }
    )
    expect(pick.track.id).toBe(bridge.id)
    expect(pick.path[0].camelot).toBe("10A")
  })
})

describe("short sets", () => {
  it("covers the whole arc in a 15-minute set", () => {
    const short = { ...defaultSetSettings, minutes: 15 }
    // About four tracks fit, so each moves the set a quarter of the way.
    expect(arcStep(short, 26)).toBeCloseTo(210 / 900, 5)
    expect(setProgress(short, 15 * 60, 4, 22)).toBe(1)
  })
})
