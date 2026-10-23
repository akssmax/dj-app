import { useEffect, useState } from "react"

// Public visitor counter on Abacus (https://abacus.jasoncameron.dev), a free
// counting service. Each visitor's browser calls it directly: the service
// limits requests per IP, so routing through our server would make every
// visitor share Vercel's IPs. Development uses its own counter.
const API = "https://abacus.jasoncameron.dev"
const NAMESPACE = import.meta.env.DEV ? "cue-dj-app-dev" : "cue-dj-app"
const KEY = "visitors"
const COUNTED_FLAG = "cue-visitor-counted"

let pending: Promise<number | null> | null = null

/**
 * Counts this browser once (a localStorage flag), then only reads the total.
 * Resolves to null when the service is unreachable, so callers can hide the
 * counter instead of showing a broken number.
 */
export function loadVisitorCount(): Promise<number | null> {
  if (pending) return pending
  pending = (async () => {
    let counted = false
    try {
      counted = localStorage.getItem(COUNTED_FLAG) === "1"
    } catch {
      // Storage blocked: count the visit, without remembering it.
    }
    const action = counted ? "get" : "hit"
    try {
      const response = await fetch(`${API}/${action}/${NAMESPACE}/${KEY}`, {
        signal: AbortSignal.timeout(4000),
      })
      if (!response.ok) return null
      const { value } = (await response.json()) as { value?: unknown }
      if (typeof value !== "number") return null
      if (!counted) {
        try {
          localStorage.setItem(COUNTED_FLAG, "1")
        } catch {
          // Ignore: worst case this browser is counted again next time.
        }
      }
      return value
    } catch {
      return null
    }
  })()
  return pending
}

export function useVisitorCount() {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    void loadVisitorCount().then((value) => {
      if (live) setCount(value)
    })
    return () => {
      live = false
    }
  }, [])
  return count
}
