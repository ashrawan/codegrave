#!/usr/bin/env node
// Starts a new thing or view file with every required field in place.
//
//   node scripts/new.mjs thing <category> <id> "<Name>" <born-date>
//   node scripts/new.mjs view <id> "<Name>"
//
// It never overwrites a file. Fill in the blanks, then run
// node scripts/build.mjs --check
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [kind, ...args] = process.argv.slice(2);
const fail = (msg) => { console.error(msg); process.exit(1); };
const ID = /^[a-z0-9][a-z0-9-]*$/;
const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

let path, value;
if (kind === 'thing') {
  const [category, id, name, born] = args;
  if (!category || !id || !name || !born) fail('usage: node scripts/new.mjs thing <category> <id> "<Name>" <born-date>');
  const cats = JSON.parse(readFileSync(join(root, 'data', 'categories.json'), 'utf8')).categories.map((c) => c.id);
  if (!cats.includes(category)) fail(`unknown category "${category}". Choose one of: ${cats.join(', ')}`);
  if (!ID.test(id)) fail('the id must be lower-case letters, digits and hyphens');
  if (!DATE.test(born)) fail('the born date must be YYYY, YYYY-MM or YYYY-MM-DD');
  path = join('data', 'things', category, id + '.json');
  value = {
    id, category, maker: '',
    names: [{ name, from: born }],
    events: [{ type: 'born', date: born, precision: ['year', 'month', 'day'][born.split('-').length - 1] }],
    status: 'alive',
    signals: { adoption: 3, standard: 0, editor: 0 },
    links: [],
    sources: [{ title: '', url: 'https://', kind: 'primary' }],
    verified: false,
  };
} else if (kind === 'view') {
  const [id, name] = args;
  if (!id || !name) fail('usage: node scripts/new.mjs view <id> "<Name>"');
  if (!ID.test(id)) fail('the id must be lower-case letters, digits and hyphens');
  path = join('data', 'views', id + '.json');
  value = { id, name, description: '', author: '', tags: [], categories: [], level: 30 };
} else {
  fail('usage: node scripts/new.mjs thing|view …  (see the top of this file)');
}

const full = join(root, path);
if (existsSync(full)) fail(`${path} already exists. Ids are permanent; pick another or edit that file.`);
mkdirSync(dirname(full), { recursive: true });
writeFileSync(full, JSON.stringify(value, null, 2) + '\n');
console.log(`created ${path}\nFill in the blanks, then run: node scripts/build.mjs --check`);
