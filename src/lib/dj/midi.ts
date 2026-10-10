import type { DeckId } from "./types"

export type MidiAction = {
  deck?: DeckId
  type:
    | "play"
    | "cue"
    | "sync"
    | "load"
    | "loop"
    | "loopIn"
    | "loopOut"
    | "hotcue"
    | "clearCue"
    | "volume"
    | "trim"
    | "low"
    | "mid"
    | "high"
    | "filter"
    | "rate"
    | "crossfade"
    | "browse"
    | "seek"
    | "jog"
    | "beatjump"
    | "padMode"
    | "padfx"
    | "sampler"
    | "beatloop"
    | "keyboard"
    | "keyshift"
    | "padBank"
    | "shift"
    | "jogTouch"
    | "syncMaster"
    | "tempoRange"
    | "trackStart"
    | "master"
    | "headphoneMix"
    | "headphoneLevel"
    | "micLevel"
    | "headphoneCue"
    | "masterCue"
    | "fxSelect"
    | "fxBeats"
    | "fxAmount"
    | "fxAssign"
    | "fxToggle"
    | "releaseFX"
    | "fxAuto"
    | "fxTap"
    | "smartCFX"
    | "smartCFXPreset"
    | "smartFader"
    | "loopAdjust"
    | "loopScale"
    | "activeLoop"
    | "memorySave"
    | "memoryDelete"
    | "quantize"
    | "browseFocus"
    | "browseZoom"
    | "faderPlay"
    | "faderCue"
    | "reverse"
    | "instantDouble"
    | "browseRelated"
    | "libraryView"
  value: number
  pressed?: boolean
  shifted?: boolean
}

// Independent protocol implementation. Byte addresses checked against the
// published FLX4 map; no third-party controller scripts are executed.
export function decodeFLX4(data: ArrayLike<number>): MidiAction | null {
  const status = data.length > 0 ? data[0] : undefined,
    control = data.length > 1 ? data[1] : undefined,
    value = data.length > 2 ? data[2] : undefined
  if (
    status === undefined ||
    control === undefined ||
    value === undefined ||
    value > 127 ||
    control > 127
  )
    return null
  const type = status & 0xf0,
    channel = status & 0x0f
  const deck: DeckId = [1, 9, 10].includes(channel) ? "B" : "A"
  if (type === 0x90 || type === 0x80) {
    const pressed = type === 0x90 && value > 0
    if (channel <= 1) {
      if (control === 0x0b)
        return { type: "play", deck, value: pressed ? 1 : 0 }
      if (control === 0x0c) return { type: "cue", deck, value: pressed ? 1 : 0 }
      if (control === 0x3f)
        return { type: "shift", deck, value: pressed ? 1 : 0 }
      if ([0x36, 0x67].includes(control))
        return { type: "jogTouch", deck, value: pressed ? 1 : 0 }
      if (control === 0x0e)
        return { type: "reverse", deck, value: pressed ? 1 : 0 }
    }
    if ([4, 5].includes(channel) && [0x10, 0x11].includes(control))
      return {
        type: "fxAssign",
        deck: control === 0x10 ? "A" : "B",
        value: pressed ? 1 : 0,
      }
    if ([7, 8, 9, 10].includes(channel)) {
      const shifted = channel === 8 || channel === 10
      if (
        (control >= 0x10 && control <= 0x17) ||
        (control >= 0x50 && control <= 0x57)
      )
        return {
          type: "padfx",
          deck,
          value: (control >= 0x50 ? 16 : 0) + (shifted ? 8 : 0) + (control & 7),
          pressed,
        }
      if (!pressed) return null
      if (control < 8)
        return { type: shifted ? "clearCue" : "hotcue", deck, value: control }
      if (control >= 0x20 && control <= 0x27) {
        if (shifted)
          return control >= 0x26
            ? { type: "padBank", deck, value: control === 0x26 ? -1 : 1 }
            : null
        return {
          type: "beatjump",
          deck,
          value: [-1, 1, -2, 2, -4, 4, -8, 8][control - 0x20],
        }
      }
      if (control >= 0x30 && control <= 0x37)
        return { type: "sampler", deck, value: control & 7, shifted }
      if (control >= 0x40 && control <= 0x47)
        return shifted && control < 0x46
          ? null
          : { type: "keyboard", deck, value: control & 7, shifted }
      if (control >= 0x60 && control <= 0x67)
        return {
          type: "beatloop",
          deck,
          value: [0.25, 0.5, 1, 2, 4, 8, 16, 32][control & 7],
        }
      if (control >= 0x70 && control <= 0x77)
        return shifted && control < 0x76
          ? null
          : { type: "keyshift", deck, value: control & 7, shifted }
      return null
    }
    if (!pressed) return null
    if (channel === 6) {
      if (control === 0x68)
        return { type: "browseRelated", deck: "A", value: 1 }
      if (control === 0x7a) return { type: "libraryView", value: 1 }
      if ([0x46, 0x47].includes(control))
        return { type: "load", deck: control === 0x46 ? "A" : "B", value: 1 }
      const mixer: Partial<Record<number, MidiAction["type"]>> = {
        0x63: "masterCue",
        0: "smartCFX",
        8: "smartCFXPreset",
        1: "smartFader",
        0x41: "browseFocus",
        0x42: "browseFocus",
      }
      const action = mixer[control]
      return action ? { type: action, value: control === 0x42 ? -1 : 1 } : null
    }
    if ([4, 5].includes(channel)) {
      const effects: Partial<Record<number, [MidiAction["type"], number]>> = {
        0x63: ["fxSelect", 1],
        0x64: ["fxSelect", -1],
        0x4a: ["fxBeats", -1],
        0x4b: ["fxBeats", 1],
        0x47: ["fxToggle", 1],
        0x43: ["releaseFX", 1],
        0x66: ["fxAuto", 1],
        0x6b: ["fxTap", 1],
      }
      const action = effects[control]
      return action ? { type: action[0], value: action[1] } : null
    }
    if (channel > 1) return null
    const modes: Partial<Record<number, number>> = {
      0x1b: 0,
      0x1e: 1,
      0x20: 2,
      0x22: 3,
      0x69: 4,
      0x6b: 5,
      0x6d: 6,
      0x6f: 7,
    }
    if (modes[control] !== undefined)
      return { type: "padMode", deck, value: modes[control] }
    const buttons: Partial<Record<number, [MidiAction["type"], number]>> = {
      0x0b: ["play", 1],
      0x58: ["sync", 1],
      0x5c: ["syncMaster", 1],
      0x60: ["tempoRange", 1],
      0x4d: ["loop", 1],
      0x50: ["activeLoop", 1],
      0x10: ["loopIn", 1],
      0x11: ["loopOut", 1],
      0x4c: ["loopAdjust", 0],
      0x4e: ["loopAdjust", 1],
      0x51: ["loopScale", 0.5],
      0x53: ["loopScale", 2],
      0x3e: ["memoryDelete", 1],
      0x3d: ["memorySave", 1],
      0x48: ["trackStart", 1],
      0x54: ["headphoneCue", 1],
      0x68: ["fxTap", 1],
      0x66: ["faderPlay", 1],
      0x52: ["faderCue", 1],
    }
    const button = buttons[control]
    return button ? { type: button[0], deck, value: button[1] } : null
  }
  if (type !== 0xb0) return null
  if (channel === 4 && control === 2)
    return { type: "fxAmount", value: value / 127 }
  if (channel === 6) {
    const mixer: Partial<Record<number, MidiAction["type"]>> = {
      8: "master",
      5: "micLevel",
      0x0c: "headphoneMix",
      0x0d: "headphoneLevel",
    }
    const mixerType = mixer[control]
    if (mixerType) return { type: mixerType, value: value / 127 }
    if (control === 0x64)
      return { type: "browseZoom", value: value < 64 ? value : value - 128 }
    if (control === 0x1f) return { type: "crossfade", value: value / 127 }
    if ([0x17, 0x18].includes(control))
      return {
        type: "filter",
        deck: control === 0x17 ? "A" : "B",
        value: bipolar(value, 64, 127),
      }
    if (control === 0x40)
      return { type: "browse", value: value < 64 ? value : value - 128 }
  }
  if (channel > 1) return null
  if (control === 0)
    return { type: "rate", deck, value: 1 + bipolar(value, 64, 127) * 0.08 }
  if (control === 0x13) return { type: "volume", deck, value: value / 127 }
  if (control === 4)
    return {
      type: "trim",
      deck,
      value: bipolar(value, 64, 127) * (value < 64 ? 24 : 12),
    }
  const eq: Partial<Record<number, "low" | "mid" | "high">> = {
    7: "high",
    0x0b: "mid",
    0x0f: "low",
  }
  const band = eq[control]
  if (band) return { type: band, deck, value: bipolar(value, 64, 127) * 12 }
  if ([0x21, 0x22, 0x23].includes(control))
    return value === 64 ? null : { type: "jog", deck, value: value - 64 }
  if (control === 0x29)
    return value === 64
      ? null
      : { type: "seek", deck, value: (value - 64) * 0.25 }
  return null
}
function bipolar(value: number, center: number, maximum: number) {
  return (value - center) / (value < center ? center : maximum - center)
}

/** One decoder per MIDI input: both halves stay isolated by channel/control.
 * MSB takes effect immediately; LSB refines it without waiting or smoothing.
 * LSB arriving first is held until its corresponding MSB is known. */
export class FLX4Decoder {
  private pairs = new Map<string, { msb?: number; lsb?: number }>()
  private heldButtons = new Set<string>()
  private loadPressedAt = new Map<DeckId, number>()
  private lastFxButton?: {
    type: MidiAction["type"]
    channel: number
    time: number
  }
  decode(data: ArrayLike<number>): MidiAction | null {
    const status = data.length > 0 ? data[0] : undefined,
      control = data.length > 1 ? data[1] : undefined,
      value = data.length > 2 ? data[2] : undefined
    if (
      status === undefined ||
      control === undefined ||
      value === undefined ||
      value > 127 ||
      control > 127
    )
      return null
    if ((status & 0xf0) !== 0xb0) {
      const action = decodeFLX4(data)
      if ((status & 0xf0) === 0x90 || (status & 0xf0) === 0x80) {
        const key = `${status & 0x0f}:${control}`,
          pressed = (status & 0xf0) === 0x90 && value > 0
        if (!pressed) this.heldButtons.delete(key)
        else if (action) {
          if (this.heldButtons.has(key)) return null
          this.heldButtons.add(key)
        }
      }
      if (action?.type === "load") {
        const time = performance.now(),
          previous = this.loadPressedAt.get(action.deck!)
        if (previous !== undefined && time - previous < 300) {
          this.loadPressedAt.delete(action.deck!)
          return { ...action, type: "instantDouble" }
        }
        this.loadPressedAt.set(action.deck!, time)
      }
      // The 1&2 assignment can emit one FX press on each deck channel.
      // Treat that adjacent pair as one physical press, without delaying it.
      if (action && ["fxToggle", "releaseFX"].includes(action.type)) {
        const time = performance.now(),
          channel = status & 0x0f,
          previous = this.lastFxButton
        if (
          previous &&
          previous.type === action.type &&
          previous.channel !== channel &&
          time - previous.time < 8
        )
          return null
        this.lastFxButton = { type: action.type, channel, time }
      }
      return action
    }
    const channel = status & 0x0f
    const base = control >= 0x20 ? control - 0x20 : control
    const continuous =
      channel <= 1
        ? [0, 4, 7, 0x0b, 0x0f, 0x13].includes(base)
        : channel === 6
          ? [5, 8, 0x0c, 0x0d, 0x17, 0x18, 0x1f].includes(base)
          : channel === 4 && base === 2
    if (!continuous) return decodeFLX4(data)
    const key = `${status}:${base}`,
      pair = this.pairs.get(key) ?? {}
    if (control >= 0x20) pair.lsb = value
    else pair.msb = value
    this.pairs.set(key, pair)
    if (pair.msb === undefined) return null
    const action = decodeFLX4([status, base, pair.msb])
    if (!action || pair.lsb === undefined) return action
    const raw = pair.msb * 128 + pair.lsb,
      signed = bipolar(raw, 8192, 16383)
    if (
      [
        "crossfade",
        "volume",
        "master",
        "micLevel",
        "headphoneMix",
        "headphoneLevel",
        "fxAmount",
      ].includes(action.type)
    )
      action.value = raw / 16383
    else if (action.type === "rate") action.value = 1 + signed * 0.08
    else if (action.type === "filter")
      action.value = Math.abs(signed) < 0.005 ? 0 : signed
    else if (action.type === "trim")
      action.value = signed * (signed < 0 ? 24 : 12)
    else action.value = signed * 12
    return action
  }
}
