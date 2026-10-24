import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useDJ, useTransitionPlan, useEngine } from "./provider"
import { Icon } from "./icons"
import { MidiInputText } from "./midi-activity"
import { SetArcView, SetQueue } from "./set-flow"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Link } from "@tanstack/react-router"
import {
  harmonicCompatibility,
  scoreSummary,
  techniqueReadiness,
  transitionChoices,
} from "@/lib/dj/planner"
import type { MixIntent, Track, Transition } from "@/lib/dj/types"
import { describeFX } from "@/lib/dj/auto-fx"
import { phaseLabel } from "@/lib/dj/set-plan"
import { formatTime } from "@/lib/dj/tracks"
import { cueOptions } from "@/lib/dj/cue-suggestions"

const NextTrackSuggestions = lazy(() =>
  import("./transition-explorer").then((module) => ({
    default: module.NextTrackSuggestions,
  }))
)
const TransitionExplorer = lazy(() =>
  import("./transition-explorer").then((module) => ({
    default: module.TransitionExplorer,
  }))
)

export function TransitionPlanner() {
  const {
    midi,
    database,
    setMixIntent,
    setFXAmount,
    setSetPlan,
    setTransitionTechnique,
    setTransitionCue,
    automix,
    engine,
    lastTransition,
    rateTransition,
    saveTransition,
  } = useDJ()
  const { outId, inId, out, incoming, plans, plan, outCue, inCue } =
    useTransitionPlan()
  const inKeyLock = useEngine((current) => current[inId].keyLock)
  const previewing = useEngine((current) => current.previewing)
  const [tab, setTab] = useState("available")
  const [preparation, setPreparation] = useState<
    ReturnType<typeof techniqueReadiness>[number] | null
  >(null)
  const until = plan
    ? Math.max(0, (plan.outStart - out.position) / out.rate)
    : 0
  const catalog = techniqueReadiness(plans)
  return (
    <Card className="transition-panel smart-transition-panel">
      <div className="section-heading">
        <div>
          <Icon name="sparkles" />
          <h2>Transition assistant</h2>
        </div>
        <Badge variant="outline">
          {outId} → {inId}
          {midi.connected ? " · Manual" : ""}
        </Badge>
      </div>
      <div className="planner-body">
        <div className="mix-intent">
          <span>Energy goal</span>
          <Select
            value={
              database.session.setPlan.follow
                ? "set"
                : database.session.mixIntent
            }
            onValueChange={(value) =>
              value === "set"
                ? setSetPlan({ follow: true })
                : value && setMixIntent(value as MixIntent)
            }
          >
            <SelectTrigger aria-label="Automix energy goal">
              <SelectValue>
                {database.session.setPlan.follow
                  ? "Follow the set"
                  : database.session.mixIntent === "lift"
                    ? "Lift the energy"
                    : database.session.mixIntent === "ease"
                      ? "Ease the energy"
                      : "Maintain the groove"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="set">Follow the set</SelectItem>
              <SelectItem value="maintain">Maintain the groove</SelectItem>
              <SelectItem value="lift">Lift the energy</SelectItem>
              <SelectItem value="ease">Ease the energy</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mix-intent">
          <span>Auto-FX</span>
          <Select
            value={database.session.fxAmount}
            onValueChange={(value) => value && setFXAmount(value)}
          >
            <SelectTrigger aria-label="Automix effects amount">
              <SelectValue>
                {fxOptions.find((o) => o.id === database.session.fxAmount)
                  ?.label ?? "Subtle FX"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {fxOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {lastTransition && (
          <div
            className="last-transition"
            role="group"
            aria-label="Rate the last transition"
          >
            <span>
              Last mix · <strong>{lastTransition.name}</strong>
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="I liked this transition"
              aria-pressed={lastTransition.rating === 1}
              title="More like this for this style"
              onClick={() => rateTransition(1)}
            >
              👍
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="I did not like this transition"
              aria-pressed={lastTransition.rating === -1}
              title="Less of this for this style"
              onClick={() => rateTransition(-1)}
            >
              👎
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={lastTransition.saved}
              title="Use this routine first when these two tracks meet again"
              onClick={saveTransition}
            >
              {lastTransition.saved ? "Saved" : "Save for this pair"}
            </Button>
          </div>
        )}
        {database.session.setPlan.follow && automix.set && (
          <p className="estimate-note set-status" role="status">
            <Icon name="activity" size={14} />
            <span>
              Set · {phaseLabel(automix.set.phase)} · energy{" "}
              {automix.set.energy.toFixed(1)}
              {automix.set.bpm ? ` · ${automix.set.bpm} BPM` : ""}
            </span>
          </p>
        )}
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(String(value))}
          className="transition-menu"
        >
          <TabsList>
            <TabsTrigger value="available">
              For this pair · {plans.length}
            </TabsTrigger>
            <TabsTrigger value="next">Next track</TabsTrigger>
            <TabsTrigger value="catalog">Techniques · 28</TabsTrigger>
          </TabsList>
          <TabsContent value="available">
            <ScrollArea className="transition-choice-scroll">
              <div
                className="transition-choices"
                aria-label="Ranked transition routines"
              >
                {plans.map((candidate, index) => (
                  <Button
                    key={candidate.id}
                    variant="outline"
                    className={`transition-choice ${plan?.id === candidate.id ? "chosen" : ""}`}
                    aria-pressed={plan?.id === candidate.id}
                    onClick={() => setTransitionTechnique(candidate.id)}
                  >
                    <span>
                      <strong>{candidate.name}</strong>
                      <small>
                        {candidate.bars
                          ? `${candidate.bars} bars`
                          : "Downbeat cut"}{" "}
                        · Level {candidate.difficulty}
                        {candidate.keySafe ? " · Key-safe" : ""}
                      </small>
                      {index < 3 && scoreSummary(candidate) && (
                        <small className="choice-why">
                          {scoreSummary(candidate)}
                        </small>
                      )}
                    </span>
                    <span className="choice-rank">
                      {index === 0 ? "BEST" : `#${index + 1}`} ·{" "}
                      {candidate.score}
                    </span>
                  </Button>
                ))}
                {!plans.length && (
                  <p className="muted">
                    Load a track into each deck to see the options.
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="next">
            <Suspense
              fallback={
                <p className="muted" role="status">
                  Loading suggestions…
                </p>
              }
            >
              <NextTrackSuggestions />
            </Suspense>
          </TabsContent>
          <TabsContent value="catalog">
            <ScrollArea className="transition-choice-scroll">
              <div className="technique-readiness-list">
                {catalog.map((item) => (
                  <Button
                    key={item.technique.id}
                    variant="outline"
                    className="readiness-choice"
                    onClick={() => {
                      if (item.plan) {
                        setTransitionTechnique(item.plan.id)
                        setTab("available")
                      } else setPreparation(item)
                    }}
                  >
                    <span>
                      <strong>{item.technique.name}</strong>
                      <small>
                        Level {item.technique.level} · {item.status}
                      </small>
                    </span>
                    <Icon
                      name={item.status === "Ready" ? "check" : "info"}
                      size={16}
                    />
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
        <div className="transition-cue-selectors">
          {(
            [
              { deck: out, id: outId, role: "exit", selected: outCue },
              { deck: incoming, id: inId, role: "entry", selected: inCue },
            ] as const
          ).map(({ deck, id, role, selected }) => {
            const choices = deck.track
              ? cueOptions(deck.track, deck.cues, deck.cueLabels, role)
              : []
            return (
              <div key={role}>
                <span>
                  {id} {role} cue
                </span>
                <Select
                  value={selected === null ? "auto" : String(selected)}
                  onValueChange={(value) =>
                    deck.track &&
                    value &&
                    setTransitionCue(
                      deck.track.id,
                      role,
                      value === "auto" ? null : +value
                    )
                  }
                >
                  <SelectTrigger
                    aria-label={`Deck ${id} transition ${role} cue`}
                    disabled={!deck.track || deck.loading}
                  >
                    <SelectValue>
                      {selected === null
                        ? "Automatic phrase"
                        : formatTime(selected)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatic phrase</SelectItem>
                    {choices.map((cue, index) => (
                      <SelectItem
                        key={`${cue.position}:${index}`}
                        value={String(cue.position)}
                      >
                        {formatTime(cue.position)} · {cue.label}
                      </SelectItem>
                    ))}
                    {selected !== null &&
                      !choices.some((c) => c.position === selected) && (
                        <SelectItem value={String(selected)}>
                          {formatTime(selected)} · Selected cue
                        </SelectItem>
                      )}
                  </SelectContent>
                </Select>
              </div>
            )
          })}
        </div>
        {plan && (
          <>
            {plan.cuePhaseWarning && (
              <p className="estimate-note text-orange" role="status">
                {plan.cuePhaseWarning}
              </p>
            )}
            <div className="selected-routine">
              <strong>{plan.name}</strong>
              <Button
                variant="ghost"
                aria-label="Automatically choose the top-ranked transition"
                aria-pressed={!database.session.transitionTechnique}
                onClick={() => setTransitionTechnique(null)}
              >
                Auto pick <Icon name="sparkles" size={14} />
              </Button>
            </div>
            <div className="transition-cue-summary">
              <span>
                <b>{outId} EXIT IN</b>
                {formatTime(until)}
              </span>
              <Icon name="right" size={16} />
              <span>
                <b>{inId} ENTRY</b>
                {formatTime(plan.inStart)}
              </span>
              <span>
                <b>DURATION</b>
                {plan.duration / out.rate < 1
                  ? "< 1 sec"
                  : formatTime(plan.duration / out.rate)}
              </span>
            </div>
            <p className="estimate-note">
              <Icon name="info" size={14} />
              <span>
                Estimated phrases ·{" "}
                {plan.beatmatch && Math.abs(plan.rate - 1) > 0.005
                  ? inKeyLock
                    ? "key lock preserves pitch during tempo matching"
                    : "enable key lock to preserve pitch during tempo matching"
                  : "audition the arrangement"}
                . Details in Why & steps.
              </span>
            </p>
            {!!plan.fx?.length && (
              <p className="estimate-note auto-fx-note">
                <Icon name="sparkles" size={14} />
                <span>Auto-FX: {describeFX(plan.fx)}</span>
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="preview-listen"
              disabled={!engine || out.loading || incoming.loading}
              title="Render this transition and play it in your headphones (or on the master while both decks are stopped)"
              onClick={() =>
                previewing
                  ? engine?.stopPreview()
                  : void engine?.previewTransition(outId, plan)
              }
            >
              <Icon name={previewing ? "stop" : "headphones"} size={14} />
              {previewing ? "Stop preview" : "Listen to preview"}
            </Button>
          </>
        )}
      </div>
      <Dialog
        open={!!preparation}
        onOpenChange={(open) => !open && setPreparation(null)}
      >
        <DialogContent className="coach-dialog">
          <DialogTitle>{preparation?.technique.name}</DialogTitle>
          <DialogDescription>{preparation?.reason}</DialogDescription>
          <p>{preparation?.technique.why}</p>
          <div className="technique-tags">
            {preparation?.technique.labels.map((label) => (
              <Badge key={label} variant="outline">
                {label}
              </Badge>
            ))}
          </div>
          <div className="coach-steps">
            {preparation?.technique.steps.map((step, index) => (
              <div key={step}>
                <span>{index + 1}</span>
                <p>{step}</p>
              </div>
            ))}
          </div>
          <p className="estimate-note">{preparation?.technique.avoid}</p>
          <Button
            nativeButton={false}
            render={<Link to="/learn" />}
            onClick={() => setPreparation(null)}
          >
            Learn & play <Icon name="right" />
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

/** " · −2.1 dB headroom" when the mix turns a deck down audibly (≥ 1 dB),
 * so a gain dip can be told from a quiet passage. */
function headroomNote(db: number | undefined) {
  return db !== undefined && db >= 1 ? ` · −${db.toFixed(1)} dB headroom` : ""
}

const energyGoals = [
  { id: "ease", label: "Ease", arrow: "↘", hint: "Pick calmer tracks next" },
  {
    id: "maintain",
    label: "Groove",
    arrow: "→",
    hint: "Keep the energy level steady",
  },
  { id: "lift", label: "Lift", arrow: "↗", hint: "Build energy with each mix" },
] as const

const fxOptions = [
  { id: "off", label: "No FX", hint: "Automix transitions stay dry" },
  {
    id: "subtle",
    label: "Subtle FX",
    hint: "About one transition in three gets an effect: echo tails, filter builds, reverb washes",
  },
  {
    id: "expressive",
    label: "Expressive FX",
    hint: "About two in three, with risers, loop rolls, brakes, gates and flangers",
  },
] as const

const paceOptions = [
  {
    id: "quick",
    label: "Quick",
    hint: "Mix out after the first drop · fast, party-style set",
  },
  {
    id: "dj",
    label: "DJ",
    hint: "Mix out after the second drop · mid-track mixes like a club DJ",
  },
  {
    id: "full",
    label: "Full",
    hint: "Play each track to its outro before mixing",
  },
] as const

/** Quick tempo / key / energy fit chips for the outgoing → next pair. */
function compatibility(out: Track, next: Track, outRate: number) {
  const chips: { label: string; fit: "good" | "ok" | "poor"; hint: string }[] =
    []
  if (out.bpm && next.bpm) {
    const gap = (next.bpm / (out.bpm * outRate) - 1) * 100
    chips.push({
      label: `${next.bpm.toFixed(0)} BPM ${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(1)}%`,
      fit: Math.abs(gap) <= 3 ? "good" : Math.abs(gap) <= 8 ? "ok" : "poor",
      hint: "Tempo change needed to beatmatch",
    })
  } else
    chips.push({ label: "BPM ?", fit: "ok", hint: "Tempo not analyzed yet" })
  if (out.camelot && next.camelot) {
    const harmonic = harmonicCompatibility(out.camelot, next.camelot)
    chips.push({
      label: `${out.camelot} → ${next.camelot}`,
      fit: harmonic >= 0.9 ? "good" : harmonic >= 0.5 ? "ok" : "poor",
      hint:
        harmonic >= 0.9
          ? "Harmonically compatible keys"
          : "Keys may clash · keep melodic overlap short",
    })
  } else chips.push({ label: "Key ?", fit: "ok", hint: "Key not analyzed yet" })
  const delta = (next.energy ?? 5) - (out.energy ?? 5)
  chips.push({
    label: delta > 1 ? "↗ energy" : delta < -1 ? "↘ energy" : "→ energy",
    fit: "good",
    hint: `Energy ${out.energy ?? "?"} → ${next.energy ?? "?"}`,
  })
  return chips
}

export function TransitionCoach() {
  const {
    engine,
    automix,
    startAutomix,
    stopAutomix,
    scopeTracks,
    scopeLabel,
    database,
    setTransitionTechnique,
    setMixIntent,
    setMixPace,
    setFXAmount,
    setSetPlan,
    tracks,
    coachOpen,
    setCoachOpen,
    midi,
    report,
    coachDetailsOpen: details,
    setCoachDetailsOpen: setDetails,
    setCoachDetailsTab: setDetailsTab,
  } = useDJ()
  const [initialTab, setInitialTab] = useState("recommended")
  const coach = useRef<HTMLDivElement>(null)
  const [popupTop, setPopupTop] = useState(80)
  const [expanded, setExpanded] = useState(false)
  // Phones and tablets get a slim dock; the full panel opens as a sheet.
  const compact = useCompactLayout()
  const [sheetOpen, setSheetOpen] = useState(false)
  useEffect(() => {
    if (!compact) setSheetOpen(false)
  }, [compact])
  useEffect(() => {
    if (!sheetOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !details) setSheetOpen(false)
    }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [sheetOpen, details])
  useEffect(() => {
    if (!details) return
    const position = () =>
      setPopupTop(
        Math.max(
          64,
          Math.min(
            coach.current?.getBoundingClientRect().bottom ?? 80,
            window.innerHeight - 300
          )
        ) + 6
      )
    position()
    window.addEventListener("resize", position)
    window.addEventListener("scroll", position, { passive: true })
    return () => {
      window.removeEventListener("resize", position)
      window.removeEventListener("scroll", position)
    }
  }, [details])
  const { outId, inId, out, incoming, plan, outCue, inCue } =
    useTransitionPlan()
  // Mix progress in whole percent: enough for the bar and step labels.
  const state = useEngine((current) => ({
    auto: current.auto,
    autoPlan: current.autoPlan,
    autoStatus: current.autoStatus,
    autoLevels: current.autoLevels,
    autoHeadroom: current.autoHeadroom,
    transition: Math.round(current.transition * 100) / 100,
  }))
  const preparedTrack = useMemo(
    () =>
      automix.nextId
        ? tracks.find((track) => track.id === automix.nextId)
        : null,
    [tracks, automix.nextId]
  )
  const playableCount = useMemo(
    () => scopeTracks.filter((track) => track.available !== false).length,
    [scopeTracks]
  )
  if (!coachOpen) return null
  const running = automix.active || state.auto
  // Set mode shows the arc and the planned queue instead of one next card.
  const setMode = database.session.setPlan.follow
  const barsUntil = plan
    ? Math.max(
        0,
        Math.ceil(
          ((plan.outStart - out.position) * (out.track?.bpm ?? 120)) / 240
        )
      )
    : 0
  const progress = state.auto
    ? state.transition
    : plan
      ? Math.max(0, (out.position - plan.outStart) / plan.duration)
      : 0
  const currentStep = plan?.steps.filter((step) => step.at <= progress).at(-1)
  const instruction =
    automix.phase === "complete"
      ? automix.message
      : !plan
        ? "Load both decks to plan a transition"
        : out.position > plan.outStart + plan.duration && !state.auto
          ? "Exit cue passed · select another cue"
          : !out.playing
            ? `Cue ${inId} at ${formatTime(plan.inStart)} · ${outId} exit ${formatTime(plan.outStart)}`
            : barsUntil > 0
              ? `Prepare ${inId} at ${formatTime(plan.inStart)} · start in ${barsUntil} bars`
              : (currentStep?.label ?? `Start deck ${inId}`)
  const blocked =
    !out.track || out.loading || !scopeTracks.length || midi.connected
  const next = automix.nextId
    ? preparedTrack
    : state.auto
      ? incoming.track
      : null
  const upcoming =
    next ?? (automix.phase === "selecting" ? null : incoming.track)
  const fit =
    upcoming && out.track ? compatibility(out.track, upcoming, out.rate) : []
  const approach = plan
    ? state.auto
      ? 1
      : Math.min(1, Math.max(0, out.position / Math.max(0.01, plan.outStart)))
    : 0
  const countdown = state.auto
    ? `${Math.round(state.transition * 100)}% mixed`
    : !plan
      ? ""
      : out.playing && barsUntil > 0
        ? `in ${barsUntil} bar${barsUntil === 1 ? "" : "s"}`
        : out.playing
          ? "now"
          : `${plan.bars} bars · ${plan.score}/100`
  const status =
    automix.phase === "complete"
      ? { tone: "done", label: "Done" }
      : state.auto && state.transition > 0
        ? { tone: "live", label: "Mixing" }
        : automix.phase === "selecting"
          ? { tone: "armed", label: "Choosing" }
          : running
            ? { tone: "armed", label: "Armed" }
            : { tone: "off", label: midi.connected ? "Controller" : "Off" }
  const nextTitle =
    upcoming?.title ??
    (automix.phase === "complete"
      ? "All available tracks played"
      : automix.phase === "finishing"
        ? "Final track is playing"
        : automix.phase === "selecting"
          ? "Choosing the next track…"
          : automix.active
            ? "Waiting for playback"
            : "Enable Automix to pick the next track")
  const toggleAutomix = (enabled: boolean) => {
    if (enabled) void startAutomix(outId)
    else if (automix.active) stopAutomix()
    else engine?.cancelAuto()
  }
  const mixNow = () =>
    running
      ? automix.active
        ? stopAutomix()
        : engine?.cancelAuto()
      : plan &&
        void engine?.startAuto(outId, plan, outCue === null && inCue === null)
  const panel = (
    <Card
      ref={coach}
      className="compact-coach automix-bar"
      role="region"
      aria-label="Automix and transition controls"
    >
      <div className="automix-toolbar">
        <label className="coach-auto-control">
          <strong>Automix</strong>
          <span className="automix-status" data-tone={status.tone}>
            <span className="status-dot" />
            {status.label}
          </span>
          <Switch
            checked={running}
            disabled={!engine || (!running && blocked)}
            aria-label="Enable coach automix"
            onCheckedChange={toggleAutomix}
          />
        </label>
        <div
          className="automix-energy"
          role="radiogroup"
          aria-label="Automix energy goal"
        >
          <button
            type="button"
            role="radio"
            aria-checked={database.session.setPlan.follow}
            title="Follow the set's energy arc: warm-up, build, peak and close"
            onClick={() => setSetPlan({ follow: true })}
          >
            <span aria-hidden="true">∿</span>
            Set
          </button>
          {energyGoals.map((goal) => (
            <button
              key={goal.id}
              type="button"
              role="radio"
              aria-checked={
                !database.session.setPlan.follow &&
                database.session.mixIntent === goal.id
              }
              title={goal.hint}
              onClick={() => setMixIntent(goal.id)}
            >
              <span aria-hidden="true">{goal.arrow}</span>
              {goal.label}
            </button>
          ))}
        </div>
        <div
          className="automix-energy automix-pace"
          role="radiogroup"
          aria-label="Automix play length"
        >
          {paceOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={
                !database.session.setPlan.follow &&
                database.session.mixPace === option.id
              }
              title={option.hint}
              onClick={() => setMixPace(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div
          className="automix-fx"
          title={
            fxOptions.find((o) => o.id === database.session.fxAmount)?.hint
          }
        >
          <Select
            value={database.session.fxAmount}
            onValueChange={(value) => value && setFXAmount(value)}
          >
            <SelectTrigger aria-label="Automix effects amount">
              <SelectValue>
                {fxOptions.find((o) => o.id === database.session.fxAmount)
                  ?.label ?? "Subtle FX"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {fxOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="compact-coach-actions">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Why & steps"
            title="Why & steps"
            disabled={!plan}
            onClick={() => {
              setDetailsTab("why")
              setDetails(true)
            }}
          >
            <Icon name="book" size={16} />
          </Button>
          <Button
            variant="outline"
            size="xs"
            aria-label="Go to transition zone"
            title="Seek the outgoing deck to two bars before the transition zone"
            disabled={!plan || out.loading || incoming.loading || running}
            onClick={() =>
              plan &&
              engine?.seek(
                outId,
                Math.max(0, plan.outStart - (8 * 60) / (out.track?.bpm ?? 120))
              )
            }
          >
            <Icon name="target" size={14} />
            <span className="zone-label">Go to zone</span>
          </Button>
          {!midi.connected && (
            <Button
              className={running ? "coach-stop-auto" : "coach-mix-now"}
              variant={running ? "outline" : "default"}
              size="xs"
              disabled={
                !engine ||
                (!running && (!plan || out.loading || incoming.loading))
              }
              onClick={mixNow}
            >
              <Icon name={running ? "stop" : "shuffle"} size={14} />
              {running
                ? "Stop automix"
                : outCue !== null || inCue !== null
                  ? "Mix cues"
                  : "Mix now"}
            </Button>
          )}
          <Dialog open={details} modal={false} onOpenChange={setDetails}>
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Transition coach options"
                  onClick={() => {
                    setInitialTab("recommended")
                    setDetailsTab("explore")
                  }}
                />
              }
            >
              <Icon name="more" size={16} />
            </DialogTrigger>
            <DialogContent
              showOverlay={false}
              showCloseButton={false}
              className={`coach-floating-details ${expanded ? "coach-panel-expanded" : ""}`}
              style={{ "--coach-panel-top": `${popupTop}px` } as CSSProperties}
            >
              <div className="coach-panel-heading">
                <div>
                  <span className="coach-panel-eyebrow">
                    <Icon name="sparkles" size={13} /> MIX ASSISTANT
                  </span>
                  <DialogTitle>Transition coach</DialogTitle>
                </div>
                <div className="coach-panel-window-actions">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      expanded ? "Restore coach panel" : "Expand coach panel"
                    }
                    aria-pressed={expanded}
                    title={expanded ? "Restore panel size" : "Expand panel"}
                    onClick={() => setExpanded(!expanded)}
                  >
                    <Icon name={expanded ? "minimize" : "maximize"} size={16} />
                  </Button>
                  <DialogClose
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Close transition coach"
                        title="Close panel"
                      />
                    }
                  >
                    <Icon name="close" size={18} />
                  </DialogClose>
                </div>
              </div>
              <DialogDescription className="sr-only">
                Transition choices, suggested cue pairs, and next tracks. The
                decks remain available outside this view.
              </DialogDescription>
              <CoachDetails
                initialTab={initialTab}
                onSectionChange={setInitialTab}
              />
            </DialogContent>
          </Dialog>
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              compact ? "Close Automix controls" : "Hide transition coach"
            }
            onClick={() => {
              setDetails(false)
              if (compact) setSheetOpen(false)
              else setCoachOpen(false)
            }}
          >
            <Icon name="close" size={16} />
          </Button>
        </div>
      </div>
      <div className="automix-flow" data-set={setMode || undefined}>
        <div className="automix-deck" data-deck={outId}>
          <span className="automix-eyebrow">
            {out.playing ? "NOW PLAYING" : "OUTGOING"} · DECK {outId}
          </span>
          <strong title={out.track?.title}>
            {out.track?.title ?? "Load a track"}
          </strong>
          <span className="automix-meta">
            {out.track
              ? [
                  out.track.artist,
                  out.track.bpm
                    ? `${(out.track.bpm * out.rate).toFixed(1)} BPM`
                    : null,
                  out.track.camelot,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Deck is empty"}
          </span>
        </div>
        <div className="automix-bridge" data-split={setMode || undefined}>
          {setMode && <SetArcView />}
          <div className="automix-bridge-main">
            <div className="automix-bridge-head">
              {/* The routine name doubles as the Style picker. */}
              <Select
                value={database.session.transitionTechnique ?? "auto"}
                onValueChange={(value) =>
                  value &&
                  setTransitionTechnique(value === "auto" ? null : value)
                }
              >
                <SelectTrigger
                  className="automix-style"
                  aria-label={`Transition style${state.auto ? " for the next mix" : ""}`}
                  title={
                    state.auto
                      ? "Choose the routine for the next mix"
                      : "Choose the routine, or let Auto pick the best fit"
                  }
                >
                  <SelectValue>
                    <strong>
                      {(state.auto && state.autoPlan?.name) ||
                        plan?.name ||
                        "No transition yet"}
                    </strong>
                    {!database.session.transitionTechnique && (
                      <small>Auto</small>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto pick · best fit</SelectItem>
                  {transitionChoices.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>{countdown}</span>
            </div>
            <MixTags plan={state.auto ? state.autoPlan : plan} />
            <div
              className="automix-lane"
              data-mixing={state.auto || undefined}
              style={
                {
                  "--approach": `${approach * 100}%`,
                  "--mix": `${Math.min(1, Math.max(0, progress)) * 100}%`,
                } as CSSProperties
              }
              role="progressbar"
              aria-label="Automix progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(
                (state.auto ? state.transition : approach) * 100
              )}
            >
              <span className="lane-approach" />
              <span className="lane-mix" />
            </div>
            <div className="automix-bridge-foot">
              <Button
                variant="ghost"
                size="xs"
                className="coach-cue-trigger"
                disabled={!plan || running}
                aria-label="Choose transition cue pair"
                title="Choose exit and entry cues"
                onClick={() => {
                  setInitialTab("cues")
                  setDetailsTab("explore")
                  setDetails(true)
                }}
              >
                <span>
                  {outId} out {formatTime(plan?.outStart ?? 0)}
                </span>
                <Icon name="right" size={12} />
                <span>
                  {inId} in {formatTime(plan?.inStart ?? 0)}
                </span>
              </Button>
              <span
                className="automix-guidance"
                aria-live="polite"
                title={
                  state.auto
                    ? `Channel mixing · crossfader 50%. ${state.autoLevels}`
                    : report
                      ? report.tips[0]
                      : instruction
                }
              >
                {report
                  ? `${report.title} · ${report.score}/100`
                  : automix.active && !state.auto
                    ? automix.message
                    : state.auto
                      ? state.autoStatus === "Waiting for the exit zone"
                        ? `${state.autoStatus} · ${formatTime(Math.max(0, ((state.autoPlan?.outStart ?? plan?.outStart ?? 0) - out.position) / out.rate))}`
                        : `${state.autoStatus}${headroomNote(state.autoHeadroom)}`
                      : instruction}
              </span>
            </div>
          </div>
        </div>
        {setMode ? (
          <SetQueue deck={inId} />
        ) : (
          <div
            className="automix-deck automix-next"
            data-deck={inId}
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="automix-eyebrow">
              {automix.phase === "selecting"
                ? "PREPARING"
                : next
                  ? "AUTOMIX PICK"
                  : "NEXT UP"}{" "}
              · DECK {inId}
            </span>
            <strong title={nextTitle}>{nextTitle}</strong>
            {upcoming && out.track ? (
              <span className="automix-chips">
                {fit.map((chip) => (
                  <span key={chip.label} data-fit={chip.fit} title={chip.hint}>
                    {chip.label}
                  </span>
                ))}
              </span>
            ) : (
              <span className="automix-meta">
                {`${scopeLabel} · ${playableCount} playable`}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  )
  if (!compact) return panel
  const lane = {
    "--approach": `${approach * 100}%`,
    "--mix": `${Math.min(1, Math.max(0, progress)) * 100}%`,
  } as CSSProperties
  return createPortal(
    sheetOpen ? (
      <>
        <div
          className="automix-sheet-backdrop"
          onClick={() => setSheetOpen(false)}
          aria-hidden="true"
        />
        <div
          className="automix-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Automix controls"
        >
          <button
            type="button"
            className="automix-sheet-handle"
            aria-label="Close Automix controls"
            onClick={() => setSheetOpen(false)}
          />
          {panel}
        </div>
      </>
    ) : (
      <div className="automix-dock" role="region" aria-label="Automix">
        <button
          type="button"
          className="automix-dock-summary"
          aria-label="Open Automix controls"
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
        >
          <span className="automix-status" data-tone={status.tone}>
            <span className="status-dot" />
            {status.label}
          </span>
          <span className="automix-dock-text">
            <strong>
              {state.auto
                ? (state.autoPlan?.name ?? plan?.name) || "Mixing"
                : nextTitle}
            </strong>
            <small>
              {countdown
                ? `${outId} → ${inId} · ${countdown}`
                : `${outId} → ${inId}`}
              <VocalChip
                clash={(state.auto ? state.autoPlan : plan)?.vocalClash}
              />
            </small>
          </span>
          <span
            className="automix-lane automix-dock-lane"
            data-mixing={state.auto || undefined}
            style={lane}
            aria-hidden="true"
          >
            <span className="lane-approach" />
            <span className="lane-mix" />
          </span>
          <Icon name="down" size={14} className="automix-dock-chevron" />
        </button>
        <Switch
          checked={running}
          disabled={!engine || (!running && blocked)}
          aria-label="Enable coach automix"
          onCheckedChange={toggleAutomix}
        />
        {!midi.connected && (
          <Button
            size="icon-sm"
            variant={running ? "outline" : "default"}
            className={running ? "coach-stop-auto" : "coach-mix-now"}
            disabled={
              !engine ||
              (!running && (!plan || out.loading || incoming.loading))
            }
            aria-label={running ? "Stop automix" : "Mix now"}
            title={running ? "Stop automix" : "Mix now"}
            onClick={mixNow}
          >
            <Icon name={running ? "stop" : "shuffle"} size={16} />
          </Button>
        )}
      </div>
    ),
    document.body
  )
}

/** Genre pair, tempo journey and vocal overlap of the planned mix. */
function MixTags({ plan }: { plan: Transition | null | undefined }) {
  if (!plan) return null
  const journey = plan.tempoRamp
    ? `Tempo ramp ${plan.tempoRamp.bars} bars`
    : plan.tempoRelation === 2
      ? "Half-time mix"
      : plan.tempoRelation === 0.5
        ? "Double-time mix"
        : !plan.beatmatch && plan.execution !== "cut"
          ? "Native tempos"
          : null
  return (
    <div className="automix-tags">
      {plan.genre && (
        <span
          className="mix-tag"
          data-tone={plan.crossGenre ? "jump" : undefined}
          title={
            plan.crossGenre
              ? "Different mixing styles: bridging transitions are preferred"
              : "Mixing style for this pair"
          }
        >
          {plan.crossGenre ? "Genre jump · " : ""}
          {plan.genre}
        </span>
      )}
      {journey && (
        <span
          className="mix-tag"
          title={plan.reasons.find((r) => /tempo|time/i.test(r))}
        >
          {journey}
        </span>
      )}
      <VocalChip clash={plan.vocalClash} />
    </div>
  )
}

/** Vocal overlap of the planned mix: clear, some, or a clash. */
function VocalChip({ clash }: { clash: number | null | undefined }) {
  if (clash === null || clash === undefined) return null
  const percent = Math.round(clash * 100)
  const tone = clash < 0.08 ? "good" : clash < 0.25 ? "ok" : "poor"
  return (
    <span
      className="vocal-chip"
      data-fit={tone}
      title="Estimated overlap of vocals or lead melodies during this mix"
    >
      {tone === "good" ? "Vocals clear" : `Vocal clash ${percent}%`}
    </span>
  )
}

/** True on phones and tablets (≤ 900 px wide); false during server render. */
function useCompactLayout() {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)")
    const changed = () => setCompact(query.matches)
    changed()
    query.addEventListener("change", changed)
    return () => query.removeEventListener("change", changed)
  }, [])
  return compact
}

function CoachDetails({
  initialTab,
  onSectionChange,
}: {
  initialTab: string
  onSectionChange: (tab: string) => void
}) {
  const {
    coachDetailsTab: detailsTab,
    setCoachDetailsTab,
    setCoachDetailsOpen,
    setLayout,
    setTransitionPreview,
    midi,
    report,
    clearReport,
    automix,
    resetAutomixHistory,
  } = useDJ()
  const { outId, inId, out, incoming, plan } = useTransitionPlan()
  const state = useEngine((current) => ({
    auto: current.auto,
    autoLevels: current.autoLevels,
    autoHeadroom: current.autoHeadroom,
  }))
  const why = (
    <>
      <p className="muted">
        {report
          ? "Feedback describes your MIDI controls and estimated timing; listen to judge the sound."
          : midi.connected
            ? "Controller mode · automix disabled · you control both decks."
            : "Practice using the decks below. Estimated grids need listening."}
      </p>
      <strong>{report ? report.title : "Why this transition works"}</strong>
      {report ? (
        <>
          <div className="feedback-score">
            <strong>
              {report.score}
              <small>/ 100</small>
            </strong>
            <Badge variant="outline">CONTROL FEEDBACK</Badge>
          </div>
          <div className="feedback-metrics">
            {[
              ["Phrase timing", report.timing],
              ["Tempo match", report.tempo],
              ["Control shaping", report.control],
            ].map(([label, score]) => (
              <div key={label}>
                <span>{label}</span>
                <Progress value={Number(score)} />
                <strong>{score}%</strong>
              </div>
            ))}
          </div>
          <div className="coach-steps">
            {report.tips.map((tip, i) => (
              <div key={tip}>
                <span>{i + 1}</span>
                <p>{tip}</p>
              </div>
            ))}
          </div>
          <Button variant="outline" onClick={clearReport}>
            Practice another transition <Icon name="right" />
          </Button>
        </>
      ) : (
        <>
          {plan && (
            <div className="why-box">
              <span className="eyebrow text-lime">
                WHY {plan.name.toUpperCase()} WORKS
              </span>
              <p>{plan.description}</p>
              <div className="technique-tags">
                {plan.labels.map((label) => (
                  <Badge key={label} variant="outline">
                    {label}
                  </Badge>
                ))}
                <Badge variant="secondary">LEVEL {plan.difficulty}</Badge>
              </div>
              <div className="transition-reasons">
                {plan.reasons.map((reason) => (
                  <div key={reason}>
                    <Icon name="check" size={14} />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {plan && (
            <div className="coach-steps">
              {[
                {
                  label: "Prepare the incoming deck",
                  detail: `Cue ${inId} at ${formatTime(plan.inStart)}. ${plan.beatmatch ? "Match the effective tempo and listen for drift." : "Keep the tempos natural; avoid forcing a long rhythmic overlap."}`,
                },
                {
                  label: "Start on the outgoing phrase",
                  detail: `Begin near ${formatTime(plan.outStart)} on ${outId}. Confirm the downbeat by ear.`,
                },
                ...plan.steps.map((step) => ({
                  label: step.label,
                  detail: step.why,
                  time: formatTime(plan.outStart + step.at * plan.duration),
                })),
              ].map((step, i) => (
                <div key={`${i}-${step.label}`}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <div className="coach-step-detail">
                    <strong>{step.label}</strong>
                    {"time" in step && (
                      <time>
                        {step.time} · {outId}
                      </time>
                    )}
                    <p>{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {state.auto && state.autoLevels && (
            <div className="coach-automix-note">
              <strong>Automix levels{headroomNote(state.autoHeadroom)}</strong>
              <p>{state.autoLevels}</p>
              <p>
                Crossfader at 50% · channel faders and EQ perform the handoff.
              </p>
            </div>
          )}
          {!!plan?.warnings.length && (
            <div className="coach-plan-warnings">
              <strong>Listen for</strong>
              {plan.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}
          <div className="controller-input">
            <span
              className={`status-dot ${midi.connected ? "connected" : ""}`}
            />
            {midi.connected ? (
              <MidiInputText />
            ) : (
              "Connect a controller to receive MIDI feedback"
            )}
          </div>
          {midi.connected && (
            <p className="muted text-xs">
              For controller feedback, play both decks and complete a manual
              handoff.
            </p>
          )}
        </>
      )}
    </>
  )
  return (
    <>
      <div className="coach-selected-summary">
        <div className="coach-selected-recipe">
          <span className="coach-panel-eyebrow">CURRENT PLAN</span>
          <strong>{plan?.name ?? "Load both decks"}</strong>
        </div>
        <div className="coach-selected-deck">
          <span>{outId} · OUTGOING</span>
          <strong title={out.track?.title}>
            {out.track?.title ?? "No track loaded"}
          </strong>
          <time>
            {plan ? `${formatTime(plan.outStart)} exit` : "Select a transition"}
          </time>
        </div>
        <Icon name="right" size={16} />
        <div className="coach-selected-deck">
          <span>{inId} · INCOMING</span>
          <strong title={incoming.track?.title}>
            {incoming.track?.title ?? "No track loaded"}
          </strong>
          <time>
            {plan ? `${formatTime(plan.inStart)} entry` : "Select a transition"}
          </time>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!plan || out.loading || incoming.loading}
          onClick={() => {
            setLayout("parallel")
            setTransitionPreview(true)
            setCoachDetailsOpen(false)
          }}
        >
          Preview <Icon name="right" size={13} />
        </Button>
      </div>
      <div className="coach-floating-body">
        <Suspense
          fallback={
            <p className="muted" role="status">
              Loading transition cues…
            </p>
          }
        >
          <TransitionExplorer
            initialTab={initialTab}
            value={detailsTab === "why" ? "why" : initialTab}
            onTabChange={(tab) => {
              setCoachDetailsTab(tab === "why" ? "why" : "explore")
              if (tab !== "why") onSectionChange(tab)
            }}
            why={why}
            history={
              automix.playedIds.length > 0 && (
                <div className="coach-played-history">
                  <span>
                    {automix.playedIds.length} played · skipped by Automix
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={automix.active}
                    title="Allow played tracks to be selected again"
                    onClick={resetAutomixHistory}
                  >
                    Reset history
                  </Button>
                </div>
              )
            }
          />
        </Suspense>
      </div>
    </>
  )
}
