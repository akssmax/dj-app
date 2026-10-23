// Capture real studio UI for the landing page (public/marketing/*.jpg).
// Needs a running dev server and a Playwright install:
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
//   CHROME=/path/to/chrome \
//   node scripts/capture-marketing.mjs http://localhost:3000
import { execFileSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core")
const base = process.argv[2] ?? "http://localhost:3000"
const out = fileURLToPath(new URL("../public/marketing/", import.meta.url))

const themes = [
  ["studio", false],
  ["olive", false],
  ["graphite", false],
  ["violet", false],
  ["neon", false],
  ["sunset", false],
  ["daylight", true],
  ["pastel", true],
  ["matcha", true],
]

const browser = await chromium.launch({ executablePath: process.env.CHROME })
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1.5,
})
await page.goto(base + "/app", { waitUntil: "networkidle" })
await page.waitForSelector("section.performance-grid", { timeout: 30000 })
// Both decks must finish analysis, or the shots show "Analyzing…" placeholders.
await page.waitForFunction(
  () =>
    !/Analyz(ing|ir)/i.test(
      document.querySelector("section.performance-grid")?.textContent ?? ""
    ),
  undefined,
  { timeout: 60000 }
)
await page.waitForTimeout(1500)

// Clip the decks with an equal margin of studio background on every side so
// the cards' rounded edges are not cut off. Neighbouring sections sit closer
// than that, so push them away while capturing.
const PAD = 20
await page.addStyleTag({
  content: `section.performance-grid { margin-block: ${PAD + 8}px !important; }`,
})
await page.waitForTimeout(300)
async function shootGrid(path) {
  const box = await page.locator("section.performance-grid").boundingBox()
  if (!box) throw new Error("Decks not found")
  await page.screenshot({
    path,
    type: "jpeg",
    quality: 82,
    fullPage: true,
    clip: {
      x: box.x - PAD,
      y: box.y + (await page.evaluate(() => scrollY)) - PAD,
      width: box.width + PAD * 2,
      height: box.height + PAD * 2,
    },
  })
}

async function applyTheme(id, light) {
  await page.evaluate(
    ([theme, isLight]) => {
      const root = document.documentElement
      root.dataset.theme = theme
      root.classList.toggle("dark", !isLight)
      root.style.colorScheme = isLight ? "light" : "dark"
    },
    [id, light]
  )
  await page.waitForTimeout(400)
}

for (const [id, light] of themes) {
  await applyTheme(id, light)
  await shootGrid(`${out}mixer-${id}.jpg`)
  console.log(`mixer-${id}.jpg`)
}

// Small copies for the landing page's theme gallery (macOS sips).
mkdirSync(`${out}thumbs`, { recursive: true })
for (const [id] of themes) {
  execFileSync("sips", [
    "-Z",
    "560",
    "-s",
    "formatOptions",
    "72",
    `${out}mixer-${id}.jpg`,
    "--out",
    `${out}thumbs/mixer-${id}.jpg`,
  ])
}

await applyTheme("studio", false)
await page
  .locator(".coach-top-slot")
  .screenshot({ path: `${out}coach.jpg`, type: "jpeg", quality: 85 })
await page
  .locator("section.transition-workspace")
  .screenshot({ path: `${out}transition.jpg`, type: "jpeg", quality: 82 })
console.log("coach.jpg, transition.jpg")

// Learn & Play: lesson guidance down through the top of both decks.
await page.goto(base + "/learn", { waitUntil: "networkidle" })
await page.waitForSelector(".practice-workspace section.performance-grid", {
  timeout: 30000,
})
await page.waitForTimeout(2500)
const top = await page.locator(".practice-toolbar").boundingBox()
const decks = await page
  .locator(".practice-workspace section.performance-grid")
  .boundingBox()
if (!top || !decks) throw new Error("Learn & Play layout not found")
await page.screenshot({
  path: `${out}learn.jpg`,
  type: "jpeg",
  quality: 82,
  fullPage: true,
  clip: {
    x: decks.x - 16,
    y: top.y - 16,
    width: decks.width + 32,
    // Stop just below the deck waveforms.
    height: decks.y - top.y + 32 + Math.min(decks.height, 385),
  },
})
console.log("learn.jpg")
await browser.close()
