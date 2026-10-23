import { describe, expect, it, vi } from "vitest"
import { decodeFLX4, FLX4Decoder } from "./midi"
import { FLX4Feedback } from "./flx4-feedback"
import { emptyController, emptyDeck } from "./engine"
import type { EngineState } from "./engine"

const snapshot = (): EngineState => ({
  A: emptyDeck(),
  B: emptyDeck(),
  controller: emptyController(),
  crossfade: 0.5,
  channelMix: false,
  autoLevels: "",
  master: 0.7,
  auto: false,
  autoOut: null,
  autoPlan: null,
  transition: 0,
  autoStatus: "",
  recording: false,
  lastRecording: null,
  lastTracklist: null,
  previewing: false,
  error: null,
})
describe("FLX4 pad banks and physical button releases", () => {
  it("distinguishes all eight pad modes on both decks and ignores mode releases", () => {
    const notes = [0x1b, 0x1e, 0x20, 0x22, 0x69, 0x6b, 0x6d, 0x6f]
    for (const status of [0x90, 0x91])
      notes.forEach((note, index) => {
        expect(decodeFLX4([status, note, 127])).toEqual({
          type: "padMode",
          deck: status === 0x90 ? "A" : "B",
          value: index,
        })
        expect(decodeFLX4([status, note, 0])).toBeNull()
      })
  })
  it("keeps press and both note-off forms for all 32 FX presets on each deck", () => {
    for (const status of [0x97, 0x98, 0x99, 0x9a])
      for (const base of [0x10, 0x50])
        for (let pad = 0; pad < 8; pad++) {
          const expected = {
            type: "padfx",
            deck: status < 0x99 ? "A" : "B",
            value: (base === 0x50 ? 16 : 0) + (status % 2 === 0 ? 8 : 0) + pad,
          }
          expect(decodeFLX4([status, base + pad, 127])).toEqual({
            ...expected,
            pressed: true,
          })
          expect(decodeFLX4([status, base + pad, 0])).toEqual({
            ...expected,
            pressed: false,
          })
          expect(decodeFLX4([status - 0x10, base + pad, 127])).toEqual({
            ...expected,
            pressed: false,
          })
        }
  })
  it("retains FX assignment off messages and collapses paired 1&2 ON/OFF presses", () => {
    const decoder = new FLX4Decoder()
    expect(decoder.decode([0x94, 0x10, 127])).toEqual({
      type: "fxAssign",
      deck: "A",
      value: 1,
    })
    expect(decoder.decode([0x85, 0x11, 0])).toEqual({
      type: "fxAssign",
      deck: "B",
      value: 0,
    })
    expect(decoder.decode([0x94, 0x47, 127])?.type).toBe("fxToggle")
    expect(decoder.decode([0x95, 0x47, 127])).toBeNull()
    expect(decoder.decode([0x94, 0x47, 0])).toBeNull()
    expect(decoder.decode([0x94, 0x47, 127])?.type).toBe("fxToggle")
  })
  it("decodes master, phones, microphone and FX amount at full 14-bit precision", () => {
    for (const [status, control, type] of [
      [0xb6, 8, "master"],
      [0xb6, 5, "micLevel"],
      [0xb6, 12, "headphoneMix"],
      [0xb6, 13, "headphoneLevel"],
      [0xb4, 2, "fxAmount"],
    ] as const) {
      const decoder = new FLX4Decoder()
      expect(decoder.decode([status, control + 0x20, 1])).toBeNull()
      expect(decoder.decode([status, control, 64])).toMatchObject({
        type,
        value: 8193 / 16383,
      })
      decoder.decode([status, control, 127])
      expect(decoder.decode([status, control + 0x20, 127])?.value).toBe(1)
    }
  })
  it("ignores unassigned shifted pitch pads and decodes only the two range buttons", () => {
    for (const status of [0x98, 0x9a])
      for (const base of [0x40, 0x70]) {
        for (let pad = 0; pad < 6; pad++)
          expect(decodeFLX4([status, base + pad, 127])).toBeNull()
        for (const pad of [6, 7])
          expect(decodeFLX4([status, base + pad, 127])).toMatchObject({
            value: pad,
            shifted: true,
          })
      }
  })
  it("maps shifted load buttons and recognizes double-tap instant doubles per deck", () => {
    expect(decodeFLX4([0x96, 0x68, 127])?.type).toBe("browseRelated")
    expect(decodeFLX4([0x96, 0x7a, 127])?.type).toBe("libraryView")
    const decoder = new FLX4Decoder()
    const clock = vi.spyOn(performance, "now").mockReturnValue(100)
    for (const control of [0x46, 0x47]) {
      expect(decoder.decode([0x96, control, 127])?.type).toBe("load")
      decoder.decode([0x96, control, 0])
      clock.mockReturnValue(250)
      expect(decoder.decode([0x96, control, 127])?.type).toBe("instantDouble")
      decoder.decode([0x96, control, 0])
    }
    clock.mockRestore()
  })
})
describe("FLX4 feedback traffic", () => {
  it("sends LED changes once and clears them on disconnect", () => {
    const send = vi.fn(),
      feedback = new FLX4Feedback(send),
      state = snapshot()
    feedback.update(state)
    send.mockClear()
    feedback.update({
      ...state,
      A: { ...state.A, position: 4 },
      controller: { ...state.controller },
    })
    expect(send).not.toHaveBeenCalled()
    state.A.playing = true
    feedback.update(state)
    expect(send).toHaveBeenCalledExactlyOnceWith([0x90, 0x0b, 127])
    send.mockClear()
    feedback.clear()
    expect(send.mock.calls.length).toBeGreaterThan(0)
    expect(send.mock.calls.every(([packet]) => packet[2] === 0)).toBe(true)
  })
})
