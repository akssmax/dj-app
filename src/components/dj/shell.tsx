import { useEffect, useLayoutEffect, useState } from "react"
import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DirectionProvider } from "@/components/ui/direction"
import { useDJ, useEngine } from "./provider"
import { TransitionCoach } from "./transitions"
import { FullscreenButton } from "./fullscreen"
import { Meter } from "./meter"
import { MidiInputText, MidiHistory } from "./midi-activity"
import { Icon } from "./icons"
import { AppearanceSettings, ThemeSelect } from "./appearance"
import type { ReactNode } from "react"
import type { StudioLayout } from "@/lib/dj/themes"
import { isLightTheme } from "@/lib/dj/themes"

function MasterMeter() {
  const value = useEngine((state) => Math.max(state.A.meter, state.B.meter))
  return <Meter value={value} horizontal />
}

export function AppShell({ children }: { children: ReactNode }) {
  const {
      midi,
      connectMidi,
      setLibraryTab,
      tracks,
      database,
      message,
      storageError,
      direction,
      engine,
      saveSession,
      sidebarCollapsed,
      setSidebarCollapsed,
      theme,
      density,
      coachOpen,
      setCoachOpen,
      layout,
      setLayout,
      ready,
    } = useDJ(),
    state = useEngine((s) => ({
      recording: s.recording,
      lastRecording: s.lastRecording,
      playing: s.A.playing || s.B.playing,
      error: s.error,
    }))
  const pathname = useLocation({ select: (location) => location.pathname }),
    navigate = useNavigate()
  const [settings, setSettings] = useState(false),
    [settingsTab, setSettingsTab] = useState("controller"),
    [credits, setCredits] = useState(false),
    [mobileNavOpen, setMobileNavOpen] = useState(false),
    [mobile, setMobile] = useState(false)
  useLayoutEffect(() => {
    document.documentElement.dir = direction
  }, [direction])
  useLayoutEffect(() => {
    document.documentElement.dataset.density = density
  }, [density])
  useEffect(() => {
    const closeNavigation = () => {
      if (document.fullscreenElement) setMobileNavOpen(false)
    }
    document.addEventListener("fullscreenchange", closeNavigation)
    return () =>
      document.removeEventListener("fullscreenchange", closeNavigation)
  }, [])
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.classList.toggle("dark", !isLightTheme(theme))
    document.documentElement.style.colorScheme = isLightTheme(theme)
      ? "light"
      : "dark"
  }, [theme])
  useEffect(() => {
    document.documentElement.dataset.controllerConnected = String(
      midi.connected
    )
    return () => {
      delete document.documentElement.dataset.controllerConnected
    }
  }, [midi.connected])
  useEffect(() => {
    const query = window.matchMedia("(max-width: 620px)")
    const changed = () => {
      setMobile(query.matches)
      if (!query.matches) setMobileNavOpen(false)
    }
    changed()
    query.addEventListener("change", changed)
    return () => query.removeEventListener("change", changed)
  }, [])
  const openSettings = (tab: string) => {
    setMobileNavOpen(false)
    setSettingsTab(tab)
    setSettings(true)
  }
  const library = (tab: string) => {
    setMobileNavOpen(false)
    setLibraryTab(tab)
    void navigate({ to: "/" })
  }
  if (!ready)
    return (
      <div className="app-loading" role="status">
        Opening your saved library…
      </div>
    )
  const sidebarContent = (
    <>
      <Link className="brand" to="/" aria-label="Cue studio">
        <span className="brand-symbol">c</span>
        <span>
          cue<span className="brand-dot">.</span>
        </span>
      </Link>
      <div className="workspace-label">
        <span className="status-dot connected" />
        YOUR WORKSPACE<span className="workspace-badge">BETA</span>
      </div>
      <nav className="main-nav">
        <Button
          variant="ghost"
          className={`nav-item ${pathname === "/" ? "nav-active" : ""}`}
          nativeButton={false}
          aria-label="DJ studio"
          title={sidebarCollapsed ? "DJ studio" : undefined}
          onClick={() => setMobileNavOpen(false)}
          render={<Link to="/" />}
        >
          <Icon name="activity" />
          <span className="nav-label">DJ studio</span>
          <span className="nav-active-dot" />
        </Button>
        <Button
          variant="ghost"
          className="nav-item"
          aria-label="Music library"
          title={sidebarCollapsed ? "Music library" : undefined}
          onClick={() => library("all")}
        >
          <Icon name="library" />
          <span className="nav-label">Music library</span>
          <span className="nav-count">{tracks.length}</span>
        </Button>
        <Button
          variant="ghost"
          className={`nav-item ${pathname === "/learn" ? "nav-active" : ""}`}
          nativeButton={false}
          aria-label="Learn to mix"
          title={sidebarCollapsed ? "Learn to mix" : undefined}
          onClick={() => setMobileNavOpen(false)}
          render={<Link to="/learn" />}
        >
          <Icon name="book" />
          <span className="nav-label">Learn to mix</span>
          <Badge className="new-badge" variant="secondary">
            NEW
          </Badge>
        </Button>
      </nav>
      <div className="sidebar-section-label">YOUR COLLECTION</div>
      <nav className="collection-nav">
        <Button
          variant="ghost"
          className="nav-item"
          aria-label="Favorites"
          title={sidebarCollapsed ? "Favorites" : undefined}
          onClick={() => library("favorites")}
        >
          <Icon name="heart" />
          <span className="nav-label">Favorites</span>
          <span className="nav-count">{database.favorites.length}</span>
        </Button>
        <Button
          variant="ghost"
          className="nav-item"
          aria-label="Automix queue"
          title={sidebarCollapsed ? "Automix queue" : undefined}
          onClick={() => library("queue")}
        >
          <Icon name="shuffle" />
          <span className="nav-label">Automix queue</span>
          <span className="nav-count">{database.queue.length}</span>
        </Button>
        <Button
          variant="ghost"
          className="nav-item"
          aria-label="On this device"
          title={sidebarCollapsed ? "On this device" : undefined}
          onClick={() => library("local")}
        >
          <Icon name="folder" />
          <span className="nav-label">On this device</span>
        </Button>
      </nav>
      <div className="sidebar-bottom">
        <div
          className={`controller-card ${midi.connected ? "controller-connected" : ""}`}
        >
          <div className="controller-top">
            <Icon name="usb" size={20} />
            <span
              className={`status-dot ${midi.connected ? "connected" : ""}`}
            />
          </div>
          <strong>
            {midi.connected ? "DDJ-FLX4 connected" : "Made for your FLX4"}
          </strong>
          <p>
            {midi.connected
              ? "Manual control. Smart guidance."
              : "Plug in. Find your flow."}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              midi.connected ? openSettings("controller") : void connectMidi()
            }
            disabled={midi.connecting}
          >
            {midi.connected
              ? "Controller settings"
              : midi.connecting
                ? "Connecting…"
                : "Connect controller"}
            <Icon name="right" size={13} />
          </Button>
        </div>
        <Button
          variant="ghost"
          className="nav-item"
          aria-label="Settings"
          title={sidebarCollapsed ? "Settings" : undefined}
          onClick={() => openSettings("audio")}
        >
          <Icon name="settings" />
          <span className="nav-label">Settings</span>
        </Button>
        <div className="sidebar-profile">
          <span className="profile-avatar">AS</span>
          <div>
            <strong>Your studio</strong>
            <span>Local workspace</span>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Open workspace settings"
            onClick={() => openSettings("storage")}
          >
            <Icon name="more" />
          </Button>
        </div>
      </div>
    </>
  )
  return (
    <DirectionProvider direction={direction}>
      <TooltipProvider delay={midi.connected ? 0 : 300}>
        <div
          className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : "sidebar-expanded"}`}
          dir={direction}
        >
          <aside className="sidebar" id="studio-sidebar">
            {sidebarContent}
          </aside>
          <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <DialogContent className="mobile-navigation">
              <DialogTitle className="sr-only">
                Workspace navigation
              </DialogTitle>
              <DialogDescription className="sr-only">
                Open the studio, library or mixing lessons.
              </DialogDescription>
              {sidebarContent}
            </DialogContent>
          </Dialog>

          <div className="workspace">
            <header className="topbar">
              <div className="topbar-leading">
                <Button
                  variant="ghost"
                  size="icon"
                  className="sidebar-toggle"
                  aria-label={
                    mobile
                      ? "Open navigation"
                      : sidebarCollapsed
                        ? "Expand sidebar"
                        : "Collapse sidebar"
                  }
                  aria-expanded={mobile ? mobileNavOpen : !sidebarCollapsed}
                  aria-controls={mobile ? undefined : "studio-sidebar"}
                  onClick={() =>
                    mobile
                      ? setMobileNavOpen(true)
                      : setSidebarCollapsed(!sidebarCollapsed)
                  }
                >
                  <Icon name="sidebar" size={20} />
                </Button>
                <strong className="route-title">
                  {pathname === "/learn" ? "Learn to mix" : "DJ studio"}
                </strong>
              </div>
              {pathname === "/" && (
                <Tabs
                  className="topbar-layout"
                  value={layout}
                  onValueChange={(value) => setLayout(value as StudioLayout)}
                >
                  <TabsList className="layout-tabs" aria-label="Studio layout">
                    <TabsTrigger value="mix">Mixer</TabsTrigger>
                    <TabsTrigger value="parallel">Parallel</TabsTrigger>
                    <TabsTrigger value="library">Library</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
              <div className="topbar-actions">
                <ThemeSelect />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="appearance-button"
                  aria-label="Theme and interface size"
                  title="Theme and interface size"
                  onClick={() => openSettings("appearance")}
                >
                  <Icon name="sparkles" size={17} />
                </Button>
                <div className="session-actions">
                  <Button
                    variant="outline"
                    onClick={saveSession}
                    disabled={!engine}
                    aria-label="Save session"
                    title="Save session"
                  >
                    <Icon name="download" size={15} />
                    <span className="btn-label">Save session</span>
                  </Button>
                  <Button
                    variant="outline"
                    className={state.recording ? "recording-button" : ""}
                    onClick={() => void engine?.toggleRecording()}
                    disabled={!engine}
                    aria-label={
                      state.recording ? "Stop recording" : "Record mix"
                    }
                    title={state.recording ? "Stop recording" : "Record mix"}
                  >
                    <span
                      className={`record-dot ${state.recording ? "recording" : ""}`}
                    />
                    <span className="btn-label">
                      {state.recording ? "Stop recording" : "Record mix"}
                    </span>
                  </Button>
                  {state.lastRecording && (
                    <Button
                      variant="outline"
                      nativeButton={false}
                      aria-label="Download mix"
                      title="Download mix"
                      render={
                        <a
                          href={state.lastRecording.url}
                          download={state.lastRecording.name}
                        />
                      }
                    >
                      <Icon name="music" size={15} />
                      <span className="btn-label">Download mix</span>
                    </Button>
                  )}
                </div>
                <Button
                  className="mobile-learn"
                  variant="ghost"
                  size="icon-sm"
                  nativeButton={false}
                  render={<Link to="/learn" />}
                  aria-label="Learn to mix"
                >
                  <Icon name="book" size={17} />
                </Button>
                <span className="local-status">
                  <span className="status-dot connected" />
                  LOCAL SESSION
                </span>
                <div className="topbar-divider" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="midi-status"
                  onClick={() => openSettings("controller")}
                >
                  <Icon name="usb" size={15} />
                  <span className="btn-label">
                    {midi.connected ? "FLX4 connected" : "MIDI ready"}
                  </span>
                  <span
                    className={`status-dot ${midi.connected ? "connected" : ""}`}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Keyboard shortcuts"
                  onClick={() => openSettings("shortcuts")}
                >
                  <Icon name="keyboard" size={17} />
                </Button>
                <FullscreenButton />
                <span className="profile-avatar top-avatar">AS</span>
              </div>
            </header>
            <main className="workspace-content">
              {state.error && (
                <div role="alert" className="audio-warning">
                  <span>{state.error}</span>
                  {state.error.startsWith("Enable audio once") && (
                    <Button
                      size="sm"
                      onClick={() => void engine?.resumeAudio()}
                    >
                      Enable audio
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => engine?.clearError()}
                  >
                    Dismiss
                  </Button>
                </div>
              )}
              {pathname !== "/" && (
                <>
                  <TransitionCoach />
                  {!coachOpen && (
                    <Button variant="ghost" onClick={() => setCoachOpen(true)}>
                      <Icon name="book" size={16} />
                      Show transition coach
                    </Button>
                  )}
                </>
              )}
              {children}
            </main>
            <footer className="studio-footer">
              <span>
                <span className="status-dot connected" />
                Audio engine{" "}
                <strong>{state.playing ? "active" : "ready"}</strong>
                <span className="footer-divider">/</span>Web Audio
              </span>
              <span className="footer-storage">
                <Icon name="folder" size={13} />
                {storageError ? "Storage unavailable" : "Saved on this device"}
              </span>
              <div className="footer-right">
                <MasterMeter />
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setCredits(true)}
                >
                  Track credits <Icon name="info" size={12} />
                </Button>
                <span>cue v0.1</span>
              </div>
            </footer>
          </div>
          {message && (
            <div role="status" className="toast">
              <Icon name="check" size={17} />
              {message}
            </div>
          )}
          {storageError && (
            <div role="alert" className="storage-error">
              {storageError}
            </div>
          )}
          <Settings
            open={settings}
            onOpenChange={setSettings}
            tab={settingsTab}
            setTab={setSettingsTab}
          />
          <Dialog open={credits} onOpenChange={setCredits}>
            <DialogContent className="credits-dialog">
              <DialogTitle>Music for your first mix.</DialogTitle>
              <DialogDescription>
                Five freely licensed tracks by Kevin MacLeod. Original artwork
                in Cue is decorative; it is not the artist’s album artwork.
              </DialogDescription>
              <div className="credits-list">
                {[
                  "EDM Detection Mode",
                  "The Lift",
                  "Inspired",
                  "Electrodoodle",
                  "Club Diver",
                ].map((title) => (
                  <div key={title}>
                    <strong>{title}</strong>
                    <span>Kevin MacLeod (incompetech.com)</span>
                  </div>
                ))}
              </div>
              <p>
                Licensed under{" "}
                <a
                  href="https://creativecommons.org/licenses/by/3.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Creative Commons: By Attribution 3.0
                </a>
                . Tracks are redistributed unmodified. Playback effects and
                recorded mixes may modify the audio.
              </p>
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a
                    href="https://incompetech.com/music/royalty-free/"
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                Visit the artist <Icon name="right" />
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </TooltipProvider>
    </DirectionProvider>
  )
}

function Settings({
  open,
  onOpenChange,
  tab,
  setTab,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: string
  setTab: (tab: string) => void
}) {
  const {
    midi,
    connectMidi,
    disconnectMidi,
    database,
    tracks,
    direction,
    setDirection,
    engine,
    notify,
  } = useDJ()
  const audioState = useEngine((state) => ({
    // A closed settings dialog has no live signal displays to refresh.
    micEnabled: open ? state.controller.micEnabled : false,
    master: open ? state.master : 0,
    aMeter: open ? state.A.meter : 0,
    aInput: open ? state.A.inputMeter : 0,
    aVolume: open ? state.A.volume : 0,
    aTrim: open ? state.A.trim : 0,
    aFilter: open ? state.A.filter : 0,
    bMeter: open ? state.B.meter : 0,
    bInput: open ? state.B.inputMeter : 0,
    bVolume: open ? state.B.volume : 0,
    bTrim: open ? state.B.trim : 0,
    bFilter: open ? state.B.filter : 0,
  }))
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]),
    [output, setOutput] = useState("default"),
    [monitorOutput, setMonitorOutput] = useState("off"),
    [usage, setUsage] = useState(""),
    [historyOpen, setHistoryOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const mediaDevices = (navigator as { mediaDevices?: MediaDevices })
      .mediaDevices
    const storage = (navigator as { storage?: StorageManager }).storage
    void mediaDevices
      ?.enumerateDevices()
      .then((devices) =>
        setOutputs(devices.filter((d) => d.kind === "audiooutput"))
      )
      .catch(() => {})
    void storage
      ?.estimate()
      .then((value) =>
        setUsage(`${((value.usage ?? 0) / 1024 / 1024).toFixed(1)} MB stored`)
      )
      .catch(() => {})
  }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog">
        <DialogTitle>Studio settings</DialogTitle>
        <DialogDescription>
          Make this workspace feel like your setup.
        </DialogDescription>
        <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
          <TabsList>
            <TabsTrigger value="controller">Controller</TabsTrigger>
            <TabsTrigger value="audio">Audio</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
            <TabsTrigger value="shortcuts">Keys</TabsTrigger>
            <TabsTrigger value="appearance">Themes</TabsTrigger>
          </TabsList>
          <TabsContent value="appearance">
            <AppearanceSettings />
          </TabsContent>
          <TabsContent value="controller">
            <div className="settings-content">
              <div className="settings-device">
                <Icon name="usb" size={28} />
                <div>
                  <strong>Pioneer DDJ-FLX4</strong>
                  <span>
                    {midi.connected
                      ? midi.name
                      : "Automatic mapping · USB MIDI"}
                  </span>
                </div>
                <Badge variant="outline">
                  {midi.connected ? "CONNECTED" : "READY"}
                </Badge>
              </div>
              <p>
                All eight pad modes, sync, loop and memory cue controls, jog
                wheels, tempo, EQ, trim, faders, browse/load, Beat FX, master,
                headphone and microphone knobs are mapped. Hardware input
                updates directly.
              </p>
              <p className="muted">
                Move each knob or fader once to align its physical position with
                Cue. Pad FX uses Cue's echo, room reverb, filter and slip-roll
                presets. Smart CFX combines filter and FX; Smart Fader matches
                tempo and reduces outgoing bass as you move the fader.
              </p>
              <div className="controller-input">
                <span
                  className={`status-dot ${midi.connected ? "connected" : ""}`}
                />
                <MidiInputText />
              </div>
              <div className="midi-history">
                <Button
                  variant="outline"
                  aria-expanded={historyOpen}
                  onClick={() => setHistoryOpen(!historyOpen)}
                >
                  Recent controller messages
                </Button>
                {historyOpen && <MidiHistory />}
              </div>
              {midi.error && (
                <p role="alert" className="text-orange">
                  {midi.error}
                </p>
              )}
              <Button
                onClick={() =>
                  midi.connected ? disconnectMidi() : void connectMidi()
                }
                disabled={midi.connecting}
              >
                {midi.connected
                  ? "Disconnect MIDI"
                  : midi.connecting
                    ? "Connecting…"
                    : "Enable MIDI & detect controller"}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="audio">
            <div className="settings-content">
              <label>Master output</label>
              <p className="audio-clock">
                Audio engine: {engine?.audioDiagnostics().status ?? "idle"} ·
                Clock {engine?.audioDiagnostics().clock.toFixed(2) ?? "0.00"} s
                · {engine?.audioDiagnostics().sampleRate ?? 0} Hz
              </p>
              <Select
                value={output}
                onValueChange={(value) => {
                  if (!value) return
                  setOutput(value)
                  void engine
                    ?.setOutput(value)
                    .then(() => {
                      if (monitorOutput === "flx4-pairs")
                        setMonitorOutput("off")
                    })
                    .catch((error) => notify(error.message))
                }}
              >
                <SelectTrigger className="w-full" aria-label="Audio output">
                  <SelectValue>
                    {outputs.find((d) => d.deviceId === output)?.label ||
                      "System default"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">System default</SelectItem>
                  {outputs
                    .filter((d) => d.deviceId !== "default")
                    .map((device, i) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || `Output ${i + 1}`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p>
                Interactive Web Audio engine with three-band EQ, low / high-pass
                filters, an equal-power crossfader, and a master limiter.
              </p>
              <label>Headphone output</label>
              <Select
                value={monitorOutput}
                onValueChange={(value) => {
                  if (!value) return
                  if (value === "flx4-pairs") {
                    try {
                      engine?.setOutputPairs(true)
                      setMonitorOutput(value)
                    } catch (error) {
                      notify(String(error))
                    }
                    return
                  }
                  void engine
                    ?.setMonitorOutput(value === "off" ? null : value)
                    .then(() => setMonitorOutput(value))
                    .catch((error) => notify(error.message))
                }}
              >
                <SelectTrigger className="w-full" aria-label="Headphone output">
                  <SelectValue>
                    {monitorOutput === "off"
                      ? "Off · no headphones"
                      : monitorOutput === "flx4-pairs"
                        ? "FLX4 headphone jack"
                        : outputs.find(
                            (device) => device.deviceId === monitorOutput
                          )?.label || "Separate output"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off · no headphones</SelectItem>
                  <SelectItem
                    value="flx4-pairs"
                    disabled={output === "default"}
                  >
                    FLX4 headphone jack
                  </SelectItem>
                  {outputs
                    .filter(
                      (device) =>
                        device.deviceId !== "default" &&
                        device.deviceId !== output
                    )
                    .map((device, index) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || `Output ${index + 1}`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="muted">
                Leave headphones off for Mac speaker playback. Preview needs a
                separate output exposed by the browser. To use the FLX4
                headphone jack, select the FLX4 master output first; the browser
                must expose all four channels. Master uses channels 1/2 and cue
                uses 3/4. Key Shift and Keyboard change pitch independently of
                tempo. Enable each deck's key lock to preserve pitch with the
                tempo fader.
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  void engine
                    ?.enableMic(!audioState.micEnabled)
                    .catch((error) => notify(error.message))
                }
              >
                {audioState.micEnabled
                  ? "Disable microphone"
                  : "Enable microphone input"}
              </Button>
              <div className="audio-diagnostics">
                {(["A", "B"] as const).map((id) => {
                  const meter =
                    id === "A" ? audioState.aMeter : audioState.bMeter
                  const input =
                    id === "A" ? audioState.aInput : audioState.bInput
                  const volume =
                    id === "A" ? audioState.aVolume : audioState.bVolume
                  const trim = id === "A" ? audioState.aTrim : audioState.bTrim
                  const filter =
                    id === "A" ? audioState.aFilter : audioState.bFilter
                  return (
                    <div key={id}>
                      <strong>Deck {id} signal path</strong>
                      <span>
                        Source {Math.round(input * 100)}% → channel{" "}
                        {Math.round(meter * 100)}% → master{" "}
                        {Math.round(meter * audioState.master * 100)}%
                      </span>
                      <span>
                        Fader {Math.round(volume * 100)}% · trim{" "}
                        {trim.toFixed(1)} dB · filter {filter.toFixed(2)}
                      </span>
                      <Button
                        variant="outline"
                        onClick={() => engine?.resetChannel(id)}
                      >
                        Reset deck {id} audio
                      </Button>
                    </div>
                  )
                })}
              </div>
              <p className="muted">
                If channel and master levels move but speakers are silent, check
                the selected output device. Reset opens this deck’s fader,
                clears EQ/filter/trim, raises master and routes the crossfader
                to it.
              </p>
              <label>Interface direction</label>
              <Select
                value={direction}
                onValueChange={(value) => value && setDirection(value)}
              >
                <SelectTrigger aria-label="Interface direction">
                  <SelectValue>
                    {direction === "ltr" ? "Left to right" : "Right to left"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ltr">Left to right</SelectItem>
                  <SelectItem value="rtl">Right to left</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
          <TabsContent value="storage">
            <div className="settings-content">
              <div className="storage-summary">
                <Icon name="folder" size={28} />
                <strong>
                  {tracks.filter((t) => t.source === "local").length} local
                  tracks
                </strong>
                <span>{usage || "IndexedDB storage"}</span>
              </div>
              <p>
                Your audio files, BPM and key estimates, waveform peaks, hot
                cues, favorites, queue, session selections,{" "}
                {database.completedLessons.length} completed lessons, and
                controller feedback are stored in IndexedDB.
              </p>
              <p className="muted">
                Music is not uploaded. Clearing this site’s browser data removes
                saved files and analysis. Keep original files backed up. This
                build accepts audio files up to 80 MB each.
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  void (navigator as { storage?: StorageManager }).storage
                    ?.persist()
                    .then((persisted) =>
                      notify(
                        persisted
                          ? "Persistent storage granted for Cue."
                          : "Browser storage remains managed automatically."
                      )
                    )
                }
              >
                Request persistent storage
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="shortcuts">
            <div className="settings-content shortcut-list">
              {[
                ["A", "Play / pause deck A"],
                ["B", "Play / pause deck B"],
                ["Q", "Return deck A to cue"],
                ["W", "Return deck B to cue"],
                ["Shift + pad", "Clear a hot cue"],
                ["Arrow keys", "Adjust focused mixer sliders"],
              ].map(([key, label]) => (
                <div key={key}>
                  <span>{label}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
