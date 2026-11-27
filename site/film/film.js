/* Film mode: the engine. Fetched only for a signed-in account switched on for it (boot.js, docs/FILM_MODE.md).
   It takes the page over: the stage alone, at an exact size, drawn by the site's own globe
   (globe.js), which is told every frame what to show instead of following a clock. So seek(t)
   draws the same picture every time, and a script can take the frames one by one.

   It writes nothing, with one exception a script must ask for: generate() keeps what it makes as a
   private timeline of the account (or not at all). Storage is switched off, and nothing sounds but play(). */
import { idOfAddress } from '../keys.js';
import { stageFor } from '../globe-path.js';
import { specToView, partialSpec, MODELS, EFFORTS } from '../ai.js';
import { slugOf } from '../account.js';
import { VERSION, EASES, TRACKS, COLORS, compile, stateAt, toOver, cuesOf, zoomOfAltitude, FilmError } from './timeline.js';
import { SHOTS } from './shots/index.js';
import { LABEL_STYLES } from './shots/label.js';
import { createOverlays } from './overlays.js';
import { inside } from './geo.js';
import { readScene, autoShots, boardTimes, licenceClear } from './plan.js';

const LOOKS = ['atlas', 'day', 'dots', 'night'], DETAILS = ['less', 'medium', 'full'];
const PRESETS = ['short-question', 'short-mystery', 'long-explainer', 'long-mystery', 'long-map-story', 'long-rise-fall', 'long-chronicle'];
const LAYERS = ['globe', 'card', 'strip', 'title', 'clock', 'overlays'];
// The part of a vertical stage a Short's own buttons and words cover: kept clear of cards and the time line.
const SAFE = { none: { b: 0, r: 0 }, shorts: { b: 0.17, r: 0.12 } };
const DEEP = -5e6;      // older than this an entry has no place on today's map (as on the site)
// The Earth at night (NASA's Black Marble, public domain), for the night look.
const NIGHT = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg';

export function startFilm(kit) {
  const q = new URLSearchParams(location.search);
  const num = (k, d, lo, hi) => { const v = Number(q.get(k)); return q.get(k) != null && Number.isFinite(v) && v >= lo && v <= hi ? v : d; };
  const one = (k, list, d) => (list.includes(q.get(k)) ? q.get(k) : d);
  const W = Math.round(num('w', innerWidth, 64, 8192)), H = Math.round(num('h', innerHeight, 64, 8192));
  // A vertical stage is laid out the way the site lays out a phone: at half its pixels, so the card stands under
  // the place and the words are large. The browser draws two pixels for one (the tool sets that), so the frames
  // have exactly the pixels asked for.
  const K = H > W && W >= 700 ? 2 : 1, CW = Math.round(W / K), CH = Math.round(H / K);
  const opts = { w: W, h: H, dpr: num('dpr', 1, 0.5, 4), fps: num('fps', 30, 1, 240), seed: num('seed', 1, 0, 2 ** 32),
    look: one('look', LOOKS, 'atlas'), detail: one('detail', DETAILS, 'less'), safe: one('safe', Object.keys(SAFE), 'none'), bg: one('bg', ['transparent'], 'solid'),
    preset: one('preset', PRESETS, null), css: { w: CW, h: CH, scale: K } };
  const said = { look: q.has('look'), detail: q.has('detail'), safe: q.has('safe') };   // what the address itself says wins over a preset

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
  document.documentElement.classList.toggle('film-clear', opts.bg === 'transparent');
  document.body.classList.add('cg-film', 'globe');
  const stage = document.createElement('div'); stage.id = 'film-stage'; stage.style.width = CW + 'px'; stage.style.height = CH + 'px';
  stage.classList.toggle('clear', opts.bg === 'transparent'); stage.classList.toggle('narrow', CW < 700);
  stage.style.setProperty('--fu', (Math.min(CW, CH) / 1080).toFixed(4));
  const host = document.getElementById('globe'); host.hidden = false; stage.appendChild(host); document.body.appendChild(stage);
  const dimmer = document.createElement('i'); dimmer.className = 'film-dim';
  const titleEl = document.createElement('div'); titleEl.className = 'film-title';
  const clockEl = document.createElement('div'); clockEl.className = 'film-clock';
  stage.append(titleEl, clockEl);

  // ---- the clock: time is what seek() says, and a frame is drawn when it says
  const clock = { t: 0, now: () => clock.t * 1000, raf: () => 1, caf: () => {} };
  const globe = kit.createGlobe(host, { esc: kit.esc, calm: () => false, open() {}, goTo() {}, seek() {}, credit: null, clock });
  host.querySelector('.g-map').after(dimmer);
  function setLook(v) { opts.look = v; globe.look(v === 'night' ? 'atlas' : v); stage.classList.toggle('night', v === 'night'); }
  function setSafe(v) { opts.safe = v; stage.style.setProperty('--safe-b', Math.round(SAFE[v].b * CH) + 'px'); stage.style.setProperty('--safe-r', Math.round(SAFE[v].r * CW) + 'px'); }
  setLook(opts.look); globe.detail(opts.detail); setSafe(opts.safe);
  const layers = { globe: true, card: true, strip: true, title: false, clock: false, overlays: true };
  function setLayers(o = {}) {
    for (const k of LAYERS) if (typeof o[k] === 'boolean') layers[k] = o[k];
    for (const k of ['globe', 'card', 'strip', 'overlays']) stage.classList.toggle('no-' + k, !layers[k]);
    stage.classList.toggle('title', layers.title); stage.classList.toggle('clock', layers.clock);
    return { ...layers };
  }
  setLayers();

  const lost = [];        // what could not be had: missing()
  const miss = (kind, what) => { if (!lost.some((m) => m.kind === kind && m.what === what)) lost.push({ kind, what }); };
  host.addEventListener('error', (e) => { if (e.target && e.target.tagName === 'IMG') miss('picture', e.target.currentSrc || e.target.src); }, true);

  // ---- data: the timeline, the countries, and the scene a script may give
  const tl = { id: null, slug: null, title: '', description: '', chapters: [], rows: [], steps: [], spec: null, saved: null };
  let places = null, film = null, ctx = null, cur = null, mapSeen = null, scene = readScene({}), preset = null, lastShots = [];
  const lands = new Map(), codes = new Map();      // a country by its name in small letters, and its name by its code
  const country = (v) => { const s = String(v || '').trim(); return lands.get((codes.get(s.toUpperCase()) || s).toLowerCase()) || null; };
  const landAt = (lat, lng) => { for (const f of lands.values()) if (inside(f.geometry, lat, lng)) return f.properties.n; return ''; };
  const placeOf = (t) => (t.where ? [t.where[0], t.where[1], 'city', ''] : !t.pos && !t.val && t.born > DEEP ? (places && places[t.id]) || null : null);
  const image = (m) => m.type !== 'video';
  function useRows(view, entries) {
    tl.title = view.name || ''; tl.description = view.description || ''; tl.chapters = view.checkpoints || [];
    tl.steps = entries.map((t) => ({ ...kit.stepOf({ t, lane: { col: 0 } }), place: placeOf(t) }));
    tl.rows = entries.map((t, i) => { const s = tl.steps[i]; return { id: t.id, title: t.name, kind: s.kind, date: t.bornEv.date, end: t.endEv ? t.endEv.date : null, when: s.when, summary: t.summary || '',
      place: s.place ? s.place[3] || '' : '', lat: s.place ? s.place[0] : null, lng: s.place ? s.place[1] : null, pics: kit.picturesOf(t).filter(image) }; });
  }
  async function loadTimeline(slug, raw) {
    await booted;
    const id = raw ? slug : idOfAddress(String(slug).replace(/^\/+|\/+$/g, ''));
    // The page's own loader: a built view is a file, and a timeline someone keeps is read as the account signed
    // in, so its own private ones open and nobody else's. A kept one has its spec beside it.
    const real = await kit.loadView(id).catch(() => null);
    if (!real) throw new Error(`Film: the timeline "${slug}" could not be read`);
    const stored = !raw && /^t\//.test(real) ? await kit.api('/rest/v1/rpc/open_timeline', { method: 'POST', body: { p_id: real.slice(2) } }).catch(() => null) : null;
    const v = kit.viewById.get(real);
    tl.id = real; tl.slug = id; tl.spec = raw || (stored && stored[0] && stored[0].data && stored[0].data.spec) || null;
    tl.saved = stored && stored[0] ? stored[0].visibility : raw ? 'none' : null;
    useRows(v, [...v.members].sort((a, b) => a.born - b.born || a.rank - b.rank || (a.id < b.id ? -1 : 1)));
    await staged();
  }
  // With no timeline in the address, the places of the scene are what the film is about: each can be flown to
  // and held like an entry, and has a card when it has words or a picture.
  function sceneRows() {
    const list = [...scene.places].map(([id, p]) => ({ id, p }));
    tl.id = tl.slug = null; tl.title = ''; tl.description = ''; tl.chapters = []; tl.spec = null; tl.saved = 'none';
    tl.steps = list.map(({ id, p }) => ({ id, name: p.name, kind: p.kind || '', when: p.date || '', summary: p.summary || '', img: typeof p.picture === 'string' ? p.picture : '', mark: p.date || '', col: COLORS.gold, rgb: 'rgb(236,196,128)',
      place: [p.lat, p.lng, 'city', p.name], near: Number.isFinite(p.zoom) ? p.zoom : Number.isFinite(p.altitude) ? zoomOfAltitude(p.altitude, CH, p.lat) : null }));
    tl.rows = tl.steps.map((s) => ({ id: s.id, title: s.name, kind: s.kind, date: s.when || null, end: null, when: s.when, summary: s.summary, place: s.name, lat: s.place[0], lng: s.place[1],
      pics: s.img ? [{ type: 'image', src: s.img, source: '', credit: '', licence: '' }] : [] }));
  }
  async function staged() {
    for (const s of tl.steps) { s.from = null; }
    globe.show(tl.steps);
    titleEl.textContent = tl.title;
    film = null; cur = null; lastShots = [];
    await mapReady();
    makeCtx();
  }
  // The map is there (when anything has a place), with its countries and the look's own layers.
  async function mapReady() {
    if (!tl.steps.some((s) => s.place)) return;
    const t0 = performance.now();
    for (;;) {
      const f = globe.film();
      if (f.map && f.lands && f.map.getLayer('way') && (opts.look !== 'dots' || f.map.getLayer('dots'))) break;
      if (performance.now() - t0 > 60000) { miss('map', 'the map did not load in 60 seconds'); break; }
      await new Promise((r) => setTimeout(r, 50));
    }
    const map = globe.film().map;
    if (map && map !== mapSeen) { mapSeen = map; map.on('error', (e) => miss('tile', (e && e.error && e.error.message) || 'a map tile failed')); }
    if (map) { ov.ensure(map); dress(map); }
  }
  // What film mode itself lays on the map: the Earth at night, for the night look.
  function dress(map) {
    const night = opts.look === 'night';
    if (night && !map.getSource('film-night')) {
      map.addSource('film-night', { type: 'raster', tiles: [NIGHT], tileSize: 256, maxzoom: 8 });
      map.addLayer({ id: 'film-night', type: 'raster', source: 'film-night', maxzoom: 7.5, paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 5.5, 1, 7.5, 0], 'raster-fade-duration': 0 } }, map.getLayer('c-fill') ? 'c-fill' : 'grat');
    }
    const set = (id, on) => { if (map.getLayer(id) && (map.getLayoutProperty(id, 'visibility') !== 'none') !== on) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
    set('film-night', night);
    // With nothing behind the globe its haze would show as a bright rim, so a see-through stage has none.
    if (opts.bg === 'transparent' && !map.filmClear) { map.filmClear = true; try { map.setSky({ 'atmosphere-blend': 0 }); } catch (e) { /* an older map: the rim stays */ } }
    if (night) set('c-fill', false);
  }
  function regionOf(v) {
    const R = typeof v === 'string' ? scene.regions.get(v) : null;
    if (R) return R.country ? { key: 'c:' + R.country.properties.n, geometry: R.country.geometry, color: R.style.color } : { key: 's:' + v, geometry: R.geometry, color: R.style.color };
    const c = typeof v === 'string' ? country(v) : null;
    return c ? { key: 'c:' + c.properties.n, geometry: c.geometry } : null;
  }
  const regionGeometry = (key) => (key.startsWith('c:') ? (country(key.slice(2)) || {}).geometry : (scene.regions.get(key.slice(2)) || {}).geometry) || null;
  function makeCtx() {
    const f = globe.film(), placed = tl.steps.map((s) => !!s.place);
    ctx = { steps: tl.steps, index: new Map(tl.steps.map((s, i) => [s.id, i])), w: CW, h: CH, size: Math.min(CW, CH), far: f.far, fps: opts.fps,
      opening: { lat: f.open ? f.open.at[0] : 20, lng: f.open ? f.open.at[1] : 0, zoom: f.open ? f.open.zoom : f.far },
      view: (i) => { const c = globe.film().cams[i]; return c ? { lat: c.at[0], lng: c.at[1], zoom: tl.id ? c.zoom : tl.steps[i].near ?? Math.max(c.zoom, f.far + 2.4) } : null; },
      stage: (i) => stageFor(placed, i),
      places: tl.id ? scene.places : new Map(), region: regionOf, route: (id) => scene.routes.get(id) || null, label: (id) => scene.labels.get(id) || null,
      labelStyle: (preset && preset.label) || 'plain', pictures: (i) => tl.rows[i].pics };
    film = compile([], ctx, SHOTS);
  }

  // ---- pictures: each one a shot list needs is fetched once, ahead of the frames, and kept in memory, so a
  // frame never waits on the network and a picture that cannot be had is left out of every frame alike.
  const kept = new Map();      // a picture's address -> the copy held here ('' when it could not be had)
  const bitmaps = new Map();   // the copy's address -> the picture, decoded
  const shotPics = new Map();  // "entry:index" -> the picture a picture shot shows
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function grab(url) {
    for (let n = 0; n < 4; n++) {
      try {
        const r = await fetch(url);
        if (r.ok) { const blob = await r.blob(), held = URL.createObjectURL(blob); bitmaps.set(held, await createImageBitmap(blob)); return held; }
        if (r.status !== 429 && r.status < 500) return '';
      } catch (e) {
        // A site that does not let a page read its pictures can still show them.
        const im = await new Promise((done) => { const i = new Image(); i.onload = () => done(i); i.onerror = () => done(null); i.src = url; });
        if (im) { try { bitmaps.set(url, await createImageBitmap(im)); } catch (x) { /* shown as it is */ } return url; }
      }
      await wait(700 * (n + 1));
    }
    return '';
  }
  const hold = (url) => { if (!kept.has(url)) kept.set(url, grab(url)); return kept.get(url); };
  async function preload(indexes) {
    const todo = [...new Set(indexes)].map((i) => tl.steps[i]).filter((s) => s && s.img && !s.from);
    const work = async () => {
      for (let s = todo.shift(); s; s = todo.shift()) {
        const got = await hold(s.img);
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
    for (const it of items) for (const v of [it.shot.entry, it.shot.to, it.shot.from, it.shot.around, it.shot.place, ...(Array.isArray(it.shot.entries) ? it.shot.entries : [])]) if (typeof v === 'string') add(v);
    return out;
  }
  async function preloadShots(items) {
    await preload(shown(items));
    await Promise.all(items.filter((it) => it.type === 'picture').map(async (it) => {
      const i = ctx.index.get(it.shot.entry), n = it.shot.index ?? 0, m = tl.rows[i].pics[n], got = m && await hold(m.src), bmp = got && bitmaps.get(got);
      if (bmp) shotPics.set(`${i}:${n}`, bmp); else miss('picture', m ? m.src : `${it.shot.entry} #${n}`);
    }));
  }
  const ov = createOverlays({ stage, host, W: CW, H: CH, regionGeometry, bitmapOf: (i, n) => shotPics.get(`${i}:${n}`) });

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
    const k = Math.max(1.6, window.devicePixelRatio || 1);
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
  const lay = () => ({ phone: CW < 700, h: CH, safe: SAFE[opts.safe] });
  // One frame put on the stage, all of it at once: the globe and its card, then what the overlays add.
  function put(t) {
    clock.t = t;
    const F = cur = stateAt(film, t), o = toOver(F, CW, 1 / opts.fps, lay());
    host.classList.toggle('nopic', !!F.nopic);
    fresh(); globe.drive(o); solid();
    host.style.setProperty('--film-dim', o.dim);
    const map = globe.film().map, at = F.c >= 0 ? F.c : Math.round(F.pos);
    if (map) { ov.ensure(map); dress(map); }
    ov.draw(F);
    clockEl.textContent = (tl.steps[at] && tl.steps[at].mark) || '';
    return { F, o };
  }
  let line = Promise.resolve();
  const queue = (job) => { const p = line.then(job); line = p.catch(() => {}); return p; };
  async function draw(t) {
    if (!ctx) throw new Error('Film: no timeline or scene is loaded');
    const { F } = put(t);
    await pictures();
    put(t);       // the card takes its place again once its picture has its size
    await mapIdle(F, t);
    await painted();
    return { t, c: F.c, entry: F.c >= 0 ? tl.steps[F.c].id : null };
  }

  // ---- presets: a style's own settings and the defaults of its shots (site/film/presets/)
  const presetFiles = new Map();
  async function readPreset(name) {
    if (!PRESETS.includes(name)) throw new FilmError([`preset "${name}": not one of ${PRESETS.join(', ')}`]);
    if (!presetFiles.has(name)) presetFiles.set(name, fetch(new URL(`./presets/${name}.json`, import.meta.url)).then((r) => { if (!r.ok) throw new Error(`Film: the preset "${name}" could not be read`); return r.json(); }));
    return presetFiles.get(name);
  }
  async function usePreset(name) {
    const p = name ? await readPreset(name) : null, was = preset;
    preset = p;
    if (p) {
      if (!said.look && LOOKS.includes(p.look) && p.look !== opts.look) setLook(p.look);
      if (!said.detail && DETAILS.includes(p.detail) && p.detail !== opts.detail) { opts.detail = p.detail; globe.detail(p.detail); }
      if (!said.safe && SAFE[p.safe] && p.safe !== opts.safe) setSafe(p.safe);
      if (p !== was && p.layers) setLayers(p.layers);
    }
    if (ctx) ctx.labelStyle = (p && p.label) || 'plain';
    await mapReady();
  }

  // ---- what only something outside the page can do: take the picture of a frame. The film tool gives the page
  // `window.codegraveFilmCapture` (docs/FILM_MODE.md says how a script of your own does the same).
  const shoot = (o) => (typeof window.codegraveFilmCapture === 'function' ? window.codegraveFilmCapture(o) : null);
  async function small(base64, type, width) {
    const blob = await (await fetch(`data:image/${type};base64,${base64}`)).blob(), bmp = await createImageBitmap(blob);
    const k = Math.min(1, width / bmp.width), cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(bmp, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.82);
  }

  // ---- the generator: the site's own, as the account signed in, on its daily allowance
  let making = null, playing = null;
  const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-2);
  const say = (s, onProgress) => { making = { ...making, ...s }; try { if (onProgress) onProgress({ ...making }); window.dispatchEvent(new CustomEvent('codegrave-film-progress', { detail: { ...making } })); } catch (e) { /* a listener's fault is not ours */ } };
  function askFor(o) {
    if (typeof o.prompt !== 'string' || o.prompt.trim().length < 3) throw new Error('Film: give a prompt');
    if (o.model != null && !MODELS.some((m) => m.id === o.model)) throw new Error(`Film: model "${o.model}" is not one of ${MODELS.map((m) => m.id).join(', ')}`);
    if (o.effort != null && !EFFORTS.some((e) => e.id === o.effort)) throw new Error(`Film: effort "${o.effort}" is not one of ${EFFORTS.map((e) => e.id).join(', ')}`);
    return { prompt: o.prompt.trim(), ...(o.model ? { model: o.model } : {}), ...(o.effort ? { effort: o.effort } : {}) };
  }
  const ask = (body, onProgress) => kit.ask(body, (text) => say({ stage: 'writing', entries: partialSpec(text).entries.length }, onProgress), (note) => say({ note, stage: /pictures/.test(note) ? 'pictures' : making.stage }, onProgress));
  const viewOf = (f, id) => ({ view: { ...f.view, id, name: f.spec.title, description: f.spec.description || '', author: 'you', type: 'community', picked: true, count: f.entries.length, stored: true }, entries: f.entries });

  const shotList = () => Object.fromEntries(Object.entries(SHOTS).map(([k, p]) => [k, { track: p.track }]));
  const sized = async (m) => { const got = await hold(m.src), bmp = got && bitmaps.get(got); return bmp ? { width: bmp.width, height: bmp.height } : { width: null, height: null }; };
  const pic = (m) => { const licence = m.licence || m.license || ''; return { url: m.src, source: m.source || '', author: m.credit || '', licence, caption: m.caption || m.alt || '', clear: licenceClear(licence) }; };
  const api = {
    version: VERSION,
    options: opts,
    capabilities: () => ({ version: VERSION, shots: shotList(), tracks: TRACKS, eases: Object.keys(EASES), colors: Object.keys(COLORS), looks: LOOKS, details: DETAILS, presets: PRESETS, layers: LAYERS,
      safe: Object.fromEntries(Object.entries(SAFE).map(([k, v]) => [k, { bottom: v.b, right: v.r }])), labelStyles: LABEL_STYLES, backgrounds: ['solid', 'transparent'],
      models: MODELS.map((m) => m.id), efforts: EFFORTS.map((e) => e.id), save: ['private', 'none'], capture: typeof window.codegraveFilmCapture === 'function',
      url: ['film=1', 'w', 'h', 'dpr', 'fps', 'look', 'detail', 'safe', 'bg', 'preset', 'seed'] }),
    // The timeline in the address, or another by its slug: every entry in the order of the film, with all it has.
    async getTimeline(slug) {
      await api.ready;
      if (slug && slug !== tl.id && idOfAddress(String(slug).replace(/^\/+|\/+$/g, '')) !== tl.slug) await queue(() => loadTimeline(slug));
      if (!ctx) return null;
      return { id: tl.id, slug: tl.slug, title: tl.title, description: tl.description, chapters: tl.chapters, saved: tl.saved,
        entries: tl.rows.map(({ pics, ...e }) => ({ ...e, pictures: pics.map(pic) })), data: { spec: tl.spec } };
    },
    // A scene for this film: places, routes, regions and labels a script gives. It is kept nowhere. With no
    // timeline in the address (/film?film=1) the places are what the film is about.
    async loadScene(raw) {
      await api.ready;
      const next = readScene(raw, { entry: (id) => !!tl.id && tl.steps.some((s) => s.id === id), country });
      if (next.errors.length) throw new FilmError(next.errors);
      scene = next;
      await queue(async () => { if (!tl.id) { sceneRows(); await staged(); } else { film = null; lastShots = []; makeCtx(); } return draw(0); });
      return { places: scene.places.size, routes: scene.routes.size, regions: scene.regions.size, labels: scene.labels.size };
    },
    // Checks every shot and says how many seconds the film runs. A fault is thrown with all of them named (`errors`).
    async loadShots(shots, { preset: name } = {}) {
      await api.ready;
      if (!ctx) throw new Error('Film: no timeline or scene is loaded');
      if (name !== undefined || !preset) await usePreset(name ?? opts.preset);
      const next = compile(shots, ctx, SHOTS, (preset && preset.defaults) || {});
      await preloadShots(next.items);
      film = next; lastShots = shots;
      await queue(() => { globe.drive({ ...toOver(stateAt(film, 0), CW, 1 / opts.fps, lay()), c: -1 }); return draw(0); });
      for (const it of film.items) { const s = typeof it.shot.entry === 'string' && it.type === 'hold' && it.shot.picture !== false && it.shot.card !== false ? tl.steps[ctx.index.get(it.shot.entry)] : null; if (s && !s.img) miss('no-picture', s.id); }
      return film.total;
    },
    // Which parts of the picture are drawn: { globe, card, strip, title, clock, overlays }, each true or false.
    async setLayers(o) { const now = setLayers(o); if (ctx && film) await queue(() => draw(clock.t)); return now; },
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

    // Everything a film can be made of, to plan shots and to write the credits: each entry's place, dates and
    // pictures (address, source, author, licence, size; `clear` is false where the licence is not plainly free),
    // the countries that can be lit, and what the scene holds.
    async manifest() {
      await api.ready;
      if (!ctx) return null;
      const entries = await Promise.all(tl.rows.map(async ({ pics, ...e }) => ({ ...e, country: e.lat != null ? landAt(e.lat, e.lng) : '', pictures: await Promise.all(pics.map(async (m, index) => ({ index, ...pic(m), ...(await sized(m)) }))) })));
      const name = new Map([...codes].map(([c, n]) => [n, c]));
      return { timeline: tl.id ? { id: tl.id, slug: tl.slug, title: tl.title, description: tl.description, chapters: tl.chapters, saved: tl.saved } : null, entries,
        unclear: entries.flatMap((e) => e.pictures.filter((p) => !p.clear).map((p) => ({ entry: e.id, index: p.index, url: p.url, licence: p.licence }))),
        noPicture: entries.filter((e) => !e.pictures.length).map((e) => e.id), noPlace: entries.filter((e) => e.lat == null).map((e) => e.id),
        regions: { onTimeline: [...new Set(entries.map((e) => e.country).filter(Boolean))], countries: [...lands.values()].map((f) => ({ name: f.properties.n, code: name.get(f.properties.n) || '' })), scene: [...scene.regions.keys()] },
        routes: [...scene.routes].map(([id, r]) => ({ id, from: r.from, to: r.to, via: r.via })), places: [...scene.places].map(([id, p]) => ({ id, name: p.name, lat: p.lat, lng: p.lng })), labels: [...scene.labels.keys()] };
    },
    // A shot list written for you: to each entry, its card, its picture. `durations` is one number, or one per
    // entry from the voice timings (each the whole time that entry has). Answers { shots, total, cues }.
    async autoShots({ entries, durations, open, picture, preset: name } = {}) {
      await api.ready;
      if (!ctx) throw new Error('Film: no timeline or scene is loaded');
      const ids = entries || tl.steps.map((s) => s.id), unknown = ids.filter((id) => !ctx.index.has(id));
      if (unknown.length) throw new FilmError(unknown.map((id) => `entries: no entry "${id}" in this timeline`));
      const p = name ? await readPreset(name) : preset;
      return autoShots(ids, { durations, pace: (p && p.pace) || {}, open: open ?? 0, picture, pictures: (id) => tl.rows[ctx.index.get(id)].pics.length });
    },
    // Where the board frames are taken (the middle of every shot), each with a small JPEG when the film tool,
    // or a script of your own, takes the pictures for the page.
    async boardFrames({ width = 480 } = {}) {
      await api.ready;
      const out = [];
      for (const b of boardTimes(api.getCues(), opts.fps)) {
        await api.seek(b.t);
        const shot = await shoot({ op: 'shoot', type: 'jpeg', quality: 86 });
        out.push({ ...b, ...(shot ? { jpeg: await small(shot, 'jpeg', width) } : {}) });
      }
      return out;
    },
    // One frame as a large PNG, the same picture with more pixels: { w } is how many across. Needs the film
    // tool, or a script of your own, to take the picture.
    async snapshot(t, { w } = {}) {
      await api.ready;
      if (typeof window.codegraveFilmCapture !== 'function') throw new Error('Film: snapshot needs something to take the picture: the film tool (film.mjs frames), or window.codegraveFilmCapture from a script of your own');
      const scale = Math.max(0.25, Math.min(4, (Number(w) || W * opts.dpr) / W)), fit = async () => { const map = globe.film().map; if (map) { map.setPixelRatio(window.devicePixelRatio); map.resize(); } };
      return queue(async () => {
        await shoot({ op: 'scale', scale }); await fit();
        try { await draw(Math.max(0, Number(t) || 0)); return { t, w: Math.round(W * scale), h: Math.round(H * scale), png: 'data:image/png;base64,' + await shoot({ op: 'shoot', type: 'png' }) }; }
        finally { await shoot({ op: 'scale', scale: opts.dpr }); await fit(); await draw(clock.t); }
      });
    },
    // Plays the film as it runs, for looking at it with the voice: not exact, since a frame is shown as soon as
    // it can be. With a sound file the film keeps to the sound. Answers when it has run, or stop() is called.
    play({ audioUrl, from = 0 } = {}) {
      api.stop();
      if (!film) return Promise.reject(new Error('Film: no shots are loaded'));
      return new Promise((done) => {
        const audio = audioUrl ? new Audio(audioUrl) : null;
        let t0 = performance.now() - from * 1000, on = true;
        const end = (why) => { if (!on) return; on = false; playing = null; if (audio) audio.pause(); done({ stopped: why, at: clock.t, total: film.total }); };
        playing = { stop: () => end('stopped') };
        const tick = () => {
          if (!on) return;
          if (audio && !audio.paused && !audio.ended) t0 = performance.now() - audio.currentTime * 1000;
          const t = (performance.now() - t0) / 1000;
          if (t >= film.total) { put(Math.max(0, film.total - 1 / opts.fps)); return end('ended'); }
          put(t); requestAnimationFrame(tick);
        };
        if (audio) { audio.currentTime = from; audio.play().catch(() => miss('sound', audioUrl)); }
        requestAnimationFrame(tick);
      });
    },
    stop() { if (playing) playing.stop(); },

    // Makes a timeline from a prompt with the site's own generator, as the account signed in and on its daily
    // allowance. save: "private" keeps it as a private timeline of the account (answers its slug); "none" keeps
    // it nowhere. Never public. progress() says how far it has come; so does the event codegrave-film-progress.
    async generate(o = {}) {
      await api.ready;
      const body = askFor(o), save = o.save ?? 'private', sd = rand();
      if (save !== 'private' && save !== 'none') throw new Error('Film: save is "private" or "none"; film mode never publishes');
      making = { stage: 'asking', entries: 0, note: '', prompt: body.prompt };
      let uuid = null;
      try {
        if (save === 'private') {
          const title = body.prompt.replace(/\s+/g, ' ').slice(0, 80).replace(/[.,;:!?\s]+$/, '') || 'New timeline';
          const got = await kit.api('/rest/v1/timelines?select=id', { method: 'POST', headers: { Prefer: 'return=representation' }, body: { title, slug: `${slugOf(title).slice(0, 48)}-${sd}`, description: '', data: { view: { checkpoints: [] }, entries: [], prompt: body.prompt, making: true } } });
          uuid = got[0].id;
        }
        const got = await ask({ ...body, seed: sd, ...(uuid ? { timeline: uuid } : {}) }, o.onProgress), f = specToView(got.spec, sd);
        if (!f.entries.length) throw new Error('Film: the model wrote no entries with dates. Say more about what you want.');
        if (uuid && !got.saved) await kit.api(`/rest/v1/timelines?id=eq.${uuid}`, { method: 'PATCH', body: { title: f.spec.title, description: (f.spec.description || '').slice(0, 600), data: { view: f.view, entries: f.entries, spec: f.spec, prompt: body.prompt } } });
        const id = uuid ? 't/' + uuid : 'film/unsaved-' + sd;
        if (!uuid) kit.replaceView(viewOf(f, id));
        await queue(async () => { await loadTimeline(id, uuid ? null : f.spec); return draw(0); });
        say({ stage: 'done', entries: tl.rows.length }, o.onProgress);
        return { slug: uuid ? id : null, saved: uuid ? 'private' : 'none', timeline: await api.getTimeline() };
      } catch (e) {
        if (uuid) await kit.api(`/rest/v1/timelines?id=eq.${uuid}`, { method: 'DELETE' }).catch(() => {});     // nothing was made: the empty draft goes
        say({ stage: 'failed', note: String(e && e.message || e) }, o.onProgress);
        throw e;
      }
    },
    // Asks the generator to change a timeline generate() kept: it must be the account's own and private.
    async regenerate(o = {}) {
      await api.ready;
      const body = askFor(o), uuid = (/^t\/([0-9a-f-]{36})$/.exec(String(o.slug || '')) || [])[1];
      if (!uuid) throw new Error('Film: give the slug generate() answered ("t/<id>")');
      const row = ((await kit.api('/rest/v1/rpc/open_timeline', { method: 'POST', body: { p_id: uuid } })) || [])[0];
      if (!row || !row.mine) throw new Error('Film: that timeline is not this account\'s own');
      if (row.visibility !== 'private') throw new Error('Film: that timeline is not private; film mode changes only private timelines');
      const spec = row.data && row.data.spec, first = row.data && row.data.entries && row.data.entries[0];
      if (!spec) throw new Error('Film: that timeline was not made with the generator');
      making = { stage: 'asking', entries: 0, note: '', prompt: body.prompt };
      try {
        const got = await ask({ ...body, current: spec }, o.onProgress), f = specToView(got.spec, first ? first.id.split('-')[0].slice(1) : rand());
        if (!f.entries.length) throw new Error('Film: that change would leave the timeline empty');
        await kit.api(`/rest/v1/timelines?id=eq.${uuid}`, { method: 'PATCH', body: { title: f.spec.title, description: (f.spec.description || '').slice(0, 600), data: { view: f.view, entries: f.entries, spec: f.spec, prompt: row.data.prompt } } });
        kit.replaceView(viewOf(f, 't/' + uuid));
        await queue(async () => { await loadTimeline('t/' + uuid, f.spec); tl.saved = 'private'; return draw(0); });
        say({ stage: 'done', entries: tl.rows.length }, o.onProgress);
        return { slug: 't/' + uuid, saved: 'private', changed: got.changed || '', timeline: await api.getTimeline() };
      } catch (e) { say({ stage: 'failed', note: String(e && e.message || e) }, o.onProgress); throw e; }
    },
    progress: () => (making ? { ...making } : null),
  };
  const booted = Promise.all([kit.boot(), fetch('data/places.json').then((r) => r.json()).then((p) => { places = p || {}; }).catch(() => { places = {}; miss('data', 'places.json'); }),
    fetch(new URL('../media/countries.json', import.meta.url)).then((r) => r.json()).then((d) => { for (const f of d.features) lands.set(f.properties.n.toLowerCase(), f); }).catch(() => miss('data', 'countries.json')),
    fetch(new URL('./regions.json', import.meta.url)).then((r) => r.json()).then((d) => { for (const [c, n] of Object.entries(d)) codes.set(c, n); }).catch(() => miss('data', 'regions.json'))]);
  const path = decodeURIComponent(location.pathname).split('/').filter((s) => s && s !== 'index.html').join('/');
  // Ready when the fonts, the data and the first tiles of the globe are in.
  api.ready = (async () => {
    await Promise.all([styled, booted, document.fonts && document.fonts.ready]);
    if (path && path !== 'film') await queue(() => loadTimeline(path));
    if (opts.preset) await usePreset(opts.preset);
    if (ctx) await queue(() => draw(0));
    return true;
  })();
  api.ready.catch((e) => { api.error = String(e && e.message || e); });
  window.codegraveFilm = api;
}
