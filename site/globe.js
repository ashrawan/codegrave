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
import { cameraFor, opening, flightSeconds, greatCircle, distance, stageFor, coords, LEVELS } from './globe-path.js';

const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.6.0/maplibre-gl.min';
const TILES = 'https://tiles.openfreemap.org';
const NAMED = 5;          // pins this many steps either side of the one in front carry their name
const STARS = 240;        // stars that fly past in space
const READ = 2.4;         // seconds a card stands before play moves on, after the flight to it
const DRIFT = [0.3, 7];   // while it stands the camera keeps moving: this much closer (zoom) and round (degrees), slowly

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

export function createGlobe(host, { open, goTo, esc, calm, onStage }) {
  host.innerHTML = '<canvas class="g-space"></canvas><div class="g-map"></div><div class="g-ov"><span class="g-lead"></span><button type="button" class="g-card" hidden></button></div>' +
    '<div class="g-shelf" hidden><div class="g-rows"><div class="g-ax"></div><div class="g-track"></div><i class="g-now"></i></div></div><p class="g-note" hidden></p>';
  const sky = host.children[0], box = host.children[1], ov = host.children[2], lead = ov.children[0], card = ov.children[1], shelf = host.children[3], note = host.children[4];
  const rows = shelf.querySelector('.g-rows'), track = shelf.querySelector('.g-track');
  const S = { map: null, ready: false, steps: [], index: new Map(), cur: -1, last: null, stage: 'map', sig: '', until: 0, cardFor: -1, shown: 0, phone: false,
    xs: [], frac: 0, sx: null, playing: false, warp: 0, stars: null, raf: 0, then: 0 };
  const far = () => (S.phone ? 0.9 : LEVELS.globe);
  const size = () => Math.min(box.clientWidth, box.clientHeight);

  // ---- the map
  function make(gl) {
    const map = new gl.Map({ container: box, style: styleOf(), center: [0, 20], zoom: far(), attributionControl: false, fadeDuration: 0, scrollZoom: false, dragRotate: false, pitchWithRotate: false, keyboard: false, maxPitch: 60 });
    map.addControl(new gl.AttributionControl({ compact: true }), 'bottom-left');
    map.touchZoomRotate.disableRotation();
    // On a phone the credits start folded behind their button, so they do not lie over the heading.
    if (S.phone) map.once('load', () => box.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
    map.on('load', () => {
      map.addSource('arc', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'arc-glow', type: 'line', source: 'arc', paint: { 'line-color': ['get', 'c'], 'line-width': 7, 'line-opacity': 0.16, 'line-blur': 4 } });
      map.addLayer({ id: 'arc', type: 'line', source: 'arc', paint: { 'line-color': ['get', 'c'], 'line-width': 1.6, 'line-opacity': 0.9, 'line-dasharray': [2, 1.5] } });
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
      pins(); move(true);
    });
    map.on('move', place);
    map.on('error', () => {});      // a tile that fails leaves a gap; the page carries on
    return map;
  }

  // ---- the pins and the arc
  function pins() {
    if (!S.ready) return;
    const feats = [];
    S.steps.forEach((s, i) => {
      if (!s.place) return;
      feats.push({ type: 'Feature', properties: { id: s.id, name: s.name, c: s.rgb, st: i === S.cur ? 'now' : i < S.cur ? 'past' : 'next', near: Math.abs(i - S.cur) <= NAMED },
        geometry: { type: 'Point', coordinates: [s.place[1], s.place[0]] } });
    });
    S.map.getSource('pins').setData({ type: 'FeatureCollection', features: feats });
    // The way here: from the last place before this one, when it is not next door.
    const cur = S.steps[S.cur], arc = [];
    if (cur && cur.place) {
      let k = S.cur - 1; while (k >= 0 && !S.steps[k].place) k--;
      const from = k >= 0 ? S.steps[k].place : null;
      if (from && distance(from, cur.place) > 1) arc.push({ type: 'Feature', properties: { c: cur.rgb }, geometry: { type: 'LineString', coordinates: greatCircle(from, cur.place) } });
    }
    S.map.getSource('arc').setData({ type: 'FeatureCollection', features: arc });
  }

  // ---- the camera, and what the stage does for the entry in front
  function move(instant) {
    const cur = S.steps[S.cur], stage = stageFor(S.steps.map((s) => !!s.place), S.cur);
    if (stage !== S.stage) { S.stage = stage; }
    host.dataset.stage = stage;
    if (!S.ready) return 0;
    const map = S.map, still = instant || calm();
    let secs = 0.6;
    if (cur && cur.place) {
      let k = S.cur - 1; while (k >= 0 && !S.steps[k].place) k--;
      const prev = k >= 0 ? S.steps[k].place : null;
      const cam = cameraFor(cur.place, prev, size(), far());
      const here = map.getCenter(), km = distance([here.lat, here.lng], cur.place);
      secs = flightSeconds(km);
      // The card stands beside the pin, so the pin sits a little to the side of the middle, where there is room.
      const pad = S.phone ? { bottom: Math.round(box.clientHeight * 0.3) } : { right: Math.round(box.clientWidth * 0.18) };
      const to = { ...cam, bearing: 0, padding: { top: 0, left: 0, right: 0, bottom: 0, ...pad } };
      if (still) map.jumpTo(to); else map.flyTo({ ...to, duration: secs * 1000, essential: true, curve: 1.3 });
      S.last = cur.place;
    } else if (!cur) {
      const to = { ...opening(S.steps.filter((s) => s.place).map((s) => s.place), size(), far()), bearing: 0, padding: { top: 0, left: 0, right: 0, bottom: 0 } };
      if (still) map.jumpTo(to); else map.easeTo({ ...to, duration: 900 });
    } else if (stage === 'dim' && !still) {
      map.easeTo({ zoom: Math.max(far() - 0.3, map.getZoom() - 0.35), duration: 700 });     // a small step back; the map stays where it was
    }
    host.classList.toggle('close', !!(cur && cur.place) && map.getZoom() > 4.6 && cameraFor(cur.place, null, size(), far()).zoom > 4.6);
    if (onStage) onStage(stage);
    return still ? 0 : secs;
  }

  // ---- the card of the entry in front
  function showCard() {
    const s = S.steps[S.cur];
    S.cardFor = S.cur;
    if (!s) { card.hidden = true; lead.hidden = true; return; }
    card.hidden = false;
    card.dataset.id = s.id; card.style.setProperty('--c', s.col); lead.style.setProperty('--c', s.col);
    const where = s.place ? `<span class="g-pl">◎ ${esc(s.place[3] || coords(s.place))}${s.place[3] ? ` · ${coords(s.place)}` : ''}</span>` : `<span class="g-pl off">${S.stage === 'space' ? 'No place on the map' : 'No single place · shown off the map'}</span>`;
    card.innerHTML = `${s.img ? `<img src="${esc(s.img)}" alt="">` : ''}<span class="g-k"><b>${esc(s.kind)}</b><small>${esc(s.when)}</small></span><strong>${esc(s.name)}</strong>${s.summary ? `<span class="g-s">${esc(s.summary)}</span>` : ''}${where}`;
    const img = card.querySelector('img');
    if (img) img.addEventListener('error', () => { img.remove(); place(); });
    card.classList.remove('in', 'out'); void card.offsetWidth; card.classList.add('in');
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
    const mid = S.stage === 'space' || !chip ? W / 2 : chip.getBoundingClientRect().left - host.getBoundingClientRect().left + 14;
    const y = S.stage === 'space' ? Math.max(top0, (H - foot - ch) * 0.42) : Math.max(top0, low - 26);
    card.style.transform = `translate(${Math.round(Math.max(12, Math.min(W - cw - 12, mid - cw / 2)))}px, ${Math.round(y)}px)`;
  }

  // ---- the time line at the foot: it slides under a marker that stands still. Entries with a place are
  // dots on it, entries with none are rows; a year is written where it changes and there is room.
  function drawShelf() {
    shelf.hidden = !S.steps.length;
    if (shelf.hidden) return;
    let said = '', room = 1e9;
    track.innerHTML = S.steps.map((s, i) => {
      const yr = s.mark && s.mark !== said && room >= 58 ? `<u>${esc(s.mark)}</u>` : '';
      if (yr) { said = s.mark; room = 0; }
      room += s.place ? 23 : 170;
      return s.place
        ? `<button type="button" class="g-dot" data-i="${i}" style="--c:${s.col}" title="${esc(s.name)}, ${esc(s.when)}" aria-label="${esc(s.name)}">${yr}</button>`
        : `<button type="button" class="g-chip" data-i="${i}" style="--c:${s.col}"><i>${esc(s.kind)}</i>${esc(s.name)}<span>${esc(s.when)}</span>${yr}</button>`;
    }).join('');
    measure();
  }
  // Where each entry stands on the strip.
  function measure() {
    S.xs = Array.from(track.children, (el) => el.offsetLeft + (el.classList.contains('g-chip') ? 14 : el.offsetWidth / 2));
  }
  function markShelf() {
    if (shelf.hidden) return;
    const els = track.children;
    for (let i = 0; i < els.length; i++) { const el = els[i], st = i === S.cur ? 'on' : i < S.cur ? 'past' : ''; if (el.dataset.st !== st) { el.dataset.st = st; el.classList.toggle('on', st === 'on'); el.classList.toggle('past', st === 'past'); } }
    rows.style.setProperty('--now', Math.round(nowAt()) + 'px');
    run();
  }
  const nowAt = () => rows.clientWidth * (S.phone ? 0.3 : 0.4);
  // The place on the strip that belongs under the marker: the entry in front, and on towards the next as the reader travels.
  function want() {
    if (!S.xs.length) return 0;
    if (S.cur < 0) return S.xs[0] - 34 * (1 - S.frac);
    const a = S.xs[S.cur], b = S.xs[S.cur + 1];
    return b == null ? a : a + (b - a) * S.frac;
  }

  // ---- space: where a view has no place on the Earth the reader flies on among the stars. They stream past
  // while play travels and rush at each new entry; standing still, they stand still.
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
      const x = cx + (st.x / st.z) * f * 0.5, y = cy + (st.y / st.z) * f * 0.5;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const near = 1 - st.z, a = Math.min(1, near * 1.3) * 0.85, r = 0.4 + near * 1.5;
      const x0 = cx + (st.x / z0) * f * 0.5, y0 = cy + (st.y / z0) * f * 0.5;
      c.strokeStyle = `rgba(226,232,255,${a.toFixed(3)})`; c.lineWidth = r;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x + 0.01, y); c.stroke();
    }
  }
  // One loop for what moves by itself: the strip easing to its place, and the stars.
  function frame(now) {
    S.raf = 0;
    const dt = Math.min(0.05, (now - S.then) / 1000 || 0.016); S.then = now;
    let busy = false;
    const to = nowAt() - want();
    if (S.sx == null || calm()) S.sx = to;
    else if (Math.abs(to - S.sx) > 0.4) { S.sx += (to - S.sx) * Math.min(1, dt * 7); busy = true; } else S.sx = to;
    track.style.transform = `translateX(${S.sx.toFixed(1)}px)`;
    if (S.stage === 'space') {
      const cruise = S.playing && !calm() ? 0.07 : 0;
      S.warp += (cruise - S.warp) * Math.min(1, dt * 1.6);
      if (Math.abs(S.warp - cruise) < 0.002) S.warp = cruise;
      stars(dt);
      if (S.warp > 0) busy = true;
    }
    if (busy) run();
  }
  function run() { if (!S.raf) { S.then = performance.now(); S.raf = requestAnimationFrame(frame); } }

  track.addEventListener('click', (e) => { const el = e.target.closest('[data-i]'); if (el) goTo(S.steps[Number(el.dataset.i)].id); });
  card.addEventListener('click', () => { if (card.dataset.id) open(card.dataset.id); });
  // A drag turns the globe; it must not also carry the reader through time, which the stage under it does.
  for (const ev of ['pointerdown', 'pointermove', 'pointerup']) box.addEventListener(ev, (e) => e.stopPropagation());

  return {
    // The entries on the timeline, in the order play meets them. Each step: id, name, kind, when, summary,
    // img, col (a CSS colour), rgb (the same for the map), place ([lat, lon, level, name] or null).
    show(steps) {
      const sig = steps.map((s) => s.id + (s.place ? 1 : 0) + s.rgb).join();
      S.phone = host.clientWidth < 700;
      if (sig === S.sig) { this.resize(); return; }
      const first = !S.sig;
      S.sig = sig; S.steps = steps; S.index = new Map(steps.map((s, i) => [s.id, i]));
      S.cur = -1; S.cardFor = -1; card.hidden = true; lead.hidden = true;
      S.sx = null; S.frac = 0;
      drawShelf(); markShelf();
      host.dataset.stage = stageFor(steps.map((s) => !!s.place), -1);
      if (!S.map && steps.some((s) => s.place)) {
        note.hidden = true;
        loadLib().then((gl) => { if (!S.map) S.map = make(gl); }).catch(() => { note.hidden = false; note.textContent = 'The map could not be loaded. The entries are in the strip below.'; });
      } else { pins(); move(first); }
    },
    // The entry in front of the reader (null before the first). Returns nothing; `hold()` says whether play should wait.
    at(id, playing) {
      const i = id == null ? -1 : S.index.get(id) ?? -1;
      if (i === S.cur) return false;
      S.cur = i;
      pins(); markShelf();
      const was = S.stage, secs = move(false);
      // In space the card that was up flies past the reader, and the stars rush towards the next.
      const fly = was === 'space' && S.stage === 'space' && !card.hidden && !calm();
      if (S.stage === 'space' && !calm()) S.warp = Math.max(S.warp, 0.55);
      lead.hidden = true; S.cardFor = -1;
      if (fly) { card.classList.remove('in'); card.classList.add('out'); } else card.hidden = true;
      clearTimeout(S.timer); clearTimeout(S.drift);
      // The camera never stands still in play (asked for, Nov 2026: "it shows the card and freezes"): once it
      // has arrived it keeps coming closer and turning a little, until it leaves for the next place.
      if (playing && S.ready && S.stage !== 'space' && !calm()) {
        S.turn = -(S.turn || 1);
        S.drift = setTimeout(() => {
          const map = S.map, long = READ + 4;
          map.easeTo({ zoom: map.getZoom() + DRIFT[0] * (S.stage === 'dim' ? 0.5 : 1), bearing: map.getBearing() + S.turn * DRIFT[1], duration: long * 1000, easing: (t) => 1 - (1 - t) * (1 - t), essential: true });
        }, Math.max(0.05, secs) * 1000 + 30);
      }
      // The card opens as the camera arrives, not before.
      const wait = S.steps[i] && S.steps[i].place ? Math.max(0, secs - 0.35) : fly ? 0.5 : 0.15;
      S.timer = setTimeout(showCard, wait * 1000);
      S.until = performance.now() + (secs + READ) * 1000;
      return playing && !!S.steps[i];
    },
    // While the camera flies and the card has not been up long enough to read, play waits.
    hold: () => S.cur >= 0 && performance.now() < S.until,
    // Every frame the reader moves: whether play travels, and how far they are from the entry in front to the next (0 to 1).
    tick(playing, frac) {
      if (playing === S.playing && Math.abs(frac - S.frac) < 0.001) return;
      S.playing = playing; S.frac = frac;
      run();
    },
    resize() {
      S.phone = host.clientWidth < 700;
      if (S.map) S.map.resize();
      if (!shelf.hidden) measure();
      markShelf(); place();
    },
    stage: () => S.stage,
    zoom: () => (S.map ? S.map.getZoom() : null),
  };
}
