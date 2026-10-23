import { automationControls, automationFrame } from "./automation"
import type { AutomationChannel } from "./automation"
import { echoDelay } from "./beatgrid"
import { createFXRack, noiseBuffer, scheduleCue } from "./fx-rack"
import type { Transition } from "./types"

/** Longest stretch of a transition a preview renders, in seconds. */
export const PREVIEW_MAX = 24

type Deck = { buffer: AudioBuffer; bpm: number | null; rate: number }

const neutral = (rate: number): AutomationChannel => ({
  volume: 0.8,
  trim: 0,
  low: 0,
  mid: 0,
  high: 0,
  filter: 0,
  fx: { type: "echo", enabled: false, amount: 0.5, beats: 1 },
  rate,
})

/** A short synthetic room, matching the engine's reverb. */
function roomImpulse(ctx: BaseAudioContext) {
  const impulse = ctx.createBuffer(
    2,
    Math.ceil(ctx.sampleRate * 1.8),
    ctx.sampleRate
  )
  let seed = 42
  for (let channel = 0; channel < 2; channel++) {
    const samples = impulse.getChannelData(channel)
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      samples[i] =
        ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / samples.length, 3)
    }
  }
  return impulse
}

/** Seconds of lead-in and tail around the transition in a preview. */
export function previewWindow(plan: Transition, rate: number, bpm: number) {
  const bar = 240 / bpm / rate
  const fxLead = Math.max(0, ...(plan.fx ?? []).map((cue) => -cue.at / rate))
  const lead = Math.min(16 * bar, Math.max(2 * bar, fxLead))
  const body = Math.min(PREVIEW_MAX, plan.duration / rate)
  return { lead, body, tail: 2 * bar, total: lead + body + 2 * bar }
}

/**
 * Render a planned transition offline, with the same fader, EQ, filter and
 * Auto-FX curves the live mix would use, so it can be heard in headphones
 * before it plays. Long blends are previewed for their first 24 seconds.
 */
export async function renderTransition(
  plan: Transition,
  out: Deck,
  incoming: Deck,
  sampleRate = 44100
): Promise<AudioBuffer> {
  const bpm = out.bpm ?? 120
  const { lead, total } = previewWindow(plan, out.rate, bpm)
  const ctx = new OfflineAudioContext(
    2,
    Math.ceil(total * sampleRate),
    sampleRate
  )
  const bus = ctx.createGain()
  bus.connect(ctx.destination)
  const reverbFilter = ctx.createBiquadFilter(),
    reverb = ctx.createConvolver()
  reverbFilter.type = "highpass"
  reverbFilter.frequency.value = 180
  reverb.buffer = roomImpulse(ctx)
  reverbFilter.connect(reverb)
  reverb.connect(bus)
  const duration = plan.duration / out.rate,
    t0 = lead
  const strip = (outgoing: boolean, deck: Deck) => {
    const source = ctx.createBufferSource(),
      trim = ctx.createGain(),
      low = ctx.createBiquadFilter(),
      mid = ctx.createBiquadFilter(),
      high = ctx.createBiquadFilter(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain(),
      input = ctx.createGain()
    source.buffer = deck.buffer
    source.playbackRate.value = deck.rate
    low.type = "lowshelf"
    low.frequency.value = 250
    mid.type = "peaking"
    mid.frequency.value = 1000
    mid.Q.value = 0.7
    high.type = "highshelf"
    high.frequency.value = 4000
    filter.type = "highpass"
    filter.frequency.value = 10
    input.connect(trim)
    trim.connect(low)
    low.connect(mid)
    mid.connect(high)
    high.connect(filter)
    filter.connect(gain)
    gain.connect(bus)
    const rack = createFXRack(
      ctx,
      { filter, gain, inputAnalyser: input, analyser: bus },
      reverbFilter
    )
    source.connect(rack.sourceGate)
    const saved = neutral(deck.rate)
    const controls = (p: number) =>
      automationControls(plan, p, saved, outgoing, 0.8, 0)
    const curve = (param: AudioParam, value: (p: number) => number) => {
      param.setValueAtTime(value(0), 0)
      param.setValueCurveAtTime(
        Float32Array.from({ length: 257 }, (_, i) => value(i / 256)),
        t0,
        duration
      )
    }
    // Before the transition the outgoing deck plays alone at full level.
    curve(gain.gain, (p) => controls(p).volume)
    for (const band of ["low", "mid", "high"] as const)
      curve({ low, mid, high }[band].gain, (p) => controls(p)[band])
    if (outgoing && ["filter", "echo", "reverb"].includes(plan.execution))
      curve(filter.frequency, (p) => 30 * 500 ** controls(p).filter)
    if (outgoing && ["echo", "reverb"].includes(plan.execution)) {
      const send = plan.execution === "echo" ? rack.echoSend : rack.reverbSend
      rack.echoDelay.delayTime.setValueAtTime(echoDelay(bpm, deck.rate, 1), 0)
      curve(send.gain, (p) =>
        controls(p).fx.enabled ? controls(p).fx.amount * 0.65 : 0
      )
    }
    return { source, rack, input }
  }
  const a = strip(true, out),
    b = strip(false, incoming)
  a.source.start(0, Math.max(0, plan.outStart - lead * out.rate))
  b.source.start(
    t0 + automationFrame(plan, 0).incomingDelay * duration,
    plan.inStart
  )
  for (const cue of plan.fx ?? []) {
    const deck = cue.deck === "out" ? a : b
    let start = t0 + cue.at / out.rate,
      length = cue.length / out.rate
    if (start < 0) {
      length += start
      start = 0
    }
    if (length <= 0) continue
    scheduleCue(ctx, deck.rack, cue, {
      t0: start,
      length,
      rate: out.rate,
      bpm,
      position: Math.max(0, plan.outStart + cue.at),
      buffer: cue.deck === "out" ? out.buffer : undefined,
      overlayInput: deck.input,
      master: bus,
      noise: () => noiseBuffer(ctx),
    })
  }
  return ctx.startRendering()
}
