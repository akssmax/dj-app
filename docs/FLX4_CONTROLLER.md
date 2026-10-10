# FLX4 controller support — October 4, 2026

Cue's mapping was checked against the [manufacturer's controller diagram](https://downloads.support.alphatheta.com/software_info/dj-controllers/DDJ-FLX4/DDJ-FLX4_HardwareDiagram_rekordbox_E1.pdf) and [MIDI message list](https://www.pioneerdj.com/-/media/pioneerdj/software-info/controller/ddj-flx4/ddj-flx4_midi_message_list_e1.pdf). The [Mixxx controller map](https://github.com/mixxxdj/mixxx/blob/main/res/controllers/Pioneer-DDJ-FLX4.midi.xml) provided an additional protocol check. No vendor or third-party controller scripts run in Cue.

| Hardware controls | Cue behavior |
| --- | --- |
| Trim, high/mid/low EQ, CFX, channel faders, crossfader, tempo | Full 14-bit input. MSB applies immediately; LSB refines the value. No control interpolation or CSS knob animation. Tempo range cycles through Cue's supported 6%, 8%, 10%, and 16% ranges. |
| Play, cue, shifted cue, shifted play | Transport, held cue preview, return to track start, held reverse playback. Play releases are recognized without toggling again. Held/repeated button packets trigger once. Reconnects and remounts retain one MIDI subscription. |
| Jog edge / platter / touch, Shift jog | Pitch bend while playing; seek while paused; touched platter uses a continuous audio-thread tape reader with forward/reverse interpolation; Shift seeks faster. Loop adjustment takes priority. AudioWorklet and track samples are prepared during loading, with no grain allocation on knob movement. Older browsers retain a short-grain fallback. |
| Beat Sync / long press | Toggle beat/bar sync; designate the master deck. Manual tempo, seek and jog release the relevant sync link. |
| Loop In/Out, 4 Beat/Exit, Cue/Loop Call | Set loop boundaries, adjust them with the jog, enter/exit a four-beat loop, halve/double a loop or recall adjacent memory cues. Shift call saves/deletes memory cues with track metadata. |
| Hot Cue mode | Eight saved cues; Shift deletes. Setting an empty cue does not unexpectedly start playback. Recalling a cue starts playback. |
| Pad FX 1 / Pad FX 2 | 32 Cue presets across normal and Shift banks. Echo, room reverb, filter and slip rolls apply while held. Release, mode change, track loading and unplug restore previous controls. |
| Beat Jump / Beat Loop | Eight beat jump pads, size bank changes, and loops from ¼ to 32 beats. |
| Sampler | Separate eight-slot banks per deck with built-in percussion. Shift stops a playing slot or loads a four-beat clip from the deck. |
| Keyboard / Key Shift | Pitched cue playback and semitone changes independently of tempo. Shift pads 7/8 move the range up/down; Shift pads 1–6 have no assigned action. Each deck has an optional key-lock toggle for the tempo fader. SoundTouch 2.1.1 handles pitch on the audio rendering thread. |
| Beat FX channel switch, select, beat buttons, level/depth, on/off | Route Cue's echo/reverb to A, B or both, select the effect, change beat length/send and toggle it. Paired 1&2 button messages trigger once. Shift On/Off performs echo out; Shift beat buttons reset automatic grid/tap BPM. |
| Smart CFX / Smart Fader | Cue's filter/FX combination and tempo matching with bass reduction tied directly to fader movement. These are Cue implementations, not rekordbox's proprietary DSP. |
| Master, channel/master headphone cue, phones mix/level, mic level | Master gain, separate pre-fader cue bus, cue/master mix, monitor gain and optional microphone input. Monitor/mic knob values are visible in the mixer disclosure. |
| Browse / load / Shift browse | Turn moves the track or collection cursor by the encoder's actual step count; press switches focus between tracks and collections; Shift press opens the collection selector; Shift turn changes waveform zoom. Double-tap Load instant-doubles the other deck at its live position using the same decoded audio buffer. Shift+Load A selects a related track from the current view; Shift+Load B shows the library. Single Load retains the playing-deck protection. |
| Play/cue/sync, modes/pads, loop, cue and FX LEDs | Changed values are sent to connected FLX4 MIDI outputs. No flashing or per-tick duplicate LED messages. No SysEx keep-alive is requested. LED persistence still needs a physical check. |

## Current audio setup and limits

The requested setup remains MIDI-only with system-default Mac speakers. Headphone playback and microphone capture start off. Enabling either requires an explicit settings action.

A separate headphone bus can play through an independently exposed browser output. Optional FLX4 output-pair routing sends master to channels 1/2 and cue to 3/4; select FLX4 as master output and then choose its headphone jack in Audio settings. This requires the browser to expose four destination channels and rejects stereo-only outputs. Channel routing is covered by regression checks; physical headphones were not connected for a listening test. The rear analog microphone attenuator and Android mono/stereo switch belong to the hardware, rather than the MIDI map. Estimated grids and scratch/pitch quality still need checking by ear.

On a fresh browser page, controller messages cannot supply the browser activation needed for audio. Cue resumes the graph on a studio click or key press and on the MIDI connect click. If activation is still required, an **Enable audio** action appears instead of silently ignoring Play. Track-loading and audio-start errors are visible in the studio.

## Performance and validation

- Continuous controls write the moved audio parameter directly while hardware is connected. React receives the latest snapshot once per display frame.
- Mixer controls, pads and FX panels subscribe to relevant values. MIDI diagnostics publish separately at 10 Hz and retain only the last twelve messages. Planning ignores unrelated knob changes.
- Meter arrays are reused. An idle audio graph does not publish unchanged snapshots. Hardware connection still disables automatic transitions.
- SOURCE/OUTPUT percentages were removed from deck strips; Reset audio and actual output warnings remain.
- 95 unit/regression checks pass, including button press/release sequences, repeated packets, reconnect races, independent pitch/sync, output-pair routing, instant doubles, and continuous scratch boundaries, in addition to the existing FX, sampler, loop and performance checks.
- A Chrome check detected the physical `DDJ-FLX4` input port. In a silent, separate real AudioContext, 5,000 synthesized CC messages processed in 5.5 ms and produced one display-frame notification. Real EQ and echo sends, pad release, beat jump/sync, sampler playback/stop, continuous reverse scratch and Play/Pause sequences passed. Key lock kept a 220 Hz tone within 5 Hz at 1.08x tempo; octave shifting produced about 443 Hz while retaining 1.08x tempo. These are synthetic processing/audio checks, not measured physical-to-speaker latency.
- The user confirmed the physical Play/Pause button works after the fix. Native Chrome shows the connected controller, all eight pad tabs and the cleaned deck strip. A complete physical control sweep, listening checks and LED persistence remain unverified.

To repeat the browser check, start `pnpm dev`, copy `scripts/flx4-browser-check.html` to `public/controller-check.html`, and open `/controller-check.html` in Chrome on the same origin as Cue. Click **Run controller checks**, then remove the temporary public copy. Keep the source harness in `scripts` so it is excluded from production builds. The check uses synthetic test audio with master gain zero, reads connected MIDI port names, and disposes its separate audio graph. It does not change the studio session or take over hardware input handlers.
