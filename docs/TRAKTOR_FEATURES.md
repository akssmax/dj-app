# Performance tools and themes

Reference: [Traktor Pro 4’s official product page and interface gallery](https://www.native-instruments.com/products/traktor-pro), reviewed October 4, 2026. Its modular deck/mixer panels, assignable FX, parallel waveform options, library layouts and Flux workflow informed this update. Cue implements its own controls and DSP; it does not use Native Instruments branding, imagery, code or proprietary processing.

## Implemented

| Feature | Where / behavior |
| --- | --- |
| Mixer / Parallel / Library layouts | Studio toolbar. Engine, playing decks and MIDI mapping survive view changes. Library includes Stop both decks. |
| Parallel waveforms | 4/8/16/32-bar zoom, separate effective BPM, estimated phase gap, cue markers and entry/exit zones. Waveforms use measured 20 ms peaks; old coarse caches upgrade when loaded. At most 640 visual bins per waveform are combined into SVG paths. |
| Beatgrid correction | Each deck’s Edit grid: BPM 40–300, first downbeat, set at current position, ±10 ms, half/double tempo, restore original. Save updates both loaded instances of that track and IndexedDB. Sync, phrases, planning and cues use the override. These are constant-tempo grids, not variable-tempo maps. |
| Quantize | Per-deck Q button. New cues and loop boundaries snap to the grid; beat jumps preserve grid positioning. Saved cues remain at their chosen locations. This snaps positions; source launches are not yet scheduled ahead onto another deck’s next beat. |
| Slip loops / rolls | Slip toggle keeps a hidden timeline advancing during normal loops. Loops tab includes hold-to-roll 4/2/1/½/¼-beat pads. Release returns to where the track would have been, accounting for tempo changes. Keyboard Space/Enter also supports the hold gesture. Seek, pause and cue explicitly cancel the slip return. |
| Echo | FX UNIT A/B: effect, on/off, send and ¼/½/¾/1/2-beat interval. Delay follows effective BPM. Feedback is bounded at 0.38, and a high-pass send removes much of the low end. |
| Reverb | Synthetic, deterministic 1.8-second stereo room impulse, high-pass send and independent amount. No external sample license is required. |
| Post-fader tails | Dry audio remains on its existing channel path. FX sends follow channel gain; wet returns reach the channel analyser/master directly, so tails continue after a fader handoff. Turning FX off stops new sends while existing tails decay. |
| Echo out | Captures one selected echo interval, then stops the dry deck and disables the send. Launch the next track manually. A controller connection still disables automix; this manual effect remains available. |
| Learn & Play FX lessons | Echo Out, Reverb Out and Loop Roll are now executable practice techniques, with explanations and the same deck controls. |
| Themes | Cue Olive, Club Graphite, Midnight Violet and Daylight. Entire palettes cover surfaces, decks, waveforms, controls, dialogs and labels. Top navigation selector and Settings → Themes. |

All interactive product controls use the existing shadcn components. Touch targets remain at least 44 px and visible text at least 12 px. Hardware mode keeps instantaneous parameter writes and disables CSS transitions/animations.

Appearance/layout/quantize preferences are additive fields in the existing version-1 IndexedDB session. Manual grid overrides are track metadata; analysis and cue arrays retain their existing storage. FX enablement and slip state intentionally reset on a fresh session instead of restoring active processing automatically. FLX4 FX buttons, sampler modes and roll-pad modes are not mapped in this update; these tools are available on screen.

## Remaining gaps and delivery order

1. **Routing and transport:** real FLX4 output/headphone routing, controller LEDs, scratch/reverse audio, AudioWorklet scheduling, click-free source jumps and pitch-preserving key lock. Existing playback rate changes pitch.
2. **Preparation and library:** flexible tempo maps, multiple grid anchors, cue names/colors, saved loop regions, crates/smart playlists, session history, normalized IndexedDB, metadata export/backup and relink.
3. **Performance:** four decks with musical role tags, beat-synced sampler/pattern sequencer, gated cue routines, more FX and MIDI mappings. Add these after timing and routing are dependable.
4. **Analysis:** section-level bass/vocal/melodic density, manually confirmed drops/sections, calibrated confidence and recorded-audio feedback. Do not label full-band filtering as stem separation.
5. **Optional integrations:** choose and benchmark a licensed local stem model, then evaluate DVS/Link and authenticated streaming APIs. These need separate compatibility, resource and licensing work.

The reference’s stem separation, proprietary time stretch, mastering processors and streaming integrations are not represented by placeholders in Cue. No superiority claim over another DJ product is established by this update.
