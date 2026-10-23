import { TransitionPlayer } from "../transition-player"

const pipeline = [
  {
    title: "Pick a vibe",
    body: "Steady, calmer, groovier or bigger. You set the direction.",
  },
  {
    title: "Find the next track",
    body: "Close tempo, a key that fits, energy going your way, no repeats.",
  },
  {
    title: "Choose the move",
    body: "Blend, bass swap, echo out, filter, loop or cut.",
  },
  {
    title: "Wait for the phrase",
    body: "Music moves in 8- and 16-bar chunks. It waits for the right one.",
  },
  {
    title: "Mix and explain",
    body: "Faders and EQ move on screen, with the reason written down.",
  },
]

const controls = [
  {
    label: "Vibe",
    options: ["Set", "Ease", "Groove", "Lift"],
    body: "Follow the set, bring it down, settle into a groove or lift the room.",
  },
  {
    label: "Length",
    options: ["Quick", "DJ", "Full"],
    body: "Quick, punchy mixes, classic DJ pacing, or let each track breathe.",
  },
  {
    label: "FX",
    options: ["No FX", "Subtle", "Expressive"],
    body: "How much echo, reverb and filter Automix is allowed to use.",
  },
]

export function AutomixSection() {
  return (
    <section id="automix" className="site-section site-band">
      <div className="site-wrap">
        <div className="section-head">
          <p className="site-eyebrow">Automix</p>
          <h2>Hit Automix. Watch it think.</h2>
          <p className="site-sub">
            It's like a DJ friend taking a turn at the decks. Automix mixes your
            music the way a person would, and shows every move so you can steal
            them.
          </p>
        </div>

        <ol className="pipeline">
          {pipeline.map((step, i) => (
            <li key={step.title}>
              <span className="pipeline-n">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="control-room">
          <div className="control-room-head">
            <span className="live-dot" aria-hidden="true" />
            <p>
              <strong>Try it:</strong> pick a move and watch 16 bars play out
            </p>
          </div>
          <TransitionPlayer />
        </div>

        <div className="real-controls">
          <figure className="site-shot">
            <img
              src="/marketing/coach.jpg"
              alt="The Automix bar in Cue: vibe, length and FX controls, then the outgoing track, the chosen move with its reasons and the next track"
              width={2028}
              height={414}
              loading="lazy"
            />
            <figcaption>The real Automix bar in the studio.</figcaption>
          </figure>
          <ul className="control-cards">
            {controls.map((c) => (
              <li key={c.label} className="site-card">
                <span className="site-tag">{c.label}</span>
                <div className="option-row" aria-label={`${c.label} options`}>
                  {c.options.map((o) => (
                    <span key={o}>{o}</span>
                  ))}
                </div>
                <p>{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
