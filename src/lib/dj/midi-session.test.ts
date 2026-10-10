import { describe, expect, it, vi } from "vitest"
import { MidiSession } from "./midi-session"

function access() {
  const input = { onmidimessage: vi.fn() }
  return {
    inputs: new Map([["FLX4", input]]),
    onstatechange: vi.fn(),
  } as unknown as MIDIAccess
}

describe("MIDI connection ownership", () => {
  it("unsubscribes the previous access before reconnecting", async () => {
    const session = new MidiSession(),
      first = access(),
      second = access()
    await session.connect(async () => first)
    await session.connect(async () => second)
    expect(first.onstatechange).toBeNull()
    expect(first.inputs.get("FLX4")!.onmidimessage).toBeNull()
    expect(session.access).toBe(second)
    session.disconnect()
    expect(second.inputs.get("FLX4")!.onmidimessage).toBeNull()
  })

  it("ignores requests completed out of order or after unmount", async () => {
    const session = new MidiSession(),
      first = access(),
      second = access()
    let finishFirst: (value: MIDIAccess) => void = () => {}
    const pending = session.connect(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve
        })
    )
    expect(await session.connect(async () => second)).toBe(second)
    finishFirst(first)
    expect(await pending).toBeNull()
    expect(session.access).toBe(second)
    let finish: (value: MIDIAccess) => void = () => {}
    const unmounted = session.connect(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    session.disconnect()
    finish(first)
    expect(await unmounted).toBeNull()
    expect(session.access).toBeNull()
  })
})
