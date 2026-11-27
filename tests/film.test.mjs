// Film mode (site/film/, docs/FILM_MODE.md): what can be checked without a browser. The checks that
// need one (frames, requests, the key) are in tools/film/check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

test('the key is never in the repository', () => {
  for (const f of ['film/boot.js', 'film/film.js']) assert.ok(!/FILM_KEY\s*=\s*['"][^'"]+/.test(read(f)));
  assert.match(readFileSync(new URL('../.gitignore', import.meta.url), 'utf8'), /^\.env$/m);
});

test('without a key the gate does nothing: no request, and the page is told to start as ever', async () => {
  const calls = [];
  globalThis.location = { hash: '', pathname: '/wiki/japan', search: '?film=1' };
  globalThis.history = { replaceState: () => calls.push('history') };
  globalThis.fetch = async () => { calls.push('fetch'); return { ok: false, json: async () => ({}) }; };
  const { default: boot } = await import('../site/film/boot.js');
  assert.equal(await boot({}), false);
  assert.deepEqual(calls, []);
  // An entry's own link is not taken for a key, and is left in the address.
  globalThis.location.hash = '#kyoto';
  assert.equal(await boot({}), false);
  assert.deepEqual(calls, []);
  // A wrong key: asked once, refused, and still nothing happens. The key is taken out of the address.
  globalThis.location.hash = '#k=wrong';
  let sent = null;
  globalThis.fetch = async (u, o) => { calls.push('fetch'); sent = JSON.parse(o.body); return { ok: false, json: async () => ({}) }; };
  assert.equal(await boot({ token: async () => 'session-of-the-account' }), false);
  assert.deepEqual(calls, ['history', 'fetch']);
  // The account signed in goes with the key, so the token is that account's and no one else's.
  assert.deepEqual(sent, { key: 'wrong', user: 'session-of-the-account' });
});

test('every fault in a shot list is named', () => {
  assert.throws(() => film([{ type: 'zoom', duration: 1 }, { type: 'fly', to: 'osaka', duration: 2 }, { type: 'hold', entry: 'kyoto' }, { type: 'camera', duration: 1 }, { type: 'hold', duration: 1, ease: 'bouncy' }]), (e) => {
    assert.ok(e instanceof FilmError);
    assert.equal(e.errors.length, 5);
    assert.match(e.errors[0], /shots\[0\]: unknown type "zoom" \(known: .*fly/);
    assert.match(e.errors[1], /shots\[1\] \(fly\): to: no entry "osaka"/);
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
