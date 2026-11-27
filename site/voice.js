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

// The voices offered: an id, a name and a few words, all Kokoro's (English only; the two he liked, Nov 2026, from
// its best seven), and the browser's own. Where Kokoro cannot run, the device's own voice says the line instead.
export const VOICES = [
  ['af_heart', 'Heart', 'Warm, American'],
  ['am_michael', 'Michael', 'Calm, American'],
  // More of Kokoro's best, after the two picked first (asked for, Nov 2026: "we can give others after that").
  ['af_bella', 'Bella', 'Bright, American'],
  ['af_nicole', 'Nicole', 'Soft, close to the ear'],
  ['bf_emma', 'Emma', 'Clear, British'],
  ['bm_george', 'George', 'Steady, British'],
  // The browser's own voice: nothing to download and instant, if plainer (asked for, Nov 2026, as a third choice).
  ['device', 'This device', 'Your browser’s own voice, no download'],
];
// The model all of Kokoro's voices share, downloaded once (each voice adds about half a megabyte).
export const MODEL_MB = 92;
export const DEFAULT_VOICE = 'af_heart';
export const SAMPLE = 'Every timeline has a story. This is how I would tell yours.';
const KOKORO = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KEEP = 'cg-voice-lines';
// This device's speed (seconds to make a second of speech). Above SLOW, play pauses at cards while lines are
// made, and the page says so (asked for, Nov 2026: "just show a warning").
const SPEED = 'cg-voice-speed';
export const SLOW = 1.2;
export function speedOf(gpu = gpuOn()) { try { const v = Number(localStorage.getItem(SPEED + (gpu ? '-gpu' : ''))); return v > 0 ? v : null; } catch (e) { return null; } }
// The faster voice (asked for, Nov 2026: "for the users who have a good PC, like good internet"): the same model
// at full precision on the graphics card (WebGPU), a 326 MB download instead of 92 MB. It is offered only where
// the browser has a real graphics adapter (`gpuOk()`), off by default, and the reader turns it on
// (`cg-voice-gpu`). If it fails to load, the voice goes back to the processor by itself.
export const GPU_MB = 326;
const GPU = 'cg-voice-gpu';
export function gpuOn() { try { return localStorage.getItem(GPU) === '1'; } catch (e) { return false; } }
let gpuAsk = null;
export function gpuOk() {
  return (gpuAsk ??= (async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.gpu) return false;
      const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      return !!a && !(a.isFallbackAdapter || a.info?.isFallbackAdapter);
    } catch (e) { return false; }
  })());
}
export const isSlow = (r = speedOf()) => r != null && r > SLOW;

export const isVoice = (v) => VOICES.some(([id]) => id === v);
export const voiceLabel = (v) => (VOICES.find(([id]) => id === v) || VOICES[0])[1];

// What is kept on the timeline's row: who speaks, how, and each line's words.
export function voiceOf(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.lines)) return null;
  const lines = v.lines.filter((l) => l && typeof l.id === 'string' && typeof l.text === 'string' && l.text.trim()).map((l) => ({ id: l.id, text: l.text }));
  return lines.length ? { at: v.at || 0, voice: isVoice(v.voice) ? v.voice : DEFAULT_VOICE, style: typeof v.style === 'string' ? v.style : '', ...(typeof v.guide === 'string' && v.guide ? { guide: v.guide.slice(0, 400) } : {}), lines } : null;
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

// Speech made quicker or slower without changing its pitch (Play speed, asked for, Nov 2026): the sound is cut
// into short overlapping pieces that are laid down closer together or further apart, each taken from where it
// joins the one before best (WSOLA). `rate` 1.5 is half as long again as fast.
export const voiceRate = (speed) => Math.min(1.6, Math.max(0.7, Number(speed) || 1));
export function stretch(x, rate, sr = 24000) {
  if (!(rate > 0) || Math.abs(rate - 1) < 0.02 || x.length < sr * 0.1) return x;
  const win = Math.round(sr * 0.04) & ~1, hop = win >> 1, seek = Math.round(sr * 0.008), n = Math.floor(x.length / rate);
  const out = new Float32Array(n + win), w = new Float32Array(win);
  for (let i = 0; i < win; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / win);
  let prev = 0;
  for (let k = 0; k * hop < n; k++) {
    let at = Math.round(k * hop * rate);
    if (k) {
      // The piece that would follow the last one naturally starts at prev + hop: find the one most like it.
      const want = prev + hop;
      let best = -Infinity, pick = at;
      for (let d = -seek; d <= seek; d += 2) {
        const c = at + d;
        if (c < 0 || c + hop >= x.length || want + hop >= x.length) continue;
        let sum = 0;
        for (let i = 0; i < hop; i += 2) sum += x[c + i] * x[want + i];
        if (sum > best) { best = sum; pick = c; }
      }
      at = pick;
    }
    prev = at;
    const o = k * hop;
    for (let i = 0; i < win && at + i < x.length; i++) out[o + i] += x[at + i] * w[i];
  }
  return out.subarray(0, n);
}

// ---- making the sound. One worker holds Kokoro and makes one line at a time; a line asked for `now` goes to
// the front. `status(s)` is told how it goes: { loading: 0..1 }, { ready: true } or { failed: message }.
export function createSpeaker(status = () => {}) {
  let worker = null, busy = false, booted = false, gpu = gpuOn();
  const queue = [], made = new Map();
  let store = null;
  const opened = () => (store ??= (typeof caches !== 'undefined' ? caches.open(KEEP).catch(() => null) : Promise.resolve(null)));
  function boot() {
    if (worker) return;
    const src = `import { KokoroTTS } from '${KOKORO}';
      let loading = null;
      const files = new Map();
      onmessage = async ({ data: { id, text, voice } }) => {
        try {
          // One load, whoever asks first; the others wait for it.
          // The graphics card is asked first, so a device without one does not download the large model.
          ${gpu ? "if (!loading && !(await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' }))) throw new Error('No graphics adapter');" : ''}
          loading ??= KokoroTTS.from_pretrained('${MODEL}', { dtype: '${gpu ? 'fp32' : 'q8'}', device: '${gpu ? 'webgpu' : 'wasm'}', progress_callback: (p) => {
            if (p.status === 'progress' && p.total) { files.set(p.file, [p.loaded, p.total]); let a = 0, b = 0; for (const [x, y] of files.values()) { a += x; b += y; } postMessage({ loading: a / b, bytes: b }); }
          } });
          const tts = await loading;
          postMessage({ ready: true });
          if (text == null) return;
          const t0 = performance.now(), got = await tts.generate(text, { voice });
          postMessage({ id, audio: got.audio, rate: got.sampling_rate, ms: performance.now() - t0 }, [got.audio.buffer]);
        } catch (e) { if (id === 0) loading = null; postMessage({ id, error: String(e && e.message || e) }); }
      };`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if ('loading' in data) return status({ loading: data.loading, bytes: data.bytes });
      if (data.ready) { if (!booted) { booted = true; status({ ready: true }); } return; }
      if (data.error && gpu && !booted) return engine(false, true);
      if (data.id === 0) { if (data.error) { warmed = false; status({ failed: data.error }); } return; }
      const job = queue.find((j) => j.id === data.id);
      busy = false;
      if (job) {
        queue.splice(queue.indexOf(job), 1);
        if (data.error) { made.delete(job.key); job.no(new Error(data.error)); status({ failed: data.error }); }
        else {
          job.ok({ audio: data.audio, rate: data.rate });
          status({ made: true });
          timed(data.ms / 1000, data.audio.length / data.rate);
          opened().then((c) => c?.put(job.key, new Response(data.audio, { headers: { 'x-rate': String(data.rate) } }))).catch(() => {});
        }
      }
      next();
    };
    worker.onerror = (e) => { if (gpu && !booted) return engine(false, true); status({ failed: e.message || 'The voice could not be loaded.' }); for (const j of queue.splice(0)) j.no(new Error('no voice')); busy = false; };
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
  // How fast this device makes speech: seconds to make one second of it, kept in this browser so the voice
  // dialog can warn before the next time. The first line is left out: it is slow while the engine warms up.
  let lines = 0;
  function timed(took, secs) {
    if (++lines < 2 || secs < 1) return;
    const r = took / secs, was = speedOf(gpu);
    const now = was ? was * 0.6 + r * 0.4 : r;
    try { localStorage.setItem(SPEED + (gpu ? '-gpu' : ''), now.toFixed(2)); } catch (e) {}
    status({ speed: now });
  }
  // Have the model ready before anything is said: when a timeline with a voiceover is opened.
  let warmed = false;
  function warm() { if (warmed || booted) return; warmed = true; boot(); worker.postMessage({ id: 0 }); }
  // Change between the processor and the graphics card: the worker starts again on the other model; lines
  // waiting to be made are made by it. `failed` is set when the graphics card could not load it.
  function engine(on, failed = false) {
    on = !!on;
    try { localStorage.setItem(GPU, on ? '1' : '0'); } catch (e) {}
    if (on === gpu && !failed) return;
    gpu = on;
    const was = warmed || booted;
    if (worker) worker.terminate();
    worker = null; busy = false; booted = false; warmed = false; lines = 0;
    status({ engine: gpu ? 'gpu' : 'cpu', failed: failed ? 'The graphics card could not run the voice, so it uses the processor.' : undefined, speed: speedOf(gpu) });
    if (queue.length) { boot(); next(); } else if (was) warm();
  }
  // How many of these lines this browser already has in this voice (made here before).
  async function kept(texts, voice) {
    const c = await opened();
    if (!c) return 0;
    let n = 0;
    for (const t of texts) if (await c.match(lineKey(voice, t)).catch(() => null)) n++;
    return n;
  }
  return { line, warm, engine, kept, gpu: () => gpu, ready: () => booted };
}

// ---- playing it. `ctx()` gives the page's audio context once the reader has pressed play (null: no sound);
// `said(text, waiting)` is told the line being spoken ('' when none), or that the voice is being got ready.
export function createVoice({ ctx, said, speaker }) {
  const S = { sig: '', lines: new Map(), order: [], voice: DEFAULT_VOICE, cur: null, src: null, gain: null, t0: 0, off: 0, held: false, utter: null, rate: 1 };
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
    u.rate = 0.98 * S.rate;
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
        const a = stretch(audio, S.rate, rate), buf = c.createBuffer(1, a.length, rate);
        buf.copyToChannel(a, 0);
        cur.buf = buf;
        if (!S.held) begin(cur, buf, 0);
      }, () => { if (S.cur === cur && !cur.done) speakDevice(cur); });
      if (!cur.buf) said('', true);
      return true;
    },
    // A line is being said, or is being made.
    busy: () => !!S.cur && !S.cur.done,
    device,
    // Play speed: lines begun from now on are said this much quicker (1 is as made), at the same pitch.
    rate(r) { S.rate = voiceRate(r); },
    name: () => S.voice,
    texts: () => [...S.lines.values()].map((l) => l.text),
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
// `text` is what it says: the opening of the timeline's own script where there is one (asked for, Nov 2026: "the
// script is already there. It can just speak that"), else the sample line.
export function listen(speaker, voice, ctx, done, fail, text = SAMPLE) {
  // Given several lines it says them one after another until stopped, so a script can be heard through in a
  // voice (asked for, Nov 2026: "it should continue playing"). The line after the one being said is made meanwhile.
  const lines = Array.isArray(text) ? text.filter(Boolean) : [text];
  let stopped = false, src = null, u = null;
  const stop = () => { stopped = true; if (src) { src.onended = null; try { src.stop(); } catch (e) { /* none */ } } if (u) { u.onend = null; try { speechSynthesis.cancel(); } catch (e) { /* none */ } } };
  const say = (k) => {
    if (stopped) return;
    if (k >= lines.length) return done();
    if (voice === 'device') {
      if (typeof speechSynthesis === 'undefined') return fail(new Error('This browser has no voice of its own.'));
      u = new SpeechSynthesisUtterance(lines[k]);
      const en = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
      u.voice = en.find((v) => /natural|neural|premium|enhanced/i.test(v.name)) || en.find((v) => v.default) || en[0] || null;
      u.onend = () => { if (!stopped) say(k + 1); };
      speechSynthesis.speak(u);
      return;
    }
    speaker.line(lines[k], voice, true).then(({ audio, rate }) => {
      const c = ctx();
      if (stopped || !c) return;
      const buf = c.createBuffer(1, audio.length, rate);
      buf.copyToChannel(audio, 0);
      src = c.createBufferSource(); src.buffer = buf; src.connect(c.destination);
      src.onended = () => { if (!stopped) setTimeout(() => say(k + 1), 350); };
      src.start();
      if (lines[k + 1]) speaker.line(lines[k + 1], voice, true).catch(() => {});
    }, (e) => { if (!stopped) fail(e); });
  };
  say(0);
  return stop;
}
