/* The globe: the timeline drawn on the Earth instead of along the road.
   A first version, behind `?globe` in the link (asked for and designed in
   Nov 2026; the road is to go once the globe does all it does).

   The page stays the clock: the bar on the right, play, the wheel and the
   year on top all move the reader through time as before, and the page tells
   the globe which entry stands in front (`at(id)`). The globe shows where:

   - An entry with a place is a pin. The camera flies to it and its card
     stands beside it. How close the camera comes is worked out in
     globe-path.js: near places are a short glide, far ones pull back.
   - The time line runs along the foot and slides under a marker that stands
     still, so time is seen to pass. Entries with a place are dots on it;
     an entry with no place is a row on it. Its card rises from its row
     while the map steps back and dims; where most of a view has no place,
     the map goes out of sight and the reader flies on among the stars.

   The map is MapLibre GL JS (BSD), fetched from cdnjs only when a globe is
   first opened, on OpenFreeMap's tiles, free and without a key. The look is
   "Atlas" (picked after "Day" was found heavy): dark land, coasts drawn in a
   warm line, a faint grid of latitude and longitude, and the same map with
   streets close in. It is all lines and flat colour, so no pictures load.
   The module knows nothing about views or the road; the page hands it steps. */
import { opening, greatCircle, between, distance, stageFor, levelZoom, zoomFor, farAt, LEVELS } from './globe-path.js';

const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.6.0/maplibre-gl.min';
const TILES = 'https://tiles.openfreemap.org';
const NAMED = 5;          // pins this many steps either side of the one in front carry their name
const STARS = 240;        // stars that fly past in space
// How the camera travels ("turn", picked from three clean ways in Nov 2026, after livelier ones were found "not
// steady at all"): the globe turns under a camera that keeps its height, so each place comes to the same spot of
// the picture and its card to the same place. The camera's place follows from the reader's; it comes to rest at
// each place and is quickest half way (no speed is ever jumped to: the pace of the classic "smooth and efficient
// zooming and panning" path, made smooth at its ends); north stays up; and a light runs along the way from place
// to place, so going on is seen even where the camera has little to do.
const STEP = 0.5;         // zoom levels the height may change from one place to the next
const PAST = 4;           // small pictures of the entries just passed, in space
const clamp01 = (v) => Math.max(0, Math.min(1, v));

let lib = null;
function loadLib() {
  if (lib) return lib;
  lib = new Promise((done, fail) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LIB + '.css'; document.head.appendChild(css);
    const js = document.createElement('script'); js.src = LIB + '.js'; js.onload = () => done(window.maplibregl); js.onerror = () => { lib = null; fail(new Error('map')); };
    document.head.appendChild(js);
  });
  return lib;
}

// The grid of the atlas: a line every 15 degrees.
function graticule() {
  const f = [];
  for (let lo = -180; lo < 180; lo += 15) f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 33 }, (_, i) => [lo, -80 + i * 5]) } });
  for (let la = -75; la <= 75; la += 15) f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 73 }, (_, i) => [-180 + i * 5, la]) } });
  return { type: 'FeatureCollection', features: f };
}

// The atlas: dark land, the sea darker still, the coast a warm line; from region height down the streets come in.
function styleOf() {
  const far = (a, b) => ['interpolate', ['linear'], ['zoom'], 6, a, 9, b];
  const text = { 'text-font': ['Noto Sans Regular'] };
  const sea = ['==', ['get', 'class'], 'ocean'], SEA = '#0a0c10';
  const near = (a, b) => ['interpolate', ['linear'], ['zoom'], 4.6, a, 5.4, b];
  return {
    version: 8, projection: { type: 'globe' }, glyphs: TILES + '/fonts/{fontstack}/{range}.pbf',
    sources: {
      omt: { type: 'vector', url: TILES + '/planet', attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>' },
      grat: { type: 'geojson', data: graticule() },
      // The land from far off: Natural Earth's small-scale coast (public domain), one small file
      // (the land, and its coast as lines without the cut at the date line). The tiles' own
      // coast takes over from country height down; from far off their edges at the pole would be drawn as coast.
      land: { type: 'geojson', data: new URL('./media/land.json', import.meta.url).href, attribution: 'Natural Earth' },
    },
    sky: { 'sky-color': '#05070c', 'horizon-color': '#4a3f2c', 'fog-color': '#0b0b0d', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.35, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.7, 6, 0.35, 10, 0] },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': ['interpolate', ['linear'], ['zoom'], 4.6, SEA, 5.4, '#1f1f23', 9, '#17181d'] } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': SEA, 'fill-opacity': near(0, 1) } },
      { id: 'land', type: 'fill', source: 'land', filter: ['==', ['get', 'k'], 'land'], maxzoom: 5.4, paint: { 'fill-color': '#1f1f23', 'fill-opacity': near(1, 0) } },
      { id: 'grat', type: 'line', source: 'grat', maxzoom: 6, paint: { 'line-color': 'rgba(231,200,150,.1)', 'line-width': 0.6 } },
      { id: 'coast-glow', type: 'line', source: 'land', filter: ['==', ['get', 'k'], 'coast'], maxzoom: 5.4, paint: { 'line-color': 'rgba(236,196,128,.16)', 'line-width': 5, 'line-blur': 4, 'line-opacity': near(1, 0) } },
      { id: 'coast-far', type: 'line', source: 'land', filter: ['==', ['get', 'k'], 'coast'], maxzoom: 5.4, paint: { 'line-color': 'rgba(236,196,128,.8)', 'line-width': 1, 'line-opacity': near(1, 0) } },
      { id: 'coast', type: 'line', source: 'omt', 'source-layer': 'water', filter: sea, minzoom: 4.6, paint: { 'line-color': far('rgba(236,196,128,.8)', 'rgba(236,196,128,.3)'), 'line-width': 1, 'line-opacity': near(0, 1) } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'landuse', minzoom: 10, paint: { 'fill-color': '#1a1d1c', 'fill-opacity': 0.6 } },
      { id: 'wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', minzoom: 9, filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-color': '#181b1a' } },
      { id: 'roads-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12, filter: ['match', ['get', 'class'], ['minor', 'service', 'tertiary'], true, false], paint: { 'line-color': '#26272d', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 16, 2.5] } },
      { id: 'roads', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 6, filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], true, false], paint: { 'line-color': '#3a362f', 'line-opacity': far(0, 1), 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.3, 16, 4] } },
      { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 10, filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': '#4a4438', 'line-width': 1, 'line-dasharray': [3, 2] } },
      { id: 'bld', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13, paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#202127', 40, '#34322f'], 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.9 } },
      { id: 'border', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': 'rgba(231,190,120,.22)', 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 6, 1], 'line-dasharray': [3, 2] } },
      { id: 'city', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 4.5, maxzoom: 12, filter: ['==', ['get', 'class'], 'city'], layout: { ...text, 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-size': 11, 'text-letter-spacing': 0.08 }, paint: { 'text-color': 'rgba(236,222,196,.6)', 'text-halo-color': 'rgba(10,10,12,.7)', 'text-halo-width': 1 } },
      { id: 'country', type: 'symbol', source: 'omt', 'source-layer': 'place', maxzoom: 6, filter: ['==', ['get', 'class'], 'country'], layout: { ...text, 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-size': 10.5, 'text-letter-spacing': 0.18, 'text-transform': 'uppercase' }, paint: { 'text-color': 'rgba(231,205,160,.45)', 'text-halo-color': 'rgba(10,10,12,.4)', 'text-halo-width': 1 } },
    ],
  };
}

export function createGlobe(host, { open, goTo, esc, calm }) {
  host.dataset.card = 'b';      // the card is a label written on the map (design B, picked from three)
  host.innerHTML = '<canvas class="g-space"></canvas><div class="g-back"><img class="g-bimg" alt="" hidden><div class="g-past"></div></div><div class="g-map"></div><div class="g-ov"><span class="g-lead"></span><button type="button" class="g-card" hidden></button></div>' +
    '<div class="g-shelf" hidden><div class="g-rows"><div class="g-ax"></div><div class="g-track"></div><i class="g-now"></i></div></div><p class="g-note" hidden></p>';
  const sky = host.children[0], back = host.children[1], bimg = back.children[0], past = back.children[1], box = host.children[2], ov = host.children[3], lead = ov.children[0], card = ov.children[1], shelf = host.children[4], note = host.children[5];
  const rows = shelf.querySelector('.g-rows'), track = shelf.querySelector('.g-track');
  const S = { map: null, ready: false, steps: [], index: new Map(), cur: -1, last: null, stage: 'map', sig: '', until: 0, cardFor: -1, shown: 0, phone: false,
    xs: [], frac: 0, pos: null, was: 0, now: -1, vis: 0, dimv: 0, spv: 0, cam: [], placed: [], open: null, playing: false, warp: 0, stars: null, raf: 0, then: 0 };
  const far = () => (S.phone ? 0.9 : LEVELS.globe);
  const size = () => Math.min(box.clientWidth, box.clientHeight);

  // ---- the map
  function make(gl) {
    const map = new gl.Map({ container: box, style: styleOf(), center: [0, 20], zoom: far(), attributionControl: false, fadeDuration: 0, scrollZoom: false, dragRotate: false, pitchWithRotate: false, keyboard: false, maxPitch: 60 });
    map.addControl(new gl.AttributionControl({ compact: true }), 'bottom-left');
    map.touchZoomRotate.disableRotation();
    // The credits the map's licences ask for are folded behind their small button (asked for, Nov 2026: no line of text on the map).
    map.once('load', () => box.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
    map.on('idle', () => { host.dataset.idle = '1'; }); map.on('dataloading', () => { host.dataset.idle = '0'; });
    map.on('load', () => {
      map.addSource('arc', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      const kind = (k) => ['==', ['get', 'k'], k];
      map.addLayer({ id: 'way', type: 'line', source: 'arc', filter: kind('way'), paint: { 'line-color': ['get', 'c'], 'line-width': 1.2, 'line-opacity': 0.4, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'done-glow', type: 'line', source: 'arc', filter: kind('done'), paint: { 'line-color': ['get', 'c'], 'line-width': 7, 'line-opacity': 0.18, 'line-blur': 4 } });
      map.addLayer({ id: 'done', type: 'line', source: 'arc', filter: kind('done'), paint: { 'line-color': ['get', 'c'], 'line-width': 1.8, 'line-opacity': 0.95 } });
      map.addLayer({ id: 'head-glow', type: 'circle', source: 'arc', filter: kind('head'), paint: { 'circle-radius': 11, 'circle-color': ['get', 'c'], 'circle-opacity': 0.3, 'circle-blur': 0.9 } });
      map.addLayer({ id: 'head', type: 'circle', source: 'arc', filter: kind('head'), paint: { 'circle-radius': 3.2, 'circle-color': '#fff6e2' } });
      map.addSource('pins', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      const now = ['==', ['get', 'st'], 'now'];
      map.addLayer({ id: 'halo', type: 'circle', source: 'pins', filter: now, paint: { 'circle-radius': 26, 'circle-color': ['get', 'c'], 'circle-opacity': 0.2, 'circle-blur': 0.8, 'circle-pitch-alignment': 'map' } });
      map.addLayer({ id: 'ring', type: 'circle', source: 'pins', filter: now, paint: { 'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', 'c'], 'circle-stroke-width': 1.3, 'circle-stroke-opacity': 0.8, 'circle-pitch-alignment': 'map' } });
      // What has happened is a filled point, what is ahead an empty ring, the one in front is lit.
      map.addLayer({ id: 'pin', type: 'circle', source: 'pins', paint: {
        'circle-radius': ['match', ['get', 'st'], 'now', 5.5, 'past', 3.6, 3.2],
        'circle-color': ['match', ['get', 'st'], 'next', 'rgba(0,0,0,.25)', ['get', 'c']],
        'circle-opacity': ['match', ['get', 'st'], 'past', 0.75, 1],
        'circle-stroke-color': ['match', ['get', 'st'], 'next', 'rgba(255,255,255,.75)', 'rgba(5,8,15,.7)'], 'circle-stroke-width': 1 } });
      map.addLayer({ id: 'pin-name', type: 'symbol', source: 'pins', filter: ['all', ['get', 'near'], ['!=', ['get', 'st'], 'now']],
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-anchor': 'left', 'text-offset': [0.8, 0], 'text-max-width': 14, 'text-optional': true },
        paint: { 'text-color': ['match', ['get', 'st'], 'past', '#ffffff', 'rgba(255,255,255,.72)'], 'text-halo-color': 'rgba(5,8,15,.85)', 'text-halo-width': 1.4 } });
      for (const id of ['pin', 'pin-name']) {
        map.on('click', id, (e) => { const f = e.features && e.features[0]; if (f) goTo(f.properties.id); });
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      }
      S.ready = true;
      pins(); run();
    });
    map.on('move', place);
    map.on('error', () => {});      // a tile that fails leaves a gap; the page carries on
    return map;
  }

  // ---- the pins
  function pins() {
    if (!S.ready) return;
    const feats = [];
    S.steps.forEach((s, i) => {
      if (!s.place) return;
      feats.push({ type: 'Feature', properties: { id: s.id, name: s.name, c: s.rgb, st: i === S.now ? 'now' : i < S.now ? 'past' : 'next', near: Math.abs(i - S.now) <= NAMED },
        geometry: { type: 'Point', coordinates: [s.place[1], s.place[0]] } });
    });
    S.map.getSource('pins').setData({ type: 'FeatureCollection', features: feats });
  }

  // ---- the camera: where it is follows from where the reader is, so it moves whenever they do
  // Each place's own view: the place in the middle, at a height that suits its neighbourhood (as close as the place
  // is exact, but with the two places either side of it in the frame) and that changes by small steps only.
  function cams() {
    const sz = size(), f = far();
    S.placed = [];
    S.steps.forEach((s, i) => { if (s.place) S.placed.push(i); });
    const pl = S.placed.map((i) => S.steps[i].place);
    const o = opening(pl, sz, f);
    S.open = { at: [o.center[1], o.center[0]], zoom: o.zoom };
    const fit = (p, q) => (q && distance(q, p) > 0.5 ? zoomFor(distance(q, p), 0.4 * sz, p[0]) : 99);
    const zs = pl.map((p, k) => {
      let z = Math.min(levelZoom(p[2]), LEVELS.region + 1);
      for (let j = k - 2; j <= k + 2; j++) if (j !== k) z = Math.min(z, fit(p, pl[j]));
      return Math.max(farAt(f, p[0]), z);
    });
    for (let k = 1; k < zs.length; k++) zs[k] = Math.min(zs[k], zs[k - 1] + STEP);
    for (let k = zs.length - 2; k >= 0; k--) zs[k] = Math.min(zs[k], zs[k + 1] + STEP);
    S.cam = S.steps.map(() => null);
    pl.forEach((p, k) => { S.cam[S.placed[k]] = { at: p, zoom: Math.max(farAt(f, p[0]), zs[k]) }; });
    S.pad = { top: 0, left: 0, right: 0, bottom: 0, ...(S.phone ? { bottom: Math.round(box.clientHeight * 0.3) } : { right: Math.round(box.clientWidth * 0.18) }) };
  }
  // Between which places a reader at `pos` is, and how far: by the count of entries (u), and as the camera goes (e),
  // which rests at each place and is quickest half way.
  function leg(pos) {
    let P = -1, Q = -1;
    for (const i of S.placed) { if (i <= pos) P = i; else { Q = i; break; } }
    const u = Q < 0 ? 0 : clamp01((pos - P) / (Q - P));
    return { P, Q, e: u - Math.sin(2 * Math.PI * u) / (2 * Math.PI) };
  }
  function camAt(pos) {
    if (!S.placed.length) return null;
    const { P, Q, e } = leg(pos), A = P < 0 ? S.open : S.cam[P], B = Q < 0 ? A : S.cam[Q];
    const at = between(A.at, B.at, e), zoom = Math.max(farAt(far(), at[0]), A.zoom + (B.zoom - A.zoom) * e);
    return { center: [at[1], at[0]], zoom, pitch: 0, bearing: 0, padding: S.pad };
  }
  // The way from the last place to the next, and the light that runs along it as far as the reader has come.
  function trail(pos) {
    const { P, Q, e } = leg(pos), A = P < 0 ? null : S.steps[P].place, B = Q < 0 ? null : S.steps[Q].place;
    const key = A && B ? `${P} ${Q} ${Math.round(e * 400)}` : '';
    if (key === S.trail) return;
    S.trail = key;
    const feats = [];
    if (key && distance(A, B) > 1) {
      const N = 48, c = S.steps[Q].rgb, way = greatCircle(A, B, N), n = Math.min(N, Math.floor(e * N));
      const last = way[n], h = between(A, B, e);
      let lon = h[1]; while (lon - last[0] > 180) lon -= 360; while (lon - last[0] < -180) lon += 360;
      const done = way.slice(0, n + 1).concat([[lon, h[0]]]);
      feats.push({ type: 'Feature', properties: { k: 'way', c }, geometry: { type: 'LineString', coordinates: way } });
      if (e > 0.002) feats.push({ type: 'Feature', properties: { k: 'done', c }, geometry: { type: 'LineString', coordinates: done } });
      if (e > 0.002 && e < 0.998) feats.push({ type: 'Feature', properties: { k: 'head', c }, geometry: { type: 'Point', coordinates: [lon, h[0]] } });
    }
    S.map.getSource('arc').setData({ type: 'FeatureCollection', features: feats });
  }

  // ---- the card of the entry in front
  function build(i) {
    const s = S.steps[i];
    S.cardFor = i;
    // In space the picture of the entry in front fills the sky behind its card, and the last few passed stand small beside it.
    const space = S.stage === 'space', pic = space && s && s.img ? s.img : '';
    if (bimg.dataset.src !== pic) { bimg.dataset.src = pic; bimg.hidden = !pic; if (pic) bimg.src = pic; }
    const before = [];
    if (space) for (let k = i - 1; k >= 0 && before.length < PAST; k--) if (S.steps[k].img) before.push(S.steps[k]);
    past.innerHTML = before.map((b) => `<img src="${esc(b.img)}" alt="" title="${esc(b.name)}">`).join('');
    if (!s) { card.hidden = true; lead.hidden = true; return; }
    card.hidden = false; card.classList.toggle('bare', !!pic);
    card.dataset.id = s.id; card.style.setProperty('--c', s.col); lead.style.setProperty('--c', s.col);
    card.innerHTML = `${s.img && !pic ? `<img src="${esc(s.img)}" alt="">` : ''}<span class="g-k"><b>${esc(s.kind)}</b><small>${esc(s.when)}</small></span><strong>${esc(s.name)}</strong>${s.summary ? `<span class="g-s">${esc(s.summary)}</span>` : ''}`;
    const img = card.querySelector('img');
    if (img) img.addEventListener('error', () => { img.remove(); place(); });
    place();
  }
  // Where the card stands: beside its pin, on the side with room; for an entry with no place, over its
  // row in the strip (or in the middle of the sky). On a phone it rests above the strip.
  function place() {
    const s = S.steps[S.cardFor];
    if (!s || card.hidden) { lead.hidden = true; return; }
    const W = host.clientWidth, H = host.clientHeight, cw = card.offsetWidth, ch = card.offsetHeight, foot = shelf.hidden ? 0 : shelf.offsetHeight;
    lead.hidden = true;
    if (S.phone) { card.style.transform = `translate(12px, ${Math.max(60, H - foot - ch - 10)}px)`; return; }
    const top0 = 96, low = H - foot - ch - 14;
    if (s.place && S.ready) {
      const p = S.map.project([s.place[1], s.place[0]]);
      const right = p.x + 46 + cw < W - 20, x = right ? p.x + 46 : p.x - 46 - cw;
      const y = Math.max(top0, Math.min(low, p.y - ch * 0.42));
      card.style.transform = `translate(${Math.round(Math.max(12, x))}px, ${Math.round(y)}px)`;
      lead.hidden = false;
      lead.style.transform = `translate(${Math.round(right ? p.x + 12 : p.x - 46)}px, ${Math.round(p.y)}px)`;
      return;
    }
    const chip = track.querySelector('.on');
    const mid = S.stage === 'space' || !chip ? W / 2 : chip.getBoundingClientRect().left - host.getBoundingClientRect().left + 4;
    const y = S.stage === 'space' ? Math.max(top0, card.classList.contains('bare') ? low - 34 : (H - foot - ch) * 0.42) : Math.max(top0, low - 26);
    card.style.transform = `translate(${Math.round(Math.max(12, Math.min(W - cw - 12, mid - cw / 2)))}px, ${Math.round(y)}px)`;
  }

  // ---- the time line at the foot: it slides under a marker that stands still. The entries stand on it by name
  // (picked from three designs, Nov 2026), one with no place in italics; a year is written where it changes.
  function drawShelf() {
    shelf.hidden = !S.steps.length;
    if (shelf.hidden) return;
    let said = '';
    track.innerHTML = S.steps.map((s, i) => {
      const yr = s.mark && s.mark !== said ? `<u>${esc(s.mark)}</u>` : '';
      if (yr) said = s.mark;
      return `<button type="button" class="g-nm${s.place ? '' : ' off'}" data-i="${i}" style="--c:${s.col}" title="${esc(s.when)}"><b></b>${esc(s.name)}${yr}</button>`;
    }).join('');
    measure();
  }
  // Where each entry stands on the strip.
  function measure() {
    S.xs = Array.from(track.children, (el) => el.offsetLeft + 4);
    rows.style.setProperty('--now', Math.round(nowAt()) + 'px');
  }
  function markShelf() {
    const els = track.children;
    for (let i = 0; i < els.length; i++) { const el = els[i], st = i === S.now ? 'on' : i < S.now ? 'past' : ''; if (el.dataset.st !== st) { el.dataset.st = st; el.classList.toggle('on', st === 'on'); el.classList.toggle('past', st === 'past'); } }
  }
  const nowAt = () => rows.clientWidth * (S.phone ? 0.3 : 0.4);
  // The place on the strip that belongs under the marker for a reader at `pos`.
  function xAt(pos) {
    if (!S.xs.length) return 0;
    if (pos < 0) return S.xs[0] + 34 * pos;
    const i = Math.min(S.xs.length - 1, Math.floor(pos)), a = S.xs[i], b = S.xs[i + 1];
    return b == null ? a : a + (b - a) * (pos - i);
  }

  // ---- space: where a view has no place on the Earth the reader flies on among the stars, as fast as they travel.
  function stars(dt) {
    const W = host.clientWidth, H = host.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (sky.width !== Math.round(W * dpr) || sky.height !== Math.round(H * dpr)) { sky.width = Math.round(W * dpr); sky.height = Math.round(H * dpr); }
    if (!S.stars) S.stars = Array.from({ length: STARS }, (_, i) => ({ x: (((i * 0.61803) % 1) * 2 - 1) * 1.6, y: (((i * 0.75488) % 1) * 2 - 1) * 1.6, z: ((i * 0.56984) % 1) * 0.95 + 0.05 }));
    const c = sky.getContext('2d'), cx = W / 2, cy = H * 0.46, f = Math.max(W, H) * 0.5;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.lineCap = 'round';
    for (const st of S.stars) {
      const z0 = st.z;
      st.z -= S.warp * dt;
      if (st.z <= 0.02) { st.z += 0.98; continue; }
      if (st.z > 1) { st.z -= 0.98; continue; }
      const x = cx + (st.x / st.z) * f * 0.5, y = cy + (st.y / st.z) * f * 0.5;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const near = 1 - st.z, a = Math.min(1, near * 1.3) * 0.85, r = 0.4 + near * 1.5;
      const x0 = cx + (st.x / z0) * f * 0.5, y0 = cy + (st.y / z0) * f * 0.5;
      c.strokeStyle = `rgba(226,232,255,${a.toFixed(3)})`; c.lineWidth = r;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x + 0.01, y); c.stroke();
    }
  }

  // ---- one frame. Everything follows from `S.pos`, where the reader is among the entries (2.4: four tenths of
  // the way from the third to the fourth): the camera, the strip, the stars, which card is up and how far it has
  // come. So nothing waits for anything, and it all moves for exactly as long as the reader does.
  const toward = (v, to, k) => (Math.abs(to - v) < 0.004 ? to : v + (to - v) * Math.min(1, k));
  function frame(now) {
    S.raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - S.then) / 1000)); S.then = now;
    const still = calm(), goal = S.cur + S.frac;
    let busy = false;
    // The reader's place follows the page's a moment behind, so a jump to a far entry is travelled, not cut to.
    if (S.pos == null || still) S.pos = goal; else S.pos = Math.abs(goal - S.pos) < 0.0004 ? goal : S.pos + (goal - S.pos) * Math.min(1, dt * 7);
    if (S.pos !== goal) busy = true;
    const speed = (S.pos - S.was) / dt; S.was = S.pos;

    // The entry whose card is up: it comes up a fifth of the way before the reader reaches it, and goes when the
    // camera has left its place behind.
    // In space nothing else is in sight, so the next card is on its way sooner and the last one gone later.
    const early = S.stage === 'space' ? 0.32 : 0.2, late = S.stage === 'space' ? 0.66 : 0.5;
    const c = Math.max(-1, Math.min(S.steps.length - 1, Math.floor(S.pos + early))), g = S.pos - c;
    if (c !== S.now) {
      S.now = c;
      S.stage = stageFor(S.steps.map((s) => !!s.place), c); host.dataset.stage = S.stage;
      pins(); markShelf(); build(c);
    }

    // The stage: the map dims for an entry with no place, and goes out of sight for space.
    const dim = toward(S.dimv, S.stage === 'dim' ? 1 : 0, still ? 1 : dt * 3), sp = toward(S.spv, S.stage === 'space' ? 1 : 0, still ? 1 : dt * 2.2);
    if (dim !== S.dimv || sp !== S.spv || S.styled == null) {
      S.dimv = dim; S.spv = sp; S.styled = 1; busy = true;
      box.style.opacity = (1 - sp).toFixed(3); box.style.pointerEvents = sp > 0.5 ? 'none' : '';
      box.style.filter = dim > 0.01 ? `brightness(${(1 - 0.5 * dim).toFixed(3)}) saturate(${(1 - 0.4 * dim).toFixed(3)})` : '';
      sky.style.opacity = sp.toFixed(3);
    }
    if (S.ready && sp < 0.995) {
      const cam = camAt(S.pos);
      if (cam) { S.map.jumpTo(cam); host.classList.toggle('close', cam.zoom > 4.6); }
      trail(S.pos);
    }
    if (!shelf.hidden) track.style.transform = `translateX(${(nowAt() - xAt(S.pos)).toFixed(1)}px)`;
    if (sp > 0.005) {
      S.warp = still ? 0 : toward(S.warp, Math.max(-1.2, Math.min(1.2, speed * 0.34)), dt * 4);
      stars(dt);
      if (S.warp) busy = true;
    }

    // The card: up while the reader is near its entry. In play it fades in as they come and out as they go on;
    // in space it comes out of the distance and passes by. Standing still, it stays.
    let vis = 0, scale = 1, drop = 0;
    if (S.steps[c]) {
      vis = S.playing && !still ? clamp01(Math.min((g + early) / 0.12, (late - g) / 0.16)) : 1;
      // In space the reader flies on like a craft: a card comes out of the distance, and passes away below them.
      if (S.stage === 'space' && S.playing && !still) {
        const out = clamp01((g - 0.36) / 0.3) ** 2;
        scale = g < 0 ? 0.6 + 0.4 * (1 - (g / early) ** 2) : 1 + 0.05 * clamp01(g / 0.36) + 0.75 * out;
        drop = (g < 0 ? -0.1 * (g / early) ** 2 : 0.55 * out) * host.clientHeight;
      }
    }
    S.vis = toward(S.vis, vis, still ? 1 : dt * 12);
    if (S.vis !== vis) busy = true;
    card.style.opacity = S.vis.toFixed(3); card.style.scale = scale.toFixed(3); card.style.translate = `0 ${drop.toFixed(1)}px`; card.style.pointerEvents = S.vis > 0.5 ? '' : 'none';
    lead.style.opacity = (0.75 * S.vis).toFixed(3);
    back.style.opacity = sp.toFixed(3);
    if (sp > 0.005) { bimg.style.opacity = (0.8 * S.vis).toFixed(3); bimg.style.scale = (0.94 + 0.12 * clamp01(g + early)).toFixed(4); }
    if (S.stage !== 'map' || !S.ready) place();
    if (busy) run();
  }
  function run() { if (!S.raf) { S.then = performance.now(); S.raf = requestAnimationFrame(frame); } }

  track.addEventListener('click', (e) => { const el = e.target.closest('[data-i]'); if (el) goTo(S.steps[Number(el.dataset.i)].id); });
  card.addEventListener('click', () => { if (card.dataset.id) open(card.dataset.id); });
  // A drag turns the globe; it must not also carry the reader through time, which the stage under it does.
  for (const ev of ['pointerdown', 'pointermove', 'pointerup']) box.addEventListener(ev, (e) => e.stopPropagation());

  return {
    // The entries on the timeline, in the order play meets them. Each step: id, name, kind, when, mark (its year, short),
    // summary, img, col (a CSS colour), rgb (the same for the map), place ([lat, lon, level, name] or null).
    show(steps) {
      const sig = steps.map((s) => s.id + (s.place ? 1 : 0) + s.rgb).join();
      S.phone = host.clientWidth < 700;
      if (sig === S.sig) { this.resize(); return; }
      S.sig = sig; S.steps = steps; S.index = new Map(steps.map((s, i) => [s.id, i]));
      S.cur = -1; S.frac = 0; S.pos = null; S.trail = null; S.now = -2; S.cardFor = -2; S.vis = 0; card.hidden = true; lead.hidden = true;
      drawShelf(); cams();
      if (!S.map && steps.some((s) => s.place)) {
        note.hidden = true;
        loadLib().then((gl) => { if (!S.map) S.map = make(gl); }).catch(() => { note.hidden = false; note.textContent = 'The map could not be loaded. The entries are in the strip below.'; });
      }
      run();
    },
    // The entry in front of the reader (null before the first), and how far on they are towards the next (0 to 1).
    // Called whenever the reader moves. Says whether a new entry has come to the front in play.
    at(id, frac, playing) {
      const i = id == null ? -1 : S.index.get(id) ?? -1, fresh = i !== S.cur;
      if (!fresh && playing === S.playing && Math.abs(frac - S.frac) < 0.0005) return false;
      S.cur = i; S.frac = frac; S.playing = playing;
      run();
      return fresh && playing && !!S.steps[i];
    },
    // The seconds play should take from the entry in front to the next: longer when the camera has far to go.
    legSecs() {
      const a = S.steps[S.cur], b = S.steps[S.cur + 1];
      if (!a || !b) return 2.6;
      const A = S.cam[S.cur], B = S.cam[S.cur + 1];
      if (!A || !B) return S.stage === 'space' ? 3.8 : 3.3;
      return 3.2 + 1.6 * Math.min(1, distance(A.at, B.at) / 6000);
    },
    resize() {
      S.phone = host.clientWidth < 700;
      if (S.map) S.map.resize();
      if (!shelf.hidden) measure();
      cams(); place(); run();
    },
    stage: () => S.stage,
    zoom: () => (S.map ? S.map.getZoom() : null),
  };
}
