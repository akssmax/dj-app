import { defineConfig } from "vitest/config"

// The analysis accuracy bench (`pnpm bench:analysis`), kept out of `pnpm test`.
export default defineConfig({
  test: {
    include: ["scripts/bench/**/*.bench.test.ts"],
    environment: "node",
    reporters: ["default"],
    silent: false,
  },
})
