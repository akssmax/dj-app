export type ManualAttempt = {
  startedAt: number
  startPosition: number
  beatOffset: number
  bpm: number | null
  incomingBpm: number | null
  outgoingRate: number
  incomingRate: number
  eqMoves: number
  faderMoves: number
  target: "A" | "B"
}
export type ManualReport = {
  id: string
  date: number
  score: number
  timing: number
  tempo: number
  control: number
  duration: number
  title: string
  tips: string[]
}

export function scoreTransition(
  attempt: ManualAttempt,
  finishedAt: number
): ManualReport {
  const duration = Math.max(0, (finishedAt - attempt.startedAt) / 1000)
  const beat = attempt.bpm ? 60 / attempt.bpm : 0
  const phase = beat
    ? (((attempt.startPosition - attempt.beatOffset) % (beat * 32)) +
        beat * 32) %
      (beat * 32)
    : 0
  const distance = beat ? Math.min(phase, beat * 32 - phase) / beat : 8
  const timing = Math.round(Math.max(0, 100 - distance * 12))
  const tempoGap =
    attempt.bpm && attempt.incomingBpm
      ? Math.abs(
          attempt.bpm * attempt.outgoingRate -
            attempt.incomingBpm * attempt.incomingRate
        ) /
        (attempt.bpm * attempt.outgoingRate)
      : 0.08
  const tempo = Math.round(Math.max(0, 100 - tempoGap * 1500))
  const control = Math.min(
    100,
    Math.round(
      (Math.min(attempt.faderMoves, 20) / 20) * 70 +
        (attempt.eqMoves > 1 ? 30 : 5)
    )
  )
  const score = Math.round(timing * 0.35 + tempo * 0.35 + control * 0.3)
  return {
    id: crypto.randomUUID(),
    date: Date.now(),
    score,
    timing,
    tempo,
    control,
    duration,
    title:
      score >= 80
        ? "Nicely connected."
        : score >= 55
          ? "A good start. Keep practicing."
          : "Every transition teaches you something.",
    tips: [
      timing < 80
        ? "Start your next blend closer to an estimated 8-bar phrase boundary."
        : "You entered close to the estimated phrase boundary.",
      tempo < 80
        ? "Bring the effective BPMs closer before a long overlap."
        : "The deck tempos were close during the blend.",
      attempt.eqMoves < 2
        ? "Try reducing the incoming bass, then exchange the low end halfway."
        : "You shaped the blend with your EQ controls.",
    ],
  }
}
