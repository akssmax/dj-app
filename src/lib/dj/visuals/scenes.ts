/**
 * Fragment shaders, one program per scene. Each defines `vec3 scene(vec2 p)`
 * in linear light; the shared `main` adds energy, flash, vignette, tone
 * mapping and dither. GLSL ES 1.00 so WebGL1 and WebGL2 both run them.
 */
export const header = `precision highp float;
uniform vec2 uRes;
uniform float uTime, uPulse, uBass, uMid, uHigh, uBar, uTravel, uFlash, uEnergy;
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
  vec3 c = scene(p) * (0.5 + 0.65 * uEnergy);
  c += (uPal[2] * 0.6 + uPal[3] * 0.5) * uFlash;
  c *= 1. - 0.28 * dot(p * 0.5, p * 0.5);
  c = c * (2.51 * c + 0.03) / (c * (2.43 * c + 0.59) + 0.14);
  c = pow(clamp(c, 0., 1.), vec3(1. / 2.2));
  c += (hash(gl_FragCoord.xy + fract(uTime * 7.)) - 0.5) / 128.;
  gl_FragColor = vec4(c, 1.);
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
  c += uPal[3] * pow(rings, 14.) * (0.5 + 2. * uPulse);
  c += uPal[2] * pow(spokes, 24.) * (0.2 + 0.8 * uHigh);
  c = mix(uPal[0] * 0.3, c, smoothstep(0., 0.9, r));
  c += uPal[2] * 0.07 / (r + 0.07) * (0.3 + uPulse) * (0.4 + uBass);
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
    c += cyc(float(i) * 0.11 + l * 0.08 + uTime * 0.02) * exp(-l * 1.2) * 0.32;
  }
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

export const scenes = [
  { id: "tunnel", name: "Warp tunnel", source: header + tunnel + main },
  { id: "liquid", name: "Liquid gradient", source: header + liquid + main },
  { id: "kaleido", name: "Kaleido fractal", source: header + kaleido + main },
  { id: "ring", name: "Spectrum ring", source: header + ring + main },
] as const
