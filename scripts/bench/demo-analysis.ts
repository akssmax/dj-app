/**
 * Pre-analyzes the bundled demo tracks so visitors can play them at once.
 * Run with `pnpm analyze:demo` after changing demo audio or the analyzer;
 * it writes public/analysis/demo.json.
 */
import { writeFileSync } from "node:fs"
import { it } from "vitest"
import { analyzeTrack } from "../../src/lib/dj/analyze"
import { demoTracks } from "../../src/lib/dj/tracks"
import type { Analysis } from "../../src/lib/dj/types"
import { beatModel, decodeMp3 } from "./node-audio"

// Four decimals keep beats sub-millisecond and the file small.
const round = (_: string, value: unknown) =>
  typeof value === "number" && !Number.isInteger(value)
    ? Math.round(value * 1e4) / 1e4
    : value

it("demo analysis", { timeout: 1_800_000 }, async () => {
  const model = await beatModel()
  if (!model) throw new Error("The beat model is required for demo analysis.")
  const out: Record<string, { duration: number; analysis: Analysis }> = {}
  for (const track of demoTracks) {
    const { channels, sampleRate } = await decodeMp3(`public${track.url}`)
    // Bundled demos always get the model's answer.
    const analysis = await analyzeTrack(
      channels,
      sampleRate,
      async () => model,
      Infinity
    )
    out[track.id] = {
      duration: channels[0].length / sampleRate,
      analysis: { ...analysis, analyzedAt: new Date().toISOString() },
    }
    console.log(
      `${track.title}: ${analysis.bpm} BPM, ${analysis.camelot}, ${analysis.method}`
    )
  }
  writeFileSync("public/analysis/demo.json", JSON.stringify(out, round))
})
