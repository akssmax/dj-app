import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Icon } from "./icons"
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

/** Mixer header: small pills for the assists that are on, plus a menu. */
export function MixerOptions() {
  const { engine } = useDJ()
  const controls = useEngine((state) => ({
    smartCFX: state.controller.smartCFX,
    smartFader: state.controller.smartFader,
    fxTarget: state.controller.fxTarget,
  }))
  const toggle = (type: "smartCFX" | "smartFader") =>
    engine?.handleControllerAction({ type, value: 1 })
  return (
    <div className="mixer-options">
      {controls.smartCFX && (
        <span className="mixer-assist" title="Smart CFX on">
          CFX
        </span>
      )}
      {controls.smartFader && (
        <span className="mixer-assist" title="Smart Fader on">
          FADER
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Mixer options"
              title="Mixer options"
            />
          }
        >
          <Icon name="settings" size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Mixer assists</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={controls.smartCFX}
              onCheckedChange={() => toggle("smartCFX")}
            >
              <span className="mixer-option-text">
                Smart CFX
                <small>Filter knob also adds echo or reverb</small>
              </span>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={controls.smartFader}
              onCheckedChange={() => toggle("smartFader")}
            >
              <span className="mixer-option-text">
                Smart Fader
                <small>Crossfader syncs tempo and swaps the bass</small>
              </span>
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              Beat FX target ·{" "}
              {controls.fxTarget === "both"
                ? "A + B"
                : `deck ${controls.fxTarget}`}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
