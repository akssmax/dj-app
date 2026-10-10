/** A continuous tape reader. Motion uses the newest hardware position; audio
 * runs on the render thread and never allocates a grain for a jog packet. */
export class ScratchTape {
  private channels: Float32Array[] = []
  private sourceRate = 44100
  private position = 0
  private speed = 0
  private target = 0
  private remaining = 0
  private gain = 0
  private previousTime: number | null = null
  private deadline = 0
  private active = false
  constructor(private outputRate: number) {}
  setBuffer(channels: Float32Array[], rate: number) {
    this.channels = channels
    this.sourceRate = rate
    this.stop()
    this.position = 0
  }
  move(position: number, delta: number, time: number) {
    if (!Number.isFinite(position + delta + time) || !delta) return
    const start = Math.max(0, position - delta) * this.sourceRate
    if (
      !this.active ||
      Math.abs(this.position - start) > this.sourceRate * 0.05
    )
      this.position = start
    const elapsed =
      this.previousTime === null
        ? 0.025
        : Math.max(0.004, Math.min(0.025, time - this.previousTime))
    const length = this.channels[0]?.length ?? 0
    this.target = Math.max(0, Math.min(length - 1, position * this.sourceRate))
    // Reach the hardware target over one packet interval. Never run the tape
    // past that point while waiting for another MIDI message.
    this.remaining = Math.max(
      1,
      Math.round(elapsed * this.outputRate),
      Math.ceil(
        Math.abs(this.target - this.position) /
          ((8 * this.sourceRate) / this.outputRate)
      )
    )
    this.speed = (this.target - this.position) / this.remaining
    this.previousTime = time
    this.deadline =
      time + Math.min(0.05, this.remaining / this.outputRate + 0.004)
    this.active = true
  }
  stop() {
    this.active = false
    this.previousTime = null
    this.remaining = 0
    this.speed = 0
  }
  render(outputs: Float32Array[], time: number) {
    for (const output of outputs) output.fill(0)
    if (!this.channels.length || !outputs.length) return
    const frames = outputs[0].length,
      length = this.channels[0].length
    for (let frame = 0; frame < frames; frame++) {
      const audible =
        this.active &&
        this.remaining > 0 &&
        time + frame / this.outputRate < this.deadline
      // A short audio ramp prevents clicks. UI and seek positions are direct.
      this.gain +=
        ((audible ? 1 : 0) - this.gain) *
        Math.min(1, 1 / (this.outputRate * 0.002))
      if (this.gain < 0.0001) continue
      const index = Math.floor(this.position),
        fraction = this.position - index
      if (index >= 0 && index + 1 < length) {
        for (let channel = 0; channel < outputs.length; channel++) {
          const input =
            this.channels[Math.min(channel, this.channels.length - 1)]
          outputs[channel][frame] =
            (input[index] + (input[index + 1] - input[index]) * fraction) *
            this.gain
        }
      }
      if (audible) {
        this.position = Math.max(
          0,
          Math.min(length - 1, this.position + this.speed)
        )
        if (--this.remaining === 0) this.position = this.target
      }
    }
  }
}

declare const sampleRate: number
declare const currentTime: number
declare class AudioWorkletProcessor {
  port: MessagePort
}
declare function registerProcessor(
  name: string,
  processor: typeof AudioWorkletProcessor
): void

if (typeof registerProcessor === "function") {
  registerProcessor(
    "cue-scratch",
    class extends AudioWorkletProcessor {
      private tape = new ScratchTape(sampleRate)
      constructor() {
        super()
        this.port.onmessage = (event: MessageEvent) => {
          const message = event.data
          if (message.type === "buffer")
            this.tape.setBuffer(message.channels, message.sampleRate)
          else if (message.type === "move")
            this.tape.move(message.position, message.delta, message.time)
          else if (message.type === "stop") this.tape.stop()
        }
      }
      process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
        this.tape.render(outputs[0], currentTime)
        return true
      }
    }
  )
}
