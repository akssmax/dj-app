## Channel-fader and EQ update — October 10, 2026

Current Automix centers the crossfader during preparation and mixing, schedules channel faders and all three EQ bands from the same recipe used by the visible controls, and retains the incoming matched level through each handoff. Channel Fade is a real channel-volume exchange; Bass Swap is a phrase/bar-aligned low-end exchange; Long Blend is a separate execution family with progressive HI, MID and LOW ownership.

Loudness matching measures stereo section RMS from loaded PCM, limits boost to +6dB, and uses cached full-track sample peaks plus positive-EQ/overlap bounds to reserve −3dB of headroom. When the −24dB trim floor cannot cover an extreme EQ setting, both fader targets are reduced. Silence/short sections are not boosted; capped corrections are identified. This provides conservative sample-peak protection, not a true-peak ceiling or LUFS measurement.

Cancellation holds the current faders, trim and EQ/filter shape rather than reopening channels; future audio events are cleared and manual FX/incoming tempo are restored. Completion closes and stops the outgoing deck before resetting its temporary controls. Audio curves hold their terminal sample, avoiding redundant endpoint events that overlapped long curves in WebKit.

Validation: unit and transport tests cover reverse-direction handoffs, full-length Long Blend, bounded levels/EQ, stereo phase cancellation, measured section selection, silence, capped boosts and extreme positive EQ. The offline browser fixture passes all ten catalog routines and verifies Channel Fade continuity within 0.3dB on synthetic tones, actual low-band ownership, and HI-before-MID-before-LOW order. A separate real AudioContext fixture checks collection traversal and final-track completion. Real music quality and physical controller output still need listening/hardware evaluation.

The historical implementation notes below describe earlier milestones; crossfader-driven transitions, the shared long/bass recipe and absent loudness matching have been superseded by this update.

# Musical transition assistant and automix

The assistant chooses a musical routine, explains why it could work, and executes its controls. It does not treat a source-key match or an energy rise as proof that two arrangements can be layered. The same selected routine drives the Studio zones, recipe and manual coach.

## Implemented

- The assistant is beside the parallel waveforms on desktop and stacks below on smaller screens. There are no waveforms in the assistant. Mixer/Library layouts keep the assistant beside the library.
- **For this pair** ranks executable choices. **All techniques** exposes the entire 28-technique curriculum and explains preparation/engine requirements for choices that cannot currently run. Selecting a ready technique updates both decks' zones and the coach. Choices persist in IndexedDB.
- Ten possible choices across eight execution families: phrase blend, bass swap, long blend, harmonic blend, channel fade, filter transition, four-beat loop transition, echo out, reverb out and a downbeat hard cut. Long/harmonic choices have eligibility checks; they use the bass-exchange family over different musical durations.
- Ranking accounts for effective tempo and pitch range, source Camelot compatibility, genre, global energy, an explicit maintain/lift/ease goal and recent repeats. Scores are heuristics, not success probabilities. Changing the energy goal changes technique preference; it does not alter the musical energy of a recording.
- A lower-loudness late 16-bar grid phrase is preferred as the exit when an RMS energy curve exists. Blends can select a quieter early incoming phrase. This estimates useful windows; it does not identify a real intro, vocal, build or drop.
- Tempo-matched overlap is limited to an 8% adjustment and the engine's ±16% pitch range. Short fades, cuts and FX exits keep existing deck tempos when a blend does not fit. Source keys are no longer presented as preserved after a relative speed change. Dedicated harmonic blending is unavailable in that case.
- Gain/filter/send envelopes are scheduled on the Web Audio clock. The UI tick reflects progress and explains the current step. Bass swaps cut the old low band just before restoring the new one. Loops use real AudioBufferSourceNode loop bounds. Echo/reverb exits delay the incoming launch, shorten dry overlap and let finite tails decay. Hard cuts have a brief anti-click gain handoff.
- Enabling **Automix** immediately chooses the highest-ranked unplayed track from the current folder/playlist/library view and its search/genre filters, then loads the idle deck. Every handoff repeats this selection using the energy goal, selected routine, per-track entry/exit cues and recent routine history. The currently loaded incoming track receives no special priority. Choosing the queue view limits the pool to that queue; other views do not require a queue.
- The engine rechecks a selected plan against current tracks, tempos and remaining duration. It rejects stale/invalid routines and shortens routines when needed. A fixed technique or cue selection is respected; no eligible future pair pauses Automix with an explanation instead of silently substituting another routine.
- Manual EQ, fader, FX, tempo, cue, transport and loop changes cancel automation. Cancellation clears scheduled curves, restores low EQ/filter/FX and incoming tempo, cancels queued starts and freezes the current audible crossfader position. Connecting any MIDI input cancels/disables automation. The coach remains available.
- An Automix run uses a generation guard and engine cancellation callbacks, so stopping, manual input or controller connection during decoding/audio startup cannot re-arm an old request. If filters change while decoding, selection is repeated from the current view. One-off **Mix cues/Mix now** actions never start collection continuation.
- Played IDs are unique within the open studio, including audible manual deck playback. Preparing/loading alone does not count as playing. Pause/resume and changing collections retain this history. When there are no unplayed candidates, the last track runs to its natural end and the switch turns off with **Mix complete**. An exhausted collection cannot silently replay; **Reset played tracks** in coach options deliberately clears history for another mix. History resets when the studio reloads.
- Entry/exit selectors accept saved hot cues or estimated phrase candidates throughout a track. Plans preserve selected source positions, shorten or exclude routines that do not fit, and warn when selected cues have different bar phases. **Mix from cues** waits for the selected exit; **Go to zone** explicitly moves the outgoing transport for practice.
- Deck and parallel waveforms show dashed estimated ENTRY/EXIT, BASS SWAP and HANDOFF markers, with shaded transition/bass-exchange windows. A four-beat cut highlight supplies downbeat context; it is not four beats of audio overlap. A **Preview transition** view fits the selected windows without seeking audio. Suggested cues can fill empty hot-cue pads, with positions and labels saved in IndexedDB.
- **Next track** recommends up to five unplayed songs from the active folder, playlist, device/favorites/queue view, or All tracks/search/genre-filtered view. It uses the same selected mix controls as Automix. Unknown analysis is identified. Loading a recommendation requires a paused incoming deck and inactive Automix. Folder imports create collections; a filtered view can be saved as a playlist.
- Sync matches effective tempo and the four-beat bar, recalculating position after the audio context resumes. A paused synced deck re-aligns on Play. The pressed deck follows the other deck’s tempo until Unlink or manual tempo/jog/seek/grid edits; unknown tempo, short loops and the ±16% limit are handled explicitly. Estimated grids still need listening.

## Next: trustworthy musical analysis

1. Add editable named sections and cue roles: intro, groove, build, drop, break, vocal, instrumental and outro. Store a confidence, provenance (`user-confirmed` or `estimated`) and analysis version for every section. Preserve the user’s edits across reanalysis. Begin with confirmed drop cues rather than automatic drop labels.
2. Measure per-beat low/mid/high-band energy, spectral flux, onset strength and loudness in a Worker. Detect likely structure changes from feature novelty, then validate on labeled tracks from multiple genres. Energy alone cannot prove a drop or the absence of vocals.
3. Add downbeat confidence, beat-grid correction and variable-tempo segments. Build phrase candidates from arrangement evidence, with user correction. The current constant-BPM grid still needs listening, especially on live drums.
4. Add optional vocal-activity models with a published model license, device memory limits, cancellation and fallback behavior. Do not enable automatic vocal/instrumental layering from an unverified classifier. Evaluate false negatives on real vocals before using it to prevent clashes.
5. Use a normalized, versioned IndexedDB schema (`tracks`, `audioBlobs`, `analysis`, `sections`, `cuePoints`, `transitionPlans`, `sessions`). Migrate the current v1 snapshot transactionally; key analysis by content hash plus analyzer version. Cache derived band/novelty data, never duplicate whole PCM buffers. Retain local Blob import and metadata editing offline.

Acceptance: each recommendation identifies its evidence and uncertainty; manual annotations survive upgrades; silent/short/variable-tempo files are handled safely; loading/cancelling jobs cannot attach analysis to the wrong track. Evaluation data must include known phrase boundaries, vocal overlaps, bass overlaps and transitions selected by experienced DJs.

## Next: more capable audio and performance

1. Prototype pitch-preserving time stretch in an AudioWorklet, including extreme-tempo and vocal listening tests, latency, CPU/memory limits and cancellation. Only then remove current pitch warnings or offer dependable harmonic automix at different speeds.
2. Add drop-swap routines using confirmed cues. Schedule B's drop against A's build; check vocal and bass overlap and provide an audition before arming. Double drops need deliberate EQ ownership, not two tracks at full bass.
3. Add section-aware loop-out and dynamic 8/16/32-bar lengths. Align endings as well as beginnings. Current fixed four-beat loop capture is a starter routine, not a detected safe percussion loop.
4. Add headphone pre-listening and an audition of the proposed transition. Do not call a mixed master preview “headphone cue” unless it has independent device/channel routing.
5. Extend the current per-handoff track ranking to look several tracks ahead. Use an energy arc, user-pinned order, compatible sections, pitch constraints and a penalty for repetitive FX. Present alternatives and respect user edits.
6. Evaluate loudness matching and headroom from measured loudness/true peaks. The existing limiter is not a substitute for validated gain staging. Nonzero channel levels are retained. Automix opens a closed fader to a usable level, then restores it on cancellation; measured loudness matching is still needed.
7. Compare rendered transitions with a baseline and listener ratings for phrasing, bass clarity, vocal/melodic clashes, timing, loudness continuity and variety. “Better than Beatport” requires evidence, not a higher heuristic score.

## Libraries to evaluate

These are candidates for future work; this update did not add dependencies.

| Library | Published license | Potential role |
| --- | --- | --- |
| [Meyda](https://github.com/meyda/meyda) | MIT | Offline spectral/RMS features for density and structure cues. It does not provide reliable vocal/section labels by itself. |
| [SoundTouchJS](https://github.com/cutterbl/SoundTouchJS) | Current upstream reports MPL-2.0; older releases used LGPL | Evaluate its AudioWorklet and pitch/speed processors for key lock. Pin and inspect the selected package version and its license before integrating. |
| [Essentia.js](https://github.com/MTG/essentia.js) | AGPL-3.0 | Optional WebAssembly analysis/ML pipeline, pending a distribution and model-license decision. Benchmark mobile cost and validate algorithm output. |

Audio scheduling references: [Web Audio parameter curves](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setValueCurveAtTime), [timed parameter changes](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime), [source loop bounds](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/loopStart).

## Verification and limits

The full suite passes 126 tests, including energy-goal track ranking, selected routine/cue retention, unique-track collection traversal, pause/resume history, one-track completion, collection changes during decoding, cancellation during audio startup and one-off transition isolation. Existing tests cover eligibility, safe bounds, actual loop transport, clock-scheduled curves, delayed FX launches, stale plan refusal and MIDI takeover.

`scripts/automix-browser-check.html` checks a separate silent real AudioContext using three generated tracks and a duplicated pool entry. Copy it temporarily to `public/automix-check.html` while running the dev server, open that URL and click **Run Automix checks**, then remove the public copy before building. It does not touch the studio library or MIDI handlers.

The browser check passed all seven assertions: energy-based next-track selection, selected cut/cues, natural clock-driven completion, unique-track traversal, both decks stopped at the end, no exhausted-collection replay, and explicit history reset without autoplay.

The developer-only `audio-render-check.html` renders the actual engine with OfflineAudioContext: generated stereo tones isolate A in the left channel and B in the right, so handoffs, filter/EQ changes and bounded FX are measurable. All eight execution families pass finite output and A-to-B handoff checks. Offline tests establish processing, not physical FLX4 behavior or speaker/device routing. Keep the physical controller/live-output checklist in VERIFICATION.md.
