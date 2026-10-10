# DJ mixing and transition learning system

## Product contract

Teach the musical reason for a transition: timing, phrase structure, spectral space, harmonic fit, and energy intent. Never substitute a button instruction for a musical explanation. Automation is an optional rehearsal aid; hardware connection gives the performer control and disables automatic playback changes. “SIGNATURE” refers to a performance style, not an invention claim.

The first build implements the studio, a local library, three executable automix strategies, the full 28-technique learning catalog, MIDI coaching, and provisional input feedback. Additional techniques are taught without pretending that their dedicated DSP or analysis already exists.

## Local library and analysis storage

Current storage is `cue-library-v1` / `library` using idb-keyval. Its versioned snapshot includes local Blobs, metadata, analysis, per-track cue arrays, favorites, queue, selected decks/master/direction, learning progress, and up to 20 controller reports. SHA-256 fingerprints avoid duplicate local imports. Saved analysis is reused.

Next migration: a normalized IndexedDB schema, implemented with Dexie or native IDB:

| Store | Key | Data |
| --- | --- | --- |
| tracks | content hash | title, artist, album, genre, source, codec, duration, sample rate, loudness, imported timestamp |
| audio | content hash | Blob or OPFS reference, byte size, availability |
| analyses | hash + analyzer version | beat/downbeat grid, tempo map, chroma, key candidates/confidence, spectral bands, energy envelope, section candidates |
| cues | hash + cue id | time, label, color, type, loop length, user/automatic provenance |
| overrides | hash | user BPM, grid origin, key, phrase labels, vocal/drop/break cues; never overwrite during reanalysis |
| sessions | session id | deck assignments, gains/EQ/filter/rate, queue, automation selection, energy intent |
| practice | attempt id | raw control timings, chosen technique, estimates used, rubric version, feedback |
| progress | lesson id | read/completed status, exercise history, last practice |

Use explicit migrations with fixtures from older versions. Add export/import of metadata and cues first, then optional audio backup. Show quota estimates before large batch imports; handle QuotaExceededError, cancellation, corrupt files, and browser eviction. Keep originals intact. Add OPFS for large files and a two-deck PCM cache budget; do not persist decoded PCM unnecessarily. Add library deletion with clear treatment of metadata/audio, relinking missing originals, and analyzer-version invalidation. Request persistence only through a visible control. No cloud upload is necessary for these phases.

Acceptance: reload restores metadata and cues; duplicate bytes import once; reanalysis retains manual overrides; quota errors do not silently claim durable success; tracks remain playable when switching routes; codec failures explain how to recover; imports stay responsive at 1,000 tracks.

## Audio engine progression

1. Move transport and DSP to a tested AudioWorklet. Keep a single monotonic audio clock; schedule starts, beat alignment, loops, crossfades, and EQ changes on that clock. Add click-free ramps and a bounded decode/cache pipeline.
2. Integrate pitch-preserving stretching and independent key adjustment. Audit the license of the exact pinned SoundTouchJS packages. Compare transient preservation and latency across ±2%, ±4%, ±8%, and ±16% tempo changes, including vocals.
3. Add a separate headphone bus and verified FLX4 master/headphone channel routing. Offer supported-browser output selection plus an explicit system-output fallback. Do not equate master playback with pre-fader headphone cue.
4. Synchronized echo with safe feedback, reverb sends, slip loops/roll pads, and jog pitch-bend are implemented. Next add filter resonance controls and vinyl brake. Add accurate scratch/reverse playback before teaching hardware scratch gestures as executable app actions.
5. Expand to four decks with optional role tags: GROOVE, VOCAL, PERCUSSION, BASS, MELODY, NEXT TRACK. Add sample-gated cue pads, pitched pad notes, and later licensed stem extraction.

Acceptance: no audible clicks at source changes; stable synchronization for ten-minute blends; automation survives UI work without drift; no clipped double-bass handoff; physical FLX4 headphone/master routing works; record output matches the audible master.

## Explainable track analysis

The current worker measures waveform/energy, runs music-tempo on a bounded opening excerpt, and estimates global key with FFT/chroma profiles. It does not robustly identify downbeats, arrangement sections, vocals, drops, or dominant basslines.

Next stages:

- Multiband onset strength, tempo candidates (including half/double time), beat confidence, variable-tempo detection, and richer grid editing. Manual constant-BPM and first-downbeat editing now work. A beat is not necessarily beat one.
- Phrase candidates with strong 16/32-bar markers. Structural novelty and repetition suggest intro/groove/build/drop/break/outro; each region carries a confidence and estimated label. Prefer confirmed user cues over low-confidence suggestions.
- Spectral/RMS bands for low-end conflict and density; loudness/peak measurement; chroma/key candidates over sections rather than only a whole track.
- Vocal/instrumental-region estimates only after a evaluated local model or feature pipeline. Until then ask the DJ to confirm vocal/drop cues by listening.
- Weighted track-pair scoring: actual effective tempo, phrase fit, harmonic interval after pitch processing, vocal overlap, dominant melody overlap, bass ownership, density, genre groove/swing, energy trajectory, and available headroom.

Analysis results should include version, confidence, provenance, and manual overrides. Ambiguity must reduce confidence rather than invent a definitive musical label.

## Automix and recommendations

Build candidates across the library's 28 technique definitions. Each candidate has classification tags, difficulty, suitable genres, cue requirements, transition length, control envelope, rationale, risks, and executable/study-only capability status.

The current automix now offers phrase blend, deliberate bass swap, channel fade, filter, loop, echo, reverb and cut families with clock-scheduled audio envelopes and offline render checks. Long/harmonic variants have explicit eligibility. See AUTOMIX_PLAN.md for the current behavior and next analysis/DSP stages. Add drop swaps after manually confirmed drop cues; add automatic detection later. Multi-deck/stem/performance routines require richer preparation and should not be automated merely because BPM/key appear compatible.

Recommend based on the actual pair. Sparse harmonically compatible deep-house tracks can support a 32–64-bar blend. A large tempo or groove conflict may need a short cut, breakdown, echo, or a bridge track. Explain why a short transition is better for that pair. Camelot compatibility is guidance; an incompatible code does not make all transitions impossible. Tempo changes currently shift pitch, so present a warning rather than assume harmonic fit is unchanged.

Show an upcoming exit zone, suitable incoming entry, phrase countdown, alternatives, and anticipated bass/vocal/melody conflict. Let the DJ audition the zone, correct cues/grid, choose energy intent, and override the recommendation. Avoid reducing quality to a single unexplained percentage.

To support a defensible comparison with Beatport DJ, use a blinded evaluation with the same licensed tracks and levels. Include house, techno, DnB, open format, vocal-heavy tracks, sparse instrumentals, live-tempo tracks, and tempo/key mismatch cases. Measure beat/phrase error, loudness discontinuity, bass overlap, clipping, vocal clash, listener preference, and explanation usefulness. The goal is stronger musical results; superiority remains unverified until measured.

## Hardware coaching and feedback

Connection policy already exists: any connected MIDI input sets an engine-level hardware lock, cancels automation, and disables the automix switch. FLX4 ports are recognized by name and mapped after browser permission. MIDI disconnect and hot-plug states update the lock. Unknown controllers do not silently receive a wrong map.

14-bit analog assembly, cue release, shifted cue deletion and jog pitch-bend are implemented. Next: soft takeover, LED feedback, MIDI learn, more shift layers, hardware loop-size changes, scratch playback and device profile versioning. New software FX and roll pads are not yet mapped to hardware FX/pad modes. Test official bytes against a physical controller; protocol unit tests cannot replace a hardware session.

Before the transition, show a non-blocking coach popup: technique, why, expected entry, bars until the phrase, bass ownership, and the handoff plan. Playback must continue. Once dismissed, do not repeatedly cover the controls. Offer an anchored compact coach for performance mode.

Record high-resolution control events with the audio-clock time. A rubric should compare actual entry vs. grid confidence, tempo drift throughout overlap, bass ownership, EQ/filter envelopes, transition length vs. technique, crossfader direction/completion, and peak headroom. Uncertain grids suppress definitive timing grades. Add recorded-audio metrics before judging whether a transition sounded good. Score each dimension separately and provide one or two actionable next exercises. Current reports measure input behavior only.

Acceptance: plug-in cancels an active automix; no scheduled envelope continues after lock; both A→B and B→A generate feedback only after complete handoff; reversing back to the original endpoint does not falsely count as success; pad/fader event bursts do not inflate musical competence; device removal does not lose saved cues.

## Beginner-to-performance curriculum

The implemented 28 lessons and genre matrix follow the supplied master library. Most-used foundations appear first. Each lesson includes classification, difficulty, duration, genre suitability, steps, do/don't guidance, and a musical explanation. Four levels progress from two-deck faders/EQ to phrasing/loops/FX, precise cues/harmony, and performance routines.

Add guided exercises with reference audio: hear beat one, count phrases, correct drift, start on a 16-bar boundary, reduce incoming bass, exchange bass on a phrase, compare a vocal clash with a clean instrumental blend, and shape energy. Make progression depend on practice observations plus self-assessment, with manual completion distinguished from demonstrated skill.

Professional-style examples: Jeff Mills' rapid layering and live-arrangement approach; Carl Cox's three-deck, continuous-energy approach. Frame these as inspiration, not claims that either artist invented a technique. Add source-backed performance examples before introducing more named-DJ associations.

## Open-source options and licensing

| Library | License / status | Role |
| --- | --- | --- |
| [music-metadata](https://github.com/Borewit/music-metadata) | MIT; integrated | Browser metadata and tags |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval) | Apache-2.0; integrated | Current IndexedDB snapshot |
| [music-tempo](https://github.com/killercrush/music-tempo) | MIT; integrated | Initial beat/tempo candidates; limited excerpt and confidence |
| [Meyda](https://github.com/meyda/meyda) | MIT | Multiband/spectral features; evaluate for richer analysis |
| [Tonal](https://github.com/tonaljs/tonal) | MIT | Notes, scales, intervals, and harmonic explanation helpers |
| [SoundTouchJS](https://github.com/cutterbl/SoundTouchJS) | Current repo states MPL-2.0; older releases differ | AudioWorklet pitch/stretch candidate; audit exact package licenses before shipping |
| [Tone.js](https://github.com/Tonejs/Tone.js) | MIT | Scheduling/music utilities; evaluate without creating a second competing transport |
| [Dexie](https://github.com/dexie/Dexie.js) | Apache-2.0 | Normalized IndexedDB migrations and indexed queries |
| [wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) | BSD-3-Clause | Optional visualization/regions; current waveform is custom SVG |
| [Essentia.js](https://github.com/MTG/essentia.js) | AGPL-3.0; optional commercial licensing | Advanced WASM analysis; explicitly evaluate distribution obligations first |

These are candidates, not promises that all are needed. Keep the core lean, benchmark each addition, and pin versions after the license/API audit.

Primary references: [Pioneer FLX4 software/MIDI information](https://www.pioneerdj.com/en/support/software-information/controller/ddj-flx4/), [official MIDI message list](https://www.pioneerdj.com/-/media/pioneerdj/software-info/controller/ddj-flx4/ddj-flx4_midi_message_list_e1.pdf), [Web MIDI permissions and compatibility](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API), [shadcn TanStack installation](https://ui.shadcn.com/docs/installation/tanstack), and the libraries' own repositories above. Mixxx's map was used as a protocol cross-check; its controller script was not copied into Cue.

## Delivery order

1. **Now:** validate the first build's playback, cue persistence, local imports, lessons, baseline planner, hardware lock, and UI. Complete a physical FLX4 test next.
2. **Reliability:** normalized IndexedDB, metadata overrides/editors, backup/relink, error recovery, worker queue/cancellation, PCM cache bounds, full MIDI resolution, and non-blocking coach behavior.
3. **Musical engine:** key-preserving stretching, stable clock scheduling, accurate looping/pitch-bend, cue/master routing, loudness/headroom, and richer grid editing.
4. **Smarter transitions:** multiband density/energy, section confidence, manually confirmed vocal/drop regions, genre-aware strategies, recorded-audio evaluation, and richer feedback.
5. **Performance:** FX, stems, four deck roles, sample-gated pads, tone play, scratching, live arrangement practice, and source-backed professional style lessons.

## October 4 performance milestone

Shipped beat-synchronized post-fader echo and room reverb, echo out, editable constant-tempo grids, saved grid overrides, quantized cues/loops/jumps, slip loops and hold-to-roll pads, detailed zoomed parallel waveforms, three studio layouts, and four themes. Echo/reverb/roll lessons use the same engine in Learn & Play. Hardware connection still cancels/disables automix.

Next priorities remain audio-clock scheduling and stretch/key lock, cue/master routing, physical FLX4 verification, normalized storage/backup, flexible tempo maps and prepared performance tools. Themes and layout changes keep ≥12 px text, ≥40 px targets in Compact or ≥44 px in Comfortable, and immediate hardware feedback.

## Compact coaching and cue workflow — October 4

The transition coach lives above the players beside the layout tabs. Its compact row shows the selected technique, deck direction and next instruction or control-feedback score. Details expand in a bounded inline area with no backdrop or focus trap, so the decks stay usable. Learn & Play uses the same coach and musical explanations.

Compact is the default density; Comfortable increases controls to 44px. Density changes spacing and control dimensions rather than browser zoom, preserving 12px minimum labels. The choice persists in IndexedDB and is available in the top navigation or Settings → Appearance on mobile.

Selected exit/entry cues, saved hot-cue labels and folder/playlist membership also persist. Waveforms distinguish suggested dashed markers from saved numbered cues, shade the transition window and bass exchange, and preview future cues without seeking playback. Next-track ranking uses only the selected collection and current filters. A collection with no eligible songs stays empty; it never falls back to the entire library.
