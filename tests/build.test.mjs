// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { shardOf } from '../site/keys.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// A private copy of the data and the build, so a test can break a file without touching the real one.
function copyOfRepo() {
  const copy = mkdtempSync(join(tmpdir(), 'codegrave-'));
  cpSync(join(root, 'data'), join(copy, 'data'), { recursive: true });
  cpSync(join(root, 'scripts'), join(copy, 'scripts'), { recursive: true });
  mkdirSync(join(copy, 'site'));
  for (const f of ['rank.js', 'keys.js']) cpSync(join(root, 'site', f), join(copy, 'site', f));
  return copy;
}
function build(copy, ...args) {
  try { return execFileSync('node', [join(copy, 'scripts', 'build.mjs'), '--quiet', ...args], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { return e.stdout + e.stderr; }
}
const edit = (file, change) => { const v = JSON.parse(readFileSync(file, 'utf8')); change(v); writeFileSync(file, JSON.stringify(v)); };

test('the data in data/ passes every rule', () => {
  const out = execFileSync('node', [join(root, 'scripts', 'build.mjs'), '--check', '--quiet'], { encoding: 'utf8' });
  assert.match(out, / 0 errors/);
});

test('the build rejects a long label, an unknown link type, a plain-http link and an image from an unknown host', () => {
  const copy = copyOfRepo();
  edit(join(copy, 'data', 'base', 'languages', 'typescript.json'), (thing) => {
    thing.events.push({ type: 'released', date: '2016-09', precision: 'month', label: 'A label that is far too long', note: 'x' });
    thing.links.push({ type: 'cousin_of', to: 'javascript' });
    thing.website = 'http://example.com/';
    thing.image = { src: 'https://example.com/a.png', alt: 'x', credit: 'x', licence: 'x', source: 'https://example.com/' };
  });
  const out = build(copy, '--check');
  assert.match(out, /"label" must be 1 to 16 characters/);
  assert.match(out, /unknown link type "cousin_of"/);
  assert.match(out, /"website" must be an https link/);
  assert.match(out, /image "src" must be a path under data\/media\//);
});

test('the build rejects a view whose eras overlap', () => {
  const copy = copyOfRepo();
  edit(join(copy, 'data', 'community', 'codegrave', 'views', 'browser-wars.json'), (view) => {
    view.checkpoints.push({ id: 'overlap', name: 'Overlap', from: 2000, to: 2005, note: 'x' });
  });
  assert.match(build(copy, '--check'), /overlap/);
});

test('dates before the common era are accepted, year zero and an end before the start are not', () => {
  const copy = copyOfRepo();
  const file = join(copy, 'data', 'base', 'languages', 'typescript.json');
  const born = (t) => t.events.find((e) => e.type === 'born');
  edit(file, (t) => { t.events = [{ type: 'born', date: '-0044-03-15', precision: 'day' }]; t.names = [{ name: 'TypeScript', from: '-0044' }]; t.links = []; });
  assert.match(build(copy, '--check'), / 0 errors/);
  edit(file, (t) => { born(t).date = '-66000000'; born(t).precision = 'circa'; t.names[0].from = '-66000000'; });
  assert.match(build(copy, '--check'), / 0 errors/);
  edit(file, (t) => { born(t).date = '0000'; t.names[0].from = '0000'; });
  assert.match(build(copy, '--check'), /born has a malformed date "0000"/);
  edit(file, (t) => {
    born(t).date = '-0044'; t.names[0].from = '-0044'; t.status = 'dead'; t.cause = 'x';
    t.events.push({ type: 'ended', date: '-0100', precision: 'year' });
  });
  assert.match(build(copy, '--check'), /ended before it was born/);
});

test('the build rejects an unknown label, a second entry for one Wikidata item, and a view that lists a missing entry', () => {
  const copy = copyOfRepo();
  edit(join(copy, 'data', 'base', 'languages', 'typescript.json'), (t) => { t.labels = ['no-such-label']; t.wikidata = 'Q1'; });
  edit(join(copy, 'data', 'base', 'languages', 'javascript.json'), (t) => { t.wikidata = 'Q1'; });
  edit(join(copy, 'data', 'community', 'codegrave', 'views', 'browser-wars.json'), (v) => { v.things.push('no-such-entry'); });
  const out = build(copy, '--check');
  assert.match(out, /unknown label "no-such-label"/);
  assert.match(out, /is the same Wikidata item \(Q1\)/);
  assert.match(out, /lists unknown entry "no-such-entry"/);
});

test('a community folder needs a profile, and may only list base entries or its own', () => {
  const copy = copyOfRepo();
  const dir = join(copy, 'data', 'community', 'someone');
  mkdirSync(join(dir, 'views'), { recursive: true });
  mkdirSync(join(dir, 'entries'), { recursive: true });
  writeFileSync(join(dir, 'views', 'mine.json'), JSON.stringify({ id: 'mine', name: 'Mine', description: 'A view of my own.', entries: ['typescript', 'my-thing'] }));
  writeFileSync(join(dir, 'entries', 'my-thing.json'), JSON.stringify({
    id: 'my-thing', category: 'languages', names: [{ name: 'My thing', from: '2020' }], events: [{ type: 'born', date: '2020', precision: 'year' }],
    status: 'alive', sources: [{ title: 'x', url: 'https://example.com/' }],
  }));
  assert.match(build(copy, '--check'), /data\/community\/someone: needs a profile\.json/);
  writeFileSync(join(dir, 'profile.json'), JSON.stringify({ title: 'Someone' }));
  assert.match(build(copy, '--check'), / 0 errors/);
  // The same name and kind as a base entry is a duplicate, not a community entry.
  edit(join(dir, 'entries', 'my-thing.json'), (t) => { t.names[0].name = 'TypeScript'; });
  assert.match(build(copy, '--check'), /has the same name and kind as "typescript"/);
});

test('the build writes one ready-made file per view, old addresses, detail files and a search index', () => {
  const copy = copyOfRepo();
  const out = build(copy);
  assert.match(out, /wrote site\/data\//);
  const read = (name) => JSON.parse(readFileSync(join(copy, 'site', 'data', name), 'utf8'));
  const boot = read('boot.json');
  assert.ok(boot.views.length > 0 && boot.views.every((v) => v.type === 'community' && v.id.includes('/') && v.thumb), 'the catalogue lists community views only');
  assert.ok(boot.domains.every((d) => d.words && d.words.born), 'every branch of the map carries its words');
  const top = boot.domains.filter((d) => !d.parent).map((d) => d.id);
  assert.deepEqual(top, ['people', 'places', 'organisations', 'events', 'arts', 'knowledge', 'society', 'life', 'earth-space', 'technology']);
  assert.equal(boot.domains.find((d) => d.id === 'computing').parent, 'technology');

  // A community view: everything it shows is in its one file.
  const view = read('v/codegrave/browser-wars.json');
  assert.equal(view.view.id, 'codegrave/browser-wars');
  assert.equal(view.entries.length, view.view.count);
  const netscape = view.entries.find((t) => t.id === 'netscape');
  for (const k of ['rank', 'score', 'topPct', 'peers', 'inbound', 'home', 'tier']) assert.ok(k in netscape, `an entry carries "${k}"`);
  assert.ok(netscape.links.every((l) => typeof l.n === 'string'), 'links carry the name of the other entry');
  // Its old address still answers, with the new id inside.
  assert.equal(read('v/browser-wars.json').view.id, 'codegrave/browser-wars');
  // A classical view never carries more than the cap, and says how many it really holds.
  const everything = read('v/everything.json');
  assert.ok(everything.entries.length <= 200 && everything.view.count >= everything.entries.length);
  assert.equal(everything.view.type, 'classical');
  // The default views are ready in one file.
  assert.deepEqual(read('home.json').views.map((p) => p.view.id), boot.default);

  // Any entry can be fetched by id alone.
  const shard = read(`d/${shardOf('cobol', boot.detail.chars)}.json`);
  assert.equal(shard.cobol.id, 'cobol');
  // The search index names every entry and every view.
  const index = read('s/all.json');
  assert.equal(index.entries.length, boot.counts.entries);
  assert.ok(index.entries.some((l) => l[0] === 'cobol' && l[1] === 'COBOL' && boot.categories[l[2]].id === 'languages'));
  assert.ok(index.views.some((l) => l[0] === 'languages' && l[2] === 1) && index.views.some((l) => l[0] === 'codegrave/browser-wars' && l[2] === 0));
  assert.ok(existsSync(join(copy, 'site', 'data', 'c', 'codegrave.json')));
  assert.ok(!readdirSync(join(copy, 'site', 'data')).includes('things.json'), 'the old all-in-one bundle is gone');
});
