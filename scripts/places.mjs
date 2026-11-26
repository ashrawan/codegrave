#!/usr/bin/env node
// Finds where base entries are on the Earth, for the globe (site/globe.js),
// and writes data/places.json: { "<entry id>": [lat, lon, level, "place name"] }.
//
//   node scripts/places.mjs            look up every base entry that has a Wikidata id
//
// A stand-in for the globe's first version: places are kept apart from the
// entries, so no entry file changes. Coordinates come from Wikidata (CC0) and
// are never guessed. In order: the entry's own coordinates (P625); its one
// location (P276); for a person, the place of birth (P19); for an
// organisation, its headquarters (P159); else its one country (P17).
// An entry with several locations or several countries has no single place
// and is left out, as is anything older than MAX_AGE years (the continents
// stood elsewhere) and anything not on the Earth.
//
// `level` says how close the camera may come: spot, city, region or country.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_AGE = 5e6;
const UA = 'codegrave-places/1.0 (https://codegrave.com)';
const SKIP = new Set(['space', 'earth-ages']);                // not places on today's Earth
const SPOT = new Set(['buildings', 'sites', 'infrastructure', 'institutions', 'schools', 'ships', 'spaceflight', 'trials']);
const WIDE = new Set(['landforms', 'waters', 'regions', 'expeditions']);
const LAND = new Set(['countries', 'dynasties', 'periods', 'societies', 'human-languages']);
const levelOf = (kind) => (SPOT.has(kind) ? 'spot' : WIDE.has(kind) ? 'region' : LAND.has(kind) ? 'country' : 'city');

const entries = [];
for (const kind of readdirSync(join(root, 'data', 'base'))) {
  if (SKIP.has(kind)) continue;
  for (const f of readdirSync(join(root, 'data', 'base', kind))) {
    const e = JSON.parse(readFileSync(join(root, 'data', 'base', kind, f), 'utf8'));
    const born = (e.events || []).find((x) => x.type === 'born');
    const year = born ? Number(/^-?\d+/.exec(born.date)?.[0]) : NaN;
    if (!e.wikidata || !(year > -MAX_AGE)) continue;
    entries.push({ id: e.id, kind, q: e.wikidata });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ask(query) {
  for (let n = 0; n < 5; n++) {
    const res = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query), { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } }).catch(() => null);
    if (res && res.ok) return (await res.json()).results.bindings;
    await sleep(4000 * (n + 1));
  }
  throw new Error('Wikidata did not answer');
}
// "Point(lon lat)" on the Earth; a point on another globe is written with that globe first, and is left out.
const point = (s) => { const m = /^Point\((-?[\d.e-]+) (-?[\d.e-]+)\)$/i.exec(s || ''); return m ? [Number(m[2]), Number(m[1])] : null; };

const own = new Map(), via = { P276: new Map(), P19: new Map(), P159: new Map(), P17: new Map() };
const qs = [...new Set(entries.map((e) => e.q))];
for (let i = 0; i < qs.length; i += 300) {
  const values = qs.slice(i, i + 300).map((q) => 'wd:' + q).join(' ');
  for (const b of await ask(`SELECT ?item ?c WHERE { VALUES ?item { ${values} } ?item wdt:P625 ?c }`)) {
    const q = b.item.value.split('/').pop(), p = point(b.c.value);
    if (p && !own.has(q)) own.set(q, p);
  }
  for (const prop of Object.keys(via)) {
    const rows = await ask(`SELECT ?item ?to ?toLabel ?c WHERE { VALUES ?item { ${values} } ?item wdt:${prop} ?to . OPTIONAL { ?to wdt:P625 ?c } SERVICE wikibase:label { bd:serviceParam wikibase:language "en" } }`);
    for (const b of rows) {
      const q = b.item.value.split('/').pop(), to = b.to.value.split('/').pop();
      const m = via[prop].get(q) || new Map();
      if (!m.has(to)) m.set(to, { name: b.toLabel?.value || '', at: point(b.c?.value) });
      via[prop].set(q, m);
    }
    await sleep(600);
  }
  process.stderr.write(`\r${Math.min(i + 300, qs.length)} of ${qs.length}`);
}
process.stderr.write('\n');

const one = (m) => (m && m.size === 1 ? [...m.values()][0] : null);
const round = (v) => Math.round(v * 1e4) / 1e4;
const out = {};
let n = 0;
for (const e of entries.sort((a, b) => (a.id < b.id ? -1 : 1))) {
  const country = one(via.P17.get(e.q)), loc = one(via.P276.get(e.q)), birth = one(via.P19.get(e.q)), seat = one(via.P159.get(e.q));
  let at = null, level = levelOf(e.kind), name = '';
  if (own.has(e.q)) { at = own.get(e.q); name = loc?.name || (LAND.has(e.kind) ? '' : country?.name) || ''; }
  else if (loc?.at) { at = loc.at; name = loc.name; if (level === 'spot') level = 'city'; if (level === 'city') level = 'region'; }
  else if (birth?.at) { at = birth.at; name = birth.name; level = 'city'; }
  else if (seat?.at) { at = seat.at; name = seat.name; level = 'city'; }
  else if (country?.at && !via.P276.has(e.q)) { at = country.at; name = country.name; level = 'country'; }
  if (!at || Math.abs(at[0]) > 90 || Math.abs(at[1]) > 180) continue;
  out[e.id] = [round(at[0]), round(at[1]), level, /^Q\d+$/.test(name) ? '' : name];
  n++;
}
writeFileSync(join(root, 'data', 'places.json'), '{\n' + Object.entries(out).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n}\n');
console.log(`${n} of ${entries.length} entries have a place (data/places.json)`);
