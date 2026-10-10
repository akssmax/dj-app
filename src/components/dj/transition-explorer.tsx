import { useMemo, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  cuePairPlan,
  discoverTransitions,
  upcomingPairs,
} from "@/lib/dj/transition-explorer"
import type { CuePair } from "@/lib/dj/transition-explorer"
import { planTransitions, techniqueReadiness } from "@/lib/dj/planner"
import { recommendTracks } from "@/lib/dj/library-scope"
import { formatTime } from "@/lib/dj/tracks"
import { effectiveDeckRate } from "@/lib/dj/engine"
import { useDJ, useTransitionPlan } from "./provider"
import { Icon } from "./icons"

export function NextTrackSuggestions() {
  const {
    scopeTracks,
    scopeLabel,
    libraryTab,
    database,
    setLibraryTab,
    loadTrack,
    engine,
    notify,
    selectTransitionPair,
    automix,
  } = useDJ()
  const { outId, inId, out, incoming } = useTransitionPlan()
  const played = useMemo(() => new Set(automix.playedIds), [automix.playedIds])
  // Re-score on musical bars, not each waveform paint. Live bounds are checked on load.
  const position = out.track?.bpm
    ? Math.floor(out.position / (240 / out.track.bpm)) * (240 / out.track.bpm)
    : Math.floor(out.position)
  const recommendations = useMemo(
    () =>
      recommendTracks(
        out.track,
        scopeTracks,
        incoming.track?.id,
        out.rate,
        database.session.mixIntent,
        {
          position,
          recent: database.session.recentTransitions,
          cues: database.cues,
          labels: database.cueLabels,
          technique: database.session.transitionTechnique,
          transitionCues: database.session.transitionCues,
          played,
        }
      ),
    [
      out.track,
      scopeTracks,
      incoming.track?.id,
      out.rate,
      database.session.mixIntent,
      database.session.recentTransitions,
      database.cues,
      database.cueLabels,
      database.session.transitionTechnique,
      database.session.transitionCues,
      played,
      position,
    ]
  )
  const current = useRef({ scopeTracks, outId, outTrack: out.track?.id })
  current.current = { scopeTracks, outId, outTrack: out.track?.id }
  const [reviewId, setReviewId] = useState<string | null>(null)
  return (
    <div className="coach-next-tracks">
      <div className="coach-source">
        <div>
          <strong>{scopeLabel}</strong>
          <span>
            {scopeTracks.length} tracks in this view · recommendations follow
            your filters
          </span>
        </div>
        <Select
          value={libraryTab}
          onValueChange={(value) => value && setLibraryTab(value)}
        >
          <SelectTrigger aria-label="Coach source collection">
            <SelectValue>{scopeLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {database.collections.map((collection) => (
              <SelectItem
                key={collection.id}
                value={`collection:${collection.id}`}
              >
                {collection.name} · {collection.kind}
              </SelectItem>
            ))}
            <SelectItem value="local">On this device</SelectItem>
            <SelectItem value="favorites">Favorites</SelectItem>
            <SelectItem value="queue">Automix queue</SelectItem>
            <SelectItem value="all">Library view</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="coach-next-list">
        {recommendations.map((recommendation, index) => (
          <Card key={recommendation.track.id} className="coach-next-row">
            <div className="coach-next-title">
              <Badge variant="outline">#{index + 1}</Badge>
              <div>
                <strong>{recommendation.track.title}</strong>
                <span>{recommendation.track.artist}</span>
              </div>
              <Badge variant="secondary">{recommendation.plan.name}</Badge>
            </div>
            <p>{recommendation.reason}</p>
            <div className="coach-row-actions">
              <Button
                variant="ghost"
                aria-expanded={reviewId === recommendation.track.id}
                onClick={() =>
                  setReviewId(
                    reviewId === recommendation.track.id
                      ? null
                      : recommendation.track.id
                  )
                }
              >
                Compare transitions
              </Button>
              <Button
                variant="outline"
                disabled={
                  !engine ||
                  automix.active ||
                  out.loading ||
                  incoming.loading ||
                  incoming.playing
                }
                onClick={async () => {
                  const track = recommendation.track
                  if (
                    !current.current.scopeTracks.some(
                      (t) => t.id === track.id
                    ) ||
                    current.current.outTrack !== out.track?.id ||
                    current.current.outId !== outId
                  )
                    return
                  await loadTrack(inId, track)
                  if (
                    !engine ||
                    engine.state[inId].track?.id !== track.id ||
                    engine.state.error
                  ) {
                    notify(
                      `Could not load ${track.title}. Check the deck error.`
                    )
                    return
                  }
                  if (
                    !current.current.scopeTracks.some(
                      (t) => t.id === track.id
                    ) ||
                    current.current.outTrack !== out.track?.id ||
                    current.current.outId !== outId
                  ) {
                    notify(
                      "Track loaded; the source collection changed, so its previous cue plan was not applied."
                    )
                    return
                  }
                  const source = engine.state[outId],
                    destination = engine.state[inId]
                  if (!source.track || !destination.track) return
                  const livePlan = planTransitions(
                    source.track,
                    destination.track,
                    source.position,
                    {
                      outRate: effectiveDeckRate(source),
                      incomingRate: effectiveDeckRate(destination),
                      intent: database.session.mixIntent,
                      outCue:
                        recommendation.plan.outStart >= source.position
                          ? recommendation.plan.outStart
                          : null,
                      inCue: recommendation.plan.inStart,
                    }
                  ).find((p) => p.id === recommendation.plan.id)
                  if (livePlan)
                    selectTransitionPair(
                      outId,
                      source.track.id,
                      destination.track.id,
                      livePlan
                    )
                  notify(
                    `Loaded ${track.title} on ${inId}${livePlan ? " with its suggested cue plan" : "; review a new transition plan"}. Playback remains under your control.`
                  )
                }}
              >
                Load {inId} & use cues
              </Button>
            </div>
            {reviewId === recommendation.track.id && (
              <div className="coach-next-options">
                {recommendation.choices.slice(0, 4).map(({ choice, pair }) => (
                  <div key={choice.plan.id}>
                    <strong>{choice.plan.name}</strong>
                    <span>
                      {formatTime(pair.out.position)} →{" "}
                      {formatTime(pair.incoming.position)} ·{" "}
                      {pair.bars ? `${pair.bars} bars` : "Downbeat"}
                    </span>
                    <span>{pair.reasons[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
        {!recommendations.length && (
          <p className="muted">
            {!out.track
              ? "Load an outgoing track to rank the next songs."
              : "No unplayed songs fit this view and the selected mix controls. Choose another collection, clear its filters or reset played tracks."}
          </p>
        )}
      </div>
      {incoming.playing && (
        <p className="muted">
          Pause deck {inId} before loading a recommendation.
        </p>
      )}
    </div>
  )
}

export function TransitionExplorer({
  initialTab = "recommended",
}: {
  initialTab?: string
}) {
  const {
    database,
    engine,
    notify,
    selectTransitionPair,
    setTransitionTechnique,
    setTransitionPreview,
    setLayout,
    setMixIntent,
  } = useDJ()
  const { outId, inId, out, incoming, plan, outCue, inCue } =
    useTransitionPlan()
  const [tab, setTab] = useState(initialTab),
    [techniqueId, setTechniqueId] = useState<string | null>(null)
  const [showEarlier, setShowEarlier] = useState(false),
    [count, setCount] = useState(8)
  const [exitFilter, setExitFilter] = useState("all"),
    [entryFilter, setEntryFilter] = useState("all"),
    [studyId, setStudyId] = useState<string | null>(null)
  const options = useMemo(
    () => ({
      outRate: out.rate,
      incomingRate: incoming.rate,
      intent: database.session.mixIntent,
      recent: database.session.recentTransitions,
      outCues: out.cues,
      inCues: incoming.cues,
      outLabels: out.cueLabels,
      inLabels: incoming.cueLabels,
      outCue,
      inCue,
    }),
    [
      out.rate,
      incoming.rate,
      database.session.mixIntent,
      database.session.recentTransitions,
      out.cues,
      incoming.cues,
      out.cueLabels,
      incoming.cueLabels,
      outCue,
      inCue,
    ]
  )
  const choices = useMemo(
    () =>
      out.track && incoming.track
        ? discoverTransitions(out.track, incoming.track, options)
        : [],
    [out.track, incoming.track, options]
  )
  const ranked = choices
    .map((choice) => ({
      choice,
      pair: upcomingPairs(choice, out.position).at(0),
    }))
    .sort((a, b) => (b.pair?.score ?? 0) - (a.pair?.score ?? 0))
  const selected =
    choices.find((choice) => choice.plan.id === (techniqueId ?? plan?.id)) ??
    choices.at(0)
  const pairs = (selected?.pairs ?? []).filter(
    (pair) =>
      (showEarlier || pair.out.position >= out.position - 0.01) &&
      (exitFilter === "all" || pair.out.position === +exitFilter) &&
      (entryFilter === "all" || pair.incoming.position === +entryFilter)
  )
  const catalog = techniqueReadiness(choices.map((choice) => choice.plan))
  const study = catalog.find((item) => item.technique.id === studyId)
  const usePair = (pair: CuePair, preview = false) => {
    if (!out.track || !incoming.track) return
    const candidate = cuePairPlan(out.track, incoming.track, pair, options)
    if (
      !candidate ||
      !selectTransitionPair(outId, out.track.id, incoming.track.id, candidate)
    ) {
      notify("The loaded tracks changed. Choose a current cue pair.")
      return
    }
    if (preview) {
      setLayout("parallel")
      setTransitionPreview(true)
    }
    notify(
      `${candidate.name}: ${outId} ${formatTime(candidate.outStart)} → ${inId} ${formatTime(candidate.inStart)}. Cues selected; playback stays in place.`
    )
  }
  return (
    <div className="transition-explorer">
      <div className="explorer-intent">
        <span>Energy goal</span>
        <Select
          value={database.session.mixIntent}
          onValueChange={(value) => value && setMixIntent(value)}
        >
          <SelectTrigger aria-label="Coach energy goal">
            <SelectValue>
              {database.session.mixIntent === "lift"
                ? "Lift energy"
                : database.session.mixIntent === "ease"
                  ? "Ease energy"
                  : "Maintain groove"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="maintain">Maintain groove</SelectItem>
            <SelectItem value="lift">Lift energy</SelectItem>
            <SelectItem value="ease">Ease energy</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList className="explorer-tabs">
          <TabsTrigger value="recommended">
            Transitions · {choices.length}
          </TabsTrigger>
          <TabsTrigger value="cues">Cue combinations</TabsTrigger>
          <TabsTrigger value="next">Next in collection</TabsTrigger>
          <TabsTrigger value="all">All techniques · 28</TabsTrigger>
        </TabsList>
        <TabsContent value="recommended">
          <div className="explorer-routines">
            {ranked.map(({ choice, pair }, index) => (
              <Card
                key={choice.plan.id}
                className={`explorer-routine ${plan?.id === choice.plan.id ? "chosen" : ""}`}
              >
                <div>
                  <strong>{choice.plan.name}</strong>
                  <Badge variant={index < 3 && pair ? "secondary" : "outline"}>
                    {pair
                      ? index === 0
                        ? "Recommended"
                        : `${pair.score} match`
                      : "Exit cues passed"}
                  </Badge>
                </div>
                <p>{choice.plan.description}</p>
                <span className="muted">
                  Level {choice.plan.difficulty} · {choice.pairs.length}{" "}
                  suggested combinations · {choice.exits.length} exit /{" "}
                  {choice.entries.length} entry points
                </span>
                {pair && (
                  <span>
                    {outId} {formatTime(pair.out.position)} → {inId}{" "}
                    {formatTime(pair.incoming.position)} ·{" "}
                    {pair.bars ? `${pair.bars} bars` : "Downbeat cut"}
                  </span>
                )}
                <div className="coach-row-actions">
                  <Button
                    variant="outline"
                    disabled={!pair || out.loading || incoming.loading}
                    onClick={() => pair && usePair(pair)}
                  >
                    Use recommended cues
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setTechniqueId(choice.plan.id)
                      setTab("cues")
                      setCount(8)
                      setExitFilter("all")
                      setEntryFilter("all")
                    }}
                  >
                    All cue options
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          {!choices.length && (
            <p className="muted">
              Load both decks to compare executable transitions. Next in
              collection works with an outgoing track alone.
            </p>
          )}
        </TabsContent>
        <TabsContent value="cues">
          <div className="explorer-cue-filters">
            <Select
              value={selected?.plan.id ?? ""}
              onValueChange={(value) => {
                if (!value) return
                setTechniqueId(value)
                setCount(8)
                setExitFilter("all")
                setEntryFilter("all")
              }}
            >
              <SelectTrigger aria-label="Cue technique">
                <SelectValue>
                  {selected?.plan.name ?? "Choose transition"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {choices.map((choice) => (
                  <SelectItem key={choice.plan.id} value={choice.plan.id}>
                    {choice.plan.name} · {choice.pairs.length} combinations
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              aria-pressed={showEarlier}
              onClick={() => {
                setShowEarlier(!showEarlier)
                setCount(8)
              }}
            >
              {showEarlier ? "All track positions" : "Upcoming exits only"}
            </Button>
            {(["exit", "entry"] as const).map((role) => (
              <Select
                key={role}
                value={role === "exit" ? exitFilter : entryFilter}
                onValueChange={(value) => {
                  if (value) {
                    ;(role === "exit" ? setExitFilter : setEntryFilter)(value)
                    setCount(8)
                  }
                }}
              >
                <SelectTrigger aria-label={`Coach ${role} cue filter`}>
                  <SelectValue>
                    {(role === "exit" ? exitFilter : entryFilter) === "all"
                      ? `All ${role} points`
                      : formatTime(
                          +(role === "exit" ? exitFilter : entryFilter)
                        )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All {role} points</SelectItem>
                  {(role === "exit"
                    ? (selected?.exits ?? [])
                    : (selected?.entries ?? [])
                  ).map((cue) => (
                    <SelectItem key={cue.position} value={String(cue.position)}>
                      {formatTime(cue.position)} · {cue.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
          </div>
          <p className="muted">
            {pairs.length} cue combinations. Saved cues and estimated phrase
            anchors are compared across the whole track. Choose a pair to update
            the deck waveforms; previewing does not seek playback.
          </p>
          <div className="explorer-cue-pairs">
            {pairs.slice(0, count).map((pair) => (
              <Card
                key={pair.id}
                className={`explorer-cue-pair ${outCue === pair.out.position && inCue === pair.incoming.position && plan?.id === pair.technique ? "chosen" : ""}`}
              >
                <div className="cue-pair-times">
                  <div>
                    <strong>
                      {outId} · {formatTime(pair.out.position)}
                    </strong>
                    <span>{pair.out.label}</span>
                  </div>
                  <Icon name="right" size={16} />
                  <div>
                    <strong>
                      {inId} · {formatTime(pair.incoming.position)}
                    </strong>
                    <span>{pair.incoming.label}</span>
                  </div>
                  <Badge variant="outline">{pair.score} match</Badge>
                </div>
                <p>
                  {pair.reasons.join(" · ")} ·{" "}
                  {pair.bars ? `${pair.bars} bars` : "Downbeat"} ·{" "}
                  {pair.duration < 1 ? "< 1 sec" : formatTime(pair.duration)}
                </p>
                <div className="coach-row-actions">
                  <Button
                    variant="outline"
                    disabled={out.loading || incoming.loading}
                    onClick={() => usePair(pair)}
                  >
                    Use this pair
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={out.loading || incoming.loading}
                    onClick={() => usePair(pair, true)}
                  >
                    Preview waveforms
                  </Button>
                  {pair.out.position < out.position && (
                    <span className="text-orange">
                      Exit passed · seek back to practice
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
          {!pairs.length && (
            <p className="muted">
              No future combination matches these filters. Review earlier
              positions or choose another technique.
            </p>
          )}
          {pairs.length > count && (
            <Button variant="outline" onClick={() => setCount(count + 12)}>
              Show more combinations · {pairs.length - count} remaining
            </Button>
          )}
          {plan && (
            <div className="coach-row-actions">
              {([outId, inId] as const).map((id) => (
                <Button
                  key={id}
                  variant="ghost"
                  disabled={!engine || out.loading || incoming.loading}
                  onClick={() => {
                    const outgoing = id === outId,
                      slot = engine?.saveSuggestedCue(
                        id,
                        outgoing ? plan.outStart : plan.inStart,
                        outgoing ? "EXIT" : "ENTRY"
                      )
                    notify(
                      slot != null
                        ? `Saved ${id} hot cue ${slot + 1}.`
                        : "All hot cues are occupied. Clear a pad to save another point."
                    )
                  }}
                >
                  Save {id} {id === outId ? "exit" : "entry"} as hot cue
                </Button>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="next">
          <NextTrackSuggestions />
        </TabsContent>
        <TabsContent value="all">
          <div className="explorer-catalog">
            {catalog.map((item) => (
              <Button
                key={item.technique.id}
                variant="outline"
                className="explorer-technique"
                aria-pressed={studyId === item.technique.id}
                onClick={() => {
                  setStudyId(item.technique.id)
                  if (item.plan) setTransitionTechnique(item.plan.id)
                }}
              >
                <strong>{item.technique.name}</strong>
                <span>
                  Level {item.technique.level} · {item.status}
                </span>
              </Button>
            ))}
          </div>
          {study && (
            <Card className="explorer-study">
              <strong>{study.technique.name}</strong>
              <p>{study.reason}</p>
              <p>{study.technique.why}</p>
              <div>
                {study.technique.labels.map((label) => (
                  <Badge key={label} variant="outline">
                    {label}
                  </Badge>
                ))}
              </div>
              <ol>
                {study.technique.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="text-orange">{study.technique.avoid}</p>
              <Button
                nativeButton={false}
                variant="outline"
                render={<Link to="/learn" />}
              >
                Learn & play
              </Button>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      <p className="explorer-estimates">
        <Icon name="info" size={14} />
        Match scores guide cue choice. Phrase grids, loudness and keys are
        estimates. Vocal, melody and drop sections are not detected; confirm the
        arrangement by ear.
      </p>
    </div>
  )
}
