import { useState } from "react"
import { themes, isLightTheme } from "@/lib/dj/themes"
import type { ThemeId } from "@/lib/dj/themes"
import { cn } from "@/lib/utils"

type Filter = "all" | "dark" | "light"

export const mixerShot = (id: string) => `/marketing/mixer-${id}.jpg`
const thumb = (id: string) => `/marketing/thumbs/mixer-${id}.jpg`

export function ThemesSection({
  theme,
  onTheme,
}: {
  theme: ThemeId
  onTheme: (id: ThemeId) => void
}) {
  const [filter, setFilter] = useState<Filter>("all")
  const current = themes.find((t) => t.id === theme) ?? themes[0]
  const dark = themes.filter((t) => !isLightTheme(t.id))
  const shown = themes.filter((t) =>
    filter === "all" ? true : (filter === "light") === isLightTheme(t.id)
  )
  const filters: [Filter, string, number][] = [
    ["all", "All", themes.length],
    ["dark", "Dark rooms", dark.length],
    ["light", "Daylight", themes.length - dark.length],
  ]

  return (
    <section id="themes" className="site-section">
      <div className="site-wrap">
        <div className="themes-head">
          <div className="section-head">
            <p className="site-eyebrow">Themes</p>
            <h2>Make the booth yours.</h2>
            <p className="site-sub">
              {themes.length} looks for every room. Pick one and this whole page
              changes with it.
            </p>
          </div>
          <div
            className="theme-filters"
            role="group"
            aria-label="Filter themes"
          >
            {filters.map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {label} <span>{n}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="themes-body">
          <figure className="theme-stage site-shot">
            <img
              key={theme}
              src={mixerShot(theme)}
              alt={`Decks and mixer in the ${current.name} theme`}
              width={2088}
              height={1506}
              loading="lazy"
            />
            <figcaption className="theme-label">
              <span className="theme-swatch" aria-hidden="true">
                {current.swatches.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              <span>
                <strong>{current.name}</strong>
                <small>{current.description}</small>
              </span>
            </figcaption>
          </figure>

          <div className="theme-gallery" role="radiogroup" aria-label="Theme">
            {shown.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={t.id === theme}
                className={cn(
                  "theme-card",
                  isLightTheme(t.id) && "theme-card-light"
                )}
                onClick={() => onTheme(t.id)}
                onPointerEnter={() => {
                  new Image().src = mixerShot(t.id)
                }}
              >
                <img src={thumb(t.id)} alt="" loading="lazy" />
                <span className="theme-card-meta">
                  <span className="theme-dots" aria-hidden="true">
                    {t.swatches.map((c) => (
                      <i key={c} style={{ background: c }} />
                    ))}
                  </span>
                  <strong>{t.name}</strong>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
