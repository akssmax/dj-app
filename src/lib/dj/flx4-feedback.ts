import { padModes } from "./types"
import type { DeckId } from "./types"
import type { EngineState } from "./engine"

const modeNotes = [0x1b, 0x1e, 0x20, 0x22, 0x69, 0x6b, 0x6d, 0x6f]
const padNotes = [0, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70]
/** Only changed LED values are sent. No flashing, animation or SysEx permission. */
export class FLX4Feedback {
  private values = new Map<string, [number, number, number]>()
  constructor(private send: (message: number[]) => void) {}
  private write(status: number, note: number, on: boolean) {
    const value = on ? 127 : 0,
      key = `${status}:${note}`
    if (this.values.get(key)?.[2] === value) return
    this.values.set(key, [status, note, value])
    this.send([status, note, value])
  }
  update(state: EngineState) {
    for (const id of ["A", "B"] as DeckId[]) {
      const deck = state[id],
        status = id === "A" ? 0x90 : 0x91,
        pads = id === "A" ? 0x97 : 0x99
      this.write(status, 0x0b, deck.playing)
      this.write(status, 0x0c, !!deck.track)
      this.write(
        status,
        0x58,
        !!deck.syncTo || state.controller.syncMaster === id
      )
      this.write(status, 0x54, deck.headphoneCue)
      this.write(status, 0x4d, !!deck.loop)
      this.write(status, 0x10, deck.loopAdjust === "in" || !!deck.loop)
      this.write(status, 0x11, deck.loopAdjust === "out" || !!deck.loop)
      padModes.forEach((mode, index) =>
        this.write(status, modeNotes[index], deck.padMode === mode)
      )
      const modeIndex = padModes.indexOf(deck.padMode)
      for (let pad = 0; pad < 8; pad++) {
        const ready =
          deck.padMode === "hotcue"
            ? deck.cues[pad] !== null
            : deck.padMode === "sampler"
              ? deck.samplerSlots[pad].playing
              : deck.padMode === "keyshift" || deck.padMode === "keyboard"
                ? deck.keyShift === deck.padBank + pad
                : deck.padMode === "padfx1" || deck.padMode === "padfx2"
                  ? deck.activePads.some((index) => index % 8 === pad)
                  : !!deck.track
        this.write(pads, padNotes[modeIndex] + pad, ready)
      }
    }
    const controls = state.controller
    this.write(0x96, 0x63, controls.masterCue)
    this.write(0x96, 0, controls.smartCFX)
    this.write(0x96, 1, controls.smartFader)
    this.write(
      0x94,
      0x47,
      controls.fxTarget === "both"
        ? state.A.fx.enabled || state.B.fx.enabled
        : state[controls.fxTarget].fx.enabled
    )
  }
  clear() {
    for (const [status, note] of this.values.values())
      this.send([status, note, 0])
    this.values.clear()
  }
}
