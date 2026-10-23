// Exercise the generated server handler directly; no browser or network needed.
import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"

const output = new URL("../.vercel/output/", import.meta.url)
const config = JSON.parse(
  await readFile(new URL("config.json", output), "utf8")
)
assert.equal(config.version, 3)
assert(config.routes.some((route) => route.handle === "filesystem"))
assert(config.routes.some((route) => route.dest === "/__server"))
const { default: server } = await import(
  new URL("functions/__server.func/index.mjs", output)
)

for (const path of ["/", "/app", "/learn", "/roadmap"]) {
  const response = await server.fetch(
    new Request(`https://dj-app-kappa.vercel.app${path}`)
  )
  const html = await response.text()
  assert.equal(response.status, 200, path)
  assert(
    html.includes("<html") && html.includes("Cue"),
    `${path}: SSR document missing`
  )
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)/g)].map(
    (match) => match[1]
  )
  assert(assets.length > 0, `${path}: client assets missing`)
  await Promise.all(
    assets.map((asset) => access(new URL(`static${asset}`, output)))
  )
  console.log(
    `${path}: HTTP 200, SSR and ${assets.length} referenced assets verified`
  )
}
const response = await server.fetch(
  new Request("https://dj-app-kappa.vercel.app/nonexistent-test-route")
)
assert.equal(response.status, 404)
console.log("Unknown route: application HTTP 404 verified")
await access(new URL("static/audio/club-no-copyright.mp3", output))
console.log("Demo audio: CDN asset verified")
