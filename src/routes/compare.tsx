import { Link, createFileRoute } from "@tanstack/react-router"
import { SiteLayout } from "@/components/marketing/site"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Cue vs the pro DJ apps — Cue" },
      {
        name: "description",
        content:
          "How Cue's Automix, analysis, stems and studio compare with rekordbox, Serato DJ Pro, Traktor Pro 4, djay Pro and VirtualDJ.",
      },
    ],
  }),
  component: ComparePage,
})

type Rating = "strong" | "partial" | "missing"
type Cell = { rating: Rating; label?: string; note?: string; was?: Rating }
type Row = { feature: string; cells: Cell[]; isNew?: boolean }
type Group = { title: string; rows: Row[] }

const ratingText: Record<Rating, string> = {
  strong: "Strong",
  partial: "Partial",
  missing: "Not yet",
}
const ratingMark: Record<Rating, string> = {
  strong: "✓",
  partial: "◐",
  missing: "—",
}
const ratingClass: Record<Rating, string> = {
  strong: "cell-yes",
  partial: "cell-some",
  missing: "cell-no",
}

const strong = (note?: string, extra?: Partial<Cell>): Cell => ({
  rating: "strong",
  note,
  ...extra,
})
const partial = (note?: string, extra?: Partial<Cell>): Cell => ({
  rating: "partial",
  note,
  ...extra,
})
const missing = (note?: string, extra?: Partial<Cell>): Cell => ({
  rating: "missing",
  note,
  ...extra,
})

const automixTools = [
  "Cue Automix",
  "djay Pro · Automix AI",
  "rekordbox · Serato · Traktor auto-play",
]
const automixRows: Row[] = [
  {
    feature: "Chooses the next track",
    cells: [
      strong(
        "Ranks your library by tempo, key, energy and the set's arc; looks 2–3 tracks ahead"
      ),
      partial("Mixes the playlist or queue you give it"),
      partial("Plays your playlist in order"),
    ],
  },
  {
    feature: "Where it mixes",
    cells: [
      strong(
        "On tracked downbeats and phrases, around drops and breakdowns, avoiding vocal clashes"
      ),
      strong("AI finds intros and outros"),
      partial("Fixed crossfade length or your cue points"),
    ],
  },
  {
    feature: "Transition styles",
    cells: [
      strong(
        "25 routines: bass swap, long blend, drop swap, double drop, echo out, stem swaps and more"
      ),
      strong("Stem-based transitions with Neural Mix"),
      missing("Mostly a crossfade"),
    ],
  },
  {
    feature: "Uses stems in transitions",
    cells: [
      strong(
        "Bass swap, vocal out, instrumental in, acapella over and drum swap, once stems are prepared",
        { was: "missing" }
      ),
      strong("Separated in real time"),
      missing("Stems for manual play only"),
    ],
  },
  {
    feature: "Effects in transitions",
    cells: [
      strong(
        "Echo, filter builds, risers, reverb washes and more on the beat grid, with a Subtle or Expressive budget"
      ),
      partial("Transition effects available"),
      missing(),
    ],
  },
  {
    feature: "Tempo and key",
    cells: [
      strong(
        "Judges keys as heard after the tempo change; plans a tempo path across the set"
      ),
      strong("Sync with high-quality key lock"),
      partial("Sync; no planning across tracks"),
    ],
  },
  {
    feature: "Plans a whole set",
    cells: [
      strong(
        "Warm-up, build, peak and close on an energy curve you can see, with upcoming tracks to promote or skip"
      ),
      missing(),
      missing("Separate prep tools do this"),
    ],
  },
  {
    feature: "Explains its choice",
    cells: [
      strong("A score with reasons, plus two runners-up"),
      missing(),
      missing(),
    ],
  },
  {
    feature: "Preview before it plays",
    cells: [
      strong("Hear the planned transition in your headphones"),
      missing(),
      missing(),
    ],
  },
  {
    feature: "Proven on real sets",
    cells: [
      missing("Beta: trust your ears"),
      strong("Years of use"),
      strong("Club-tested"),
    ],
  },
]

const studioTools = ["Cue", "Pro apps"]
const studioGroups: Group[] = [
  {
    title: "Analysis",
    rows: [
      {
        feature: "BPM and beatgrid",
        cells: [
          strong(
            "A beat-tracking model finds beats and downbeats; one tempo per track",
            { was: "partial" }
          ),
          strong("Dynamic grids for live drummers"),
        ],
      },
      {
        feature: "Key",
        cells: [
          strong("Tuning-corrected, a key per section, and your override", {
            was: "partial",
          }),
          strong(),
        ],
      },
      {
        feature: "Sections and phrases",
        cells: [
          strong("Intro, build, drop, breakdown and outro on the right bar", {
            was: "partial",
          }),
          strong("rekordbox phrase analysis is the reference"),
        ],
      },
      {
        feature: "Fix what analysis got wrong",
        isNew: true,
        cells: [
          strong("Set the key, beat 1 or sections; Automix trusts your fixes"),
          strong("Grid and key editing"),
        ],
      },
      {
        feature: "Stems",
        cells: [
          partial(
            "Vocals, drums, bass and melody on your device, prepared before you play",
            { was: "missing" }
          ),
          strong("Separated live as a track loads"),
        ],
      },
    ],
  },
  {
    title: "Decks and mixing",
    rows: [
      {
        feature: "Decks",
        cells: [
          partial(undefined, { label: "2 decks" }),
          strong("Plus sample and remix decks", { label: "Up to 4" }),
        ],
      },
      {
        feature: "Mixer",
        cells: [
          strong("Trim, 3-band EQ, filter, faders, limiter, loudness matching"),
          strong(),
        ],
      },
      {
        feature: "Cues, loops, slip, quantize",
        cells: [strong("8 hot cues, loops, rolls, beat jump, slip"), strong()],
      },
      {
        feature: "Sync and key lock",
        cells: [
          strong("Key-locked decks stay on the beat", { was: "partial" }),
          strong(),
        ],
      },
      {
        feature: "Time-stretch sound",
        cells: [
          partial("Clean at DJ tempo ranges; long chords can sound phasey"),
          strong("élastique and Pitch 'n Time"),
        ],
      },
      {
        feature: "Jog scratching",
        cells: [
          strong(
            "Records brake under your hand, fast scratches stay clean, and stem mutes are respected",
            { was: "partial" }
          ),
          strong(),
        ],
      },
      {
        feature: "Timecode vinyl (DVS)",
        cells: [missing(), strong("Serato and Traktor DVS")],
      },
    ],
  },
  {
    title: "Music, hardware and platform",
    rows: [
      {
        feature: "Your own files",
        cells: [
          strong("Import, linked folders, tags; music stays on your computer"),
          strong(),
        ],
      },
      {
        feature: "Streaming catalogs",
        cells: [missing(), strong("Spotify, Apple Music, TIDAL, Beatport")],
      },
      {
        feature: "Controllers",
        cells: [
          partial("DDJ-FLX4 fully mapped"),
          strong("Hundreds of devices; MIDI learn"),
        ],
      },
      {
        feature: "Effects",
        cells: [
          partial("Pad FX, plus Auto-FX inside Automix"),
          strong("Dozens of chainable FX"),
        ],
      },
      {
        feature: "Export to club players",
        cells: [missing(), strong("rekordbox USB export, Engine")],
      },
      {
        feature: "Install",
        cells: [
          strong("Runs in a browser; analysis and stems run on your device"),
          partial("Desktop apps; some on iOS"),
        ],
      },
      {
        feature: "Teaching and coaching",
        cells: [
          strong("28 techniques, a live coach and practice reports"),
          missing("Tutorials live outside the app"),
        ],
      },
    ],
  },
]

const updates = [
  {
    title: "Stems on every deck",
    body: "Separate vocals, drums, bass and melody on your own device. About a minute for a 2½-minute track on a desktop GPU, then mute or solo each one live.",
  },
  {
    title: "Five stem transitions",
    body: "Automix can now swap basslines, drop the incoming vocal until the outgoing one ends, or ride an acapella over the next track.",
  },
  {
    title: "Analysis you can trust",
    body: "A beat-tracking model for grids and downbeats, tuning-aware key detection, and sections that land on the right bar.",
  },
  {
    title: "Fix it yourself",
    body: "Wrong key or beat 1? Correct it on the deck. Your fixes always win, and Automix uses them.",
  },
  {
    title: "Key lock on the beat",
    body: "A key-locked deck used to sound 131 ms late. The processing delay is now 54 ms, and Cue starts the deck early to cover it, so it plays on the grid.",
  },
  {
    title: "Scratching like a record",
    body: "Touch a playing record and it brakes under your hand. Fast scratches stay clean, and the record spins back up when you let go.",
  },
]

const sides = {
  cue: [
    "Explains every Automix choice with a score and reasons",
    "Plans a whole set on an energy curve",
    "Lets you hear a transition before it plays",
    "Teaches while you play, with lessons and a live coach",
    "Runs in a browser; your music and stems stay on your device",
  ],
  pro: [
    "Separates stems live, with no preparation step",
    "Higher-quality time-stretch on held chords and vocals",
    "Streaming catalogs inside the app",
    "Hundreds of controllers, DVS vinyl and club-player export",
    "Years of use in clubs",
  ],
}

function RatingCell({ cell, isCue }: { cell: Cell; isCue: boolean }) {
  return (
    <td className={cn(ratingClass[cell.rating], isCue && "is-cue")}>
      <span className="cell-mark">
        <span aria-hidden="true">{ratingMark[cell.rating]}</span>{" "}
        <span className="compare-rating">
          {cell.label ?? ratingText[cell.rating]}
        </span>
        {cell.was && (
          <span className="compare-was">was {ratingText[cell.was]}</span>
        )}
      </span>
      {cell.note && <span className="cell-note">{cell.note}</span>}
    </td>
  )
}

function RatingTable({
  label,
  tools,
  groups,
}: {
  label: string
  tools: string[]
  groups: Group[]
}) {
  return (
    <div
      className="site-table-scroll"
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      <table className="site-table compare-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Feature</span>
            </th>
            {tools.map((tool, i) => (
              <th key={tool} scope="col" className={i === 0 ? "is-cue" : ""}>
                {tool}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.title || "rows"}>
            {group.title && (
              <tr className="compare-group">
                <th scope="colgroup" colSpan={tools.length + 1}>
                  {group.title}
                </th>
              </tr>
            )}
            {group.rows.map((row) => (
              <tr key={row.feature}>
                <th scope="row">
                  {row.feature}
                  {row.isNew && <span className="compare-new">New</span>}
                </th>
                {row.cells.map((cell, i) => (
                  <RatingCell key={tools[i]} cell={cell} isCue={i === 0} />
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

function ComparePage() {
  return (
    <SiteLayout>
      <section className="site-hero site-hero-sm">
        <div className="site-wrap site-hero-inner">
          <p className="site-eyebrow">Compare</p>
          <h1>
            Cue next to the <span className="site-grad">pro apps</span>.
          </h1>
          <p className="site-lede">
            How Cue stacks up against rekordbox, Serato DJ Pro, Traktor Pro 4,
            djay Pro and VirtualDJ: where it leads, where it matches, and what
            you still get only from the pros.
          </p>
          <nav className="site-phase-nav" aria-label="On this page">
            <a href="#new">What's new</a>
            <a href="#automix">Automix</a>
            <a href="#studio">Studio</a>
            <a href="#sides">Who wins where</a>
          </nav>
        </div>
      </section>

      <section className="site-section site-section-tight">
        <div className="site-wrap compare-score" aria-label="Summary">
          <div className="site-card compare-score-lead">
            <strong>8</strong>
            <h2>Areas where Cue leads</h2>
            <p>
              Explained Automix, set planning, coaching, Auto-FX, previews,
              learning from ratings, tracklists and no install.
            </p>
          </div>
          <div className="site-card compare-score-par">
            <strong>11</strong>
            <h2>Working level</h2>
            <p>
              Mixer, cues and loops, sync and key lock, beatgrid, key, sections,
              scratching, library, recording, basic FX and the DDJ-FLX4.
            </p>
          </div>
          <div className="site-card compare-score-behind">
            <strong>10</strong>
            <h2>Pro apps ahead</h2>
            <p>
              Live stems, time-stretch sound, streaming, audio engine, decks,
              hardware, FX depth, DVS, club export, video and lighting.
            </p>
          </div>
        </div>
      </section>

      <section id="new" className="site-section site-band">
        <div className="site-wrap">
          <p className="site-eyebrow">What's new in the beta</p>
          <h2>The gaps we closed this round.</h2>
          <p className="site-sub">
            Analysis, stems, key lock and scratching were where the pro apps
            were furthest ahead. Here is what changed.
          </p>
          <ul className="compare-updates">
            {updates.map((update) => (
              <li key={update.title} className="site-card">
                <h3>{update.title}</h3>
                <p>{update.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="automix" className="site-section">
        <div className="site-wrap">
          <p className="site-eyebrow">Automix</p>
          <h2>Automix, head to head.</h2>
          <p className="site-sub">
            djay Pro's Automix AI is the strongest automatic mixer among the pro
            apps. rekordbox, Serato and Traktor offer simpler auto-play modes.
          </p>
          <RatingTable
            label="Automix comparison"
            tools={automixTools}
            groups={[{ title: "", rows: automixRows }]}
          />
        </div>
      </section>

      <section id="studio" className="site-section site-band">
        <div className="site-wrap">
          <p className="site-eyebrow">The studio</p>
          <h2>Feature by feature.</h2>
          <p className="site-sub">
            "Pro apps" means the best of rekordbox, Serato DJ Pro, Traktor Pro
            4, djay Pro and VirtualDJ; not every product has every feature.
            "Was" marks a rating that changed in this beta.
          </p>
          <RatingTable
            label="Studio feature comparison"
            tools={studioTools}
            groups={studioGroups}
          />
          <p className="site-fine site-legend">
            ✓ strong · ◐ partial · — not yet. Our judgement from public product
            information, October 2026. Features change, so check each vendor
            before you decide.
          </p>
        </div>
      </section>

      <section id="sides" className="site-section">
        <div className="site-wrap compare-sides">
          <div className="site-card">
            <p className="site-eyebrow">Cue does better</p>
            <ul>
              {sides.cue.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="site-honest">
            <h3>Where the pro apps are still ahead</h3>
            <ul>
              {sides.pro.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-wrap site-cta">
          <span className="site-eyebrow">Free while in beta</span>
          <h2>Hear it for yourself.</h2>
          <p>
            No account, nothing to install. Your music stays on your computer.
          </p>
          <div className="site-actions">
            <Link to="/app" className="site-btn site-btn-primary site-btn-lg">
              Start mixing
            </Link>
            <Link to="/roadmap" className="site-btn site-btn-lg">
              See the roadmap
            </Link>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
}
