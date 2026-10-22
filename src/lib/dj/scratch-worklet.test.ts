import { describe, expect, it } from "vitest"
import { ScratchTape } from "./scratch-worklet"

describe("continuous scratch tape", () => {
  it("reads forward and reverse without replacing output buffers and copies mono to stereo", () => {
    const tape = new ScratchTape(1000),
      input = Float32Array.from({ length: 1000 }, (_, i) => i / 1000)
    const outputs = [new Float32Array(128), new Float32Array(128)]
    tape.setBuffer([input], 1000)
    tape.move(0.3, 0.1, 0)
    tape.render(outputs, 0)
    expect(outputs[0][20]).toBeGreaterThan(outputs[0][1])
    expect(outputs[0]).toEqual(outputs[1])
    const firstBuffer = outputs[0]
    tape.stop()
    tape.move(0.2, -0.1, 1)
    tape.render(outputs, 1)
    expect(outputs[0]).toBe(firstBuffer)
    expect(outputs[0][40]).toBeLessThan(outputs[0][20])
    tape.stop()
    tape.render(outputs, 1.2)
    expect(outputs[0].every((sample) => sample === 0)).toBe(true)
  })
  it("silences stale motion and keeps boundary, malformed and unloaded reads finite", () => {
    const tape = new ScratchTape(44100),
      outputs = [new Float32Array(128)]
    tape.render(outputs, 0)
    expect(outputs[0].every((sample) => sample === 0)).toBe(true)
    tape.setBuffer(
      [Float32Array.from({ length: 4410 }, (_, i) => Math.sin(i * 0.1))],
      44100
    )
    tape.move(0.001, -0.02, 0)
    tape.render(outputs, 0)
    expect(outputs[0].every(Number.isFinite)).toBe(true)
    tape.move(NaN, 1, 0)
    for (let i = 0; i < 10; i++) tape.render(outputs, 0.1 + (i * 128) / 44100)
    expect(Math.max(...outputs[0].map(Math.abs))).toBeLessThan(0.001)
  })
})

describe("scratch motion bounds", () => {
  it("stops at the latest wheel target instead of overshooting between packets", () => {
    const tape = new ScratchTape(1000)
    tape.setBuffer(
      [Float32Array.from({ length: 1000 }, (_, i) => i / 1000)],
      1000
    )
    const output = [new Float32Array(128)]
    tape.move(0.3, 0.025, 0)
    tape.render(output, 0)
    expect(Math.max(...output[0])).toBeLessThanOrEqual(0.3001)
    tape.move(0.25, -0.05, 0.128)
    // Glides back to the hand without passing it, and settles within ~60 ms.
    const path: number[] = []
    for (let frame = 0; frame < 128; frame++) {
      tape.render([new Float32Array(1)], 0.128 + frame / 1000)
      path.push(tape.seconds)
    }
    expect(path[10]).toBeGreaterThan(path[24])
    expect(Math.min(...path)).toBeGreaterThanOrEqual(0.25)
    expect(path[60]).toBeLessThan(0.251)
  })
  it("follows jittery packets without speed steps", () => {
    const rate = 44100,
      tape = new ScratchTape(rate)
    tape.setBuffer(
      [Float32Array.from({ length: rate * 2 }, (_, i) => i / rate)],
      rate
    )
    // Constant hand speed (normal play) delivered with uneven packet timing.
    let time = 0,
      target = 0.5
    const samples: number[] = []
    for (let packet = 0; packet < 40; packet++) {
      const frames = [96, 160, 128, 224, 64][packet % 5]
      target += frames / rate
      tape.move(target, frames / rate, time)
      const output = [new Float32Array(frames)]
      tape.render(output, time)
      samples.push(...output[0])
      time += frames / rate
    }
    // Once settled, the read speed (sample-to-sample slope) stays near 1×.
    const steady = samples.slice(1500)
    const slopes = steady.slice(1).map((v, i) => (v - steady[i]) * rate)
    expect(Math.min(...slopes)).toBeGreaterThan(0.7)
    expect(Math.max(...slopes)).toBeLessThan(1.3)
  })
  it("softens high-speed reads instead of aliasing", () => {
    const rate = 44100
    const tone = Float32Array.from({ length: rate * 4 }, (_, i) =>
      Math.sin(i * 2.6)
    )
    const level = (speed: number) => {
      const tape = new ScratchTape(rate)
      tape.setBuffer([tone], rate)
      let time = 0,
        target = 0.5,
        sum = 0
      for (let packet = 0; packet < 60; packet++) {
        target += (speed * 128) / rate
        tape.move(target, (speed * 128) / rate, time)
        const output = [new Float32Array(128)]
        tape.render(output, time)
        if (packet > 20) for (const v of output[0]) sum += v * v
        time += 128 / rate
      }
      return sum
    }
    expect(level(4)).toBeLessThan(level(1) * 0.5)
  })
  it("keeps steady forward and reversed packet streams continuous with variable audio blocks", () => {
    const tape = new ScratchTape(44100)
    tape.setBuffer(
      [Float32Array.from({ length: 44100 }, (_, i) => i / 44100)],
      44100
    )
    let time = 0,
      target = 0.3,
      previous = 0
    for (let packet = 0; packet < 48; packet++) {
      const frames = [256, 128, 512][packet % 3],
        delta = ((packet < 24 ? 1 : -1) * frames) / 44100
      target += delta
      tape.move(target, delta, time)
      const output = [new Float32Array(frames)]
      tape.render(output, time)
      if (packet > 1)
        expect(Math.abs(output[0][0] - previous)).toBeLessThan(0.025)
      expect(output[0].every(Number.isFinite)).toBe(true)
      expect(Math.max(...output[0])).toBeLessThan(0.52)
      previous = output[0].at(-1)!
      time += frames / 44100
    }
    tape.stop()
    const output = [new Float32Array(512)]
    tape.render(output, time)
    tape.render(output, time + 512 / 44100)
    expect(Math.max(...output[0].map(Math.abs))).toBeLessThan(0.001)
  })
})
