import { describe, expect, it } from "vitest"
import { emptyDeck } from "./engine"
import { levelerRecord } from "./leveler-log"
import {
  loudnessProfile,
  matchLoudness,
  prepareLoudness,
  TARGET_BODY_DB,
} from "./loudness"
import { planTransitions } from "./planner"
import { demoTracks } from "./tracks"

const source = { ...demoTracks[0], duration: 80, bpm: 120, camelot: "8A" }
const next = { ...source, id: "next" }
const fade = {
  ...planTransitions(source, next, 0, { outCue: 32, inCue: 16 }).find(
    (p) => p.id === "fade"
  )!,
  outStart: 0,
  inStart: 0,
}
const saved = emptyDeck()
function pcm(amplitude: number, seconds = 80, spikeAt?: number) {
  const sampleRate = 1000
  const data = Array.from({ length: 2 }, () =>
    Float32Array.from(
      { length: sampleRate * seconds },
      (_, i) => amplitude * Math.sin(i * 0.1)
    )
  )
  if (spikeAt !== undefined) data[0][spikeAt * sampleRate] = 0.99
  return {
    length: data[0].length,
    sampleRate,
    numberOfChannels: 2,
    getChannelData: (channel: number) => data[channel],
  }
}
const record = (levels: ReturnType<typeof matchLoudness>) =>
  levelerRecord(
    { mode: "lift", intent: "lift", pace: "dj" },
    fade,
    { out: source, in: next },
    { out: 0, in: 0 },
    { out: "outro", in: "intro" },
    levels
  )

const prepared = async (buffer: ReturnType<typeof pcm>) => {
  await prepareLoudness(buffer, undefined, async () => {})
  return buffer
}

describe("leveler", () => {
  it("ignores a transient outside the part of the track being mixed", () => {
    const levels = matchLoudness(
      pcm(0.5),
      pcm(0.25, 80, 70),
      fade,
      { out: saved, incoming: saved },
      1
    )
    expect(levels.diagnostics.inPeakDb).toBeCloseTo(-0.1, 1)
    expect(levels.headroomDb).toBe(0)
  })
  it("measures the same through a sample-free profile", async () => {
    const out = await prepared(pcm(0.4)),
      incoming = await prepared(pcm(0.25))
    const original = { out: saved, incoming: saved }
    const direct = matchLoudness(out, incoming, fade, original, 0.8)
    const profiled = matchLoudness(
      loudnessProfile(out)!,
      loudnessProfile(incoming)!,
      fade,
      original,
      0.8
    )
    expect(profiled.settledInTrim).toBeCloseTo(direct.settledInTrim, 1)
    expect(profiled.headroomDb).toBeCloseTo(direct.headroomDb, 1)
    // Same main level, moved under 1 dB toward the target.
    expect(Math.abs(record(direct).stepDb!)).toBeLessThanOrEqual(1)
  })
  it("matches main sections, so a quiet outro doesn't leave the next track low", async () => {
    const out = pcm(0.5),
      incoming = pcm(0.5)
    for (let c = 0; c < 2; c++) out.getChannelData(c).fill(0.05, 0, 40000)
    const levels = matchLoudness(
      await prepared(out),
      await prepared(incoming),
      fade,
      { out: saved, incoming: saved },
      0.8
    )
    expect(levels.diagnostics.basis).toBe("body")
    expect(Math.abs(record(levels).stepDb!)).toBeLessThanOrEqual(1)
  })
  it("holds the set within 3 dB of the target level", async () => {
    // Outgoing trimmed to +9 dB above the target: the next track lands at
    // target + 3, not further up.
    const levels = matchLoudness(
      await prepared(pcm(0.3)),
      await prepared(pcm(0.3)),
      fade,
      { out: { ...saved, trim: 9 }, incoming: saved },
      0.8
    )
    expect(levels.diagnostics.referenceDb).toBe(TARGET_BODY_DB + 3)
  })
  it("moves the set's level toward the target by at most 1 dB a mix", async () => {
    // Both tracks 4 dB above the target: the next one lands 1 dB lower.
    const loud = 10 ** ((TARGET_BODY_DB + 4) / 20) * Math.SQRT2
    const levels = matchLoudness(
      await prepared(pcm(loud)),
      await prepared(pcm(loud)),
      fade,
      { out: saved, incoming: saved },
      0.8
    )
    expect(levels.settledInTrim).toBeCloseTo(-1, 1)
  })
  it("takes overlap headroom mostly from the outgoing deck, only while both play", () => {
    const bass = {
      ...planTransitions(source, next, 0, { outCue: 32, inCue: 16 }).find(
        (p) => p.id === "bass"
      )!,
      outStart: 0,
      inStart: 0,
    }
    const levels = matchLoudness(
      pcm(0.99),
      pcm(0.99),
      bass,
      { out: saved, incoming: saved },
      1
    )
    expect(levels.outCut[0]).toBe(0)
    expect(Math.max(...levels.outCut)).toBeGreaterThan(
      Math.max(...levels.inCut)
    )
    // The incoming deck finishes at its own level: nothing left to release.
    expect(levels.inCut[256]).toBeLessThan(0.1)
    expect(levels.inTrim).toBeCloseTo(levels.settledInTrim, 1)
  })
})
