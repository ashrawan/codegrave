/* codegrave — one timeline of everything, from first to last, drawn in
   depth as a road that time runs along.
   Plain JavaScript modules, no framework. The page never loads the whole
   dataset: it starts from data/boot.json and fetches one small ready-made
   file per action (a view, a detail shard, the search index), all written
   by scripts/build.mjs. Ranking is worked out by the build; dates are read
   with rank.js, file keys come from keys.js. */
import { WEIGHTS, parseDate, yearOf as writtenYear } from './rank.js';
import { shardOf, fold, tokens, prefixOf } from './keys.js';
import { NEAR, GONE, FAR, sizeAt, focalYears, tracks, stageOf, zoneOf, labelRect, placeLabels, ruler, paceFor } from './road.js';

(() => {
  'use strict';

  const REPO = 'https://github.com/ashrawan/codegrave';
  const EDITORS = 'codegrave';      // the editors' folder: its views are not signed in the list
  const MAX_VIEWS = 8;
  const LEVELS = [
    { name: 'Landmarks', pct: 10 }, { name: 'Notable', pct: 30 },
    { name: 'Most', pct: 60 }, { name: 'All', pct: 100 },
  ];
  const MAX_ROWS = 160;         // the most lines drawn at once
  // How a link reads from the entry that carries it, and from the entry it points to.
  const LINK_LABELS = {
    succeeded_by: 'succeeded by', forked_from: 'forked from', merged_into: 'merged into',
    spun_off_from: 'spun off from', open_sourced_as: 'open-sourced as', contains: 'contains',
    standardised_as: 'standardised as', version_of: 'version of', influenced_by: 'influenced by',
    extends: 'extends', built_on: 'built on',
    in: 'in', part_of: 'part of', member_of: 'member of', made_by: 'made by',
    parent: 'child of', spouse: 'married to', about: 'about', related: 'related to',
  };
  const INBOUND_LABELS = {
    succeeded_by: 'succeeded', forked_from: 'forked into', merged_into: 'absorbed',
    spun_off_from: 'spun off', open_sourced_as: 'opened from', contains: 'part of',
    standardised_as: 'standard for', version_of: 'has version', influenced_by: 'influenced',
    extends: 'extended by', built_on: 'base of',
    in: 'includes', part_of: 'has part', member_of: 'has member', made_by: 'maker of',
    parent: 'parent of', spouse: 'married to', about: 'subject of', related: 'related to',
  };
  const EVENT_TITLES = { released: 'Release', changed_hands: 'Changed hands', milestone: 'Milestone', deprecated: 'End announced' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // The words for an entry whose branch is unknown, and for text about many kinds at once.
  const NEUTRAL = { born: 'Began', ended: 'Ended', alive: 'Still going', dead: 'Ended', from: 'begun in' };
  const PHONE = '(max-width: 699px)';    // on a phone the open panel is a sheet over the lower half

  const today = new Date();
  const NOW_YEAR = today.getFullYear();
  const NOW = NOW_YEAR + (today - new Date(NOW_YEAR, 0, 1)) / (365.25 * 864e5);

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: carry on */ } },
  };
  const ICON = {
    // Community views are written by someone (a pen nib); classical views are part of the map (a folded map).
    community: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21.5 6.5 12 12 3l5.5 9z"/><path d="M12 13.5v8"/><circle cx="12" cy="11.5" r="1.6"/></svg>',
    classical: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/></svg>',
    map: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/></svg>',
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    xs: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    dot: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12h18"/><circle cx="8" cy="12" r="3" fill="var(--surf)"/></svg>',
    save: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    out: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h10v10M19 5L6 18"/></svg>',
  };

  // Media is a file under data/media/, or an image hosted by Wikimedia Commons.
  const mediaUrl = (src) => /^https:\/\//.test(src) ? src : 'data/media/' + src;
  const tileIcon = (t) => t.icon ? `<i style="--icon:url('${esc(mediaUrl(t.icon.src))}')" role="img" aria-label="${esc(t.icon.alt)}"></i>` : esc(t.mono);
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };

  // ---------------------------------------------------------------- dates
  // A date is written "1969", "1969-07" or "1969-07-20"; a year before the
  // common era has a minus sign ("-0044-03-15"), and deep time is a long
  // negative year ("-66000000"). A written year has no zero: -1 is 1 BCE.
  // On the number line (parseDate) 1 BCE sits at 0 and 44 BCE at -43.
  const lineYear = (y) => (y < 0 ? y + 1 : y);                // where a written year starts on the line
  const writtenOf = (t) => { const y = Math.floor(t); return y <= 0 ? y - 1 : y; };   // the written year a moment falls in
  const group = (n) => n.toLocaleString('en');
  // Rounds to three significant figures and drops trailing zeros: 4.54, 66, 252, 13.8.
  const sig = (v) => Number(v.toPrecision(3));
  function dateParts(s) {
    const neg = s[0] === '-';
    const [y, m, d] = (neg ? s.slice(1) : s).split('-').map(Number);
    return { y: neg ? -y : y, m, d };
  }
  // A written year in words. From 10,000 BCE back it is rounded and said as an age.
  function yearText(y) {
    if (y > 0) return y < 1000 ? y + ' CE' : String(y);
    const a = -y;
    if (a < 10000) return a + ' BCE';
    if (a < 1e5) return group(sig(a)) + ' BCE';
    if (a < 1e6) return group(sig(a)) + ' years ago';
    if (a < 1e9) return sig(a / 1e6) + ' million years ago';
    return sig(a / 1e9) + ' billion years ago';
  }
  const deep = (y) => y <= -1e5;    // said as an age, so "circa" adds nothing
  function fmtDate(s, precision) {
    const { y, m, d } = dateParts(s);
    const Y = yearText(y);
    if (precision === 'circa') return deep(y) ? Y : 'c. ' + Y;
    if (!m || precision === 'year') return Y;
    if (!d || precision === 'month') return MONTHS[m - 1] + ' ' + Y;
    return d + ' ' + MONTHS[m - 1] + ' ' + Y;
  }
  // The short form used on the line itself: a month and year at most.
  const fmtShort = (s, precision) => fmtDate(s, precision === 'day' || precision == null ? 'month' : precision);
  const yearOfDate = (s) => yearText(writtenYear(s));
  // From one written year to another (null: to today), as briefly as reads well.
  function spanText(a, b) {
    if (b == null) return 'since ' + yearText(a);
    if (a === b) return yearText(a);
    const unit = (y) => (y > 0 ? 'ce' : -y < 1e4 ? 'bce' : -y < 1e5 ? 'kbce' : -y < 1e6 ? 'ago' : -y < 1e9 ? 'm' : 'b');
    const ua = unit(a), ub = unit(b);
    if (ua === 'ce' && ub === 'ce') return b < 1000 ? `${a}–${b} CE` : `${a}–${b}`;
    if (ua === ub && ua !== 'ce') {
      const words = yearText(b), num = (y) => yearText(y).split(' ')[0];
      if (num(a) === num(b)) return words;
      return num(a) + '–' + words;
    }
    if (ua === 'bce' && ub === 'ce') return `${-a} BCE–${b} CE`.replace(/(\d{4}) CE$/, '$1');
    const A = yearText(a), B = yearText(b);
    return (A.includes(' ') || B.includes(' ')) && ua !== 'bce' ? A + ' – ' + B : A + '–' + B;
  }
  const spanOf = (t) => spanText(writtenYear(t.bornEv.date), t.endEv ? writtenYear(t.endEv.date) : null);
  function fmtSpan(years) {
    if (years < 1) return 'under a year';
    const n = Math.round(years);
    if (n >= 1e9) return sig(n / 1e9) + ' billion years';
    if (n >= 1e6) return sig(n / 1e6) + ' million years';
    if (n >= 1e4) return group(sig(n)) + ' years';
    return group(n) + (n === 1 ? ' year' : ' years');
  }
  // A year on the axis: plain years, BCE, then thousands (ka), millions (Ma)
  // and billions (Ga) of years ago for deep time.
  // `step` (the years between ticks) sets how many decimals a deep-time label needs;
  // `ce` marks the common era when the axis also shows years before it.
  function axisText(y, step = 0, ce = false) {
    if (y > 0) return ce ? y + ' CE' : String(y);
    const a = -y;
    const unit = a < 1e5 ? 0 : a < 1e6 ? 1e3 : a < 1e9 ? 1e6 : 1e9;
    if (!unit) return (a < 1e4 ? a : group(a)) + ' BCE';
    const name = { 1e3: 'ka', 1e6: 'Ma', 1e9: 'Ga' }[unit];
    if (!step) return sig(a / unit) + ' ' + name;
    const r = step / unit;
    let d = 0;
    while (d < 3 && Math.abs(r * 10 ** d - Math.round(r * 10 ** d)) > 1e-9) d++;
    return Number((a / unit).toFixed(d)) + ' ' + name;
  }
  const AXIS_UNITS = { ka: 'thousand', Ma: 'million', Ga: 'billion' };
  // A year typed by the reader: "1969", "44 BCE", "-44", "500 bc", "66 ma", "4.6 billion years ago".
  function parseYearQuery(q) {
    let m = /^(-?\d{1,4})$/.exec(q);
    if (m) { const y = Number(m[1]); return y === 0 || (y > 0 && m[1].length < 3) ? null : y; }
    if ((m = /^-(\d{5,11})$/.exec(q))) return -Number(m[1]);
    if ((m = /^(\d[\d,]*)\s*(bce|bc|b\.c\.|b\.c\.e\.)$/.exec(q))) { const y = Number(m[1].replace(/,/g, '')); return y ? -y : null; }
    if ((m = /^(\d{1,4})\s*(ce|ad|a\.d\.|c\.e\.)$/.exec(q))) return Number(m[1]) || null;
    if ((m = /^(\d+(?:\.\d+)?)\s*(ka|kya|thousand years ago|ma|mya|million years ago|ga|bya|billion years ago)$/.exec(q))) {
      const mult = /^(k|t)/.test(m[2]) ? 1e3 : /^(m)/.test(m[2]) ? 1e6 : 1e9;
      return -Math.round(Number(m[1]) * mult);
    }
    if ((m = /^(\d[\d,]{3,})\s*years ago$/.exec(q))) return -Number(m[1].replace(/,/g, ''));
    return null;
  }
  // A step from the 1, 2, 2.5, 5 series that is at least `v`.
  function niceStep(v) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1e-9))));
    for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return Math.max(1, k * p);
    return Math.max(1, 10 * p);
  }

  // ---------------------------------------------------------------- data
  // boot.json is always loaded. Everything else arrives one file at a time,
  // and every entry loaded so far is one object in byId.
  let boot = null, cats = [], catById = new Map(), domById = new Map(), labelName = new Map(), ownerTitle = new Map();
  const byId = new Map();
  // What is known about each view: its meta from boot.json or the search index
  // until its file is loaded, then the view itself with its `members`.
  const viewById = new Map();
  const alias = new Map();        // an old address -> the id inside its file
  const pending = new Set();      // views being fetched
  const broken = new Set();       // views whose file could not be read
  const files = new Map();        // path -> promise of its JSON, so each file is asked for once
  let bootReady = null;

  function getJSON(path) {
    if (!files.has(path)) {
      const p = fetch('data/' + path).then((r) => { if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); });
      files.set(path, p);
      p.catch(() => files.delete(path));   // a failed file may be tried again later
    }
    return files.get(path);
  }

  function initials(name) {
    const caps = name.match(/[A-Z0-9#+]/g) || [];
    const words = name.split(/[\s./-]+/).filter(Boolean);
    if (words.length > 1) return (words[0][0] + words[1][0]).slice(0, 2);
    if (caps.length > 1 && /^[A-Za-z]/.test(name)) return caps.slice(0, 2).join('');
    return name.slice(0, 2);
  }

  function useBoot(b) {
    boot = b;
    cats = b.categories || [];
    cats.forEach((c, i) => { c.i = i; });
    catById = new Map(cats.map((c) => [c.id, c]));
    domById = new Map((b.domains || []).map((d) => [d.id, d]));
    for (const c of cats) c.domainName = domById.get(c.domain)?.name;
    for (const list of Object.values(b.labels || {})) for (const l of list) labelName.set(l.id, l.name);
    for (const o of b.owners || []) ownerTitle.set(o.id, o.title);
    for (const v of b.views || []) know(v);
    sayScope();
  }
  // What the page holds, said with the real counts: in the top search and above the list of views.
  function sayScope() {
    if (!boot) return;
    const n = group(boot.counts?.entries || 0), views = (boot.views || []).length;
    $('q').placeholder = matchMedia(PHONE).matches ? `Search ${n} entries` : `Search ${n} entries: a person, a place, an event or a year`;
    $('vscope').textContent = `${group(views)} ${views === 1 ? 'view' : 'views'} · ${n} entries`;
  }
  // The branches above a domain, nearest first: software, computing, technology.
  function lineage(id) {
    const out = [];
    for (let d = domById.get(id); d && !out.includes(d); d = domById.get(d.parent)) out.push(d);
    return out;
  }
  // Records what is known of a view without dropping what is already there.
  function know(meta) {
    const was = viewById.get(meta.id);
    if (was && was.members) return was;
    const v = { ...(was || {}), ...meta };
    v.hay = fold([v.name, v.description, v.author, ...(v.tags || [])].join(' '));
    viewById.set(v.id, v);
    return v;
  }

  // Makes a loaded entry ready to draw. An entry already loaded is kept as it is.
  function ingest(e) {
    if (byId.has(e.id)) return byId.get(e.id);
    const t = e;
    t.cat = catById.get(t.category) || { id: t.category, name: t.category, domain: null, i: 1e4 };
    t.dom = domById.get(t.cat.domain) || null;
    t.words = (t.dom && t.dom.words) || NEUTRAL;
    const ev = (type) => t.events.find((x) => x.type === type);
    t.bornEv = ev('born');
    t.endEv = ev('ended') || null;
    t.afterEv = ev('afterlife') || null;
    t.startEv = ev('project_start') || null;
    t.depEv = ev('deprecated') || null;
    t.born = parseDate(t.bornEv.date);
    t.end = t.endEv ? Math.max(parseDate(t.endEv.date), t.born) : null;
    t.dep = t.depEv ? clamp(parseDate(t.depEv.date), t.born, t.end ?? NOW) : null;
    t.after = t.afterEv ? Math.min(NOW, t.afterEv.until ? parseDate(t.afterEv.until) : NOW) : null;
    t.lead = t.startEv ? Math.min(parseDate(t.startEv.date), t.born) : null;
    t.renames = t.names.slice(1).map((n, i) => ({ t: Math.max(parseDate(n.from), t.born), name: n.name, from: n.from, prev: t.names[i].name }));
    t.name = t.names[t.names.length - 1].name;
    t.search = [...t.names.map((n) => fold(n.name)), ...(t.aliases || []).map(fold)];
    t.mono = initials(t.name);
    t.links = t.links || [];
    t.inbound = t.inbound || [];
    // Dated points drawn on the line, beside the birth and the end.
    t.marks = [
      ...t.renames.map((r) => ({ t: r.t, kind: 'ren', label: r.name, date: fmtShort(r.from), note: 'Renamed from ' + r.prev })),
      ...t.events.filter((x) => EVENT_TITLES[x.type] && x.date).map((x) => ({
        t: clamp(parseDate(x.date), t.lead ?? t.born, t.end ?? NOW), kind: 'tick', label: x.label || '', date: fmtShort(x.date, x.precision), note: x.note || '' })),
    ].sort((a, b) => a.t - b.t);
    byId.set(t.id, t);
    return t;
  }

  // A view file, ready to draw: its meta and checkpoints, and its best entries.
  function useView(payload, asked) {
    const meta = payload.view;
    const v = know(meta);
    if (!v.members) {
      Object.assign(v, meta);
      v.members = payload.entries.map(ingest).sort((a, b) => (a.rank - b.rank) || (b.score - a.score));
      v.memberIds = new Set(v.members.map((t) => t.id));
      v.cats = new Set(v.categories || []);
      v.doms = new Set(v.domains || []);
    }
    if (asked && asked !== v.id) alias.set(asked, v.id);
    return v;
  }
  // Fetches one view (once) and resolves to its real id, or null when it cannot be read.
  function loadView(id) {
    const real = alias.get(id) || id;
    const v = viewById.get(real);
    if (v && v.members) return Promise.resolve(real);
    return Promise.all([getJSON('v/' + real + '.json'), bootReady])
      .then(([payload]) => { broken.delete(real); return useView(payload, id).id; })
      .catch(() => { broken.add(real); return null; });
  }
  // One entry by id, from its detail file: one request, whatever the size of the data.
  function loadEntry(id) {
    if (byId.has(id)) return Promise.resolve(byId.get(id));
    if (!boot || !/^[a-z0-9][a-z0-9-]*$/.test(id)) return Promise.resolve(null);
    return getJSON('d/' + shardOf(id, boot.detail.chars) + '.json')
      .then((shard) => (shard[id] ? ingest(shard[id]) : null))
      .catch(() => null);
  }

  // The search index: one file today; a file per first two letters once it is
  // too big for one. Both kinds have the same shape and are read here only.
  const index = new Map();       // key -> { entries, views }, folded for matching
  function indexKey(q) {
    if (!boot || boot.search.mode !== 'prefix') return 'all';
    const w = tokens(q)[0];
    return w ? prefixOf(w) : null;
  }
  function indexFor(q, then) {
    const key = indexKey(q);
    if (key == null) return { entries: [], views: [] };
    if (index.has(key)) return index.get(key);
    getJSON('s/' + key + '.json').then((data) => {
      const entries = (data.entries || []).map((l) => {
        const other = l[8] ? l[8].split('|') : [];
        return { id: l[0], name: l[1], kind: l[2], born: l[3], end: l[4], rank: l[5], pop: l[6], tier: l[7], f: tokens(l[1]).join(' '), o: other.map((o) => tokens(o).join(' ')) };
      });
      const views = (data.views || []).map((l) => ({ id: l[0], name: l[1], type: l[2] === 1 ? 'classical' : 'community', count: l[3], text: l[4] || '', f: fold(l[1]), hay: fold(l[1] + ' ' + (l[4] || '')) }));
      for (const v of views) if (!viewById.has(v.id)) know({ id: v.id, name: v.name, type: v.type, count: v.count, description: stubText(v), stub: true });
      index.set(key, { entries, views });
      if (then) then();
    }, () => {});
    return null;
  }
  // What to say about a view known only from its line in the search index,
  // whose text runs its description and its tags together.
  function stubText(v) {
    const dom = domById.get(v.id), kind = cats.find((c) => c.view === v.id);
    if (dom && dom.description) return dom.description;
    if (kind) return kind.examples ? `${kind.name}, such as ${kind.examples}.` : kind.name;
    return v.text.replace(/\s+(all|domain|kind)$/, '');
  }
  // How well a name matches: exact, starts with it, a word starts with it, another name, anywhere.
  // A match in the name always outranks a match in the other names.
  function matchScore(e, q) {
    if (!q) return 0;
    if (e.f === q) return 6;
    if (e.f.startsWith(q)) return 5;
    if ((' ' + e.f).includes(' ' + q)) return 4;
    if (e.f.includes(q)) return 3;
    if (e.o.some((o) => o === q || o.startsWith(q) || (' ' + o).includes(' ' + q))) return 2;
    if (e.o.some((o) => o.includes(q))) return 1;
    return 0;
  }
  // Entries in the index that began or ended in a written year (near it, in deep time).
  function entriesInYear(data, y, skip, n) {
    const tol = y <= -1e5 ? Math.abs(y) * 0.02 : 0;
    const near = (v) => v != null && Math.abs(v - y) <= tol;
    const out = [];
    for (const e of data.entries) {
      if (skip && skip.has(e.id)) continue;
      if (near(e.born)) out.push({ e, how: 'born' });
      else if (near(e.end)) out.push({ e, how: 'ended' });
    }
    out.sort((a, b) => (a.e.tier - b.e.tier) || (a.e.rank - b.e.rank) || (b.e.pop - a.e.pop));
    return out.slice(0, n);
  }
  // "began 44 BCE", in the words of the entry's branch: "born", "founded", "died".
  function yearWord(e, how, y) {
    const c = cats[e.kind], w = (c && domById.get(c.domain)?.words) || NEUTRAL;
    return `${(how === 'born' ? w.born : w.ended).toLowerCase()} ${yearText(y)}`;
  }
  function searchEntries(data, q, skip, n) {
    const out = [];
    for (const e of data.entries) {
      if (skip && skip.has(e.id)) continue;
      const s = matchScore(e, q);
      if (s) out.push({ e, s });
    }
    out.sort((a, b) => (b.s - a.s) || (a.e.tier - b.e.tier) || (a.e.rank - b.e.rank) || (b.e.pop - a.e.pop));
    return out.slice(0, n).map((x) => x.e);
  }
  const lineSpan = (e) => spanText(e.born, e.end);

  // A hand-picked view shows what it lists. Any other view shows its best
  // entries at a level. A view is never empty: its best few always show.
  const KEEP = 3;
  function membersOf(v, level) {
    if (!v || !v.members) return new Set();
    if (v.picked) return new Set(v.members);
    return new Set(v.members.filter((t, i) => i < KEEP || t.rank < level));
  }
  // Whether a view would hold an entry, judged from the view's own rules.
  function holds(v, t) {
    if (!v || !v.members) return false;
    if (v.memberIds.has(t.id) || v.id === t.home) return true;
    if (v.picked) return false;
    if (v.cats.size && v.cats.has(t.category)) return true;
    if (v.doms.size && lineage(t.cat.domain).some((d) => v.doms.has(d.id))) return true;
    return !v.cats.size && !v.doms.size;
  }

  let measureCtx = null;      // a canvas to measure writing with

  // The named eras (chapters). Each belongs to a view and is drawn across its lane, in its colour.
  // Era years are whole written years; `a` and `b` are where they start and end on the line.
  function viewEras(v) {
    return (v.checkpoints || []).map((c) => ({ ...c, view: v, key: v.id + '/' + c.id, a: lineYear(c.from), b: lineYear(c.to) + 1, years: spanText(c.from, c.to) }))
      .sort((x, y) => x.a - y.a);
  }
  function erasNow() { return state.views.flatMap((id) => viewEras(viewById.get(id))); }
  // The words shared by everything on the timeline, or neutral ones when it mixes branches.
  function wordsNow() {
    const doms = new Set();
    for (const id of state.views) {
      const v = viewById.get(id);
      if (!v || !v.members) continue;
      for (const t of v.members) doms.add(t.words);
      if (doms.size > 1) return NEUTRAL;
    }
    return doms.size === 1 ? [...doms][0] : NEUTRAL;
  }

  // ---------------------------------------------------------------- state
  const state = {
    views: [],                // ids of the views on the timeline, in the order they were added
    colors: new Map(),        // view id -> palette index
    level: 100, order: 'old',  // everything that fits; 'old': the reader faces the future, 'new': the past
    pinned: new Set(), open: null, pane: 'views', era: null, trail: [],
    span: null,               // [from, to] written years when the reader narrows the timeline
    topic: '',                // the chip the list of views is narrowed to, '' for all
  };
  let L = null;               // the current layout

  // Puts a loaded view on the timeline.
  function addView(id) {
    const v = viewById.get(id);
    if (!v || !v.members || state.views.includes(id) || state.views.length >= MAX_VIEWS) return false;
    const used = new Set(state.colors.values());
    let n = 0; while (used.has(n)) n++;
    state.views.push(id); state.colors.set(id, n);
    return true;
  }
  // Shows one view alone, which is what picking a view does: fetches it if needed, takes the
  // others off, and the road opens at its beginning. The last one asked for wins.
  let wanted = null;
  function showOnly(id, done) {
    const real = alias.get(id) || id;
    wanted = real;
    if (state.views.length === 1 && state.views[0] === real) { if (done) done(real); return Promise.resolve(real); }
    pending.add(real); broken.delete(real);
    drawResults();
    return loadView(real).then((got) => {
      pending.delete(real);
      if (wanted !== real) { drawResults(); return null; }
      if (!got || !viewById.get(got)?.members) { note(`“${viewById.get(real)?.name || real}” could not be loaded. Try again in a moment.`); return null; }
      if (play.on) pausePlay();
      state.span = null; state.pinned.clear();
      setViews([got]);
      road.t = road.target = null; road.vel = 0;      // render() then opens the road where this view begins
      drawReverse();
      if (done) done(got); else changed();
      return got;
    });
  }
  // Fetches a view if needed, then puts it on the timeline beside the others: the secondary
  // action (the plus on a row, a right click). The list shows it loading meanwhile.
  function turnOn(id, done) {
    const real = alias.get(id) || id;
    if (state.views.includes(real) || pending.has(real)) return Promise.resolve(real);
    if (state.views.length + pending.size >= MAX_VIEWS) return Promise.resolve(null);
    pending.add(real); broken.delete(real);
    if (L || !state.views.length) drawResults();
    return loadView(real).then((got) => {
      pending.delete(real);
      if (got && addView(got)) { if (done) done(got); else { changed(); roadToView(got); } spansNote(); }
      else { if (!got) note(`“${viewById.get(real)?.name || real}” could not be loaded. Try again in a moment.`); drawResults(); }
      return got;
    });
  }
  function removeView(id) {
    state.views = state.views.filter((v) => v !== id);
    state.colors.delete(id);
  }
  function setViews(ids) {
    state.views = []; state.colors.clear();
    for (const id of ids) addView(alias.get(id) || id);
    if (state.views.length === 1) {
      const v = viewById.get(state.views[0]);
      state.level = v.level || 100;
      if (v.order) state.order = v.order;
    }
    return state.views.length > 0;
  }

  // The ids a link names. They may hold "/" (community views are <owner>/<id>).
  function urlViews() {
    const q = new URLSearchParams(location.search);
    return (q.get('views') || q.get('view') || '').split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9][a-z0-9/_-]*$/i.test(s) && !s.includes('..'));
  }
  // Year range in a link: "1995-2001", "-500-1500" (500 BCE to 1500), "-66000000--1000".
  function readSpan(s) {
    const m = /^(-?\d+)-(-?\d+)$/.exec(s || '');
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2]);
    return a && b && a < b ? [a, b] : null;
  }
  function readUrl(ids) {
    const q = new URLSearchParams(location.search);
    if (!ids.length || !setViews(ids)) return false;
    if (q.has('lv')) state.level = clamp(Number(q.get('lv')) || 100, 5, 100);
    state.span = readSpan(q.get('yr'));
    if (q.get('o') === 'old') state.order = 'old'; else if (q.get('o') === 'new') state.order = 'new';
    const cs = (q.get('c') || '').split(',').map(Number);
    if (cs.length === state.views.length && cs.every((n) => n >= 0 && n < 8) && new Set(cs).size === cs.length) state.views.forEach((id, i) => state.colors.set(id, cs[i]));
    return true;
  }
  function writeUrl() {
    const q = new URLSearchParams();
    q.set('views', state.views.join(','));
    if (state.level !== 100) q.set('lv', state.level);
    if (state.order === 'new') q.set('o', 'new');
    if (state.span) q.set('yr', state.span.join('-'));
    if (state.views.some((id, i) => state.colors.get(id) !== i)) q.set('c', state.views.map((id) => state.colors.get(id)).join(','));
    history.replaceState(null, '', '?' + q.toString().replace(/%2C/g, ',').replace(/%2F/g, '/') + location.hash);
  }

  // ---------------------------------------------------------------- what is drawn
  // The views on the timeline, their entries and the years they cover. An
  // entry that is in two views is drawn in both, so every view shows all of
  // its own entries.
  function chosen() {
    const groupsOf = new Map();   // entry -> the views on the timeline that hold it
    const selected = state.views.map((id) => viewById.get(id));
    const join = (t, v) => { const gs = groupsOf.get(t); if (!gs) groupsOf.set(t, [v]); else if (!gs.includes(v)) gs.push(v); };
    for (const v of selected) for (const t of membersOf(v, state.level)) join(t, v);
    for (const id of state.pinned) {
      const t = byId.get(id);
      if (t && !groupsOf.has(t)) join(t, selected.find((v) => v.id === t.home) || selected.find((v) => holds(v, t)) || selected[selected.length - 1]);
    }
    // Lines are capped so the page stays fast at any data size: the best ranked come first.
    // The cap counts lines, so an entry drawn in two views counts twice.
    const ranked = [...groupsOf.keys()].sort((a, b) => (state.pinned.has(b.id) - state.pinned.has(a.id)) || (a.rank - b.rank) || (b.score - a.score));
    const rowsOf = new Map(selected.map((v) => [v, new Set()]));
    let rowCount = 0;
    const all = [];
    for (const t of ranked) {
      if (rowCount >= MAX_ROWS) break;
      const gs = groupsOf.get(t).slice(0, MAX_ROWS - rowCount);
      for (const v of gs) rowsOf.get(v).add(t);
      rowCount += gs.length; all.push(t);
    }

    // The years: fitted to what is shown, from a little before the first start
    // to today, or to a little after the last end when everything shown has
    // ended long ago. The reader can narrow it with the year range in the panel.
    const starts = all.map((t) => t.lead ?? t.born).sort((a, b) => a - b);
    const earliest = all.length ? starts[0] : NOW - 30;
    const last = all.length ? Math.max(...all.map((t) => Math.max(t.end ?? NOW, t.after ?? -Infinity))) : NOW;
    // Rounded out to a step that suits the span, with a little room at each end.
    const around = (from, to) => {
      const room = Math.max(10, to - from), pad0 = Math.max(1, room * 0.03), unit = niceStep(room / 40);
      const b = to >= NOW - 0.5 ? NOW : Math.min(NOW, Math.ceil((to + pad0) / unit) * unit);
      return [Math.floor(Math.min(from - pad0, b - 10) / unit) * unit, b];
    };
    const [fitMin, fitMax] = around(earliest, last);
    // When a few entries start ages before all the rest (the Earth among
    // programming languages), the timeline opens on the rest and those few
    // run in from the left edge. The year range still reaches back to them.
    let autoMin = fitMin;
    if (starts.length >= 8) {
      const lo = starts[Math.floor(starts.length * 0.1)];
      if (last - lo < (last - earliest) * 0.02) autoMin = Math.max(fitMin, around(lo, last)[0]);
    }
    let tMin = autoMin, tMax = fitMax;
    if (state.span) {
      const minGap = Math.max(2, (fitMax - fitMin) / 500);
      tMin = clamp(lineYear(state.span[0]), fitMin, fitMax - minGap);
      tMax = clamp(lineYear(state.span[1]) + 1, tMin + minGap, fitMax);
      if (tMax >= NOW_YEAR) tMax = Math.min(tMax, NOW);
    }
    const inSpan = (t) => (t.lead ?? t.born) < tMax && (t.end ?? NOW) >= tMin;
    return { selected, groupsOf, rowsOf, all, fitMin, fitMax, autoMin, tMin, tMax, inSpan };
  }
  // The years along the bar: a step that suits the span, labels that never
  // touch, BCE marked, and deep time in thousands, millions or billions of years.
  // `ppy` is pixels per year; `gap` is the room a label needs along the bar.
  function axisTicks(ppy, gap) {
    const { tMin, tMax } = L;
    const atNow = tMax >= NOW - 0.01;
    const yMin = writtenOf(tMin), yMax = writtenOf(tMax - 1e-9);
    const width = (s) => s.length * 7 + 18;
    const widest = Math.max(width(axisText(yMin)), width(axisText(yMax, 0, yMin < 0)), width(axisText(Math.round((yMin + yMax) / 2))), 44);
    // Steps grow 1, 2, 5, 10, 25, 50, 100, 250, 500, 1,000 … until labels have room.
    let step = niceStep(gap / ppy);
    if (!Number.isInteger(step)) step = Math.ceil(step / 5) * 5;
    // A minor tick between labels, where there is room for it.
    const minor = [5, 4, 2].map((d) => step / d).find((s) => Number.isInteger(s) && s * ppy >= 7) || 0;
    const ticks = [], marks = [];
    const ce = yMin < 0 && yMax > 0;    // both eras on the axis: say which is which
    const first = Math.ceil(yMin / step) * step;
    const used = new Set();
    for (let y = first; y <= yMax; y += step) {
      if (y === 0) continue;   // there is no year zero
      ticks.push(y);
      const m = /\s(ka|Ma|Ga)$/.exec(axisText(y, step));
      if (m) used.add(m[1]);
    }
    if (minor) for (let y = Math.ceil(yMin / minor) * minor; y <= yMax; y += minor) if (y !== 0 && y % step !== 0) marks.push(y);
    return { ticks, marks, atNow, widest, units: [...used], step, ce };
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (!state.views.length) return renderEmpty();
    roadLayout();
    if (road.t == null) road.t = road.prev = roadOpening();
    road.t = camClamp(road.t);
    if (road.target != null) road.target = camClamp(road.target);
    road.pal = null; road.said = null;
    const G = L.G;
    $('road').classList.toggle('short', G.short);
    $('road').style.setProperty('--fw', G.FW + 'px');
    $('road').style.setProperty('--nw', G.NW + 'px');
    // The views, named under the year in the order of their lanes, each with the chapter the reader is in.
    // A phone names only the chapters there (the strip under the road names the views), and only for one or two lanes.
    $('road-views').innerHTML = G.short || (G.phone && L.lanes.length > 2) ? '' : L.lanes.map((ln, i) =>
      `<div class="rv" style="--c:var(--p${ln.col})"><b>${esc(ln.view.name)}</b><button type="button" class="rch" data-lane="${i}" hidden></button></div>`).join('');
    for (const ln of L.lanes) ln.cur = undefined;
    barTicks();
    renderSide();
    $('status').hidden = true;
    drawPlay();
    roadKick();
  }

  function renderEmpty() {
    L = null;
    roadClear();
    $('ticks').innerHTML = '';
    $('status').hidden = false;
    $('status').textContent = pending.size ? 'Loading the timeline…' : 'Pick a view to draw its timeline.';
    renderSide();
    if (!pending.size) showSide(true);
  }

  // ---------------------------------------------------------------- the road
  // The timeline in depth. Time runs into the screen on a straight scale and
  // each view is a lane. The reader stands at road.t and faces the future, or
  // the past when reversed; play, the wheel, a drag, the arrow keys and the
  // bar on the right all move road.t. Lines lie on the ground, on one canvas.
  // Names stand on them: road.js chooses afresh every frame which are shown
  // and how big, and each fades in and out as its own element, so nothing
  // jumps. The card at the front is drawn as selected (road.focus): its line
  // and the dated points of its history light up as it arrives.
  const road = {
    t: null, target: null, rate: 6,           // where the reader stands, where a glide is heading, and how briskly
    raf: 0, live: false, last: 0, prev: null, pace: 1, vel: 0, cards: 0, within1: 0, within3: 0,    // vel: how fast play is carrying the reader, in focal lengths a second
    hover: null, focus: null,                  // entry ids: under the pointer, and at the front
    nodes: new Map(), vis: new Map(), heat: new Map(),    // the elements of the names shown; which names were shown last frame, and how; how lit each line is
    soft: new Map(), side: new Map(),                     // how far each piece of writing on the ground has faded in; which side of its line an event is written on
    drag: null, swallow: 0, until: 0, jump: null, year: null, pal: null, said: null,
  };
  const PLAY_PACE = 0.26;                      // focal lengths a second at full speed
  const SLIDE = 110;                           // how far to its side a card of a side lane comes in from, in pixels at full size
  const BAR_PAD = 10;                          // room at each end of the bar on the right
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const camDir = () => (state.order === 'new' ? -1 : 1);
  // The reader stops a little short of the end they face, so the last stretch of road stays in front of them.
  function camLimits() {
    const m = 0.5 * L.D;
    return camDir() > 0 ? [L.tMin, Math.max(L.tMin, L.tMax - m)] : [Math.min(L.tMax, L.tMin + m), L.tMax];
  }
  const camClamp = (t) => { const [lo, hi] = camLimits(); return clamp(t, lo, hi); };
  const camAtEnd = () => { const [lo, hi] = camLimits(); return camDir() > 0 ? road.t >= hi - L.D * 0.01 : road.t <= lo + L.D * 0.01; };

  function roadLayout() {
    const { selected, groupsOf, rowsOf, all, fitMin, fitMax, autoMin, tMin, tMax, inSpan } = chosen();
    const box = $('road'), G = stageOf(box.clientWidth, box.clientHeight);
    const lanes = [];
    for (const v of selected) {
      const mine = all.filter((t) => rowsOf.get(v).has(t) && inSpan(t));
      if (mine.length) lanes.push({ view: v, mine });
    }
    const D = focalYears(lanes.flatMap((l) => l.mine.map((t) => t.born)), tMin, tMax);
    const laneW = lanes.length ? (2 * G.RW) / lanes.length : 0, pad = Math.min(G.phone ? 14 : 24, laneW * 0.15);
    const shown = [], groups = [];
    lanes.forEach((ln, k) => {
      ln.x0 = -G.RW + laneW * k; ln.x1 = ln.x0 + laneW; ln.col = state.colors.get(ln.view.id) % 8;
      // Which side of the road it is on: -1 the left lane, 0 the middle (or the only one), 1 the right lane.
      ln.lean = lanes.length > 1 ? clamp((ln.x0 + ln.x1) / G.RW, -1, 1) : 0;
      ln.eras = viewEras(ln.view).filter((c) => c.b > tMin && c.a < tMax);
      const where = tracks(ln.mine.map((t) => ({ id: t.id, a: t.born, b: t.end })), D * 0.2);
      for (const t of ln.mine) {
        shown.push({ t, group: ln.view, lane: ln, key: k + ':' + t.id, xn: ln.x0 + pad + where.get(t.id) * (laneW - 2 * pad),
          alive: t.end == null, a: t.born, b: t.end ?? NOW });
      }
      groups.push({ view: ln.view, n: ln.mine.length, total: ln.mine.length, eras: ln.eras.map((c) => ({ c })) });
    });
    L = { tMin, tMax, fitMin, fitMax, autoMin, shown, groups, total: groupsOf.size, D, G, lanes,
      at: new Map([...shown].reverse().map((p) => [p.t.id, p])), byKey: new Map(shown.map((p) => [p.key, p])), barH: $('axis').clientHeight };
    return L;
  }

  function roadClear() {
    cancelAnimationFrame(road.raf); road.raf = 0; road.live = false; road.vel = 0;
    for (const n of road.nodes.values()) n.el.remove();
    road.nodes.clear(); road.vis = new Map(); road.heat.clear(); road.soft.clear(); road.side.clear();
    road.hover = road.focus = road.jump = road.year = null;
    $('road-views').innerHTML = ''; $('road-year').textContent = '';
    const cv = $('road-cv');
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  }
  // Where a view begins on the road: its first start, or its first chapter when that opens a little
  // before it. A chapter that opens long before anything happens does not make the road open on empty years.
  function laneStart(ln) {
    const first = Math.min(...ln.mine.map((t) => t.born)), chapter = Math.min(first, ...ln.eras.map((c) => c.a));
    return Math.max(L.tMin, chapter, first - 0.6 * L.D);
  }
  // The stretch where the most lines start, the earliest such, so a long road never opens on empty years.
  function roadBusiest() {
    const ts = L.shown.map((p) => clamp(p.a, L.tMin, L.tMax)).sort((a, b) => a - b), win = 3 * L.D;
    let best = 0, at = ts[0] ?? L.tMin;
    for (let i = 0, j = 0; i < ts.length; i++) {
      while (ts[j] < ts[i] - win) j++;
      if (i - j + 1 > best) { best = i - j + 1; at = ts[j]; }
    }
    return at;
  }
  // A story opens at its beginning (at today, looking back, when reversed); a classical view on its busiest stretch.
  function roadOpening() {
    const first = viewById.get(state.views[0]), ln = L.lanes[0];
    if (!ln) return L.tMin;
    if (first && first.type === 'classical') return camClamp((first.year ? lineYear(first.year) : roadBusiest()) - camDir() * 0.2 * L.D);
    return camDir() > 0 ? camClamp(laneStart(ln) - 0.25 * L.D) : camLimits()[1];
  }
  // Takes the reader to a moment: it ends up a little in front of them.
  function roadTo(time, smooth = true) {
    if (!L) return;
    const to = camClamp(time - camDir() * 0.2 * L.D);
    if (play.on) pausePlay();
    road.vel = 0;
    if (smooth && !calm()) { road.target = to; road.rate = 6; } else { road.t = road.prev = to; road.target = null; }
    roadKick();
  }
  // Moves the reader by a number of focal lengths, gliding.
  function roadBy(n, rate = 14) {
    if (!L) return;
    if (play.on) pausePlay();
    road.vel = 0;
    road.target = camClamp((road.target ?? road.t) + camDir() * n * L.D); road.rate = rate;
    if (calm()) { road.t = road.prev = road.target; road.target = null; }
    roadKick();
  }

  // Brings a view into sight: where it begins.
  function roadToView(id, smooth = true) {
    const ln = L && L.lanes.find((x) => x.view.id === id);
    if (!ln) return;
    // A view added while travelling stays where the reader is, if something of it is in sight.
    const D = L.D, dir = camDir(), ahead = (t) => dir * (t - road.t);
    if (smooth && ln.mine.some((t) => ahead(t.born) > -0.1 * D && ahead(t.born) < 3 * D)) return;
    roadTo(dir > 0 ? laneStart(ln) - 0.05 * D : L.tMax, smooth);
  }
  // Brings an entry into sight: where its line starts.
  function roadToThing(id, smooth = true) {
    const p = L && L.at.get(id);
    if (p) roadTo(clamp(p.a, L.tMin, L.tMax), smooth);
  }
  // Takes the reader to a moment on one line and marks the spot for a moment.
  function jumpTo(id, at) {
    const p = L && L.at.get(id);
    if (!p) return;
    const time = clamp(at, Math.max(p.a, L.tMin), Math.min(p.b, L.tMax));
    road.jump = { id, time, t0: performance.now() }; road.until = road.jump.t0 + 1700;
    roadTo(time);
  }

  function roadKick() {
    if (road.raf || !L) return;
    if (!road.live) road.last = performance.now();
    road.live = true;
    road.raf = requestAnimationFrame(roadFrame);
  }
  // One frame: move the reader, then draw. Time is read from performance.now() only.
  function roadFrame() {
    road.raf = 0; road.live = false;
    if (!L) return;
    const now = performance.now(), dt = clamp((now - road.last) / 1000, 0, 0.05);
    road.last = now;
    const dir = camDir(), [lo, hi] = camLimits();
    let moving = false;
    if (road.target != null) {
      road.t += (road.target - road.t) * (1 - Math.exp(-dt * road.rate));
      if (Math.abs(road.target - road.t) < L.D * 0.002) { road.t = road.target; road.target = null; }
      moving = true;
    } else if (play.on || road.vel) {
      // Play eases up to its speed, and a pause lets the reader glide to a stop.
      if (play.on) road.pace += (paceFor(road.cards, road.within1, road.within3) - road.pace) * (1 - Math.exp(-dt * 2.5));
      const want = play.on ? PLAY_PACE * road.pace : 0;
      road.vel = calm() ? want : road.vel + (want - road.vel) * (1 - Math.exp(-dt * (play.on ? 4 : 6)));
      if (!play.on && road.vel < 0.004) road.vel = 0;
      road.t += dir * road.vel * L.D * dt;
      if (road.t >= hi || road.t <= lo) {
        road.t = clamp(road.t, lo, hi); road.vel = 0;
        if (play.on && (dir > 0 ? road.t >= hi : road.t <= lo)) { play.on = false; drawPlay(); }
      }
      moving = play.on || road.vel > 0;
    }
    const speed = dt > 0 && road.prev != null ? Math.abs(road.t - road.prev) / dt : 0;
    road.prev = road.t;
    const busy = roadDraw(dt, speed, now);
    if (moving || busy || now < road.until) roadKick();
  }

  // The colours of the theme, as numbers the canvas can fade.
  function roadPalette() {
    const theme = document.documentElement.dataset.theme;
    if (road.pal && road.pal.theme === theme) return road.pal;
    const cs = getComputedStyle(document.documentElement);
    const rgb = (name) => { const v = cs.getPropertyValue(name).trim(); return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)); };
    road.pal = { theme, dark: theme !== 'light', surf: rgb('--surf'), ink: rgb('--line'), text: rgb('--text'), bg: rgb('--bg'), acc: rgb('--acc'), p: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => rgb('--p' + i)) };
    return road.pal;
  }
  const endWords = (t) => `${t.words.ended.toLowerCase()} ${yearText(writtenYear(t.endEv.date))}`;
  // The sizes of an entry's names at full scale: estimated first, then corrected from the page when each is first drawn.
  function roadSizes(t) {
    const G = L.G;
    if (t.rm && t.rm.fw === G.FW && t.rm.short === G.short) return t.rm;
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    const font = getComputedStyle(document.body).fontFamily;
    const w = (text, f) => { measureCtx.font = f; return measureCtx.measureText(text).width; };
    const two = w(t.name, "400 30px 'Instrument Serif', Georgia, serif") > G.FW - 72;
    const lines = (text, width) => Math.min(3, Math.ceil(w(text, `400 13.5px ${font}`) / width));
    t.rm = {
      fw: G.FW, short: G.short,
      fullH: 61 + (two ? 62 : 32) + (!G.short && t.summary ? 8 + 19.6 * lines(t.summary, G.FW - 32) : 0) + (!G.short && t.image && !t.noImage ? 118 : 0),
      nearH: 42 + (t.cause ? 6 + 18.2 * lines(t.cause, G.NW - 28) : 0),
      compactW: Math.ceil(52 + w(t.name, `600 12.5px ${font}`) + w(spanOf(t), `400 11px ${font}`)),
      tagW: Math.ceil(8 + w(t.name, `500 11px ${font}`)),
      endW: Math.ceil(t.endEv ? 26 + w(t.name, `600 12px ${font}`) + w(endWords(t), `400 11px ${font}`) : 0),
    };
    return t.rm;
  }
  // One name on the road, in one of its forms. It is made when first shown and removed once it has faded.
  function roadNode(nk, p, end, mode) {
    const t = p.t, el = document.createElement('div'), m = roadSizes(t);
    const at = `data-id="${esc(t.id)}" data-at="${end ? p.b : p.a}" style="--c:var(--p${p.lane.col})"`, name = esc(t.name), years = esc(spanOf(t));
    el.className = 'rl';
    el.innerHTML = mode === 'full'
      ? `<button type="button" class="rc full" ${at}>${t.image && !t.noImage && !L.G.short ? `<img src="${esc(mediaUrl(t.image.src))}" alt="">` : ''}` +
        `<span class="rk"><b>${esc(t.cat.short || t.cat.name)}</b><small>${years}</small></span>` +
        `<span class="rn"><span class="tile">${tileIcon(t)}</span><strong>${name}</strong></span>${t.summary ? `<span class="rs">${esc(t.summary)}</span>` : ''}</button>`
      : mode === 'compact' ? `<button type="button" class="rc compact" ${at}><span class="tile">${tileIcon(t)}</span><b>${name}</b><small>${years}</small></button>`
      : mode === 'tag' ? `<button type="button" class="rc tag" ${at} title="${name}, ${years}">${name}</button>`
      : mode === 'near' ? `<button type="button" class="rc end near" ${at}><span class="rk"><b>${name}</b><small>${esc(endWords(t))}</small></span>${t.cause ? `<span class="rs">${esc(t.cause)}</span>` : ''}</button>`
      : `<button type="button" class="rc end small" ${at}><b>${name}</b><small>${esc(endWords(t))}</small></button>`;
    $('road-labels').appendChild(el);
    const btn = el.firstChild, n = { el, btn, pk: p.key, end, mode, o: 0, want: 0, hot: false, z: -1, dead: true };
    const size = () => {
      if (mode === 'full') m.fullH = btn.offsetHeight; else if (mode === 'near') m.nearH = btn.offsetHeight;
      else if (mode === 'compact') m.compactW = btn.offsetWidth; else if (mode === 'tag') m.tagW = btn.offsetWidth; else m.endW = btn.offsetWidth;
    };
    size();
    // A picture that cannot be loaded is left out, here and on every later card.
    const img = btn.querySelector('img');
    if (img) img.addEventListener('error', () => { img.remove(); t.noImage = true; size(); roadKick(); });
    road.nodes.set(nk, n);
    return n;
  }

  // Draws the road as the reader sees it from road.t. Returns true while anything is still fading.
  function roadDraw(dt, speed, now) {
    const G = L.G, D = L.D, t = road.t, dir = camDir(), gh = G.gh, P = roadPalette();
    const U = (x) => dir * (x - t), S = (u) => sizeAt(u, D);
    const px = (xn, s) => G.vx + xn * s, py = (s) => G.vy + gh * s;
    const uNear = NEAR * D, uFar = FAR * D, uGone = GONE * D;
    const still = calm();
    let busy = false;

    // The names in range, best first: the open entry, the one under the pointer, then the nearest, then by rank.
    // While the reader is swept along (a long jump) no new name is put up; they return as the road slows.
    const fast = speed > 2.5 * D, cands = [];
    if (fast) busy = true;
    const add = (p, end, time) => {
      const u = U(time);
      if (u <= uGone || u >= (end ? uFar * 0.5 : uFar)) return;
      const key = (end ? 'e:' : 's:') + p.key, id = p.t.id, s = S(u), up = road.vis.get(key);
      if (fast && !up && id !== state.open) return;
      // A name already up keeps its place, and a card keeps being a card: a newcomer waits rather than pushing it out.
      const pri = (id === state.open ? -100 : 0) + (id === road.hover ? -50 : 0) + zoneOf(s) * 10 + (end ? 4 : 0) + (up ? 0 : 2) + (up === 'full' || up === 'near' ? -3 : 0) - (p.t.score || 0);
      cands.push({ key, p, end, u, s, gx: px(p.xn, s), gy: py(s), m: roadSizes(p.t), lean: p.lane.lean, pri });
    };
    let within1 = 0, within3 = 0;
    const count = (time) => { const u = U(time); if (u > 0 && u <= 3 * D) { within3++; if (u <= D) within1++; } };
    for (const p of L.shown) {
      count(p.a); if (!p.alive) count(p.b);
      if (p.a >= L.tMin && p.a <= L.tMax) add(p, false, p.a);
      // An end too close behind its start would only hide behind the start's card, and far off,
      // where the two stand a line apart, the end says nothing that the dates on the start do not.
      if (!p.alive && p.b <= L.tMax && p.b >= L.tMin && p.b - p.a > 0.1 * D) {
        const ua = U(p.a), sb = S(U(p.b));
        if (!(p.a >= L.tMin && ua > uGone && ua < uFar && zoneOf(sb) > 0 && Math.abs(S(ua) - sb) * gh < 72)) add(p, true, p.b);
      }
    }
    cands.sort((a, b) => a.pri - b.pri || (a.key < b.key ? -1 : 1));
    const placed = placeLabels(cands, G);
    road.vis = new Map([...placed].map(([key, r]) => [key, r.mode]));

    // The card at the front is the selected one: the nearest big card the reader has not yet passed,
    // and first one whose line runs on ahead (a start, or an end when facing the past). While the
    // open entry has its own card up, that is the selection and no other line is lit.
    let front = null, cards = 0, openUp = false;
    const leads = (c) => c.end === (dir < 0);
    for (const c of cands) {
      const r = placed.get(c.key);
      if (!r || !r.big) continue;
      if (c.u > 0) cards++;
      if (c.p.t.id === state.open) openUp = true;
      if (c.u <= -0.05 * D) continue;
      if (!front || (leads(c) !== leads(front) ? leads(c) : c.u < front.u || (c.u === front.u && c.key < front.key))) front = c;
    }
    road.cards = cards; road.within1 = within1; road.within3 = within3;
    road.focus = front && !openUp ? front.p.t.id : null;
    const hotNow = (id) => id === state.open || id === road.hover || id === road.focus;

    // Each name shown has its element; one that is no longer shown keeps its place on the ground while it fades.
    const fade = (u, s) => clamp((s - 0.085) / 0.06, 0, 1) * clamp(1 + (u + 0.06 * D) / (0.1 * D), 0, 1);
    const seen = new Set(), stems = [], boxes = [];
    for (const c of cands) {
      const r = placed.get(c.key);
      if (!r) continue;
      boxes.push(r);
      const nk = c.key + ':' + r.mode, n = road.nodes.get(nk) || roadNode(nk, c.p, c.end, r.mode);
      seen.add(nk);
      n.r = r; n.s = c.s;
      n.want = fade(c.u, c.s) * (state.open && !r.big && !hotNow(c.p.t.id) ? 0.6 : 1);
    }
    // A card arrives a little more slowly than a small name: it comes in from its lane's side of the
    // road and leaves the same way (the left lane's from and to the left, the right lane's the right),
    // and a card in the middle rises into place.
    const ease = still ? 1 : 1 - Math.exp(-dt * 12), easeBig = still ? 1 : 1 - Math.exp(-dt * 5.5);
    for (const [nk, n] of road.nodes) {
      const p = L.byKey.get(n.pk);
      if (!seen.has(nk)) {
        const u = p ? U(n.end ? p.b : p.a) : -Infinity;
        if (!p || u <= uNear * 0.9 || u >= uFar) { n.el.remove(); road.nodes.delete(nk); continue; }
        n.s = S(u); n.want = 0;
        n.r = labelRect(n.mode, n.s, px(p.xn, n.s), py(n.s), roadSizes(p.t), G, p.lane.lean);
      }
      const big = n.mode === 'full' || n.mode === 'near';
      n.o = Math.abs(n.want - n.o) < 0.01 ? n.want : n.o + (n.want - n.o) * (big ? easeBig : ease);
      if (n.o !== n.want) busy = true;
      if (!n.want && !n.o && !seen.has(nk)) { n.el.remove(); road.nodes.delete(nk); continue; }
      const hot = hotNow(p.t.id), r = n.r;
      const away = big && !still ? (1 - n.o) * (1 - n.o) : 0, lean = p.lane.lean;
      const dx = away * lean * SLIDE * r.k, dy = away * (1 - Math.abs(lean)) * 14 * r.k;
      if (hot !== n.hot) { n.hot = hot; n.btn.classList.toggle('hot', hot); }
      const z = (hot ? 2000 : n.end ? 95 : 100) + Math.round(n.s * 400) - (n.mode === 'tag' ? 90 : 0);
      if (z !== n.z) { n.z = z; n.el.style.zIndex = z; }
      const dead = n.o < 0.3;
      if (dead !== n.dead) { n.dead = dead; n.el.style.pointerEvents = dead ? 'none' : ''; }
      n.el.style.transform = `translate3d(${(r.cx + dx).toFixed(1)}px,${(r.y1 + dy).toFixed(1)}px,0) scale(${r.k.toFixed(3)})`;
      n.el.style.opacity = n.o.toFixed(3);
      if (n.o > 0.02) stems.push({ x1: r.gx, y1: r.gy, x2: r.ax + dx, y2: r.y1 + dy, a: n.o, hot, col: p.lane.col });
    }

    // Writing on the ground (a chapter's name, an event on the selected line) is not drawn under a name:
    // it fades out as the name arrives. `soft` eases each piece of writing in and out by its key.
    const covered = (x0, y0, x1, y1) => boxes.some((b) => x0 < b.x1 + 3 && x1 > b.x0 - 3 && y0 < b.y1 + 3 && y1 > b.y0 - 3);
    const inked = new Set();
    const soft = (key, want) => {
      inked.add(key);
      const was = road.soft.get(key) ?? want, v = Math.abs(want - was) < 0.01 ? want : was + (want - was) * ease;
      road.soft.set(key, v);
      if (v !== want) busy = true;
      return v;
    };

    // How lit each line is: the selected ones warm up and cool down, they do not switch.
    for (const id of [state.open, road.hover, road.focus]) if (id && !road.heat.has(id)) road.heat.set(id, 0);
    const warm = still ? 1 : 1 - Math.exp(-dt * 9);
    for (const [id, h] of road.heat) {
      const want = hotNow(id) ? 1 : 0, v = Math.abs(want - h) < 0.01 ? want : h + (want - h) * warm;
      if (!want && !v) road.heat.delete(id); else { road.heat.set(id, v); if (v !== want) busy = true; }
    }

    // ---- the ground, on one canvas
    const cv = $('road-cv'), dpr = Math.min(2, devicePixelRatio || 1), cw = Math.round(G.SW * dpr), ch = Math.round(G.SH * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, G.SW, G.SH);
    const rgba = (v, a) => `rgba(${v[0]},${v[1]},${v[2]},${a})`;
    const mix = (a, b, k) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k));
    const font = (weight, size) => { c.font = `${weight} ${size.toFixed(1)}px Inter, system-ui, sans-serif`; };
    const far = (s) => clamp((s - 0.085) / 0.08, 0, 1);       // things fade in from the horizon
    // The road stops at the end the reader faces: today, or the last year shown.
    const uEnd = U(dir > 0 ? L.tMax : L.tMin), sTop = uEnd < uFar ? S(uEnd) : S(uFar), sB = (G.SH - G.vy) / gh;
    const hazeY = G.vy + gh * 0.02;
    const haze = (col, a) => { const g = c.createLinearGradient(0, hazeY, 0, G.vy + gh * 0.3); g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, a)); return g; };
    const quad = (x0, x1, sa, sb) => { c.beginPath(); c.moveTo(px(x0, sa), py(sa)); c.lineTo(px(x1, sa), py(sa)); c.lineTo(px(x1, sb), py(sb)); c.lineTo(px(x0, sb), py(sb)); c.closePath(); };
    if (L.lanes.length) {
      quad(-G.RW, G.RW, sTop, sB); c.fillStyle = haze(P.surf, 1); c.fill();
      if (L.lanes.length > 1) for (const ln of L.lanes) { quad(ln.x0, ln.x1, sTop, sB); c.fillStyle = haze(P.p[ln.col], P.dark ? 0.07 : 0.055); c.fill(); }
      c.lineWidth = 1;

      // A year the reader asked for: its stretch of road is lit for a few seconds.
      if (road.year) {
        const age = (now - road.year.t0) / 4500, a = age >= 1 ? 0 : age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;
        const u0 = U(road.year.a), u1 = U(road.year.a + 1), ua = Math.max(uNear, Math.min(u0, u1)), ub = Math.min(uFar, Math.max(u0, u1));
        if (a && ub > ua) {
          quad(-G.RW, G.RW, S(ub), S(ua)); c.fillStyle = rgba(P.acc, 0.22 * a); c.fill();
          const s = S(ua), text = road.year.label;
          font(600, 12);
          const w = c.measureText(text).width + 18, x = Math.max(4, px(-G.RW, s) - w - 10), y = py(s) - 10;
          c.fillStyle = rgba(P.acc, a); c.beginPath(); if (c.roundRect) c.roundRect(x, y - 10, w, 20, 10); else c.rect(x, y - 10, w, 20); c.fill();
          c.fillStyle = rgba(P.bg, a); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x + w / 2, y + 0.5);
        }
        if (age >= 1) road.year = null;
      }

      // The years: a line across the road at each written year, ticks on both edges.
      const fsOf = (s) => (G.phone ? Math.max(9.5, 8 + 13 * s) : Math.max(10, 9 + 25 * s));
      const ce = writtenOf(L.tMin) < 0 && writtenOf(L.tMax) > 0;
      for (const tk of ruler({ t, dir, D, tMin: L.tMin, tMax: L.tMax, gh, fsOf })) {
        // A year fades in from the horizon, and out as it slides under the reader's feet.
        const s = tk.s, y = py(s), xl = px(-G.RW, s), xr = px(G.RW, s), a = far(s) * clamp(2.4 - s * 1.5, 0, 1) * clamp((G.SH - y) / (tk.fs * 0.9), 0, 1);
        if (tk.label) { c.strokeStyle = rgba(P.ink, 0.1 * a); c.beginPath(); c.moveTo(xl, y); c.lineTo(xr, y); c.stroke(); }
        const len = (tk.label ? 15 : tk.major ? 9 : 5) * s + 1;
        c.strokeStyle = rgba(P.ink, (tk.label ? 0.75 : 0.42) * a);
        c.beginPath(); c.moveTo(xl, y); c.lineTo(xl - len, y); c.moveTo(xr, y); c.lineTo(xr + len, y); c.stroke();
        if (!tk.label) continue;
        const text = axisText(tk.y, tk.step, ce), x = xr + len + (G.phone ? 4 : 7), room = G.SW - x - 3;
        let fs = tk.fs;
        font(500, fs);
        const tw = c.measureText(text).width;
        if (tw > room) { fs = Math.max(8.5, (fs * room) / tw); font(500, fs); }
        // A year steps aside while a card stands over it, rather than show half its digits.
        const ya = soft('y' + tk.y, covered(x - 4, y - fs * 0.55, x + Math.min(tw, room) + 4, y + fs * 0.55) ? 0 : 1);
        if (ya < 0.01) continue;
        c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = rgba(P.text, (0.45 + 0.5 * Math.min(1, s)) * a * ya);
        c.fillText(text, x, y);
      }

      // The edges of the road and the dividers between lanes.
      const edge = (xn, dash) => {
        const g = c.createLinearGradient(0, py(sTop), 0, py(sB));
        g.addColorStop(0, rgba(P.ink, 0.12)); g.addColorStop(0.5, rgba(P.ink, 0.55)); g.addColorStop(1, rgba(P.ink, 0.6));
        c.strokeStyle = g; c.setLineDash(dash || []);
        c.beginPath(); c.moveTo(px(xn, sTop), py(sTop)); c.lineTo(px(xn, sB), py(sB)); c.stroke();
        c.setLineDash([]);
      };
      edge(-G.RW); edge(G.RW);
      for (let i = 1; i < L.lanes.length; i++) edge(L.lanes[i].x0, [5, 6]);

      // A view's chapters: a line across its lane where each begins, named in the view's colour.
      for (const [li, ln] of L.lanes.entries()) for (const e of ln.eras) {
        const at = dir > 0 ? e.a : e.b, u = U(at);
        if (at < L.tMin || at > L.tMax || u <= uGone || u >= uFar * 0.6) continue;
        const s = S(u), y = py(s), a = far(s) * clamp(1 + (u + 0.06 * D) / (0.1 * D), 0, 1), col = P.p[ln.col];
        c.strokeStyle = rgba(col, 0.55 * a); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(px(ln.x0, s), y); c.lineTo(px(ln.x1, s), y); c.stroke();
        if (s < 0.4) continue;      // far off, the line alone
        const fs = 9 + 2.5 * Math.min(1, s);
        font(600, fs);
        c.textAlign = 'left'; c.textBaseline = 'bottom';
        const text = e.name.toUpperCase(), x = px(ln.x0, s) + 6, w = c.measureText(text).width;
        if (w > px(ln.x1, s) - x - 6) continue;      // named once its lane is wide enough to hold the name
        // It lets go at the foot of the stage, and wherever a name stands on it.
        const na = a * clamp((G.SH + 2 - y) / 12, 0, 1) * soft('c' + li + '|' + e.key, covered(x, y - 2 - fs, x + w, y - 2) ? 0 : 1);
        if (na < 0.01) continue;
        c.lineWidth = 3.5; c.lineJoin = 'round'; c.strokeStyle = rgba(P.surf, na); c.strokeText(text, x, y - 2);
        c.fillStyle = rgba(col, na); c.fillText(text, x, y - 2);
      }

      // Lifelines: neutral at rest, in their view's colour while selected.
      // On a crowded road each line is fainter, so the ground stays calm.
      const thin = clamp(70 / L.shown.length, 0.5, 1);
      const ordered = [...L.shown].sort((p, q) => (road.heat.get(p.t.id) || 0) - (road.heat.get(q.t.id) || 0));
      for (const p of ordered) {
        const a0 = Math.max(p.a, L.tMin), b0 = Math.min(p.b, L.tMax), u1 = U(a0), u2 = U(b0);
        const lo = Math.max(uNear, Math.min(u1, u2)), hi = Math.min(uFar, Math.max(u1, u2));
        if (hi < lo) continue;
        const h = road.heat.get(p.t.id) || 0, col = h ? mix(P.ink, P.p[p.lane.col], h) : P.ink, s1 = S(lo), s2 = S(hi);
        const x1 = px(p.xn, s1), y1 = py(s1), x2 = px(p.xn, s2), y2 = py(s2);
        if (hi > lo) {
          const g = c.createLinearGradient(x1, y1, x2, y2 === y1 ? y1 - 1 : y2);
          g.addColorStop(0, rgba(col, 0.34 * thin + (1 - 0.34 * thin) * h)); g.addColorStop(1, rgba(col, 0.07 * thin + (0.75 - 0.07 * thin) * h));
          c.strokeStyle = g; c.lineWidth = 1 + 1.2 * h;
          // Dotted from the day its end was announced.
          const ud = p.t.dep != null && !p.alive ? clamp(U(p.t.dep), lo, hi) : null;
          const seg = (ua, ub, dash) => { if (ub <= ua) return; const sa = S(ua), sb = S(ub); c.setLineDash(dash); c.beginPath(); c.moveTo(px(p.xn, sa), py(sa)); c.lineTo(px(p.xn, sb), py(sb)); c.stroke(); };
          if (ud == null) seg(lo, hi, []);
          else if (dir > 0) { seg(lo, ud, []); seg(ud, hi, [2, 4]); } else { seg(lo, ud, [2, 4]); seg(ud, hi, []); }
          c.setLineDash([]);
        }
        const solid = (s) => rgba(col, Math.max(h, clamp(s * 0.95, 0.12, 0.8)));
        const uB = U(p.b);
        if (p.b <= L.tMax && uB > uNear && uB < uFar && (!p.alive || L.tMax >= NOW - 0.5)) {
          const s = S(uB), x = px(p.xn, s), y = py(s);
          c.strokeStyle = solid(s); c.fillStyle = solid(s); c.lineWidth = 1.3 + 0.9 * h;
          if (p.alive) { c.beginPath(); c.ellipse(x, y, 3.2 * s + 0.8, 1.7 * s + 0.5, 0, 0, 7); c.fill(); }
          else { const hl = 8 * s + 1.5; c.beginPath(); c.moveTo(x - hl, y); c.lineTo(x + hl, y); c.stroke(); }
        }
        const uA = U(p.a);
        if (p.a >= L.tMin && uA > uNear && uA < uFar) {
          const s = S(uA);
          c.strokeStyle = solid(s); c.fillStyle = rgba(P.bg, 1); c.lineWidth = 1.2 + 0.8 * h;
          c.beginPath(); c.ellipse(px(p.xn, s), py(s), 4.6 * s + 0.8, 2.3 * s + 0.5, 0, 0, 7); c.fill(); c.stroke();
        }
        // The dated points of a selected entry, written along its line.
        if (h > 0.03 && (p.t.id === state.open || p.t.id === road.focus) && L.at.get(p.t.id) === p) {
          const pc = P.p[p.lane.col];
          let lastY = Infinity;
          const ms = dir > 0 ? p.t.marks : [...p.t.marks].reverse();
          for (const m of ms) {
            if (m.t <= p.a + 0.01 || m.t >= p.b - 0.01 || m.t < L.tMin || m.t > L.tMax) continue;
            const u = U(m.t);
            if (u <= uGone || u >= uFar * 0.5) continue;
            const s = S(u), x = px(p.xn, s), y = py(s), hl = 6 * s + 1.5, a = far(s) * h * clamp(1 + (u + 0.06 * D) / (0.1 * D), 0, 1);
            c.globalAlpha = a; c.strokeStyle = rgba(pc, 1); c.lineWidth = 2;
            c.beginPath(); c.moveTo(x - hl, y); c.lineTo(x + hl, y); c.stroke();
            const text = [m.label, m.date].filter(Boolean).join(' ');
            if (text && lastY - y >= 14) {
              // Written beside the line, on whichever side no name stands; it keeps its side while that stays free.
              font(600, 10 + 4 * Math.min(1, s));
              const w = c.measureText(text).width, off = hl + 6, mk = 'm' + p.key + '|' + m.t;
              const right = !covered(x + off, y - 8, x + off + w, y + 8), left = x - off - w > 4 && !covered(x - off - w, y - 8, x - off, y + 8);
              let side = road.side.get(mk) || 1;
              if (!(side > 0 ? right : left)) side = right ? 1 : left ? -1 : side;
              road.side.set(mk, side);
              const ma = soft(mk, (side > 0 ? right : left) ? 1 : 0);
              if (ma > 0.01) {
                lastY = y;
                c.globalAlpha = a * ma;
                c.textBaseline = 'middle'; c.textAlign = side > 0 ? 'left' : 'right';
                c.lineWidth = 4; c.lineJoin = 'round'; c.strokeStyle = rgba(P.bg, 1); c.strokeText(text, x + side * off, y);
                c.fillStyle = rgba(pc, 1); c.fillText(text, x + side * off, y);
              }
            }
            c.globalAlpha = 1;
          }
        }
      }

      // A moment on a line the reader asked for: a ring opens around it.
      if (road.jump) {
        const age = (now - road.jump.t0) / 1600, p = L.at.get(road.jump.id), u = p ? U(road.jump.time) : uFar;
        if (age < 1 && u > uNear && u < uFar) {
          const s = S(u), r = (4 + 10 * Math.min(1, age / 0.7)) * s + 1;
          c.strokeStyle = rgba(P.acc, age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3); c.lineWidth = 2;
          c.beginPath(); c.ellipse(px(p.xn, s), py(s), r, r * 0.5, 0, 0, 7); c.stroke();
        }
        if (age >= 1) road.jump = null;
      }

      // The stem under each name.
      c.lineWidth = 1;
      for (const st of stems) {
        c.strokeStyle = st.hot ? rgba(P.p[st.col], st.a) : rgba(P.ink, 0.45 * st.a);
        c.beginPath(); c.moveTo(st.x1, st.y1); c.lineTo(st.x2, st.y2); c.stroke();
      }

      // Where the road stops.
      if (uEnd < uFar) {
        const s = S(uEnd), y = py(s), a = far(s);
        c.strokeStyle = rgba(P.text, 0.85 * a); c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(px(-G.RW, s) - 10 * s, y); c.lineTo(px(G.RW, s) + 10 * s, y); c.stroke();
        if (dir > 0 && L.tMax >= NOW - 0.5) {
          font(600, Math.max(10, 9 + 9 * s));
          c.textBaseline = 'middle'; c.textAlign = 'right'; c.fillStyle = rgba(P.text, 0.9 * a);
          c.fillText('Today', px(-G.RW, s) - 16 * s - 4, y);
        }
      }
    }
    for (const k of road.soft.keys()) if (!inked.has(k)) { road.soft.delete(k); road.side.delete(k); }
    roadHud(false);
    return busy;
  }

  // The bar on the right is the whole span, upright, and ahead is up: the
  // reader's marker climbs it as they travel, whichever way they face.
  const barSpan = () => Math.max(1, L.barH - 2 * BAR_PAD);
  const barY = (t) => { const f = (t - L.tMin) / (L.tMax - L.tMin); return BAR_PAD + (camDir() > 0 ? 1 - f : f) * barSpan(); };
  const barT = (y) => { const f = clamp((y - BAR_PAD) / barSpan(), 0, 1); return L.tMin + (camDir() > 0 ? 1 - f : f) * (L.tMax - L.tMin); };
  function barTicks() {
    const ax = axisTicks(barSpan() / (L.tMax - L.tMin), L.G.phone ? 34 : 30);
    const yEnd = barY(L.tMax);
    // On a phone the bar is slim: "BCE" or "Ma" goes under its number.
    const text = (yr) => esc(axisText(yr, ax.step, ax.ce)).replace(/ (BCE|CE|ka|Ma|Ga)$/, ' <small>$1</small>');
    let html = '';
    for (const yr of ax.ticks) {
      const y = barY(lineYear(yr));
      html += ax.atNow && Math.abs(y - yEnd) < 22 ? `<i class="tk big" style="top:${y}px"></i>` : `<span class="yr" style="top:${y}px">${text(yr)}</span>`;
    }
    for (const yr of ax.marks) html += `<i class="tk" style="top:${barY(lineYear(yr))}px"></i>`;
    if (ax.atNow) html += `<span class="yr now" style="top:${yEnd}px">Today</span>`;
    $('ticks').innerHTML = html;
    L.barYears = [...$('ticks').querySelectorAll('.yr')].map((el) => ({ el, y: parseFloat(el.style.top), under: false }));
    L.units = ax.units;
  }
  // The year the reader stands in, the marker on the bar, and each view's chapter. `all` also redraws the play button.
  function roadHud(all) {
    const t = road.t, D = L.D, dir = camDir(), label = playLabel(t);
    if (label !== road.said) {
      road.said = label;
      $('road-year').textContent = label;
      $('playhead').firstElementChild.textContent = label;
      $('axis').setAttribute('aria-valuetext', label);
      // Deep time is counted in years ago: the units in sight are spelled out once, under the year.
      const units = [...new Set([...L.units, (/(ka|Ma|Ga)$/.exec(label) || [])[1]].filter(Boolean))];
      if (units.join() !== L.unitsSaid) {
        L.unitsSaid = units.join();
        $('road-unit').textContent = units.map((u) => `${u}: ${AXIS_UNITS[u]} years ago`).join(' · ');
        $('road-unit').hidden = !units.length || L.G.short;
      }
    }
    const y = barY(t), y2 = barY(clamp(t + dir * 3 * D, L.tMin, L.tMax));
    $('playhead').style.top = y.toFixed(1) + 'px';
    // A year on the bar steps aside while the marker's own year is over it.
    for (const k of L.barYears) { const under = Math.abs(k.y - y) < 15; if (under !== k.under) { k.under = under; k.el.classList.toggle('under', under); } }
    $('axis-win').style.top = Math.min(y, y2).toFixed(1) + 'px';
    $('axis-win').style.height = Math.abs(y - y2).toFixed(1) + 'px';
    // The chapter in front of the reader.
    const at = t + dir * 0.2 * D;
    L.lanes.forEach((ln, i) => {
      const cur = ln.eras.find((e) => e.a <= at && at < e.b) || null;
      if (cur === ln.cur) return;
      ln.cur = cur;
      const b = $('road-views').querySelector(`[data-lane="${i}"]`);
      if (!b) return;
      b.hidden = !cur;
      if (cur) { b.textContent = cur.name; b.dataset.era = cur.key; b.title = cur.years; }
    });
    if (!all) return;
    const b = $('play'), end = camAtEnd();
    b.setAttribute('aria-pressed', play.on);
    b.setAttribute('aria-label', play.on ? 'Pause' : end ? 'Play from the beginning' : 'Play: travel along the road');
    b.title = play.on ? 'Pause' : end ? 'Play again from the beginning' : 'Play';
    const icon = play.on ? ICON_PAUSE : end ? ICON_AGAIN : ICON_PLAY;
    if (b.dataset.icon !== icon) { b.dataset.icon = icon; b.innerHTML = icon; }
  }

  // The wheel, a drag and the arrow keys carry the reader along the road.
  function wireRoad() {
    const box = $('road');
    box.addEventListener('wheel', (e) => {
      if (!L) return;
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (d) roadBy((d * (e.deltaMode === 1 ? 30 : 1)) / 520);
    }, { passive: true });
    box.addEventListener('pointerdown', (e) => {
      if (!L || e.button > 0) return;
      road.drag = { y: e.clientY, x: e.clientX, t: road.t, moved: false, id: e.pointerId };
    });
    box.addEventListener('pointermove', (e) => {
      const d = road.drag;
      if (!d || !L) return;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dy) + Math.abs(e.clientX - d.x) < 6) return;
      if (!d.moved) { d.moved = true; box.setPointerCapture?.(d.id); box.classList.add('dragging'); if (play.on) pausePlay(); }
      road.target = null; road.vel = 0;
      road.t = camClamp(d.t + camDir() * dy * L.D / 240);
      roadKick();
    });
    const drop = () => {
      if (road.drag && road.drag.moved) road.swallow = performance.now() + 250;
      road.drag = null; box.classList.remove('dragging');
    };
    box.addEventListener('pointerup', drop);
    box.addEventListener('pointercancel', drop);
    // A drag that ends on a card is not a click on it.
    box.addEventListener('click', (e) => { if (performance.now() < road.swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
    const over = (id) => { if (road.hover !== id) { road.hover = id; roadKick(); } };
    $('road-labels').addEventListener('pointerover', (e) => { const el = e.target.closest('[data-id]'); if (el && e.pointerType === 'mouse' && !road.drag?.moved) over(el.dataset.id); });
    $('road-labels').addEventListener('pointerout', (e) => { if (e.target.closest('[data-id]')) over(null); });
    addEventListener('keydown', (e) => {
      if (!L || e.altKey || e.ctrlKey || e.metaKey) return;
      if (!['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) return;
      // Not while typing, nor inside the panel or the bar, which use the arrows themselves.
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || e.target.closest?.('#side, #axis, #info, .tsearch')) return;
      e.preventDefault();
      roadBy(e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 0.3 : -0.3, 8);
    });
    if (window.ResizeObserver) new ResizeObserver(() => { if (L && (box.clientWidth !== L.G.SW || box.clientHeight !== L.G.SH || $('axis').clientHeight !== L.barH)) render(); }).observe(box);
  }

  // ---------------------------------------------------------------- search the timeline
  // The box in the top bar finds anything drawn: an entry by any of its
  // names, an event on a line, an era or a year, and goes there. Below a
  // divider, the search index lists entries that are not drawn.
  let hits = [], hit = -1;
  // Small symbols in the timeline's own drawing language.
  const KIND_ICON = {
    'k-thing': '<svg width="18" height="12" aria-hidden="true"><line x1="5" y1="6" x2="18" y2="6" stroke="var(--c)" stroke-width="1.6"/><circle cx="4.5" cy="6" r="2.6" fill="var(--bg)" stroke="var(--c)" stroke-width="1.5"/></svg>',
    'k-ev': '<svg width="18" height="12" aria-hidden="true"><line x1="0" y1="4" x2="18" y2="4" stroke="var(--c)" stroke-width="1.4" opacity=".55"/><line x1="9" y1="4" x2="9" y2="11" stroke="var(--c)" stroke-width="1.6"/></svg>',
    'k-era': '<svg width="18" height="12" aria-hidden="true"><rect x="2" y="0" width="14" height="12" fill="var(--band-hot)"/><line x1="2.5" y1="0" x2="2.5" y2="12" stroke="var(--bandtext)" stroke-width="1.6"/></svg>',
    'k-year': '<svg width="18" height="12" aria-hidden="true"><line x1="5" y1="0" x2="5" y2="12" stroke="var(--muted)"/><line x1="13" y1="0" x2="13" y2="12" stroke="var(--muted)"/></svg>',
  };
  const kindName = (i) => cats[i]?.name || '';
  function findOnTimeline() {
    const raw = $('q').value.trim(), q = fold(raw), qt = tokens(raw).join(' ');
    hits = [];
    let waiting = false;
    if (q) {
      // With no view on the timeline nothing is drawn (L is null), and every match is "not on the timeline".
      const at = L ? [...L.at.values()] : [], eras = L ? L.groups.flatMap((g) => g.eras) : [];
      const y = parseYearQuery(q);
      if (L && y != null && lineYear(y) + 1 > L.tMin && lineYear(y) < L.tMax) hits.push({ year: y });
      for (const p of at) { const s = drawnScore(p.t, q); if (s) hits.push({ p, s }); }
      for (const e of eras) if (fold(e.c.name).includes(q)) hits.push({ era: e.c });
      for (const p of at) for (const m of p.t.marks) {
        if (m.label && (fold(m.label).includes(q) || fold(m.note).includes(q) || fold(m.date).includes(q))) hits.push({ p, m });
      }
      // Best match first; within a class, the reviewed base before community entries, then rank, then popularity.
      const tier = (h) => (h.p && h.p.t.tier === 'community' ? 1 : 0);
      hits.sort((a, b) => (!!b.year - !!a.year) || ((b.s || 0) - (a.s || 0)) || (!!b.era - !!a.era) || (!!a.m - !!b.m) || (tier(a) - tier(b)) || ((a.p ? a.p.t.rank : 0) - (b.p ? b.p.t.rank : 0)) || ((b.p ? b.p.t.pop || 0 : 0) - (a.p ? a.p.t.pop || 0 : 0)));
      // Entries that are not drawn, from the search index, after a divider.
      // Picking one shows the view it belongs to.
      const data = qt ? indexFor(raw, () => { if (fold($('q').value.trim()) === q) findOnTimeline(); }) : { entries: [] };
      const onPage = new Set(L ? L.shown.map((p) => p.t.id) : []);
      // A year: what began or ended in it. Otherwise: names.
      const away = !data ? [] : y != null ? entriesInYear(data, y, onPage, L ? 6 : 8) : searchEntries(data, qt, onPage, L ? 5 : 8).map((e) => ({ e }));
      waiting = !data;
      hits = hits.slice(0, away.length ? 6 : 9);
      for (const a of away) hits.push({ e: a.e, how: a.how, y, away: true });
      if (data && y != null && !hits.length) hits.push({ none: `Nothing on record began or ended in ${yearText(y)}.` });
      // Nothing in the data has this name: offer to suggest it, so a failed
      // search tells the editors what people came looking for.
      if (data && q.length > 1 && y == null && !away.length && !hits.some((h) => h.p && !h.m) && !searchEntries(data, qt, null, 1).length) hits.push({ suggest: raw });
    }
    hit = hits.findIndex((h) => !h.none);
    drawHits(q, waiting);
  }
  // How well an entry that is drawn matches: its name first, then its other names.
  function drawnScore(t, q) {
    const n = fold(t.name);
    if (n === q) return 6;
    if (n.startsWith(q)) return 5;
    if ((' ' + n).includes(' ' + q)) return 4;
    if (n.includes(q)) return 3;
    const other = t.search.filter((o) => o !== n);
    if (other.some((o) => o === q || o.startsWith(q) || (' ' + o).includes(' ' + q))) return 2;
    return other.some((o) => o.includes(q)) ? 1 : 0;
  }
  function drawHits(q, waiting) {
    const box = $('qlist');
    if (!q) { box.hidden = true; $('q').setAttribute('aria-expanded', false); return; }
    box.hidden = false; $('q').setAttribute('aria-expanded', true);
    const col = (p) => `--c:var(--p${state.colors.get(p.group.id) % 8})`;
    let divided = false;
    const mk = (text) => mark(text, q);
    box.innerHTML = (!hits.length ? `<li class="none" role="presentation">${waiting ? 'Searching…' : 'Nothing matches. Try a name, an event or a year.'}</li>`
      : hits.map((h, i) => {
        let main, sub, cls = 'k-year', st = '', pre = '';
        if (h.none) return `<li class="none" role="presentation">${esc(h.none)}</li>`;
        if (h.suggest) {
          return `<li class="sep" role="presentation">Not here yet</li><li role="option" id="qo-${i}" aria-selected="${i === hit}" data-h="${i}" class="k-thing away">${KIND_ICON['k-thing']}<span class="r-txt"><b>Suggest “${esc(h.suggest)}”</b><small>Tell us about it on GitHub; no code needed</small></span><span class="add">${ICON.plus}</span></li>`;
        }
        if (h.away) {
          if (!divided) { divided = true; pre = '<li class="sep" role="presentation">Not on the timeline</li>'; }
          const e = h.e, comm = e.tier === 2 ? ' · <span class="ctag">community</span>' : '';
          const when = h.how ? `<em class="yw">${esc(yearWord(e, h.how, h.how === 'born' ? e.born : e.end))}</em>` : esc(lineSpan(e));
          return pre + `<li role="option" id="qo-${i}" aria-selected="${i === hit}" data-h="${i}" class="k-thing away">${KIND_ICON['k-thing']}<span class="r-txt"><b><span>${mk(e.name)}</span></b><small>${esc(kindName(e.kind))} · ${when}${comm}</small></span></li>`;
        }
        if (h.year != null) { main = esc(yearText(h.year)); sub = 'Year'; }
        else if (h.era) { main = mk(h.era.name); sub = `Chapter of ${esc(h.era.view.name)} · ${esc(h.era.years)}`; cls = 'k-era'; }
        else if (h.m) { main = mk(h.m.label); sub = `${esc(h.p.t.name)} · ${esc(h.m.date)}`; cls = 'k-ev'; st = col(h.p); }
        else { main = mk(h.p.t.name); sub = `${esc(h.p.t.cat.name)} · ${esc(spanOf(h.p.t))}`; cls = 'k-thing'; st = col(h.p); }
        return `<li role="option" id="qo-${i}" aria-selected="${i === hit}" data-h="${i}" class="${cls}" style="${st}">${KIND_ICON[cls]}<span class="r-txt"><b><span>${main}</span></b><small>${sub}</small></span></li>`;
      }).join('')) + (waiting && hits.length ? '<li class="sep wait" role="presentation">Searching everything…</li>' : '');
    $('q').setAttribute('aria-activedescendant', hit >= 0 ? 'qo-' + hit : '');
  }
  function goHit(i) {
    const h = hits[i];
    if (h && h.suggest) return void window.open(`${REPO}/issues/new?template=new-thing.yml&title=${encodeURIComponent('Add: ' + h.suggest)}&name=${encodeURIComponent(h.suggest)}`, '_blank', 'noopener');
    if (!h || h.none) return;
    $('q').value = ''; drawHits(''); $('q').blur();
    if (h.year != null) return flashYear(h.year);
    if (h.era) return openEra(h.era.key);
    if (h.away) return bringIn(h.e.id);
    openThing(h.p.t.id, { scroll: !h.m, focus: false });
    if (h.m) jumpTo(h.p.t.id, h.m.t);
  }
  // Brings an entry that is not drawn onto the timeline: fetches its detail
  // file, pins it so it is drawn, and opens it. When no view on the timeline
  // holds it, the view it belongs to is shown alone, like a view picked from
  // the list; with `opts.beside` (a link that names its own views) that view
  // joins the others instead.
  function bringIn(id, opts = {}) {
    return loadEntry(id).then((t) => {
      if (!t) { if (!opts.quiet) note('That entry could not be loaded.'); return false; }
      const open = (jump) => { state.pinned.add(t.id); changed(); openThing(t.id, { scroll: true, jump, focus: opts.focus ?? false }); };
      const home = alias.get(t.home) || t.home;
      if (!home || state.views.includes(home) || state.views.some((v) => viewById.get(v).memberIds.has(t.id))) { open(); return true; }
      const after = (got) => { if (!got && state.views.length) open(); return true; };
      if (!opts.beside) return showOnly(home, () => open(true)).then(after);
      if (state.views.length + pending.size >= MAX_VIEWS) removeView(state.views[0]);
      return turnOn(home, () => open()).then(after);
    });
  }
  // Brings a year into sight and lights its stretch of road for a moment.
  function flashYear(year) {
    if (!L) return;
    const a0 = lineYear(year);
    road.year = { a: a0, label: yearText(year), t0: performance.now() }; road.until = road.year.t0 + 4600;
    roadTo(camDir() > 0 ? a0 : a0 + 1);
  }

  // ---------------------------------------------------------------- panel: views
  function showSide(on) {
    const was = !$('side').hidden;
    $('side').hidden = !on;
    document.body.classList.toggle('side-open', on);
    $('toggle-side').setAttribute('aria-expanded', on);
    if (!on) $('info').hidden = true;
    if (was !== on && state.views.length) render();
  }
  function showPane(name) {
    state.pane = name;
    for (const p of ['views', 'thing', 'era']) $('p-' + p).hidden = p !== name;
    $('side').scrollTop = 0;
    if (name !== 'views') $('info').hidden = true;
  }
  let noteText = '', noteTimer = 0;
  function note(text, ms = 6000) {
    noteText = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { noteText = ''; drawResults(); }, ms);
    drawResults();
  }
  // Said once: views of very different lengths squeeze the shorter ones into a sliver.
  let spansSaid = false;
  function spansNote() {
    if (spansSaid || state.views.length < 2) return;
    const lengths = state.views.map((id) => {
      const m = viewById.get(id).members;
      if (!m || !m.length) return 0;
      return Math.max(...m.map((t) => t.end ?? NOW)) - Math.min(...m.map((t) => t.lead ?? t.born));
    }).filter((n) => n > 0);
    if (lengths.length < 2 || Math.max(...lengths) < 50 * Math.max(1, Math.min(...lengths))) return;
    spansSaid = true;
    note('These views cover very different spans of time. To see the shorter one, narrow the years with the year range below, or open one of its chapters and choose "Only these years".', 20000);
  }

  function renderSide() {
    // The views on the timeline: one pill each in the strip under the years.
    const n = L ? L.at.size : 0, more = L && L.total > L.at.size ? ` of ${L.total}` : '';
    $('shown-n').textContent = !state.views.length ? '' : !more ? `${n} ${n === 1 ? 'entry' : 'entries'}` : `${n}${more} on the road`;
    const many = state.views.length > 1;
    $('pills').innerHTML = state.views.map((id) => {
      const v = viewById.get(id);
      return `<div class="pill${many ? '' : ' one'}" data-pill="${esc(id)}" style="--c:var(--p${state.colors.get(id) % 8})"${many ? ' title="Drag to reorder"' : ''}>` +
        `<button type="button" class="dot" data-colour="${esc(id)}" aria-label="Colour of ${esc(v.name)}" title="Colour"></button><span>${esc(v.name)}</span>` +
        (many ? `<button type="button" data-remove="${esc(id)}" aria-label="Remove ${esc(v.name)}" title="Remove">${ICON.xs}</button>` : '') + '</div>';
    }).join('');
    $('save-mine').disabled = !state.views.length;
    $('shuffle').hidden = !many;
    requestAnimationFrame(pillEdges);
    $('swatches').hidden = true;

    // How much to show: the nearest of the four named levels is marked.
    const near = LEVELS.reduce((a, l) => Math.abs(l.pct - state.level) < Math.abs(a.pct - state.level) ? l : a);
    for (const b of $('level').querySelectorAll('[data-lv]')) b.setAttribute('aria-checked', Number(b.dataset.lv) === near.pct);
    drawYears();
    $('filters-sum').textContent = state.views.length ? `${$('years-out').textContent} · ${near.name}` : '';
    drawChips();
    runSearch();
  }
  // A fade at either end of the strip of pills says it scrolls.
  function pillEdges() {
    const c = $('pills');
    c.classList.toggle('more-l', c.scrollLeft > 2);
    c.classList.toggle('more-r', c.scrollLeft < c.scrollWidth - c.clientWidth - 2);
  }
  // The year range: a picture of how busy each stretch of years is, with two
  // handles to narrow the timeline to the years between them. The handles
  // move along the same straight scale as the timeline, in 1,000 steps.
  const STEPS = 1000;
  function drawYears() {
    const a = L ? L.fitMin : NOW - 30, b = L ? L.fitMax : NOW;
    const lo = L ? L.tMin : a, hi = L ? L.tMax : b;
    const pos = (t) => Math.round(((t - a) / Math.max(1e-9, b - a)) * STEPS);
    for (const id of ['y-from', 'y-to']) { $(id).min = 0; $(id).max = STEPS; }
    if (document.activeElement !== $('y-from')) $('y-from').value = pos(lo);
    if (document.activeElement !== $('y-to')) $('y-to').value = pos(hi);
    const last = hi >= NOW - 0.5 ? 'today' : yearText(writtenOf(hi - 1e-9));
    $('years-out').textContent = `${yearText(writtenOf(lo))} – ${last}`;
    $('y-from').setAttribute('aria-valuetext', yearText(writtenOf(lo)));
    $('y-to').setAttribute('aria-valuetext', last);
    // Reset a narrowed range; or, when the timeline opened on its busy part, reach back to the first entry.
    const r = $('years-reset'), trimmed = L && L.autoMin > L.fitMin;
    r.hidden = !state.span && !trimmed;
    r.dataset.mode = state.span ? 'reset' : 'all';
    r.textContent = state.span ? 'Reset' : 'Show all years';
    r.title = state.span ? 'Back to the years this view opens on' : 'A few entries start long before the rest; show the years back to them';
    $('yearbar').style.setProperty('--lo', (pos(lo) / STEPS) * 100 + '%');
    $('yearbar').style.setProperty('--hi', (pos(hi) / STEPS) * 100 + '%');
    const N = 32, bins = new Array(N).fill(0), span = b - a;
    const bump = (t) => { if (t >= a && t <= b) bins[Math.min(N - 1, Math.floor(((t - a) / span) * N))]++; };
    const pool = new Set();
    for (const id of state.views) for (const t of membersOf(viewById.get(id), state.level)) pool.add(t);
    for (const t of pool) { bump(t.born); if (t.end != null) bump(t.end); t.marks.forEach((m) => bump(m.t)); }
    const max = Math.max(1, ...bins);
    $('hist').innerHTML = bins.map((v, i) => {
      const y0 = a + (i / N) * span, y1 = a + ((i + 1) / N) * span;
      return `<i class="${y1 <= lo || y0 >= hi ? 'off' : ''}" style="height:${Math.round((v / max) * 26) + 2}px"></i>`;
    }).join('');
    const at = (f) => axisText(writtenOf(a + (b - a) * f));
    $('year-ticks').innerHTML = [at(0), at(1 / 3), at(2 / 3), b >= NOW - 0.5 ? 'today' : at(1)].map((y) => `<span>${esc(y)}</span>`).join('');
  }
  // The written years a slider position stands for, rounded to what one step can tell apart.
  function sliderYear(v) {
    const a = L.fitMin, b = L.fitMax, t = a + ((b - a) * v) / STEPS;
    const unit = (b - a) / STEPS > 1 ? niceStep((b - a) / STEPS) : 1;
    let y = writtenOf(Math.round(t / unit) * unit);
    if (y === 0) y = 1;
    return y;
  }

  // A compact filter above the list: All, then the editors' topics (History,
  // Science and so on). A community view outside every topic sits under More.
  // Where the editors name no topics, the chips are the branches that have a view.
  const REST = '~';
  function chipList() {
    const views = boot?.views || [];
    const topics = boot?.topics || [];
    if (topics.length) return views.some((v) => !v.topic) ? [...topics, { id: REST, name: 'More' }] : topics;
    const have = new Set(views.map((v) => v.category).filter(Boolean));
    return (boot?.domains || []).filter((d) => (!d.parent || d.id === 'computing') && have.has(d.id));
  }
  const chipOf = (v) => (boot?.topics?.length ? v.topic || REST : v.category);
  function drawChips() {
    const list = chipList();
    const box = $('topics');
    box.hidden = !list.length || !!$('vq').value.trim();
    if (state.topic && !list.some((d) => d.id === state.topic)) state.topic = '';
    const chip = (id, name) => `<button type="button" role="radio" data-chip="${esc(id)}" aria-checked="${state.topic === id}">${esc(name)}</button>`;
    const ids = ['', ...list.map((d) => d.id)].join(',');
    // Redrawn only when the chips change, so the row keeps its sideways scroll.
    if (box.dataset.ids !== ids) { box.dataset.ids = ids; box.innerHTML = chip('', 'All') + list.map((d) => chip(d.id, d.name)).join(''); }
    else for (const b of box.querySelectorAll('[data-chip]')) b.setAttribute('aria-checked', b.dataset.chip === state.topic);
    requestAnimationFrame(chipEdges);
  }
  // A fade at either end of the row of chips says it scrolls.
  function chipEdges() {
    const c = $('topics'), bar = $('chipbar');
    bar.classList.toggle('more-l', c.scrollLeft > 2);
    bar.classList.toggle('more-r', c.scrollLeft < c.scrollWidth - c.clientWidth - 2);
  }

  // The list: the community views, in the editors' order, under a heading for
  // each topic, or narrowed to one by its chip. Search finds classical views too
  // (the map: everything, each branch, each kind), and entries and years.
  let found = [], active = -1;
  function runSearch() {
    const raw = $('vq').value.trim(), q = fold(raw);
    found = [];
    if (!q) {
      const mine = myView();
      if (mine && !state.topic) found.push({ mine });
      const chips = chipList(), heads = !state.topic && !!boot?.topics?.length;
      let last = null;
      for (const v of boot?.views || []) {
        const c = chipOf(v);
        if (state.topic && c !== state.topic) continue;
        if (heads && c !== last) { last = c; found.push({ head: chips.find((d) => d.id === c)?.name || 'More' }); }
        found.push({ v: viewById.get(v.id) || v });
      }
      found.push({ propose: true });
      active = -1;
    } else {
      // Community views at once; every view in the search index once it has arrived.
      const data = indexFor(raw, () => { if (fold($('vq').value.trim()) === q) runSearch(); });
      const seen = new Set(), scored = [];
      const consider = (v, name, hay) => {
        if (seen.has(v.id)) return;
        const s = name === q ? 5 : name.startsWith(q) ? 4 : name.includes(q) ? 3 : hay.includes(q) ? 2 : 0;
        if (s) { seen.add(v.id); scored.push({ v: viewById.get(v.id) || v, s }); }
      };
      for (const v of boot?.views || []) { const k = viewById.get(v.id); consider(k, fold(k.name), k.hay); }
      if (data) for (const v of data.views) consider(v, v.f, v.hay);
      scored.sort((a, b) => b.s - a.s || (a.v.type === 'classical') - (b.v.type === 'classical') || a.v.name.localeCompare(b.v.name));
      found = scored.slice(0, 10);
      // A year: jump to it when it is drawn, and list what began or ended in it.
      const y = parseYearQuery(q);
      if (y != null && L && lineYear(y) + 1 > L.tMin && lineYear(y) < L.tMax) found.unshift({ year: y });
      if (data) found.push(...(y != null ? entriesInYear(data, y, null, 6) : searchEntries(data, tokens(raw).join(' '), null, 5).map((e) => ({ e }))).map((a) => ({ e: a.e, how: a.how, y })));
      if (!data) found.push({ wait: true });
      active = found.length && !found[0].wait ? 0 : -1;
    }
    drawResults();
  }
  function mark(text, q) {
    const i = q ? fold(text).indexOf(q) : -1;
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }
  // A view's thumbnail, made by the build: its own picture, or a miniature of its lines.
  // A classical view known only from the search index shows the folded map until it is loaded.
  function thumb(v) {
    const t = v.thumb;
    if (!t) return `<span class="th-map">${ICON.map}</span>`;
    if (t.image) return `<img src="${esc(mediaUrl(t.image))}" alt="" loading="lazy">`;
    return `<svg class="th" viewBox="0 0 64 40" aria-hidden="true"><path class="dead" d="${esc(t.dead || '')}"/><path d="${esc(t.live || '')}"/></svg>`;
  }
  // What a view is, said quietly in one line: the years it covers and who wrote
  // it when that is not the editors, or where a classical view sits on the map.
  function viewSub(v) {
    const n = v.count != null ? `${group(v.count)} ${v.count === 1 ? 'entry' : 'entries'}` : '';
    if (v.type !== 'classical') {
      const by = v.author && v.author !== EDITORS ? 'by ' + (ownerTitle.get(v.author) || v.author) : '';
      return [v.span ? spanText(v.span[0], v.span[1]) : '', n, by].filter(Boolean).join(' · ');
    }
    const kind = cats.find((c) => c.view === v.id), dom = domById.get(v.id);
    const where = v.id === 'everything' ? 'The whole map' : kind ? `Kind · ${kind.domainName || ''}` : dom ? (dom.parent ? `Branch · ${domById.get(dom.parent)?.name || ''}` : 'Branch') : 'Classical view';
    return [where, n].filter(Boolean).join(' · ');
  }
  // A row shows its view alone. The small button at its end is the second action: it puts the
  // view beside the others, or takes it off again. A view on the timeline is drawn in its colour.
  function drawResults() {
    const q = fold($('vq').value.trim());
    const full = state.views.length + pending.size >= MAX_VIEWS;
    $('vlist').innerHTML = found.map(row).join('') || '<li class="none" role="presentation">No views here yet.</li>';
    const msg = noteText || (q && !found.length ? 'Nothing matches. Try a name, a topic or a year.' : '') || (!q && full ? `${MAX_VIEWS} views is the most at once. Remove one to add another.` : '');
    $('vnote').textContent = msg;
    function row(f, i) {
      let name, sub, tb, attrs = '', side = '';
      if (f.wait) return '<li class="none" role="presentation">Searching every view…</li>';
      if (f.head) return `<li class="vhead" role="presentation">${esc(f.head)}</li>`;
      if (f.mine) { name = 'Your view'; sub = f.mine.views.map((id) => viewById.get(alias.get(id) || id)?.name || id).join(', '); tb = `<span class="tb icon">${ICON.save}</span>`; }
      else if (f.propose) { name = 'Propose a view'; sub = 'Send the timeline you see now, or describe a new one'; tb = `<span class="tb icon">${ICON.plus}</span>`; }
      else if (f.year != null) { name = 'Go to ' + esc(yearText(f.year)); sub = 'On the timeline'; tb = `<span class="tb icon">${ICON.dot}</span>`; }
      else if (f.e) { name = mark(f.e.name, q); sub = `${esc(kindName(f.e.kind))} · ${f.how ? `<em class="yw">${esc(yearWord(f.e, f.how, f.how === 'born' ? f.e.born : f.e.end))}</em>` : esc(lineSpan(f.e))}${f.e.tier === 2 ? ' · community' : ''}`; tb = `<span class="tb icon">${ICON.dot}</span>`; }
      else {
        const v = f.v, on = state.views.includes(v.id), wait = pending.has(v.id), bad = broken.has(v.id);
        const kind = v.type === 'classical' ? 'classical' : 'community';
        // The icon tells the two sorts apart where a search mixes them; the list itself holds one sort.
        name = `<span>${mark(v.name, q)}</span>${q ? `<i title="${kind === 'classical' ? 'Classical view' : 'Community view'}">${ICON[kind]}</i>` : ''}`;
        sub = (on ? '<span class="st">On the timeline</span> · ' : wait ? '<span class="st">Loading…</span> · ' : bad ? '<span class="st bad">Could not load</span> · ' : '') + esc(viewSub(v));
        tb = `<span class="tb">${thumb(v)}</span>`;
        attrs = `${v.description ? ` title="${esc(v.description)}"` : ''} aria-checked="${on}"${on ? ` style="--c:var(--p${state.colors.get(v.id) % 8})"` : ''}${wait ? ' aria-busy="true" class="loading"' : ''}`;
        // Beside the others: add it, or take it off when it is one of several.
        if (on && state.views.length > 1) side = `<button type="button" class="radd" data-beside="${i}" aria-label="Take ${esc(v.name)} off the timeline" title="Take off the timeline">${ICON.xs}</button>`;
        else if (!on && !wait && state.views.length) side = `<button type="button" class="radd" data-beside="${i}" aria-label="Show ${esc(v.name)} beside ${state.views.length > 1 ? 'the others' : esc(viewById.get(state.views[0]).name)}" title="${full ? `${MAX_VIEWS} views is the most at once` : 'Show beside ' + (state.views.length > 1 ? 'the others' : esc(viewById.get(state.views[0]).name))}"${full ? ' disabled' : ''}>${ICON.plus}</button>`;
      }
      return `<li role="option" aria-selected="${i === active}"${attrs} data-i="${i}">${tb}<span class="r-txt"><b>${/^<span>/.test(name) ? name : `<span>${name}</span>`}</b><small>${sub}</small></span>${side}</li>`;
    }
  }
  // Picking a row shows its view alone. `beside` is the second action: add it to the others, or take it off.
  function pick(i, beside) {
    const f = found[i];
    if (!f || f.wait || f.head) return;
    if (f.mine) return loadMine(f.mine);
    if (f.propose) return void window.open(`${REPO}/issues/new?template=propose-view.yml&link=${encodeURIComponent(location.href)}`, '_blank', 'noopener');
    if (f.year != null) { $('vq').value = ''; runSearch(); if (matchMedia(PHONE).matches) showSide(false); return flashYear(f.year); }
    if (f.e) { $('vq').value = ''; runSearch(); return bringIn(f.e.id, { focus: true }); }
    if (pending.has(f.v.id)) return;
    if (beside) {
      if (!state.views.includes(f.v.id)) turnOn(f.v.id);
      else if (state.views.length > 1) { removeView(f.v.id); changed(); }
      return;
    }
    // On a phone the list is a sheet over the road: it steps aside to show what was picked.
    showOnly(f.v.id).then((got) => { if (got && matchMedia(PHONE).matches) showSide(false); });
  }

  // One saved view per visitor, kept in this browser. Saving again replaces it.
  function myView() {
    try { const v = JSON.parse(store.get('cg-mine') || 'null'); return v && Array.isArray(v.views) && v.views.length ? v : null; }
    catch (e) { return null; }
  }
  function saveMine() {
    if (!state.views.length) return;
    store.set('cg-mine', JSON.stringify({ views: state.views, level: state.level, order: state.order, span: state.span }));
    const b = $('save-mine');
    b.innerHTML = ICON.check; b.classList.add('done'); b.title = 'Saved as your view';
    setTimeout(() => { b.innerHTML = ICON.save; b.classList.remove('done'); b.title = 'Save as your view'; }, 1600);
    runSearch();
  }
  function loadMine(v) {
    Promise.all(v.views.map(loadView)).then(() => { if (play.on) pausePlay(); state.pinned.clear(); applyMine(v); road.t = road.target = null; road.vel = 0; drawReverse(); changed(); });
  }
  function applyMine(v) {
    setViews(v.views);
    state.level = clamp(Number(v.level) || 100, 5, 100);
    state.order = v.order === 'new' ? 'new' : 'old';
    state.span = Array.isArray(v.span) && v.span.length === 2 && v.span.every(Number.isFinite) ? v.span : null;
  }

  function changed() { render(); writeUrl(); }

  // ---------------------------------------------------------------- panel: history of one entry
  // A link to another entry: its name travels with the link, so it shows before that entry is loaded.
  function thingButton(id, name) { return `<button type="button" class="tlink" data-id="${esc(id)}">${esc(byId.get(id)?.name || name || id)}</button>`; }
  function figure(m, cls) {
    if (!m) return '';
    return `<figure class="${cls}"><img src="${esc(mediaUrl(m.src))}" alt="${esc(m.alt)}" loading="lazy"><figcaption>${m.caption ? esc(m.caption) + ' ' : ''}<a href="${esc(m.source)}" target="_blank" rel="noopener">${esc(m.credit)}</a> · ${esc(m.licence)}</figcaption></figure>`;
  }

  // The way back: Timeline / an era / an entry / another entry. Opening something
  // from inside the panel adds a step; opening it from the timeline starts over.
  function step(kind, key, opts) {
    const i = state.trail.findIndex((s) => s.kind === kind && s.key === key);
    if (i >= 0) state.trail.length = i + 1;
    else if (opts.push && state.pane !== 'views') state.trail.push({ kind, key });
    else state.trail = [{ kind, key }];
  }
  function crumbName(s) { return s.kind === 'thing' ? byId.get(s.key)?.name : erasNow().find((e) => e.key === s.key)?.name; }
  function crumbs() {
    const tr = state.trail, last = tr.length - 1;
    // Long trails keep the first and last two steps.
    const keep = (i) => tr.length <= 4 || i === 0 || i >= last - 1;
    let out = `<button type="button" class="crumb" data-crumb="-1">${ICON.back}Timeline</button>`;
    tr.forEach((s, i) => {
      if (!keep(i)) { if (i === 1) out += '<span class="sep" aria-hidden="true">/</span><span class="more">…</span>'; return; }
      out += '<span class="sep" aria-hidden="true">/</span>' + (i === last
        ? `<span class="crumb cur" aria-current="page">${esc(crumbName(s) || '')}</span>`
        : `<button type="button" class="crumb" data-crumb="${i}" title="${esc(crumbName(s) || '')}">${esc(crumbName(s) || '')}</button>`);
    });
    return `<nav class="crumbs" aria-label="Where you are in the panel">${out}</nav>`;
  }
  function goCrumb(i) {
    if (i < 0 || !state.trail[i]) return closeThing();
    const s = state.trail[i];
    state.trail.length = i + 1;
    if (s.kind === 'thing') return openThing(s.key, { scroll: true, keep: true });
    if (state.open) { state.open = null; history_replace(''); render(); }
    openEra(s.key, { keep: true });
  }

  function openThing(id, opts = {}) {
    const t = byId.get(id);
    // An entry not loaded yet (a link in the panel): fetch its detail file first.
    if (!t) { loadEntry(id).then((got) => { if (got) openThing(id, opts); }); return; }
    if (!opts.keep) step('thing', id, opts);
    state.open = id;
    if (!L || !L.at.has(id)) state.pinned.add(id);
    const w = t.words;
    const years = (t.end ?? NOW) - t.born;
    const status = t.status === 'dead' ? w.dead : t.status === 'fading' ? 'fading' : t.end != null ? w.dead : w.alive;
    const kind = `${esc(t.cat.name)}${t.dom ? ' · ' + esc(t.dom.name) : ''}`;
    const meta = `${esc(spanOf(t).replace(/^since (.*)$/, '$1 to today'))} · ${t.endEv ? 'lasted ' + fmtSpan(years) : fmtSpan(years) + ' so far'} · <b>${esc(status.toLowerCase())}</b>`;
    const labels = (t.labels || []).map((l) => labelName.get(l)).filter(Boolean);
    const aliases = (t.aliases || []).filter((a) => !t.names.some((n) => n.name === a));

    // Every dated thing we know, in date order.
    const rows = [];
    if (t.startEv) rows.push({ at: t.lead - 1e-6, kind: 'dot', title: 'Work begins', date: fmtDate(t.startEv.date, t.startEv.precision), note: t.startEv.note, url: t.startEv.url });
    rows.push({ at: t.born, kind: 'born', title: (t.bornEv.label || w.born) + (t.names.length > 1 ? ' as ' + t.names[0].name : ''), date: fmtDate(t.bornEv.date, t.bornEv.precision),
      note: t.bornEv.note || (t.maker ? 'By ' + t.maker + '.' : ''), image: t.bornEv.image, url: t.bornEv.url });
    for (const r of t.renames) rows.push({ at: r.t, kind: 'ren', title: 'Renamed ' + r.name, date: fmtDate(r.from), note: 'Until then it was ' + r.prev + '.' });
    for (const e of t.events.filter((x) => EVENT_TITLES[x.type] && x.date)) {
      rows.push({ at: parseDate(e.date), kind: 'tick', title: e.label || EVENT_TITLES[e.type], date: fmtDate(e.date, e.precision),
        note: (e.note || '') + (e.type === 'deprecated' ? ' From here the line is dotted.' : ''), image: e.image, url: e.url });
    }
    if (t.endEv) rows.push({ at: t.end + 1e-6, kind: 'end', title: w.ended, date: fmtDate(t.endEv.date, t.endEv.precision), note: t.endEv.note || t.cause || '', image: t.endEv.image, url: t.endEv.url });
    rows.sort((a, b) => a.at - b.at);
    if (t.afterEv) rows.push({ kind: 'dot', title: 'Afterlife', date: t.afterEv.until ? 'until ' + fmtDate(t.afterEv.until) : 'since then', note: t.afterEv.note, url: t.afterEv.url });
    const sym = {
      born: '<circle cx="7" cy="9" r="3" class="s-born"/>', end: '<rect x="1.5" y="8" width="11" height="2" class="s-fill"/>',
      ren: '<rect x="3.5" y="5.5" width="7" height="7" class="s-born" transform="rotate(45 7 9)"/>',
      tick: '<line x1="7" y1="9" x2="13" y2="9" class="s-line"/>', dot: '<circle cx="7" cy="9" r="1.5" class="s-dim"/>',
    };
    // Each entry is a button that takes the timeline to that moment on this line.
    const history = rows.map((r) => `<li><svg width="14" height="18" aria-hidden="true">${sym[r.kind]}</svg><div>` +
      (r.at != null ? `<button type="button" class="go" data-go="${r.at}" title="Show on the timeline">` : '<div>') +
      `<p class="ev-head"><b>${esc(r.title)}</b><time>${esc(r.date)}</time></p>${r.note ? `<p class="ev-note">${esc(r.note)}</p>` : ''}` +
      (r.at != null ? '</button>' : '</div>') +
      (r.url ? `<a class="ev-src" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(host(r.url))} ${ICON.out}</a>` : '') +
      `${figure(r.image, 'ev-img')}</div></li>`).join('');

    const rel = [];
    const relRow = (label, other, name, note) => `<div class="rel"><i>${esc(label)}</i>${thingButton(other, name)}<small>${note ? esc(note) : L && L.at.has(other) ? '' : 'not on screen'}</small></div>`;
    for (const l of t.links) rel.push(relRow(LINK_LABELS[l.type] || l.type.replace(/_/g, ' '), l.to, l.n, l.note));
    for (const l of t.inbound) rel.push(relRow(INBOUND_LABELS[l.type] || l.type.replace(/_/g, ' '), l.from, l.n, ''));

    const link = location.origin + location.pathname + '#' + t.id;
    const issue = `${REPO}/issues/new?title=${encodeURIComponent('Correction: ' + t.name)}&body=${encodeURIComponent(`Entry: ${t.id}\n\nWhat is wrong:\n\nSource for the correction:\n`)}`;
    const icon = tileIcon(t);
    const text = t.summary || (t.status === 'fading' ? t.note : '') || '';
    const official = (t.website ? [{ title: 'Official website', url: t.website }] : []).concat(t.official || []);
    const owner = t.owner ? ownerTitle.get(t.owner) || t.owner : 'a contributor';

    const onLine = L && L.at.get(id);
    $('p-thing').style.setProperty('--c', onLine ? `var(--p${state.colors.get(onLine.group.id) % 8})` : 'var(--acc)');
    $('p-thing').innerHTML = `
      <div class="pane-head">${crumbs()}<button class="ibtn" type="button" data-hide-side aria-label="Hide the panel">${ICON.x}</button></div>
      <div class="th-head"><span class="tile big">${icon}</span><div><p class="kind">${kind}</p><h2 id="thing-title" tabindex="-1">${esc(t.name)}</h2><p class="meta">${meta}</p></div></div>
      ${t.tier === 'community' ? `<p class="community-note">${ICON.community}<span>A community entry by <b>${esc(owner)}</b>. It is not yet in the reviewed base.</span></p>` : ''}
      ${figure(t.image, 'lead-img')}
      ${text ? `<p class="summary">${esc(text)}</p>` : ''}
      ${official.length ? `<p class="official">${official.map((o) => `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.title)} ${ICON.out}</a>`).join('')}</p>` : ''}
      ${aliases.length ? `<p class="fine">Also known as ${aliases.map(esc).join(', ')}.</p>` : ''}
      ${t.names.length > 1 ? `<p class="fine">Names over time: ${t.names.map((n) => `${esc(n.name)} (${esc(yearOfDate(n.from))})`).join(', ')}.</p>` : ''}
      ${labels.length ? `<p class="labels" aria-label="Labels">${labels.map((l) => `<span>${esc(l)}</span>`).join('')}</p>` : ''}
      <section><h3 class="cap">History</h3><ol class="history">${history}</ol></section>
      ${rel.length ? `<section><h3 class="cap">Connections</h3>${rel.join('')}</section>` : ''}
      <section><h3 class="cap">Sources</h3><ol class="sources">${(t.sources || []).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>${s.kind ? ` <small>${esc(s.kind)}</small>` : ''}</li>`).join('')}</ol>
        <p class="fine">${t.verified ? 'Dates checked against these sources.' : 'Its dates are not yet checked against a source.'}${t.topPct ? ` Ranked in the top ${t.topPct}% of ${esc(t.peers)}.` : ''}</p></section>
      <div class="pane-foot"><button type="button" class="btn" data-copy="${esc(link)}">Copy link</button><a class="btn" href="${esc(issue)}" target="_blank" rel="noopener">Suggest a correction</a></div>`;
    showPane('thing');
    if ($('side').hidden) showSide(true); else render();
    if (opts.scroll) roadToThing(id, !opts.jump);
    // Re-colour after render: the entry may have just been placed under a view.
    const placed = L && L.at.get(id);
    if (placed) $('p-thing').style.setProperty('--c', `var(--p${state.colors.get(placed.group.id) % 8})`);
    if (location.hash !== '#' + id) history_replace('#' + id);
    if (opts.focus !== false) $('thing-title').focus({ preventScroll: true });
  }
  function history_replace(hash) { history.replaceState(null, '', location.pathname + location.search + hash); }
  function closeThing() {
    if (!state.open && state.pane === 'views') return;
    state.open = null; state.era = null; state.trail = [];
    showPane('views');
    history_replace('');
    if (state.views.length) render();
  }

  // ---------------------------------------------------------------- panel: one era
  // What began and what ended in an era, among the entries of the views on the timeline.
  function openEra(key, opts = {}) {
    const c = erasNow().find((e) => e.key === key);
    if (!c) return;
    if (!opts.keep) step('era', key, opts);
    state.era = key;
    const from = c.a, to = c.b;
    const pool = new Set();
    for (const id of state.views) for (const t of viewById.get(id).members) pool.add(t);
    const list0 = [...pool];
    const colourOf = (t) => { const p = L && L.at.get(t.id); return p ? `var(--p${state.colors.get(p.group.id) % 8})` : 'var(--rule2)'; };
    const row = (t, date) => `<li style="--c:${colourOf(t)}"><i></i>${thingButton(t.id)}<small>${esc(date)}</small></li>`;
    const born = list0.filter((t) => t.born >= from && t.born < to).sort((a, b) => a.born - b.born);
    const ended = list0.filter((t) => t.end != null && t.end >= from && t.end < to).sort((a, b) => a.end - b.end);
    const lived = list0.filter((t) => t.born < from && (t.end ?? NOW) >= to).sort((a, b) => a.rank - b.rank).slice(0, 8);
    // The words of the entries listed, when they all share them; neutral words otherwise.
    const ws = new Set([...born, ...ended].map((t) => t.words));
    const w = ws.size === 1 ? [...ws][0] : NEUTRAL;
    const list = (title, arr, date) => arr.length ? `<section><h3 class="cap">${esc(title)} · ${arr.length}</h3><ul class="era-list">${arr.map((t) => row(t, date(t))).join('')}</ul></section>` : '';
    const n = c.to - c.from + 1 - (c.from < 0 && c.to > 0 ? 1 : 0);
    $('p-era').innerHTML = `
      <div class="pane-head">${crumbs()}<button class="ibtn" type="button" data-hide-side aria-label="Hide the panel">${ICON.x}</button></div>
      <div><h2 class="serif" id="era-title" tabindex="-1">${esc(c.name)}</h2><p class="era-years">${esc(c.years)} · ${fmtSpan(n)}${c.view ? ' · a chapter of ' + esc(c.view.name) : ''}</p></div>
      ${c.note ? `<p class="summary">${esc(c.note)}</p>` : ''}
      ${list(`${w.born} in these years`, born, (t) => fmtDate(t.bornEv.date, t.bornEv.precision))}
      ${list(`${w.ended} in these years`, ended, (t) => fmtDate(t.endEv.date, t.endEv.precision))}
      ${list('Carried on through it', lived, (t) => 'since ' + yearOfDate(t.bornEv.date))}
      ${!born.length && !ended.length ? '<p class="fine">Nothing in the views on the timeline began or ended in these years.</p>' : ''}
      <div class="pane-foot"><button type="button" class="btn solid" data-zoom="${c.from},${c.to}">Only these years</button><button type="button" class="btn" data-play-from="${c.a}">Play from ${esc(yearText(c.from))}</button></div>`;
    showPane('era');
    if ($('side').hidden) showSide(true);
    for (const el of document.querySelectorAll('[data-era]')) el.classList.toggle('hot', el.dataset.era === key);
    $('era-title').focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- play and scrub
  // Play carries the reader along the road; the marker on the bar is where
  // they stand. Drag it, or press play. The reader's place is road.t.
  const play = { on: false, drag: false };
  const ICON_PLAY = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>';
  const ICON_AGAIN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5v4.2h4.2"/></svg>';
  const ICON_PAUSE = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>';
  // The year the reader stands in, said as briefly as the bar says it.
  function playLabel(t) {
    const y = writtenOf(t);
    if (y > -1e5) return y > 0 ? String(y) : (-y) + ' BCE';
    return axisText(-sig(-y));
  }

  // From the far end, play starts again at the beginning.
  function startPlay(from) {
    if (!L) return;
    if (matchMedia(PHONE).matches) showSide(false);
    road.target = null;
    if (from != null) road.t = camClamp(Number(from) - camDir() * 0.1 * L.D);
    else if (camAtEnd()) road.t = road.prev = camDir() > 0 ? camClamp(Math.min(...L.lanes.map(laneStart)) - 0.25 * L.D) : camLimits()[1];
    play.on = true; road.pace = 1;
    drawPlay();
    roadKick();
  }
  function drawPlay() { if (L) roadHud(true); }
  function pausePlay() { play.on = false; drawPlay(); }
  function togglePlay() { if (play.on) pausePlay(); else startPlay(); }
  // Dragging along the bar moves the reader, playing or not.
  function scrubTo(e) {
    if (!L) return;
    road.target = null; road.vel = 0;
    road.t = camClamp(barT(e.clientY - $('axis').getBoundingClientRect().top));
    roadKick();
  }

  // The symbols, and where the data comes from. Opened from the panel's info button.
  // The words follow what is on the timeline: born and died for people, founded for places.
  function drawInfo() {
    const w = wordsNow();
    const neutral = w === NEUTRAL;
    const row = (svg, a, b) => `<li><svg width="28" height="28" aria-hidden="true">${svg}</svg><span><b>${esc(a)}</b><small>${esc(b)}</small></span></li>`;
    $('info').innerHTML = `<div class="pane-head"><h2>How to read the timeline</h2><button class="ibtn" type="button" data-info-close aria-label="Close">${ICON.x}</button></div><ul class="legend">` +
      row('<line x1="14" y1="2" x2="14" y2="16" class="s-line2"/><circle cx="14" cy="19" r="3" class="s-born2"/>', neutral ? 'Start' : w.born, neutral ? 'Where its life begins: a birth, a founding, a first release' : 'Where its line begins') +
      row('<line x1="14" y1="13" x2="14" y2="27" class="s-line2"/><rect x="8.5" y="12" width="11" height="2" class="s-fill2"/>', neutral ? 'End' : w.ended, neutral ? 'Where it ends: a death, a dissolution, an official end' : 'Where its line ends') +
      row('<line x1="14" y1="9" x2="14" y2="27" class="s-line2"/><circle cx="14" cy="9" r="3" class="s-fill2"/>', w.alive, 'The line reaches today') +
      row('<line x1="14" y1="14" x2="14" y2="27" class="s-line2"/><line x1="14" y1="1" x2="14" y2="14" class="s-line2 s-dots"/>', 'Dotted', 'Its end has been announced') +
      row('<line x1="14" y1="1" x2="14" y2="27" class="s-line2"/><line x1="14" y1="14" x2="21" y2="14" class="s-dim2"/>', 'Tick', 'A dated event in its life') +
      `</ul><p class="fine">Click a card or a name to read its full history. Years before the common era are marked BCE; deep time is counted in years ago (ka, Ma and Ga on the bar: thousands, millions and billions).</p>
      <p class="fine">Ranking weighs ${Object.entries(WEIGHTS).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')}. Dates are still being checked against sources. Release ${esc(boot?.release || '')}, ${group(boot?.counts?.entries || 0)} entries. <a href="${REPO}" target="_blank" rel="noopener">Data and code on GitHub</a>. Text and data <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>, code MIT; images credited to their authors.</p>`;
  }

  // ---------------------------------------------------------------- events
  function wire() {
    let rt = null, lastW = innerWidth, lastH = innerHeight;
    addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (innerWidth !== lastW || Math.abs(innerHeight - lastH) > 120) { lastW = innerWidth; lastH = innerHeight; sayScope(); if (state.views.length) render(); }
      }, 150);
    });

    document.addEventListener('click', (e) => {
      const el = (sel) => e.target.closest(sel);
      if (el('[data-hide-side]')) return showSide(false);
      const crumb = el('[data-crumb]');
      if (crumb) return goCrumb(Number(crumb.dataset.crumb));
      if (el('[data-info-close]')) { $('info').hidden = true; $('info-btn').setAttribute('aria-expanded', false); return; }
      const copy = el('[data-copy]');
      if (copy) {
        const was = copy.textContent;
        const done = () => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = was; }, 1600); };
        if (navigator.clipboard) navigator.clipboard.writeText(copy.dataset.copy).then(done, () => {}); else done();
        return;
      }
      const rm = el('[data-remove]');
      if (rm) { removeView(rm.dataset.remove); return changed(); }
      const br = el('[data-chip]');
      if (br) { state.topic = br.dataset.chip; drawChips(); runSearch(); $('vlist').scrollTop = 0; br.scrollIntoView({ inline: 'nearest', block: 'nearest' }); return; }
      const era = el('[data-era]');
      if (era && !el('#side')) return openEra(era.dataset.era);
      const zoom = el('[data-zoom]');
      if (zoom) {
        const [a, b] = zoom.dataset.zoom.split(',').map(Number);
        state.span = [a, b];
        if (matchMedia(PHONE).matches) showSide(false);
        return changed();
      }
      const playFrom = el('[data-play-from]');
      if (playFrom) return startPlay(playFrom.dataset.playFrom);
      const go = el('[data-go]');
      if (go) return jumpTo(state.open, Number(go.dataset.go));
      const beside = el('#vlist [data-beside]');
      if (beside) return pick(Number(beside.dataset.beside), true);
      const li = el('#vlist [data-i]');
      if (li) return pick(Number(li.dataset.i), e.shiftKey || e.ctrlKey || e.metaKey);
      // A name on the road opens its entry and brings the reader to it.
      const card = el('#road-labels [data-id]');
      if (card) { openThing(card.dataset.id, { focus: false }); return roadTo(Number(card.dataset.at)); }
      const thing = el('[data-id]');
      if (thing) return openThing(thing.dataset.id, { scroll: !!thing.closest('#side'), push: !!thing.closest('#side') });
    });

    $('toggle-side').addEventListener('click', () => showSide($('side').hidden));
    wireRoad();
    $('play').addEventListener('click', togglePlay);
    $('axis').addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (play.on) pausePlay();
      play.drag = true; $('axis').setPointerCapture(e.pointerId); $('axisbar').classList.add('dragging');
      scrubTo(e);
    });
    $('axis').addEventListener('pointermove', (e) => { if (play.drag) scrubTo(e); });
    for (const ev of ['pointerup', 'pointercancel']) $('axis').addEventListener(ev, () => { play.drag = false; $('axisbar').classList.remove('dragging'); drawPlay(); });
    $('axis').addEventListener('keydown', (e) => {
      // On the upright bar, up and right are ahead; Home is where the road begins for the reader.
      if (!L || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const [lo, hi] = camLimits(), fwd = camDir() > 0;
      if (e.key === 'Home' || e.key === 'End') { road.target = null; road.vel = 0; road.t = road.prev = (e.key === 'Home') === fwd ? lo : hi; if (play.on) pausePlay(); return roadKick(); }
      roadBy((e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1) * Math.max(0.3, (L.tMax - L.tMin) / L.D / 100), 8);
    });
    $('reverse').addEventListener('click', () => { state.order = state.order === 'new' ? 'old' : 'new'; drawReverse(); changed(); });
    $('info-btn').addEventListener('click', () => {
      const on = $('info').hidden;
      if (on) drawInfo();
      $('info').hidden = !on; $('info-btn').setAttribute('aria-expanded', on);
    });
    $('theme').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next; store.set('cg-theme', next); roadKick();
    });

    $('q').addEventListener('input', findOnTimeline);
    $('q').addEventListener('focus', () => { indexFor('a'); if ($('q').value) findOnTimeline(); });
    $('q').addEventListener('blur', () => setTimeout(() => drawHits(''), 150));
    $('q').addEventListener('keydown', (e) => {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && hits.length) { e.preventDefault(); hit = (hit + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; drawHits(fold($('q').value.trim())); }
      else if (e.key === 'Enter') { e.preventDefault(); goHit(Math.max(0, hit)); }
      else if (e.key === 'Escape') { e.stopPropagation(); $('q').value = ''; drawHits(''); $('q').blur(); }
    });
    $('qlist').addEventListener('pointerdown', (e) => { const li = e.target.closest('[data-h]'); if (li) { e.preventDefault(); goHit(Number(li.dataset.h)); } });
    $('vq').addEventListener('input', () => { drawChips(); runSearch(); });
    $('vq').addEventListener('focus', () => indexFor('a'));
    // A right click on a view puts it beside the others, like the plus at the end of its row.
    $('vlist').addEventListener('contextmenu', (e) => {
      const li = e.target.closest('[data-i]'), f = li && found[Number(li.dataset.i)];
      if (!f || !f.v) return;
      e.preventDefault();
      pick(Number(li.dataset.i), true);
    });
    $('topics').addEventListener('scroll', chipEdges, { passive: true });
    $('vq').addEventListener('keydown', (e) => {
      const ok = found.map((f, i) => i).filter((i) => !found[i].wait && !found[i].head);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!ok.length) return;
        const at = ok.indexOf(active);
        active = ok[(at + (e.key === 'ArrowDown' ? 1 : at < 0 ? 0 : -1) + ok.length) % ok.length];
        drawResults();
        $('vlist').querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
      }
      else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) pick(active, e.shiftKey); }
      else if (e.key === 'Escape' && $('vq').value) { e.stopPropagation(); $('vq').value = ''; drawChips(); runSearch(); }
    });

    // The bars redraw as they move, and record the link once let go.
    $('level').addEventListener('click', (e) => {
      const b = e.target.closest('[data-lv]');
      if (b) { state.level = Number(b.dataset.lv); changed(); }
    });
    const years = () => {
      if (!L) return;
      let a = Number($('y-from').value), b = Number($('y-to').value);
      if (a > b - 2) { if (document.activeElement === $('y-from')) a = b - 2; else b = a + 2; }
      const auto = Math.round(((L.autoMin - L.fitMin) / (L.fitMax - L.fitMin)) * STEPS);
      state.span = a === auto && b >= STEPS ? null : [a <= 0 ? writtenOf(L.fitMin) : sliderYear(a), b >= STEPS ? writtenOf(L.fitMax - 1e-9) : sliderYear(b)];
      if (state.span && state.span[0] >= state.span[1]) state.span[1] = state.span[0] + 1 || 1;
      render();
    };
    for (const id of ['y-from', 'y-to']) { $(id).addEventListener('input', years); $(id).addEventListener('change', writeUrl); }
    $('years-reset').addEventListener('click', () => {
      state.span = $('years-reset').dataset.mode === 'all' && L ? [writtenOf(L.fitMin), writtenOf(L.fitMax - 1e-9)] : null;
      changed();
    });
    $('save-mine').addEventListener('click', saveMine);
    $('filters-btn').addEventListener('click', () => {
      const open = $('filters').classList.toggle('open');
      $('filters-btn').setAttribute('aria-expanded', open);
    });

    // The pills: drag one to change the order of the lanes, tap its dot to
    // pick its colour, or shuffle every colour at once.
    $('shuffle').addEventListener('click', () => {
      const pool = [0, 1, 2, 3, 4, 5, 6, 7];
      let next;
      do {
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        next = state.views.map((id, i) => pool[i]);
      } while (state.views.every((id, i) => state.colors.get(id) === next[i]));
      state.views.forEach((id, i) => state.colors.set(id, next[i]));
      changed();
    });
    $('views-btn').addEventListener('click', () => { showPane('views'); showSide(true); if (!matchMedia(PHONE).matches) $('vq').focus(); });
    $('pills').addEventListener('scroll', pillEdges, { passive: true });
    $('pills').addEventListener('click', (e) => {
      const dot = e.target.closest('[data-colour]');
      if (!dot) return;
      e.stopPropagation();
      const sw = $('swatches'), id = dot.dataset.colour;
      if (!sw.hidden && sw.dataset.for === id) { sw.hidden = true; return; }
      const mine = state.colors.get(id) % 8;
      sw.dataset.for = id;
      sw.innerHTML = [0, 1, 2, 3, 4, 5, 6, 7].map((n) =>
        `<button type="button" role="option" data-swatch="${n}" aria-selected="${n === mine}" style="--c:var(--p${n})" aria-label="Colour ${n + 1}"></button>`).join('');
      sw.hidden = false;
      // The colours open just above the dot, kept inside the strip.
      const box = $('dock').getBoundingClientRect(), r = dot.getBoundingClientRect();
      sw.style.left = clamp(r.left - box.left - 6, 4, box.width - sw.offsetWidth - 4) + 'px';
    });
    $('swatches').addEventListener('click', (e) => {
      const b = e.target.closest('[data-swatch]');
      if (!b) return;
      const id = $('swatches').dataset.for, n = Number(b.dataset.swatch);
      // A colour already in use moves to the view that gave its own up.
      const other = state.views.find((v) => v !== id && state.colors.get(v) === n);
      if (other) state.colors.set(other, state.colors.get(id));
      state.colors.set(id, n);
      changed();
    });
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#swatches, [data-colour]')) $('swatches').hidden = true; });

    // Dragging a pill reorders the lanes. With a mouse it starts at once. A finger scrolls the
    // strip, so there a pill is picked up by holding it for a moment first.
    let pillDrag = null;
    const HOLD = 350;
    $('pills').addEventListener('pointerdown', (e) => {
      const pill = e.target.closest('[data-pill]');
      if (!pill || e.target.closest('button') || e.button !== 0 || state.views.length < 2) return;
      const touch = e.pointerType === 'touch';
      const d = pillDrag = { pill, id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, armed: !touch, timer: 0 };
      if (!touch) { e.preventDefault(); pill.setPointerCapture(e.pointerId); return; }
      d.timer = setTimeout(() => {
        if (pillDrag !== d) return;
        d.armed = true; pill.classList.add('dragging');
        try { pill.setPointerCapture(d.id); } catch (err) { /* the finger has gone */ }
      }, HOLD);
    });
    $('pills').addEventListener('pointermove', (e) => {
      const d = pillDrag;
      if (!d || e.pointerId !== d.id) return;
      const far = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
      // A finger that moves before the hold is over is scrolling the strip.
      if (!d.armed) { if (far > 8) { clearTimeout(d.timer); pillDrag = null; } return; }
      if (!d.moved && far < 4) return;
      d.moved = true; d.pill.classList.add('dragging');
      // Move the pill before, or after, the pill under the pointer.
      for (const o of $('pills').querySelectorAll('[data-pill]')) {
        if (o === d.pill) continue;
        const r = o.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right) continue;
        const before = e.clientX < r.left + r.width / 2;
        if (before && o.previousElementSibling !== d.pill) o.before(d.pill);
        else if (!before && o.nextElementSibling !== d.pill) o.after(d.pill);
        break;
      }
    });
    // While a pill is held, the finger moves the pill and not the strip.
    $('pills').addEventListener('touchmove', (e) => { if (pillDrag && pillDrag.armed) e.preventDefault(); }, { passive: false });
    const dropPill = (e) => {
      const d = pillDrag;
      if (!d || (e && e.pointerId !== d.id)) return;
      clearTimeout(d.timer);
      pillDrag = null; d.pill.classList.remove('dragging');
      if (!d.moved) return;
      const order = [...$('pills').querySelectorAll('[data-pill]')].map((p) => p.dataset.pill);
      if (order.join() !== state.views.join()) { state.views = order; changed(); }
    };
    $('pills').addEventListener('pointerup', dropPill);
    $('pills').addEventListener('pointercancel', dropPill);
    addEventListener('keydown', (e) => {
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) { e.preventDefault(); $('q').focus(); }
    });

    addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      if (e.key === ' ' && !typing && !e.target.closest('button, a')) { e.preventDefault(); return togglePlay(); }
      if (e.key !== 'Escape') return;
      if (play.on) pausePlay();
      else if (!$('info').hidden) { $('info').hidden = true; $('info-btn').setAttribute('aria-expanded', false); }
      else if (state.pane !== 'views') goCrumb(state.trail.length - 2);
      else showSide(false);
    });
    addEventListener('hashchange', () => followHash(true));
  }
  function drawReverse() {
    const b = $('reverse'), rev = state.order === 'new';
    b.setAttribute('aria-pressed', rev);
    b.setAttribute('aria-label', rev ? 'Turn round and face the future' : 'Turn round and face the past');
    b.title = rev ? 'Facing the past' : 'Facing the future';
  }

  // "#1969" or "#-44" goes to a year; "#<id>" opens an entry, fetching it and
  // adding its view when it is not on the timeline yet.
  function followHash(smooth) {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) return false;
    if (/^-?\d{1,11}$/.test(h) && Number(h) !== 0) { flashYear(Number(h)); return true; }
    if (byId.has(h) && (L && L.at.has(h) || state.pinned.has(h))) { if (state.open !== h) openThing(h, { scroll: true, focus: smooth }); return true; }
    if (/^[a-z0-9][a-z0-9-]*$/.test(h)) { bringIn(h, { focus: smooth, quiet: !smooth, beside: !smooth && urlViews().length > 0 }); return true; }
    return false;
  }

  // ---------------------------------------------------------------- start
  // boot.json and the views the page opens on are asked for at the same time.
  async function start() {
    const ids = urlViews();
    const mine = ids.length ? null : myView();
    bootReady = getJSON('boot.json').then(useBoot);
    let asked = ids.length ? ids : mine ? mine.views : null;
    const viewsReady = asked ? Promise.all(asked.map(loadView))
      : Promise.all([getJSON('home.json'), bootReady]).then(([home]) => (home.views || []).map((p) => useView(p).id));
    try {
      await bootReady;
    } catch (e) {
      $('status').textContent = 'The timeline data could not be loaded. Please reload the page.';
      return;
    }
    let got = (await viewsReady.catch(() => [])).filter(Boolean);
    // A link whose views cannot be read falls back to the views the page opens on.
    if (!got.length && asked) {
      if (ids.length) note('The views in this link could not be loaded.');
      asked = null;
      got = await Promise.all([getJSON('home.json')]).then(([home]) => (home.views || []).map((p) => useView(p).id)).catch(() => []);
    }
    if (ids.length && got.length) readUrl(got);
    else if (mine && asked) applyMine({ ...mine, views: got });
    else setViews(got.length ? got : [].concat(boot.default || []));
    if (ids.length && got.length < ids.length) note('Some views in this link could not be loaded.');
    wire();
    drawReverse();
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
    if (!state.views.length) $('status').textContent = 'The timeline data could not be loaded. Please reload the page.';
    render();
    if (ids.length) writeUrl();
    spansNote();
    followHash(false);     // otherwise the road opens where roadOpening() says
  }
  start();
})();
