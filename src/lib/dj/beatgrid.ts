import type { Track } from "./types"

export function beatOffset(track: Track | null) {
  return track?.grid?.offset ?? track?.analysis?.beatOffset ?? 0
}

export function snapToBeat(track: Track, seconds: number, floor = false) {
  if (!track.bpm) return seconds
  const beat = 60 / track.bpm
  const index = (seconds - beatOffset(track)) / beat
  return Math.max(
    0,
    Math.min(
      track.duration,
      beatOffset(track) + (floor ? Math.floor(index) : Math.round(index)) * beat
    )
  )
}

export function echoDelay(bpm: number | null, rate: number, beats: number) {
  return Math.min(4, Math.max(0.03, (60 * beats) / ((bpm ?? 120) * rate)))
}

// Find the nearest position with the reference's four-beat bar phase.
// Select a valid bar rather than clamping a negative candidate off the grid.
export function alignBarPhase(
  track: Track,
  position: number,
  referenceBeats: number,
  min = 0,
  max = track.duration - 0.01
) {
  if (!track.bpm || max < min) return null
  const beat = 60 / track.bpm
  const phase = ((referenceBeats % 4) + 4) % 4
  const origin = beatOffset(track) + phase * beat
  const bar = beat * 4
  const first = Math.ceil((min - origin) / bar)
  const last = Math.floor((max - origin) / bar)
  if (last < first) return null
  return (
    origin +
    Math.max(first, Math.min(last, Math.round((position - origin) / bar))) * bar
  )
}
