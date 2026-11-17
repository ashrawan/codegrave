#!/usr/bin/env node
// Reads data/, checks it against docs/DATA_RULES.md and docs/VIEWS.md, and
// writes the bundles the page loads into site/data/, with a copy of data/media/.
//
//   node scripts/build.mjs           check, then write site/data/
//   node scripts/build.mjs --check   check only
//   add --quiet to hide warnings
//
// Exits with code 1 on any error, so a broken dataset never deploys.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
const outDir = join(root, 'site', 'data');

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { err(path.slice(root.length + 1), `not valid JSON (${e.message})`); return null; }
}
// Every .json file under dir, at any depth, as paths relative to dir. Folders
// may be split further (for example languages/p/python.json) once one grows
// past what GitHub lists on a single page; only the first folder has meaning.
function jsonFiles(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
    if (f.isDirectory()) out.push(...jsonFiles(join(dir, f.name), prefix + f.name + '/'));
    else if (f.name.endsWith('.json')) out.push(prefix + f.name);
  }
  return out;
}

const DATE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const PRECISIONS = ['day', 'month', 'year', 'circa'];
const STATUSES = ['alive', 'fading', 'dead'];
const EVENT_TYPES = ['project_start', 'born', 'released', 'changed_hands', 'milestone', 'deprecated', 'ended', 'afterlife'];
// Events that are a dated point on the line and must say what happened.
const NOTED = ['project_start', 'released', 'changed_hands', 'milestone'];
const LINK_TYPES = [
  'succeeded_by', 'forked_from', 'merged_into', 'spun_off_from', 'open_sourced_as',
  'contains', 'standardised_as', 'version_of', 'influenced_by', 'extends', 'built_on',
];
const LABEL_MAX = 16;
const SUMMARY_MAX = 600;
// Images may also be hot-linked from Wikimedia Commons, which allows it and
// keeps the author and licence on each file's page (the "source").
const REMOTE_MEDIA = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[^\s"'<>]+$/;
const URL_OK = (u) => typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u);
const mediaDir = join(dataDir, 'media');
// An icon or image is a file under data/media/, or a Wikimedia Commons file,
// with a credit and licence, so it can be shown lawfully.
function checkMedia(at, what, m, needCredit) {
  if (typeof m !== 'object' || !m) return err(at, `${what} must be an object with a "src"`);
  if (REMOTE_MEDIA.test(m.src || '')) { /* hosted by Wikimedia Commons */ }
  else if (!/^[a-z0-9][a-z0-9/._-]*\.(svg|png|jpg|jpeg|webp)$/.test(m.src || '') || m.src.includes('..')) {
    err(at, `${what} "src" must be a path under data/media/ ending in svg, png, jpg or webp, or an upload.wikimedia.org/wikipedia/commons/ url`);
  } else if (!existsSync(join(mediaDir, m.src))) err(at, `${what} file data/media/${m.src} does not exist`);
  if (m.caption != null && (typeof m.caption !== 'string' || m.caption.length > 200)) err(at, `${what} "caption" must be up to 200 characters`);
  if (!m.alt) err(at, `${what} needs an "alt" text`);
  if (needCredit) {
    if (!m.credit) err(at, `${what} needs a "credit"`);
    if (!m.licence) err(at, `${what} needs a "licence"`);
    if (!/^https:\/\//.test(m.source || '')) err(at, `${what} needs an https "source"`);
  }
  for (const k of Object.keys(m)) if (!['src', 'alt', 'caption', 'credit', 'licence', 'source'].includes(k)) err(at, `${what} has an unknown field "${k}"`);
}

// ---------------------------------------------------------------- load
const categories = readJson(join(dataDir, 'categories.json'))?.categories || [];
const checkpoints = readJson(join(dataDir, 'checkpoints.json'))?.checkpoints || [];
const choice = readJson(join(dataDir, 'editors-choice.json')) || {};

const domains = readJson(join(dataDir, 'categories.json'))?.domains || [];
const domainIds = new Set(domains.map((d) => d.id));
if (domainIds.size !== domains.length) err('data/categories.json', 'duplicate domain id');
for (const d of domains) if (!ID.test(d.id || '') || !d.name || !d.description) err('data/categories.json', `domain "${d.id}" needs an id, a name and a description`);
for (const c of categories) if (!domainIds.has(c.domain)) err('data/categories.json', `category "${c.id}" needs a "domain" from the domains list`);
const catIds = new Set(categories.map((c) => c.id));
if (catIds.size !== categories.length) err('data/categories.json', 'duplicate category id');

// One file per thing: data/things/<category>/<id>.json
const things = [];
const thingsDir = join(dataDir, 'things');
for (const f of jsonFiles(thingsDir)) {
  const at = `data/things/${f}`;
  const folder = f.includes('/') ? f.split('/')[0] : null;
  if (!folder) { err(at, 'things live in a category folder'); continue; }
  if (!catIds.has(folder)) { err(at, `folder "${folder}" is not a category in data/categories.json`); continue; }
  const t = readJson(join(thingsDir, f));
  if (!t) continue;
  if (t.id !== basename(f, '.json')) err(at, `file name must match the id "${t.id}"`);
  if (t.category !== folder) err(at, `category "${t.category}" must match the folder "${folder}"`);
  t._at = at;
  things.push(t);
}

// One file per view: data/views/<id>.json
const views = [];
for (const f of jsonFiles(join(dataDir, 'views'))) {
  const at = `data/views/${f}`;
  const v = readJson(join(dataDir, 'views', f));
  if (!v) continue;
  if (v.id !== basename(f, '.json')) err(at, `file name must match the id "${v.id}"`);
  v._at = at;
  views.push(v);
}

// ---------------------------------------------------------------- things
const ids = new Set();
for (const t of things) {
  const at = t._at;
  if (!ID.test(t.id || '')) err(at, 'id must be lower-case letters, digits and hyphens');
  if (ids.has(t.id)) err(at, `duplicate id "${t.id}" (ids are unique across all categories)`);
  ids.add(t.id);
  if (!STATUSES.includes(t.status)) err(at, `status must be one of ${STATUSES.join(', ')}`);

  if (!Array.isArray(t.names) || t.names.length === 0) err(at, 'needs at least one name');
  let prev = '';
  for (const n of t.names || []) {
    if (!n.name) err(at, 'a name entry is empty');
    if (!DATE.test(n.from || '')) err(at, `name "${n.name}" has a malformed "from" date`);
    if (n.from < prev) err(at, 'names must be in date order');
    prev = n.from;
  }

  const events = t.events || [];
  const born = events.filter((e) => e.type === 'born');
  const ended = events.filter((e) => e.type === 'ended');
  if (born.length !== 1) err(at, 'needs exactly one "born" event');
  if (ended.length > 1) err(at, 'at most one "ended" event');
  if (t.status === 'dead' && ended.length === 0) err(at, 'status is dead but there is no "ended" event');
  if (t.status !== 'dead' && ended.length > 0) err(at, 'has an "ended" event but status is not dead');
  if (t.status === 'dead' && !t.cause) err(at, 'a dead thing needs a one-line "cause"');
  if (t.status === 'fading' && !t.note) warn(at, 'fading is an editor\'s call and should carry a "note"');
  for (const e of events) {
    if (!EVENT_TYPES.includes(e.type)) err(at, `unknown event type "${e.type}"`);
    if (e.type === 'afterlife') {
      if (!e.note) err(at, 'afterlife needs a note');
      if (e.until && !DATE.test(e.until)) err(at, 'afterlife "until" is malformed');
      if (ended.length === 0) err(at, 'afterlife without an "ended" event');
      if (e.url != null && !URL_OK(e.url)) err(at, 'afterlife "url" must be an https link');
      continue;
    }
    if (!DATE.test(e.date || '')) err(at, `${e.type} has a malformed date "${e.date}"`);
    if (!PRECISIONS.includes(e.precision)) err(at, `${e.type} needs a precision (${PRECISIONS.join(', ')})`);
    if (NOTED.includes(e.type) && !e.note) err(at, `${e.type} needs a note`);
    if (e.label != null && (typeof e.label !== 'string' || !e.label || e.label.length > LABEL_MAX)) {
      err(at, `${e.type} "label" must be 1 to ${LABEL_MAX} characters`);
    }
    if (e.image != null) checkMedia(at, `${e.type} image`, e.image, true);
    if (e.url != null && !URL_OK(e.url)) err(at, `${e.type} "url" must be an https link`);
    // Events may fall in the years of work before birth, but not before that work began.
    const first = events.find((x) => x.type === 'project_start') || born[0];
    if (first?.date && DATE.test(e.date || '') && e.type !== 'project_start' && e.date.slice(0, 4) < first.date.slice(0, 4)) {
      err(at, `${e.type} is dated before the thing was born${first === born[0] ? '' : ' or work on it began'}`);
    }
    if (ended[0]?.date && DATE.test(e.date || '') && e.date.slice(0, 4) > ended[0].date.slice(0, 4)) {
      err(at, `${e.type} is dated after the thing ended`);
    }
  }
  if (events.filter((e) => e.type === 'deprecated').length > 1) err(at, 'at most one "deprecated" event');
  if (t.summary != null && (typeof t.summary !== 'string' || !t.summary || t.summary.length > SUMMARY_MAX)) {
    err(at, `"summary" must be 1 to ${SUMMARY_MAX} characters`);
  }
  if (t.icon != null) checkMedia(at, 'icon', t.icon, true);
  if (t.website != null && !URL_OK(t.website)) err(at, '"website" must be an https link');
  for (const o of t.official || []) if (!o.title || !URL_OK(o.url)) err(at, 'every "official" link needs a title and an https url');
  if ((t.official || []).length > 6) err(at, 'at most 6 "official" links');
  if (t.image != null) checkMedia(at, 'image', t.image, true);
  if (born[0]?.date && ended[0]?.date && ended[0].date < born[0].date.slice(0, 4)) err(at, 'ended before it was born');
  if (born[0]?.date && t.names?.[0]?.from && t.names[0].from.slice(0, 4) !== born[0].date.slice(0, 4)) {
    warn(at, 'first name does not start in the year of birth');
  }

  const s = t.signals || {};
  if (s.adoption != null && !(Number.isInteger(s.adoption) && s.adoption >= 1 && s.adoption <= 5)) {
    err(at, 'signals.adoption must be a whole number from 1 to 5 (or left out if unscored)');
  }
  if (s.standard != null && ![0, 1].includes(s.standard)) err(at, 'signals.standard must be 0 or 1');
  if (s.editor != null && !(s.editor >= -2 && s.editor <= 2)) err(at, 'signals.editor must be from -2 to 2');

  if (!Array.isArray(t.sources) || t.sources.length === 0) err(at, 'needs at least one source');
  for (const src of t.sources || []) {
    if (!/^https:\/\//.test(src.url || '')) err(at, 'every source needs an https url');
    if (!src.title) err(at, 'every source needs a title');
  }
  if (!(t.sources || []).some((src) => src.kind === 'primary')) warn(at, 'no primary source yet');
  if (t.verified !== true) warn(at, 'dates not yet verified against a source');
}
for (const t of things) {
  for (const l of t.links || []) {
    if (!LINK_TYPES.includes(l.type)) err(t._at, `unknown link type "${l.type}"`);
    if (!ids.has(l.to)) err(t._at, `link points to unknown thing "${l.to}"`);
    if (l.to === t.id) err(t._at, 'a thing cannot link to itself');
    if (l.date != null && !DATE.test(l.date)) err(t._at, `link to "${l.to}" has a malformed date`);
    for (const k of Object.keys(l)) if (!['type', 'to', 'date', 'note'].includes(k)) err(t._at, `link has an unknown field "${k}"`);
  }
}

// ---------------------------------------------------------------- checkpoints
// Named eras, in data/checkpoints.json or a view's own "checkpoints" list.
function checkEras(at, list) {
  if (!Array.isArray(list)) return err(at, '"checkpoints" must be a list');
  const seen = new Set();
  for (const c of list) {
    if (!ID.test(c.id || '') || seen.has(c.id)) err(at, `era "${c.id}" needs a unique id of lower-case letters, digits and hyphens`);
    seen.add(c.id);
    if (!c.name || !Number.isInteger(c.from) || !Number.isInteger(c.to) || c.from > c.to) {
      err(`${at} › ${c.id}`, 'needs a name and whole-year "from" and "to", in order');
    }
    if (!c.note || c.note.length > 400) err(`${at} › ${c.id}`, 'needs a "note" of at most 400 characters');
    for (const k of Object.keys(c)) if (!['id', 'name', 'from', 'to', 'note'].includes(k)) err(`${at} › ${c.id}`, `unknown field "${k}"`);
  }
  const sorted = [...list].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].from <= sorted[i - 1].to) err(at, `eras ${sorted[i - 1].id} and ${sorted[i].id} overlap`);
  }
}
checkEras('data/checkpoints.json', checkpoints);

// ---------------------------------------------------------------- views
const viewIds = new Set();
for (const v of views) {
  const at = v._at;
  if (!ID.test(v.id || '')) err(at, 'id must be lower-case letters, digits and hyphens');
  if (viewIds.has(v.id)) err(at, `duplicate view id "${v.id}"`);
  viewIds.add(v.id);
  if (!v.name || v.name.length > 60) err(at, 'needs a "name" of at most 60 characters');
  if (!v.description || v.description.length > 200) err(at, 'needs a "description" of at most 200 characters');
  if (!v.author) err(at, 'needs an "author" (a GitHub user name)');
  if (v.tags != null && !(Array.isArray(v.tags) && v.tags.length <= 8 && v.tags.every((x) => typeof x === 'string'))) {
    err(at, '"tags" must be a list of at most 8 words');
  }
  if (!Array.isArray(v.categories)) err(at, 'needs a "categories" list (it may be empty)');
  for (const c of v.categories || []) if (!catIds.has(c)) err(at, `unknown category "${c}"`);
  if ((v.categories || []).length > 8) err(at, 'at most 8 categories');
  if (v.domains != null && !(Array.isArray(v.domains) && v.domains.length > 0)) err(at, '"domains" must be a non-empty list of domain ids, or be left out');
  for (const d of v.domains || []) if (!domainIds.has(d)) err(at, `unknown domain "${d}"`);
  if (!(Number.isInteger(v.level) && v.level >= 5 && v.level <= 100)) err(at, '"level" must be a whole number from 5 to 100');
  if (v.year != null && !Number.isInteger(v.year)) err(at, '"year" must be a whole year');
  if (v.order != null && !['new', 'old'].includes(v.order)) err(at, '"order" must be "new" or "old"');
  if (v.things != null) {
    if (!Array.isArray(v.things) || v.things.length === 0) err(at, '"things" must be a non-empty list of thing ids, or be left out');
    for (const id of v.things || []) if (!ids.has(id)) err(at, `lists unknown thing "${id}"`);
  }
  if (v.checkpoints != null) checkEras(at, v.checkpoints);
  // A view only chooses what to show, and may name its own eras. It can never change the facts.
  const allowed = ['id', 'name', 'description', 'author', 'tags', 'categories', 'domains', 'level', 'year', 'order', 'things', 'checkpoints', '_at'];
  for (const k of Object.keys(v)) if (!allowed.includes(k)) err(at, `unknown field "${k}"`);
}
const featured = choice.featured || [];
// The page opens on the default: one view, or several shown side by side.
const defaults = Array.isArray(choice.default) ? choice.default : [choice.default];
if (defaults.length === 0 || defaults.length > 8) err('data/editors-choice.json', '"default" must name one to eight views');
for (const id of defaults) if (!viewIds.has(id)) err('data/editors-choice.json', `default view "${id}" does not exist`);
for (const id of featured) if (!viewIds.has(id)) err('data/editors-choice.json', `featured view "${id}" does not exist`);

// ---------------------------------------------------------------- report
const quiet = process.argv.includes('--quiet');
const byKind = {};
for (const w of warnings) {
  const k = w.split(': ').slice(1).join(': ');
  byKind[k] = (byKind[k] || 0) + 1;
}
if (!quiet) for (const [k, n] of Object.entries(byKind)) console.log(`warning (${n}×): ${k}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`${things.length} things, ${domains.length} domains, ${categories.length} categories, ${checkpoints.length} checkpoints, ` +
  `${views.length} views · ${errors.length} errors, ${warnings.length} warnings`);
if (errors.length) process.exit(1);

// ---------------------------------------------------------------- write
if (!process.argv.includes('--check')) {
  const strip = ({ _at, ...rest }) => rest;
  const write = (name, value) => writeFileSync(join(outDir, name), JSON.stringify(value));
  mkdirSync(outDir, { recursive: true });
  things.sort((a, b) => a.id.localeCompare(b.id));
  views.sort((a, b) => a.id.localeCompare(b.id));
  write('things.json', { release: new Date().toISOString().slice(0, 10), things: things.map(strip) });
  write('categories.json', { domains, categories });
  write('checkpoints.json', { checkpoints });
  write('views.json', { default: defaults, featured, views: views.map(strip) });
  rmSync(join(outDir, 'media'), { recursive: true, force: true });
  if (existsSync(mediaDir)) cpSync(mediaDir, join(outDir, 'media'), { recursive: true });
  console.log(`wrote site/data/ (${things.length} things, ${views.length} views)`);
}
