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
    id: "neon",
    name: "Neon Club",
    description: "Pitch-black booth · magenta + cyan decks",
    swatches: ["#09090d", "#ff4fd8", "#2ee6ff"],
  },
  {
    id: "sunset",
    name: "Sunset Lounge",
    description: "Warm dusk surfaces · coral + gold decks",
    swatches: ["#15100e", "#ff8a65", "#ffd166"],
  },
  {
    id: "daylight",
    name: "Daylight",
    description: "Sunny cream paper · tangerine + berry decks",
    swatches: ["#faf6ef", "#e0480f", "#c42d82"],
  },
  {
    id: "pastel",
    name: "Pastel Pop",
    description: "Soft lilac candy · violet + pink decks",
    swatches: ["#faf5fc", "#7c3aed", "#e5337a"],
  },
  {
    id: "matcha",
    name: "Matcha",
    description: "Fresh green tea paper · leaf + mango decks",
    swatches: ["#f3f7ef", "#3d8a1e", "#d97706"],
  },
] as const
export type ThemeId = (typeof themes)[number]["id"]

const lightThemes: readonly ThemeId[] = ["daylight", "pastel", "matcha"]
export const isLightTheme = (theme: ThemeId) => lightThemes.includes(theme)
export type StudioLayout = "mix" | "parallel" | "library" | "visual"
