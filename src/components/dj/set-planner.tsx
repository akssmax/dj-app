import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDJ } from "./context"
import { useTransitionPlan } from "./provider"
import { planTransitions } from "@/lib/dj/planner"
import { describeFX } from "@/lib/dj/auto-fx"
import {
  arcAt,
  arcCurve,
  arcOptions,
  arcStep,
  phaseLabel,
  suggestTempo,
} from "@/lib/dj/set-plan"
import type { SetPhase } from "@/lib/dj/set-plan"
import type { Track } from "@/lib/dj/types"

const lengths = [
  { minutes: 15, label: "15 min" },
  { minutes: 20, label: "20 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1½ hours" },
  { minutes: 120, label: "2 hours" },
  { minutes: 0, label: "Until the playlist ends" },
]

/** Where an upcoming track sits on the arc, with its own energy. */
export type ArcMark = {
  id: string
  fraction: number
  energy: number
  label: string
  next: boolean
}

/** The set's energy arc as a line chart with a "you are here" dot and,
 * optionally, the planned tracks' energies along the way. */
export function ArcChart({
  points,
  at,
  marks = [],
  width = 300,
  height = 72,
  className = "set-arc",
}: {
  points: { fraction: number; energy: number; phase: SetPhase }[]
  at: number | null
  marks?: ArcMark[]
  width?: number
  height?: number
  className?: string
}) {
  const pad = 6
  const x = (f: number) => pad + f * (width - pad * 2)
  const y = (e: number) => height - pad - ((e - 1) / 9) * (height - pad * 2)
  const line = points
    .map((p) => `${x(p.fraction).toFixed(1)},${y(p.energy).toFixed(1)}`)
    .join(" ")
  const here =
    at === null
      ? null
      : points.reduce((a, b) =>
          Math.abs(b.fraction - at) < Math.abs(a.fraction - at) ? b : a
        )
  // Phase boundaries as faint vertical rules.
  const bounds = points.filter(
    (p, i) => i > 0 && p.phase !== points[i - 1].phase
  )
  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={
        here
          ? `Set energy arc; now in ${phaseLabel(here.phase)}, energy ${here.energy.toFixed(1)}`
          : "Set energy arc"
      }
    >
      {bounds.map((p) => (
        <line
          key={p.fraction}
          x1={x(p.fraction)}
          x2={x(p.fraction)}
          y1={pad}
          y2={height - pad}
          className="set-arc-bound"
        />
      ))}
      {at !== null && (
        <rect
          x={pad}
          y={pad}
          width={Math.max(0, x(at) - pad)}
          height={height - pad * 2}
          className="set-arc-played"
        />
      )}
      <polyline points={line} className="set-arc-line" />
      {marks.map((mark) => (
        <circle
          key={mark.id}
          cx={x(mark.fraction)}
          cy={y(mark.energy)}
          r={mark.next ? 4.5 : 3.5}
          className="set-arc-mark"
          data-next={mark.next || undefined}
        >
          <title>{mark.label}</title>
        </circle>
      ))}
      {here && at !== null && (
        <circle cx={x(at)} cy={y(here.energy)} r={5} className="set-arc-here" />
      )}
    </svg>
  )
}

/**
 * The next track, then the tracks the lookahead planned after it, each with
 * where it lands on the arc and the routine and effects it would use from
 * the one before.
 */
export function useSetUpcoming() {
  const { database, automix, tracks, scopeTracks } = useDJ()
  const { out } = useTransitionPlan()
  const settings = database.session.setPlan
  const set = automix.set
  const byId = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks]
  )
  const upcoming = useMemo(() => {
    const ids = [automix.nextId, ...(set?.upcoming ?? [])].filter(
      (id): id is string => !!id
    )
    const list = ids
      .map((id) => byId.get(id))
      .filter((track): track is Track => !!track)
    let from = out.track
    return list.map((track, index) => {
      const fraction = Math.min(
        1,
        (set?.fraction ?? 0) + index * arcStep(settings, scopeTracks.length)
      )
      const goal = arcAt(settings, fraction)
      const plan = from
        ? planTransitions(from, track, 0, {
            intent: goal.intent,
            pace: goal.pace,
            fx: {
              amount: database.session.fxAmount,
              recent: database.session.recentFX,
            },
          })[0]
        : undefined
      from = track
      return {
        track,
        plan,
        fraction,
        goal: goal.energy,
        next: index === 0 && !!automix.nextId,
      }
    })
  }, [
    automix.nextId,
    set?.upcoming,
    set?.fraction,
    scopeTracks.length,
    byId,
    out.track,
    settings,
    database.session.fxAmount,
    database.session.recentFX,
  ])
  return upcoming
}

/** Whole-set planning: the arc, its settings and the next planned tracks. */
export function SetPlanner() {
  const {
    database,
    automix,
    scopeTracks,
    setSetPlan,
    pinAutomix,
    skipAutomix,
  } = useDJ()
  const settings = database.session.setPlan
  const points = useMemo(() => arcCurve(settings), [settings])
  const suggested = useMemo(() => suggestTempo(scopeTracks), [scopeTracks])
  const set = automix.set
  const target = set ?? {
    ...arcAt(settings, 0),
    fraction: null as number | null,
  }
  const upcoming = useSetUpcoming()
  return (
    <div className="set-planner">
      <label className="set-follow">
        <span>
          <strong>Follow the set</strong>
          <small>
            Energy goal, pace and tempo follow the arc instead of one setting
          </small>
        </span>
        <Switch
          checked={settings.follow}
          aria-label="Follow the set arc"
          onCheckedChange={(follow) => setSetPlan({ follow })}
        />
      </label>
      <ArcChart points={points} at={set ? set.fraction : null} />
      <p className="set-now" role="status">
        {set
          ? `Now: ${phaseLabel(set.phase)} · energy ${set.energy.toFixed(1)}${set.bpm ? ` · ${set.bpm} BPM` : ""}`
          : `Starts in ${phaseLabel(target.phase)} · energy ${target.energy.toFixed(1)}${target.bpm ? ` · ${target.bpm} BPM` : ""}`}
      </p>
      <div className="set-settings">
        <label>
          <span>Arc</span>
          <Select
            value={settings.arc}
            onValueChange={(value) => value && setSetPlan({ arc: value })}
          >
            <SelectTrigger aria-label="Set energy arc">
              <SelectValue>
                {arcOptions.find((o) => o.id === settings.arc)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {arcOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span>Length</span>
          <Select
            value={String(settings.minutes)}
            onValueChange={(value) =>
              value !== null && setSetPlan({ minutes: Number(value) })
            }
          >
            <SelectTrigger aria-label="Set length">
              <SelectValue>
                {lengths.find((l) => l.minutes === settings.minutes)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {lengths.map((length) => (
                <SelectItem key={length.minutes} value={String(length.minutes)}>
                  {length.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span>Tempo</span>
          <Select
            value={settings.tempo ? "steer" : "follow"}
            onValueChange={(value) =>
              setSetPlan({
                tempo: value === "steer" && suggested ? suggested : null,
              })
            }
          >
            <SelectTrigger aria-label="Set tempo path">
              <SelectValue>
                {settings.tempo
                  ? `${settings.tempo.start} → ${settings.tempo.peak} BPM`
                  : "Follow the tracks"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="follow">Follow the tracks</SelectItem>
              {suggested && (
                <SelectItem value="steer">
                  Steer {suggested.start} → {suggested.peak} BPM
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className="set-upcoming">
        <strong>Coming up</strong>
        {upcoming.map(({ track, plan, next }) => (
          <div key={track.id} className="set-upcoming-row">
            <div>
              <span className="set-upcoming-title">
                {next ? "Next · " : ""}
                {track.title}
              </span>
              <small>
                {[
                  track.artist,
                  track.bpm ? `${track.bpm} BPM` : null,
                  track.camelot,
                  track.energy !== null ? `energy ${track.energy}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
              {plan && (
                <small>
                  {plan.name}
                  {plan.fx?.length ? ` · ${describeFX(plan.fx)}` : ""}
                </small>
              )}
            </div>
            <div className="set-upcoming-actions">
              {!next && (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={!automix.active}
                  onClick={() => pinAutomix(track.id)}
                >
                  Play next
                </Button>
              )}
              <Button
                variant="ghost"
                size="xs"
                disabled={!automix.active}
                onClick={() => skipAutomix(track.id)}
              >
                Skip
              </Button>
            </div>
          </div>
        ))}
        {!upcoming.length && (
          <p className="muted">
            {automix.active
              ? "Planning the next tracks…"
              : "Turn on Automix to plan the next tracks against the arc."}
          </p>
        )}
      </div>
    </div>
  )
}
