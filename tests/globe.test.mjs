// The arithmetic of the globe (site/globe-path.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distance, greatCircle, zoomFor, pitchFor, cameraFor, opening, flightSeconds, stageFor, coords, farAt, LEVELS, RUN } from '../site/globe-path.js';

const KYOTO = [35.0116, 135.7681, 'city'], KIYOMIZU = [34.9949, 135.785, 'spot'], FUSHIMI = [34.9671, 135.7727, 'spot'];
const TOKYO = [35.6812, 139.7671, 'city'], MIDWAY = [28.21, -177.37, 'city'], CORAL = [-15.5, 155.5, 'region'], STALINGRAD = [48.7, 44.5, 'city'];

test('distance is along the ground, in kilometres', () => {
  assert.ok(Math.abs(distance(TOKYO, KYOTO) - 365) < 15);
  assert.ok(Math.abs(distance([0, 0], [0, 180]) - 20015) < 5);
  assert.equal(distance(KYOTO, KYOTO), 0);
});

test('an arc starts and ends at its places and does not jump at the date line', () => {
  const arc = greatCircle(CORAL, MIDWAY);
  assert.deepEqual(arc[0].map((v) => Math.round(v * 10) / 10), [155.5, -15.5]);
  const end = arc[arc.length - 1];
  assert.ok(Math.abs(end[0] - 182.63) < 0.01 && Math.abs(end[1] - 28.21) < 0.01);      // 177.37 W, carried on past 180
  for (let i = 1; i < arc.length; i++) assert.ok(Math.abs(arc[i][0] - arc[i - 1][0]) < 5);
  assert.equal(greatCircle(KYOTO, KYOTO).length, 2);
});

test('the camera comes as close as the place is exact, and no closer', () => {
  assert.equal(cameraFor(KIYOMIZU, null, 800).zoom, LEVELS.spot);
  assert.equal(cameraFor(KYOTO, null, 800).zoom, LEVELS.city);
  assert.equal(cameraFor([36, 138, 'country'], null, 800).zoom, LEVELS.country);
  assert.deepEqual(cameraFor(KYOTO, null, 800).center, [135.7681, 35.0116]);
});

test('near places are a short glide; only far ones pull back to the globe', () => {
  const walk = cameraFor(KIYOMIZU, FUSHIMI, 800), train = cameraFor(KYOTO, TOKYO, 800), war = cameraFor(STALINGRAD, MIDWAY, 800);
  assert.ok(walk.zoom > 12, 'a walk in one city stays in its streets');
  assert.ok(train.zoom > 5 && train.zoom < 8, 'Tokyo to Kyoto is seen from region height');
  assert.equal(war.zoom, farAt(LEVELS.globe, STALINGRAD[0]), 'Midway to Stalingrad is the whole globe');
  assert.ok(walk.pitch > train.pitch && train.pitch > war.pitch && war.pitch === 0, 'the camera tilts as it comes down');
});

test('the place the reader comes from stays in the frame', () => {
  const size = 800, cam = cameraFor(KYOTO, TOKYO, size);
  // At that zoom the way back to Tokyo is 0.36 of the stage long.
  assert.ok(Math.abs(zoomFor(distance(TOKYO, KYOTO), 0.36 * size, KYOTO[0]) - cam.zoom) < 1e-9);
});

test('the tilt runs from flat to 55 degrees and never beyond', () => {
  assert.equal(pitchFor(1), 0); assert.equal(pitchFor(3), 0);
  assert.equal(pitchFor(LEVELS.region), 35); assert.equal(pitchFor(LEVELS.spot), 55); assert.equal(pitchFor(20), 55);
  for (let z = 0; z < 16; z += 0.5) assert.ok(pitchFor(z + 0.5) >= pitchFor(z));
});

test('the whole globe looks the same size at any latitude', () => {
  assert.equal(farAt(1.9, 0), 1.9);
  assert.ok(farAt(1.9, 60) < farAt(1.9, 30));
  assert.equal(farAt(1.9, 89), farAt(1.9, 80));        // bounded near the poles
});

test('a view opens with all its places in the frame', () => {
  const japan = opening([TOKYO, KYOTO, [34.3853, 132.4553]], 800), world = opening([MIDWAY, STALINGRAD, CORAL], 800);
  assert.ok(japan.zoom > 5 && japan.center[0] > 132 && japan.center[0] < 140);
  assert.ok(world.zoom < 2.5);
  // Either side of the date line, the middle is on the line, not on the far side of the world.
  const mid = opening([[0, 170], [0, -170]], 800).center[0];
  assert.ok(Math.abs(Math.abs(mid) - 180) < 1e-6);
  assert.equal(opening([], 800).pitch, 0);
});

test('a flight is never long', () => {
  assert.equal(flightSeconds(0), 0.8);
  assert.equal(flightSeconds(8000), 2.5); assert.equal(flightSeconds(20000), 2.5);
  assert.ok(flightSeconds(400) < 1);
});

test('an entry with no place dims the map, or sends the reader out to space', () => {
  const Y = true, N = false;
  assert.equal(stageFor([Y, Y, N, Y, Y], 1), 'map');
  assert.equal(stageFor([Y, Y, N, Y, Y], 2), 'dim', 'one card with no place only steps back');
  const run = [Y, Y, Y, Y, Y, Y, Y, Y, Y, Y, ...Array(RUN).fill(N), Y];
  assert.equal(stageFor(run, 12), 'space', 'a long run without places goes to space');
  assert.equal(stageFor(run, 15), 'map');
  assert.equal(stageFor([N, N, N, Y, N], 0), 'space', 'so does a view that mostly has none');
  assert.equal(stageFor([N, N, N, Y, N], 3), 'map');
  assert.equal(stageFor([N, N], -1), 'space'); assert.equal(stageFor([Y, N], -1), 'map');
});

test('coordinates are written for people', () => {
  assert.equal(coords(MIDWAY), '28.2° N, 177.4° W');
  assert.equal(coords([-33.9, 18.4]), '33.9° S, 18.4° E');
});

test('between: a point on the way, along the shortest way', async () => {
  const { between } = await import('../site/globe-path.js');
  const a = [0, 0], b = [0, 90];
  assert.deepEqual(between(a, b, 0), [0, 0]);
  assert.deepEqual(between(a, b, 1), [0, 90]);
  const m = between(a, b, 0.5);
  assert.ok(Math.abs(m[0]) < 1e-9 && Math.abs(m[1] - 45) < 1e-9);
  // Across the date line it goes the short way, not round the world.
  const d = between([10, 170], [10, -170], 0.5);
  assert.ok(Math.abs(Math.abs(d[1]) - 180) < 1e-6);
});

test('spanKm is zoomFor the other way round', async () => {
  const { spanKm } = await import('../site/globe-path.js');
  const z = zoomFor(1200, 400, 35);
  assert.ok(Math.abs(spanKm(z, 400, 35) - 1200) < 1e-6);
});

test('a view of one town is framed from close, a view of the world is not', () => {
  const town = opening([[47.6205, -122.3493], [47.6097, -122.3422], [47.6163, -122.2040]], 800);
  assert.ok(town.fit > 9 && town.fit <= 13);
  const world = opening([[47.6, -122.3], [35.7, 139.7], [51.5, -0.1]], 800);
  assert.ok(world.fit < 3);
});
