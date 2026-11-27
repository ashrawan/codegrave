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
const NEARER = 0.4;      // how far in from the whole globe the camera may come, in zoom levels
const TURN = 0.11;       // the part of the way over which one card goes and the next comes
const STAY = 0.45;       // the part of the way from one place to the next that the camera rests before it goes
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
      omt: { type: 'vector', url: TILES + '/planet' },
      grat: { type: 'geojson', data: graticule() },
      // The land from far off: Natural Earth's small-scale coast (public domain), one small file
      // (the land, and its coast as lines without the cut at the date line). The tiles' own
      // coast takes over from country height down; from far off their edges at the pole would be drawn as coast.
      land: { type: 'geojson', data: new URL('./media/land.json', import.meta.url).href },
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

export function createGlobe(host, { open, goTo, seek, credit, esc, calm }) {
  host.dataset.card = 'b';      // the card is a label written on the map (design B, picked from three)
  host.innerHTML = '<canvas class="g-space"></canvas><div class="g-back"><img class="g-bimg" alt="" hidden><div class="g-past"></div></div><div class="g-map"></div><div class="g-ov"><span class="g-lead"></span><button type="button" class="g-card" hidden></button></div>' +
    '<button type="button" class="g-mode" hidden></button><div class="g-shelf" hidden><div class="g-rows"><div class="g-ax"></div><div class="g-track"></div><i class="g-now"></i></div></div><p class="g-note" hidden></p>';
  const sky = host.children[0], back = host.children[1], bimg = back.children[0], past = back.children[1], box = host.children[2], ov = host.children[3], lead = ov.children[0], card = ov.children[1], modeBtn = host.children[4], shelf = host.children[5], note = host.children[6];
  const rows = shelf.querySelector('.g-rows'), track = shelf.querySelector('.g-track');
  // The small pictures at the left stand over the map so they can be pressed: one goes back to its entry (asked for, Nov 2026).
  ov.appendChild(past);
  past.addEventListener('click', (e) => { const el = e.target.closest('img[data-i]'), st = el && S.steps[Number(el.dataset.i)]; if (st) goTo(st.id); });
  past.addEventListener('dblclick', (e) => e.stopPropagation());
  const S = { map: null, ready: false, steps: [], index: new Map(), cur: -1, last: null, stage: 'map', sig: '', until: 0, cardFor: -1, shown: 0, phone: false,
    xs: [], frac: 0, pos: null, was: 0, now: -1, vis: 0, dimv: 0, spv: 0, cam: [], placed: [], open: null, playing: false, warp: 0, stars: null, raf: 0, then: 0 };
  // Globe or full view (asked for, Nov 2026): in full view there is no Earth, only the sky, the picture and the text.
  try { S.mode = localStorage.getItem('cg-stage') === 'full' ? 'full' : 'globe'; } catch (e) { S.mode = 'globe'; }
  // How much the map says (asked for, Nov 2026, so the globe is less crowded; `cg-detail` in this browser):
  // 'full' names every country; 'medium' names and tints only the countries the timeline's entries fall in;
  // 'less' only the country of the entry in front, and shows only its pin.
  try { const d = localStorage.getItem('cg-detail'); S.detail = d === 'medium' || d === 'full' ? d : 'less'; } catch (e) { S.detail = 'less'; }
  // The countries (Natural Earth, public domain; one small file, fetched once): which one a place falls in.
  const inRing = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
  const inPoly = (poly, x, y) => inRing(poly[0], x, y) && !poly.slice(1).some((h) => inRing(h, x, y));
  const landOf = (lat, lon) => {
    for (const f of S.lands || []) { const g = f.geometry; if ((g.type === 'Polygon' ? [g.coordinates] : g.coordinates).some((p) => inPoly(p, lon, lat))) return f.properties.n; }
    return '';
  };
  function homes() { S.homes = S.lands ? S.steps.map((s) => (s.place ? landOf(s.place[0], s.place[1]) : '')) : null; S.said = null; }
  function loadLands() {
    if (S.landsAsked) return;
    S.landsAsked = true;
    fetch(new URL('./media/countries.json', import.meta.url)).then((r) => r.json()).then((d) => { S.lands = d.features; homes(); detail(); }).catch(() => {});
  }
  // Applies the detail to the map. Until the countries are loaded the map keeps its own names.
  function detail() {
    if (!S.ready) return;
    const map = S.map, full = S.detail === 'full' || !S.lands || !S.homes;
    if (S.lands && !map.getSource('lands')) {
      map.addSource('lands', { type: 'geojson', data: { type: 'FeatureCollection', features: S.lands } });
      map.addSource('land-names', { type: 'geojson', data: { type: 'FeatureCollection', features: S.lands.map((f) => ({ type: 'Feature', properties: { n: f.properties.n }, geometry: { type: 'Point', coordinates: [f.properties.x, f.properties.y] } })) } });
      const fade = ['interpolate', ['linear'], ['zoom'], 4.6, 1, 6, 0];
      map.addLayer({ id: 'c-fill', type: 'fill', source: 'lands', filter: ['==', ['get', 'n'], ''], paint: { 'fill-color': '#3a3329', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4.6, 0.75, 6, 0] } }, 'grat');
      map.addLayer({ id: 'c-edge', type: 'line', source: 'lands', filter: ['==', ['get', 'n'], ''], paint: { 'line-color': 'rgba(236,196,128,.5)', 'line-width': 0.8, 'line-opacity': fade } }, 'way');
      map.addLayer({ id: 'c-name', type: 'symbol', source: 'land-names', maxzoom: 6, filter: ['==', ['get', 'n'], ''],
        layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Regular'], 'text-size': 10.5, 'text-letter-spacing': 0.18, 'text-transform': 'uppercase', 'text-max-width': 8 },
        paint: { 'text-color': 'rgba(236,222,196,.72)', 'text-halo-color': 'rgba(10,10,12,.85)', 'text-halo-width': 1.2 } }, 'way');
    }
    const names = full ? [] : S.detail === 'less' ? [S.homes[S.now] || ''] : [...new Set(S.homes.filter(Boolean))];
    const sig = S.detail + '|' + full + '|' + names.join();
    if (sig === S.said) return;
    S.said = sig;
    map.setLayoutProperty('country', 'visibility', full ? 'visible' : 'none');
    if (map.getLayer('c-fill')) for (const id of ['c-fill', 'c-edge', 'c-name']) map.setFilter(id, ['in', ['get', 'n'], ['literal', names]]);
  }
  const far = () => (S.phone ? 0.9 : LEVELS.globe);
  const size = () => Math.min(box.clientWidth, box.clientHeight);

  // ---- the map
  function make(gl) {
    const map = new gl.Map({ container: box, style: styleOf(), center: [0, 20], zoom: far(), attributionControl: false, fadeDuration: 0, scrollZoom: false, dragRotate: false, pitchWithRotate: false, keyboard: false, maxPitch: 60 });
    map.touchZoomRotate.disableRotation();
    // The credits the map's licences ask for are folded behind their small button (asked for, Nov 2026: no line of text on the map).
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
      if (!s.place || (S.detail === 'less' && i !== S.now)) return;
      feats.push({ type: 'Feature', properties: { id: s.id, name: s.name, c: s.rgb, st: i === S.now ? 'now' : i < S.now ? 'past' : 'next', near: Math.abs(i - S.now) <= NAMED },
        geometry: { type: 'Point', coordinates: [s.place[1], s.place[0]] } });
    });
    S.map.getSource('pins').setData({ type: 'FeatureCollection', features: feats });
    detail();
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
    // A view opens on the whole globe, not zoomed in to its places (asked for, Nov 2026).
    S.open = { at: [o.center[1], o.center[0]], zoom: farAt(f, o.center[1]) };
    const fit = (p, q) => (q && distance(q, p) > 0.5 ? zoomFor(distance(q, p), 0.4 * sz, p[0]) : 99);
    const zs = pl.map((p, k) => {
      // Never so close that the Earth stops reading as a globe (asked for, Nov 2026: "show the globe from a bit far").
      let z = Math.min(levelZoom(p[2]), f + NEARER);
      for (let j = k - 2; j <= k + 2; j++) if (j !== k) z = Math.min(z, fit(p, pl[j]));
      return Math.max(farAt(f, p[0]), z);
    });
    for (let k = 1; k < zs.length; k++) zs[k] = Math.min(zs[k], zs[k - 1] + STEP);
    for (let k = zs.length - 2; k >= 0; k--) zs[k] = Math.min(zs[k], zs[k + 1] + STEP);
    S.cam = S.steps.map(() => null);
    pl.forEach((p, k) => { S.cam[S.placed[k]] = { at: p, zoom: Math.max(farAt(f, p[0]), zs[k]) }; });
    S.pad = { top: 0, left: 0, right: 0, bottom: 0, ...(S.phone ? { bottom: Math.round(box.clientHeight * 0.3) } : { right: Math.round(box.clientWidth * 0.36) }) };
  }
  // Between which places a reader at `pos` is, and how far: by the count of entries (u), and as the camera goes (e),
  // which rests at each place and is quickest half way.
  function leg(pos) {
    let P = -1, Q = -1;
    for (const i of S.placed) { if (i <= pos) P = i; else { Q = i; break; } }
    const u = Q < 0 ? 0 : clamp01((pos - P) / (Q - P));
    // It stays with the entry in front for the first part of the way, then goes: there is no stretch where the
    // reader watches the map travel with no card up (asked for, Nov 2026).
    const w = clamp01((u - STAY) / (1 - STAY));
    return { P, Q, e: w - Math.sin(2 * Math.PI * w) / (2 * Math.PI) };
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
    // The picture of the entry in front stands large with its text under it, the same on the globe as in full
    // view (asked for, Nov 2026); on a phone, on the globe, it is a small picture in the card instead.
    // On a wide screen the picture and the text are one card (asked for, Nov 2026); on a phone among the
    // stars the picture stands in the sky behind the card.
    const pic = s && s.img && S.phone && S.stage === 'space' ? s.img : '';
    if (bimg.dataset.src !== pic) { bimg.dataset.src = pic; bimg.hidden = !pic; if (pic) bimg.src = pic; }
    // Beside it, small: the picture of the entry in front on top, then the last few passed. Never the ones ahead.
    const want = [];
    for (let k = i; k >= 0 && want.length < PAST; k--) if (S.steps[k].img) want.push(k);
    const have = new Map(Array.from(past.children, (el) => [Number(el.dataset.i), el]));
    for (const [k, el] of have) if (!want.includes(k)) el.remove();
    want.forEach((k, n) => {
      let el = have.get(k);
      if (!el) { el = document.createElement('img'); el.dataset.i = k; el.alt = ''; el.title = S.steps[k].name; el.src = S.steps[k].img; el.addEventListener('error', () => el.remove()); }
      if (past.children[n] !== el) past.insertBefore(el, past.children[n] || null);
    });
    if (!s) { card.hidden = true; lead.hidden = true; return; }
    card.hidden = false; card.classList.toggle('bare', !!pic);
    card.dataset.id = s.id; card.style.setProperty('--c', s.col);
    card.innerHTML = `${s.img && !pic ? `<img src="${esc(s.img)}" alt="">` : ''}<span class="g-k"><b>${esc(s.kind)}</b><small>${esc(s.when)}</small></span><strong>${esc(s.name)}</strong>${s.summary ? `<span class="g-s">${esc(s.summary)}</span>` : ''}`;
    const img = card.querySelector('img');
    if (img) { img.addEventListener('error', () => { img.remove(); place(); }); img.addEventListener('load', place); }
    place();
  }
  // Where the card stands. Its place, drop and size are written as one transform, so growing never moves it
  // sideways: it grows and shrinks about its own centre and drops straight down (asked for, Nov 2026).
  function put() { card.style.transform = `translate(${S.tx || 0}px, ${((S.ty || 0) + (S.drop || 0)).toFixed(1)}px) scale(${(S.sc || 1).toFixed(3)})`; }
  // The text stands under the picture: in the middle of the sky in full view, to the right of the middle on the
  // globe, so the place it belongs to shows beside it. On a phone it rests above the strip.
  const midX = () => (S.phone ? 0.5 : 0.62 - 0.12 * S.spv);
  function place() {
    const s = S.steps[S.cardFor];
    lead.hidden = true;
    if (!s || card.hidden) return;
    const W = host.clientWidth, H = host.clientHeight, cw = card.offsetWidth, ch = card.offsetHeight, foot = shelf.hidden ? 0 : shelf.offsetHeight;
    if (S.phone) { S.tx = 12; S.ty = Math.max(60, H - foot - ch - 10); put(); return; }
    const low = H - foot - ch - 30;
    S.tx = Math.round(Math.max(12, Math.min(W - cw - 12, W * midX() - cw / 2)));
    // The card stands in the middle of the stage, top to bottom (asked for, Nov 2026), clear of the strip.
    S.ty = Math.round(Math.max(70, Math.min(low, (H - ch) / 2))); put();
  }

  // ---- the time line at the foot: it slides under a marker that stands still, near the left
  // end (asked for, Nov 2026: the line began in the middle of the screen), so most of what shows is still to come. The entries stand on it by name
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
  const nowAt = () => rows.clientWidth * (S.phone ? 0.2 : 0.16);
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
    const early = 0.2;
    const c = Math.max(-1, Math.min(S.steps.length - 1, Math.floor(S.pos + early))), g = S.pos - c;
    if (c !== S.now) {
      S.now = c;
      S.stage = S.mode === 'full' ? 'space' : stageFor(S.steps.map((s) => !!s.place), c); host.dataset.stage = S.stage;
      pins(); markShelf(); build(c);
    }

    // The stage: the map dims for an entry with no place, and goes out of sight for space.
    const dim = toward(S.dimv, S.stage === 'dim' ? 1 : 0, still ? 1 : dt * 3), sp = toward(S.spv, S.stage === 'space' ? 1 : 0, still ? 1 : dt * 2.2);
    if (dim !== S.dimv || sp !== S.spv || S.styled == null) {
      S.dimv = dim; S.spv = sp; S.styled = 1; busy = true;
      box.style.opacity = (1 - sp).toFixed(3); box.style.pointerEvents = sp > 0.5 ? 'none' : '';
      box.style.filter = dim > 0.01 ? `brightness(${(1 - 0.5 * dim).toFixed(3)}) saturate(${(1 - 0.4 * dim).toFixed(3)})` : '';
      sky.style.opacity = sp.toFixed(3); host.style.setProperty('--sp', sp.toFixed(3));
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

    // The card is up for as long as its entry is the one in front: in play one card goes as the next comes, with
    // no empty wait between them (asked for, Nov 2026). It comes out of the distance and passes away below the
    // reader, about its own centre. Standing still, it stays.
    let vis = 0, scale = 1, drop = 0, grow = 1;
    if (S.steps[c]) {
      vis = 1;
      // A pause leaves everything exactly where play had it (asked for, Nov 2026): the card keeps the size
      // and place it had, until the reader moves on by hand.
      const held = !S.playing && S.hold && S.hold.c === c && Math.abs(S.hold.pos - S.pos) < 0.004;
      if ((S.playing || held) && !still) {
        const last = c >= S.steps.length - 1, a = clamp01((g + early) / TURN), z = last ? 0 : clamp01((g - (1 - early - TURN)) / TURN);
        vis = Math.min(a, 1 - z);
        if (!S.phone || S.stage === 'space') { scale = 0.82 + 0.18 * (1 - (1 - a) ** 2) + 0.45 * z * z; drop = 0.24 * z * z * host.clientHeight; }
        grow = 0.97 + 0.05 * clamp01(g + early) + 0.2 * z * z;
        if (S.playing) S.hold = { c, pos: S.pos };
      } else if (!held) S.hold = null;
    }
    S.vis = toward(S.vis, vis, still ? 1 : dt * 14);
    if (S.vis !== vis) busy = true;
    card.style.opacity = S.vis.toFixed(3); S.sc = scale; S.drop = drop; card.style.pointerEvents = S.vis > 0.5 ? '' : 'none';
    back.style.opacity = '1';
    bimg.style.opacity = ((0.8 + 0.12 * (1 - sp)) * S.vis).toFixed(3); bimg.style.scale = grow.toFixed(4);
    place();
    if (busy) run();
  }
  function run() { if (!S.raf) { S.then = performance.now(); S.raf = requestAnimationFrame(frame); } }

  // The time line is dragged like a strip of paper under the marker: the reader goes where it is pulled to.
  const drag = { on: false, moved: false, x: 0, at: 0 };
  function posAt(x) {
    const xs = S.xs;
    if (!xs.length) return 0;
    if (x <= xs[0]) return Math.max(-1, (x - xs[0]) / 34);
    for (let i = 0; i < xs.length - 1; i++) if (x < xs[i + 1]) return i + (x - xs[i]) / (xs[i + 1] - xs[i]);
    return xs.length - 1;
  }
  rows.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.button || S.pos == null) return;
    drag.on = true; drag.moved = false; drag.x = e.clientX; drag.at = xAt(S.pos);
  });
  rows.addEventListener('pointermove', (e) => {
    if (!drag.on) return;
    e.stopPropagation();
    if (!drag.moved && Math.abs(e.clientX - drag.x) < 5) return;
    if (!drag.moved) { drag.moved = true; rows.setPointerCapture(e.pointerId); rows.classList.add('drag'); }
    const pos = posAt(drag.at - (e.clientX - drag.x)), i = Math.floor(pos);
    seek(i < 0 ? null : S.steps[i].id, pos - i);
  });
  const dragEnd = (e) => { if (!drag.on) return; drag.on = false; rows.classList.remove('drag'); if (drag.moved) e.stopPropagation(); };
  rows.addEventListener('pointerup', dragEnd); rows.addEventListener('pointercancel', dragEnd);
  track.addEventListener('click', (e) => { if (drag.moved) { drag.moved = false; return; } const el = e.target.closest('[data-i]'); if (el) goTo(S.steps[Number(el.dataset.i)].id); });
  const ICON_GLOBE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/></svg>';
  const ICON_FULL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  function drawMode() {
    modeBtn.hidden = true;      // the switch is in the three-dot menu (asked for, Nov 2026)
    modeBtn.innerHTML = (S.mode === 'full' ? ICON_FULL + '<span>Full view</span>' : ICON_GLOBE + '<span>Globe</span>');
    modeBtn.title = S.mode === 'full' ? 'Full view: show the globe' : 'Globe: switch to full view';
    modeBtn.setAttribute('aria-label', modeBtn.title);
  }
  modeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    S.mode = S.mode === 'full' ? 'globe' : 'full';
    try { localStorage.setItem('cg-stage', S.mode); } catch (x) { /* fine */ }
    S.now = -2; drawMode(); run();
  });
  for (const ev of ['pointerdown', 'pointerup']) modeBtn.addEventListener(ev, (e) => e.stopPropagation());
  // The credits the map's licences ask for, behind a small button in the corner of the page.
  if (credit && !credit.querySelector('.g-credit')) {
    const el = document.createElement('span');
    el.className = 'g-credit';
    el.innerHTML = '<button type="button" class="ibtn sm" aria-label="Map credits" title="Map credits" aria-expanded="false"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/></svg></button>' +
      '<p hidden>Map: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · Natural Earth · <a href="https://maplibre.org" target="_blank" rel="noopener">MapLibre</a></p>';
    credit.prepend(el);
    const btn = el.firstChild, tip = el.lastChild;
    btn.addEventListener('click', (e) => { e.stopPropagation(); tip.hidden = !tip.hidden; btn.setAttribute('aria-expanded', !tip.hidden); });
    document.addEventListener('pointerdown', (e) => { if (!el.contains(e.target)) { tip.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
  }
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
      drawShelf(); cams(); drawMode(); past.innerHTML = ''; homes();
      if (steps.some((s) => s.place)) loadLands();
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
    // 'globe' (the map where entries have places) or 'full' (the stars for every entry). Kept in this browser.
    mode(v) {
      if ((v === 'globe' || v === 'full') && v !== S.mode) { S.mode = v; try { localStorage.setItem('cg-stage', v); } catch (e) { /* fine */ } S.now = -2; run(); }
      return S.mode;
    },
    // How much the map says: 'less', 'medium' or 'full'. Given one, it is kept in this browser.
    detail(v) {
      if (v === 'less' || v === 'medium' || v === 'full') { S.detail = v; try { localStorage.setItem('cg-detail', v); } catch (e) { /* fine */ } S.said = null; pins(); run(); }
      return S.detail;
    },
    zoom: () => (S.map ? S.map.getZoom() : null),
  };
}
