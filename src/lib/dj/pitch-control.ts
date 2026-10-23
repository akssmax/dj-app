import processorUrl from "@soundtouchjs/audio-worklet/processor?url"

const registrations = new WeakMap<AudioContext, Promise<void>>()

export function registerPitch(context: AudioContext) {
  let pending = registrations.get(context)
  if (!pending) {
    const worklet = (context as { audioWorklet?: AudioWorklet }).audioWorklet
    pending = worklet
      ? worklet.addModule(processorUrl)
      : Promise.reject(
          new Error(
            "Independent pitch needs AudioWorklet support in Chrome or Edge."
          )
        )
    registrations.set(context, pending)
  }
  return pending
}

/**
 * Shorter WSOLA windows than SoundTouch's automatic ones (about 73 ms
 * sequence and 18 ms seek near 1×), which delay the deck by 133 ms. These
 * keep beats clean at DJ tempo ranges and cut the delay to 53 ms.
 */
const STRETCH = {
  sequenceMs: 40,
  seekWindowMs: 15,
  overlapMs: 8,
  quickSeek: true,
}

/**
 * How far the key-lock path runs behind its input, in seconds. Measured
 * with click tracks at 0.92–1.08× and ±2 semitones: 53 ms ± 3 ms. The engine
 * starts key-locked sources this much early so what you hear stays on the
 * grid.
 */
export const PITCH_LATENCY = 0.053

/**
 * SoundTouch 2.1 runs pitch compensation on the audio rendering thread.
 * Create the node before audio reaches it: the stretch settings arrive by
 * message, and samples buffered under the default settings would keep the
 * longer delay.
 */
export function createPitchNode(context: AudioContext) {
  const node = new AudioWorkletNode(context, "soundtouch-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  })
  node.port.postMessage({ type: "set-stretch-parameters", params: STRETCH })
  return {
    node,
    rate: node.parameters.get("playbackRate")!,
    pitch: node.parameters.get("pitch")!,
    semitones: node.parameters.get("pitchSemitones")!,
  }
}
export type PitchProcessor = ReturnType<typeof createPitchNode>
