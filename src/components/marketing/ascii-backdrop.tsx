import { lazy, Suspense, useEffect, useState } from "react"
import type { GradientASCIIProps } from "./gradient-ascii"
import { cn } from "@/lib/utils"

const GradientASCII = lazy(() => import("./gradient-ascii"))

const channel = (hex: string, i: number) =>
  parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)

// Blend a #rrggbb color toward another by amount (0–1).
export function mixHex(from: string, to: string, amount: number) {
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(
        channel(from, i) + (channel(to, i) - channel(from, i)) * amount
      )
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`
}

/** Light ramp for the shader: deep Deck A → Deck A → blend → Deck B. No white, so it glows on dark pages. */
export const asciiRamp = ([a, b]: readonly [string, string]) => [
  mixHex(a, "#0b0b0d", 0.7),
  a,
  mixHex(a, b, 0.5),
  b,
]

/**
 * Mounts the WebGL effect once the page is idle so it never competes with the
 * first paint, and skips it entirely without WebGL2.
 */
export function AsciiBackdrop({
  palette,
  className,
  ...props
}: Omit<GradientASCIIProps, "colors"> & {
  palette: readonly [string, string]
}) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const probe = document.createElement("canvas").getContext("webgl2")
    if (!probe) return
    probe.getExtension("WEBGL_lose_context")?.loseContext()
    const start = () => setReady(true)
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: 1500 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(start, 600)
    return () => clearTimeout(id)
  }, [])
  return (
    <div className={cn("ascii-backdrop", className)} aria-hidden="true">
      {ready && (
        <Suspense fallback={null}>
          <GradientASCII colors={asciiRamp(palette)} {...props} />
        </Suspense>
      )}
    </div>
  )
}
