// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the data in data/ passes every rule', () => {
  const out = execFileSync('node', [join(root, 'scripts', 'build.mjs'), '--check', '--quiet'], { encoding: 'utf8' });
  assert.match(out, / 0 errors/);
});

test('the build rejects a long label, an unknown link type, a plain-http link and an image from an unknown host', async () => {
  const { mkdtempSync, cpSync, readFileSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const copy = mkdtempSync(join(tmpdir(), 'codegrave-'));
  cpSync(join(root, 'data'), join(copy, 'data'), { recursive: true });
  cpSync(join(root, 'scripts'), join(copy, 'scripts'), { recursive: true });
  const file = join(copy, 'data', 'things', 'languages', 'typescript.json');
  const thing = JSON.parse(readFileSync(file, 'utf8'));
  thing.events.push({ type: 'released', date: '2016-09', precision: 'month', label: 'A label that is far too long', note: 'x' });
  thing.links.push({ type: 'cousin_of', to: 'javascript' });
  thing.website = 'http://example.com/';
  thing.image = { src: 'https://example.com/a.png', alt: 'x', credit: 'x', licence: 'x', source: 'https://example.com/' };
  writeFileSync(file, JSON.stringify(thing));
  let out = '';
  try { execFileSync('node', [join(copy, 'scripts', 'build.mjs'), '--check', '--quiet'], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { out = e.stdout + e.stderr; }
  assert.match(out, /"label" must be 1 to 16 characters/);
  assert.match(out, /unknown link type "cousin_of"/);
  assert.match(out, /"website" must be an https link/);
  assert.match(out, /image "src" must be a path under data\/media\//);
});

test('the build rejects a view whose eras overlap', async () => {
  const { mkdtempSync, cpSync, readFileSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const copy = mkdtempSync(join(tmpdir(), 'codegrave-'));
  cpSync(join(root, 'data'), join(copy, 'data'), { recursive: true });
  cpSync(join(root, 'scripts'), join(copy, 'scripts'), { recursive: true });
  const file = join(copy, 'data', 'views', 'browser-wars.json');
  const view = JSON.parse(readFileSync(file, 'utf8'));
  view.checkpoints.push({ id: 'overlap', name: 'Overlap', from: 2000, to: 2005 });
  writeFileSync(file, JSON.stringify(view));
  let out = '';
  try { execFileSync('node', [join(copy, 'scripts', 'build.mjs'), '--check', '--quiet'], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { out = e.stdout + e.stderr; }
  assert.match(out, /overlap/);
});
