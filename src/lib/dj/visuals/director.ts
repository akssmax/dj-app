import { scenes } from "./scenes"
import type { SceneMood } from "./scenes"
import type { SceneView } from "./renderer"

export type DirectorInput = {
  auto: boolean
  drop: boolean
  phrase: boolean
  /** Progress of an engine (Automix) transition, null when none runs. */
  transition: number | null
  /** Energy 1–10 of the track coming in during a transition. */
  incomingEnergy: number | null
  /** Energy 1–10 of the track leading the mix. */
  energy: number | null
}

/** Low-energy tracks get calm scenes, peak-time tracks intense ones. */
export function moodForEnergy(energy: number | null): SceneMood {
  if (energy === null) return "driving"
  return energy <= 4 ? "calm" : energy >= 8 ? "intense" : "driving"
}

/** A scene of `mood` other than `current`; any other scene if none match. */
export function suggestScene(mood: SceneMood, current: number, seed: number) {
  const others = scenes.map((_, index) => index).filter((i) => i !== current),
    matching = others.filter((i) => scenes[i].mood === mood),
    pool = matching.length ? matching : others
  return pool[Math.floor(seed * pool.length) % pool.length]
}

const smoothstep = (from: number, to: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

/**
 * Decides which scene shows and how scenes hand over. During an Automix
 * transition the dissolve follows the mix itself, so the new scene grows in
 * exactly as the new track does; picks, drops and phrases fade on a timer.
 */
export class SceneDirector {
  readonly view: SceneView
  private seconds: number | null = null
  private following = false
  private phrases = 0

  constructor(
    scene: number,
    private random = Math.random
  ) {
    this.view = { from: scene, to: scene, mix: 0 }
  }

  /** The scene being shown, or the one fading in. */
  get target() {
    return this.view.mix > 0 ? this.view.to : this.view.from
  }

  select(index: number) {
    this.following = false
    this.fadeTo(index, 1.2)
  }

  update(dt: number, input: DirectorInput) {
    const view = this.view
    if (input.auto && input.transition !== null) {
      if (!this.following) {
        this.settle()
        this.following = true
        this.phrases = 0
        view.to = suggestScene(
          moodForEnergy(input.incomingEnergy),
          view.from,
          this.random()
        )
      }
      // Hold the old scene through the first beats of the blend, then grow.
      view.mix = Math.max(view.mix, smoothstep(0.1, 0.9, input.transition))
    } else if (this.following) {
      // Finished or cancelled: settle on the new scene within a second.
      this.following = false
      if (view.mix > 0) this.seconds = 1
    } else if (input.auto) {
      if (input.drop) {
        this.phrases = 0
        this.fadeTo(suggestScene("intense", this.target, this.random()), 0.5)
      } else if (input.phrase && ++this.phrases >= 2) {
        this.phrases = 0
        this.fadeTo(
          suggestScene(moodForEnergy(input.energy), this.target, this.random()),
          2.5
        )
      }
    }
    if (this.seconds !== null)
      view.mix = Math.min(1, view.mix + dt / this.seconds)
    if (view.mix >= 1) {
      view.from = view.to
      view.mix = 0
      this.seconds = null
    }
  }

  private fadeTo(index: number, seconds: number) {
    this.settle()
    if (index === this.view.from) return
    this.view.to = index
    this.seconds = seconds
  }

  /** Jump a half-finished fade to whichever scene dominates. */
  private settle() {
    const view = this.view
    if (view.mix >= 0.5) view.from = view.to
    view.to = view.from
    view.mix = 0
    this.seconds = null
  }
}
