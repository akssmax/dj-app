import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"

// Share cards need absolute URLs. Set SITE_URL, or let Vercel's production
// domain fill it in at build time.
const siteUrl = (
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "")
).replace(/\/$/, "")

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  define: { __SITE_URL__: JSON.stringify(siteUrl) },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Stable dependencies can stay cached across application changes.
            {
              name: "audio-engine",
              test: /src[\\/]lib[\\/]dj[\\/](?:engine|pitch-control|scratch-control|pad-fx|automation)\.ts$/,
              priority: 40,
            },
            {
              name: "react-runtime",
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: "router-runtime",
              test: /node_modules[\\/]@tanstack[\\/](?:router-core|react-router|history)[\\/]|node_modules[\\/]seroval[\\/]/,
              priority: 20,
            },
            {
              name: "ui-primitives",
              test: /node_modules[\\/](?:@base-ui|@floating-ui|cn)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
})

export default config
