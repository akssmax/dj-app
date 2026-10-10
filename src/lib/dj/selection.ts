// Preserve a selected snapshot when unrelated engine values change.
export function selectSnapshot<TState, TValue>(
  select: (state: TState) => TValue
) {
  let cached: { value: TValue } | undefined
  return (state: TState): TValue => {
    const value = select(state)
    if (cached && shallowEqual(cached.value, value)) return cached.value
    cached = { value }
    return value
  }
}

function shallowEqual(a: unknown, b: unknown) {
  if (Object.is(a, b)) return true
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        Object.is(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key]
        )
    )
  )
}
