// codegrave: the voiceover of a timeline.
// A timeline someone keeps can be told aloud: a short opening, a line for each entry and a closing, written to
// fit its title and its entries and spoken by Gemini's text to speech (the function `voiceover` asks for both).
// The speech comes back a few lines at a time, as one piece of sound; this file cuts it at the pauses into one
// clip a line, so play can start each line when its card comes up and wait for it to end. The clips are kept
// as small MP3 files in the account's own folder, and the words stay on the timeline's row (`voice`), where the
// subtitles read them.
//
// The first half is arithmetic with tests (tests/voice.test.mjs); createVoice() at the end plays the clips.

// The voices offered, of Gemini's thirty: its name, and Google's one word for it.
export const VOICES = [['Charon', 'Informative'], ['Sulafat', 'Warm'], ['Algieba', 'Smooth'], ['Kore', 'Firm'], ['Achird', 'Friendly'], ['Gacrux', 'Mature']];
// Where the few words kept to choose a voice by ear are, in the clips' bucket (the function makes them once).
export const sampleOf = (v) => 'samples/' + (v.includes(':') ? v.replace(':', '-') : 'gemini-' + v).toLowerCase() + '.wav';
export const PART_LINES = 10;     // lines spoken in one request: as many as keeps every pause between them found, since a voice allows few requests
export const PART_CHARS = 1300;
export const LINE_CHARS = 320;    // the longest line that is spoken
const PAD = 0.07;                 // seconds of quiet kept before and after a line

// The lines in the order they are told, shared out into the requests that speak them.
export function parts(lines, max = PART_LINES, chars = PART_CHARS) {
  const out = [];
  let cur = [], n = 0;
  for (const l of lines) {
    if (cur.length && (cur.length >= max || n + l.text.length > chars)) { out.push(cur); cur = []; n = 0; }
    cur.push(l); n += l.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

// The sound as numbers: a WAV file (its "data" chunk is looked for, whatever stands before it) or bare 16-bit
// samples, little-endian, one channel. Gemini sends 24,000 a second.
export function pcmOf(bytes, rate = 24000) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), tag = (i) => String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
  let a = 0, b = bytes.length;
  if (b > 44 && tag(0) === 'RIFF' && tag(8) === 'WAVE') {
    let i = 12;
    while (i + 8 <= bytes.length) {
      const id = tag(i), size = dv.getUint32(i + 4, true);
      if (id === 'fmt ') rate = dv.getUint32(i + 12, true) || rate;
      // A stream's header may give no true size: then the sound runs to the end.
      if (id === 'data') { a = i + 8; b = size && a + size <= bytes.length ? a + size : bytes.length; break; }
      i += 8 + size + (size % 2);
    }
  }
  const n = (b - a) >> 1, pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = dv.getInt16(a + 2 * i, true);
  return { pcm, rate };
}

// The quiet stretches of a piece of speech, as [from, to] in samples: where it is still for `least` seconds.
export function pauses(pcm, rate, least = 0.16) {
  const w = Math.max(1, Math.round(rate * 0.01)), n = Math.floor(pcm.length / w), loud = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * w, e = j + w; j < e; j++) s += pcm[j] * pcm[j];
    loud[i] = Math.sqrt(s / w);
  }
  const sorted = Float32Array.from(loud).sort(), top = sorted[Math.floor(n * 0.95)] || 0, floor = Math.max(90, top * 0.045);
  const out = [];
  let from = -1;
  for (let i = 0; i <= n; i++) {
    const still = i < n && loud[i] < floor;
    if (still && from < 0) from = i;
    if (!still && from >= 0) { if ((i - from) * w >= least * rate || from === 0 || i === n) out.push([from * w, i === n ? pcm.length : i * w]); from = -1; }
  }
  return out;
}

// Where each of `weights.length` lines begins and ends in a piece of speech that says them one after another
// with a pause between: [[from, to], ...] in samples. A line is expected to take its share of the speaking
// time (by its length in letters), and each boundary is put in a pause: the one that is near where it is
// expected and long, since the pause asked for between lines is longer than a breath inside one. With too few
// pauses to go round, the lines are cut by their share alone.
export function cuts(pcm, rate, weights) {
  const n = weights.length, gaps = pauses(pcm, rate), pad = Math.round(PAD * rate);
  const head = gaps.length && gaps[0][0] === 0 ? gaps[0][1] : 0;
  const tail = gaps.length && gaps[gaps.length - 1][1] === pcm.length ? gaps[gaps.length - 1][0] : pcm.length;
  const inner = gaps.filter((g) => g[0] > head && g[1] < tail);
  const open = (a, b) => [Math.max(0, a - pad), Math.min(pcm.length, b + pad)];
  if (n <= 1) return [open(head, tail)];
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  // How much has been spoken by each pause, the pauses themselves left out.
  let still = 0;
  const said = inner.map((g) => { const v = g[0] - head - still; still += g[1] - g[0]; return v; });
  const spoken = Math.max(1, tail - head - still), each = spoken / n;
  let acc = 0;
  const want = weights.slice(0, -1).map((w) => { acc += w; return (acc / total) * spoken; });
  if (inner.length < n - 1) {
    // Too few pauses: by share of the whole, each cut moved to the nearest pause when one is close.
    const at = want.map((v) => {
      const p = head + (v / spoken) * (tail - head);
      const g = inner.find((x) => Math.abs((x[0] + x[1]) / 2 - p) < 0.25 * each);
      return g ? [g[0], g[1]] : [p, p];
    });
    return weights.map((_, k) => open(k ? Math.round(at[k - 1][1]) : head, k < n - 1 ? Math.round(at[k][0]) : tail));
  }
  // Pick n - 1 pauses in order: the least sum of how far each is from where it is expected, less its length.
  const m = inner.length, cost = (k, j) => { const d = (said[j] - want[k]) / each; return d * d - 1.2 * (inner[j][1] - inner[j][0]) / rate; };
  let best = inner.map((_, j) => ({ c: cost(0, j), path: [j] }));
  for (let k = 1; k < n - 1; k++) {
    const next = new Array(m).fill(null);
    let low = null;
    for (let j = k; j < m; j++) {
      if (best[j - 1] && (!low || best[j - 1].c < low.c)) low = best[j - 1];
      if (low) next[j] = { c: low.c + cost(k, j), path: [...low.path, j] };
    }
    best = next;
  }
  const pick = best.filter(Boolean).reduce((a, b) => (b.c < a.c ? b : a)).path.map((j) => inner[j]);
  return weights.map((_, k) => open(k ? pick[k - 1][1] : head, k < n - 1 ? pick[k][0] : tail));
}

// What is kept on the timeline's row: who speaks, how, and each line with its clip and length.
export function voiceOf(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.lines) || typeof v.base !== 'string') return null;
  const lines = v.lines.filter((l) => l && typeof l.id === 'string' && typeof l.text === 'string' && typeof l.src === 'string' && l.secs > 0);
  return lines.length ? { at: v.at || 0, voice: v.voice || '', base: v.base, lines } : null;
}

// ---- playing it. `ctx()` gives the page's audio context once the reader has pressed play; `said(text)` is
// told the line being spoken ('' when none), for the subtitles.
export function createVoice({ ctx, said }) {
  const S = { sig: '', lines: new Map(), order: [], base: '', bufs: new Map(), cur: null, src: null, gain: null, t0: 0, off: 0, held: false };
  const url = (l) => S.base + l.src;
  // One clip, fetched and read once; a few are kept.
  function load(id) {
    const l = S.lines.get(id), c = ctx();
    if (!l || !c) return Promise.reject(new Error('no clip'));
    if (!S.bufs.has(id)) {
      S.bufs.set(id, fetch(url(l)).then((r) => { if (!r.ok) throw new Error('clip ' + r.status); return r.arrayBuffer(); }).then((b) => c.decodeAudioData(b)));
      S.bufs.get(id).catch(() => {});
      for (const k of S.bufs.keys()) { if (S.bufs.size <= 6) break; if (k !== id && k !== S.cur?.id) S.bufs.delete(k); }
    }
    return S.bufs.get(id);
  }
  function quit() { const s = S.src; S.src = null; if (s) { s.onended = null; try { s.stop(); } catch (e) { /* not started */ } } }
  function begin(cur, buf, from) {
    const c = ctx();
    if (!c || S.cur !== cur || cur.done) return;
    if (!S.gain) { S.gain = c.createGain(); S.gain.connect(c.destination); }
    const src = c.createBufferSource();
    src.buffer = buf; src.connect(S.gain);
    src.onended = () => { if (S.src === src) { S.src = null; cur.done = true; said(''); } };
    S.src = src; S.t0 = c.currentTime - from; S.off = from;
    src.start(0, Math.min(from, Math.max(0, buf.duration - 0.01)));
    said(cur.text);
  }
  return {
    // The voiceover of the timeline on show (null: none), and where its clips are.
    set(v, base) {
      const sig = v ? base + v.at + v.lines.length : '';
      if (sig === S.sig) return;
      this.stop();
      S.sig = sig; S.base = v ? base + v.base : ''; S.bufs.clear();
      S.lines = new Map(v ? v.lines.map((l) => [l.id, l]) : []); S.order = v ? v.lines.map((l) => l.id) : [];
    },
    any: () => S.lines.size > 0,
    has: (id) => S.lines.has(id),
    secs: (id) => S.lines.get(id)?.secs || 0,
    // Start the line of this entry; whatever was being said stops. `next` is fetched ahead.
    cue(id, next) {
      this.stop();
      const l = S.lines.get(id), c = ctx();
      if (!l || !c) return false;
      const cur = S.cur = { id, text: l.text, done: false, buf: null };
      S.held = false;
      // A clip that cannot be had is passed over, so play never waits for nothing.
      load(id).then((buf) => { cur.buf = buf; if (!S.held) begin(cur, buf, 0); }, () => { if (S.cur === cur) { cur.done = true; said(''); } });
      if (next != null && S.lines.has(next)) load(next).catch(() => {});
      return true;
    },
    // A line is being said, or is on its way.
    busy: () => !!S.cur && !S.cur.done,
    // The seconds of the line still to be said (its whole length while its clip is on the way).
    left() {
      const cur = S.cur;
      if (!cur || cur.done) return 0;
      const all = cur.buf ? cur.buf.duration : S.lines.get(cur.id)?.secs || 0;
      return Math.max(0.01, all - (S.src ? ctx().currentTime - S.t0 : S.off));
    },
    now: () => (S.cur && !S.cur.done ? S.cur.id : null),
    pause() {
      if (!S.cur || S.cur.done || S.held) return;
      S.held = true;
      if (S.src) { S.off = ctx().currentTime - S.t0; quit(); }
    },
    resume() {
      if (!S.cur || S.cur.done || !S.held) return;
      S.held = false;
      if (S.cur.buf) begin(S.cur, S.cur.buf, S.off);
    },
    stop() { quit(); if (S.cur) S.cur.done = true; S.cur = null; S.held = false; S.off = 0; said(''); },
  };
}
