import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  harmonicCompatibility,
  planTransitions,
  techniqueReadiness,
} from "./planner"
import { decodeFLX4, FLX4Decoder } from "./midi"
import { scoreTransition } from "./feedback"
import { DJEngine, deckOutputWarning, outgoingDeck } from "./engine"
import { demoTracks } from "./tracks"
import { techniques, genreGuide } from "./lessons"
import type { Track } from "./types"
import { alignBarPhase, beatOffset, echoDelay } from "./beatgrid"
import { cueOptions, transitionAnnotations } from "./cue-suggestions"
import { scopedTracks, recommendTracks } from "./library-scope"
import { defaultDatabase } from "./storage"
import { AutomixSession } from "./automix-session"
import { measurePeaks, waveformPath } from "./wave-peaks"

vi.mock("./pitch-control", () => ({
  registerPitch: vi.fn(async () => {}),
  createPitchNode: (context: ContextMock) => {
    const node = context.createGain() as NodeMock & {
      port: { close: () => void }
    }
    node.port = { close: vi.fn() }
    return {
      node,
      rate: new Param(),
      pitch: new Param(),
      semitones: new Param(),
    }
  },
}))

const analyzed: Track = {
  ...demoTracks[0],
  analysis: {
    peaks: [0.2, 0.4],
    energyCurve: [],
    bpm: 128,
    beatOffset: 0,
    key: "C maj",
    camelot: "8B",
    energy: 5,
    confidence: 0.5,
  },
  key: "C maj",
  camelot: "8B",
  energy: 5,
}
const incoming: Track = { ...analyzed, id: "incoming", bpm: 130, camelot: "8A" }
describe("musical transition planning", () => {
  it("ranks energy goals with played exclusions while retaining the requested routine and cue positions", () => {
    const pool = [3, 5, 7].map((energy) => ({
      ...incoming,
      id: `energy-${energy}`,
      title: `Energy ${energy}`,
      bpm: 128,
      camelot: "8B",
      energy,
    }))
    const options = {
      technique: "cut",
      transitionCues: {
        [analyzed.id]: { entry: null, exit: 90 },
        "energy-7": { entry: 42, exit: null },
      },
      played: new Set<string>(),
    }
    expect(
      recommendTracks(analyzed, pool, undefined, 1, "maintain", options)[0]
        .track.energy
    ).toBe(5)
    expect(
      recommendTracks(analyzed, pool, undefined, 1, "ease", options)[0].track
        .energy
    ).toBe(3)
    const lifted = recommendTracks(
      analyzed,
      pool,
      undefined,
      1,
      "lift",
      options
    )[0]
    expect(lifted.track.energy).toBe(7)
    expect(lifted.plan.id).toBe("cut")
    expect(lifted.plan.outStart).toBe(90)
    expect(lifted.plan.inStart).toBe(42)
    options.played.add("energy-7")
    expect(
      recommendTracks(analyzed, pool, undefined, 1, "lift", options).some(
        (item) => item.track.id === "energy-7"
      )
    ).toBe(false)
  })
  it("honors chosen entry and exit cues, including an entry beyond the intro", () => {
    const plans = planTransitions(analyzed, incoming, 0, {
      outCue: 90,
      inCue: 120,
    })
    expect(plans.length).toBeGreaterThan(0)
    for (const plan of plans) {
      expect(plan.outStart).toBe(90)
      expect(plan.inStart).toBe(120)
      expect(plan.outStart + plan.duration).toBeLessThan(analyzed.duration)
      expect(plan.inStart + plan.duration * plan.rate).toBeLessThan(
        incoming.duration
      )
    }
    expect(planTransitions(analyzed, incoming, 100, { outCue: 90 })).toEqual([])
    expect(planTransitions(analyzed, incoming, 0, { inCue: -1 })).toEqual([])
    expect(planTransitions(analyzed, incoming, 0, { outCue: NaN })).toEqual([])
  })
  it("omits long routines when a selected cue leaves too little room", () => {
    const plans = planTransitions(analyzed, incoming, 0, {
      inCue: incoming.duration - 1,
    })
    expect(plans.some((plan) => plan.beatmatch)).toBe(false)
    expect(plans.some((plan) => plan.execution === "cut")).toBe(true)
  })
  it("draws bounded estimated cues with bass exchange and clear cut context", () => {
    const plans = planTransitions(analyzed, incoming)
    const bass = plans.find((plan) => plan.id === "bass")!
    const annotations = transitionAnnotations(incoming, bass, false)
    expect(
      annotations.cues.find((cue) => cue.label === "BASS SWAP")?.position
    ).toBeCloseTo(bass.inStart + (bass.duration * bass.rate) / 2)
    expect(
      annotations.zones.some((zone) => zone.label === "BASS EXCHANGE")
    ).toBe(true)
    const cut = transitionAnnotations(
      analyzed,
      plans.find((plan) => plan.id === "cut"),
      true
    )
    expect(cut.zones[0].end - cut.zones[0].start).toBeGreaterThan(1)
    expect(cut.cues).toHaveLength(1)
    const loop = transitionAnnotations(
      analyzed,
      plans.find((plan) => plan.id === "loop"),
      true
    )
    expect(loop.cues).toHaveLength(1)
    expect(loop.zones[0].label).toBe("4-BEAT LOOP")
    expect(
      cueOptions(incoming, [null, 42], [null, "HOOK"], "entry").some(
        (cue) => cue.position === 42 && cue.label.includes("HOOK")
      )
    ).toBe(true)
  })
  it("restricts suggestions to the selected collection and visible filters with no fallback", () => {
    const outsider = {
      ...incoming,
      id: "outside",
      title: "Perfect match",
      bpm: 128,
    }
    const inside = {
      ...incoming,
      id: "inside",
      title: "Inside",
      source: "local" as const,
    }
    const tracks = [analyzed, outsider, inside]
    const database = {
      ...defaultDatabase,
      collections: [
        {
          id: "crate",
          name: "My crate",
          kind: "playlist" as const,
          trackIds: [analyzed.id, inside.id],
        },
      ],
    }
    const pool = scopedTracks(tracks, database, "collection:crate")
    expect(pool.map((track) => track.id)).toEqual([analyzed.id, inside.id])
    expect(
      recommendTracks(analyzed, pool, undefined, 1, "maintain").map(
        (item) => item.track.id
      )
    ).toEqual([inside.id])
    expect(scopedTracks(tracks, database, "collection:missing")).toEqual([])
    expect(
      scopedTracks(tracks, database, "collection:crate", "no match")
    ).toEqual([])
    expect(recommendTracks(analyzed, [], undefined, 1, "lift")).toEqual([])
    expect(
      scopedTracks(tracks, database, "local").map((track) => track.id)
    ).toEqual([inside.id])
    expect(
      scopedTracks(
        tracks,
        database,
        "collection:crate",
        "Inside",
        "Wrong genre"
      )
    ).toEqual([])
  })
  it("recognizes adjacent Camelot keys including the 12-to-1 boundary", () => {
    expect(harmonicCompatibility("12A", "1A")).toBe(0.95)
    expect(harmonicCompatibility("8A", "8B")).toBe(0.9)
    expect(harmonicCompatibility("8A", "3B")).toBe(0.2)
    expect(harmonicCompatibility(null, "3B")).toBe(0.5)
  })
  it("keeps exits within track bounds and on estimated 16-bar phrase boundaries", () => {
    for (const plan of planTransitions(analyzed, incoming)) {
      expect(plan.outStart + plan.duration).toBeLessThanOrEqual(
        analyzed.duration
      )
      expect(plan.outStart / ((60 / 128) * 64)).toBeCloseTo(
        Math.round(plan.outStart / ((60 / 128) * 64))
      )
      expect(plan.rate).toBeCloseTo(plan.beatmatch ? 128 / 130 : 1)
      if (plan.beatmatch)
        expect(plan.warnings.some((w) => w.includes("pitch"))).toBe(true)
    }
  })
  it("avoids forcing a long blend across a large tempo gap", () => {
    const plans = planTransitions(
      { ...analyzed, bpm: 90 },
      { ...incoming, bpm: 174 }
    )
    expect(plans.map((p) => p.execution).sort()).toEqual([
      "cut",
      "echo",
      "fade",
      "reverb",
    ])
    expect(plans.every((p) => !p.beatmatch && p.rate === 1)).toBe(true)
    expect(plans[0].warnings.some((w) => w.includes("8%"))).toBe(true)
  })
  it("has finite safe plans for unknown tempo and key", () => {
    const plans = planTransitions(
      { ...analyzed, bpm: null, camelot: null },
      { ...incoming, bpm: null }
    )
    expect(
      plans.every((p) => Number.isFinite(p.duration) && p.duration > 0)
    ).toBe(true)
    expect(plans[0].warnings.some((w) => w.includes("unknown"))).toBe(true)
  })
  it("offers distinct executable families and preparation requirements across the whole curriculum", () => {
    const plans = planTransitions(analyzed, { ...incoming, bpm: 128 })
    expect(new Set(plans.map((p) => p.execution)).size).toBe(9)
    expect(plans.find((p) => p.id === "harmonic")).toBeDefined()
    const catalog = techniqueReadiness(plans)
    expect(catalog).toHaveLength(28)
    expect(catalog.find((t) => t.technique.id === "drop")?.plan).toBeUndefined()
    expect(catalog.find((t) => t.technique.id === "vocal")?.reason).toContain(
      "no vocal"
    )
    expect(
      catalog.find((t) => t.technique.id === "multideck")?.reason
    ).toContain("two")
  })
  it("does not promise harmonic locking when matched playback changes relative pitch", () => {
    expect(
      planTransitions(analyzed, incoming).some((p) => p.id === "harmonic")
    ).toBe(false)
    const plans = planTransitions(analyzed, {
      ...incoming,
      bpm: 128,
      camelot: "3A",
    })
    expect(plans.some((p) => p.id === "long" || p.id === "harmonic")).toBe(
      false
    )
    expect(plans.some((p) => p.id === "filter")).toBe(true)
    expect(harmonicCompatibility("invalid", "3A")).toBe(0.5)
  })
  it("uses effective tempos and does not change native tempo for a gap handoff", () => {
    const plans = planTransitions(analyzed, incoming, 0, {
      outRate: 1.04,
      incomingRate: 1.02,
    })
    const bass = plans.find((p) => p.id === "bass")!
    expect(bass.incomingRate).toBeCloseTo((128 * 1.04) / 130)
    expect(plans.find((p) => p.id === "echo")!.incomingRate).toBe(1.02)
    expect(
      planTransitions(analyzed, incoming, 0, {
        outRate: 1.16,
        incomingRate: 0.84,
      }).every((p) => !p.beatmatch)
    ).toBe(true)
  })
  it("ranks genres, energy goals and recent routine repetition instead of giving identical scores", () => {
    const a = { ...analyzed, genre: "Deep House" },
      b = { ...incoming, bpm: 128, genre: "Deep House" }
    const ease = planTransitions(a, b, 0, { intent: "ease" })
    const lift = planTransitions(a, b, 0, { intent: "lift" })
    expect(ease.find((p) => p.id === "long")!.score).toBeGreaterThan(
      lift.find((p) => p.id === "long")!.score
    )
    const repeated = planTransitions(a, b, 0, {
      intent: "ease",
      recent: [ease[0].id],
    })
    expect(repeated.find((p) => p.id === ease[0].id)!.score).toBeLessThan(
      ease[0].score
    )
    expect(new Set(ease.map((p) => p.score)).size).toBeGreaterThan(3)
  })
  it("chooses a measured lower-energy early entry without claiming vocal or drop detection", () => {
    const curve = Array.from({ length: 366 }, (_, i) =>
      i < 30 ? 0.8 : i < 65 ? 0.1 : 0.5
    )
    const plans = planTransitions(analyzed, {
      ...incoming,
      bpm: 128,
      analysis: { ...incoming.analysis!, energyCurve: curve },
    })
    const bass = plans.find((p) => p.id === "bass")!
    expect(bass.inStart).toBe(30)
    expect(bass.warnings.some((w) => w.includes("No vocal or drop"))).toBe(true)
  })
  it("shortens late routines safely without placing the exit behind the playhead", () => {
    const position = analyzed.duration - 1
    for (const plan of planTransitions(analyzed, incoming, position)) {
      expect(plan.outStart).toBeGreaterThanOrEqual(position)
      expect(plan.outStart + plan.duration).toBeLessThanOrEqual(
        analyzed.duration
      )
      expect(plan.inStart + plan.duration * plan.rate).toBeLessThanOrEqual(
        incoming.duration
      )
      expect(plan.duration).toBeGreaterThan(0)
    }
    expect(planTransitions(analyzed, incoming, analyzed.duration)).toEqual([])
  })
})
describe("Pioneer FLX4 mapping", () => {
  it("maps both decks and ignores note-off messages", () => {
    expect(decodeFLX4([0x90, 0x0b, 127])).toEqual({
      deck: "A",
      type: "play",
      value: 1,
    })
    expect(decodeFLX4([0x91, 0x0c, 127])).toEqual({
      deck: "B",
      type: "cue",
      value: 1,
    })
    expect(decodeFLX4([0x90, 0x0b, 0])).toEqual({
      type: "play",
      deck: "A",
      value: 0,
    })
    expect(decodeFLX4([0x80, 0x0b, 127])).toEqual({
      type: "play",
      deck: "A",
      value: 0,
    })
  })
  it("maps channel faders, crossfader, hot cues, and load buttons from distinct channels", () => {
    expect(decodeFLX4([0xb1, 0x13, 127])).toEqual({
      deck: "B",
      type: "volume",
      value: 1,
    })
    expect(decodeFLX4([0xb6, 0x1f, 0])).toEqual({ type: "crossfade", value: 0 })
    expect(decodeFLX4([0x99, 7, 127])).toEqual({
      deck: "B",
      type: "hotcue",
      value: 7,
    })
    expect(decodeFLX4([0x96, 0x47, 127])).toEqual({
      deck: "B",
      type: "load",
      value: 1,
    })
  })
})
describe("FLX4 continuous controls and performance inputs", () => {
  it("refines either order of 14-bit fader messages without mixing decks", () => {
    const decoder = new FLX4Decoder()
    expect(decoder.decode([0xb1, 0x33, 127])).toBeNull()
    expect(decoder.decode([0xb1, 0x13, 127])).toEqual({
      type: "volume",
      deck: "B",
      value: 1,
    })
    expect(decoder.decode([0xb0, 0x13, 0])?.value).toBe(0)
    expect(decoder.decode([0xb1, 0x33, 0])?.value).toBeCloseTo(16256 / 16383)
    expect(decoder.decode([0xb6, 0x1f, 64])?.value).toBeCloseTo(64 / 127)
    expect(decoder.decode([0xb6, 0x3f, 0])?.value).toBeCloseTo(8192 / 16383)
  })
  it("maps exact filter/EQ centers and tempo direction with 14-bit controls", () => {
    const decoder = new FLX4Decoder()
    decoder.decode([0xb6, 0x18, 64])
    expect(decoder.decode([0xb6, 0x38, 0])).toEqual({
      type: "filter",
      deck: "B",
      value: 0,
    })
    decoder.decode([0xb1, 0x0f, 64])
    expect(decoder.decode([0xb1, 0x2f, 0])?.value).toBe(0)
    expect(decoder.decode([0xb1, 0, 0])?.value).toBeCloseTo(0.92)
    decoder.decode([0xb1, 0, 127])
    expect(decoder.decode([0xb1, 0x20, 127])?.value).toBeCloseTo(1.08)
    decoder.decode([0xb1, 4, 64])
    expect(decoder.decode([0xb1, 0x24, 0])?.value).toBe(0)
  })
  it("distinguishes loop in/out, cue release, shifted pads and jog from seek", () => {
    expect(decodeFLX4([0x91, 0x10, 127])?.type).toBe("loopIn")
    expect(decodeFLX4([0x91, 0x11, 127])?.type).toBe("loopOut")
    expect(decodeFLX4([0x81, 0x0c, 127])).toEqual({
      type: "cue",
      deck: "B",
      value: 0,
    })
    expect(decodeFLX4([0x9a, 3, 127])).toEqual({
      type: "clearCue",
      deck: "B",
      value: 3,
    })
    expect(decodeFLX4([0xb1, 0x21, 65])).toEqual({
      type: "jog",
      deck: "B",
      value: 1,
    })
    expect(decodeFLX4([0xb1, 0x21, 64])).toBeNull()
    expect(decodeFLX4([0x99, 0x30, 127])).toEqual({
      type: "sampler",
      deck: "B",
      value: 0,
      shifted: false,
    })
    expect(decodeFLX4([0x99, 0x25, 127])).toEqual({
      type: "beatjump",
      deck: "B",
      value: 4,
    })
  })
})

describe("controller practice feedback", () => {
  it("rewards aligned phrasing, tempo, and deliberate control shaping", () => {
    const report = scoreTransition(
      {
        startedAt: 0,
        startPosition: 30,
        beatOffset: 0,
        bpm: 128,
        incomingBpm: 128,
        outgoingRate: 1,
        incomingRate: 1,
        eqMoves: 4,
        faderMoves: 20,
        target: "B",
      },
      30000
    )
    expect(report.score).toBe(100)
    expect(report.duration).toBe(30)
  })
  it("does not treat unknown BPM as verified beat matching", () => {
    const report = scoreTransition(
      {
        startedAt: 0,
        startPosition: 3,
        beatOffset: 0,
        bpm: null,
        incomingBpm: null,
        outgoingRate: 1,
        incomingRate: 1,
        eqMoves: 0,
        faderMoves: 1,
        target: "B",
      },
      3000
    )
    expect(report.tempo).toBe(0)
    expect(report.score).toBeLessThan(50)
  })
})
describe("learning catalog", () => {
  it("covers all requested techniques with musical explanations, difficulty, and cautions", () => {
    expect(techniques).toHaveLength(28)
    expect(new Set(techniques.map((t) => t.id)).size).toBe(28)
    expect(
      techniques.every(
        (t) =>
          t.labels.length &&
          t.why.length > 50 &&
          t.steps.length >= 3 &&
          t.avoid.length > 20 &&
          t.level >= 1 &&
          t.level <= 4
      )
    ).toBe(true)
    expect(genreGuide).toHaveLength(18)
  })
})

class Param {
  value = 0
  cancelScheduledValues = vi.fn()
  setValueCurveAtTime = vi.fn()
  setValueAtTime = vi.fn((value: number) => {
    this.value = value
  })
  setTargetAtTime = vi.fn((value: number) => {
    this.value = value
  })
}
class NodeMock {
  delayTime = new Param()
  gain = new Param()
  frequency = new Param()
  Q = new Param()
  threshold = new Param()
  knee = new Param()
  ratio = new Param()
  attack = new Param()
  release = new Param()
  fftSize = 256
  type = ""
  connections: NodeMock[] = []
  routes: { target: NodeMock; output: number; input: number }[] = []
  maxChannelCount = 2
  channelCount = 2
  connect(target: NodeMock, output = 0, input = 0) {
    this.connections.push(target)
    this.routes.push({ target, output, input })
    return target
  }
  disconnect(target?: NodeMock) {
    this.connections = target
      ? this.connections.filter((node) => node !== target)
      : []
    this.routes = target
      ? this.routes.filter((route) => route.target !== target)
      : []
  }
  getFloatTimeDomainData(samples: Float32Array) {
    samples.fill(0)
  }
}
class SourceMock extends NodeMock {
  buffer: unknown
  playbackRate = new Param()
  detune = new Param()
  loop = false
  loopStart = 0
  loopEnd = 0
  onended: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
}
let resumeAction: () => Promise<void> = async () => {}
class AnalysisWorkerMock {
  static instances: AnalysisWorkerMock[] = []
  constructor() {
    AnalysisWorkerMock.instances.push(this)
  }
  postMessage = vi.fn()
  terminate = vi.fn()
  onmessage?: (event: { data: NonNullable<Track["analysis"]> }) => void
  onerror?: () => void
  onmessageerror?: () => void
}
class ContextMock {
  static latest: ContextMock
  constructor() {
    ContextMock.latest = this
  }
  gains: NodeMock[] = []
  filters: NodeMock[] = []
  sampleRate = 44100
  delays: NodeMock[] = []
  destination = new NodeMock()
  sources: SourceMock[] = []
  splitters: NodeMock[] = []
  mergers: NodeMock[] = []
  get currentTime() {
    return Date.now() / 1000
  }
  createGain() {
    const node = new NodeMock()
    this.gains.push(node)
    return node
  }
  createDynamicsCompressor() {
    return new NodeMock()
  }
  createBiquadFilter() {
    const filter = new NodeMock()
    this.filters.push(filter)
    return filter
  }
  createAnalyser() {
    return new NodeMock()
  }
  createDelay() {
    const node = new NodeMock()
    this.delays.push(node)
    return node
  }
  createConvolver() {
    return new NodeMock()
  }
  createBuffer(channels: number, length: number) {
    return {
      getChannelData: () => new Float32Array(length),
      numberOfChannels: channels,
    }
  }
  createMediaStreamDestination() {
    return { ...new NodeMock(), stream: {} }
  }
  createBufferSource() {
    const source = new SourceMock()
    this.sources.push(source)
    return source
  }
  createChannelSplitter() {
    const node = new NodeMock()
    this.splitters.push(node)
    return node
  }
  createChannelMerger() {
    const node = new NodeMock()
    this.mergers.push(node)
    return node
  }
  async decodeAudioData() {
    return {
      duration: 366,
      length: 100,
      sampleRate: 44100,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(100),
    }
  }
  resume() {
    return resumeAction()
  }
  async close() {}
}
describe("audio transport and automix lock", () => {
  let engine: DJEngine
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    resumeAction = async () => {}
    AnalysisWorkerMock.instances = []
    vi.stubGlobal("Worker", AnalysisWorkerMock)
    vi.stubGlobal("AudioContext", ContextMock)
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1),
    }))
    engine = new DJEngine()
  })
  afterEach(() => {
    engine.dispose()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  it("refreshes analysis during playback without replacing the source or resetting cues, controls or transport", async () => {
    await engine.load("A", analyzed)
    engine.seek("A", 40)
    engine.hotcue("A", 1)
    engine.renameCue("A", 1, "Hook")
    engine.setParam("A", "rate", 1.05)
    engine.setParam("A", "low", -6)
    await engine.play("A")
    const source = ContextMock.latest.sources.at(-1)!
    const sourceCount = ContextMock.latest.sources.length
    const saved = vi.fn()
    engine.onAnalysis = saved
    const refresh = engine.analyze("A")
    expect(engine.state.A.analysisStatus).toBe("running")
    expect(engine.state.A.playing).toBe(true)
    expect(engine.state.A.loading).toBe(false)
    vi.advanceTimersByTime(1000)
    const position = engine.state.A.position
    const worker = AnalysisWorkerMock.instances[0]
    worker.onmessage!({
      data: {
        ...analyzed.analysis!,
        bpm: 126,
        key: "Dm",
        camelot: "7A",
        energy: 7,
      },
    })
    expect(await refresh).toBe(true)
    expect(engine.state.A.track?.bpm).toBe(126)
    expect(engine.state.A.track?.camelot).toBe("7A")
    expect(engine.state.A.track?.analysis?.analyzedAt).toBeDefined()
    expect(engine.state.A.position).toBe(position)
    expect(engine.state.A.playing).toBe(true)
    expect(engine.state.A.rate).toBe(1.05)
    expect(engine.state.A.low).toBe(-6)
    expect(engine.state.A.cues[1]).toBe(40)
    expect(engine.state.A.cueLabels[1]).toBe("Hook")
    expect(source.stop).not.toHaveBeenCalled()
    expect(ContextMock.latest.sources).toHaveLength(sourceCount)
    expect(saved).toHaveBeenCalledTimes(1)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
  it("deduplicates same-song analysis and refreshes both decks while preserving a corrected grid", async () => {
    await engine.load("A", {
      ...analyzed,
      grid: { bpm: 127, offset: 0.2, originalBpm: 128 },
    })
    await engine.load("B", analyzed)
    const a = engine.analyze("A"),
      b = engine.analyze("B")
    expect(a).toBe(b)
    expect(AnalysisWorkerMock.instances).toHaveLength(1)
    AnalysisWorkerMock.instances[0].onmessage!({
      data: { ...analyzed.analysis!, bpm: 140 },
    })
    await a
    expect(engine.state.A.track?.bpm).toBe(127)
    expect(engine.state.B.track?.grid?.offset).toBe(0.2)
    expect(engine.state.B.analysisStatus).toBe("idle")
    expect(engine.state.A.track?.analysis?.bpm).toBe(140)
  })
  it("does not overwrite a replacement track when an earlier worker finishes", async () => {
    await engine.load("A", analyzed)
    const job = engine.analyze("A")
    await engine.load("A", incoming)
    const before = engine.state.A.track
    AnalysisWorkerMock.instances[0].onmessage!({
      data: { ...analyzed.analysis!, key: "Dm" },
    })
    expect(await job).toBe(true)
    expect(engine.state.A.track).toBe(before)
    expect(engine.state.A.track?.id).toBe(incoming.id)
    await engine.load("B", analyzed)
    expect(engine.state.B.track?.key).toBe("Dm")
  })
  it("lets audio keep playing after worker failure and timeout, and supports retry", async () => {
    await engine.load("B", analyzed)
    await engine.play("B")
    const original = engine.state.B.track
    const failed = engine.analyze("B")
    AnalysisWorkerMock.instances[0].onerror!()
    expect(await failed).toBe(false)
    expect(engine.state.B.analysisStatus).toBe("error")
    expect(engine.state.B.playing).toBe(true)
    expect(engine.state.B.track).toBe(original)
    const retried = engine.analyze("B")
    vi.advanceTimersByTime(60000)
    expect(await retried).toBe(false)
    expect(engine.state.B.analysisError).toContain("timed out")
    expect(engine.state.B.playing).toBe(true)
    const third = engine.analyze("B")
    AnalysisWorkerMock.instances[2].onmessage!({ data: analyzed.analysis! })
    expect(await third).toBe(true)
    expect(engine.state.B.analysisError).toBeNull()
  })
  it("renames and removes track cues without seeking, and refreshes both copies of the same track", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", analyzed)
    const saved = vi.fn()
    engine.onCueChange = saved
    engine.seek("A", 40)
    engine.hotcue("A", 1)
    const cues = engine.state.A.cues
    expect(engine.renameCue("A", 1, "  Vocal entry  ")).toBe(true)
    expect(engine.state.A.position).toBe(40)
    expect(engine.state.A.cueLabels[1]).toBe("Vocal entry")
    expect(engine.state.B.cueLabels[1]).toBe("Vocal entry")
    expect(engine.state.A.cues).not.toBe(cues)
    expect(saved.mock.calls.at(-1)?.[2][1]).toBe("Vocal entry")
    expect(engine.renameCue("A", 3, "No cue")).toBe(false)
    expect(engine.renameCue("A", -1, "Invalid")).toBe(false)
    engine.hotcue("A", 1, true)
    expect(engine.state.A.cues[1]).toBeNull()
    expect(engine.state.B.cueLabels[1]).toBeNull()
    expect(engine.state.A.position).toBe(40)
  })
  it("retains scratch resume after repeated touch and clears it when transport is stopped", async () => {
    await engine.load("A", analyzed)
    engine.seek("A", 40)
    await engine.play("A")
    engine.handleControllerAction({ type: "jogTouch", deck: "A", value: 1 })
    engine.handleControllerAction({ type: "jogTouch", deck: "A", value: 1 })
    engine.jog("A", -1)
    expect(engine.state.A.position).toBeCloseTo(39.975)
    engine.handleControllerAction({ type: "jogTouch", deck: "A", value: 0 })
    await Promise.resolve()
    expect(engine.state.A.playing).toBe(true)
    engine.handleControllerAction({ type: "jogTouch", deck: "A", value: 1 })
    engine.pause("A")
    engine.handleControllerAction({ type: "jogTouch", deck: "A", value: 0 })
    await Promise.resolve()
    expect(engine.state.A.playing).toBe(false)
  })
  it("applies held pad FX and restores the previous sound across SHIFT, mode change and unplug", async () => {
    await engine.load("A", analyzed)
    engine.setHardwareConnected(true)
    engine.setParam("A", "filter", 0.2)
    engine.setFX("A", { type: "reverb", enabled: true, amount: 0.3 })
    const original = { ...engine.state.A.fx }
    engine.padFX("A", 0, true)
    expect(engine.state.A.fx).toMatchObject({
      type: "echo",
      enabled: true,
      beats: 0.25,
    })
    engine.padFX("A", 7, true)
    expect(engine.state.A.filter).toBe(0.65)
    engine.padFX("A", 7, false)
    expect(engine.state.A.activePads).toEqual([0])
    engine.padFX("A", 8, false) // SHIFT was pressed between pad down and up.
    expect(engine.state.A.fx).toEqual(original)
    expect(engine.state.A.filter).toBe(0.2)
    engine.padFX("A", 6, true)
    engine.setPadMode("A", "beatjump")
    expect(engine.state.A.activePads).toEqual([])
    expect(engine.state.A.filter).toBe(0.2)
    engine.padFX("A", 4, true)
    engine.setHardwareConnected(false)
    expect(engine.state.A.fx).toEqual(original)
    expect(engine.state.A.activePads).toEqual([])
  })
  it("rejoins the live timeline after a held FX roll and restores slip mode", async () => {
    await engine.load("A", analyzed)
    engine.seek("A", 30)
    await engine.play("A")
    engine.padFX("A", 16, true)
    expect(engine.state.A.loop).toBe(0.25)
    await vi.advanceTimersByTimeAsync(1000)
    engine.padFX("A", 16, false)
    expect(engine.state.A.loop).toBeNull()
    expect(engine.state.A.slip).toBe(false)
    expect(engine.state.A.position).toBeCloseTo(31)
  })
  it("routes Beat FX to the hardware-selected decks and toggles beat sync off", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    engine.handleControllerAction({ type: "fxAssign", deck: "B", value: 1 })
    expect(engine.state.controller.fxTarget).toBe("both")
    engine.handleControllerAction({ type: "fxToggle", value: 1 })
    engine.handleControllerAction({ type: "fxAmount", value: 0.731 })
    expect(engine.state.A.fx).toMatchObject({ enabled: true, amount: 0.731 })
    expect(engine.state.B.fx).toMatchObject({ enabled: true, amount: 0.731 })
    engine.handleControllerAction({ type: "fxAssign", deck: "A", value: 0 })
    engine.handleControllerAction({ type: "fxSelect", value: 1 })
    expect(engine.state.A.fx.type).toBe("echo")
    expect(engine.state.B.fx.type).toBe("reverb")
    engine.handleControllerAction({ type: "sync", deck: "B", value: 1 })
    expect(engine.state.B.syncTo).toBe("A")
    engine.handleControllerAction({ type: "sync", deck: "B", value: 1 })
    expect(engine.state.B.syncTo).toBeNull()
  })
  it("stores and recalls memory cues, halves loops and adjusts loop bounds with the jog", async () => {
    await engine.load("A", analyzed)
    const save = vi.fn()
    engine.onAnalysis = save
    for (const position of [10, 20]) {
      engine.seek("A", position)
      engine.handleControllerAction({ type: "memorySave", deck: "A", value: 1 })
    }
    expect(save.mock.calls.at(-1)?.[0].memoryCues).toEqual([10, 20])
    engine.handleControllerAction({ type: "loopScale", deck: "A", value: 0.5 })
    expect(engine.state.A.position).toBe(10)
    engine.loop("A", 4)
    engine.handleControllerAction({ type: "loopScale", deck: "A", value: 0.5 })
    expect(engine.state.A.loop).toBe(2)
    engine.handleControllerAction({ type: "loopOut", deck: "A", value: 1 })
    engine.jog("A", 10)
    expect(engine.state.A.loop).toBeGreaterThan(2)
    engine.loop("A", null)
    engine.handleControllerAction({ type: "memoryDelete", deck: "A", value: 1 })
    expect(engine.state.A.memoryCues).toEqual([20])
  })
  it("triggers independent sampler banks and stops samples with SHIFT", async () => {
    await engine.triggerSample("A", 0)
    await engine.triggerSample("B", 0)
    expect(engine.state.A.samplerSlots[0].playing).toBe(true)
    expect(engine.state.B.samplerSlots[0].playing).toBe(true)
    await engine.triggerSample("A", 0, true)
    expect(engine.state.A.samplerSlots[0].playing).toBe(false)
    expect(engine.state.B.samplerSlots[0].playing).toBe(true)
  })
  it("maps monitor and mic knobs without changing the system speaker output", async () => {
    await engine.load("A", analyzed)
    const sourceCount = ContextMock.latest.sources.length
    for (const [type, value] of [
      ["master", 0.6],
      ["headphoneMix", 0.75],
      ["headphoneLevel", 0.9],
      ["micLevel", 0.45],
    ] as const)
      engine.handleControllerAction({ type, value })
    engine.handleControllerAction({ type: "headphoneCue", deck: "A", value: 1 })
    engine.handleControllerAction({ type: "masterCue", value: 1 })
    expect(engine.state.master).toBe(0.6)
    expect(engine.state.controller).toMatchObject({
      headphoneMix: 0.75,
      headphoneLevel: 0.9,
      micLevel: 0.45,
      masterCue: true,
      monitorConnected: false,
      micEnabled: false,
    })
    expect(engine.state.A.headphoneCue).toBe(true)
    expect(ContextMock.latest.gains[1].gain.value).toBe(0.9)
    expect(ContextMock.latest.gains[2].gain.value).toBe(0.75)
    expect(ContextMock.latest.gains[3].gain.value).toBe(0.45)
    expect(ContextMock.latest.gains[6].gain.value).toBe(0.25)
    expect(ContextMock.latest.sources.length).toBe(sourceCount)
  })
  it("does not redraw idle decks and reuses meter buffers while playing", async () => {
    await engine.load("A", analyzed)
    const listener = vi.fn()
    engine.subscribe(listener)
    await vi.advanceTimersByTimeAsync(500)
    expect(listener).not.toHaveBeenCalled()
    await engine.play("A")
    listener.mockClear()
    await vi.advanceTimersByTimeAsync(150)
    expect(listener).toHaveBeenCalledTimes(3)
    expect(engine.state.A.position).toBeCloseTo(0.15)
  })
  it("prevents stopped pending sampler starts from playing after audio resume", async () => {
    let resume!: () => void
    resumeAction = () =>
      new Promise<void>((resolve) => {
        resume = resolve
      })
    const pending = engine.triggerSample("A", 0)
    engine.stopSample("A", 0)
    resume()
    await pending
    expect(engine.state.A.samplerSlots[0].playing).toBe(false)
    expect(ContextMock.latest.sources.at(-1)?.start).not.toHaveBeenCalled()
    expect(ContextMock.latest.sources.at(-1)?.stop).not.toHaveBeenCalled()
  })
  it("changes musical key without changing playback speed or beat sync", async () => {
    await engine.load("A", { ...analyzed, bpm: 120 })
    await engine.load("B", { ...incoming, bpm: 120 })
    await engine.setKeyShift("A", 1)
    expect(engine.sync("B")).toBe(true)
    expect(engine.state.B.rate).toBe(1)
    await engine.play("A")
    const source = ContextMock.latest.sources.at(-1)!
    expect(source.detune.value).toBe(0)
    expect(source.playbackRate.value).toBe(1)
    await vi.advanceTimersByTimeAsync(200)
    expect(engine.state.A.position).toBeCloseTo(0.2)
  })
  it("keeps a sync follower aligned while shifting the master's pitch", async () => {
    await engine.load("A", { ...analyzed, bpm: 120 })
    await engine.load("B", { ...incoming, bpm: 120 })
    expect(engine.sync("B")).toBe(true)
    await engine.setKeyShift("A", 1)
    expect(engine.state.B.syncTo).toBe("A")
    expect(engine.state.B.rate).toBe(1)
  })
  it("enables pitch compensation without restarting the playing source and keeps jog rate mirrored", async () => {
    await engine.load("A", analyzed)
    await engine.play("A")
    const source = ContextMock.latest.sources.at(-1)!
    await engine.setKeyLock("A", true)
    expect(engine.state.A.keyLock).toBe(true)
    expect(ContextMock.latest.sources).toHaveLength(1)
    expect(source.stop).not.toHaveBeenCalled()
    engine.setParam("A", "rate", 1.08)
    expect(source.playbackRate.value).toBe(1.08)
    const pitch = (
      engine as unknown as {
        channels: {
          A: { pitch: { rate: Param; pitch: Param; semitones: Param } }
        }
      }
    ).channels.A.pitch
    expect(pitch.rate.value).toBe(1.08)
    expect(pitch.pitch.value).toBe(1)
    await engine.setKeyShift("A", -3)
    expect(pitch.semitones.value).toBe(-3)
    engine.jog("A", 2)
    expect(pitch.rate.value).toBe(source.playbackRate.value)
    await vi.advanceTimersByTimeAsync(150)
    expect(pitch.rate.value).toBe(1.08)
    await engine.setKeyLock("A", false)
    expect(pitch.pitch.value).toBe(1.08)
  })
  it("routes master to 1/2 and headphones to 3/4 without mixing cue into the recording", async () => {
    await engine.load("A", analyzed)
    const ctx = ContextMock.latest
    expect(engine.state.controller.outputPairs).toBe(false)
    expect(() => engine.setOutputPairs(true)).toThrow("only 2 output channels")
    expect(ctx.destination.channelCount).toBe(2)
    ctx.destination.maxChannelCount = 4
    engine.setOutputPairs(true)
    const [master, cue] = ctx.splitters,
      merger = ctx.mergers[0]
    expect(master.routes.map(({ output, input }) => [output, input])).toEqual([
      [0, 0],
      [1, 1],
    ])
    expect(cue.routes.map(({ output, input }) => [output, input])).toEqual([
      [0, 2],
      [1, 3],
    ])
    expect(cue.connections).toEqual([merger, merger])
    expect(merger.connections).toEqual([ctx.destination])
    expect(ctx.destination.channelCount).toBe(4)
    expect(engine.state.controller.monitorConnected).toBe(true)
    engine.setOutputPairs(false)
    expect(merger.connections).toEqual([])
    expect(ctx.destination.channelCount).toBe(2)
    expect(engine.state.controller.monitorConnected).toBe(false)
  })
  it("instant-doubles a playing deck at its live position with one decoded buffer and retained target EQ", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    await engine.play("A")
    engine.setParam("B", "low", -6)
    await vi.advanceTimersByTimeAsync(300)
    expect(engine.instantDouble("B")).toBe(true)
    await Promise.resolve()
    expect(engine.state.B.track?.id).toBe(analyzed.id)
    expect(engine.state.B.playing).toBe(true)
    expect(engine.state.B.position).toBeCloseTo(0.3)
    expect(engine.state.B.low).toBe(-6)
    const sources = ContextMock.latest.sources
    expect(sources[0].buffer).toBe(sources[1].buffer)
    expect(sources[1].start).toHaveBeenCalledWith(0.3, 0.3)
  })
  it("applies every MIDI value to audio immediately and paints only the latest value", async () => {
    await engine.load("A", analyzed)
    let paint: FrameRequestCallback | undefined
    const request = vi.fn((callback: FrameRequestCallback) => {
      paint = callback
      return 1
    })
    vi.stubGlobal("requestAnimationFrame", request)
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    engine.setHardwareConnected(true)
    paint!(0)
    const listener = vi.fn()
    engine.subscribe(listener)
    const decoder = new FLX4Decoder()
    const gain = ContextMock.latest.gains[4].gain
    gain.setValueAtTime.mockClear()
    gain.setTargetAtTime.mockClear()
    request.mockClear()
    for (let msb = 0; msb < 128; msb++) {
      for (const control of [0x1f, 0x3f]) {
        const action = decoder.decode([0xb6, control, msb])!
        engine.setCrossfade(action.value)
        expect(engine.getSnapshot().crossfade).toBe(action.value)
        expect(gain.value).toBeCloseTo(
          0.8 * Math.cos((action.value * Math.PI) / 2)
        )
      }
    }
    expect(gain.setValueAtTime).toHaveBeenCalledTimes(256)
    expect(gain.setTargetAtTime).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
    paint!(16)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(engine.getSnapshot().crossfade).toBe(1)
  })
  it("updates only the moved EQ parameter instead of rescheduling FX and faders", async () => {
    await engine.load("A", analyzed)
    engine.setHardwareConnected(true)
    const context = ContextMock.latest
    const parameters = [
      ...context.filters.map((node) => node.gain),
      ...context.gains.map((node) => node.gain),
      ...context.delays.map((node) => node.delayTime),
    ]
    parameters.forEach((param) => param.setValueAtTime.mockClear())
    engine.setParam("A", "low", -6.125)
    expect(context.filters[0].gain.value).toBe(-6.125)
    expect(
      parameters.reduce(
        (sum, param) => sum + param.setValueAtTime.mock.calls.length,
        0
      )
    ).toBe(1)
  })
  it("cancels a pending paint on disconnect and disposal", () => {
    const request = vi.fn(() => 7)
    const cancel = vi.fn()
    vi.stubGlobal("requestAnimationFrame", request)
    vi.stubGlobal("cancelAnimationFrame", cancel)
    const listener = vi.fn()
    engine.subscribe(listener)
    engine.setHardwareConnected(true)
    engine.setCrossfade(0.2)
    engine.setHardwareConnected(false)
    expect(cancel).toHaveBeenCalledWith(7)
    expect(listener).toHaveBeenCalledTimes(1)
    engine.setHardwareConnected(true)
    engine.dispose()
    expect(cancel).toHaveBeenCalledTimes(2)
  })
  it.each(["A", "B"] as const)(
    "syncs deck %s by tempo and four-beat bar while preserving playback",
    async (id) => {
      const other = id === "A" ? "B" : "A"
      await engine.load(other, {
        ...analyzed,
        bpm: 120,
        grid: { bpm: 120, offset: 0.125, originalBpm: 128 },
      })
      await engine.load(id, {
        ...incoming,
        bpm: 125,
        grid: { bpm: 125, offset: 0.25, originalBpm: 130 },
      })
      engine.seek(other, 11.875)
      engine.seek(id, 30.45)
      await engine.play(other)
      await engine.play(id)
      engine.setParam(other, "rate", 1.04)
      expect(engine.sync(id)).toBe(true)
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(100)
      const state = engine.state
      expect(state[id].playing).toBe(true)
      expect(state[id].syncTo).toBe(other)
      expect(state[id].rate * 125).toBeCloseTo(120 * 1.04)
      const difference =
        ((state[id].position - 0.25) * 125) / 60 -
        ((state[other].position - 0.125) * 120) / 60
      expect(
        Math.abs(difference - Math.round(difference / 4) * 4)
      ).toBeLessThan(0.00001)
      expect(state[other].position).toBeCloseTo(11.979)
      engine.setParam(other, "rate", 1.02)
      expect(engine.state[id].rate * 125).toBeCloseTo(122.4)
      expect(engine.state[id].syncTo).toBe(other)
      engine.setParam(id, "rate", 1)
      expect(engine.state[id].syncTo).toBeNull()
    }
  )
  it("re-aligns a synced paused deck when Play resumes later, without auto-playing on Sync", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    engine.seek("A", 9)
    await engine.play("A")
    expect(engine.sync("B")).toBe(true)
    expect(engine.state.B.playing).toBe(false)
    let resume: () => void = () => {}
    resumeAction = () =>
      new Promise((resolve) => {
        resume = resolve
      })
    const play = engine.play("B")
    await vi.advanceTimersByTimeAsync(725)
    resume()
    await play
    await vi.advanceTimersByTimeAsync(100)
    const source = ContextMock.latest.sources.at(-1)!
    expect(source.start.mock.calls[0][0]).toBeCloseTo(0.73)
    const difference =
      (engine.state.B.position * 130) / 60 -
      (engine.state.A.position * 128) / 60
    expect(Math.abs(difference - Math.round(difference / 4) * 4)).toBeLessThan(
      0.00001
    )
  })
  it("keeps sync candidates within offsets and rejects unknown/out-of-range tempo", async () => {
    const track = {
      ...analyzed,
      bpm: 120,
      grid: { bpm: 120, offset: 0.4, originalBpm: 128 },
    }
    expect(alignBarPhase(track, 0, -0.5)).toBeCloseTo(0.15)
    await engine.load("A", analyzed)
    await engine.load("B", { ...incoming, bpm: null })
    expect(engine.sync("B")).toBe(false)
    expect(engine.state.error).toContain("analyze")
    await engine.load("B", { ...incoming, bpm: 60 })
    expect(engine.sync("B")).toBe(false)
    expect(engine.state.B.rate).toBe(1)
    await engine.load("B", incoming)
    engine.loop("B", 1)
    expect(engine.sync("B")).toBe(false)
    expect(engine.state.B.syncTo).toBeNull()
  })
  it("saves suggested cue labels without moving transport or overwriting occupied pads", async () => {
    await engine.load("A", analyzed, [
      0,
      15,
      null,
      null,
      null,
      null,
      null,
      null,
    ])
    await engine.play("A")
    const saved = vi.fn()
    engine.onCueChange = saved
    expect(engine.saveSuggestedCue("A", 60, "ENTRY")).toBe(2)
    expect(engine.state.A.position).toBe(0)
    expect(engine.state.A.playing).toBe(true)
    expect(engine.state.A.cues.slice(0, 3)).toEqual([0, 15, 60])
    expect(engine.saveSuggestedCue("A", 60, "ENTRY")).toBe(2)
    expect(saved).toHaveBeenCalledTimes(1)
    await engine.load(
      "B",
      analyzed,
      saved.mock.calls[0][1],
      saved.mock.calls[0][2]
    )
    expect(engine.state.B.cueLabels[2]).toBe("ENTRY")
    engine.hotcue("B", 2, true)
    expect(engine.state.A.cues[2]).toBeNull()
    expect(engine.state.B.cueLabels[2]).toBeNull()
    await engine.load("A", analyzed, [0, 1, 2, 3, 4, 5, 6, 7])
    expect(engine.saveSuggestedCue("A", 60, "EXIT")).toBeNull()
    expect(engine.state.A.cues).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
  it("executes an anchored transition from the chosen cues and refuses a passed exit", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    const plan = planTransitions(analyzed, incoming, 0, {
      outCue: 4,
      inCue: 90,
    }).find((candidate) => candidate.id === "bass")!
    await engine.startAuto("A", plan)
    expect(engine.state.autoPlan?.outStart).toBe(4)
    expect(engine.state.autoPlan?.inStart).toBe(90)
    await vi.advanceTimersByTimeAsync(4200)
    expect(engine.state.B.playing).toBe(true)
    expect(ContextMock.latest.sources.at(-1)!.start.mock.calls[0][1]).toBe(90)
    engine.cancelAuto()
    engine.seek("A", 10)
    await engine.startAuto("A", plan)
    expect(engine.state.auto).toBe(false)
    expect(engine.state.error).toContain("no longer fits")
  })
  it("applies a saved grid to both decks and to quantized cue, loop and sync timing", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", analyzed)
    const save = vi.fn()
    engine.onAnalysis = save
    engine.setBeatgrid("A", 120, 0.125)
    expect(save.mock.calls.at(-1)![0].grid).toMatchObject({
      bpm: 120,
      offset: 0.125,
    })
    expect(beatOffset(engine.state.B.track)).toBe(0.125)
    engine.setQuantize("B", true)
    engine.seek("B", 1.38)
    engine.hotcue("B", 1)
    expect(engine.state.B.cues[1]).toBe(1.625)
    await engine.play("B")
    engine.loop("B", 4)
    const source = ContextMock.latest.sources.at(-1)!
    expect(source.loopStart).toBe(1.125)
    expect(source.loopEnd).toBe(3.125)
    engine.loop("B", null)
    engine.pause("B")
    engine.beatjump("B", 4)
    expect(engine.state.B.position).toBe(3.625)
    engine.resetBeatgrid("A")
    expect(engine.state.A.track?.bpm).toBe(128)
    expect(engine.state.B.track?.grid).toBeUndefined()
  })
  it("returns to the advancing timeline after a slip loop without restarting on loop entry", async () => {
    await engine.load("A", analyzed)
    engine.seek("A", 10)
    await engine.play("A")
    const source = ContextMock.latest.sources.at(-1)!
    engine.setSlip("A", true)
    engine.loop("A", 2)
    expect(source.stop).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2500)
    expect(engine.state.A.position).toBeLessThan(11)
    expect(engine.state.A.slipPosition).toBeCloseTo(12.5)
    engine.loop("A", null)
    await Promise.resolve()
    expect(engine.state.A.position).toBeCloseTo(12.5)
    expect(engine.state.A.playing).toBe(true)
    expect(engine.state.A.loop).toBeNull()
    expect(ContextMock.latest.sources.at(-1)!.loop).toBe(false)
  })
  it("retains a grid correction when a stale library object is reloaded", async () => {
    await engine.load("A", analyzed)
    engine.setBeatgrid("A", 123, 0.2)
    await engine.load("B", analyzed)
    expect(engine.state.B.track?.bpm).toBe(123)
    expect(beatOffset(engine.state.B.track)).toBe(0.2)
  })
  it("accounts for tempo changes while the hidden slip timeline advances", async () => {
    await engine.load("A", analyzed)
    await engine.play("A")
    engine.setSlip("A", true)
    engine.loop("A", 1)
    await vi.advanceTimersByTimeAsync(1000)
    engine.setParam("A", "rate", 1.1)
    await vi.advanceTimersByTimeAsync(1000)
    engine.loop("A", null)
    await Promise.resolve()
    expect(engine.state.A.position).toBeCloseTo(2.1)
  })
  it("also returns to the timeline after a hardware-style loop in/out in slip mode", async () => {
    await engine.load("B", incoming)
    engine.seek("B", 10)
    await engine.play("B")
    engine.setSlip("B", true)
    engine.setLoopIn("B")
    await vi.advanceTimersByTimeAsync(2000)
    engine.setLoopOut("B")
    await vi.advanceTimersByTimeAsync(2500)
    expect(engine.state.B.slipPosition).toBeCloseTo(14.5)
    engine.loop("B", null)
    await Promise.resolve()
    expect(engine.state.B.position).toBeCloseTo(14.5)
  })
  it("keeps normal loops at their audible position and cancels slip on an explicit seek", async () => {
    await engine.load("A", analyzed)
    await engine.play("A")
    engine.loop("A", 1)
    await vi.advanceTimersByTimeAsync(1200)
    const repeated = engine.state.A.position
    engine.loop("A", null)
    expect(engine.state.A.position).toBeCloseTo(repeated)
    engine.setSlip("A", true)
    engine.loop("A", 1)
    engine.seek("A", 15)
    await Promise.resolve()
    expect(engine.state.A.slipPosition).toBeNull()
    expect(engine.state.A.position).toBe(15)
  })
  it("synchronizes independent echo units with effective tempo and keeps finite feedback", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    engine.setHardwareConnected(true)
    engine.setFX("A", { enabled: true, beats: 0.75, amount: 0.5 })
    engine.setParam("A", "rate", 1.1)
    const ctx = ContextMock.latest
    expect(ctx.delays[0].delayTime.value).toBeCloseTo(echoDelay(128, 1.1, 0.75))
    expect(ctx.delays[1].delayTime.value).toBeCloseTo(echoDelay(130, 1, 1))
    const feedback = ctx.delays[0].connections[1]
    expect(feedback.gain.value).toBeLessThan(1)
    expect(feedback.connections).toContain(ctx.delays[0])
    expect(engine.state.B.fx.enabled).toBe(false)
  })
  it("stops the dry deck after one echo interval and leaves the tail connected to master", async () => {
    await engine.load("B", incoming)
    await engine.play("B")
    engine.setFX("B", { beats: 0.5 })
    engine.echoOut("B")
    expect(engine.state.B.echoOut).toBe(true)
    await vi.advanceTimersByTimeAsync(300)
    expect(engine.state.B.playing).toBe(false)
    expect(engine.state.B.echoOut).toBe(false)
    expect(engine.state.B.fx.enabled).toBe(false)
    expect(
      ContextMock.latest.delays[1].connections[0].connections[0].connections[0]
        .connections[0]
    ).toBe(ContextMock.latest.destination)
  })
  it("does not let a cancelled echo-out stop a later manual playback", async () => {
    await engine.load("A", analyzed)
    await engine.play("A")
    engine.echoOut("A")
    engine.pause("A")
    await engine.play("A")
    await vi.advanceTimersByTimeAsync(600)
    expect(engine.state.A.playing).toBe(true)
  })
  it("updates playback state even if a render occurs while AudioContext resumes", async () => {
    await engine.load("A", analyzed)
    let resume: () => void = () => {}
    resumeAction = () =>
      new Promise<void>((resolve) => {
        resume = resolve
      })
    const play = engine.play("A")
    await vi.advanceTimersByTimeAsync(50)
    resume()
    await play
    expect(engine.state.A.playing).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(engine.state.A.position).toBeCloseTo(1)
    engine.pause("A")
    expect(engine.state.A.playing).toBe(false)
  })
  it("uses the same outgoing deck for zones and planning at the center and with only B playing", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    expect(outgoingDeck(engine.state)).toBe("A")
    await engine.play("B")
    expect(outgoingDeck(engine.state)).toBe("B")
    await engine.play("A")
    expect(outgoingDeck(engine.state)).toBe("A")
    engine.setCrossfade(0.9)
    expect(outgoingDeck(engine.state)).toBe("B")
  })

  it("routes right-deck MIDI playback to master with a nonzero channel gain", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    engine.setHardwareConnected(true)
    const decoder = new FLX4Decoder()
    for (const bytes of [
      [0xb1, 0x13, 127],
      [0xb1, 0x33, 127],
      [0xb6, 0x1f, 127],
      [0xb6, 0x3f, 127],
      [0x91, 0x0b, 127],
    ]) {
      const action = decoder.decode(bytes)!
      if (action.type === "volume")
        engine.setParam(action.deck!, "volume", action.value)
      if (action.type === "crossfade") engine.setCrossfade(action.value)
      if (action.type === "play") await engine.toggle(action.deck!)
    }
    const ctx = ContextMock.latest,
      source = ctx.sources.at(-1)!
    const path: NodeMock[] = []
    let node: NodeMock | undefined = source
    while (node && node !== ctx.destination && path.length < 20) {
      path.push(node)
      node = node.connections.at(0)
    }
    expect(node).toBe(ctx.destination)
    const channelGains = path.filter((n) => ctx.gains.includes(n))
    expect(channelGains.map((n) => n.gain.value)).toEqual([1, 1, 0.7])
    expect(
      channelGains.every((n) => n.gain.setValueAtTime.mock.calls.length > 0)
    ).toBe(true)
    expect(engine.state.B.playing).toBe(true)
    expect(deckOutputWarning(engine.state, "B")).toBeNull()
  })
  it("does not restart or stop playing audio when a jog wheel nudges tempo", async () => {
    await engine.load("B", incoming)
    await engine.play("B")
    const ctx = ContextMock.latest,
      source = ctx.sources.at(-1)!
    for (let i = 0; i < 100; i++) engine.jog("B", 2)
    expect(ctx.sources).toHaveLength(1)
    expect(source.stop).not.toHaveBeenCalled()
    expect(source.playbackRate.value).toBeGreaterThan(engine.state.B.rate)
    await vi.advanceTimersByTimeAsync(150)
    expect(source.playbackRate.value).toBe(engine.state.B.rate)
    expect(engine.state.B.position).toBeGreaterThan(0.15)
  })
  it("cancels a pending play on a second press before context resumes", async () => {
    await engine.load("B", incoming)
    let resume: () => void = () => {}
    resumeAction = () =>
      new Promise<void>((resolve) => {
        resume = resolve
      })
    const first = engine.toggle("B")
    await engine.toggle("B")
    resume()
    await first
    expect(engine.state.B.playing).toBe(false)
    expect(ContextMock.latest.sources).toHaveLength(0)
  })
  it("dispatches actual FLX4 play press/release packets once per physical tap on both decks", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    engine.setHardwareConnected(true)
    const decoder = new FLX4Decoder()
    const tap = async (status: number) => {
      for (const packet of [
        [status, 11, 127],
        [status, 11, 127],
        [status, 11, 0],
      ]) {
        const action = decoder.decode(packet)
        if (action) expect(engine.handleControllerAction(action)).toBe(true)
      }
      await Promise.resolve()
      await Promise.resolve()
    }
    for (const [status, id] of [
      [0x90, "A"],
      [0x91, "B"],
    ] as const) {
      await tap(status)
      expect(engine.state[id].playing).toBe(true)
      const source = ContextMock.latest.sources.at(-1)!
      expect(source.start).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(100)
      await tap(status)
      expect(engine.state[id].playing).toBe(false)
      expect(source.stop).toHaveBeenCalledTimes(1)
    }
  })
  it("keeps a mapped play release from cancelling playback while audio activation is pending", async () => {
    await engine.load("A", analyzed)
    let resume: () => void = () => {}
    resumeAction = () =>
      new Promise<void>((resolve) => {
        resume = resolve
      })
    const decoder = new FLX4Decoder()
    engine.handleControllerAction(decoder.decode([0x90, 11, 127])!)
    engine.handleControllerAction(decoder.decode([0x90, 11, 0])!)
    resume()
    await Promise.resolve()
    await Promise.resolve()
    expect(engine.state.A.playing).toBe(true)
  })
  it("retains physical knob and tempo values when loading a new track", async () => {
    await engine.load("B", incoming)
    engine.setHardwareConnected(true)
    engine.setParam("B", "low", -12)
    engine.setParam("B", "filter", 0.3)
    engine.setParam("B", "trim", -4)
    engine.setParam("B", "rate", 1.02)
    await engine.load("B", analyzed)
    expect(engine.state.B.low).toBe(-12)
    expect(engine.state.B.filter).toBe(0.3)
    expect(engine.state.B.trim).toBe(-4)
    expect(engine.state.B.rate).toBe(1.02)
  })
  it("clears channel mute causes and exposes real fader warnings", async () => {
    await engine.load("B", incoming)
    await engine.play("B")
    engine.setCrossfade(1)
    engine.setParam("B", "volume", 0)
    expect(deckOutputWarning(engine.state, "B")).toContain("fader")
    engine.setParam("B", "filter", -1)
    engine.setMaster(0)
    engine.resetChannel("B")
    expect(deckOutputWarning(engine.state, "B")).toBeNull()
    expect(engine.state.B.filter).toBe(0)
    expect(engine.state.master).toBe(0.7)
  })
  it("plays a manually bounded loop and previews CUE only while held", async () => {
    await engine.load("B", incoming)
    engine.seek("B", 10)
    await engine.play("B")
    engine.setLoopIn("B")
    await vi.advanceTimersByTimeAsync(2000)
    engine.setLoopOut("B")
    await Promise.resolve()
    expect(engine.state.B.playing).toBe(true)
    const source = ContextMock.latest.sources.at(-1)!
    expect(source.loopStart).toBeCloseTo(10)
    expect(source.loopEnd).toBeCloseTo(12)
    engine.loop("B", null)
    engine.pause("B")
    engine.seek("B", 20)
    engine.cueButton("B", true)
    await Promise.resolve()
    expect(engine.state.B.playing).toBe(true)
    engine.cueButton("B", false)
    expect(engine.state.B.playing).toBe(false)
    expect(engine.state.B.position).toBe(20)
  })
  it("stores a cue snapshot and preserves it when loading again", async () => {
    await engine.load("A", analyzed)
    engine.seek("A", 15)
    const saved = vi.fn()
    engine.onCueChange = saved
    engine.hotcue("A", 1)
    expect(saved).toHaveBeenCalledWith(
      analyzed.id,
      [0, 15, null, null, null, null, null, null],
      Array(8).fill(null)
    )
    await engine.load("B", analyzed, saved.mock.calls[0][1])
    expect(engine.state.B.cues[1]).toBe(15)
  })
  it("does not revive playback after cueing while the audio context resumes", async () => {
    await engine.load("A", analyzed)
    let resume: () => void = () => {}
    resumeAction = () =>
      new Promise<void>((resolve) => {
        resume = resolve
      })
    const play = engine.play("A")
    engine.cue("A")
    resume()
    await play
    expect(engine.state.A.playing).toBe(false)
    expect(engine.state.A.position).toBe(0)
  })
  it("sets and exits loops on the current state after a pause", async () => {
    await engine.load("A", analyzed)
    await engine.play("A")
    engine.loop("A", 4)
    await Promise.resolve()
    expect(engine.state.A.loop).toBe(4)
    engine.loop("A", null)
    await Promise.resolve()
    expect(engine.state.A.loop).toBeNull()
  })
  it("does not reuse analysis or a corrected grid after a linked file changes", async () => {
    let audio = new File(["audio"], "song.mp3", { lastModified: 1 })
    const linked: Track = {
      ...analyzed,
      linkedFile: {
        folderId: "usb",
        path: "song.mp3",
        size: audio.size,
        lastModified: 1,
        handle: {
          kind: "file",
          name: "song.mp3",
          queryPermission: async () => "granted",
          getFile: async () => audio,
        },
      },
    }
    await engine.load("A", linked)
    engine.setBeatgrid("A", 123, 0.2)
    const job = engine.analyze("A")
    AnalysisWorkerMock.instances[0].onmessage!({
      data: { ...analyzed.analysis!, key: "Dm", bpm: 140 },
    })
    await job
    audio = new File(["audio"], "song.mp3", { lastModified: 2 })
    const changed = {
      ...linked,
      analysis: undefined,
      grid: undefined,
      bpm: null,
      key: null,
      linkedFile: { ...linked.linkedFile!, lastModified: 2 },
    }
    await engine.load("B", changed)
    expect(engine.state.B.track?.analysis).toBeUndefined()
    expect(engine.state.B.track?.grid).toBeUndefined()
    expect(engine.state.B.track?.bpm).toBeNull()
    expect(AnalysisWorkerMock.instances).toHaveLength(2)
  })
  it("keeps an old file worker from updating a new version on the other deck", async () => {
    let audio = new File(["audio"], "song.mp3", { lastModified: 1 })
    const linked: Track = {
      ...analyzed,
      linkedFile: {
        folderId: "usb",
        path: "song.mp3",
        size: audio.size,
        lastModified: 1,
        handle: {
          kind: "file",
          name: "song.mp3",
          queryPermission: async () => "granted",
          getFile: async () => audio,
        },
      },
    }
    await engine.load("A", linked)
    const old = engine.analyze("A")
    audio = new File(["audio"], "song.mp3", { lastModified: 2 })
    await engine.load("B", {
      ...linked,
      linkedFile: { ...linked.linkedFile!, lastModified: 2 },
    })
    const before = engine.state.B.track
    const fresh = engine.analyze("B")
    expect(AnalysisWorkerMock.instances).toHaveLength(2)
    AnalysisWorkerMock.instances[0].onmessage!({
      data: { ...analyzed.analysis!, key: "Dm" },
    })
    await old
    expect(engine.state.B.track).toBe(before)
    expect(engine.state.B.analysisStatus).toBe("running")
    AnalysisWorkerMock.instances[1].onmessage!({
      data: { ...analyzed.analysis!, key: "C maj" },
    })
    await fresh
    expect(engine.state.B.track?.key).toBe("C maj")
  })
  it("loads linked audio without fetching or persisting its File", async () => {
    const audio = new File(["audio"], "song.mp3", { lastModified: 1 })
    const linked: Track = {
      ...incoming,
      linkedFile: {
        folderId: "usb",
        path: "song.mp3",
        size: audio.size,
        lastModified: 1,
        handle: {
          kind: "file",
          name: "song.mp3",
          queryPermission: async () => "granted",
          getFile: async () => audio,
        },
      },
    }
    const fetcher = vi.spyOn(globalThis, "fetch")
    await engine.load("B", linked)
    expect(fetcher).not.toHaveBeenCalled()
    fetcher.mockRestore()
    expect(engine.state.B.track?.file).toBeUndefined()
    expect(engine.state.B.loading).toBe(false)
    expect(engine.state.error).toBeNull()
  })
  it("skips a linked file that disconnects while automix prepares it", async () => {
    await engine.load("A", analyzed)
    const missing: Track = {
      ...incoming,
      id: "missing-usb",
      linkedFile: {
        folderId: "usb",
        path: "song.mp3",
        size: 5,
        lastModified: 1,
        handle: {
          kind: "file",
          name: "song.mp3",
          queryPermission: async () => "granted",
          getFile: async () => {
            throw new Error("Drive disconnected")
          },
        },
      },
    }
    const unavailable = vi.fn()
    engine.onFileUnavailable = unavailable
    const loading = vi.fn((id: "A" | "B", track: Track) =>
      engine.load(id, track)
    )
    const { mix } = continuousMix(
      [analyzed, missing, { ...incoming, id: "offline-fallback", energy: 2 }],
      loading
    )
    await mix.start("A")
    expect(unavailable).toHaveBeenCalledWith("missing-usb")
    expect(engine.state.B.track?.id).toBe("offline-fallback")
    expect(engine.state.auto).toBe(true)
    expect(engine.state.error).toBeNull()
    mix.dispose()
  })
  it("refuses automix when a controller is connected", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    engine.hardwareLocked = true
    await engine.startAuto("A", planTransitions(analyzed, incoming)[0], true)
    expect(engine.state.auto).toBe(false)
    expect(engine.state.A.playing).toBe(false)
    expect(engine.state.error).toContain("disabled")
  })
  it("stops active automation as soon as hardware connects", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    await engine.startAuto("A", planTransitions(analyzed, incoming)[0], true)
    expect(engine.state.auto).toBe(true)
    engine.setHardwareConnected(true)
    expect(engine.state.auto).toBe(false)
    expect(engine.hardwareLocked).toBe(true)
  })
  function continuousMix(
    pool: Track[],
    load = (id: "A" | "B", track: Track) => engine.load(id, track)
  ) {
    const session = {
      ...defaultDatabase.session,
      mixIntent: "lift" as const,
      transitionTechnique: "cut",
      transitionCues: Object.fromEntries(
        pool.map((track) => [track.id, { entry: 0, exit: 1 }])
      ),
    }
    const options = { pool, session, cues: {}, labels: {} }
    const notice = vi.fn()
    const mix = new AutomixSession(engine, () => options, load, vi.fn(), notice)
    return { mix, options, notice }
  }
  it("ranks the next track immediately, uses selected cues/technique, visits every track once and lets the last one finish", async () => {
    const lower = {
        ...incoming,
        id: "lower",
        title: "Lower",
        bpm: 128,
        energy: 3,
        camelot: "8B",
      },
      higher = {
        ...incoming,
        id: "higher",
        title: "Higher",
        bpm: 128,
        energy: 7,
        camelot: "8B",
      }
    await engine.load("A", analyzed)
    await engine.load("B", lower)
    const loading = vi.fn((id: "A" | "B", track: Track) =>
      engine.load(id, track)
    )
    const { mix } = continuousMix([analyzed, lower, higher, higher], loading)
    await mix.start("A")
    expect(engine.state.B.track?.id).toBe(higher.id)
    expect(engine.state.autoPlan?.id).toBe("cut")
    expect(engine.state.autoPlan?.outStart).toBe(1)
    expect(engine.state.autoPlan?.inStart).toBe(0)
    await vi.advanceTimersByTimeAsync(2700)
    expect(mix.state.phase).toBe("finishing")
    expect(mix.state.active).toBe(true)
    expect(new Set(mix.state.playedIds)).toEqual(
      new Set([analyzed.id, higher.id, lower.id])
    )
    expect(loading.mock.calls.map((call) => call[1].id)).toEqual([
      higher.id,
      lower.id,
    ])
    expect(engine.state.A.playing).toBe(true)
    expect(engine.state.B.playing).toBe(false)
    ContextMock.latest.sources.at(-1)!.onended!()
    expect(mix.state.phase).toBe("complete")
    expect(mix.state.active).toBe(true)
    const count = ContextMock.latest.sources.length
    await mix.start("A")
    expect(ContextMock.latest.sources).toHaveLength(count)
    expect(mix.state.active).toBe(true)
    mix.stop()
    mix.resetHistory()
    expect(mix.state.playedIds).toEqual([])
    expect(engine.state.A.position).toBe(0)
    mix.dispose()
  })
  it("keeps played history when stopped and resumed, without counting a merely prepared track", async () => {
    const third = { ...incoming, id: "third", energy: 7 }
    await engine.load("A", analyzed)
    const { mix } = continuousMix([analyzed, incoming, third])
    await mix.start("A")
    await vi.advanceTimersByTimeAsync(1250)
    const playing = outgoingDeck(engine.state)
    expect(mix.state.playedIds).toHaveLength(2)
    const played = [...mix.state.playedIds]
    mix.stop()
    expect(mix.state.playedIds).toEqual(played)
    await mix.start(playing)
    expect(engine.state[playing === "A" ? "B" : "A"].track?.id).not.toBe(
      analyzed.id
    )
    await vi.advanceTimersByTimeAsync(1500)
    expect(mix.state.phase).toBe("finishing")
    expect(new Set(mix.state.playedIds).size).toBe(3)
    mix.dispose()
  })
  it("keeps Automix enabled after a manual adjustment during decoding, without starting a paused deck", async () => {
    await engine.load("A", analyzed)
    let release: () => void = () => {}
    vi.stubGlobal(
      "fetch",
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })
        })
    )
    const { mix } = continuousMix([analyzed, incoming])
    const starting = mix.start("A")
    expect(mix.state.phase).toBe("selecting")
    engine.setCrossfade(0.3)
    release()
    await starting
    expect(mix.state.active).toBe(true)
    expect(mix.state.phase).toBe("waiting")
    expect(engine.state.auto).toBe(false)
    expect(engine.state.A.playing).toBe(false)
    expect(engine.state.crossfade).toBe(0.3)
    mix.dispose()
  })
  it("keeps manual FX, EQ and filter settings through automation ticks and the handoff", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    const { mix, options } = continuousMix([analyzed, incoming])
    options.session.transitionTechnique = "echo"
    options.session.transitionCues[analyzed.id].exit = 3
    await mix.start("A")
    engine.setFX("B", {
      type: "reverb",
      enabled: true,
      amount: 0.6,
      beats: 0.5,
    })
    engine.setParam("B", "high", -3)
    engine.setParam("B", "filter", -0.2)
    await vi.advanceTimersByTimeAsync(3100)
    expect(mix.state.active).toBe(true)
    expect(engine.state.auto).toBe(true)
    engine.setFX("A", { type: "echo", enabled: true, amount: 0.4 })
    engine.setParam("A", "mid", -5)
    await vi.advanceTimersByTimeAsync(300)
    expect(engine.state.A.mid).toBe(-5)
    expect(engine.state.A.fx.amount).toBe(0.4)
    expect(engine.state.B.fx).toEqual({
      type: "reverb",
      enabled: true,
      amount: 0.6,
      beats: 0.5,
    })
    await vi.advanceTimersByTimeAsync(5000)
    expect(mix.state.active).toBe(true)
    expect(engine.state.B.playing).toBe(true)
    expect(engine.state.B.high).toBe(-3)
    expect(engine.state.B.filter).toBe(-0.2)
    expect(engine.state.B.fx.enabled).toBe(true)
    expect(engine.state.B.fx.amount).toBe(0.6)
    mix.stop()
    expect(mix.state.active).toBe(false)
    mix.dispose()
  })
  it("waits through a manual pause and resumes Automix when playback resumes", async () => {
    await engine.load("A", analyzed)
    const { mix } = continuousMix([analyzed, incoming])
    await mix.start("A")
    engine.pause("A")
    await vi.advanceTimersByTimeAsync(100)
    expect(mix.state.active).toBe(true)
    expect(mix.state.phase).toBe("waiting")
    expect(engine.state.auto).toBe(false)
    expect(engine.state.A.playing).toBe(false)
    await engine.play("A")
    await vi.advanceTimersByTimeAsync(100)
    expect(mix.state.active).toBe(true)
    expect(engine.state.auto).toBe(true)
    mix.stop()
    await vi.advanceTimersByTimeAsync(100)
    expect(mix.state.active).toBe(false)
    expect(engine.state.auto).toBe(false)
    mix.dispose()
  })
  it("does not revive an explicitly stopped run after track decoding", async () => {
    await engine.load("A", analyzed)
    let release: () => void = () => {}
    vi.stubGlobal(
      "fetch",
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })
        })
    )
    const { mix } = continuousMix([analyzed, incoming])
    const starting = mix.start("A")
    mix.stop()
    release()
    await starting
    expect(mix.state.active).toBe(false)
    expect(engine.state.auto).toBe(false)
    expect(engine.state.A.playing).toBe(false)
    mix.dispose()
  })
  it("cancels the outgoing pending audio start when Automix is stopped during resume", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    let release: () => void = () => {}
    resumeAction = () =>
      new Promise((resolve) => {
        release = resolve
      })
    const { mix } = continuousMix([analyzed, incoming])
    const starting = mix.start("A")
    mix.stop()
    release()
    await starting
    expect(engine.state.A.playing).toBe(false)
    expect(engine.state.auto).toBe(false)
    mix.dispose()
  })
  it("reselects from the current filtered collection if it changes while the next track loads", async () => {
    await engine.load("A", analyzed)
    let release: () => void = () => {}
    const response = { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              release = () => resolve(response)
            })
        )
        .mockResolvedValue(response)
    )
    const third = { ...incoming, id: "new-collection" }
    const { mix, options } = continuousMix([analyzed, incoming, third])
    options.pool = [analyzed, incoming]
    const starting = mix.start("A")
    options.pool = [analyzed, third]
    release()
    await starting
    expect(engine.state.B.track?.id).toBe(third.id)
    expect(engine.state.auto).toBe(true)
    expect(mix.state.playedIds).not.toContain(incoming.id)
    mix.dispose()
  })
  it("waits with Automix enabled when the chosen routine has no eligible unplayed pair", async () => {
    await engine.load("A", analyzed)
    const { mix, options, notice } = continuousMix([
      analyzed,
      { ...incoming, bpm: 90 },
    ])
    options.session.transitionTechnique = "bass"
    await mix.start("A")
    expect(mix.state.active).toBe(true)
    expect(mix.state.phase).toBe("waiting")
    expect(notice).toHaveBeenCalledWith(
      expect.stringContaining("selected technique")
    )
    expect(engine.state.A.playing).toBe(false)
    mix.dispose()
  })
  it("waits when the final track is manually paused instead of reporting completion", async () => {
    await engine.load("A", analyzed)
    const { mix } = continuousMix([analyzed])
    await mix.start("A")
    await vi.advanceTimersByTimeAsync(200)
    engine.pause("A")
    expect(mix.state.active).toBe(true)
    expect(mix.state.phase).toBe("waiting")
    await engine.play("A")
    await vi.advanceTimersByTimeAsync(100)
    expect(mix.state.phase).toBe("finishing")
    expect(mix.state.active).toBe(true)
    mix.dispose()
  })
  it("keeps the enabled preference while a controller prevents automation", async () => {
    await engine.load("A", analyzed)
    const { mix } = continuousMix([analyzed])
    await mix.start("A")
    expect(mix.state.phase).toBe("finishing")
    expect(mix.state.playedIds).toEqual([analyzed.id])
    engine.setHardwareConnected(true)
    expect(mix.state.active).toBe(true)
    await mix.start("A")
    expect(mix.state.active).toBe(true)
    expect(engine.state.auto).toBe(false)
    mix.stop()
    expect(mix.state.active).toBe(false)
    mix.dispose()
  })
  it("does not turn a one-off Mix cues action into a continuous mix", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    const load = vi.fn((id: "A" | "B", track: Track) => engine.load(id, track))
    const { mix } = continuousMix(
      [analyzed, incoming, { ...incoming, id: "third" }],
      load
    )
    await engine.startAuto(
      "A",
      { ...planTransitions(analyzed, incoming)[0], duration: 1 },
      true
    )
    await vi.advanceTimersByTimeAsync(1250)
    expect(load).not.toHaveBeenCalled()
    expect(mix.state.active).toBe(false)
    expect(engine.state.B.playing).toBe(true)
    mix.dispose()
  })
  it("completes a timed handoff and stops the outgoing deck", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    const handoff = vi.fn()
    engine.onHandoff = handoff
    await engine.startAuto(
      "A",
      { ...planTransitions(analyzed, incoming)[0], duration: 1 },
      true
    )
    await vi.advanceTimersByTimeAsync(1250)
    expect(engine.state.auto).toBe(false)
    expect(engine.state.crossfade).toBe(0.5)
    expect(engine.state.A.volume).toBe(0)
    expect(engine.state.B.volume).toBeGreaterThan(0)
    expect(engine.state.A.playing).toBe(false)
    expect(engine.state.B.playing).toBe(true)
    expect(handoff).toHaveBeenCalledWith("A", "B")
  })
  it("hands off from B to A with centered crossfader and a closed outgoing channel", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    engine.setCrossfade(1)
    const plan = planTransitions(incoming, analyzed).find(
      (p) => p.id === "fade"
    )!
    await engine.startAuto("B", { ...plan, duration: 2 }, true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(engine.state.crossfade).toBe(0.5)
    expect(engine.state.B.volume).toBeGreaterThan(0)
    expect(engine.state.A.volume).toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(1250)
    expect(engine.state.B.volume).toBe(0)
    expect(engine.state.B.playing).toBe(false)
    expect(engine.state.A.volume).toBeCloseTo(0.8)
    expect(engine.state.A.playing).toBe(true)
    expect(engine.state.crossfade).toBe(0.5)
  })
  it("moves HI and MID before LOW during a full-length Long Blend and resets only the silent deck", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    engine.setParam("A", "high", 2)
    engine.setParam("A", "mid", -1)
    engine.setCrossfade(0)
    const plan = planTransitions(analyzed, incoming).find(
      (p) => p.id === "long"
    )!
    await engine.startAuto("A", plan, true)
    await vi.advanceTimersByTimeAsync(20000)
    expect(engine.state.crossfade).toBe(0.5)
    expect(engine.state.B.volume).toBeGreaterThan(0.5)
    expect(engine.state.B.high).toBe(0)
    expect(engine.state.B.mid).toBeLessThan(0)
    expect(engine.state.B.low).toBe(-12)
    expect(engine.state.A.high).toBeLessThan(2)
    await vi.advanceTimersByTimeAsync(30000)
    expect(engine.state.A.low).toBe(-12)
    expect(engine.state.B.low).toBe(0)
    await vi.advanceTimersByTimeAsync(15000)
    expect(engine.state.A).toMatchObject({
      volume: 0,
      high: 2,
      mid: -1,
      low: 0,
      playing: false,
    })
    expect(engine.state.B).toMatchObject({
      high: 0,
      mid: 0,
      low: 0,
      playing: true,
    })
    expect(engine.state.crossfade).toBe(0.5)
  })
  it("keeps one dominant bassline and holds the current EQ and faders on cancellation", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    engine.setParam("A", "low", -2)
    engine.setParam("B", "low", 1)
    const plan = planTransitions(analyzed, incoming).find(
      (p) => p.id === "bass"
    )!
    await engine.startAuto("A", { ...plan, duration: 2 }, true)
    await vi.advanceTimersByTimeAsync(500)
    expect(engine.state.A.low).toBe(-2)
    expect(engine.state.B.low).toBe(-12)
    await vi.advanceTimersByTimeAsync(650)
    expect(engine.state.A.low).toBe(-12)
    expect(engine.state.B.low).toBe(1)
    const volumeA = engine.state.A.volume
    engine.cancelAuto()
    expect(engine.state.A.low).toBe(-12)
    expect(engine.state.B.low).toBe(1)
    expect(engine.state.A.volume).toBeLessThanOrEqual(volumeA)
    expect(engine.state.crossfade).toBe(0.5)
  })
  it("schedules audible gain and EQ using the audio clock, independently of UI updates", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    await engine.startAuto(
      "A",
      {
        ...planTransitions(analyzed, incoming).find((p) => p.id === "bass")!,
        duration: 2,
      },
      true
    )
    await vi.advanceTimersByTimeAsync(100)
    expect(engine.state.error).toBeNull()
    const params = ContextMock.latest.gains.flatMap(
      (g) => g.gain.setValueCurveAtTime.mock.calls
    )
    expect(params.length).toBeGreaterThanOrEqual(2)
    const curve = params[0] as unknown as [Float32Array, number, number]
    expect(curve[1]).toBeGreaterThan(0)
    expect(curve[2]).toBe(2)
    expect(Array.from(curve[0]).every(Number.isFinite)).toBe(true)
  })
  it("holds the current filter and faders and restores manual FX and tempo on MIDI takeover", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    engine.setParam("A", "filter", -0.3)
    engine.setFX("A", { type: "reverb", enabled: true, amount: 0.2 })
    const originalRate = engine.state.B.rate
    await engine.startAuto(
      "A",
      {
        ...planTransitions(analyzed, incoming).find((p) => p.id === "filter")!,
        duration: 2,
      },
      true
    )
    await vi.advanceTimersByTimeAsync(1150)
    expect(engine.state.A.filter).toBeGreaterThan(0.3)
    expect(engine.state.B.low).toBe(0)
    engine.setHardwareConnected(true)
    const heldFilter = engine.state.A.filter
    expect(heldFilter).toBeGreaterThan(0.3)
    expect(engine.state.A.fx).toMatchObject({
      type: "reverb",
      enabled: true,
      amount: 0.2,
    })
    expect(engine.state.B.rate).toBe(originalRate)
    expect(engine.state.autoPlan).toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    expect(engine.state.auto).toBe(false)
    expect(engine.state.A.filter).toBe(heldFilter)
  })
  it("uses outgoing echo with a delayed native-tempo launch rather than a long crossfade", async () => {
    await engine.load("A", { ...analyzed, bpm: 90 })
    await engine.load("B", { ...incoming, bpm: 174 })
    const plan = planTransitions(
      engine.state.A.track!,
      engine.state.B.track!
    ).find((p) => p.id === "echo")!
    await engine.startAuto("A", { ...plan, duration: 2 }, true)
    await vi.advanceTimersByTimeAsync(150)
    expect(engine.state.A.fx).toMatchObject({ type: "echo", enabled: true })
    const source = ContextMock.latest.sources.at(-1)!
    expect(source.start.mock.calls[0][0]).toBeGreaterThan(0.5)
    expect(engine.state.B.position).toBe(plan.inStart)
    expect(engine.state.B.rate).toBe(1)
    await vi.advanceTimersByTimeAsync(900)
    expect(engine.state.crossfade).toBe(0.5)
    expect(engine.state.A.volume).toBeCloseTo(0)
    expect(engine.state.B.volume).toBeGreaterThan(0)
    expect(engine.state.auto).toBe(true)
    await vi.advanceTimersByTimeAsync(1200)
    expect(engine.state.A.fx.enabled).toBe(false)
    expect(engine.state.A.playing).toBe(false)
  })
  it("holds a real outgoing audio loop and removes it at the handoff", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    await engine.startAuto(
      "A",
      {
        ...planTransitions(analyzed, incoming).find((p) => p.id === "loop")!,
        duration: 2,
      },
      true
    )
    await vi.advanceTimersByTimeAsync(500)
    const outSource = ContextMock.latest.sources[0]
    expect(engine.state.A.loop).toBe(4)
    expect(outSource.loop).toBe(true)
    expect(outSource.loopEnd - outSource.loopStart).toBeCloseTo((4 * 60) / 128)
    await vi.advanceTimersByTimeAsync(2000)
    expect(engine.state.A.loop).toBeNull()
    expect(engine.state.B.playing).toBe(true)
  })
  it("keeps scheduled launches and effects running when a person adjusts EQ", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    await engine.startAuto(
      "A",
      {
        ...planTransitions(analyzed, incoming).find((p) => p.id === "echo")!,
        duration: 4,
      },
      true
    )
    await vi.advanceTimersByTimeAsync(150)
    const scheduled = ContextMock.latest.sources.at(-1)!
    engine.setParam("A", "mid", -5)
    expect(engine.state.auto).toBe(true)
    expect(scheduled.stop).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5000)
    expect(engine.state.B.playing).toBe(true)
    expect(engine.state.A.mid).toBe(-5)
  })
  it("compensates scheduled start lead time to keep both audible beat phases aligned", async () => {
    await engine.load("A", {
      ...analyzed,
      analysis: { ...analyzed.analysis!, beatOffset: 0.125 },
    })
    await engine.load("B", {
      ...incoming,
      analysis: { ...incoming.analysis!, beatOffset: 0.25 },
    })
    engine.seek("A", 20.321)
    const plan = planTransitions(
      engine.state.A.track!,
      engine.state.B.track!
    ).find((p) => p.id === "bass")!
    await engine.startAuto("A", plan, true)
    await vi.advanceTimersByTimeAsync(500)
    const a = ((engine.state.A.position - 0.125) * 128) / 60
    const b = ((engine.state.B.position - 0.25) * 130) / 60
    expect((((a - b) % 1) + 1) % 1).toBeCloseTo(0, 5)
  })
  it("preserves a deliberately quiet channel level during Automix preparation", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    engine.setCrossfade(0)
    engine.setParam("A", "volume", 0.001)
    await engine.startAuto("A", planTransitions(analyzed, incoming)[0], true)
    expect(engine.state.A.volume).toBeCloseTo(0.001)
    expect(engine.state.B.volume).toBe(0)
    engine.cancelAuto()
    expect(engine.state.A.volume).toBeCloseTo(0.001)
  })
  it("prepares closed channel faders and restores them if automix is cancelled", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    engine.setParam("A", "volume", 0)
    engine.setParam("B", "volume", 0)
    await engine.startAuto("A", planTransitions(analyzed, incoming)[0], true)
    expect(engine.state.A.volume).toBeGreaterThan(0)
    expect(engine.state.B.volume).toBe(0)
    engine.cancelAuto()
    expect(engine.state.A.volume).toBe(0)
    expect(engine.state.B.volume).toBe(0)
  })
  it("revalidates eligibility after deck tempo changes instead of executing a stale blend", async () => {
    await engine.load("A", analyzed)
    await engine.load("B", incoming)
    const plan = planTransitions(analyzed, incoming).find(
      (p) => p.id === "bass"
    )!
    engine.setParam("A", "rate", 1.16)
    engine.setParam("B", "rate", 0.84)
    await engine.startAuto("A", plan, true)
    expect(engine.state.auto).toBe(false)
    expect(engine.state.error).toContain("no longer fits")
  })
})

describe("waveform detail", () => {
  it("retains short transients in measured stereo peak windows", () => {
    const left = new Float32Array(44100),
      right = new Float32Array(44100)
    right[4416] = 0.9
    const peaks = measurePeaks([left, right], 44100)
    expect(peaks.length).toBe(50)
    expect(Math.max(...peaks)).toBeCloseTo(0.9)
    const path = waveformPath(peaks, 1, 0, 1, 120)
    expect(path).not.toContain("NaN")
    expect(path).not.toContain("Infinity")
    expect(path.split("M")).toHaveLength(51)
  })
  it("bounds SVG work even for a long track and shows only the selected time range", () => {
    const peaks = Array.from({ length: 32768 }, () => 0.5)
    const overview = waveformPath(peaks, 900, 0, 900, 120)
    expect(overview.split("M").length).toBeLessThanOrEqual(641)
    const zoomed = waveformPath(peaks, 900, 30, 45, 64)
    expect(zoomed.split("M").length).toBeLessThanOrEqual(641)
    expect(zoomed).not.toBe(overview)
  })
})
