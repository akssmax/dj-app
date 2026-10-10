import { deckMixGain, outgoingDeck } from "./engine"
import type { DJEngine } from "./engine"
import { recommendTracks } from "./library-scope"
import type { LibraryDatabase } from "./storage"
import type { DeckId, Track } from "./types"

export type AutomixState = {
  active: boolean
  phase: "idle" | "selecting" | "mixing" | "finishing" | "paused" | "complete"
  playedIds: string[]
  nextId: string | null
  message: string
}

export const emptyAutomix: AutomixState = {
  active: false,
  phase: "idle",
  playedIds: [],
  nextId: null,
  message: "",
}

type Options = {
  pool: Track[]
  session: LibraryDatabase["session"]
  cues: LibraryDatabase["cues"]
  labels: LibraryDatabase["cueLabels"]
}

/** Owns a continuous mix; a one-off engine transition never starts a new run. */
export class AutomixSession {
  state = { ...emptyAutomix }
  private played = new Set<string>()
  private unavailable = new Set<string>()
  private generation = 0
  private internalDepth = 0
  private finalDeck: DeckId | null = null
  private pendingPlay: DeckId | null = null
  private unsubscribe: () => void

  constructor(
    private engine: DJEngine,
    private getOptions: () => Options,
    private load: (id: DeckId, track: Track) => Promise<void>,
    private onChange: (state: AutomixState) => void,
    private notify: (message: string) => void
  ) {
    engine.onHandoff = this.handoff
    engine.onAutoCancel = this.cancelled
    this.unsubscribe = engine.subscribe(this.observe)
  }

  private emit(change: Partial<AutomixState>) {
    this.state = { ...this.state, ...change }
    this.onChange(this.state)
  }

  // Engine load/start operations cancel their previous transition synchronously.
  // Only those calls are exempt; a person can still cancel during any await.
  private own<T>(action: () => T): T {
    this.internalDepth++
    try {
      return action()
    } finally {
      this.internalDepth--
    }
  }

  private observe = () => {
    let added = false
    for (const id of ["A", "B"] as const) {
      const deck = this.engine.state[id]
      const mix = deckMixGain(this.engine.state, id)
      if (
        deck.playing &&
        deck.volume > 0 &&
        mix > 0.001 &&
        deck.track &&
        !this.played.has(deck.track.id)
      ) {
        this.played.add(deck.track.id)
        added = true
      }
    }
    if (added) this.emit({ playedIds: [...this.played] })
    if (
      this.state.active &&
      this.state.phase === "finishing" &&
      this.finalDeck &&
      !this.engine.state[this.finalDeck].playing
    ) {
      this.generation++
      this.finalDeck = null
      this.emit({
        active: false,
        phase: "complete",
        nextId: null,
        message: "Mix complete · all available tracks played",
      })
      this.notify(this.state.message)
    }
  }

  private cancelled = () => {
    if (this.internalDepth || !this.state.active) return
    this.stop()
  }

  stop(message = "Automix paused · played tracks stay excluded") {
    this.generation++
    this.emit({ active: false, phase: "paused", nextId: null, message })
    this.finalDeck = null
    this.own(() => {
      this.engine.cancelAuto()
      if (this.pendingPlay) this.engine.pause(this.pendingPlay)
    })
    this.pendingPlay = null
  }

  resetHistory() {
    if (this.state.active) return
    this.played.clear()
    const out = outgoingDeck(this.engine.state),
      deck = this.engine.state[out]
    if (
      deck.track &&
      !deck.playing &&
      deck.position >= deck.track.duration - 0.08
    )
      this.own(() => this.engine.seek(out, 0))
    this.emit({ ...emptyAutomix, playedIds: [] })
    this.observe()
  }

  async start(out = outgoingDeck(this.engine.state)) {
    if (this.engine.hardwareLocked) {
      this.notify("Automix is disabled while a MIDI controller is connected.")
      return
    }
    if (!this.engine.state[out].track || this.engine.state[out].loading) {
      this.notify("Load the outgoing deck before starting Automix.")
      return
    }
    if (this.state.active) return
    this.unavailable.clear()
    this.observe()
    const source = this.engine.state[out]
    if (
      source.track &&
      !source.playing &&
      source.position >= source.track.duration - 0.08 &&
      !this.getOptions().pool.some(
        (track) =>
          track.id !== source.track?.id &&
          !this.played.has(track.id) &&
          track.available !== false
      )
    ) {
      this.emit({
        phase: "complete",
        message: "Mix complete · all available tracks played",
      })
      this.notify(
        "All available tracks have played. Reset played tracks to start a new mix."
      )
      return
    }
    this.own(() => this.engine.cancelAuto())
    const generation = ++this.generation
    this.emit({
      active: true,
      phase: "selecting",
      message: "Choosing the next unplayed track…",
    })
    await this.prepare(out, generation)
  }

  private live(generation: number) {
    return (
      this.state.active &&
      this.generation === generation &&
      !this.engine.hardwareLocked
    )
  }

  private rank(out: DeckId, pool: Track[]) {
    const deck = this.engine.state[out],
      options = this.getOptions()
    return recommendTracks(
      deck.track,
      pool.filter((track) => !this.unavailable.has(track.id)),
      undefined,
      deck.rate,
      options.session.mixIntent,
      {
        position: deck.position,
        recent: options.session.recentTransitions,
        technique: options.session.transitionTechnique,
        transitionCues: options.session.transitionCues,
        cues: options.cues,
        labels: options.labels,
        played: this.played,
        limit: 1,
      }
    ).at(0)
  }

  private async prepare(out: DeckId, generation: number): Promise<void> {
    if (!this.live(generation)) return
    const idle = out === "A" ? "B" : "A"
    const sourceId = this.engine.state[out].track?.id
    if (!sourceId) return this.fail("The outgoing track is no longer loaded.")
    this.emit({
      phase: "selecting",
      nextId: null,
      message: "Choosing the next unplayed track…",
    })
    this.own(() => {
      this.engine.pause(idle)
      this.engine.centerChannelMix(out)
    })
    const pool = this.getOptions().pool
    const remaining = pool.filter(
      (track) =>
        track.id !== sourceId &&
        !this.played.has(track.id) &&
        track.available !== false &&
        !this.unavailable.has(track.id)
    )
    if (!remaining.length) {
      await this.finish(out, generation)
      return
    }
    const next = this.rank(out, remaining)
    if (!next)
      return this.fail(
        "No unplayed track fits the selected technique and future cues. Adjust the mix controls to continue."
      )
    this.emit({
      nextId: next.track.id,
      message: `Preparing ${next.track.title}`,
    })
    try {
      if (
        this.engine.state[idle].track?.id !== next.track.id ||
        this.engine.state[idle].loading
      ) {
        await this.own(() => this.load(idle, next.track))
      } else {
        this.own(() => this.engine.setParam(idle, "rate", 1))
      }
    } catch (error) {
      if (this.live(generation))
        this.fail(
          `Could not prepare ${next.track.title}: ${error instanceof Error ? error.message : String(error)}`
        )
      return
    }
    if (!this.live(generation)) return
    const source = this.engine.state[out],
      incoming = this.engine.state[idle]
    if (source.track?.id !== sourceId || incoming.track?.id !== next.track.id)
      return this.fail("Deck tracks changed while Automix was preparing.")
    if (incoming.track.available === false) {
      this.unavailable.add(next.track.id)
      this.notify(`Skipped unavailable track: ${next.track.title}`)
      this.engine.clearError()
      await this.prepare(out, generation)
      return
    }
    if (incoming.loading || this.engine.state.error)
      return this.fail(
        this.engine.state.error ??
          "Wait for the incoming track to finish loading."
      )
    // A source/filter change during decoding must never play outside the new view.
    if (!this.getOptions().pool.some((track) => track.id === next.track.id)) {
      await this.prepare(out, generation)
      return
    }
    const revalidated = this.rank(out, [incoming.track])
    if (!revalidated)
      return this.fail(
        "The selected exit cue has passed or this transition no longer fits. Adjust the mix controls to continue."
      )
    this.emit({ phase: "mixing", message: `Next: ${next.track.title}` })
    this.pendingPlay = source.playing ? null : out
    await this.own(() => this.engine.startAuto(out, revalidated.plan))
    if (!this.live(generation)) return
    this.pendingPlay = null
    if (this.live(generation) && !this.engine.state.auto)
      this.fail(
        this.engine.state.error ??
          "Automix could not start the next transition."
      )
  }

  private async finish(out: DeckId, generation: number) {
    this.finalDeck = out
    this.own(() => {
      this.engine.loop(out, null)
      this.engine.centerChannelMix(out)
    })
    this.pendingPlay = this.engine.state[out].playing ? null : out
    await this.engine.play(out)
    if (!this.live(generation)) return
    this.pendingPlay = null
    if (!this.engine.state[out].playing)
      return this.fail(
        this.engine.state.error ?? "The final track could not start."
      )
    this.emit({
      phase: "finishing",
      nextId: null,
      message: "Last track · finishing the mix",
    })
  }

  private handoff = (_idle: DeckId, playing: DeckId) => {
    if (!this.state.active) return
    this.observe()
    void this.prepare(playing, this.generation)
  }

  private fail(message: string) {
    this.stop(message)
    this.notify(message)
  }

  dispose() {
    this.stop()
    this.unsubscribe()
    if (this.engine.onHandoff === this.handoff)
      this.engine.onHandoff = undefined
    if (this.engine.onAutoCancel === this.cancelled)
      this.engine.onAutoCancel = undefined
  }
}
