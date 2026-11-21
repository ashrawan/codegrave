// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEAR, GONE, FAR, FULL, SMALL, CARD_MIN, DWELL, DWELL_BUSY, DWELL_CROWD, HOLD_AT, CRAWL, sizeAt, step125, warp, EVEN, focalYears, tracks, stageOf, zoneOf, modesOf, labelRect, openFrom, placeLabels, yearMarks, ruler, paceFor, orderOf, dwellFor, turnPace } from '../site/road.js';

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
  assert.ok(deep.length > 5 && deep.length < 400 && deep.every((k) => k.y % 1e5 === 0));
  assert.ok(deep.filter((k) => k.label).every((k) => k.y % 5e6 === 0));
});

test('the road is not an even ruler: busy years get more of it, empty years less, and nothing changes order', () => {
  // Forty quiet years, then seven starts in six.
  const starts = [1939, 1939.7, 1940.3, 1941.5, 1941.9, 1944.4, 1945.3], marks = starts.map((t) => [t, 1]);
  const w = warp(marks, 1900, 1950);
  assert.equal(w.place(1900), 1900);
  assert.equal(w.place(1950), 1950);                   // the road is as long as before and ends where it did
  assert.ok(w.place(1939) - w.place(1900) < 39 * 0.5);  // the quiet years are shrunk
  assert.ok(w.place(1945.3) - w.place(1939) > 6.3 * 3); // the busy ones stretched
  // Every start has at least its share of the road before it, however close the one before came.
  const xs = starts.map(w.place);
  assert.deepEqual(xs, w.at);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= ((1 - EVEN) * 50) / starts.length - 1e-9);
  // Moments keep their order, and `when` undoes `place`.
  for (let t = 1890, last = -Infinity; t <= 1960; t += 0.37) {
    const x = w.place(t);
    assert.ok(x > last); last = x;
    assert.ok(Math.abs(w.when(x) - t) < 1e-9);
  }
  // Outside the road a moment is its own place.
  assert.equal(w.place(1850), 1850);
  assert.equal(w.when(1975), 1975);
  // Things that share a moment do not share a spot: they stand one after another in the order given, each with
  // its own room, and the calendar waits while they do. A start counts 1 and an end half.
  const tied = warp([[1910, 1], [1930, 0.5], [1930, 1], [1930, 1], [1950, 1]], 1900, 1960);
  const [a, e, b, c, d] = tied.at;
  assert.ok(a < e && e < b && b < c && c < d);
  assert.ok(Math.abs((c - b) - (b - e)) < 1e-9 && Math.abs((b - e) - ((1 - EVEN) * 60) / 4.5) < 1e-9);
  assert.equal(tied.place(1930), e);                    // the moment itself is where the first of them stands
  for (const x of [e, (e + b) / 2, b, c]) assert.equal(tied.when(x), 1930);
  assert.ok(tied.when(c + 0.01) > 1930 && tied.place(1930.001) > c);
  // A mark outside the road is its own place.
  assert.deepEqual(warp([[1850, 1], [1920, 1], [1990, 1]], 1900, 1950).at.filter((x, i) => i !== 1), [1850, 1990]);
  // With nothing to go by, or on a road of no length, the scale is even.
  assert.equal(warp([], 0, 100).place(40), 40);
  assert.equal(warp([[5, 1]], 5, 5).place(5), 5);
  // A scale that is all calendar is the calendar.
  assert.ok(Math.abs(warp(marks, 1900, 1950, 1).place(1920) - 1920) < 1e-9);
});

test('years on an uneven scale: round years first, never touching, and bounded whatever the span', () => {
  // An even scale of 10 pixels a year: every fifth year has room to be written, the rest are ticks.
  const even = yearMarks(1900, 2000, (y) => y * 10, () => 40);
  const written = even.filter((k) => k.label).map((k) => k.y).sort((a, b) => a - b);
  assert.deepEqual(written, [1900, 1905, 1910, 1915, 1920, 1925, 1930, 1935, 1940, 1945, 1950, 1955, 1960, 1965, 1970, 1975, 1980, 1985, 1990, 1995, 2000]);
  assert.equal(even.length, 101);
  // With room for every other year, the years between the fives are written two and three apart, always the same ones.
  const tight = yearMarks(1900, 1910, (y) => y * 10, () => 20).filter((k) => k.label).map((k) => k.y).sort((a, b) => a - b);
  assert.deepEqual(tight, [1900, 1902, 1905, 1907, 1910]);
  // A scale that opens up after 1939: single years are written there and only round ones before.
  const w = warp([1939, 1939.7, 1940.3, 1941.5, 1941.9, 1944.4, 1945.3].map((t) => [t, 1]), 1900, 1950);
  const marks = yearMarks(1900, 1950, (y) => w.place(y) * 12, () => 40).filter((k) => k.label).sort((a, b) => a.y - b.y);
  assert.deepEqual(marks.map((k) => k.y), [1900, 1910, 1920, 1930, 1939, 1940, 1941, 1942, 1944, 1950]);
  for (let i = 1; i < marks.length; i++) assert.ok(marks[i].p - marks[i - 1].p >= 40 - 1e-9);
  // Fourteen billion years with all the room at one end: still a handful of marks, and it returns at once.
  const deep = warp([[-1000, 1], [1500, 1], [1900, 1], [1990, 1], [2020, 1]], -1.4e10, 2026);
  const far = yearMarks(-13999999999, 2026, (y) => ((deep.place(y < 0 ? y + 1 : y) + 1.4e10) / 1.4e10) * 800, () => 30);
  assert.ok(far.length > 5 && far.length < 300);
  assert.ok(far.every((k) => k.y !== 0));
  assert.ok(far.some((k) => k.label && k.y > 1000) && far.some((k) => k.label && k.y < -1e9));
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

test('a card opens out of its small card: it starts as that box and grows upwards into its own place', () => {
  const G = stageOf(1368, 848), gx = G.vx - 200, gy = G.vy + G.gh * 0.7;
  for (const lean of [-1, 0, 1]) {
    const small = labelRect('compact', FULL, gx, gy, SIZES, G, lean), card = labelRect('full', FULL, gx, gy, SIZES, G, lean);
    const at = (g) => openFrom(small, card, g), a = at(0), z = at(1);
    // Closed, it is the small card: where that stands, no taller and no wider.
    assert.ok(a.x === small.cx && a.y === small.y1 && a.h === small.h && (card.w / card.k) * a.k <= small.w + 1e-9);
    // Open, it is the card.
    assert.ok(Math.abs(z.x - card.cx) < 1e-9 && Math.abs(z.y - card.y1) < 1e-9 && Math.abs(z.k - card.k) < 1e-9 && Math.abs(z.h - card.h) < 1e-9);
    // In between it only grows, and moves only towards its side: nothing jumps and nothing overshoots.
    let was = a;
    for (let g = 0.05; g <= 1.0001; g += 0.05) {
      const now = at(g);
      assert.ok(now.h >= was.h - 1e-9 && now.k >= was.k - 1e-9 && now.h <= card.h + 1e-9);
      assert.ok((now.x - was.x) * lean >= -1e-9 && Math.abs(now.x - was.x) < Math.abs(card.cx - small.cx) * 0.2 + 1e-9);
      assert.ok(now.ax > now.x - ((card.w / card.k) * now.k) / 2 && now.ax < now.x + ((card.w / card.k) * now.k) / 2);
      was = now;
    }
    // It starts and ends gently.
    assert.ok(at(0.1).h - a.h < (card.h - small.h) * 0.05 && z.h - at(0.9).h < (card.h - small.h) * 0.05);
  }
  // A small card wider than its card: the card keeps its own scale and only its height opens.
  const wide = labelRect('compact', FULL, gx, gy, { ...SIZES, compactW: 400 }, G), card = labelRect('full', FULL, gx, gy, SIZES, G);
  assert.equal(openFrom(wide, card, 0).k, card.k);
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

test('play slows for cards that have not had their turn, and never stands still', () => {
  const edge = 1 / FULL - 1;   // how far ahead a name first becomes a card
  // Nothing owed: no limit.
  assert.equal(turnPace([]), Infinity);
  // One card that is up: play arrives just short of it as its time runs out.
  assert.ok(Math.abs(turnPace([{ ahead: 0.5, up: true, left: 2 }]) - (0.5 - HOLD_AT) / 2) < 1e-9);
  // Four that begin together, one up and three waiting: slow, but well above a crawl.
  const four = [{ ahead: edge, up: true, left: 1 }, ...[0, 1, 2].map(() => ({ ahead: edge, up: false, left: DWELL_BUSY }))];
  assert.ok(Math.abs(turnPace(four) - (edge - HOLD_AT) / (1 + 3 * DWELL_BUSY)) < 1e-9);
  assert.ok(turnPace(four) > CRAWL * 2 && turnPace(four) < 0.26);
  // The more that wait, the slower; cards that are up together do not add up.
  assert.ok(turnPace(four) < turnPace(four.slice(0, 3)) && turnPace(four.slice(0, 3)) < turnPace(four.slice(0, 2)));
  assert.equal(turnPace([{ ahead: 0.4, up: true, left: 2 }, { ahead: 0.4, up: true, left: 2 }]), turnPace([{ ahead: 0.4, up: true, left: 2 }]));
  // The order they are given in does not matter, and the nearest one that waits sets the pace when it is close.
  assert.equal(turnPace([...four].reverse()), turnPace(four));
  assert.ok(turnPace([{ ahead: 0.1, up: false, left: 2 }, { ahead: 0.5, up: false, left: 2 }]) < turnPace([{ ahead: 0.5, up: false, left: 2 }]));
  // It never comes to a stand: right on top of a card that still waits, play keeps crawling.
  assert.ok(CRAWL > 0);
  assert.equal(turnPace([{ ahead: HOLD_AT, up: false, left: 2 }]), CRAWL);
  assert.equal(turnPace([{ ahead: -0.04, up: false, left: 2 }, { ahead: 0, up: true, left: 1 }]), CRAWL);
  // A longer queue moves faster.
  assert.equal(dwellFor(0), DWELL);
  assert.equal(dwellFor(2), DWELL);
  assert.equal(dwellFor(3), DWELL_BUSY);
  assert.equal(dwellFor(6), DWELL_CROWD);
  assert.ok(DWELL_CROWD < DWELL_BUSY && DWELL_BUSY < DWELL && DWELL_CROWD >= 1.2);
});
