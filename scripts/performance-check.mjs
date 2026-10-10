// Terminal-only benchmark; no browser, device permissions, or personal music.
import { build } from "vite"
import { performance } from "node:perf_hooks"

const bundle = await build({
  configFile: false,
  logLevel: "silent",
  build: {
    ssr: "src/lib/dj/loudness.ts",
    write: false,
    rolldownOptions: { output: { format: "es" } },
  },
})
const entry = bundle.output.find(
  (item) => item.type === "chunk" && item.isEntry
)
const { prepareLoudness, measureLoudness } = await import(
  `data:text/javascript;base64,${Buffer.from(entry.code).toString("base64")}`
)
const sampleRate = 44100
const channels = Array.from({ length: 2 }, (_, c) =>
  Float32Array.from(
    { length: sampleRate * 300 },
    (_, i) => (c ? -1 : 1) * 0.2 * Math.sin(i * 0.07)
  )
)
const buffer = {
  length: channels[0].length,
  sampleRate,
  numberOfChannels: 2,
  getChannelData: (c) => channels[c],
}
const time = (fn) => {
  const start = performance.now()
  fn()
  return performance.now() - start
}
const coldMs = time(() => measureLoudness(buffer, 160, 32))
const runQueries = () => {
  for (let i = 0; i < 100; i++) measureLoudness(buffer, 40 + i * 0.137, 32)
}
const beforeMs = time(runQueries)
let yields = 0
const prepareStart = performance.now()
await prepareLoudness(
  buffer,
  () => true,
  async () => {
    yields++
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
)
const prepareMs = performance.now() - prepareStart
const afterMs = time(runQueries)
console.log(
  JSON.stringify(
    {
      fixture: "5-minute stereo PCM at 44.1 kHz",
      queries: 100,
      coldMs,
      beforeMs,
      afterMs,
      prepareMs,
      yields,
      speedup: beforeMs / afterMs,
    },
    null,
    2
  )
)
