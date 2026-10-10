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

/** SoundTouch 2.1 runs pitch compensation on the audio rendering thread. */
export function createPitchNode(context: AudioContext) {
  const node = new AudioWorkletNode(context, "soundtouch-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  })
  return {
    node,
    rate: node.parameters.get("playbackRate")!,
    pitch: node.parameters.get("pitch")!,
    semitones: node.parameters.get("pitchSemitones")!,
  }
}
export type PitchProcessor = ReturnType<typeof createPitchNode>
