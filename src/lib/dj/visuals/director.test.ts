import { describe, expect, it } from "vitest"
import { SceneDirector, moodForEnergy, suggestScene } from "./director"
import { scenes } from "./scenes"

const quiet = {
  auto: true,
  drop: false,
  phrase: false,
  transition: null,
  incomingEnergy: null,
  energy: 6,
}

describe("scene suggestions", () => {
  it("matches mood to track energy", () => {
    expect(moodForEnergy(3)).toBe("calm")
    expect(moodForEnergy(6)).toBe("driving")
    expect(moodForEnergy(9)).toBe("intense")
  })
  it("never suggests the current scene", () => {
    for (let seed = 0; seed < 1; seed += 0.05) {
      const next = suggestScene("calm", 1, seed)
      expect(next).not.toBe(1)
      expect(scenes[next].mood).toBe("calm")
    }
  })
})

describe("SceneDirector", () => {
  it("dissolves along with an Automix transition and settles after it", () => {
    const director = new SceneDirector(0, () => 0)
    director.update(0.016, { ...quiet, transition: 0, incomingEnergy: 3 })
    const incoming = director.view.to
    expect(scenes[incoming].mood).toBe("calm")
    expect(director.view.mix).toBe(0)
    director.update(0.016, { ...quiet, transition: 0.5, incomingEnergy: 3 })
    expect(director.view.mix).toBeCloseTo(0.5)
    director.update(0.016, { ...quiet, transition: 0.6, incomingEnergy: 3 })
    // The engine clears its transition when the mix ends.
    for (let i = 0; i < 80; i++) director.update(0.016, quiet)
    expect(director.view).toEqual({ from: incoming, to: incoming, mix: 0 })
  })
  it("fades a picked scene in over about a second", () => {
    const director = new SceneDirector(0)
    director.select(3)
    expect(director.target).toBe(0)
    director.update(0.6, { ...quiet, auto: false })
    expect(director.view.mix).toBeCloseTo(0.5)
    expect(director.target).toBe(3)
    director.update(0.7, { ...quiet, auto: false })
    expect(director.view).toEqual({ from: 3, to: 3, mix: 0 })
  })
  it("keeps the scene through transitions when Auto is off", () => {
    const director = new SceneDirector(2)
    director.update(0.016, { ...quiet, auto: false, transition: 0.5 })
    expect(director.view).toEqual({ from: 2, to: 2, mix: 0 })
  })
})
