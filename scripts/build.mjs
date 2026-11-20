#!/usr/bin/env node
// Reads data/, checks it against docs/DATA_RULES.md and docs/VIEWS.md, and
// writes what the page loads into site/data/, with a copy of data/media/.
//
//   node scripts/build.mjs           check, then write site/data/
//   node scripts/build.mjs --check   check only
//   add --quiet to hide warnings
//
// Exits with code 1 on any error, so a broken dataset never deploys.
//
// What it writes (see docs/BUILD.md). Every file has a fixed name, so the
// page can ask for exactly what it needs in one request, with no lookups:
//
//   boot.json          the map, the labels, the list of community views
//   home.json          the default views, ready to draw
//   v/<view-id>.json   one view with everything it shows (v/<owner>/<id>.json for community views)
//   d/<key>.json       full entries by a hash of their id, for links to an entry that is not on screen
//   s/all.json         the search index (s/<two letters>.json once it is large)
//   c/<owner>.json     one community folder: its profile and what it holds
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { timelineThumb } from './thumb.mjs';
import { parseDate, yearOf, score } from '../site/rank.js';
import { shardOf, tokens, prefixOf } from '../site/keys.js';

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

// A date is a year, a year and month, or a full day. A year before the common
// era carries a minus sign and is counted as historians do (-0044 is 44 BCE;
// there is no year zero). The same form holds deep time: -66000000.
const DATE = /^(-\d{4,11}|\d{4})(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
const isDate = (s) => typeof s === 'string' && DATE.test(s) && yearOf(s) !== 0;
// Is date a before date b, as far as both are written? "2010-04-15" is before
// "2010-04-20", and "2010-04" is before "2010-07-15"; "2010" is not before
// "2010-04", because a bare year may mean any day in it.
const dateParts = (s) => { const [y, m, d] = s.replace(/^-/, '').split('-').map(Number); return [yearOf(s), m || 0, d || 0]; };
function isBefore(a, b) {
  const [ay, am, ad] = dateParts(a), [by, bm, bd] = dateParts(b);
  if (ay !== by) return ay < by;
  if (!am || !bm) return false;
  if (am !== bm) return am < bm;
  return !!ad && !!bd && ad < bd;
}
const ID = /^[a-z0-9][a-z0-9-]*$/;
const OWNER = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;   // a GitHub name, lower case
const PRECISIONS = ['day', 'month', 'year', 'circa'];
const STATUSES = ['alive', 'fading', 'dead'];
const EVENT_TYPES = ['project_start', 'born', 'released', 'changed_hands', 'milestone', 'deprecated', 'ended', 'afterlife'];
// Events that are a dated point on the line and must say what happened.
const NOTED = ['project_start', 'released', 'changed_hands', 'milestone'];
const LINK_TYPES = [
  // how one thing became or built on another
  'succeeded_by', 'forked_from', 'merged_into', 'spun_off_from', 'open_sourced_as',
  'contains', 'standardised_as', 'version_of', 'influenced_by', 'extends', 'built_on',
  // how any two entries are tied: where it is, what it belongs to, who made it, family, subject
  'in', 'part_of', 'member_of', 'made_by', 'parent', 'spouse', 'about', 'related',
];
const LABEL_MAX = 16;
const SUMMARY_MAX = 600;
const VIEW_CAP = 200;          // the most entries one view file carries, best ranked first
const CATALOGUE_MAX = 400;     // the most community views listed in boot.json; the rest are found by search
const SEARCH_SPLIT = 20000;    // above this many index lines, the search index is split by first letters
const INBOUND_MAX = 40;
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

// ---------------------------------------------------------------- the map
// data/categories.json is one tree. "domains" are its branches (People,
// Places … Technology, with Computing and its seven sections under it) and
// "categories" are the kinds: the folders that entries are filed in.
const registry = readJson(join(dataDir, 'categories.json')) || {};
const domains = registry.domains || [];
const categories = registry.categories || [];
const checkpoints = readJson(join(dataDir, 'checkpoints.json'))?.checkpoints || [];
const choice = readJson(join(dataDir, 'editors-choice.json')) || {};
const WORDS = ['born', 'ended', 'alive', 'dead', 'from'];

const domainById = new Map(domains.map((d) => [d.id, d]));
if (domainById.size !== domains.length) err('data/categories.json', 'duplicate domain id');
for (const d of domains) {
  const at = 'data/categories.json';
  if (!ID.test(d.id || '') || !d.name || !d.description) err(at, `domain "${d.id}" needs an id, a name and a description`);
  if (d.parent != null && !domainById.has(d.parent)) err(at, `domain "${d.id}" has an unknown parent "${d.parent}"`);
  if (d.parent == null && !d.words) err(at, `top-level domain "${d.id}" needs "words"`);
  if (d.words != null && !WORDS.every((w) => typeof d.words[w] === 'string' && d.words[w])) err(at, `domain "${d.id}" "words" needs ${WORDS.join(', ')}`);
  if (d.cause != null && !['required', 'optional'].includes(d.cause)) err(at, `domain "${d.id}" "cause" must be "required" or "optional"`);
}
// The branches from a domain up to the top of the tree, nearest first.
function lineage(id) {
  const out = [];
  for (let d = domainById.get(id); d && !out.includes(d); d = domainById.get(d.parent)) out.push(d);
  return out;
}
for (const d of domains) if (lineage(d.id).at(-1)?.parent != null) err('data/categories.json', `domain "${d.id}" is its own ancestor`);
const inherited = (id, field) => lineage(id).find((d) => d[field] != null)?.[field];
const wordsOf = (id) => inherited(id, 'words') || { born: 'Born', ended: 'Ended', alive: 'Alive', dead: 'Ended', from: 'from' };

for (const c of categories) {
  if (!ID.test(c.id || '') || !c.name || !c.short) err('data/categories.json', `category "${c.id}" needs an id, a name and a short name`);
  if (!domainById.has(c.domain)) err('data/categories.json', `category "${c.id}" needs a "domain" from the domains list`);
}
const catById = new Map(categories.map((c) => [c.id, c]));
if (catById.size !== categories.length) err('data/categories.json', 'duplicate category id');
// Every kind under a branch, at any depth.
const kindsUnder = (domainId) => categories.filter((c) => lineage(c.domain).some((d) => d.id === domainId)).map((c) => c.id);

// Labels say what an entry or a view is about. One shared list, so the same idea is always spelled the same way.
const labelFile = readJson(join(dataDir, 'labels.json')) || {};
const labelList = [...(labelFile.subject || []), ...(labelFile.theme || [])];
const labelIds = new Set(labelList.map((l) => l.id));
if (labelIds.size !== labelList.length) err('data/labels.json', 'duplicate label id');
for (const l of labelList) if (!ID.test(l.id || '') || !l.name) err('data/labels.json', `label "${l.id}" needs an id and a name`);

// ---------------------------------------------------------------- load
// The base: one file per entry, data/base/<kind>/<id>.json, reviewed by editors.
const entries = [];
const baseDir = join(dataDir, 'base');
for (const f of jsonFiles(baseDir)) {
  const at = `data/base/${f}`;
  const folder = f.includes('/') ? f.split('/')[0] : null;
  if (!folder) { err(at, 'entries live in a category folder'); continue; }
  if (!catById.has(folder)) { err(at, `folder "${folder}" is not a category in data/categories.json`); continue; }
  const t = readJson(join(baseDir, f));
  if (!t) continue;
  if (t.id !== basename(f, '.json')) err(at, `file name must match the id "${t.id}"`);
  if (t.category !== folder) err(at, `category "${t.category}" must match the folder "${folder}"`);
  if (!ID.test(t.id || '')) err(at, 'id must be lower-case letters, digits and hyphens');
  t._at = at; t._tier = 'base'; t._id = t.id;
  entries.push(t);
}

// Community folders: data/community/<github-name>/ with profile.json, views/
// and (optionally) entries/ of the owner's own. Ids are "<owner>/<id>".
const owners = [];
const views = [];
const communityDir = join(dataDir, 'community');
if (existsSync(communityDir)) {
  for (const dir of readdirSync(communityDir, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
    if (!dir.isDirectory()) continue;
    const owner = dir.name, at = `data/community/${owner}`;
    if (!OWNER.test(owner)) { err(at, 'a community folder is named after a GitHub user or organisation, in lower case'); continue; }
    const profile = existsSync(join(communityDir, owner, 'profile.json')) ? readJson(join(communityDir, owner, 'profile.json')) : null;
    if (!profile) err(at, 'needs a profile.json');
    else {
      if (!profile.title || profile.title.length > 60) err(`${at}/profile.json`, 'needs a "title" of at most 60 characters');
      if (profile.about != null && (typeof profile.about !== 'string' || profile.about.length > 300)) err(`${at}/profile.json`, '"about" must be at most 300 characters');
      if (profile.url != null && !URL_OK(profile.url)) err(`${at}/profile.json`, '"url" must be an https link');
      for (const k of Object.keys(profile)) if (!['title', 'about', 'url'].includes(k)) err(`${at}/profile.json`, `unknown field "${k}"`);
    }
    owners.push({ id: owner, profile: profile || {} });
    for (const f of jsonFiles(join(communityDir, owner, 'entries'))) {
      const t = readJson(join(communityDir, owner, 'entries', f));
      if (!t) continue;
      const here = `${at}/entries/${f}`;
      if (t.id !== basename(f, '.json')) err(here, `file name must match the id "${t.id}"`);
      if (!ID.test(t.id || '')) err(here, 'id must be lower-case letters, digits and hyphens');
      if (!catById.has(t.category)) err(here, `"category" must be a kind in data/categories.json`);
      t._at = here; t._tier = 'community'; t._owner = owner; t._id = `${owner}/${t.id}`;
      entries.push(t);
    }
    for (const f of jsonFiles(join(communityDir, owner, 'views'))) {
      const v = readJson(join(communityDir, owner, 'views', f));
      if (!v) continue;
      const here = `${at}/views/${f}`;
      if (v.id !== basename(f, '.json')) err(here, `file name must match the id "${v.id}"`);
      if (!ID.test(v.id || '')) err(here, 'id must be lower-case letters, digits and hyphens');
      if (v.author != null && v.author !== owner) err(here, `"author" must be the folder's name, "${owner}", or be left out`);
      v._at = here; v._owner = owner; v._id = `${owner}/${v.id}`; v._type = 'community';
      views.push(v);
    }
  }
}

// Old addresses that still work: a view or an entry that moved keeps its old id here.
const redirects = existsSync(join(dataDir, 'redirects.json')) ? (readJson(join(dataDir, 'redirects.json')) || {}) : {};
const viewRedirects = redirects.views || {};
const entryRedirects = redirects.entries || {};

// ---------------------------------------------------------------- entries
const byId = new Map();
for (const t of entries) {
  if (byId.has(t._id)) err(t._at, `duplicate id "${t._id}" (ids are unique across all categories)`);
  byId.set(t._id, t);
}
const resolveEntry = (id, owner) => {
  if (byId.has(id)) return id;
  if (owner && byId.has(`${owner}/${id}`)) return `${owner}/${id}`;   // an owner may name their own entry by its short id
  if (entryRedirects[id] && byId.has(entryRedirects[id])) return entryRedirects[id];
  return null;
};
const nameOf = (t) => t.names?.[t.names.length - 1]?.name || t._id;

const byWikidata = new Map();
const byNameKind = new Map();
for (const t of entries) {
  const at = t._at;
  const kind = catById.get(t.category);
  if (!STATUSES.includes(t.status)) err(at, `status must be one of ${STATUSES.join(', ')}`);

  if (!Array.isArray(t.names) || t.names.length === 0) err(at, 'needs at least one name');
  let prev = -Infinity;
  for (const n of t.names || []) {
    if (!n.name) err(at, 'a name entry is empty');
    if (!isDate(n.from)) { err(at, `name "${n.name}" has a malformed "from" date`); continue; }
    if (parseDate(n.from) < prev) err(at, 'names must be in date order');
    prev = parseDate(n.from);
  }

  const events = Array.isArray(t.events) ? t.events : [];
  const born = events.filter((e) => e.type === 'born');
  const ended = events.filter((e) => e.type === 'ended');
  if (born.length !== 1) err(at, 'needs exactly one "born" event');
  if (ended.length > 1) err(at, 'at most one "ended" event');
  if (t.status === 'dead' && ended.length === 0) err(at, 'status is dead but there is no "ended" event');
  if (t.status !== 'dead' && ended.length > 0) err(at, 'has an "ended" event but status is not dead');
  // Whether an ending must say why is set per branch of the map ("cause" in data/categories.json).
  if (t.status === 'dead' && !t.cause && kind && inherited(kind.domain, 'cause') === 'required') err(at, 'a dead thing needs a one-line "cause"');
  if (t.cause != null && (typeof t.cause !== 'string' || !t.cause)) err(at, '"cause" must be one line of text');
  if (t.status === 'fading' && !t.note) warn(at, 'fading is an editor\'s call and should carry a "note"');
  const first = events.find((x) => x.type === 'project_start') || born[0];
  for (const e of events) {
    if (!EVENT_TYPES.includes(e.type)) err(at, `unknown event type "${e.type}"`);
    if (e.type === 'afterlife') {
      if (!e.note) err(at, 'afterlife needs a note');
      if (e.until && !isDate(e.until)) err(at, 'afterlife "until" is malformed');
      if (ended.length === 0) err(at, 'afterlife without an "ended" event');
      if (e.url != null && !URL_OK(e.url)) err(at, 'afterlife "url" must be an https link');
      continue;
    }
    if (!isDate(e.date)) err(at, `${e.type} has a malformed date "${e.date}"`);
    if (!PRECISIONS.includes(e.precision)) err(at, `${e.type} needs a precision (${PRECISIONS.join(', ')})`);
    if (NOTED.includes(e.type) && !e.note) err(at, `${e.type} needs a note`);
    if (e.label != null && (typeof e.label !== 'string' || !e.label || e.label.length > LABEL_MAX)) {
      err(at, `${e.type} "label" must be 1 to ${LABEL_MAX} characters`);
    }
    if (e.image != null) checkMedia(at, `${e.type} image`, e.image, true);
    if (e.url != null && !URL_OK(e.url)) err(at, `${e.type} "url" must be an https link`);
    // Events may fall in the years of work before birth, but not before that work began.
    if (isDate(first?.date) && isDate(e.date) && e.type !== 'project_start' && !(e.type === 'ended' && first === born[0]) && isBefore(e.date, first.date)) {
      err(at, `${e.type} is dated before the thing was born${first === born[0] ? '' : ' or work on it began'}`);
    }
    if (isDate(ended[0]?.date) && isDate(e.date) && e.type !== 'born' && isBefore(ended[0].date, e.date)) {
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
  if (isDate(born[0]?.date) && isDate(ended[0]?.date) && isBefore(ended[0].date, born[0].date)) err(at, 'ended before it was born');
  if (isDate(born[0]?.date) && isDate(t.names?.[0]?.from) && yearOf(t.names[0].from) !== yearOf(born[0].date)) {
    warn(at, 'first name does not start in the year of birth');
  }

  if (t.labels != null) {
    if (!Array.isArray(t.labels) || t.labels.length > 6) err(at, '"labels" must be a list of at most 6 labels');
    else for (const l of t.labels) if (!labelIds.has(l)) err(at, `unknown label "${l}" (the list is data/labels.json)`);
  }
  if (t.aliases != null && !(Array.isArray(t.aliases) && t.aliases.length <= 12 && t.aliases.every((a) => typeof a === 'string' && a && a.length <= 80))) {
    err(at, '"aliases" must be a list of at most 12 other names');
  }
  if (t.wikidata != null) {
    if (!/^Q[1-9]\d*$/.test(t.wikidata)) err(at, '"wikidata" must be a Wikidata item id such as Q7186');
    else if (byWikidata.has(t.wikidata)) err(at, `is the same Wikidata item (${t.wikidata}) as "${byWikidata.get(t.wikidata)._id}"; one thing has one entry`);
    else byWikidata.set(t.wikidata, t);
  }
  // A community entry is for what the base does not hold yet.
  const key = `${t.category}|${nameOf(t).toLowerCase()}`;
  if (byNameKind.has(key) && (t._tier === 'community' || byNameKind.get(key)._tier === 'community')) {
    err(at, `has the same name and kind as "${byNameKind.get(key)._id}"; use that entry instead`);
  }
  byNameKind.set(key, t);

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
for (const t of entries) {
  for (const l of t.links || []) {
    if (!LINK_TYPES.includes(l.type)) err(t._at, `unknown link type "${l.type}"`);
    const to = resolveEntry(l.to, t._owner);
    if (!to) err(t._at, `link points to unknown thing "${l.to}"`);
    else if (t._tier === 'base' && byId.get(to)._tier !== 'base') err(t._at, `a base entry cannot link to the community entry "${to}"`);
    if (to === t._id) err(t._at, 'a thing cannot link to itself');
    if (l.date != null && !isDate(l.date)) err(t._at, `link to "${l.to}" has a malformed date`);
    if (l.until != null && !isDate(l.until)) err(t._at, `link to "${l.to}" has a malformed "until" date`);
    for (const k of Object.keys(l)) if (!['type', 'to', 'date', 'until', 'note'].includes(k)) err(t._at, `link has an unknown field "${k}"`);
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
    if (!c.name || !Number.isInteger(c.from) || !Number.isInteger(c.to) || c.from > c.to || c.from === 0 || c.to === 0) {
      err(`${at} › ${c.id}`, 'needs a name and whole-year "from" and "to", in order (a year before the common era is negative; there is no year 0)');
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
// Classical views come from the map itself: Everything, one per branch and
// one per kind. They are not files; the build makes them, so the map and its
// views can never disagree. A kind that shares its id with a branch (networks,
// ai) is shown by that branch's view.
const describeKind = (c) => c.description || `${c.name}, such as ${c.examples}.`;
const classical = [
  { id: 'everything', name: 'Everything', description: 'Every entry in the base, with no category picked.', tags: ['all'], categories: [] },
  ...domains.map((d) => ({ id: d.id, name: d.name, description: d.description, tags: ['domain'], categories: [], domains: [d.id], category: d.id })),
  ...categories.filter((c) => !domainById.has(c.id)).map((c) => ({ id: c.id, name: c.name, description: describeKind(c).slice(0, 200), tags: ['kind'], categories: [c.id], category: c.domain })),
];
for (const v of classical) { v.author = 'codegrave'; v.level = 100; v._id = v.id; v._type = 'classical'; v._at = 'data/categories.json'; }
if (catById.has('everything') || domainById.has('everything')) err('data/categories.json', '"everything" is taken by the view of that name');
const homeOf = (kindId) => (domainById.has(kindId) ? kindId : kindId);   // a kind's own view, or the branch view of the same id

const viewById = new Map();
for (const v of [...classical, ...views]) {
  if (viewById.has(v._id)) err(v._at, `duplicate view id "${v._id}"`);
  viewById.set(v._id, v);
}
for (const v of views) {
  const at = v._at;
  if (!v.name || v.name.length > 60) err(at, 'needs a "name" of at most 60 characters');
  if (!v.description || v.description.length > 200) err(at, 'needs a "description" of at most 200 characters');
  if (v.tags != null && !(Array.isArray(v.tags) && v.tags.length <= 8 && v.tags.every((x) => typeof x === 'string'))) {
    err(at, '"tags" must be a list of at most 8 words');
  }
  if (v.category != null && !domainById.has(v.category)) err(at, `"category" must be a branch of the map (${domains.filter((d) => !lineage(d.id)[2]).map((d) => d.id).join(', ')})`);
  if (v.labels != null) {
    if (!Array.isArray(v.labels) || v.labels.length > 4) err(at, '"labels" must be a list of at most 4 labels');
    else for (const l of v.labels) if (!labelIds.has(l)) err(at, `unknown label "${l}" (the list is data/labels.json)`);
  }
  if (v.categories != null && !Array.isArray(v.categories)) err(at, '"categories" must be a list of kinds');
  for (const c of v.categories || []) if (!catById.has(c)) err(at, `unknown category "${c}"`);
  if ((v.categories || []).length > 8) err(at, 'at most 8 categories');
  if (v.domains != null && !(Array.isArray(v.domains) && v.domains.length > 0)) err(at, '"domains" must be a non-empty list of domain ids, or be left out');
  for (const d of v.domains || []) if (!domainById.has(d)) err(at, `unknown domain "${d}"`);
  if (v.level != null && !(Number.isInteger(v.level) && v.level >= 5 && v.level <= 100)) err(at, '"level" must be a whole number from 5 to 100');
  if (v.year != null && (!Number.isInteger(v.year) || v.year === 0)) err(at, '"year" must be a whole year');
  if (v.order != null && !['new', 'old'].includes(v.order)) err(at, '"order" must be "new" or "old"');
  if (v.things != null && v.entries != null) err(at, 'use "entries" or the older "things", not both');
  const list = v.entries ?? v.things;
  if (list != null) {
    if (!Array.isArray(list) || list.length === 0) err(at, '"entries" must be a non-empty list of entry ids, or be left out');
    else {
      v._list = [];
      for (const id of list) {
        const to = resolveEntry(id, v._owner);
        if (!to) err(at, `lists unknown entry "${id}"`);
        else if (byId.get(to)._tier === 'community' && byId.get(to)._owner !== v._owner) err(at, `lists "${id}", an entry in another community folder; only base entries and your own can be listed`);
        else if (!v._list.includes(to)) v._list.push(to);
      }
    }
  } else if (!(v.categories || []).length && !(v.domains || []).length) {
    err(at, 'needs "entries" (a hand-picked list), or "categories" or "domains" to draw from');
  }
  if (v.checkpoints != null) checkEras(at, v.checkpoints);
  if (v.image != null) checkMedia(at, '"image"', v.image, true);
  // A view only chooses what to show, and may name its own eras. It can never change the facts.
  const allowed = ['id', 'name', 'description', 'author', 'category', 'labels', 'tags', 'categories', 'domains', 'level', 'year', 'order', 'things', 'entries', 'checkpoints', 'image'];
  for (const k of Object.keys(v)) if (!k.startsWith('_') && !allowed.includes(k)) err(at, `unknown field "${k}"`);
}
const resolveView = (id) => (viewById.has(id) ? id : viewById.has(viewRedirects[id]) ? viewRedirects[id] : null);
for (const [from, to] of Object.entries(viewRedirects)) {
  if (viewById.has(from)) err('data/redirects.json', `"${from}" is a view, so it cannot also be an old address`);
  if (!viewById.has(to)) err('data/redirects.json', `"${from}" points to the unknown view "${to}"`);
}
for (const [from, to] of Object.entries(entryRedirects)) {
  if (byId.has(from)) err('data/redirects.json', `"${from}" is an entry, so it cannot also be an old address`);
  if (!byId.has(to)) err('data/redirects.json', `"${from}" points to the unknown entry "${to}"`);
}
const featured = choice.featured || [];
// The page opens on the default: one view, or several shown side by side.
const defaults = Array.isArray(choice.default) ? choice.default : [choice.default];
if (defaults.length === 0 || defaults.length > 8) err('data/editors-choice.json', '"default" must name one to eight views');
for (const id of defaults) if (!resolveView(id)) err('data/editors-choice.json', `default view "${id}" does not exist`);
for (const id of featured) if (!resolveView(id)) err('data/editors-choice.json', `featured view "${id}" does not exist`);

// ---------------------------------------------------------------- report
const quiet = process.argv.includes('--quiet');
const byKind = {};
for (const w of warnings) {
  const k = w.split(': ').slice(1).join(': ');
  byKind[k] = (byKind[k] || 0) + 1;
}
if (!quiet) for (const [k, n] of Object.entries(byKind)) console.log(`warning (${n}×): ${k}`);
for (const e of errors) console.error(`ERROR ${e}`);
const nBase = entries.filter((t) => t._tier === 'base').length;
console.log(`${entries.length} entries (${nBase} base, ${entries.length - nBase} community), ${domains.length} domains, ${categories.length} categories, ` +
  `${labelList.length} labels, ${checkpoints.length} checkpoints, ${views.length} community views in ${owners.length} folders · ${errors.length} errors, ${warnings.length} warnings`);
if (errors.length) process.exit(1);

// ---------------------------------------------------------------- write
if (!process.argv.includes('--check')) {
  const today = new Date();
  const nowYear = today.getFullYear();
  const NOW = nowYear + (today - new Date(nowYear, 0, 1)) / (365.25 * 864e5);
  const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

  // Rank every entry against its peers, once, here. The page never has to hold the whole dataset to know what matters.
  const rows = new Map();
  for (const t of entries) {
    const kind = catById.get(t.category), d = domainById.get(kind.domain);
    const bornEv = t.events.find((e) => e.type === 'born'), endEv = t.events.find((e) => e.type === 'ended');
    const born = parseDate(bornEv.date);
    rows.set(t._id, {
      id: t._id, category: t.category, signals: t.signals, born, end: endEv ? Math.max(parseDate(endEv.date), born) : null, inbound: [],
      cat: { name: kind.name, domain: kind.domain, domainName: d.name, from: wordsOf(kind.domain).from },
    });
  }
  for (const t of entries) for (const l of t.links || []) rows.get(resolveEntry(l.to, t._owner)).inbound.push({ type: l.type, from: t._id });
  score([...rows.values()], NOW);

  // What each view holds. A hand-picked view lists its entries; any other is drawn from the base by kind.
  const best = (a, b) => (rows.get(a._id).rank - rows.get(b._id).rank) || (rows.get(b._id).score - rows.get(a._id).score) || a._id.localeCompare(b._id);
  const base = entries.filter((t) => t._tier === 'base');
  const all = [...classical, ...views];
  for (const v of all) {
    if (v._list) v._members = v._list.map((id) => byId.get(id));
    else {
      const kinds = new Set([...(v.categories || []), ...(v.domains || []).flatMap(kindsUnder)]);
      v._members = base.filter((t) => kinds.size === 0 || kinds.has(t.category));
    }
    v._members.sort(best);
  }
  const live = all.filter((v) => v._members.length > 0);   // a view with nothing in it is not written or listed

  // How much the community leans on each entry: the links that point at it,
  // the community views that list it, and how many different people wrote those views.
  const picks = new Map();
  for (const v of views) for (const t of v._members) {
    const p = picks.get(t._id) || { views: 0, owners: new Set() };
    p.views++; p.owners.add(v._owner); picks.set(t._id, p);
  }
  const popularity = (id) => {
    const p = picks.get(id);
    return Math.log2(1 + rows.get(id).inbound.length) + Math.log2(1 + (p?.views || 0)) + 2 * Math.log2(1 + (p?.owners.size || 0));
  };

  // One entry as the page receives it: the file's own fields, plus what the build worked out.
  const compiled = new Map();
  function compile(t) {
    if (compiled.has(t._id)) return compiled.get(t._id);
    const r = rows.get(t._id);
    const { _at, _tier, _owner, _id, ...own } = t;
    const out = {
      ...own, id: t._id,
      links: (t.links || []).map((l) => { const to = resolveEntry(l.to, t._owner); return { ...l, to, n: nameOf(byId.get(to)) }; }),
      inbound: [...r.inbound].sort((a, b) => best(byId.get(a.from), byId.get(b.from))).slice(0, INBOUND_MAX).map((l) => ({ ...l, n: nameOf(byId.get(l.from)) })),
      rank: round(r.rank, 2), score: round(r.score, 4), topPct: r.topPct, peers: r.peers,
      parts: Object.fromEntries(Object.entries(r.parts).map(([k, n]) => [k, round(n, 3)])),
      pop: round(popularity(t._id), 2), tier: t._tier, home: homeOf(t.category),
    };
    if (t._owner) out.owner = t._owner;
    compiled.set(t._id, out);
    return out;
  }

  // Each view's thumbnail is made here, once, so the page only draws two short paths per view.
  const meta = (v) => {
    const out = {
      id: v._id, name: v.name, description: v.description, author: v._owner || v.author, type: v._type,
      tags: v.tags || [], level: v.level ?? 100, count: v._members.length,
    };
    for (const k of ['category', 'labels', 'year', 'order']) if (v[k] != null) out[k] = v[k];
    if (v._list) out.picked = true;
    else { out.categories = v.categories || []; if (v.domains) out.domains = v.domains; }
    out.thumb = v.image ? { image: v.image.src } : timelineThumb(v._members.map((t) => {
      const r = rows.get(t._id);
      return { born: r.born, end: r.end, weight: 100 - r.rank };
    }), NOW);
    return out;
  };
  const payload = (v) => ({
    view: { ...meta(v), checkpoints: v.checkpoints || [] },
    entries: v._members.slice(0, VIEW_CAP).map(compile),
  });

  rmSync(outDir, { recursive: true, force: true });
  let files = 0, bytes = 0;
  const write = (name, value) => {
    const path = join(outDir, name), text = JSON.stringify(value);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    files++; bytes += text.length;
  };

  for (const v of live) write(`v/${v._id}.json`, payload(v));
  // An old address gets the view's file under the old name too, so an old link still costs one request.
  for (const [from, to] of Object.entries(viewRedirects)) if (viewById.get(to)._members.length) write(`v/${from}.json`, payload(viewById.get(to)));
  write('home.json', { views: defaults.map((id) => payload(viewById.get(resolveView(id)))) });

  // Community views in the order the panel lists them: featured first, then the most-listed subjects.
  const featuredIds = featured.map(resolveView);
  const catalogue = live.filter((v) => v._type === 'community').sort((a, b) => {
    const fa = featuredIds.indexOf(a._id), fb = featuredIds.indexOf(b._id);
    return ((fa < 0 ? 1e9 : fa) - (fb < 0 ? 1e9 : fb)) || a.name.localeCompare(b.name);
  });

  const chars = [1, 2, 3, 4].find((n) => entries.length / 16 ** n <= 64) || 4;
  const shards = new Map();
  for (const t of entries) {
    const key = shardOf(t._id, chars);
    if (!shards.has(key)) shards.set(key, {});
    shards.get(key)[t._id] = compile(t);
  }
  for (const [key, value] of shards) write(`d/${key}.json`, value);

  // The search index: one short line per entry and per view, ordered by what the community leans on most.
  const kindIndex = new Map(categories.map((c, i) => [c.id, i]));
  const entryLines = entries.map((t) => {
    const r = rows.get(t._id);
    const bornEv = t.events.find((e) => e.type === 'born'), endEv = t.events.find((e) => e.type === 'ended');
    const other = [...t.names.slice(0, -1).map((n) => n.name), ...(t.aliases || [])].join('|');
    const line = [t._id, nameOf(t), kindIndex.get(t.category), yearOf(bornEv.date), endEv ? yearOf(endEv.date) : null,
      Math.round(r.rank), round(popularity(t._id), 1), t._tier !== 'base' ? 2 : t.verified === true ? 0 : 1];
    if (other) line.push(other);
    return line;
  }).sort((a, b) => (b[6] - a[6]) || (a[5] - b[5]) || a[0].localeCompare(b[0]));
  const viewLines = live.map((v) => [v._id, v.name, v._type === 'community' ? 0 : 1, v._members.length, [v.description, ...(v.tags || [])].join(' ')]);
  const split = entryLines.length + viewLines.length > SEARCH_SPLIT;
  if (!split) write('s/all.json', { entries: entryLines, views: viewLines });
  else {
    const files = new Map();
    const put = (kind, line, text) => {
      for (const p of new Set(tokens(text).map(prefixOf))) {
        if (!files.has(p)) files.set(p, { entries: [], views: [] });
        files.get(p)[kind].push(line);
      }
    };
    for (const l of entryLines) put('entries', l, l[1] + ' ' + (l[8] || ''));
    for (const l of viewLines) put('views', l, l[1] + ' ' + l[4]);
    for (const [p, value] of files) write(`s/${p}.json`, value);
  }

  for (const o of owners) {
    write(`c/${o.id}.json`, {
      id: o.id, ...o.profile,
      views: catalogue.filter((v) => v._owner === o.id).map(meta),
      entries: entries.filter((t) => t._owner === o.id).map((t) => [t._id, nameOf(t), t.category]),
    });
  }

  const counts = {};
  for (const t of base) counts[t.category] = (counts[t.category] || 0) + 1;
  write('boot.json', {
    release: today.toISOString().slice(0, 10),
    counts: { entries: entries.length, base: nBase, views: live.length, community: catalogue.length },
    domains: domains.map((d) => ({ id: d.id, name: d.name, description: d.description, ...(d.parent ? { parent: d.parent } : {}), words: wordsOf(d.id) })),
    categories: categories.map((c) => ({ ...c, n: counts[c.id] || 0, view: homeOf(c.id) })),
    labels: labelFile,
    default: defaults.map(resolveView), featured: featuredIds,
    views: catalogue.slice(0, CATALOGUE_MAX).map(meta),
    owners: owners.map((o) => ({ id: o.id, title: o.profile.title })),
    top: entryLines.slice(0, 12).map((l) => [l[0], l[1], l[2]]),
    detail: { chars },
    search: split ? { mode: 'prefix' } : { mode: 'all' },
  });

  if (existsSync(mediaDir)) cpSync(mediaDir, join(outDir, 'media'), { recursive: true });
  console.log(`wrote site/data/ (${entries.length} entries, ${live.length} views, ${files} files, ${Math.round(bytes / 1024)} KB)`);
}
