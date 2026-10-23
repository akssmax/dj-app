import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { MidiInputText } from "@/components/dj/midi-activity"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useDJ, useEngine } from "@/components/dj/provider"
import { Icon } from "@/components/dj/icons"
import { techniques, genreGuide, labelDefinitions } from "@/lib/dj/lessons"
import { PracticeWorkspace } from "@/components/dj/practice"
import { demoTracks } from "@/lib/dj/tracks"
import type { Technique } from "@/lib/dj/lessons"

export const Route = createFileRoute("/learn")({
  component: Learn,
  head: () => ({ meta: [{ title: "Learn to mix — Cue" }] }),
})
const levelNames = ["Beginner", "Intermediate", "Advanced", "Performance"]

function Learn() {
  const {
      database,
      midi,
      connectMidi,
      loadTrack,
      completeLesson,
      notify,
      engine,
    } = useDJ(),
    state = useEngine(),
    navigate = useNavigate()
  const [tab, setTab] = useState("practice"),
    [selected, setSelected] = useState("phrase"),
    [filter, setFilter] = useState("beginner"),
    [search, setSearch] = useState(""),
    [genre, setGenre] = useState("all")
  const technique = techniques.find((t) => t.id === selected) ?? techniques[0]
  const completed = database.completedLessons.filter((id) =>
    techniques.some((t) => t.id === id)
  ).length
  const filtered = techniques.filter(
    (t) =>
      (filter === "all" ||
        (filter === "beginner" && t.labels.includes("MOST USED")) ||
        (filter === "common" &&
          (t.labels.includes("COMMON") || t.id === "percussion")) ||
        (filter === "advanced" && t.level === 3) ||
        (filter === "performance" && t.level === 4)) &&
      (genre === "all" ||
        t.genres.includes("All genres") ||
        t.genres.includes(genre)) &&
      `${t.name} ${t.labels.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase())
  )
  const openLesson = (id: string) => {
    setSelected(id)
    setFilter("all")
    setTab("library")
  }
  const practice = async () => {
    await Promise.all([
      loadTrack("A", demoTracks[0]),
      loadTrack("B", demoTracks[1]),
    ])
    engine?.setCrossfade(0)
    notify(
      `Practice ${technique.name}: listen, count, and try the steps. Your cue points save automatically.`
    )
    setTab("practice")
  }
  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(String(value))}
        className="learn-tabs"
      >
        <TabsList variant="line">
          <TabsTrigger value="practice">Learn & play</TabsTrigger>
          <TabsTrigger value="path">Learning path</TabsTrigger>
          <TabsTrigger value="library">
            Transition library <Badge variant="secondary">28</Badge>
          </TabsTrigger>
          <TabsTrigger value="genres">Genre guide</TabsTrigger>
          <TabsTrigger value="labels">Technique labels</TabsTrigger>
          <span className="course-progress">
            {completed} / {techniques.length} practiced
          </span>
        </TabsList>
        <TabsContent value="practice">
          <PracticeWorkspace
            technique={technique}
            onTechniqueChange={setSelected}
          />
        </TabsContent>
        <TabsContent value="path">
          <Card className="learn-hero">
            <div>
              <Badge variant="outline" className="fit-badge">
                START WITH THE MUSIC
              </Badge>
              <h2>
                Good transitions begin
                <br />
                before you touch a fader.
              </h2>
              <p>
                Listen for the beat. Find the phrase. Give every sound its
                space.
                <br />
                Build these habits first, then explore the techniques.
              </p>
              <Button onClick={() => openLesson("phrase")}>
                Start learning <Icon name="right" />
              </Button>
            </div>
            <PhraseDiagram />
          </Card>
          <div className="learning-path-grid">
            {[
              {
                id: "phrase",
                number: "01",
                title: "Hear the structure",
                text: "Count beats and bars. Learn to hear 8, 16, and 32-bar phrases.",
                icon: "music" as const,
              },
              {
                id: "fade",
                number: "02",
                title: "Blend the channels",
                text: "Align the phrases, then exchange channel levels smoothly.",
                icon: "link" as const,
              },
              {
                id: "bass",
                number: "03",
                title: "Make space with EQ",
                text: "Understand spectral roles and exchange basslines deliberately.",
                icon: "activity" as const,
              },
              {
                id: "harmonic",
                number: "04",
                title: "Mix with intention",
                text: "Choose a transition for the key, energy, genre, and arrangement.",
                icon: "sparkles" as const,
              },
            ].map((item) => (
              <Card key={item.id} className="path-card">
                <div className="path-card-top">
                  <Icon name={item.icon} size={21} />
                  <span>{item.number}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <Button variant="ghost" onClick={() => openLesson(item.id)}>
                  {database.completedLessons.includes(item.id)
                    ? "Revisit lesson"
                    : "Explore lesson"}
                  <Icon name="right" size={14} />
                </Button>
              </Card>
            ))}
          </div>
          <div className="learn-bottom-grid">
            <Card className="fundamentals-card">
              <div className="section-heading">
                <div>
                  <Icon name="headphones" />
                  <h2>Your first beatmatch</h2>
                </div>
                <Badge variant="outline">LEVEL 1</Badge>
              </div>
              <ol>
                <li>
                  Choose two steady tracks. Listen to the kick drum and find
                  beat one.
                </li>
                <li>
                  Move B’s tempo toward A’s effective BPM. Avoid chasing the
                  display alone.
                </li>
                <li>
                  Launch B on a downbeat. If B drifts ahead, slow it slightly;
                  if it drifts behind, speed it up.
                </li>
                <li>
                  Use the jog control to align the beats, then correct tempo to
                  prevent drift.
                </li>
                <li>
                  Count phrases before moving the faders. Matching beats and
                  matching phrases are separate skills.
                </li>
              </ol>
              <p className="estimate-note">
                <Icon name="info" size={14} />
                Jog nudges tempo during playback and seeks while paused. Scratch
                audio is planned. Dedicated headphone pre-listening is also
                planned.
              </p>
            </Card>
            <Card className="live-practice-card">
              <Icon name="usb" size={30} />
              <h3>Learn with your hands.</h3>
              <p>
                Connect your FLX4. Cue keeps you in control, suggests the next
                zone, and reviews your MIDI timing and control movements.
              </p>
              <Badge
                variant="outline"
                className={midi.connected ? "fit-badge" : ""}
              >
                {midi.connected ? "CONTROLLER CONNECTED" : "FLX4 MAPPING READY"}
              </Badge>
              <div className="controller-input">
                <span
                  className={`status-dot ${midi.connected ? "connected" : ""}`}
                />
                <MidiInputText />
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  midi.connected
                    ? void navigate({ to: "/app" })
                    : void connectMidi()
                }
              >
                {midi.connected
                  ? "Go to the studio"
                  : "Connect your controller"}
                <Icon name="right" />
              </Button>
            </Card>
          </div>
          <div className="inspiration-note">
            <Icon name="sparkles" size={20} />
            <div>
              <strong>Learn from a performance style.</strong>
              <p>
                Explore how a groove, percussion loop, vocal, and next track can
                become components of a live arrangement. Study the timing and
                musical choices in performances; association with a style does
                not imply invention of a technique.
              </p>
            </div>
          </div>
          <div className="style-inspiration-grid">
            <Card className="style-inspiration-card">
              <Badge variant="outline">LIVE ARRANGEMENT</Badge>
              <h3>Jeff Mills</h3>
              <p>
                His Exhibitionist 2 performances explore spontaneous mixing,
                rhythmic improvisation, and a 909 workout.
              </p>
              <div className="why-box">
                <span className="eyebrow text-lime">
                  TAKE THIS INTO YOUR PRACTICE
                </span>
                <p>
                  Think of tracks as musical components. Keep one groove steady
                  and introduce sparse percussion with a loop. Listen to what
                  each layer adds before introducing another.
                </p>
              </div>
              <Button variant="ghost" onClick={() => openLesson("percussion")}>
                Study percussion layering <Icon name="right" size={14} />
              </Button>
              <Button
                variant="link"
                nativeButton={false}
                render={
                  <a
                    href="https://www.axisrecords.com/product/exhibitionist-2/"
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                Source: Axis Records <Icon name="right" size={12} />
              </Button>
            </Card>
            <Card className="style-inspiration-card">
              <Badge variant="outline">THREE-DECK THINKING</Badge>
              <h3>Carl Cox</h3>
              <p>
                His official biography describes the three-turntable
                performances that helped establish his reputation.
              </p>
              <div className="why-box">
                <span className="eyebrow text-lime">
                  TAKE THIS INTO YOUR PRACTICE
                </span>
                <p>
                  Plan a musical role for every deck: groove, percussion, or the
                  next track. Preserve rhythmic continuity, leave space in the
                  low end, and shape energy across several transitions.
                </p>
              </div>
              <Button variant="ghost" onClick={() => openLesson("multideck")}>
                Study multi-deck roles <Icon name="right" size={14} />
              </Button>
              <Button
                variant="link"
                nativeButton={false}
                render={
                  <a
                    href="https://carlcox.com/biography/"
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                Source: Carl Cox Official <Icon name="right" size={12} />
              </Button>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="library">
          <div className="technique-filters">
            <div className="search-field">
              <Icon name="search" size={16} />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a transition…"
                aria-label="Search transition library"
              />
            </div>
            <Select
              value={genre}
              onValueChange={(value) => setGenre(value ?? "all")}
            >
              <SelectTrigger aria-label="Filter transition genre">
                <SelectValue>
                  {genre === "all" ? "All genres" : genre}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All genres</SelectItem>
                {genreGuide.map((row) => (
                  <SelectItem key={row[0]} value={row[0]}>
                    {row[0]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="popularity-filters">
              {[
                ["beginner", "Most used"],
                ["common", "Common"],
                ["advanced", "Advanced"],
                ["performance", "Performance"],
                ["all", "All techniques"],
              ].map(([id, title]) => (
                <Button
                  key={id}
                  size="sm"
                  variant={filter === id ? "secondary" : "ghost"}
                  onClick={() => setFilter(id)}
                >
                  {title}
                </Button>
              ))}
            </div>
          </div>
          <div className="technique-layout">
            <Card className="technique-browser">
              <div className="technique-browser-header">
                <span className="eyebrow">TRANSITION LIBRARY</span>
                <Badge variant="secondary">{filtered.length}</Badge>
              </div>
              <ScrollArea className="technique-scroll">
                {filtered.map((t) => (
                  <Button
                    variant="ghost"
                    className={`technique-list-item ${t.id === selected ? "technique-selected" : ""}`}
                    key={t.id}
                    onClick={() => setSelected(t.id)}
                  >
                    <span className="technique-list-level">
                      {database.completedLessons.includes(t.id) ? (
                        <Icon name="check" size={15} />
                      ) : (
                        String(t.level).padStart(2, "0")
                      )}
                    </span>
                    <div>
                      <strong>{t.name}</strong>
                      <span>
                        {levelNames[t.level - 1]} · {t.bars}
                      </span>
                    </div>
                    <Icon name="right" size={14} />
                  </Button>
                ))}
                {!filtered.length && (
                  <p className="no-techniques">
                    No matching techniques. Try another genre or filter.
                  </p>
                )}
              </ScrollArea>
            </Card>
            <Card className="lesson-detail">
              <div className="lesson-detail-heading">
                <div className="technique-tags">
                  {technique.labels.map((label) => (
                    <Badge
                      variant="outline"
                      key={label}
                      className={label === "CORE" ? "fit-badge" : ""}
                    >
                      {label}
                    </Badge>
                  ))}
                </div>
                <Badge variant="secondary">
                  LEVEL {technique.level} · {levelNames[technique.level - 1]}
                </Badge>
              </div>
              <h2>{technique.name}</h2>
              <div className="lesson-meta">
                <span>
                  <Icon name="loop" size={14} />
                  {technique.bars}
                </span>
                <span>
                  <Icon
                    name={technique.practice ? "check" : "book"}
                    size={14}
                  />
                  {technique.practice
                    ? "Practice on two decks"
                    : "Study now · extended engine planned"}
                </span>
              </div>
              <div className="why-box">
                <span className="eyebrow text-lime">
                  WHY IT WORKS MUSICALLY
                </span>
                <p>{technique.why}</p>
              </div>
              <PhraseDiagram small technique={technique} />
              <div className="lesson-steps">
                <h3>Make the transition</h3>
                {technique.steps.map((step, i) => (
                  <div key={step}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <p>{step}</p>
                  </div>
                ))}
              </div>
              <div className="do-dont-grid">
                <div>
                  <Icon name="check" size={16} />
                  <strong>Build the habit</strong>
                  <p>{technique.do}</p>
                </div>
                <div>
                  <Icon name="info" size={16} />
                  <strong>Listen out for</strong>
                  <p>{technique.avoid}</p>
                </div>
              </div>
              <div className="works-with">
                <span className="eyebrow">WORKS WITH</span>
                {technique.genres.map((supportedGenre) => (
                  <Badge key={supportedGenre} variant="secondary">
                    {supportedGenre}
                  </Badge>
                ))}
              </div>
              <div className="lesson-actions">
                <Button onClick={() => void practice()}>
                  {technique.practice
                    ? "Practice in the studio"
                    : "Prepare tracks in the studio"}
                  <Icon name="right" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    completeLesson(technique.id)
                    notify(
                      "Lesson completed. Your progress is saved on this device."
                    )
                  }}
                >
                  <Icon name="check" />
                  {database.completedLessons.includes(technique.id)
                    ? "Completed"
                    : "Mark as learned"}
                </Button>
              </div>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="genres">
          <Card className="genre-guide">
            <div className="section-heading">
              <div>
                <Icon name="music" />
                <h2>Choose for the music in front of you.</h2>
              </div>
            </div>
            <p>
              These are starting points, not rules. Arrangement, density,
              energy, and track knowledge determine the best transition.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GENRE</TableHead>
                  <TableHead>PRIMARY TECHNIQUES</TableHead>
                  <TableHead>SECONDARY TECHNIQUES</TableHead>
                  <TableHead>USE CAUTION WITH</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {genreGuide.map((row) => (
                  <TableRow key={row[0]}>
                    {row.map((cell, i) => (
                      <TableCell
                        key={i}
                        className={
                          i === 0
                            ? "genre-name"
                            : i === 3
                              ? "genre-caution"
                              : ""
                        }
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="labels">
          <div className="label-grid">
            {labelDefinitions.map(([label, description]) => (
              <Card key={label}>
                <Badge
                  variant="outline"
                  className={label === "CORE" ? "fit-badge" : ""}
                >
                  {label}
                </Badge>
                <p>{description}</p>
              </Card>
            ))}
          </div>
          <Card className="levels-card">
            <h2>A progression, not a race.</h2>
            <div>
              {[
                "Two decks, basic EQ and faders.",
                "Phrasing, loops, filters, and effects.",
                "Precise cues, harmonic awareness, and fast control.",
                "Multi-deck routines, tone play, and turntablism.",
              ].map((description, i) => (
                <div key={description}>
                  <strong>
                    0{i + 1} · {levelNames[i]}
                  </strong>
                  <p>{description}</p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
      {database.reports.length > 0 && (
        <Card className="recent-feedback">
          <div className="section-heading">
            <div>
              <Icon name="activity" />
              <h2>Your latest controller practice</h2>
            </div>
            <Badge variant="outline">CONTROL FEEDBACK</Badge>
          </div>
          <p>
            {database.reports[0].title}{" "}
            <strong>{database.reports[0].score}/100</strong> ·{" "}
            {database.reports[0].duration.toFixed(1)} seconds. Scores describe
            estimated timing, tempo, and control movements, not recorded sound
            quality.
          </p>
        </Card>
      )}
      <div className="learn-engine-note">
        <span className="status-dot connected" />
        {state.A.playing || state.B.playing
          ? "Your mix keeps playing while you learn."
          : "Your studio and saved cue points are ready when you return."}
      </div>
    </>
  )
}

function PhraseDiagram({
  small = false,
  technique,
}: {
  small?: boolean
  technique?: Technique
}) {
  return (
    <div
      className={`phrase-diagram ${small ? "phrase-small" : ""}`}
      aria-label="Illustrated phrase alignment example, not detected track sections"
    >
      <div className="phrase-diagram-caption">
        <Icon name="music" size={13} />
        PHRASE ALIGNMENT · ILLUSTRATED EXAMPLE<span>4 BEATS = 1 BAR</span>
      </div>
      <div className="phrase-example">
        <span className="text-lime">A</span>
        <div className="phrase-block a-groove">
          GROOVE<span>16 BARS</span>
        </div>
        <div className="phrase-block a-outro">
          {technique?.id === "drop" ? "BUILD" : "OUTRO"}
          <span>16 BARS</span>
        </div>
        <div className="phrase-block a-end">END</div>
      </div>
      <div className="phrase-example">
        <span className="text-orange">B</span>
        <div className="phrase-block b-empty">CUE & PREPARE</div>
        <div className="phrase-block b-intro">
          INTRO<span>16 BARS</span>
        </div>
        <div className="phrase-block b-drop">DROP</div>
      </div>
      <div className="phrase-diagram-note">
        <span>PREPARE</span>
        <span className="text-lime">↑ ENTER ON BEAT ONE</span>
        <span>RESOLVE</span>
      </div>
    </div>
  )
}
