import { Link, createFileRoute } from "@tanstack/react-router"
import { SiteLayout } from "@/components/marketing/site"

export const Route = createFileRoute("/automix-test")({
  head: () => ({
    meta: [
      { title: "Automix plays an 18-minute set — Cue" },
      {
        name: "description",
        content:
          "We let Cue's Automix mix nine electro house tracks on its own: the setlist, every transition, beat alignment, the energy path and what we fixed.",
      },
    ],
  }),
  component: AutomixTestPage,
})

type Deck = "A" | "B"
type SetTrack = {
  deck: Deck
  title: string
  version: string
  artists: string
  label: string
  bpm: number
  key: string
  energy: number
  from: number
  to: number
  /** Beatport track page; a search link when we could not confirm the page. */
  beatport: string
  confirmed: boolean
}

const search = (q: string) =>
  `https://www.beatport.com/search?q=${encodeURIComponent(q)}`

const tracks: SetTrack[] = [
  {
    deck: "A",
    title: "Throwback",
    version: "Extended Mix",
    artists: "Oomloud",
    label: "Hysteria Recs",
    bpm: 125,
    key: "2B",
    energy: 6,
    from: 0,
    to: 124.1,
    beatport: "https://www.beatport.com/track/throwback-extended-mix/9365772",
    confirmed: true,
  },
  {
    deck: "B",
    title: "Tic Toc",
    version: "Extended Mix",
    artists: "Bingo Players, Oomloud",
    label: "Hysteria Recs",
    bpm: 126,
    key: "1B",
    energy: 7,
    from: 93.3,
    to: 277,
    beatport: "https://www.beatport.com/track/tic-toc-extended-mix/9309777",
    confirmed: true,
  },
  {
    deck: "A",
    title: "Droppers",
    version: "Extended Mix",
    artists: "Brohug",
    label: "",
    bpm: 125,
    key: "12B",
    energy: 7,
    from: 246.2,
    to: 429.9,
    beatport: search("Brohug Droppers"),
    confirmed: false,
  },
  {
    deck: "B",
    title: "Dat Vibe Pt. 2",
    version: "Original Mix",
    artists: "Matroda",
    label: "Good Enuff",
    bpm: 125,
    key: "8A",
    energy: 8,
    from: 399.3,
    to: 576,
    beatport:
      "https://www.beatport.com/track/dat-vibe-pt-2-original-mix/9400467",
    confirmed: true,
  },
  {
    deck: "A",
    title: "Let It Ring",
    version: "Extended Mix",
    artists: "Damien N-Drix, STV",
    label: "SPRS",
    bpm: 125,
    key: "8A",
    energy: 6,
    from: 529.9,
    to: 660.4,
    beatport: "https://www.beatport.com/track/let-it-ring-extended-mix/9412644",
    confirmed: true,
  },
  {
    deck: "B",
    title: "Snakes",
    version: "Extended Mix",
    artists: "Sikdope",
    label: "Fly Eye Records",
    bpm: 128,
    key: "9A",
    energy: 6,
    from: 645.1,
    to: 796.2,
    beatport: search("Sikdope Snakes"),
    confirmed: false,
  },
  {
    deck: "A",
    title: "SPREAD",
    version: "feat. Goshfather · Extended Mix",
    artists: "Aylen, Goshfather",
    label: "Spinnin' Premium",
    bpm: 127,
    key: "9B",
    energy: 7,
    from: 796.2,
    to: 909.4,
    beatport:
      "https://www.beatport.com/track/spread-feat-goshfather-extended-mix/9308970",
    confirmed: true,
  },
  {
    deck: "B",
    title: "BOOM",
    version: "Extended Mix",
    artists: "Tiësto, Sevenn",
    label: "Musical Freedom",
    bpm: 123,
    key: "10B",
    energy: 7,
    from: 909.3,
    to: 1075.3,
    beatport: "https://www.beatport.com/track/boom-extended-mix/9762480",
    confirmed: true,
  },
  {
    deck: "A",
    title: "Funki",
    version: "Original Mix",
    artists: "Curbi",
    label: "Spinnin' Premium",
    bpm: 128,
    key: "10B",
    energy: 7,
    from: 1063.9,
    to: 1092,
    beatport: "https://www.beatport.com/track/funki-original-mix/9322240",
    confirmed: true,
  },
]

type Mix = {
  name: string
  from: number
  to: number
  length: string
  score: number
  goal: number
  armed: number
  /** Median and largest beat offset in ms, or null for a cut. */
  offset: [number, number] | null
  note: string
}

const mixes: Mix[] = [
  {
    name: "EQ / bass swap",
    from: 93.3,
    to: 124.1,
    length: "16 bars",
    score: 86,
    goal: 4,
    armed: 0.8,
    offset: [0, 3],
    note: "Basslines exchanged on the phrase.",
  },
  {
    name: "EQ / bass swap",
    from: 246.2,
    to: 277,
    length: "16 bars",
    score: 61,
    goal: 4.3,
    armed: 124.8,
    offset: [0, 3],
    note: "Neighbouring keys, 1B → 12B.",
  },
  {
    name: "Filter in",
    from: 399.3,
    to: 429.9,
    length: "16 bars",
    score: 82,
    goal: 4.6,
    armed: 277.7,
    offset: [0, 3],
    note: "A filter sweep hides the key change.",
  },
  {
    name: "Double drop",
    from: 529.9,
    to: 576,
    length: "24 bars",
    score: 90,
    goal: 5,
    armed: 430.8,
    offset: [0, 3],
    note: "Both drops land together.",
  },
  {
    name: "Filter transition",
    from: 645.1,
    to: 660.4,
    length: "8 bars",
    score: 83,
    goal: 5.7,
    armed: 576.9,
    offset: [0, 3],
    note: "Up 3 BPM into the build.",
  },
  {
    name: "Drop swap",
    from: 793.2,
    to: 796.2,
    length: "Cut on the drop",
    score: 94,
    goal: 6.2,
    armed: 661.3,
    offset: null,
    note: "Sweep and riser into the drop.",
  },
  {
    name: "Fake drop → real drop",
    from: 906.4,
    to: 909.4,
    length: "Cut on the drop",
    score: 89,
    goal: 6.9,
    armed: 797,
    offset: null,
    note: "A beat roll teases the drop.",
  },
  {
    name: "Loop transition",
    from: 1063.9,
    to: 1075.3,
    length: "6 bars",
    score: 75,
    goal: 7.6,
    armed: 910.1,
    offset: [0, 3],
    note: "Loops the outro while Funki comes in.",
  },
]

const SET_END = 1092
const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`

function SetTimeline() {
  const W = 1000,
    H = 150,
    L = 52,
    R = 12,
    T = 20,
    lane = 38
  const x = (s: number) => L + (s / SET_END) * (W - L - R)
  return (
    <svg
      className="test-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Nine tracks alternating between decks A and B over 18 minutes, with eight transitions"
    >
      {[0, 3, 6, 9, 12, 15, 18].map((m) => (
        <g key={m}>
          <line
            x1={x(m * 60)}
            x2={x(m * 60)}
            y1={T - 6}
            y2={T + lane * 2 + 16}
            className="test-grid"
          />
          <text x={x(m * 60)} y={H - 6} textAnchor="middle">
            {m}:00
          </text>
        </g>
      ))}
      {(["A", "B"] as const).map((deck, i) => (
        <text key={deck} x={4} y={T + i * (lane + 10) + lane / 2 + 4}>
          Deck {deck}
        </text>
      ))}
      {mixes.map((mix, i) => (
        <g key={i}>
          <rect
            x={x(mix.from) - 1}
            y={T - 6}
            width={Math.max(4, x(mix.to) - x(mix.from) + 2)}
            height={lane * 2 + 22}
            rx={3}
            className="test-band"
          >
            <title>{`${i + 1} · ${mix.name} · ${mmss(mix.from)}`}</title>
          </rect>
          <text
            x={(x(mix.from) + x(mix.to)) / 2}
            y={T - 9}
            textAnchor="middle"
            className="test-strong"
          >
            {i + 1}
          </text>
        </g>
      ))}
      {tracks.map((track) => {
        const y = T + (track.deck === "A" ? 0 : lane + 10),
          w = x(track.to) - x(track.from)
        return (
          <g key={track.title}>
            <rect
              x={x(track.from) + 1}
              y={y}
              width={Math.max(2, w - 2)}
              height={lane}
              rx={4}
              className={`test-bar deck-${track.deck}`}
            >
              <title>{`${track.artists} – ${track.title} · ${track.bpm} BPM · ${track.key} · ${mmss(track.from)}–${mmss(track.to)}`}</title>
            </rect>
            {w > 60 && (
              <text
                x={x(track.from) + 8}
                y={y + lane / 2 + 4}
                className="test-on-bar"
              >
                {track.title}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function EnergyPath() {
  const W = 1000,
    H = 220,
    L = 40,
    R = 16,
    T = 14,
    B = 30
  const x = (s: number) => L + (s / SET_END) * (W - L - R),
    y = (e: number) => T + (1 - (e - 1) / 9) * (H - T - B)
  const goals: [number, number][] = [
    ...mixes.map((m): [number, number] => [m.armed, m.goal]),
    [1079, 8.2],
  ]
  let d = `M${x(0)},${y(goals[0][1])}`
  goals.forEach(([s, g], i) => {
    if (i) d += ` L${x(s)},${y(goals[i - 1][1])} L${x(s)},${y(g)}`
  })
  d += ` L${x(SET_END)},${y(8.2)}`
  return (
    <svg
      className="test-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="The energy goal rises from 4.0 to 8.2 while the tracks' energy stays between 6 and 8"
    >
      {[2, 4, 6, 8, 10].map((e) => (
        <g key={e}>
          <line x1={L} x2={W - R} y1={y(e)} y2={y(e)} className="test-grid" />
          <text x={L - 8} y={y(e) + 4} textAnchor="end">
            {e}
          </text>
        </g>
      ))}
      {[0, 3, 6, 9, 12, 15, 18].map((m) => (
        <text key={m} x={x(m * 60)} y={H - 8} textAnchor="middle">
          {m}:00
        </text>
      ))}
      <path d={d} className="test-goal" />
      <text x={x(0) + 4} y={y(4) + 16} className="test-strong">
        Goal 4.0 · warm-up
      </text>
      <text
        x={x(SET_END) - 4}
        y={y(8.2) - 8}
        textAnchor="end"
        className="test-strong"
      >
        Goal 8.2 · peak
      </text>
      {tracks.map((track) => (
        <circle
          key={track.title}
          cx={x((track.from + track.to) / 2)}
          cy={y(track.energy)}
          r={6}
          className="test-dot"
        >
          <title>{`${track.title} · energy ${track.energy}`}</title>
        </circle>
      ))}
    </svg>
  )
}

function AutomixTestPage() {
  return (
    <SiteLayout>
      <section className="site-hero site-hero-sm">
        <div className="site-wrap site-hero-inner">
          <p className="site-eyebrow">Automix test · October 2026</p>
          <h1>
            We let Automix play an{" "}
            <span className="site-grad">18-minute set</span>.
          </h1>
          <p className="site-lede">
            Nine electro house tracks from Beatport's June 2017 Top 100, no
            hands on the decks. Here is what it played, how it mixed, and what
            we fixed along the way.
          </p>
          <nav className="site-phase-nav" aria-label="On this page">
            <a href="#setlist">Setlist</a>
            <a href="#mixes">Transitions</a>
            <a href="#energy">Energy</a>
            <a href="#fixed">What we fixed</a>
          </nav>
        </div>
      </section>

      <section className="site-section site-section-tight">
        <div className="site-wrap test-stats" aria-label="Results">
          <div className="site-card">
            <strong>8</strong>
            <span>transitions across 9 tracks and 18 minutes</span>
          </div>
          <div className="site-card test-good">
            <strong>0 ms</strong>
            <span>median beat offset between decks (largest 3 ms)</span>
          </div>
          <div className="site-card test-good">
            <strong>7 of 8</strong>
            <span>pairs in the same or a neighbouring key</span>
          </div>
          <div className="site-card">
            <strong>4.0 → 8.2</strong>
            <span>energy goal, from warm-up to the start of the peak</span>
          </div>
        </div>
      </section>

      <section id="setlist" className="site-section site-band">
        <div className="site-wrap">
          <p className="site-eyebrow">Setlist</p>
          <h2>What Automix played.</h2>
          <p className="site-sub">
            Automix chose every track and transition from a 26-track electro
            house playlist, with Set mode following a 30-minute journey and key
            lock on both decks. Support the artists: the tracks are on Beatport.
          </p>
          <div
            className="site-table-scroll test-timeline"
            tabIndex={0}
            role="region"
            aria-label="Set timeline"
          >
            <SetTimeline />
          </div>
          <ol className="test-setlist">
            {tracks.map((track, i) => (
              <li key={track.title} className="site-card">
                <span className="test-time">{mmss(track.from)}</span>
                <div>
                  <h3>
                    {track.title}
                    <small> ({track.version})</small>
                  </h3>
                  <p>
                    {track.artists}
                    {track.label && ` · ${track.label}`}
                  </p>
                  <p className="test-meta">
                    <span className={`test-deck deck-${track.deck}`}>
                      {track.deck}
                    </span>
                    {track.bpm} BPM · {track.key} · energy {track.energy}
                  </p>
                </div>
                <a
                  className="site-btn test-buy"
                  href={track.beatport}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${track.confirmed ? "Open" : "Find"} ${track.title} by ${track.artists} on Beatport`}
                >
                  {track.confirmed ? "Beatport ↗" : "Find on Beatport ↗"}
                </a>
                <span className="sr-only">Track {i + 1}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="mixes" className="site-section">
        <div className="site-wrap">
          <p className="site-eyebrow">Transitions</p>
          <h2>How each mix was made.</h2>
          <p className="site-sub">
            Each transition is Automix's top-scored routine for that pair at
            that point in the set. The beat offset is how far apart the two
            decks' beats were while both played.
          </p>
          <div
            className="site-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Transitions"
          >
            <table className="site-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">From → to</th>
                  <th scope="col">Routine</th>
                  <th scope="col">Score</th>
                  <th scope="col">Length</th>
                  <th scope="col">Beat offset</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {mixes.map((mix, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <th scope="row">
                      {tracks[i].title} → {tracks[i + 1].title}
                      <span className="cell-note">
                        {mmss(mix.from)} · {tracks[i].bpm} → {tracks[i + 1].bpm}{" "}
                        BPM · {tracks[i].key} → {tracks[i + 1].key}
                      </span>
                    </th>
                    <td>{mix.name}</td>
                    <td>{mix.score}</td>
                    <td>{mix.length}</td>
                    <td>
                      {mix.offset
                        ? `${mix.offset[0]} ms (max ${mix.offset[1]})`
                        : "Cut"}
                    </td>
                    <td className="cell-note">{mix.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="energy" className="site-section site-band">
        <div className="site-wrap">
          <p className="site-eyebrow">Set mode</p>
          <h2>The energy path.</h2>
          <p className="site-sub">
            The set's energy goal rose from warm-up through build to the start
            of the peak, on plan for the first 18 minutes of a 30-minute
            journey. This playlist has nothing below energy 6, so the warm-up
            ran hotter than its goal; Automix still played the calmer tracks
            first.
          </p>
          <div className="test-legend">
            <span>
              <i className="test-key-goal" /> Energy goal
            </span>
            <span>
              <i className="test-key-dot" /> Track energy
            </span>
          </div>
          <div
            className="site-table-scroll test-timeline"
            tabIndex={0}
            role="region"
            aria-label="Energy path"
          >
            <EnergyPath />
          </div>
        </div>
      </section>

      <section id="fixed" className="site-section">
        <div className="site-wrap test-fixed">
          <div className="site-card">
            <p className="site-eyebrow">What we fixed</p>
            <ul>
              <li>
                <strong>Trim knob jumps.</strong> After a beatmatched mix the
                new track's trim knob could sit still, then jump by up to 5 dB
                when the next mix began. It now glides with the sound.
              </li>
              <li>
                <strong>Filter exits.</strong> A filter, echo or reverb exit
                could drop the outgoing track for a split second, then burst. It
                now opens cleanly.
              </li>
            </ul>
          </div>
          <div className="site-honest">
            <h3>Still to improve</h3>
            <ul>
              <li>
                Automix turns both decks down more than it needs to during an
                overlap, so some transitions sound a little quieter than the
                tracks around them.
              </li>
              <li>
                Stem transitions were available for four of these mixes but
                didn't win on score. We're rebalancing them.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-wrap site-cta">
          <span className="site-eyebrow">Free while in beta</span>
          <h2>Let Automix mix your own tracks.</h2>
          <p>
            Bring your files. Nothing to install, and your music stays on your
            computer.
          </p>
          <div className="site-actions">
            <Link to="/app" className="site-btn site-btn-primary site-btn-lg">
              Start mixing
            </Link>
            <Link to="/compare" className="site-btn site-btn-lg">
              Compare with the pro apps
            </Link>
          </div>
          <p className="site-fine">
            Track names and links are for reference; Cue isn't affiliated with
            the artists, labels or Beatport, and no audio is hosted here.
          </p>
        </div>
      </section>
    </SiteLayout>
  )
}
