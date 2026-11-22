// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { yearText, fmtDate, when, spanText, sideOf, paperFor, shapeView, fileName, coverPictures, INKS, PAPERS, POSTER, posterSheets, posterSlots, posterCardWidth } from '../site/print.js';

test('dates are written as the page writes them', () => {
  assert.equal(yearText(1969), '1969');
  assert.equal(yearText(800), '800 CE');
  assert.equal(yearText(-44), '44 BCE');
  assert.equal(yearText(-66000000), '66 million years ago');
  assert.equal(fmtDate('1969-07-20', 'day'), '20 July 1969');
  assert.equal(fmtDate('1969-07', 'month'), 'July 1969');
  assert.equal(fmtDate('-0044-03-15', 'year'), '44 BCE');
  assert.equal(fmtDate('1450', 'circa'), 'c. 1450');
  assert.equal(spanText(1957), '1957 – Today');
  assert.equal(spanText(1957, 1975), '1957 – 1975');
});

test('entries sort by date, before the common era first', () => {
  assert.ok(when('-0044-03-15') < when('0001') && when('1969-07-20') < when('1969-07-21'));
});

test('views stand like the pips of a die: first left, second right, third left', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(sideOf), ['l', 'r', 'l', 'r', 'l', 'r']);
});

test('paper: Letter where it is usual, else A4', () => {
  assert.equal(paperFor('en-US'), 'letter');
  assert.equal(paperFor('en-GB'), 'a4');
  assert.equal(paperFor('ne-NP'), 'a4');
  assert.equal(paperFor(undefined), 'a4');
  assert.ok(PAPERS.a4 && PAPERS.letter && INKS.length === 8);
});

test('a built view file becomes chapters and entries in date order', { skip: !fs.existsSync('site/data/boot.json') && 'run node scripts/build.mjs first' }, () => {
  const boot = JSON.parse(fs.readFileSync('site/data/boot.json'));
  const payload = JSON.parse(fs.readFileSync('site/data/v/codegrave/space-exploration.json'));
  const v = shapeView(payload, boot, 0);
  assert.equal(v.id, 'codegrave/space-exploration');
  assert.equal(v.es.length, payload.entries.length);
  assert.ok(v.chs.length > 0);
  for (let i = 1; i < v.es.length; i++) assert.ok(v.es[i - 1].t <= v.es[i].t);
  for (const e of v.es) assert.ok(e.ci === -1 || (e.y >= v.chs[e.ci].from && e.y <= v.chs[e.ci].to));
});

test('the downloaded file is named after the views', () => {
  assert.equal(fileName(['Space Exploration', 'Computers']), 'space-exploration-computers.pdf');
  assert.equal(fileName(['Côte d’Ivoire']), 'cote-d-ivoire.pdf');
  assert.equal(fileName(['']), 'codegrave.pdf');
});

test('a year range keeps only the entries begun in it', { skip: !fs.existsSync('site/data/boot.json') && 'run node scripts/build.mjs first' }, () => {
  const boot = JSON.parse(fs.readFileSync('site/data/boot.json'));
  const payload = JSON.parse(fs.readFileSync('site/data/v/codegrave/space-exploration.json'));
  const v = shapeView(payload, boot, 0, [1960, 1975]);
  assert.ok(v.es.length > 0 && v.es.every((e) => e.y >= 1960 && e.y <= 1975));
  assert.ok(v.chs.every((c) => c.to >= 1960 && c.from <= 1975));
});

test('cover pictures spread over time and kinds, in date order', () => {
  const es = [];
  for (let y = 1900; y < 2000; y++) es.push({ t: y, y, rank: y % 7, kind: y < 1990 ? 'Astronaut' : 'Rocket', img: { src: 'p' + y } });
  const p = coverPictures(es, 12);
  assert.equal(p.length, 12);
  for (let i = 1; i < p.length; i++) assert.ok(p[i - 1].t < p[i].t);
  assert.ok(p[0].y < 1910 && p.at(-1).y >= 1990);       // from the start to the end
  assert.ok(p.some((e) => e.kind === 'Rocket'));         // not all of one kind
  assert.equal(coverPictures(es.slice(0, 3), 12).length, 3);
});

test('the poster uses the fewest sheets whose cards stay readable', () => {
  const one = posterSheets(20);
  assert.equal(one.sizes.length, 1);
  const space = posterSheets(85);
  assert.deepEqual(space.sizes, [29, 29, 27]);
  assert.ok(posterCardWidth(space.C) >= POSTER.minCard);
  const big = posterSheets(1000);
  assert.equal(big.sizes.reduce((a, b) => a + b, 0), 1000);
  assert.ok(posterCardWidth(big.C) >= POSTER.minCard);
});

test('poster slots run in date order, top to bottom, and keep the first and last columns full', () => {
  for (const [n, C] of [[29, 8], [27, 8], [32, 8], [9, 3]]) {
    const s = posterSlots(n, C);
    assert.equal(s.length, n);
    // date order is column by column, then slot by slot
    for (let i = 1; i < s.length; i++) assert.ok(s[i][0] > s[i - 1][0] || (s[i][0] === s[i - 1][0] && s[i][1] > s[i - 1][1]));
    if (n >= 4 * C - (C - 2)) {
      assert.equal(s.filter(([c]) => c === 0).length, 4);
      assert.equal(s.filter(([c]) => c === C - 1).length, 4);
    }
  }
});
