import { Link } from "@tanstack/react-router"
import type { CSSProperties, ReactNode } from "react"
import { CueWordmark } from "@/components/brand/mark"
import { APP_RELEASE, APP_VERSION } from "@/lib/version"
import { AsciiBackdrop } from "./ascii-backdrop"
import { useVisitorCount } from "@/lib/visitors"
import { cn } from "@/lib/utils"

/** Cue's public source code. */
export const REPO_URL = "https://github.com/akssmax/dj-app"

/** GitHub's mark (Octicons "mark-github", MIT). */
function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  )
}

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
            <Link to="/compare" activeProps={{ "aria-current": "page" }}>
              Compare
            </Link>
            <Link to="/roadmap" activeProps={{ "aria-current": "page" }}>
              Roadmap
            </Link>
          </nav>
          <a
            href={REPO_URL}
            className="site-github"
            target="_blank"
            rel="noreferrer"
            aria-label="Cue on GitHub"
            title="Cue on GitHub"
          >
            <GitHubMark />
          </a>
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
            <Link to="/automix-test">Automix test set</Link>
            <a href="/#themes">Themes</a>
          </nav>
          <nav aria-label="Project">
            <h3>Project</h3>
            <Link to="/roadmap">Roadmap</Link>
            <Link to="/compare">Compare</Link>
            <a href="/#features">Features</a>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              Source on GitHub
            </a>
          </nav>
          <nav aria-label="Credits">
            <h3>Credits</h3>
            <a
              href="https://pixabay.com/music/"
              target="_blank"
              rel="noreferrer"
            >
              Music: Pixabay
            </a>
            <a
              href="https://pixabay.com/service/license-summary/"
              target="_blank"
              rel="noreferrer"
            >
              Pixabay Content License
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
          rekordbox, Serato, Traktor, djay, VirtualDJ and Beatport are
          trademarks of their owners. Cue is not affiliated with them.
        </span>
        <a href="#content" className="footer-top-link">
          Back to top ↑
        </a>
      </div>
    </footer>
  )
}
