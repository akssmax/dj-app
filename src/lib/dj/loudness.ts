import { automationFrame } from "./automation"
import type { AutomationChannel } from "./automation"
import type { Transition } from "./types"

type PCM = Pick<
  AudioBuffer,
  "length" | "sampleRate" | "numberOfChannels" | "getChannelData"
>
const peaks = new WeakMap<PCM, number>()
const BLOCK = 4096
const indexes = new WeakMap<
  PCM,
  { square: Float64Array; count: Float64Array }
>()

// Build exact section totals during loading. Yield between bounded batches so
// loading the next deck does not monopolize the thread playing the current one.
export async function prepareLoudness(
  buffer: PCM,
  current = () => true,
  yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
) {
  if (indexes.has(buffer)) return true
  const blocks = Math.ceil(buffer.length / BLOCK)
  const square = new Float64Array(blocks + 1)
  const count = new Float64Array(blocks + 1)
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    buffer.getChannelData(c)
  )
  let peak = 0
  if (!current()) return false
  for (let block = 0; block < blocks; block++) {
    if (block > 0 && block % 32 === 0) {
      await yieldTask()
      if (!current()) return false
    }
    let sum = 0,
      valid = 0
    const end = Math.min(buffer.length, (block + 1) * BLOCK)
    for (const samples of channels)
      for (let i = block * BLOCK; i < Math.min(end, samples.length); i++) {
        const value = samples[i]
        if (!Number.isFinite(value)) continue
        sum += value * value
        valid++
        peak = Math.max(peak, Math.abs(value))
      }
    square[block + 1] = square[block] + sum
    count[block + 1] = count[block] + valid
  }
  if (!current()) return false
  indexes.set(buffer, { square, count })
  peaks.set(buffer, peak)
  return true
}

// Stereo mean-square RMS, not a LUFS or true-peak claim. Never normalize silence.
export function measureLoudness(buffer: PCM, start: number, duration: number) {
  const first = Math.min(
    buffer.length,
    Math.max(0, Math.floor(start * buffer.sampleRate))
  )
  const last = Math.max(
    first,
    Math.min(buffer.length, Math.ceil((start + duration) * buffer.sampleRate))
  )
  let square = 0,
    count = 0,
    peak = peaks.get(buffer) ?? 0
  const scanPeak = !peaks.has(buffer)
  const index = indexes.get(buffer)
  const fullFirst = Math.ceil(first / BLOCK)
  const fullLast = Math.floor(last / BLOCK)
  const indexed = index && fullFirst < fullLast
  if (indexed) {
    square = index.square[fullLast] - index.square[fullFirst]
    count = index.count[fullLast] - index.count[fullFirst]
  }
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const samples = buffer.getChannelData(c)
    if (scanPeak)
      for (const sample of samples) {
        if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample))
      }
    for (let i = first; i < Math.min(last, samples.length); i++) {
      if (indexed && i === fullFirst * BLOCK) {
        i = fullLast * BLOCK - 1
        continue
      }
      if (!Number.isFinite(samples[i])) continue
      square += samples[i] ** 2
      count++
    }
  }
  peaks.set(buffer, peak)
  const rms = count ? Math.sqrt(square / count) : 0
  return {
    rms,
    peak,
    usable:
      count >= buffer.sampleRate * buffer.numberOfChannels * 0.1 &&
      rms > 0.00001,
  }
}

export function matchLoudness(
  out: PCM,
  incoming: PCM,
  plan: Transition,
  original: { out: AutomationChannel; incoming: AutomationChannel },
  outVolume: number
) {
  const window = Math.min(32, Math.max(8, plan.duration))
  const a = measureLoudness(out, plan.outStart, window)
  const b = measureLoudness(incoming, plan.inStart, window * plan.rate)
  let outTrim = original.out.trim
  let inTrim = original.incoming.trim
  let limited = false
  if (a.usable && b.usable) {
    const desiredTrim = outTrim + 20 * Math.log10(a.rms / b.rms)
    inTrim = Math.max(-24, Math.min(6, desiredTrim))
    limited = Math.abs(inTrim - desiredTrim) > 0.1
  }
  // Bound the sum of both full-track sample peaks across the actual recipe.
  // Positive EQ is conservatively included; FX exits reserve additional space.
  const eqGain = (channel: AutomationChannel) =>
    10 **
    ((Math.max(0, channel.low) +
      Math.max(0, channel.mid) +
      Math.max(0, channel.high)) /
      20)
  const aPeak = a.peak * 10 ** (outTrim / 20) * eqGain(original.out) * outVolume
  const bPeak =
    b.peak * 10 ** (inTrim / 20) * eqGain(original.incoming) * outVolume
  let combined = 0
  for (let i = 0; i <= 256; i++) {
    const frame = automationFrame(plan, i / 256)
    combined = Math.max(
      combined,
      aPeak * frame.outFader + bPeak * frame.inFader
    )
  }
  if (["echo", "reverb"].includes(plan.execution)) combined *= 1.5
  const reduction =
    combined > 10 ** (-3 / 20) ? 20 * Math.log10(10 ** (-3 / 20) / combined) : 0
  const outBefore = outTrim,
    inBefore = inTrim
  outTrim = Math.max(-24, outTrim + reduction)
  inTrim = Math.max(-24, inTrim + reduction)
  let remaining = 0
  for (let i = 0; i <= 256; i++) {
    const frame = automationFrame(plan, i / 256)
    remaining = Math.max(
      remaining,
      aPeak * 10 ** ((outTrim - outBefore) / 20) * frame.outFader +
        bPeak * 10 ** ((inTrim - inBefore) / 20) * frame.inFader
    )
  }
  if (["echo", "reverb"].includes(plan.execution)) remaining *= 1.5
  // When extreme EQ reaches the trim floor, reduce faders too rather than clip.
  const faderScale =
    remaining > 0 ? Math.min(1, 10 ** (-3 / 20) / remaining) : 1
  return {
    outVolume: outVolume * faderScale,
    inVolume: outVolume * faderScale,
    outTrim,
    inTrim,
    matched: a.usable && b.usable && !limited,
    limited,
    headroomDb: -reduction,
    message:
      a.usable && b.usable
        ? `${limited ? "Loudness correction limited to protect gain" : "Section levels matched"}${reduction < -0.1 ? ` · ${(-reduction).toFixed(1)} dB headroom reduction` : ""}`
        : "Loudness matching unavailable for silent or short sections; peak protection retained",
  }
}
