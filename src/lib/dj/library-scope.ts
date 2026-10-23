import type { LibraryDatabase } from "./storage"
import type { Track, MixIntent, MixPace } from "./types"
import { harmonicCompatibility, planTransitions } from "./planner"
import {
  discoverTransitions,
  cuePairPlan,
  upcomingPairs,
} from "./transition-explorer"
import { formatTime } from "./tracks"
import {
  lastPlayedMap,
  matchesLibraryQuery,
  parseLibraryQuery,
} from "./library-query"

type RecommendationOptions = {
  position?: number
  recent?: string[]
  cues?: Record<string, (number | null)[]>
  labels?: Record<string, (string | null)[]>
  limit?: number
  technique?: string | null
  transitionCues?: LibraryDatabase["session"]["transitionCues"]
  played?: ReadonlySet<string>
  /** Score how well each candidate leads into the rest of the pool. */
  lookahead?: boolean
  pace?: MixPace
}

/**
 * Cheap pair fit (no transition planning) used to look one track ahead:
 * tempo within a beatmatch range, compatible keys, and energy moving the
 * way the mix intent asks.
 */
export function followFit(from: Track, to: Track, intent: MixIntent) {
  const gap = from.bpm && to.bpm ? Math.abs(to.bpm / from.bpm - 1) * 100 : 6
  const tempo = gap <= 3 ? 10 : gap <= 8 ? 10 - (gap - 3) * 1.6 : -6
  const key = (harmonicCompatibility(from.camelot, to.camelot) - 0.5) * 16
  const target = intent === "lift" ? 1 : intent === "ease" ? -1 : 0
  const energy =
    6 -
    Math.min(6, Math.abs((to.energy ?? 5) - (from.energy ?? 5) - target) * 2)
  return tempo + key + energy
}
const sameArtist = (a: Track, b: Track) =>
  a.artist === b.artist && !/^unknown/i.test(a.artist)

export function scopedTracks(
  tracks: Track[],
  database: LibraryDatabase,
  tab: string,
  query = "",
  genre = "all"
) {
  const collection = database.collections.find(
    (c) => `collection:${c.id}` === tab
  )
  const context = {
    ratings: database.energyRatings,
    lastPlayed: lastPlayedMap(database.history),
  }
  const members =
    collection && collection.kind !== "smart"
      ? new Set(collection.trackIds)
      : tab === "favorites"
        ? new Set(database.favorites)
        : tab === "queue"
          ? new Set(database.queue)
          : tab === "history"
            ? new Set(database.history.map((entry) => entry.trackId))
            : null
  // Smart crates re-evaluate their saved rule against the whole library.
  const rule =
    collection?.kind === "smart"
      ? parseLibraryQuery(collection.query ?? "")
      : null
  const search = parseLibraryQuery(query)
  return tracks.filter(
    (track) =>
      (rule
        ? matchesLibraryQuery(track, rule, context)
        : collection
          ? members!.has(track.id)
          : tab === "all" ||
            (tab === "local" && track.source === "local") ||
            (["favorites", "queue", "history"].includes(tab) &&
              members!.has(track.id))) &&
      matchesLibraryQuery(track, search, context) &&
      (genre === "all" || track.genre === genre)
  )
}
export function scopeName(database: LibraryDatabase, tab: string) {
  return (
    database.collections.find((c) => `collection:${c.id}` === tab)?.name ??
    {
      all: "All tracks",
      local: "On this device",
      favorites: "Favorites",
      history: "Recently played",
      queue: "Automix queue",
    }[tab] ??
    "Selected collection"
  )
}
export function recommendTracks(
  out: Track | null,
  pool: Track[],
  loadedId: string | undefined,
  rate: number,
  intent: MixIntent,
  options: RecommendationOptions = {}
) {
  if (!out) return []
  const position = options.position ?? 0
  return [...new Map(pool.map((track) => [track.id, track])).values()]
    .filter(
      (track) =>
        track.id !== out.id &&
        track.id !== loadedId &&
        track.available !== false &&
        !options.played?.has(track.id)
    )
    .flatMap((track) => {
      const outCue = options.transitionCues?.[out.id]?.exit ?? null,
        inCue = options.transitionCues?.[track.id]?.entry ?? null
      const alternatives = planTransitions(out, track, position, {
        outRate: rate,
        intent,
        recent: options.recent,
        outCue,
        inCue,
        pace: options.pace,
      })
      const plan = options.technique
        ? alternatives.find((candidate) => candidate.id === options.technique)
        : alternatives.at(0)
      if (!plan) return []
      const harmonic = harmonicCompatibility(out.camelot, track.camelot)
      const gap =
        out.bpm && track.bpm ? Math.abs(track.bpm - out.bpm * rate) : null
      const delta = (track.energy ?? 5) - (out.energy ?? 5)
      const relation =
        out.bpm &&
        track.bpm &&
        (Math.abs(track.bpm / (out.bpm * rate) - 2) < 0.06 ||
          Math.abs(track.bpm / (out.bpm * rate) - 0.5) < 0.03)
      const score =
        plan.score +
        (plan.beatmatch ? 12 : 0) +
        (out.camelot && track.camelot ? (harmonic - 0.5) * 12 : -3) -
        (gap === null ? 6 : Math.min(8, gap / 4)) -
        (!track.analysis ? 4 : 0) +
        (relation && !plan.beatmatch ? 3 : 0) -
        (sameArtist(out, track) ? 6 : 0)
      return [
        {
          track,
          plan,
          alternatives,
          score,
          reason: `${gap === null ? "Tempo unverified" : plan.beatmatch ? `${gap.toFixed(1)} BPM gap · beatmatch fits` : `${gap.toFixed(1)} BPM gap · ${plan.name}`}${relation ? " · half/double-time relationship (manual counting)" : ""}${out.camelot && track.camelot ? ` · ${harmonic >= 0.8 ? "compatible source keys" : "favor less melody overlap"}` : " · key unverified"} · ${delta > 1 ? "energy rises" : delta < -1 ? "energy eases" : "similar energy"}`,
        },
      ]
    })
    .sort(
      (a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title)
    )
    .map((recommendation, index, ranked) => {
      // Lookahead: among the strongest picks, prefer the one that leaves a
      // good next move instead of painting the set into a corner.
      if (!options.lookahead || index >= 6) return recommendation
      const rest = ranked
        .filter((other) => other.track.id !== recommendation.track.id)
        .map((other) => other.track)
      if (!rest.length) return recommendation
      const best = Math.max(
        ...rest.map((next) => followFit(recommendation.track, next, intent))
      )
      return {
        ...recommendation,
        score: recommendation.score + best * 0.4,
        reason: `${recommendation.reason} · ${best >= 14 ? "strong" : best >= 6 ? "workable" : "few"} follow-ups`,
      }
    })
    .sort(
      (a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title)
    )
    .slice(0, options.limit ?? 5)
    .map((recommendation) => {
      const explorerOptions = {
        outRate: rate,
        intent,
        recent: options.recent,
        outCues: options.cues?.[out.id],
        outLabels: options.labels?.[out.id],
        inCues: options.cues?.[recommendation.track.id],
        inLabels: options.labels?.[recommendation.track.id],
        outCue: options.transitionCues?.[out.id]?.exit ?? null,
        inCue: options.transitionCues?.[recommendation.track.id]?.entry ?? null,
      }
      const choices = discoverTransitions(
        out,
        recommendation.track,
        explorerOptions
      )
        .filter(
          (choice) => !options.technique || choice.plan.id === options.technique
        )
        .map((choice) => ({
          choice,
          pair: upcomingPairs(choice, position)
            .filter(
              (pair) =>
                (explorerOptions.outCue === null ||
                  pair.out.position === explorerOptions.outCue) &&
                (explorerOptions.inCue === null ||
                  pair.incoming.position === explorerOptions.inCue)
            )
            .at(0),
        }))
        .filter(
          (
            choice
          ): choice is typeof choice & {
            pair: NonNullable<typeof choice.pair>
          } => !!choice.pair
        )
        .sort((a, b) => b.pair.score - a.pair.score)
      const best = choices.at(0)
      const plan = best
        ? (cuePairPlan(out, recommendation.track, best.pair, explorerOptions) ??
          recommendation.plan)
        : recommendation.plan
      return {
        ...recommendation,
        plan,
        choices,
        pair: best?.pair,
        reason: `${recommendation.reason} · exit ${formatTime(plan.outStart)} → entry ${formatTime(plan.inStart)}`,
      }
    })
}
