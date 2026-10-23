import { describe, expect, it } from "vitest"
import { PREVIEW_MAX, previewWindow } from "./transition-preview"
import type { Transition } from "./types"

const plan = (extra: Partial<Transition>) =>
  ({ duration: 30, fx: [], ...extra }) as Transition

describe("transition preview window", () => {
  const bar = 240 / 120
  it("leads in two bars and keeps the transition and a tail", () => {
    const window = previewWindow(plan({ duration: 20 }), 1, 120)
    expect(window.lead).toBe(2 * bar)
    expect(window.body).toBe(20)
    expect(window.total).toBe(2 * bar + 20 + 2 * bar)
  })
  it("starts early enough to hear an effect build", () => {
    const build = plan({
      fx: [
        {
          kind: "sweep",
          deck: "out",
          at: -8 * bar,
          length: 8 * bar,
          amount: 1,
          label: "",
        },
      ],
    })
    expect(previewWindow(build, 1, 120).lead).toBe(8 * bar)
  })
  it("caps long blends", () => {
    expect(previewWindow(plan({ duration: 120 }), 1, 120).body).toBe(
      PREVIEW_MAX
    )
  })
})
