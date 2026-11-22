/* codegrave: the media wall. Two curved walls stand either side of the road,
   made of a fine grid of points, with a few frames floating in front of
   each that show pictures and short films of the era the reader is in.

   It is one component with one way in. createWall(host) makes it inside an
   element; wall.frame(props) is called once a frame by the road, with where
   the reader is, and returns true while it is still fading something. The
   media come in as plain data, an array of eras:

     { id, name, from, to,                 // written years, `to` not included
       tone: { warm: '#e3b25f', cool: '#78a9f0' },   // the light on the left and right walls
       media: [ { src, type: 'image' | 'video', poster, alt, credit, licence, source, start, end, side } ] }

   Nothing here knows about entries or views, so the same wall can be fed
   any list of eras. The arithmetic (which era, which frames) is pure and
   exported for the tests. */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const SLOTS = 6;      // frames on each wall

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

// Where the frames stand on each wall, most visible first: `d` is the depth along the road in focal
// lengths (like the road's own u / D), `x` how far out from the middle of the screen the frame is seen
// (a share of the half width), `y` its height (a share of the eye's height above the ground, negative
// above the horizon), and `w` its size.
export const FRAMES = [
  { d: 0.45, x: 0.58, y: 0.10, w: 1.00 },
  { d: 0.50, x: 0.72, y: 0.52, w: 0.86 },
  { d: 1.10, x: 0.27, y: -0.07, w: 0.92 },
  { d: 1.20, x: 0.36, y: 0.38, w: 0.80 },
  { d: 0.28, x: 0.95, y: 0.24, w: 0.95 },
  { d: 2.20, x: 0.15, y: -0.22, w: 0.86 },
];
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

// A small steady random number for a whole number: the same point always twinkles the same way.
const hash = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

export function createWall(host, { eras = [] } = {}) {
  host.innerHTML = '<canvas class="w-sky"></canvas><canvas class="w-cv"></canvas><div class="w-scene"><div class="w-o"></div></div>';
  const sky = host.children[0], cv = host.children[1], scene = host.children[2], origin = scene.firstChild;
  const frames = [];
  for (const side of [-1, 1]) for (let k = 0; k < SLOTS; k++) {
    const el = document.createElement('a');
    el.className = 'wf'; el.target = '_blank'; el.rel = 'noopener'; el.tabIndex = -1;
    el.innerHTML = '<span class="wm"></span><span class="wm"></span>';
    el.style.setProperty('--k', k + (side > 0 ? 0.5 : 0));      // the frames change one after another, not all at once
    origin.appendChild(el);
    frames.push({ el, side, k, layers: [...el.children], on: 0, item: undefined });
    el.classList.add('empty');
  }
  const W = { eras, era: -2, geo: '', dark: null, warm: [227, 178, 95], cool: [120, 169, 240], want: null, last: 0 };
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

  // Puts an era's media up: each frame fades from what it held to what it now holds.
  function show(i) {
    const { left, right } = sidesOf(W.eras[i]);
    for (const f of frames) {
      const m = (f.side < 0 ? left : right)[f.k] || null;
      if (m === f.item) continue;
      f.item = m;
      const next = 1 - f.on, layer = f.layers[next], old = f.layers[f.on];
      const el = fill(layer, m);
      f.on = next;
      f.el.href = m ? m.source || m.src : '';
      f.el.title = m ? [m.alt, [m.credit, m.licence].filter(Boolean).join(', ')].filter(Boolean).join(' · ') : '';
      f.el.classList.toggle('video', !!m && m.type === 'video');
      // The new layer comes up once it has something to show, or after a moment whatever happens.
      const up = () => { if (f.on !== next) return; layer.classList.add('on'); old.classList.remove('on'); setTimeout(() => { if (f.on !== next) { stop(old); } else { stop(old); old.innerHTML = ''; } }, 1400); };
      if (el && el.tagName === 'VIDEO') { el.addEventListener('loadeddata', up, { once: true }); play(layer); setTimeout(up, 1500); }
      else if (el && !el.complete) { el.addEventListener('load', up, { once: true }); setTimeout(up, 1500); }
      else up();
      f.el.classList.toggle('empty', !m);
    }
  }

  // The sky: a dark field, a glow at the horizon, a scatter of stars joined here and there. Drawn once per size and theme.
  function drawSky(G, dark, dpr) {
    const c = sky.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, G.SW, G.SH);
    if (!dark) {
      const g = c.createRadialGradient(G.vx, G.vy, 0, G.vx, G.vy, Math.max(G.SW, G.SH) * 0.8);
      g.addColorStop(0, 'rgba(255,250,236,1)'); g.addColorStop(1, 'rgba(238,233,220,1)');
      c.fillStyle = g; c.fillRect(0, 0, G.SW, G.SH);
      return;
    }
    const g = c.createRadialGradient(G.vx, G.vy, 0, G.vx, G.vy, Math.max(G.SW, G.SH) * 0.9);
    g.addColorStop(0, '#1b2333'); g.addColorStop(0.35, '#0e131d'); g.addColorStop(1, '#05070b');
    c.fillStyle = g; c.fillRect(0, 0, G.SW, G.SH);
    // The stars and a few constellations, above the horizon mostly.
    const n = Math.round((G.SW * G.SH) / 5200), pts = [];
    for (let i = 0; i < n; i++) {
      const x = hash(i * 3 + 1) * G.SW, y = Math.pow(hash(i * 3 + 2), 1.6) * G.SH * 0.9, b = hash(i * 3 + 3);
      pts.push([x, y]);
      c.fillStyle = `rgba(220,228,255,${(0.15 + 0.6 * b * b).toFixed(3)})`;
      const r = b > 0.97 ? 1.6 : b > 0.85 ? 1.1 : 0.7;
      c.fillRect(x - r / 2, y - r / 2, r, r);
    }
    c.lineWidth = 0.6;
    for (let i = 0; i < pts.length; i++) {
      if (hash(i + 999) > 0.18) continue;
      const [x, y] = pts[i];
      let best = null, bd = Infinity;
      for (let j = 0; j < pts.length; j++) { if (j === i) continue; const d = Math.hypot(pts[j][0] - x, pts[j][1] - y); if (d < bd && d > 12) { bd = d; best = pts[j]; } }
      if (!best || bd > 150) continue;
      c.strokeStyle = 'rgba(160,185,235,0.16)';
      c.beginPath(); c.moveTo(x, y); c.lineTo(best[0], best[1]); c.stroke();
    }
    // A bright star over the far end of the road.
    const sx = G.vx, sy = G.vy * 0.42, h = c.createRadialGradient(sx, sy, 0, sx, sy, 60);
    h.addColorStop(0, 'rgba(235,242,255,0.9)'); h.addColorStop(0.08, 'rgba(200,220,255,0.35)'); h.addColorStop(1, 'rgba(160,190,255,0)');
    c.fillStyle = h; c.fillRect(sx - 60, sy - 60, 120, 120);
    c.strokeStyle = 'rgba(225,235,255,0.5)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(sx - 26, sy); c.lineTo(sx + 26, sy); c.moveTo(sx, sy - 26); c.lineTo(sx, sy + 26); c.stroke();
    // A haze along the horizon.
    const hz = c.createLinearGradient(0, G.vy - 60, 0, G.vy + 90);
    hz.addColorStop(0, 'rgba(120,150,210,0)'); hz.addColorStop(0.5, 'rgba(120,150,210,0.10)'); hz.addColorStop(1, 'rgba(120,150,210,0)');
    c.fillStyle = hz; c.fillRect(0, G.vy - 60, G.SW, 150);
  }

  // The shape of a wall: how far from the middle of the road it stands at a depth (in focal lengths),
  // in the road's own units at the reader's feet. It bends away as it goes, so it reads as curved.
  const wallX = (G, d) => G.RW * (G.phone ? 1.12 : 1.22) + G.RW * 0.5 * Math.max(0, d);
  const wallTop = (G, d) => -G.gh * (0.95 - 0.04 * Math.min(d, 8));

  function layout(G) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const k of [sky, cv]) { k.width = Math.round(G.SW * dpr); k.height = Math.round(G.SH * dpr); }
    const F = Math.round(G.gh * 1.2);
    W.F = F;
    scene.style.perspective = F + 'px';
    scene.style.perspectiveOrigin = `${G.vx}px ${G.vy}px`;
    origin.style.left = G.vx + 'px'; origin.style.top = G.vy + 'px';
    const fw = G.RW * (G.phone ? 1.45 : 0.6);
    for (const f of frames) {
      const s = (G.phone ? FRAMES_PHONE : FRAMES)[f.k], hide = G.short || !s;
      f.el.classList.toggle('off', hide);
      if (hide) continue;
      const half = f.side < 0 ? G.vx : G.SW - G.vx;
      const w = fw * s.w, h = w * 0.6, d = s.d, x = f.side * s.x * half * (1 + d), y = s.y * G.gh;
      f.el.style.width = w.toFixed(0) + 'px'; f.el.style.height = h.toFixed(0) + 'px';
      f.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${(-F * d).toFixed(1)}px) rotateY(${f.side < 0 ? 36 : -36}deg) translate(-50%,-50%)`;
    }
    drawSky(G, W.dark, dpr);
  }

  // Draws the walls: a grid of points that flows past as the reader travels, brighter near, lit by the era.
  function draw(G, travel) {
    const dpr = Math.min(2, devicePixelRatio || 1), c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, G.SW, G.SH);
    const dark = W.dark, STEP = 0.14, ROWS = G.phone ? 14 : 20, SPAN = 8.4;
    const shift = ((travel % STEP) + STEP) % STEP, base = Math.floor(travel / STEP);
    for (const side of [-1, 1]) {
      const col = side < 0 ? W.warm : W.cool, rgb = `${col[0]},${col[1]},${col[2]}`;
      // The foot of the wall glows where it meets the ground.
      c.lineWidth = 1.2;
      c.beginPath();
      for (let d = -0.2; d <= SPAN; d += 0.2) { const k = 1 / (1 + d), x = G.vx + side * wallX(G, d) * k, y = G.vy + G.gh * k; d <= -0.2 ? c.moveTo(x, y) : c.lineTo(x, y); }
      const gl = c.createLinearGradient(0, G.vy, 0, G.SH);
      gl.addColorStop(0, `rgba(${rgb},0)`); gl.addColorStop(1, `rgba(${rgb},${dark ? 0.75 : 0.5})`);
      c.strokeStyle = gl; c.stroke();
      // The face of the wall: a faint light rising from its foot.
      c.beginPath();
      for (let d = -0.2; d <= SPAN; d += 0.25) { const k = 1 / (1 + d); c.lineTo(G.vx + side * wallX(G, d) * k, G.vy + G.gh * k); }
      for (let d = SPAN; d >= -0.2; d -= 0.25) { const k = 1 / (1 + d); c.lineTo(G.vx + side * wallX(G, d) * k, G.vy + wallTop(G, d) * k); }
      c.closePath();
      const face = c.createLinearGradient(side < 0 ? 0 : G.SW, 0, G.vx + side * G.RW * 0.4, 0);
      face.addColorStop(0, `rgba(${rgb},${dark ? 0.10 : 0.06})`); face.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = face; c.fill();
      const stars = [];
      // The points: columns along the depth, rows up the wall. Every fourth is a faint line.
      for (let i = 0; i * STEP < SPAN + STEP; i++) {
        const d = i * STEP - shift - 0.2, k = 1 / (1 + d);
        if (d < -0.2) continue;
        const id = base + i, x = G.vx + side * wallX(G, d) * k;
        if (x < -4 || x > G.SW + 4) continue;
        const near = clamp(1 - d / SPAN, 0, 1), top = wallTop(G, d), yb = G.vy + G.gh * k, yt = G.vy + top * k;
        const fade = near * near * clamp((d + 0.2) / 0.5, 0, 1);
        if (id % 4 === 0) {
          c.strokeStyle = `rgba(${rgb},${(0.2 * fade).toFixed(3)})`; c.lineWidth = 0.8;
          c.beginPath(); c.moveTo(x, yb); c.lineTo(x, yt); c.stroke();
        }
        for (let j = 0; j <= ROWS; j++) {
          const v = j / ROWS, y = yb + (yt - yb) * v, r = hash(id * 131 + j * 7 + (side > 0 ? 5 : 0));
          if (r < 0.35) continue;
          const a = fade * (dark ? 1 : 0.7) * (0.3 + 0.7 * Math.pow(r, 5)) * (1 - v * 0.45);
          if (a < 0.02) continue;
          const sz = (r > 0.985 ? 2.8 : r > 0.9 ? 1.8 : 1.2) * Math.max(0.5, k * 1.3);
          if (r > 0.975 && a > 0.08) stars.push([x, y, a]);
          c.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
          c.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        }
      }
      // The brightest points are joined here and there, like a constellation.
      c.lineWidth = 0.7;
      for (let n = 1; n < stars.length; n++) {
        const [x0, y0, a0] = stars[n - 1], [x1, y1, a1] = stars[n];
        if (Math.hypot(x1 - x0, y1 - y0) > 140) continue;
        c.strokeStyle = `rgba(${rgb},${(0.45 * Math.min(a0, a1)).toFixed(3)})`;
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      }
      // A few rows as faint lines across the wall.
      for (let j = 0; j <= ROWS; j += 5) {
        const v = j / ROWS;
        c.beginPath();
        for (let d = -0.2; d <= SPAN; d += 0.25) { const k = 1 / (1 + d), yb = G.vy + G.gh * k, yt = G.vy + wallTop(G, d) * k, x = G.vx + side * wallX(G, d) * k, y = yb + (yt - yb) * v; d <= -0.2 ? c.moveTo(x, y) : c.lineTo(x, y); }
        const g = c.createLinearGradient(side < 0 ? 0 : G.SW, 0, G.vx, 0);
        g.addColorStop(0, `rgba(${rgb},${dark ? 0.14 : 0.1})`); g.addColorStop(1, `rgba(${rgb},0)`);
        c.strokeStyle = g; c.lineWidth = 0.8; c.stroke();
      }
    }
  }

  // A film rests while the page is not in sight.
  document.addEventListener('visibilitychange', () => {
    for (const f of frames) { const v = f.layers[f.on].querySelector('video'); if (v) { if (document.hidden) v.pause(); else v.play().catch(() => {}); } }
  });

  return {
    // New eras, from the data or from anyone who wants another wall.
    setEras(eras) { W.eras = eras || []; W.era = -2; },
    // Called once a frame by the road: `year` is the written year in front of the reader, `travel`
    // how far they have come in focal lengths (the points flow past with it), G the stage.
    frame({ year, travel = 0, G, dark = true, dt = 0 }) {
      const geo = [G.SW, G.SH, G.vx, G.vy, G.RW, G.short, dark].join();
      if (dark !== W.dark) { W.dark = dark; host.classList.toggle('light', !dark); }
      if (geo !== W.geo) { W.geo = geo; layout(G); }
      let busy = false;
      const i = W.eras.length ? eraAt(W.eras, year) : -1;
      if (i !== W.era) {
        W.era = i;
        if (i >= 0) {
          show(i);
          const t = W.eras[i].tone || {};
          W.want = { warm: rgbOf(t.warm, [227, 178, 95]), cool: rgbOf(t.cool, [120, 169, 240]) };
          host.dataset.era = W.eras[i].id || '';
        }
      }
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
      draw(G, travel);
      return busy;
    },
    // The light on each wall now, for the road to borrow.
    light() { return { warm: W.warm, cool: W.cool }; },
    clear() {
      for (const k of [sky, cv]) k.getContext('2d').clearRect(0, 0, k.width, k.height);
      W.geo = '';
    },
  };
}
