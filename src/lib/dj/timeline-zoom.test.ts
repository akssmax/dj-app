import { describe, expect, it } from "vitest"
import {
  bindTimelineGestures,
  boundTimeline,
  panTimeline,
  zoomTimeline,
} from "./timeline-zoom"
import type { TimelineRange } from "./timeline-zoom"

describe("timeline navigation", () => {
  it("preserves pointer time through repeated zoom in/out", () => {
    const initial = { start: 40, end: 200 }
    const zoomed = zoomTimeline(initial, 4, 0.7, 300, 2)
    expect(zoomed.end - zoomed.start).toBeCloseTo(40)
    expect(zoomed.start + 40 * 0.7).toBeCloseTo(152)
    expect(zoomTimeline(zoomed, 0.25, 0.7, 300, 2)).toEqual(initial)
  })
  it("clamps at track edges and preserves the window size while panning", () => {
    expect(panTimeline({ start: 20, end: 60 }, -100, 100)).toEqual({
      start: 0,
      end: 40,
    })
    expect(panTimeline({ start: 20, end: 60 }, 100, 100)).toEqual({
      start: 60,
      end: 100,
    })
    expect(zoomTimeline({ start: 60, end: 100 }, 0.25, 1, 100, 2)).toEqual({
      start: 0,
      end: 100,
    })
  })
  it("bounds extreme zoom, invalid analysis, and very short tracks", () => {
    expect(zoomTimeline({ start: 0, end: 120 }, 1e10, 0.5, 120, 2)).toEqual({
      start: 59,
      end: 61,
    })
    expect(boundTimeline({ start: 200, end: 230 }, 180, 2)).toEqual({
      start: 150,
      end: 180,
    })
    expect(zoomTimeline({ start: 0, end: 0.2 }, 2, 0.5, 0.2, 2)).toEqual({
      start: 0,
      end: 0.2,
    })
    const safe = zoomTimeline({ start: NaN, end: Infinity }, NaN, NaN, NaN)
    expect(Number.isFinite(safe.start) && Number.isFinite(safe.end)).toBe(true)
  })
})

function fixture() {
  const element = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 100, width: 800 }),
  }) as unknown as HTMLElement
  let range: TimelineRange = { start: 0, end: 200 }
  let updates = 0
  const unbind = bindTimelineGestures(element, {
    duration: 200,
    minimum: 2,
    getRange: () => range,
    onChange: (next) => {
      range = next
      updates++
    },
  })
  const event = (type: string, data: object) => {
    const ev = Object.assign(new Event(type, { cancelable: true }), data)
    element.dispatchEvent(ev)
    return ev
  }
  return {
    element,
    unbind,
    event,
    getRange: () => range,
    updates: () => updates,
  }
}

describe("trackpad timeline gestures", () => {
  it("captures pinch locally and accumulates a rapid packet burst at its anchor", () => {
    const f = fixture()
    for (let i = 0; i < 20; i++) {
      expect(
        f.event("wheel", {
          ctrlKey: true,
          deltaY: -2,
          deltaX: 0,
          deltaMode: 0,
          clientX: 300,
        }).defaultPrevented
      ).toBe(true)
    }
    const range = f.getRange()
    expect(range.end - range.start).toBeCloseTo(200 / Math.exp(0.4))
    expect(range.start + (range.end - range.start) * 0.25).toBeCloseTo(50)
    expect(f.updates()).toBe(20)
    f.unbind()
    f.event("wheel", { ctrlKey: true, deltaY: -20, deltaMode: 0, clientX: 300 })
    expect(f.updates()).toBe(20)
  })
  it("leaves ordinary vertical scrolling and full-track horizontal scrolling alone", () => {
    const f = fixture()
    expect(
      f.event("wheel", { ctrlKey: false, deltaY: 100, deltaX: 0 })
        .defaultPrevented
    ).toBe(false)
    expect(
      f.event("wheel", { ctrlKey: false, deltaY: 0, deltaX: 100 })
        .defaultPrevented
    ).toBe(false)
    expect(f.updates()).toBe(0)
  })
  it("pans a zoomed view horizontally and normalizes wheel units", () => {
    const f = fixture()
    f.event("wheel", {
      ctrlKey: true,
      deltaY: -Math.log(2) / 0.01,
      deltaMode: 0,
      clientX: 500,
    })
    expect(f.getRange()).toEqual({ start: 50, end: 150 })
    expect(
      f.event("wheel", { ctrlKey: false, deltaY: 0, deltaX: 4, deltaMode: 1 })
        .defaultPrevented
    ).toBe(true)
    expect(f.getRange()).toEqual({ start: 58, end: 158 })
    f.event("wheel", { ctrlKey: false, deltaY: 0, deltaX: 1, deltaMode: 2 })
    expect(f.getRange()).toEqual({ start: 100, end: 200 })
  })
  it("handles Safari relative gesture scale without compounding or duplicate wheel zoom", () => {
    const f = fixture()
    f.event("gesturestart", { clientX: 500, scale: 1 })
    f.event("gesturechange", { scale: 2 })
    expect(f.getRange()).toEqual({ start: 50, end: 150 })
    f.event("gesturechange", { scale: 4 })
    expect(f.getRange()).toEqual({ start: 75, end: 125 })
    f.event("wheel", { ctrlKey: true, deltaY: -10, deltaMode: 0, clientX: 500 })
    expect(f.getRange()).toEqual({ start: 75, end: 125 })
    f.event("gestureend", {})
    f.event("wheel", { ctrlKey: true, deltaY: -10, deltaMode: 0, clientX: 500 })
    expect(f.getRange().end - f.getRange().start).toBeLessThan(50)
  })
})
