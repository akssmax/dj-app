/**
 * Fragment shaders, one program per scene. Each defines `vec3 scene(vec2 p)`
 * in linear light; the shared `main` adds energy, flash, vignette, tone
 * mapping and dither. GLSL ES 1.00 so WebGL1 and WebGL2 both run them.
 */
export const header = `precision highp float;
uniform vec2 uRes;
uniform float uTime, uPulse, uBass, uMid, uHigh, uBar, uTravel, uFlash, uEnergy, uMix;
uniform vec3 uPal[4];
uniform sampler2D uSpec;
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// Palette gradient: shadow -> body -> accent -> highlight.
vec3 grad(float t) {
  t = clamp(t, 0., 1.) * 3.;
  vec3 c = mix(uPal[0], uPal[1], clamp(t, 0., 1.));
  c = mix(c, uPal[2], clamp(t - 1., 0., 1.));
  return mix(c, uPal[3], clamp(t - 2., 0., 1.));
}
// Ping-pong through the gradient so wrapping values never jump.
vec3 cyc(float t) { return grad(abs(fract(t) * 2. - 1.)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`

const main = `
void main() {
  vec2 p = (2. * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 c = scene(p) * (0.4 + 0.45 * uEnergy);
  c += (uPal[2] * 0.5 + uPal[3] * 0.3) * uFlash;
  c *= 1. - 0.28 * dot(p * 0.5, p * 0.5);
  // Tone map on luminance so bright frames stay saturated instead of white.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= (1. + l / 4.) / (1. + l);
  c = max(mix(vec3(l * (1. + l / 4.) / (1. + l)), c, 1.35), 0.);
  c = pow(clamp(c, 0., 1.), vec3(1. / 2.2));
  c += (hash(gl_FragCoord.xy + fract(uTime * 7.)) - 0.5) / 128.;
  // Dissolve in from the centre in soft organic waves; uMix is 1 when solo.
  float wave = 0.5 + 0.5 * sin(p.x * 3. + uTime) * sin(p.y * 3. - uTime * 0.7);
  float edge = uMix * 1.8 - 0.35 - length(p) * 0.35 - wave * 0.2;
  gl_FragColor = vec4(c, smoothstep(0., 0.45, edge));
}
`

const tunnel = `
vec3 scene(vec2 p) {
  p *= rot(uBar * 0.5 + uTime * 0.04);
  float r = length(p), a = atan(p.y, p.x);
  float z = 0.4 / max(r, 0.001) + uTravel;
  float rings = 0.5 + 0.5 * sin(z * 6.2831);
  float spokes = 0.5 + 0.5 * cos(a * 6. + z * 0.8);
  float wall = smoothstep(0., 1., rings * 0.6 + spokes * 0.4);
  vec3 c = grad(0.12 + 0.6 * wall) * (0.3 + 0.7 * wall);
  c += uPal[3] * pow(rings, 14.) * (0.3 + 1.2 * uPulse);
  c += uPal[2] * pow(spokes, 24.) * (0.2 + 0.8 * uHigh);
  c = mix(uPal[0] * 0.3, c, smoothstep(0., 0.9, r));
  c += uPal[2] * 0.04 / (r + 0.07) * (0.3 + uPulse) * (0.4 + uBass);
  return c;
}
`

const liquid = `
vec3 scene(vec2 p) {
  p *= 1.3;
  float t = uTime * 0.22;
  for (int i = 1; i < 7; i++) {
    float f = float(i);
    p.x += 0.6 / f * sin(f * p.y + t + 0.3 * f + uBass * 1.1);
    p.y += 0.6 / f * cos(f * p.x + t * 1.1 + 0.5 * f);
  }
  float v = 0.5 + 0.5 * sin(p.x + p.y + uMid * 0.8);
  float w = 0.5 + 0.5 * sin(p.x * 0.7 - p.y * 1.3 + t);
  vec3 c = grad(0.08 + v * 0.8);
  c = mix(c, uPal[3], pow(w * v, 5.) * (0.4 + 0.9 * uPulse));
  return c * (0.55 + 0.45 * v + 0.45 * uPulse);
}
`

const kaleido = `
vec3 scene(vec2 p) {
  float r = length(p), a = atan(p.y, p.x) + uTime * 0.06 + uBar * 0.25;
  float n = 8.;
  a = abs(mod(a, 6.2831 / n) - 3.14159 / n);
  p = r * vec2(cos(a), sin(a)) * (1.3 - 0.35 * uPulse);
  vec3 c = vec3(0.);
  for (int i = 0; i < 7; i++) {
    p = abs(p) / dot(p, p) - vec2(0.86 + 0.05 * sin(uTime * 0.17), 0.62 + 0.16 * uBass);
    float l = length(p);
    c += cyc(float(i) * 0.11 + l * 0.08 + uTime * 0.02) * exp(-l * 1.6) * 0.26;
  }
  // Square for contrast: deep shadows between bright filaments.
  c *= c * 2.2;
  return c * (0.6 + 1.2 * uPulse) * smoothstep(1.9, 0.1, r) + uPal[0] * 0.35;
}
`

const ring = `
vec3 scene(vec2 p) {
  p *= rot(uTime * 0.04);
  float r = length(p), a = atan(p.y, p.x), u = abs(a) / 3.14159;
  float bins = 64.;
  float s = texture2D(uSpec, vec2((floor(u * bins) + 0.5) / bins, 0.5)).r;
  float base = 0.32 + 0.05 * uPulse, len = 0.02 + s * 0.48;
  float bar = step(fract(u * bins), 0.62)
    * smoothstep(base - 0.004, base, r) * smoothstep(base + len + 0.005, base + len, r);
  vec3 c = grad(0.35 + 1.3 * (r - base)) * bar * 1.4;
  c += uPal[3] * 0.004 / (abs(r - base) + 0.004) * (0.4 + 1.6 * uPulse);
  c += uPal[1] * smoothstep(base, 0., r) * 0.7 * uBass;
  float ripple = smoothstep(0.035, 0., abs(fract(r * 2.2 - uTravel * 0.35) - 0.5));
  c += uPal[2] * 0.14 * ripple * smoothstep(1.8, 0.4, r) * (0.3 + uEnergy);
  return c + uPal[0] * 0.6;
}
`

const synthGrid = `
vec3 scene(vec2 p) {
  vec3 c = grad(clamp(0.5 + p.y * 0.45, 0., 1.)) * 0.3;
  vec2 sp = p - vec2(0., 0.2);
  float sr = length(sp), sunR = 0.42 + 0.03 * uPulse;
  // Sun with scrolling bands cut into its lower half.
  float bands = max(step(0.5, fract(sp.y * 14. - uTime * 0.4)), step(0.05, sp.y));
  float sun = smoothstep(sunR, sunR - 0.01, sr) * bands;
  c = mix(c, grad(0.62 + sp.y * 0.7), sun);
  c += uPal[2] * 0.12 * exp(-max(sr - sunR, 0.) * 5.) * (0.5 + uBass);
  float horizon = -0.08;
  if (p.y < horizon) {
    float z = 0.5 / (horizon - p.y);
    vec2 f = abs(fract(vec2(p.x * z, z + uTravel * 2.5)) - 0.5);
    float line = smoothstep(0.03 + 0.012 * z, 0., min(f.x, f.y));
    c = uPal[0] * 0.5 + grad(0.75) * line * exp(-z * 0.12) * (0.5 + 1.3 * uPulse);
  }
  c += uPal[2] * 0.3 * exp(-abs(p.y - horizon) * 14.) * (0.6 + uBass);
  return c;
}
`

const aurora = `
vec3 scene(vec2 p) {
  vec3 c = uPal[0] * 0.6 + grad(0.25) * 0.12 * (1. - p.y);
  for (int i = 0; i < 4; i++) {
    float f = float(i);
    float y = 0.22 * sin(p.x * (1.2 + f * 0.4) + uTime * (0.22 + f * 0.06) + f * 1.7)
      + 0.12 * sin(p.x * 3.1 - uTime * 0.35 + f) + 0.12 * f - 0.25 + uMid * 0.08;
    float d = p.y - y;
    float curtain = exp(-max(d, 0.) * (2.5 + f)) * smoothstep(-0.02, 0.03, d);
    float rays = 0.55 + 0.45 * sin(p.x * 38. + f * 3. + uTime * (0.4 + f * 0.2));
    c += grad(0.4 + f * 0.17) * curtain * rays * (0.3 + 0.55 * uBass + 0.35 * uPulse);
  }
  float star = step(0.996, hash(floor((p + 3.) * 110.)));
  return c + uPal[3] * star * (0.3 + 0.7 * uHigh);
}
`

const crystal = `
vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
vec3 scene(vec2 p) {
  p = p * (3.2 - 0.4 * uPulse) + vec2(uTime * 0.05, uTravel * 0.08);
  vec2 n = floor(p), f = fract(p), id = n;
  float d1 = 8., d2 = 8.;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = 0.5 + 0.4 * sin(uTime * 0.6 + 6.2831 * hash2(n + g));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; id = n + g; }
      else if (d < d2) d2 = d;
    }
  float h = hash(id);
  vec3 c = grad(0.12 + 0.55 * h) * (0.3 + 0.7 * smoothstep(0., 0.7, d1));
  // A different handful of cells lights up on every beat.
  float lit = smoothstep(0.8, 1., fract(h * 7. + floor(uBar * 4.) * 0.37));
  c += uPal[3] * lit * uPulse * 0.9;
  c += uPal[2] * smoothstep(0.07, 0., d2 - d1) * (0.35 + 1.1 * uHigh);
  return c;
}
`

const hyperspace = `
vec3 scene(vec2 p) {
  float r = length(p), a = atan(p.y, p.x) / 6.2831 + 0.5;
  vec3 c = uPal[0] * 0.4;
  for (int i = 0; i < 3; i++) {
    float f = float(i), seg = 90. + f * 40.;
    float h = hash(vec2(floor(a * seg), f));
    float z = fract(h * 13.1 + uTravel * (0.6 + h) * 0.35);
    float pos = z * z * 1.8, len = 0.05 + 0.35 * z * (0.4 + uBass);
    float streak = smoothstep(0.5, 0.1, abs(fract(a * seg) - 0.5))
      * smoothstep(pos - len, pos, r) * smoothstep(pos + 0.01, pos, r);
    c += grad(0.45 + 0.5 * h) * streak * z * 1.7;
  }
  return c + uPal[2] * 0.06 / (r + 0.1) * (0.4 + uPulse);
}
`

const ridges = `
vec3 scene(vec2 p) {
  float x = p.x * 0.5 * uRes.y / uRes.x + 0.5, y = p.y * 0.5 + 0.5;
  vec3 c = uPal[0] * 0.5;
  float s = texture2D(uSpec, vec2(abs(x - 0.5) * 1.8, 0.5)).r;
  float body = exp(-pow((x - 0.5) * 3.2, 2.));
  // Back to front: each ridge hides the glow of those behind it.
  for (int i = 0; i < 14; i++) {
    float f = float(i);
    float wobble = 0.5 + 0.5 * sin(x * 22. + f * 1.3 + uTime * 0.8);
    float h = 0.86 - f * 0.058
      + body * (0.05 + 0.3 * s * (0.4 + 0.6 * wobble)) * (0.6 + 0.4 * sin(f + uTime * 0.3));
    if (y < h) c = uPal[0] * 0.5;
    c += grad(0.3 + f * 0.04 + s * 0.3) * smoothstep(0.006, 0., abs(y - h)) * (0.7 + 0.8 * uPulse);
  }
  return c;
}
`

const lava = `
vec3 scene(vec2 p) {
  float v = 0.;
  for (int i = 0; i < 7; i++) {
    float f = float(i);
    vec2 o = vec2(sin(uTime * (0.21 + f * 0.05) + f * 2.1) * 0.9,
      cos(uTime * (0.17 + f * 0.04) + f * 1.3) * 0.6);
    float rad = 0.11 + 0.05 * sin(f * 3.) + 0.06 * uBass;
    v += rad * rad / dot(p - o, p - o);
  }
  float blob = smoothstep(0.9, 1.1, v), rim = smoothstep(0.55, 1., v) * (1. - blob);
  vec3 c = uPal[0] * 0.6 + grad(0.2) * 0.2 * (1. - length(p) * 0.4);
  c = mix(c, grad(clamp(0.35 + v * 0.1, 0., 1.)), blob);
  return c + uPal[3] * rim * (0.4 + 1.2 * uPulse);
}
`

const hex = `
vec3 scene(vec2 p) {
  p = rot(uTime * 0.02) * p * 6.;
  vec2 r = vec2(1., 1.732), h = r * 0.5;
  vec2 a = mod(p, r) - h, b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b, id = p - g;
  float edge = 0.5 - max(dot(abs(g), normalize(r)), abs(g.x));
  // Rings of cells ripple outward with the music.
  float d = length(id) / 6.;
  float lit = smoothstep(0.55, 1., sin(d * 8. - uTravel * 2.)) * (0.35 + uPulse);
  vec3 c = uPal[0] * 0.5 + grad(0.2 + 0.6 * fract(hash(id) * 0.3 + d * 0.2)) * lit;
  return c + uPal[2] * smoothstep(0.05, 0., edge) * (0.25 + 0.8 * uHigh);
}
`

export type SceneMood = "calm" | "driving" | "intense"

export const scenes = [
  { id: "tunnel", name: "Warp tunnel", mood: "driving", glsl: tunnel },
  { id: "liquid", name: "Liquid gradient", mood: "calm", glsl: liquid },
  { id: "kaleido", name: "Kaleido fractal", mood: "intense", glsl: kaleido },
  { id: "ring", name: "Spectrum ring", mood: "driving", glsl: ring },
  { id: "synth", name: "Synth grid", mood: "driving", glsl: synthGrid },
  { id: "aurora", name: "Aurora", mood: "calm", glsl: aurora },
  { id: "crystal", name: "Crystal cells", mood: "intense", glsl: crystal },
  { id: "hyperspace", name: "Hyperspace", mood: "intense", glsl: hyperspace },
  { id: "ridges", name: "Ridgelines", mood: "driving", glsl: ridges },
  { id: "lava", name: "Lava lamp", mood: "calm", glsl: lava },
  { id: "hex", name: "Hex pulse", mood: "intense", glsl: hex },
].map((scene) => ({ ...scene, source: header + scene.glsl + main })) as {
  id: string
  name: string
  mood: SceneMood
  source: string
}[]
