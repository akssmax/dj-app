/** One track in a recorded set, from the moment it took over the mix. */
export type TracklistEntry = {
  /** Seconds from the start of the recording. */
  at: number
  title: string
  artist: string
  /** The transition into this track, e.g. "Drop swap + Filter build". */
  transition?: string
}

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    r = s % 60
  const mm = String(m).padStart(h ? 2 : 1, "0"),
    ss = String(r).padStart(2, "0")
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** CUE sheets count minutes:seconds:frames at 75 frames per second. */
const cueTime = (seconds: number) => {
  const frames = Math.max(0, Math.round(seconds * 75))
  const m = Math.floor(frames / 75 / 60),
    s = Math.floor(frames / 75) % 60,
    f = frames % 75
  return [m, s, f].map((n) => String(n).padStart(2, "0")).join(":")
}

const quote = (text: string) => `"${text.replace(/"/g, "'")}"`

export function tracklistText(entries: TracklistEntry[], title: string) {
  return [
    title,
    "",
    ...entries.map(
      (entry, i) =>
        `${String(i + 1).padStart(2, "0")}. [${clock(entry.at)}] ${entry.artist} – ${entry.title}${entry.transition ? `  (${entry.transition})` : ""}`
    ),
    "",
  ].join("\n")
}

export function tracklistCue(
  entries: TracklistEntry[],
  title: string,
  fileName: string
) {
  return [
    `PERFORMER ${quote("Cue")}`,
    `TITLE ${quote(title)}`,
    `FILE ${quote(fileName)} WAVE`,
    ...entries.flatMap((entry, i) => [
      `  TRACK ${String(i + 1).padStart(2, "0")} AUDIO`,
      `    TITLE ${quote(entry.title)}`,
      `    PERFORMER ${quote(entry.artist)}`,
      `    INDEX 01 ${cueTime(entry.at)}`,
    ]),
    "",
  ].join("\n")
}
