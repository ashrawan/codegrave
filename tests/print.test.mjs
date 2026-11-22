// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { yearText, fmtDate, when, spanText, sideOf, paperFor, shapeView, fileName, INKS, PAPERS } from '../site/print.js';

test('dates are written as the page writes them', () => {
  assert.equal(yearText(1969), '1969');
  assert.equal(yearText(800), '800 CE');
  assert.equal(yearText(-44), '44 BCE');
  assert.equal(yearText(-66000000), '66 million years ago');
  assert.equal(fmtDate('1969-07-20', 'day'), '20 July 1969');
  assert.equal(fmtDate('1969-07', 'month'), 'July 1969');
  assert.equal(fmtDate('-0044-03-15', 'year'), '44 BCE');
  assert.equal(fmtDate('1450', 'circa'), 'c. 1450');
  assert.equal(spanText(1957), '1957 – today');
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
