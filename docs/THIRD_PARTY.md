# Audio processing attribution

Cue uses the unmodified `@soundtouchjs/audio-worklet` 2.1.1 processor bundle, including its bundled core, worklet-base and Lanczos interpolation code, for independent pitch shifting and key lock. The packages identify their license as Mozilla Public License 2.0.

- Author: Steve “Cutter” Blades and the SoundTouchJS contributors.
- Source: https://github.com/cutterbl/SoundTouchJS
- Exact published package and source files: https://www.npmjs.com/package/@soundtouchjs/audio-worklet/v/2.1.1
- License copy: `public/licenses/soundtouch-MPL-2.0.txt` (served at `/licenses/soundtouch-MPL-2.0.txt`).

The processor asset is loaded locally from the installed package. Cue's MIDI decoder, continuous scratch reader, routing, UI and controller presets are separate app code.

# Landing page assets

- **Bricolage Grotesque** (variable, Latin subset) by Mathieu Triay, from `@fontsource-variable/bricolage-grotesque` 5.3.0. SIL Open Font License 1.1. File: `public/fonts/bricolage/`, licence copy `public/fonts/bricolage/OFL.txt`.
- **GradientASCII** WebGL component adapted from [React Bits](https://reactbits.dev) (MIT + Commons Clause licence) (`src/components/marketing/gradient-ascii.tsx`). Ported to TypeScript, with a frame-rate cap and a lighter render path for the landing page.

# Visitor counter

The public visitor count on the landing page uses [Abacus](https://abacus.jasoncameron.dev), a free counting service by Jason Cameron. Each visitor's browser calls it directly: once with `/hit/cue-dj-app/visitors` on the first visit (remembered in `localStorage`), then `/get` afterwards. Abacus receives the visitor's IP address with that request, limits each IP to 30 requests per 10 seconds, and expires a counter after six months without use. Development builds use the separate `cue-dj-app-dev` counter. If the service is unreachable, the count is hidden. Code: `src/lib/visitors.ts`.
