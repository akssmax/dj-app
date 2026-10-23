import {
  HeadContent,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router"
import { DJProvider } from "@/components/dj/provider"
import { AppShell } from "@/components/dj/shell"
import { useEffect } from "react"
import { loadVisitorCount } from "@/lib/visitors"

import appCss from "../styles.css?url"
import themeCss from "../themes.css?url"
import studioCss from "../studio.css?url"
import marketingCss from "../marketing.css?url"

// Public pages render without the audio engine or studio shell.
const marketingRoutes = new Set([
  "/",
  "/home",
  "/roadmap",
  "/compare",
  "/automix-test",
])

const shareDescription =
  "A free DJ studio in your browser: Automix that explains every transition, stems, a live mixing coach and DDJ-FLX4 support. No install; your music stays on your computer."

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Cue — DJ studio",
      },
      {
        name: "description",
        content:
          "Cue is a free browser DJ studio with a live mixing coach. Two decks. One mix.",
      },
      { name: "theme-color", content: "#0b0b0d" },
      // Link previews on X/Twitter, Slack, iMessage and the like.
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Cue" },
      {
        property: "og:title",
        content: "Cue — the DJ studio that mixes with you",
      },
      { property: "og:description", content: shareDescription },
      { property: "og:image", content: `${__SITE_URL__}/og.jpg` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content:
          "Cue: The DJ studio that mixes with you. Free in your browser.",
      },
      ...(__SITE_URL__ ? [{ property: "og:url", content: __SITE_URL__ }] : []),
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: "Cue — the DJ studio that mixes with you",
      },
      { name: "twitter:description", content: shareDescription },
      { name: "twitter:image", content: `${__SITE_URL__}/og.jpg` },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "stylesheet", href: themeCss },
      { rel: "stylesheet", href: studioCss },
      { rel: "stylesheet", href: marketingCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const marketing = useRouterState({
    select: (state) => marketingRoutes.has(state.location.pathname),
  })
  // Count the visit on whichever page someone lands, studio included.
  useEffect(() => {
    void loadVisitorCount()
  }, [])
  return (
    <html lang="en" className="dark" data-theme="studio">
      <head>
        <HeadContent />
      </head>
      <body>
        {marketing ? (
          children
        ) : (
          <DJProvider>
            <AppShell>{children}</AppShell>
          </DJProvider>
        )}
        <Scripts />
      </body>
    </html>
  )
}
