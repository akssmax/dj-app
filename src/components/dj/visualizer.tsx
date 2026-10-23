import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { outgoingDeck } from "@/lib/dj/engine"
import { SceneDirector } from "@/lib/dj/visuals/director"
import { VisualDriver } from "@/lib/dj/visuals/features"
import { colorModes, toLinear } from "@/lib/dj/visuals/palettes"
import type { ColorMode, ThemeColors } from "@/lib/dj/visuals/palettes"
import { VisualRenderer } from "@/lib/dj/visuals/renderer"
import { scenes } from "@/lib/dj/visuals/scenes"
import { useDJ, useEngine } from "./provider"
import { Icon } from "./icons"

const SCENE_KEY = "cue-visual-scene",
  AUTO_KEY = "cue-visual-auto",
  COLORS_KEY = "cue-visual-colors"
const stored = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private windows: the choice just isn't remembered.
  }
}

/**
 * The active theme's deck and waveform colors in linear light. Theme tokens
 * may be color-mix() expressions, so let the browser resolve each one and
 * read the painted pixel back.
 */
function readThemeColors(): ThemeColors | null {
  const probe = document.createElement("span"),
    paint = document.createElement("canvas").getContext("2d", {
      willReadFrequently: true,
    })
  if (!paint) return null
  document.body.appendChild(probe)
  const read = (token: string) => {
    probe.style.color = `var(${token})`
    paint.clearRect(0, 0, 1, 1)
    paint.fillStyle = getComputedStyle(probe).color
    paint.fillRect(0, 0, 1, 1)
    return toLinear([...paint.getImageData(0, 0, 1, 1).data.slice(0, 3)])
  }
  const colors = {
    deckA: read("--primary"),
    deckB: read("--orange"),
    low: read("--wave-low"),
    mid: read("--wave-mid"),
  }
  probe.remove()
  return colors
}

export function Visualizer() {
  const { engine, theme } = useDJ()
  const stage = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    fps = useRef<HTMLSpanElement>(null)
  const [scene, setScene] = useState(
      () => Number(stored(SCENE_KEY)) % scenes.length || 0
    ),
    [auto, setAuto] = useState(() => stored(AUTO_KEY) !== "off"),
    [error, setError] = useState<string | null>(null),
    [idle, setIdle] = useState(false),
    [full, setFull] = useState(false),
    [colors, setColors] = useState<ColorMode>(() => {
      const saved = stored(COLORS_KEY)
      return colorModes.some((mode) => mode.id === saved)
        ? (saved as ColorMode)
        : "spectrum"
    }),
    [themeColors, setThemeColors] = useState<ThemeColors | null>(null)
  // The shell sets data-theme in an effect; read the tokens after it lands.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setThemeColors(readThemeColors()))
    return () => cancelAnimationFrame(frame)
  }, [theme])
  // The frame loop reads these through refs so it never restarts.
  const live = useRef({ auto, colors, themeColors })
  live.current = { auto, colors, themeColors }
  const director = useRef<SceneDirector | null>(null)
  director.current ??= new SceneDirector(scene)

  const choose = (index: number) => {
    director.current?.select(index)
    setScene(index)
    store(SCENE_KEY, String(index))
  }

  useEffect(() => {
    const element = canvas.current
    if (!element || !engine) return
    let renderer: VisualRenderer
    try {
      renderer = new VisualRenderer(element)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return
    }
    const driver = new VisualDriver(engine)
    let frame = 0,
      last = performance.now(),
      counted = 0,
      countedAt = last,
      shown = director.current!.target
    const render = (now: number) => {
      frame = requestAnimationFrame(render)
      const interval = now - last,
        dt = Math.min(interval / 1000, 0.1)
      last = now
      driver.colorMode = live.current.colors
      driver.themeColors = live.current.themeColors
      const events = driver.update(dt),
        state = engine.getSnapshot(),
        lead = outgoingDeck(state),
        incoming = state.autoOut === "A" ? "B" : "A",
        show = director.current!
      show.update(dt, {
        auto: live.current.auto,
        ...events,
        // Automix arms the next transition long before it starts (progress 0
        // while it waits for the exit zone); only a running one leads.
        transition:
          state.auto && state.autoOut && state.transition > 0
            ? state.transition
            : null,
        incomingEnergy: state[incoming].track?.energy ?? null,
        energy: state[lead].track?.energy ?? null,
      })
      if (show.target !== shown) {
        shown = show.target
        setScene(shown)
        store(SCENE_KEY, String(shown))
      }
      renderer.render(driver.frame, show.view, now / 1000, interval)
      counted++
      if (now - countedAt > 500 && fps.current) {
        fps.current.textContent = `${Math.round((counted * 1000) / (now - countedAt))} fps · ${Math.round(renderer.renderScale * 100)}%`
        counted = 0
        countedAt = now
      }
    }
    // Rendering pauses with the page; the audio keeps playing.
    const visibility = () => {
      cancelAnimationFrame(frame)
      if (!document.hidden) {
        last = performance.now()
        frame = requestAnimationFrame(render)
      }
    }
    document.addEventListener("visibilitychange", visibility)
    frame = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("visibilitychange", visibility)
      renderer.dispose()
    }
  }, [engine])

  // Controls fade out while the mouse rests over the visuals.
  useEffect(() => {
    const element = stage.current
    if (!element) return
    let timer: ReturnType<typeof setTimeout>
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIdle(true), 2500)
    }
    wake()
    element.addEventListener("pointermove", wake)
    return () => {
      clearTimeout(timer)
      element.removeEventListener("pointermove", wake)
    }
  }, [])

  useEffect(() => {
    const changed = () =>
      setFull(!!stage.current && document.fullscreenElement === stage.current)
    document.addEventListener("fullscreenchange", changed)
    return () => document.removeEventListener("fullscreenchange", changed)
  }, [])

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await stage.current?.requestFullscreen()
    } catch {
      setError("Fullscreen is unavailable in this browser window.")
    }
  }

  return (
    <section
      ref={stage}
      className={`visualizer ${idle ? "is-idle" : ""}`}
      aria-label="Music visualizer"
    >
      <canvas ref={canvas} className="visualizer-canvas" aria-hidden="true" />
      <div className="visualizer-controls">
        <div className="visualizer-scenes" role="group" aria-label="Scene">
          {scenes.map((item, index) => (
            <Button
              key={item.id}
              size="xs"
              variant={scene === index ? "secondary" : "ghost"}
              aria-pressed={scene === index}
              onClick={() => choose(index)}
            >
              {item.name}
            </Button>
          ))}
        </div>
        <div className="visualizer-actions">
          <span ref={fps} className="visualizer-fps" />
          <div
            className="visualizer-colors"
            role="radiogroup"
            aria-label="Colors"
          >
            {colorModes.map((mode) => (
              <Button
                key={mode.id}
                size="xs"
                variant={colors === mode.id ? "secondary" : "ghost"}
                role="radio"
                aria-checked={colors === mode.id}
                aria-pressed={colors === mode.id}
                title={mode.hint}
                onClick={() => {
                  setColors(mode.id)
                  store(COLORS_KEY, mode.id)
                }}
              >
                {mode.label}
              </Button>
            ))}
          </div>
          <Button
            size="xs"
            variant={auto ? "secondary" : "ghost"}
            aria-pressed={auto}
            title="Change scene on drops, every 32 bars and with each Automix transition"
            onClick={() => {
              setAuto(!auto)
              store(AUTO_KEY, auto ? "off" : "on")
            }}
          >
            <Icon name="shuffle" size={13} />
            Auto
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={full ? "Exit fullscreen" : "Fullscreen visuals"}
            title={full ? "Exit fullscreen" : "Fullscreen visuals"}
            onClick={() => void toggleFull()}
          >
            <Icon name={full ? "minimize" : "maximize"} size={14} />
          </Button>
        </div>
      </div>
      {error && (
        <p className="visualizer-message" role="alert">
          {error}
        </p>
      )}
      <AutomixCard />
    </section>
  )
}

/** Small now/next card over the visuals while Automix runs. */
function AutomixCard() {
  const { automix, tracks } = useDJ()
  const now = useEngine((state) => {
    const id = outgoingDeck(state)
    return {
      title: state[id].track?.title ?? null,
      artist: state[id].track?.artist ?? null,
      camelot: state[id].track?.camelot ?? null,
      bpm: state[id].track?.bpm ?? null,
      transition: state.transition,
    }
  })
  if (!automix.active) {
    return now.title ? null : (
      <p className="visualizer-hint">Play a track or start Automix</p>
    )
  }
  const next = tracks.find((track) => track.id === automix.nextId)
  const mixing = automix.phase === "mixing"
  return (
    <aside className="visualizer-automix" aria-label="Automix">
      <div className="visualizer-automix-label">
        Automix · {mixing ? "mixing" : (automix.set?.phase ?? automix.phase)}
        {now.bpm ? ` · ${Math.round(now.bpm)} BPM` : ""}
      </div>
      {now.title && (
        <div className="visualizer-automix-row">
          <span>Now</span>
          <strong title={now.title}>
            {now.title}
            {now.artist ? ` — ${now.artist}` : ""}
          </strong>
        </div>
      )}
      {next && (
        <div className="visualizer-automix-row">
          <span>Next</span>
          <strong title={next.title}>
            {next.title}
            {now.camelot && next.camelot
              ? ` (${now.camelot} → ${next.camelot})`
              : ""}
          </strong>
        </div>
      )}
      <div
        className="visualizer-automix-bar"
        role="progressbar"
        aria-label={mixing ? "Transition progress" : "Set progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(
          (mixing ? now.transition : (automix.set?.fraction ?? 0)) * 100
        )}
      >
        <i
          style={{
            width: `${(mixing ? now.transition : (automix.set?.fraction ?? 0)) * 100}%`,
          }}
        />
      </div>
    </aside>
  )
}
