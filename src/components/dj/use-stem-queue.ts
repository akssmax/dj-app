import { useCallback, useEffect, useRef, useState } from "react"
import { prepareStems, removeStems } from "@/lib/dj/stem-store"
import type { StemProgress } from "@/lib/dj/stem-store"
import { libraryAnalyzable } from "@/lib/dj/library-analysis"
import type { Track } from "@/lib/dj/types"

/** Vocal presence (0–1) from the vocal stem's level: 0.02 or less is
 * silence, 0.15 or more relative to the mix's loudest second is a voice. */
const presence = (levels: number[]) =>
  levels.map(
    (v) => Math.round(Math.max(0, Math.min(1, (v - 0.02) / 0.13)) * 1000) / 1000
  )

/**
 * Stem separation, one track at a time in the background. Each finished
 * track records its stems and stem levels; the vocal stem replaces the
 * vocal-presence estimate.
 */
export function useStemQueue(
  tracks: Track[],
  save: (id: string, change: (track: Track) => Track) => void
) {
  const [queue, setQueue] = useState<string[]>([])
  const [active, setActive] = useState<({ id: string } & StemProgress) | null>(
    null
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const job = useRef<AbortController | null>(null)
  const tracksRef = useRef(tracks)
  tracksRef.current = tracks

  useEffect(() => {
    if (job.current || !queue.length) return
    const id = queue[0]
    const track = tracksRef.current.find((t) => t.id === id)
    if (!track || !libraryAnalyzable(track)) {
      setQueue((q) => q.slice(1))
      return
    }
    const controller = new AbortController()
    job.current = controller
    setActive({ id, stage: "download", fraction: 0 })
    void prepareStems(track, controller.signal, (progress) =>
      setActive({ id, ...progress })
    )
      .then(({ stems, levels, key }) =>
        save(id, (current) => {
          // The drum-free key replaces the full-mix one when at least as sure.
          const better =
            !current.keyOverride &&
            !!key.camelot &&
            key.confidence >= (current.analysis?.confidence ?? 0)
          return {
            ...current,
            stems,
            ...(better ? { key: key.key, camelot: key.camelot } : {}),
            analysis: current.analysis && {
              ...current.analysis,
              stemLevels: levels,
              vocals: presence(levels.vocals),
              ...(better
                ? {
                    key: key.key,
                    camelot: key.camelot,
                    confidence: key.confidence,
                  }
                : {}),
            },
          }
        })
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setErrors((prior) => ({
          ...prior,
          [id]: error instanceof Error ? error.message : String(error),
        }))
      })
      .finally(() => {
        job.current = null
        setActive(null)
        setQueue((q) => q.filter((other) => other !== id))
      })
  }, [queue, save])

  const prepare = useCallback((ids: string[]) => {
    setErrors((prior) =>
      Object.fromEntries(
        Object.entries(prior).filter(([id]) => !ids.includes(id))
      )
    )
    setQueue((q) => [...q, ...ids.filter((id) => !q.includes(id))])
  }, [])
  const cancel = useCallback(() => {
    setQueue([])
    job.current?.abort()
  }, [])
  const remove = useCallback(
    async (id: string) => {
      await removeStems(id)
      save(id, (current) => {
        const { stems: _, ...rest } = current
        return {
          ...rest,
          analysis: current.analysis && {
            ...current.analysis,
            stemLevels: undefined,
          },
        }
      })
    },
    [save]
  )
  return { queue, active, errors, prepare, cancel, remove }
}
