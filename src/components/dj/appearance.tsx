import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDJ } from "./provider"
import { themes } from "@/lib/dj/themes"

export function ThemeSelect() {
  const { theme, setTheme } = useDJ()
  return (
    <Select value={theme} onValueChange={(value) => value && setTheme(value)}>
      <SelectTrigger className="theme-selector" aria-label="Studio theme">
        <SelectValue>{themes.find((t) => t.id === theme)?.name}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {themes.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function AppearanceSettings() {
  const { theme, setTheme } = useDJ()
  return (
    <div className="settings-content">
      <div className="appearance-density">
        <strong>Interface size</strong>
        <DensitySelect />
        <p className="muted">
          Dense and Compact tighten spacing and controls. Text stays at least
          12px in all sizes.
        </p>
      </div>
      <p>
        Choose a palette for the booth, headphones or daylight practice. Deck
        colors, waveforms, surfaces and controls change together.
      </p>
      <div className="theme-cards">
        {themes.map((t) => (
          <Button
            key={t.id}
            variant="outline"
            className="theme-card"
            aria-label={`Use ${t.name} theme`}
            aria-pressed={theme === t.id}
            onClick={() => setTheme(t.id)}
          >
            <div className="theme-swatches">
              {t.swatches.map((color) => (
                <span key={color} style={{ background: color }} />
              ))}
            </div>
            <strong>
              {t.name}
              {theme === t.id ? " ✓" : ""}
            </strong>
            <span>{t.description}</span>
          </Button>
        ))}
      </div>
      <p className="muted">
        Your theme, interface size, studio layout and quantize settings save in
        IndexedDB.
      </p>
    </div>
  )
}

export function DensitySelect() {
  const { density, setDensity } = useDJ()
  return (
    <Select
      value={density}
      onValueChange={(value) => value && setDensity(value)}
    >
      <SelectTrigger className="density-selector" aria-label="Interface size">
        <SelectValue>
          {density === "dense"
            ? "Dense · 32px"
            : density === "compact"
              ? "Compact · 40px"
              : "Comfortable · 44px"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-64">
        <SelectItem value="dense">Dense · 32px controls</SelectItem>
        <SelectItem value="compact">Compact · 40px controls</SelectItem>
        <SelectItem value="comfortable">Comfortable · 44px controls</SelectItem>
      </SelectContent>
    </Select>
  )
}
