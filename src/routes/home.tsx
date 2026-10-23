import { Link, createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { SiteLayout } from "@/components/marketing/site"
import { AsciiBackdrop } from "@/components/marketing/ascii-backdrop"
import { CompareTable } from "@/components/marketing/compare"
import { AutomixSection } from "@/components/marketing/sections/automix"
import { LearnSection } from "@/components/marketing/sections/learn"
import { FeaturesSection } from "@/components/marketing/sections/features"
import {
  ThemesSection,
  mixerShot,
} from "@/components/marketing/sections/themes"
import { themes } from "@/lib/dj/themes"
import type { ThemeId } from "@/lib/dj/themes"

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [{ title: "Cue — Mix your first set tonight" }],
  }),
  component: HomePage,
})

// Positions are percentages of the captured decks + mixer image.
const callouts = [
  { n: 1, x: 9.6, y: 43, text: "Press play" },
  { n: 2, x: 31.5, y: 28, text: "Cue shows where to mix" },
  { n: 3, x: 46.5, y: 42.7, text: "Turn down the bass" },
  { n: 4, x: 50, y: 83.1, text: "Slide across. You're mixing." },
]

const fears = [
  {
    title: "No gear? No problem.",
    body: "A mouse and keyboard are enough. Got a DDJ-FLX4? Plug it in and it just works.",
  },
  {
    title: "Nothing to install.",
    body: "Open it in Chrome or Edge on your computer. That's the whole setup.",
  },
  {
    title: "Bring your own tunes.",
    body: "Five free tracks to start. Your own music stays on your computer.",
  },
  {
    title: "Free while in beta.",
    body: "No account, no card, no catch. Just press play.",
  },
]

const roadmap = [
  {
    when: "Now",
    title: "v1 Beta",
    body: "Studio, Automix, coach and 28 lessons. Free.",
  },
  {
    when: "Next",
    title: "v1.0 Stable",
    body: "Works offline, better loudness, smarter drop and vocal markers.",
  },
  {
    when: "Later",
    title: "v1.x",
    body: "Stems, four decks and MIDI learn for any controller.",
  },
]

function HomePage() {
  const [theme, setTheme] = useState<ThemeId>("violet")
  const current = themes.find((t) => t.id === theme) ?? themes[0]
  const palette = [current.swatches[1], current.swatches[2]] as const

  return (
    <SiteLayout palette={palette}>
      {/* 1 · Hero */}
      <section className="site-hero">
        <AsciiBackdrop
          palette={palette}
          className="hero-backdrop"
          shape="horizon"
          characters=" .:-=+*x#"
          cellSize={15}
          density={0.6}
          glyphOpacity={0.6}
          gradientOpacity={0.16}
          grain={0.03}
          flicker={0.2}
          speed={0.6}
          dpr={1.25}
          maxFps={30}
          scrambleRadius={0.08}
        />
        <div className="site-wrap site-hero-inner">
          <h1>
            Mix your first set
            <br />
            <span className="site-grad">tonight.</span>
          </h1>
          <p className="site-lede">
            No decks, no download, no clue? Perfect. Cue is a free DJ studio in
            your browser that shows you exactly when to make your move, or does
            it for you while you learn.
          </p>
          <div className="site-actions">
            <Link to="/" className="site-btn site-btn-primary site-btn-lg">
              Start mixing, it's free
            </Link>
            <a href="#automix" className="site-btn site-btn-lg">
              See Automix work
            </a>
          </div>
          <div
            className="vibe-picker"
            role="radiogroup"
            aria-label="Try a theme"
          >
            <span>Try a vibe</span>
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={t.id === theme}
                aria-label={t.name}
                title={t.name}
                className="vibe-dot"
                style={{
                  background: `linear-gradient(135deg, ${t.swatches[1]} 50%, ${t.swatches[2]} 50%)`,
                }}
                onClick={() => setTheme(t.id)}
                onPointerEnter={() => {
                  new Image().src = mixerShot(t.id)
                }}
              />
            ))}
          </div>
        </div>
        <div className="site-wrap">
          <figure className="hero-stage">
            <div className="hero-frame">
              <div className="hero-screen">
                <img
                  src={mixerShot(theme)}
                  alt={`Cue's real decks and mixer in the ${current.name} theme: two decks with waveforms, hot cues and FX either side of a mixer with EQ knobs, channel faders and a crossfader`}
                  width={2088}
                  height={1506}
                  fetchPriority="high"
                />
                {callouts.map((c) => (
                  <span
                    key={c.n}
                    className="hero-pin"
                    style={{ left: `${c.x}%`, top: `${c.y}%` }}
                    aria-hidden="true"
                  >
                    {c.n}
                  </span>
                ))}
              </div>
            </div>
            <figcaption>
              <ol className="hero-steps">
                {callouts.map((c) => (
                  <li key={c.n}>
                    <span>{c.n}</span>
                    {c.text}
                  </li>
                ))}
              </ol>
              <p>
                The real studio, not a mockup. Four moves and you've done your
                first transition.
              </p>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* 2 · Fear-killers */}
      <section
        className="site-section site-section-tight"
        aria-label="Why it's easy"
      >
        <div className="site-wrap fear-grid">
          {fears.map((f) => (
            <div key={f.title} className="fear">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <AutomixSection />
      <LearnSection />
      <FeaturesSection />
      <ThemesSection theme={theme} onTheme={setTheme} />

      {/* 7 · Compare */}
      <section id="compare" className="site-section site-band">
        <div className="site-wrap">
          <p className="site-eyebrow">Compare</p>
          <h2>Pick the right tool.</h2>
          <p className="site-sub">
            Cue is where you learn and have fun. Heading for a club booth? The
            pro apps are great next steps, and everything you learn here carries
            over.
          </p>
          <CompareTable />
          <div className="site-honest">
            <h3>Where Cue is behind today</h3>
            <ul>
              <li>Two decks only. Four-deck mixing is on the roadmap.</li>
              <li>No stem separation or streaming services yet.</li>
              <li>
                The DDJ-FLX4 is the only mapped controller. MIDI learn is
                planned.
              </li>
              <li>
                BPM, key and phrase markers are estimates. Trust your ears.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 8 · Roadmap teaser */}
      <section className="site-section">
        <div className="site-wrap">
          <p className="site-eyebrow">What's next</p>
          <h2>Built in the open.</h2>
          <div className="teaser">
            {roadmap.map((r) => (
              <Link
                key={r.title}
                to="/roadmap"
                className="site-card teaser-card"
              >
                <span className="site-status">{r.when}</span>
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </SiteLayout>
  )
}
