// Export video: a timeline made into one file in the reader's own browser, with one press (asked for, Nov 2026:
// "you just click, and the MP4 ... should process and download", "it should not control the browser and record").
// Nothing is recorded from the screen and nothing goes to a server. The film is drawn frame by frame on a canvas
// (the entry in front as in Full view: its picture large, its text under it, the stars drifting behind), each
// frame is handed to the browser's own encoder (WebCodecs, which uses the graphics hardware where it can), and
// the sound (the voiceover's lines and the music) is mixed off-line and encoded beside it. So it runs as fast as
// the device can draw, usually several times quicker than the film plays.
// Three files are offered: the video with its voiceover and music ('both'), the video with music alone
// ('video'), and the voiceover alone as sound ('voice', a WAV).
//
// The first half is plain functions with tests (tests/export.test.mjs).

export const FPS = 30, RATE = 48000;
const MUXER = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/build/mp4-muxer.mjs';
// With no voice an entry is up this long; with one, as long as its line and a breath.
export const SILENT = 4.2, LEAD = 0.7, GAP = 0.6, FADE = 0.6;

// When each entry is up and when each line is said. `ids` are the entries in the order play meets them; `secs`
// gives a line's length by id ('intro' and 'outro' too; a line there is none of is 0 or missing).
// The opening is said over the first entry before its own line, the closing over the last after its own.
export function schedule(ids, secs = {}) {
  const scenes = [], cues = [];
  let t = 0;
  ids.forEach((id, i) => {
    const t0 = t;
    let at = t0 + LEAD;
    const say = (key) => { const d = secs[key] || 0; if (d > 0) { cues.push({ id: key, at, secs: d }); at += d + GAP; } };
    if (i === 0) say('intro');
    say(id);
    if (i === ids.length - 1) say('outro');
    t = Math.max(t0 + SILENT, at + 0.2);
    scenes.push({ id, t0, t1: t });
  });
  return { total: t, scenes, cues };
}
// The scene at `t`, and how far the one before has still to fade (0: gone).
export function sceneAt(scenes, t) {
  let i = scenes.findIndex((s) => t < s.t1);
  if (i < 0) i = scenes.length - 1;
  return { i, into: t - scenes[i].t0, fade: i > 0 ? Math.max(0, 1 - (t - scenes[i].t0) / FADE) : 0 };
}
// Text broken into lines no wider than `max`, at most `rows` (the last ends in an ellipsis when cut).
export function wrap(measure, text, max, rows = 3) {
  const out = [];
  let line = '';
  for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
    const next = line ? line + ' ' + word : word;
    if (measure(next) <= max || !line) line = next;
    else { out.push(line); line = word; }
    if (out.length === rows) break;
  }
  if (out.length < rows && line) out.push(line);
  else if (out.length === rows && line) { let last = out[rows - 1]; while (last && measure(last + '…') > max) last = last.replace(/\s*\S+$/, ''); out[rows - 1] = last + '…'; }
  return out;
}
export function fileOf(title, ext) {
  const base = String(title || 'timeline').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'timeline';
  return `${base}.${ext}`;
}
// Sound as a WAV file (16 bit), from channels of samples between -1 and 1.
export function wav(channels, rate) {
  const n = channels[0].length, c = channels.length, buf = new ArrayBuffer(44 + n * c * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * c * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, c, true); v.setUint32(24, rate, true); v.setUint32(28, rate * c * 2, true); v.setUint16(32, c * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * c * 2, true);
  for (let i = 0, o = 44; i < n; i++) for (let k = 0; k < c; k++, o += 2) { const s = Math.max(-1, Math.min(1, channels[k][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return buf;
}
export const canExport = () => typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof OfflineAudioContext !== 'undefined';

// ---- the encoders the browser has. H.264 and AAC first (what every player and YouTube take), then the free ones.
const VIDEO = [['avc1.640034', 'avc'], ['avc1.640028', 'avc'], ['avc1.4d0028', 'avc'], ['avc1.42e028', 'avc'], ['hvc1.1.6.L186.B0', 'hevc'], ['vp09.00.61.08', 'vp9'], ['vp09.00.40.08', 'vp9'], ['av01.0.16M.08', 'av1'], ['av01.0.08M.08', 'av1']];
const AUDIO = [['mp4a.40.2', 'aac'], ['opus', 'opus']];
// The bits a second a frame of this size is given: 8 Mbit for 1080p, more for more, within what players take.
export const bitsFor = (w, h) => Math.round(Math.min(120e6, Math.max(4e6, 8e6 * (w * h) / (1920 * 1080))));
// Whether the device's own video chip can encode a film of that size (asked for, Nov 2026: tell the reader when
// their device's graphics hardware is used). The export does not ask for it: the browser already picks the
// hardware encoder where there is one; this only says so.
export async function canFast(shape, short) {
  if (!canExport()) return false;
  const { w, h } = sizeOf(shape, short);
  return !!(await pick(VIDEO, (codec) => VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate: bitsFor(w, h), framerate: FPS, hardwareAcceleration: 'prefer-hardware' })));
}
// Whether this browser can encode a film of that shape and size (a size the device cannot make is not offered).
export async function canSize(shape, short) {
  if (!canExport()) return false;
  const { w, h } = sizeOf(shape, short);
  return !!(await pick(VIDEO, (codec) => VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate: bitsFor(w, h), framerate: FPS })));
}
async function pick(list, test) { for (const [codec, name] of list) { try { if ((await test(codec)).supported) return { codec, name }; } catch (e) { /* not this one */ } } return null; }

function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
async function picture(url) {
  if (!url) return null;
  try { const r = await fetch(url, { mode: 'cors' }); if (!r.ok) return null; return await createImageBitmap(await r.blob()); } catch (e) { return null; }
}

// ---- the sound: the lines where the schedule says, the music under them, mixed off-line.
async function mix({ total, cues, sounds, music, voiced }) {
  const ctx = new OfflineAudioContext(2, Math.ceil(total * RATE), RATE);
  for (const c of cues) {
    const s = sounds.get(c.id);
    if (!s) continue;
    const b = ctx.createBuffer(1, s.audio.length, s.rate); b.copyToChannel(s.audio, 0);
    const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(c.at);
  }
  if (music) {
    try {
      const data = await ctx.decodeAudioData(await (await fetch(music)).arrayBuffer());
      const src = ctx.createBufferSource(), g = ctx.createGain(), vol = voiced ? 0.16 : 0.45;
      src.buffer = data; src.loop = true;
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(vol, 1.2);
      g.gain.setValueAtTime(vol, Math.max(1.2, total - 1.6)); g.gain.linearRampToValueAtTime(0, total);
      src.connect(g); g.connect(ctx.destination); src.start(0);
    } catch (e) { /* without the music */ }
  }
  return ctx.startRendering();
}

// ---- the shape of the film. Asked for, Nov 2026: "the first important thing is the format". Three shapes,
// each at 1080 or 720 on its short side: wide for a screen or YouTube, tall for a phone, square for a feed.
export const SHAPES = { wide: [16, 9], tall: [9, 16], square: [1, 1] };
export function sizeOf(shape = 'wide', short = 1080) {
  const [a, b] = SHAPES[shape] || SHAPES.wide, k = short / Math.min(a, b), even = (n) => Math.round(n / 2) * 2;
  return { w: even(a * k), h: even(b * k) };
}
// Where the reader is among the entries at time `t`, for the globe: at rest on the entry of the scene, having
// travelled there from the one before in the scene's first `MOVE` seconds (-1 is the whole globe, before the first).
export const MOVE = 2.4;
export function posAt(scenes, t) {
  const { i, into } = sceneAt(scenes, t), s = scenes[i], m = Math.min(MOVE, (s.t1 - s.t0) * 0.45);
  return i - 1 + Math.min(1, Math.max(0, into / m));
}
// Where things stand in a frame of `w` by `h`. On the globe the card keeps to one side (the right of a wide
// frame, the foot of a tall or square one) and the map is asked to keep its place clear of it (`pad`, as parts
// of the frame).
export function layout(w, h, globe) {
  const u = Math.min(w, h) / 1080, wide = w > h * 1.2, m = Math.round(70 * u);
  const head = Math.round((wide ? 150 : 250) * u), foot = Math.round((wide ? 120 : 190) * u);
  if (!globe) return { u, wide, m, card: { x: m, y: head, w: w - 2 * m, h: h - head - foot }, pad: null };
  return wide
    ? { u, wide, m, card: { x: Math.round(w * 0.53), y: head, w: Math.round(w * 0.47) - m, h: h - head - foot }, pad: { right: 0.44, bottom: 0 } }
    : { u, wide, m, card: { x: m, y: Math.round(h * 0.5), w: w - 2 * m, h: Math.round(h * 0.5) - foot }, pad: { right: 0, bottom: w === h ? 0.5 : 0.46 } };
}

// How the picture of entry `n` stands in its frame after `secs`: [scale, across, down] (the last two as parts
// of the frame). The same five ways as play on the page (`g-pan` to `g-pan-e` in site/styles.css), two entries
// each in turn, a tall picture moved along its height; there and back, never by chance.
const PANS = [[1.22, -0.09, 0, 1.38, 0.09, 0, 9], [1.22, 0.09, 0, 1.38, -0.09, 0, 9], [1.45, 0, 0.07, 1.2, 0, -0.07, 9], [1.25, -0.08, -0.06, 1.4, 0.08, 0.06, 9], [1.18, 0, 0.03, 1.5, 0, 0.09, 11]];
const PAN_T = [1.25, 0, 0.1, 1.4, 0, -0.1, 9], PAN_U = [1.35, 0, -0.1, 1.22, 0, 0.1, 9];
export function panAt(n, tall, secs) {
  const k = Math.floor(n / 2) % 5, p = tall && (k === 0 || k === 3) ? PAN_T : tall && k === 1 ? PAN_U : PANS[k];
  const ph = (Math.max(0, secs) / p[6]) % 2, e = ph <= 1 ? ph : 2 - ph, mix = (a, b) => a + (b - a) * e;
  return [mix(p[0], p[3]), mix(p[1], p[4]), mix(p[2], p[5])];
}

// ---- the picture: one frame at time `t`. `map` (when the film shows the globe) gives the map's own canvas
// for this frame and how far the map has gone out of sight for an entry with no place.
export function painter(cv, { title, steps, scenes, fonts, subsOf, globe }) {
  const c = cv.getContext('2d'), serif = fonts.serif, sans = fonts.sans, W = cv.width, H = cv.height;
  const lay = layout(W, H, globe), u = lay.u, px = (n) => Math.round(n * u);
  const sp = (v) => { try { c.letterSpacing = v + 'px'; } catch (e) { /* older canvas */ } };
  // The stars: fixed places, drawn a little further left as time goes, the near ones quicker.
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = Array.from({ length: 260 }, () => ({ x: rnd(), y: rnd(), z: 0.3 + rnd() * 0.7, r: 0.5 + rnd() * 1.3 }));
  const wraps = new Map();
  const rounded = (x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
  function card(st, a, into, plate) {
    if (a <= 0.003) return;
    const R = lay.card, pad = plate ? px(34) : 0, tw = Math.min(R.w - 2 * pad, px(plate ? 900 : 1180));
    const nameSize = px(plate ? 58 : 76), sumSize = px(plate ? 25 : 27), lineH = Math.round(sumSize * 1.48), kindSize = px(21);
    c.font = `400 ${sumSize}px ${sans}`;
    if (!wraps.has(st.id)) wraps.set(st.id, wrap((s) => c.measureText(s).width, st.summary, tw, st.bmp ? 3 : 5));
    const rows = wraps.get(st.id), textH = kindSize + Math.round(nameSize * 1.22) + (rows.length ? px(14) + rows.length * lineH : 0);
    const gap = px(40), picMax = st.bmp ? Math.max(0, R.h - 2 * pad - textH - gap) : 0;
    let pw = 0, ph = 0;
    if (st.bmp && picMax > px(120)) { const k = Math.min(tw / st.bmp.width, picMax / st.bmp.height); pw = st.bmp.width * k; ph = st.bmp.height * k; }
    const total = (ph ? ph + gap : 0) + textH + 2 * pad, cx = R.x + R.w / 2;
    const rise = (1 - Math.min(1, into / FADE)) * px(26);
    let y = R.y + (R.h - total) / 2 + rise;
    c.save(); c.globalAlpha = a;
    if (plate) {
      // On the map the card stands on a plain plate, as it does on the page.
      const bw = Math.max(pw, tw) + 2 * pad;
      c.fillStyle = 'rgba(7,9,14,.78)'; rounded(cx - bw / 2, y, bw, total, px(16)); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.09)'; c.lineWidth = 1; c.stroke();
    }
    y += pad;
    if (ph) {
      // The picture moves as it does in play (asked for, Nov 2026: the film is to show what play shows): cut
      // in and gliding inside a frame that keeps its place, each entry in its turn one of the page's own ways.
      const [z, mx, my] = panAt(st.n || 0, st.bmp.height > st.bmp.width * 1.15, into), w = pw * z, h = ph * z;
      if (!plate) { c.save(); c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = px(50); c.shadowOffsetY = px(18); c.fillStyle = '#05070c'; rounded(cx - pw / 2, y, pw, ph, px(6)); c.fill(); c.restore(); }
      c.save(); rounded(cx - pw / 2, y, pw, ph, px(6)); c.clip();
      c.drawImage(st.bmp, cx - w / 2 + pw * mx, y + (ph - h) / 2 + ph * my, w, h);
      c.restore();
      y += ph + gap;
    }
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    const kind = String(st.kind || '').toUpperCase(), when = st.when || '';
    c.font = `600 ${kindSize}px ${sans}`; sp(2); const kw = c.measureText(kind).width; sp(0);
    c.font = `400 ${kindSize}px ${sans}`; const ww = when ? c.measureText(when).width + px(18) : 0;
    y += kindSize;
    c.font = `600 ${kindSize}px ${sans}`; c.fillStyle = st.rgb || '#e8b04a'; sp(2); c.fillText(kind, cx - (kw + ww) / 2, y); sp(0);
    c.font = `400 ${kindSize}px ${sans}`; c.fillStyle = 'rgba(255,255,255,.72)'; c.fillText(when, cx - (kw + ww) / 2 + kw + px(18), y);
    c.textAlign = 'center';
    y += Math.round(nameSize * 1.1); c.fillStyle = '#f4efe6';
    let size = nameSize; c.font = `400 ${size}px ${serif}`;
    while (c.measureText(st.name).width > tw && size > nameSize * 0.55) { size -= 2; c.font = `400 ${size}px ${serif}`; }
    let name = st.name; while (c.measureText(name).width > tw && name.length > 8) name = name.slice(0, -2);
    c.fillText(name === st.name ? name : name + '…', cx, y);
    y += px(14) + Math.round(sumSize * 1.1); c.font = `400 ${sumSize}px ${sans}`; c.fillStyle = 'rgba(255,255,255,.84)';
    for (const ln of rows) { c.fillText(ln, cx, y); y += lineH; }
    c.restore();
  }
  // The time line at the foot, as on the page (asked for, Nov 2026): the entries by name on a strip that slides
  // under a marker standing still at the left, a year written where it changes, one with no place in italics.
  let strip = null;
  function shelf(t, now) {
    const fs = px(lay.wide ? 20 : 24), ys = px(lay.wide ? 15 : 18), gap = px(36), x0 = lay.m, x1 = W - lay.m, yn = H - px(lay.wide ? 54 : 96);
    const font = (it) => `${it ? 'italic ' : ''}500 ${fs}px ${sans}`;
    if (!strip) {
      let x = 0, said = '';
      strip = steps.map((s) => {
        c.font = font(!s.place && globe);
        const nm = s.name.length > 36 ? s.name.slice(0, 34) + '…' : s.name, w = px(18) + c.measureText(nm).width;
        const o = { x, nm, w, yr: s.mark && s.mark !== said ? s.mark : '', it: !s.place && globe }; if (o.yr) said = s.mark;
        x += w + gap; return o;
      });
    }
    // As on the page: the marker stands just before the entry in front, its dot first, what has passed at its
    // left, and what is still to come is not drawn until its turn (asked for, Nov 2026).
    const pos = posAt(scenes, t), k = Math.min(strip.length - 1, Math.max(0, Math.floor(pos))), nx = strip[k + 1];
    const at = pos < 0 ? strip[0].x + px(40) * pos : nx ? strip[k].x + (nx.x - strip[k].x) * (pos - k) : strip[k].x;
    const xm = x1 - px(lay.wide ? 380 : 300), off = xm + px(14) - at, acc = steps[now].rgb || '#e8b04a';
    c.save(); c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    strip.forEach((o, n) => {
      const x = o.x + off; if (n > now || x + o.w < 0 || x > W) return;
      // What has passed goes out at the left edge.
      const edge = Math.min(1, Math.max(0, (x + o.w * 0.5) / (x0 + px(120))));
      const st = n === now ? 1 : 0.4;
      c.globalAlpha = edge * st; c.font = font(o.it);
      c.fillStyle = n === now ? (steps[n].rgb || '#e8b04a') : '#aab1c0'; c.beginPath(); c.arc(x + px(5), yn - fs * 0.32, px(n === now ? 5 : 3.5), 0, 6.3); c.fill();
      c.fillStyle = n === now ? '#f4efe6' : '#c9ced9'; c.fillText(o.nm, x + px(18), yn);
      if (o.yr) { c.font = `400 ${ys}px ${sans}`; c.fillStyle = n === now ? '#ece7dc' : '#8f97a8'; c.fillText(o.yr, x + px(18), yn + ys + px(10)); }
    });
    c.globalAlpha = 1; c.shadowColor = acc; c.shadowBlur = px(10); c.fillStyle = acc; c.fillRect(xm - 1, yn - fs, 2, Math.round(fs * 1.3));
    c.restore();
    return yn - fs;
  }
  return function draw(t, map) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#06080f'); g.addColorStop(1, '#0c1120');
    c.globalAlpha = 1; c.fillStyle = g; c.fillRect(0, 0, W, H);
    const glow = c.createRadialGradient(W * 0.2, H * 0.1, 0, W * 0.2, H * 0.1, Math.max(W, H) * 0.7); glow.addColorStop(0, 'rgba(232,176,74,.07)'); glow.addColorStop(1, 'rgba(232,176,74,0)');
    c.fillStyle = glow; c.fillRect(0, 0, W, H);
    for (const s of stars) {
      const x = (((s.x - t * 0.006 * s.z) % 1) + 1) % 1;
      c.globalAlpha = 0.25 + 0.6 * s.z; c.fillStyle = '#fff'; c.beginPath(); c.arc(x * W, s.y * H, s.r * s.z * u, 0, 6.3); c.fill();
    }
    c.globalAlpha = 1;
    // The map, under everything else: out of sight for an entry with no place, dimmer for one among placed ones.
    const shown = map && map.canvas ? 1 - map.sp : 0;
    if (shown > 0.004) {
      c.globalAlpha = shown; c.drawImage(map.canvas, 0, 0, W, H);
      if (map.dim > 0.01) { c.globalAlpha = shown * 0.5 * map.dim; c.fillStyle = '#05070c'; c.fillRect(0, 0, W, H); }
      // A soft shade at the top and the foot, so the words read over any land.
      c.globalAlpha = shown;
      const top = c.createLinearGradient(0, 0, 0, px(240)); top.addColorStop(0, 'rgba(5,7,12,.8)'); top.addColorStop(1, 'rgba(5,7,12,0)'); c.fillStyle = top; c.fillRect(0, 0, W, px(240));
      const low = c.createLinearGradient(0, H - px(200), 0, H); low.addColorStop(0, 'rgba(5,7,12,0)'); low.addColorStop(1, 'rgba(5,7,12,.8)'); c.fillStyle = low; c.fillRect(0, H - px(200), W, px(200));
      c.globalAlpha = 1;
    }
    const { i, into, fade } = sceneAt(scenes, t), st = steps[i], plate = shown > 0.5;
    if (fade > 0 && i > 0) card(steps[i - 1], fade, scenes[i - 1].t1 - scenes[i - 1].t0 + into, plate);
    card(st, 1 - fade, into, plate);
    // At the left, as in play on a wide screen: the picture of the entry in front, on top and lit, then the last
    // few passed, each smaller and dimmer; never one that is still ahead.
    if (lay.wide) {
      const sizes = [[208, 140, 1], [176, 118, 0.6], [156, 104, 0.4], [136, 92, 0.2], [136, 92, 0.2]];
      let y = Math.round(H * 0.24), k = 0;
      for (let n = i; n >= 0 && k < sizes.length; n--) {
        const b = steps[n].bmp; if (!b) continue;
        const [bw, bh, al] = sizes[k++], w = px(bw), h = px(bh), x = px(52), f = Math.min(w / b.width, h / b.height);
        c.globalAlpha = al * (n === i ? 1 - fade : 1); c.fillStyle = 'rgba(7,10,16,.6)'; c.fillRect(x, y, w, h);
        c.drawImage(b, x + (w - b.width * f) / 2, y + (h - b.height * f) / 2, b.width * f, b.height * f);
        c.strokeStyle = n === i ? (steps[n].rgb || '#e8b04a') : 'rgba(200,215,255,.2)'; c.lineWidth = Math.max(1, px(2)); c.strokeRect(x, y, w, h);
        y += h + px(24);
      }
      c.globalAlpha = 1;
    }
    // The heading and the period of the entry in front: side by side on a wide frame, one over the other else.
    c.textBaseline = 'alphabetic'; c.textAlign = 'center';
    let ts = px(44); c.font = `400 ${ts}px ${serif}`;
    while (c.measureText(title).width > W - (lay.wide ? px(620) : 2 * lay.m) && ts > px(26)) { ts -= 2; c.font = `400 ${ts}px ${serif}`; }
    c.fillStyle = 'rgba(244,239,230,.92)'; c.fillText(title, W / 2, lay.wide ? px(86) : px(96));
    if (lay.wide) { c.textAlign = 'right'; c.font = `400 ${px(84)}px ${serif}`; c.fillStyle = 'rgba(244,239,230,.9)'; c.fillText(st.mark || '', W - lay.m, px(130)); }
    else { c.font = `400 ${px(92)}px ${serif}`; c.fillStyle = 'rgba(244,239,230,.9)'; c.fillText(st.mark || '', W / 2, px(200)); }
    const yb = shelf(t, i);
    const sub = subsOf ? subsOf(t) : '';
    if (sub) {
      const fs = px(lay.wide ? 30 : 34); c.textAlign = 'center'; c.font = `500 ${fs}px ${sans}`;
      const rows = wrap((s) => c.measureText(s).width, sub, Math.min(W - 2 * lay.m - px(36), px(1300)), lay.wide ? 2 : 4), lh = Math.round(fs * 1.47);
      rows.forEach((r, k) => {
        const w = c.measureText(r).width + px(36), y = yb - px(30) - (rows.length - 1 - k) * lh;
        c.fillStyle = 'rgba(0,0,0,.66)'; c.fillRect(W / 2 - w / 2, y - Math.round(fs * 1.03), w, Math.round(fs * 1.4));
        c.fillStyle = '#fff'; c.fillText(r, W / 2, y);
      });
    }
  };
}

// The globe of the film: the page's own globe code on a stage out of sight, told where the reader is for each
// frame, so the film shows the camera, the pins and the way between places as play does (asked for, Nov 2026:
// "even in the export, we should see the option to export in full view or as a globe"). `make(host, opts)` is
// lent by the page. Gives null when no entry has a place or the map cannot be had.
async function stageGlobe(make, steps, w, h, lay) {
  // The stage is about 540 across its short side whatever the film's size, so the map's names and pins keep
  // their size in the frame; the map is drawn finer by `ratio` (the map library caps its own canvas).
  const ratio = Math.min(w, h) / 540, sw = Math.round(w / ratio), sh = Math.round(h / ratio);
  if (!make || !steps.some((s) => s.place)) return null;
  const host = document.createElement('div');
  host.className = 'g-pane'; host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position: fixed; left: -20000px; top: 0; width: ${sw}px; height: ${sh}px; pointer-events: none; contain: strict;`;
  document.body.appendChild(host);
  const clock = { t: 0, now: () => clock.t * 1000, raf: () => 1, caf: () => {} };
  const globe = make(host, { clock, ratio, pane: true });
  host.querySelector('.g-map').style.cssText = 'position: absolute; inset: 0;';
  globe.show(steps);
  const until = Date.now() + 20000;
  while (!(globe.film().map && globe.film().lands) && Date.now() < until) await new Promise((r) => setTimeout(r, 120));
  const map = globe.film().map;
  if (!map) { globe.remove(); return null; }
  const idle = (ms) => new Promise((done) => { const to = setTimeout(() => done(false), ms); map.once('idle', () => { clearTimeout(to); done(true); }); map.triggerRepaint(); });
  let late = false;
  const pad = { top: 0, left: 0, right: Math.round(sw * lay.pad.right), bottom: Math.round(sh * lay.pad.bottom) };
  return {
    // One frame: the map is put where the reader is, given a moment for what it still has to fetch (longer
    // when the camera rests, so a place is never shown half drawn), and drawn now.
    async at(t, pos, resting) {
      clock.t = t;
      globe.drive({ auto: true, dt: 1 / FPS, pos, pad });
      // A map that did not finish in its time (a tile that never comes) is not waited for again until it has
      // finished by itself, so one missing tile cannot hold every frame.
      const ready = map.loaded() && map.areTilesLoaded();
      if (ready) late = false;
      else if (!late) late = !(await idle(resting ? 5000 : 900));
      map.redraw();
      const f = globe.film();
      return { canvas: map.getCanvas(), sp: f.sp, dim: f.dim };
    },
    remove() { globe.remove(); },
  };
}

// ---- the whole job. `kind` is 'both', 'video' or 'voice'. `steps` are the entries in the order play meets them
// ({ id, name, kind, when, summary, img, mark, rgb }); `voice` is { voice, lines } or null; `speaker` makes a
// line's sound; `step(what, part)` is told how far it has come (what: 'voice', 'sound', 'pictures', 'video',
// 'saving'; part 0 to 1); `stop()` says the reader gave up. Returns the name of the file saved.
// `shape` is 'wide', 'tall' or 'square' and `short` 1080 or 720; `scene` is 'globe' or 'full'; `makeGlobe` is lent by the page.
export async function exportFilm({ kind, title, steps, voice, speaker, music, fonts, subs = false, shape = 'wide', short = 1080, scene = 'full', makeGlobe = null, step = () => {}, stop = () => false }) {
  const { w: W, h: H } = sizeOf(shape, short);
  if (!steps.length) throw new Error('There is nothing on the timeline to export.');
  const voiced = kind !== 'video' && !!voice && voice.voice !== 'device' && voice.lines.length > 0;
  if (kind === 'voice' && !voiced) throw new Error(voice && voice.voice === 'device' ? 'The voice of This device cannot be saved to a file. Choose another voice first.' : 'This timeline has no voiceover yet.');
  const gone = () => { if (stop()) throw new Error('stopped'); };
  // The voice: every line's sound (made now, or taken from what this browser kept).
  const sounds = new Map(), secs = {}, texts = new Map();
  if (voiced) {
    let n = 0;
    for (const l of voice.lines) {
      gone(); step('voice', n++ / voice.lines.length);
      const s = await speaker.line(l.text, voice.voice).catch(() => null);
      if (s) { sounds.set(l.id, s); secs[l.id] = s.audio.length / s.rate; texts.set(l.id, l.text); }
    }
  }
  const plan = schedule(steps.map((s) => s.id), secs);
  step('sound', 0);
  const sound = await mix({ ...plan, sounds, music: kind === 'voice' ? null : music, voiced });
  gone();
  if (kind === 'voice') {
    step('saving', 1);
    const name = fileOf(title, 'wav');
    save(new Blob([wav([sound.getChannelData(0), sound.getChannelData(1)], RATE)], { type: 'audio/wav' }), name);
    return name;
  }
  if (!canExport()) throw new Error('This browser cannot make a video file. Try Chrome or Edge.');
  const bitrate = bitsFor(W, H);
  const vc = await pick(VIDEO, (codec) => VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate, framerate: FPS }));
  const ac = await pick(AUDIO, (codec) => AudioEncoder.isConfigSupported({ codec, sampleRate: RATE, numberOfChannels: 2, bitrate: 160000 }));
  if (!vc || !ac) throw new Error('This browser cannot make a video file. Try Chrome or Edge.');
  step('pictures', 0);
  let done = 0;
  const drawn = await Promise.all(steps.map(async (s) => { const bmp = await picture(s.img); step('pictures', ++done / steps.length); return { ...s, bmp }; }));
  drawn.forEach((s, n) => { s.n = n; });
  gone();
  if (document.fonts && document.fonts.load) await Promise.all([document.fonts.load(`400 76px ${fonts.serif}`), document.fonts.load(`400 27px ${fonts.sans}`)]).catch(() => {});

  const { Muxer, ArrayBufferTarget } = await import(MUXER);
  const muxer = new Muxer({ target: new ArrayBufferTarget(), fastStart: 'in-memory', video: { codec: vc.name, width: W, height: H, frameRate: FPS }, audio: { codec: ac.name, numberOfChannels: 2, sampleRate: RATE } });
  let failed = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e; } });
  venc.configure({ codec: vc.codec, width: W, height: H, bitrate, framerate: FPS, latencyMode: 'quality', ...(vc.name === 'avc' ? { avc: { format: 'avc' } } : {}) });
  const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failed = e; } });
  aenc.configure({ codec: ac.codec, sampleRate: RATE, numberOfChannels: 2, bitrate: 160000 });

  // The sound goes in first, a second at a time.
  const L = sound.getChannelData(0), R = sound.getChannelData(1);
  for (let o = 0; o < L.length; o += RATE) {
    const n = Math.min(RATE, L.length - o), data = new Float32Array(n * 2);
    data.set(L.subarray(o, o + n), 0); data.set(R.subarray(o, o + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((o / RATE) * 1e6), data });
    aenc.encode(ad); ad.close();
  }
  // Then every frame, as fast as the encoder takes them.
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const subsOf = subs && voiced ? (t) => { const c = plan.cues.find((x) => t >= x.at && t < x.at + x.secs); return c ? texts.get(c.id) || '' : ''; } : null;
  const lay = layout(W, H, true);
  step('map', 0);
  const stage = scene === 'globe' ? await stageGlobe(makeGlobe, steps, W, H, lay).catch(() => null) : null;
  const draw = painter(cv, { title, steps: drawn, scenes: plan.scenes, fonts, subsOf, globe: !!stage });
  const frames = Math.ceil(plan.total * FPS);
  for (let f = 0; f < frames; f++) {
    if (failed) throw failed;
    if (f % 15 === 0) { gone(); step('video', f / frames); await new Promise((r) => setTimeout(r)); }
    while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
    const t = f / FPS;
    let map = null;
    if (stage) { const sc = sceneAt(plan.scenes, t), s = plan.scenes[sc.i]; map = await stage.at(t, posAt(plan.scenes, t), sc.into >= Math.min(MOVE, (s.t1 - s.t0) * 0.45)); }
    draw(t, map);
    const vf = new VideoFrame(cv, { timestamp: Math.round((f / FPS) * 1e6), duration: Math.round(1e6 / FPS) });
    venc.encode(vf, { keyFrame: f % (FPS * 2) === 0 }); vf.close();
  }
  if (stage) stage.remove();
  step('saving', 0.5);
  await Promise.all([venc.flush(), aenc.flush()]);
  if (failed) throw failed;
  venc.close(); aenc.close();
  muxer.finalize();
  for (const s of drawn) if (s.bmp && s.bmp.close) s.bmp.close();
  const name = fileOf(title + (shape === 'wide' ? '' : ' ' + shape), 'mp4');
  save(new Blob([muxer.target.buffer], { type: 'video/mp4' }), name);
  step('saving', 1);
  return name;
}
