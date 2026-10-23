# Landing page UX architecture (`/`)

## Audience

- **Curious beginners.** They have never touched decks. They worry it's hard, they'd need gear, or they'd look silly.
- **Party / bedroom DJs.** They want to have fun with friends tonight. They don't want a manual.
- **New FLX4 owners.** They bought a controller and want something to tell them what to do.

**Not the target:** working club DJs. They get one honest comparison section, and the copy never talks down to them.

## The single job

Take a visitor from "DJing looks hard" to "I could do that tonight" and then to clicking **Start mixing**.

## Copy voice

The page talks like a friend who DJs. It's short, playful and concrete: "Wait for the bass. Swap it. Done." It avoids jargon until the visitor sees it in action, and every technical word appears next to a picture of what it does.

## Page flow

Each section has one job:

| # | Section | Job | Content | Interaction |
|---|---|---|---|---|
| 0 | **Nav** | Orient, offer the main action | Logo, v1 Beta chip; Features · Automix · Themes · Roadmap; **Start mixing** | Sticky, blurred |
| 1 | **Hero** | Hook + proof | "Mix your first set tonight." Subhead says no gear, no install, no experience. Main button: Start mixing (free). Second button: Watch Automix work | **Real decks + mixer** (no sidebar or top bar) in the selected theme, tilted slightly, with three callouts pinned to real controls |
| 2 | **Fear-killers** | Remove objections | No gear needed · Nothing to install · Your music stays yours · Free in beta | Four short tiles |
| 3 | **Automix, explained** | The "wow" and the trust | "Hit Automix. Watch it think." It has five steps: Read the room → Pick the next track → Pick the move → Wait for the phrase → Mix and explain | **Interactive transition player**: pick Blend / Bass swap / Echo out / Filter and watch two animated waveform lanes, fader curves and EQ curves play a 16-bar transition with a bar counter. Then a real screenshot of the coach |
| 4 | **Do it yourself** | Turn watchers into players | Coach + Learn & Play: "When you're ready, take the wheel." 28 techniques from easy to show-off | Real Learn screenshot + level ladder (Starter → Comfortable → Show-off) |
| 5 | **Features bento** | Breadth, scanned in seconds | Hot cues & loops · FX (echo, reverb, filter) · Sync & key lock · Library from your USB · Record & download · FLX4 plug-and-play | Grid of mixed-size tiles |
| 6 | **Themes** | Personality, and a fun reason to try it | "Make the booth yours." 9 themes (6 dark, 3 light) | **Theme picker**: clicking a swatch swaps the real mixer screenshot *and* recolors the page accents |
| 7 | **Compare** | Answer "why not rekordbox?" | A short version of the honest table, framed as "Pick the right tool" | Table, scrolls sideways on phones |
| 8 | **Roadmap teaser** | Show momentum | v1 Beta now → v1.0 stable → stems, 4 decks, MIDI learn | Three cards → /roadmap |
| 9 | **Final call to action** | Close | "Two decks. One mix. Your move." | Start mixing / Start a lesson |

## Rules

- **One main action everywhere:** "Start mixing" opens the studio at `/app`. Second actions change by section: Watch Automix, Start a lesson, Roadmap.
- **Real UI, not mockups:** the screenshots come from the running studio (`scripts/capture-marketing.mjs`). Re-run the script when the UI changes.
- **Show before telling:** each concept appears as UI or animation before it's explained.
- **Motion:** the Automix player and the waveform hero animate. Both honor `prefers-reduced-motion`, which shows a static end state instead.
- **Phones:** at 375 px everything stacks. The mixer image scales down with small numbered pins, and the four steps are listed below it. The theme picker becomes a row of cards you can swipe, and the player's lane labels stay at full size.
- **Accessibility:** callouts are real text, the picker is a radio group, and the player has play/pause and a visible text step for each bar.
- **Performance:** the hero image loads eagerly. Theme images load only when picked. The page doesn't start the audio engine.

## Not on this page

Pricing (it's free in beta), sign-up (none exists), testimonials (we'd have to invent them), and audio autoplay.
