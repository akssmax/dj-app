import { Link } from "@tanstack/react-router"

// Counts and examples come from the curriculum in src/lib/dj/lessons.ts.
const levels = [
  {
    n: 1,
    name: "First night",
    count: 6,
    note: "Start here",
    moves: ["Phrase mixing", "Bass swap", "Echo out"],
  },
  {
    n: 2,
    name: "Getting smooth",
    count: 8,
    moves: ["Long blend", "Loop transition", "Key mixing"],
  },
  {
    n: 3,
    name: "Show-off",
    count: 9,
    moves: ["Mashups", "Fake drop → real drop", "Genre switch"],
  },
  {
    n: 4,
    name: "Wizard",
    count: 5,
    note: "Some study-only for now",
    moves: ["Double drop", "Tone play", "Scratch transitions"],
  },
]

export function LearnSection() {
  return (
    <section className="site-section">
      <div className="site-wrap">
        <div className="learn-grid">
          <div className="section-head">
            <p className="site-eyebrow">Learn &amp; play</p>
            <h2>When you're ready, take the wheel.</h2>
            <p className="site-sub">
              Turn Automix off and the coach stays with you. It shades where to
              mix, counts the bars and says what to touch next, while the music
              plays.
            </p>
            <blockquote className="coach-quote">
              <span className="coach-beat" aria-hidden="true">
                <small>Beat</small>1<small>Bar 1 / 16</small>
              </span>
              <div>
                <span className="site-tag">Live guidance</span>
                <p>Listen to A. Count the downbeat.</p>
              </div>
            </blockquote>
            <div className="site-actions site-actions-start">
              <Link
                to="/learn"
                className="site-btn site-btn-primary site-btn-lg"
              >
                Start lesson one
              </Link>
            </div>
          </div>
          <figure className="site-shot">
            <img
              src="/marketing/learn.jpg"
              alt="Learn & Play in Cue: the live guidance card with beat and bar count above both decks, with shaded entry and exit zones on the waveforms"
              loading="lazy"
            />
          </figure>
        </div>

        <ol className="level-path" aria-label="28 moves in four levels">
          {levels.map((l) => (
            <li key={l.n} className="level-card">
              <div className="level-top">
                <span className="level-badge">LV {l.n}</span>
                <span className="level-count">{l.count} moves</span>
              </div>
              <h3>{l.name}</h3>
              <ul className="chip-list">
                {l.moves.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              {l.note && <p className="level-note">{l.note}</p>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
