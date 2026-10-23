import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useDJ } from "./context"
import { ArcChart, useSetUpcoming } from "./set-planner"
import { arcCurve, phaseLabel } from "@/lib/dj/set-plan"
import type { DeckId } from "@/lib/dj/types"

/**
 * Set mode in the Automix bar: the energy arc with where the set is now and
 * where each planned track lands on it.
 */
export function SetArcView() {
  const { database, automix } = useDJ()
  const settings = database.session.setPlan
  const points = useMemo(() => arcCurve(settings), [settings])
  const upcoming = useSetUpcoming()
  const set = automix.set
  // Draw at the real pixel size so the curve fills the half it sits in.
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 260, height: 64 })
  useEffect(() => {
    const node = box.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0)
        setSize({ width: Math.round(width), height: Math.round(height) })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const marks = upcoming
    .filter(({ track }) => track.energy !== null)
    .map(({ track, fraction, next }) => ({
      id: track.id,
      fraction,
      energy: track.energy ?? 0,
      label: `${track.title} · energy ${track.energy}`,
      next,
    }))
  const elapsed =
    set && settings.minutes
      ? `${Math.round(set.fraction * settings.minutes)} of ${settings.minutes} min`
      : null
  return (
    <div className="set-flow-arc">
      <div ref={box} className="set-flow-chart">
        <ArcChart
          points={points}
          at={set ? set.fraction : null}
          marks={marks}
          width={size.width}
          height={size.height}
          className="set-arc set-arc-wide"
        />
      </div>
      <span className="set-flow-now" role="status">
        {set ? (
          <>
            <strong>{phaseLabel(set.phase)}</strong>
            {` · energy ${set.energy.toFixed(1)}`}
            {set.bpm ? ` · ${set.bpm} BPM` : ""}
            {elapsed ? ` · ${elapsed}` : ""}
          </>
        ) : (
          "The arc starts when Automix plays"
        )}
      </span>
    </div>
  )
}

/** Set mode's right column: the tracks Automix can play next, in order. */
export function SetQueue({ deck }: { deck: DeckId }) {
  const { automix, pinAutomix, skipAutomix } = useDJ()
  const upcoming = useSetUpcoming().slice(0, 4)
  return (
    <div className="automix-deck set-queue" data-deck={deck} aria-live="polite">
      <span className="automix-eyebrow">
        {automix.phase === "selecting" ? "PREPARING" : "UP NEXT"} · DECK {deck}
      </span>
      {upcoming.length ? (
        <ol>
          {upcoming.map(({ track, plan, goal, next }) => {
            const delta = track.energy !== null ? track.energy - goal : null
            return (
              <li key={track.id} data-next={next || undefined}>
                <span className="set-queue-text">
                  <strong title={track.title}>{track.title}</strong>
                  <small>
                    {[
                      track.bpm ? `${Math.round(track.bpm)}` : null,
                      track.camelot,
                      track.energy !== null
                        ? `E${track.energy}${delta !== null && Math.abs(delta) >= 1.5 ? (delta > 0 ? " ↑" : " ↓") : ""}`
                        : null,
                      plan?.name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                <span className="set-queue-actions">
                  {!next && (
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={!automix.active}
                      title="Play this one next"
                      onClick={() => pinAutomix(track.id)}
                    >
                      Next
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={!automix.active}
                    title="Leave this track out of the set"
                    onClick={() => skipAutomix(track.id)}
                  >
                    Skip
                  </Button>
                </span>
              </li>
            )
          })}
        </ol>
      ) : (
        <span className="automix-meta">
          {automix.active
            ? "Planning the next tracks…"
            : "Turn on Automix to plan the set"}
        </span>
      )}
    </div>
  )
}
