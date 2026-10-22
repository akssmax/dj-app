import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useDJ } from "./provider"
import { Icon } from "./icons"

export function FullscreenButton() {
  const [active, setActive] = useState(false),
    [supported, setSupported] = useState(false)
  const { notify } = useDJ()
  useEffect(() => {
    setSupported(
      document.fullscreenEnabled &&
        typeof document.documentElement.requestFullscreen === "function"
    )
    const changed = () => {
      const full = !!document.fullscreenElement
      setActive(full)
      // CSS hook for layouts that :fullscreen alone cannot reach reliably.
      document.documentElement.toggleAttribute("data-fullscreen", full)
    }
    changed()
    document.addEventListener("fullscreenchange", changed)
    return () => document.removeEventListener("fullscreenchange", changed)
  }, [])
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="fullscreen-button"
            aria-label={active ? "Exit fullscreen" : "Enter fullscreen"}
            aria-pressed={active}
            disabled={!supported}
            onClick={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen()
                else await document.documentElement.requestFullscreen()
              } catch {
                notify(
                  "Fullscreen is unavailable in this browser window. Open the studio in Chrome or Edge."
                )
              }
            }}
          >
            <Icon name={active ? "minimize" : "maximize"} size={18} />
          </Button>
        }
      />
      <TooltipContent>
        {supported
          ? active
            ? "Exit fullscreen · Esc"
            : "Enter fullscreen"
          : "Fullscreen unavailable in this window"}
      </TooltipContent>
    </Tooltip>
  )
}
