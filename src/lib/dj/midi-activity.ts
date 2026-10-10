import { decodeFLX4 } from "./midi"
import type { MidiAction } from "./midi"

const waiting = { lastInput: "Waiting for input", history: [] as string[] }

/** Diagnostics have their own slow subscription; audio never waits for this log. */
export class MidiActivity {
  private snapshot = waiting
  private listeners = new Set<() => void>()
  private pending: { action: MidiAction | null; bytes: number[] }[] = []
  private timer?: ReturnType<typeof setTimeout>
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.snapshot
  getServerSnapshot = () => waiting
  record(action: MidiAction | null, data: ArrayLike<number>) {
    this.pending.unshift({ action, bytes: Array.from(data) })
    this.pending.length = Math.min(12, this.pending.length)
    if (this.timer === undefined)
      this.timer = setTimeout(() => this.flush(), 100)
  }
  private flush() {
    this.timer = undefined
    const entries = this.pending.map(({ action, bytes }) => {
      const raw = bytes.map((v) => v.toString(16).padStart(2, "0")).join(" ")
      const release =
        (bytes[0] & 0xf0) === 0x80 ||
        ((bytes[0] & 0xf0) === 0x90 && bytes[2] === 0)
      const mapped =
        action ??
        (release ? decodeFLX4([(bytes[0] & 0x0f) | 0x90, bytes[1], 127]) : null)
      if (release && mapped)
        return `${mapped.deck ? `Deck ${mapped.deck} · ` : ""}${mapped.type.toUpperCase()} released · ${raw}`
      if (!action && (bytes[0] & 0xf0) === 0x90) {
        const held = decodeFLX4(bytes)
        if (held)
          return `${held.deck ? `Deck ${held.deck} · ` : ""}${held.type.toUpperCase()} repeat ignored · ${raw}`
      }
      if (!action && (bytes[0] & 0xf0) === 0xb0 && bytes[1] >= 0x20) {
        const pending = decodeFLX4([bytes[0], bytes[1] - 0x20, bytes[2]])
        if (pending)
          return `${pending.deck ? `Deck ${pending.deck} · ` : ""}${pending.type.toUpperCase()} waiting for MSB · ${raw}`
      }
      return action
        ? `${action.deck ? `Deck ${action.deck} · ` : ""}${action.type.toUpperCase()} ${action.value.toFixed(3)} · ${raw}`
        : `Unmapped MIDI · ${raw}`
    })
    this.pending = []
    this.snapshot = {
      lastInput: entries[0] ?? this.snapshot.lastInput,
      history: [...entries, ...this.snapshot.history].slice(0, 12),
    }
    this.listeners.forEach((listener) => listener())
  }
  reset() {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.pending = []
    this.snapshot = waiting
    this.listeners.forEach((listener) => listener())
  }
}
