import { Link, createFileRoute } from "@tanstack/react-router"
import { SiteLayout } from "@/components/marketing/site"
import { APP_VERSION } from "@/lib/version"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [{ title: "Roadmap — Cue" }],
  }),
  component: RoadmapPage,
})

type Phase = {
  id: string
  status: "live" | "next" | "later" | "exploring"
  label: string
  title: string
  summary: string
  items: { title: string; body: string }[]
}

const phases: Phase[] = [
  {
    id: "beta",
    status: "live",
    label: "Now",
    title: "v1 Beta",
    summary:
      "The full studio, coach and lessons, free while we collect feedback.",
    items: [
      {
        title: "Two-deck studio",
        body: "EQ, filters, trim, echo and reverb, hot cues, loops, slip, sync, key lock and mix recording.",
      },
      {
        title: "Live transition coach",
        body: "Exit and entry zones, bar countdowns and step-by-step moves on parallel waveforms.",
      },
      {
        title: "Explainable Automix",
        body: "Nine transition families with energy goals, channel-fader moves and section loudness matching.",
      },
      {
        title: "Learn & Play",
        body: "28 transition techniques and an 18-genre guide, practised on real decks.",
      },
      {
        title: "Local library",
        body: "Linked USB folders, on-device BPM, key and energy analysis, playlists and ratings.",
      },
      {
        title: "DDJ-FLX4 support",
        body: "Pads, Beat FX, Smart CFX, jog scratch and LED feedback with a practice report.",
      },
    ],
  },
  {
    id: "v1",
    status: "next",
    label: "Next",
    title: "v1.0 Stable",
    summary: "Leaving beta means hardening what exists, not adding more knobs.",
    items: [
      {
        title: "Full FLX4 hardware sign-off",
        body: "Finish the physical control sweep and close the remaining right-deck output report.",
      },
      {
        title: "Works offline",
        body: "Install Cue as an app with a service worker so a set survives a dropped connection.",
      },
      {
        title: "Loudness you can trust",
        body: "LUFS and true-peak matching to replace section RMS estimates.",
      },
      {
        title: "Smarter phrase labels",
        body: "Intro, drop and vocal markers with a confidence score instead of an unlabeled grid.",
      },
      {
        title: "Safer storage",
        body: "Guided persistent-storage setup and a backup reminder for imported music.",
      },
      {
        title: "Verified mix export",
        body: "Recording download tested end to end in Chrome and Edge.",
      },
    ],
  },
  {
    id: "v1x",
    status: "later",
    label: "Later",
    title: "v1.x",
    summary: "The biggest gaps against the pro apps.",
    items: [
      {
        title: "MIDI learn",
        body: "Map any controller, not just the FLX4.",
      },
      {
        title: "Stems",
        body: "Vocal, drum and bass separation, plus the stem lessons that need it.",
      },
      {
        title: "Four decks",
        body: "Multi-deck audio and the multi-deck techniques in the curriculum.",
      },
      {
        title: "Scratch and tone-play lessons",
        body: "Dedicated engines so the study-only lessons become playable.",
      },
    ],
  },
  {
    id: "exploring",
    status: "exploring",
    label: "Exploring",
    title: "Ideas, not promises",
    summary: "Things we are researching. Tell us which matter to you.",
    items: [
      {
        title: "Practice history",
        body: "Track how your transitions improve across sessions.",
      },
      {
        title: "Share a mix",
        body: "A page to post a recorded set with its tracklist.",
      },
      {
        title: "Sync across devices",
        body: "Optional sync for cues, grids and playlists. Music stays local.",
      },
    ],
  },
]

const statusText = {
  live: "Live",
  next: "In progress",
  later: "Planned",
  exploring: "Researching",
}

function RoadmapPage() {
  return (
    <SiteLayout>
      <section className="site-hero site-hero-sm">
        <div className="site-wrap site-hero-inner">
          <p className="site-eyebrow">Roadmap</p>
          <h1>
            From beta to <span className="site-grad">v1</span>.
          </h1>
          <p className="site-lede">
            What ships now, what has to be true before we call it stable, and
            what comes after. No dates until the work is close; this page
            changes as we learn.
          </p>
          <nav className="site-phase-nav" aria-label="Phases">
            {phases.map((p) => (
              <a key={p.id} href={`#${p.id}`} className={`phase-${p.status}`}>
                <span className="site-chip-dot" />
                {p.label} · {p.title}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <section className="site-section site-section-tight">
        <div className="site-wrap site-timeline">
          {phases.map((p) => (
            <article
              key={p.id}
              id={p.id}
              className={cn("site-phase", `phase-${p.status}`)}
            >
              <div className="site-phase-rail" aria-hidden="true">
                <span />
              </div>
              <div className="site-phase-body">
                <header>
                  <span className="site-status">{statusText[p.status]}</span>
                  <h2>{p.title}</h2>
                  <p>{p.summary}</p>
                </header>
                <ul className="site-phase-items">
                  {p.items.map((item) => (
                    <li key={item.title} className="site-card">
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="site-section">
        <div className="site-wrap site-cta">
          <span className="site-eyebrow">You are on {APP_VERSION}</span>
          <h2>Try the beta and tell us what to build next.</h2>
          <div className="site-actions">
            <Link to="/app" className="site-btn site-btn-primary site-btn-lg">
              Open the studio
            </Link>
            <Link to="/" className="site-btn site-btn-lg">
              Back to overview
            </Link>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
}
