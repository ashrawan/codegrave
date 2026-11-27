/* Create with AI: what a model writes (a "spec") turned into a view file the
   page can draw. Pure functions with tests (tests/ai.test.mjs); no DOM.

   A spec is small and plain, so any model can write it and a later request
   can change it:

   { title, description, axis,                         axis "rank": a ranked list (see below)
     chapters: [{ name, from, to, note }],            whole years, or full dates for a plan
     entries:  [{ name, kind, type, start, end, summary, wikipedia,
                  importance, events: [{ date, label, note }], image }] }

   Dates are text: "1969", "1969-07", "1969-07-20", and "2027-04-03T09:30" for
   a plan made by the hour; before the common era a
   minus sign and four or more digits ("-0044-03-15"); deep time a negative
   year ("-66000000"). There is no year 0.

   Not everything is laid out in time. The axis is one of three:
   - "time" (the usual): the dates above.
   - "rank": an ordered list ("the 100 most popular foods", the steps of a
     recipe). Each entry has a "rank" from 1; chapters run from rank to rank.
   - "scale": a measured value ("the tallest buildings", "planets by distance
     from the Sun"). The spec names its "unit" ("m", "AU", "$") and each entry
     has a "value" in it; chapters run from value to value. "log": true spaces
     values that span powers of ten evenly.
   The road works in moments, so a rank or a value is put where a year would
   stand (rank n at the year n; a scale over the years 1 to 1001) and the view
   carries what it takes to write it back (`axis`, `scale`, axisLabel()). */

// The models a reader may pick, by their OpenRouter id: open models, the cheapest and most used of
// OpenRouter's ranking (asked for, Nov 2026: "fastest and cheapest, open source, top and popular").
// The first ones are offered at once, the rest under "More models". The server keeps its own list of
// what it will run (supabase/functions/ai-timeline), so a model is added in both places.
export const MODELS = [
  { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', note: 'The fastest. Right for most things.' },
  // The cheapest of OpenAI, Anthropic and Google on OpenRouter (asked for, Nov 2026).
  { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', note: "OpenAI's cheapest. Good all round." },
  { id: 'anthropic/claude-haiku-5.5', name: 'Claude Haiku 5.5', note: "Anthropic's fastest. Careful writing." },
  { id: 'google/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite', note: "Google's lightest. Costs a little more.", more: true },
  { id: 'minimax/minimax-m3.1-flash', name: 'MiniMax M3.1 Flash', note: 'Fast, and finds the most pictures.', more: true },
  { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', note: 'Careful with dates. A little slower.', more: true },
  { id: 'qwen/qwen3.8-flash', name: 'Qwen3.8 Flash', note: 'Good in many languages.', more: true },
  { id: 'tencent/hy4-flash', name: 'Hy4 Flash', note: 'The cheapest. Slower to start.', more: true },
];
// How long the model thinks before it writes (OpenRouter's reasoning; "none" switches it off).
export const EFFORTS = [
  { id: 'none', name: 'Quick' },
  { id: 'low', name: 'Balanced' },
  { id: 'high', name: 'Thorough' },
];
// The branches of the map, which give an entry its words (a person is born and dies, a city is founded).
export const TYPES = ['people', 'places', 'organisations', 'events', 'arts', 'knowledge', 'society', 'life', 'earth-space', 'technology', 'computing'];
export const MAX_ENTRIES = 100;

const text = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, max);
export const slug = (s) => text(s, 80).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'entry';

// A date as the page reads it, or '' when it is not one. Years are padded to four digits.
export function cleanDate(v) {
  const m = /^(-?)(\d{1,12})(?:-(\d{1,2}))?(?:-(\d{1,2}))?(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(text(v, 30));
  if (!m) return '';
  const y = Number(m[2]), mo = m[3] ? Number(m[3]) : 0, d = m[4] ? Number(m[4]) : 0;
  if (!y || mo > 12 || d > 31 || (mo && d && d > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1])) return '';
  let out = (m[1] || '') + String(y).padStart(4, '0');
  if (mo) { out += '-' + String(mo).padStart(2, '0'); if (d) out += '-' + String(d).padStart(2, '0'); }
  // A time of day is kept only on a full date: "2027-04-03T09:30".
  if (d && m[5] != null && Number(m[5]) < 24 && Number(m[6]) < 60) out += 'T' + m[5].padStart(2, '0') + ':' + m[6];
  return out;
}
// A rank as the road keeps it: rank n stands where the year n would.
export const rankDate = (n) => String(n).padStart(4, '0');
const precisionOf = (date) => (/T/.test(date) ? 'minute' : date.replace(/^-/, '').split('-').length === 3 ? 'day' : date.replace(/^-/, '').split('-').length === 2 ? 'month' : 'year');
// The whole year a date falls in, negative before the common era (never 0).
export const yearOfDate = (date) => { const neg = date[0] === '-'; const y = Number((neg ? date.slice(1) : date).split('-')[0]); return neg ? -y : y; };
const order = (date) => {
  const [day, time = '0:0'] = date.split('T'), y = yearOfDate(day), p = day.replace(/^-/, '').split('-'), [h, mi] = time.split(':').map(Number);
  return y + (Number(p[1] || 1) - 1) / 12 + (Number(p[2] || 1) - 1 + (h + mi / 60) / 24) / 372;
};
// A chapter is whole years (numbers), or, for a plan, full dates ("2027-04-01"), which keep its weeks and days.
const bound = (v) => (typeof v === 'string' && /^\d{4,}-\d\d-\d\d/.test(v.trim()) ? cleanDate(v) || null : Number.isFinite(Number(v)) && Math.trunc(Number(v)) ? Math.trunc(Number(v)) : null);
const at = (v) => (typeof v === 'number' ? v : order(v));

// ---- the axis: time, rank or scale
const num = (v) => { const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[, _]/g, '')) : NaN; return Number.isFinite(n) ? n : null; };
const spread = (vs) => { const p = vs.filter((v) => v != null && v > 0); return p.length ? Math.max(...p) / Math.min(...p) : 1; };
// The axis a spec asks for, or, when it names none, the one its entries show: dates, ranks or values.
export function axisOfSpec(s) {
  if (s.axis === 'rank' || s.axis === 'scale') return s.axis;
  if (s.axis === 'time') return 'time';
  const es = Array.isArray(s.entries) ? s.entries : [];
  if (!es.length || es.filter((e) => cleanDate(e?.start)).length * 2 >= es.length) return 'time';
  if (es.filter((e) => num(e?.value) != null).length * 2 > es.length) return 'scale';
  return es.some((e) => Number(e?.rank) > 0) ? 'rank' : 'time';
}
// A scale spread over the years 1 to 1001 of the road (log10 of the values on a log scale).
export const SCALE_SPAN = 1000;
export function scaleOf(values, log) {
  const ps = values.filter((v) => v != null && (!log || v > 0)).map((v) => (log ? Math.log10(v) : v));
  const min = ps.length ? Math.min(...ps) : 0, max = ps.length ? Math.max(...ps) : 1;
  return { min, max: max > min ? max : min + 1, log: !!log };
}
export const scaleYear = (sc, v) => 1 + (((sc.log ? Math.log10(v) : v) - sc.min) / (sc.max - sc.min)) * SCALE_SPAN;
export const scaleValue = (sc, y) => { const p = sc.min + ((y - 1) / SCALE_SPAN) * (sc.max - sc.min); return sc.log ? 10 ** p : p; };
// A moment of the road (a fractional year from 1) as a full date the page reads.
export function momentDate(y) {
  const Y = Math.max(1, Math.floor(y)), d = new Date(0);
  d.setUTCFullYear(Y, 0, 1);
  const len = ((Y % 4 === 0 && Y % 100 !== 0) || Y % 400 === 0 ? 366 : 365);
  d.setUTCDate(1 + Math.min(len - 1, Math.floor((y - Y) * len)));
  return String(d.getUTCFullYear()).padStart(4, '0') + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
// A value with its unit, briefly: "828 m", "1.5 AU", "$999", "4.2 million km".
const PREFIX = new Set(['$', '€', '£', '¥', '₹', '₩', '₽']);
export function fmtValue(v, unit = '') {
  const a = Math.abs(v);
  const n = a >= 1e12 ? +(v / 1e12).toPrecision(3) + ' trillion' : a >= 1e9 ? +(v / 1e9).toPrecision(3) + ' billion' : a >= 1e6 ? +(v / 1e6).toPrecision(3) + ' million'
    : a >= 1e4 ? Math.round(v).toLocaleString('en-US') : a >= 1 ? String(+v.toPrecision(4)) : a === 0 ? '0' : String(+v.toPrecision(3));
  const u = text(unit, 16);
  return !u ? n : PREFIX.has(u) ? u + n : n + ' ' + u;
}
// The words for a written year of a road that is not in time: "#3", or the value there, "828 m".
// `short` keeps it to about four characters, for the bar.
export function axisLabel(view, y, short = false) {
  if (view?.axis === 'rank') return '#' + y;
  if (view?.axis !== 'scale' || !view.scale) return null;
  const v = scaleValue(view.scale, y), a = Math.abs(v);
  if (!short) return fmtValue(+v.toPrecision(2), view.scale.unit);
  return a >= 1e9 ? +(v / 1e9).toPrecision(2) + 'B' : a >= 1e6 ? +(v / 1e6).toPrecision(2) + 'M' : a >= 1e3 ? +(v / 1e3).toPrecision(2) + 'k' : String(+v.toPrecision(2));
}

// A spec made safe: every field the right type and length, nothing unknown kept.
export function cleanSpec(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const axis = axisOfSpec(s), ranked = axis === 'rank', scaled = axis === 'scale';
  const seen = new Set(), entries = [];
  // A ranked list: each entry's place, by its rank (else its place in the list), numbered again 1, 2, 3...
  let list = (Array.isArray(s.entries) ? s.entries : []).map((e, i) => ({ e, r: Number(e?.rank) > 0 ? Number(e.rank) : i + 1, v: num(e?.value), i }));
  if (ranked) list.sort((a, b) => a.r - b.r || a.i - b.i);
  // A scale: only entries with a value, smallest first; a log scale only when every value is above 0.
  const log = scaled && s.log !== false && list.every((x) => x.v == null || x.v > 0) && (s.log === true || spread(list.map((x) => x.v)) >= 100);
  if (scaled) list = list.filter((x) => x.v != null && (!log || x.v > 0)).sort((a, b) => a.v - b.v || a.i - b.i);
  const sc = scaled ? scaleOf(list.map((x) => x.v), log) : null;
  for (const { e } of list) {
    if (!e || typeof e !== 'object' || entries.length >= MAX_ENTRIES) continue;
    const name = text(e.name, 90), start = ranked ? rankDate(entries.length + 1) : scaled ? momentDate(scaleYear(sc, num(e.value))) : cleanDate(e.start);
    if (!name || !start || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    let end = ranked || scaled ? '' : cleanDate(e.end);
    if (end && order(end) < order(start)) end = '';
    const img = picOf(e.image), more = (Array.isArray(e.more) ? e.more : []).map(picOf).filter((m) => m && m.src !== img?.src).slice(0, MORE_PICS);
    entries.push({
      ...(ranked ? { rank: entries.length + 1 } : scaled ? { value: num(e.value) } : {}),
      name, kind: text(e.kind, 40) || 'Entry', type: TYPES.includes(e.type) ? e.type : 'events', start, end,
      summary: text(e.summary, 400), wikipedia: text(e.wikipedia, 120), importance: Math.min(5, Math.max(1, Math.round(Number(e.importance)) || 3)),
      events: (Array.isArray(e.events) ? e.events : []).map((x) => ({ date: cleanDate(x?.date), label: text(x?.label, 80), note: text(x?.note, 200) })).filter((x) => x.date && x.label).slice(0, 6),
      ...(img ? { image: img } : {}),
      ...(img && more.length ? { more } : {}),
      ...(text(e.place, 120) ? { place: text(e.place, 120) } : {}),
      ...(text(e.address, 160) ? { address: text(e.address, 160) } : {}),
      ...(whereOf(e.coordinates) ? { coordinates: whereOf(e.coordinates) } : {}),
      ...(whereOf(e.where) ? { where: whereOf(e.where) } : {}),
    });
  }
  if (!ranked && !scaled) entries.sort((a, b) => order(a.start) - order(b.start));
  // Chapters: whole years, in order, never overlapping.
  const chapters = [];
  const edge = (v) => (scaled ? num(v) : bound(v));
  for (const c of (Array.isArray(s.chapters) ? s.chapters : []).map((c) => ({ name: text(c?.name, 60), from: edge(c?.from), to: edge(c?.to), note: text(c?.note, 400) }))
    .filter((c) => c.name && c.from != null && c.to != null && typeof c.from === typeof c.to && at(c.to) >= at(c.from)).sort((a, b) => at(a.from) - at(b.from))) {
    const last = chapters[chapters.length - 1];
    if (last && (typeof last.to === 'number' ? at(c.from) <= last.to : at(c.from) < at(last.to))) continue;
    if (chapters.length < 12) chapters.push(c);
  }
  return { title: text(s.title, 80) || 'Untitled timeline', description: text(s.description, 300), ...(ranked ? { axis: 'rank' } : scaled ? { axis: 'scale', unit: text(s.unit, 16), log } : {}), chapters, entries };
}

// The view file the page draws, from a spec. `seed` makes the entries' ids
// new each time, because the page keeps every entry it has seen by id.
export function specToView(raw, seed) {
  const spec = cleanSpec(raw);
  const used = new Set();
  const entries = spec.entries.map((e, i) => {
    let id = `x${seed}-${slug(e.name)}`;
    for (let n = 2; used.has(id); n++) id = `x${seed}-${slug(e.name)}-${n}`;
    used.add(id);
    const p = precisionOf(e.start);
    const wiki = e.wikipedia ? 'https://en.wikipedia.org/wiki/' + encodeURIComponent(e.wikipedia.replace(/ /g, '_')) : '';
    return {
      id, category: e.kind, domain: e.type, tier: 2, made: 'ai', ...(e.rank ? { pos: e.rank } : e.value != null ? { pos: i + 1, val: fmtValue(e.value, spec.unit) } : {}),
      names: [{ name: e.name, from: e.start }],
      summary: e.summary,
      events: [
        { type: 'born', date: e.start, precision: p },
        ...(spec.axis ? [] : e.events).map((x) => ({ type: 'milestone', date: x.date, precision: precisionOf(x.date), label: x.label, note: x.note })),
        ...(e.end ? [{ type: 'ended', date: e.end, precision: precisionOf(e.end) }] : []),
      ],
      status: e.end ? 'dead' : 'alive',
      rank: 6 - e.importance, score: e.importance / 5,
      links: [], inbound: [],
      sources: wiki ? [{ title: 'Wikipedia: ' + e.wikipedia, url: wiki, kind: 'secondary' }] : [],
      verified: false,
      ...(e.where ? { where: e.where } : {}),
      ...(e.image ? { image: mediaOf(e.image, e.name, wiki) } : {}),
      ...(e.image && e.more?.length ? { media: e.more.map((m) => mediaOf(m, e.name, wiki)) } : {}),
    };
  });
  const ids = new Set(), sc = spec.axis === 'scale' ? scaleOf(spec.entries.map((e) => e.value), spec.log) : null;
  const checkpoints = spec.chapters.map((c) => {
    let id = slug(c.name);
    for (let n = 2; ids.has(id); n++) id = `${slug(c.name)}-${n}`;
    ids.add(id);
    // A scale's chapters are values: they stand where the values do, on whole years of the road.
    if (sc) return { id, name: c.name, from: Math.max(1, Math.floor(scaleYear(sc, c.from))), to: Math.max(1, Math.floor(scaleYear(sc, c.to))), note: c.note };
    return { id, name: c.name, from: c.from, to: c.to, note: c.note };
  });
  const years = spec.entries.map((e) => yearOfDate(e.start));
  return {
    view: { description: spec.description, checkpoints, picked: true, made: 'ai', ...(spec.axis ? { axis: spec.axis } : {}), ...(sc ? { scale: { ...sc, unit: spec.unit } } : {}), span: years.length ? [Math.min(...years), null] : null },
    entries, spec,
  };
}

// What can be drawn of a spec while the model is still writing it: the title and description once
// they are written, and every chapter and entry whose object is closed. `text` is the JSON so far.
export function partialSpec(text) {
  const out = { title: '', description: '', chapters: [], entries: [] };
  const field = (k) => {
    const m = text.match(new RegExp('"' + k + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
    if (!m) return '';
    try { return JSON.parse('"' + m[1] + '"'); } catch (e) { return ''; }
  };
  out.title = field('title');
  out.description = field('description');
  const ax = field('axis');
  if (ax === 'rank' || ax === 'scale') out.axis = ax;
  if (ax === 'scale') { out.unit = field('unit'); if (/"log"\s*:\s*true/.test(text)) out.log = true; }
  for (const key of ['chapters', 'entries']) {
    const at = text.search(new RegExp('"' + key + '"\\s*:\\s*\\['));
    if (at < 0) continue;
    let depth = 0, from = -1, inStr = false, esc = false;
    for (let i = text.indexOf('[', at) + 1; i < text.length; i++) {
      const ch = text[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') { if (depth++ === 0) from = i; }
      else if (ch === '}') { if (--depth === 0 && from >= 0) { try { out[key].push(JSON.parse(text.slice(from, i + 1))); } catch (e) { /* not yet whole */ } from = -1; } }
      else if (ch === ']' && depth === 0) break;
    }
  }
  return out;
}

// A free picture for each entry that names its Wikipedia article, written onto the entries (`image`).
// First the article's own lead picture when it is free; then, for the many articles whose lead picture
// is not (a logo, a product shot), the picture Wikidata keeps for the subject (P18, else its logo P154),
// always a file on Wikimedia Commons. About three requests for a whole timeline. `get(host, query)`
// answers one API request (the server and the page each pass their own). Returns how many it found.
// One picture of a spec's entry, { src, source }, or null: any https address (Wikimedia's own lose their tracking
// query). It is found by the server on Wikipedia first; a link the model gave is kept only when it opened as a
// picture (`linkPictures()`), and the reader may set any link in the editor.
export const MORE_PICS = 3;
export function picOf(v) {
  const src = typeof v === 'string' ? v : v && typeof v === 'object' ? v.src : '';
  if (typeof src !== 'string' || !/^https:\/\/[^\s"'<>]+$/.test(src.trim())) return null;
  const source = v && typeof v === 'object' && /^https:\/\//.test(v.source || '') ? text(v.source, 400) : '';
  return { src: text(src.replace(/\?utm_[^#]*$/, ''), 400), source };
}
const wikimedia = (u) => /^https:\/\/[a-z.]*wikimedia\.org\//.test(u);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
const mediaOf = (m, name, wiki) => ({ src: m.src, alt: name, credit: wikimedia(m.src) ? 'Wikimedia Commons' : hostOf(m.source || m.src), licence: 'See the source', source: m.source || (wikimedia(m.src) ? wiki : m.src) });
// A link the model gave, as the address of the picture itself: a file page on Wikimedia Commons becomes the file.
export function pictureLink(u) {
  if (typeof u !== 'string' || !/^https:\/\/[^\s"'<>]+$/.test(u.trim())) return null;
  u = u.trim();
  const file = u.match(/^https:\/\/(?:commons\.wikimedia|[a-z-]+\.wikipedia)\.org\/wiki\/File:([^?#]+)/);
  return file ? { src: 'https://commons.wikimedia.org/wiki/Special:FilePath/' + file[1] + '?width=500', source: 'https://commons.wikimedia.org/wiki/File:' + file[1] } : { src: u, source: u };
}
// The pictures the model linked (`pictures` on an entry), after Wikipedia's: each link is opened (`check(url)`
// answers whether it is a picture), since most addresses a model writes from memory do not exist. The first that
// opens is the entry's picture when Wikipedia had none; the others stand beside it (`more`). Returns how many were kept.
export async function linkPictures(entries, check, max = 60) {
  const asks = [];
  for (const e of entries) {
    const links = (Array.isArray(e.pictures) ? e.pictures : []).map(pictureLink).filter(Boolean).slice(0, MORE_PICS);
    delete e.pictures;
    for (const m of links) if (asks.length < max) asks.push({ e, m });
  }
  let n = 0;
  for (let i = 0; i < asks.length; i += 6) {
    const ok = await Promise.all(asks.slice(i, i + 6).map(({ m }) => check(m.src).catch(() => false)));
    asks.slice(i, i + 6).forEach(({ e, m }, j) => {
      if (!ok[j] || e.image?.src === m.src) return;
      if (!e.image) e.image = m; else if ((e.more ??= []).length < MORE_PICS && !e.more.some((x) => x.src === m.src)) e.more.push(m); else return;
      n++;
    });
  }
  return n;
}

// A place on the Earth, [lat, lon], or null: only what is a real pair of numbers in range.
export function whereOf(w) {
  if (!Array.isArray(w) || w.length < 2) return null;
  const lat = Number(w[0]), lon = Number(w[1]);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && w[0] !== null && w[1] !== null ? [Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4] : null;
}
// Where each entry is on the Earth, written onto the entries (`where`: [lat, lon]). It is never taken from the
// model, which only says where in words. From the most exact to the least:
//   1. `address` ("Bellevue Downtown Park, Bellevue, Washington, USA"), looked up in OpenStreetMap (`json`, when
//      given: Photon, a free geocoder that needs no key). It counts only when it falls within `NEAR_KM` of the
//      place Wikipedia gave, so a namesake in another town is never drawn.
//   2. The coordinates of its own Wikipedia article when that is one spot (a building, a campus, a station).
//   3. Those of the article of the place it names (`place`: a venue, a neighbourhood, a city), else whatever
//      its own article has. The place comes before the article because the article may only stand in for the
//      picture (an event shown by its city's article).
//   4. The model's own `coordinates`, the one thing taken from it, and only as a finer point inside a place that
//      is already known: they count when they fall within `GUESS_KM` of the place Wikipedia gave (a venue in
//      its town), never alone. A cheap model writes a confident pair of numbers for a hall it has never heard of.
// An entry with none of these has no place. Returns how many were found.
const NEAR_KM = 80, GUESS_KM = 30, GEO_MAX = 60, GEO_AT_ONCE = 3;
const SPOTS = ['landmark', 'edu', 'airport', 'railwaystation', 'event'];   // Wikipedia's types of place that are one spot
export function kmBetween(a, b) {
  const r = Math.PI / 180, h = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
export async function findPlaces(entries, get, json) {
  const title = (v) => (typeof v === 'string' ? v.trim() : '');
  for (const e of entries) delete e.where;
  const titles = [...new Set(entries.flatMap((e) => [title(e.wikipedia), title(e.place)]).filter(Boolean))].slice(0, 200);
  const at = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    try {
      const d = await get('en.wikipedia.org', 'action=query&redirects=1&prop=coordinates&coprimary=primary&coprop=type%7Cglobe&colimit=50&titles=' + encodeURIComponent(titles.slice(i, i + 50).join('|')));
      const back = new Map();
      for (const n of d.query?.normalized ?? []) back.set(n.to, n.from);
      for (const n of d.query?.redirects ?? []) back.set(n.to, back.get(n.from) ?? n.from);
      for (const p of Object.values(d.query?.pages ?? {})) {
        const c = p.coordinates?.[0], w = c && (c.globe ?? 'earth') === 'earth' ? whereOf([c.lat, c.lon]) : null;
        if (w) { const spot = { w, spot: SPOTS.includes(c.type) }; at.set(p.title, spot); at.set(back.get(p.title) ?? p.title, spot); }
      }
    } catch (e) { /* a timeline without places is still a timeline */ }
  }
  const wide = new Map(), fine = new Map();
  for (const e of entries) {
    const own = at.get(title(e.wikipedia)), named = at.get(title(e.place));
    const spot = own?.spot ? own : named ?? own, guess = whereOf(e.coordinates);
    if (spot) wide.set(e, spot.w);
    if (spot && !spot.spot && guess && kmBetween(guess, spot.w) <= GUESS_KM) fine.set(e, guess);
  }
  // The exact spot, from the address. Each address is asked once, a few at a time, near the place Wikipedia gave.
  const exact = new Map();
  if (json) {
    const asks = new Map();
    for (const e of entries) { const a = title(e.address); if (a && !asks.has(a) && asks.size < GEO_MAX) asks.set(a, wide.get(e) ?? null); }
    const list = [...asks];
    // A hit counts when it is near the place Wikipedia gave; with no such place, when it is in a town the address names.
    const fits = (f, a, near) => {
      const g = f?.geometry?.coordinates, w = g ? whereOf([g[1], g[0]]) : null, p = f?.properties ?? {};
      if (!w) return null;
      if (near) return kmBetween(w, near) <= NEAR_KM ? w : null;
      const town = String(p.city || p.name || '').toLowerCase();
      return town && a.toLowerCase().includes(town) ? w : null;
    };
    const one = async ([a, near]) => {
      // The whole address first; then, with no wider place to fall back on, without its first part (the venue).
      const tries = [a, ...(near || a.split(',').length < 3 ? [] : [a.split(',').slice(1).join(',').trim()])];
      for (const q of tries) {
        const url = 'https://photon.komoot.io/api/?limit=5&lang=en&q=' + encodeURIComponent(q) + (near ? `&lat=${near[0]}&lon=${near[1]}` : '');
        for (let go = 0; go < 2; go++) {
          try {
            const d = await json(url);
            for (const f of d?.features ?? []) { const w = fits(f, a, near); if (w) { exact.set(a, w); return; } }
            break;
          } catch (x) { /* once more, then the wider place stands */ }
        }
      }
    };
    for (let i = 0; i < list.length; i += GEO_AT_ONCE) await Promise.all(list.slice(i, i + GEO_AT_ONCE).map(one));
  }
  let n = 0;
  for (const e of entries) { const w = exact.get(title(e.address)) ?? fine.get(e) ?? wide.get(e); if (w) { e.where = w; n++; } }
  return n;
}

export async function findPictures(entries, get) {
  const n = await picturesFor(entries, get);
  // An entry with no picture of its own (a local event, a meeting) shows the place it names: its venue or town.
  const bare = entries.filter((e) => !e.image && typeof e.place === 'string' && e.place.trim() && e.place.trim() !== (e.wikipedia ?? '').trim());
  if (!bare.length) return n;
  const stand = bare.map((e) => ({ wikipedia: e.place }));
  await picturesFor(stand, get);
  let m = 0;
  bare.forEach((e, i) => { if (stand[i].image) { e.image = stand[i].image; m++; } });
  return n + m;
}
async function picturesFor(entries, get) {
  const want = entries.filter((e) => !e.image && typeof e.wikipedia === 'string' && e.wikipedia.trim());
  const titles = [...new Set(want.map((e) => e.wikipedia.trim()))].slice(0, 100);
  const found = new Map(), item = new Map(), file = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    try {
      const d = await get('en.wikipedia.org', 'action=query&redirects=1&prop=pageimages%7Cpageprops&ppprop=wikibase_item&piprop=thumbnail%7Cname&pilicense=free&pithumbsize=500&pilimit=50&titles=' + encodeURIComponent(titles.slice(i, i + 50).join('|')));
      const back = new Map();      // the title Wikipedia settled on -> the title asked for
      for (const n of d.query?.normalized ?? []) back.set(n.to, n.from);
      for (const n of d.query?.redirects ?? []) back.set(n.to, back.get(n.from) ?? n.from);
      for (const p of Object.values(d.query?.pages ?? {})) {
        const asked = back.get(p.title) ?? p.title;
        if (p.thumbnail?.source) found.set(asked, { src: p.thumbnail.source, source: p.pageimage ? 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(p.pageimage) : '' });
        else if (p.pageprops?.wikibase_item) item.set(asked, p.pageprops.wikibase_item);
      }
    } catch (e) { /* a timeline without pictures is still a timeline */ }
  }
  const ids = [...new Set(item.values())];
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const d = await get('www.wikidata.org', 'action=wbgetentities&props=claims&ids=' + ids.slice(i, i + 50).join('%7C'));
      for (const [asked, q] of item) {
        const c = d.entities?.[q]?.claims, name = c?.P18?.[0]?.mainsnak?.datavalue?.value ?? c?.P154?.[0]?.mainsnak?.datavalue?.value;
        if (typeof name === 'string') file.set(asked, name);
      }
    } catch (e) { /* fine */ }
  }
  const names = [...new Set(file.values())];
  for (let i = 0; i < names.length; i += 50) {
    try {
      const d = await get('commons.wikimedia.org', 'action=query&prop=imageinfo&iiprop=url&iiurlwidth=500&titles=' + encodeURIComponent(names.slice(i, i + 50).map((n) => 'File:' + n).join('|')));
      const thumb = new Map(), back = new Map();
      for (const n of d.query?.normalized ?? []) back.set(n.to, n.from);
      for (const p of Object.values(d.query?.pages ?? {})) {
        const u = p.imageinfo?.[0]?.thumburl;
        if (u) { thumb.set(p.title, u); if (back.has(p.title)) thumb.set(back.get(p.title), u); }
      }
      for (const [asked, name] of file) {
        const u = thumb.get('File:' + name) ?? thumb.get('File:' + name.replace(/_/g, ' '));
        if (u) found.set(asked, { src: u, source: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(name.replace(/ /g, '_')) });
      }
    } catch (e) { /* fine */ }
  }
  let n = 0;
  for (const e of want) { const hit = found.get(e.wikipedia.trim()); if (hit) { e.image = hit; n++; } }
  return n;
}

// ---- the editor ("Open in editor"): reading and writing dates as people type them, and saying why an
// edit cannot be kept. cleanSpec() drops what it cannot read without a word; the editor asks first.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// A date as it is typed ("20 Jul 1969", "July 1969", "44 BCE", "Sat 3 Apr 2027, 09:30", "1969-07-20") as
// the spec keeps it ("1969-07-20"), or '' when it is not one.
export function readDate(v) {
  const s = text(v, 40);
  if (!s) return '';
  const iso = cleanDate(s);
  if (iso) return iso;
  let t = ' ' + s.toLowerCase().replace(/[,.]/g, ' ').replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/g, ' ') + ' ';
  let time = '', neg = false, mo = 0;
  t = t.replace(/\b(\d{1,2}):(\d{2})\b/, (_, h, m) => { time = h.padStart(2, '0') + ':' + m; return ' '; });
  t = t.replace(/\b(bce|bc)\b/, () => { neg = true; return ' '; }).replace(/\b(ce|ad)\b/, ' ');
  t = t.replace(/\b([a-z]{3,9})\b/, (w) => {
    const i = MONTH_NAMES.findIndex((n) => n.startsWith(w) && w.length >= 3);
    if (i < 0) return w;
    mo = i + 1; return ' ';
  });
  if (/[a-z]/.test(t)) return '';
  const nums = t.trim().split(/\s+/).filter(Boolean).map(Number);
  if (!nums.length || nums.length > 2 || nums.some((n) => !Number.isInteger(n))) return '';
  let y = nums[nums.length - 1], d = 0;
  if (nums.length === 2) {
    if (!mo) return '';
    [d, y] = nums[0] > 31 ? [nums[1], nums[0]] : nums;
  }
  if (!mo && (d || time)) return '';
  let out = (neg ? '-' : '') + String(y).padStart(4, '0');
  if (mo) out += '-' + String(mo).padStart(2, '0') + (d ? '-' + String(d).padStart(2, '0') + (time ? 'T' + time : '') : '');
  return cleanDate(out);
}
// A date of the spec as people read it: "1969", "Jul 1969", "20 Jul 1969", "3 Apr 2027, 09:30", "44 BCE".
export function showDate(v) {
  const m = /^(-?)(\d+)(?:-(\d\d))?(?:-(\d\d))?(?:T(\d\d:\d\d))?$/.exec(typeof v === 'number' ? (v < 0 ? '-' + -v : String(v)) : v || '');
  if (!m) return '';
  const y = Number(m[2]) + (m[1] ? ' BCE' : '');
  if (!m[3]) return y;
  return (m[4] ? Number(m[4]) + ' ' : '') + MON[Number(m[3]) - 1] + ' ' + y + (m[5] ? ', ' + m[5] : '');
}
// A chapter's end as typed: a whole year (a number) or a full date (text), else null.
export function readBound(v) {
  const d = readDate(v);
  if (!d) return null;
  const parts = d.replace(/^-/, '').split('T')[0].split('-');
  return parts.length === 1 ? yearOfDate(d) : parts.length === 3 ? d.split('T')[0] : null;
}
// Which chapter each entry of a clean spec falls in (its index, or -1 for none), by when it starts.
export function chapterOf(spec) {
  if (spec.axis === 'scale') return spec.entries.map((e) => spec.chapters.findIndex((c) => e.value >= c.from && e.value <= c.to));
  return spec.entries.map((e) => spec.chapters.findIndex((c) => (typeof c.from === 'number'
    ? yearOfDate(e.start) >= c.from && yearOfDate(e.start) <= c.to
    : order(e.start) >= order(c.from) && order(e.start) < order(c.to) + 1 / 372)));
}
// Why a spec the editor was handed cannot be kept as it is, in words; '' when it can.
export function specProblem(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const es = Array.isArray(s.entries) ? s.entries : [], cs = Array.isArray(s.chapters) ? s.chapters : [];
  if (!es.length) return 'A timeline keeps at least one entry.';
  if (es.length > MAX_ENTRIES) return `A timeline holds at most ${MAX_ENTRIES} entries.`;
  const seen = new Set();
  for (const e of es) {
    const name = text(e?.name, 90);
    if (!name) return 'Every entry needs a name.';
    if (seen.has(name.toLowerCase())) return `Two entries are called “${name}”. Give one another name.`;
    seen.add(name.toLowerCase());
    if (s.axis === 'rank') continue;
    if (s.axis === 'scale') { if (num(e.value) == null) return `“${name}” needs a value, a number in ${text(s.unit, 16) || 'the unit of the list'}.`; continue; }
    const a = cleanDate(e.start), b = cleanDate(e.end);
    if (!a) return `“${name}” needs the date it starts, such as 1969, Jul 1969 or 20 Jul 1969.`;
    if (e.end && !b) return `When “${name}” ends is not a date the timeline can read.`;
    if (b && order(b) < order(a)) return `“${name}” ends before it starts.`;
  }
  if (cs.length > 12) return 'A timeline holds at most 12 chapters.';
  const ok = [];
  for (const c of cs) {
    const name = text(c?.name, 60), from = s.axis === 'scale' ? num(c?.from) : bound(c?.from), to = s.axis === 'scale' ? num(c?.to) : bound(c?.to);
    if (!name) return 'Every chapter needs a name.';
    if (from == null || to == null || typeof from !== typeof to) return `The chapter “${name}” starts and ends on a year (1969) or on a full date (20 Jul 1969), the same at both ends.`;
    if (at(to) < at(from)) return `The chapter “${name}” ends before it starts.`;
    ok.push({ name, from, to });
  }
  ok.sort((x, y) => at(x.from) - at(y.from));
  for (let i = 1; i < ok.length; i++) {
    const last = ok[i - 1], c = ok[i];
    if (typeof last.to === 'number' ? at(c.from) <= last.to : at(c.from) < at(last.to)) return `The chapters “${last.name}” and “${c.name}” overlap.`;
  }
  return '';
}
