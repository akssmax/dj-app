export const themes = [
  {
    id: "studio",
    name: "Studio",
    description: "Soft charcoal hardware · cyan + yellow decks",
    swatches: ["#18181b", "#5cc8f5", "#f4e04d"],
  },
  {
    id: "olive",
    name: "Cue Olive",
    description: "Warm olive hardware · lime + amber decks",
    swatches: ["#121410", "#c6e77c", "#f2b46e"],
  },
  {
    id: "graphite",
    name: "Club Graphite",
    description: "Club booth graphite · cyan + orange decks",
    swatches: ["#0f1114", "#5fd4f0", "#ff9f4a"],
  },
  {
    id: "violet",
    name: "Midnight Violet",
    description: "Deep night violet · lavender + pink decks",
    swatches: ["#120f1d", "#b7a4ff", "#ff8fc2"],
  },
  {
    id: "daylight",
    name: "Daylight",
    description: "Bright paper surfaces · teal + rust decks",
    swatches: ["#edf1f5", "#0a7c86", "#c4571a"],
  },
] as const
export type ThemeId = (typeof themes)[number]["id"]
export type StudioLayout = "mix" | "parallel" | "library"
