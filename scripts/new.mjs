#!/usr/bin/env node
// Starts a new entry or view file with every required field in place.
//
//   node scripts/new.mjs entry <kind> <id> "<Name>" <born-date>
//   node scripts/new.mjs view <your-github-name> <id> "<Title>"
//
// A date is YYYY, YYYY-MM or YYYY-MM-DD. A year before the common era has a
// minus sign: -0044 is 44 BCE, -66000000 is 66 million years ago.
// It never overwrites a file. Fill in the blanks, then run
// node scripts/build.mjs --check
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [what, ...args] = process.argv.slice(2);
const fail = (msg) => { console.error(msg); process.exit(1); };
const ID = /^[a-z0-9][a-z0-9-]*$/;
const OWNER = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;
const DATE = /^(-\d{4,11}|\d{4})(-\d{2}(-\d{2})?)?$/;
const created = [];
const create = (path, value) => {
  const full = join(root, path);
  if (existsSync(full)) return false;
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(value, null, 2) + '\n');
  created.push(path);
  return true;
};

if (what === 'entry' || what === 'thing') {
  const [category, id, name, born] = args;
  if (!category || !id || !name || !born) fail('usage: node scripts/new.mjs entry <kind> <id> "<Name>" <born-date>');
  const kinds = JSON.parse(readFileSync(join(root, 'data', 'categories.json'), 'utf8')).categories.map((c) => c.id);
  if (!kinds.includes(category)) fail(`unknown kind "${category}". Choose one of: ${kinds.join(', ')}`);
  if (!ID.test(id)) fail('the id must be lower-case letters, digits and hyphens');
  if (!DATE.test(born) || /^-?0+(-|$)/.test(born)) fail('the born date must be YYYY, YYYY-MM or YYYY-MM-DD (a minus sign for a year before the common era; there is no year 0)');
  const parts = born.replace(/^-/, '').split('-').length;
  const path = join('data', 'base', category, id + '.json');
  const ok = create(path, {
    id, category, maker: '',
    names: [{ name, from: /^-?\d+/.exec(born)[0] }],
    summary: '',
    labels: [],
    events: [{ type: 'born', date: born, precision: ['year', 'month', 'day'][parts - 1] }],
    status: 'alive',
    signals: { adoption: 3, standard: 0, editor: 0 },
    links: [],
    sources: [{ title: '', url: 'https://', kind: 'primary' }],
    verified: false,
  });
  if (!ok) fail(`${path} already exists. Ids are permanent; pick another or edit that file.`);
} else if (what === 'view') {
  const [owner, id, name] = args;
  if (!owner || !id || !name) fail('usage: node scripts/new.mjs view <your-github-name> <id> "<Title>"');
  if (!OWNER.test(owner)) fail('the first word is your GitHub name in lower case; it names your folder under data/community/');
  if (!ID.test(id)) fail('the id must be lower-case letters, digits and hyphens');
  create(join('data', 'community', owner, 'profile.json'), { title: owner, about: '' });
  const path = join('data', 'community', owner, 'views', id + '.json');
  const ok = create(path, { id, name, description: '', category: '', labels: [], tags: [], entries: [], checkpoints: [] });
  if (!ok) fail(`${path} already exists. Ids are permanent; pick another or edit that file.`);
} else {
  fail('usage: node scripts/new.mjs entry|view …  (see the top of this file)');
}
console.log(`created ${created.join(' and ')}\nFill in the blanks, then run: node scripts/build.mjs --check`);
