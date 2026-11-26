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

// The models a reader may pick, by their OpenRouter id. The first ones are offered at once, the rest under
// "More models". The server keeps its own list of what it will run (supabase/functions/ai-timeline), so a
// model is added in both places; the plan is to offer everything OpenRouter has (asked for, Nov 2026).
export const MODELS = [
  { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', note: 'Fast. Right for most things.' },
  { id: 'anthropic/claude-haiku-5.5', name: 'Claude Haiku 5.5', note: 'Careful with dates and wording.' },
  { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', note: 'Quick and balanced.' },
  { id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', note: 'Deeper on hard subjects. Slower.', more: true },
  { id: 'openai/gpt-6.1-terra', name: 'GPT-6.1 Terra', note: 'Stronger reasoning. Slower.', more: true },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', note: 'The larger DeepSeek.', more: true },
];
// How long the model thinks before it writes (OpenRouter's "reasoning effort", which each model reads its own way).
export const EFFORTS = [
  { id: 'low', name: 'Quick' },
  { id: 'medium', name: 'Balanced' },
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
    const img = e.image && typeof e.image === 'object' && /^https:\/\/upload\.wikimedia\.org\//.test(e.image.src || '')
      ? { src: text(e.image.src, 400), source: /^https:\/\//.test(e.image.source || '') ? text(e.image.source, 400) : '' } : null;
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
