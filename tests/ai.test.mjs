import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, EFFORTS, cleanDate, cleanSpec, partialSpec, specToView, yearOfDate, slug } from '../site/ai.js';
import { parseDate } from '../site/rank.js';

test('dates are kept only in the shapes the page reads', () => {
  assert.equal(cleanDate('1969'), '1969');
  assert.equal(cleanDate('1969-7-20'), '1969-07-20');
  assert.equal(cleanDate('-44-03-15'), '-0044-03-15');
  assert.equal(cleanDate('-66000000'), '-66000000');
  assert.equal(cleanDate('476'), '0476');
  for (const bad of ['sometime', '0', '1969-13', '1969-02-40', '', null, 'c. 1900']) assert.equal(cleanDate(bad), '');
  assert.equal(yearOfDate('-0044-03-15'), -44);
  assert.ok(parseDate(cleanDate('-44')) < parseDate(cleanDate('1')));
});

test('a spec is made safe: no undated entry, no twin, no chapter over another', () => {
  const s = cleanSpec({
    title: '  Jazz  ', description: 'x'.repeat(900),
    chapters: [{ name: 'B', from: 1950, to: 1960 }, { name: 'A', from: 1900, to: 1955 }, { name: 'Bad', from: 0, to: 5 }, { name: 'Back', from: 1990, to: 1980 }],
    entries: [
      { name: 'Later', start: '1950', type: 'nonsense', importance: 9 },
      { name: 'No date', start: 'unknown' },
      { name: 'Early', start: '1900-01-02', end: '1890', events: [{ date: '1901', label: 'Kept' }, { date: 'x', label: 'Dropped' }] },
      { name: 'early', start: '1901' },
      { name: 'Pic', start: '1920', image: { src: 'https://evil.example/x.png' } },
      'not an entry',
    ],
  });
  assert.equal(s.title, 'Jazz');
  assert.equal(s.description.length, 300);
  assert.deepEqual(s.entries.map((e) => e.name), ['Early', 'Pic', 'Later']);
  assert.equal(s.entries[0].end, '');                  // an end before the start is dropped
  assert.equal(s.entries[0].events.length, 1);
  assert.equal(s.entries[2].type, 'events');
  assert.equal(s.entries[2].importance, 5);
  assert.equal(s.entries[1].image, undefined);         // only pictures from Wikimedia are kept
  assert.deepEqual(s.chapters.map((c) => c.name), ['A']);
  assert.equal(cleanSpec(null).entries.length, 0);
});

test('a spec becomes a view file the page can draw', () => {
  const f = specToView({
    title: 'Space', chapters: [{ name: 'The race', from: 1957, to: 1969, note: 'n' }],
    entries: [
      { name: 'Sputnik 1', kind: 'Satellite', type: 'technology', start: '1957-10-04', end: '1958-01-04', summary: 's', wikipedia: 'Sputnik 1', importance: 5,
        image: { src: 'https://upload.wikimedia.org/a.jpg', source: 'https://commons.wikimedia.org/wiki/File:a.jpg' } },
      { name: 'NASA', kind: 'Agency', type: 'organisations', start: '1958', importance: 4, events: [{ date: '1969-07-20', label: 'Moon landing' }] },
    ],
  }, 'abc');
  assert.equal(f.entries.length, 2);
  const [a, b] = f.entries;
  assert.equal(a.id, 'xabc-sputnik-1');
  assert.match(a.id, /^[a-z0-9][a-z0-9-]*$/);
  assert.equal(a.category, 'Satellite');
  assert.equal(a.domain, 'technology');
  assert.deepEqual(a.events.map((e) => e.type), ['born', 'ended']);
  assert.equal(a.events[0].precision, 'day');
  assert.equal(a.status, 'dead');
  assert.equal(a.sources[0].url, 'https://en.wikipedia.org/wiki/Sputnik_1');
  assert.equal(a.image.src, 'https://upload.wikimedia.org/a.jpg');
  assert.equal(a.verified, false);
  assert.equal(b.status, 'alive');
  assert.deepEqual(b.events.map((e) => e.type), ['born', 'milestone']);
  assert.ok(a.rank < b.rank);                          // the more important entry ranks first
  assert.deepEqual(f.view.checkpoints, [{ id: 'the-race', name: 'The race', from: 1957, to: 1969, note: 'n' }]);
  assert.equal(f.spec.entries.length, 2);              // the spec is kept, for "Ask for a change"
  assert.notEqual(specToView(f.spec, 'zzz').entries[0].id, a.id);
});

test('pictures from Wikimedia thumbnails are kept, others are not', () => {
  const pic = (src) => specToView({ entries: [{ name: 'A', start: '1960', image: { src } }] }, 's').entries[0].image?.src;
  // Wikimedia serves thumbnails from thumb.wikimedia.org since 2026, with a tracking query that is dropped.
  assert.equal(pic('https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a4/A.jpg/500px-A.jpg?utm_source=en.wikipedia.org&utm_campaign=api'), 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a4/A.jpg/500px-A.jpg');
  assert.equal(pic('https://upload.wikimedia.org/wikipedia/commons/4/43/B.jpg'), 'https://upload.wikimedia.org/wikipedia/commons/4/43/B.jpg');
  assert.equal(pic('https://example.com/c.jpg'), undefined);
});

test('names make ids, and there are three models to pick from', () => {
  assert.equal(slug('  Café  Müller! '), 'cafe-muller');
  assert.equal(slug('???'), 'entry');
  assert.ok(MODELS.length >= 3 && MODELS.every((m) => /^[a-z0-9-]+\/[a-z0-9.-]+$/.test(m.id) && m.name && m.note));
  assert.ok(!MODELS[0].more, 'the first model is offered at once');
  assert.equal(new Set(MODELS.map((m) => m.id)).size, MODELS.length);
});

test('partialSpec reads what is whole of a spec still being written', () => {
  const full = JSON.stringify({ title: 'Jazz "now"', description: 'From New Orleans.', chapters: [{ name: 'Early', from: 1900, to: 1930, note: 'a {brace}' }], entries: [{ name: 'Louis Armstrong', start: '1901', summary: 'He said "hi" }' }, { name: 'Kind of Blue', start: '1959' }] });
  const cut = full.slice(0, full.indexOf('Kind of Blue') + 6);
  const p = partialSpec(cut);
  assert.equal(p.title, 'Jazz "now"');
  assert.equal(p.description, 'From New Orleans.');
  assert.equal(p.chapters.length, 1);
  assert.deepEqual(p.entries.map((e) => e.name), ['Louis Armstrong']);
  assert.equal(partialSpec(full).entries.length, 2);
  assert.deepEqual(partialSpec('').entries, []);
  assert.equal(EFFORTS[0].id, 'none');
});

test('a plan may be dated by the day and the hour, and its chapters by full dates', () => {
  assert.equal(cleanDate('2027-04-03T9:30'), '2027-04-03T09:30');
  assert.equal(cleanDate('2027-04-03 14:00:00'), '2027-04-03T14:00');
  assert.equal(cleanDate('2027-04T09:30'), '2027-04');   // a time only on a full date
  assert.equal(cleanDate('2027-02-30'), '');
  const s = cleanSpec({
    chapters: [{ name: 'Week 1', from: '2027-04-01', to: '2027-04-07' }, { name: 'Week 2', from: '2027-04-07', to: '2027-04-14' }, { name: 'Mixed', from: 2027, to: '2027-05-01' }],
    entries: [{ name: 'Stand-up', start: '2027-04-05T09:00', end: '2027-04-05T09:15' }, { name: 'Review', start: '2027-04-05T14:00', end: '2027-04-05T13:00' }],
  });
  assert.deepEqual(s.chapters.map((c) => c.from), ['2027-04-01', '2027-04-07']);
  assert.equal(s.entries[1].end, '');                  // an end before the start is dropped, by the hour too
  const f = specToView(s, 'p');
  assert.equal(f.entries[0].events[0].precision, 'minute');
  assert.ok(Math.abs(parseDate('2027-04-05T12:00') - parseDate('2027-04-05') - 0.5 / 365) < 1e-9);
});
