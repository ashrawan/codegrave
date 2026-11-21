/* codegrave — one scrolling timeline of everything, from first to last.
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
  const MAX_VIEWS = 8;
  const LEVELS = [
    { name: 'Landmarks', pct: 10 }, { name: 'Notable', pct: 30 },
    { name: 'Most', pct: 60 }, { name: 'All', pct: 100 },
  ];
  const MAX_ROWS = 160;         // the most lines drawn at once
  const CARD_RANK = 10;        // entries in the top tenth of their peers get a card
  const MIN_LINE = 8;          // the shortest a line is drawn, in pixels, however brief its life
  const MAX_SCREENS = 4, MAX_SCREENS_PHONE = 6;   // the widest a long view is fitted to
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
  // Drawn between lines. A branch leaves the older line and starts the newer
  // one. A handover leaves a line and joins the one that carries on. Every
  // other link is only listed in the panel.
  const BRANCH = ['forked_from', 'spun_off_from', 'version_of', 'extends', 'built_on'];
  const HANDOVER = ['succeeded_by', 'merged_into', 'open_sourced_as'];
  const EVENT_TITLES = { released: 'Release', changed_hands: 'Changed hands', milestone: 'Milestone', deprecated: 'End announced' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // The words for an entry whose branch is unknown, and for text about many kinds at once.
  const NEUTRAL = { born: 'Began', ended: 'Ended', alive: 'Still going', dead: 'Ended', from: 'begun in' };
  const TOP = 52;   // height of the fixed top bar
  // Height of what is fixed along the bottom: the axis, and the strip of views under it (hidden on a phone while the panel is open).
  const bottomH = () => $('axisbar').offsetHeight + $('dock').offsetHeight;
  // On a phone the open panel is a sheet over the lower half; what is drawn fits above it.
  const PHONE = '(max-width: 699px)';
  const sheetH = () => (!$('side').hidden && matchMedia(PHONE).matches ? $('side').offsetHeight : 0);
  // The timeline scrolls inside #stage, both ways, so the page itself always lays out at the width of the screen.
  const S = () => $('stage');
  const sx = () => S().scrollLeft, sy = () => S().scrollTop;
  const viewH = () => S().clientHeight;
  const stageTo = (o) => S().scrollTo(o);

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
    const n = group(boot.counts?.entries || 0), books = (boot.views || []).length;
    $('q').placeholder = matchMedia(PHONE).matches ? `Search ${n} entries` : `Search ${n} entries: a person, a place, an event or a year`;
    $('vscope').textContent = `${group(books)} community views · ${n} entries`;
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

  // The width of an era title as drawn (uppercase, letter-spaced name, then the years),
  // measured with the page's own font so a title never runs past the edge.
  let measureCtx = null;
  function eraTitleWidth(c) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    const font = getComputedStyle(document.body).fontFamily;
    measureCtx.font = `600 11px ${font}`;
    const name = c.name.toUpperCase();
    const nameW = measureCtx.measureText(name).width + name.length * 0.88;
    measureCtx.font = `400 11px ${font}`;
    const yearsW = measureCtx.measureText(c.years).width;
    return Math.ceil(2 + 8 + nameW + 7 + yearsW + 8 + 4);
  }

  // The named eras. Each belongs to a view and sits in its section, in its colour.
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
    level: 100, order: 'old',  // everything that fits, oldest at the top
    pinned: new Set(), open: null, pane: 'views', era: null, trail: [],
    span: null,               // [from, to] written years when the reader narrows the timeline
    sizes: new Map(),         // view id -> height in pixels the reader dragged its section's rows to
    fit: true,                // sections share the height of the screen; false: each takes what it needs
    branch: '',               // the branch the list of views is narrowed to, '' for all
    mode: 'road',             // 'road': the timeline in depth; 'flat': left to right (?m=flat)
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
  // Fetches a view if needed, then puts it on the timeline. The list shows it loading meanwhile.
  function turnOn(id, done) {
    const real = alias.get(id) || id;
    if (state.views.includes(real) || pending.has(real)) return Promise.resolve(real);
    if (state.views.length + pending.size >= MAX_VIEWS) return Promise.resolve(null);
    pending.add(real); broken.delete(real);
    if (L || !state.views.length) drawResults();
    return loadView(real).then((got) => {
      pending.delete(real);
      if (got && addView(got)) { if (done) done(got); else { changed(); scrollToView(got); } spansNote(); }
      else { if (!got) note(`“${viewById.get(real)?.name || real}” could not be loaded. Try again in a moment.`); drawResults(); }
      return got;
    });
  }
  function removeView(id) {
    state.views = state.views.filter((v) => v !== id);
    state.colors.delete(id); state.sizes.delete(id);
  }
  function setViews(ids) {
    state.views = []; state.colors.clear(); state.sizes.clear();
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
    if (q.get('h') === 'expand') state.fit = false;
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
    if (!state.fit) q.set('h', 'expand');
    if (state.mode === 'flat') q.set('m', 'flat');
    if (state.views.some((id, i) => state.colors.get(id) !== i)) q.set('c', state.views.map((id) => state.colors.get(id)).join(','));
    history.replaceState(null, '', '?' + q.toString().replace(/%2C/g, ',').replace(/%2F/g, '/') + location.hash);
  }

  // ---------------------------------------------------------------- layout
  // Time runs left to right with the years along the bottom. Each view on the
  // timeline owns a block of rows, one row per entry. An entry that is in two
  // views is drawn in both, so every view shows all of its own entries.
  const PAD_L = 84, PAD_PHONE = 72;  // room at the ends of the axis for play and reverse
  // What is drawn, and over which years: the same for the flat timeline and the road.
  function chosen() {
    const groupsOf = new Map();   // entry -> the views on the timeline that hold it
    const selected = state.views.map((id) => viewById.get(id));
    const join = (t, v) => { const gs = groupsOf.get(t); if (!gs) groupsOf.set(t, [v]); else if (!gs.includes(v)) gs.push(v); };
    for (const v of selected) for (const t of membersOf(v, state.level)) join(t, v);
    for (const id of state.pinned) {
      const t = byId.get(id);
      if (t && !groupsOf.has(t)) join(t, selected.find((v) => v.id === t.home) || selected.find((v) => holds(v, t)) || selected[selected.length - 1]);
    }
    // Rows are capped so the page stays fast at any data size: the best ranked come first.
    // The cap counts rows, so an entry drawn in two views counts twice.
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
  function layout() {
    const SW = $('stage').clientWidth;
    const narrow = SW < 700;
    const newest = state.order === 'new';
    const { selected, groupsOf, rowsOf, all, fitMin, fitMax, autoMin, tMin, tMax, inSpan } = chosen();
    const pad = narrow ? PAD_PHONE : PAD_L;
    // A straight scale: short views fill the screen, middling ones get at least
    // 9 pixels a year, and long ones are fitted to a few screens at most.
    const avail = SW - 2 * pad, years = tMax - tMin;
    // A view with few lines gets fewer screens, so it is not mostly empty years.
    const screens = clamp(all.length / 10, 1.5, narrow ? MAX_SCREENS_PHONE : MAX_SCREENS);
    const ppy = Math.max(avail / years, Math.min(narrow ? 10 : 9, (avail * screens) / years));
    const W = Math.round(2 * pad + years * ppy);
    const xOf = (t) => Math.round((pad + (newest ? tMax - clamp(t, tMin, tMax) : clamp(t, tMin, tMax) - tMin) * ppy) * 10) / 10;
    const tOf = (x) => clamp(newest ? tMax - (x - pad) / ppy : tMin + (x - pad) / ppy, tMin, tMax);

    // A view's era titles sit at the top of its section, on as many lines as they need.
    const placeEras = (list) => {
      const out = list.filter((c) => c.b > tMin && c.a < tMax).map((c) => {
        const a = xOf(c.a), b = xOf(Math.min(c.b, tMax));
        return { c, x: Math.min(a, b), w: Math.max(2, Math.abs(a - b)), tw: eraTitleWidth(c) };
      });
      const lineEnds = [];
      for (const e of out) {
        const x = clamp(e.x + 4, 4, W - e.tw - 4);
        let n = lineEnds.findIndex((end) => end < x - 8);
        if (n < 0) { n = lineEnds.length; lineEnds.push(0); }
        lineEnds[n] = x + e.tw; e.tx = x; e.line = n;
      }
      return { list: out, lines: lineEnds.length };
    };
    const eras = [];            // every era belongs to a view and sits in its section
    const eraH = 8;

    // Rows: inside a block, by kind, then by start, with linked entries side by side.
    const drawn = (l) => BRANCH.includes(l.type) || HANDOVER.includes(l.type);
    const rowH = (t) => (t.rank < CARD_RANK ? 62 : 34);
    const byRank = (a, b) => (state.pinned.has(b.id) - state.pinned.has(a.id)) || (a.rank - b.rank) || (b.score - a.score);
    const secs = [];
    for (const g of selected) {
      // A community view reads as a story, in order of time; a classical view groups by kind first.
      const story = g.type !== 'classical';
      const mine = all.filter((t) => rowsOf.get(g).has(t) && inSpan(t)).sort((a, b) => (story ? 0 : a.cat.i - b.cat.i) || ((a.lead ?? a.born) - (b.lead ?? b.born)));
      if (!mine.length) continue;
      const set = new Set(mine), seen = new Set(), ordered = [];
      const near = (t) => [
        ...t.links.filter(drawn).map((l) => byId.get(l.to)),
        ...t.inbound.filter(drawn).map((l) => byId.get(l.from)),
      ].filter((o) => o && set.has(o)).sort((a, b) => a.born - b.born);
      const visit = (t) => { if (seen.has(t)) return; seen.add(t); ordered.push(t); near(t).forEach(visit); };
      mine.forEach(visit);
      const own = placeEras(viewEras(g));
      const head = 30 + (own.list.length ? own.lines * 26 + 8 : 0);
      secs.push({ g, ordered, own, head, need: ordered.reduce((n, t) => n + rowH(t), 0) });
    }

    // How tall each section's rows may be. Expand: everything, or the height the
    // reader dragged it to. Fit: the sections share the height of the screen,
    // each taking what it needs up to an even share; a dragged section keeps its height.
    // The rows a section keeps for a given height: its best ranked, in their usual order.
    const fill = (c) => {
      c.rows = c.ordered; c.used = c.need;
      if (c.budget >= c.need) return;
      const keep = new Set();
      let used = 0;
      for (const t of [...c.ordered].sort(byRank)) {
        if (keep.size && used + rowH(t) > c.budget) continue;
        keep.add(t); used += rowH(t);
      }
      c.rows = c.ordered.filter((t) => keep.has(t)); c.used = used;
    };
    if (state.fit) {
      const room = viewH() - (eraH + 6) - 12 - secs.reduce((n, c) => n + c.head + 24, 0);
      let pool = room, open = [];
      for (const c of secs) {
        const want = state.sizes.get(c.g.id);
        if (want != null) { c.budget = Math.min(want, c.need); pool -= c.budget; } else open.push(c);
      }
      while (open.length) {
        const share = Math.max(0, pool) / open.length;
        const small = open.filter((c) => c.need <= share);
        if (!small.length) { for (const c of open) c.budget = share; break; }
        for (const c of small) { c.budget = c.need; pool -= c.need; }
        open = open.filter((c) => c.need > share);
      }
      secs.forEach(fill);
      // Rows come in whole heights, so hand what is left over to sections that want more.
      let spare = room - secs.reduce((n, c) => n + c.used, 0);
      for (const c of secs) {
        if (spare < 34 || c.used >= c.need || state.sizes.has(c.g.id)) continue;
        const was = c.used;
        c.budget = c.used + spare; fill(c); spare -= c.used - was;
      }
    } else {
      for (const c of secs) { c.budget = state.sizes.get(c.g.id) ?? Infinity; fill(c); }
    }

    const groups = [], shown = [];
    const dir = newest ? -1 : 1, lo = pad / 2, hi = W - pad / 2;
    let y = eraH + 6;
    for (const c of secs) {
      const { g, ordered, own, rows } = c;
      const grp = { view: g, y, n: rows.length, total: ordered.length, eras: own.list };
      groups.push(grp);
      y += 30;
      if (own.list.length) { grp.eraY = y + 2; y += own.lines * 26 + 8; }
      grp.rowsY = y;
      for (const t of rows) {
        const major = t.rank < CARD_RANK;
        const p = { t, major, group: g, y: Math.round(y + (major ? 36 : 22)) };
        p.alive = t.end == null;
        p.xBorn = xOf(t.born); p.xEnd = xOf(t.end ?? NOW);
        // However brief, a line stays long enough to see: it runs on past its
        // end, or, at the edge of the years, starts a little earlier.
        if (Math.abs(p.xEnd - p.xBorn) < MIN_LINE) {
          p.short = true;
          p.xEnd = p.xBorn + dir * MIN_LINE;
          if (p.xEnd > hi || p.xEnd < lo) { p.xEnd = clamp(p.xEnd, lo, hi); p.xBorn = p.xEnd - dir * MIN_LINE; }
        }
        p.xL = Math.min(p.xBorn, p.xEnd); p.xR = Math.max(p.xBorn, p.xEnd);
        shown.push(p);
        y += rowH(t);
      }
      grp.end = y + 6;
      y += 18;
    }
    const height = Math.max(Math.round(y + 12), viewH());
    L = { W, SW, narrow, height, ppy, tMin, tMax, fitMin, fitMax, autoMin, xOf, tOf, newest, shown, groups, eras, eraH,
      at: new Map([...shown].reverse().map((p) => [p.t.id, p])), total: groupsOf.size };
    return L;
  }

  // The years along the axis: a step that suits the span, labels that never
  // touch, BCE marked, and deep time in thousands, millions or billions of years.
  // `ppy` is pixels per year; `gap` is the room a label needs along the axis (its width, when not given).
  function axisTicks(ppy = L.ppy, gap = 0) {
    const { tMin, tMax } = L;
    const atNow = tMax >= NOW - 0.01;
    const yMin = writtenOf(tMin), yMax = writtenOf(tMax - 1e-9);
    const width = (s) => s.length * 7 + 18;
    const widest = Math.max(width(axisText(yMin)), width(axisText(yMax, 0, yMin < 0)), width(axisText(Math.round((yMin + yMax) / 2))), 44);
    // Steps grow 1, 2, 5, 10, 25, 50, 100, 250, 500, 1,000 … until labels have room.
    let step = niceStep((gap || widest) / ppy);
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
  function render(keepX) {
    if (!state.views.length) return renderEmpty();
    if (state.mode === 'road') return renderRoad();
    const anchor = keepX ?? (L && L.W > L.SW ? L.tOf(sx() + L.SW / 2) : null);
    layout();
    const { W, height, xOf, newest, shown, tMin, tMax, eras } = L;
    const dx = newest ? -1 : 1;                  // +1 when later times are further right
    $('canvas').style.width = W + 'px';
    $('canvas').style.height = height + 'px';
    $('canvas').classList.toggle('has-open', !!state.open && L.at.has(state.open));

    // The year grid, the line for today, and the years on the axis.
    let html = '';
    const ax = axisTicks();
    let axis = '';
    const xNow = xOf(NOW);
    for (const yr of ax.ticks) {
      const x = xOf(lineYear(yr));
      html += `<div class="rule" style="left:${x}px"></div>`;
      if (ax.atNow && Math.abs(x - xNow) < ax.widest * 0.75) { axis += `<i class="tk big" style="left:${x}px"></i>`; continue; }
      axis += `<span class="yr" style="left:${x}px">${esc(axisText(yr, ax.step, ax.ce))}</span>`;
    }
    for (const yr of ax.marks) axis += `<i class="tk" style="left:${xOf(lineYear(yr))}px"></i>`;
    if (ax.atNow) { html += `<div class="rule now" style="left:${xNow}px"></div>`; axis += `<span class="yr now" style="left:${xNow}px">Today</span>`; }
    const unit = $('axis-unit');
    unit.textContent = ax.units.map((u) => `${u}: ${AXIS_UNITS[u]} years ago`).join(' · ');
    unit.hidden = !ax.units.length;
    // Each view's own eras: a band down its section and a title in its colour.
    for (const g of L.groups) {
      const c = `--c:var(--p${state.colors.get(g.view.id) % 8})`;
      for (const e of g.eras) {
        html += `<div class="band own" data-era="${esc(e.c.key)}" style="${c};left:${e.x}px;width:${e.w}px;top:${g.y + 8}px;height:${g.end - g.y - 8}px"></div>`;
        html += `<button type="button" class="band-title own" data-era="${esc(e.c.key)}" style="${c};left:${e.tx}px;top:${g.eraY + e.line * 26}px" title="${esc(e.c.note || '')}">` +
          `<b>${esc(e.c.name)}</b><span>${esc(e.c.years)}</span></button>`;
      }
    }
    for (const e of eras) html += `<div class="band" data-era="${esc(e.c.key)}" style="left:${e.x}px;width:${e.w}px"></div>`;
    $('bands').innerHTML = html;
    $('ticks').innerHTML = axis;
    $('axis-in').style.width = W + 'px';

    // View names head their block of rows.
    // Below each section, a grip that drags the section taller or shorter.
    let labs = L.groups.map((g) => {
      const c = `--c:var(--p${state.colors.get(g.view.id) % 8})`, more = g.total - g.n;
      return `<div class="head" style="top:${g.y + 8}px;${c}"><span>${esc(g.view.name)}</span></div>` +
        `<div class="grip" data-grip="${esc(g.view.id)}" style="top:${g.end + 2}px;${c}" title="Drag to resize. Double-click to show all." role="separator" aria-orientation="horizontal" aria-label="Resize ${esc(g.view.name)}">` +
        `<i></i>${more > 0 ? `<span title="${more} more. Drag down to show them">+${more}</span>` : ''}</div>`;
    }).join('');

    // Links first, so the lines are drawn over them.
    let svg = '';
    const covers = (p, t) => t >= p.t.born - 0.01 && t <= (p.t.end ?? NOW) + 0.01;
    for (const p of shown) {
      for (const l of p.t.links) {
        const branch = BRANCH.includes(l.type);
        if (!branch && !HANDOVER.includes(l.type)) continue;
        const o = shown.find((q) => q.t.id === l.to && q.group === p.group);
        if (!o || o === p) continue;
        const when = l.date ? parseDate(l.date) : branch ? p.t.born : p.t.end;
        // A link to a far-off row would cut across everything between; the history still lists it.
        if (when == null || !covers(o, when) || Math.abs(p.y - o.y) > 240 || when < tMin || when > tMax) continue;
        const x = xOf(when), s = p.y > o.y ? 1 : -1, r = 8;
        // A branch leaves the older line a little earlier and drops into the newer one.
        // A handover leaves this line and curves forward in time into the other.
        const d = branch
          ? `M${x - r * dx} ${o.y}Q${x} ${o.y} ${x} ${o.y + r * s}V${p.y - 4 * s}`
          : `M${x} ${p.y}V${o.y + r * s}Q${x} ${o.y} ${x + r * dx} ${o.y}`;
        const hot = state.open === p.t.id || state.open === o.t.id;
        svg += `<path class="link${hot ? ' open' : ''}" d="${d}" data-a="${p.t.id}" data-b="${o.t.id}"/>`;
        if (Math.abs(p.y - o.y) >= 50) labs += `<span class="link-lab${hot ? ' open' : ''}" style="left:${x + 5}px;top:${(p.y + o.y) / 2 - 7}px">${LINK_LABELS[l.type]}</span>`;
      }
    }
    shown.forEach((p, k) => {
      const { t, y } = p;
      const cls = 'thing' + (p.major ? ' major' : '') + (p.alive ? '' : ' dead') + (state.open === t.id ? ' open' : '');
      const cvar = `--c:var(--p${state.colors.get(p.group.id) % 8})`;
      const seg = (a, b, c) => `<line class="${c}" x1="${a}" x2="${b}" y1="${y}" y2="${y}"/>`;
      const inLine = (x) => clamp(x, p.xL, p.xR);
      let g = `<title>${esc(t.name)}</title>`;
      if (t.lead != null && t.lead < t.born && !p.short) g += seg(xOf(t.lead), p.xBorn, 'lead');
      if (t.dep != null && !p.alive && !p.short) g += seg(p.xBorn, inLine(xOf(t.dep)), 'life') + seg(inLine(xOf(t.dep)), p.xEnd, 'life fade');
      else g += seg(p.xBorn, p.xEnd, 'life');
      if (t.after != null && !p.alive && Math.abs(xOf(t.after) - p.xEnd) > 8) g += seg(p.xEnd + 6 * dx, xOf(t.after), 'after');
      g += `<line class="hit" x1="${p.xL - 4}" x2="${p.xR + 4}" y1="${y}" y2="${y}"/>`;
      // A line that runs past the edge of the years shown just reaches the edge.
      if (t.born >= tMin) g += `<circle class="born" cx="${p.xBorn}" cy="${y}" r="3"/>`;
      if (p.alive ? tMax >= NOW - 0.01 : t.end <= tMax) g += p.alive ? `<circle class="alive" cx="${p.xEnd}" cy="${y}" r="3"/>` : `<rect class="end" x="${p.xEnd - 1}" y="${y - 5.5}" width="2" height="11"/>`;
      // Dated points. A major row has room under its line to say what each one is.
      let lastLab = -1e9, lastMark = -1e9;
      const ends = [p.xBorn, p.xEnd];
      for (const m of t.marks) {
        if (m.t < tMin || m.t > tMax || p.short) continue;
        const x = xOf(m.t);
        if (ends.some((e) => Math.abs(x - e) < 6) || Math.abs(x - lastMark) < 6) continue;   // too close to another mark to read
        lastMark = x;
        g += m.kind === 'ren'
          ? `<rect class="ren" x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" transform="rotate(45 ${x} ${y})"/>`
          : `<line class="mark" x1="${x}" x2="${x}" y1="${y}" y2="${y + 6}"/>`;
        if (!p.major || !m.label) continue;
        const w = 6.2 * (m.label.length + m.date.length) + 14;
        const lx = newest ? x - w : x;
        if (dx > 0 ? lx < lastLab + 8 : lx + w > lastLab - 8) continue;
        if (lx < 4 || lx + w > W - 4) continue;
        lastLab = dx > 0 ? lx + w : lx;
        labs += `<span class="mark-lab${newest ? ' rev' : ''}" data-of="${t.id}" style="left:${x}px;top:${y + 8}px" title="${esc(m.note)}"><b>${esc(m.label)}</b> <i>${esc(m.date)}</i></span>`;
      }
      svg += `<g class="${cls}" data-id="${t.id}" style="${cvar}">${g}</g>`;

      // The name sits above the start of the line: a card for the major entries, a quiet label for the rest.
      const years = spanOf(t);
      const open = state.open === t.id ? ' open' : '';
      const lead = t.lead != null && !p.short ? xOf(t.lead) : null;
      const x0 = newest ? Math.max(p.xR, lead ?? p.xR) : Math.max(4, Math.min(p.xL, lead ?? p.xL));
      const tag = t.tier === 'community' ? '<em class="ctag" title="Community entry">community</em>' : '';
      if (p.major) {
        labs += `<button type="button" class="card${open}" data-id="${t.id}" data-k="${k}" style="${cvar};left:${x0}px;top:${y - 36}px">` +
          `<span class="tile">${tileIcon(t)}</span><b>${esc(t.name)}</b><small>${esc(years)}</small>${tag}</button>`;
      } else {
        labs += `<button type="button" class="nm${p.alive ? '' : ' dead'}${open}" data-id="${t.id}" data-k="${k}" style="${cvar};left:${x0}px;top:${y - 19}px" title="${esc(t.name)}, ${esc(years)}">` +
          `${esc(t.name)}<small>${esc(years)}</small>${tag}</button>`;
      }
    });
    const el = $('lines');
    el.setAttribute('viewBox', `0 0 ${W} ${height}`);
    el.setAttribute('width', W); el.setAttribute('height', height);
    el.innerHTML = svg;
    $('labels').innerHTML = labs;
    L.heads = [...$('labels').querySelectorAll('.head > span')];
    L.mores = [...$('labels').querySelectorAll('.grip > span')];
    // A name near the right edge would run off the page, so it ends at the edge instead.
    for (const c of $('labels').querySelectorAll('.card, .nm')) {
      const p = L.shown[c.dataset.k];
      p.nameEl = c; p.nameW = c.offsetWidth; p.nameX = parseFloat(c.style.left);
      if (newest) { p.nameX = Math.max(4, p.nameX - p.nameW); c.style.left = p.nameX + 'px'; }
      if (p.nameX + p.nameW > W - 6) { p.nameX = Math.max(4, W - 6 - p.nameW); c.style.left = p.nameX + 'px'; }
    }

    renderSide();
    $('status').hidden = true;
    drawPlay();
    if (anchor != null && L.W > L.SW) stageTo({ left: Math.max(0, L.xOf(anchor) - L.SW / 2), top: sy() });
    onScroll();
  }

  function renderEmpty() {
    L = null;
    roadClear();
    $('bands').innerHTML = ''; $('lines').innerHTML = ''; $('labels').innerHTML = ''; $('ticks').innerHTML = '';
    $('axis-unit').hidden = true;
    $('canvas').style.height = '0'; $('canvas').style.width = '';
    $('status').hidden = false;
    $('status').textContent = pending.size ? 'Loading the timeline…' : 'Add a view to draw its timeline.';
    renderSide();
    if (!pending.size) showSide(true);
  }

  // The axis follows the page sideways, and names stay on screen while their line does.
  let ticking = false;
  function onScroll() {
    ticking = false;
    if (!L || L.road) return;
    const x0 = sx();
    $('axis-in').style.transform = `translateX(${-x0}px)`;
    // A year label half under play or reverse would read as "Ma" or "70": it waits until it is clear.
    if (!L.tickEls) {
      L.tickEls = [...$('ticks').querySelectorAll('.yr')].map((el) => ({ el, x: parseFloat(el.style.left), w: el.offsetWidth }));
      L.endL = $('axisbar').querySelector('.ends.l').offsetWidth;
      L.endR = $('axisbar').querySelector('.ends.r').offsetWidth;
      L.axisW = $('axisbar').clientWidth;
    }
    for (const k of L.tickEls) {
      const x = k.x - x0;
      k.el.style.visibility = x - k.w / 2 < L.endL + 2 || x + k.w / 2 > L.axisW - L.endR - 2 ? 'hidden' : '';
    }
    // The timeline goes on past the edge of the screen: a soft fade says so.
    const more = S().scrollWidth - S().clientWidth;
    $('edge-l').hidden = !(x0 > 4);
    $('edge-r').hidden = !(more - x0 > 4);
    // Each view's name stays at the left of its section, and its "+N" at the right of the screen.
    for (const h of L.heads || []) h.style.transform = `translateX(${clamp(x0, 0, Math.max(0, L.W - 40 - h.offsetWidth))}px)`;
    for (const m of L.mores || []) m.style.left = clamp(x0 + L.SW - m.offsetWidth - 88, 0, L.W - m.offsetWidth - 48) + 'px';
    if (L.W <= L.SW + 1) return;
    const edge = x0 + 8;
    for (const p of L.shown) {
      if (!p.nameEl) continue;
      const room = Math.max(p.nameX, p.xR - p.nameW);
      p.nameEl.style.left = clamp(edge, p.nameX, room) + 'px';
    }
  }
  // Where a view starts on the drawn timeline: its first chapter or its first line, whichever is earlier.
  function viewStartX(id) {
    const g = L && L.groups.find((x) => x.view.id === id);
    if (!g) return null;
    const xs = [...g.eras.map((e) => (L.newest ? e.x + e.w : e.x)), ...L.shown.filter((p) => p.group === g.view).map((p) => (L.newest ? p.xR : p.xL))];
    if (!xs.length) return null;
    return L.newest ? Math.max(...xs) : Math.min(...xs);
  }
  // Brings a view's section into sight: its start, and its heading.
  function scrollToView(id, smooth = true) {
    if (L && L.road) {
      const ln = L.lanes.find((x) => x.view.id === id);
      if (!ln) return;
      // A view added while travelling stays where the reader is, if something of it is in sight.
      const D = L.D, dir = camDir(), ahead = (t) => dir * (t - road.t);
      if (smooth && ln.mine.some((t) => ahead(t.born) > -0.1 * D && ahead(t.born) < 3 * D)) return;
      return roadTo(dir > 0 ? laneStart(ln) - 0.05 * D : L.tMax, smooth);
    }
    const g = L && L.groups.find((x) => x.view.id === id), x = viewStartX(id);
    if (!g) return;
    const left = x == null || L.W <= L.SW ? sx() : clamp(L.newest ? x - L.SW + 60 : x - 60, 0, L.W - L.SW);
    stageTo({ left, top: Math.max(0, g.y - 4), behavior: smooth ? 'smooth' : 'auto' });
  }
  // Takes the timeline to a moment on the line (a decimal year, as parseDate gives).
  function scrollToTime(t, smooth = true) {
    if (L && L.road) return roadTo(t, smooth);
    if (!L || L.W <= L.SW) return;
    stageTo({ left: Math.max(0, L.xOf(t) - L.SW / 2), top: sy(), behavior: smooth ? 'smooth' : 'auto' });
  }
  function scrollToThing(id) {
    const p = L && L.at.get(id);
    if (!p) return;
    if (L.road) return roadTo(clamp(p.a, L.tMin, L.tMax));
    const seen = viewH(), x0 = sx(), y0 = sy();
    const top = p.y < y0 + 60 || p.y > y0 + seen - 60 ? Math.max(0, p.y - seen * 0.4) : y0;
    const left = L.W > L.SW && (p.xL < x0 + 20 || p.xL > x0 + L.SW - 160) ? Math.max(0, p.xL - 80) : x0;
    stageTo({ top, left, behavior: 'smooth' });
  }

  // Where a timeline wider than the screen opens: the screenful where the most
  // lines start, the earliest such, so a long view never opens on empty years.
  function busiest() {
    if (!L || L.W <= L.SW || !L.shown.length) return 0;
    const xs = L.shown.map((p) => (L.newest ? p.xR : p.xL)).sort((a, b) => a - b);
    const win = L.SW * 0.8;
    let best = 0, at = xs[0];
    for (let i = 0, j = 0; i < xs.length; i++) {
      while (xs[j] < xs[i] - win) j++;
      if (i - j + 1 > best) { best = i - j + 1; at = xs[j]; }
    }
    // The leftmost start of the busiest stretch, a little in from the edge.
    const left = xs.find((x) => x >= at - 1);
    return clamp(left - 60, 0, L.W - L.SW);
  }
  // Takes the timeline to a moment on one line and marks the spot for a moment.
  function jumpTo(id, at) {
    const p = L && L.at.get(id);
    if (!p) return;
    if (L.road) {
      const time = clamp(at, Math.max(p.a, L.tMin), Math.min(p.b, L.tMax));
      road.jump = { id, time, t0: performance.now() }; road.until = road.jump.t0 + 1700;
      return roadTo(time);
    }
    const t = clamp(at, p.t.lead ?? p.t.born, p.t.end ?? NOW), x = clamp(L.xOf(t), p.xL, p.xR);
    stageTo({ top: Math.max(0, p.y - viewH() * 0.4), left: L.W > L.SW ? Math.max(0, x - L.SW / 2) : 0, behavior: 'smooth' });
    $('lines').querySelector('.flash')?.remove();
    $('lines').insertAdjacentHTML('beforeend', `<circle class="flash" cx="${x}" cy="${p.y}" r="4"/>`);
  }

  // ---------------------------------------------------------------- the road
  // The timeline in depth (state.mode 'road', the default; "?m=flat" is the
  // left-to-right timeline). Time runs into the screen on a straight scale and
  // each view is a lane. The reader stands at road.t and faces the future, or
  // the past when reversed; play, the wheel, a drag, the arrow keys and the
  // bar on the right all move road.t. Lines lie on the ground, on one canvas.
  // Names stand on them: road.js chooses afresh every frame which are shown
  // and how big, and each fades in and out as its own element, so nothing
  // jumps. The card at the front is drawn as selected (road.focus): its line
  // and the dated points of its history light up as it arrives.
  const road = {
    t: null, target: null, rate: 6,           // where the reader stands, where a glide is heading, and how briskly
    raf: 0, live: false, last: 0, prev: null, pace: 1, cards: 0, within1: 0, within3: 0,
    hover: null, focus: null,                  // entry ids: under the pointer, and at the front
    nodes: new Map(), vis: new Map(), heat: new Map(),    // the elements of the names shown; which names were shown last frame, and how; how lit each line is
    drag: null, swallow: 0, until: 0, jump: null, year: null, pal: null, said: null,
  };
  const PLAY_PACE = 0.26;                      // focal lengths a second at full speed
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
      ln.eras = viewEras(ln.view).filter((c) => c.b > tMin && c.a < tMax);
      const where = tracks(ln.mine.map((t) => ({ id: t.id, a: t.born, b: t.end })), D * 0.2);
      for (const t of ln.mine) {
        shown.push({ t, group: ln.view, lane: ln, key: k + ':' + t.id, xn: ln.x0 + pad + where.get(t.id) * (laneW - 2 * pad),
          alive: t.end == null, major: t.rank < CARD_RANK, a: t.born, b: t.end ?? NOW });
      }
      groups.push({ view: ln.view, n: ln.mine.length, total: ln.mine.length, eras: ln.eras.map((c) => ({ c })) });
    });
    L = { road: true, W: G.SW, SW: G.SW, narrow: G.phone, height: G.SH, ppy: 0, tMin, tMax, fitMin, fitMax, autoMin, xOf: () => 0, tOf: () => tMin,
      newest: state.order === 'new', shown, groups, eras: [], eraH: 0, total: groupsOf.size, D, G, lanes,
      at: new Map([...shown].reverse().map((p) => [p.t.id, p])), byKey: new Map(shown.map((p) => [p.key, p])), barH: $('axis').clientHeight };
    return L;
  }

  function renderRoad() {
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
    // A narrow stage has no room for them beside the road; the strip under it names the views.
    $('road-views').innerHTML = G.short || G.phone ? '' : L.lanes.map((ln, i) =>
      `<div class="rv" style="--c:var(--p${ln.col})"><b>${esc(ln.view.name)}</b><button type="button" class="rch" data-lane="${i}" hidden></button></div>`).join('');
    for (const ln of L.lanes) ln.cur = undefined;
    barTicks();
    renderSide();
    $('status').hidden = true;
    drawPlay();
    roadKick();
  }
  function roadClear() {
    cancelAnimationFrame(road.raf); road.raf = 0; road.live = false;
    for (const n of road.nodes.values()) n.el.remove();
    road.nodes.clear(); road.vis = new Map(); road.heat.clear();
    road.hover = road.focus = road.jump = road.year = null;
    $('road-views').innerHTML = ''; $('road-year').textContent = '';
    const cv = $('road-cv');
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  }
  // Switches between the road and the flat timeline.
  function applyMode() {
    const on = state.mode === 'road';
    document.body.classList.toggle('road', on);
    document.body.classList.remove('revealing', 'play-rev');
    $('road').hidden = !on; $('canvas').hidden = on;
    $('axis').setAttribute('aria-orientation', on ? 'vertical' : 'horizontal');
    for (const id of ['playhead', 'axis-in']) $(id).removeAttribute('style');
    $('edge-l').hidden = $('edge-r').hidden = true;
    play.t = null; road.t = null; road.target = null;
    if (!on) roadClear();
    const b = $('mode');
    b.setAttribute('aria-pressed', !on);
    b.title = on ? 'Flat timeline' : 'Timeline in depth';
    b.setAttribute('aria-label', on ? 'Show the flat timeline' : 'Show the timeline in depth');
  }

  // Where a view begins on the road: its first chapter or its first start, whichever is earlier.
  function laneStart(ln) { return Math.max(L.tMin, Math.min(...ln.mine.map((t) => t.born), ...ln.eras.map((c) => c.a))); }
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
    if (!L || !L.road) return;
    const to = camClamp(time - camDir() * 0.2 * L.D);
    if (play.on) pausePlay();
    if (smooth && !calm()) { road.target = to; road.rate = 6; } else { road.t = road.prev = to; road.target = null; }
    roadKick();
  }
  // Moves the reader by a number of focal lengths, gliding.
  function roadBy(n, rate = 14) {
    if (!L || !L.road) return;
    if (play.on) pausePlay();
    road.target = camClamp((road.target ?? road.t) + camDir() * n * L.D); road.rate = rate;
    if (calm()) { road.t = road.prev = road.target; road.target = null; }
    roadKick();
  }

  function roadKick() {
    if (road.raf || !L || !L.road) return;
    if (!road.live) road.last = performance.now();
    road.live = true;
    road.raf = requestAnimationFrame(roadFrame);
  }
  // One frame: move the reader, then draw. Time is read from performance.now() only.
  function roadFrame() {
    road.raf = 0; road.live = false;
    if (!L || !L.road) return;
    const now = performance.now(), dt = clamp((now - road.last) / 1000, 0, 0.05);
    road.last = now;
    const dir = camDir(), [lo, hi] = camLimits();
    let moving = false;
    if (road.target != null) {
      road.t += (road.target - road.t) * (1 - Math.exp(-dt * road.rate));
      if (Math.abs(road.target - road.t) < L.D * 0.002) { road.t = road.target; road.target = null; }
      moving = true;
    } else if (play.on) {
      road.pace += (paceFor(road.cards, road.within1, road.within3) - road.pace) * (1 - Math.exp(-dt * 2.5));
      road.t += dir * PLAY_PACE * L.D * road.pace * dt;
      if (road.t >= hi || road.t <= lo) { road.t = clamp(road.t, lo, hi); if (dir > 0 ? road.t >= hi : road.t <= lo) { play.on = false; drawPlay(); } }
      moving = play.on;
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
      cands.push({ key, p, end, u, s, gx: px(p.xn, s), gy: py(s), m: roadSizes(p.t), pri });
    };
    let within1 = 0, within3 = 0;
    const count = (time) => { const u = U(time); if (u > 0 && u <= 3 * D) { within3++; if (u <= D) within1++; } };
    for (const p of L.shown) {
      count(p.a); if (!p.alive) count(p.b);
      if (p.a >= L.tMin && p.a <= L.tMax) add(p, false, p.a);
      // An end too close behind its start would only hide behind the start's card.
      if (!p.alive && p.b <= L.tMax && p.b >= L.tMin && p.b - p.a > 0.1 * D) add(p, true, p.b);
    }
    cands.sort((a, b) => a.pri - b.pri || (a.key < b.key ? -1 : 1));
    const placed = placeLabels(cands, G);
    road.vis = new Map([...placed].map(([key, r]) => [key, r.mode]));

    // The card at the front is the selected one: the nearest big card the reader has not yet passed.
    let front = null, cards = 0;
    for (const c of cands) {
      const r = placed.get(c.key);
      if (!r || !r.big) continue;
      if (c.u > 0) cards++;
      if (c.u > -0.05 * D && (!front || c.u < front.u || (c.u === front.u && c.key < front.key))) front = c;
    }
    road.cards = cards; road.within1 = within1; road.within3 = within3;
    road.focus = front ? front.p.t.id : null;
    const hotNow = (id) => id === state.open || id === road.hover || id === road.focus;

    // Each name shown has its element; one that is no longer shown keeps its place on the ground while it fades.
    const fade = (u, s) => clamp((s - 0.085) / 0.06, 0, 1) * clamp(1 + (u + 0.06 * D) / (0.1 * D), 0, 1);
    const seen = new Set(), stems = [];
    for (const c of cands) {
      const r = placed.get(c.key);
      if (!r) continue;
      const nk = c.key + ':' + r.mode, n = road.nodes.get(nk) || roadNode(nk, c.p, c.end, r.mode);
      seen.add(nk);
      n.r = r; n.s = c.s;
      n.want = fade(c.u, c.s) * (state.open && !r.big && !hotNow(c.p.t.id) ? 0.6 : 1);
    }
    const ease = still ? 1 : 1 - Math.exp(-dt * 12);
    for (const [nk, n] of road.nodes) {
      const p = L.byKey.get(n.pk);
      if (!seen.has(nk)) {
        const u = p ? U(n.end ? p.b : p.a) : -Infinity;
        if (!p || u <= uNear * 0.9 || u >= uFar) { n.el.remove(); road.nodes.delete(nk); continue; }
        n.s = S(u); n.want = 0;
        n.r = labelRect(n.mode, n.s, px(p.xn, n.s), py(n.s), roadSizes(p.t), G);
      }
      n.o = Math.abs(n.want - n.o) < 0.01 ? n.want : n.o + (n.want - n.o) * ease;
      if (n.o !== n.want) busy = true;
      if (!n.want && !n.o && !seen.has(nk)) { n.el.remove(); road.nodes.delete(nk); continue; }
      const hot = hotNow(p.t.id), r = n.r;
      if (hot !== n.hot) { n.hot = hot; n.btn.classList.toggle('hot', hot); }
      const z = (hot ? 2000 : n.end ? 95 : 100) + Math.round(n.s * 400) - (n.mode === 'tag' ? 90 : 0);
      if (z !== n.z) { n.z = z; n.el.style.zIndex = z; }
      const dead = n.o < 0.3;
      if (dead !== n.dead) { n.dead = dead; n.el.style.pointerEvents = dead ? 'none' : ''; }
      n.el.style.transform = `translate3d(${r.cx.toFixed(1)}px,${r.y1.toFixed(1)}px,0) scale(${r.k.toFixed(3)})`;
      n.el.style.opacity = n.o.toFixed(3);
      if (n.o > 0.02) stems.push({ x1: r.gx, y1: r.gy, x2: r.cx, y2: r.y1, a: n.o, hot, col: p.lane.col });
    }

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
        c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = rgba(P.text, (0.45 + 0.5 * Math.min(1, s)) * a);
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
      for (const ln of L.lanes) for (const e of ln.eras) {
        const at = dir > 0 ? e.a : e.b, u = U(at);
        if (at < L.tMin || at > L.tMax || u <= uGone || u >= uFar * 0.6) continue;
        const s = S(u), y = py(s), a = far(s) * clamp(1 + (u + 0.06 * D) / (0.1 * D), 0, 1), col = P.p[ln.col];
        c.strokeStyle = rgba(col, 0.55 * a); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(px(ln.x0, s), y); c.lineTo(px(ln.x1, s), y); c.stroke();
        if (s < 0.4) continue;      // far off, the line alone
        font(600, 9 + 2.5 * Math.min(1, s));
        c.textAlign = 'left'; c.textBaseline = 'bottom';
        const text = e.name.toUpperCase(), x = px(ln.x0, s) + 6;
        if (c.measureText(text).width > px(ln.x1, s) - x - 6) continue;      // named once its lane is wide enough to hold the name
        c.lineWidth = 3.5; c.lineJoin = 'round'; c.strokeStyle = rgba(P.surf, a); c.strokeText(text, x, y - 2);
        c.fillStyle = rgba(col, a); c.fillText(text, x, y - 2);
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
              lastY = y;
              font(600, 10 + 4 * Math.min(1, s));
              c.textBaseline = 'middle'; c.textAlign = 'left';
              c.lineWidth = 4; c.lineJoin = 'round'; c.strokeStyle = rgba(P.bg, 1); c.strokeText(text, x + hl + 6, y);
              c.fillStyle = rgba(pc, 1); c.fillText(text, x + hl + 6, y);
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
    roadHud(false);
    return busy;
  }

  // The bar on the right is the whole span, upright, and ahead is up: the
  // reader's marker climbs it as they travel, whichever way they face.
  const barSpan = () => Math.max(1, L.barH - 2 * BAR_PAD);
  const barY = (t) => { const f = (t - L.tMin) / (L.tMax - L.tMin); return BAR_PAD + (camDir() > 0 ? 1 - f : f) * barSpan(); };
  const barT = (y) => { const f = clamp((y - BAR_PAD) / barSpan(), 0, 1); return L.tMin + (camDir() > 0 ? 1 - f : f) * (L.tMax - L.tMin); };
  function barTicks() {
    const ax = axisTicks(barSpan() / (L.tMax - L.tMin), L.narrow ? 34 : 30);
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
    L.units = ax.units;
    $('axis-unit').hidden = true;
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
    b.innerHTML = play.on ? ICON_PAUSE : ICON_PLAY;
    $('stop').hidden = true;
  }

  // The wheel, a drag and the arrow keys carry the reader along the road.
  function wireRoad() {
    const box = $('road');
    box.addEventListener('wheel', (e) => {
      if (!L || !L.road) return;
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (d) roadBy((d * (e.deltaMode === 1 ? 30 : 1)) / 520);
    }, { passive: true });
    box.addEventListener('pointerdown', (e) => {
      if (!L || !L.road || e.button > 0) return;
      road.drag = { y: e.clientY, x: e.clientX, t: road.t, moved: false, id: e.pointerId };
    });
    box.addEventListener('pointermove', (e) => {
      const d = road.drag;
      if (!d || !L || !L.road) return;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dy) + Math.abs(e.clientX - d.x) < 6) return;
      if (!d.moved) { d.moved = true; box.setPointerCapture?.(d.id); box.classList.add('dragging'); if (play.on) pausePlay(); }
      road.target = null;
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
      if (!L || !L.road || e.altKey || e.ctrlKey || e.metaKey) return;
      if (!['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) return;
      // Not while typing, nor inside the panel or the bar, which use the arrows themselves.
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || e.target.closest?.('#side, #axis, #info, .tsearch')) return;
      e.preventDefault();
      roadBy(e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 0.3 : -0.3, 8);
    });
    if (window.ResizeObserver) new ResizeObserver(() => { if (L && L.road && (box.clientWidth !== L.G.SW || box.clientHeight !== L.G.SH || $('axis').clientHeight !== L.barH)) render(); }).observe(box);
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
      // Picking one adds the view it belongs to.
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
          return pre + `<li role="option" id="qo-${i}" aria-selected="${i === hit}" data-h="${i}" class="k-thing away">${KIND_ICON['k-thing']}<span class="r-txt"><b><span>${mk(e.name)}</span></b><small>${esc(kindName(e.kind))} · ${when}${comm}</small></span><span class="add">${ICON.plus}</span></li>`;
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
  // file, adds the view it belongs to if that is not on the timeline, pins it
  // so it is drawn, and opens it.
  function bringIn(id, opts = {}) {
    return loadEntry(id).then((t) => {
      if (!t) { if (!opts.quiet) note('That entry could not be loaded.'); return false; }
      const open = () => { state.pinned.add(t.id); changed(); openThing(t.id, { scroll: true, focus: opts.focus ?? false }); };
      const home = alias.get(t.home) || t.home;
      if (!home || state.views.includes(home) || state.views.some((v) => viewById.get(v).memberIds.has(t.id))) { open(); return true; }
      if (state.views.length + pending.size >= MAX_VIEWS) removeView(state.views[0]);
      return turnOn(home, () => open()).then((got) => { if (!got) { if (state.views.length) open(); } return true; });
    });
  }
  // Brings a year into view and lights its column for a moment.
  function flashYear(year) {
    if (!L) return;
    const a0 = lineYear(year);
    if (L.road) {
      road.year = { a: a0, label: yearText(year), t0: performance.now() }; road.until = road.year.t0 + 4600;
      return roadTo(camDir() > 0 ? a0 : a0 + 1);
    }
    scrollToTime(a0 + 0.5);
    const a = L.xOf(a0), b = L.xOf(a0 + 1), w = Math.max(4, Math.abs(b - a)), x = Math.min(a, b) - (Math.abs(b - a) < 4 ? 2 : 0);
    $('bands').querySelector('.yflash')?.remove();
    $('bands').insertAdjacentHTML('beforeend', `<div class="yflash" style="left:${x}px;width:${w}px"><b style="top:${sy() + 10}px">${esc(yearText(year))}</b></div>`);
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
    // How many fit on screen, and how to see the rest: nothing is filtered out here.
    const phone = matchMedia(PHONE).matches;
    $('shown-n').textContent = !state.views.length ? '' : !more ? `${n} ${n === 1 ? 'entry' : 'entries'}` : L.road ? `${n}${more} on the road` : `${n}${more} fit on screen`;
    $('fit-hint').hidden = !more || phone || L.road;
    $('pills').innerHTML = `<button type="button" class="padd" data-add>${ICON.plus}<span>Add view</span></button>` + state.views.map((id) => {
      const v = viewById.get(id);
      return `<div class="pill" data-pill="${esc(id)}" style="--c:var(--p${state.colors.get(id) % 8})" title="Drag to reorder">` +
        `<button type="button" class="dot" data-colour="${esc(id)}" aria-label="Colour of ${esc(v.name)}" title="Colour"></button><span>${esc(v.name)}</span>` +
        `<button type="button" data-remove="${esc(id)}" aria-label="Remove ${esc(v.name)}" title="Remove">${ICON.xs}</button></div>`;
    }).join('');
    $('save-mine').disabled = !state.views.length;
    $('shuffle').disabled = state.views.length < 2;
    $('swatches').hidden = true;

    // How much to show: the nearest of the four named levels is marked.
    const near = LEVELS.reduce((a, l) => Math.abs(l.pct - state.level) < Math.abs(a.pct - state.level) ? l : a);
    for (const b of $('level').querySelectorAll('[data-lv]')) b.setAttribute('aria-checked', Number(b.dataset.lv) === near.pct);
    drawYears();
    drawBranches();
    runSearch();
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

  // A compact filter by branch above the list: All, then each top-level branch
  // and Computing that has a community view.
  function branchesWithViews() {
    const have = new Set((boot?.views || []).map((v) => v.category).filter(Boolean));
    return (boot?.domains || []).filter((d) => (!d.parent || d.id === 'computing') && have.has(d.id));
  }
  function drawBranches() {
    const list = branchesWithViews();
    const box = $('branches');
    box.hidden = !list.length || !!$('vq').value.trim();
    if (state.branch && !list.some((d) => d.id === state.branch)) state.branch = '';
    const chip = (id, name) => `<button type="button" role="radio" data-branch="${esc(id)}" aria-checked="${state.branch === id}">${esc(name)}</button>`;
    const ids = ['', ...list.map((d) => d.id)].join(',');
    // Redrawn only when the branches change, so the row keeps its sideways scroll.
    if (box.dataset.ids !== ids) { box.dataset.ids = ids; box.innerHTML = chip('', 'All') + list.map((d) => chip(d.id, d.name)).join(''); }
    else for (const b of box.querySelectorAll('[data-branch]')) b.setAttribute('aria-checked', b.dataset.branch === state.branch);
    requestAnimationFrame(chipEdges);
  }
  // A fade at either end of the row of branches says it scrolls.
  function chipEdges() {
    const c = $('branches'), bar = $('chipbar');
    bar.classList.toggle('more-l', c.scrollLeft > 2);
    bar.classList.toggle('more-r', c.scrollLeft < c.scrollWidth - c.clientWidth - 2);
  }

  // The list: the community views, in the editors' order, narrowed by branch.
  // Search finds classical views too (the map: everything, each branch, each kind),
  // and entries and years.
  let found = [], active = -1;
  function runSearch() {
    const raw = $('vq').value.trim(), q = fold(raw);
    found = [];
    if (!q) {
      const mine = myView();
      if (mine && !state.branch) found.push({ mine });
      const list = (boot?.views || []).filter((v) => !state.branch || v.category === state.branch);
      found.push(...list.map((v) => ({ v: viewById.get(v.id) || v })));
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
  // What a view is, said quietly: who wrote it, or where it sits on the map.
  function viewSub(v) {
    const n = v.count != null ? `${group(v.count)} ${v.count === 1 ? 'entry' : 'entries'}` : '';
    if (v.type !== 'classical') return [v.author ? 'by ' + v.author : '', n].filter(Boolean).join(' · ');
    const kind = cats.find((c) => c.view === v.id), dom = domById.get(v.id);
    const where = v.id === 'everything' ? 'The whole map' : kind ? `Kind · ${kind.domainName || ''}` : dom ? (dom.parent ? `Branch · ${domById.get(dom.parent)?.name || ''}` : 'Branch') : 'Classical view';
    return [where, n].filter(Boolean).join(' · ');
  }
  // The thumbnail is the switch: a view on the timeline draws it in its own colour.
  function drawResults() {
    const q = fold($('vq').value.trim());
    const full = state.views.length + pending.size >= MAX_VIEWS;
    $('vlist').innerHTML = found.map(row).join('') || '<li class="none" role="presentation">No views here yet.</li>';
    const msg = noteText || (q && !found.length ? 'Nothing matches. Try a name, a topic or a year.' : '') || (!q && full ? `${MAX_VIEWS} views is the most at once. Remove one to add another.` : '');
    $('vnote').textContent = msg;
    function row(f, i) {
      let name, sub, tb, attrs = '', by = '';
      if (f.wait) return '<li class="none" role="presentation">Searching every view…</li>';
      if (f.mine) { name = 'Your view'; sub = f.mine.views.map((id) => viewById.get(alias.get(id) || id)?.name || id).join(', '); tb = `<span class="tb icon">${ICON.save}</span>`; }
      else if (f.propose) { name = 'Propose a view'; sub = 'Send the timeline you see now, or describe a new one'; tb = `<span class="tb icon">${ICON.plus}</span>`; }
      else if (f.year != null) { name = 'Go to ' + esc(yearText(f.year)); sub = 'On the timeline'; tb = `<span class="tb icon">${ICON.dot}</span>`; }
      else if (f.e) { name = mark(f.e.name, q); sub = `${esc(kindName(f.e.kind))} · ${f.how ? `<em class="yw">${esc(yearWord(f.e, f.how, f.how === 'born' ? f.e.born : f.e.end))}</em>` : esc(lineSpan(f.e))}${f.e.tier === 2 ? ' · community' : ''}`; tb = `<span class="tb icon">${ICON.dot}</span>`; }
      else {
        const v = f.v, on = state.views.includes(v.id), wait = pending.has(v.id), bad = broken.has(v.id);
        const kind = v.type === 'classical' ? 'classical' : 'community';
        name = `<span>${mark(v.name, q)}</span><i title="${kind === 'classical' ? 'Classical view' : 'Community view'}">${ICON[kind]}</i>`;
        sub = (on ? '<span class="st">On the timeline</span> · ' : wait ? '<span class="st">Loading…</span> · ' : bad ? '<span class="st bad">Could not load</span> · ' : '') + esc(v.description || '');
        by = `<small class="by">${esc(viewSub(v))}</small>`;
        tb = `<span class="tb">${thumb(v)}<span class="go">${ICON.plus}</span></span>`;
        attrs = ` aria-checked="${on}"${on ? ` style="--c:var(--p${state.colors.get(v.id) % 8})"` : ''}${!on && full && !wait ? ' aria-disabled="true"' : ''}${wait ? ' aria-busy="true" class="loading"' : ''}`;
      }
      return `<li role="option" aria-selected="${i === active}"${attrs} data-i="${i}">${tb}<span class="r-txt"><b>${/^<span>/.test(name) ? name : `<span>${name}</span>`}</b><small>${sub}</small>${by}</span></li>`;
    }
  }
  function pick(i) {
    const f = found[i];
    if (!f || f.wait) return;
    if (f.mine) return loadMine(f.mine);
    if (f.propose) return void window.open(`${REPO}/issues/new?template=propose-view.yml&link=${encodeURIComponent(location.href)}`, '_blank', 'noopener');
    if (f.year != null) { $('vq').value = ''; runSearch(); if (matchMedia(PHONE).matches) showSide(false); return flashYear(f.year); }
    if (f.e) { $('vq').value = ''; runSearch(); return bringIn(f.e.id, { focus: true }); }
    if (pending.has(f.v.id)) return;
    if (state.views.includes(f.v.id)) { removeView(f.v.id); return changed(); }
    turnOn(f.v.id);
  }

  // One saved view per visitor, kept in this browser. Saving again replaces it.
  function myView() {
    try { const v = JSON.parse(store.get('cg-mine') || 'null'); return v && Array.isArray(v.views) && v.views.length ? v : null; }
    catch (e) { return null; }
  }
  function saveMine() {
    if (!state.views.length) return;
    store.set('cg-mine', JSON.stringify({ views: state.views, level: state.level, order: state.order, span: state.span, mode: state.mode }));
    const b = $('save-mine');
    b.innerHTML = ICON.check; b.classList.add('done'); b.title = 'Saved as your view';
    setTimeout(() => { b.innerHTML = ICON.save; b.classList.remove('done'); b.title = 'Save as your view'; }, 1600);
    runSearch();
  }
  function loadMine(v) {
    Promise.all(v.views.map(loadView)).then(() => { applyMine(v); drawReverse(); changed(); });
  }
  function applyMine(v) {
    setViews(v.views);
    state.level = clamp(Number(v.level) || 100, 5, 100);
    state.order = v.order === 'new' ? 'new' : 'old';
    state.span = Array.isArray(v.span) && v.span.length === 2 && v.span.every(Number.isFinite) ? v.span : null;
    if ((v.mode === 'flat' ? 'flat' : 'road') !== state.mode && !new URLSearchParams(location.search).has('m')) { state.mode = v.mode === 'flat' ? 'flat' : 'road'; applyMode(); }
  }

  function changed(keepX) { render(keepX); writeUrl(); }

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
    if (opts.scroll) scrollToThing(id);
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
  // A marker sits on the axis. Drag it, or press play, and the timeline shows
  // only what had happened by then: lines and names appear as it passes. The
  // year scale and the eras stay in place. At the far end everything shows.
  const play = { on: false, t: null, last: 0, raf: 0, drag: false };
  const ICON_PLAY = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>';
  const ICON_PAUSE = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>';
  // A whole run takes about twenty seconds, whether it covers ten years or four billion.
  const PLAY_SECONDS = 20;
  const yearsPerSecond = () => (L.tMax - L.tMin) / PLAY_SECONDS;
  const atEnd = () => play.t == null || play.t >= L.tMax - (L.tMax - L.tMin) * 1e-6;
  // The year under the marker, said as briefly as the axis says it.
  function playLabel(t) {
    const y = writtenOf(t);
    if (y > -1e5) return y > 0 ? String(y) : (-y) + ' BCE';
    return axisText(-sig(-y));
  }

  function startPlay(from) {
    if (!L) return;
    if (matchMedia(PHONE).matches) showSide(false);
    if (L.road) {
      // On the road, play carries the reader along it; from the far end it starts again at the beginning.
      road.target = null;
      if (from != null) road.t = camClamp(Number(from) - camDir() * 0.1 * L.D);
      else if (camAtEnd()) road.t = road.prev = camDir() > 0 ? camClamp(Math.min(...L.lanes.map(laneStart)) - 0.25 * L.D) : camLimits()[1];
      play.on = true; road.pace = 1;
      drawPlay();
      return roadKick();
    }
    if (from != null) play.t = clamp(Number(from), L.tMin, L.tMax);
    // From the start: just before the first line drawn, not through empty years.
    else if (atEnd()) {
      const first = L.shown.length ? Math.min(...L.shown.map((p) => Math.max(L.tMin, p.t.lead ?? p.t.born))) : L.tMin;
      play.t = Math.max(L.tMin, first - (L.tMax - L.tMin) * 0.01);
    }
    play.on = true;
    drawPlay();
    play.last = performance.now();
    cancelAnimationFrame(play.raf);
    play.raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    if (!play.on) return;
    const dt = Math.min(0.1, (now - play.last) / 1000);
    play.last = now;
    play.t += dt * yearsPerSecond();
    if (play.t >= L.tMax) { play.t = null; play.on = false; drawPlay(); return; }
    // On a timeline wider than the screen, keep the marker in view.
    if (L.W > L.SW) {
      const x = L.xOf(play.t);
      if (x > sx() + L.SW * 0.7 || x < sx() + L.SW * 0.2) stageTo({ left: Math.max(0, x - L.SW / 2), top: sy() });
    }
    drawPlay();
    play.raf = requestAnimationFrame(tick);
  }
  function drawPlay() {
    if (!L) return;
    if (L.road) return roadHud(true);
    if (play.t != null) play.t = clamp(play.t, L.tMin, L.tMax);
    const end = atEnd(), t = end ? L.tMax : play.t, x = L.xOf(t);
    document.body.classList.toggle('revealing', !end);
    document.body.classList.toggle('play-rev', L.newest);
    $('canvas').style.setProperty('--reveal', (L.newest ? L.W - x : x) + 'px');
    $('playhead').style.left = x + 'px';
    $('playhead').firstElementChild.textContent = end && L.tMax >= NOW - 0.5 ? 'Today' : playLabel(t);
    $('playhead').classList.toggle('show-year', !end || play.drag);
    $('axis').setAttribute('aria-valuetext', end && L.tMax >= NOW - 0.5 ? 'Today' : playLabel(t));
    $('stop').hidden = end && !play.on;
    const b = $('play');
    b.setAttribute('aria-pressed', play.on);
    b.setAttribute('aria-label', play.on ? 'Pause' : end ? 'Play the timeline' : 'Carry on playing');
    b.innerHTML = play.on ? ICON_PAUSE : ICON_PLAY;
  }
  function pausePlay() { play.on = false; cancelAnimationFrame(play.raf); drawPlay(); }
  function stopPlay() { play.on = false; cancelAnimationFrame(play.raf); play.t = null; drawPlay(); }   // on the road this only pauses: there the reader's place is road.t
  function togglePlay() { if (play.on) pausePlay(); else startPlay(); }
  // Dragging along the axis moves the marker, playing or not.
  function scrubTo(e) {
    if (!L) return;
    if (L.road) {
      road.target = null;
      road.t = camClamp(barT(e.clientY - $('axis').getBoundingClientRect().top));
      return roadKick();
    }
    const t = L.tOf(e.clientX + sx());
    play.t = t >= L.tMax - (L.tMax - L.tMin) * 0.001 ? null : t;
    drawPlay();
  }

  // The symbols, and where the data comes from. Opened from the panel's info button.
  // The words follow what is on the timeline: born and died for people, founded for places.
  function drawInfo() {
    const w = wordsNow();
    const neutral = w === NEUTRAL;
    const row = (svg, a, b) => `<li><svg width="28" height="28" aria-hidden="true">${svg}</svg><span><b>${esc(a)}</b><small>${esc(b)}</small></span></li>`;
    const on = state.mode === 'road';   // the road draws no diamonds and no links: a rename is a tick like any other event
    $('info').innerHTML = `<div class="pane-head"><h2>How to read the timeline</h2><button class="ibtn" type="button" data-info-close aria-label="Close">${ICON.x}</button></div><ul class="legend">` +
      row('<line x1="14" y1="2" x2="14" y2="16" class="s-line2"/><circle cx="14" cy="19" r="3" class="s-born2"/>', neutral ? 'Start' : w.born, neutral ? 'Where its life begins: a birth, a founding, a first release' : 'Where its line begins') +
      row('<line x1="14" y1="13" x2="14" y2="27" class="s-line2"/><rect x="8.5" y="12" width="11" height="2" class="s-fill2"/>', neutral ? 'End' : w.ended, neutral ? 'Where it ends: a death, a dissolution, an official end' : 'Where its line ends') +
      row('<line x1="14" y1="9" x2="14" y2="27" class="s-line2"/><circle cx="14" cy="9" r="3" class="s-fill2"/>', w.alive, 'The line reaches today') +
      row('<line x1="14" y1="14" x2="14" y2="27" class="s-line2"/><line x1="14" y1="1" x2="14" y2="14" class="s-line2 s-dots"/>', 'Dotted', 'Its end has been announced') +
      (on ? '' : row('<line x1="14" y1="1" x2="14" y2="27" class="s-line2"/><rect x="10.5" y="10.5" width="7" height="7" class="s-born2" transform="rotate(45 14 14)"/>', 'Renamed', 'Same entry, new name')) +
      row('<line x1="14" y1="1" x2="14" y2="27" class="s-line2"/><line x1="14" y1="14" x2="21" y2="14" class="s-dim2"/>', 'Tick', 'A dated event in its life') +
      (on ? '' : row('<line x1="6" y1="1" x2="6" y2="27" class="s-line2"/><path d="M6 22Q6 14 14 14H22" class="s-dim2" fill="none"/><circle cx="22" cy="14" r="2.5" class="s-born2"/>', 'Link', 'One grew out of another, or took over from it')) +
      `</ul><p class="fine">${on ? 'Click a card or a name' : 'Entries with a card rank in the top tenth of their kind and time. Click any line'} to read its full history. Years before the common era are marked BCE; deep time is counted in years ago (ka, Ma and Ga on the axis: thousands, millions and billions).</p>
      <p class="fine">Ranking weighs ${Object.entries(WEIGHTS).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')}. Dates are still being checked against sources. Release ${esc(boot?.release || '')}, ${group(boot?.counts?.entries || 0)} entries. <a href="${REPO}" target="_blank" rel="noopener">Data and code on GitHub</a>. Text and data <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>, code MIT; images credited to their authors.</p>`;
  }

  // ---------------------------------------------------------------- events
  function wire() {
    S().addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    let rt = null, lastW = innerWidth, lastH = innerHeight;
    addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (innerWidth !== lastW || Math.abs(innerHeight - lastH) > 120) { lastW = innerWidth; lastH = innerHeight; sayScope(); if (state.views.length) render(); }
      }, 150);
    });

    const hot = (id, on) => { for (const el of document.querySelectorAll(`#canvas [data-id="${CSS.escape(id)}"]`)) el.classList.toggle('hot', on); };
    const eraHot = (key, on) => { for (const el of document.querySelectorAll(`#canvas [data-era="${CSS.escape(key)}"]`)) el.classList.toggle('hot', on || state.era === key); };
    $('canvas').addEventListener('pointerover', (e) => { const el = e.target.closest('.band-title'); if (el) eraHot(el.dataset.era, true); });
    $('canvas').addEventListener('pointerout', (e) => { const el = e.target.closest('.band-title'); if (el) eraHot(el.dataset.era, false); });
    $('canvas').addEventListener('pointerover', (e) => { const el = e.target.closest('[data-id]'); if (el && e.pointerType === 'mouse') hot(el.dataset.id, true); });
    $('canvas').addEventListener('pointerout', (e) => { const el = e.target.closest('[data-id]'); if (el) hot(el.dataset.id, false); });
    // Drag the grip under a section to make it taller or shorter; a shorter
    // section keeps its best-ranked rows. A guide line follows the pointer and
    // the timeline redraws at most once a frame. Double-click shows it all again.
    let grip = null;
    $('canvas').addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[data-grip]');
      if (!el || e.button !== 0) return;
      const g = L.groups.find((x) => x.view.id === el.dataset.grip);
      if (!g) return;
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      grip = { id: g.view.id, y0: e.clientY, h0: g.end - 6 - g.rowsY, raf: 0, y: e.clientY, colour: getComputedStyle(el).getPropertyValue('--c') };
      const guide = $('rguide');
      guide.style.setProperty('--c', grip.colour); guide.style.top = e.clientY + 'px'; guide.hidden = false;
      document.body.classList.add('resizing');
    });
    const gripFrame = () => {
      grip.raf = 0;
      state.sizes.set(grip.id, Math.max(34, grip.h0 + grip.y - grip.y0));
      render(L.tOf(sx() + L.SW / 2));
    };
    addEventListener('pointermove', (e) => {
      if (!grip) return;
      grip.y = e.clientY;
      $('rguide').style.top = e.clientY + 'px';
      if (!grip.raf) grip.raf = requestAnimationFrame(gripFrame);
    });
    const endGrip = () => {
      if (!grip) return;
      if (grip.raf) { cancelAnimationFrame(grip.raf); gripFrame(); }
      grip = null; $('rguide').hidden = true;
      document.body.classList.remove('resizing');
    };
    addEventListener('pointerup', endGrip);
    addEventListener('pointercancel', endGrip);
    $('canvas').addEventListener('dblclick', (e) => {
      const el = e.target.closest('[data-grip]');
      if (el && state.sizes.delete(el.dataset.grip)) render(L.tOf(sx() + L.SW / 2));
    });
    $('fit').addEventListener('click', () => { state.fit = !state.fit; state.sizes.clear(); drawFit(); changed(); });

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
      const br = el('[data-branch]');
      if (br) { state.branch = br.dataset.branch; drawBranches(); runSearch(); $('vlist').scrollTop = 0; br.scrollIntoView({ inline: 'nearest', block: 'nearest' }); return; }
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
      const li = el('#vlist [data-i]');
      if (li) return pick(Number(li.dataset.i));
      // A name on the road opens its entry and brings the reader to it.
      const card = el('#road-labels [data-id]');
      if (card) { openThing(card.dataset.id, { focus: false }); return roadTo(Number(card.dataset.at)); }
      const thing = el('[data-id]');
      if (thing) return openThing(thing.dataset.id, { scroll: !!thing.closest('#side'), push: !!thing.closest('#side') });
    });

    $('toggle-side').addEventListener('click', () => showSide($('side').hidden));
    wireRoad();
    // The road or the flat timeline: the moment in sight stays in sight.
    $('mode').addEventListener('click', () => {
      const at = !L ? null : L.road ? road.t + camDir() * 0.2 * L.D : L.W > L.SW ? L.tOf(sx() + L.SW / 2) : null;
      if (play.on) pausePlay();
      state.mode = state.mode === 'road' ? 'flat' : 'road';
      applyMode(); drawReverse(); changed();
      if (at != null) scrollToTime(at, false);
    });
    $('play').addEventListener('click', togglePlay);
    $('stop').addEventListener('click', stopPlay);
    $('axis').addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (play.on) pausePlay();
      play.drag = true; $('axis').setPointerCapture(e.pointerId); $('axisbar').classList.add('dragging');
      scrubTo(e);
    });
    $('axis').addEventListener('pointermove', (e) => { if (play.drag) scrubTo(e); });
    for (const ev of ['pointerup', 'pointercancel']) $('axis').addEventListener(ev, () => { play.drag = false; $('axisbar').classList.remove('dragging'); drawPlay(); });
    $('axis').addEventListener('keydown', (e) => {
      if (L && L.road) {
        // On the upright bar, up and right are ahead; Home is where the road begins for the reader.
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        const [lo, hi] = camLimits(), fwd = camDir() > 0;
        if (e.key === 'Home' || e.key === 'End') { road.target = null; road.t = road.prev = (e.key === 'Home') === fwd ? lo : hi; if (play.on) pausePlay(); return roadKick(); }
        return roadBy((e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1) * Math.max(0.3, (L.tMax - L.tMin) / L.D / 100), 8);
      }
      if (!L || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      // An arrow moves a hundredth of the span: a year on a century, a million years on a hundred million.
      const now = atEnd() ? L.tMax : play.t, stepT = Math.max(1, niceStep((L.tMax - L.tMin) / 100)) * ((e.key === 'ArrowRight') !== L.newest ? 1 : -1);
      const t = e.key === 'Home' ? L.tMin : e.key === 'End' ? L.tMax : now + stepT;
      play.t = t >= L.tMax ? null : t; drawPlay();
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
    $('vq').addEventListener('input', () => { drawBranches(); runSearch(); });
    $('vq').addEventListener('focus', () => indexFor('a'));
    $('branches').addEventListener('scroll', chipEdges, { passive: true });
    $('vq').addEventListener('keydown', (e) => {
      const ok = found.map((f, i) => i).filter((i) => !found[i].wait);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!ok.length) return;
        const at = ok.indexOf(active);
        active = ok[(at + (e.key === 'ArrowDown' ? 1 : at < 0 ? 0 : -1) + ok.length) % ok.length];
        drawResults();
        $('vlist').querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
      }
      else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) pick(active); }
      else if (e.key === 'Escape' && $('vq').value) { e.stopPropagation(); $('vq').value = ''; drawBranches(); runSearch(); }
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

    // The pills: drag one to change the order of the sections, tap its dot to
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
    $('pills').addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) { showPane('views'); showSide(true); $('vq').focus(); return; }
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

    let pillDrag = null;
    $('pills').addEventListener('pointerdown', (e) => {
      const pill = e.target.closest('[data-pill]');
      if (!pill || e.target.closest('button') || e.button !== 0) return;
      e.preventDefault();
      pillDrag = { pill, x0: e.clientX, y0: e.clientY, moved: false };
      pill.setPointerCapture(e.pointerId);
    });
    $('pills').addEventListener('pointermove', (e) => {
      if (!pillDrag) return;
      const { pill } = pillDrag;
      if (!pillDrag.moved && Math.hypot(e.clientX - pillDrag.x0, e.clientY - pillDrag.y0) < 4) return;
      pillDrag.moved = true; pill.classList.add('dragging');
      // Move the pill before, or after, the pill under the pointer.
      for (const o of $('pills').querySelectorAll('[data-pill]')) {
        if (o === pill) continue;
        const r = o.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right) continue;
        const before = e.clientX < r.left + r.width / 2;
        if (before && o.previousElementSibling !== pill) o.before(pill);
        else if (!before && o.nextElementSibling !== pill) o.after(pill);
        break;
      }
    });
    const dropPill = () => {
      if (!pillDrag) return;
      const { pill, moved } = pillDrag;
      pillDrag = null; pill.classList.remove('dragging');
      if (!moved) return;
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
      if (L && (!atEnd() || play.on)) stopPlay();
      else if (!$('info').hidden) { $('info').hidden = true; $('info-btn').setAttribute('aria-expanded', false); }
      else if (state.pane !== 'views') goCrumb(state.trail.length - 2);
      else showSide(false);
    });
    addEventListener('hashchange', () => followHash(true));
  }
  function drawFit() {
    const b = $('fit');
    b.setAttribute('aria-pressed', !state.fit);
    b.title = b.ariaLabel = state.fit ? 'Fit: sections share the screen. Click to expand them' : 'Expand: sections take the room they need. Click to fit them to the screen';
    b.classList.toggle('expand', !state.fit);
  }
  function drawReverse() {
    const b = $('reverse'), rev = state.order === 'new', on = state.mode === 'road';
    b.setAttribute('aria-pressed', rev);
    b.setAttribute('aria-label', on ? (rev ? 'Turn round and face the future' : 'Turn round and face the past') : rev ? 'Show oldest on the left' : 'Show newest on the left');
    b.title = on ? (rev ? 'Facing the past' : 'Facing the future') : rev ? 'Newest on the left' : 'Oldest on the left';
  }

  // "#1969" or "#-44" goes to a year; "#<id>" opens an entry, fetching it and
  // adding its view when it is not on the timeline yet.
  function followHash(smooth) {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) return false;
    if (/^-?\d{1,11}$/.test(h) && Number(h) !== 0) { flashYear(Number(h)); return true; }
    if (byId.has(h) && (L && L.at.has(h) || state.pinned.has(h))) { if (state.open !== h) openThing(h, { scroll: true, focus: smooth }); return true; }
    if (/^[a-z0-9][a-z0-9-]*$/.test(h)) { bringIn(h, { focus: smooth, quiet: !smooth }); return true; }
    return false;
  }

  // ---------------------------------------------------------------- start
  // boot.json and the views the page opens on are asked for at the same time.
  async function start() {
    state.mode = new URLSearchParams(location.search).get('m') === 'flat' ? 'flat' : 'road';
    applyMode();
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
    drawReverse(); drawFit();
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
    if (!state.views.length) $('status').textContent = 'The timeline data could not be loaded. Please reload the page.';
    render(L ? undefined : null);
    if (ids.length) writeUrl();
    spansNote();
    // A community view is a story: it opens at its beginning. A classical view opens on its busiest stretch.
    const first = viewById.get(state.views[0]);
    if (!followHash(false)) {
      if (first && first.type !== 'classical') scrollToView(first.id, false);
      else if (first && first.year) scrollToTime(lineYear(first.year) + 0.5, false);
      else if (L && L.road) roadTo(roadBusiest(), false);
      else stageTo({ left: busiest(), top: 0 });
    }
  }
  start();
})();
