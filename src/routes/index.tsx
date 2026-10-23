import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { lazy, Suspense } from "react"
import { Library } from "@/components/dj/library"
import { TransitionCoach, TransitionPlanner } from "@/components/dj/transitions"
import { useDJ, useEngine } from "@/components/dj/provider"
import { Icon } from "@/components/dj/icons"
import { LibraryTransport } from "@/components/dj/library-transport"

const Decks = lazy(() => import("@/components/dj/performance-layout"))
const Visualizer = lazy(() =>
  import("@/components/dj/visualizer").then((module) => ({
    default: module.Visualizer,
  }))
)
const ParallelWaveforms = lazy(() =>
  import("@/components/dj/parallel-waveforms").then((module) => ({
    default: module.ParallelWaveforms,
  }))
)

export const Route = createFileRoute("/")({ component: Studio })
function Studio() {
  const { engine, coachOpen, setCoachOpen, layout, ready } = useDJ(),
    error = useEngine((state) => state.error)
  if (!ready)
    return (
      <div className="studio-loading" role="status">
        Opening your saved library…
      </div>
    )
  if (layout === "visual")
    return (
      <>
        <Suspense
          fallback={
            <p className="muted" role="status">
              Loading visuals…
            </p>
          }
        >
          <Visualizer />
        </Suspense>
        <LibraryTransport />
      </>
    )
  return (
    <>
      {error && (
        <div className="engine-error" role="alert">
          <Icon name="info" />
          {error}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => engine?.clearError()}
            aria-label="Dismiss audio error"
          >
            <Icon name="close" />
          </Button>
        </div>
      )}
      <div className="studio-strip">
        <div className="coach-top-slot">
          <TransitionCoach />
          {!coachOpen && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setCoachOpen(true)}
            >
              <Icon name="book" size={13} />
              Show transition coach
              <Icon name="right" size={12} />
            </Button>
          )}
        </div>
      </div>
      {layout === "parallel" && (
        <section
          className="transition-workspace"
          aria-label="Waveforms and transition assistant"
        >
          <Suspense
            fallback={
              <p className="muted" role="status">
                Loading waveforms…
              </p>
            }
          >
            <ParallelWaveforms />
          </Suspense>
          <TransitionPlanner />
        </section>
      )}
      {layout !== "library" && (
        <Suspense
          fallback={
            <p className="muted" role="status">
              Loading decks…
            </p>
          }
        >
          <Decks />
        </Suspense>
      )}
      {layout === "library" && <LibraryTransport />}
      <section
        className="library-grid library-full-width"
        aria-label="Music library and automix planner"
      >
        <Library />
        {/* {layout !== "parallel" && <TransitionPlanner />} */}
      </section>
    </>
  )
}
