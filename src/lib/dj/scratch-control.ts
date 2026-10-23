import processorUrl from "./scratch-worklet.ts?worker&url"
import { matrixWeights } from "./stem-matrix"
import type { StemGains, StemLayout } from "./stem-matrix"

const registrations = new WeakMap<AudioContext, Promise<void>>()
export function registerScratch(context: AudioContext) {
  let pending = registrations.get(context)
  if (!pending) {
    const worklet = (context as { audioWorklet?: AudioWorklet }).audioWorklet
    pending = worklet
      ? worklet.addModule(processorUrl)
      : Promise.reject(new Error("AudioWorklet unavailable"))
    registrations.set(context, pending)
  }
  return pending
}
export function createScratchNode(context: AudioContext) {
  return new AudioWorkletNode(context, "cue-scratch", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  })
}

/** Seconds of audio either side of the playhead the scratch tape holds. */
export const SCRATCH_REACH = 20

/**
 * Send the scratch tape the audio around `position` (a 40 s window rather
 * than a copy of the whole track). With stems loaded and some muted, the
 * window is the stem mix you hear, so scratching respects the mutes.
 * Returns the window's span in seconds.
 */
export function sendScratchWindow(
  node: AudioWorkletNode,
  buffer: AudioBuffer,
  position: number,
  stems?: { buffer: AudioBuffer; gains: StemGains; layout: StemLayout }
): [number, number] {
  const rate = buffer.sampleRate
  const from = Math.max(0, Math.floor((position - SCRATCH_REACH) * rate)),
    to = Math.min(buffer.length, Math.ceil((position + SCRATCH_REACH) * rate))
  const plane = (source: AudioBuffer, channel: number) =>
    source.getChannelData(Math.min(channel, source.numberOfChannels - 1))
  let channels: Float32Array[]
  const muted = stems && Object.values(stems.gains).some((gain) => gain !== 1)
  if (stems && muted) {
    const w = matrixWeights(stems.gains, stems.layout)
    const full = stems.layout === "full"
    channels = [0, 1].map((side) => {
      const out = new Float32Array(to - from)
      const original = plane(stems.buffer, side),
        vocals = plane(stems.buffer, 2 + side),
        drums = full ? plane(stems.buffer, 4 + side) : null,
        bass = full ? plane(stems.buffer, 6) : null
      for (let i = 0; i < out.length; i++) {
        const j = from + i
        out[i] =
          original[j] * w.original +
          vocals[j] * w.vocals +
          (drums ? drums[j] * w.drums : 0) +
          (bass ? bass[j] * w.bass : 0)
      }
      return out
    })
  } else
    channels = Array.from(
      { length: Math.min(2, buffer.numberOfChannels) },
      (_, c) => buffer.getChannelData(c).slice(from, to)
    )
  node.port.postMessage(
    { type: "buffer", channels, sampleRate: rate, start: from / rate },
    channels.map((channel) => channel.buffer)
  )
  return [from / rate, to / rate]
}
