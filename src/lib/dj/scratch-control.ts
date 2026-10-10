import processorUrl from "./scratch-worklet.ts?worker&url"

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
export function createScratchNode(context: AudioContext, buffer: AudioBuffer) {
  const node = new AudioWorkletNode(context, "cue-scratch", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  })
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channel) => buffer.getChannelData(channel).slice()
  )
  node.port.postMessage(
    { type: "buffer", channels, sampleRate: buffer.sampleRate },
    channels.map((channel) => channel.buffer)
  )
  return node
}
