// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEIGHTS, parseDate, yearOf, eraOf, score } from '../site/rank.js';

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

test('a small kind widens to its domain before everything', () => {
  const phones = { name: 'Phones', domain: 'devices', domainName: 'Devices' };
  const consoles = { name: 'Game consoles', domain: 'devices', domainName: 'Devices' };
  const things = [
    { ...thing('phone', 2007, 5), category: 'phones', cat: phones },
    ...[1, 2, 3, 4].map((a) => ({ ...thing('c' + a, 1980 + a, a), category: 'consoles', cat: consoles })),
    ...[1, 2, 3, 4, 5].map((a) => thing('l' + a, 1990 + a, 5)),
  ];
  score(things, 2026);
  const phone = things.find((t) => t.id === 'phone');
  assert.equal(phone.peers, 'everything in Devices');
  assert.equal(phone.rank, 0);
});

test('years before the common era count as historians write them, with no year zero', () => {
  assert.equal(yearOf('-0044-03-15'), -44);
  assert.equal(yearOf('1995-08'), 1995);
  assert.equal(parseDate('-0001'), 0.5);            // 1 BCE is the year before 1 CE
  assert.ok(parseDate('-0001-12-31') < parseDate('0001-01-01'));
  assert.ok(parseDate('0001-01-01') - parseDate('-0001-12-31') < 0.01);
  assert.ok(parseDate('-0044-03-15') < parseDate('-0044-03-16') && parseDate('-0044') < parseDate('-0043'));
  assert.ok(parseDate('-66000000') < parseDate('-10000'));
});

test('peers are a decade since 1800, a century before that, a millennium before the year 1', () => {
  assert.equal(eraOf(1995.5).name, 'the 1990s');
  assert.equal(eraOf(1799.5).name, 'the 18th century');
  assert.equal(eraOf(1.5).name, 'the 1st century');
  assert.equal(eraOf(parseDate('-0044')).name, 'the 1st millennium BCE');
  assert.equal(eraOf(parseDate('-2560')).name, 'the 3rd millennium BCE');
  assert.equal(eraOf(parseDate('-66000000')).name, 'prehistory');
  assert.notEqual(eraOf(1066).key, eraOf(1166).key);
});

test('the words of a category name its peers', () => {
  const rulers = { name: 'Rulers & heads of state', domain: 'people', domainName: 'People', from: 'born in' };
  const things = [1, 2, 3, 4, 5].map((a) => ({ id: 'r' + a, category: 'rulers', cat: rulers, born: 1500 + a, end: 1560, inbound: [], signals: { adoption: a } }));
  score(things, 2026);
  assert.equal(things[0].peers, 'rulers & heads of state born in the 16th century');
});
