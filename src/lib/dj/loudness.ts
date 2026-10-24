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
  { square: Float64Array; count: Float64Array; peak: Float32Array }
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
  const blockPeak = new Float32Array(blocks)
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
      valid = 0,
      local = 0
    const end = Math.min(buffer.length, (block + 1) * BLOCK)
    for (const samples of channels)
      for (let i = block * BLOCK; i < Math.min(end, samples.length); i++) {
        const value = samples[i]
        if (!Number.isFinite(value)) continue
        sum += value * value
        valid++
        local = Math.max(local, Math.abs(value))
      }
    blockPeak[block] = local
    peak = Math.max(peak, local)
    square[block + 1] = square[block] + sum
    count[block + 1] = count[block] + valid
  }
  if (!current()) return false
  indexes.set(buffer, { square, count, peak: blockPeak })
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

// Peak within a section: the overlap guard reads where each track is.
export function sectionPeak(buffer: PCM, start: number, duration: number) {
  const first = Math.max(0, Math.floor(start * buffer.sampleRate))
  const last = Math.min(
    buffer.length,
    Math.ceil((start + duration) * buffer.sampleRate)
  )
  const index = indexes.get(buffer)
  let peak = 0
  if (index) {
    for (
      let block = Math.floor(first / BLOCK);
      block < Math.min(index.peak.length, Math.ceil(last / BLOCK));
      block++
    )
      peak = Math.max(peak, index.peak[block])
    return peak
  }
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const samples = buffer.getChannelData(c)
    for (let i = first; i < Math.min(last, samples.length); i++)
      if (Number.isFinite(samples[i]))
        peak = Math.max(peak, Math.abs(samples[i]))
  }
  return peak
}

// The track's main-section level: 80th percentile of ~1 s RMS, so an intro,
// outro or breakdown doesn't set it. Null until prepareLoudness has run.
export function bodyLoudness(buffer: PCM) {
  const index = indexes.get(buffer)
  if (!index) return null
  const step = Math.max(1, Math.round(buffer.sampleRate / BLOCK))
  const levels: number[] = []
  for (let b = 0; b + step < index.square.length; b += step) {
    const count = index.count[b + step] - index.count[b]
    if (count > 0)
      levels.push(Math.sqrt((index.square[b + step] - index.square[b]) / count))
  }
  const audible = levels.filter((v) => v > 0.00001).sort((a, b) => a - b)
  return audible.length ? audible[Math.floor(audible.length * 0.8)] : null
}

// A sample-free stand-in that keeps a prepared buffer's section totals, so a
// simulation can measure many tracks without holding their PCM.
export function loudnessProfile(buffer: PCM): PCM | null {
  const index = indexes.get(buffer)
  if (!index) return null
  const empty = new Float32Array(0)
  const profile: PCM = {
    length: buffer.length,
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
    getChannelData: () => empty,
  }
  indexes.set(profile, index)
  peaks.set(profile, peaks.get(buffer) ?? 0)
  return profile
}

const db = (value: number) =>
  value > 0 ? Math.round(20 * Math.log10(value) * 10) / 10 : null
const round = (value: number) => Math.round(value * 10) / 10 || 0
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value))

/** Main-section level the set is anchored around (stereo RMS, dBFS). */
export const TARGET_BODY_DB = -10
/** Most the set's level moves toward the target in one mix (dB). */
const TARGET_STEP = 1
const LIMIT = 10 ** (-3 / 20)
/** Headroom moves at most this fast (dB per second), so it is never heard
 * as a step. */
const SLEW = 4
/** The outgoing deck gives up this many dB for each dB the incoming does. */
const OUT_SHARE = 2

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
  const outBody = bodyLoudness(out),
    inBody = bodyLoudness(incoming)
  const outTrim = original.out.trim
  // Match the tracks' main sections, not the mix points: an outro or intro
  // is quieter by design, and matching to it left the next track low for its
  // whole run. Each mix moves the set's level at most TARGET_STEP toward
  // the target, too little to hear, so a loud or quiet opener doesn't set
  // the level for the whole set; it never strays more than 3 dB from it.
  let reference: number | null = null,
    desiredTrim: number | null = null
  if (outBody && inBody) {
    const level = 20 * Math.log10(outBody) + outTrim
    reference = clamp(
      level + clamp(TARGET_BODY_DB - level, -TARGET_STEP, TARGET_STEP),
      TARGET_BODY_DB - 3,
      TARGET_BODY_DB + 3
    )
    desiredTrim = reference - 20 * Math.log10(inBody)
  } else if (a.usable && b.usable) {
    // No level profile yet: compare the mixed sections instead, against the
    // outgoing track near its natural level.
    reference = clamp(outTrim, -3, 3)
    desiredTrim = reference + 20 * Math.log10(a.rms / b.rms)
  }
  const settledInTrim =
    desiredTrim === null
      ? Math.min(0, original.incoming.trim)
      : clamp(desiredTrim, -12, 6)
  const limited =
    desiredTrim !== null && Math.abs(settledInTrim - desiredTrim) > 0.1

  // Overlap headroom, moment by moment. Two unrelated tracks add as power;
  // the sum may reach -3 dB or the louder track's level playing alone,
  // whichever is higher, so a mix is never louder than either track on its
  // own (the master limiter catches a peak that lines up). Peaks are read where each track
  // is at that moment, so a transient elsewhere in the track costs nothing.
  // Positive EQ is included; echo and reverb tails reserve extra room on
  // the outgoing side.
  const eqGain = (channel: AutomationChannel) =>
    10 **
    ((Math.max(0, channel.low) +
      Math.max(0, channel.mid) +
      Math.max(0, channel.high)) /
      20)
  const fxReserve = ["echo", "reverb"].includes(plan.execution) ? 1.5 : 1
  const outGain = 10 ** (outTrim / 20) * eqGain(original.out) * outVolume,
    inGain = 10 ** (settledInTrim / 20) * eqGain(original.incoming) * outVolume
  const half = plan.duration / 512 + 0.25
  const frames = Array.from({ length: 257 }, (_, i) => {
    const p = i / 256,
      frame = automationFrame(plan, p)
    const outAt = plan.outStart + p * plan.duration,
      inAt = plan.inStart + p * plan.duration * plan.rate
    const outAlone = sectionPeak(out, outAt - half, half * 2) * outGain,
      inAlone =
        sectionPeak(incoming, inAt - half * plan.rate, half * 2 * plan.rate) *
        inGain
    return {
      out: outAlone * frame.outFader,
      in: inAlone * frame.inFader,
      // Either track playing alone at full fader (the outgoing with its
      // echo tail): a crossfade between them may be as loud as that.
      allowed: Math.max(LIMIT, outAlone * fxReserve, inAlone),
    }
  })
  const g = (cut: number) => 10 ** (-cut / 20)
  // The outgoing deck is playing at the start, so its cut ramps up from
  // nothing; where it can't go deep enough yet, the incoming gives more.
  // A hard cut is over in a moment; it may still move a few dB.
  const step = Math.max(SLEW * plan.duration, 6) / 256
  const outCut = (cut: number, i: number) =>
    Math.min(24, cut * OUT_SHARE, i * step * OUT_SHARE)
  const sum = (x: number, y: number, cut: number, i: number, reserve: number) =>
    Math.hypot(x * reserve * g(outCut(cut, i)), y * g(cut))
  const solve = (reserve: number) =>
    frames.map(({ out: x, in: y, allowed }, i) => {
      if (sum(x, y, 0, i, reserve) <= allowed) return 0
      let low = 0,
        high = 24
      for (let n = 0; n < 24; n++) {
        const mid = (low + high) / 2
        if (sum(x, y, mid, i, reserve) > allowed) low = mid
        else high = mid
      }
      return high
    })
  // Ramp toward each cut ahead of time and release it after, never faster
  // than SLEW.
  const smooth = (cuts: number[]) => {
    const c = [...cuts]
    for (let i = c.length - 2; i >= 0; i--)
      c[i] = Math.max(c[i], c[i + 1] - step)
    for (let i = 1; i < c.length; i++) c[i] = Math.max(c[i], c[i - 1] - step)
    return c
  }
  const curves = (reserve: number) => {
    const cuts = smooth(solve(reserve))
    return {
      in: cuts,
      out: cuts.map(outCut),
    }
  }
  const cuts = curves(fxReserve)
  // When extreme EQ reaches the trim floor, reduce faders too rather than clip.
  let faderScale = 1
  frames.forEach(({ out: x, in: y, allowed }, i) => {
    const left = Math.hypot(x * fxReserve * g(cuts.out[i]), y * g(cuts.in[i]))
    if (left > allowed * 1.001)
      faderScale = Math.min(faderScale, allowed / left)
  })
  const inHeadroom = Math.max(...cuts.in),
    outHeadroom = Math.max(...cuts.out)
  const withoutReserve = fxReserve > 1 ? Math.max(...curves(1).in) : inHeadroom
  const matched = desiredTrim !== null && !limited
  return {
    outVolume: outVolume * faderScale,
    inVolume: outVolume * faderScale,
    /** Deepest the outgoing trim goes during the overlap. */
    outTrim: outTrim - outHeadroom,
    /** The incoming trim as the transition starts. */
    inTrim: settledInTrim - cuts.in[0],
    settledInTrim,
    /** Headroom below each deck's trim (dB, ≥ 0) at 257 points of the mix. */
    outCut: cuts.out,
    inCut: cuts.in,
    matched,
    limited,
    headroomDb: round(Math.max(inHeadroom, outHeadroom)),
    message:
      desiredTrim !== null
        ? `${limited ? "Loudness correction limited to protect gain" : outBody && inBody ? "Main levels matched" : "Section levels matched"}${outHeadroom > 0.1 ? ` · ${outHeadroom.toFixed(1)} dB headroom on the outgoing deck` : ""}${inHeadroom > 0.1 ? `, ${inHeadroom.toFixed(1)} dB on the incoming` : ""}`
        : "Loudness matching unavailable for silent or short sections; peak protection retained",
    diagnostics: {
      window,
      basis:
        outBody && inBody ? "body" : desiredTrim !== null ? "section" : null,
      outRmsDb: a.usable ? db(a.rms) : null,
      inRmsDb: b.usable ? db(b.rms) : null,
      outBodyDb: db(outBody ?? 0),
      inBodyDb: db(inBody ?? 0),
      referenceDb: reference === null ? null : round(reference),
      desiredTrimDb: desiredTrim === null ? null : round(desiredTrim),
      outPeakDb: db(a.peak),
      inPeakDb: db(b.peak),
      overlapPeakDb: db(
        Math.max(...frames.map((f) => Math.hypot(f.out * fxReserve, f.in)))
      ),
      fxReserve: fxReserve > 1,
      outHeadroomDb: round(outHeadroom),
      inHeadroomDb: round(inHeadroom),
      inHeadroomWithoutFxReserveDb: round(withoutReserve),
      faderScaleDb: db(faderScale) ?? 0,
    },
  }
}
