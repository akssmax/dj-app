export const themes = [
  {
    id: "olive",
    name: "Cue Olive",
    description: "Warm olive surfaces · lime + amber decks",
    swatches: ["#111310", "#cfed8c", "#e9ad78"],
  },
  {
    id: "graphite",
    name: "Club Graphite",
    description: "Neutral booth surfaces · cyan + orange decks",
    swatches: ["#111318", "#69d9f2", "#ffb263"],
  },
  {
    id: "violet",
    name: "Midnight Violet",
    description: "Deep purple surfaces · lavender + pink decks",
    swatches: ["#14101f", "#c2b3ff", "#ff9bbd"],
  },
  {
    id: "daylight",
    name: "Daylight",
    description: "Bright surfaces · teal + burnt orange decks",
    swatches: ["#eef2f5", "#006a71", "#a84b12"],
  },
] as const
export type ThemeId = (typeof themes)[number]["id"]
export type StudioLayout = "mix" | "parallel" | "library"
