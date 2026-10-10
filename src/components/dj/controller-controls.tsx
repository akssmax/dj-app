import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { useDJ, useEngine } from "./provider"
import type { DeckId } from "@/lib/dj/types"

export function ChannelCue({ id }: { id: DeckId }) {
  const { engine } = useDJ()
  const enabled = useEngine((state) => state[id].headphoneCue)
  return (
    <Button
      variant={enabled ? "secondary" : "outline"}
      size="xs"
      aria-label={`Deck ${id} headphone cue`}
      aria-pressed={enabled}
      onClick={() =>
        engine?.handleControllerAction({
          type: "headphoneCue",
          deck: id,
          value: 1,
        })
      }
    >
      CUE
    </Button>
  )
}
export function ControllerControls() {
  const { engine } = useDJ()
  const controls = useEngine((state) => ({ ...state.controller }))
  return (
    <div className="controller-controls">
      <div className="controller-smart-controls">
        <Button
          size="xs"
          variant={controls.smartCFX ? "secondary" : "outline"}
          aria-pressed={controls.smartCFX}
          onClick={() =>
            engine?.handleControllerAction({ type: "smartCFX", value: 1 })
          }
        >
          Smart CFX
        </Button>
        <Button
          size="xs"
          variant={controls.smartFader ? "secondary" : "outline"}
          aria-pressed={controls.smartFader}
          onClick={() =>
            engine?.handleControllerAction({ type: "smartFader", value: 1 })
          }
        >
          Smart Fader
        </Button>
      </div>
      <span className="controller-fx-target">
        BEAT FX · {controls.fxTarget === "both" ? "A + B" : controls.fxTarget}
      </span>
      <details>
        <summary>Monitor & mic</summary>
        {(["headphoneMix", "headphoneLevel", "micLevel"] as const).map(
          (parameter, index) => (
            <label key={parameter}>
              <span>
                {["Cue / master", "Phones level", "Mic level"][index]}{" "}
                {Math.round(controls[parameter] * 100)}%
              </span>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[controls[parameter]]}
                aria-label={
                  [
                    "Headphone cue master mix",
                    "Headphone level",
                    "Microphone level",
                  ][index]
                }
                onValueChange={(value) =>
                  engine?.handleControllerAction({
                    type: parameter,
                    value: Array.isArray(value) ? value[0] : value,
                  })
                }
              />
            </label>
          )
        )}
        <Button
          size="xs"
          variant={controls.masterCue ? "secondary" : "outline"}
          aria-pressed={controls.masterCue}
          onClick={() =>
            engine?.handleControllerAction({ type: "masterCue", value: 1 })
          }
        >
          Master cue
        </Button>
        <p className="muted">
          {controls.monitorConnected
            ? "Headphone output enabled"
            : "Headphone output off"}{" "}
          · {controls.micEnabled ? "Mic enabled" : "Mic off"}
        </p>
      </details>
    </div>
  )
}
