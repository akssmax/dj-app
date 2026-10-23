/**
 * A continuous tape reader that behaves like a record under the hand.
 *
 * Jog packets only move a target position. Each audio frame the tape chases
 * that target with a critically damped follower (no overshoot), so speed
 * changes glide instead of stepping per packet, and a still hand slows the
 * record to silence naturally. Reads use 4-point Hermite interpolation near
 * normal speed; faster reads average every sample the needle passes (a box
 * pre-filter) and then go through a two-pole low-pass that closes with
 * speed, so fast scratches do not alias into hiss.
 *
 * The tape holds a window of the track around the playhead (`start` is its
 * offset in seconds), not the whole track; positions stay in track seconds.
 */
const FOLLOW = 0.008 // seconds for the tape to settle on the hand position
const STILL = 0.08 // seconds without packets before the hand counts as still

export class ScratchTape {
  private channels: Float32Array[] = []
  private sourceRate = 44100
  private position = 0
  private target = 0
  private velocity = 0
  private gain = 0
  private filtered: number[] = []
  private filtered2: number[] = []
  /** Window start in source samples. */
  private origin = 0
  private lastMove = -Infinity
  private active = false
  private readonly pull: number
  private readonly damping: number
  private readonly fade: number
  constructor(private outputRate: number) {
    // Critically damped: velocity smoothing is 4× the position gain.
    this.pull = 1 / (FOLLOW * outputRate)
    this.damping = Math.min(1, 4 * this.pull)
    this.fade = Math.min(1, 1 / (outputRate * 0.0015))
  }
  /** Current read position in seconds (for tests and diagnostics). */
  get seconds() {
    return (this.position + this.origin) / this.sourceRate
  }
  /**
   * Load a window of the track starting at `start` seconds. A new window
   * at the same rate keeps the motion going, so the engine can slide the
   * window during a long scratch without a glitch.
   */
  setBuffer(channels: Float32Array[], rate: number, start = 0) {
    const origin = Math.round(start * rate)
    if (rate === this.sourceRate && this.channels.length) {
      const shift = this.origin - origin
      this.position += shift
      this.target += shift
    } else {
      this.stop()
      this.gain = 0
      this.position = 0
    }
    this.channels = channels
    this.sourceRate = rate
    this.origin = origin
    const last = Math.max(0, (channels[0]?.length ?? 1) - 1)
    this.position = Math.max(0, Math.min(last, this.position))
    this.target = Math.max(0, Math.min(last, this.target))
  }
  /**
   * The hand lands on a moving record: carry on at `speed` (1 = normal play)
   * from `position` and brake to a stop under the hand, instead of cutting
   * the sound.
   */
  hold(position: number, speed: number, time: number) {
    const length = this.channels[0]?.length ?? 0
    if (!length || !Number.isFinite(position + speed + time)) return
    const nominal = this.sourceRate / this.outputRate
    this.position = Math.max(
      0,
      Math.min(length - 1, position * this.sourceRate - this.origin)
    )
    this.velocity = speed * nominal
    // About 25 ms of travel at the record's speed, then still.
    this.target = Math.max(
      0,
      Math.min(length - 1, this.position + speed * this.sourceRate * 0.025)
    )
    this.gain = speed > 0 ? 1 : this.gain
    this.lastMove = time
    this.active = true
  }
  move(position: number, delta: number, time: number) {
    if (!Number.isFinite(position + delta + time) || !delta) return
    const length = this.channels[0]?.length ?? 0
    const target = Math.max(
      0,
      Math.min(length - 1, position * this.sourceRate - this.origin)
    )
    // A new touch, or a jump (cue, seek), restarts from where the hand began.
    if (
      !this.active ||
      Math.abs(this.target - target) > this.sourceRate * 0.25
    ) {
      this.position = Math.max(
        0,
        Math.min(length - 1, (position - delta) * this.sourceRate - this.origin)
      )
      this.velocity = 0
    }
    this.target = target
    this.lastMove = time
    this.active = true
  }
  stop() {
    this.active = false
    this.velocity = 0
  }
  private read(input: Float32Array, at: number) {
    const i = Math.floor(at),
      t = at - i,
      last = input.length - 1
    const p0 = input[Math.max(0, i - 1)],
      p1 = input[Math.min(last, i)],
      p2 = input[Math.min(last, i + 1)],
      p3 = input[Math.min(last, i + 2)]
    const c1 = 0.5 * (p2 - p0),
      c2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3,
      c3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2)
    return ((c3 * t + c2) * t + c1) * t + p1
  }
  /** Mean of the samples the needle passed between two positions. */
  private sweep(input: Float32Array, from: number, to: number) {
    const lo = Math.max(0, Math.floor(Math.min(from, to))),
      hi = Math.min(input.length - 1, Math.ceil(Math.max(from, to)))
    let sum = 0
    for (let i = lo; i <= hi; i++) sum += input[i]
    return sum / Math.max(1, hi - lo + 1)
  }
  render(outputs: Float32Array[], time: number) {
    for (const output of outputs) output.fill(0)
    if (!this.channels.length || !outputs.length) return
    const frames = outputs[0].length,
      length = this.channels[0].length,
      nominal = this.sourceRate / this.outputRate,
      limit = nominal * 8
    for (let frame = 0; frame < frames; frame++) {
      const before = this.position
      if (this.active) {
        const desired = Math.max(
          -limit,
          Math.min(limit, (this.target - this.position) * this.pull)
        )
        this.velocity += (desired - this.velocity) * this.damping
        const next = this.position + this.velocity
        // Never run past the hand: clamp at the target instead of overshooting.
        this.position =
          (this.velocity > 0 && next > this.target) ||
          (this.velocity < 0 && next < this.target)
            ? this.target
            : Math.max(0, Math.min(length - 1, next))
      }
      const speed = Math.abs(this.velocity) / nominal
      const still = time + frame / this.outputRate - this.lastMove > STILL
      // Quiet below ~3% speed like a stalled record; fade, never gate.
      const level = this.active ? Math.min(1, speed / 0.12) : 0
      this.gain += ((still ? 0 : level) - this.gain) * this.fade
      if (this.gain < 0.0001) {
        this.gain = 0
        continue
      }
      // Two one-pole stages (12 dB/octave) that close as speed rises above
      // normal play, after the box pre-filter for fast reads.
      const cutoff = Math.min(
          18000,
          (0.45 * this.outputRate) / Math.max(1, speed)
        ),
        alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / this.outputRate)
      // Blend from a point read to a swept read between 1.2× and 2× speed.
      const swept = Math.min(1, Math.max(0, (speed - 1.2) / 0.8))
      for (let channel = 0; channel < outputs.length; channel++) {
        const input = this.channels[Math.min(channel, this.channels.length - 1)]
        let sample = this.read(input, this.position)
        if (swept > 0)
          sample += (this.sweep(input, before, this.position) - sample) * swept
        const first =
          (this.filtered[channel] ?? sample) * (1 - alpha) + sample * alpha
        this.filtered[channel] = first
        const second =
          (this.filtered2[channel] ?? first) * (1 - alpha) + first * alpha
        this.filtered2[channel] = second
        outputs[channel][frame] = second * this.gain
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
            this.tape.setBuffer(
              message.channels,
              message.sampleRate,
              message.start ?? 0
            )
          else if (message.type === "hold")
            this.tape.hold(message.position, message.speed, message.time)
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
