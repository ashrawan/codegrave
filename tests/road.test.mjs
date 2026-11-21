// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEAR, GONE, FAR, FULL, SMALL, CARD_MIN, DWELL, DWELL_BUSY, HOLD_AT, sizeAt, step125, focalYears, tracks, stageOf, zoneOf, modesOf, labelRect, placeLabels, ruler, paceFor, orderOf, dwellFor, holdPace } from '../site/road.js';

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

test('a card on a side lane stands to the outer side of its point, and one in the middle stands on it', () => {
  const G = stageOf(1368, 848), gx = G.vx - 200, gy = G.vy + G.gh * 0.9;
  const mid = labelRect('full', 0.9, gx, gy, SIZES, G), left = labelRect('full', 0.9, gx, gy, SIZES, G, -1), right = labelRect('full', 0.9, gx, gy, SIZES, G, 1);
  assert.equal(mid.cx, gx);
  assert.ok(left.cx < gx && right.cx > gx && Math.abs((gx - left.cx) - (right.cx - gx)) < 1e-9);
  // Its stem still stands on its point, inside the card.
  for (const r of [mid, left, right]) assert.ok(r.ax === gx && r.ax > r.x0 && r.ax < r.x1);
  // A small name does not lean.
  assert.equal(labelRect('compact', 0.5, gx, gy, SIZES, G, -1).cx, labelRect('compact', 0.5, gx, gy, SIZES, G).cx);
  // A card is drawn large enough to read from where it first shows.
  assert.ok(labelRect('full', FULL, gx, gy, SIZES, G).k >= CARD_MIN * G.ks - 1e-9);
});

test('play slows for cards and hurries through empty years', () => {
  assert.equal(paceFor(0, 2, 5), 1);
  assert.ok(paceFor(2, 2, 5) < paceFor(1, 2, 5) && paceFor(1, 2, 5) < 1);
  assert.ok(paceFor(0, 0, 3) > 1 && paceFor(0, 0, 0) > paceFor(0, 0, 3));
});

test('cards that would cover one another take turns while play travels', () => {
  const G = stageOf(1368, 848);
  // Two starts on one spot of the road: `a` is the better ranked and a little further off.
  const at = (key, s, score) => ({ key, end: false, s, score, ahead: 1 / s - 1, gx: G.vx, gy: G.vy + G.gh * s, m: SIZES, lean: 0 });
  const a = at('a', 0.8, 0.9), b = at('b', 0.84, 0.2);
  const show = (states) => {
    const cands = [a, b].map((c) => ({ ...c, pri: orderOf({ zone: zoneOf(c.s), score: c.score, ahead: c.ahead, ...states[c.key] }) })).sort((p, q) => p.pri - q.pri);
    const placed = placeLabels(cands, G);
    return { a: placed.get('a')?.mode, b: placed.get('b')?.mode };
  };
  // Standing still, the better ranked has the card and the other never gets one.
  assert.deepEqual(show({ a: {}, b: {} }), { a: 'full', b: undefined });
  assert.deepEqual(show({ a: { up: 'full' }, b: {} }), { a: 'full', b: undefined });
  // In play, the one that is up keeps its place until it has had its time...
  assert.deepEqual(show({ a: { up: 'full', turn: 'due' }, b: { turn: 'due' } }), { a: 'full', b: undefined });
  // ...then it gives way to the one it was hiding...
  assert.deepEqual(show({ a: { up: 'full', turn: 'done' }, b: { turn: 'due' } }), { a: undefined, b: 'full' });
  // ...which stays, also after its own time, so the two do not swap back and forth.
  assert.deepEqual(show({ a: { turn: 'done' }, b: { up: 'full', turn: 'due' } }), { a: undefined, b: 'full' });
  assert.deepEqual(show({ a: { turn: 'done' }, b: { up: 'full', turn: 'done' } }), { a: undefined, b: 'full' });
  // Before either is up, the nearer one goes first, whatever its rank: things come in the order they happened.
  assert.deepEqual(show({ a: { turn: 'due' }, b: { turn: 'due' } }), { a: undefined, b: 'full' });
  // The open entry is never pushed out while standing still; in play it takes its turn like any other.
  assert.deepEqual(show({ a: { open: true }, b: { up: 'full' } }), { a: 'full', b: undefined });
  assert.deepEqual(show({ a: { up: 'full', turn: 'due', open: true }, b: { turn: 'due' } }), { a: 'full', b: undefined });
  assert.deepEqual(show({ a: { up: 'full', turn: 'done', open: true }, b: { turn: 'due' } }), { a: undefined, b: 'full' });
  // An end plate that is up keeps its place until its time is over, then gives way to a start that waits.
  const waits = orderOf({ zone: 0, turn: 'due', ahead: 0.3, score: 0.5 });
  assert.ok(orderOf({ zone: 0, end: true, up: 'near', turn: 'due', score: 0.5 }) < waits);
  assert.ok(orderOf({ zone: 0, end: true, up: 'near', turn: 'done', score: 0.5 }) > waits);
  // Out of play nothing changes: what is up stays up, and a card stays a card.
  assert.ok(orderOf({ zone: 0, up: 'full', score: 0.1 }) < orderOf({ zone: 0, score: 0.9 }));
  assert.ok(orderOf({ zone: 0, score: 0.5 }) < orderOf({ zone: 1, up: 'compact', score: 0.5 }));
});

test('play stands for a card that has not had its turn, and a longer queue moves faster', () => {
  assert.equal(holdPace(HOLD_AT), 0);
  assert.equal(holdPace(-0.04), 0);
  assert.ok(holdPace(0.1) > 0 && holdPace(0.2) > holdPace(0.1));
  // Where a name first becomes a card, the limit is above the fastest play travels, so play only slows as it comes close.
  assert.ok(holdPace(1 / FULL - 1) > 0.26 * 5);
  assert.equal(dwellFor(0), DWELL);
  assert.equal(dwellFor(2), DWELL);
  assert.equal(dwellFor(3), DWELL_BUSY);
  assert.ok(DWELL_BUSY < DWELL && DWELL_BUSY >= 1.5);
});
