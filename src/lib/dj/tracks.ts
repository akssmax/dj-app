import type { Track } from "./types"

// BPM values are published by the artist. Keys and energy are measured locally.
export const demoTracks: Track[] = [
  {
    id: "edm",
    title: "EDM Detection Mode",
    artist: "Kevin MacLeod",
    genre: "Electronic",
    url: "/audio/edm-detection-mode.mp3",
    duration: 366,
    bpm: 128,
    color: "lime",
    source: "demo",
  },
  {
    id: "lift",
    title: "The Lift",
    artist: "Kevin MacLeod",
    genre: "Progressive",
    url: "/audio/the-lift.mp3",
    duration: 467,
    bpm: 133,
    color: "orange",
    source: "demo",
  },
  {
    id: "inspired",
    title: "Inspired",
    artist: "Kevin MacLeod",
    genre: "Downtempo",
    url: "/audio/inspired.mp3",
    duration: 286,
    bpm: 120,
    color: "blue",
    source: "demo",
  },
  {
    id: "electro",
    title: "Electrodoodle",
    artist: "Kevin MacLeod",
    genre: "Electro",
    url: "/audio/electrodoodle.mp3",
    duration: 166,
    bpm: 120,
    color: "purple",
    source: "demo",
  },
  {
    id: "club",
    title: "Club Diver",
    artist: "Kevin MacLeod",
    genre: "Club",
    url: "/audio/club-diver.mp3",
    duration: 146,
    bpm: 140,
    color: "pink",
    source: "demo",
  },
].map((track) => ({
  ...track,
  key: null,
  camelot: null,
  energy: null,
})) as Track[]

export function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0))
  return `${Math.floor(safe / 60)
    .toString()
    .padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`
}
