/* codegrave: the world the road runs through, in 3D. One WebGL2 shader draws
   an endless lit grid to the horizon, rails of light either side of the road
   whose pulses run towards the reader as they travel, a warm glow on the
   left and a cool one on the right, and a sky of stars and haze. It is drawn
   in the road's own perspective (stageOf() in road.js): a point on the
   ground at depth d (in focal lengths, the road's u / D) is seen 1 / (1 + d)
   of its size at the reader's feet. One full-screen triangle, no library.

   createScene(canvas) returns null where WebGL2 is missing, so the caller can
   draw something simpler. scene.frame(props) draws once; call it whenever
   the reader moves. */

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 res;        // the stage in css pixels
uniform float dpr;
uniform vec2 vp;         // the vanishing point, css pixels from the top left
uniform float gh;        // from the horizon to the reader's feet
uniform float rw;        // half the road's width at the reader's feet
uniform float travel;    // how far the reader has come, in focal lengths
uniform float time;      // seconds, for the slow shimmer of the rails
uniform vec3 warm;
uniform vec3 cool;
uniform float dark;      // 1 at night, 0 for the light theme

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
// A line of grid along v, about one pixel wide wherever it is seen.
float gridLine(float v, float w) { float f = fwidth(v); float d = abs(fract(v + 0.5) - 0.5); return (1.0 - smoothstep(0.0, f * w, d)) * clamp(1.0 - f * 1.6, 0.0, 1.0); }

void main() {
  vec2 p = vec2(gl_FragCoord.x, res.y * dpr - gl_FragCoord.y) / dpr;
  float W = res.x;
  vec3 night = mix(vec3(0.94, 0.925, 0.89), vec3(0.035, 0.05, 0.075), dark);
  vec3 col;
  // The two glows, low on the far left and far right, strongest at the horizon.
  float dy = (p.y - vp.y) / res.y;
  float gl = exp(-pow(p.x / (W * 0.26), 2.0)) * exp(-pow(dy / (dy < 0.0 ? 0.22 : 0.34), 2.0));
  float gr = exp(-pow((W - p.x) / (W * 0.26), 2.0)) * exp(-pow(dy / (dy < 0.0 ? 0.22 : 0.34), 2.0));
  vec3 glow = warm * gl + cool * gr;

  if (p.y < vp.y) {
    // The sky: deep at the top, lighter towards the horizon, with haze and stars.
    float up = clamp((vp.y - p.y) / max(vp.y, 1.0), 0.0, 1.0);
    col = mix(night * 1.9 + vec3(0.02, 0.03, 0.05) * dark, night, pow(up, 0.6));
    float haze = fbm(p / 260.0 + vec2(3.1, 0.0)) * fbm(p / 90.0 - vec2(0.0, 1.7));
    col += vec3(0.30, 0.38, 0.52) * smoothstep(0.15, 0.5, haze) * 0.09 * dark * (1.0 - up * 0.5);
    vec2 cell = floor(gl_FragCoord.xy / 2.0);
    float h = hash(cell), s = step(0.9985, h) * (0.2 + 0.5 * hash(cell + 7.0));
    col += vec3(0.85, 0.9, 1.0) * s * dark * (0.3 + 0.7 * up);
    vec2 big = floor(p / 11.0);
    float hb = hash(big + 31.0);
    if (hb > 0.996) { vec2 c = (big + 0.5) * 11.0; col += vec3(0.9, 0.94, 1.0) * exp(-dot(p - c, p - c) / 2.2) * dark; }
    col += glow * (0.26 + 0.12 * dark);
    // A thin bright line along the horizon.
    col += mix(vec3(0.5, 0.55, 0.65), vec3(0.75, 0.8, 0.9), 0.5) * exp(-pow((vp.y - p.y) / 1.6, 2.0)) * 0.25;
  } else {
    // The ground: depth d and the place x along it, in pixels at the reader's feet.
    float k = max((p.y - vp.y) / gh, 1e-4);
    float d = 1.0 / k - 1.0;
    float x = (p.x - vp.x) / k;
    float fade = exp(-d * 0.16);
    col = night * (0.85 + 0.55 * (1.0 - fade)) + vec3(0.01, 0.015, 0.025) * dark;
    // The grid: lines along the road every quarter of its half width, and across it every half focal length.
    // The lines across move with the reader, so the ground flows past.
    float along = gridLine(x / (rw * 0.5), 1.4);
    float across = gridLine((d + travel) * 2.0, 1.4);
    float side = smoothstep(0.0, 1.0, abs(x) / (rw * 2.2));
    vec3 ink = mix(vec3(0.25, 0.27, 0.3), mix(vec3(0.62, 0.68, 0.8), mix(warm, cool, step(0.0, x)), 0.35 * side), dark);
    col += ink * max(along, across * 0.8) * (0.035 + 0.075 * fade) * (0.55 + 0.45 * dark);
    // Rails of light either side of the road. Their pulses sit still on the ground, so they run towards the reader as they travel.
    for (int i = 0; i < 3; i++) {
      float fi = float(i), off = rw * (1.12 + 0.34 * fi);
      for (int s = 0; s < 2; s++) {
        float sg = s == 0 ? -1.0 : 1.0;
        float dx = abs(x - sg * off) * k;               // pixels on the screen
        float line = exp(-dx * dx / (0.7 + 2.5 * k));
        float ph = (d + travel) * (0.9 + 0.17 * fi) + fi * 0.37 + (sg > 0.0 ? 0.5 : 0.0);
        float pulse = pow(0.5 + 0.5 * cos(6.2832 * ph), 14.0);
        float shimmer = 0.85 + 0.15 * sin(time * 0.7 + fi * 2.0 + d * 3.0);
        vec3 c = sg < 0.0 ? warm : cool;
        col += c * line * (0.14 + 1.3 * pulse * shimmer) * (0.25 + 0.75 * fade) * (0.5 + 0.5 * dark);
      }
    }
    col += glow * (0.2 + 0.1 * dark) * (0.6 + 0.4 * k);
    // A soft haze where the ground meets the sky.
    col += vec3(0.45, 0.5, 0.6) * exp(-d * 0.0 - k * 26.0) * 0.12 * dark;
  }
  // The bright point at the far end of the road.
  vec2 q = p - vp;
  float star = exp(-dot(q, q) / 10.0) * 0.9 + exp(-length(q) / 22.0) * 0.18 + exp(-abs(q.y) * 1.2 - abs(q.x) / 60.0) * 0.18;
  col += vec3(0.92, 0.95, 1.0) * star * (0.35 + 0.65 * dark);
  // A little grain, so the gradients never band.
  col += (hash(gl_FragCoord.xy + time) - 0.5) / 255.0 * 2.0;
  o = vec4(col, 1.0);
}`;

export function createScene(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('codegrave: the 3D scene could not start', e); return null; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const u = {};
  for (const n of ['res', 'dpr', 'vp', 'gh', 'rw', 'travel', 'time', 'warm', 'cool', 'dark']) u[n] = gl.getUniformLocation(prog, n);
  const c3 = (v) => v.map((x) => Math.pow(x / 255, 2.2) * 1.0);   // the era's colours as light
  return {
    // G: the stage from stageOf(); warm and cool: [r, g, b] 0..255; time in seconds.
    frame({ G, travel = 0, time = 0, warm = [227, 178, 95], cool = [120, 169, 240], dark = true }) {
      // A phone draws at one pixel per css pixel: the scene is soft, and it saves the battery.
      const dpr = Math.min(G.phone ? 1 : 1.5, devicePixelRatio || 1), w = Math.round(G.SW * dpr), h = Math.round(G.SH * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.res, G.SW, G.SH);
      gl.uniform1f(u.dpr, dpr);
      gl.uniform2f(u.vp, G.vx, G.vy);
      gl.uniform1f(u.gh, G.gh);
      gl.uniform1f(u.rw, G.RW);
      gl.uniform1f(u.travel, travel % 1000);
      gl.uniform1f(u.time, time % 1000);
      gl.uniform3fv(u.warm, c3(warm).map((v) => v * 1.35));
      gl.uniform3fv(u.cool, c3(cool).map((v) => v * 1.35));
      gl.uniform1f(u.dark, dark ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
