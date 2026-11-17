// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEIGHTS, parseDate, score } from '../site/rank.js';

const cat = { name: 'Languages' };
const thing = (id, born, adoption, extra = {}) => ({
  id, category: 'languages', cat, born, end: null, inbound: [], signals: { adoption }, ...extra,
});

test('weights add up to 1', () => {
  const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('dates become decimal years, in order', () => {
  assert.equal(parseDate('1995'), 1995.5);
  assert.ok(parseDate('1995-01-01') < parseDate('1995-06') && parseDate('1995-06') < parseDate('1995-12-31'));
  assert.ok(parseDate('1995-12-31') < parseDate('1996-01-01'));
});

test('higher adoption ranks first among peers', () => {
  const things = [1, 2, 3, 4, 5].map((a) => thing('t' + a, 1990 + a, a));
  score(things, 2026);
  const best = things.find((t) => t.id === 't5'), worst = things.find((t) => t.id === 't1');
  assert.equal(best.rank, 0);
  assert.ok(worst.rank > best.rank);
  assert.equal(best.peers, 'languages first released in the 1990s');
});

test('a small group widens instead of crowning a lone entry', () => {
  const things = [thing('only', 1960, 1), ...[1, 2, 3, 4, 5].map((a) => thing('n' + a, 1990 + a, 5))];
  score(things, 2026);
  const only = things.find((t) => t.id === 'only');
  assert.equal(only.peers, 'all languages');
  assert.ok(only.rank > 0, 'a niche lone entry must not be top of its class');
});

test('links pointing at a thing raise its score', () => {
  const a = thing('a', 1991, 3), b = thing('b', 1991, 3, { inbound: [{}, {}, {}] });
  score([a, b], 2026);
  assert.ok(b.score > a.score);
});
