// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timelineThumb } from '../scripts/thumb.mjs';

test('a thumbnail draws at most ten lines, split into running and ended', () => {
  const spans = Array.from({ length: 30 }, (_, i) => ({ born: 1950 + i, end: i % 2 ? 1990 + i : null, weight: i }));
  const t = timelineThumb(spans, 2026);
  const lines = (d) => (d.match(/M/g) || []).length;
  assert.equal(lines(t.live) + lines(t.dead), 10);
  assert.ok(lines(t.live) > 0 && lines(t.dead) > 0);
});

test('a thumbnail stays inside its 64 by 40 box', () => {
  const t = timelineThumb([{ born: 1940, end: null, weight: 1 }, { born: 2025.9, end: 2026, weight: 1 }], 2026);
  for (const n of (t.live + t.dead).match(/[\d.]+/g).map(Number)) assert.ok(n >= 0 && n <= 64);
});

test('a view with nothing in it gets an empty thumbnail', () => {
  assert.deepEqual(timelineThumb([], 2026), { live: '', dead: '' });
});
