/* Film mode: the engine. Fetched only after boot.js has proved the key (docs/FILM_MODE.md).
   It takes the page over: the stage alone, at an exact size, drawn by the site's own globe
   (globe.js), which is told every frame what to show instead of following a clock. So seek(t)
   draws the same picture every time, and a script can take the frames one by one.

   It writes nothing: storage is switched off, nothing sounds, nothing is sent anywhere. */
import { idOfAddress } from '../keys.js';
import { stageFor } from '../globe-path.js';
import { AUTH } from './boot.js';
import { VERSION, EASES, TRACKS, compile, stateAt, toOver, cuesOf, FilmError } from './timeline.js';
import { SHOTS } from './shots/index.js';

const LOOKS = ['atlas', 'day', 'dots'], DETAILS = ['less', 'medium', 'full'];
const DEEP = -5e6;      // older than this an entry has no place on today's map (as on the site)

export function startFilm(kit, auth) {
  const q = new URLSearchParams(location.search);
  const num = (k, d, lo, hi) => { const v = Number(q.get(k)); return q.get(k) != null && Number.isFinite(v) && v >= lo && v <= hi ? v : d; };
  const W = Math.round(num('w', innerWidth, 64, 8192)), H = Math.round(num('h', innerHeight, 64, 8192));
  const opts = { w: W, h: H, dpr: num('dpr', devicePixelRatio || 1, 0.5, 4), fps: num('fps', 30, 1, 240), seed: num('seed', 1, 0, 2 ** 32),
    look: LOOKS.includes(q.get('look')) ? q.get('look') : 'atlas', detail: DETAILS.includes(q.get('detail')) ? q.get('detail') : 'less' };

  // Nothing is written: not this browser's settings. Only the session may be renewed, or a long render would sign its account out.
  try { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'cg-session') set.call(this, k, v); }; Storage.prototype.removeItem = () => {}; Storage.prototype.clear = () => {}; } catch (e) { /* fine */ }
  // Chance is seeded, so what little of the page draws by it draws the same every run.
  let seed = opts.seed >>> 0;
  Math.random = () => { seed = (seed + 0x6d2b79f5) >>> 0; let x = seed; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };

  // ---- the page: the stage alone
  const meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex,nofollow'; document.head.appendChild(meta);
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('./film.css', import.meta.url).href;
  const styled = new Promise((done) => { css.onload = css.onerror = done; }); document.head.appendChild(css);
  document.documentElement.dataset.theme = 'dark';
  document.body.classList.add('cg-film', 'globe');
  const stage = document.createElement('div'); stage.id = 'film-stage'; stage.style.width = W + 'px'; stage.style.height = H + 'px';
  const host = document.getElementById('globe'); host.hidden = false; stage.appendChild(host); document.body.appendChild(stage);
  const dimmer = document.createElement('i'); dimmer.className = 'film-dim';

  // ---- the clock: time is what seek() says, and a frame is drawn when it says
  const clock = { t: 0, now: () => clock.t * 1000, raf: () => 1, caf: () => {} };
  const globe = kit.createGlobe(host, { esc: kit.esc, calm: () => false, open() {}, goTo() {}, seek() {}, credit: null, clock });
  globe.look(opts.look); globe.detail(opts.detail);
  host.querySelector('.g-map').after(dimmer);

  const lost = [];        // what could not be had: missing()
  const miss = (kind, what) => { if (!lost.some((m) => m.kind === kind && m.what === what)) lost.push({ kind, what }); };
  host.addEventListener('error', (e) => { if (e.target && e.target.tagName === 'IMG') miss('picture', e.target.currentSrc || e.target.src); }, true);

  // ---- data
  const tl = { id: null, slug: null, view: null, entries: [], steps: [], spec: null };
  let places = null, film = null, ctx = null, cur = null, mapSeen = null;
  const call = async (body) => {
    const r = await fetch(AUTH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: auth.token, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'film-auth ' + r.status);
    return j;
  };
  const placeOf = (t) => (t.where ? [t.where[0], t.where[1], 'city', ''] : !t.pos && !t.val && t.born > DEEP ? (places && places[t.id]) || null : null);
  async function loadTimeline(slug) {
    await booted;
    const id = idOfAddress(String(slug).replace(/^\/+|\/+$/g, ''));
    let real = null, spec = null;
    // A timeline someone keeps is read with the film token, the account's own private ones too; a built view is a file.
    const kept = /^t\//.test(id) || (id.includes('/') && !id.startsWith('wiki/'));
    if (kept) {
      try { const got = await call({ open: id }); if (got.view) { real = kit.useView({ view: got.view, entries: got.entries }).id; spec = got.spec || null; } } catch (e) { /* a community folder's view is a file too */ }
    }
    if (!real) real = await kit.loadView(id);
    if (!real) throw new Error(`Film: the timeline "${slug}" could not be read`);
    const v = kit.viewById.get(real);
    tl.id = real; tl.slug = id; tl.view = v; tl.spec = spec;
    tl.entries = [...v.members].sort((a, b) => a.born - b.born || a.rank - b.rank || (a.id < b.id ? -1 : 1));
    tl.steps = tl.entries.map((t) => ({ ...kit.stepOf({ t, lane: { col: 0 } }), place: placeOf(t) }));
    globe.show(tl.steps);
    film = null; cur = null;
    await mapReady();
    makeCtx();
    return real;
  }
  // The map is there (when anything has a place), with its countries and the look's own layers.
  async function mapReady() {
    if (!tl.steps.some((s) => s.place)) return;
    const t0 = performance.now();
    for (;;) {
      const f = globe.film();
      if (f.map && f.lands && (opts.look !== 'dots' || f.map.getLayer('dots'))) break;
      if (performance.now() - t0 > 60000) { miss('map', 'the map did not load in 60 seconds'); break; }
      await new Promise((r) => setTimeout(r, 50));
    }
    const map = globe.film().map;
    if (map && map !== mapSeen) { mapSeen = map; map.on('error', (e) => miss('tile', (e && e.error && e.error.message) || 'a map tile failed')); }
  }
  function makeCtx() {
    const f = globe.film(), placed = tl.steps.map((s) => !!s.place);
    ctx = { steps: tl.steps, index: new Map(tl.steps.map((s, i) => [s.id, i])), w: W, h: H, size: Math.min(W, H), far: f.far, fps: opts.fps,
      opening: { lat: f.open ? f.open.at[0] : 20, lng: f.open ? f.open.at[1] : 0, zoom: f.open ? f.open.zoom : f.far },
      view: (i) => { const c = globe.film().cams[i]; return c ? { lat: c.at[0], lng: c.at[1], zoom: c.zoom } : null; },
      stage: (i) => stageFor(placed, i) };
    film = compile([], ctx, SHOTS);
  }

  // ---- pictures: each one a shot list needs is fetched once, ahead of the frames, and kept in memory, so a
  // frame never waits on the network and a picture that cannot be had is left out of every frame alike.
  const kept = new Map();      // a picture's address -> the copy held here ('' when it could not be had)
  const bitmaps = new Map();   // the copy's address -> the picture, decoded
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function grab(url) {
    for (let n = 0; n < 4; n++) {
      try {
        const r = await fetch(url);
        if (r.ok) { const blob = await r.blob(), url = URL.createObjectURL(blob); bitmaps.set(url, await createImageBitmap(blob)); return url; }
        if (r.status !== 429 && r.status < 500) return '';
      } catch (e) {
        // A site that does not let a page read its pictures can still show them.
        if (await new Promise((done) => { const im = new Image(); im.onload = () => done(true); im.onerror = () => done(false); im.src = url; })) return url;
      }
      await wait(700 * (n + 1));
    }
    return '';
  }
  async function preload(indexes) {
    const todo = [...new Set(indexes)].map((i) => tl.steps[i]).filter((s) => s && s.img && !s.from);
    const work = async () => {
      for (let s = todo.shift(); s; s = todo.shift()) {
        if (!kept.has(s.img)) kept.set(s.img, grab(s.img));
        const got = await kept.get(s.img);
        if (!got) miss('picture', s.img);
        s.from = s.img; s.img = got;
      }
    };
    await Promise.all([work(), work(), work()]);
  }
  // The entries whose pictures a shot list shows: each entry it names, and the few before it, whose small
  // pictures stand at the left.
  function shown(items) {
    const out = [], add = (id) => { const i = ctx.index.get(id); if (i == null) return; for (let k = i, n = 0; k >= 0 && n < 4; k--) if (tl.steps[k].img) { out.push(k); n++; } };
    for (const it of items) for (const v of [it.shot.entry, it.shot.to, it.shot.from, ...(Array.isArray(it.shot.entries) ? it.shot.entries : [])]) if (typeof v === 'string') add(v);
    return out;
  }

  // A browser decodes an <img> when it likes, and now and then captures a frame before it has: the same frame
  // then comes out with or without its picture. So every picture on the stage is put there as a canvas, drawn
  // from the copy decoded ahead, which leaves the browser nothing to do late. The site's own rules for these
  // pictures are read from its style sheets and repeated for the canvases, so the two never drift apart.
  function mirror(rules, into) {
    for (let i = rules.length - 1; i >= 0; i--) {
      const r = rules[i];
      if (r.cssRules && !r.selectorText) mirror(r.cssRules, r);
      else if (r.selectorText && /\bimg\b/.test(r.selectorText) && /#globe|\.g-/.test(r.selectorText)) into.insertRule(r.cssText.replace(r.selectorText, r.selectorText.replace(/\bimg\b/g, 'canvas.pic')), i + 1);
    }
  }
  for (const sheet of document.styleSheets) { try { mirror(sheet.cssRules, sheet); } catch (e) { /* another site's sheet (fonts): not ours to read */ } }
  function solid() {
    for (const img of host.querySelectorAll('img:not(.g-bimg)')) {
      const bmp = bitmaps.get(img.getAttribute('src'));
      if (!bmp) continue;
      const cv = document.createElement('canvas');
      cv.width = bmp.width; cv.height = bmp.height; cv.bmp = bmp; cv.getContext('2d').drawImage(bmp, 0, 0);
      for (const a of img.attributes) if (a.name !== 'src' && a.name !== 'alt') cv.setAttribute(a.name, a.value);
      cv.classList.add('pic');
      img.replaceWith(cv);
    }
    // A picture shown much smaller than it is would be shrunk by the browser, which does that one way the first
    // time and another once it has had a moment. So each canvas holds the picture already shrunk to about the
    // size it is shown at: how large follows from where it stands now and from nothing before.
    const k = Math.max(1.6, opts.dpr);
    for (const cv of host.querySelectorAll('canvas.pic')) {
      const bmp = cv.bmp, w = cv.offsetWidth, h = cv.offsetHeight;
      if (!w || !h) continue;
      const part = Math.min(1, Math.min(w / bmp.width, h / bmp.height) * k), cw = Math.max(1, Math.round(bmp.width * part)), ch = Math.max(1, Math.round(bmp.height * part));
      if (cv.width === cw && cv.height === ch) continue;
      cv.width = cw; cv.height = ch;
      const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(bmp, 0, 0, cw, ch);
    }
  }

  // ---- drawing one frame, and knowing when it is fully drawn
  const pictures = () => Promise.all(Array.from(host.querySelectorAll('img'), async (img) => {
    img.decoding = 'sync';
    if (!img.complete) await new Promise((done) => { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); });
    if (img.naturalWidth) await img.decode().catch(() => {});
  }));
  const painted = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  function mapIdle(F, t) {
    const map = globe.film().map;
    if (!map || F.sp >= 0.995) return null;
    // The map says it is idle one drawing early: what it places last (after its tiles are in) shows only in the
    // drawing after that. So it is asked to draw once more, and that one is the frame.
    return new Promise((done) => {
      const late = setTimeout(() => { miss('tile', `the map was not fully drawn within 20 seconds at ${t}s`); done(); }, 20000);
      map.once('idle', () => { map.once('idle', () => { clearTimeout(late); done(); }); map.triggerRepaint(); });
      map.triggerRepaint();
    });
  }
  // The map remembers which way the zoom last went and draws its dashed lines a little differently by it.
  // A frame must not depend on the one before, so the map is made to forget before each one.
  function fresh() { const map = globe.film().map, zh = map && map.style && map.style.zoomHistory; if (zh) zh.first = true; }
  let line = Promise.resolve();
  const queue = (job) => { const p = line.then(job); line = p.catch(() => {}); return p; };
  async function draw(t) {
    if (!ctx) throw new Error('Film: no timeline is loaded');
    clock.t = t;
    const F = cur = stateAt(film, t), o = toOver(F, W, 1 / opts.fps);
    host.classList.toggle('nopic', !!F.nopic);
    fresh(); globe.drive(o); solid();
    await pictures();
    fresh(); globe.drive(o); solid();       // the card takes its place again once its picture has its size
    host.style.setProperty('--film-dim', o.dim);
    await mapIdle(F, t);
    await painted();
    return { t, c: F.c, entry: F.c >= 0 ? tl.steps[F.c].id : null };
  }

  const shotList = () => Object.fromEntries(Object.entries(SHOTS).map(([k, p]) => [k, { track: p.track }]));
  const pic = (m) => ({ url: m.src, type: m.type, source: m.source || '', author: m.credit || '', licence: m.licence || m.license || '', caption: m.caption || m.alt || '' });
  const api = {
    version: VERSION,
    options: opts,
    capabilities: () => ({ version: VERSION, shots: shotList(), tracks: TRACKS, eases: Object.keys(EASES), looks: LOOKS, details: DETAILS, presets: [], layers: [],
      url: ['film=1', 'w', 'h', 'dpr', 'fps', 'look', 'detail', 'seed'] }),
    // The timeline in the address, or another by its slug: every entry in the order of the film, with all it has.
    async getTimeline(slug) {
      await api.ready;
      if (slug && idOfAddress(String(slug).replace(/^\/+|\/+$/g, '')) !== tl.slug) await queue(() => loadTimeline(slug));
      if (!tl.view) return null;
      return { id: tl.id, slug: tl.slug, title: tl.view.name, description: tl.view.description || '', chapters: tl.view.checkpoints || [],
        entries: tl.entries.map((t, i) => { const s = tl.steps[i]; return { id: t.id, title: t.name, kind: s.kind, date: t.bornEv.date, end: t.endEv ? t.endEv.date : null, when: s.when,
          summary: t.summary || '', place: s.place ? s.place[3] || '' : '', lat: s.place ? s.place[0] : null, lng: s.place ? s.place[1] : null, pictures: kit.picturesOf(t).map(pic) }; }),
        data: { spec: tl.spec } };
    },
    // Checks every shot and says how many seconds the film runs. A fault is thrown with all of them named (`errors`).
    async loadShots(shots, { preset } = {}) {
      await api.ready;
      if (preset) throw new FilmError([`preset "${preset}": no presets yet`]);
      if (!ctx) throw new Error('Film: no timeline is loaded');
      const next = compile(shots, ctx, SHOTS);
      await preload(shown(next.items));
      film = next;
      await queue(() => { globe.drive({ ...toOver(stateAt(film, 0), W, 1 / opts.fps), c: -1 }); return draw(0); });
      for (const it of film.items) { const s = typeof it.shot.entry === 'string' && it.shot.picture !== false && it.shot.card !== false ? tl.steps[ctx.index.get(it.shot.entry)] : null; if (s && !s.img) miss('no-picture', s.id); }
      return film.total;
    },
    // Draws the exact frame at `t` seconds, and answers only when it is fully drawn.
    seek: (t) => queue(() => draw(Math.max(0, Number(t) || 0))),
    // Loads what the whole shot list needs (the map's tiles along the way, every picture), and says what failed.
    async prefetch() {
      await api.ready;
      const before = lost.length, times = new Set([0]);
      for (const it of film.cams) for (let t = it.start; t < it.end; t += 0.5) times.add(Math.round(t * 1000) / 1000);
      for (const it of film.cams) times.add(Math.max(0, Math.round((it.end - 1 / opts.fps) * 1000) / 1000));
      for (const t of [...times].sort((a, b) => a - b)) await api.seek(t);
      await api.seek(0);
      return { frames: times.size, failed: lost.slice(before) };
    },
    getCues: () => (film ? cuesOf(film) : []),
    missing: () => lost.slice(),
    state: () => cur,
  };
  const booted = Promise.all([kit.boot(), fetch('data/places.json').then((r) => r.json()).then((p) => { places = p || {}; }).catch(() => { places = {}; miss('data', 'places.json'); })]);
  const path = decodeURIComponent(location.pathname).split('/').filter((s) => s && s !== 'index.html').join('/');
  // Ready when the fonts, the data and the first tiles of the globe are in.
  api.ready = (async () => {
    await Promise.all([styled, booted, document.fonts && document.fonts.ready]);
    if (path && path !== 'film') await queue(() => loadTimeline(path));
    if (ctx) await queue(() => draw(0));
    return true;
  })();
  api.ready.catch((e) => { api.error = String(e && e.message || e); });
  window.codegraveFilm = api;
}
