/* Film mode: what the overlay shots draw. A frame says what is to be seen (`F.ov`, `F.pic`); this
   puts it there: regions, shapes and routes as layers of the site's own map, so they lie on the
   globe as the land does, and marks, words, stamps and pictures as elements over it, placed where
   the map says their place is this frame. Nothing here remembers a frame: the same list draws the
   same picture. */
const ICON = {
  plane: '<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M11 0c0 .9-1.6 1.5-3.4 1.5H3.4L-2.8 9.5h-2.4l2.9-8H-7l-2 2.6h-1.9L-9.6 0l-1.3-4.1H-9l2 2.6h4.7l-2.9-8h2.4l6.2 8h4.2C9.4-1.5 11-.9 11 0z" fill="currentColor"/></svg>',
  ship: '<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M11 0C8.5 3.4 5.2 5 1 5h-10.5c-1 0-1.5-.6-1.5-1.5v-7C-11-4.400-10.500-5-9.500-5H1C5.200-5 8.500-3.400 11 0z" fill="currentColor"/><path d="M-7-2.200h6.500v4.400H-7z" fill="rgba(5,7,12,.55)"/></svg>',
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const RAD = Math.PI / 180;

export function createOverlays({ stage, host, W, H, regionGeometry, bitmapOf }) {
  const layer = document.createElement('div'); layer.className = 'film-ov';
  const shade = document.createElement('div'); shade.className = 'film-pic'; shade.hidden = true;
  shade.innerHTML = '<i></i><canvas></canvas>';
  host.appendChild(layer); stage.appendChild(shade);
  const els = new Map();      // an element for each thing shown, kept while it is shown
  let map = null, polySig = '', lineSig = '', picKey = '';

  // The layers on the map: made once, under the lit line and the pins, over the land.
  function ensure(m) {
    if (!m || m === map || !m.getLayer('way')) return;
    map = m; polySig = lineSig = '';
    const empty = { type: 'FeatureCollection', features: [] };
    map.addSource('film-poly', { type: 'geojson', data: empty });
    map.addSource('film-line', { type: 'geojson', data: empty });
    map.addLayer({ id: 'film-fill', type: 'fill', source: 'film-poly', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': ['get', 'o'] } }, 'way');
    map.addLayer({ id: 'film-edge', type: 'line', source: 'film-poly', filter: ['!', ['get', 'dash']], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': ['get', 'w'], 'line-opacity': ['get', 'lo'] } }, 'way');
    map.addLayer({ id: 'film-edge-dash', type: 'line', source: 'film-poly', filter: ['get', 'dash'], paint: { 'line-color': ['get', 'c'], 'line-width': ['get', 'w'], 'line-opacity': ['get', 'lo'], 'line-dasharray': [2, 2] } }, 'way');
    map.addLayer({ id: 'film-route-glow', type: 'line', source: 'film-line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': ['*', ['get', 'w'], 3.4], 'line-opacity': ['*', ['get', 'o'], 0.2], 'line-blur': 5 } }, 'way');
    map.addLayer({ id: 'film-route', type: 'line', source: 'film-line', filter: ['!', ['get', 'dash']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': ['get', 'w'], 'line-opacity': ['get', 'o'] } }, 'way');
    map.addLayer({ id: 'film-route-dash', type: 'line', source: 'film-line', filter: ['get', 'dash'], paint: { 'line-color': ['get', 'c'], 'line-width': ['get', 'w'], 'line-opacity': ['get', 'o'], 'line-dasharray': [1.6, 1.6] } }, 'way');
  }

  // Where a place is on the stage this frame, or null when it is round the back of the globe.
  function where(at, cam) {
    if (at.x != null) return { x: at.x * W, y: at.y * H, fixed: true };
    if (!map) return null;
    const a = at.lat * RAD, b = cam.lat * RAD, dl = (at.lng - cam.lng) * RAD;
    const away = Math.acos(Math.max(-1, Math.min(1, Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(dl)))) / RAD;
    // From far off a little less than half the globe is in sight; close in, the frame cuts off far less than that.
    if (away > 84) return null;
    const p = map.project([at.lng, at.lat]);
    return Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
  }
  const put = (key, cls, html) => {
    let el = els.get(key);
    if (!el) { el = document.createElement('div'); el.className = cls; el.dataset.html = ''; layer.appendChild(el); els.set(key, el); }
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    el.dataset.seen = '1';
    return el;
  };
  const move = (el, p, extra = '') => { el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) ${extra}`; };

  function draw(F) {
    const feats = [], lines = [], psig = [], lsig = [], hidden = F.sp > 0.5;
    for (const el of els.values()) el.dataset.seen = '';
    for (const o of F.ov) {
      if (o.k === 'region' || o.k === 'shape') {
        const geometry = o.k === 'region' ? regionGeometry(o.key) : o.geometry;
        if (!geometry || hidden) continue;
        const props = { c: o.c, o: +o.o.toFixed(4), lo: +o.lo.toFixed(4), w: o.w || 1.5, dash: !!o.dash };
        feats.push({ type: 'Feature', properties: props, geometry });
        psig.push((o.k === 'region' ? o.key : o.sig) + JSON.stringify(props));
      } else if (o.k === 'route') {
        if (hidden) continue;
        const props = { c: o.c, o: +o.o.toFixed(4), w: o.w, dash: !!o.dash };
        lines.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: o.coords } });
        lsig.push(o.id + o.coords.length + ':' + o.coords[o.coords.length - 1].map((v) => v.toFixed(5)).join() + JSON.stringify(props));
      } else if (o.k === 'head') {
        const p = hidden ? null : where(o.at, F.cam), q = p && where(o.before, F.cam);
        if (!p) continue;
        const turn = q && (Math.abs(p.x - q.x) > 0.01 || Math.abs(p.y - q.y) > 0.01) ? Math.atan2(p.y - q.y, p.x - q.x) / RAD : 0;
        const el = put('head:' + o.id, 'film-head ' + o.icon, o.icon === 'dot' ? '<b></b>' : ICON[o.icon] || '');
        el.style.color = o.c; el.style.opacity = o.o.toFixed(3); move(el, p, o.icon === 'dot' ? '' : `rotate(${turn.toFixed(2)}deg)`);
      } else if (o.k === 'marker') {
        const p = hidden ? null : where(o.at, F.cam);
        if (!p) continue;
        const el = put('marker:' + o.id, 'film-marker ' + o.style, `<i></i><b></b>${o.label ? `<span>${esc(o.label)}</span>` : ''}`);
        el.style.color = o.c; el.style.opacity = o.o.toFixed(3); move(el, p);
        const ring = (o.t % 1.6) / 1.6;
        el.style.setProperty('--ring', ring.toFixed(4)); el.style.setProperty('--pop', (1 - (1 - o.pop) ** 3).toFixed(4));
      } else if (o.k === 'label') {
        const p = o.at.x == null && hidden ? null : where(o.at, F.cam);
        if (!p) continue;
        const el = put('label:' + o.id, `film-label ${o.style}${p.fixed ? ' fixed' : ''}${o.align ? ' ' + o.align : ''}`, `<span>${esc(o.text).replace(/\n/g, '<br>')}</span>`);
        el.style.color = o.c || ''; el.style.opacity = o.o.toFixed(3); el.style.setProperty('--size', o.size); move(el, { x: p.x, y: p.y + 10 * o.rise * o.rise });
      } else if (o.k === 'stamp') {
        const p = o.at.x == null && hidden ? null : where(o.at, F.cam);
        if (!p) continue;
        const el = put('stamp:' + o.id, 'film-stamp', `<span>${esc(o.text).replace(/\n/g, '<br>')}</span>`);
        el.style.color = o.c; el.style.opacity = o.o.toFixed(3); el.style.setProperty('--size', o.size); move(el, p, `rotate(${o.angle}deg) scale(${o.s.toFixed(4)})`);
      }
    }
    for (const [key, el] of els) if (!el.dataset.seen) { el.remove(); els.delete(key); }
    if (map) {
      const ps = psig.join('|'), ls = lsig.join('|');
      if (ps !== polySig) { polySig = ps; map.getSource('film-poly').setData({ type: 'FeatureCollection', features: feats }); }
      if (ls !== lineSig) { lineSig = ls; map.getSource('film-line').setData({ type: 'FeatureCollection', features: lines }); }
    }
    picture(F.pic);
  }

  // A picture over the whole stage: whole, never cropped, and moving slowly by how far through its shot it is.
  function picture(P) {
    const bmp = P && bitmapOf(P.i, P.n);
    if (!P || !bmp || P.o <= 0) { shade.hidden = true; return; }
    const cv = shade.lastChild, key = `${P.i}:${P.n}`;
    if (key !== picKey) {
      picKey = key;
      // Held at about the size it is shown at its largest, so the browser never shrinks it by much.
      const k = Math.min(1, (Math.min((W * 0.92) / bmp.width, (H * 0.86) / bmp.height) * 1.2 * Math.max(1.6, window.devicePixelRatio || 1)));
      cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
      const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(bmp, 0, 0, cv.width, cv.height);
      const fit = Math.min((W * 0.92) / bmp.width, (H * 0.86) / bmp.height);
      cv.style.width = (bmp.width * fit).toFixed(1) + 'px'; cv.style.height = (bmp.height * fit).toFixed(1) + 'px';
    }
    const u = P.u, far = 0.035;
    const s = P.kb === 'in' ? 1 + 0.1 * u : P.kb === 'out' ? 1.1 - 0.1 * u : P.kb ? 1.08 : 1;
    const dx = P.kb === 'left' ? (0.5 - u) * 2 * far * W : P.kb === 'right' ? (u - 0.5) * 2 * far * W : 0;
    const dy = P.kb === 'up' ? (0.5 - u) * 2 * far * H : P.kb === 'down' ? (u - 0.5) * 2 * far * H : 0;
    shade.hidden = false; shade.style.opacity = P.o.toFixed(3); shade.firstChild.style.opacity = P.back;
    cv.style.transform = `translate(-50%, -50%) translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${s.toFixed(5)})`;
  }
  return { ensure, draw };
}
