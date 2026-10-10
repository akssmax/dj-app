import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"
import { DJProvider } from "@/components/dj/provider"
import { AppShell } from "@/components/dj/shell"

import appCss from "../styles.css?url"
import themeCss from "../themes.css?url"

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
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "stylesheet", href: themeCss },
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
  return (
    <html lang="en" className="dark" data-theme="graphite">
      <head>
        <HeadContent />
      </head>
      <body>
        <DJProvider>
          <AppShell>{children}</AppShell>
        </DJProvider>
        <Scripts />
      </body>
    </html>
  )
}
