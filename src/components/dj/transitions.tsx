import { lazy, Suspense, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Link } from "@tanstack/react-router"
import { techniqueReadiness } from "@/lib/dj/planner"
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
      setTransitionTechnique,
      setTransitionCue,
    } = useDJ(),
    state = useEngine()
  const { outId, inId, out, incoming, plans, plan, outCue, inCue } =
    useTransitionPlan()
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
            value={database.session.mixIntent}
            onValueChange={(value) => value && setMixIntent(value)}
          >
            <SelectTrigger aria-label="Automix energy goal">
              <SelectValue>
                {database.session.mixIntent === "lift"
                  ? "Lift the energy"
                  : database.session.mixIntent === "ease"
                    ? "Ease the energy"
                    : "Maintain the groove"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="maintain">Maintain the groove</SelectItem>
              <SelectItem value="lift">Lift the energy</SelectItem>
              <SelectItem value="ease">Ease the energy</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
                      </small>
                    </span>
                    <span className="choice-rank">
                      {index === 0 ? "TOP" : `#${index + 1}`}
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
                    <Icon name={item.plan ? "check" : "info"} size={16} />
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
                  ? state[inId].keyLock
                    ? "key lock preserves pitch during tempo matching"
                    : "enable key lock to preserve pitch during tempo matching"
                  : "audition the arrangement"}
                . Details in Why & steps.
              </span>
            </p>
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
  const { outId, inId, out, incoming, plan, plans, outCue, inCue } =
    useTransitionPlan()
  const state = useEngine()
  if (!coachOpen) return null
  const running = automix.active || state.auto
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
  const blocked = !out.track || out.loading || !scopeTracks.length
  return (
    <Card
      ref={coach}
      className="compact-coach"
      role="region"
      aria-label="Transition coach"
    >
      <div className="compact-coach-bar">
        <div className="compact-coach-title">
          <strong className="sr-only">Coach</strong>
          <Badge variant="outline">
            {outId} → {inId}
          </Badge>
        </div>
        <Select
          value={database.session.transitionTechnique ?? "auto"}
          onValueChange={(value) =>
            value && setTransitionTechnique(value === "auto" ? null : value)
          }
        >
          <SelectTrigger
            className="coach-technique-select"
            aria-label="Coach transition technique"
            disabled={
              !plans.length || running || out.loading || incoming.loading
            }
          >
            <SelectValue>{plan?.name ?? "Load both decks"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">
              Auto pick · {plans[0]?.name ?? "Best fit"}
            </SelectItem>
            {plans.map((candidate, index) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.name} ·{" "}
                {index === 0 ? "Recommended" : `#${index + 1}`} ·{" "}
                {candidate.bars ? `${candidate.bars} bars` : "Downbeat"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="xs"
          className="coach-cue-trigger"
          disabled={!plan || running}
          aria-label="Choose transition cue pair"
          onClick={() => {
            setInitialTab("cues")
            setDetailsTab("explore")
            setDetails(true)
          }}
        >
          <span>
            {outId} {formatTime(plan?.outStart ?? 0)}
          </span>
          <Icon name="right" size={12} />
          <span>
            {inId} {formatTime(plan?.inStart ?? 0)}
          </span>
        </Button>
        <div className="compact-coach-guidance">
          <span
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
                    : state.autoStatus
                  : instruction}
          </span>
          {state.auto && (
            <Progress
              value={state.transition * 100}
              aria-label="Automix progress"
            />
          )}
        </div>
        {midi.connected ? (
          <Badge
            variant="outline"
            className="coach-manual-mode"
            title="MIDI connected · automix disabled. Use the suggested cues and transition coach."
          >
            <Icon name="usb" size={14} /> Manual
          </Badge>
        ) : (
          <label
            className="coach-auto-control"
            title={
              running
                ? "Stop automix and return control to you"
                : !out.track
                  ? "Load the outgoing deck to enable automix"
                  : `Choose the best unplayed tracks from ${scopeLabel} using the selected mix controls`
            }
          >
            <span>Automix</span>
            <Switch
              checked={running}
              disabled={!engine || (!running && blocked)}
              aria-label="Enable coach automix"
              onCheckedChange={(enabled) => {
                if (enabled) void startAutomix(outId)
                else if (automix.active) stopAutomix()
                else engine?.cancelAuto()
              }}
            />
          </label>
        )}
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
            Go to zone
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
              onClick={() =>
                running
                  ? automix.active
                    ? stopAutomix()
                    : engine?.cancelAuto()
                  : plan &&
                    void engine?.startAuto(
                      outId,
                      plan,
                      outCue === null && inCue === null
                    )
              }
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
            aria-label="Hide transition coach"
            onClick={() => {
              setDetails(false)
              setCoachOpen(false)
            }}
          >
            <Icon name="close" size={16} />
          </Button>
        </div>
      </div>
    </Card>
  )
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
              <strong>Automix levels</strong>
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
