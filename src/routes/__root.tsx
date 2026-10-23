import {
  HeadContent,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router"
import { DJProvider } from "@/components/dj/provider"
import { AppShell } from "@/components/dj/shell"

import appCss from "../styles.css?url"
import themeCss from "../themes.css?url"
import studioCss from "../studio.css?url"
import marketingCss from "../marketing.css?url"

// Public pages render without the audio engine or studio shell.
const marketingRoutes = new Set(["/", "/home", "/roadmap"])

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
