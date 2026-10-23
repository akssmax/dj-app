import { useCallback, useEffect, useRef, useState } from "react"
import {
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
  const [activeId, setActiveId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState(0)
  const tracksRef = useRef(tracks)
  tracksRef.current = tracks
  const attempted = useRef(new Set<string>())
  const job = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      job.current?.abort()
      job.current = null
    },
    []
  )
  useEffect(() => {
    if (!ready || job.current) return
    const next = tracks.find(
      (t) =>
        libraryAnalyzable(t) &&
        // Older analyses lack vocal/phrase structure or the current tempo,
        // grid and key analysis; refresh them too.
        (!t.analysis || !t.analysis.vocals || analysisOutdated(t.analysis)) &&
        !attempted.current.has(linkedFingerprint(t))
    )
    if (!next) return
    const controller = new AbortController()
    job.current = controller
    setActiveId(next.id)
    setErrors((prior) =>
      Object.fromEntries(Object.entries(prior).filter(([id]) => id !== next.id))
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
        if (job.current !== controller) return
        job.current = null
        setActiveId(null)
        setRevision((value) => value + 1)
      })
  }, [tracks, ready, revision, save])
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
  return { activeId, errors, retry }
}
