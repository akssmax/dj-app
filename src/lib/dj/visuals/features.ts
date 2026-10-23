import { beatOffset } from "../beatgrid"
import { deckMixGain } from "../engine"
import { sectionAt } from "../sections"
import {
  blendPalettes,
  idlePalette,
  linearPalette,
  paletteForCamelot,
  palettes,
  rotateHue,
  themePalette,
} from "./palettes"
import type { ColorMode, ThemeColors } from "./palettes"
import type { DJEngine } from "../engine"
import type { SectionLabel } from "../sections"
import type { DeckId } from "../types"

export const SPECTRUM_BINS = 64

/** How hard each section drives the visuals; breakdowns breathe, drops hit. */
const sectionEnergy: Record<SectionLabel, number> = {
  intro: 0.6,
  build: 0.8,
  drop: 1,
  breakdown: 0.45,
  body: 0.85,
  outro: 0.55,
}

/** Everything a scene reads in one frame. */
export type VisualFrame = {
  bass: number
  mid: number
  high: number
  /** Kick envelope from the beatgrid, 1 on the beat decaying to 0. */
  pulse: number
  /** Position in the bar, 0–1. */
  bar: number
  /** Distance travelled, faster with bass: tunnels and ripples scroll by it. */
  travel: number
  energy: number
  flash: number
  spectrum: Uint8Array<ArrayBuffer>
  palette: Float32Array
  playing: boolean
}

/** One-frame events for the scene director. */
export type VisualEvents = { drop: boolean; phrase: boolean }

/** Average of `bins` between two frequencies, 0–1. */
export function bandLevel(
  bins: Uint8Array,
  sampleRate: number,
  low: number,
  high: number
) {
  const hz = sampleRate / 2 / bins.length,
    from = Math.max(1, Math.floor(low / hz)),
    to = Math.max(from + 1, Math.min(bins.length, Math.ceil(high / hz)))
  let sum = 0
  for (let i = from; i < to; i++) sum += bins[i]
  return sum / (to - from) / 255
}

/** Fold the FFT into log-spaced bars from 40 Hz to 16 kHz, tilted so highs show. */
export function logSpectrum(
  bins: Uint8Array,
  sampleRate: number,
  out: Uint8Array
) {
  const hz = sampleRate / 2 / bins.length
  for (let i = 0; i < out.length; i++) {
    const from = Math.max(1, Math.floor((40 * 400 ** (i / out.length)) / hz)),
      to = Math.max(
        from + 1,
        Math.min(
          bins.length,
          Math.floor((40 * 400 ** ((i + 1) / out.length)) / hz)
        )
      )
    let peak = 0
    for (let j = from; j < to; j++) peak = Math.max(peak, bins[j])
    out[i] = Math.min(255, peak * (0.85 + (0.5 * i) / out.length))
  }
  return out
}

const follow = (value: number, target: number, rate: number, dt: number) =>
  value + (target - value) * Math.min(1, rate * dt)

/**
 * Turns the master output and the decks' beatgrids into smooth per-frame
 * values. Beats come from the grid, so pulses land exactly on the kick;
 * the spectrum adds texture on top.
 */
export class VisualDriver {
  private fft: Uint8Array<ArrayBuffer>
  private peaks = { bass: 0.3, mid: 0.3, high: 0.3 }
  private bassSlow = 0
  private idleBeats = 0
  private lastPhrase = -1
  private lastSection: SectionLabel | null = null
  private target = new Float32Array(12)
  private deckColors = { A: new Float32Array(12), B: new Float32Array(12) }
  /** Spectrum mode: each new track takes the next slot; phrases and drops shift all. */
  private slots: Partial<Record<DeckId, { track: string; slot: number }>> = {}
  private nextSlot = 0
  private shift = 0
  private idleTimer = 0
  private time = 0
  private snap = 0
  colorMode: ColorMode = "spectrum"
  themeColors: ThemeColors | null = null
  readonly frame: VisualFrame = {
    bass: 0,
    mid: 0,
    high: 0,
    pulse: 0,
    bar: 0,
    travel: 0,
    energy: 0.35,
    flash: 0,
    spectrum: new Uint8Array(SPECTRUM_BINS),
    palette: linearPalette(idlePalette),
    playing: false,
  }

  constructor(private engine: DJEngine) {
    this.fft = new Uint8Array(engine.masterSpectrumSize)
  }

  update(dt: number): VisualEvents {
    const frame = this.frame,
      state = this.engine.getSnapshot(),
      events = { drop: false, phrase: false }
    const decks = (["A", "B"] as DeckId[]).filter(
      (id) => state[id].playing && state[id].track
    )
    const weight = (id: DeckId) => deckMixGain(state, id)
    const lead = decks.sort((a, b) => weight(b) - weight(a))[0] as
      DeckId | undefined
    frame.playing = !!lead

    // Bands: normalised against a slowly decaying peak so quiet and loud
    // masters react the same.
    const heard = lead && this.engine.readMasterSpectrum(this.fft)
    const sampleRate = this.engine.sampleRate
    const bands = {
      bass: heard ? bandLevel(this.fft, sampleRate, 30, 150) : 0,
      mid: heard ? bandLevel(this.fft, sampleRate, 400, 2500) : 0,
      high: heard ? bandLevel(this.fft, sampleRate, 5000, 14000) : 0,
    }
    for (const band of ["bass", "mid", "high"] as const) {
      this.peaks[band] = Math.max(
        bands[band],
        this.peaks[band] - dt * 0.04,
        0.2
      )
      const level = bands[band] / this.peaks[band]
      frame[band] = follow(frame[band], level, level > frame[band] ? 30 : 5, dt)
    }
    if (heard) logSpectrum(this.fft, sampleRate, frame.spectrum)
    else
      for (let i = 0; i < SPECTRUM_BINS; i++)
        frame.spectrum[i] = Math.max(0, frame.spectrum[i] - dt * 300)

    // Beat phase from the lead deck's grid; drift slowly when idle.
    let beats: number,
      strength = 1,
      energy = 0.35
    const track = lead ? state[lead].track : null
    if (lead && track?.bpm) {
      const position = this.engine.livePosition(lead)
      beats = ((position - beatOffset(track)) * track.bpm) / 60
      const section = sectionAt(track, position)?.label ?? "body"
      energy = sectionEnergy[section]
      if (section === "breakdown") strength = 0.25
      if (section === "drop" && this.lastSection && this.lastSection !== "drop")
        events.drop = true
      this.lastSection = section
    } else {
      this.idleBeats += dt * (lead ? 2 : 0.75)
      beats = this.idleBeats
      strength = lead ? 0.6 : 0.3
      energy = lead ? 0.75 : 0.35
      this.lastSection = null
    }
    const fraction = beats - Math.floor(beats)
    // Grid-free tracks still pulse on bass onsets.
    this.bassSlow = follow(this.bassSlow, frame.bass, 3, dt)
    const onset = Math.max(0, frame.bass - this.bassSlow) * 2.5
    frame.pulse = Math.min(
      1,
      Math.max(Math.exp(-fraction * 6) * strength, track?.bpm ? 0 : onset)
    )
    frame.bar = (((beats / 4) % 1) + 1) % 1
    const phrase = Math.floor(beats / 64)
    if (lead && this.lastPhrase >= 0 && phrase !== this.lastPhrase)
      events.phrase = true
    this.lastPhrase = lead ? phrase : -1

    frame.energy = follow(frame.energy, energy, 1.5, dt)
    if (events.drop) frame.flash = 1
    frame.flash = Math.max(0, frame.flash - dt * 2.2)
    frame.travel += dt * (0.25 + 1.4 * frame.bass + 0.4 * frame.pulse)

    this.updatePalette(dt, decks, weight, events, !!lead)
    return events
  }

  private updatePalette(
    dt: number,
    decks: DeckId[],
    weight: (id: DeckId) => number,
    events: VisualEvents,
    playing: boolean
  ) {
    const state = this.engine.getSnapshot(),
      frame = this.frame
    this.time += dt
    // Spectrum steps one palette per 16-bar phrase and jumps on drops; while
    // idle it still moves every 20 s.
    if (events.drop) {
      this.shift += 2
      this.snap = 0.6
    } else if (events.phrase) this.shift += 1
    this.idleTimer = playing ? 0 : this.idleTimer + dt
    if (this.idleTimer > 20) {
      this.idleTimer = 0
      this.shift += 1
    }
    const mode = this.colorMode
    if (mode === "theme" && this.themeColors) {
      const a = decks.includes("A") ? weight("A") : 0,
        b = decks.includes("B") ? weight("B") : 0
      themePalette(this.themeColors, a + b > 0 ? b / (a + b) : 0, this.target)
    } else {
      const spectrum = mode !== "key"
      const paletteFor = (id: DeckId) => {
        if (!spectrum)
          return paletteForCamelot(state[id].track?.camelot ?? null)
        const track = state[id].track?.id ?? ""
        if (this.slots[id]?.track !== track)
          this.slots[id] = { track, slot: this.nextSlot++ }
        // Slots sit 5 palettes apart so consecutive tracks contrast.
        return (this.slots[id].slot * 5 + this.shift) % palettes.length
      }
      if (decks.length)
        blendPalettes(
          decks.map((id) => ({
            colors: linearPalette(paletteFor(id), this.deckColors[id]),
            gain: weight(id),
          })),
          this.target
        )
      else
        linearPalette(
          spectrum ? this.shift % palettes.length : idlePalette,
          this.target
        )
      if (spectrum)
        rotateHue(this.target, 0.5 * Math.sin((this.time * 2 * Math.PI) / 30))
    }
    const rate = this.snap > 0 ? 6 : 1.2
    this.snap = Math.max(0, this.snap - dt)
    for (let i = 0; i < 12; i++)
      frame.palette[i] = follow(frame.palette[i], this.target[i], rate, dt)
  }
}
