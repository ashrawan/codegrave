/* Film mode: the arithmetic of a shot list, as pure functions with tests (tests/film.test.mjs).
   A shot list is turned once into items with a start and an end (compile), and the picture at any
   time follows from the time alone (stateAt): where the camera is, which card is up and how far it
   has come. Nothing here knows the page, the map or the clock, so the same time always gives the
   same picture.

   The state of one frame, `F`:
     cam    { lat, lng, zoom, bearing, pitch, shift }   shift 1 leaves room at the right for a card
     c      the entry in front (its index among the entries, -1 for none): its pin and country are lit
     a, z   how far its card has come in (0 to 1) and gone out (0 to 1); g: how far through its hold
     pos    where the time line at the foot stands (an index, with a fraction on the way to the next)
     stage  'map', 'dim' or 'space'; sp and dim: how far the map has gone out of sight or dimmed
     fly    how far the stars have travelled; warp: how fast they travel now
     way    the lit line from one place to another: { a, b, e, key, c } or null
     nopic  the card is shown without its picture
     pic    a picture over the whole stage: { i, n, u, kb, o } (entry, which of its pictures, how far through,
            the slow move over it, how far it has come in), or null
     ov     what the overlays draw this frame, each a plain fact the renderer (overlays.js) turns into a shape:
            region, shape, route, head, marker, label, stamp */
import { distance, between, zoomFor, farAt } from '../globe-path.js';

export const VERSION = '1.0.0';
export const TRACKS = ['camera', 'overlay'];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const EASES = {
  linear: (u) => u,
  in: (u) => u * u * u,
  out: (u) => 1 - (1 - u) ** 3,
  inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) ** 3) / 2),
  // The globe's own: at rest at both ends and quickest half way, with no speed ever jumped to.
  smooth: (u) => u - Math.sin(2 * Math.PI * u) / (2 * Math.PI),
};
export const ease = (name, u) => (EASES[name] || EASES.smooth)(clamp01(u));
export const mix = (a, b, e) => a + (b - a) * e;
export { clamp01 };

// The zoom at which the ground under a camera `km` up fills a stage `h` pixels high (MapLibre's
// camera sees two thirds of its height at no tilt).
export const zoomOfAltitude = (km, h, lat = 0) => zoomFor(0.6667 * km, h, lat);

// The camera a part `e` of the way from A to B: along the shortest way over the globe, pulling
// back just far enough on the way that both ends would fit the frame, and never jumping.
export function mixCam(A, B, e, ctx) {
  const d = distance([A.lat, A.lng], [B.lat, B.lng]);
  const at = d < 0.01 ? [mix(A.lat, B.lat, e), mix(A.lng, B.lng, e)] : between([A.lat, A.lng], [B.lat, B.lng], e);
  const fit = d < 0.5 ? 99 : zoomFor(d, 0.5 * ctx.size, (A.lat + B.lat) / 2);
  const hump = Math.max(0, Math.min(A.zoom, B.zoom) - fit) * Math.sin(Math.PI * e) ** 2;
  let turn = (((B.bearing - A.bearing) % 360) + 540) % 360 - 180;
  if (turn === -180) turn = 180;
  return { lat: at[0], lng: at[1], zoom: Math.max(farAt(ctx.far, at[0]), mix(A.zoom, B.zoom, e) - hump),
    bearing: A.bearing + turn * e, pitch: mix(A.pitch, B.pitch, e), shift: mix(A.shift, B.shift, e) };
}

// What a shot means by an entry or a place: an entry's id, or { lat, lng } with a zoom or an altitude in km.
// Gives { i, cam } (i: the entry's index, -1 for a bare place; cam: null for an entry with no place), or null.
export function resolve(ref, ctx, shift = 0) {
  if (typeof ref === 'string') {
    const i = ctx.index.get(ref);
    if (i == null) {
      // A place of the scene, by its id.
      const p = ctx.places && ctx.places.get(ref);
      return p ? { i: -1, cam: { lat: p.lat, lng: p.lng, zoom: Number.isFinite(p.zoom) ? p.zoom : Number.isFinite(p.altitude) ? zoomOfAltitude(p.altitude, ctx.h, p.lat) : farAt(ctx.far, p.lat) + 2.5, bearing: 0, pitch: 0, shift } } : null;
    }
    const v = ctx.view(i);
    return { i, cam: v ? { lat: v.lat, lng: v.lng, zoom: v.zoom, bearing: 0, pitch: 0, shift } : null };
  }
  if (ref && typeof ref === 'object' && Number.isFinite(ref.lat) && Number.isFinite(ref.lng)) {
    const zoom = Number.isFinite(ref.zoom) ? ref.zoom : Number.isFinite(ref.altitude) ? zoomOfAltitude(ref.altitude, ctx.h, ref.lat) : farAt(ctx.far, ref.lat) + 1.5;
    return { i: -1, cam: { lat: ref.lat, lng: ref.lng, zoom, bearing: ref.heading || 0, pitch: ref.tilt || 0, shift: ref.shift ?? 0 } };
  }
  return null;
}
export const refError = (ref, ctx, what) => (resolve(ref, ctx) ? [] : [`${what}: ${typeof ref === 'string' ? `no entry or place "${ref}" here` : 'give an entry id, a place of the scene, or { lat, lng } with a zoom or an altitude in km'}`]);

// The first frame: the whole globe over the middle of the timeline's places, no card.
export function initial(ctx) {
  const o = ctx.opening;
  return { cam: { lat: o.lat, lng: o.lng, zoom: o.zoom, bearing: 0, pitch: 0, shift: 0 }, c: -1, a: 0, z: 0, g: 0, pos: -1,
    stage: ctx.stage(-1), sp: ctx.stage(-1) === 'space' ? 1 : 0, dim: 0, fly: 0, warp: 0, way: null, nopic: false, pic: null, ov: [] };
}
export const copy = (F) => ({ ...F, cam: { ...F.cam }, ov: [], pic: null });
// Between shots the camera stays where the last one left it, with no card up and nothing moving.
export const rest = (F) => { F.a = 0; F.z = 0; F.g = 0; F.warp = 0; F.way = null; F.nopic = false; F.pic = null; F.ov = []; return F; };
// Where a shot leaves things for the one after it.
export function endOf(plugin, data, from, env) { const F = copy(from); plugin.draw(1, F, data, env); return rest(F); }

export class FilmError extends Error {
  constructor(errors) { super('Film: ' + errors.join('; ')); this.name = 'FilmError'; this.errors = errors; }
}

// Turns a shot list into items with a start and an end, or throws a FilmError that names every fault.
// A camera shot with no `start` begins where the last camera shot ended. An overlay with no `start`
// begins with the camera shot listed just before it, so it shows during that shot.
export function compile(shots, ctx, registry, defaults = {}) {
  const errors = [], items = [];
  if (!Array.isArray(shots)) throw new FilmError(['shots: give a list of shots']);
  let cursor = 0, camStart = 0;
  shots.forEach((raw, i) => {
    const at = `shots[${i}]`;
    if (!raw || typeof raw !== 'object') { errors.push(`${at}: a shot is an object with a "type"`); return; }
    const plugin = registry[raw.type];
    if (!plugin) { errors.push(`${at}: unknown type "${raw.type}" (known: ${Object.keys(registry).join(', ')})`); return; }
    const shot = { ...(defaults.all || {}), ...(defaults[raw.type] || {}), ...raw };
    const errs = [];
    if (shot.ease != null && !EASES[shot.ease]) errs.push(`ease "${shot.ease}" is not one of ${Object.keys(EASES).join(', ')}`);
    if (shot.track != null && !TRACKS.includes(shot.track)) errs.push(`track "${shot.track}" is not "camera" or "overlay"`);
    if (shot.start != null && !(Number.isFinite(shot.start) && shot.start >= 0)) errs.push('start must be seconds, 0 or more');
    errs.push(...plugin.validate(shot, ctx));
    const duration = plugin.duration ? plugin.duration(shot) : shot.duration;
    if (!(Number.isFinite(duration) && duration >= 0)) errs.push('give a duration in seconds, 0 or more');
    if (errs.length) { errors.push(...errs.map((e) => `${at} (${raw.type}): ${e}`)); return; }
    const track = shot.track || plugin.track, start = shot.start ?? (track === 'camera' ? cursor : camStart);
    if (track === 'camera') {
      if (start < cursor - 1e-6) errors.push(`${at} (${raw.type}): starts at ${start}s, before the camera shot ahead of it ends (${cursor}s); only overlays may run during another shot`);
      cursor = start + duration; camStart = start;
    }
    items.push({ index: i, type: raw.type, shot, plugin, track, start, end: start + duration });
  });
  if (errors.length) throw new FilmError(errors);
  const cams = items.filter((it) => it.track === 'camera');
  let F = initial(ctx);
  cams.forEach((it, k) => {
    it.from = F;
    it.env = { ctx, from: F, prev: k ? cams[k - 1].shot : null, next: cams[k + 1] ? cams[k + 1].shot : null, index: it.index };
    it.data = it.plugin.prepare(it.shot, it.env);
    F = it.after = endOf(it.plugin, it.data, F, it.env);
  });
    const film = { items, cams, total: items.reduce((m, it) => Math.max(m, it.end), 0), first: initial(ctx) };
  // An overlay is worked out against the picture the camera has when it begins.
  for (const it of items) if (it.track !== 'camera') { it.env = { ctx, index: it.index, from: cameraAt(film, it.start), seconds: it.end - it.start }; it.data = it.plugin.prepare(it.shot, it.env); }
  for (const it of cams) it.env.seconds = it.end - it.start;
  return film;
}

// The camera's part of the frame at `t` seconds.
function cameraAt(film, t) {
  let F = null, on = null;
  for (const it of film.cams) {
    if (t >= it.start && t < it.end) { on = it; break; }
    if (t >= it.end) F = it.after;
  }
  if (on) { F = copy(on.from); rest(F); on.plugin.draw((t - on.start) / (on.end - on.start), F, on.data, on.env); }
  else F = copy(F || film.first);
  return F;
}
// The frame at `t` seconds.
export function stateAt(film, t) {
  const F = cameraAt(film, t);
  for (const it of film.items) {
    if (it.track !== 'camera' && t >= it.start && t < it.end) it.plugin.draw(it.end > it.start ? (t - it.start) / (it.end - it.start) : 1, F, it.data, it.env);
  }
  return F;
}

// What globe.js is told for a frame (its `drive()`): the same facts, in the map's own terms. `lay` says how the
// stage is laid out: on a narrow stage (the site's phone layout, used for vertical video) the card stands under
// the place, not beside it; `safe` is the part of the stage, at the bottom and the right, to keep clear.
export function toOver(F, w, dt, lay = {}) {
  const r = (v, n = 1e6) => Math.round(v * n) / n, h = lay.h || 0, safe = lay.safe || { b: 0, r: 0 };
  const right = (lay.phone ? 0 : F.cam.shift * 0.36 * w) + safe.r * w, bottom = (lay.phone ? F.cam.shift * 0.3 * h : 0) + safe.b * h;
  return { dt, pos: r(F.pos), c: F.c, a: r(F.a), z: r(F.z), g: r(F.g), stage: F.stage, sp: r(F.sp), dim: r(F.dim), fly: r(F.fly), warp: r(F.warp), way: F.way,
    cam: { center: [r(F.cam.lng, 1e7), r(F.cam.lat, 1e7)], zoom: r(F.cam.zoom), pitch: r(F.cam.pitch), bearing: r(F.cam.bearing), padding: { top: 0, left: 0, bottom: Math.round(bottom), right: Math.round(right) } } };
}

// The start and end of every shot, for lining up an edit.
export const cuesOf = (film) => film.items.map((it) => ({ index: it.index, type: it.type, track: it.track, start: it.start, end: it.end,
  ...(typeof it.shot.entry === 'string' ? { entry: it.shot.entry } : {}), ...(it.shot.id != null ? { id: it.shot.id } : {}), ...(it.plugin.cues ? { parts: it.plugin.cues(it) } : {}) }));

// ---- helpers the overlay shots share

// How far an overlay has come in and gone out: 0 to 1, over `in` and `out` seconds of its `d`.
export const fade = (u, d, i = 0.4, o = 0.4) => Math.min(i > 0 ? clamp01((u * d) / i) : 1, o > 0 ? clamp01(((1 - u) * d) / o) : 1);
// A colour by name or as written: the names are the few a film needs.
export const COLORS = { gold: '#ecc480', red: '#e5484d', orange: '#f76b15', yellow: '#ffd60a', green: '#46a758', teal: '#12a594', blue: '#3e8bff', purple: '#8e4ec6', pink: '#e93d82', white: '#ffffff', black: '#0b0d12', grey: '#9aa3b2' };
export const colorOf = (c, d = COLORS.gold) => (c == null ? d : COLORS[c] || c);
export const colorError = (c, what = 'color') => (c == null || COLORS[c] || /^#[0-9a-f]{3,8}$/i.test(c) || /^rgba?\(/.test(c) ? [] : [`${what}: a colour name (${Object.keys(COLORS).join(', ')}) or "#rrggbb"`]);
// Where an overlay stands: an entry, a place of the scene, or { lat, lng }; or a spot of the stage, { x, y } from 0 to 1.
export function spot(ref, ctx) {
  if (ref && typeof ref === 'object' && Number.isFinite(ref.x) && Number.isFinite(ref.y)) return { x: ref.x, y: ref.y };
  const R = resolve(ref, ctx);
  return R && R.cam ? { lat: R.cam.lat, lng: R.cam.lng } : null;
}
export const spotError = (ref, ctx, what) => (spot(ref, ctx) ? [] : [`${what}: give an entry id with a place, a place of the scene, { lat, lng }, or a spot of the stage { x, y } from 0 to 1`]);
