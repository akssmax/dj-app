import { describe, expect, it } from "vitest"
import { libraryWindow, LIBRARY_ROW_HEIGHT } from "./library-window"

describe("library row window", () => {
  it("bounds the mounted rows independently of library size", () => {
    const range = libraryWindow(654, 0, 456)
    expect(range).toEqual({ start: 0, end: 18, before: 0, after: 636 * 76 })
  })
  it("keeps total scroll height and the final tracks reachable", () => {
    for (const offset of [500, 15000, 654 * 76]) {
      const range = libraryWindow(654, offset, 456)
      expect(
        range.before +
          (range.end - range.start) * LIBRARY_ROW_HEIGHT +
          range.after
      ).toBe(654 * 76)
      expect(range.end - range.start).toBeLessThanOrEqual(18)
      expect(range.start).toBeGreaterThanOrEqual(0)
    }
    expect(libraryWindow(654, 654 * 76, 456).end).toBe(654)
  })
  it("clamps stale offsets after filtering and handles empty lists", () => {
    expect(libraryWindow(2, 50000, 456)).toEqual({
      start: 0,
      end: 2,
      before: 0,
      after: 0,
    })
    expect(libraryWindow(0, 50000, 0)).toEqual({
      start: 0,
      end: 0,
      before: 0,
      after: 0,
    })
  })
})
