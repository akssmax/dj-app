/**
 * Analysis accuracy bench. Run with `pnpm bench:analysis`.
 *
 * - Synthetic tracks (scripts/bench/synth.ts): exact tempo, beats,
 *   downbeats, key and section changes.
 * - The ten bundled Pixabay demo tracks: tempo only (measured by this analyzer).
 * - Optional: set BENCH_AUDIO_DIR to a GiantSteps-style folder
 *   (audio/*.mp3, annotations/tempo/*.bpm, annotations/key/*.key). Those
 *   previews are copyrighted, so they are never committed.
 */
import { join, basename } from "node:path"
import { it } from "vitest"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { analyzeAudio, analyzeTrack } from "../../src/lib/dj/analyze"
import { demoTracks } from "../../src/lib/dj/tracks"
import { benchSpecs, camelotOf, synthTrack } from "./synth"
import { beatModel, decodeMp3 } from "./node-audio"
import { fMeasure, keyScore, mean, predictedGrid, tempoScore } from "./metrics"

type Row = {
  name: string
  tempo?: { acc1: boolean; acc2: boolean }
  beatF?: number
  downbeatF?: number
  key?: number
  boundaryF?: number
  seconds: number
  detail?: string
}

/** GiantSteps key files say e.g. "A minor" or "Eb major". */
function camelotFromText(text: string) {
  const match = text.trim().match(/^([A-G])([b#]?)\s*(major|minor)/i)
  if (!match) return null
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[
    match[1].toUpperCase() as "C"
  ]
  const root = base + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0)
  return camelotOf(root, match[3].toLowerCase() as "major" | "minor")
}

const pct = (v: number) => `${Math.round(v * 100)}%`

it("analysis accuracy", { timeout: 1_800_000 }, async () => {
  const rows: Row[] = []
  const model = await beatModel()
  // dsp: signal processing only; model: always the beat model; auto: the
  // app's default, the model only when the fast grid is unsure.
  const methods = model
    ? (["dsp", "model", "auto"] as const)
    : (["dsp"] as const)
  const run = (
    method: "dsp" | "model" | "auto",
    channels: Float32Array[],
    sampleRate: number
  ) =>
    method === "dsp"
      ? Promise.resolve(analyzeAudio(channels, sampleRate))
      : analyzeTrack(
          channels,
          sampleRate,
          async () => model,
          method === "model" ? Infinity : undefined
        )
  const prefix = { dsp: "", model: "model/", auto: "auto/" }
  const ccPrefix = { dsp: "cc:", model: "cc-model:", auto: "cc-auto:" }
  for (const method of methods)
    for (const spec of benchSpecs) {
      const { channels, sampleRate, truth } = synthTrack(spec)
      const started = performance.now()
      const analysis = await run(method, channels, sampleRate)
      const seconds = (performance.now() - started) / 1000
      const grid = predictedGrid(analysis, channels[0].length / sampleRate)
      rows.push({
        name: `${prefix[method]}${spec.name}`,
        tempo: tempoScore(analysis.bpm, truth.bpm),
        beatF: fMeasure(grid.beats, truth.beats),
        downbeatF: fMeasure(grid.downbeats, truth.downbeats),
        key: keyScore(analysis.camelot, truth.key.camelot),
        boundaryF: fMeasure(
          analysis.sections ?? [],
          truth.boundaries,
          (60 / truth.bpm) * 4
        ),
        seconds,
        detail: `bpm ${analysis.bpm} (true ${truth.bpm}) · key ${analysis.camelot} (true ${truth.key.camelot}) · first downbeat ${(grid.downbeats[0] ?? NaN).toFixed(2)} (true ${truth.downbeats[0].toFixed(2)}) · ${analysis.sections?.length ?? 0} changes (true ${truth.boundaries.length})`,
      })
    }
  for (const method of methods)
    for (const track of demoTracks) {
      const path = join("public", track.url)
      if (!existsSync(path)) continue
      const { channels, sampleRate } = await decodeMp3(path)
      const started = performance.now()
      const analysis = await run(method, channels, sampleRate)
      rows.push({
        name: `${ccPrefix[method]}${basename(track.url)}`,
        tempo: tempoScore(analysis.bpm, track.bpm!),
        seconds: (performance.now() - started) / 1000,
        detail: `bpm ${analysis.bpm} (published ${track.bpm}) · key ${analysis.camelot} · grid ${analysis.gridConfidence} · ${analysis.method}`,
      })
    }
  const dir = process.env.BENCH_AUDIO_DIR
  if (dir && existsSync(join(dir, "audio")))
    for (const file of readdirSync(join(dir, "audio")).filter((f) =>
      f.endsWith(".mp3")
    )) {
      const base = file.replace(/\.mp3$/, "")
      const bpmFile = join(dir, "annotations/tempo", `${base}.bpm`),
        keyFile = join(dir, "annotations/key", `${base}.key`)
      const { channels, sampleRate } = await decodeMp3(join(dir, "audio", file))
      const started = performance.now()
      const analysis = analyzeAudio(channels, sampleRate)
      const keyTruth = existsSync(keyFile)
        ? camelotFromText(readFileSync(keyFile, "utf8"))
        : null
      rows.push({
        name: `gs:${base}`,
        tempo: existsSync(bpmFile)
          ? tempoScore(analysis.bpm, parseFloat(readFileSync(bpmFile, "utf8")))
          : undefined,
        key: keyTruth ? keyScore(analysis.camelot, keyTruth) : undefined,
        seconds: (performance.now() - started) / 1000,
      })
    }

  const summary = (group: Row[]) => {
    const tempo = group.filter((r) => r.tempo)
    const of = (key: "beatF" | "downbeatF" | "key" | "boundaryF") =>
      group.map((r) => r[key]).filter((v): v is number => v !== undefined)
    return {
      tracks: group.length,
      tempoAcc1: tempo.length
        ? pct(tempo.filter((r) => r.tempo!.acc1).length / tempo.length)
        : "–",
      tempoAcc2: tempo.length
        ? pct(tempo.filter((r) => r.tempo!.acc2).length / tempo.length)
        : "–",
      beatF: of("beatF").length ? pct(mean(of("beatF"))) : "–",
      downbeatF: of("downbeatF").length ? pct(mean(of("downbeatF"))) : "–",
      key: of("key").length ? pct(mean(of("key"))) : "–",
      boundaryF: of("boundaryF").length ? pct(mean(of("boundaryF"))) : "–",
      secondsPerTrack: mean(group.map((r) => r.seconds)).toFixed(2),
    }
  }
  const groups = {
    synthetic: rows.filter(
      (r) =>
        !r.name.includes(":") &&
        !r.name.startsWith("model/") &&
        !r.name.startsWith("auto/")
    ),
    "synthetic (model)": rows.filter((r) => r.name.startsWith("model/")),
    "synthetic (auto)": rows.filter((r) => r.name.startsWith("auto/")),
    "cc tracks": rows.filter((r) => r.name.startsWith("cc:")),
    "cc tracks (model)": rows.filter((r) => r.name.startsWith("cc-model:")),
    "cc tracks (auto)": rows.filter((r) => r.name.startsWith("cc-auto:")),
    giantsteps: rows.filter((r) => r.name.startsWith("gs:")),
  }
  console.log(
    "\n| Set | Tracks | Tempo ±4% | Tempo incl. octave | Beat F | Downbeat F | Key (MIREX) | Section F (±1 bar) | s/track |"
  )
  console.log("|---|---|---|---|---|---|---|---|---|")
  for (const [name, group] of Object.entries(groups)) {
    if (!group.length) continue
    const s = summary(group)
    console.log(
      `| ${name} | ${s.tracks} | ${s.tempoAcc1} | ${s.tempoAcc2} | ${s.beatF} | ${s.downbeatF} | ${s.key} | ${s.boundaryF} | ${s.secondsPerTrack} |`
    )
  }
  console.log("\nPer track:")
  for (const r of rows)
    console.log(
      `${r.name.padEnd(28)} ${r.detail ?? ""}\n${"".padEnd(28)} tempo ${r.tempo ? (r.tempo.acc1 ? "✓" : r.tempo.acc2 ? "octave" : "✗") : "–"}  beat ${r.beatF !== undefined ? pct(r.beatF) : "–"}  downbeat ${r.downbeatF !== undefined ? pct(r.downbeatF) : "–"}  key ${r.key !== undefined ? r.key : "–"}  sections ${r.boundaryF !== undefined ? pct(r.boundaryF) : "–"}`
    )
})
