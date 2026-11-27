// codegrave: the voiceover of a timeline.
// A timeline someone keeps can be told aloud: a short opening, a line for each entry and a closing, written to
// fit its title and its entries (the function `voiceover` writes them; only the words are kept, on the
// timeline's row). The speech is made in the reader's own browser while play goes (asked for, Nov 2026: no
// sound files kept on the server, and a cost that does not grow with the hours people listen): by Kokoro, a
// small free voice model (Apache 2.0) that runs on the device, fetched once from a CDN and kept by the browser,
// or by the device's own voice, which needs no download. A line made once is kept in this browser
// (Cache Storage), so playing again is instant.
//
// The first half is plain functions with tests (tests/voice.test.mjs); createSpeaker() makes the sound and
// createVoice() plays it, a line at a time, as play reaches each card.

// The voices offered: an id, a name and a few words. "kokoro:<id>" is one of Kokoro's (English only); "device"
// is the browser's own. Kokoro's are listed best first by its own grades.
export const VOICES = [
  ['af_heart', 'Heart', 'Warm, American'],
  ['af_bella', 'Bella', 'Bright, American'],
  ['am_michael', 'Michael', 'Calm, American'],
  ['am_fenrir', 'Fenrir', 'Deep, American'],
  ['bf_emma', 'Emma', 'Clear, British'],
  ['bm_george', 'George', 'Steady, British'],
  ['af_nicole', 'Nicole', 'Soft, close to the ear'],
  ['device', 'This device', 'Your device’s own voice: no download, quality varies'],
];
export const DEFAULT_VOICE = 'af_heart';
export const SAMPLE = 'Every timeline has a story. This is how I would tell yours.';
const KOKORO = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KEEP = 'cg-voice-lines';

export const isVoice = (v) => VOICES.some(([id]) => id === v);
export const voiceLabel = (v) => (VOICES.find(([id]) => id === v) || VOICES[0])[1];

// What is kept on the timeline's row: who speaks, how, and each line's words.
export function voiceOf(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.lines)) return null;
  const lines = v.lines.filter((l) => l && typeof l.id === 'string' && typeof l.text === 'string' && l.text.trim()).map((l) => ({ id: l.id, text: l.text }));
  return lines.length ? { at: v.at || 0, voice: isVoice(v.voice) ? v.voice : DEFAULT_VOICE, style: typeof v.style === 'string' ? v.style : '', lines } : null;
}

// A line's name in this browser's store: the voice and a hash of the words.
export function lineKey(voice, text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `https://voice.codegrave.invalid/${voice}/${(h >>> 0).toString(36)}-${text.length}`;
}

// The lines in the order they are made: the one asked for now first, then those after it, then the rest.
export function madeOrder(ids, from) {
  const i = Math.max(0, ids.indexOf(from));
  return [...ids.slice(i), ...ids.slice(0, i)];
}

// ---- making the sound. One worker holds Kokoro and makes one line at a time; a line asked for `now` goes to
// the front. `status(s)` is told how it goes: { loading: 0..1 }, { ready: true } or { failed: message }.
export function createSpeaker(status = () => {}) {
  let worker = null, busy = false, booted = false;
  const queue = [], made = new Map();
  let store = null;
  const opened = () => (store ??= (typeof caches !== 'undefined' ? caches.open(KEEP).catch(() => null) : Promise.resolve(null)));
  function boot() {
    if (worker) return;
    const src = `import { KokoroTTS } from '${KOKORO}';
      let tts = null;
      const files = new Map();
      onmessage = async ({ data: { id, text, voice } }) => {
        try {
          tts ??= await KokoroTTS.from_pretrained('${MODEL}', { dtype: 'q8', device: 'wasm', progress_callback: (p) => {
            if (p.status === 'progress' && p.total) { files.set(p.file, [p.loaded, p.total]); let a = 0, b = 0; for (const [x, y] of files.values()) { a += x; b += y; } postMessage({ loading: a / b }); }
          } });
          postMessage({ ready: true });
          const got = await tts.generate(text, { voice });
          postMessage({ id, audio: got.audio, rate: got.sampling_rate }, [got.audio.buffer]);
        } catch (e) { postMessage({ id, error: String(e && e.message || e) }); }
      };`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if ('loading' in data) return status({ loading: data.loading });
      if (data.ready) { if (!booted) { booted = true; status({ ready: true }); } return; }
      const job = queue.find((j) => j.id === data.id);
      busy = false;
      if (job) {
        queue.splice(queue.indexOf(job), 1);
        if (data.error) { made.delete(job.key); job.no(new Error(data.error)); status({ failed: data.error }); }
        else {
          job.ok({ audio: data.audio, rate: data.rate });
          opened().then((c) => c?.put(job.key, new Response(data.audio, { headers: { 'x-rate': String(data.rate) } }))).catch(() => {});
        }
      }
      next();
    };
    worker.onerror = (e) => { status({ failed: e.message || 'The voice could not be loaded.' }); for (const j of queue.splice(0)) j.no(new Error('no voice')); busy = false; };
  }
  function next() {
    if (busy || !queue.length) return;
    busy = true;
    const j = queue[0];
    worker.postMessage({ id: j.id, text: j.text, voice: j.voice });
  }
  let n = 0;
  // The sound of one line, as { audio: Float32Array, rate }. Asked for again, it is the same promise.
  function line(text, voice, now = false) {
    const key = lineKey(voice, text);
    if (made.has(key)) {
      if (now) { const j = queue.find((x) => x.key === key); if (j && queue.indexOf(j) > (busy ? 1 : 0)) { queue.splice(queue.indexOf(j), 1); queue.splice(busy ? 1 : 0, 0, j); } }
      return made.get(key);
    }
    const p = opened().then((c) => c?.match(key)).then(async (r) => {
      if (r) return { audio: new Float32Array(await r.arrayBuffer()), rate: Number(r.headers.get('x-rate')) || 24000 };
      boot();
      return new Promise((ok, no) => {
        const j = { id: ++n, key, text, voice, ok, no };
        if (now) queue.splice(busy ? 1 : 0, 0, j); else queue.push(j);
        next();
      });
    }).catch((e) => { made.delete(key); throw e; });
    made.set(key, p);
    return p;
  }
  return { line, ready: () => booted };
}

// ---- playing it. `ctx()` gives the page's audio context once the reader has pressed play (null: no sound);
// `said(text, waiting)` is told the line being spoken ('' when none), or that the voice is being got ready.
export function createVoice({ ctx, said, speaker }) {
  const S = { sig: '', lines: new Map(), order: [], voice: DEFAULT_VOICE, cur: null, src: null, gain: null, t0: 0, off: 0, held: false, utter: null };
  const device = () => S.voice === 'device';
  function quit() {
    const s = S.src; S.src = null;
    if (s) { s.onended = null; try { s.stop(); } catch (e) { /* not started */ } }
    if (S.utter) { S.utter.onend = S.utter.onerror = null; S.utter = null; try { speechSynthesis.cancel(); } catch (e) { /* none */ } }
  }
  function end(cur) { if (S.cur === cur) { cur.done = true; S.src = null; S.utter = null; said(''); } }
  function begin(cur, buf, from) {
    const c = ctx();
    if (!c || S.cur !== cur || cur.done) return;
    if (!S.gain) { S.gain = c.createGain(); S.gain.connect(c.destination); }
    const src = c.createBufferSource();
    src.buffer = buf; src.connect(S.gain);
    src.onended = () => { if (S.src === src) end(cur); };
    S.src = src; S.t0 = c.currentTime - from; S.off = from;
    src.start(0, Math.min(from, Math.max(0, buf.duration - 0.01)));
    said(cur.text);
  }
  function speakDevice(cur) {
    if (typeof speechSynthesis === 'undefined') return end(cur);
    const u = new SpeechSynthesisUtterance(cur.text);
    const en = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    u.voice = en.find((v) => /natural|neural|premium|enhanced/i.test(v.name)) || en.find((v) => v.default) || en[0] || null;
    u.rate = 0.98;
    u.onend = u.onerror = () => { if (S.utter === u) end(cur); };
    S.utter = u;
    speechSynthesis.speak(u);
    said(cur.text);
  }
  return {
    // The voiceover of the timeline on show (null: none).
    set(v) {
      const sig = v ? v.at + v.voice + v.lines.length : '';
      if (sig === S.sig) return;
      this.stop();
      S.sig = sig; S.voice = v ? v.voice : DEFAULT_VOICE;
      S.lines = new Map(v ? v.lines.map((l) => [l.id, l]) : []); S.order = v ? v.lines.map((l) => l.id) : [];
    },
    any: () => S.lines.size > 0,
    has: (id) => S.lines.has(id),
    // Have every line made, from `from` on, while play goes; a line already made is only looked up.
    prepare(from) {
      if (device() || !S.order.length || !ctx()) return;
      for (const id of madeOrder(S.order, from ?? S.order[0])) speaker.line(S.lines.get(id).text, S.voice).catch(() => {});
    },
    // Start the line of this entry; whatever was being said stops.
    cue(id) {
      this.stop();
      const l = S.lines.get(id), c = ctx();
      if (!l || !c) return false;
      const cur = S.cur = { id, text: l.text, done: false, buf: null };
      S.held = false;
      if (device()) { speakDevice(cur); return true; }
      if (!speaker.ready()) said('', true);
      // A line that cannot be made is passed over, so play never waits for nothing.
      speaker.line(l.text, S.voice, true).then(({ audio, rate }) => {
        if (S.cur !== cur || cur.done) return;
        const buf = c.createBuffer(1, audio.length, rate);
        buf.copyToChannel(audio, 0);
        cur.buf = buf;
        if (!S.held) begin(cur, buf, 0);
      }, () => end(cur));
      if (!cur.buf) said('', true);
      return true;
    },
    // A line is being said, or is being made.
    busy: () => !!S.cur && !S.cur.done,
    now: () => (S.cur && !S.cur.done ? S.cur.id : null),
    pause() {
      if (!S.cur || S.cur.done || S.held) return;
      S.held = true;
      if (S.utter) { try { speechSynthesis.pause(); } catch (e) { /* none */ } return; }
      if (S.src) { S.off = ctx().currentTime - S.t0; const s = S.src; S.src = null; s.onended = null; try { s.stop(); } catch (e) { /* not started */ } }
    },
    resume() {
      if (!S.cur || S.cur.done || !S.held) return;
      S.held = false;
      if (S.utter) { try { speechSynthesis.resume(); } catch (e) { /* none */ } return; }
      if (S.cur.buf) begin(S.cur, S.cur.buf, S.off);
    },
    stop() { quit(); if (S.cur) S.cur.done = true; S.cur = null; S.held = false; S.off = 0; said(''); },
  };
}

// A few words in one voice, to choose by ear: `done()` is called when they end. Returns a way to stop them.
export function listen(speaker, voice, ctx, done, fail) {
  let stopped = false, src = null, u = null;
  const stop = () => { stopped = true; if (src) { src.onended = null; try { src.stop(); } catch (e) { /* none */ } } if (u) { u.onend = null; try { speechSynthesis.cancel(); } catch (e) { /* none */ } } };
  if (voice === 'device') {
    if (typeof speechSynthesis === 'undefined') { fail(new Error('This browser has no voice of its own.')); return stop; }
    u = new SpeechSynthesisUtterance(SAMPLE);
    const en = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    u.voice = en.find((v) => /natural|neural|premium|enhanced/i.test(v.name)) || en.find((v) => v.default) || en[0] || null;
    u.onend = () => { if (!stopped) done(); };
    speechSynthesis.speak(u);
    return stop;
  }
  speaker.line(SAMPLE, voice, true).then(({ audio, rate }) => {
    const c = ctx();
    if (stopped || !c) return;
    const buf = c.createBuffer(1, audio.length, rate);
    buf.copyToChannel(audio, 0);
    src = c.createBufferSource(); src.buffer = buf; src.connect(c.destination);
    src.onended = () => { if (!stopped) done(); };
    src.start();
  }, (e) => { if (!stopped) fail(e); });
  return stop;
}
