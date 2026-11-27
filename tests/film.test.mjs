// Film mode (site/film/, docs/FILM_MODE.md): what can be checked without a browser. The checks that
// need one (frames, requests, the gate) are in tools/film/check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { compile, stateAt, toOver, cuesOf, FilmError, EASES, mixCam } from '../site/film/timeline.js';
import { SHOTS } from '../site/film/shots/index.js';

const site = new URL('../site/', import.meta.url);
const read = (f) => readFileSync(new URL(f, site), 'utf8');

// A timeline of four entries: three with a place, one without.
const PLACES = { kyoto: [35.01, 135.77], tokyo: [35.68, 139.69], paris: [48.86, 2.35], idea: null };
function ctxOf() {
  const steps = Object.entries(PLACES).map(([id, place]) => ({ id, place, rgb: 'rgb(1,2,3)' }));
  return { steps, index: new Map(steps.map((s, i) => [s.id, i])), w: 1920, h: 1080, size: 1080, far: 1.9, fps: 30,
    opening: { lat: 40, lng: 100, zoom: 1.9 }, view: (i) => (steps[i].place ? { lat: steps[i].place[0], lng: steps[i].place[1], zoom: 6 } : null),
    stage: (i) => (i >= 0 && !steps[i].place ? 'dim' : 'map') };
}
const film = (shots) => compile(shots, ctxOf(), SHOTS);

test('a normal page has no film code: one check in app.js, nothing anywhere else', () => {
  const app = read('app.js');
  assert.equal(app.split('film/').length - 1, 2, 'app.js names site/film/ only in its one check and the comment above it');
  assert.match(app, /if \(\/\[\?&\]film=1\(&\|\$\)\/\.test\(location\.search\)\) import\('\.\/film\/boot\.js'\)/);
  for (const f of readdirSync(site)) {
    if (f === 'app.js' || !/\.(js|html|css)$/.test(f)) continue;
    assert.ok(!/film\//.test(read(f).replace(/site\/film\//g, '')), `${f} must not load anything from film/`);
  }
  assert.ok(!/film\/|film=|codegraveFilm/.test(read('index.html')), 'index.html loads nothing of film mode');
});

test('film routes are closed to search engines', () => {
  const robots = read('robots.txt');
  assert.match(robots, /^Disallow: \/film$/m);
  assert.match(robots, /^Disallow: \/\*film=/m);
  assert.match(read('film/film.js'), /noindex,nofollow/);
});

test('there is no key and no film function: film mode has nothing of its own on the server', () => {
  for (const f of ['film/boot.js', 'film/film.js']) assert.ok(!/FILM_KEY|film-auth|#k=/.test(read(f)), f);
  assert.ok(!existsSync(new URL('../supabase/functions/film-auth', import.meta.url)));
});

test('the gate: nobody signed in, or an account not switched on, and the page is told to start as ever', async () => {
  const asked = [], kit = (film) => ({ api: async (path) => { asked.push(path); return film === undefined ? [] : [{ film }]; } });
  globalThis.localStorage = { getItem: () => null };
  const { default: boot } = await import('../site/film/boot.js');
  assert.equal(await boot(kit(true)), false);
  assert.deepEqual(asked, [], 'signed out: nothing is asked');
  // Signed in: the account's own row is asked for its switch, and only `true` opens film mode.
  const id = '3f2b8c1e-0d4a-4c6b-9e7f-1a2b3c4d5e6f';
  globalThis.localStorage = { getItem: (k) => (k === 'cg-session' ? JSON.stringify({ user: { id } }) : null) };
  for (const film of [false, undefined, 'true', 1]) assert.equal(await boot(kit(film)), false);
  assert.equal(asked.length, 4);
  assert.equal(asked[0], `/rest/v1/profiles?id=eq.${id}&select=film`);
  assert.equal(await boot({ api: async () => { throw new Error('offline'); } }), false);
  // A session that is not a session asks nothing.
  globalThis.localStorage = { getItem: () => JSON.stringify({ user: { id: 'x&select=*' } }) };
  assert.equal(await boot(kit(true)), false);
  assert.equal(asked.length, 4);
});

test('every fault in a shot list is named', () => {
  assert.throws(() => film([{ type: 'zoom', duration: 1 }, { type: 'fly', to: 'osaka', duration: 2 }, { type: 'hold', entry: 'kyoto' }, { type: 'camera', duration: 1 }, { type: 'hold', duration: 1, ease: 'bouncy' }]), (e) => {
    assert.ok(e instanceof FilmError);
    assert.equal(e.errors.length, 5);
    assert.match(e.errors[0], /shots\[0\]: unknown type "zoom" \(known: .*fly/);
    assert.match(e.errors[1], /shots\[1\] \(fly\): to: no entry or place "osaka"/);
    assert.match(e.errors[2], /shots\[2\] \(hold\): give a duration/);
    assert.match(e.errors[3], /shots\[3\] \(camera\): give at least one of/);
    assert.match(e.errors[4], /ease "bouncy"/);
    return true;
  });
  assert.throws(() => film([{ type: 'hold', duration: 3 }, { type: 'hold', start: 1, duration: 1 }]), /before the camera shot ahead of it ends/);
});

test('shots follow one another, and the total is their sum', () => {
  const f = film([{ type: 'fly', to: 'kyoto', duration: 2 }, { type: 'hold', entry: 'kyoto', duration: 3 }, { type: 'step', entries: ['tokyo', 'paris'], durations: [4, 5] }, { type: 'camera', heading: 40, duration: 1, start: 20 }]);
  assert.equal(f.total, 21);
  assert.deepEqual(cuesOf(f).map((c) => [c.type, c.start, c.end]), [['fly', 0, 2], ['hold', 2, 5], ['step', 5, 14], ['camera', 20, 21]]);
  const parts = cuesOf(f)[2].parts;
  assert.deepEqual(parts.map((p) => p.entry), ['tokyo', 'paris']);
  assert.ok(parts[0].start > 5 && parts[0].end === 9 && parts[1].end === 14);
});

test('the same time always gives the same frame, in any order', () => {
  const f = film([{ type: 'fly', to: 'kyoto', duration: 2 }, { type: 'hold', entry: 'kyoto', duration: 3 }, { type: 'step', entries: ['tokyo', 'idea', 'paris'], durations: 3 }]);
  const times = Array.from({ length: 60 }, (_, i) => (i * 14) / 60);
  const once = times.map((t) => JSON.stringify(toOver(stateAt(f, t), 1920, 1 / 30)));
  const again = [...times].reverse().map((t) => JSON.stringify(toOver(stateAt(f, t), 1920, 1 / 30))).reverse();
  assert.deepEqual(once, again);
});

test('the camera never jumps between a flight and the hold after it', () => {
  const f = film([{ type: 'fly', to: 'kyoto', duration: 2 }, { type: 'hold', entry: 'kyoto', duration: 3 }, { type: 'fly', to: 'paris', duration: 4 }, { type: 'hold', entry: 'paris', card: false, duration: 2 }]);
  for (const t of [2, 5, 9]) {
    const a = stateAt(f, t - 1e-6).cam, b = stateAt(f, t).cam;
    for (const k of ['lat', 'lng', 'zoom', 'shift']) assert.ok(Math.abs(a[k] - b[k]) < 1e-3, `${k} at ${t}s: ${a[k]} then ${b[k]}`);
  }
  // On the way across the world the camera pulls back, and comes down again.
  assert.ok(stateAt(f, 7).cam.zoom < 4);
  assert.equal(stateAt(f, 10).cam.shift, 0);
});

test('a card comes in, stands and goes; a second hold of the same entry keeps it up', () => {
  const f = film([{ type: 'hold', entry: 'kyoto', duration: 3 }, { type: 'hold', entry: 'kyoto', picture: false, duration: 2 }]);
  assert.equal(stateAt(f, 0).a, 0);
  assert.equal(stateAt(f, 1).a, 1);
  assert.equal(stateAt(f, 2.99).z, 0);
  assert.equal(stateAt(f, 3).a, 1);
  assert.equal(stateAt(f, 3).nopic, true);
  assert.ok(stateAt(f, 4.9).z > 0.5);
  assert.equal(stateAt(f, 6).a, 0);
});

test('an entry with no place is told over a dimmed map', () => {
  const f = film([{ type: 'hold', entry: 'idea', duration: 3 }]);
  assert.equal(stateAt(f, 2).stage, 'dim');
  assert.equal(stateAt(f, 2).dim, 1);
});

test('a camera shot changes only what it names', () => {
  const f = film([{ type: 'fly', to: 'tokyo', duration: 1 }, { type: 'camera', heading: 90, tilt: 40, duration: 2 }]);
  const end = stateAt(f, 5).cam;
  assert.ok(Math.abs(end.lat - 35.68) < 1e-6 && end.bearing === 90 && end.pitch === 40);
  assert.ok(stateAt(f, 2).cam.bearing > 0 && stateAt(f, 2).cam.bearing < 90);
});

test('every ease starts at 0 and ends at 1', () => {
  for (const [name, fn] of Object.entries(EASES)) { assert.ok(Math.abs(fn(0)) < 1e-9, name); assert.ok(Math.abs(fn(1) - 1) < 1e-9, name); }
  const ctx = ctxOf(), A = { lat: 0, lng: 170, zoom: 5, bearing: 350, pitch: 0, shift: 0 }, B = { lat: 0, lng: -170, zoom: 5, bearing: 10, pitch: 0, shift: 0 };
  assert.equal(mixCam(A, B, 0.5, ctx).bearing, 360);      // the short way round, not back through south
  assert.ok(Math.abs(Math.abs(mixCam(A, B, 0.5, ctx).lng) - 180) < 1e-6);
});

// ---- stages 2 to 4: presets, overlays, scenes, shapes, plans
import { middle, carry, thin, path, upTo, inside } from '../site/film/geo.js';
import { readScene, autoShots, boardTimes, licenceClear, shapeOf } from '../site/film/plan.js';
import { distance, greatCircle } from '../site/globe-path.js';

const SQUARE = { type: 'Polygon', coordinates: [[[130, 30], [140, 30], [140, 40], [130, 40], [130, 30]]] };
const REGIONS = { japan: { key: 'c:Japan', geometry: SQUARE }, de: { key: 'c:Germany', geometry: { type: 'Polygon', coordinates: [[[6, 47], [15, 47], [15, 55], [6, 55], [6, 47]]] } } };
function richCtx(scene = readScene({})) {
  const c = ctxOf();
  return { ...c, places: scene.places, region: (v) => REGIONS[String(v).toLowerCase()] || null, route: (id) => scene.routes.get(id) || null, label: (id) => scene.labels.get(id) || null, labelStyle: 'plain',
    pictures: (i) => (c.steps[i].id === 'kyoto' ? [{ src: 'a.jpg' }, { src: 'b.jpg' }] : []) };
}
const PRESET_NAMES = readdirSync(new URL('film/presets/', site)).map((f) => f.replace('.json', ''));
const EVERY = [
  { type: 'overview', duration: 1 }, { type: 'fly', to: 'kyoto', duration: 1 }, { type: 'hold', entry: 'kyoto', duration: 2 },
  { type: 'highlight', region: 'japan', pulse: true, duration: 2 }, { type: 'marker', place: 'tokyo', label: 'Tokyo', style: 'pulse', duration: 2 },
  { type: 'route', from: 'kyoto', to: 'tokyo', via: [{ lat: 36, lng: 138 }], icon: 'plane', duration: 2 }, { type: 'label', text: 'Hello', x: 0.5, y: 0.2, duration: 2 },
  { type: 'stamp', text: 'No', duration: 1 }, { type: 'compare', region: 'japan', onto: 'de', duration: 2 },
  { type: 'picture', entry: 'kyoto', index: 1, kenBurns: 'left', duration: 2 }, { type: 'orbit', around: 'tokyo', degrees: 90, duration: 2 },
  { type: 'pushIn', place: 'paris', from: 800, to: 200, duration: 2 }, { type: 'camera', heading: 0, tilt: 0, duration: 1 }, { type: 'step', entries: ['kyoto', 'idea'], durations: 3 },
];

test('every shot type is in the schema, and the list in the guide', () => {
  const schema = JSON.parse(read('film/schema/shots.schema.json')), guide = readFileSync(new URL('../docs/FILM_MODE.md', import.meta.url), 'utf8');
  for (const type of Object.keys(SHOTS)) { assert.ok(schema.$defs[type], `${type} is in shots.schema.json`); assert.match(guide, new RegExp(`\\*\\*${type}\\*\\*`), `${type} is in docs/FILM_MODE.md`); }
  for (const f of ['scene', 'preset']) assert.ok(JSON.parse(read(`film/schema/${f}.schema.json`)).$id);
});

test('every shot type compiles and draws, the same frame for the same time', () => {
  const f = compile(EVERY, richCtx(), SHOTS);
  assert.equal(new Set(f.items.map((it) => it.type)).size, Object.keys(SHOTS).length, 'the list has one of every type');
  for (let t = 0; t < f.total; t += 0.37) assert.deepEqual(stateAt(f, t), stateAt(f, t));
  const kinds = new Set();
  for (let t = 0; t < f.total; t += 0.1) for (const o of stateAt(f, t).ov) kinds.add(o.k);
  assert.deepEqual([...kinds].sort(), ['head', 'label', 'marker', 'region', 'route', 'shape', 'stamp']);
  const pic = f.items.find((it) => it.type === 'picture'), P = stateAt(f, (pic.start + pic.end) / 2).pic;
  assert.equal(P.n, 1); assert.equal(P.kb, 'left'); assert.equal(P.o, 1);
  assert.equal(stateAt(f, pic.end + 0.01).pic, null, 'a picture is gone when its shot is');
});

test('an overlay shows during the camera shot before it, and its faults are named', () => {
  const f = compile([{ type: 'hold', duration: 4 }, { type: 'label', text: 'A', x: 0.5, y: 0.5, duration: 2 }, { type: 'hold', duration: 2 }, { type: 'stamp', text: 'B', start: 5, duration: 0.5 }], richCtx(), SHOTS);
  assert.equal(f.total, 6);
  assert.equal(stateAt(f, 1).ov.length, 1); assert.equal(stateAt(f, 3).ov.length, 0); assert.equal(stateAt(f, 5.2).ov[0].k, 'stamp');
  assert.throws(() => compile([{ type: 'highlight', region: 'atlantis', duration: 1 }, { type: 'route', from: 'kyoto', to: 'idea', duration: 1 }, { type: 'marker', place: { x: 0.5, y: 0.5 }, duration: 1 },
    { type: 'label', text: 'x', duration: 1 }, { type: 'picture', entry: 'tokyo', duration: 1 }, { type: 'compare', region: 'japan', onto: 'nowhere', duration: 1 }, { type: 'stamp', text: 'x', color: 'mauve', duration: 1 }], richCtx(), SHOTS), (e) => {
    assert.equal(e.errors.length, 7, e.errors.join('\n'));
    assert.match(e.errors[0], /nothing called "atlantis"/); assert.match(e.errors[4], /"tokyo" has 0 pictures/); assert.match(e.errors[6], /a colour name/);
    return true;
  });
});

test('every preset loads, and its defaults reach the shots unless a shot says otherwise', () => {
  assert.deepEqual(PRESET_NAMES.sort(), ['long-chronicle', 'long-explainer', 'long-map-story', 'long-mystery', 'long-rise-fall', 'short-mystery', 'short-question']);
  assert.ok(PRESET_NAMES.every((n) => read('film/film.js').includes(`'${n}'`)), 'film.js lists every preset');
  for (const name of PRESET_NAMES) {
    const p = JSON.parse(read(`film/presets/${name}.json`));
    assert.equal(p.name, name);
    assert.ok(['vertical', 'landscape'].includes(p.format) && name.startsWith(p.format === 'vertical' ? 'short' : 'long'), name);
    assert.ok(['atlas', 'day', 'dots', 'night'].includes(p.look) && ['shorts', 'none'].includes(p.safe) && p.pace.travel > 0 && p.pace.hold > 0, name);
    for (const type of Object.keys(p.defaults)) assert.ok(type === 'all' || SHOTS[type], `${name}: defaults for "${type}"`);
    const f = compile(EVERY, richCtx(), SHOTS, p.defaults);
    assert.ok(f.total > 0, name);
    if (p.defaults.hold && p.defaults.hold.in != null) assert.equal(f.items.find((it) => it.type === 'hold').shot.in, p.defaults.hold.in);
  }
  const f = compile([{ type: 'highlight', region: 'japan', color: 'red', duration: 1 }], richCtx(), SHOTS, { highlight: { color: 'gold', pulse: true } });
  assert.equal(f.items[0].shot.color, 'red'); assert.equal(f.items[0].shot.pulse, true);
});

test('a vertical stage: the card stands under the place, clear of a Short\'s own buttons', () => {
  const F = stateAt(film([{ type: 'fly', to: 'kyoto', duration: 1 }, { type: 'hold', entry: 'kyoto', duration: 2 }]), 2);
  const wide = toOver(F, 1920, 1 / 30).cam.padding, tall = toOver(F, 540, 1 / 30, { phone: true, h: 960 }).cam.padding, safe = toOver(F, 540, 1 / 30, { phone: true, h: 960, safe: { b: 0.17, r: 0.12 } }).cam.padding;
  assert.ok(wide.right > 0 && wide.bottom === 0);
  assert.ok(tall.right === 0 && tall.bottom === 288);
  assert.ok(safe.right === 65 && safe.bottom === 288 + 163);
});

test('a shape carried over the globe keeps its true size', () => {
  const m = middle(SQUARE), to = [51, 10], g = carry(SQUARE, m, to, 1), side = (s) => distance([s.coordinates[0][0][1], s.coordinates[0][0][0]], [s.coordinates[0][1][1], s.coordinates[0][1][0]]);
  assert.ok(Math.abs(middle(g)[0] - 51) < 0.05 && Math.abs(middle(g)[1] - 10) < 0.05, 'its middle lands on the place');
  assert.ok(Math.abs(side(g) - side(SQUARE)) < 1, 'a side is as long as it was');
  assert.deepEqual(carry(SQUARE, m, to, 0), SQUARE);
  assert.ok(inside(SQUARE, 35, 135) && !inside(SQUARE, 35, 150));
  const big = { type: 'Polygon', coordinates: [Array.from({ length: 6000 }, (_, i) => [Math.cos(i / 955) * 10, Math.sin(i / 955) * 10])] };
  assert.ok(thin(big).coordinates[0].length <= 1502);
  const line = path([[35, 135.7], [35.7, 139.7], [48.8, 2.3]], greatCircle, distance), half = upTo(line, 0.5);
  assert.equal(line.at[0], 0); assert.equal(line.at[line.at.length - 1], 1);
  assert.ok(half.coords.length > 2 && half.coords.length < line.coords.length);
  assert.equal(upTo(line, 1).coords.length, line.coords.length);
});

test('a scene is read, and every fault in it named', () => {
  const known = { entry: (id) => id === 'kyoto', country: (v) => (/^(pt|portugal)$/i.test(v) ? { properties: { n: 'Portugal' }, geometry: SQUARE } : null) };
  const s = readScene({ places: [{ id: 'lisbon', name: 'Lisbon', lat: 38.7, lng: -9.1 }], routes: [{ id: 'r', from: 'lisbon', to: 'kyoto', via: [{ lat: 0, lng: 0 }] }],
    regions: [{ id: 'home', iso: 'PT' }, { id: 'box', geojson: { type: 'Feature', geometry: SQUARE } }], labels: [{ id: 't', text: 'Hi', x: 0.5, y: 0.1, style: 'title' }] }, known);
  assert.deepEqual(s.errors, []);
  assert.equal(s.places.get('lisbon').name, 'Lisbon'); assert.equal(s.routes.get('r').via.length, 1); assert.equal(s.regions.get('box').geometry.type, 'Polygon'); assert.equal(s.labels.get('t').style, 'title');
  const bad = readScene({ places: [{ id: 'a', lat: 99, lng: 0 }, { id: 'b', lat: 1, lng: 1 }, { id: 'b', lat: 1, lng: 1 }], routes: [{ id: 'r', from: 'b', to: 'nowhere' }], regions: [{ id: 'x', iso: 'ZZ' }, { id: 'y', geojson: { type: 'Point' } }], labels: [{ id: 'l', text: 'x' }] }, known);
  assert.equal(bad.errors.length, 6, bad.errors.join('\n'));
  assert.equal(shapeOf({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: SQUARE }, { type: 'Feature', geometry: SQUARE }] }).type, 'MultiPolygon');
  // A place of the scene can be flown to and marked like an entry.
  const f = compile([{ type: 'fly', to: 'lisbon', duration: 1 }, { type: 'marker', place: 'lisbon', duration: 1 }, { type: 'route', route: 'r', duration: 1 }, { type: 'label', label: 't', duration: 1 }], richCtx(s), SHOTS);
  assert.ok(Math.abs(stateAt(f, 0.99).cam.lat - 38.7) < 0.5);
  assert.equal(stateAt(f, 0.5).ov.find((o) => o.k === 'label').style, 'title');
});

test('autoShots: each entry begins where its voice does', () => {
  const a = autoShots(['kyoto', 'tokyo', 'paris'], { durations: [6, 9.5, 4], pictures: (id) => (id === 'tokyo' ? 1 : 0), pace: { travel: 1.4, picture: 2.5 } });
  assert.equal(a.total, 19.5);
  assert.deepEqual(a.cues.map((c) => c.start), [0, 6, 15.5]);
  assert.deepEqual(a.shots.map((s) => s.type), ['fly', 'hold', 'fly', 'hold', 'picture', 'fly', 'hold']);
  const f = film(a.shots.filter((s) => s.type !== 'picture'));
  assert.ok(Math.abs(f.total - 17) < 1e-9);
  assert.equal(autoShots(['kyoto'], { open: 2 }).shots[0].type, 'overview');
  assert.throws(() => autoShots(['kyoto', 'tokyo'], { durations: [1] }), /1 durations for 2 entries/);
  assert.deepEqual(boardTimes([{ index: 0, type: 'fly', start: 0, end: 2 }, { index: 1, type: 'hold', entry: 'kyoto', start: 2, end: 5 }]), [{ index: 0, type: 'fly', t: 1 }, { index: 1, type: 'hold', entry: 'kyoto', t: 3.5 }]);
});

test('a picture is flagged unless its licence is plainly free', () => {
  for (const ok of ['CC BY-SA 4.0', 'CC0', 'Public domain', 'cc-by-2.0', 'Creative Commons Attribution']) assert.ok(licenceClear(ok), ok);
  for (const no of ['', undefined, 'Fair use', 'All rights reserved', '© Reuters']) assert.ok(!licenceClear(no), String(no));
});

test('film mode writes only what generate() is asked to keep, and never publishes', () => {
  const src = read('film/film.js');
  const writes = src.match(/method: '(POST|PATCH|DELETE|PUT)'/g) || [];
  assert.deepEqual(writes.sort(), ["method: 'DELETE'", "method: 'PATCH'", "method: 'PATCH'", "method: 'POST'", "method: 'POST'", "method: 'POST'"], 'the writes are the draft row, its filling and its removal; the other POSTs only read (open_timeline)');
  assert.ok(!/visibility: *'(public|link)'|visibility=/.test(src), 'nothing sets a timeline public');
  assert.match(src, /save is "private" or "none"/);
  assert.match(src, /row\.visibility !== 'private'/);
});
