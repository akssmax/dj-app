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

const laser = `
vec3 scene(vec2 p) {
  vec3 c = uPal[0] * 0.25 + uPal[1] * 0.05 * (1. + p.y);
  // Eight beams fan up from the floor, eight cross down from the top corners.
  for (int i = 0; i < 16; i++) {
    float f = float(i);
    bool top = i >= 8;
    float k = top ? f - 8. : f;
    vec2 o = top ? vec2(k < 4. ? -1.7 : 1.7, 1.05) : vec2(0., -1.05);
    float base = top ? (k < 4. ? 2.4 : -2.4) + (mod(k, 4.) - 1.5) * 0.16 : (k - 3.5) * 0.17;
    float ang = base + 0.4 * sin(uTime * 0.7 + uBar * 3.1416 + f * 0.4) * (0.4 + uMid);
    vec2 d = top ? vec2(sin(ang), -cos(ang)) : vec2(sin(ang), cos(ang));
    vec2 q = p - o;
    float along = dot(q, d), dist = abs(q.x * d.y - q.y * d.x), ahead = step(0., along);
    float beam = smoothstep(0.01 + 0.006 * along, 0., dist) * ahead;
    float glow = 0.003 / (dist + 0.003) * ahead;
    // Beam groups switch on and off every beat.
    float on = step(0.45, fract(f * 0.37 + floor(uBar * 4.) * 0.25 + (top ? 0.5 : 0.)));
    c += cyc(f * 0.07 + uTime * 0.04) * (beam * 1.3 + glow * 0.12) * (0.35 + 0.65 * on)
      * (0.5 + 1.3 * uPulse) * exp(-along * 0.45);
  }
  return c;
}
`

const shapes = `
float poly(vec2 p, float n, float r) {
  float a = atan(p.x, p.y) + 3.14159, s = 6.2831 / n;
  return cos(floor(0.5 + a / s) * s - a) * length(p) - r;
}
vec3 scene(vec2 p) {
  vec3 c = uPal[0] * 0.3;
  // Triangles, squares and pentagons fly at the camera, spinning both ways.
  for (int i = 0; i < 12; i++) {
    float f = float(i);
    float z = fract(f / 12. - uTravel * 0.1), r = 0.05 / (1.04 - z);
    vec2 q = rot(uTime * 0.35 * (mod(f, 2.) * 2. - 1.) + f * 0.7 + uBar * 1.5708) * p;
    float d = abs(poly(q, mod(f, 3.) + 3., r)), w = 0.004 + 0.012 * z;
    float line = smoothstep(w, 0., d) + 0.005 / (d + 0.005) * 0.35;
    c += cyc(f * 0.11 + uTime * 0.03) * line * smoothstep(0., 0.25, z) * smoothstep(1., 0.8, z)
      * (0.6 + 1.5 * uPulse);
  }
  return c + uPal[2] * 0.05 / (length(p) + 0.15) * uBass;
}
`

const cubes = `
float box(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.);
}
float size() { return 0.3 + 0.07 * uBass; }
float map(vec3 p) { return box(mod(p + 1., 2.) - 1., vec3(size())); }
vec3 scene(vec2 p) {
  // Raymarch an endless grid of cubes; the camera flies down the gaps.
  vec3 ro = vec3(1., 1., uTravel * 2.), rd = normalize(vec3(p, 1.5));
  rd.xy = rot(uTime * 0.12 + uBar * 0.4) * rd.xy;
  float t = 0., glow = 0.;
  for (int i = 0; i < 70; i++) {
    float d = map(ro + rd * t);
    glow += 0.015 / (0.04 + abs(d));
    if (d < 0.001 || t > 28.) break;
    t += d * 0.9;
  }
  vec3 c = uPal[0] * 0.25;
  if (t < 28.) {
    vec3 pos = ro + rd * t, dq = size() - abs(mod(pos + 1., 2.) - 1.);
    // Edges are where two faces meet: the middle of the three distances is ~0.
    float middle = dq.x + dq.y + dq.z - max(dq.x, max(dq.y, dq.z)) - min(dq.x, min(dq.y, dq.z));
    vec3 cell = floor((pos + 1.) / 2.), col = cyc(hash(cell.xy + cell.z * 7.) * 0.8 + uTime * 0.02);
    float lit = step(0.8, fract(hash(cell.xz) + floor(uBar * 4.) * 0.31)) * uPulse;
    c = mix(c, col * (0.12 + lit * 0.6) + col * smoothstep(0.035, 0., middle) * (1.1 + 2.2 * uPulse), exp(-t * 0.11));
  }
  return c + uPal[2] * glow * 0.003 * (0.5 + uBass);
}
`

const glitch = `
vec3 rings(vec2 p) {
  float r = length(p), a = atan(p.y, p.x);
  float w = sin(r * 20. - uTravel * 5. + sin(a * 3. + uTime) * 1.6 * (0.3 + uMid));
  return mix(uPal[0] * 0.5, cyc(r * 0.35 + uTime * 0.05), smoothstep(-0.12, 0.12, w));
}
vec3 scene(vec2 p) {
  // Random rows jump sideways more often on the kick; RGB splits wider on drops.
  float row = floor(p.y * 18.), tick = floor(uTime * 12.);
  float jump = step(0.82 - 0.25 * uPulse, hash(vec2(row, tick)));
  vec2 off = vec2(jump * 0.12 * (hash(vec2(row, tick + 1.)) - 0.5), 0.);
  float split = 0.006 + 0.035 * uPulse + 0.05 * uFlash;
  vec3 c = vec3(rings(p + off + vec2(split, 0.)).r, rings(p + off).g, rings(p + off - vec2(split, 0.)).b);
  c *= 0.82 + 0.18 * sin(gl_FragCoord.y * 1.6);
  return c * (0.75 + 0.7 * uPulse);
}
`

const galaxy = `
vec3 scene(vec2 p) {
  p = rot(uTime * 0.07) * p;
  float r = length(p), a = atan(p.y, p.x);
  vec3 c = uPal[0] * 0.3;
  // Three log-spiral arms that swell with the bass.
  float arm = sin(a * 3. + log(r + 0.001) * 5.5 - uTime * 0.6);
  float density = smoothstep(0.1, 1., arm) * exp(-r * 1.3) * (1. + 0.6 * uBass);
  c += grad(0.3 + 0.5 * density + 0.2 * (1. - r)) * density * 1.3;
  vec2 g = p * 26., id = floor(g), f = fract(g) - 0.5;
  float h = hash(id);
  vec2 jitter = vec2(hash(id + 1.3), hash(id + 7.1)) - 0.5;
  float star = smoothstep(0.09 + 0.07 * uPulse, 0., length(f - jitter * 0.6)) * step(0.6, h) * (0.25 + density * 3.);
  c += cyc(h + uTime * 0.02) * star * (0.7 + uHigh);
  return c + uPal[3] * 0.05 / (r + 0.05) * (0.6 + uPulse);
}
`

const chrome = `
float blob(vec3 p) {
  p.xz = rot(uTime * 0.3) * p.xz;
  p.xy = rot(uTime * 0.17) * p.xy;
  float n = sin(p.x * 4. + uTime * 1.3) * sin(p.y * 4.3 - uTime) * sin(p.z * 3.7 + uTime * 0.7);
  return length(p) - 0.85 + n * (0.1 + 0.25 * uBass) - 0.06 * uPulse;
}
vec3 scene(vec2 p) {
  // A raymarched liquid-metal sphere; bass deepens the ripples.
  vec3 ro = vec3(0., 0., 3.), rd = normalize(vec3(p, -1.8));
  float t = 0.;
  for (int i = 0; i < 64; i++) {
    float d = blob(ro + rd * t) * 0.6;
    if (d < 0.001 || t > 8.) break;
    t += d;
  }
  vec3 c = uPal[0] * 0.4 + uPal[1] * 0.12 * (1. - length(p) * 0.5);
  if (t < 8.) {
    vec3 pos = ro + rd * t;
    vec2 e = vec2(0.002, 0.);
    vec3 n = normalize(vec3(blob(pos + e.xyy) - blob(pos - e.xyy), blob(pos + e.yxy) - blob(pos - e.yxy),
      blob(pos + e.yyx) - blob(pos - e.yyx)));
    vec3 r = reflect(rd, n);
    float fresnel = pow(1. - max(dot(-rd, n), 0.), 3.);
    float spec = pow(max(dot(r, normalize(vec3(0.5, 0.8, 0.6))), 0.), 24.);
    c = grad(0.45 + 0.5 * r.y) * 0.55 + cyc(r.x * 0.3 + r.z * 0.2 + uTime * 0.05) * fresnel * 1.3
      + uPal[3] * spec * (1. + uPulse);
    c *= 0.75 + 0.5 * uPulse;
  }
  return c + uPal[2] * 0.2 * exp(-abs(length(p) - 1.05) * 10.) * uPulse;
}
`

const city = `
vec3 scene(vec2 p) {
  vec3 c = grad(0.12 + 0.25 * (p.y * 0.5 + 0.5)) * 0.35;
  float horizon = 0.3;
  if (p.y < horizon) {
    float z = 0.4 / (horizon - p.y + 0.05);
    vec2 g = abs(fract(vec2(p.x * z * 0.5, z - uTravel)) - 0.5);
    c += uPal[2] * smoothstep(0.04, 0., min(g.x, g.y)) * 0.12 * exp(-z * 0.15);
  }
  // Eight rows of spectrum bars, far to near; bass sits in the middle columns.
  for (int k = 0; k < 8; k++) {
    float f = float(7 - k), scale = 1. / (1. + f * 0.55), base = horizon - 0.95 * scale;
    float x = p.x / scale, id = floor(x / 0.2), u = fract(x / 0.2);
    float s = texture2D(uSpec, vec2(clamp(abs(id + 0.5) / 18., 0., 1.) * 0.85 + 0.02 + f * 0.008, 0.5)).r;
    float h = 0.08 + s * 1.7 * (1. - f * 0.05), top = base + h * scale, fog = 1. - f / 9.;
    float column = step(0.12, u) * step(u, 0.88);
    float inside = column * step(base, p.y) * step(p.y, top);
    vec3 bar = grad(0.25 + s * 0.75) * (0.25 + 0.75 * fog) * (0.6 + 0.4 * (p.y - base) / max(h * scale, 0.001));
    c = mix(c, bar, inside);
    c += uPal[3] * smoothstep(0.018 * scale, 0., abs(p.y - top)) * column * fog * (0.6 + uPulse);
  }
  return c;
}
`

const rays = `
vec3 scene(vec2 p) {
  vec2 q = p - vec2(0., 0.05 * sin(uTime * 0.4));
  float r = length(q), a = atan(q.y, q.x);
  // Light pours through the gaps of a rotating gate, like beams in haze.
  float g1 = 0.5 + 0.5 * sin(a * 14. + uTime * 0.6 + uBar * 1.5708), g2 = 0.5 + 0.5 * sin(a * 23. - uTime * 0.9);
  float gaps = smoothstep(0.55, 0.95, g1 * 0.6 + g2 * 0.4) * step(0.3, r);
  vec3 c = uPal[0] * 0.3 + cyc(a * 0.159 + uTime * 0.03 + r * 0.2) * gaps * exp(-r * 1.05) * (0.6 + 1.7 * uPulse) * 1.5;
  c += uPal[3] * 0.06 / (r + 0.04) * (0.5 + uBass);
  float ring = 0.28 + 0.04 * uPulse;
  c += grad(0.85) * smoothstep(0.012, 0., abs(r - ring)) * 0.9;
  return c + grad(0.6) * smoothstep(0.006, 0., abs(r - ring * 0.62)) * 0.5 * (0.5 + uHigh);
}
`

const led = `
vec3 scene(vec2 p) {
  vec2 g = p * 13., id = floor(g) + 0.5, f = fract(g) - 0.5;
  // Four LED-panel patterns, changing about every two bars.
  float pattern = mod(floor(uTime * 0.267), 4.);
  float wave = 0.5 + 0.5 * sin(id.x * 0.45 + uTravel * 3.) * sin(id.y * 0.35 - uTime * 1.3);
  float ripple = 0.5 + 0.5 * sin(length(id) * 0.7 - uTravel * 4.);
  float s = texture2D(uSpec, vec2(clamp(abs(id.x) / 24., 0., 1.) * 0.85 + 0.02, 0.5)).r;
  float bars = step((id.y + 13.) / 26., s * 1.1);
  float checker = step(0.5, fract((floor(id.x / 3.) + floor(id.y / 3.)) * 0.5 + floor(uBar * 4.) * 0.5));
  float b = pattern < 0.5 ? wave : pattern < 1.5 ? ripple : pattern < 2.5 ? bars : checker;
  b = pow(b, 2.) * (0.6 + 0.8 * uPulse) + 0.06;
  vec3 col = cyc(id.x * 0.02 + id.y * 0.03 + uTime * 0.05);
  return uPal[0] * 0.15 + col * b * smoothstep(0.45, 0.3, length(f)) * 1.5 + col * b * 0.06;
}
`

const globe = `
vec3 dots(vec3 n) {
  n.xz = rot(uTime * 0.4) * n.xz;
  n.yz = rot(0.45) * n.yz;
  float lat = asin(clamp(n.y, -1., 1.)), lon = atan(n.z, n.x), rows = 18., cols = 40.;
  vec2 g = vec2(lon / 6.2831 * cols, lat / 3.1416 * rows), f = fract(g) - 0.5, id = floor(g);
  // Each dot grows with its band of the spectrum.
  float s = texture2D(uSpec, vec2(fract(abs(id.x) / cols * 2.) * 0.8 + 0.02, 0.5)).r;
  float size = 0.1 + 0.28 * s * (0.6 + 0.4 * cos(lat * 2.));
  float d = smoothstep(size, size * 0.35, length(f * vec2(max(cos(lat), 0.2), 1.)));
  return cyc(id.y / rows + uTime * 0.03 + s * 0.3) * d * (0.4 + 1.4 * s);
}
vec3 scene(vec2 p) {
  float R = 0.78 + 0.06 * uPulse + 0.04 * uBass, r2 = dot(p, p);
  vec3 c = uPal[0] * 0.3;
  if (r2 < R * R) {
    float z = sqrt(R * R - r2);
    c += dots(vec3(p, -z) / R) * 0.3 + dots(vec3(p, z) / R) * (1. + 0.6 * uPulse);
  }
  return c + uPal[2] * 0.025 / (abs(sqrt(r2) - R) + 0.03) * (0.3 + uBass);
}
`

const scope = `
vec2 curve(float t) {
  float a = 3. + floor(mod(uTime * 0.13, 3.));
  return vec2(sin(a * t + uTime * 0.5), sin(2. * t + uTravel)) * vec2(1.25, 0.72) * (0.8 + 0.22 * uBass)
    + vec2(0., 0.05 * sin(t * 40.) * uHigh);
}
vec3 scene(vec2 p) {
  // Distance to a Lissajous figure sampled as 140 segments.
  vec3 c = uPal[0] * 0.25;
  float d = 1e3, best = 0.;
  vec2 prev = curve(0.);
  for (int i = 1; i <= 140; i++) {
    float t = float(i) / 140. * 6.2831;
    vec2 cur = curve(t), pa = p - prev, ba = cur - prev;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.), dd = length(pa - ba * h);
    if (dd < d) { d = dd; best = t; }
    prev = cur;
  }
  // Exponential glow stays near the line; 1/d lit the whole screen in facets.
  float line = smoothstep(0.012, 0., d) + exp(-d * 45.) * 0.35;
  c += cyc(best / 6.2831 + uTime * 0.05) * line * (0.7 + 1.4 * uPulse);
  vec2 g = abs(fract(p * 4.) - 0.5);
  return c + uPal[1] * smoothstep(0.02, 0., min(g.x, g.y)) * 0.07;
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
  { id: "laser", name: "Laser show", mood: "intense", glsl: laser },
  { id: "shapes", name: "Neon shapes", mood: "driving", glsl: shapes },
  { id: "cubes", name: "Cube corridor", mood: "driving", glsl: cubes },
  { id: "glitch", name: "Glitch op-art", mood: "intense", glsl: glitch },
  { id: "galaxy", name: "Galaxy", mood: "calm", glsl: galaxy },
  { id: "chrome", name: "Chrome blob", mood: "calm", glsl: chrome },
  { id: "city", name: "Spectrum city", mood: "driving", glsl: city },
  { id: "rays", name: "Light rays", mood: "intense", glsl: rays },
  { id: "led", name: "LED wall", mood: "intense", glsl: led },
  { id: "globe", name: "Dot globe", mood: "driving", glsl: globe },
  { id: "scope", name: "Oscilloscope", mood: "calm", glsl: scope },
].map((scene) => ({ ...scene, source: header + scene.glsl + main })) as {
  id: string
  name: string
  mood: SceneMood
  source: string
}[]
