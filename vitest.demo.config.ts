import { defineConfig } from "vitest/config"

// Writes public/analysis/demo.json (`pnpm analyze:demo`), kept out of `pnpm test`.
export default defineConfig({
  test: {
    include: ["scripts/bench/demo-analysis.ts"],
    environment: "node",
    silent: false,
  },
})
