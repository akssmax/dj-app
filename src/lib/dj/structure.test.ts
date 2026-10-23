import { describe, expect, it } from "vitest"
import { consensusTempo, phraseStructure, vocalPresence } from "./structure"

const RATE = 22050
const seconds = 8
const length = RATE * seconds
const mean = (values: number[]) =>
  values.reduce((sum, v) => sum + v, 0) / values.length

/** Harmonic tone (voice-like spectrum) at `hz` with an amplitude envelope. */
function tone(hz: number, envelope: (t: number) => number, detune = 0) {
  return Float32Array.from({ length }, (_, i) => {
    const t = i / RATE
    let sample = 0
    for (let h = 1; h <= 12; h++)
      sample += Math.sin(2 * Math.PI * (hz + detune) * h * t) / h
    return 0.3 * sample * envelope(t)
  })
}
// Syllables: ~5 per second, deep level changes like speech or singing.
const syllables = (t: number) =>
  Math.max(0, Math.sin(2 * Math.PI * 2.5 * t)) ** 2

describe("vocal / lead presence", () => {
  it("flags a centered, tonal, syllabic voice", () => {
    const voice = tone(220, syllables)
    expect(mean(vocalPresence([voice, voice], RATE))).toBeGreaterThan(0.5)
  })
  it("ignores a wide, steady pad", () => {
    const left = tone(220, () => 1, 0),
      right = tone(220, () => 1, 3)
    // Opposite-phase detune keeps the pad wide in the stereo field.
    const wide = right.map((v) => -v)
    expect(mean(vocalPresence([left, wide], RATE))).toBeLessThan(0.15)
  })
  it("finds the voice inside a mix and ignores a pad with claps", () => {
    let seed = 3
    const noise = () =>
      ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
    const claps = Float32Array.from({ length }, (_, i) =>
      (i / RATE) % 0.5 < 0.06 ? noise() * 0.4 : 0
    )
    const pad = tone(220, () => 0.3)
    const bed = pad.map((v, i) => v + claps[i])
    expect(mean(vocalPresence([bed, bed], RATE))).toBeLessThan(0.15)
    const voice = tone(220, syllables)
    const song = bed.map((v, i) => v + voice[i])
    expect(mean(vocalPresence([song, song], RATE))).toBeGreaterThan(0.5)
  })
  it("hears a voice entering over a wide stereo track", () => {
    // Wide accompaniment; a centred voice joins for the last 3 seconds.
    const left = tone(330, () => 0.6),
      right = tone(330, () => 0.6, 4).map((v) => -v)
    const voice = tone(196, (t) => (t >= 5 ? syllables(t) : 0))
    const vocals = vocalPresence(
      [left.map((v, i) => v + voice[i]), right.map((v, i) => v + voice[i])],
      RATE
    )
    expect(mean(vocals.slice(0, 4))).toBeLessThan(0.15)
    expect(mean(vocals.slice(6, 8))).toBeGreaterThan(0.5)
  })
  it("ignores noisy drum hits and silence", () => {
    let seed = 7
    const noise = () =>
      ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
    const drums = Float32Array.from({ length }, (_, i) =>
      (i / RATE) % 0.5 < 0.06 ? noise() * 0.8 : 0
    )
    expect(mean(vocalPresence([drums, drums], RATE))).toBeLessThan(0.15)
    const silence = new Float32Array(length)
    expect(vocalPresence([silence, silence], RATE).every((v) => v === 0)).toBe(
      true
    )
  })
})

describe("phrase alignment", () => {
  it("finds phrase starts at the arrangement changes, not the first beat", () => {
    const bpm = 120,
      bar = 2,
      duration = bar * 80,
      perSecond = 50
    // The arrangement changes every 16 bars starting at bar 4.
    const level = (t: number) =>
      Math.floor((t / bar - 4) / 16) % 2 === 0 ? 1 : 0.2
    const curve = Array.from({ length: duration * perSecond }, (_, i) =>
      level(i / perSecond)
    )
    const bands = { rms: curve, low: curve, mid: curve, high: curve }
    const result = phraseStructure(bands, [], duration, bpm, 0)
    expect(result.phraseOffset).toBeCloseTo(4 * bar, 3)
    expect(result.sections).toContain(4 * bar + 16 * bar)
  })
})

describe("tempo consensus", () => {
  it("ignores one window that locked onto half time", () => {
    expect(consensusTempo([128, 64, 128.4])).toBeCloseTo(128.4, 1)
    expect(consensusTempo([null, 124, null])).toBe(124)
    expect(consensusTempo([null, null])).toBeNull()
  })
})
