/** Own one MIDI access at a time, including requests that finish after cleanup.
 * React remounts and repeated reconnects must not deliver a button twice. */
export class MidiSession {
  private generation = 0
  access: MIDIAccess | null = null

  async connect(request: () => Promise<MIDIAccess>) {
    this.disconnect()
    const generation = this.generation
    let access: MIDIAccess
    try {
      access = await request()
    } catch (error) {
      if (generation !== this.generation) return null
      throw error
    }
    if (generation !== this.generation) return null
    this.access = access
    return access
  }

  disconnect() {
    this.generation++
    if (this.access) {
      this.access.onstatechange = null
      this.access.inputs.forEach((input) => {
        input.onmidimessage = null
      })
    }
    this.access = null
  }
}
