import { Link } from "@tanstack/react-router"
import type { CSSProperties, ReactNode } from "react"
import { CueWordmark } from "@/components/brand/mark"
import { APP_RELEASE, APP_VERSION } from "@/lib/version"
import { AsciiBackdrop } from "./ascii-backdrop"
import { useVisitorCount } from "@/lib/visitors"
import { cn } from "@/lib/utils"

// Midnight Violet's deck colors: the default palette for the public pages.
export const DEFAULT_PALETTE = ["#b7a4ff", "#ff8fc2"] as const

/** Public visitor total; renders nothing until it loads or if it fails. */
export function VisitorCount({ className }: { className?: string }) {
  const count = useVisitorCount()
  if (count === null) return null
  return (
    <span className={cn("visitor-count", className)}>
      <i aria-hidden="true" />
      {count.toLocaleString("en-US")} {count === 1 ? "visitor" : "visitors"} so
      far
    </span>
  )
}

export function ReleaseChip() {
  return (
    <span className="site-chip">
      <span className="site-chip-dot" />
      {APP_RELEASE}
    </span>
  )
}

// Pick readable text for buttons filled with the two accents.
function isBright(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 150
}

export function paletteStyle(palette: readonly [string, string]) {
  const [a, b] = palette
  return {
    "--deck-a": a,
    "--deck-b": b,
    "--on-accent": isBright(a) && isBright(b) ? "#0b0b0d" : "#ffffff",
  } as CSSProperties
}

export function SiteLayout({
  children,
  palette = DEFAULT_PALETTE,
}: {
  children: ReactNode
  palette?: readonly [string, string]
}) {
  return (
    <div className="site" style={paletteStyle(palette)}>
      <a className="site-skip" href="#content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-wrap site-header-inner">
          <Link to="/" className="site-brand" aria-label="Cue home">
            <CueWordmark size={28} />
          </Link>
          <ReleaseChip />
          <nav className="site-nav" aria-label="Main">
            <a href="/#automix">Automix</a>
            <a href="/#features">Features</a>
            <a href="/#themes">Themes</a>
            <a href="/#compare">Compare</a>
            <Link to="/roadmap" activeProps={{ "aria-current": "page" }}>
              Roadmap
            </Link>
          </nav>
          <Link to="/app" className="site-btn site-btn-primary site-header-cta">
            Start mixing
          </Link>
        </div>
      </header>
      <main id="content">{children}</main>
      <SiteFooter palette={palette} />
    </div>
  )
}

function SiteFooter({ palette }: { palette: readonly [string, string] }) {
  return (
    <footer className="site-footer">
      <div className="site-wrap footer-top">
        <div className="footer-pitch">
          <h2>
            Two decks.
            <br />
            <span className="site-grad">One mix.</span>
          </h2>
          <p>
            Free while in beta. No account, nothing to install. Your music stays
            on your computer.
          </p>
          <div className="site-actions site-actions-start">
            <Link to="/app" className="site-btn site-btn-primary site-btn-lg">
              Start mixing
            </Link>
            <Link to="/learn" className="site-btn site-btn-lg">
              Start a lesson
            </Link>
          </div>
        </div>
        <div className="footer-links">
          <nav aria-label="Product">
            <h3>Product</h3>
            <Link to="/app">DJ studio</Link>
            <Link to="/learn">Learn to mix</Link>
            <a href="/#automix">Automix</a>
            <a href="/#themes">Themes</a>
          </nav>
          <nav aria-label="Project">
            <h3>Project</h3>
            <Link to="/roadmap">Roadmap</Link>
            <a href="/#compare">Compare</a>
            <a href="/#features">Features</a>
          </nav>
          <nav aria-label="Credits">
            <h3>Credits</h3>
            <a
              href="https://incompetech.com/music/royalty-free/"
              target="_blank"
              rel="noreferrer"
            >
              Music: Kevin MacLeod
            </a>
            <a
              href="https://creativecommons.org/licenses/by/3.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY 3.0
            </a>
            <a href="/fonts/bricolage/OFL.txt">Font licence</a>
          </nav>
        </div>
      </div>

      <div className="footer-stage">
        <AsciiBackdrop
          palette={palette}
          shape="pinch"
          characters=" .:-=+*x#"
          cellSize={16}
          density={0.75}
          glyphOpacity={0.8}
          gradientOpacity={0.35}
          grain={0.04}
          flicker={0.15}
          speed={0.6}
          dpr={1.25}
          maxFps={30}
          intro={false}
          clickEffect="burst"
        />
        <p className="footer-giant" aria-hidden="true">
          cue
        </p>
      </div>

      <div className="site-wrap footer-base">
        <CueWordmark size={20} />
        <span className="footer-version">
          {APP_RELEASE} · {APP_VERSION}
        </span>
        <VisitorCount />
        <span className="footer-legal">
          rekordbox, Serato, Traktor, djay and Beatport are trademarks of their
          owners. Cue is not affiliated with them.
        </span>
        <a href="#content" className="footer-top-link">
          Back to top ↑
        </a>
      </div>
    </footer>
  )
}
