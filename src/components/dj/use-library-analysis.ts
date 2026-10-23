import { useCallback, useEffect, useRef, useState } from "react"
import {
  analysisConcurrency,
  analyzeLibraryTrack,
  libraryAnalyzable,
  linkedFingerprint,
  mergeLibraryAnalysis,
} from "@/lib/dj/library-analysis"
import type { Track } from "@/lib/dj/types"
import { analysisOutdated } from "@/lib/dj/structure"

export function useLibraryAnalysis(
  tracks: Track[],
  ready: boolean,
  save: (original: Track, analyzed: Track) => void,
  useModels = true
) {
  const [activeIds, setActiveIds] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState(0)
  const tracksRef = useRef(tracks)
  tracksRef.current = tracks
  const attempted = useRef(new Set<string>())
  // Tracks being analysed now, by track id; a few run side by side.
  const jobs = useRef(new Map<string, AbortController>())
  useEffect(
    () => () => {
      for (const job of jobs.current.values()) job.abort()
      jobs.current.clear()
    },
    []
  )
  useEffect(() => {
    if (!ready) return
    const limit = analysisConcurrency()
    let started = false
    while (jobs.current.size < limit) {
      const next = tracks.find(
        (t) =>
          libraryAnalyzable(t) &&
          // Older analyses lack vocal/phrase structure or the current tempo,
          // grid and key analysis; refresh them too.
          (!t.analysis || !t.analysis.vocals || analysisOutdated(t.analysis)) &&
          !attempted.current.has(linkedFingerprint(t)) &&
          !jobs.current.has(t.id)
      )
      if (!next) break
      started = true
      const controller = new AbortController()
      jobs.current.set(next.id, controller)
      setErrors((prior) =>
        Object.fromEntries(
          Object.entries(prior).filter(([id]) => id !== next.id)
        )
      )
      attempted.current.add(linkedFingerprint(next))
      void analyzeLibraryTrack(next, controller.signal, useModels)
        .then((result) => {
          if (!controller.signal.aborted)
            save(
              next,
              mergeLibraryAnalysis(next, result.analysis, result.duration)
            )
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setErrors((prior) => ({
              ...prior,
              [next.id]:
                error instanceof Error
                  ? error.message
                  : "Analysis failed. Try again.",
            }))
          else attempted.current.delete(linkedFingerprint(next))
        })
        .finally(() => {
          if (jobs.current.get(next.id) !== controller) return
          jobs.current.delete(next.id)
          setActiveIds([...jobs.current.keys()])
          setRevision((value) => value + 1)
        })
    }
    if (started) setActiveIds([...jobs.current.keys()])
  }, [tracks, ready, revision, save, useModels])
  const retry = useCallback((id?: string) => {
    for (const track of tracksRef.current)
      if (!id || track.id === id)
        attempted.current.delete(linkedFingerprint(track))
    setErrors((prior) =>
      id
        ? Object.fromEntries(
            Object.entries(prior).filter(([key]) => key !== id)
          )
        : {}
    )
    setRevision((value) => value + 1)
  }, [])
  return { activeId: activeIds[0] ?? null, activeIds, errors, retry }
}
