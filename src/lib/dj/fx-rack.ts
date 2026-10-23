import { echoDelay } from "./beatgrid"
import type { FXCue } from "./types"

/**
 * Auto-FX nodes on one channel. They sit beside the controls the person and
 * the transition automation use, so an effect never fights a knob:
 *
 *   source → sourceGate → (input analyser … EQ … filter)
 *     → fxHigh → fxLow → gate → channel fader
 *          └→ flanger ┘
 *   fader → echoSend → echo delay ⟲   (post-fader: tails outlive the fader)
 *   fader → reverbSend → shared reverb
 *
 * Overlay sources (rolls, brakes, spinbacks) feed the analyser directly
 * while sourceGate mutes the deck's own source, which keeps running in
 * time underneath, like slip mode.
 */
export type FXRack = {
  sourceGate: GainNode
  fxHigh: BiquadFilterNode
  fxLow: BiquadFilterNode
  gate: GainNode
  flangeDelay: DelayNode
  flangeFeedback: GainNode
  flangeWet: GainNode
  echoSend: GainNode
  /** Where other sources (a stem tap) feed the echo, after its send. */
  echoInput: AudioNode
  echoDelay: DelayNode
  echoFeedback: GainNode
  reverbSend: GainNode
}

export const RACK_REST = {
  high: 10,
  low: 22000,
  feedback: 0.45,
} as const

export function createFXRack(
  ctx: BaseAudioContext,
  channel: {
    filter: AudioNode
    gain: AudioNode
    inputAnalyser: AudioNode
    analyser: AudioNode
  },
  reverbInput: AudioNode
): FXRack {
  const sourceGate = ctx.createGain(),
    fxHigh = ctx.createBiquadFilter(),
    fxLow = ctx.createBiquadFilter(),
    gate = ctx.createGain(),
    flangeDelay = ctx.createDelay(0.05),
    flangeFeedback = ctx.createGain(),
    flangeWet = ctx.createGain(),
    echoSend = ctx.createGain(),
    echoFilter = ctx.createBiquadFilter(),
    echoDelayNode = ctx.createDelay(4),
    echoFeedback = ctx.createGain(),
    reverbSend = ctx.createGain()
  fxHigh.type = "highpass"
  fxHigh.frequency.value = RACK_REST.high
  fxLow.type = "lowpass"
  fxLow.frequency.value = RACK_REST.low
  gate.gain.value = 1
  sourceGate.gain.value = 1
  flangeDelay.delayTime.value = 0.003
  flangeFeedback.gain.value = 0
  flangeWet.gain.value = 0
  echoSend.gain.value = 0
  echoFilter.type = "highpass"
  echoFilter.frequency.value = 250
  echoFeedback.gain.value = RACK_REST.feedback
  reverbSend.gain.value = 0
  sourceGate.connect(channel.inputAnalyser)
  channel.filter.disconnect(channel.gain)
  channel.filter.connect(fxHigh)
  fxHigh.connect(fxLow)
  fxLow.connect(gate)
  fxLow.connect(flangeDelay)
  flangeDelay.connect(flangeWet)
  flangeDelay.connect(flangeFeedback)
  flangeFeedback.connect(flangeDelay)
  flangeWet.connect(gate)
  gate.connect(channel.gain)
  channel.gain.connect(echoSend)
  echoSend.connect(echoFilter)
  echoFilter.connect(echoDelayNode)
  echoDelayNode.connect(channel.analyser)
  echoDelayNode.connect(echoFeedback)
  echoFeedback.connect(echoDelayNode)
  channel.gain.connect(reverbSend)
  reverbSend.connect(reverbInput)
  return {
    sourceGate,
    fxHigh,
    fxLow,
    gate,
    flangeDelay,
    flangeFeedback,
    flangeWet,
    echoSend,
    echoInput: echoFilter,
    echoDelay: echoDelayNode,
    echoFeedback,
    reverbSend,
  }
}

/** Which rack parameters a hand on a control takes back from Auto-FX. */
export function rackParams(rack: FXRack, control: "filter" | "fx" | "volume") {
  return control === "filter"
    ? [rack.fxHigh.frequency, rack.fxLow.frequency]
    : control === "fx"
      ? [
          rack.echoSend.gain,
          rack.reverbSend.gain,
          rack.flangeWet.gain,
          rack.flangeFeedback.gain,
        ]
      : [rack.gate.gain, rack.sourceGate.gain]
}

/** Put the rack back at rest now. Echo and reverb tails ring out. */
export function resetRack(
  rack: FXRack,
  time: number,
  only?: "filter" | "fx" | "volume"
) {
  for (const control of only ? [only] : (["filter", "fx", "volume"] as const))
    for (const param of rackParams(rack, control))
      param.cancelScheduledValues(time)
  if (!only || only === "filter") {
    rack.fxHigh.frequency.setValueAtTime(RACK_REST.high, time)
    rack.fxLow.frequency.setValueAtTime(RACK_REST.low, time)
  }
  if (!only || only === "fx") {
    rack.echoSend.gain.setValueAtTime(0, time)
    rack.reverbSend.gain.setValueAtTime(0, time)
    rack.flangeWet.gain.setValueAtTime(0, time)
    rack.flangeFeedback.gain.setValueAtTime(0, time)
  }
  if (!only || only === "volume") {
    rack.gate.gain.setValueAtTime(1, time)
    rack.sourceGate.gain.setValueAtTime(1, time)
  }
}

export type CueTiming = {
  /** Context time the cue starts and its length in real seconds. */
  t0: number
  length: number
  /** Playback rate of the outgoing deck (track seconds per second). */
  rate: number
  bpm: number
  /** Track position of the deck at t0, for overlays. */
  position: number
  buffer?: AudioBuffer
  /** Where overlays enter the channel (after sourceGate). */
  overlayInput: AudioNode
  master: AudioNode
  noise: () => AudioBuffer
  /** The deck's vocal stem tap into the echo, when stems are loaded. */
  vocalTap?: GainNode
}

const beatsAt = (bpm: number, rate: number, beats: number) =>
  (60 * beats) / (bpm * rate)

/**
 * Schedule one cue on the audio clock. Returns any sources it started so a
 * cancelled transition can stop them.
 */
export function scheduleCue(
  ctx: BaseAudioContext,
  rack: FXRack,
  cue: FXCue,
  timing: CueTiming
): AudioScheduledSourceNode[] {
  const { t0, length, rate, bpm } = timing,
    t1 = t0 + length,
    amount = Math.max(0, Math.min(1, cue.amount))
  switch (cue.kind) {
    case "sweep": {
      const f = rack.fxHigh.frequency
      f.setValueAtTime(RACK_REST.high * 2, t0)
      f.exponentialRampToValueAtTime(300 + 2500 * amount, t1)
      f.setValueAtTime(RACK_REST.high, t1 + 0.15)
      return []
    }
    case "filterIn": {
      const f = rack.fxLow.frequency
      f.setValueAtTime(250, t0)
      f.exponentialRampToValueAtTime(RACK_REST.low, t1)
      return []
    }
    case "vocalEcho":
    case "echo": {
      // Without stems on the deck, a vocal echo echoes the whole track.
      const send =
          cue.kind === "vocalEcho" && timing.vocalTap
            ? timing.vocalTap.gain
            : rack.echoSend.gain,
        feedback = rack.echoFeedback.gain
      rack.echoDelay.delayTime.setValueAtTime(
        echoDelay(bpm, rate, cue.beats ?? 1),
        t0
      )
      send.setValueAtTime(0, t0)
      send.linearRampToValueAtTime(
        amount * 0.7,
        t0 + Math.min(0.05, length / 4)
      )
      send.setValueAtTime(amount * 0.7, t1)
      send.linearRampToValueAtTime(0, t1 + 0.05)
      feedback.setValueAtTime(RACK_REST.feedback, t0)
      feedback.linearRampToValueAtTime(0.6, t1)
      // Let the repeats fade over about two bars.
      feedback.setTargetAtTime(0.3, t1, beatsAt(bpm, rate, 4))
      return []
    }
    case "reverb": {
      const send = rack.reverbSend.gain
      send.setValueAtTime(0, t0)
      send.linearRampToValueAtTime(amount * 0.8, t0 + length / 2)
      send.linearRampToValueAtTime(0, t1)
      return []
    }
    case "gate": {
      const period = beatsAt(bpm, rate, cue.beats ?? 0.5),
        steps = 16,
        points = Math.min(4096, Math.max(2, Math.ceil(length / period) * steps))
      const curve = Float32Array.from({ length: points }, (_, i) => {
        const phase = ((i * length) / points / period) % 1
        return phase < 0.5 ? 1 : 1 - amount
      })
      rack.gate.gain.setValueCurveAtTime(curve, t0, length)
      rack.gate.gain.setValueAtTime(1, t1 + 0.01)
      return []
    }
    case "flanger": {
      const wet = rack.flangeWet.gain
      wet.setValueAtTime(0, t0)
      wet.linearRampToValueAtTime(amount * 0.7, t0 + length * 0.2)
      wet.setValueAtTime(amount * 0.7, t0 + length * 0.8)
      wet.linearRampToValueAtTime(0, t1)
      rack.flangeFeedback.gain.setValueAtTime(0.5, t0)
      rack.flangeFeedback.gain.setValueAtTime(0, t1 + 0.05)
      rack.flangeDelay.delayTime.setValueCurveAtTime(
        Float32Array.from(
          { length: 256 },
          (_, i) => 0.0035 + 0.0025 * Math.sin((i / 255) * Math.PI * 4)
        ),
        t0,
        length
      )
      return []
    }
    case "riser": {
      const source = ctx.createBufferSource(),
        band = ctx.createBiquadFilter(),
        level = ctx.createGain()
      source.buffer = timing.noise()
      source.loop = true
      band.type = "bandpass"
      band.Q.value = 3
      band.frequency.setValueAtTime(300, t0)
      band.frequency.exponentialRampToValueAtTime(9000, t1)
      level.gain.setValueAtTime(0.0001, t0)
      level.gain.exponentialRampToValueAtTime(0.09 * amount + 0.0001, t1)
      // Stop dead on the drop.
      level.gain.setValueAtTime(0, t1 + 0.01)
      source.connect(band)
      band.connect(level)
      level.connect(timing.master)
      source.start(t0)
      source.stop(t1 + 0.05)
      return [source]
    }
    case "roll": {
      if (!timing.buffer) return []
      const beat = 60 / bpm
      // 1 → ½ → ¼ beat: half the time on the first size, a quarter on each.
      const stages = [
        { beats: cue.beats ?? 1, share: 0.5 },
        { beats: (cue.beats ?? 1) / 2, share: 0.25 },
        { beats: (cue.beats ?? 1) / 4, share: 0.25 },
      ]
      const sources: AudioScheduledSourceNode[] = []
      let start = t0
      for (const stage of stages) {
        const source = ctx.createBufferSource(),
          end = start + length * stage.share
        source.buffer = timing.buffer
        source.loop = true
        source.loopStart = timing.position
        source.loopEnd = timing.position + stage.beats * beat
        source.playbackRate.setValueAtTime(rate, start)
        source.connect(timing.overlayInput)
        source.start(start, timing.position)
        source.stop(end)
        sources.push(source)
        start = end
      }
      rack.sourceGate.gain.setValueAtTime(0, t0)
      rack.sourceGate.gain.setValueAtTime(1, t1)
      return sources
    }
    case "brake": {
      if (!timing.buffer) return []
      const source = ctx.createBufferSource()
      source.buffer = timing.buffer
      source.playbackRate.setValueAtTime(rate, t0)
      source.playbackRate.exponentialRampToValueAtTime(0.02, t1)
      source.connect(timing.overlayInput)
      source.start(t0, timing.position)
      source.stop(t1)
      rack.sourceGate.gain.setValueAtTime(0, t0)
      return [source]
    }
    case "spinback": {
      if (!timing.buffer) return []
      // The last 1.5 s, reversed, spun back fast and slowing down.
      const seconds = Math.min(1.5, timing.position),
        sampleRate = timing.buffer.sampleRate,
        frames = Math.max(1, Math.floor(seconds * sampleRate)),
        end = Math.floor(timing.position * sampleRate)
      const reversed = ctx.createBuffer(
        timing.buffer.numberOfChannels,
        frames,
        sampleRate
      )
      for (let c = 0; c < timing.buffer.numberOfChannels; c++) {
        const from = timing.buffer.getChannelData(c),
          to = reversed.getChannelData(c)
        for (let i = 0; i < frames; i++) to[i] = from[end - 1 - i] ?? 0
      }
      const source = ctx.createBufferSource()
      source.buffer = reversed
      source.playbackRate.setValueAtTime(2.5 * rate, t0)
      source.playbackRate.exponentialRampToValueAtTime(0.1, t1)
      source.connect(timing.overlayInput)
      source.start(t0)
      source.stop(t1)
      rack.sourceGate.gain.setValueAtTime(0, t0)
      return [source]
    }
  }
}

/** Two seconds of white noise for risers. */
export function noiseBuffer(ctx: BaseAudioContext) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let seed = 7
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    data[i] = (seed / 4294967296) * 2 - 1
  }
  return buffer
}
