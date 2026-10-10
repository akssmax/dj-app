import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const config = defineConfig({
  resolve: { tsconfigPaths: true },
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
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
})

export default config
