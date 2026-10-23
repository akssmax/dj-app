import { Link } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { SPECTRUM_BINS } from "@/lib/dj/visuals/features"
import {
  linearPalette,
  palettes,
  rotateHue,
  themePalette,
  toLinear,
} from "@/lib/dj/visuals/palettes"
import { VisualRenderer } from "@/lib/dj/visuals/renderer"
import { scenes } from "@/lib/dj/visuals/scenes"
import type { VisualFrame } from "@/lib/dj/visuals/features"
import type { SceneView } from "@/lib/dj/visuals/renderer"

// The landing page has no music, so a 128 BPM clock stands in for the
// beatgrid; everything else is the studio's own renderer and scenes.
const BPM = 128
const featured = [
  "laser",
  "cubes",
  "chrome",
  "city",
  "synth",
  "galaxy",
  "kaleido",
  "led",
]
const featuredIndex = featured.map((id) => scenes.findIndex((s) => s.id === id))

const points = [
  {
    title: "Locked to the beat",
    body: "Pulses land on the kick from the beatgrid, and every drop flashes.",
  },
  {
    title: "Follows Automix",
    body: "Scenes dissolve at the pace of each transition and match the next track's energy.",
  },
  {
    title: "Colors that fit",
    body: "Spectrum, your theme or each track's key. A mix shows both decks' colors.",
  },
  {
    title: "Made for the big screen",
    body: "Fullscreen at up to 120 fps on a TV or projector. Resolution adapts to your machine.",
  },
]

const hex = (value: string) =>
  [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16))

export function VisualsSection({
  palette,
}: {
  palette: readonly [string, string]
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    hud = useRef<HTMLSpanElement>(null)
  const [pinned, setPinned] = useState<number | null>(null),
    [colors, setColors] = useState<"spectrum" | "theme">("spectrum"),
    [shown, setShown] = useState(featuredIndex[0]),
    [failed, setFailed] = useState(false)
  const live = useRef({ pinned, colors, palette })
  live.current = { pinned, colors, palette }

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    let renderer: VisualRenderer
    try {
      renderer = new VisualRenderer(element)
    } catch {
      setFailed(true)
      return
    }
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches
    const frame: VisualFrame = {
      bass: 0,
      mid: 0,
      high: 0,
      pulse: 0,
      bar: 0,
      travel: 0,
      energy: 1,
      flash: 0,
      spectrum: new Uint8Array(SPECTRUM_BINS),
      palette: linearPalette(8),
      playing: true,
    }
    const target = new Float32Array(12)
    const view: SceneView = {
      from: featuredIndex[0],
      to: featuredIndex[0],
      mix: 0,
    }
    const start = performance.now()
    let raf = 0,
      visible = false,
      last = performance.now(),
      lastBar = -1,
      slot = 0,
      spectrumIndex = 8,
      named = featuredIndex[0]
    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1),
        t = (now - start) / 1000
      last = now
      const beats = (t * BPM) / 60,
        frac = beats - Math.floor(beats),
        bar = Math.floor(beats / 4)
      const breakdown = bar % 16 >= 14
      frame.pulse = Math.exp(-frac * 6) * (breakdown ? 0.25 : 1)
      frame.bass = 0.3 + 0.6 * frame.pulse
      frame.mid = 0.45 + 0.25 * Math.sin(t * 1.4)
      frame.high = 0.35 + 0.25 * Math.sin(t * 3.1)
      frame.bar = (beats / 4) % 1
      frame.travel += dt * (0.25 + 1.4 * frame.bass + 0.4 * frame.pulse)
      frame.energy +=
        ((breakdown ? 0.55 : 1) - frame.energy) * Math.min(1, dt * 2)
      for (let i = 0; i < SPECTRUM_BINS; i++)
        frame.spectrum[i] = Math.max(
          0,
          Math.min(
            255,
            255 *
              (0.82 - i / 100) *
              (0.55 + 0.45 * Math.sin(i * 0.6 + t * 2.6)) *
              (0.6 + 0.6 * (i < 10 ? frame.pulse : 0.4))
          )
        )
      // Settle any dissolve in progress, then fade towards `index`.
      const goTo = (index: number) => {
        if (view.mix >= 0.5) view.from = view.to
        view.to = index
        view.mix = 0
      }
      // Scene every 2 bars, palette every 4, a drop every 16.
      if (bar !== lastBar) {
        if (lastBar >= 0 && bar % 2 === 0 && live.current.pinned === null) {
          slot = (slot + 1) % featuredIndex.length
          goTo(featuredIndex[slot])
        }
        if (bar % 4 === 0)
          spectrumIndex =
            (spectrumIndex + (bar % 16 === 0 ? 5 : 1)) % palettes.length
        if (bar % 16 === 0 && lastBar >= 0) frame.flash = 1
        lastBar = bar
      }
      const pin = live.current.pinned
      if (pin !== null && view.to !== pin) goTo(pin)
      if (view.to !== view.from) view.mix = Math.min(1, view.mix + dt / 0.9)
      if (view.mix >= 1) {
        view.from = view.to
        view.mix = 0
      }
      // Name whichever scene the canvas is mostly showing.
      const showing = view.mix >= 0.5 ? view.to : view.from
      if (showing !== named) {
        named = showing
        setShown(showing)
      }
      frame.flash = Math.max(0, frame.flash - dt * 2.2)
      if (live.current.colors === "theme") {
        const [a, b] = live.current.palette.map((c) => toLinear(hex(c)))
        themePalette(
          {
            deckA: a,
            deckB: b,
            low: a.map((v, i) => v * 0.6 + b[i] * 0.15),
            mid: b,
          },
          0.5 + 0.5 * Math.sin(t * 0.4),
          target
        )
      } else {
        linearPalette(spectrumIndex, target)
        rotateHue(target, 0.5 * Math.sin((t * 2 * Math.PI) / 30))
      }
      for (let i = 0; i < 12; i++)
        frame.palette[i] +=
          (target[i] - frame.palette[i]) * Math.min(1, dt * 1.5)
      renderer.render(frame, view, t, dt * 1000)
      if (hud.current)
        hud.current.textContent = `${BPM} BPM · BAR ${(bar % 16) + 1} · BEAT ${Math.floor(beats % 4) + 1}`
    }
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      draw(now)
    }
    // Run only while the section is on screen; reduced motion gets one frame.
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      cancelAnimationFrame(raf)
      if (!visible) return
      last = performance.now()
      if (still) {
        linearPalette(spectrumIndex, frame.palette)
        draw(start + 1500)
      } else raf = requestAnimationFrame(loop)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
      renderer.dispose()
    }
  }, [])

  return (
    <section id="visuals" className="site-section site-band">
      <div className="site-wrap">
        <div className="section-head">
          <p className="site-eyebrow">Visuals</p>
          <h2>Your mix, on the big screen.</h2>
          <p className="site-sub">
            Flip to the Visuals tab and 22 scenes move with the music: lasers,
            neon tunnels, chrome, galaxies and more. Cue picks a new one on
            every drop. Put it fullscreen on a TV or projector and play.
          </p>
        </div>

        <figure className="vis-stage">
          <div className="vis-screen">
            {failed ? (
              <p className="vis-fallback">
                Your browser can't show WebGL here. Open the studio in Chrome or
                Edge to see the visuals.
              </p>
            ) : (
              <canvas
                ref={canvas}
                className="vis-canvas"
                role="img"
                aria-label={`Cue's live visualizer playing the ${scenes[shown].name} scene`}
              />
            )}
            <div className="vis-hud" aria-hidden="true">
              <span className="vis-scene">{scenes[shown].name}</span>
              <span ref={hud} className="vis-clock" />
            </div>
          </div>
          <figcaption className="vis-controls">
            <div className="vis-chips" role="group" aria-label="Scene">
              <button
                type="button"
                className="vis-chip"
                aria-pressed={pinned === null}
                onClick={() => setPinned(null)}
              >
                Auto
              </button>
              {featuredIndex.map((index) => (
                <button
                  key={index}
                  type="button"
                  className="vis-chip"
                  aria-pressed={pinned === index}
                  onClick={() => setPinned(index)}
                >
                  {scenes[index].name}
                </button>
              ))}
            </div>
            <div className="vis-chips" role="radiogroup" aria-label="Colors">
              {(["spectrum", "theme"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  className="vis-chip"
                  aria-checked={colors === mode}
                  aria-pressed={colors === mode}
                  onClick={() => setColors(mode)}
                >
                  {mode === "spectrum" ? "Spectrum colors" : "Vibe colors"}
                </button>
              ))}
            </div>
          </figcaption>
        </figure>

        <div className="vis-points">
          {points.map((p) => (
            <div key={p.title} className="site-card">
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
        <div className="site-actions site-actions-start">
          <Link to="/app" className="site-btn site-btn-primary site-btn-lg">
            Open the visuals
          </Link>
          <span className="vis-note">
            Live preview on a 128 BPM clock. In the studio it follows your
            tracks.
          </span>
        </div>
      </div>
    </section>
  )
}
