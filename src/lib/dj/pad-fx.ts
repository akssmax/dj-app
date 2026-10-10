import type { DeckState } from "./types"

export type PadFXPreset = {
  label: string
  fx?: Partial<DeckState["fx"]>
  filter?: number
  roll?: number
}
const echo = (beats: number, amount = 0.7): PadFXPreset => ({
  label: `Echo ${beats} beat`,
  fx: { type: "echo", enabled: true, amount, beats },
})
const reverb = (amount: number): PadFXPreset => ({
  label: `Reverb ${Math.round(amount * 100)}%`,
  fx: { type: "reverb", enabled: true, amount },
})
const roll = (beats: number): PadFXPreset => ({
  label: `Roll ${beats} beat`,
  roll: beats,
})
const filter = (value: number): PadFXPreset => ({
  label: value < 0 ? "Low-pass" : "High-pass",
  filter: value,
})

// Cue's own audible pad presets. Banks 2 and 4 are reached with SHIFT.
export const padFXPresets: PadFXPreset[] = [
  echo(0.25),
  echo(0.5),
  echo(1),
  echo(2),
  reverb(0.4),
  reverb(0.8),
  filter(-0.65),
  filter(0.65),
  echo(0.25, 0.4),
  echo(0.5, 0.4),
  echo(1, 0.9),
  echo(2, 0.9),
  reverb(0.25),
  reverb(1),
  roll(0.25),
  roll(0.5),
  roll(0.25),
  roll(0.5),
  roll(1),
  roll(2),
  filter(-0.85),
  filter(0.85),
  reverb(1),
  echo(0.75),
  roll(0.125),
  roll(0.25),
  roll(2),
  roll(4),
  { ...echo(0.5), filter: -0.55, label: "Filtered echo" },
  { ...reverb(0.8), filter: 0.55, label: "Filtered reverb" },
  echo(1.5),
  echo(2, 1),
]
