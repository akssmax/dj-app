import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { useDJ, useEngine } from "./provider"
import { formatTime } from "@/lib/dj/tracks"
import { Icon } from "./icons"

export function LibraryTransport() {
  const { engine } = useDJ()
  const state = useEngine((s) => ({
    A: s.A,
    B: s.B,
    crossfade: s.crossfade,
    master: s.master,
  }))
  return (
    <section
      className="library-transport"
      aria-label="Library playback controls"
    >
      {(["A", "B"] as const).map((id) => {
        const deck = state[id]
        const muted =
          deck.volume < 0.001 ||
          (id === "A" ? state.crossfade >= 0.999 : state.crossfade <= 0.001)
        return (
          <div className="library-deck-preview" key={id}>
            <strong className={id === "A" ? "text-lime" : "text-orange"}>
              DECK {id}
            </strong>
            <span title={deck.track?.title}>
              {deck.loading
                ? "Loading…"
                : (deck.track?.title ?? "Load a track below")}
            </span>
            <small>
              {formatTime(deck.position)} /{" "}
              {formatTime(deck.track?.duration ?? 0)}
            </small>
            <Button
              variant="outline"
              disabled={!deck.track || deck.loading}
              aria-label={`${deck.playing ? "Pause" : "Play"} deck ${id} from library`}
              onClick={() => void engine?.toggle(id)}
            >
              <Icon name={deck.playing ? "pause" : "play"} size={16} />
              {deck.playing ? "Pause" : "Play"}
            </Button>
            {muted && (
              <small className="text-orange">Crossfader mutes {id}</small>
            )}
            {deck.volume === 0 && (
              <small className="text-orange">Channel volume is zero</small>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => engine?.resetChannel(id)}
              disabled={!deck.track || deck.loading}
            >
              Reset audio
            </Button>
          </div>
        )
      })}
      <div className="library-crossfade">
        <span>A ← Crossfader → B</span>
        <Slider
          value={[state.crossfade]}
          min={0}
          max={1}
          step={0.01}
          aria-label="Library crossfader"
          onValueChange={(v) =>
            engine?.setCrossfade(Array.isArray(v) ? v[0] : v)
          }
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => engine?.setCrossfade(0.5)}
        >
          Center
        </Button>
      </div>
      {state.master === 0 && (
        <p className="text-orange">
          Master volume is zero. Adjust it in Mixer.
        </p>
      )}
    </section>
  )
}
