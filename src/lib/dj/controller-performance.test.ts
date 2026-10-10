import { afterEach, describe, expect, it, vi } from "vitest"
import { MidiActivity } from "./midi-activity"
import { selectSnapshot } from "./selection"

afterEach(() => vi.useRealTimers())

describe("controller diagnostics and rendering isolation", () => {
  it("keeps rapid MIDI logging bounded and publishes the final input once", () => {
    vi.useFakeTimers()
    const activity = new MidiActivity()
    const listener = vi.fn()
    const unsubscribe = activity.subscribe(listener)
    for (let value = 0; value < 128; value++) {
      activity.record({ type: "crossfade", value: value / 127 }, [
        0xb6,
        0x1f,
        value,
      ])
    }
    expect(listener).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(activity.getSnapshot().lastInput).toBe("CROSSFADE 1.000 · b6 1f 7f")
    expect(activity.getSnapshot().history).toHaveLength(12)
    unsubscribe()
    activity.reset()
  })

  it("discards pending messages on disconnect so an old packet cannot reappear", () => {
    vi.useFakeTimers()
    const activity = new MidiActivity()
    activity.record(null, [0x80, 0x0b, 0])
    activity.reset()
    vi.advanceTimersByTime(1000)
    expect(activity.getSnapshot()).toEqual({
      lastInput: "Waiting for input",
      history: [],
    })
  })
  it("labels known button releases without claiming the input is unmapped", () => {
    vi.useFakeTimers()
    const activity = new MidiActivity()
    activity.record({ type: "play", deck: "A", value: 1 }, [0x90, 11, 127])
    activity.record({ type: "play", deck: "A", value: 0 }, [0x90, 11, 0])
    vi.advanceTimersByTime(100)
    expect(activity.getSnapshot().lastInput).toBe(
      "Deck A · PLAY released · 90 0b 00"
    )
    expect(activity.getSnapshot().history[1]).toBe(
      "Deck A · PLAY 1.000 · 90 0b 7f"
    )
    activity.record(null, [0x80, 0x58, 0])
    vi.advanceTimersByTime(100)
    expect(activity.getSnapshot().lastInput).toBe(
      "Deck A · SYNC released · 80 58 00"
    )
    activity.reset()
  })

  it("does not invalidate unrelated controls, library or shell snapshots", () => {
    const select = selectSnapshot(
      (state: { knob: number; meter: number; playing: boolean }) => ({
        playing: state.playing,
      })
    )
    const first = select({ knob: 0, meter: 0, playing: false })
    for (let i = 0; i < 256; i++) {
      expect(select({ knob: i, meter: i / 256, playing: false })).toBe(first)
    }
    const started = select({ knob: 255, meter: 1, playing: true })
    expect(started).not.toBe(first)
    expect(started.playing).toBe(true)
    const knob = selectSnapshot((state: { value: number }) => state.value)
    expect(knob({ value: 0.000061 })).toBe(0.000061)
    expect(knob({ value: 1 })).toBe(1)
  })
})
