export type TimelineRange = { start: number; end: number }

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n))

export function boundTimeline(
  range: TimelineRange,
  duration: number,
  minimum = 1
): TimelineRange {
  const total = Math.max(0.01, Number.isFinite(duration) ? duration : 1)
  const length = clamp(
    Number.isFinite(range.end - range.start) ? range.end - range.start : total,
    Math.min(total, Math.max(0.01, minimum)),
    total
  )
  const start = clamp(
    Number.isFinite(range.start) ? range.start : 0,
    0,
    total - length
  )
  return { start, end: start + length }
}

// Keep the time under the pointer in place, except at the track boundaries.
export function zoomTimeline(
  range: TimelineRange,
  factor: number,
  fraction: number,
  duration: number,
  minimum = 1
): TimelineRange {
  const current = boundTimeline(range, duration, minimum)
  const total = Math.max(0.01, Number.isFinite(duration) ? duration : 1)
  const pointer = clamp(Number.isFinite(fraction) ? fraction : 0.5, 0, 1)
  const length = current.end - current.start
  const nextLength = clamp(
    length / (Number.isFinite(factor) && factor > 0 ? factor : 1),
    Math.min(total, Math.max(0.01, minimum)),
    total
  )
  const start = current.start + length * pointer - nextLength * pointer
  return boundTimeline({ start, end: start + nextLength }, total, minimum)
}

export function panTimeline(
  range: TimelineRange,
  seconds: number,
  duration: number
) {
  const delta = Number.isFinite(seconds) ? seconds : 0
  return boundTimeline(
    { start: range.start + delta, end: range.end + delta },
    duration,
    0.01
  )
}

export function wheelPixels(delta: number, mode: number, width: number) {
  return delta * (mode === 1 ? 16 : mode === 2 ? width : 1)
}

type Gesture = Event & { scale: number; clientX?: number }

// Native non-passive listeners cancel browser zoom only over this waveform.
// No seek/playback callback is part of this contract.
export function bindTimelineGestures(
  element: HTMLElement,
  options: {
    getRange: () => TimelineRange
    duration: number
    minimum: number
    onChange: (range: TimelineRange) => void
  }
) {
  let gesture: { range: TimelineRange; pointer: number } | null = null
  let pointer = 0.5
  const fraction = (clientX?: number) => {
    const rect = element.getBoundingClientRect()
    return typeof clientX === "number" && Number.isFinite(clientX) && rect.width
      ? clamp((clientX - rect.left) / rect.width, 0, 1)
      : pointer
  }
  const move = (event: PointerEvent) => {
    pointer = fraction(event.clientX)
  }
  const wheel = (event: WheelEvent) => {
    const range = options.getRange()
    const width = element.getBoundingClientRect().width || 800
    if (event.ctrlKey) {
      event.preventDefault()
      event.stopPropagation()
      if (!gesture)
        options.onChange(
          zoomTimeline(
            range,
            Math.exp(
              clamp(
                -wheelPixels(event.deltaY, event.deltaMode, width) * 0.01,
                -2,
                2
              )
            ),
            fraction(event.clientX),
            options.duration,
            options.minimum
          )
        )
    } else if (
      range.end - range.start < options.duration - 0.01 &&
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ) {
      event.preventDefault()
      event.stopPropagation()
      options.onChange(
        panTimeline(
          range,
          (wheelPixels(event.deltaX, event.deltaMode, width) / width) *
            (range.end - range.start),
          options.duration
        )
      )
    }
  }
  const gestureStart = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    gesture = {
      range: options.getRange(),
      pointer: fraction((event as Gesture).clientX),
    }
  }
  const gestureChange = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    if (gesture)
      options.onChange(
        zoomTimeline(
          gesture.range,
          (event as Gesture).scale,
          gesture.pointer,
          options.duration,
          options.minimum
        )
      )
  }
  const gestureEnd = (event: Event) => {
    event.preventDefault()
    gesture = null
  }
  element.addEventListener("pointermove", move)
  element.addEventListener("wheel", wheel, { passive: false })
  element.addEventListener("gesturestart", gestureStart, { passive: false })
  element.addEventListener("gesturechange", gestureChange, { passive: false })
  element.addEventListener("gestureend", gestureEnd, { passive: false })
  return () => {
    element.removeEventListener("pointermove", move)
    element.removeEventListener("wheel", wheel)
    element.removeEventListener("gesturestart", gestureStart)
    element.removeEventListener("gesturechange", gestureChange)
    element.removeEventListener("gestureend", gestureEnd)
  }
}
