import type { Track, Transition } from "./types"

/**
 * Mixing families: genres that DJs mix the same way. Blend length, preferred
 * techniques and how much keys or vocals matter follow the family, not the
 * exact sub-genre (Pioneer DJ, "mixing techniques behind every major genre").
 */
export type GenreFamily =
  | "house"
  | "techno"
  | "trance"
  | "dnb"
  | "bass"
  | "edm"
  | "hiphop"
  | "afro"
  | "other"

export type TechniqueId =
  | "blend"
  | "bass"
  | "long"
  | "harmonic"
  | "filter"
  | "loop"
  | "echo"
  | "reverb"
  | "fade"
  | "cut"
  | "dropswap"
  | "breakswap"
  | "crossover"

export type GenreProfile = {
  family: GenreFamily
  label: string
  /** Bars for a standard blend / bass swap. */
  blendBars: number
  /** Bars for a long blend; null when long overlaps don't suit the style. */
  longBars: number | null
  prefer: TechniqueId[]
  avoid: TechniqueId[]
  /** How much a key clash costs (1 = default). */
  keyWeight: number
  /** How much vocal overlap costs (1 = default). */
  vocalWeight: number
  /** Song-based tracks: no DJ intro, enter at the hook, keep it short. */
  songMode: boolean
}

export const genreProfiles: Record<GenreFamily, GenreProfile> = {
  house: {
    family: "house",
    label: "House",
    blendBars: 16,
    longBars: 32,
    prefer: ["bass", "blend", "long"],
    avoid: [],
    keyWeight: 1,
    vocalWeight: 1,
    songMode: false,
  },
  techno: {
    family: "techno",
    label: "Techno",
    blendBars: 32,
    longBars: 64,
    prefer: ["long", "filter", "loop", "bass"],
    avoid: ["cut"],
    keyWeight: 0.5,
    vocalWeight: 1,
    songMode: false,
  },
  trance: {
    family: "trance",
    label: "Trance / melodic",
    blendBars: 16,
    longBars: 32,
    prefer: ["breakswap", "bass", "long"],
    avoid: ["cut"],
    keyWeight: 1.6,
    vocalWeight: 1.3,
    songMode: false,
  },
  dnb: {
    family: "dnb",
    label: "Drum & bass",
    blendBars: 16,
    longBars: null,
    prefer: ["bass", "dropswap", "echo", "cut"],
    avoid: ["long", "reverb"],
    keyWeight: 0.8,
    vocalWeight: 1.2,
    songMode: false,
  },
  bass: {
    family: "bass",
    label: "Dubstep / bass",
    blendBars: 8,
    longBars: null,
    prefer: ["dropswap", "cut", "echo"],
    avoid: ["long", "blend"],
    keyWeight: 0.8,
    vocalWeight: 1.2,
    songMode: false,
  },
  edm: {
    family: "edm",
    label: "EDM / big room",
    blendBars: 16,
    longBars: null,
    prefer: ["dropswap", "echo", "filter"],
    avoid: ["long"],
    keyWeight: 1.3,
    vocalWeight: 1.4,
    songMode: false,
  },
  hiphop: {
    family: "hiphop",
    label: "Hip-hop / pop",
    blendBars: 8,
    longBars: null,
    prefer: ["cut", "echo", "dropswap"],
    avoid: ["long", "loop", "filter"],
    keyWeight: 0.6,
    vocalWeight: 1.6,
    songMode: true,
  },
  afro: {
    family: "afro",
    label: "Afro / amapiano",
    blendBars: 16,
    longBars: 32,
    prefer: ["echo", "bass", "blend"],
    avoid: ["cut"],
    keyWeight: 1,
    vocalWeight: 1,
    songMode: false,
  },
  other: {
    family: "other",
    label: "Mixed",
    blendBars: 16,
    longBars: 32,
    prefer: [],
    avoid: [],
    keyWeight: 1,
    vocalWeight: 1,
    songMode: false,
  },
}

// Most specific first: "afro house" is afro, "melodic techno" is melodic,
// "electro house" is EDM, "tech house" is still house.
const tagRules: [RegExp, GenreFamily][] = [
  [/drum ?(&|and|n) ?bass|\bdnb\b|\bd&b\b|jungle|liquid|neurofunk/, "dnb"],
  [/afro|amapiano|gqom/, "afro"],
  [/dubstep|riddim|\btrap\b|grime|bass music|halftime/, "bass"],
  [/trance|\bpsy|melodic|progressive/, "trance"],
  [
    /electro house|big ?room|future (bass|house)|\bedm\b|festival|bass house|\belectro\b/,
    "edm",
  ],
  [/techno|minimal|industrial/, "techno"],
  [/house|garage|disco|\bukg\b/, "house"],
  [
    /hip.?hop|\brap\b|r&b|\brnb\b|\bpop\b|reggaeton|latin|dancehall|afrobeats/,
    "hiphop",
  ],
]

/** Family from the genre tag, or null when the tag says nothing useful. */
export function familyFromTag(genre: string | null | undefined) {
  const tag = (genre ?? "").toLowerCase()
  for (const [rule, family] of tagRules) if (rule.test(tag)) return family
  return null
}

/**
 * Estimate from the audio when the tag is missing or vague: tempo range plus
 * how vocal the track is. Coarse on purpose; a tag always wins.
 */
export function familyFromAnalysis(track: Track): {
  family: GenreFamily
  confidence: number
} {
  const bpm = track.bpm
  const vocals = track.analysis?.vocals
  const vocal = vocals?.length
    ? vocals.filter((v) => v >= 0.35).length / vocals.length
    : null
  if (!bpm) return { family: "other", confidence: 0 }
  if (bpm >= 160 && bpm <= 185) return { family: "dnb", confidence: 0.6 }
  if (vocal !== null && vocal > 0.35 && bpm < 118)
    return { family: "hiphop", confidence: 0.45 }
  if (bpm >= 136 && bpm <= 150) return { family: "bass", confidence: 0.3 }
  if (bpm >= 106 && bpm < 118) return { family: "afro", confidence: 0.25 }
  if (bpm >= 118 && bpm < 136)
    return vocal !== null && vocal < 0.06
      ? { family: "techno", confidence: 0.3 }
      : { family: "house", confidence: 0.35 }
  if (bpm >= 60 && bpm < 106) return { family: "hiphop", confidence: 0.3 }
  return { family: "other", confidence: 0.1 }
}

/** The track's mixing family: tag first, then the audio estimate. */
export function trackFamily(track: Track): {
  family: GenreFamily
  source: "tag" | "estimate"
} {
  const tagged = familyFromTag(track.genre)
  if (tagged) return { family: tagged, source: "tag" }
  return { family: familyFromAnalysis(track).family, source: "estimate" }
}

export type PairProfile = GenreProfile & {
  from: GenreFamily
  to: GenreFamily
  crossGenre: boolean
}

/** Techniques that bridge different styles without a long overlap. */
const jumpTechniques: TechniqueId[] = ["echo", "dropswap", "crossover", "cut"]

/**
 * How to mix out of one family into another. Same family: that style's
 * rules. Different families (a genre jump): the shorter blend wins, the
 * stricter key/vocal rules apply, and bridging techniques are preferred.
 */
export function pairProfile(out: Track, incoming: Track): PairProfile {
  const from = trackFamily(out).family,
    to = trackFamily(incoming).family
  const a = genreProfiles[from],
    b = genreProfiles[to]
  if (from === to) return { ...a, from, to, crossGenre: false }
  return {
    family: to,
    label: `${a.label} → ${b.label}`,
    blendBars: Math.min(a.blendBars, b.blendBars),
    longBars:
      a.longBars === null || b.longBars === null
        ? null
        : Math.min(a.longBars, b.longBars),
    prefer: [
      ...new Set([
        ...jumpTechniques,
        ...a.prefer.filter((t) => b.prefer.includes(t)),
      ]),
    ],
    avoid: [...new Set([...a.avoid, ...b.avoid, "long" as const])],
    keyWeight: Math.max(a.keyWeight, b.keyWeight),
    vocalWeight: Math.max(a.vocalWeight, b.vocalWeight),
    songMode: a.songMode || b.songMode,
    from,
    to,
    crossGenre: true,
  }
}

/** Score adjustment for a technique under a profile. */
export function profileBonus(profile: PairProfile, id: Transition["id"]) {
  const technique = id as TechniqueId
  return (
    (profile.prefer.includes(technique) ? 5 : 0) -
    (profile.avoid.includes(technique) ? 15 : 0) +
    (profile.crossGenre && jumpTechniques.includes(technique) ? 4 : 0)
  )
}
