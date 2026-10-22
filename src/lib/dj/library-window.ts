export const LIBRARY_ROW_HEIGHT = 52
export const LIBRARY_HEADER_HEIGHT = 40

/** Keep the scroll height stable while mounting just the viewport and its buffer. */
export function libraryWindow(
  count: number,
  scrollTop: number,
  height: number
) {
  const visible = Math.max(1, Math.ceil(height / LIBRARY_ROW_HEIGHT))
  const buffer = 6
  const first = Math.floor(
    Math.max(0, scrollTop - LIBRARY_HEADER_HEIGHT) / LIBRARY_ROW_HEIGHT
  )
  const start = Math.max(0, Math.min(first - buffer, count - visible - buffer))
  const end = Math.min(count, start + visible + buffer * 2)
  return {
    start,
    end,
    before: start * LIBRARY_ROW_HEIGHT,
    after: (count - end) * LIBRARY_ROW_HEIGHT,
  }
}
