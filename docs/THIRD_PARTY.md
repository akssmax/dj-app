# Audio processing attribution

Cue uses the unmodified `@soundtouchjs/audio-worklet` 2.1.1 processor bundle, including its bundled core, worklet-base and Lanczos interpolation code, for independent pitch shifting and key lock. The packages identify their license as Mozilla Public License 2.0.

- Author: Steve “Cutter” Blades and the SoundTouchJS contributors.
- Source: https://github.com/cutterbl/SoundTouchJS
- Exact published package and source files: https://www.npmjs.com/package/@soundtouchjs/audio-worklet/v/2.1.1
- License copy: `public/licenses/soundtouch-MPL-2.0.txt` (served at `/licenses/soundtouch-MPL-2.0.txt`).

The processor asset is loaded locally from the installed package. Cue's MIDI decoder, continuous scratch reader, routing, UI and controller presets are separate app code.
