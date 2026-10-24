import { padModes } from "./types"
import type { MidiAction } from "./midi"
import type {
  Analysis,
  DeckId,
  DeckState,
  PadMode,
  Track,
  Transition,
} from "./types"
import { padFXPresets } from "./pad-fx"
import { alignBarPhase, beatOffset, echoDelay, snapToBeat } from "./beatgrid"
import { measurePeaks } from "./wave-peaks"
import { analysisOutdated, VOCALS_VERSION } from "./structure"
import { automationControls, automationFrame, stemGainsAt } from "./automation"
import type { AutomationChannel } from "./automation"
import { matchLoudness, prepareLoudness } from "./loudness"
import { levelerContext, levelerRecord, pushLeveler } from "./leveler-log"
import { sectionAt } from "./sections"
import {
  bassExchangeAt,
  deckKey,
  planTransitions,
  transitionSteps,
} from "./planner"
import { linkedFingerprint } from "./library-analysis"
import { readLinkedFile } from "./linked-files"
import { createPitchNode, PITCH_LATENCY, registerPitch } from "./pitch-control"
import type { PitchProcessor } from "./pitch-control"
import {
  createScratchNode,
  registerScratch,
  SCRATCH_REACH,
  sendScratchWindow,
} from "./scratch-control"
import { createFXRack, noiseBuffer, resetRack, scheduleCue } from "./fx-rack"
import type { FXRack } from "./fx-rack"
import { describeFX, primaryFX } from "./auto-fx"
import { loadDeckStems } from "./stem-store"
import {
  allStemsOn,
  buildStemBuffer,
  createStemMatrix,
  matrixWeights,
  setStemGains,
  stemLayoutFor,
} from "./stem-matrix"
import type { StemGains, StemMatrix } from "./stem-matrix"
import { tracklistCue, tracklistText } from "./tracklist"
import { renderTransition } from "./transition-preview"
import type { TracklistEntry } from "./tracklist"

type Channel = {
  gain: GainNode
  low: BiquadFilterNode
  mid: BiquadFilterNode
  high: BiquadFilterNode
  filter: BiquadFilterNode
  analyser: AnalyserNode
  inputAnalyser: AnalyserNode
  inputSamples: Float32Array<ArrayBuffer>
  meterSamples: Float32Array<ArrayBuffer>
  trim: GainNode
  echoSend: GainNode
  delay: DelayNode
  feedback: GainNode
  reverbSend: GainNode
  reverbInput: AudioNode
  /** Auto-FX nodes, wired once both channels exist. */
  rack?: FXRack
  /** The original plus stems in one multichannel buffer, for playback. */
  stemBuffer?: AudioBuffer
  stemMatrix?: StemMatrix
  /** Stems arrived while playing; attach at the next stop. */
  pendingStems?: boolean
  cueGain: GainNode
  slipAnchor?: { position: number; time: number; rate: number }
  echoOutTimer?: ReturnType<typeof setTimeout>
  loopIn?: number
  pendingPlay?: boolean
  cuePreview?: boolean
  nudgeTimer?: ReturnType<typeof setTimeout>
  source?: AudioBufferSourceNode
  pitch?: PitchProcessor
  /** A fresh key-lock node made ahead of time, so its settings are in place
   * before audio reaches it. */
  pitchSpare?: PitchProcessor
  pitchVersion: number
  buffer?: AudioBuffer
  reverseBuffer?: AudioBuffer
  reversed?: boolean
  scratchResume?: boolean
  scrubSource?: AudioBufferSourceNode
  scratch?: AudioWorkletNode
  /** The span of the track (seconds) the scratch tape currently holds. */
  scratchSpan?: [number, number]
  lastScrubTime?: number
  startTime: number
  startOffset: number
  loadVersion: number
  transportVersion: number
}
/** A touched jog behaves like a 33⅓ RPM record: one turn is 1.8 s of audio.
 * DDJ-400/FLX4-class jogs send roughly 720 ticks per turn. */
const SCRATCH_SECONDS_PER_TICK = 1.8 / 720

export type EngineState = {
  A: DeckState
  B: DeckState
  crossfade: number
  channelMix: boolean
  autoLevels: string
  /** Deepest overlap headroom of the current automix transition (dB). */
  autoHeadroom?: number
  master: number
  auto: boolean
  autoOut: DeckId | null
  autoPlan: Transition | null
  transition: number
  autoStatus: string
  recording: boolean
  lastRecording: { url: string; name: string } | null
  /** Tracklist of the last recording: text and CUE sheet downloads. */
  lastTracklist: { txt: string; cue: string; name: string } | null
  /** A rendered transition preview is playing. */
  previewing: boolean
  error: string | null
  controller: {
    fxTarget: "A" | "B" | "both"
    fxAssignA: boolean
    fxAssignB: boolean
    headphoneMix: number
    headphoneLevel: number
    masterCue: boolean
    micLevel: number
    micEnabled: boolean
    smartCFX: boolean
    smartCFXPreset: number
    smartFader: boolean
    syncMaster: DeckId | null
    waveformBars: number
    monitorConnected: boolean
    outputPairs: boolean
  }
}
export const emptyDeck = (): DeckState => ({
  track: null,
  playing: false,
  loading: false,
  analysisStatus: "idle",
  analysisError: null,
  position: 0,
  rate: 1,
  volume: 0.8,
  trim: 0,
  low: 0,
  mid: 0,
  high: 0,
  filter: 0,
  loop: null,
  cues: [0, null, null, null, null, null, null, null],
  cueLabels: Array(8).fill(null),
  syncTo: null,
  meter: 0,
  inputMeter: 0,
  quantize: false,
  slip: false,
  slipPosition: null,
  fx: { type: "echo", enabled: false, amount: 0.35, beats: 1 },
  echoOut: false,
  padMode: "hotcue",
  padBank: 0,
  activePads: [],
  tempoRange: 0.08,
  keyShift: 0,
  keyLock: false,
  stems: null,
  stemLayout: null,
  headphoneCue: false,
  jogTouched: false,
  loopAdjust: null,
  memoryCues: [],
  shiftPressed: false,
  samplerSlots: [
    "Kick",
    "Snare",
    "Clap",
    "Closed hat",
    "Open hat",
    "Tom",
    "Rim",
    "Percussion",
  ].map((name) => ({ name, playing: false })),
})

export const emptyController = (): EngineState["controller"] => ({
  fxTarget: "A",
  fxAssignA: true,
  fxAssignB: false,
  headphoneMix: 0.5,
  headphoneLevel: 0.7,
  masterCue: false,
  micLevel: 0.5,
  micEnabled: false,
  smartCFX: false,
  smartCFXPreset: 0,
  smartFader: false,
  syncMaster: null,
  waveformBars: 8,
  monitorConnected: false,
  outputPairs: false,
})

export class DJEngine {
  state: EngineState = {
    A: emptyDeck(),
    B: emptyDeck(),
    crossfade: 0.5,
    channelMix: false,
    autoLevels: "",
    master: 0.7,
    auto: false,
    autoOut: null,
    autoPlan: null,
    transition: 0,
    autoStatus: "Ready when you are",
    recording: false,
    lastTracklist: null,
    previewing: false,
    lastRecording: null,
    error: null,
    controller: emptyController(),
  }
  private context: AudioContext | null = null
  private channels: Partial<Record<DeckId, Channel>> = {}
  private masterNode?: GainNode
  private limiterNode?: DynamicsCompressorNode
  /** Taps the limiter output for the visualizer; feeds nothing. */
  private masterAnalyser?: AnalyserNode
  private outputPairs?: {
    master: ChannelSplitterNode
    cue: ChannelSplitterNode
    merger: ChannelMergerNode
  }
  private recordNode?: MediaStreamAudioDestinationNode
  private monitorNode?: MediaStreamAudioDestinationNode
  private monitorLevel?: GainNode
  private monitorMaster?: GainNode
  private monitorAudio?: HTMLAudioElement
  private micNode?: GainNode
  private micStream?: MediaStream
  private micVersion = 0
  private monitorVersion = 0
  private sampleBuffers = new Map<string, AudioBuffer>()
  private sampleSources = new Map<string, AudioBufferSourceNode>()
  private startedSamples = new Set<string>()
  private heldPadFX = new Map<
    DeckId,
    {
      pads: number[]
      fx: DeckState["fx"]
      filter: number
      loop: number | null
      slip: boolean
    }
  >()
  private tappedAt: Partial<Record<DeckId, number[]>> = {}
  private recorder?: MediaRecorder
  private previewSource?: AudioBufferSourceNode
  private previewVersion = 0
  /** Context time the recording began, and what played from when. */
  private recordingStartedAt = 0
  private setLog: TracklistEntry[] = []
  private listeners = new Set<() => void>()
  private publishFrame: number | null = null
  /** Trim knobs following a slow audio glide after a mix. */
  private trimGlides: Partial<
    Record<DeckId, { from: number; to: number; start: number; tau: number }>
  > = {}
  private tempoGlides: Partial<
    Record<
      DeckId,
      { from: number; to: number; start: number; duration: number }
    >
  > = {}
  private interval: ReturnType<typeof setInterval>
  private automation?: {
    out: DeckId
    incoming: DeckId
    plan: Transition
    start: number
    started: boolean
    preparing: boolean
    duration: number
    /** A planned tempo ramp on the outgoing deck has begun. */
    rampStarted?: boolean
    /** Decks whose stems a hand took over during this transition. */
    stemsTouched?: Set<DeckId>
    /** Auto-FX cues are on the audio clock; their overlay sources. */
    fxScheduled?: boolean
    fxSources?: AudioScheduledSourceNode[]
    overrides: Record<DeckId, Partial<AutomationChannel>>
    original: Record<DeckId, AutomationChannel>
    levels: ReturnType<typeof matchLoudness>
  }
  private analysisJobs = new Map<
    string,
    { promise: Promise<boolean>; cancel: () => void }
  >()
  private analysisCache = new Map<string, Analysis>()
  private automationEpoch = 0
  get automationVersion() {
    return this.automationEpoch
  }
  private trackGrids = new Map<string, Track["grid"]>()
  onAnalysis?: (track: Track) => void
  onFileUnavailable?: (id: string) => void
  onCueChange?: (
    id: string,
    cues: (number | null)[],
    labels: (string | null)[]
  ) => void
  onHandoff?: (idle: DeckId, playing: DeckId) => void
  onAutoCancel?: () => void
  /** Run the downloaded beat-tracking model during analysis (Settings). */
  useAnalysisModels = true
  onTransition?: (
    id: string,
    fx: string,
    pair: { out: string; incoming: string; name: string; genre?: string }
  ) => void
  onQuantizeChange?: (id: DeckId, enabled: boolean) => void
  hardwareLocked = false

  constructor(
    private createContext: () => AudioContext = () =>
      new AudioContext({ latencyHint: "interactive", sampleRate: 44100 })
  ) {
    this.interval = setInterval(() => this.tick(), 50)
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  getSnapshot = () => this.state
  private publish() {
    this.state = {
      ...this.state,
      A: { ...this.state.A },
      B: { ...this.state.B },
      controller: { ...this.state.controller },
    }
    // MIDI can deliver both bytes of many controls between paints. Audio and
    // snapshots are already current; notify React once with the latest values.
    // This schedules a paint, never a tween or a queue of old knob positions.
    if (this.hardwareLocked && typeof requestAnimationFrame === "function") {
      if (this.publishFrame === null) {
        this.publishFrame = requestAnimationFrame(() => {
          this.publishFrame = null
          this.listeners.forEach((fn) => fn())
        })
      }
    } else {
      if (this.publishFrame !== null) {
        cancelAnimationFrame(this.publishFrame)
        this.publishFrame = null
      }
      this.listeners.forEach((fn) => fn())
    }
  }
  clearError() {
    this.state.error = null
    this.publish()
  }
  private init() {
    if (this.context) return this.context
    const ctx = (this.context = this.createContext())
    // Fetch once while the library loads; hardware pad presses need no network.
    void registerPitch(ctx).catch(() => {})
    void registerScratch(ctx).catch(() => {})
    this.masterNode = ctx.createGain()
    this.masterNode.gain.value = this.state.master
    const limiter = (this.limiterNode = ctx.createDynamicsCompressor())
    limiter.threshold.value = -3
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.003
    limiter.release.value = 0.12
    this.masterNode.connect(limiter)
    limiter.connect(ctx.destination)
    this.masterAnalyser = ctx.createAnalyser()
    this.masterAnalyser.fftSize = 2048
    this.masterAnalyser.smoothingTimeConstant = 0.5
    limiter.connect(this.masterAnalyser)
    this.recordNode = ctx.createMediaStreamDestination()
    limiter.connect(this.recordNode)
    this.monitorNode = ctx.createMediaStreamDestination()
    this.monitorLevel = ctx.createGain()
    this.monitorMaster = ctx.createGain()
    limiter.connect(this.monitorMaster)
    this.monitorMaster.connect(this.monitorLevel)
    this.monitorLevel.connect(this.monitorNode)
    this.micNode = ctx.createGain()
    this.micNode.gain.value = this.state.controller.micLevel
    this.micNode.connect(this.masterNode)
    // A deterministic, synthetic room impulse avoids any external sample assets.
    const impulse = ctx.createBuffer(
      2,
      Math.ceil(ctx.sampleRate * 1.8),
      ctx.sampleRate
    )
    let seed = 42
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel)
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        samples[i] =
          ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / samples.length, 3)
      }
    }
    for (const id of ["A", "B"] as DeckId[]) {
      const low = ctx.createBiquadFilter()
      low.type = "lowshelf"
      low.frequency.value = 250
      const mid = ctx.createBiquadFilter()
      mid.type = "peaking"
      mid.frequency.value = 1000
      mid.Q.value = 0.7
      const high = ctx.createBiquadFilter()
      high.type = "highshelf"
      high.frequency.value = 4000
      const filter = ctx.createBiquadFilter()
      filter.type = "lowpass"
      filter.frequency.value = 22000
      const gain = ctx.createGain(),
        trim = ctx.createGain(),
        inputAnalyser = ctx.createAnalyser(),
        analyser = ctx.createAnalyser()
      inputAnalyser.fftSize = 256
      inputAnalyser.connect(trim)
      trim.connect(low)
      analyser.fftSize = 256
      low.connect(mid)
      mid.connect(high)
      high.connect(filter)
      filter.connect(gain)
      const cueGain = ctx.createGain()
      filter.connect(cueGain)
      cueGain.connect(this.monitorLevel)
      gain.connect(analyser)
      analyser.connect(this.masterNode)
      // Post-fader sends let a finite echo/reverb tail survive a channel handoff.
      const echoSend = ctx.createGain(),
        delay = ctx.createDelay(4),
        feedback = ctx.createGain(),
        echoFilter = ctx.createBiquadFilter(),
        reverbSend = ctx.createGain(),
        reverbFilter = ctx.createBiquadFilter(),
        reverb = ctx.createConvolver()
      echoSend.gain.value = 0
      reverbSend.gain.value = 0
      feedback.gain.value = 0.38
      echoFilter.type = reverbFilter.type = "highpass"
      echoFilter.frequency.value = reverbFilter.frequency.value = 180
      reverb.buffer = impulse
      gain.connect(echoSend)
      echoSend.connect(echoFilter)
      echoFilter.connect(delay)
      delay.connect(analyser)
      delay.connect(feedback)
      feedback.connect(delay)
      gain.connect(reverbSend)
      reverbSend.connect(reverbFilter)
      reverbFilter.connect(reverb)
      reverb.connect(analyser)
      this.channels[id] = {
        gain,
        low,
        mid,
        high,
        filter,
        analyser,
        inputAnalyser,
        inputSamples: new Float32Array(inputAnalyser.fftSize),
        meterSamples: new Float32Array(analyser.fftSize),
        trim,
        echoSend,
        delay,
        feedback,
        reverbSend,
        reverbInput: reverbFilter,
        cueGain,
        startTime: 0,
        startOffset: 0,
        loadVersion: 0,
        transportVersion: 0,
        pitchVersion: 0,
      }
    }
    // Auto-FX racks are created after both channels so node order (and the
    // signal path of everything above) stays as it was.
    for (const id of ["A", "B"] as DeckId[]) {
      const ch = this.channels[id]!
      ch.rack = createFXRack(ctx, ch, ch.reverbInput)
    }
    this.applyMix()
    this.applyMonitor()
    this.createSamplerSounds(ctx)
    return ctx
  }
  async load(
    id: DeckId,
    track: Track,
    cues?: (number | null)[],
    labels?: (string | null)[]
  ) {
    this.init()
    this.state.error = null
    this.cancelAuto()
    delete this.tempoGlides[id]
    this.releasePadFX(id)
    this.pause(id)
    this.state.A.syncTo = null
    this.state.B.syncTo = null
    if (!this.trackGrids.has(linkedFingerprint(track)))
      this.trackGrids.set(linkedFingerprint(track), track.grid)
    else {
      const grid = this.trackGrids.get(linkedFingerprint(track))
      track = {
        ...track,
        grid,
        bpm:
          grid?.bpm ??
          (track.grid
            ? (track.grid.originalBpm ?? track.analysis?.bpm ?? null)
            : track.bpm),
      }
    }
    const channel = this.channels[id]!,
      version = ++channel.loadVersion
    const controls = this.state[id]
    this.state[id] = {
      ...emptyDeck(),
      volume: controls.volume,
      quantize: controls.quantize,
      slip: controls.slip,
      fx: { ...controls.fx, enabled: false },
      padMode: controls.padMode,
      padBank: controls.padBank,
      tempoRange: controls.tempoRange,
      keyLock: controls.keyLock,
      headphoneCue: controls.headphoneCue,
      samplerSlots: controls.samplerSlots,
      memoryCues: track.memoryCues ?? [],
      ...(this.hardwareLocked
        ? {
            trim: controls.trim,
            low: controls.low,
            mid: controls.mid,
            high: controls.high,
            filter: controls.filter,
            rate: controls.rate,
          }
        : {}),
      track,
      loading: true,
      stems: null,
      stemLayout: null,
      cues: cues ? [...cues] : emptyDeck().cues,
      cueLabels: labels ? [...labels] : emptyDeck().cueLabels,
    }
    channel.buffer = undefined
    channel.stemBuffer = undefined
    delete this.trimGlides[id]
    channel.pendingStems = false
    channel.scratch?.disconnect()
    channel.scratch?.port.close()
    channel.scratch = undefined
    channel.scratchSpan = undefined
    channel.loopIn = undefined
    channel.reverseBuffer = undefined
    channel.pitchVersion++
    channel.reversed = false
    channel.scratchResume = false
    channel.cuePreview = false
    channel.slipAnchor = undefined
    this.publish()
    try {
      let file = track.file
      if (track.linkedFile) {
        try {
          file = await readLinkedFile(track.linkedFile)
        } catch (error) {
          if (channel.loadVersion !== version) return
          this.state[id].track = { ...track, available: false }
          this.onFileUnavailable?.(track.id)
          throw error
        }
      }
      const response = file ? null : await fetch(track.url)
      if (response && !response.ok)
        throw new Error(`Audio download failed (${response.status})`)
      const bytes = file
        ? await file.arrayBuffer()
        : await response!.arrayBuffer()
      const buffer = await this.context!.decodeAudioData(bytes)
      if (channel.loadVersion !== version) return
      if (
        !(await prepareLoudness(buffer, () => channel.loadVersion === version))
      )
        return
      channel.buffer = buffer
      await this.prepareScratch(id, version)
      if (channel.loadVersion !== version) return
      const cachedAnalysis = this.analysisCache.get(linkedFingerprint(track))
      if (cachedAnalysis)
        track = this.analysisMetadata(track, cachedAnalysis, buffer.duration)
      this.state[id].track = { ...track, duration: buffer.duration }
      if (
        track.analysis &&
        track.analysis.peaks.length < Math.min(1000, buffer.duration * 50)
      ) {
        const detailed = {
          ...this.state[id].track,
          analysis: {
            ...track.analysis,
            peaks: measurePeaks(
              Array.from({ length: buffer.numberOfChannels }, (_, c) =>
                buffer.getChannelData(c)
              ),
              buffer.sampleRate
            ),
          },
        }
        this.state[id].track = detailed
        this.onAnalysis?.(detailed)
      }
      const loadedAnalysis = this.state[id].track.analysis
      if (loadedAnalysis && needsStructureRefresh(loadedAnalysis))
        this.backfillBands(id, buffer, version)
      this.state[id].loading = false
      this.applyChannel(id)
      this.applyMix()
      this.publish()
      if (this.state[id].track.stems) void this.attachStems(id)
      if (
        !this.state[id].track.analysis ||
        analysisOutdated(this.state[id].track.analysis) ||
        this.analysisJobs.has(linkedFingerprint(track))
      )
        void this.analyze(id)
    } catch (error) {
      if (channel.loadVersion !== version) return
      this.state[id].loading = false
      this.state.error = `Could not load ${track.title}: ${error instanceof Error ? error.message : String(error)}`
      this.publish()
    }
  }
  private analysisMetadata(
    track: Track,
    analysis: Analysis,
    duration: number
  ): Track {
    const grid = this.trackGrids.get(linkedFingerprint(track))
    const priorBpm = track.grid ? track.grid.originalBpm : track.bpm
    // Keep corrected grids and file-tag BPM. Replace our previous tempo estimate.
    const bpm =
      grid?.bpm ??
      (track.analysis && priorBpm === track.analysis.bpm
        ? (analysis.bpm ?? priorBpm)
        : (priorBpm ?? analysis.bpm))
    return {
      ...track,
      grid,
      duration,
      analysis,
      bpm,
      // A key you set by hand outlives re-analysis.
      key: track.keyOverride ? track.key : analysis.key,
      camelot: track.keyOverride ?? analysis.camelot,
      energy: analysis.energy,
    }
  }

  /**
   * New metadata for a track that may be on a deck (prepared stems, stem
   * levels): loaded decks take it without touching playback.
   */
  updateTrackMetadata(track: Track) {
    let changed = false
    for (const id of ["A", "B"] as DeckId[]) {
      const deck = this.state[id]
      if (deck.track?.id !== track.id || deck.loading) continue
      const hadStems = !!deck.track.stems
      deck.track = {
        ...deck.track,
        stems: track.stems,
        analysis: track.analysis ?? deck.track.analysis,
        key: track.key,
        camelot: track.camelot,
        keyOverride: track.keyOverride,
        sectionOverride: track.sectionOverride,
      }
      if (!hadStems && track.stems) void this.attachStems(id)
      changed = true
    }
    if (changed) this.publish()
  }
  analyze(id: DeckId): Promise<boolean> {
    const track = this.state[id].track,
      buffer = this.channels[id]?.buffer
    if (!track || !buffer || this.state[id].loading)
      return Promise.resolve(false)
    for (const deckId of ["A", "B"] as DeckId[]) {
      if (
        this.state[deckId].track &&
        linkedFingerprint(this.state[deckId].track) === linkedFingerprint(track)
      ) {
        this.state[deckId].analysisStatus = "running"
        this.state[deckId].analysisError = null
      }
    }
    this.publish()
    const existing = this.analysisJobs.get(linkedFingerprint(track))
    if (existing) return existing.promise
    let resolve!: (success: boolean) => void
    const promise = new Promise<boolean>((done) => {
      resolve = done
    })
    let worker: Worker | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      settled = false
    const finish = (analysis?: Analysis, error?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker?.terminate()
      this.analysisJobs.delete(linkedFingerprint(track))
      if (analysis) this.analysisCache.set(linkedFingerprint(track), analysis)
      // Re-read metadata now: cues/grids or the loaded track may have changed.
      const current =
        [this.state.A, this.state.B].find(
          (deck) =>
            deck.track &&
            linkedFingerprint(deck.track) === linkedFingerprint(track) &&
            !deck.loading
        )?.track ?? track
      const refreshed = analysis
        ? this.analysisMetadata(current, analysis, buffer.duration)
        : null
      for (const deckId of ["A", "B"] as DeckId[]) {
        const deck = this.state[deckId]
        if (
          !deck.track ||
          linkedFingerprint(deck.track) !== linkedFingerprint(track)
        )
          continue
        if (analysis && !deck.loading)
          deck.track = this.analysisMetadata(
            deck.track,
            analysis,
            this.channels[deckId]?.buffer?.duration ?? buffer.duration
          )
        deck.analysisStatus = error ? "error" : "idle"
        deck.analysisError = error ?? null
      }
      // This updates metadata only. Sources, transport, sync, rate, gain and the
      // executing automix plan stay in place; future suggestions recompute.
      this.publish()
      if (refreshed) this.onAnalysis?.(refreshed)
      resolve(!!analysis)
    }
    this.analysisJobs.set(linkedFingerprint(track), {
      promise,
      cancel: () => finish(),
    })
    try {
      worker = new Worker(new URL("./analysis.worker.ts", import.meta.url), {
        type: "module",
      })
      worker.onmessage = (event: MessageEvent<Analysis>) =>
        finish({ ...event.data, analyzedAt: new Date().toISOString() })
      worker.onerror = () =>
        finish(
          undefined,
          "Analysis failed. Your audio and saved cues are unchanged. Try again."
        )
      worker.onmessageerror = () =>
        finish(undefined, "Analysis could not be read. Try again.")
      timer = setTimeout(
        () =>
          finish(
            undefined,
            "Analysis timed out. Try again when the device is less busy."
          ),
        // The beat model can add a one-time 10 MB download.
        180000
      )
      // Copy PCM; never transfer the AudioBuffer's storage used by playback.
      // Stereo folding, waveform and music analysis run entirely in the worker.
      const channels = Array.from(
        { length: buffer.numberOfChannels },
        (_, channel) => buffer.getChannelData(channel).slice()
      )
      worker.postMessage(
        {
          channels,
          sampleRate: buffer.sampleRate,
          useModels: this.useAnalysisModels,
        },
        channels.map((samples) => samples.buffer)
      )
    } catch {
      finish(
        undefined,
        "Background analysis is unavailable. Your audio keeps playing; try again."
      )
    }
    return promise
  }

  /** Tracks analyzed before 3-band waveforms existed get their band levels
   * from the analysis worker, keeping the ~1 s of filtering off the UI thread. */
  /** Tracks analyzed by an older version get band levels and structure
   * (vocals, sections, phrases) from the worker, off the UI thread. */
  private backfillBands(id: DeckId, buffer: AudioBuffer, version: number) {
    let worker: Worker
    try {
      worker = new Worker(new URL("./analysis.worker.ts", import.meta.url), {
        type: "module",
      })
    } catch {
      return
    }
    const done = () => worker.terminate()
    worker.onerror = done
    worker.onmessage = (
      event: MessageEvent<
        Pick<
          Analysis,
          | "peaks"
          | "bands"
          | "vocals"
          | "vocalsVersion"
          | "sections"
          | "phraseOffset"
        >
      >
    ) => {
      done()
      const deck = this.state[id],
        analysis = deck.track?.analysis
      if (
        this.channels[id]?.loadVersion !== version ||
        !analysis ||
        !needsStructureRefresh(analysis)
      )
        return
      deck.track = {
        ...deck.track!,
        analysis: { ...analysis, ...event.data },
      }
      this.onAnalysis?.(deck.track)
      this.publish()
    }
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
      buffer.getChannelData(c).slice()
    )
    const track = this.state[id].track
    worker.postMessage(
      {
        channels,
        sampleRate: buffer.sampleRate,
        waveformOnly: true,
        bpm: track?.bpm ?? null,
        beatOffset: beatOffset(track),
      },
      channels.map((samples) => samples.buffer)
    )
  }
  /** Audio-clock position for animation; the published state updates every 50 ms. */
  livePosition(id: DeckId) {
    return this.position(id)
  }
  /** Master output spectrum (byte magnitudes) for visuals; false before audio starts. */
  readMasterSpectrum(out: Uint8Array<ArrayBuffer>) {
    if (!this.masterAnalyser) return false
    this.masterAnalyser.getByteFrequencyData(out)
    return true
  }
  private masterSamples?: Float32Array<ArrayBuffer>
  /** Master output RMS (linear, after the limiter); null before audio starts. */
  readMasterLevel() {
    if (!this.masterAnalyser) return null
    this.masterSamples ??= new Float32Array(this.masterAnalyser.fftSize)
    this.masterAnalyser.getFloatTimeDomainData(this.masterSamples)
    let sum = 0
    for (const value of this.masterSamples) sum += value * value
    return Math.sqrt(sum / this.masterSamples.length)
  }
  get masterSpectrumSize() {
    return this.masterAnalyser?.frequencyBinCount ?? 1024
  }
  get sampleRate() {
    return this.context?.sampleRate ?? 48000
  }
  private position(id: DeckId, time = this.context?.currentTime ?? 0) {
    const deck = this.state[id],
      ch = this.channels[id]
    if (!deck.playing || !ch || !this.context) return deck.position
    const elapsed =
      Math.max(0, time - ch.startTime) *
      (ch.source ? ch.source.playbackRate.value : deck.rate)
    if (deck.loop && ch.source?.loop)
      return (
        ch.source.loopStart +
        ((ch.startOffset - ch.source.loopStart + elapsed) %
          (ch.source.loopEnd - ch.source.loopStart))
      )
    return Math.max(
      0,
      Math.min(
        ch.buffer?.duration ?? 0,
        ch.startOffset + elapsed * (ch.reversed ? -1 : 1)
      )
    )
  }
  async play(id: DeckId, offset?: number, atTime?: number) {
    const ctx = this.init(),
      ch = this.channels[id]!
    if (!ch.buffer || this.state[id].loading) {
      this.state.error = this.state[id].loading
        ? `Deck ${id} is still loading. Try Play when it is ready.`
        : `Load a track on deck ${id} before pressing Play.`
      this.publish()
      return
    }
    if (ch.pendingPlay) return
    const version = ch.transportVersion
    ch.pendingPlay = true
    try {
      if (ctx.state !== "running") {
        const activation =
          typeof navigator === "undefined"
            ? undefined
            : (navigator as { userActivation?: UserActivation }).userActivation
        if (activation && !activation.hasBeenActive) {
          this.state.error =
            "Enable audio once in the studio to use controller playback."
          this.publish()
        }
        await ctx.resume()
      }
    } catch (error) {
      if (ch.transportVersion === version) {
        ch.pendingPlay = false
        this.state.error = `Audio could not start: ${error instanceof Error ? error.message : String(error)}`
        this.publish()
      }
      return
    }
    const deck = this.state[id]
    // Playback state and buffers can change while resume() is pending.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!ch.buffer || deck.loading || ch.transportVersion !== version) return
    ch.pendingPlay = false
    if (this.state.error?.startsWith("Enable audio once"))
      this.state.error = null
    if (deck.playing) return
    const startTime = Math.max(
      ctx.currentTime + (deck.syncTo && offset === undefined ? 0.005 : 0),
      atTime ?? ctx.currentTime
    )
    let startOffset = offset ?? deck.position
    if (deck.syncTo && offset === undefined && !ch.cuePreview) {
      const aligned = this.syncedPosition(id, startOffset, startTime)
      if (aligned !== null) startOffset = aligned
      else deck.syncTo = null
    }
    const source = ctx.createBufferSource()
    source.buffer = ch.reversed
      ? (ch.reverseBuffer ?? ch.buffer)
      : (ch.stemBuffer ?? ch.buffer)
    source.playbackRate.value = deck.rate
    this.routeSource(id, source)
    this.applyChannel(id)
    this.applyMix()
    ch.source = source
    ch.startOffset = Math.min(
      Math.max(0, startOffset),
      Math.max(0, ch.buffer.duration - 0.01)
    )
    ch.startTime = startTime
    deck.position = ch.startOffset
    // The key-lock path runs PITCH_LATENCY behind its input. Start the
    // source that much early when the start is scheduled far enough ahead;
    // otherwise a synced or scheduled start skips that much audio to stay on
    // the grid, and a plain Play starts from the cue and is heard a moment
    // later (the playhead waits with it).
    let sourceTime = startTime,
      sourceOffset = ch.startOffset
    if (ch.pitch) {
      if (startTime - PITCH_LATENCY >= ctx.currentTime)
        sourceTime = startTime - PITCH_LATENCY
      else if ((deck.syncTo || atTime !== undefined) && !ch.reversed) {
        sourceTime = ctx.currentTime
        sourceOffset +=
          (ctx.currentTime + PITCH_LATENCY - startTime) * deck.rate
      } else {
        sourceTime = ctx.currentTime
        ch.startTime = ctx.currentTime + PITCH_LATENCY
      }
    }
    if (deck.loop && deck.track?.bpm) {
      const length = (deck.loop * 60) / deck.track.bpm
      source.loop = true
      source.loopStart = ch.loopIn ?? ch.startOffset
      source.loopEnd = Math.min(ch.buffer.duration, source.loopStart + length)
    }
    source.onended = () => {
      if (ch.source === source) {
        this.state[id].playing = false
        this.state[id].position = ch.reversed ? 0 : (ch.buffer?.duration ?? 0)
        this.publish()
      }
    }
    deck.playing = true
    source.start(
      sourceTime,
      ch.reversed ? ch.buffer.duration - sourceOffset - 0.01 : sourceOffset
    )
    this.publish()
  }
  pause(id: DeckId) {
    if (this.automation) this.cancelAuto()
    const deck = this.state[id],
      ch = this.channels[id]
    if (ch?.pendingStems) queueMicrotask(() => void this.attachStems(id))
    if (ch) {
      ch.transportVersion++
      ch.pendingPlay = false
      if (ch.nudgeTimer) clearTimeout(ch.nudgeTimer)
      ch.nudgeTimer = undefined
      if (ch.echoOutTimer) clearTimeout(ch.echoOutTimer)
      ch.echoOutTimer = undefined
      ch.slipAnchor = undefined
      ch.scratch?.port.postMessage({ type: "stop" })
      ch.scratchResume = false
      ch.scrubSource?.stop()
      ch.scrubSource?.disconnect()
      ch.scrubSource = undefined
    }
    deck.echoOut = false
    deck.slipPosition = null
    deck.position = this.position(id)
    deck.playing = false
    if (ch?.source) {
      const source = ch.source
      ch.source = undefined
      source.onended = null
      source.stop()
      source.disconnect()
    }
    if (ch?.pitch) {
      ch.pitch.node.disconnect()
      ch.pitch.node.port.close()
      ch.pitch = undefined
    }
    this.preparePitch(id)
    this.publish()
  }
  /** Keep a spare key-lock node ready while the deck needs one. */
  private preparePitch(id: DeckId) {
    const ch = this.channels[id],
      deck = this.state[id]
    if (!ch || !this.context || ch.pitchSpare) return
    if (deck.keyLock || deck.keyShift !== 0)
      ch.pitchSpare = createPitchNode(this.context)
  }
  /**
   * Restart a playing deck's source at the position you hear, so entering
   * or leaving the key-lock path keeps the deck on its grid.
   */
  private restartSource(id: DeckId) {
    const ch = this.channels[id],
      deck = this.state[id]
    if (!ch?.source || !deck.playing) return
    const position = this.position(id),
      source = ch.source
    ch.source = undefined
    source.onended = null
    source.stop()
    source.disconnect()
    ch.pitch?.node.disconnect()
    ch.pitch?.node.port.close()
    ch.pitch = undefined
    deck.playing = false
    // A start time marks it as on-grid: skip ahead rather than shift late.
    void this.play(id, position, this.context!.currentTime)
  }
  async toggle(id: DeckId) {
    this.cancelAuto()
    const ch = this.channels[id]
    if (ch?.cuePreview) {
      ch.cuePreview = false
      return
    }
    if (this.state[id].playing || this.channels[id]?.pendingPlay) this.pause(id)
    else await this.play(id)
  }
  instantDouble(id: DeckId) {
    const otherId = id === "A" ? "B" : "A",
      original = this.state[otherId],
      source = this.channels[otherId],
      target = this.channels[id]
    if (!source?.buffer || !original.track || original.loading || !target) {
      this.state.error =
        "Load a track on the other deck before using instant doubles."
      this.publish()
      return false
    }
    const position = this.position(otherId)
    this.pause(id)
    this.releasePadFX(id)
    target.loadVersion++
    target.pitchVersion++
    target.buffer = source.buffer
    target.stemBuffer = source.stemBuffer
    if (source.stemMatrix && this.context)
      target.stemMatrix =
        target.stemMatrix?.layout === source.stemMatrix.layout
          ? target.stemMatrix
          : createStemMatrix(this.context, source.stemMatrix.layout)
    if (target.stemMatrix && target.rack)
      target.stemMatrix.vocalTap.connect(target.rack.echoInput)
    target.scratch?.disconnect()
    target.scratch?.port.close()
    target.scratch = undefined
    target.scratchSpan = undefined
    void this.prepareScratch(id, target.loadVersion)
    target.reverseBuffer = undefined
    target.reversed = false
    target.loopIn = source.loopIn
    target.cuePreview = false
    this.state[id] = {
      ...this.state[id],
      track: original.track,
      loading: false,
      playing: false,
      position,
      rate: original.rate,
      keyShift: original.keyShift,
      keyLock: original.keyLock,
      stems: target.stemBuffer && original.stems ? { ...original.stems } : null,
      stemLayout: target.stemBuffer ? original.stemLayout : null,
      cues: [...original.cues],
      cueLabels: [...original.cueLabels],
      memoryCues: [...original.memoryCues],
      loop: original.loop,
      loopAdjust: null,
      syncTo: null,
    }
    if (target.stemMatrix && this.state[id].stems && this.context)
      setStemGains(
        target.stemMatrix,
        this.state[id].stems,
        this.context.currentTime
      )
    this.state[otherId].syncTo = null
    this.state.error = null
    if (original.playing) void this.play(id, position)
    this.publish()
    return true
  }
  seek(id: DeckId, seconds: number) {
    this.cancelAuto()
    this.state[id].syncTo = null
    this.state[id === "A" ? "B" : "A"].syncTo = null
    const wasPlaying = this.state[id].playing
    this.pause(id)
    this.state[id].position = Math.min(
      Math.max(0, seconds),
      this.state[id].track?.duration ?? 0
    )
    if (wasPlaying) void this.play(id)
    this.publish()
  }
  cue(id: DeckId) {
    this.cancelAuto()
    this.pause(id)
    this.seek(id, this.state[id].cues[0] ?? 0)
  }
  hotcue(id: DeckId, index: number, clear = false) {
    this.cancelAuto()
    const deck = this.state[id]
    if (clear) {
      deck.cues[index] = null
      deck.cueLabels[index] = null
    } else if (deck.cues[index] === null)
      deck.cues[index] =
        deck.quantize && deck.track
          ? snapToBeat(deck.track, this.position(id))
          : this.position(id)
    else this.seek(id, deck.cues[index])
    this.saveCues(id)
    this.publish()
  }
  private saveCues(id: DeckId) {
    const deck = this.state[id]
    if (!deck.track) return
    // Cue subscribers and planner memoization depend on immutable metadata.
    deck.cues = [...deck.cues]
    deck.cueLabels = [...deck.cueLabels]
    const other = this.state[id === "A" ? "B" : "A"]
    if (other.track?.id === deck.track.id) {
      other.cues = [...deck.cues]
      other.cueLabels = [...deck.cueLabels]
    }
    this.onCueChange?.(deck.track.id, [...deck.cues], [...deck.cueLabels])
  }
  renameCue(id: DeckId, index: number, label: string) {
    const deck = this.state[id]
    if (
      !deck.track ||
      deck.loading ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= deck.cues.length ||
      deck.cues[index] === null
    )
      return false
    deck.cueLabels[index] = label.trim().slice(0, 32) || null
    this.saveCues(id)
    this.publish()
    return true
  }
  saveSuggestedCue(id: DeckId, position: number, label: string) {
    const deck = this.state[id]
    if (
      !deck.track ||
      deck.loading ||
      !Number.isFinite(position) ||
      position < 0 ||
      position >= deck.track.duration
    )
      return null
    const existing = deck.cues.findIndex(
      (cue) => cue !== null && Math.abs(cue - position) < 0.01
    )
    if (existing >= 0) return existing
    const slot = deck.cues.findIndex((cue) => cue === null)
    if (slot < 0) return null
    deck.cues[slot] = position
    deck.cueLabels[slot] = label
    this.saveCues(id)
    this.publish()
    return slot
  }
  setPadMode(id: DeckId, mode: PadMode) {
    this.releasePadFX(id)
    this.state[id].padMode = mode
    this.state[id].padBank = 0
    this.publish()
  }
  padFX(id: DeckId, index: number, pressed: boolean) {
    const preset = index >= 0 ? padFXPresets.at(index) : undefined
    if (!preset) return
    let held = this.heldPadFX.get(id)
    if (pressed) {
      if (!held) {
        const deck = this.state[id]
        held = {
          pads: [],
          fx: { ...deck.fx },
          filter: deck.filter,
          loop: deck.loop,
          slip: deck.slip,
        }
        this.heldPadFX.set(id, held)
      }
      held.pads = [...held.pads.filter((pad) => pad !== index), index]
    } else {
      if (!held) return
      held.pads = held.pads.filter((pad) => pad % 8 !== index % 8)
    }
    if (!held.pads.length) {
      this.releasePadFX(id)
      return
    }
    this.state[id].activePads = [...held.pads]
    const active = padFXPresets[held.pads[held.pads.length - 1]]
    this.setFX(id, { ...held.fx, ...active.fx })
    this.setParam(id, "filter", active.filter ?? held.filter)
    if (active.roll) {
      this.setSlip(id, true)
      this.loop(id, active.roll)
    } else if (this.state[id].loop !== held.loop) {
      this.loop(id, null)
      this.setSlip(id, held.slip)
      if (held.loop) this.loop(id, held.loop)
    }
    this.publish()
  }
  releasePadFX(id: DeckId) {
    const held = this.heldPadFX.get(id)
    if (!held) return
    this.heldPadFX.delete(id)
    this.state[id].activePads = []
    this.setFX(id, held.fx)
    this.setParam(id, "filter", held.filter)
    if (this.state[id].loop !== held.loop) {
      this.loop(id, null)
      if (held.loop) this.loop(id, held.loop)
    }
    this.setSlip(id, held.slip)
    this.publish()
  }
  private createSamplerSounds(ctx: AudioContext) {
    // Small built-in percussion sounds keep the sampler usable without downloads.
    for (const id of ["A", "B"] as DeckId[])
      for (let slot = 0; slot < 8; slot++) {
        const length = Math.ceil(ctx.sampleRate * (slot === 4 ? 0.6 : 0.25))
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
        const samples = buffer.getChannelData(0)
        let previous = 0
        for (let i = 0; i < length; i++) {
          const t = i / ctx.sampleRate,
            envelope = Math.exp(-t * (slot === 4 ? 10 : 22))
          const noise = Math.random() * 2 - 1
          const tone = Math.sin(
            2 *
              Math.PI *
              (slot === 0
                ? 50 * t + 4 * (1 - Math.exp(-t * 30))
                : (120 + slot * 60) * t)
          )
          samples[i] =
            (slot === 0 || slot === 5
              ? tone
              : slot >= 3 && slot <= 4
                ? noise - previous
                : noise * 0.65 + tone * 0.35) *
            envelope *
            0.5
          previous = noise
        }
        this.sampleBuffers.set(`${id}:${slot}`, buffer)
      }
  }
  stopSample(id: DeckId, slot: number) {
    const key = `${id}:${slot}`,
      source = this.sampleSources.get(key)
    if (source) {
      source.onended = null
      if (this.startedSamples.has(key)) source.stop()
      source.disconnect()
      this.sampleSources.delete(key)
      this.startedSamples.delete(key)
    }
    this.state[id].samplerSlots = this.state[id].samplerSlots.map(
      (sample, i) => (i === slot ? { ...sample, playing: false } : sample)
    )
    this.publish()
  }
  async triggerSample(id: DeckId, slot: number, shifted = false) {
    if (slot < 0 || slot > 7) return
    const ctx = this.init(),
      key = `${id}:${slot}`
    if (shifted) {
      if (this.sampleSources.has(key)) {
        this.stopSample(id, slot)
        return
      }
      const ch = this.channels[id]
      if (!ch?.buffer) return
      const offset = Math.floor(this.position(id) * ch.buffer.sampleRate)
      const length = Math.min(
        ch.buffer.length - offset,
        Math.ceil(
          ch.buffer.sampleRate *
            (this.state[id].track?.bpm ? 240 / this.state[id].track.bpm : 2)
        )
      )
      if (length <= 0) return
      const clip = ctx.createBuffer(
        ch.buffer.numberOfChannels,
        length,
        ch.buffer.sampleRate
      )
      for (let channel = 0; channel < clip.numberOfChannels; channel++)
        clip
          .getChannelData(channel)
          .set(
            ch.buffer.getChannelData(channel).subarray(offset, offset + length)
          )
      this.sampleBuffers.set(key, clip)
      this.state[id].samplerSlots = this.state[id].samplerSlots.map(
        (sample, i) =>
          i === slot ? { name: `Clip ${slot + 1}`, playing: false } : sample
      )
      this.publish()
      return
    }
    this.stopSample(id, slot)
    const source = ctx.createBufferSource()
    source.buffer = this.sampleBuffers.get(key)!
    source.connect(this.masterNode!)
    this.sampleSources.set(key, source)
    source.onended = () => {
      if (this.sampleSources.get(key) === source) this.stopSample(id, slot)
    }
    try {
      await ctx.resume()
    } catch (error) {
      this.stopSample(id, slot)
      throw error
    }
    if (this.sampleSources.get(key) !== source) return
    this.state[id].samplerSlots = this.state[id].samplerSlots.map(
      (sample, i) => (i === slot ? { ...sample, playing: true } : sample)
    )
    source.start()
    this.startedSamples.add(key)
    this.publish()
  }
  async setKeyShift(id: DeckId, semitones: number) {
    const ctx = this.init(),
      ch = this.channels[id]!,
      version = ++ch.pitchVersion
    await registerPitch(ctx)
    if (version !== ch.pitchVersion || ctx.state === "closed") return false
    this.state[id].keyShift = Math.max(-12, Math.min(12, semitones))
    this.preparePitch(id)
    this.refreshPitch(id)
    this.publish()
    return true
  }
  async setKeyLock(id: DeckId, enabled: boolean) {
    const ctx = this.init(),
      ch = this.channels[id]!,
      version = ++ch.pitchVersion
    if (enabled) await registerPitch(ctx)
    if (version !== ch.pitchVersion || ctx.state === "closed") return
    this.state[id].keyLock = enabled
    this.preparePitch(id)
    this.refreshPitch(id)
    this.publish()
  }
  private routeSource(id: DeckId, source: AudioBufferSourceNode) {
    const ch = this.channels[id]!,
      deck = this.state[id]
    const target = ch.rack?.sourceGate ?? ch.inputAnalyser
    // A stem buffer goes through the stem gains, which mix it back to stereo.
    const matrix =
      ch.stemMatrix && (source.buffer?.numberOfChannels ?? 0) > 2
        ? ch.stemMatrix
        : null
    let output: AudioNode = source
    if (matrix) {
      source.connect(matrix.input)
      matrix.output.disconnect()
      output = matrix.output
    }
    if (deck.keyLock || deck.keyShift !== 0) {
      ch.pitch ??= ch.pitchSpare ?? createPitchNode(this.context!)
      ch.pitchSpare = undefined
      this.writeParam(ch.pitch.rate, source.playbackRate.value)
      this.writeParam(
        ch.pitch.pitch,
        deck.keyLock ? 1 : source.playbackRate.value
      )
      this.writeParam(ch.pitch.semitones, deck.keyShift)
      output.connect(ch.pitch.node)
      ch.pitch.node.connect(target)
    } else output.connect(target)
  }

  /**
   * Load a track's prepared stems onto its deck for playback. While the
   * deck plays, this waits for the next stop so the music never jumps.
   */
  private async attachStems(id: DeckId) {
    const ch = this.channels[id],
      deck = this.state[id],
      track = deck.track
    if (!ch?.buffer || !track?.stems || !this.context) return
    if (deck.playing) {
      ch.pendingStems = true
      return
    }
    const version = ch.loadVersion,
      original = ch.buffer
    const stems = await loadDeckStems(track, original.length).catch(() => null)
    if (!stems || ch.loadVersion !== version || ch.buffer !== original) return
    const layout = stemLayoutFor(original.duration)
    ch.stemBuffer = buildStemBuffer(this.context, original, stems, layout)
    if (ch.stemMatrix?.layout !== layout) {
      ch.stemMatrix = createStemMatrix(this.context, layout)
      if (ch.rack) ch.stemMatrix.vocalTap.connect(ch.rack.echoInput)
    }
    this.state[id].stems = { ...allStemsOn }
    this.state[id].stemLayout = layout
    setStemGains(ch.stemMatrix, allStemsOn, this.context.currentTime)
    ch.pendingStems = false
    this.publish()
  }

  /** Set one stem's level on a deck (0 = muted, 1 = full). */
  setStem(id: DeckId, stem: keyof StemGains, value: number) {
    const ch = this.channels[id],
      deck = this.state[id]
    if (!ch?.stemMatrix || !deck.stems || !this.context) return
    // A hand on a stem takes that deck's stems back from a running routine.
    if (this.automation) (this.automation.stemsTouched ??= new Set()).add(id)
    deck.stems = { ...deck.stems, [stem]: Math.max(0, Math.min(1, value)) }
    setStemGains(ch.stemMatrix, deck.stems, this.context.currentTime)
    this.publish()
  }
  private refreshPitch(id: DeckId) {
    const ch = this.channels[id]
    if (!ch?.source) return
    if ((this.state[id].keyLock || this.state[id].keyShift !== 0) && ch.pitch) {
      this.writeParam(ch.pitch.rate, ch.source.playbackRate.value)
      this.writeParam(
        ch.pitch.pitch,
        this.state[id].keyLock ? 1 : ch.source.playbackRate.value
      )
      this.writeParam(ch.pitch.semitones, this.state[id].keyShift)
      return
    }
    // Entering or leaving the key-lock path changes the delay: restart at
    // the heard position so the deck stays on its grid.
    const pitched = this.state[id].keyLock || this.state[id].keyShift !== 0
    if (this.state[id].playing && (pitched || ch.pitch)) {
      this.restartSource(id)
      return
    }
    ch.source.disconnect()
    ch.pitch?.node.disconnect()
    ch.pitch?.node.port.close()
    ch.pitch = undefined
    this.routeSource(id, ch.source)
  }
  private applyMonitor() {
    const controls = this.state.controller
    if (this.monitorLevel)
      this.writeParam(this.monitorLevel.gain, controls.headphoneLevel)
    if (this.monitorMaster)
      this.writeParam(
        this.monitorMaster.gain,
        controls.masterCue ? controls.headphoneMix : 0
      )
    for (const id of ["A", "B"] as DeckId[]) {
      const gain = this.channels[id]?.cueGain
      if (gain)
        this.writeParam(
          gain.gain,
          this.state[id].headphoneCue ? 1 - controls.headphoneMix : 0
        )
    }
  }
  /** Output device of the headphone (cue) bus, if one is connected. */
  monitorSinkId() {
    return this.state.controller.monitorConnected
      ? ((this.monitorAudio as unknown as { sinkId?: string } | undefined)
          ?.sinkId ?? null)
      : null
  }
  async setMonitorOutput(deviceId: string | null) {
    if (this.outputPairs) this.setOutputPairs(false)
    const version = ++this.monitorVersion
    if (!deviceId) {
      this.monitorAudio?.pause()
      if (this.monitorAudio) this.monitorAudio.srcObject = null
      this.monitorAudio = undefined
      this.state.controller.monitorConnected = false
      this.publish()
      return
    }
    const ctx = this.init(),
      audio = this.monitorAudio ?? new Audio()
    const setSinkId = (
      audio as unknown as { setSinkId?: (id: string) => Promise<void> }
    ).setSinkId
    if (!setSinkId)
      throw new Error("This browser cannot select a separate headphone output.")
    await setSinkId.call(audio, deviceId)
    if (version !== this.monitorVersion) return
    audio.srcObject = this.monitorNode!.stream
    await ctx.resume()
    if (version !== this.monitorVersion) {
      audio.srcObject = null
      return
    }
    await audio.play()
    if (version !== this.monitorVersion) {
      audio.pause()
      audio.srcObject = null
      return
    }
    this.monitorAudio = audio
    this.state.controller.monitorConnected = true
    this.publish()
  }
  setOutputPairs(enabled: boolean) {
    const ctx = this.init()
    if (enabled && ctx.destination.maxChannelCount < 4)
      throw new Error(
        `This browser exposes only ${ctx.destination.maxChannelCount} output channels. Select a four-channel FLX4 output first.`
      )
    if (this.outputPairs) {
      this.limiterNode!.disconnect(this.outputPairs.master)
      this.monitorLevel!.disconnect(this.outputPairs.cue)
      this.outputPairs.master.disconnect()
      this.outputPairs.cue.disconnect()
      this.outputPairs.merger.disconnect()
      this.outputPairs = undefined
      ctx.destination.channelCount = 2
      this.limiterNode!.connect(ctx.destination)
    }
    if (enabled) {
      this.monitorVersion++
      this.monitorAudio?.pause()
      if (this.monitorAudio) this.monitorAudio.srcObject = null
      this.monitorAudio = undefined
      const master = ctx.createChannelSplitter(2),
        cue = ctx.createChannelSplitter(2),
        merger = ctx.createChannelMerger(4)
      ctx.destination.channelCount = 4
      this.limiterNode!.disconnect(ctx.destination)
      this.limiterNode!.connect(master)
      this.monitorLevel!.connect(cue)
      master.connect(merger, 0, 0)
      master.connect(merger, 1, 1)
      cue.connect(merger, 0, 2)
      cue.connect(merger, 1, 3)
      merger.connect(ctx.destination)
      this.outputPairs = { master, cue, merger }
    }
    this.state.controller.outputPairs = enabled
    this.state.controller.monitorConnected = enabled || !!this.monitorAudio
    this.publish()
  }
  async enableMic(enabled: boolean) {
    const version = ++this.micVersion
    if (!enabled) {
      this.micStream?.getTracks().forEach((track) => track.stop())
      this.micStream = undefined
      this.state.controller.micEnabled = false
      this.publish()
      return
    }
    const ctx = this.init()
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
    if (version !== this.micVersion) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    this.micStream?.getTracks().forEach((track) => track.stop())
    this.micStream = stream
    ctx.createMediaStreamSource(stream).connect(this.micNode!)
    await ctx.resume()
    if (version !== this.micVersion) return
    this.state.controller.micEnabled = true
    this.publish()
  }
  private tapTempo(id: DeckId) {
    const now = performance.now(),
      taps = (this.tappedAt[id] ?? []).filter((t) => now - t < 3000).slice(-7)
    taps.push(now)
    this.tappedAt[id] = taps
    if (taps.length < 3 || !this.state[id].track) return
    const bpm = (60000 * (taps.length - 1)) / (now - taps[0])
    this.setBeatgrid(id, bpm, beatOffset(this.state[id].track))
  }
  private memoryCue(
    id: DeckId,
    action: "save" | "delete" | "call",
    direction = 1
  ) {
    const deck = this.state[id],
      position = this.position(id)
    if (!deck.track) return
    if (action === "save")
      deck.memoryCues = [
        ...new Set([
          ...deck.memoryCues,
          deck.quantize ? snapToBeat(deck.track, position) : position,
        ]),
      ].sort((a, b) => a - b)
    else if (action === "delete")
      deck.memoryCues = deck.memoryCues.filter(
        (cue) => Math.abs(cue - position) > 0.1
      )
    else {
      const cue =
        direction > 0
          ? deck.memoryCues.find((time) => time > position + 0.1)
          : [...deck.memoryCues].reverse().find((time) => time < position - 0.1)
      if (cue !== undefined) this.seek(id, cue)
      return
    }
    deck.track = { ...deck.track, memoryCues: [...deck.memoryCues] }
    const other = this.state[id === "A" ? "B" : "A"]
    if (other.track?.id === deck.track.id) {
      other.track = deck.track
      other.memoryCues = [...deck.memoryCues]
    }
    this.onAnalysis?.(deck.track)
    this.publish()
  }
  private reverse(id: DeckId, pressed: boolean) {
    const ch = this.channels[id]
    if (!ch?.buffer || ch.reversed === pressed) return
    const playing = this.state[id].playing
    this.pause(id)
    this.loop(id, null)
    if (pressed && !ch.reverseBuffer) {
      const buffer = ch.buffer,
        reversed = this.context!.createBuffer(
          buffer.numberOfChannels,
          buffer.length,
          buffer.sampleRate
        )
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const original = buffer.getChannelData(channel),
          copy = reversed.getChannelData(channel)
        for (let i = 0; i < copy.length; i++)
          copy[i] = original[copy.length - 1 - i]
      }
      ch.reverseBuffer = reversed
    }
    ch.reversed = pressed
    if (playing) void this.play(id)
    this.publish()
  }
  setWaveformBars(bars: number) {
    this.state.controller.waveformBars = Math.max(4, Math.min(32, bars))
    this.publish()
  }
  /** Returns false for library actions and controls handled by the provider. */
  handleControllerAction(action: MidiAction) {
    const id = action.deck ?? "A",
      deck = this.state[id],
      controls = this.state.controller
    const targets: DeckId[] =
      controls.fxTarget === "both" ? ["A", "B"] : [controls.fxTarget]
    switch (action.type) {
      case "play":
        if (action.value > 0)
          void this.toggle(id).catch((error) => {
            this.state.error = `Deck ${id} could not start: ${String(error)}`
            this.publish()
          })
        break
      case "padMode": {
        const mode = action.value >= 0 ? padModes.at(action.value) : undefined
        if (mode) this.setPadMode(id, mode)
        break
      }
      case "padfx":
        this.padFX(id, action.value, !!action.pressed)
        break
      case "sampler":
        void this.triggerSample(id, action.value, action.shifted).catch(
          (error) => {
            this.state.error = String(error)
            this.publish()
          }
        )
        break
      case "padBank":
        deck.padBank = Math.max(-2, Math.min(3, deck.padBank + action.value))
        this.publish()
        break
      case "beatloop":
        this.loop(id, deck.loop === action.value ? null : action.value)
        break
      case "keyboard":
      case "keyshift":
        if (action.shifted && action.value >= 6) {
          deck.padBank = Math.max(
            -12,
            Math.min(5, deck.padBank + (action.value === 6 ? 1 : -1))
          )
          this.publish()
          break
        }
        void this.setKeyShift(id, deck.padBank + action.value)
          .then((applied) => {
            if (applied && action.type === "keyboard") {
              this.seek(id, this.state[id].cues[0] ?? 0)
              return this.play(id)
            }
          })
          .catch((error) => {
            this.state.error = String(error)
            this.publish()
          })
        break
      case "shift":
        deck.shiftPressed = action.value > 0
        this.publish()
        break
      case "jogTouch": {
        if (deck.loopAdjust) break
        const ch = this.channels[id]
        if (deck.jogTouched === action.value > 0) break
        deck.jogTouched = action.value > 0
        if (ch) {
          if (deck.jogTouched) {
            const resume = deck.playing,
              speed = resume ? (ch.source?.playbackRate.value ?? deck.rate) : 0
            if (deck.playing) this.pause(id)
            ch.scratchResume = resume
            this.feedScratch(id, deck.position, true)
            // A hand on a moving record brakes it rather than cutting it.
            if (resume && ch.scratch && this.context)
              ch.scratch.port.postMessage({
                type: "hold",
                position: deck.position,
                speed,
                time: this.context.currentTime,
              })
          } else {
            ch.scratch?.port.postMessage({ type: "stop" })
            ch.scrubSource?.stop()
            ch.scrubSource = undefined
            if (ch.scratchResume) {
              ch.scratchResume = false
              this.resumeFromHand(id)
            }
          }
        }
        this.publish()
        break
      }
      case "sync":
        if (deck.syncTo) this.releaseSync(id)
        else this.sync(id)
        break
      case "syncMaster":
        controls.syncMaster = id
        this.releaseSync(id)
        if (this.state[id === "A" ? "B" : "A"].syncTo)
          this.sync(id === "A" ? "B" : "A")
        this.publish()
        break
      case "tempoRange": {
        const ranges = [0.06, 0.08, 0.1, 0.16]
        deck.tempoRange =
          ranges[(ranges.indexOf(deck.tempoRange) + 1) % ranges.length]
        this.publish()
        break
      }
      case "trackStart":
        this.seek(id, 0)
        break
      case "faderPlay":
        void this.play(id)
        break
      case "faderCue":
        this.cue(id)
        break
      case "reverse":
        this.reverse(id, action.value > 0)
        break
      case "master":
        this.setMaster(action.value)
        break
      case "headphoneCue":
        deck.headphoneCue = !deck.headphoneCue
        this.applyMonitor()
        this.publish()
        break
      case "masterCue":
        controls.masterCue = !controls.masterCue
        this.applyMonitor()
        this.publish()
        break
      case "headphoneMix":
      case "headphoneLevel":
        controls[action.type] = Math.max(0, Math.min(1, action.value))
        this.applyMonitor()
        this.publish()
        break
      case "micLevel":
        controls.micLevel = Math.max(0, Math.min(1, action.value))
        if (this.micNode) this.writeParam(this.micNode.gain, controls.micLevel)
        this.publish()
        break
      case "fxAssign":
        controls[action.deck === "B" ? "fxAssignB" : "fxAssignA"] =
          action.value > 0
        if (controls.fxAssignA || controls.fxAssignB)
          controls.fxTarget =
            controls.fxAssignA && controls.fxAssignB
              ? "both"
              : controls.fxAssignA
                ? "A"
                : "B"
        this.publish()
        break
      case "fxSelect":
        for (const target of targets)
          this.setFX(target, {
            type: this.state[target].fx.type === "echo" ? "reverb" : "echo",
          })
        break
      case "fxBeats": {
        const beats = [0.25, 0.5, 0.75, 1, 1.5, 2]
        for (const target of targets)
          this.setFX(target, {
            beats:
              beats[
                Math.max(
                  0,
                  Math.min(
                    beats.length - 1,
                    beats.indexOf(this.state[target].fx.beats) +
                      Math.sign(action.value)
                  )
                )
              ],
          })
        break
      }
      case "fxAmount":
        for (const target of targets)
          this.setFX(target, { amount: action.value })
        break
      case "fxToggle": {
        const enabled = !this.state[targets[0]].fx.enabled
        for (const target of targets) this.setFX(target, { enabled })
        break
      }
      case "releaseFX":
        for (const target of targets) this.echoOut(target)
        break
      case "fxAuto":
        for (const target of targets) {
          this.resetBeatgrid(target)
          this.setFX(target, { beats: 1 })
        }
        break
      case "fxTap":
        for (const target of action.deck ? [id] : targets) this.tapTempo(target)
        break
      case "smartCFX":
        controls.smartCFX = !controls.smartCFX
        if (!controls.smartCFX)
          for (const target of ["A", "B"] as DeckId[])
            this.setFX(target, { enabled: false })
        this.publish()
        break
      case "smartCFXPreset":
        controls.smartCFXPreset = 1 - controls.smartCFXPreset
        this.publish()
        break
      case "smartFader":
        controls.smartFader = !controls.smartFader
        if (controls.smartFader)
          this.sync(this.state.crossfade <= 0.5 ? "B" : "A")
        this.applyMix()
        this.publish()
        break
      case "loopAdjust":
        deck.loopAdjust =
          deck.loopAdjust === (action.value ? "out" : "in")
            ? null
            : action.value
              ? "out"
              : "in"
        this.publish()
        break
      case "loopIn":
        if (deck.loop) {
          deck.loopAdjust = deck.loopAdjust === "in" ? null : "in"
          this.publish()
        } else this.setLoopIn(id)
        break
      case "loopOut":
        if (deck.loop) {
          deck.loopAdjust = deck.loopAdjust === "out" ? null : "out"
          this.publish()
        } else this.setLoopOut(id)
        break
      case "activeLoop":
        this.loop(id, deck.loop ? null : 4)
        break
      case "loopScale":
        if (deck.loop)
          this.loop(id, Math.max(0.125, Math.min(64, deck.loop * action.value)))
        else this.memoryCue(id, "call", action.value === 0.5 ? -1 : 1)
        break
      case "memorySave":
        this.memoryCue(id, "save")
        break
      case "memoryDelete":
        this.memoryCue(id, "delete")
        break
      case "quantize":
        this.setQuantize(id, !deck.quantize)
        break
      case "browseZoom": {
        const bars = [4, 8, 16, 32]
        this.setWaveformBars(
          bars[
            Math.max(
              0,
              Math.min(
                3,
                bars.indexOf(controls.waveformBars) - Math.sign(action.value)
              )
            )
          ]
        )
        break
      }
      default:
        return false
    }
    return true
  }
  setParam(
    id: DeckId,
    key: "volume" | "trim" | "low" | "mid" | "high" | "filter" | "rate",
    value: number
  ) {
    if (key === "trim") delete this.trimGlides[id]
    if (key === "rate" || key === "volume") this.cancelAuto()
    else {
      this.releaseAutomationControl(id, key)
      if (key === "filter" && this.state.controller.smartCFX)
        this.releaseAutomationControl(id, "fx")
    }
    const deck = this.state[id],
      ch = this.channels[id]
    if (key === "rate") {
      // A hand on the tempo always wins over the automatic return to native.
      delete this.tempoGlides[id]
      this.applyRate(id, value)
    } else {
      value = Math.min(
        key === "volume" || key === "filter" ? 1 : 12,
        Math.max(
          key === "volume"
            ? 0
            : key === "filter"
              ? -1
              : key === "trim"
                ? -24
                : -12,
          value
        )
      )
      deck[key] = value
      if (key === "filter" && this.state.controller.smartCFX) {
        deck.fx = {
          ...deck.fx,
          type: this.state.controller.smartCFXPreset ? "reverb" : "echo",
          enabled: Math.abs(value) > 0.01,
          amount: Math.abs(value),
        }
        if (this.automation) this.automation.overrides[id].fx = { ...deck.fx }
        this.applyFX(id)
      }
    }
    if (this.automation && key !== "rate" && key !== "volume")
      Object.assign(this.automation.overrides[id], { [key]: deck[key] })
    if (ch && this.context) {
      // A single knob must not reschedule every EQ, FX and fader parameter.
      if (key === "volume") this.applyMix()
      else if (key === "rate") this.applyFX(id)
      else if (key === "trim")
        this.writeParam(ch.trim.gain, Math.pow(10, deck.trim / 20))
      else if (key === "filter") this.applyFilter(id)
      else if (key === "low") this.applyBass(id)
      else this.writeParam(ch[key].gain, deck[key])
    }
    this.publish()
  }
  private applyRate(id: DeckId, value: number) {
    const deck = this.state[id],
      ch = this.channels[id]
    deck.syncTo = null
    const bounded = Math.min(1.16, Math.max(0.84, value))
    deck.position = this.position(id)
    if (ch && this.context) {
      if (ch.slipAnchor) {
        ch.slipAnchor.position = this.slipPosition(id)!
        ch.slipAnchor.time = this.context.currentTime
        ch.slipAnchor.rate = bounded
      }
      ch.startOffset = deck.position
      ch.startTime = this.context.currentTime
      if (ch.source) ch.source.playbackRate.value = bounded
      this.refreshPitch(id)
    }
    deck.rate = bounded
    const otherId = id === "A" ? "B" : "A"
    const follower = this.state[otherId]
    if (follower.syncTo === id && deck.track?.bpm && follower.track?.bpm) {
      const linkedRate =
        (deck.track.bpm * effectiveDeckRate(deck)) / follower.track.bpm
      if (linkedRate >= 0.84 && linkedRate <= 1.16) {
        this.setParam(otherId, "rate", linkedRate)
        this.state[otherId].syncTo = id
      } else {
        follower.syncTo = null
        this.state.error = `Deck ${otherId} sync released: tempo exceeds ±16%.`
      }
    }
  }
  /** Set tempo the mix drifts toward between transitions (null = native). */
  private tempoTargetBpm: number | null = null
  /**
   * Steer the set's tempo: after each automatic mix the new track eases to
   * this BPM instead of its native tempo, within a ±6% stretch.
   */
  setTempoTarget(bpm: number | null) {
    this.tempoTargetBpm = bpm && Number.isFinite(bpm) && bpm > 0 ? bpm : null
  }
  private returnRate(track: Track | null) {
    if (!this.tempoTargetBpm || !track?.bpm) return 1
    // Half/double-time tracks steer by the nearest octave of the target.
    const target = [0.5, 1, 2]
      .map((m) => this.tempoTargetBpm! * m)
      .sort((a, b) => Math.abs(a - track.bpm!) - Math.abs(b - track.bpm!))[0]
    const rate = Math.max(0.94, Math.min(1.06, target / track.bpm))
    return Math.abs(rate - 1) < 0.002 ? 1 : rate
  }
  /** Tempo a deck is heading to: the glide target while one runs (native
   * after a mix, or the next track's tempo during a planned ramp). */
  plannedRate(id: DeckId) {
    return this.tempoGlides[id]?.to ?? this.state[id].rate
  }
  /**
   * After an automatic mix the incoming track keeps the outgoing tempo, so a
   * set would drift by a few percent per track. Ease it back to its native
   * tempo over ~32 bars instead. This never cancels a scheduled transition.
   */
  private startTempoReturn(id: DeckId) {
    const deck = this.state[id]
    const to = this.returnRate(deck.track)
    if (!this.context || Math.abs(deck.rate - to) < 0.002 || deck.syncTo) return
    const beat = 60 / ((deck.track?.bpm ?? 120) * deck.rate)
    this.tempoGlides[id] = {
      from: deck.rate,
      to,
      start: this.context.currentTime,
      duration: Math.min(75, Math.max(15, 32 * 4 * beat)),
    }
  }
  private advanceTempoGlides() {
    let changed = false
    for (const id of ["A", "B"] as DeckId[]) {
      const glide = this.tempoGlides[id]
      if (!glide || !this.context) continue
      const progress = Math.min(
        1,
        Math.max(0, (this.context.currentTime - glide.start) / glide.duration)
      )
      const eased = progress * progress * (3 - 2 * progress)
      this.applyRate(id, glide.from + (glide.to - glide.from) * eased)
      if (progress >= 1) {
        delete this.tempoGlides[id]
        this.applyFX(id)
      }
      changed = true
    }
    return changed
  }
  /** Move trim knobs along their audio glide (exponential, like the audio). */
  private advanceTrimGlides() {
    if (!this.context) return false
    let changed = false
    for (const id of ["A", "B"] as DeckId[]) {
      const glide = this.trimGlides[id]
      if (!glide) continue
      const elapsed = this.context.currentTime - glide.start
      const value =
        glide.to + (glide.from - glide.to) * Math.exp(-elapsed / glide.tau)
      if (Math.abs(value - glide.to) < 0.05) {
        this.state[id].trim = glide.to
        delete this.trimGlides[id]
      } else this.state[id].trim = Math.round(value * 10) / 10
      changed = true
    }
    return changed
  }
  /** Land a glide immediately, e.g. when the next mix is about to begin. */
  private finishTempoReturn(id: DeckId) {
    const glide = this.tempoGlides[id]
    if (!glide) return
    delete this.tempoGlides[id]
    this.applyRate(id, glide.to)
    this.applyFX(id)
  }
  setCrossfade(value: number, manual = true) {
    if (manual) this.cancelAuto()
    this.state.crossfade = Math.min(1, Math.max(0, value))
    this.applyMix()
    this.publish()
  }
  setMaster(value: number) {
    this.state.master = Math.min(1, Math.max(0, value))
    if (this.masterNode)
      this.writeParam(this.masterNode.gain, this.state.master)
    this.publish()
  }
  private writeParam(param: AudioParam, value: number) {
    if (!this.context) return
    if (this.hardwareLocked) {
      param.cancelScheduledValues(this.context.currentTime)
      param.setValueAtTime(value, this.context.currentTime)
    } else param.setTargetAtTime(value, this.context.currentTime, 0.015)
  }
  private applyChannel(id: DeckId) {
    const ch = this.channels[id],
      deck = this.state[id]
    if (!ch) return
    for (const band of ["low", "mid", "high"] as const)
      if (band === "low") this.applyBass(id)
      else this.writeParam(ch[band].gain, deck[band])
    const glide = this.trimGlides[id]
    if (glide && this.context && !this.hardwareLocked) {
      // Carry on the glide rather than freezing it at the knob's value.
      const now = this.context.currentTime
      ch.trim.gain.cancelScheduledValues(now)
      ch.trim.gain.setTargetAtTime(10 ** (glide.to / 20), now, glide.tau)
    } else this.writeParam(ch.trim.gain, Math.pow(10, deck.trim / 20))
    this.applyFilter(id)
    this.applyFX(id)
  }
  private applyFilter(id: DeckId) {
    const ch = this.channels[id],
      deck = this.state[id]
    if (!ch) return
    const type = deck.filter > 0 ? "highpass" : "lowpass",
      frequency =
        deck.filter > 0
          ? 30 * Math.pow(500, deck.filter)
          : 22000 * Math.pow(0.002, Math.abs(deck.filter))
    if (ch.filter.type !== type && this.context) {
      // Crossing the centre: change type and frequency together. Gliding
      // the frequency after the switch briefly ran a high-pass at 22 kHz.
      const now = this.context.currentTime
      ch.filter.frequency.cancelScheduledValues(now)
      ch.filter.frequency.setValueAtTime(frequency, now)
      ch.filter.type = type
    } else this.writeParam(ch.filter.frequency, frequency)
  }
  private applyFX(id: DeckId) {
    const ch = this.channels[id],
      deck = this.state[id]
    if (!ch) return
    this.writeParam(
      ch.delay.delayTime,
      echoDelay(deck.track?.bpm ?? null, effectiveDeckRate(deck), deck.fx.beats)
    )
    this.writeParam(
      ch.echoSend.gain,
      deck.fx.enabled && deck.fx.type === "echo" ? deck.fx.amount * 0.65 : 0
    )
    this.writeParam(
      ch.reverbSend.gain,
      deck.fx.enabled && deck.fx.type === "reverb" ? deck.fx.amount * 0.65 : 0
    )
  }
  setFX(id: DeckId, values: Partial<DeckState["fx"]>) {
    this.releaseAutomationControl(id, "fx")
    this.state[id].fx = { ...this.state[id].fx, ...values }
    this.state[id].fx.amount = Math.max(
      0,
      Math.min(1, this.state[id].fx.amount)
    )
    this.state[id].fx.beats = Math.max(
      0.25,
      Math.min(2, this.state[id].fx.beats)
    )
    if (this.automation)
      this.automation.overrides[id].fx = { ...this.state[id].fx }
    this.applyFX(id)
    this.publish()
  }
  echoOut(id: DeckId) {
    const ch = this.channels[id],
      deck = this.state[id]
    if (!ch || !deck.playing) return
    this.cancelAuto()
    if (ch.echoOutTimer) clearTimeout(ch.echoOutTimer)
    this.setFX(id, {
      type: "echo",
      enabled: true,
      amount: Math.max(0.5, deck.fx.amount),
    })
    this.state[id].echoOut = true
    ch.echoOutTimer = setTimeout(
      () => {
        this.pause(id)
        this.setFX(id, { enabled: false })
      },
      echoDelay(
        deck.track?.bpm ?? null,
        effectiveDeckRate(deck),
        deck.fx.beats
      ) * 1000
    )
    this.publish()
  }
  setBeatgrid(id: DeckId, bpm: number, offset: number) {
    const track = this.state[id].track
    if (
      !track ||
      !Number.isFinite(bpm) ||
      bpm < 40 ||
      bpm > 300 ||
      !Number.isFinite(offset)
    )
      return
    this.cancelAuto()
    this.state.A.syncTo = null
    this.state.B.syncTo = null
    const corrected: Track = {
      ...track,
      bpm,
      grid: {
        bpm,
        offset: Math.max(0, Math.min(track.duration, offset)),
        originalBpm: track.grid ? track.grid.originalBpm : track.bpm,
      },
    }
    this.trackGrids.set(linkedFingerprint(track), corrected.grid)
    for (const deckId of ["A", "B"] as DeckId[]) {
      if (this.state[deckId].track?.id !== track.id) continue
      this.loop(deckId, null)
      this.state[deckId].track = corrected
      this.applyFX(deckId)
    }
    this.onAnalysis?.(corrected)
    this.publish()
  }
  resetBeatgrid(id: DeckId) {
    const track = this.state[id].track
    if (!track?.grid) return
    this.state.A.syncTo = null
    this.state.B.syncTo = null
    const corrected = {
      ...track,
      bpm: track.grid.originalBpm ?? track.analysis?.bpm ?? null,
      grid: undefined,
    }
    this.trackGrids.set(linkedFingerprint(track), undefined)
    for (const deckId of ["A", "B"] as DeckId[]) {
      if (this.state[deckId].track?.id !== track.id) continue
      this.loop(deckId, null)
      this.state[deckId].track = corrected
      this.applyFX(deckId)
    }
    this.onAnalysis?.(corrected)
    this.publish()
  }
  setQuantize(id: DeckId, enabled: boolean) {
    this.state[id].quantize = enabled
    this.onQuantizeChange?.(id, enabled)
    this.publish()
  }
  setSlip(id: DeckId, enabled: boolean) {
    if (!enabled && this.channels[id]?.slipAnchor) this.loop(id, null)
    this.state[id].slip = enabled
    this.publish()
  }
  private slipPosition(id: DeckId) {
    const anchor = this.channels[id]?.slipAnchor
    if (!anchor || !this.context) return null
    return Math.min(
      this.state[id].track?.duration ?? 0,
      anchor.position + (this.context.currentTime - anchor.time) * anchor.rate
    )
  }
  beatjump(id: DeckId, beats: number) {
    const deck = this.state[id]
    if (!deck.track?.bpm) return
    const position = deck.quantize
      ? snapToBeat(deck.track, this.position(id))
      : this.position(id)
    this.seek(id, position + (beats * 60) / deck.track.bpm)
  }
  private applyMix() {
    for (const id of ["A", "B"] as DeckId[]) {
      const ch = this.channels[id]
      if (ch) this.writeParam(ch.gain.gain, deckMixGain(this.state, id))
      if (ch) this.applyBass(id)
    }
  }
  private applyBass(id: DeckId) {
    const ch = this.channels[id]
    if (!ch) return
    const faded = id === "A" ? this.state.crossfade : 1 - this.state.crossfade
    this.writeParam(
      ch.low.gain,
      this.state[id].low -
        (this.state.controller.smartFader ? Math.max(0, faded * 2 - 1) * 12 : 0)
    )
  }
  setHardwareConnected(connected: boolean) {
    this.hardwareLocked = connected
    if (connected) this.cancelAuto()
    if (!connected)
      for (const id of ["A", "B"] as DeckId[]) {
        this.releasePadFX(id)
        this.state[id].shiftPressed = false
        this.state[id].jogTouched = false
        this.state[id].loopAdjust = null
        const ch = this.channels[id]
        ch?.scrubSource?.stop()
        ch?.scratch?.port.postMessage({ type: "stop" })
        if (ch) ch.scrubSource = undefined
        if (ch?.scratchResume) {
          ch.scratchResume = false
          this.resumeFromHand(id)
        }
        if (ch?.reversed) this.reverse(id, false)
      }
    this.applyMix()
    for (const id of ["A", "B"] as DeckId[]) this.applyChannel(id)
    if (this.masterNode)
      this.writeParam(this.masterNode.gain, this.state.master)
    this.publish()
  }
  resetChannel(id: DeckId) {
    this.cancelAuto()
    for (const band of ["trim", "low", "mid", "high", "filter"] as const)
      this.setParam(id, band, 0)
    this.setParam(id, "volume", 0.8)
    this.setMaster(0.7)
    this.setCrossfade(id === "A" ? 0 : 1)
  }
  jog(id: DeckId, delta: number) {
    if (!delta) return
    this.state[id].syncTo = null
    const ch = this.channels[id],
      deck = this.state[id]
    if (!ch) return
    if (deck.loop && deck.loopAdjust && deck.track?.bpm) {
      const start = ch.loopIn ?? 0,
        end = start + (deck.loop * 60) / deck.track.bpm
      const adjusted =
        deck.loopAdjust === "in"
          ? Math.max(0, Math.min(end - 0.02, start + delta * 0.005))
          : Math.max(
              start + 0.02,
              Math.min(deck.track.duration, end + delta * 0.005)
            )
      ch.loopIn = deck.loopAdjust === "in" ? adjusted : start
      this.loop(
        id,
        (((deck.loopAdjust === "in" ? end : adjusted) - ch.loopIn) *
          deck.track.bpm) /
          60
      )
      return
    }
    if (!deck.playing) {
      if (deck.jogTouched) {
        this.state[id === "A" ? "B" : "A"].syncTo = null
        deck.position = Math.max(
          0,
          Math.min(
            deck.track?.duration ?? 0,
            deck.position + delta * SCRATCH_SECONDS_PER_TICK
          )
        )
        this.previewJog(id, delta)
        this.publish()
        return
      }
      this.seek(id, deck.position + delta * 0.025)
      return
    }
    // Bend the existing source; do not stop/recreate it on each jog message.
    if (ch.nudgeTimer) clearTimeout(ch.nudgeTimer)
    if (this.context) {
      ch.startOffset = this.position(id)
      ch.startTime = this.context.currentTime
    }
    if (ch.source)
      ch.source.playbackRate.value =
        deck.rate * (1 + Math.max(-0.04, Math.min(0.04, delta * 0.002)))
    this.refreshPitch(id)
    ch.nudgeTimer = setTimeout(() => {
      if (this.context) {
        ch.startOffset = this.position(id)
        ch.startTime = this.context.currentTime
      }
      if (ch.source) ch.source.playbackRate.value = this.state[id].rate
      this.refreshPitch(id)
      ch.nudgeTimer = undefined
    }, 120)
  }
  private previewJog(id: DeckId, delta: number) {
    const ch = this.channels[id],
      ctx = this.context
    if (ch?.scratch && ctx) {
      this.feedScratch(id, this.state[id].position)
      ch.scratch.port.postMessage({
        type: "move",
        position: this.state[id].position,
        delta: delta * SCRATCH_SECONDS_PER_TICK,
        time: ctx.currentTime,
      })
      return
    }
    if (
      !ch?.buffer ||
      !ctx ||
      ctx.currentTime - (ch.lastScrubTime ?? -1) < 0.02
    )
      return
    ch.lastScrubTime = ctx.currentTime
    // Short grains cap audio graph work at 50/sec even during a MIDI burst.
    // Copy only the grain for backwards movement, never a complete track.
    const offset = Math.floor(this.state[id].position * ch.buffer.sampleRate)
    const length = Math.min(
      ch.buffer.length - offset,
      Math.ceil(ch.buffer.sampleRate * 0.06)
    )
    if (length <= 0) return
    const grain = ctx.createBuffer(
      ch.buffer.numberOfChannels,
      length,
      ch.buffer.sampleRate
    )
    for (let channel = 0; channel < grain.numberOfChannels; channel++) {
      const input = ch.buffer.getChannelData(channel),
        output = grain.getChannelData(channel)
      for (let i = 0; i < length; i++) {
        const edge = Math.min(
          1,
          i / (grain.sampleRate * 0.003),
          (length - 1 - i) / (grain.sampleRate * 0.003)
        )
        output[i] = input[offset + (delta < 0 ? length - i - 1 : i)] * edge
      }
    }
    ch.scrubSource?.stop()
    const source = ctx.createBufferSource()
    source.buffer = grain
    source.playbackRate.value = Math.max(
      0.25,
      Math.min(3, Math.abs(delta) * 0.4)
    )
    source.connect(ch.inputAnalyser)
    ch.scrubSource = source
    source.onended = () => {
      source.disconnect()
      if (ch.scrubSource === source) ch.scrubSource = undefined
    }
    source.start()
  }
  private async prepareScratch(id: DeckId, version: number) {
    const ctx = this.context!,
      ch = this.channels[id]!
    try {
      await registerScratch(ctx)
      if (ch.loadVersion !== version || ctx.state === "closed") return
      ch.scratch = createScratchNode(ctx)
      ch.scratch.connect(ch.inputAnalyser)
      ch.scratchSpan = undefined
    } catch {
      // Older browsers retain the bounded short-grain scrub fallback.
    }
  }
  /**
   * Keep the scratch tape holding the audio around `position`: on a new
   * touch (`fresh`), or when a long scratch nears the window's edge.
   */
  private feedScratch(id: DeckId, position: number, fresh = false) {
    const ch = this.channels[id],
      deck = this.state[id]
    if (!ch?.scratch || !ch.buffer) return
    const span = ch.scratchSpan,
      margin = SCRATCH_REACH / 4
    const inside =
      span &&
      (position - span[0] > margin || span[0] <= 0) &&
      (span[1] - position > margin || span[1] >= ch.buffer.duration - 0.01)
    if (!fresh && inside) return
    ch.scratchSpan = sendScratchWindow(
      ch.scratch,
      ch.buffer,
      position,
      ch.stemBuffer && ch.stemMatrix && deck.stems
        ? {
            buffer: ch.stemBuffer,
            gains: deck.stems,
            layout: ch.stemMatrix.layout,
          }
        : undefined
    )
  }
  /** Let go of the record: the motor brings it back up to speed briefly. */
  private resumeFromHand(id: DeckId) {
    void this.play(id).then(() => {
      const ch = this.channels[id],
        ctx = this.context
      if (!ch?.source || !ctx || !this.state[id].playing) return
      const rate = ch.source.playbackRate.value,
        now = ctx.currentTime,
        spin = 0.06,
        from = 0.5
      ch.source.playbackRate.setValueAtTime(rate * from, now)
      ch.source.playbackRate.linearRampToValueAtTime(rate, now + spin)
      // The spin-up covers less ground than full speed would.
      ch.startTime += (spin * (1 - from)) / 2
    })
  }
  cueButton(id: DeckId, pressed: boolean) {
    const ch = this.channels[id]
    if (!ch) return
    if (!pressed) {
      if (ch.cuePreview) {
        ch.cuePreview = false
        this.cue(id)
      }
      return
    }
    if (this.state[id].playing) {
      this.cue(id)
      return
    }
    const deck = this.state[id]
    deck.cues[0] =
      deck.quantize && deck.track
        ? snapToBeat(deck.track, deck.position)
        : deck.position
    deck.cueLabels[0] = null
    this.saveCues(id)
    ch.cuePreview = true
    deck.position = deck.cues[0]
    void this.play(id, deck.position)
  }
  setLoopIn(id: DeckId) {
    const ch = this.channels[id]
    if (ch)
      ch.loopIn =
        this.state[id].quantize && this.state[id].track
          ? snapToBeat(this.state[id].track, this.position(id))
          : this.position(id)
  }
  setLoopOut(id: DeckId) {
    const ch = this.channels[id],
      bpm = this.state[id].track?.bpm
    if (!ch || ch.loopIn === undefined || !bpm) return
    const end =
      this.state[id].quantize && this.state[id].track
        ? snapToBeat(this.state[id].track, this.position(id))
        : this.position(id)
    const length = end - ch.loopIn
    if (length < 0.05) return
    this.loop(id, (length * bpm) / 60)
  }
  sync(id: DeckId) {
    this.cancelAuto()
    const other = id === "A" ? "B" : "A",
      master = this.state[other]
    let deck = this.state[id]
    if (
      !deck.track?.bpm ||
      !master.track?.bpm ||
      deck.loading ||
      master.loading ||
      !this.channels[id]?.buffer ||
      !this.channels[other]?.buffer
    ) {
      this.state.error = "Load and analyze both tracks before syncing."
      this.publish()
      return false
    }
    const rate = (master.track.bpm * effectiveDeckRate(master)) / deck.track.bpm
    if (rate < 0.84 || rate > 1.16) {
      this.state.error = "This tempo gap exceeds the ±16% range."
      this.publish()
      return false
    }
    if (
      (deck.loop !== null && deck.loop < 4) ||
      (master.loop !== null && master.loop < 4)
    ) {
      this.state.error = "Exit short loops before syncing the four-beat bar."
      this.publish()
      return false
    }
    master.syncTo = null // The pressed deck follows the other; never create a cycle.
    this.setParam(id, "rate", rate)
    deck = this.state[id]
    deck.syncTo = other
    const aligned = this.syncedPosition(
      id,
      this.position(id),
      this.context!.currentTime
    )
    if (aligned === null) {
      deck.syncTo = null
      this.state.error =
        "There is not enough room to align this bar. Exit the loop or move the playhead."
      this.publish()
      return false
    }
    const playing = deck.playing
    if (playing) this.pause(id)
    this.state[id].position = aligned
    this.state.error = null
    // Recompute against the audio clock after resume(), not the earlier UI click.
    if (playing) void this.play(id)
    this.publish()
    return true
  }
  releaseSync(id: DeckId) {
    this.state[id].syncTo = null
    this.publish()
  }
  private syncedPosition(id: DeckId, position: number, time: number) {
    const deck = this.state[id],
      master = deck.syncTo && this.state[deck.syncTo],
      ch = this.channels[id]
    if (!deck.track?.bpm || !master?.track?.bpm || !deck.syncTo) return null
    const beats =
      ((this.position(deck.syncTo, time) - beatOffset(master.track)) *
        master.track.bpm) /
      60
    return alignBarPhase(
      deck.track,
      position,
      beats,
      deck.loop ? (ch?.loopIn ?? position) : 0,
      deck.loop
        ? Math.min(
            deck.track.duration - 0.01,
            (ch?.loopIn ?? position) + (deck.loop * 60) / deck.track.bpm - 0.001
          )
        : deck.track.duration - 0.01
    )
  }
  loop(id: DeckId, beats: number | null) {
    this.cancelAuto()
    const deck = this.state[id],
      ch = this.channels[id]
    if (!deck.track?.bpm || !ch) return
    if (beats !== null && beats < 4) {
      this.state.A.syncTo = null
      this.state.B.syncTo = null
    }
    const position = this.position(id),
      resumePosition = this.slipPosition(id)
    if (beats !== null) {
      if (deck.slip && deck.playing && !ch.slipAnchor && this.context)
        ch.slipAnchor = {
          position,
          time: this.context.currentTime,
          rate: effectiveDeckRate(deck),
        }
      ch.loopIn ??= deck.quantize
        ? snapToBeat(deck.track, position, true)
        : position
      const end = Math.min(
        deck.track.duration,
        ch.loopIn + (beats * 60) / deck.track.bpm
      )
      if (end - ch.loopIn < 0.01) return
      deck.loop = beats
      if (ch.source) {
        ch.startOffset = position
        ch.startTime = this.context!.currentTime
        ch.source.loopStart = ch.loopIn
        ch.source.loopEnd = end
        ch.source.loop = true
      }
    } else {
      deck.loop = null
      ch.loopIn = undefined
      if (ch.source) {
        ch.startOffset = position
        ch.startTime = this.context!.currentTime
        ch.source.loop = false
      }
      ch.slipAnchor = undefined
      deck.slipPosition = null
      if (resumePosition !== null && deck.playing) this.seek(id, resumePosition)
    }
    this.publish()
  }
  async startAuto(out: DeckId, plan: Transition, now = false) {
    if (this.hardwareLocked) {
      this.state.error =
        "Automix is disabled while a MIDI controller is connected. Use the transition coach."
      this.publish()
      return
    }
    const incoming = out === "A" ? "B" : "A"
    if (
      !this.channels[out]?.buffer ||
      !this.channels[incoming]?.buffer ||
      !this.state[out].track ||
      !this.state[incoming].track
    ) {
      this.state.error = "Wait for both decks to finish loading."
      this.publish()
      return
    }
    // Recheck suitability after tempo edits or time spent browsing the assistant.
    const eligible = planTransitions(
      this.state[out].track,
      this.state[incoming].track,
      this.position(out),
      {
        outRate: this.plannedRate(out),
        incomingRate: this.state[incoming].rate,
        outCue: now ? null : plan.anchors?.out,
        inCue: plan.anchors?.incoming,
        pace: plan.pace,
        outKey: deckKey(this.state[out]),
        inKey: deckKey(this.state[incoming]),
      }
    ).find((p) => p.id === plan.id)
    if (
      !eligible ||
      !Number.isFinite(plan.duration) ||
      plan.duration <= 0 ||
      !Number.isFinite(plan.inStart)
    ) {
      this.state.error =
        "This routine no longer fits the loaded pair. Choose another transition."
      this.publish()
      return
    }
    this.cancelAuto()
    this.state.A.syncTo = null
    this.state.B.syncTo = null
    this.loop(out, null)
    this.loop(incoming, null)
    // The incoming deck is silent, so its glide can stop. The outgoing deck
    // is playing: its trim keeps gliding (the knob with it) and the mix
    // plans with the level it is settling to. Automix arms the next mix
    // within a second of the last, so landing the glide here made the knob
    // jump.
    delete this.trimGlides[incoming]
    const original = Object.fromEntries(
      (["A", "B"] as DeckId[]).map((id) => [
        id,
        {
          trim: this.trimGlides[id]?.to ?? this.state[id].trim,
          mid: this.state[id].mid,
          high: this.state[id].high,
          low: this.state[id].low,
          filter: this.state[id].filter,
          fx: { ...this.state[id].fx },
          rate: this.state[id].rate,
          volume: this.state[id].volume,
        },
      ])
    ) as NonNullable<typeof this.automation>["original"]
    delete this.tempoGlides[incoming]
    this.setParam(incoming, "rate", eligible.incomingRate)
    this.pause(incoming)
    const duration = Math.min(plan.duration, eligible.duration)
    const safePlan = {
      ...eligible,
      ...plan,
      duration,
      execution: eligible.execution,
      incomingRate: eligible.incomingRate,
      rate: eligible.rate,
      bars:
        plan.execution === "cut"
          ? 0
          : Math.round(
              ((duration * (this.state[out].track.bpm ?? 120)) / 240) * 10
            ) / 10,
      inStart: Math.max(
        0,
        Math.min(
          plan.inStart,
          this.state[incoming].track.duration - duration * eligible.rate - 0.02
        )
      ),
    }
    safePlan.outStart = now ? this.position(out) : eligible.outStart
    this.seek(incoming, safePlan.inStart)
    safePlan.bassSwapAt = ["bass", "long", "filter", "loop"].includes(
      safePlan.execution
    )
      ? bassExchangeAt(
          safePlan.outStart,
          duration,
          this.state[out].track.bpm ?? 120,
          beatOffset(this.state[out].track),
          safePlan.execution === "long"
        )
      : undefined
    safePlan.steps = transitionSteps(safePlan.execution, safePlan.bassSwapAt)
    const outVolume =
      this.state[out].volume <= 0.000001 ? 0.8 : deckMixGain(this.state, out)
    const levels = matchLoudness(
      this.channels[out].buffer,
      this.channels[incoming].buffer,
      safePlan,
      { out: original[out], incoming: original[incoming] },
      outVolume
    )
    pushLeveler(
      levelerRecord(
        levelerContext(),
        safePlan,
        { out: this.state[out].track, in: this.state[incoming].track },
        { out: original[out].trim, in: original[incoming].trim },
        {
          out:
            sectionAt(this.state[out].track, safePlan.outStart)?.label ?? null,
          in:
            sectionAt(this.state[incoming].track, safePlan.inStart)?.label ??
            null,
        },
        levels
      )
    )
    this.state.channelMix = true
    this.state.crossfade = 0.5
    this.state[out].volume = levels.outVolume
    this.state[incoming].volume = 0
    // The outgoing deck is playing: its headroom trim waits for the
    // transition and eases in over the first bar (see controlsAt). The
    // incoming deck is silent, so its matched trim can apply now.
    this.state[incoming].trim = levels.inTrim
    this.state.autoLevels = levels.message
    this.state.autoHeadroom = levels.headroomDb
    this.applyChannel(out)
    this.applyChannel(incoming)
    this.applyMix()
    const auto = (this.automation = {
      out,
      incoming,
      plan: safePlan,
      duration: duration / this.state[out].rate,
      start: safePlan.outStart,
      started: false,
      preparing: false,
      original,
      overrides: { A: {}, B: {} },
      levels,
    })
    this.state.auto = true
    this.state.autoOut = out
    this.state.autoPlan = safePlan
    this.state.autoStatus = now
      ? "Starting transition…"
      : "Waiting for the exit zone"
    this.state.transition = 0
    await this.play(out)
    if (this.automation !== auto) return
    if (!this.state[out].playing) this.cancelAuto()
    this.publish()
  }
  private noise?: AudioBuffer
  /**
   * Put the transition's Auto-FX cues on the audio clock. `startTime` is the
   * context time of the transition start (the outgoing track's outStart).
   */
  private scheduleFX(
    auto: NonNullable<typeof this.automation>,
    startTime: number
  ) {
    auto.fxScheduled = true
    const ctx = this.context
    const cues = auto.plan.fx ?? []
    if (!ctx || !cues.length) return
    const now = ctx.currentTime,
      rate = this.plannedRate(auto.out),
      track = this.state[auto.out].track
    auto.fxSources = []
    for (const cue of cues) {
      const id = cue.deck === "out" ? auto.out : auto.incoming,
        ch = this.channels[id]
      if (!ch?.rack || !track) continue
      let t0 = startTime + cue.at / rate,
        length = cue.length / rate
      // A cue that has already begun keeps only its remaining part.
      if (t0 + length <= now + 0.02) continue
      if (t0 < now + 0.02) {
        length -= now + 0.02 - t0
        t0 = now + 0.02
      }
      auto.fxSources.push(
        ...scheduleCue(ctx, ch.rack, cue, {
          t0,
          length,
          rate,
          bpm: track.bpm ?? 120,
          position: snapToBeat(
            track,
            Math.max(0, auto.plan.outStart + cue.at),
            true
          ),
          buffer: cue.deck === "out" ? ch.buffer : undefined,
          overlayInput: ch.inputAnalyser,
          master: this.masterNode!,
          noise: () => (this.noise ??= noiseBuffer(ctx)),
          vocalTap: this.state[id].stems ? ch.stemMatrix?.vocalTap : undefined,
        })
      )
    }
  }
  private controlsAt(
    auto: NonNullable<typeof this.automation>,
    id: DeckId,
    progress: number
  ) {
    const outgoing = id === auto.out
    const controls = automationControls(
      auto.plan,
      progress,
      auto.original[id],
      outgoing,
      outgoing ? auto.levels.outVolume : auto.levels.inVolume,
      // Overlap headroom follows the faders (see matchLoudness): mostly on
      // the outgoing deck, ramping in from nothing while it plays.
      (outgoing ? auto.original[id].trim : auto.levels.settledInTrim) -
        curveAt(outgoing ? auto.levels.outCut : auto.levels.inCut, progress)
    )
    // Existing manual FX and knobs touched during this transition belong to
    // the person. Automation continues to own the untouched controls.
    if (auto.original[id].fx.enabled) controls.fx = auto.original[id].fx
    return { ...controls, ...auto.overrides[id] }
  }
  private releaseAutomationControl(id: DeckId, key: keyof AutomationChannel) {
    const auto = this.automation,
      ch = this.channels[id],
      ctx = this.context
    if (!auto || !ch || !ctx) return
    const controls = this.controlsAt(
      auto,
      id,
      auto.started
        ? Math.max(
            0,
            Math.min(1, (ctx.currentTime - auto.start) / auto.duration)
          )
        : 0
    )
    Object.assign(this.state[id], controls)
    const params =
      key === "fx"
        ? [ch.echoSend.gain, ch.reverbSend.gain, ch.delay.delayTime]
        : key === "filter"
          ? [ch.filter.frequency]
          : key === "trim"
            ? [ch.trim.gain]
            : key === "low" || key === "mid" || key === "high"
              ? [ch[key].gain]
              : []
    for (const param of params) param.cancelScheduledValues(ctx.currentTime)
    // A hand on the filter, FX or fader also takes it back from Auto-FX.
    if (ch.rack && (key === "filter" || key === "fx" || key === "volume"))
      resetRack(ch.rack, ctx.currentTime, key)
    Object.assign(auto.overrides[id], { [key]: controls[key] })
  }
  private restoreAutomation(
    auto: NonNullable<typeof this.automation>,
    cancelled: boolean
  ) {
    const progress =
      auto.started && this.context
        ? Math.max(
            0,
            Math.min(1, (this.context.currentTime - auto.start) / auto.duration)
          )
        : 0
    // Stem routines end with every stem back up on both decks.
    for (const id of [auto.out, auto.incoming]) {
      const matrix = this.channels[id]?.stemMatrix
      if (!matrix || !this.state[id].stems || !this.context) continue
      if (!auto.plan.stemMoves?.length || auto.stemsTouched?.has(id)) continue
      this.state[id].stems = { ...allStemsOn }
      setStemGains(matrix, allStemsOn, this.context.currentTime)
    }
    // Auto-FX: a cancelled mix stops everything now; a finished one keeps
    // its echo and reverb tails ringing.
    for (const source of auto.fxSources ?? [])
      try {
        if (cancelled) source.stop()
      } catch {
        /* Already stopped. */
      }
    for (const id of [auto.out, auto.incoming]) {
      const rack = this.channels[id]?.rack
      if (!rack || !this.context || !auto.fxScheduled) continue
      if (cancelled) {
        resetRack(rack, this.context.currentTime)
        const tap = this.channels[id]?.stemMatrix?.vocalTap.gain
        tap?.cancelScheduledValues(this.context.currentTime)
        tap?.setValueAtTime(0, this.context.currentTime)
      } else {
        resetRack(rack, this.context.currentTime, "volume")
        resetRack(rack, this.context.currentTime, "filter")
      }
    }
    for (const id of [auto.out, auto.incoming]) {
      const ch = this.channels[id]!,
        deck = this.state[id],
        saved = auto.original[id]
      // Hold the current values before clearing future curves. This also works between UI ticks.
      for (const param of [
        ch.gain.gain,
        ch.trim.gain,
        ch.low.gain,
        ch.mid.gain,
        ch.high.gain,
        ch.filter.frequency,
        ch.echoSend.gain,
        ch.reverbSend.gain,
        ch.delay.delayTime,
      ])
        param.cancelScheduledValues(this.context!.currentTime)
      if (cancelled && auto.started) {
        Object.assign(deck, this.controlsAt(auto, id, progress), {
          fx: { ...saved.fx },
        })
      } else {
        Object.assign(deck, saved, {
          volume:
            id === auto.out
              ? cancelled
                ? saved.volume <= 0.000001
                  ? saved.volume
                  : auto.levels.outVolume
                : 0
              : cancelled
                ? saved.volume
                : auto.levels.inVolume,
          // The incoming trim glides to its settled level (below), and the
          // knob follows it instead of jumping.
          trim: cancelled
            ? saved.trim
            : id === auto.out
              ? saved.trim
              : deck.trim,
          rate: cancelled ? saved.rate : deck.rate,
        })
      }
      Object.assign(deck, auto.overrides[id])
      if (cancelled && auto.started) {
        const time = this.context!.currentTime
        ch.gain.gain.setValueAtTime(deck.volume, time)
        ch.trim.gain.setValueAtTime(10 ** (deck.trim / 20), time)
        for (const band of ["low", "mid", "high"] as const)
          ch[band].gain.setValueAtTime(deck[band], time)
        ch.filter.frequency.setValueAtTime(
          deck.filter > 0
            ? 30 * 500 ** deck.filter
            : 22000 * 0.002 ** Math.abs(deck.filter),
          time
        )
      }
      this.applyChannel(id)
      // Give back the overlap headroom slowly so the level doesn't jump.
      if (
        !cancelled &&
        id === auto.incoming &&
        this.context &&
        !("trim" in auto.overrides[id])
      ) {
        const now = this.context.currentTime,
          param = ch.trim.gain
        param.cancelScheduledValues(now)
        // Settles over about four seconds; the knob follows (tick).
        param.setTargetAtTime(10 ** (auto.levels.settledInTrim / 20), now, 1.3)
        this.trimGlides[id] = {
          from: deck.trim,
          to: auto.levels.settledInTrim,
          start: now,
          tau: 1.3,
        }
      }
    }
    if (auto.plan.execution === "loop") {
      const ch = this.channels[auto.out]!,
        position = this.position(auto.out)
      this.state[auto.out].loop = null
      ch.loopIn = undefined
      if (ch.source) {
        ch.startOffset = position
        ch.startTime = this.context!.currentTime
        ch.source.loop = false
      }
    }
    // Cancellation returns tempo control to the person; never restores two open faders.
    if (cancelled)
      this.setParam(auto.incoming, "rate", auto.original[auto.incoming].rate)
    this.applyMix()
  }
  cancelAuto() {
    this.onAutoCancel?.()
    this.automationEpoch++
    const auto = this.automation
    this.automation = undefined
    this.state.auto = false
    this.state.autoOut = null
    this.state.autoPlan = null
    this.state.transition = 0
    this.state.autoStatus = "Ready when you are"
    // A cancelled mix no longer needs the outgoing deck at the next tempo:
    // hold it where the ramp reached.
    if (auto?.rampStarted) delete this.tempoGlides[auto.out]
    if (auto) {
      const ch = this.channels[auto.incoming]
      if (
        ch &&
        this.context &&
        (ch.startTime > this.context.currentTime ||
          (!auto.started && auto.preparing))
      )
        this.pause(auto.incoming)
      this.restoreAutomation(auto, true)
      this.publish()
    }
  }
  centerChannelMix(out: DeckId) {
    // Preserve the current audible level when converting the previous crossfader curve.
    const level =
      this.state[out].volume <= 0.000001 ? 0.8 : deckMixGain(this.state, out)
    this.state.channelMix = true
    this.state.crossfade = 0.5
    this.state[out].volume = level
    this.state[out === "A" ? "B" : "A"].volume = 0
    this.applyMix()
    this.publish()
  }
  private async beginAutomation(auto: NonNullable<typeof this.automation>) {
    auto.preparing = true
    // Land any glide (tempo return or planned ramp) and keep the outgoing
    // deck at that tempo: the plan was beatmatched against it.
    this.finishTempoReturn(auto.out)
    auto.original[auto.out].rate = this.state[auto.out].rate
    // A trim glide from the last mix has settled by now; the transition's
    // own trim curve takes over from its target.
    const glide = this.trimGlides[auto.out]
    if (glide) {
      this.state[auto.out].trim = glide.to
      delete this.trimGlides[auto.out]
    }
    const ctx = this.context!
    await ctx.resume()
    if (this.automation !== auto) return
    const until = Math.max(
      0,
      (auto.start - this.position(auto.out)) / this.state[auto.out].rate
    )
    const start = ctx.currentTime + Math.max(0.03, until)
    const initial = automationFrame(auto.plan, 0)
    if (
      auto.plan.beatmatch &&
      auto.plan.anchors?.incoming == null &&
      auto.plan.anchors?.out == null
    ) {
      const track = this.state[auto.out].track!,
        beat = 60 / track.bpm!
      const projected =
        this.position(auto.out) +
        (start - ctx.currentTime) * this.state[auto.out].rate
      let phase = (((projected - beatOffset(track)) % beat) + beat) % beat
      if (phase < 0.000001 || beat - phase < 0.000001) phase = 0
      // Compensate scheduling lead time so the beat phase matches the audible outgoing source.
      const correction = phase * auto.plan.rate
      if (
        auto.plan.inStart + correction + auto.plan.duration * auto.plan.rate <
        this.state[auto.incoming].track!.duration
      )
        auto.plan.inStart += correction
    }
    Object.assign(
      this.state[auto.incoming],
      this.controlsAt(auto, auto.incoming, 0)
    )
    this.applyChannel(auto.incoming)
    await this.play(
      auto.incoming,
      auto.plan.inStart,
      start + initial.incomingDelay * auto.duration
    )
    if (this.automation !== auto) {
      // pause()/load() versions already invalidate an in-flight resume.
      return
    }
    if (!this.state[auto.incoming].playing) {
      this.cancelAuto()
      return
    }
    if (auto.plan.execution === "loop") {
      const ch = this.channels[auto.out]!,
        deck = this.state[auto.out],
        beat = 60 / deck.track!.bpm!
      ch.loopIn = snapToBeat(deck.track!, auto.plan.outStart, true)
      // 'Mix now' loops the current bar, not a distant suggested exit.
      if (Math.abs(this.position(auto.out) - ch.loopIn) > beat * 4)
        ch.loopIn = snapToBeat(deck.track!, this.position(auto.out), true)
      ch.source!.loopStart = ch.loopIn
      ch.source!.loopEnd = Math.min(deck.track!.duration, ch.loopIn + beat * 4)
      ch.source!.loop = true
      deck.loop = 4
    }
    auto.start = start
    auto.started = true
    if (!auto.fxScheduled) this.scheduleFX(auto, start)
    // Web Audio clock schedules the audible curves; the 50ms UI tick only reflects them.
    const schedule = (param: AudioParam, value: (p: number) => number) => {
      // Cancel only what lies after now so a value set this instant (the
      // filter's starting frequency) holds until the curve begins.
      param.cancelScheduledValues(ctx.currentTime + 0.001)
      param.setValueAtTime(value(0), start)
      param.setValueCurveAtTime(
        Float32Array.from({ length: 257 }, (_, i) => value(i / 256)),
        start,
        auto.duration
      )
      // A value curve holds its final sample. A redundant endpoint event can
      // overlap a render-quantum-aligned curve in WebKit on long transitions.
    }
    for (const id of [auto.out, auto.incoming]) {
      const outgoing = id === auto.out,
        ch = this.channels[id]!
      const controls = (p: number) => this.controlsAt(auto, id, p)
      schedule(ch.gain.gain, (p) => controls(p).volume)
      // Trim: the incoming match applied while it was silent; each deck's
      // headroom follows its curve.
      if (!("trim" in auto.overrides[id]))
        schedule(ch.trim.gain, (p) => 10 ** (controls(p).trim / 20))
      for (const band of ["low", "mid", "high"] as const)
        if (!(band in auto.overrides[id]))
          schedule(ch[band].gain, (p) => controls(p)[band])
      if (
        outgoing &&
        !("filter" in auto.overrides[id]) &&
        ["filter", "echo", "reverb"].includes(auto.plan.execution)
      ) {
        // Move the frequency with the type: a high-pass left at the
        // low-pass's open 22 kHz muted the deck until the curve began, then
        // the jump to 30 Hz burst out above 0 dBFS.
        const open = 30 * 500 ** controls(0).filter
        ch.filter.frequency.cancelScheduledValues(ctx.currentTime)
        ch.filter.frequency.setValueAtTime(open, ctx.currentTime)
        ch.filter.type = "highpass"
        schedule(ch.filter.frequency, (p) => 30 * 500 ** controls(p).filter)
      }
      // The outgoing source feeds the tail while its dry gain falls. Incoming FX stay off.
      for (const [type, param] of [
        ["echo", ch.echoSend.gain],
        ["reverb", ch.reverbSend.gain],
      ] as const)
        schedule(param, (p) =>
          controls(p).fx.enabled && controls(p).fx.type === type
            ? controls(p).fx.amount * 0.65
            : 0
        )
      ch.delay.delayTime.cancelScheduledValues(ctx.currentTime)
      ch.delay.delayTime.setValueAtTime(
        echoDelay(
          this.state[id].track?.bpm ?? null,
          this.state[id].rate,
          controls(0).fx.beats
        ),
        start
      )
    }
    // Stem routines: each stem weight follows the plan's stem moves.
    for (const [id, role] of [
      [auto.out, "out"],
      [auto.incoming, "in"],
    ] as const) {
      const matrix = this.channels[id]?.stemMatrix
      if (!matrix || !this.state[id].stems) continue
      if (!auto.plan.stemMoves?.some((move) => move.deck === role)) continue
      for (const key of ["original", "vocals", "drums", "bass"] as const)
        for (const node of matrix.weights[key])
          schedule(
            node.gain,
            (p) =>
              matrixWeights(
                stemGainsAt(auto.plan, role, p) ?? allStemsOn,
                matrix.layout
              )[key]
          )
    }
    this.publish()
  }
  private tick() {
    if (!this.context) return
    // Advance both glides every tick: with "||" a running tempo return
    // skipped the trim glide, freezing the knob until the next mix.
    const tempoMoved = this.advanceTempoGlides(),
      trimMoved = this.advanceTrimGlides()
    let changed = tempoMoved || trimMoved || !!this.automation
    for (const id of ["A", "B"] as DeckId[]) {
      const deck = this.state[id],
        ch = this.channels[id],
        position = this.position(id),
        slipPosition = this.slipPosition(id)
      const inputMeter = ch ? readMeter(ch.inputAnalyser, ch.inputSamples) : 0
      const meter = ch ? readMeter(ch.analyser, ch.meterSamples) : 0
      changed ||=
        position !== deck.position ||
        slipPosition !== deck.slipPosition ||
        meter !== deck.meter ||
        inputMeter !== deck.inputMeter
      deck.position = position
      deck.slipPosition = slipPosition
      deck.meter = meter
      deck.inputMeter = inputMeter
    }
    const auto = this.automation
    // Tempo journey: ride the outgoing deck toward the next track's tempo so
    // the blend starts beatmatched without jumping the pitch at once.
    const ramp = auto?.plan.tempoRamp
    if (
      auto &&
      ramp &&
      !auto.started &&
      !auto.rampStarted &&
      this.state[auto.out].position >= ramp.start
    ) {
      auto.rampStarted = true
      const deck = this.state[auto.out]
      const averageRate = (deck.rate + ramp.to) / 2
      this.tempoGlides[auto.out] = {
        from: deck.rate,
        to: ramp.to,
        start: this.context.currentTime,
        duration: Math.max(
          1,
          ((auto.start - deck.position) / averageRate) * 0.95
        ),
      }
    }
    // Auto-FX builds start before the transition: schedule them from the
    // outgoing position once their lead-in begins.
    const lead = auto?.plan.fx?.length
      ? Math.max(0, ...auto.plan.fx.map((cue) => -cue.at))
      : 0
    if (
      auto &&
      lead > 0 &&
      !auto.fxScheduled &&
      !auto.started &&
      this.state[auto.out].playing &&
      this.state[auto.out].position >=
        auto.plan.outStart - lead - this.state[auto.out].rate * 0.25
    )
      this.scheduleFX(
        auto,
        this.context.currentTime +
          (auto.plan.outStart - this.position(auto.out)) /
            this.state[auto.out].rate
      )
    if (
      auto &&
      !auto.started &&
      !auto.preparing &&
      this.state[auto.out].position >=
        auto.start - this.state[auto.out].rate * 0.15
    ) {
      void this.beginAutomation(auto).catch((error) => {
        if (this.automation === auto) {
          this.cancelAuto()
          this.state.error = `Transition could not start: ${error instanceof Error ? error.message : String(error)}`
          this.publish()
        }
      })
    }
    if (auto?.started && this.context.currentTime >= auto.start) {
      const progress = Math.min(
        1,
        Math.max(0, (this.context.currentTime - auto.start) / auto.duration)
      )
      const frame = automationFrame(auto.plan, progress)
      this.state.transition = progress
      this.state.crossfade = 0.5
      this.state.autoStatus = `${frame.phase} · ${Math.round(progress * 100)}%`
      for (const id of [auto.out, auto.incoming])
        Object.assign(this.state[id], this.controlsAt(auto, id, progress))
      for (const [id, role] of [
        [auto.out, "out"],
        [auto.incoming, "in"],
      ] as const) {
        const gains = stemGainsAt(auto.plan, role, progress)
        if (gains && this.state[id].stems && !auto.stemsTouched?.has(id))
          this.state[id].stems = gains
      }
      if (progress >= 1) {
        this.automation = undefined
        this.state.auto = false
        this.state.autoOut = null
        this.state.autoPlan = null
        this.pause(auto.out)
        this.restoreAutomation(auto, false)
        this.state.autoStatus = "Transition complete"
        this.startTempoReturn(auto.incoming)
        this.onTransition?.(auto.plan.id, primaryFX(auto.plan.fx), {
          out: this.state[auto.out].track?.id ?? "",
          incoming: this.state[auto.incoming].track?.id ?? "",
          name: auto.plan.name,
          genre: auto.plan.genre,
        })
        const next = this.state[auto.incoming].track
        if (this.state.recording && next)
          this.setLog.push({
            // The new track takes over halfway through the transition.
            at: Math.max(
              0,
              auto.start + auto.duration / 2 - this.recordingStartedAt
            ),
            title: next.title,
            artist: next.artist,
            transition: [auto.plan.name, describeFX(auto.plan.fx)]
              .filter(Boolean)
              .join(" + "),
          })
        this.onHandoff?.(auto.out, auto.incoming)
      }
    }
    if (changed) this.publish()
  }
  /**
   * Render a planned transition offline and play it: in the headphones when
   * a cue output is connected, otherwise on the master while both decks are
   * stopped (it never plays over a live mix).
   */
  async previewTransition(out: DeckId, plan: Transition) {
    const ctx = this.init(),
      incoming = out === "A" ? "B" : "A"
    const a = this.channels[out]?.buffer,
      b = this.channels[incoming]?.buffer
    if (!a || !b) {
      this.state.error = "Load both decks to preview the transition."
      this.publish()
      return
    }
    const headphones = this.state.controller.monitorConnected
    if (!headphones && (this.state.A.playing || this.state.B.playing)) {
      this.state.error =
        "Connect a headphone (cue) output to preview while a deck is playing."
      this.publish()
      return
    }
    this.stopPreview()
    const version = ++this.previewVersion
    this.state.previewing = true
    this.publish()
    try {
      const rendered = await renderTransition(
        plan,
        {
          buffer: a,
          bpm: this.state[out].track?.bpm ?? null,
          rate: this.plannedRate(out),
        },
        {
          buffer: b,
          bpm: this.state[incoming].track?.bpm ?? null,
          rate: plan.incomingRate,
        },
        ctx.sampleRate
      )
      // Stopped or replaced while rendering.
      if (version !== this.previewVersion) return
      await ctx.resume()
      const source = (this.previewSource = ctx.createBufferSource())
      source.buffer = rendered
      source.connect(headphones ? this.monitorLevel! : this.masterNode!)
      source.onended = () => {
        if (this.previewSource !== source) return
        this.previewSource = undefined
        this.state.previewing = false
        this.publish()
      }
      source.start()
    } catch (error) {
      this.state.previewing = false
      this.state.error = `Preview could not render: ${error instanceof Error ? error.message : String(error)}`
      this.publish()
    }
  }
  stopPreview() {
    this.previewVersion++
    const source = this.previewSource
    this.previewSource = undefined
    try {
      source?.stop()
    } catch {
      /* Not started yet. */
    }
    if (this.state.previewing) {
      this.state.previewing = false
      this.publish()
    }
  }
  async toggleRecording() {
    const ctx = this.init()
    await ctx.resume()
    if (this.recorder?.state === "recording") {
      this.recorder.stop()
      this.state.recording = false
      this.publish()
      return
    }
    if (!("MediaRecorder" in window)) {
      this.state.error = "Mix recording is not supported in this browser."
      this.publish()
      return
    }
    const chunks: Blob[] = []
    const recorder = (this.recorder = new MediaRecorder(
      this.recordNode!.stream
    ))
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    recorder.onstop = () => {
      const mime = recorder.mimeType,
        extension = mime.includes("mp4")
          ? "m4a"
          : mime.includes("ogg")
            ? "ogg"
            : "webm"
      if (this.state.lastRecording)
        URL.revokeObjectURL(this.state.lastRecording.url)
      const blob = new Blob(chunks, { type: mime })
      const base = `cue-mix-${new Date().toISOString().slice(0, 10)}`
      this.state.lastRecording = {
        url: URL.createObjectURL(blob),
        name: `${base}.${extension}`,
      }
      if (this.state.lastTracklist) {
        URL.revokeObjectURL(this.state.lastTracklist.txt)
        URL.revokeObjectURL(this.state.lastTracklist.cue)
      }
      const title = `Cue mix ${new Date().toISOString().slice(0, 10)}`
      this.state.lastTracklist = this.setLog.length
        ? {
            txt: URL.createObjectURL(
              new Blob([tracklistText(this.setLog, title)], {
                type: "text/plain",
              })
            ),
            cue: URL.createObjectURL(
              new Blob(
                [
                  tracklistCue(
                    this.setLog,
                    title,
                    this.state.lastRecording.name
                  ),
                ],
                { type: "application/x-cue" }
              )
            ),
            name: base,
          }
        : null
      this.publish()
    }
    recorder.start(1000)
    // The tracklist starts with whatever is audible now.
    this.recordingStartedAt = ctx.currentTime
    this.setLog = (["A", "B"] as DeckId[])
      .filter(
        (id) =>
          this.state[id].playing &&
          this.state[id].track &&
          deckMixGain(this.state, id) > 0.001
      )
      .map((id) => ({
        at: 0,
        title: this.state[id].track!.title,
        artist: this.state[id].track!.artist,
      }))
    this.state.recording = true
    this.publish()
  }
  async setOutput(deviceId: string) {
    const ctx = this.init() as AudioContext & {
      setSinkId?: (id: string) => Promise<void>
    }
    if (!ctx.setSinkId)
      throw new Error(
        "Output selection is unavailable; choose your output in system audio settings."
      )
    if (this.outputPairs) this.setOutputPairs(false)
    await ctx.setSinkId(deviceId)
  }
  async resumeAudio() {
    const ctx = this.init()
    if (ctx.state === "running" || ctx.state === "closed") return
    try {
      await ctx.resume()
      if (this.state.error?.startsWith("Enable audio once")) {
        this.state.error = null
        this.publish()
      }
    } catch (error) {
      this.state.error = `Audio could not start: ${String(error)}`
      this.publish()
    }
  }
  audioDiagnostics() {
    return {
      status: this.context?.state ?? "idle",
      clock: this.context?.currentTime ?? 0,
      sampleRate: this.context?.sampleRate ?? 0,
    }
  }
  dispose() {
    clearInterval(this.interval)
    if (this.publishFrame !== null) cancelAnimationFrame(this.publishFrame)
    this.publishFrame = null
    this.listeners.clear()
    this.micVersion++
    this.monitorVersion++
    for (const [key, source] of this.sampleSources) {
      source.onended = null
      if (this.startedSamples.has(key)) source.stop()
      source.disconnect()
    }
    this.sampleSources.clear()
    this.startedSamples.clear()
    this.sampleBuffers.clear()
    this.heldPadFX.clear()
    this.monitorAudio?.pause()
    if (this.monitorAudio) this.monitorAudio.srcObject = null
    this.micStream?.getTracks().forEach((track) => track.stop())
    for (const ch of Object.values(this.channels)) {
      ch.loadVersion++
      ch.pitchVersion++
      ch.pitch?.node.disconnect()
      ch.pitch?.node.port.close()
      ch.pitchSpare?.node.port.close()
      ch.scratch?.disconnect()
      ch.scratch?.port.close()
      ch.scrubSource?.stop()
      if (ch.nudgeTimer) clearTimeout(ch.nudgeTimer)
      if (ch.echoOutTimer) clearTimeout(ch.echoOutTimer)
    }
    this.analysisJobs.forEach((job) => job.cancel())
    this.analysisJobs.clear()
    this.analysisCache.clear()
    if (this.state.lastRecording)
      URL.revokeObjectURL(this.state.lastRecording.url)
    if (this.recorder?.state === "recording") this.recorder.stop()
    void this.context?.close()
  }
}

function readMeter(analyser: AnalyserNode, samples: Float32Array<ArrayBuffer>) {
  analyser.getFloatTimeDomainData(samples)
  let sum = 0
  for (const value of samples) sum += value * value
  return Math.min(1, Math.sqrt(sum / samples.length) * 4)
}

/** Tracks analyzed before band levels or the current vocal detector. */
export function needsStructureRefresh(analysis: Analysis) {
  return (
    !analysis.bands ||
    !analysis.vocals ||
    (analysis.vocalsVersion ?? 1) < VOCALS_VERSION
  )
}

export function effectiveDeckRate(deck: Pick<DeckState, "rate">) {
  return deck.rate
}

/**
 * Rate rounded to 0.2% for planning and mix-fit: a tempo glide changes the
 * exact rate on every tick, which would otherwise re-plan transitions and
 * re-render the library 20 times a second for no visible difference.
 */
export function planningRate(deck: Pick<DeckState, "rate">) {
  return Math.round(effectiveDeckRate(deck) * 500) / 500
}

export function deckMixGain(state: EngineState, id: DeckId) {
  const curve =
    id === "A"
      ? Math.cos((state.crossfade * Math.PI) / 2)
      : Math.sin((state.crossfade * Math.PI) / 2)
  // Channel mixing has unity gain at the center, preventing a second fader attenuation.
  // Retain this curve after handoff/cancellation so moving a manual fader stays continuous.
  return (
    state[id].volume *
    (state.channelMix ? Math.min(1, curve * Math.SQRT2) : curve)
  )
}
export function outgoingDeck(state: EngineState): DeckId {
  return (
    state.autoOut ??
    (state.A.playing && !state.B.playing
      ? "A"
      : state.B.playing && !state.A.playing
        ? "B"
        : deckMixGain(state, "A") >= deckMixGain(state, "B")
          ? "A"
          : "B")
  )
}
export function deckOutputWarning(
  state: EngineState,
  id: DeckId
): string | null {
  if (!state[id].playing) return null
  if (state.master < 0.001) return "Master volume is down"
  if (state[id].volume < 0.001) return `Deck ${id} channel fader is down`
  if (deckMixGain(state, id) < 0.001) return `Crossfader is muting deck ${id}`
  if (Math.abs(state[id].filter) > 0.9)
    return `Deck ${id} filter is cutting most frequencies`
  return null
}

/** A 257-point automation curve at a point of the transition (0–1). */
function curveAt(curve: number[], progress: number) {
  const x = Math.max(0, Math.min(1, progress)) * (curve.length - 1),
    i = Math.floor(x)
  return (
    curve[i] +
    ((curve[Math.min(i + 1, curve.length - 1)] ?? 0) - curve[i]) * (x - i)
  )
}
