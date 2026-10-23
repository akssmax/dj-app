import type { Track } from "./types"

const pixabay = (slug: string, user: string) => ({
  url: `https://pixabay.com/music/${slug}/`,
  artistUrl: `https://pixabay.com/users/${user}/`,
  license: "Pixabay Content License",
  licenseUrl: "https://pixabay.com/service/license-summary/",
})

// Free under the Pixabay Content License, none registered with Content ID.
// BPM values come from public/analysis/demo.json (`pnpm analyze:demo`).
export const demoTracks: Track[] = [
  {
    id: "club",
    title: "Club No Copyright",
    artist: "MiroMaxMusic",
    genre: "Dance",
    url: "/audio/club-no-copyright.mp3",
    credit: pixabay("dance-club-no-copyright-618622", "miromaxmusic-51705244"),
    duration: 157,
    bpm: 128,
    color: "lime",
    source: "demo",
  },
  {
    id: "july",
    title: "House - July",
    artist: "Easy_Eva",
    genre: "House",
    url: "/audio/house-july.mp3",
    credit: pixabay("electronic-house-july-605765", "easy_eva-56538901"),
    duration: 155,
    bpm: 127,
    color: "orange",
    source: "demo",
  },
  {
    id: "bouquet",
    title: "The Blackest Bouquet",
    artist: "Leonell Cassio",
    genre: "Future Bass",
    url: "/audio/blackest-bouquet.mp3",
    credit: pixabay(
      "future-bass-leonell-cassio-the-blackest-bouquet-118766",
      "leonellcassio-2264996"
    ),
    duration: 221,
    bpm: 127,
    color: "purple",
    source: "demo",
  },
  {
    id: "nightclub",
    title: "Night Club",
    artist: "AtlasAudio",
    genre: "Dance",
    url: "/audio/night-club.mp3",
    credit: pixabay("dance-night-club-617593", "atlasaudio-54514918"),
    duration: 237,
    bpm: 122,
    color: "blue",
    source: "demo",
  },
  {
    id: "summer",
    title: "Summer Party",
    artist: "Kulakovka",
    genre: "House",
    url: "/audio/summer-party.mp3",
    credit: pixabay("dance-summer-party-620566", "kulakovka-47183261"),
    duration: 164,
    bpm: 122,
    color: "pink",
    source: "demo",
  },
  {
    id: "luxury",
    title: "Luxury Life",
    artist: "Kulakovka",
    genre: "House",
    url: "/audio/luxury-life.mp3",
    credit: pixabay("house-luxury-life-620531", "kulakovka-47183261"),
    duration: 164,
    bpm: 120,
    color: "lime",
    source: "demo",
  },
  {
    id: "chapter",
    title: "Chapter Two (ft. Carrie)",
    artist: "Leonell Cassio",
    genre: "Future Bass",
    url: "/audio/chapter-two.mp3",
    credit: pixabay(
      "future-bass-leonell-cassio-chapter-two-ft-carrie-114909",
      "leonellcassio-2264996"
    ),
    duration: 240,
    bpm: 111,
    color: "orange",
    source: "demo",
  },
  {
    id: "amalgam",
    title: "AMALGAM",
    artist: "Rockot",
    genre: "Future Bass",
    url: "/audio/amalgam.mp3",
    credit: pixabay("future-bass-amalgam-217007", "rockot-1947599"),
    duration: 254,
    bpm: 109.37,
    color: "blue",
    source: "demo",
  },
  {
    id: "town",
    title: "Town",
    artist: "BeCorbal",
    genre: "Electronic",
    url: "/audio/town.mp3",
    credit: pixabay("electronic-town-10169", "becorbal-12069858"),
    duration: 183,
    bpm: 98.35,
    color: "purple",
    source: "demo",
  },
  {
    id: "paranormal",
    title: "The Paranormal Is Real (ft. Carrie)",
    artist: "Leonell Cassio",
    genre: "Future Bass",
    url: "/audio/paranormal-is-real.mp3",
    credit: pixabay(
      "future-bass-leonell-cassio-the-paranormal-is-real-ft-carrie-163742",
      "leonellcassio-2264996"
    ),
    duration: 168,
    bpm: 140.86,
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
