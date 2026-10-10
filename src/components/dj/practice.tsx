import { beatOffset as gridOffset } from "@/lib/dj/beatgrid"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Deck, Mixer } from "./deck"
import { useDJ, useEngine } from "./provider"
import { Icon } from "./icons"
import { techniques } from "@/lib/dj/lessons"
import type { Technique } from "@/lib/dj/lessons"
import { planTransitions } from "@/lib/dj/planner"
import { formatTime } from "@/lib/dj/tracks"
import type { DeckId } from "@/lib/dj/types"

export function PracticeWorkspace({
  technique,
  onTechniqueChange,
}: {
  technique: Technique
  onTechniqueChange: (id: string) => void
}) {
  const {
      engine,
      tracks,
      loadTrack,
      midi,
      completeLesson,
      database,
      notify,
      setCoachOpen,
    } = useDJ(),
    state = useEngine()
  const [outId, setOutId] = useState<DeckId>("A")
  const inId = outId === "A" ? "B" : "A",
    out = state[outId],
    incoming = state[inId]
  const plans =
    out.track && incoming.track
      ? planTransitions(out.track, incoming.track)
      : []
  const plan =
    plans.find(
      (p) =>
        p.id ===
        (technique.id === "bass"
          ? "bass"
          : technique.id === "cut"
            ? "cut"
            : "blend")
    ) ?? plans.at(0)
  const beat = 60 / (out.track?.bpm ?? 120),
    offset = gridOffset(out.track)
  const beats = Math.max(0, (out.position - offset) / beat)
  const phraseBeat = beats % 64,
    bar = Math.floor(phraseBeat / 4) + 1,
    count = Math.floor(beats % 4) + 1
  const barsUntil = Math.ceil((64 - phraseBeat) / 4)
  const bpmA = (out.track?.bpm ?? 0) * out.rate,
    bpmB = (incoming.track?.bpm ?? 0) * incoming.rate
  const incomingBeats =
    ((incoming.position - gridOffset(incoming.track)) *
      (incoming.track?.bpm ?? 120)) /
    60
  const beatError = ((((incomingBeats - beats + 2) % 4) + 4) % 4) - 2
  const aligned = Math.abs(beatError) < 0.2
  const matched =
    !!out.track?.bpm && !!incoming.track?.bpm && Math.abs(bpmA - bpmB) < 0.5
  const fade = state.channelMix
    ? incoming.volume / Math.max(0.0001, out.volume + incoming.volume)
    : outId === "A"
      ? state.crossfade
      : 1 - state.crossfade
  const both = out.playing && incoming.playing
  const twoBass =
    both && fade > 0.1 && fade < 0.9 && out.low > -3 && incoming.low > -3
  const done = incoming.playing && !out.playing && fade > 0.9
  let headline = `Listen to ${outId}. Count the downbeat.`,
    instruction =
      "Start practice, then launch the incoming deck on the next phrase. Use faders and EQ to complete the mix."
  if (out.playing && !incoming.playing) {
    headline = `New 16-bar phrase in ${barsUntil} ${barsUntil === 1 ? "bar" : "bars"}.`
    instruction = `Prepare deck ${inId} at its entry cue. Match tempo, count 1–2–3–4 and start it on beat one. Starting together lets the tracks’ structural changes arrive together.`
  }
  if (both) {
    headline = !matched
      ? "Listen for drifting kicks."
      : !aligned
        ? `Deck ${inId} is ${beatError > 0 ? "ahead" : "behind"} on the estimated beat grid.`
        : twoBass
          ? "Give one bassline ownership."
          : fade > 0.9
            ? `Finish: stop deck ${outId}.`
            : "Blend the grooves. Keep counting."
    instruction = !matched
      ? "Adjust the incoming tempo until kicks stay together. Jog the wheel to nudge its timing; BPM matching alone does not guarantee the beats or phrases are aligned."
      : !aligned
        ? `Nudge deck ${inId} ${beatError > 0 ? "slower" : "faster"} and listen for kicks landing together. Estimated offset: ${Math.abs(beatError).toFixed(2)} beats. Correct tempo to prevent drift, then phase to align the hits.`
        : twoBass
          ? `Reduce deck ${inId} LOW. At a phrase boundary, lower ${outId} LOW and restore ${inId} LOW. Two strong basslines can mask each other and overload the low end.`
          : fade > 0.9
            ? "The incoming track now owns the mix. Stop the outgoing track and listen for a clean groove, without an extra kick or lingering melody."
            : `Blend over ${plan?.bars ?? 16} bars. Exchange bass on beat one of a phrase. Listen for vocals and melodies competing; make space with the mid EQ or shorten the overlap.`
  }
  if (done) {
    headline = "Handoff complete. Listen back to your choices."
    instruction =
      "Was the new groove clear? Did the bass change deliberately? Use the steps below to reflect, then mark the lesson practiced. Controller feedback describes timing and control movements, not sound quality."
  }
  const startPractice = async () => {
    if (!engine || !plan || !out.track || !incoming.track) return
    engine.pause(outId)
    engine.pause(inId)
    engine.setFX(outId, {
      type: technique.id === "reverb" ? "reverb" : "echo",
      enabled: false,
    })
    engine.setFX(inId, { enabled: false })
    engine.loop(outId, null)
    engine.loop(inId, null)
    engine.setParam(outId, "low", 0)
    engine.setParam(inId, "low", technique.id === "bass" ? -12 : 0)
    engine.setParam(outId, "volume", 0.8)
    engine.setParam(inId, "volume", 0.8)
    engine.setCrossfade(outId === "A" ? 0 : 1)
    if (plan.beatmatch) engine.setParam(inId, "rate", plan.rate * out.rate)
    engine.seek(outId, Math.max(0, plan.outStart - beat * 16))
    engine.seek(inId, plan.inStart)
    await engine.play(outId)
    notify(
      `Deck ${outId} is playing. Launch ${inId} on the next phrase, then follow the highlighted zones.`
    )
  }
  if (
    out.playing &&
    (technique.id === "echo" ||
      technique.id === "reverb" ||
      technique.id === "roll")
  ) {
    headline =
      technique.id === "echo"
        ? `Give deck ${outId} a musical exit.`
        : technique.id === "reverb"
          ? "Let the final chord breathe."
          : "Build tension, then return to the groove."
    instruction =
      technique.id === "echo"
        ? `In FX UNIT ${outId}, choose a beat length and press Echo out on a final hit. It captures one echo interval, stops the dry source, and leaves a fading tail. Launch ${inId} on the intended downbeat. Listen for the tail masking its vocals.`
        : technique.id === "reverb"
          ? `Choose Room reverb in FX UNIT ${outId}, turn FX on and raise Send gently. Fade the outgoing channel after a sparse chord or vocal. The post-fader tail carries the atmosphere while deck ${inId} takes over.`
          : `Open deck ${outId} Loops. Hold a Slip roll pad, shorten the repetition, then release on a downbeat. The hidden timeline keeps advancing and release returns to where the track would have been.`
  }
  const steps = [
    {
      title: "Prepare",
      text: "Choose a clean entry cue. Listen for beat one.",
      checked: !!plan && !out.loading && !incoming.loading,
    },
    {
      title: "Match",
      text: "Set effective tempo, then align beats by ear.",
      checked: matched && aligned,
    },
    {
      title: "Blend",
      text: "Launch on a phrase; make space with EQ.",
      checked: both && !twoBass,
    },
    {
      title: "Resolve",
      text: "Let the new groove take over; stop the old deck.",
      checked: done,
    },
  ]
  const zone = (id: DeckId) =>
    plan
      ? id === outId
        ? {
            start: plan.outStart,
            end: plan.outStart + plan.duration,
            label: "EXIT / BLEND ZONE",
          }
        : {
            start: plan.inStart,
            end: plan.inStart + plan.duration * plan.rate,
            label: "ENTER / BLEND ZONE",
          }
      : undefined
  return (
    <div className="practice-workspace">
      <div className="practice-toolbar">
        <div>
          <h1>Learn & play</h1>
          <p>Mix real tracks while the lesson follows your hands.</p>
        </div>
        <Select
          value={technique.id}
          onValueChange={(value) => value && onTechniqueChange(value)}
        >
          <SelectTrigger aria-label="Practice lesson">
            <SelectValue>{technique.name}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {techniques.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} · Level {t.level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={() => void startPractice()}
          disabled={
            !engine ||
            !plan ||
            out.loading ||
            incoming.loading ||
            !technique.practice
          }
        >
          <Icon name="play" />
          Start guided practice
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            engine?.pause("A")
            engine?.pause("B")
          }}
        >
          Stop both
        </Button>
      </div>
      {!technique.practice && (
        <p className="practice-study-note">
          This performance technique is available to study. Its specialized
          audio tools are planned; you can still practice phrasing, tempo and EQ
          with these decks.
        </p>
      )}
      <Card className="practice-coach">
        <div className="practice-count">
          <span>BEAT</span>
          <strong>{count}</strong>
          <span>BAR {bar} / 16</span>
        </div>
        <div className="practice-guidance">
          <div>
            <Badge variant="outline">
              {both
                ? "BOTH DECKS PLAYING"
                : done
                  ? "HANDOFF COMPLETE"
                  : "LIVE GUIDANCE"}
            </Badge>
            <Badge variant="secondary">
              {midi.connected ? "FLX4 · MANUAL MIXING" : "ON-SCREEN MIXER"}
            </Badge>
          </div>
          <h2>{headline}</h2>
          <p>{instruction}</p>
        </div>
        <Button variant="ghost" onClick={() => setCoachOpen(true)}>
          <Icon name="book" />
          Coach
        </Button>
      </Card>
      <div className="practice-track-selectors">
        {(["A", "B"] as DeckId[]).map((id) => (
          <div key={id}>
            <span className={id === "A" ? "text-lime" : "text-orange"}>
              DECK {id}
            </span>
            <Select
              value={state[id].track?.id ?? ""}
              onValueChange={(value) => {
                const track = tracks.find((t) => t.id === value)
                if (track) void loadTrack(id, track)
              }}
            >
              <SelectTrigger aria-label={`Practice deck ${id} track`}>
                <SelectValue>
                  {state[id].track?.title ?? "Choose track"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {tracks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                    {t.source === "local" ? " · local" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <Select
          value={outId}
          onValueChange={(value) => value && setOutId(value)}
        >
          <SelectTrigger aria-label="Practice transition direction">
            <SelectValue>
              {outId} → {inId}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="A">A → B</SelectItem>
            <SelectItem value="B">B → A</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="practice-zone-legend">
        <span>
          <i className="bg-lime" /> {outId}: exit{" "}
          {formatTime(plan?.outStart ?? 0)}
        </span>
        <span>
          <i className="bg-orange" /> {inId}: enter{" "}
          {formatTime(plan?.inStart ?? 0)}
        </span>
        <span>
          Shaded waveforms show the suggested overlap. Strong grid lines mark
          16/32-bar phrases; positions and key estimates need your ears.
        </span>
      </div>
      <section
        className="performance-grid"
        aria-label="Learning decks and mixer"
      >
        <Deck id="A" zone={zone("A")} learning />
        <Mixer />
        <Deck id="B" zone={zone("B")} learning />
      </section>
      <div className="practice-steps">
        {steps.map((step, i) => (
          <Card key={step.title}>
            <span className={step.checked ? "text-lime" : "muted"}>
              {step.checked ? "✓" : `0${i + 1}`} · {step.title}
            </span>
            <p>{step.text}</p>
          </Card>
        ))}
      </div>
      <Card className="practice-explanation">
        <div>
          <Badge variant="outline">WHY IT WORKS MUSICALLY</Badge>
          <h2>{technique.name}</h2>
          <p>{technique.why}</p>
          <Progress
            value={(steps.filter((s) => s.checked).length / steps.length) * 100}
          />
          <small>
            Progress reflects deck state; beat alignment and sound quality
            require listening.
          </small>
        </div>
        <div>
          <h3>Try these movements</h3>
          <ol>
            {technique.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="text-orange">Listen out for: {technique.avoid}</p>
          <Button
            variant="outline"
            onClick={() => completeLesson(technique.id)}
          >
            {database.completedLessons.includes(technique.id)
              ? "Practiced ✓"
              : "Mark lesson practiced"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
