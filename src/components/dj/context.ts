import { createContext, useContext } from "react"
import type { DJEngine } from "@/lib/dj/engine"
import type { LibraryDatabase } from "@/lib/dj/storage"
import type { ManualReport } from "@/lib/dj/feedback"
import type {
  DeckId,
  EnergyRating,
  MixIntent,
  MixPace,
  Track,
  Transition,
} from "@/lib/dj/types"
import type { StudioLayout, ThemeId } from "@/lib/dj/themes"
import type { MidiActivity } from "@/lib/dj/midi-activity"
import type { AutomixState } from "@/lib/dj/automix-session"

export type DJContextValue = {
  engine: DJEngine | null
  automix: AutomixState
  startAutomix: (out: DeckId) => Promise<void>
  stopAutomix: () => void
  resetAutomixHistory: () => void
  database: LibraryDatabase
  tracks: Track[]
  ready: boolean
  storageError: string | null
  message: string | null
  notify: (message: string) => void
  loadTrack: (id: DeckId, track: Track) => Promise<void>
  importFiles: (files: FileList | File[]) => Promise<void>
  importing: boolean
  folderLinkSupported: boolean
  scanningFolder: string | null
  libraryAnalysis: {
    activeId: string | null
    errors: Record<string, string>
    retry: (id?: string) => void
  }
  linkMusicFolder: () => Promise<void>
  rescanMusicFolder: (id: string) => Promise<void>
  reconnectMusicFolder: (id: string) => Promise<void>
  favorite: (id: string) => void
  setEnergyRating: (id: string, rating: EnergyRating | null) => void
  enqueue: (id: string) => void
  completeLesson: (id: string) => void
  saveSession: () => void
  libraryTab: string
  setLibraryTab: (value: string) => void
  libraryQuery: string
  setLibraryQuery: (value: string) => void
  libraryGenre: string
  setLibraryGenre: (value: string) => void
  scopeTracks: Track[]
  scopeLabel: string
  createPlaylist: (name: string, trackIds: string[]) => void
  createSmartCrate: (name: string, query: string) => void
  addToPlaylist: (playlistId: string, trackIds: string[]) => void
  midi: {
    connected: boolean
    name: string
    supported: boolean
    error: string | null
    connecting: boolean
  }
  midiActivity: MidiActivity
  connectMidi: () => Promise<void>
  disconnectMidi: () => void
  coachOpen: boolean
  setCoachOpen: (value: boolean) => void
  coachDetailsOpen: boolean
  setCoachDetailsOpen: (value: boolean) => void
  coachDetailsTab: "explore" | "why"
  setCoachDetailsTab: (value: "explore" | "why") => void
  report: ManualReport | null
  clearReport: () => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (value: boolean) => void
  selectedTrack: string | null
  direction: "ltr" | "rtl"
  setDirection: (value: "ltr" | "rtl") => void
  theme: ThemeId
  setTheme: (value: ThemeId) => void
  density: LibraryDatabase["session"]["density"]
  setDensity: (value: LibraryDatabase["session"]["density"]) => void
  waveStyle: LibraryDatabase["session"]["waveStyle"]
  setWaveStyle: (value: LibraryDatabase["session"]["waveStyle"]) => void
  layout: StudioLayout
  setLayout: (value: StudioLayout) => void
  setMixIntent: (value: MixIntent) => void
  setMixPace: (value: MixPace) => void
  setTransitionTechnique: (value: string | null) => void
  transitionPreview: boolean
  setTransitionPreview: (value: boolean) => void
  selectTransitionPair: (
    outId: DeckId,
    expectedOut: string,
    expectedIn: string,
    plan: Transition
  ) => boolean
  setTransitionCue: (
    trackId: string,
    role: "entry" | "exit",
    position: number | null
  ) => void
}
export const DJContext = createContext<DJContextValue | null>(null)
export function useDJ() {
  const context = useContext(DJContext)
  if (!context) throw new Error("DJProvider is required")
  return context
}
