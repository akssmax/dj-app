import { useEffect, useMemo, useRef, useState } from "react"

// A 16-bar sketch of how Automix moves the faders and EQ for one transition.
// Curves are illustrative; the studio schedules the real ones on the audio clock.
type Curve = (t: number) => number
type Move = {
  id: string
  name: string
  blurb: string
  lanes: [Curve, Curve, Curve, Curve, Curve]
  steps: { bar: number; text: string }[]
}

const BARS = 16
const SECONDS = 9
const clamp = (v: number) => Math.min(1, Math.max(0, v))
const ramp = (from: number, to: number) => (t: number) =>
  clamp((t - from) / (to - from))
const fall = (from: number, to: number) => (t: number) => 1 - ramp(from, to)(t)
const step = (at: number) => (t: number) => (t >= at ? 1 : 0)
const until = (at: number) => (t: number) => (t < at ? 1 : 0)
const flat = (v: number) => () => v
const bump = (from: number, peak: number, to: number) => (t: number) =>
  t < peak ? ramp(from, peak)(t) : fall(peak, to)(t)

const laneNames = ["A volume", "A bass", "B volume", "B bass", "FX"]

const moves: Move[] = [
  {
    id: "blend",
    name: "Blend",
    blurb: "The classic. Both tracks play together for a few bars.",
    lanes: [fall(0.5, 1), flat(1), ramp(0, 0.5), flat(1), flat(0)],
    steps: [
      { bar: 1, text: "Phrase starts. B fades in under A." },
      { bar: 9, text: "Both tracks share the floor." },
      { bar: 13, text: "A slips away. B has the room." },
    ],
  },
  {
    id: "bass",
    name: "Bass swap",
    blurb: "Two kick drums fight. So only one track gets the bass at a time.",
    lanes: [fall(0.75, 1), until(0.5), ramp(0, 0.25), step(0.5), flat(0)],
    steps: [
      { bar: 1, text: "B comes in with its bass turned off." },
      { bar: 5, text: "Hats and melody blend on top." },
      { bar: 9, text: "Swap! A loses the bass, B gets it." },
      { bar: 13, text: "A fades out. Nobody noticed." },
    ],
  },
  {
    id: "echo",
    name: "Echo out",
    blurb: "A dramatic exit. A echoes away, B drops in clean.",
    lanes: [
      fall(0.6, 0.64),
      flat(1),
      step(0.75),
      flat(1),
      bump(0.45, 0.62, 0.95),
    ],
    steps: [
      { bar: 1, text: "A plays on. Echo is waiting." },
      { bar: 8, text: "Echo builds on A's last beats." },
      { bar: 11, text: "Cut A. The echo tail rings out." },
      { bar: 13, text: "B lands on the downbeat." },
    ],
  },
  {
    id: "filter",
    name: "Filter",
    blurb: "Sweep A thin and airy, then bring B in full.",
    lanes: [
      fall(0.85, 0.95),
      fall(0.15, 0.75),
      ramp(0.55, 0.8),
      flat(1),
      ramp(0.15, 0.75),
    ],
    steps: [
      { bar: 1, text: "Filter starts sweeping A." },
      { bar: 7, text: "A gets thinner. Tension builds." },
      { bar: 10, text: "B rises underneath." },
      { bar: 14, text: "Filter gone, B in full." },
    ],
  },
]

const W = 640
const LANE_H = 34
const GAP = 14
const LEFT = 0
const H = laneNames.length * (LANE_H + GAP)

function pathFor(curve: Curve, lane: number) {
  const top = lane * (LANE_H + GAP)
  const pts: string[] = []
  for (let i = 0; i <= 160; i++) {
    const t = i / 160
    const x = LEFT + t * (W - LEFT)
    const y = top + LANE_H - curve(t) * LANE_H
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return {
    line: `M${pts.join("L")}`,
    area: `M${LEFT},${top + LANE_H}L${pts.join("L")}L${W},${top + LANE_H}Z`,
  }
}

const laneColor = [
  "var(--deck-a)",
  "var(--deck-a)",
  "var(--deck-b)",
  "var(--deck-b)",
  "var(--cue)",
]

export function TransitionPlayer() {
  const [moveId, setMoveId] = useState("bass")
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [onScreen, setOnScreen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const start = useRef(0)
  // Mirrors t so play/pause resumes from the current position.
  const position = useRef(0)
  position.current = t
  const move = moves.find((m) => m.id === moveId) ?? moves[0]
  // Curves only change with the move, not with the playhead.
  const paths = useMemo(
    () => move.lanes.map((curve, i) => pathFor(curve, i)),
    [move]
  )

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (reduce.matches) {
      setT(1)
      return
    }
    setPlaying(true)
  }, [])

  // Only animate while the player is on screen.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) =>
      setOnScreen(entry.isIntersecting)
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!playing || !onScreen) return
    let frame = 0
    let last = 0
    start.current = performance.now() - position.current * SECONDS * 1000
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      // 30 fps is plenty for a 9-second sweep.
      if (now - last < 32) return
      last = now
      const next = ((now - start.current) / (SECONDS * 1000)) % 1.15
      setT(Math.min(1, next))
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, onScreen, moveId])

  const bar = Math.min(BARS, Math.floor(t * BARS) + 1)
  const current =
    [...move.steps].reverse().find((s) => bar >= s.bar) ?? move.steps[0]
  const x = LEFT + t * (W - LEFT)

  return (
    <div className="tp" ref={root}>
      <div className="tp-moves" role="radiogroup" aria-label="Transition">
        {moves.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={m.id === moveId}
            className="tp-move"
            onClick={() => {
              setMoveId(m.id)
              setT(0)
            }}
          >
            {m.name}
          </button>
        ))}
      </div>
      <p className="tp-blurb">{move.blurb}</p>
      <div className="tp-stage">
        {/* Labels live in HTML so they stay readable when the chart scales. */}
        <div className="tp-labels" aria-hidden="true">
          {laneNames.map((name, i) => (
            <span
              key={name}
              style={{
                top: `${(((i * (LANE_H + GAP) + LANE_H / 2) / H) * 100).toFixed(2)}%`,
              }}
            >
              {name}
            </span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${move.name}: ${move.steps.map((s) => s.text).join(" ")}`}
        >
          <defs>
            <clipPath id="tp-played">
              <rect x="0" y="0" width={x} height={H} />
            </clipPath>
          </defs>
          {Array.from({ length: BARS + 1 }, (_, i) => {
            const gx = LEFT + (i / BARS) * (W - LEFT)
            return (
              <line
                key={i}
                x1={gx}
                x2={gx}
                y1={0}
                y2={H - GAP}
                className={i % 4 === 0 ? "tp-grid tp-grid-bar" : "tp-grid"}
              />
            )
          })}
          {paths.map((p, i) => {
            return (
              <g key={laneNames[i]}>
                <path d={p.area} fill={laneColor[i]} opacity={0.08} />
                <path
                  d={p.line}
                  stroke={laneColor[i]}
                  className="tp-line tp-line-dim"
                />
                <g clipPath="url(#tp-played)">
                  <path d={p.area} fill={laneColor[i]} opacity={0.22} />
                  <path d={p.line} stroke={laneColor[i]} className="tp-line" />
                </g>
              </g>
            )
          })}
          <line x1={x} x2={x} y1={0} y2={H - GAP} className="tp-playhead" />
        </svg>
      </div>
      <div className="tp-footer">
        <button
          type="button"
          className="tp-play"
          onClick={() => {
            if (t >= 1) setT(0)
            setPlaying((p) => !p)
          }}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="tp-bar">
          Bar <strong>{String(bar).padStart(2, "0")}</strong> / {BARS}
        </span>
        <span className="tp-step" aria-live="polite">
          {current.text}
        </span>
      </div>
    </div>
  )
}
