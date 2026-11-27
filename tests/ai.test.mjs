import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, EFFORTS, cleanDate, cleanSpec, partialSpec, specToView, yearOfDate, slug, readDate, showDate, readBound, chapterOf, specProblem, axisLabel, fmtValue, axisOfSpec, whereOf, findPlaces, kmBetween } from '../site/ai.js';
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

test('readDate reads dates as people type them, and showDate writes them back', () => {
  const pairs = [['20 Jul 1969', '1969-07-20'], ['July 1969', '1969-07'], ['Jul 20, 1969', '1969-07-20'], ['44 BCE', '-0044'],
    ['Sat 3 Apr 2027, 09:30', '2027-04-03T09:30'], ['1969-07-20', '1969-07-20'], ['2027', '2027'], ['30 Feb 2026', ''], ['soon', ''], ['', '']];
  for (const [typed, iso] of pairs) assert.equal(readDate(typed), iso, typed);
  assert.equal(showDate('1969-07-20'), '20 Jul 1969');
  assert.equal(showDate('2027-04-03T09:30'), '3 Apr 2027, 09:30');
  assert.equal(showDate('-0044'), '44 BCE');
  assert.equal(showDate(-44), '44 BCE');
  for (const iso of ['1969', '1969-07', '1969-07-20', '2027-04-03T09:30', '-0044']) assert.equal(readDate(showDate(iso)), iso, iso);
});

test('readBound takes whole years or full dates for a chapter', () => {
  assert.equal(readBound('1969'), 1969);
  assert.equal(readBound('44 BCE'), -44);
  assert.equal(readBound('27 Nov 2026'), '2026-11-27');
  assert.equal(readBound('Nov 2026'), null);
  assert.equal(readBound('later'), null);
});

test('chapterOf puts each entry in the chapter it starts in', () => {
  const spec = cleanSpec({ chapters: [{ name: 'Week 1', from: '2026-11-27', to: '2026-12-03' }, { name: 'Week 2', from: '2026-12-04', to: '2026-12-10' }],
    entries: [{ name: 'A', start: '2026-11-27' }, { name: 'B', start: '2026-12-03T18:00' }, { name: 'C', start: '2026-12-04' }, { name: 'D', start: '2027-01-01' }] });
  assert.deepEqual(chapterOf(spec), [0, 0, 1, -1]);
  const years = cleanSpec({ chapters: [{ name: 'Sixties', from: 1960, to: 1969 }], entries: [{ name: 'A', start: '1969-12-31' }, { name: 'B', start: '1970' }] });
  assert.deepEqual(chapterOf(years), [0, -1]);
});

test('specProblem says why an edit cannot be kept', () => {
  const ok = { entries: [{ name: 'A', start: '1969' }], chapters: [{ name: 'One', from: 1960, to: 1969 }] };
  assert.equal(specProblem(ok), '');
  assert.match(specProblem({ entries: [] }), /at least one/);
  assert.match(specProblem({ entries: [{ name: '', start: '1969' }] }), /needs a name/);
  assert.match(specProblem({ entries: [{ name: 'A', start: '1969' }, { name: 'a', start: '1970' }] }), /Two entries/);
  assert.match(specProblem({ entries: [{ name: 'A', start: 'soon' }] }), /needs the date/);
  assert.match(specProblem({ entries: [{ name: 'A', start: '1970', end: '1969' }] }), /ends before/);
  assert.match(specProblem({ ...ok, chapters: [{ name: 'One', from: 1960, to: '1969-01-01' }] }), /same at both ends/);
  assert.match(specProblem({ ...ok, chapters: [{ name: 'One', from: 1960, to: 1969 }, { name: 'Two', from: 1969, to: 1975 }] }), /overlap/);
});

test('a ranked list is laid out by rank, #1 first, with no dates', () => {
  const spec = cleanSpec({ axis: 'rank', chapters: [{ name: 'Top 2', from: 1, to: 2 }], entries: [
    { name: 'Rice', rank: 2 }, { name: 'Bread', rank: 1 }, { name: 'Noodles' }, { name: 'Rice', rank: 4 } ] });
  assert.equal(spec.axis, 'rank');
  assert.deepEqual(spec.entries.map((e) => [e.name, e.rank, e.start, e.end]), [['Bread', 1, '0001', ''], ['Rice', 2, '0002', ''], ['Noodles', 3, '0003', '']]);
  const f = specToView(spec, 's1');
  assert.equal(f.view.axis, 'rank');
  assert.deepEqual(f.entries.map((e) => e.pos), [1, 2, 3]);
  assert.ok(f.entries.every((e) => e.status === 'alive' && e.events.length === 1));
  assert.deepEqual(chapterOf(spec), [0, 0, -1]);
  assert.equal(specProblem({ axis: 'rank', entries: [{ name: 'Rice' }] }), '');
  assert.equal(partialSpec('{"title":"Foods","axis":"rank","entries":[{"name":"Rice","rank":1}').axis, 'rank');
});

test('a measured list is laid out by value, with its unit', () => {
  const spec = cleanSpec({ axis: 'scale', unit: 'm', chapters: [{ name: 'Under 500 m', from: 0, to: 500 }],
    entries: [{ name: 'Burj Khalifa', value: 828 }, { name: 'Eiffel Tower', value: '330' }, { name: 'No height' }] });
  assert.deepEqual(spec.entries.map((e) => [e.name, e.value]), [['Eiffel Tower', 330], ['Burj Khalifa', 828]]);
  assert.equal(spec.log, false);
  const f = specToView(spec, 's2');
  assert.deepEqual(f.entries.map((e) => e.val), ['330 m', '828 m']);
  assert.equal(f.entries[0].events[0].date, '0001-01-01');
  assert.equal(f.entries[1].events[0].date, '1001-01-01');
  assert.equal(axisLabel(f.view, 1001), '830 m');
  assert.equal(axisLabel(f.view, 1001, true), '830');
  assert.deepEqual(chapterOf(spec), [0, -1]);
  // Values that span powers of ten get a log scale.
  const far = cleanSpec({ axis: 'scale', unit: 'km', entries: [{ name: 'ISS', value: 400 }, { name: 'Moon', value: 384400 }, { name: 'Sun', value: 149600000 }] });
  assert.equal(far.log, true);
  assert.equal(fmtValue(149600000, 'km'), '150 million km');
  assert.equal(fmtValue(999, '$'), '$999');
  assert.match(specProblem({ axis: 'scale', entries: [{ name: 'A' }] }), /needs a value/);
});

test('a spec that names no axis takes the one its entries show', () => {
  assert.equal(axisOfSpec({ entries: [{ name: 'A', start: '1969' }, { name: 'B', rank: 2 }] }), 'time');
  assert.equal(axisOfSpec({ entries: [{ name: 'A', rank: 1 }, { name: 'B', rank: 2 }] }), 'rank');
  assert.equal(axisOfSpec({ entries: [{ name: 'A', value: '1,200' }, { name: 'B', value: 3 }] }), 'scale');
});

test('a place is read from Wikipedia, never taken from the model', async () => {
  assert.deepEqual(whereOf([25.19722, 55.27417]), [25.1972, 55.2742]);
  assert.equal(whereOf([91, 0]), null);
  assert.equal(whereOf([null, 3]), null);
  assert.equal(whereOf('London'), null);
  const entries = [
    { name: 'Burj Khalifa', wikipedia: 'Burj Khalifa', where: [1, 1] },
    { name: 'Ada Lovelace', wikipedia: 'Ada Lovelace', place: 'London' },
    { name: 'Democracy', wikipedia: 'Democracy', where: [5, 5] },
    { name: 'Olympus Mons', wikipedia: 'Olympus Mons' },
  ];
  const get = async () => ({ query: { pages: {
    1: { title: 'Burj Khalifa', coordinates: [{ lat: 25.19722, lon: 55.27417, globe: 'earth' }] },
    2: { title: 'London', coordinates: [{ lat: 51.5072, lon: -0.1275 }] },
    3: { title: 'Ada Lovelace' }, 4: { title: 'Democracy' },
    5: { title: 'Olympus Mons', coordinates: [{ lat: 18.65, lon: 226.2, globe: 'mars' }] },
  } } });
  assert.equal(await findPlaces(entries, get), 2);
  assert.deepEqual(entries[0].where, [25.1972, 55.2742]);
  assert.deepEqual(entries[1].where, [51.5072, -0.1275]);
  assert.equal(entries[2].where, undefined);
  assert.equal(entries[3].where, undefined);
});

test('an address gives the exact spot, and only near the place Wikipedia gave', async () => {
  assert.ok(Math.abs(kmBetween([47.6062, -122.3321], [47.6101, -122.2015]) - 9.8) < 0.5);
  const entries = [
    { name: 'Ice rink opens', place: 'Bellevue, Washington', address: 'Bellevue Downtown Park, Bellevue, Washington, USA' },
    { name: 'A namesake far away', place: 'Bellevue, Washington', address: 'Main Street Hall, Bellevue, Washington, USA' },
    { name: 'No such hall', place: 'Bellevue, Washington', address: 'Nowhere Hall, Bellevue, Washington, USA' },
    { name: 'A fair', wikipedia: 'Seattle', place: 'Seattle Center' },
    { name: 'No wider place', address: 'Space Needle, Seattle, Washington, USA' },
    { name: 'No wider place, wrong town', address: 'Old Museum, Seattle, Washington, USA' },
  ];
  const get = async () => ({ query: { pages: {
    1: { title: 'Bellevue, Washington', coordinates: [{ lat: 47.6144, lon: -122.1536, type: 'city' }] },
    2: { title: 'Seattle', coordinates: [{ lat: 47.6039, lon: -122.33, type: 'city' }] },
    3: { title: 'Seattle Center', coordinates: [{ lat: 47.6213, lon: -122.3497, type: 'landmark' }] },
  } } });
  const hit = (lat, lon, city, name) => ({ geometry: { coordinates: [lon, lat] }, properties: { city, name } });
  const asked = [];
  const json = async (url) => {
    const q = decodeURIComponent(url.split('&q=')[1].split('&')[0]); asked.push(q);
    if (q.startsWith('Bellevue Downtown Park')) return { features: [hit(41.15, -95.9, 'Bellevue', 'Downtown Park'), hit(47.6125, -122.2046, 'Bellevue', 'Bellevue Downtown Park')] };
    if (q.startsWith('Main Street Hall')) return { features: [hit(41.15, -95.9, 'Bellevue', 'Main Street Hall')] };
    if (q.startsWith('Space Needle')) return { features: [hit(47.6205, -122.3493, 'Seattle', 'Space Needle')] };
    if (q.startsWith('Old Museum')) return { features: [hit(32.86, -83.69, 'Macon', 'Museum')] };
    if (q.startsWith('Seattle,')) return { features: [hit(47.6038, -122.3301, undefined, 'Seattle')] };
    return { features: [] };
  };
  assert.equal(await findPlaces(entries, get, json), 6);
  assert.deepEqual(entries[0].where, [47.6125, -122.2046]);   // the park, not the Bellevue in Nebraska
  assert.deepEqual(entries[1].where, [47.6144, -122.1536]);   // too far: the city stands
  assert.deepEqual(entries[2].where, [47.6144, -122.1536]);   // not found: the city stands
  assert.deepEqual(entries[3].where, [47.6213, -122.3497]);   // the venue before the city its picture comes from
  assert.deepEqual(entries[4].where, [47.6205, -122.3493]);
  assert.deepEqual(entries[5].where, [47.6038, -122.3301]);   // the wrong town is refused, then the town itself is found
  assert.ok(!asked.includes('Bellevue, Washington, USA'));
});

test("the model's coordinates only refine a place that is already known", async () => {
  const entries = [
    { name: 'A hall in town', place: 'Bellevue, Washington', coordinates: [47.6101, -122.2015] },
    { name: 'Numbers in another city', place: 'Bellevue, Washington', coordinates: [45.52, -122.68] },
    { name: 'Numbers with nothing to check them', coordinates: [47.61, -122.2] },
    { name: 'A building with its own article', wikipedia: 'Space Needle', coordinates: [47.6, -122.3] },
    { name: 'An address that is found', place: 'Bellevue, Washington', address: 'Downtown Park, Bellevue, Washington, USA', coordinates: [47.6101, -122.2015] },
  ];
  const get = async () => ({ query: { pages: {
    1: { title: 'Bellevue, Washington', coordinates: [{ lat: 47.6144, lon: -122.1536, type: 'city' }] },
    2: { title: 'Space Needle', coordinates: [{ lat: 47.6204, lon: -122.3491, type: 'landmark' }] },
  } } });
  const json = async () => ({ features: [{ geometry: { coordinates: [-122.2046, 47.6125] }, properties: { city: 'Bellevue' } }] });
  assert.equal(await findPlaces(entries, get, json), 4);
  assert.deepEqual(entries[0].where, [47.6101, -122.2015]);
  assert.deepEqual(entries[1].where, [47.6144, -122.1536]);
  assert.equal(entries[2].where, undefined);
  assert.deepEqual(entries[3].where, [47.6204, -122.3491]);
  assert.deepEqual(entries[4].where, [47.6125, -122.2046]);
  assert.deepEqual(cleanSpec({ title: 'T', entries: [{ name: 'A', start: '2026', coordinates: [47.61012, -122.20151] }, { name: 'B', start: '2026', coordinates: 'Seattle' }] }).entries.map((e) => e.coordinates), [[47.6101, -122.2015], undefined]);
});
