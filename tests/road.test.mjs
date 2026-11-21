// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEAR, GONE, FAR, FULL, SMALL, sizeAt, step125, focalYears, tracks, stageOf, zoneOf, modesOf, labelRect, placeLabels, ruler, paceFor } from '../site/road.js';

const SIZES = { fullH: 158, nearH: 100, compactW: 170, tagW: 70, endW: 150 };

test('things shrink with distance: at the reader full size, a focal length ahead half size', () => {
  assert.equal(sizeAt(0, 5), 1);
  assert.equal(sizeAt(5, 5), 0.5);
  assert.ok(sizeAt(NEAR * 5, 5) > 1 && sizeAt(FAR * 5, 5) < 0.1);
  assert.ok(NEAR < GONE && GONE < 0 && FULL > SMALL);
});

test('step125 gives the next round step', () => {
  assert.deepEqual([0.3, 1, 1.2, 2, 3, 7, 40, 600].map(step125), [0.5, 1, 2, 2, 5, 10, 50, 1000]);
});

test('the focal length follows how thick the starts are, within bounds', () => {
  // One start a year over a century: three in a row take two years.
  const even = Array.from({ length: 100 }, (_, i) => 1900 + i);
  assert.ok(Math.abs(focalYears(even, 1900, 2000) - 2 / 0.39) < 1e-9);
  // A few early outliers do not stretch it.
  const skew = [...even, -5000, -3000, -1000];
  const f = focalYears(skew, -5000, 2000);
  assert.ok(f >= 7000 / 120 - 1e-9 && f <= 7000 / 6);
  assert.equal(f, 7000 / 120);
  // Too few to judge: a sixth of the span.
  assert.equal(focalYears([1, 2], 0, 60), 10);
  // Many starts in the same year never give a focal length of nothing.
  assert.equal(focalYears(new Array(20).fill(1990), 1980, 2000), 20 / 120);
});

test('lines that overlap in time never share a track', () => {
  const items = [];
  for (let i = 0; i < 60; i++) items.push({ id: 'e' + i, a: 1950 + (i * 7) % 50, b: i % 4 === 0 ? null : 1950 + (i * 7) % 50 + 3 + (i % 9) });
  const where = tracks(items, 1);
  assert.equal(where.size, items.length);
  for (const x of where.values()) assert.ok(x > 0 && x < 1);
  for (const p of items) for (const q of items) {
    if (p === q || where.get(p.id) !== where.get(q.id)) continue;
    const pe = p.b == null ? Infinity : p.b + 1, qe = q.b == null ? Infinity : q.b + 1;
    assert.ok(pe <= q.a || qe <= p.a, `${p.id} and ${q.id} overlap on one track`);
  }
});

test('neighbours in time stand apart across the lane', () => {
  const where = tracks([{ id: 'a', a: 1, b: null }, { id: 'b', a: 2, b: null }, { id: 'c', a: 3, b: null }]);
  assert.ok(Math.abs(where.get('a') - where.get('b')) > 0.3);
  assert.ok(Math.abs(where.get('b') - where.get('c')) > 0.3);
});

test('the stage: a narrow one puts the road left of centre and uses smaller cards', () => {
  const wide = stageOf(1368, 804), phone = stageOf(344, 748), short = stageOf(344, 370);
  assert.equal(wide.vx, 684);
  assert.ok(!wide.phone && phone.phone && phone.vx < 172 && phone.FW < wide.FW);
  assert.ok(wide.RW <= 640 && wide.gh === wide.by - wide.vy);
  assert.ok(short.short && !phone.short);
});

test('a name is a card when near, a small card further off, then a bare name', () => {
  assert.deepEqual([1, FULL, 0.5, SMALL, 0.2].map(zoneOf), [0, 0, 1, 1, 2]);
  assert.deepEqual(modesOf(false, 0), ['full', 'compact']);
  assert.deepEqual(modesOf(false, 2), ['tag']);
  assert.deepEqual(modesOf(true, 2), []);
});

test('a name stays on the stage', () => {
  const G = stageOf(1368, 804);
  const left = labelRect('full', 1, -500, 700, SIZES, G), right = labelRect('full', 1, 5000, 700, SIZES, G);
  assert.ok(left.x0 >= 4 && right.x1 <= G.SW - 4);
  // A small one keeps its top corner inside the road, off the years on the right edge.
  const small = labelRect('compact', 0.5, G.vx + G.RW * 0.5, G.vy + G.gh * 0.5, SIZES, G);
  assert.ok(small.x1 < G.vx + G.RW * 0.5);
});

test('placing names: the best come first, small ones never touch, and they are capped', () => {
  const G = stageOf(1368, 804);
  const at = (key, s, xn, extra = {}) => ({ key, end: false, s, gx: G.vx + xn * s, gy: G.vy + G.gh * s, m: SIZES, ...extra });
  // Two cards on the same spot: only the first is a card; the second falls back or is left out.
  const two = placeLabels([at('a', 0.9, 0), at('b', 0.9, 10)], G);
  assert.equal(two.get('a').mode, 'full');
  assert.ok(!two.has('b') || two.get('b').mode !== 'full');
  // Small names never overlap each other or a card.
  const many = [];
  for (let i = 0; i < 40; i++) many.push(at('k' + i, 0.32 + (i % 10) * 0.04, -500 + (i * 137) % 1000));
  const out = [...placeLabels(many, G).values()];
  for (const p of out) for (const q of out) {
    if (p === q || (p.big && q.big)) continue;
    assert.ok(p.x1 <= q.x0 || q.x1 <= p.x0 || p.y1 <= q.y0 || q.y1 <= p.y0, 'two names touch');
  }
  assert.ok(out.filter((r) => r.mode === 'compact').length <= 10);
  assert.ok(out.filter((r) => r.mode === 'tag').length <= 6);
  // An end far away has no plate.
  assert.equal(placeLabels([{ ...at('e', 0.2, 0), end: true }], G).size, 0);
});

test('the years along the road: nearest first, round, never the year 0, never crowded', () => {
  const fsOf = (s) => Math.max(10, 9 + 25 * s);
  const fwd = ruler({ t: 1989.25, dir: 1, D: 5, tMin: 1954, tMax: 2026.9, gh: 736, fsOf });
  const labels = fwd.filter((k) => k.label);
  assert.ok(labels.length >= 5);
  assert.equal(labels[0].y, 1988);                       // the nearest year still in sight, just behind the reader
  for (let i = 1; i < labels.length; i++) {
    assert.ok(labels[i].y > labels[i - 1].y && labels[i].s < labels[i - 1].s);
    assert.ok((labels[i - 1].s - labels[i].s) * 736 >= labels[i].fs * 1.3 - 1e-9);
  }
  assert.ok(fwd.every((k) => k.at >= 1954 && k.at <= 2026.9 && Number.isInteger(k.y)));
  // Facing the past the years run down, and far ones are written at round steps.
  const back = ruler({ t: 1989.25, dir: -1, D: 5, tMin: 1954, tMax: 2026.9, gh: 736, fsOf }).filter((k) => k.label);
  for (let i = 1; i < back.length; i++) assert.ok(back[i].y < back[i - 1].y);
  assert.ok(back[back.length - 1].y % 5 === 0);
  // Across the turn of the era there is no year 0, and 1 BCE sits at 0 on the line.
  const era = ruler({ t: -30, dir: 1, D: 20, tMin: -200, tMax: 200, gh: 736, fsOf });
  assert.ok(era.every((k) => k.y !== 0));
  assert.ok(era.some((k) => k.y < 0 && k.at === k.y + 1));
  // Deep time: steps of millions of years, still a bounded number of ticks.
  const deep = ruler({ t: -4e8, dir: 1, D: 1.2e8, tMin: -1.45e10, tMax: 2026, gh: 736, fsOf });
  assert.ok(deep.length > 5 && deep.length < 120 && deep.every((k) => k.y % 1e6 === 0));
});

test('play slows for cards and hurries through empty years', () => {
  assert.equal(paceFor(0, 2, 5), 1);
  assert.ok(paceFor(2, 2, 5) < paceFor(1, 2, 5) && paceFor(1, 2, 5) < 1);
  assert.ok(paceFor(0, 0, 3) > 1 && paceFor(0, 0, 0) > paceFor(0, 0, 3));
});
