// The media wall beside the road: which era a year falls in, how an era's media are shared between the
// walls, and that the data in data/wall.json reads as the page expects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eraAt, sidesOf, SLOTS, FRAMES, FRAMES_PHONE, rgbOf, slotFor, frameBox } from '../site/wall.js';

const eras = [
  { id: 'a', from: -3000, to: 0, media: [] },
  { id: 'b', from: 1, to: 1900, media: [] },
  { id: 'c', from: 1960, to: 1970, media: [] },
];

test('a year falls in its era, or the nearest one', () => {
  assert.equal(eraAt(eras, -44), 0);
  assert.equal(eraAt(eras, 1), 1);
  assert.equal(eraAt(eras, 1899), 1);
  assert.equal(eraAt(eras, 1969), 2);
  assert.equal(eraAt(eras, 1900), 1);       // between eras: the nearer one
  assert.equal(eraAt(eras, 1955), 2);
  assert.equal(eraAt(eras, 2025), 2);       // past the last
  assert.equal(eraAt(eras, -9000), 0);      // before the first
  assert.equal(eraAt([], 1969), -1);
});

test('an era\'s media alternate between the walls, left first, and a side may be asked for', () => {
  const m = (n, side) => ({ src: String(n), side });
  const { left, right } = sidesOf({ media: [m(1), m(2), m(3), m(4, 'left'), m(5)] });
  assert.deepEqual(left.map((x) => x.src), ['1', '3', '4']);
  assert.deepEqual(right.map((x) => x.src), ['2', '5']);
  const many = sidesOf({ media: Array.from({ length: 20 }, (_, i) => m(i, 'left')) });
  assert.equal(many.left.length, SLOTS);
  assert.equal(many.right.length, SLOTS);   // a full side lends to the other
  assert.deepEqual(sidesOf(null), { left: [], right: [] });
});

test('every frame has a place', () => {
  assert.equal(FRAMES.length, SLOTS);
  assert.ok(FRAMES_PHONE.length <= SLOTS);
  for (const f of [...FRAMES, ...FRAMES_PHONE]) assert.ok(f.d > 0 && f.x > 0 && f.x <= 1 && f.w > 0);
  assert.deepEqual(rgbOf('#e3b25f'), [227, 178, 95]);
  assert.deepEqual(rgbOf('nope', [1, 2, 3]), [1, 2, 3]);
});

test('the eras in data/wall.json run in order and each has media to show', () => {
  const wall = JSON.parse(readFileSync(new URL('../data/wall.json', import.meta.url), 'utf8'));
  let last = -Infinity;
  for (const e of wall.eras) {
    assert.ok(e.from >= last && e.from < e.to, `${e.id} is in order`);
    last = e.to;
    assert.ok(e.media.length >= 4, `${e.id} has at least four pictures or films`);
    for (const m of e.media) assert.ok(m.credit && m.licence && m.source && m.alt, `${e.id}: every item is credited`);
  }
  // Every year from the first written year to today falls inside an era, not between two.
  for (let y = 1; y <= 2026; y++) assert.ok(wall.eras.some((e) => y >= e.from && y < e.to), `${y} is in an era`);
});

test('a card\'s picture takes a free frame first, then the one left longest ago', () => {
  assert.equal(slotFor([{ from: 'card', live: true }, { from: 'era' }, { from: undefined }]), 1);
  assert.equal(slotFor([{ from: 'card', live: true }, { from: 'card', live: false, gone: 50 }, { from: 'card', live: false, gone: 20 }]), 2);
  assert.equal(slotFor([{ from: 'card', live: true }, { from: 'card', live: true }]), -1);
  assert.equal(slotFor([]), -1);
});

test('the frames of a wall stand clear of one another and inside the screen', () => {
  // The stage at 1440 x 900 and at 1280 x 720, as the page measures it.
  for (const g of [{ fw: 329, half: 684, gh: 631, F: 757 }, { fw: 291, half: 604, gh: 487, F: 584 }]) {
    const boxes = FRAMES.map((s) => frameBox(s, g));
    for (const b of boxes) assert.ok(b.x0 > 0 && b.x1 < g.half, 'inside its half of the screen');
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0, `frames ${i} and ${j} overlap`);
    }
  }
});
