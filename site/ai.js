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

   A ranked list ("the 100 most popular foods") has no dates: "axis": "rank",
   and each entry a "rank" from 1. It is drawn in rank order along the road,
   #1 first; its chapters run from one rank to another ("from": 1, "to": 10). */

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

// A spec made safe: every field the right type and length, nothing unknown kept.
export function cleanSpec(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const ranked = s.axis === 'rank';
  const seen = new Set(), entries = [];
  // A ranked list: each entry's place, by its rank (else its place in the list), numbered again 1, 2, 3...
  const list = (Array.isArray(s.entries) ? s.entries : []).map((e, i) => ({ e, r: Number(e?.rank) > 0 ? Number(e.rank) : i + 1, i }));
  if (ranked) list.sort((a, b) => a.r - b.r || a.i - b.i);
  for (const { e } of list) {
    if (!e || typeof e !== 'object' || entries.length >= MAX_ENTRIES) continue;
    const name = text(e.name, 90), start = ranked ? rankDate(entries.length + 1) : cleanDate(e.start);
    if (!name || !start || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    let end = ranked ? '' : cleanDate(e.end);
    if (end && order(end) < order(start)) end = '';
    // Pictures only from Wikimedia's own servers (upload. and, since 2026, thumb.wikimedia.org), without the tracking query.
    const img = e.image && typeof e.image === 'object' && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(e.image.src || '')
      ? { src: text(String(e.image.src).replace(/\?utm_[^#]*$/, ''), 400), source: /^https:\/\//.test(e.image.source || '') ? text(e.image.source, 400) : '' } : null;
    entries.push({
      ...(ranked ? { rank: entries.length + 1 } : {}),
      name, kind: text(e.kind, 40) || 'Entry', type: TYPES.includes(e.type) ? e.type : 'events', start, end,
      summary: text(e.summary, 400), wikipedia: text(e.wikipedia, 120), importance: Math.min(5, Math.max(1, Math.round(Number(e.importance)) || 3)),
      events: (Array.isArray(e.events) ? e.events : []).map((x) => ({ date: cleanDate(x?.date), label: text(x?.label, 80), note: text(x?.note, 200) })).filter((x) => x.date && x.label).slice(0, 6),
      ...(img ? { image: img } : {}),
    });
  }
  if (!ranked) entries.sort((a, b) => order(a.start) - order(b.start));
  // Chapters: whole years, in order, never overlapping.
  const chapters = [];
  for (const c of (Array.isArray(s.chapters) ? s.chapters : []).map((c) => ({ name: text(c?.name, 60), from: bound(c?.from), to: bound(c?.to), note: text(c?.note, 400) }))
    .filter((c) => c.name && c.from != null && c.to != null && typeof c.from === typeof c.to && at(c.to) >= at(c.from)).sort((a, b) => at(a.from) - at(b.from))) {
    const last = chapters[chapters.length - 1];
    if (last && (typeof last.to === 'number' ? at(c.from) <= last.to : at(c.from) < at(last.to))) continue;
    if (chapters.length < 12) chapters.push(c);
  }
  return { title: text(s.title, 80) || 'Untitled timeline', description: text(s.description, 300), ...(ranked ? { axis: 'rank' } : {}), chapters, entries };
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
      id, category: e.kind, domain: e.type, tier: 2, made: 'ai', ...(e.rank ? { pos: e.rank } : {}),
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
    view: { description: spec.description, checkpoints, picked: true, made: 'ai', ...(spec.axis ? { axis: spec.axis } : {}), span: years.length ? [Math.min(...years), null] : null },
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
  if (field('axis') === 'rank') out.axis = 'rank';
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
    const a = cleanDate(e.start), b = cleanDate(e.end);
    if (!a) return `“${name}” needs the date it starts, such as 1969, Jul 1969 or 20 Jul 1969.`;
    if (e.end && !b) return `When “${name}” ends is not a date the timeline can read.`;
    if (b && order(b) < order(a)) return `“${name}” ends before it starts.`;
  }
  if (cs.length > 12) return 'A timeline holds at most 12 chapters.';
  const ok = [];
  for (const c of cs) {
    const name = text(c?.name, 60), from = bound(c?.from), to = bound(c?.to);
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
