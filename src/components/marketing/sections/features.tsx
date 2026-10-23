import type { CSSProperties, ReactNode } from "react"
import { cn } from "@/lib/utils"

// Hot-cue colors from the studio themes (src/themes.css --hot-1 … --hot-8).
const HOT = [
  "#f08a5d",
  "#e9c46a",
  "#8fbf6a",
  "#5ec2c8",
  "#6f9ef0",
  "#a689f0",
  "#e47fb4",
  "#e46f6f",
]

function PadsViz() {
  return (
    <div className="viz viz-pads" aria-hidden="true">
      {HOT.map((c, i) => (
        <span key={c} style={{ background: c }}>
          {i + 1}
        </span>
      ))}
    </div>
  )
}

function KnobsViz() {
  return (
    <div className="viz viz-knobs" aria-hidden="true">
      {[
        ["Echo", 0.65],
        ["Reverb", 0.4],
        ["Filter", 0.8],
      ].map(([name, v]) => (
        <span key={name as string} style={{ "--v": v } as CSSProperties}>
          <i />
          {name}
        </span>
      ))}
    </div>
  )
}

function SyncViz() {
  return (
    <div className="viz viz-sync" aria-hidden="true">
      <div className="beats beats-a">
        {Array.from({ length: 8 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="beats beats-b">
        {Array.from({ length: 8 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <span className="sync-chip">SYNC</span>
    </div>
  )
}

function LibraryViz() {
  return (
    <div className="viz viz-library" aria-hidden="true">
      {[
        ["EDM Detection Mode", "128", "8B", 4],
        ["The Lift", "133", "8A", 5],
        ["Inspired", "120", "5A", 2],
      ].map(([name, bpm, key, energy]) => (
        <div key={name as string} className="lib-row">
          <span className="lib-name">{name}</span>
          <span className="lib-bpm">{bpm}</span>
          <span className="lib-key">{key}</span>
          <span className="lib-energy">
            {Array.from({ length: 5 }, (_, i) => (
              <i key={i} className={cn(i < (energy as number) && "on")} />
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

function RecordViz() {
  return (
    <div className="viz viz-record" aria-hidden="true">
      <span className="rec">
        <i />
        REC 12:48
      </span>
      <div className="rec-wave">
        {Array.from({ length: 28 }, (_, i) => (
          <i
            key={i}
            style={{ height: `${30 + Math.abs(Math.sin(i * 1.3)) * 70}%` }}
          />
        ))}
      </div>
    </div>
  )
}

function ControllerViz() {
  return (
    <svg className="viz viz-flx4" viewBox="0 0 320 120" aria-hidden="true">
      <rect x="2" y="2" width="316" height="116" rx="14" className="body" />
      <circle cx="62" cy="52" r="34" className="jog-a" />
      <circle cx="62" cy="52" r="8" className="hub" />
      <circle cx="258" cy="52" r="34" className="jog-b" />
      <circle cx="258" cy="52" r="8" className="hub" />
      <rect x="128" y="14" width="64" height="74" rx="6" className="mixer" />
      {[142, 160, 178].map((x) => (
        <line key={x} x1={x} x2={x} y1="26" y2="76" className="fader" />
      ))}
      <rect x="140" y="96" width="40" height="6" rx="3" className="xfader" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect
            x={30 + i * 17}
            y="96"
            width="13"
            height="13"
            rx="3"
            style={{ fill: HOT[i] }}
          />
          <rect
            x={222 + i * 17}
            y="96"
            width="13"
            height="13"
            rx="3"
            style={{ fill: HOT[i + 4] }}
          />
        </g>
      ))}
    </svg>
  )
}

type Tile = {
  tag: string
  title: string
  body: string
  viz: ReactNode
  wide?: boolean
}

const tiles: Tile[] = [
  {
    tag: "Pads",
    title: "Hot cues & loops",
    body: "Eight pads a deck. Jump to the drop, loop the best bit, roll a stutter.",
    viz: <PadsViz />,
  },
  {
    tag: "FX",
    title: "Effects that sound good",
    body: "Beat-synced echo, room reverb and filters, plus one-button echo outs.",
    viz: <KnobsViz />,
  },
  {
    tag: "Library",
    title: "Your crates, from your USB",
    body: "Connect a folder. BPM, key and energy get worked out on your computer. Nothing is uploaded.",
    viz: <LibraryViz />,
    wide: true,
  },
  {
    tag: "Sync",
    title: "One button to lock the beat",
    body: "Sync matches tempo and bar. Key lock stops vocals going chipmunk.",
    viz: <SyncViz />,
  },
  {
    tag: "Record",
    title: "Record the mix",
    body: "Play your set, download it and send it to your friends.",
    viz: <RecordViz />,
  },
  {
    tag: "FLX4",
    title: "Plug in a DDJ-FLX4",
    body: "Pads, jogs, Beat FX and lights work straight away, and the coach switches to hands-on guidance.",
    viz: <ControllerViz />,
    wide: true,
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="site-section site-band">
      <div className="site-wrap">
        <div className="section-head">
          <p className="site-eyebrow">Everything in the box</p>
          <h2>A real DJ setup. Minus the setup.</h2>
        </div>
        <div className="bento">
          <article className="bento-hero site-card">
            <span className="site-tag">Assistant</span>
            <h3>See every way to mix these two tracks</h3>
            <p>
              For each pair, Cue ranks the moves that fit, marks the entry and
              exit on both waveforms and explains why.
            </p>
            <img
              src="/marketing/transition.webp"
              alt="Parallel waveforms with suggested entry and exit cues next to the transition assistant's ranked list of moves"
              loading="lazy"
            />
          </article>
          {tiles.map((t) => (
            <article
              key={t.title}
              className={cn("site-card bento-tile", t.wide && "bento-wide")}
            >
              {t.viz}
              <span className="site-tag">{t.tag}</span>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
