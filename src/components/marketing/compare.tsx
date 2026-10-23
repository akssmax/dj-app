import { cn } from "@/lib/utils"

type Cell = { v: "yes" | "no" | "some"; note?: string }
const yes = (note?: string): Cell => ({ v: "yes", note })
const no = (note?: string): Cell => ({ v: "no", note })
const some = (note: string): Cell => ({ v: "some", note })

const tools = [
  "Cue",
  "Beatport DJ",
  "rekordbox",
  "Serato DJ",
  "Traktor Pro 4",
  "djay",
]

const rows: { label: string; cells: Cell[] }[] = [
  {
    label: "Runs in the browser, nothing to install",
    cells: [yes(), yes(), no(), no(), no(), no()],
  },
  {
    label: "Free to start",
    cells: [
      yes("Free beta"),
      yes("Free tier"),
      yes("Free tier"),
      yes("DJ Lite"),
      no("Paid licence"),
      yes("Free tier"),
    ],
  },
  {
    label: "Live coach for each transition",
    cells: [yes("Zones, timing, EQ"), no(), no(), no(), no(), no()],
  },
  {
    label: "Built-in mixing lessons",
    cells: [yes("28 techniques"), no(), no(), no(), no(), no()],
  },
  {
    label: "Automix",
    cells: [
      yes("Shows its reasoning"),
      yes(),
      yes(),
      some("Autoplay"),
      some("Cruise mode"),
      yes(),
    ],
  },
  {
    label: "Stem separation",
    cells: [some("Prepared on your device"), no(), yes(), yes(), yes(), yes()],
  },
  {
    label: "Decks",
    cells: [
      some("2"),
      some("2"),
      yes("Up to 4"),
      yes("Up to 4"),
      yes("Up to 4"),
      yes("Up to 4"),
    ],
  },
  {
    label: "Controllers",
    cells: [
      some("DDJ-FLX4"),
      some("Selected MIDI"),
      yes("Wide range"),
      yes("Wide range"),
      yes("Wide range"),
      yes("Wide range"),
    ],
  },
]

const bestFor = [
  "Learning and having fun",
  "Trying Beatport tracks in a mix",
  "Preparing for club CDJs",
  "Open-format and scratch DJs",
  "Live, creative performance",
  "Casual and mobile mixing",
]

const mark = { yes: "✓", no: "—", some: "◐" }
const markLabel = { yes: "Yes", no: "No", some: "Partly" }

export function CompareTable() {
  return (
    <>
      <div
        className="site-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Comparison table"
      >
        <table className="site-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Feature</span>
              </th>
              {tools.map((t, i) => (
                <th key={t} scope="col" className={i === 0 ? "is-cue" : ""}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {row.cells.map((c, i) => (
                  <td
                    key={tools[i]}
                    className={cn(`cell-${c.v}`, i === 0 && "is-cue")}
                  >
                    <span className="cell-mark" aria-label={markLabel[c.v]}>
                      {mark[c.v]}
                    </span>
                    {c.note && <span className="cell-note">{c.note}</span>}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="row-best">
              <th scope="row">Best for</th>
              {bestFor.map((b, i) => (
                <td key={tools[i]} className={i === 0 ? "is-cue" : ""}>
                  {b}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="site-fine site-legend">
        ✓ yes · ◐ partly · — not built in. From public product information,
        October 2026. Features and pricing change, so check each vendor before
        you decide.
      </p>
    </>
  )
}
