/* Film mode: what is worked out from data alone, as pure functions with tests (tests/film.test.mjs):
   a scene read and checked, a shot list written from voice timings, where the board frames are taken,
   and whether a picture's licence is plain enough to use. Nothing here knows the page. */

// The shape in a piece of GeoJSON: a Polygon or MultiPolygon, from a geometry, a Feature or a FeatureCollection.
export function shapeOf(g) {
  if (!g || typeof g !== 'object') return null;
  if (g.type === 'Feature') return shapeOf(g.geometry);
  if (g.type === 'FeatureCollection') {
    const all = (g.features || []).map(shapeOf).filter(Boolean).flatMap((s) => (s.type === 'Polygon' ? [s.coordinates] : s.coordinates));
    return all.length ? { type: 'MultiPolygon', coordinates: all } : null;
  }
  const ring = (r) => Array.isArray(r) && r.length >= 4 && r.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (g.type === 'Polygon') return Array.isArray(g.coordinates) && g.coordinates.length && g.coordinates.every(ring) ? { type: 'Polygon', coordinates: g.coordinates } : null;
  if (g.type === 'MultiPolygon') return Array.isArray(g.coordinates) && g.coordinates.length && g.coordinates.every((p) => Array.isArray(p) && p.length && p.every(ring)) ? { type: 'MultiPolygon', coordinates: g.coordinates } : null;
  return null;
}

// A scene: places, routes, regions and labels given by a script for one film, and never kept.
//   places  [{ id, name, lat, lng, zoom? | altitude?, summary?, date?, kind?, picture? }]
//   routes  [{ id, from, to, via?, style? }]     from, to, via: a place's id, an entry's id, or { lat, lng }
//   regions [{ id, iso | geojson, style? }]      iso: a country's two-letter code or name
//   labels  [{ id, text, place? | x?, y?, style? }]
// `known` says what else there is: entry(id) and country(nameOrCode). Gives maps by id, and every fault named.
export function readScene(raw, known = {}) {
  const errors = [], out = { places: new Map(), routes: new Map(), regions: new Map(), labels: new Map(), errors };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push('scene: give an object with places, routes, regions and labels'); return out; }
  const list = (k) => { if (raw[k] == null) return []; if (!Array.isArray(raw[k])) { errors.push(`${k}: give a list`); return []; } return raw[k]; };
  const idOf = (o, at, map) => {
    if (!o || typeof o !== 'object') { errors.push(`${at}: give an object`); return null; }
    if (typeof o.id !== 'string' || !/^[\w.-]{1,64}$/.test(o.id)) { errors.push(`${at}: give an "id" (letters, digits, - _ .)`); return null; }
    if (map.has(o.id)) { errors.push(`${at}: the id "${o.id}" is used twice`); return null; }
    return o.id;
  };
  list('places').forEach((p, i) => {
    const at = `places[${i}]`, id = idOf(p, at, out.places);
    if (!id) return;
    if (!(Number.isFinite(p.lat) && p.lat >= -85 && p.lat <= 85 && Number.isFinite(p.lng) && p.lng >= -360 && p.lng <= 360)) { errors.push(`${at} (${id}): give lat (-85 to 85) and lng`); return; }
    out.places.set(id, { ...p, name: typeof p.name === 'string' ? p.name : id });
  });
  const spotOk = (v) => (typeof v === 'string' ? out.places.has(v) || !!(known.entry && known.entry(v)) : !!v && Number.isFinite(v.lat) && Number.isFinite(v.lng));
  list('routes').forEach((r, i) => {
    const at = `routes[${i}]`, id = idOf(r, at, out.routes);
    if (!id) return;
    const via = r.via == null ? [] : Array.isArray(r.via) ? r.via : [r.via], bad = [['from', r.from], ...via.map((v, k) => [`via[${k}]`, v]), ['to', r.to]].filter(([, v]) => !spotOk(v));
    if (bad.length) { errors.push(...bad.map(([k, v]) => `${at} (${id}): ${k}: ${typeof v === 'string' ? `no place or entry "${v}"` : 'give a place id, an entry id, or { lat, lng }'}`)); return; }
    out.routes.set(id, { from: r.from, to: r.to, via, style: r.style && typeof r.style === 'object' ? r.style : {} });
  });
  list('regions').forEach((r, i) => {
    const at = `regions[${i}]`, id = idOf(r, at, out.regions);
    if (!id) return;
    const style = r.style && typeof r.style === 'object' ? r.style : {};
    if (r.geojson != null) { const geometry = shapeOf(r.geojson); if (!geometry) { errors.push(`${at} (${id}): geojson: give a Polygon or MultiPolygon (or a Feature holding one)`); return; } out.regions.set(id, { geometry, style }); return; }
    const c = typeof r.iso === 'string' && known.country ? known.country(r.iso) : null;
    if (!c) { errors.push(`${at} (${id}): give "iso" (a country's two-letter code or name) or "geojson"${typeof r.iso === 'string' ? `; no country "${r.iso}"` : ''}`); return; }
    out.regions.set(id, { country: c, style });
  });
  list('labels').forEach((l, i) => {
    const at = `labels[${i}]`, id = idOf(l, at, out.labels);
    if (!id) return;
    if (typeof l.text !== 'string' || !l.text) { errors.push(`${at} (${id}): give "text"`); return; }
    const xy = Number.isFinite(l.x) && Number.isFinite(l.y);
    if (l.place == null ? !xy : !spotOk(l.place)) { errors.push(`${at} (${id}): say where: "place" (a place id, an entry id or { lat, lng }), or "x" and "y" from 0 to 1`); return; }
    out.labels.set(id, { text: l.text, ...(l.place != null ? { place: l.place } : { x: l.x, y: l.y }), ...(l.style != null ? { style: l.style } : {}) });
  });
  return out;
}

// A shot list written from timings: for each entry the camera flies there, its card stands, and (when it has
// a picture and time enough) the picture fills the stage at the end. `durations` is one number for all or one
// per entry, each the whole time that entry has, travel included: so entry k begins exactly at the sum of the
// ones before it (plus `open`), which is where its voice begins. `pace` is a preset's: { travel, hold, picture }.
export function autoShots(ids, { durations, pace = {}, open = 0, pictures = () => 0, picture = true } = {}) {
  const P = { travel: 1.4, hold: 6, picture: 2.5, ...pace }, r = (v) => Math.round(v * 1000) / 1000;
  const d = Array.isArray(durations) ? durations : ids.map(() => (Number.isFinite(durations) ? durations : P.travel + P.hold));
  if (d.length !== ids.length) throw new Error(`Film: autoShots: ${d.length} durations for ${ids.length} entries`);
  if (!d.every((v) => Number.isFinite(v) && v > 0)) throw new Error('Film: autoShots: each duration is seconds, more than 0');
  const shots = [], cues = [];
  let t = 0;
  if (open > 0) { shots.push({ type: 'overview', duration: r(open) }); t = open; }
  ids.forEach((id, k) => {
    const travel = r(Math.min(P.travel, 0.35 * d[k])), left = d[k] - travel;
    const pic = picture && pictures(id) > 0 && left >= P.picture + 3 ? P.picture : 0;
    shots.push({ type: 'fly', to: id, duration: travel }, { type: 'hold', entry: id, duration: r(left - pic) });
    if (pic) shots.push({ type: 'picture', entry: id, duration: r(pic) });
    cues.push({ entry: id, start: r(t), end: r(t + d[k]) });
    t += d[k];
  });
  return { shots, total: r(t), cues };
}

// Where the board frames are taken: the middle of every shot.
export const boardTimes = (cues, fps = 30) => cues.map((c) => ({ index: c.index, type: c.type, ...(c.entry ? { entry: c.entry } : {}), t: Math.round(((c.start + c.end) / 2) * fps) / fps }));

// Whether a picture says plainly that it may be used: a Creative Commons licence or the public domain.
// Anything else (no licence written, "fair use", "all rights reserved", a site's own terms) is flagged.
export const licenceClear = (text) => /\bcc[ -]?(0|by)\b|creative commons|public domain|\bpd\b|\bpdm\b|no known copyright|ogl|gfdl|free art/i.test(String(text || ''));
