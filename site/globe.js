/* The globe: the timeline drawn on the Earth instead of along the road.
   A first version, behind `?globe` in the link (asked for and designed in
   Nov 2026; the road is to go once the globe does all it does).

   The page stays the clock: the bar on the right, play, the wheel and the
   year on top all move the reader through time as before, and the page tells
   the globe which entry stands in front (`at(id)`). The globe shows where:

   - An entry with a place is a pin. The camera flies to it and its card
     stands beside it. How close the camera comes is worked out in
     globe-path.js: near places are a short glide, far ones pull back.
   - An entry with no place is a row in the strip at the foot, on one time
     line with the pins (they are dots on it). Its card rises from its row
     while the map steps back and dims; where most of a view has no place,
     the map goes out of sight and the card stands among the stars.

   The map is MapLibre GL JS (BSD), fetched from cdnjs only when a globe is
   first opened: NASA's Blue Marble far out (the "Day" look, picked from four),
   OpenFreeMap's street map close in. Both are free and need no key.
   The module knows nothing about views or the road; the page hands it steps. */
import { cameraFor, opening, flightSeconds, greatCircle, distance, stageFor, coords, LEVELS, MOSTLY } from './globe-path.js';

const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.6.0/maplibre-gl.min';
const TILES = 'https://tiles.openfreemap.org';
const BLUE_MARBLE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
const NAMED = 5;          // pins this many steps either side of the one in front carry their name
const READ = 2.4;         // seconds a card stands before play moves on, after the flight to it

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

// The Earth by day from far off; from region height down, a dark street map with buildings in 3D.
function styleOf() {
  const far = (a, b) => ['interpolate', ['linear'], ['zoom'], 7, a, 9, b];
  const text = { 'text-font': ['Noto Sans Regular'] };
  return {
    version: 8, projection: { type: 'globe' }, glyphs: TILES + '/fonts/{fontstack}/{range}.pbf',
    sources: {
      omt: { type: 'vector', url: TILES + '/planet', attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>' },
      day: { type: 'raster', tileSize: 256, maxzoom: 8, tiles: [BLUE_MARBLE], attribution: 'NASA Blue Marble' },
    },
    sky: { 'sky-color': '#05070c', 'horizon-color': '#3a6aa8', 'fog-color': '#0a0f19', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.35, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 0.5, 10, 0] },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': far('#0d2440', '#151d2d') } },
      { id: 'day', type: 'raster', source: 'day', paint: { 'raster-opacity': far(1, 0), 'raster-saturation': -0.12, 'raster-brightness-max': 0.86, 'raster-fade-duration': 0 } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', minzoom: 7, paint: { 'fill-color': '#05080f', 'fill-opacity': far(0, 1) } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'landuse', minzoom: 10, paint: { 'fill-color': '#111a1c', 'fill-opacity': 0.6 } },
      { id: 'wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', minzoom: 9, filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-color': '#0f1719' } },
      { id: 'roads-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12, filter: ['match', ['get', 'class'], ['minor', 'service', 'tertiary'], true, false], paint: { 'line-color': '#1a2232', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 16, 2.5] } },
      { id: 'roads', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 6, filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], true, false], paint: { 'line-color': '#28324a', 'line-opacity': far(0, 1), 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.3, 16, 4] } },
      { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 10, filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': '#3b4660', 'line-width': 1, 'line-dasharray': [3, 2] } },
      { id: 'bld', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13, paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#141b28', 40, '#212b3e'], 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.9 } },
      { id: 'border', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': 'rgba(255,255,255,.3)', 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 6, 1] } },
      { id: 'city', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 4.5, maxzoom: 12, filter: ['==', ['get', 'class'], 'city'], layout: { ...text, 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-size': 11, 'text-letter-spacing': 0.08 }, paint: { 'text-color': 'rgba(225,230,240,.6)', 'text-halo-color': 'rgba(5,8,15,.6)', 'text-halo-width': 1 } },
      { id: 'country', type: 'symbol', source: 'omt', 'source-layer': 'place', maxzoom: 6, filter: ['==', ['get', 'class'], 'country'], layout: { ...text, 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-size': 10.5, 'text-letter-spacing': 0.18, 'text-transform': 'uppercase' }, paint: { 'text-color': 'rgba(255,255,255,.55)', 'text-halo-color': 'rgba(5,10,20,.35)', 'text-halo-width': 1 } },
    ],
  };
}

export function createGlobe(host, { open, goTo, esc, calm, onStage }) {
  host.innerHTML = '<div class="g-map"></div><div class="g-ov"><span class="g-lead"></span><button type="button" class="g-card" hidden></button></div>' +
    '<div class="g-shelf" hidden><div class="g-lab">Not on the map<b></b></div><div class="g-rows"><div class="g-ax"></div><div class="g-track"></div><i class="g-now"></i></div></div><p class="g-note" hidden></p>';
  const box = host.children[0], ov = host.children[1], lead = ov.children[0], card = ov.children[1], shelf = host.children[2], note = host.children[3];
  const lab = shelf.querySelector('.g-lab'), rows = shelf.querySelector('.g-rows'), track = shelf.querySelector('.g-track');
  const S = { map: null, ready: false, steps: [], index: new Map(), cur: -1, last: null, stage: 'map', sig: '', until: 0, cardFor: -1, shown: 0, phone: false };
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
    card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
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

  // ---- the strip at the foot: one time line; pins are dots on it, entries with no place are rows
  function drawShelf() {
    const none = S.steps.filter((s) => !s.place).length;
    shelf.hidden = !none || !S.steps.length;
    if (shelf.hidden) return;
    lab.hidden = none >= MOSTLY * S.steps.length;       // a view with few places: the strip is simply its time line
    lab.lastChild.textContent = none;
    track.innerHTML = S.steps.map((s, i) => (s.place
      ? `<button type="button" class="g-dot" data-i="${i}" style="--c:${s.col}" title="${esc(s.name)}, ${esc(s.when)}" aria-label="${esc(s.name)}"></button>`
      : `<button type="button" class="g-chip" data-i="${i}" style="--c:${s.col}"><i>${esc(s.kind)}</i>${esc(s.name)}<span>${esc(s.when)}</span></button>`)).join('');
  }
  function markShelf() {
    if (shelf.hidden) return;
    const els = track.children;
    for (let i = 0; i < els.length; i++) { const el = els[i], st = i === S.cur ? 'on' : i < S.cur ? 'past' : ''; if (el.dataset.st !== st) { el.dataset.st = st; el.classList.toggle('on', st === 'on'); el.classList.toggle('past', st === 'past'); } }
    // The strip slides so that the entry in front stands at the marker.
    const cur = els[Math.max(0, S.cur)], at = rows.clientWidth * (S.phone ? 0.2 : 0.36);
    const x = cur ? cur.offsetLeft + (S.cur < 0 ? -30 : cur.classList.contains('g-chip') ? 14 : cur.offsetWidth / 2) : 0;
    track.style.transform = `translateX(${Math.round(at - x)}px)`;
    rows.style.setProperty('--now', Math.round(at) + 'px');
  }

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
      const secs = move(false);
      card.hidden = true; lead.hidden = true; S.cardFor = -1;
      clearTimeout(S.timer);
      // The card opens as the camera arrives, not before.
      const wait = S.steps[i] && S.steps[i].place ? Math.max(0, secs - 0.35) : 0.15;
      S.timer = setTimeout(showCard, wait * 1000);
      S.until = performance.now() + (secs + READ) * 1000;
      return playing && !!S.steps[i];
    },
    // While the camera flies and the card has not been up long enough to read, play waits.
    hold: () => S.cur >= 0 && performance.now() < S.until,
    resize() {
      S.phone = host.clientWidth < 700;
      if (S.map) S.map.resize();
      markShelf(); place();
    },
    stage: () => S.stage,
    zoom: () => (S.map ? S.map.getZoom() : null),
  };
}
