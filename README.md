# Cue

A browser DJ studio and beginner mixing coach built with **TanStack Start**, React, and the requested shadcn preset `b44FfFtA8` (`base-maia`, Base UI, Hugeicons, Geist Mono, RTL support, pointer cursors). All interface controls use the generated shadcn components. Waveforms, phrase diagrams, meters, and decorative artwork are custom visual components.

## Run

```sh
cd "/Users/akshaysainistarbase/dj app/cue-app"
pnpm install
pnpm dev
```

Open <http://localhost:3000>. The development server is currently available at <http://127.0.0.1:3000>.

```sh
pnpm typecheck
pnpm test
pnpm build
```

## Working features

- Two audio decks: play, pause, seek, tempo, tempo/phase sync, eight hot cues, quantized cues/loops/beat jumps, and slip-mode loops/roll pads.
- Per-deck post-fader FX: beat-synchronized echo with bounded feedback, synthetic room reverb, send amount, beat divisions and one-button echo out. FX tails continue after a channel fade.
- Manual beatgrid BPM/downbeat correction and reset. Overrides guide sync, cues, loops, waveforms and transition planning and persist per track in IndexedDB. Constant-tempo grids only.
- Parallel zoomed waveforms with phrase/cue/transition markers, estimated phase/tempo gap, and 4/8/16/32-bar zoom. Mixer, Parallel and Library layouts preserve the running engine.
- Four full themes: Cue Olive, Club Graphite, Midnight Violet and Daylight. Top-nav selector and Settings → Themes; appearance, layout and quantize preferences persist in IndexedDB.
- Web Audio mixing: three-band EQ, high/low-pass filters, channel levels, master level, equal-power crossfader, output selection where supported, and a master limiter.
- Mix recording through MediaRecorder, exported using the browser's supported audio format.
- Five bundled Creative Commons tracks with in-app credits. Playback needs a user click; nothing autoplays.
- Local file picker and drag/drop import; ID3 metadata extraction; SHA-256 duplicate detection. Files up to 80 MB each. Actual codec playback depends on the browser.
- User-set energy ratings in the library: click 1–5 stars, or click the selected star again to clear. Ratings save on this device and persist across track analysis.
- Linked music folders: use **Connect folder** to select a mounted USB drive or device folder in desktop Chrome/Edge. Read-only handles and metadata save in IndexedDB; linked audio is read from the original file when loading a deck. **Rescan** refreshes added/changed/missing tracks; **Reconnect** restores access after permission changes or drive removal. Unavailable tracks remain visible and are skipped by Automix. Select the same root folder when reconnecting.
- **Import offline copy** and **Import folder copy** retain the existing import behavior: audio is copied into browser storage. Already imported tracks remain offline copies.
- **IndexedDB** stores imported audio Blobs, linked file/folder handles, metadata, analysis, waveform peaks, estimated BPM/key/energy, hot cues, grid overrides, themes/layout/quantize preferences, favorites, automix queue, session selections, lesson progress, and controller feedback. Music is not uploaded.
- Audio analysis in a worker: music-tempo beat tracking, measured peaks and energy, and a provisional FFT/chroma global key estimate. Published BPM is retained for demo tracks. New linked tracks are analyzed automatically in the background, one file at a time (up to 80 MB each). BPM, estimated key, energy, waveform peaks and analysis timestamps save in IndexedDB and are reused after reload. Folder rescanning is manual; unchanged files retain their metadata, and changed files are queued for fresh analysis. Offline copies and demo tracks are analyzed when loaded into a deck. Each deck's **Analyze / Re-analyze** button refreshes the metadata and smart-mixer recommendations during playback, without changing transport, saved cues or corrected grids. Results and their timestamp save in IndexedDB; failed analysis keeps the previous metadata and offers a retry.
- Automix: automatically ranks unplayed tracks from the current library view using the selected energy goal, routine and cues; preloads each next deck, continues through the collection and lets the final track end naturally. Played history survives pause/resume in the open studio. Clock-scheduled gain/EQ/FX and beat-phase compensation drive the transitions.
- `/learn`: 28 transition techniques, musical explanations, classifications, difficulty levels, practice steps, cautions, and an 18-genre guide.
- FLX4 detection, hot-plug handling, all eight pad modes, held Pad FX, beat sync, loop/memory controls, sampler, Beat FX, Smart CFX/Fader, master/headphone/mic knobs and LED feedback. High-resolution controls apply both MIDI bytes directly. See [current controller coverage and validation](docs/FLX4_CONTROLLER.md).
- **Any connected MIDI input locks out automix in both the UI and engine.** FLX4 input enables inline transition guidance and a saved practice report after a complete crossfader handoff with both decks playing.

## Practical limits

This is a functional first build, not a claim that its audio quality or recommendation accuracy exceeds Beatport DJ. Optional key lock preserves pitch during tempo changes, and Keyboard/Key Shift pads change pitch independently of speed through an audio worklet. Grids, phrase boundaries, global keys, and energy are estimates. The displayed waveform grid does not imply confirmed intro/drop/vocal labels. See [the implementation plan](docs/IMPLEMENTATION_PLAN.md) for the path to richer analysis and evaluation.

FLX4 controls update audio directly and publish the latest UI state once per display frame, with control animation disabled. Play/Pause recognizes presses and releases and reconnects keep one input subscription. Double-tap Load supports instant doubles; Shift+Load and collection browsing are mapped. System-default speakers remain selected; headphone playback and microphone input start off. Optional FLX4 channel routing supports master 1/2 and headphones 3/4 when the browser exposes four channels. Jog touch uses continuous scratch DSP; older browsers use short grains. Cue supplies its own FX and Smart CFX/Fader behavior. Generic MIDI learn and four-deck audio remain future work. Use Chrome or Edge on HTTPS or localhost. The [controller verification notes](docs/FLX4_CONTROLLER.md) distinguish protocol/browser checks from the remaining physical control sweep. SoundTouch package attribution is in [THIRD_PARTY.md](docs/THIRD_PARTY.md).

Controller feedback scores **control behavior**, using estimated phrase timing, effective BPM, and fader/EQ event counts. It cannot establish whether the recording sounds good, detect all clashes, or grade scratching. Echo, reverb and loop-roll lessons now have working audio controls in Learn & Play. Stems, tone play, scratching and multi-deck techniques remain study-only where their dedicated engines are planned.

Browser data can be evicted. Persistent storage can be requested in Settings; the browser decides whether to grant it. Keep originals backed up. No offline service worker is included yet.

Validation details and the FLX4 manual checklist are in [VERIFICATION.md](docs/VERIFICATION.md). Recording creates an explicit Download mix link; the embedded preview did not confirm the actual file download, so check export in Chrome or Edge. Download the recording before reloading the page.

## Project map

- `src/lib/dj/engine.ts`: audio graph, transports, loop state, recording, automix, hardware lock.
- `src/lib/dj/analysis.worker.ts`: local analysis.
- `src/lib/dj/planner.ts`: explainable transition selection.
- `src/lib/dj/storage.ts`: versioned IndexedDB snapshot.
- `src/lib/dj/midi.ts`: independently implemented FLX4 protocol decoder.
- `src/lib/dj/feedback.ts`: provisional controller-input feedback.
- `src/lib/dj/lessons.ts`: master transition curriculum and genre guide.
- `src/components/dj/provider.tsx`: library, persistence, hardware lifecycle, and coaching.
- `src/routes/index.tsx`, `src/routes/learn.tsx`: Studio and Learn.

## Music credits

“EDM Detection Mode”, “The Lift”, “Inspired”, “Electrodoodle”, and “Club Diver” by **Kevin MacLeod (incompetech.com)**.
Licensed under [Creative Commons: By Attribution 3.0](https://creativecommons.org/licenses/by/3.0/). [Artist catalog and original downloads](https://incompetech.com/music/royalty-free/). Audio is bundled unmodified; playback processing and recorded mixes may change it. Artwork is original decorative UI, not official album artwork. Full source/download records are in [AUDIO_CREDITS.md](docs/AUDIO_CREDITS.md).

## October 4 interaction update

- Session save, recording and download actions live in the top navigation; the decorative studio header is removed.
- Desktop sidebar collapses to an icon rail, with its preference in IndexedDB. Phones use an accessible shadcn navigation dialog.
- Studio text is at least Tailwind `text-xs` (12 px), and buttons, tabs, selects, sliders and the automix switch have touch-sized targets.
- `/learn` opens **Learn & play**: the same audio decks and mixer, local/demo track selection, a 32-bar waveform view, shaded incoming/outgoing transition zones, live beat/bar counting, estimated timing and EQ guidance, and musical explanations. Start guided practice approaches the transition zone; launching and mixing the incoming track remain manual.
- Each deck shows source/output levels, specific fader/filter mute warnings and a **Reset audio** recovery button. Audio settings expose both signal paths. MIDI settings retain the last 12 messages, with decoded values and raw bytes, for hardware diagnosis.
- USB port open-state changes no longer reset the mapping or reopen the coach. A real device reconnect still rebinds it.

Physical DDJ-FLX4 behavior still requires user testing. The right deck produces nonzero source/channel output in browser tests, but this does not establish the cause of the hardware silence report.

## Traktor-inspired performance update

The modular deck/mixer/FX arrangement, parallel waveforms and selectable workspace layouts take visual/workflow cues from [Native Instruments’ Traktor Pro 4 interface](https://www.native-instruments.com/products/traktor-pro). Cue uses its own Web Audio processors and UI, without vendor assets, proprietary DSP or Traktor branding.

See [TRAKTOR_FEATURES.md](docs/TRAKTOR_FEATURES.md) for what shipped, controls and the remaining feature gaps. The current verification includes 38 unit/regression tests and an actual-engine OfflineAudioContext render for right-deck dry output, echo and reverb decay. The embedded preview’s realtime audio clock stalled in this session, so offline render results do not establish live output/device routing. Continue the physical FLX4 test in a regular browser.

## Musical automix update

The transition assistant sits beside the parallel waveforms, with ranked pair-specific choices and an all-28-techniques preparation catalog. Selected zones and coaching share one plan. Automix now executes nine families (blend, bass swap, long blend, channel fade, filter, loop, echo, reverb and cut), with energy goals and recent-routine variety stored in IndexedDB. Harmonic/long choices depend on eligibility; drop/vocal/stem/multi-deck routines remain preparation items.

See [AUTOMIX_PLAN.md](docs/AUTOMIX_PLAN.md) for the shipped behavior, remaining analysis/DSP work and researched library candidates. Validation includes regression tests and actual-engine offline renders of all nine execution families. Physical controller and live device output still require manual testing.


## Channel-fader Automix

Automix centers the crossfader at **50%**, including preparation and continuous handoffs. The channel faders and EQ move with the actual scheduled audio. Channel Fade performs an equal-power volume exchange with EQ unchanged (eight bars when beatmatching fits, a short fade otherwise). Bass Swap introduces the incoming channel with LOW reduced, trades bass at a phrase/bar boundary, then closes the outgoing channel. Long Blend has its own sequence: exchange HI, then MID, then LOW before closing the outgoing fader. Suggested bass markers use the same exchange time as the audio recipe.

The loaded PCM supplies stereo RMS measurements of the selected exit/entry sections. Incoming TRIM matches the outgoing reference, with boosts limited to +6dB. Full-track sample peaks, positive EQ and the scheduled overlap supply a conservative −3dB peak budget; extreme EQ can also reduce the fader targets. Silent or short sections retain their trim instead of being boosted. This is section RMS matching, not LUFS or true-peak normalization.

At a successful handoff, the outgoing channel is closed and its temporary EQ/trim/filter/FX are reset while silent. The incoming level and matched trim remain active. Stopping a running transition holds its current fader, EQ, filter and trim values, clears future automation and restores the prior manual FX and incoming tempo. The centered channel-mixing curve stays at unity to avoid an additional 3dB attenuation or an endpoint jump; manual crossfader movement still cancels Automix and can mute either side.

`scripts/channel-mix-browser-check.html` renders generated stereo fixtures in a separate OfflineAudioContext. It checks all ten catalog routines, the nine execution families, loudness continuity, actual bass transfer and the Long Blend HI/MID/LOW order. The real-time continuous-session fixture remains in `scripts/automix-browser-check.html`.

## Cues, Sync and collection suggestions

Use **Preview transition** to inspect shaded entry/exit windows and dashed suggested cue markers. Select different entry and exit points in the assistant, then use **Mix from cues** or **Go to zone** to practice. Review a suggested marker to save its position and label into an empty hot-cue pad; IndexedDB retains them.

**Automix** and **Next track** stay inside the active folder/playlist or filtered library view, including All tracks when selected. They share the selected maintain/lift/ease energy goal, transition technique and saved entry/exit selections. Played songs are excluded; **Reset played tracks** in the coach options explicitly starts a fresh history. One-off **Mix cues/Mix now** actions only perform the loaded transition. Suggestions explain tempo, source-key compatibility, energy and unverified analysis; they do not load over a playing deck.

Press **SYNC** on the deck that should follow the other deck. It matches tempo and the four-beat bar, re-aligns a paused deck on Play, and follows later master-tempo changes. **Unlink** or manual tempo/jog/seek/grid changes return control to you. Sync is separate from automix and remains available with the FLX4.

## Compact layout, timeline zoom and transition coach

The fixed top coach shows your next action, cue timing and transition technique. It holds the **Automix** toggle, **Why & steps**, **Go to zone**, **Mix now / Mix cues**, and **Stop automix** controls. Connected MIDI replaces automation controls with Manual guidance. Cue selection and the options button open a small, scrollable, nonmodal floating view for the full technique/cue explorer and collection-scoped next-song suggestions. Opening details does not expand the coach or move the decks.

**Mixer / Parallel / Library** workspace tabs live in the top navigation alongside session actions. Switching views retains the existing audio engine and saved layout preference; the coach uses the full width above the decks.

Choose **Dense · 32px**, **Compact · 40px** or **Comfortable · 44px** in the top navigation, or Settings → Appearance on phones. Compact is the default; all three modes preserve 12px minimum text and save the preference in IndexedDB.

Pinch over either deck's timeline to zoom around the pointer. Use **+ / −**, **Fit**, the pan arrows and **Center on playhead** for touch or keyboard control. Horizontal trackpad scrolling pans a zoomed view; ordinary vertical scrolling still scrolls the page. These controls change the view without seeking or changing tempo. The Parallel layout retains its shared bar-count zoom selector.

Right-click a hot-cue pad (or choose **Edit cues**) to label or remove it. Fullscreen is available in the top navigation. See [verification notes](docs/VERIFICATION.md) for current analysis limits and browser checks.


## Folder library

The full-width library has a folder navigator with nested album/directory scopes and saved playlists. Selecting a subfolder also scopes Automix and Next Track. Compact A/B buttons live in a dedicated column; waveform previews and metadata remain in the same row. Library view includes deck playback and a crossfader, with warnings when a deck is faded out. The transition assistant beside the library is commented out; the top coach and Parallel waveform assistant remain available.

Metadata is stored in this browser's IndexedDB (`cue-library-v1`). Reloading restores saved folders and analyses, then checks file access without automatically rescanning the folder. Use Rescan to detect new, changed or removed files, or Reconnect with the original root folder to restore read permission. Connecting a different root is a separate action; it does not replace the saved folder. Audio remains on the USB drive. Analysis failure offers Retry and does not prevent trying playback.


Library performance and cache behavior:

- Track records live separately from the library/session snapshot in IndexedDB. Existing libraries migrate atomically on their next save; unchanged audio files and waveform data are not rewritten for session changes.
- Rapid changes are coalesced over 150 ms and commits are serialized. Pending saves flush when the page is hidden or closed.
- Startup checks up to four linked files at once. Deck caches and analysis jobs distinguish file versions by size and last-modified time, so rescanning a replaced USB file cannot reuse the previous file's grid or analysis.
- Track rows are memoized, and each library waveform uses one SVG path instead of 80 individual line elements.

Automix prepares exact stereo loudness totals and full-track sample peaks in bounded batches while loading each deck. Arming a transition reads cached totals plus at most two partial sample blocks per channel, avoiding another full-track scan. Replacing or disposing a deck cancels pending preparation. Cue buttons and closed settings avoid unnecessary playback/meter updates; the active library scope is reused until its inputs change.

Run the terminal-only synthetic loudness benchmark with `node scripts/performance-check.mjs`. It uses generated PCM and does not open or control a browser.
