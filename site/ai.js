/* Create with AI: what a model writes (a "spec") turned into a view file the
   page can draw. Pure functions with tests (tests/ai.test.mjs); no DOM.

   A spec is small and plain, so any model can write it and a later request
   can change it:

   { title, description,
     chapters: [{ name, from, to, note }],            whole years
     entries:  [{ name, kind, type, start, end, summary, wikipedia,
                  importance, events: [{ date, label, note }], image }] }

   Dates are text: "1969", "1969-07", "1969-07-20"; before the common era a
   minus sign and four or more digits ("-0044-03-15"); deep time a negative
   year ("-66000000"). There is no year 0. */

// The models a reader may pick, by their OpenRouter id: open models, the cheapest and most used of
// OpenRouter's ranking (asked for, Nov 2026: "fastest and cheapest, open source, top and popular").
// The first ones are offered at once, the rest under "More models". The server keeps its own list of
// what it will run (supabase/functions/ai-timeline), so a model is added in both places.
export const MODELS = [
  { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', note: 'The fastest. Right for most things.' },
  { id: 'minimax/minimax-m3.1-flash', name: 'MiniMax M3.1 Flash', note: 'Fast, and finds the most pictures.' },
  { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', note: 'Careful with dates. A little slower.' },
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
export const MAX_ENTRIES = 80;

const text = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, max);
export const slug = (s) => text(s, 80).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'entry';

// A date as the page reads it, or '' when it is not one. Years are padded to four digits.
export function cleanDate(v) {
  const m = /^(-?)(\d{1,12})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(text(v, 24));
  if (!m) return '';
  const y = Number(m[2]), mo = m[3] ? Number(m[3]) : 0, d = m[4] ? Number(m[4]) : 0;
  if (!y || mo > 12 || d > 31) return '';
  let out = (m[1] || '') + String(y).padStart(4, '0');
  if (mo) { out += '-' + String(mo).padStart(2, '0'); if (d) out += '-' + String(d).padStart(2, '0'); }
  return out;
}
const precisionOf = (date) => (date.replace(/^-/, '').split('-').length === 3 ? 'day' : date.replace(/^-/, '').split('-').length === 2 ? 'month' : 'year');
// The whole year a date falls in, negative before the common era (never 0).
export const yearOfDate = (date) => { const neg = date[0] === '-'; const y = Number((neg ? date.slice(1) : date).split('-')[0]); return neg ? -y : y; };
const order = (date) => { const y = yearOfDate(date), p = date.replace(/^-/, '').split('-'); return y + (Number(p[1] || 1) - 1) / 12 + (Number(p[2] || 1) - 1) / 372; };

// A spec made safe: every field the right type and length, nothing unknown kept.
export function cleanSpec(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set(), entries = [];
  for (const e of Array.isArray(s.entries) ? s.entries : []) {
    if (!e || typeof e !== 'object' || entries.length >= MAX_ENTRIES) continue;
    const name = text(e.name, 90), start = cleanDate(e.start);
    if (!name || !start || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    let end = cleanDate(e.end);
    if (end && order(end) < order(start)) end = '';
    // Pictures only from Wikimedia's own servers (upload. and, since 2026, thumb.wikimedia.org), without the tracking query.
    const img = e.image && typeof e.image === 'object' && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(e.image.src || '')
      ? { src: text(String(e.image.src).replace(/\?utm_[^#]*$/, ''), 400), source: /^https:\/\//.test(e.image.source || '') ? text(e.image.source, 400) : '' } : null;
    entries.push({
      name, kind: text(e.kind, 40) || 'Entry', type: TYPES.includes(e.type) ? e.type : 'events', start, end,
      summary: text(e.summary, 400), wikipedia: text(e.wikipedia, 120), importance: Math.min(5, Math.max(1, Math.round(Number(e.importance)) || 3)),
      events: (Array.isArray(e.events) ? e.events : []).map((x) => ({ date: cleanDate(x?.date), label: text(x?.label, 80), note: text(x?.note, 200) })).filter((x) => x.date && x.label).slice(0, 6),
      ...(img ? { image: img } : {}),
    });
  }
  entries.sort((a, b) => order(a.start) - order(b.start));
  // Chapters: whole years, in order, never overlapping.
  const chapters = [];
  for (const c of (Array.isArray(s.chapters) ? s.chapters : []).map((c) => ({ name: text(c?.name, 60), from: Math.trunc(Number(c?.from)), to: Math.trunc(Number(c?.to)), note: text(c?.note, 400) }))
    .filter((c) => c.name && Number.isFinite(c.from) && Number.isFinite(c.to) && c.from && c.to && c.to >= c.from).sort((a, b) => a.from - b.from)) {
    const last = chapters[chapters.length - 1];
    if (last && c.from <= last.to) continue;
    if (chapters.length < 12) chapters.push(c);
  }
  return { title: text(s.title, 80) || 'Untitled timeline', description: text(s.description, 300), chapters, entries };
}

// The view file the page draws, from a spec. `seed` makes the entries' ids
// new each time, because the page keeps every entry it has seen by id.
export function specToView(raw, seed) {
  const spec = cleanSpec(raw);
  const used = new Set();
  const entries = spec.entries.map((e) => {
    let id = `x${seed}-${slug(e.name)}`;
    for (let n = 2; used.has(id); n++) id = `x${seed}-${slug(e.name)}-${n}`;
    used.add(id);
    const p = precisionOf(e.start);
    const wiki = e.wikipedia ? 'https://en.wikipedia.org/wiki/' + encodeURIComponent(e.wikipedia.replace(/ /g, '_')) : '';
    return {
      id, category: e.kind, domain: e.type, tier: 2, made: 'ai',
      names: [{ name: e.name, from: e.start }],
      summary: e.summary,
      events: [
        { type: 'born', date: e.start, precision: p },
        ...e.events.map((x) => ({ type: 'milestone', date: x.date, precision: precisionOf(x.date), label: x.label, note: x.note })),
        ...(e.end ? [{ type: 'ended', date: e.end, precision: precisionOf(e.end) }] : []),
      ],
      status: e.end ? 'dead' : 'alive',
      rank: 6 - e.importance, score: e.importance / 5,
      links: [], inbound: [],
      sources: wiki ? [{ title: 'Wikipedia: ' + e.wikipedia, url: wiki, kind: 'secondary' }] : [],
      verified: false,
      ...(e.image ? { image: { src: e.image.src, alt: e.name, credit: 'Wikimedia Commons', licence: 'See the source', source: e.image.source || wiki } } : {}),
    };
  });
  const ids = new Set();
  const checkpoints = spec.chapters.map((c) => {
    let id = slug(c.name);
    for (let n = 2; ids.has(id); n++) id = `${slug(c.name)}-${n}`;
    ids.add(id);
    return { id, name: c.name, from: c.from, to: c.to, note: c.note };
  });
  const years = spec.entries.map((e) => yearOfDate(e.start));
  return {
    view: { description: spec.description, checkpoints, picked: true, made: 'ai', span: years.length ? [Math.min(...years), null] : null },
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
export async function findPictures(entries, get) {
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
