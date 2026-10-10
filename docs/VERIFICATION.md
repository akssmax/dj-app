# First-build verification

## Passed

- TypeScript type checking, ESLint, formatting check, and client/server production build.
- 26 regression tests: Camelot wrap/relative keys, bounded 16-bar planning, unsuitable tempo gaps, missing analysis, FLX4 byte decoding, provisional feedback, the 28-lesson/18-genre catalog, resumed playback, cancellation while resuming, cue snapshots, loop state, hardware automix lock, timed handoff, and bass ownership/restoration.
- Browser: both deck playback states and advancing positions; channel level meters; full short automix handoff (outgoing deck stops, crossfader reaches incoming deck, incoming deck continues).
- Browser: MP3 local import reads title/artist/BPM/duration, plays from the local Blob, computes waveform/key/energy, and survives reload with cached analysis and deck selection.
- Browser: hot cue and favorite persistence after reload; studio/learn navigation while the audio engine persists; lesson catalog and musical explanations render.
- Responsive layout checks at desktop and phone sizes. The library table scrolls horizontally on narrow screens.
- Recording starts/stops and presents a generated WebM download link. Actual export completion remains unverified: the embedded preview did not report a file download.

The production build warns about a roughly 678 kB main client chunk. Dynamic music-metadata parsers and the Learn route are split already; further bundle reduction remains useful before production deployment.

## FLX4 check for the user

1. Open `http://localhost:3000` in Chrome or Edge. Connect the FLX4 using a USB data cable. Click **Connect controller** and allow MIDI access.
2. Confirm the DDJ-FLX4 name appears, the mapping loads, and the automix switch becomes disabled. Connect during an active automix too: automation should stop immediately.
3. Test both decks: play/pause, cue, sync, hot cue pads, loop, tempo, channel volume, high/mid/low EQ, filters, crossfader, browse encoder, and load buttons. Jog wheels nudge during playback and seek while paused; scratch audio is planned.
4. Play both decks and move the physical crossfader fully from A to B, then try B to A. Each complete handoff should generate a control-feedback report. Note that scores describe estimated timing and control behavior, rather than the recorded sound.
5. Disconnect/reconnect USB and reload after MIDI permission has been granted. Saved cues should remain and the hardware lock should reflect the connection.
6. Test system audio output through the FLX4. Independent headphone cue routing is planned. Check mix recording and the Download mix link in the regular browser.

Report controller name/browser version, which control failed, expected vs. observed behavior, and the **last input** shown in Settings. Useful observations include jog direction, pad numbering, fader endpoints, low-EQ direction, fine tempo resolution, latency, and USB reconnect behavior.

## Musical limitations to evaluate next

Beat grids and keys are provisional. Track sections, vocals, bass dominance, and drops are not robustly detected. Tempo changes pitch. A CC-BY demo is not a representative evaluation corpus. Benchmark transition quality with phrase-correct references, varied genres, and listener assessment before making a comparison claim against another DJ product.

## Interaction and MIDI regression pass — October 4

- 26 automated tests cover the original behavior plus 14-bit MIDI byte ordering/isolation, filter/EQ centers, tempo direction, trim, cue release, shifted pad deletion, loop in/out, repeated jog nudges without source restart, rapid play cancellation, right-deck MIDI-to-master gain routing, retained hardware values across track loads, audio reset and active-automix cancellation on connection.
- Browser Deck B playback produced measured nonzero source and channel/output levels with the crossfader centered and fully right. Physical FLX4 output remains unverified.
- Browser **Learn & play** starts the outgoing deck four bars before an estimated exit, launches the incoming deck manually, shows both waveform zones, and updates coaching when both decks play.
- UI sizing is checked using rendered text/control bounds, not screenshots alone. All visible app text must be >= 12 px. Buttons, tabs and selects must be >= 44 px; sliders have a 44 px hit area and the automix switch is 44 px tall.
- Sidebar collapse and phone navigation use shadcn buttons/dialog; sidebar preference persists in IndexedDB. Desktop, tablet and phone layouts are checked for page overflow.

For another silent-deck report, compare its **SOURCE** and **OUTPUT** indicators. Source activity with no channel output points to a channel control; activity at both with silent speakers points to output-device routing. Use **Reset audio** to clear channel controls and route that deck to master. In MIDI settings, record the raw message shown for a failing physical control.

The MIDI byte addresses and centered jog/14-bit conventions were cross-checked against the [published Mixxx FLX4 mapping](https://github.com/mixxxdj/mixxx/blob/main/res/controllers/Pioneer-DDJ-FLX4.midi.xml) and [controller reference script](https://github.com/mixxxdj/mixxx/blob/main/res/controllers/Pioneer-DDJ-FLX4-script.js). Cue uses its own decoder and audio behavior; it does not execute those scripts.

## Traktor-inspired performance update — October 4

- 38 current unit/regression tests cover previous behavior plus manual grid propagation/restoration, stale-library reloads, quantized cues/loops/jumps, normal vs. slip loops, hidden timeline tempo changes, FLX4-style loop in/out with slip, per-deck synchronized delay, bounded feedback, echo-out completion/cancellation, and bounded detailed waveform drawing.
- Actual engine DSP was rendered in the embedded browser using OfflineAudioContext. A generated right-deck tone produced dry RMS 0.06254. Its echo tail RMS was 0.04381 and decayed to 0.0000041; reverb tail RMS was 0.00674 and returned to zero. All samples were finite. Results: [audio-render-results.txt](audio-render-results.txt).
- The reproducible developer harness is [audio-render-check.html](audio-render-check.html). Copy it to `public/__cue-audio-check.html` while the Vite dev server runs, visit that path and click Render actual engine. Remove the temporary public copy afterward. The offline context substitutes a disconnected gain node for the unsupported recording destination, so this test validates the playback/FX/master graph and does not verify recording export or an actual audio device.
- The embedded preview’s realtime AudioContext reported running while its clock remained near 0.01 seconds and meters stayed at zero. Its cause was not established. Realtime audio/device routing therefore remains unverified in this session despite successful offline DSP; the physical FLX4/browser test is still required. Settings → Audio now shows engine status and clock alongside signal levels.
- Browser theme tests verified distinct full surface/text/deck palettes for Olive, Graphite, Violet and Daylight. Theme, layout, quantize and a corrected 128 BPM / 0.125-second grid survived reload. The test grid was then restored to its original value.
- Browser checks exercised the grid editor, effect selection/on-off, echo-out state completion, roll keyboard press/release, library view switching/Stop both, and executable echo coaching in Learn & Play.
- Responsive checks at 1440, 1280, 768 and 390 px showed no page overflow. Visible text remained >=12 px and buttons/tabs/selects >=44 px, including composed tooltip triggers. The mobile top navigation retains theme/session/recording actions in two compact rows. The library has its own horizontal scroll area.

Extend the physical checklist with manual FX: choose a clean hit, press Echo out, and verify that only the fading tail remains. Test reverb on a sparse chord, with the channel faded down. In Loops, hold/release a roll and confirm that the track returns to its original timeline. Check grid/quantize accuracy by ear; these constant-tempo grids do not follow live tempo changes. Hardware FX/pad modes are not newly mapped in this update.

## Musical automix verification — October 4

52 unit/regression tests pass. New cases cover the full technique catalog and preparation requirements, effective-tempo eligibility, native-tempo FX/cuts, genre/energy/repetition ranking, quieter early entry candidates, finite late-track bounds, scheduled audio curves, bass ownership, filter/FX restoration, delayed echo launches, real loop bounds, cancellation by manual EQ and stale-plan rejection.

The actual engine’s OfflineAudioContext checks pass for eight execution families: phrase blend, bass exchange, filter, loop, echo, reverb, channel fade and hard cut. A uses the generated tone’s left channel and B the right, so early/late dominance is measurable. The extra MIDI takeover render confirms a scheduled incoming source and FX are cancelled and A remains audible. Raw numbers are in automix-render-results.txt. The dry B, echo tail, reverb tail and bounded-decay checks also pass again (audio-render-results.txt). The temporary public harness is removed; its developer source stays in docs/audio-render-check.html.

The live-output and physical DDJ-FLX4 checks remain manual. Offline rendering does not establish USB/controller/audio-device routing or the musical quality of real song transitions.

Desktop interaction checks confirm that choosing Filter updates the shared recipe and coach, the 28-technique catalog explains drop preparation, Ease ranks long blends higher, and Auto pick restores the top recommendation. The assistant contains zero waveform elements. At the 1280px viewport, visible text is at least 12px and assistant buttons are at least 44px high. The current browser viewport override targeted an inactive error tab, so this update’s phone rendering check could not be completed; responsive stacking and touch styles are implemented. Earlier mobile checks are historical, not proof of this new panel.

The latest suite has 52 tests, including scheduling lead-time compensation for audible beat phase and preparation/restoration of closed channel faders. TypeScript, lint, formatting and the production build pass. The build still reports a large main JavaScript chunk; splitting performance/DSP/catalog loading remains an optimization item.


## Cue-based mixing, scoped suggestions and Sync — October 4

- 62 tests pass. New regressions cover both Sync directions, effective master tempo, four-beat bar alignment with grid offsets, delayed context resume, paused-deck launch, linked tempo propagation, explicit unlink through manual tempo changes, unknown tempo/pitch bounds/short loops, selected cue bounds and execution, cue labels and occupied pads, and collection/filter isolation with no fallback.
- Browser: A and B show 128 BPM and 0.00 beat offset after Sync, with B visibly linked to A. Source start times/positions are separately verified by regression tests. Physical FLX4 Sync and live audio-device routing still need the user’s hardware test.
- Browser: selecting A’s estimated 02:00 exit and B’s 01:55 entry updates both waveform windows and **Mix from cues**. Saving the suggested B entry fills pad 2 without moving playback. Its label, time, both selected anchors and the selected playlist survive reload from IndexedDB.
- Browser: a one-track **Practice crate** playlist contains only Inspired; Next track recommends Inspired and shows its tempo/key/energy reasoning. The selected view and recommendations share the same collection and filters. Unfiltered All tracks offers no whole-library recommendations.
- At a 390×844 viewport, the page scroll width equals 390, visible text is at least 12px, and visible buttons/selects are at least 44px high. Timelines and the assistant stack; suggested-cue controls wrap. Desktop preview and mobile screenshots are retained in this directory.
- TypeScript, lint, formatting and the production client/server build pass. The main client chunk remains over the 500kB build-warning threshold.
- Phrase candidates and shaded areas remain grid/loudness estimates. They do not detect vocal, build or drop sections. Exact user-selected cues remain exact, so off-phase cues produce a warning rather than silently shifting the saved cue.

## Compact layout and nonmodal coaching — October 4

- Compact defaults to 40px controls; Comfortable uses 44px. Both modes were measured in the browser and the preference survives a fresh reload. At 390×844 in Compact, the page scroll width equals 390, visible text is at least 12px, and visible shadcn buttons/selects/tabs are at least 40px high.
- The coach is beside the layout tabs above the decks. Details expand inline with a bounded scroll area. Browser checks found zero dialog overlays while details were open, and both decks could be played and paused. At 1440×900, both Play controls stay in view with details expanded.
- Closely spaced suggested waveform cue labels use separate vertical lanes. Suggested cues remain dashed, saved hot cues remain numbered, and shaded windows match the chosen plan.
- A fresh load restored the chosen 02:00 exit, 01:55 entry, saved B hot cue, Practice crate playlist and compact size. Both playing decks showed nonzero meter signals and 128 BPM after Sync. This checks the browser graph/state; it does not verify physical audio-device routing or the FLX4.
- Proof screenshots: [compact desktop](compact-coach-preview.jpg), [expanded details](inline-coach-details.jpg), and [compact phone](compact-coach-mobile.jpg).
- The combined suite passes 68 tests; TypeScript, lint, formatting and the production build pass. The main client chunk still triggers the existing 500kB size warning. Live controller work is being developed in another chat in the same checkout, so hardware-specific validation belongs to that work and the user's physical test.


## October 4, 2026 — connected FLX4 and direct control updates

See [FLX4_CONTROLLER.md](FLX4_CONTROLLER.md) for the current mapping, audio limitations and reproducible browser check. It supersedes earlier hardware FX/pad/LED/headphone-bus gap statements below. Current checks: 83 tests, typecheck, lint and build pass. Chrome detected the connected DDJ-FLX4 port; a 5,000-message synthetic burst took 6.2 ms with one display-frame notification. Real Web Audio EQ, Pad FX press/release, beat jump/sync and sampler start/stop checks passed in a silent test graph. A physical control sweep and listening/LED-persistence checks remain manual.

## October 4, 2026 — cue exploration, compact coach and scratch motion

The inline coach now compares multiple entry/exit combinations for each executable routine. It includes saved hot cues, their labels, memory cues, corrected/estimated 16-bar anchors and an estimated final downbeat. Ordinary tracks expose all generated phrase anchors; exceptionally long recordings use up to approximately 100 representative grid anchors across the recording, while retaining saved cues. Valid combinations require room on both tracks. Rankings consider bar phase, available duration, local relative loudness, energy goal, tempo/key suitability and recent routines. Scores are heuristic guidance. They do not measure perceived sound quality, and the analysis does not detect vocals, melodies or drops. The full 28-technique catalog explains musical reasons and marks routines requiring manual preparation.

Selecting a pair persists the technique and both anchors together. Waveform preview highlights the selected entry, exchange and handoff without seeking audible playback. Earlier exit cues remain available for practice behind the “All track positions” control. The current song suggestions use only the selected folder, playlist, favorites, queue, device collection or explicitly filtered library view. An unfiltered whole-library view requests a collection. Ranking first uses tempo, harmony, energy and technique suitability, then compares cue plans for up to five shortlisted songs. Loading a suggestion requires a paused destination; completion rechecks the outgoing track, current collection, rates and cue bounds. It does not start playback.

Hot-cue pads support right-click and Shift+F10 editing. The “Edit cues” button provides the same selection, label and remove controls for touch and keyboard users. Labels are limited to 32 characters and saved through the existing IndexedDB cue metadata callback. Edits do not seek. Removal clears the corresponding label, and copies of the same track on the other deck receive the update. Cue arrays now change identity so waveform and planner subscribers refresh.

Fullscreen uses the native browser API, follows fullscreenchange (including Esc) and handles rejected requests. Unsupported browser windows show the control disabled. Desktop and mobile navigation retain a 40px target in Compact and 44px in Comfortable. A mobile regression in the controller settings' inherited text size was corrected to 12px.

The continuous scratch AudioWorklet reads interpolated forward/reverse samples instead of creating a source for every wheel packet. Motion follows the newest target over the packet interval, bounds velocity and stops at the target rather than overshooting during MIDI gaps. A brief audio ramp prevents clicks; controller/UI values remain direct. Repeated touch messages retain the original playback-resume intent. Manual Pause/Stop clears that intent; release then stays stopped. Touched jog movement updates the playhead directly in both the worklet and fallback paths, avoiding repeated seek/pause operations. AudioWorklet preparation uses a decoded PCM copy per loaded deck; very long tracks can therefore use substantial memory. Older browsers retain the bounded short-grain fallback. Physical wheel sensitivity and perceived latency still need the user's FLX4 listening check.

Validation:

- 106 automated checks pass, including cue-pair bounds/materialization, grid phase, corrupt/missing loudness data, saved/long-recording anchors, scoped song recommendations, immutable cue editing and scratch touch/stop behavior.
- The standalone real AudioContext check passed forward/reverse audio, clean release, a 2,000-message burst, single-node reuse, repeated-touch resume and explicit-stop cancellation. [Screenshot](screenshots/scratch-check.png). This used silent synthetic audio in a separate graph; it did not take over MIDI input handlers or change studio tracks.
- Browser checks passed native fullscreen entry/exit; alternate-cue preview without playback seeking; cue rename persistence after reload; right-click removal; collection-only next suggestions; loading a suggested song with its plan; search-filter isolation; and the full preparation catalog. At 390px the workspace has no horizontal overflow, the fullscreen target measures 40 × 40px, and sampled text is at least 12px.
- Production build, typecheck and lint pass. The main bundle still triggers Vite's existing >500kB warning.

To repeat the scratch check, copy `scripts/scratch-browser-check.html` to `public/scratch-check.html` while running `pnpm dev`, open that URL and click **Run scratch checks**. Remove the temporary public copy afterwards; the source harness stays outside the production output.

UI captures: [compact studio and named cue](screenshots/coach-studio.png), [transition exploration with the decks visible](screenshots/coach-transitions.png), [cue-pad label and editor controls](screenshots/coach-cues.png), [phone layout](screenshots/coach-mobile.png). The 1440 × 900 desktop check kept both Play controls visible with the coach expanded. Temporary development checks were removed from `public` and are absent from the production output.

## October 4, 2026 — timeline gestures, fixed coach and background analysis

- The final combined suite passes 126 unit/regression tests. Seven new zoom tests cover pointer anchoring, bounds, rapid packet accumulation, wheel units, normal scrolling, Safari gesture scaling, duplicate-event suppression and listener cleanup. Four analysis tests cover unchanged playing audio sources, copied PCM, saved cues and grid overrides, same-track job deduplication, a newly loaded replacement track, cached results, worker failure, timeout and retry.
- The actual app's first-party timeline harness passes 11 browser assertions: a 25-packet pinch burst is captured and accumulates around the pointer; zoom, pan, Fit and Safari-style gesture events preserve playback position and tempo; ordinary vertical scrolling remains unhandled. The harness uses synthetic native events. Physical trackpad feel and a real Safari browser remain manual checks. Developer source is `scripts/timeline-browser-check.html`; copy it temporarily to `public/timeline-check.html` to repeat, then remove the public copy.
- Real background re-analysis on playing Deck A completed while the playback clock advanced from 00:21 to 00:40. The completion timestamp survived a reload. Re-analysis updates waveform/BPM/key/energy metadata and refreshes estimated smart-mixer plans through the existing IndexedDB metadata callback. It preserves saved cues, manually corrected grids and transport controls. An executing automix retains its chosen plan. This does not establish improved musical accuracy or physical audio-device output.
- The coach is a fixed strip with technique/cue selection, automix, status/progress, Why & steps, Go to zone, Mix now/Mix cues and Stop automix. MIDI continues to lock automation in the engine. Browser checks exercised the top-bar mix and stop actions and keyboard tab activation. Switch thumbs stay inside their tracks in both states.
- Details use a nonmodal floating shadcn dialog without a backdrop or focus trap. Opening it does not change coach height or push the decks down. At 1280 × 720, the details view occupies y=161–441; both 40px Play buttons remain visible below it at y=631–671.
- Responsive same-origin iframe checks at 390, 768 and 1280px find no page overflow, text at least 12px and buttons/tabs/selects at least 40px high, including dialog triggers and close controls. The coach measures 138px tall at phone/tablet widths and 80px at desktop width. Comfortable mode measures 44px for the new controls. The iframe was used because the browser viewport capability targeted a different tab; its document has the actual tested innerWidth.
- TypeScript, ESLint, formatting and the production client/server build pass. The existing main-chunk size warning remains. This update's temporary timeline/layout check pages are removed from `public` before building.

Proof screenshots: [studio with zoom and analysis controls](screenshots/timeline-coach-studio.png), [floating details with both Play controls visible](screenshots/timeline-coach-details.png), [timeline gesture checks](screenshots/timeline-check.png).

Analysis still estimates constant-tempo grids, phrase anchors, global key and relative loudness. It does not identify vocals, drops or stems. Audition the suggested cue combinations and correct the grid when needed.


## Channel-fader Automix — October 10, 2026

- All ten catalog routines rendered finite audio and transferred output from A to B with the crossfader at 50%. Distinct Long Blend makes nine execution families.
- A doubled-amplitude incoming stereo fixture received approximately −6.02dB of relative trim (within 0.15dB).
- Channel Fade stayed within 0.3dB of the synthetic reference through the blend. Bass Swap measurably transferred low-band energy; Long Blend introduced HI before MID and LOW last.
- Unit coverage includes gain caps, silence/short sections, stereo phase reversal, cue-section measurements, conservative peak budgets with extreme EQ, B-to-A handoffs, full-length Long Blend and current-value cancellation.
- The separate silent real AudioContext collection fixture passed all seven assertions, including unique-track continuation, natural final-track completion and no exhausted-collection replay.
- A full-length studio Long Blend exposed a WebKit endpoint-event overlap that did not occur in short offline renders. Removing the redundant terminal event fixes the scheduling error; curves already hold their final sample. A full 60-second studio Long Blend then completed with A stopped/closed, B playing at its matched level, neutral restored EQ and the crossfader still at 50%.
- Loudness matching uses selected-section RMS and full-track sample peaks; it is not LUFS or true-peak normalization. Hardware checks and subjective real-music comparisons remain outside these synthetic checks.

## Terminal performance review — October 10, 2026

No browser control was used for this review. Exact stereo section totals and full-track peaks now prepare during deck loading with event-loop yields between batches. Cached measurements read at most two partial 4096-sample blocks per channel. Tests compare indexed and raw measurements for unaligned/short/full/out-of-range sections, non-finite PCM, reversed stereo polarity and canceled preparation.

On a generated five-minute stereo 44.1 kHz buffer, 100 section queries measured 806.5 ms before preparation and 7.2 ms afterward (about 113× faster on this machine). The original first full-track/section query measured 241 ms; preparation measured 208 ms including 100 yields. These are terminal microbenchmarks, not browser interaction or audio-device latency measurements. Reproduce with `node scripts/performance-check.mjs`.

Cue controls now select only their track/loading/cue data, Deck annotations stay stable during playback, and the closed Settings dialog has no changing audio subscription values. The provider computes its library scope once per input change and shares it between Automix and the library. Local diagnostic captures in `artifacts/` are excluded from Git because they may contain personal library metadata.


## Transition coach panel — October 10, 2026

The coach uses one keyboard-accessible tab row for transitions, cue pairs, next tracks, techniques and Why & steps. A fixed summary shows the current routine, outgoing/incoming tracks and selected cue times, with a waveform-preview action. The larger panel has one content scrollbar, expand/restore controls and viewport-bounded sizing. Narrow panels use single-column cards and horizontally scrollable tabs. Added panel text stays at least 12px; controls follow the 32/40/44px density preference.

Transition cards separate descriptions, difficulty, cue times and cue-selection actions. Why & steps labels each action with its estimated outgoing-deck time; listening cautions and active Automix level information appear separately.

Validation used an isolated source snapshot to keep concurrent Automix-bar edits separate: 171 tests, TypeScript, ESLint, formatting and the Vercel production build pass. The generated handler returns HTTP 200 for `/` and `/learn`, with all referenced assets and demo audio present. No browser control or rendered visual inspection was used for this update.
