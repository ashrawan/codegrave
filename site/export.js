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

export const FPS = 30, W = 1920, H = 1080, RATE = 48000;
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
const VIDEO = [['avc1.640028', 'avc'], ['avc1.4d0028', 'avc'], ['avc1.42e028', 'avc'], ['vp09.00.40.08', 'vp9'], ['av01.0.08M.08', 'av1']];
const AUDIO = [['mp4a.40.2', 'aac'], ['opus', 'opus']];
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
      const src = ctx.createBufferSource(), g = ctx.createGain(), vol = voiced ? 0.1 : 0.45;
      src.buffer = data; src.loop = true;
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(vol, 1.2);
      g.gain.setValueAtTime(vol, Math.max(1.2, total - 1.6)); g.gain.linearRampToValueAtTime(0, total);
      src.connect(g); g.connect(ctx.destination); src.start(0);
    } catch (e) { /* without the music */ }
  }
  return ctx.startRendering();
}

// ---- the picture: one frame at time `t`.
function painter(cv, { title, steps, scenes, fonts, subsOf }) {
  const c = cv.getContext('2d'), serif = fonts.serif, sans = fonts.sans;
  // The stars: fixed places, drawn a little further left as time goes, the near ones quicker.
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = Array.from({ length: 260 }, () => ({ x: rnd(), y: rnd(), z: 0.3 + rnd() * 0.7, r: 0.5 + rnd() * 1.3 }));
  const wraps = new Map();
  function card(st, a, into) {
    if (a <= 0.003) return;
    c.save(); c.globalAlpha = a;
    const rise = (1 - Math.min(1, into / FADE)) * 26, cx = W / 2;
    let y = 150 + rise;
    const boxW = 1060, boxH = st.bmp ? 520 : 0;
    if (st.bmp) {
      // The whole picture, never cropped, coming slowly closer while it is up.
      const k = Math.min(boxW / st.bmp.width, boxH / st.bmp.height) * (1 + 0.035 * Math.min(1, into / 12));
      const w = st.bmp.width * k, h = st.bmp.height * k;
      c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 50; c.shadowOffsetY = 18;
      c.drawImage(st.bmp, cx - w / 2, y + (boxH - h) / 2, w, h);
      c.shadowColor = 'transparent';
      y += boxH + 50;
    } else y += 210;
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.font = `600 21px ${sans}`; c.fillStyle = st.rgb || '#e8b04a';
    const kind = String(st.kind || '').toUpperCase(), when = st.when || '';
    try { c.letterSpacing = '2px'; } catch (e) { /* older canvas */ }
    const kw = c.measureText(kind).width; try { c.letterSpacing = '0px'; } catch (e) { /* older canvas */ }
    c.font = `400 21px ${sans}`; const ww = when ? c.measureText(when).width + 18 : 0;
    c.textAlign = 'left';
    c.font = `600 21px ${sans}`; try { c.letterSpacing = '2px'; } catch (e) { /* older canvas */ } c.fillText(kind, cx - (kw + ww) / 2, y); try { c.letterSpacing = '0px'; } catch (e) { /* older canvas */ }
    c.font = `400 21px ${sans}`; c.fillStyle = 'rgba(255,255,255,.72)'; c.fillText(when, cx - (kw + ww) / 2 + kw + 18, y);
    c.textAlign = 'center';
    y += 78; c.font = `400 76px ${serif}`; c.fillStyle = '#f4efe6';
    let name = st.name; while (c.measureText(name).width > 1500 && name.length > 8) name = name.slice(0, -2); c.fillText(name === st.name ? name : name + '…', cx, y);
    y += 56; c.font = `400 27px ${sans}`; c.fillStyle = 'rgba(255,255,255,.82)';
    if (!wraps.has(st.id)) wraps.set(st.id, wrap((s) => c.measureText(s).width, st.summary, 1080, st.bmp ? 3 : 5));
    for (const ln of wraps.get(st.id)) { c.fillText(ln, cx, y); y += 40; }
    c.restore();
  }
  return function draw(t) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#06080f'); g.addColorStop(1, '#0c1120');
    c.globalAlpha = 1; c.fillStyle = g; c.fillRect(0, 0, W, H);
    const glow = c.createRadialGradient(W * 0.2, H * 0.1, 0, W * 0.2, H * 0.1, W * 0.7); glow.addColorStop(0, 'rgba(232,176,74,.07)'); glow.addColorStop(1, 'rgba(232,176,74,0)');
    c.fillStyle = glow; c.fillRect(0, 0, W, H);
    for (const s of stars) {
      const x = (((s.x - t * 0.006 * s.z) % 1) + 1) % 1;
      c.globalAlpha = 0.25 + 0.6 * s.z; c.fillStyle = '#fff'; c.beginPath(); c.arc(x * W, s.y * H, s.r * s.z, 0, 6.3); c.fill();
    }
    c.globalAlpha = 1;
    const { i, into, fade } = sceneAt(scenes, t), st = steps[i];
    if (fade > 0 && i > 0) card(steps[i - 1], fade, 99);
    card(st, 1 - fade, into);
    // The heading and the period of the entry in front.
    c.textBaseline = 'alphabetic'; c.textAlign = 'center'; c.font = `400 44px ${serif}`; c.fillStyle = 'rgba(244,239,230,.92)'; c.fillText(title, W / 2, 86);
    c.textAlign = 'right'; c.font = `400 84px ${serif}`; c.fillStyle = 'rgba(244,239,230,.9)'; c.fillText(st.mark || '', W - 70, 130);
    // How far along, at the foot.
    const total = scenes[scenes.length - 1].t1, x0 = 70, x1 = W - 70, yb = H - 46;
    c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(x0, yb, x1 - x0, 2);
    c.fillStyle = st.rgb || '#e8b04a'; c.fillRect(x0, yb, (x1 - x0) * Math.min(1, t / total), 2);
    for (const s of scenes) { c.globalAlpha = t >= s.t0 ? 1 : 0.35; c.beginPath(); c.arc(x0 + (x1 - x0) * (s.t0 / total), yb + 1, 4, 0, 6.3); c.fill(); }
    c.globalAlpha = 1;
    const sub = subsOf ? subsOf(t) : '';
    if (sub) {
      c.textAlign = 'center'; c.font = `500 30px ${sans}`;
      const rows = wrap((s) => c.measureText(s).width, sub, 1300, 2);
      rows.forEach((r, k) => {
        const w = c.measureText(r).width + 36, y = H - 92 - (rows.length - 1 - k) * 44;
        c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(W / 2 - w / 2, y - 31, w, 42);
        c.fillStyle = '#fff'; c.fillText(r, W / 2, y);
      });
    }
  };
}

// ---- the whole job. `kind` is 'both', 'video' or 'voice'. `steps` are the entries in the order play meets them
// ({ id, name, kind, when, summary, img, mark, rgb }); `voice` is { voice, lines } or null; `speaker` makes a
// line's sound; `step(what, part)` is told how far it has come (what: 'voice', 'sound', 'pictures', 'video',
// 'saving'; part 0 to 1); `stop()` says the reader gave up. Returns the name of the file saved.
export async function exportFilm({ kind, title, steps, voice, speaker, music, fonts, subs = false, step = () => {}, stop = () => false }) {
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
  const vc = await pick(VIDEO, (codec) => VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: 8e6, framerate: FPS }));
  const ac = await pick(AUDIO, (codec) => AudioEncoder.isConfigSupported({ codec, sampleRate: RATE, numberOfChannels: 2, bitrate: 160000 }));
  if (!vc || !ac) throw new Error('This browser cannot make a video file. Try Chrome or Edge.');
  step('pictures', 0);
  let done = 0;
  const drawn = await Promise.all(steps.map(async (s) => { const bmp = await picture(s.img); step('pictures', ++done / steps.length); return { ...s, bmp }; }));
  gone();
  if (document.fonts && document.fonts.load) await Promise.all([document.fonts.load(`400 76px ${fonts.serif}`), document.fonts.load(`400 27px ${fonts.sans}`)]).catch(() => {});

  const { Muxer, ArrayBufferTarget } = await import(MUXER);
  const muxer = new Muxer({ target: new ArrayBufferTarget(), fastStart: 'in-memory', video: { codec: vc.name, width: W, height: H, frameRate: FPS }, audio: { codec: ac.name, numberOfChannels: 2, sampleRate: RATE } });
  let failed = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e; } });
  venc.configure({ codec: vc.codec, width: W, height: H, bitrate: 8e6, framerate: FPS, latencyMode: 'quality', ...(vc.name === 'avc' ? { avc: { format: 'avc' } } : {}) });
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
  const draw = painter(cv, { title, steps: drawn, scenes: plan.scenes, fonts, subsOf });
  const frames = Math.ceil(plan.total * FPS);
  for (let f = 0; f < frames; f++) {
    if (failed) throw failed;
    if (f % 15 === 0) { gone(); step('video', f / frames); await new Promise((r) => setTimeout(r)); }
    while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
    draw(f / FPS);
    const vf = new VideoFrame(cv, { timestamp: Math.round((f / FPS) * 1e6), duration: Math.round(1e6 / FPS) });
    venc.encode(vf, { keyFrame: f % (FPS * 2) === 0 }); vf.close();
  }
  step('saving', 0.5);
  await Promise.all([venc.flush(), aenc.flush()]);
  if (failed) throw failed;
  venc.close(); aenc.close();
  muxer.finalize();
  for (const s of drawn) if (s.bmp && s.bmp.close) s.bmp.close();
  const name = fileOf(title, 'mp4');
  save(new Blob([muxer.target.buffer], { type: 'video/mp4' }), name);
  step('saving', 1);
  return name;
}
