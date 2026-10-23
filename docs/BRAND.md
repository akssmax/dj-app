# Cue brand

**Cue: Two decks. One mix.**

Current release: **v1 Beta** (`1.0.0-beta.1`, set in `src/lib/version.ts`).

## Idea

Cue is the DJ studio that teaches you while you play. The brand is built on the core move of DJing: two tracks running at once, blending into one.

## Mark

Two rings overlap. Deck A is cyan and Deck B is yellow, and the white lens where they cross is the mix.

| File | Use |
| --- | --- |
| `public/brand/cue-mark.svg` | Mark on dark backgrounds |
| `public/brand/cue-lockup.svg` | Mark and wordmark |
| `public/favicon.svg` | App icon on an ink tile |
| `src/components/brand/mark.tsx` | `CueMark` / `CueWordmark` React components that follow the active studio theme |

Rules:
- Use the wordmark in lowercase (`cue`), set in Geist Mono Bold with tight tracking. In body copy, write the name as "Cue".
- Leave at least half the mark's width as clear space around it.
- Keep Deck A on the left in cyan and Deck B on the right in yellow. Don't swap, rotate or outline them.
- On light backgrounds, keep both ring colors and switch the overlap to ink (`#0b0b0d`).

## Color

| Token | Hex | Role |
| --- | --- | --- |
| Ink | `#0B0B0D` | Background |
| Panel | `#141417` / `#1B1B1F` | Cards, surfaces |
| Line | `#2A2A30` | Borders |
| Mix white | `#F2F2F3` | Text, mark overlap |
| Dim | `#A1A1AA` | Secondary text |
| **Deck A cyan** | `#5CC8F5` | Primary actions, Deck A |
| **Deck B yellow** | `#F4E04D` | Beta badge, Deck B, highlights |
| Cue orange | `#FF7D4A` | Cue points, warnings |
| Play green | `#3DDC84` | Live / playing / supported |

Keep the page mostly ink. Use cyan and yellow as signals, the way they work on hardware LEDs. They should never become large flat fills.

## Type

- **Bricolage Grotesque** (self-hosted in `public/fonts/bricolage/`, OFL 1.1): headlines and display text, set heavy (700–800) with tight tracking.
- **Geist** (`@fontsource-variable/geist`): paragraphs and buttons.
- **Geist Mono** (`@fontsource-variable/geist-mono`): small labels, eyebrows, chips and numbers. The studio UI keeps Geist Mono throughout.
- **Minimum size:** no text on the public pages renders below 12px (Tailwind `xs`).

## Color in use on the public pages

The public pages take their accents from the studio themes: each theme's two deck colors. The default is Midnight Violet (lavender `#B7A4FF` → pink `#FF8FC2`). Picking a theme on the landing page recolors the buttons, title gradient, logo and WebGL background.

- **Primary buttons** use a gradient between the two deck colors. Their text is ink when both colors are bright, otherwise white.
- **The WebGL backdrop** (GradientASCII from React Bits) uses a ramp of deep Deck A → Deck A → blend → Deck B, with no white, so it glows on dark pages. It runs at 30 fps, pauses off-screen, and holds still for reduced-motion users.

## Voice

Write like a patient DJ friend standing next to you at the decks.
- Be specific, e.g. "Swap the bass on bar 17" instead of "seamless transitions".
- Be honest about limits. Call estimates "estimates", and say where pro tools are ahead.
- Keep it short. Avoid hype words like "revolutionary", "AI-powered" and "next-gen".

## Release labels

- **v1 Beta**: what ships today. It is free, and features may change.
- **v1.0 Stable**: the hardening milestone (see `/roadmap`).
- To change a label, edit `src/lib/version.ts`. The studio badge, footer, landing page and roadmap all read it.

## Motion (for the upcoming video)

These rules keep a motion piece (for example one built with Remotion) consistent with the product:
- **Opening:** the two rings slide in from the left and right, overlap, and the white lens lights up on a downbeat.
- **Rhythm:** cut on the beat. At 128 BPM, one bar lasts 1.875 s, and phrases are 8 or 16 bars long.
- **Motifs:** a cyan Deck A waveform and a yellow Deck B waveform crossfade, with an animated bar countdown ("4 · 3 · 2 · 1 · mix") and a shaded entry zone like the one in the app.
- **Easing:** standard ease-out for UI, plus a short overshoot when the mark resolves.
- **End card:** the lockup, "Two decks. One mix.", and a "v1 Beta" chip.
- **Footage:** use real screen captures of the studio and Learn & Play. `public/marketing/*.jpg` works for stills.
- **Audio:** only use the bundled Pixabay tracks (see docs/AUDIO_CREDITS.md), credited, or other cleared music.
