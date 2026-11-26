/* codegrave: the media wall. The road runs through open air: a night of
   stars in the dark theme, a day sky in the light one, with rails of light
   and a little dust either side, and a few frames floating beside it that
   show pictures and short films.

   It is one component with one way in. createWall(host) makes it inside an
   element; wall.frame(props) is called once a frame by the road, with where
   the reader is, and returns true while it is still fading something. The
   media come in as plain data, from two places:

   - `cards`, each frame: the cards on show on the road and their own media,
       { id, name, side: -1 | 0 | 1, col, media: [item], quiet }
     A card's media go up on its side (0: either), framed in `col` when given,
   and smaller when `quiet` (a name that is near but not up as a card).
   `own` says the views on the road have media of their own; then the frames
   show only those, and the eras only lend their light.
   - eras, once: what fills the frames no card needs,
       { id, name, from, to,                 // written years, `to` not included
         tone: { warm: '#e3b25f', cool: '#78a9f0' },   // the light on the left and right
         media: [item] }

   An item is { src, type: 'image' | 'video', poster, alt, caption, credit, licence, source, start, end, side }.
   Nothing here knows about entries or views. The arithmetic (which era,
   which frames) is pure and exported for the tests. */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const SLOTS = 6;      // frames on each wall
export const HOLD = 5;       // seconds a card's picture stays up after its card has gone
export const HOLD_OWN = 20;  // the same when the views have pictures of their own, so no era picture is waiting for the frame

// The era a written year falls in, or the nearest one when it falls in none. -1 when there are no eras.
export function eraAt(eras, year) {
  let best = -1, gap = Infinity;
  for (let i = 0; i < eras.length; i++) {
    const e = eras[i];
    if (year >= e.from && year < e.to) return i;
    const d = year < e.from ? e.from - year : year - e.to + 1;
    if (d < gap) { gap = d; best = i; }
  }
  return best;
}

// The media of one era shared out between the two walls: an item may ask for a side, the rest
// alternate, left first. Each wall holds at most `slots`; a wall with fewer leaves frames empty.
export function sidesOf(era, slots = SLOTS) {
  const left = [], right = [];
  for (const m of (era && era.media) || []) {
    const side = m.side === 'left' ? left : m.side === 'right' ? right : left.length <= right.length ? left : right;
    if (side.length < slots) side.push(m);
    else if ((side === left ? right : left).length < slots) (side === left ? right : left).push(m);
  }
  return { left, right };
}

// Which frame takes a card's new picture, among the frames of one side (most visible first; each
// { from: 'era' | 'card' | undefined, live, gone }): one that holds no card's picture, else the one whose
// card left longest ago. -1 when every frame holds the picture of a card still on show.
export function slotFor(frames) {
  let best = -1;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.from !== 'card') return i;
    if (!f.live && (best < 0 || f.gone < frames[best].gone)) best = i;
  }
  return best;
}

// Where the frames stand on each wall. The places are fixed and clear of one another (the tests check
// it), so pictures never land on top of each other, and they are taken in this order, most visible first: `d` is the depth along the road in focal
// lengths (like the road's own u / D), `x` how far out from the middle of the screen the frame is seen
// (a share of the half width), `y` its height (a share of the eye's height above the ground, negative
// above the horizon), and `w` its size.
export const FRAMES = [
  { d: 1.10, x: 0.40, y: 0.16, w: 1.07 },     // upper row, middle
  { d: 0.45, x: 0.76, y: 0.52, w: 0.69 },     // lower row, outer
  { d: 0.50, x: 0.72, y: 0.17, w: 0.82 },     // upper row, outer
  { d: 0.90, x: 0.46, y: 0.58, w: 0.75 },     // lower row, inner
  { d: 2.00, x: 0.19, y: 0.146, w: 1.14 },    // upper row, far down the road
  { d: 0.30, x: 0.80, y: 0.78, w: 0.55 },     // lowest, outer
];
export const TALL = 1.1;     // how much taller than its place a frame may grow for a portrait (the tests keep it clear)
export const TILT = 36;      // degrees each frame is turned towards the road
// The box a frame covers on the screen, from the middle of the screen (x, outwards positive) and the
// horizon (y, downwards): the frame's four corners, turned by TILT and seen in the road's perspective.
// `fw` is the width of a frame of size 1, `half` the half width of the screen on its side, `gh` the eye's
// height and F the focal length, all in pixels; `sw` and `sh` scale the width and height when a frame takes
// the shape of its picture (fit()). The tests use it to keep the frames clear of one another.
export function frameBox(s, { fw, half, gh, F }, sw = 1, sh = 1) {
  const w = fw * s.w * sw, h = fw * s.w * 0.6 * sh, a = (TILT * Math.PI) / 180, cx = s.x * half * (1 + s.d), cy = s.y * gh;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const u of [-1, 1]) for (const v of [-1, 1]) {
    // the outer edge of a frame stands nearer the reader, the inner edge further off
    const k = F / (F + F * s.d - u * (w / 2) * Math.sin(a));
    const x = (cx + u * (w / 2) * Math.cos(a)) * k, y = (cy + v * (h / 2)) * k;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, x1, y0, y1 };
}
// On a phone the road takes most of the width: two frames a side, larger, in the sky and beside the road.
export const FRAMES_PHONE = [
  { d: 0.55, x: 0.6, y: 0.14, w: 1.00 },
  { d: 1.00, x: 0.74, y: 0.52, w: 0.86 },
];

// A colour '#rrggbb' as numbers, and back.
export const rgbOf = (hex, fall = [200, 200, 200]) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : fall;
};

// A small steady random number for a whole number: the same mote always drifts the same way.
const hash = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

export const DUST = 200;      // motes of dust floating in the dark either side of the road
export const FOG = 0.24;      // how thick the fog is: a mote at depth d shows exp(-(FOG d)^2) of its light

// The rails of light either side of the road: how far out each runs (in road half widths), and how often
// its pulses come (per focal length). Three warm on the left, two cool on the right.
export const RAILS = [
  { x: -1.14, f: 0.9 }, { x: -1.42, f: 1.07 }, { x: -1.78, f: 0.8 },
  { x: 1.16, f: 1.0 }, { x: 1.55, f: 0.85 },
];

export function createWall(host, { eras = [] } = {}) {
  // The void behind it all is a gradient in CSS (#wall). On it: the stars and haze, drawn once per size;
  // the rails and the dust, drawn each frame the reader moves; and the frames of the era.
  host.innerHTML = '<canvas class="w-sky"></canvas><canvas class="w-cv"></canvas><div class="w-scene"><div class="w-o"></div></div><div class="w-cap" hidden></div>';
  const sky = host.children[0], cv = host.children[1], scene = host.children[2], origin = scene.firstChild, cap = host.children[3];
  // The dust: a place for each mote, along the road and out to the sides, and how high it floats.
  const motes = Array.from({ length: DUST }, (_, i) => {
    const side = hash(i * 5 + 1) < 0.5 ? -1 : 1, out = 0.15 + 3.2 * Math.pow(hash(i * 5 + 2), 1.4);
    return { x: side * out, y: -1.1 + 2.0 * hash(i * 5 + 3), d: hash(i * 5 + 4) * 9, b: 0.4 + 0.6 * hash(i * 5 + 5) };
  });
  const frames = [];
  for (const side of [-1, 1]) for (let k = 0; k < SLOTS; k++) {
    const el = document.createElement('a');
    el.className = 'wf'; el.target = '_blank'; el.rel = 'noopener'; el.tabIndex = -1;
    el.innerHTML = '<span class="wm"></span><span class="wm"></span>';
    el.style.setProperty('--k', k + (side > 0 ? 0.5 : 0));      // the frames change one after another, not all at once
    origin.appendChild(el);
    const f = { el, side, k, layers: [...el.children], on: 0, item: undefined, from: undefined, live: false, gone: 0, card: null };
    frames.push(f);
    el.classList.add('empty');
    // Pointing at a frame says what it shows: the caption, whose card it belongs to, and who made it.
    el.addEventListener('pointerenter', () => caption(f));
    el.addEventListener('pointerleave', () => { cap.hidden = true; });
  }
  const W = { eras, era: -2, geo: '', dark: null, cards: [], own: false, key: '', due: Infinity, slots: SLOTS, warm: [227, 178, 95], cool: [120, 169, 240], want: null, last: 0 };
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const still = () => calm() || (navigator.connection && navigator.connection.saveData);

  // One picture or film in one layer of a frame. A film plays muted and looped, only while its era is in sight.
  function fill(layer, m) {
    layer.innerHTML = '';
    if (!m) return null;
    let el;
    if (m.type === 'video' && !still()) {
      el = document.createElement('video');
      el.muted = true; el.loop = !m.end; el.playsInline = true; el.preload = 'metadata';
      el.setAttribute('muted', ''); el.setAttribute('playsinline', '');
      if (m.poster) el.poster = m.poster;
      el.src = m.src + (m.start ? `#t=${m.start}` : '');
      // A film with an end in the data loops between its start and its end.
      if (m.end) el.addEventListener('timeupdate', () => { if (el.currentTime >= m.end) el.currentTime = m.start || 0; });
    } else {
      el = document.createElement('img');
      el.decoding = 'async'; el.loading = 'lazy'; el.alt = '';
      el.src = m.type === 'video' ? m.poster || '' : m.src;
    }
    el.addEventListener('error', () => layer.classList.add('broken'), { once: true });
    layer.classList.remove('broken');
    layer.appendChild(el);
    return el;
  }
  const play = (layer) => { const v = layer.querySelector('video'); if (v) v.play().catch(() => {}); };
  const stop = (layer) => { const v = layer.querySelector('video'); if (v) v.pause(); };

  const text = (v) => String(v || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  function caption(f) {
    const m = f.item;
    if (!m) return;
    const by = [m.credit, m.licence].filter(Boolean).join(', ');
    cap.innerHTML = `<b>${text(m.caption || m.alt)}</b><small>${f.card ? `<i style="background:${text(f.card.col || 'currentColor')}"></i>${text(f.card.name)}${by ? ' · ' : ''}` : ''}${text(by)}</small>`;
    cap.hidden = false;
    const r = f.el.getBoundingClientRect(), h = host.getBoundingClientRect(), w = cap.offsetWidth;
    cap.style.left = clamp(r.left - h.left + r.width / 2 - w / 2, 8, Math.max(8, h.width - w - 8)).toFixed(0) + 'px';
    cap.style.top = Math.min(r.bottom - h.top + 8, h.height - cap.offsetHeight - 8).toFixed(0) + 'px';
  }

  // A frame takes the shape of what it shows, so a picture fills it whole: wide for a landscape, tall for a
  // portrait, a little taller than its place at most (TALL), centred where it stands, so a picture is never
  // cut and never sits small inside a box of the wrong shape.
  function fit(f) {
    if (!f.bw) return;
    const r = f.ar || f.bw / f.bh, wMax = f.bw, hMax = f.bh * TALL;
    let w = wMax, h = w / r;
    if (h > hMax) { h = hMax; w = h * r; }
    f.el.style.width = w.toFixed(0) + 'px'; f.el.style.height = h.toFixed(0) + 'px';
  }
  const aspect = (el) => {
    const w = el.naturalWidth || el.videoWidth, h = el.naturalHeight || el.videoHeight;
    return w && h ? Math.min(2.2, Math.max(0.5, w / h)) : 0;
  };

  // Puts one picture or film in one frame: it fades from what it held to what it now holds. `card` is the
  // card on the road it belongs to (its border takes the card's colour), or null for a picture of the era.
  function put(f, m, card) {
    f.from = m ? (card ? 'card' : 'era') : undefined;
    f.card = m ? card : null; f.live = !!card; f.gone = 0;
    if (card && card.col) f.el.style.setProperty('--wf-c', card.col); else f.el.style.removeProperty('--wf-c');
    f.el.classList.toggle('mine', !!(card && card.col));
    f.el.classList.toggle('quiet', !!(card && card.quiet));
    if (m === f.item) return;
    f.item = m;
    const next = 1 - f.on, layer = f.layers[next], old = f.layers[f.on];
    const el = fill(layer, m);
    f.on = next;
    // Once its size is known, the frame takes the picture's shape.
    const shape = () => { const r = f.item === m && aspect(el); if (r) { f.ar = r; fit(f); } };
    if (el) { if (el.tagName === 'VIDEO') el.addEventListener('loadedmetadata', shape, { once: true }); else if (el.complete) shape(); else el.addEventListener('load', shape, { once: true }); }
    if (m) f.el.href = m.source || m.src; else f.el.removeAttribute('href');
    f.el.setAttribute('aria-label', m ? m.alt || '' : '');
    f.el.classList.toggle('video', !!m && m.type === 'video');
    // The new layer comes up once it has something to show, or after a moment whatever happens.
    const up = () => { if (f.on !== next) return; layer.classList.add('on'); old.classList.remove('on'); setTimeout(() => { stop(old); if (f.on === next) old.innerHTML = ''; }, 1400); };
    if (el && el.tagName === 'VIDEO') { el.addEventListener('loadeddata', up, { once: true }); play(layer); setTimeout(up, 1500); }
    else if (el && !el.complete) { el.addEventListener('load', up, { once: true }); setTimeout(up, 1500); }
    else up();
    f.el.classList.toggle('empty', !m);
  }

  // Shares the frames out. The cards on show come first: each picture of theirs goes up on its card's
  // side, and stays where it is for as long as its card does, and HOLD seconds more. Frames no card needs
  // show the era. It runs only when the cards on show or the era change, or a hold runs out: a few short
  // loops over twelve frames, and nothing per frame of the road.
  function share(now) {
    // Views with pictures of their own show only those; the era's stand in for views that have none yet.
    const era = W.era >= 0 && !W.own ? sidesOf(W.eras[W.era]) : { left: [], right: [] }, hold = (W.own ? HOLD_OWN : HOLD) * 1000;
    const use = frames.filter((f) => f.k < W.slots), live = new Map();
    for (const c of W.cards) for (const m of c.media) if (!live.has(m)) live.set(m, c);
    for (const f of use) {
      if (f.from !== 'card') continue;
      const c = live.get(f.item);
      if (c) { put(f, f.item, c); live.delete(f.item); }
      else if (f.live) { f.live = false; f.gone = now; }
    }
    for (const [m, c] of live) {
      const count = (sd) => use.filter((f) => f.side === sd && f.from === 'card').length;
      // A card with no side of its own (a road of one view, a middle lane) takes the emptier side, left first.
      const sd = c.side || (count(-1) <= count(1) ? -1 : 1);
      const mine = use.filter((f) => f.side === sd), i = slotFor(mine);
      if (i >= 0) put(mine[i], m, c);
    }
    W.due = Infinity;
    for (const f of use) {
      if (f.from === 'card' && !f.live) {
        if (now - f.gone < hold) { W.due = Math.min(W.due, f.gone + hold); continue; }
      } else if (f.from === 'card') continue;
      put(f, (f.side < 0 ? era.left : era.right)[f.k] || null, null);
    }
  }

  // The sky: a scatter of faint stars and a few soft clouds of haze, on the gradient of the void. Drawn once per size and theme.
  function drawSky(G, dark, dpr) {
    const c = sky.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, G.SW, G.SH);
    if (!dark) {
      // The day sky: the sun low over the far end of the road, a pale moon, a few stars still out high up,
      // and soft clouds. The blue itself is the gradient in CSS.
      const sun = c.createRadialGradient(G.vx, G.vy, 0, G.vx, G.vy, Math.max(G.SW, G.SH) * 0.36);
      sun.addColorStop(0, 'rgba(255,248,222,0.95)'); sun.addColorStop(0.1, 'rgba(255,240,200,0.5)'); sun.addColorStop(0.4, 'rgba(255,238,205,0.12)'); sun.addColorStop(1, 'rgba(255,236,200,0)');
      c.fillStyle = sun; c.fillRect(0, 0, G.SW, G.SH);
      const stars = Math.round(G.SW / 26);
      for (let i = 0; i < stars; i++) {
        const x = hash(i * 3 + 1) * G.SW, y = Math.pow(hash(i * 3 + 2), 2.2) * G.vy * 0.9, b = hash(i * 3 + 3);
        c.fillStyle = `rgba(255,255,255,${(0.25 + 0.5 * b).toFixed(2)})`;
        c.fillRect(x, y, b > 0.9 ? 1.6 : 1, b > 0.9 ? 1.6 : 1);
      }
      const mx = G.SW * 0.78, my = Math.max(54, G.vy * 0.42), mr = Math.max(13, G.SH * 0.024);
      const moon = c.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 0, mx, my, mr);
      moon.addColorStop(0, 'rgba(255,255,255,0.8)'); moon.addColorStop(0.8, 'rgba(255,255,255,0.5)'); moon.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = moon; c.beginPath(); c.arc(mx, my, mr, 0, 7); c.fill();
      c.globalCompositeOperation = 'destination-out';      // the part of the moon in shadow shows the sky
      c.beginPath(); c.arc(mx + mr * 0.62, my - mr * 0.18, mr * 0.98, 0, 7); c.fill();
      c.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 16; i++) {
        const x = hash(i * 9 + 11) * G.SW, y = i < 9 ? G.vy * (0.25 + 0.75 * hash(i * 9 + 12)) : G.vy + (G.SH - G.vy) * (0.12 + 0.85 * hash(i * 9 + 12)), w = (0.1 + 0.16 * hash(i * 9 + 13)) * G.SW * (i < 9 ? 1 : 1.5);
        for (let k = 0; k < 5; k++) {
          const px = x + (hash(i * 31 + k) - 0.5) * w * 1.5, py = y + (hash(i * 37 + k) - 0.5) * w * 0.12, r = w * (0.3 + 0.3 * hash(i * 41 + k));
          c.save(); c.translate(px, py); c.scale(1, 0.26);
          const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
          g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = g; c.fillRect(-r, -r, 2 * r, 2 * r); c.restore();
        }
      }
      return;
    }
    for (let i = 0; i < 7; i++) {
      const x = hash(i * 9 + 11) * G.SW, y = G.vy * 0.3 + hash(i * 9 + 12) * G.SH * 0.6, r = (0.12 + 0.2 * hash(i * 9 + 13)) * Math.max(G.SW, G.SH);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(120,135,165,0.07)'); g.addColorStop(1, 'rgba(120,135,165,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    // A faint light where the road meets the horizon.
    const h = c.createRadialGradient(G.vx, G.vy, 0, G.vx, G.vy, G.SW * 0.22);
    h.addColorStop(0, 'rgba(190,205,235,0.16)'); h.addColorStop(1, 'rgba(190,205,235,0)');
    c.fillStyle = h; c.fillRect(0, 0, G.SW, G.SH);
    const n = Math.round((G.SW * G.SH) / 4200);
    for (let i = 0; i < n; i++) {
      const x = hash(i * 3 + 1) * G.SW, y = Math.pow(hash(i * 3 + 2), 1.5) * G.SH * 0.85, b = hash(i * 3 + 3);
      const r = b > 0.985 ? 1.6 : b > 0.9 ? 1.1 : 0.7;
      c.fillStyle = `rgba(215,225,250,${(0.12 + 0.55 * b * b * b).toFixed(3)})`;
      c.fillRect(x - r / 2, y - r / 2, r, r);
    }
  }

  function layout(G) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const k of [sky, cv]) { k.width = Math.round(G.SW * dpr); k.height = Math.round(G.SH * dpr); }
    const F = Math.round(G.gh * 1.2);
    W.F = F;
    scene.style.perspective = F + 'px';
    scene.style.perspectiveOrigin = `${G.vx}px ${G.vy}px`;
    origin.style.left = G.vx + 'px'; origin.style.top = G.vy + 'px';
    const fw = G.RW * (G.phone ? 1.45 : 0.6);
    W.slots = G.phone ? FRAMES_PHONE.length : SLOTS;
    for (const f of frames) {
      const s = (G.phone ? FRAMES_PHONE : FRAMES)[f.k], hide = G.short || !s;
      f.el.classList.toggle('off', hide);
      if (hide) continue;
      const half = f.side < 0 ? G.vx : G.SW - G.vx;
      const w = fw * s.w, h = w * 0.6, d = s.d, x = f.side * s.x * half * (1 + d), y = s.y * G.gh;
      f.bw = w; f.bh = h; fit(f);
      f.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${(-F * d).toFixed(1)}px) rotateY(${f.side < 0 ? TILT : -TILT}deg) translate(-50%,-50%)`;
    }
    host.style.setProperty('--wall-h', (100 * G.vy / G.SH).toFixed(1) + '%');
    drawSky(G, W.dark, dpr);
  }

  // Each frame the reader moves: the rails of light and the dust, in the road's perspective. A point at
  // depth d (focal lengths) and place x (road half widths) is seen at vx + x RW / (1 + d). Both stand still
  // in the world, so as the reader travels they come towards them.
  function draw(G, travel, dark) {
    const dpr = Math.min(2, devicePixelRatio || 1), c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, G.SW, G.SH);
    const fog = (d) => Math.exp(-(FOG * d) * (FOG * d));
    c.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    for (const [i, r] of RAILS.entries()) {
      const col = r.x < 0 ? W.warm : W.cool, rgb = `${Math.round(col[0])},${Math.round(col[1])},${Math.round(col[2])}`;
      const at = (d) => { const k = 1 / (1 + d); return [G.vx + r.x * G.RW * k, G.vy + G.gh * k]; };
      // The rail: faint, fading into the fog.
      const [x0, y0] = at(-0.15), [x1, y1] = at(9);
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(${rgb},${dark ? 0.6 : 0.5})`); g.addColorStop(0.5, `rgba(${rgb},${dark ? 0.22 : 0.2})`); g.addColorStop(1, `rgba(${rgb},0)`);
      c.strokeStyle = g; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      // Its pulses: streaks of light that stand still on the ground, so they rush past as the reader travels.
      const off = hash(i + 40);
      for (let n = Math.ceil((travel - 0.15) * r.f - off); ; n++) {
        const d = (n + off) / r.f - travel;
        if (d > 7) break;
        const len = 0.28 + 0.24 * hash(n * 7 + i), [ax, ay] = at(d), [bx, by] = at(d + len), a = fog(d) * (dark ? 0.95 : 0.6);
        const s = c.createLinearGradient(ax, ay, bx, by);
        s.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`); s.addColorStop(1, `rgba(${rgb},0)`);
        c.strokeStyle = s;
        const w = Math.max(1, 3.2 / (1 + d));
        c.lineWidth = w * 3; c.globalAlpha = 0.25; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
        c.lineWidth = w; c.globalAlpha = 1; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      }
    }
    // The dust: tiny motes that drift towards the reader with the road and fade into the fog.
    const span = 9, ink = dark ? '205,215,235' : '255,255,255';
    for (const m of motes) {
      const d = (((m.d - travel) % span) + span) % span - 0.3, k = 1 / (1 + d);
      const x = G.vx + m.x * G.RW * k, y = G.vy + m.y * G.gh * k;
      if (x < -4 || x > G.SW + 4 || y < -4 || y > G.SH + 4) continue;
      const a = m.b * fog(d) * Math.min(1, (d + 0.3) / 0.6) * (dark ? 0.6 : 0.8);
      if (a < 0.015) continue;
      const sz = Math.max(0.7, 2.4 * k);
      c.fillStyle = `rgba(${ink},${a.toFixed(3)})`;
      c.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    c.globalCompositeOperation = 'source-over';
  }

  // A film rests while the page is not in sight.
  document.addEventListener('visibilitychange', () => {
    for (const f of frames) { const v = f.layers[f.on].querySelector('video'); if (v) { if (document.hidden) v.pause(); else v.play().catch(() => {}); } }
  });

  return {
    // New eras, from the data or from anyone who wants another wall.
    setEras(eras) { W.eras = eras || []; W.era = -2; W.key = ''; },
    // Called once a frame by the road: `year` is the written year in front of the reader, `travel`
    // how far they have come in focal lengths (the points flow past with it), G the stage.
    frame({ year, travel = 0, G, dark = true, dt = 0, cards = [], own = false }) {
      const geo = [G.SW, G.SH, G.vx, G.vy, G.RW, G.short, dark].join();
      if (dark !== W.dark) { W.dark = dark; host.classList.toggle('light', !dark); }
      if (geo !== W.geo) { W.geo = geo; layout(G); W.key = ''; }
      let busy = false;
      const i = W.eras.length ? eraAt(W.eras, year) : -1;
      if (i !== W.era) {
        W.era = i;
        if (i >= 0) {
          const t = W.eras[i].tone || {};
          W.want = { warm: rgbOf(t.warm, [227, 178, 95]), cool: rgbOf(t.cool, [120, 169, 240]) };
          host.dataset.era = W.eras[i].id || '';
        }
      }
      // The frames: the pictures of the cards on show, and the era's in the frames they leave free.
      let key = i + (own ? 'o' : 'e');
      for (const c of cards) key += '|' + c.id + c.side + (c.quiet ? 'q' : '') + (c.col || '') + c.media.length;   // another colour, or a picture that came in later, reframes too
      const now = performance.now();
      if (key !== W.key || now >= W.due) { W.key = key; W.cards = cards; W.own = own; share(now); }
      if (W.due < Infinity) busy = true;
      // The light of the era eases in.
      if (W.want) {
        const k = dt ? 1 - Math.exp(-dt * 1.6) : 1;
        for (const key of ['warm', 'cool']) {
          W[key] = W[key].map((v, n) => { const to = W.want[key][n]; return Math.abs(to - v) < 0.6 ? to : v + (to - v) * k; });
          if (W[key].some((v, n) => v !== W.want[key][n])) busy = true;
        }
        host.style.setProperty('--wall-warm', `rgb(${W.warm.map(Math.round).join(',')})`);
        host.style.setProperty('--wall-cool', `rgb(${W.cool.map(Math.round).join(',')})`);
      }
      draw(G, travel, dark);
      return busy;
    },
    // The light on each wall now, for the road to borrow.
    light() { return { warm: W.warm, cool: W.cool }; },
    // Empties every frame, for when other views take the road: what the old ones showed must not linger.
    reset() {
      for (const f of frames) { f.live = false; f.gone = 0; put(f, null, null); }
      W.cards = []; W.key = ''; W.due = Infinity;
    },
    clear() {
      for (const k of [sky, cv]) k.getContext('2d').clearRect(0, 0, k.width, k.height);
      W.geo = '';
    },
  };
}
