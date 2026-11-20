/* codegrave — one scrolling timeline of digital things.
   Plain JavaScript modules, no framework. The page loads the bundles that
   scripts/build.mjs writes to data/. Ranking lives in rank.js. */
import { WEIGHTS, parseDate, score } from './rank.js';

(() => {
  'use strict';

  const REPO = 'https://github.com/ashrawan/codegrave';
  // How to propose a view: build it, then open a pull request with the file and a screenshot.
  const MAX_VIEWS = 8;
  const LEVELS = [
    { name: 'Landmarks', pct: 10 }, { name: 'Notable', pct: 30 },
    { name: 'Most', pct: 60 }, { name: 'All', pct: 100 },
  ];
  const MAX_ROWS = 160;         // the most lines drawn at once
  const CARD_RANK = 10;        // things in the top tenth of their peers get a card
  // How a link reads from the thing that carries it, and from the thing it points to.
  const LINK_LABELS = {
    succeeded_by: 'succeeded by', forked_from: 'forked from', merged_into: 'merged into',
    spun_off_from: 'spun off from', open_sourced_as: 'open-sourced as', contains: 'contains',
    standardised_as: 'standardised as', version_of: 'version of', influenced_by: 'influenced by',
    extends: 'extends', built_on: 'built on',
  };
  const INBOUND_LABELS = {
    succeeded_by: 'succeeded', forked_from: 'forked into', merged_into: 'absorbed',
    spun_off_from: 'spun off', open_sourced_as: 'opened from', contains: 'part of',
    standardised_as: 'standard for', version_of: 'has version', influenced_by: 'influenced',
    extends: 'extended by', built_on: 'base of',
  };
  // Drawn between lines. A branch leaves the older line and starts the newer
  // one. A handover leaves a line and joins the one that carries on.
  const BRANCH = ['forked_from', 'spun_off_from', 'version_of', 'extends', 'built_on'];
  const HANDOVER = ['succeeded_by', 'merged_into', 'open_sourced_as'];
  const EVENT_TITLES = { released: 'Release', changed_hands: 'Changed hands', milestone: 'Milestone', deprecated: 'End announced' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const TOP = 52;   // height of the fixed top bar
  // Height of what is fixed along the bottom: the axis, and the strip of views under it (hidden on a phone while the panel is open).
  const bottomH = () => $('axisbar').offsetHeight + $('dock').offsetHeight;
  // On a phone the open panel is a sheet over the lower half; what is drawn fits above it.
  const PHONE = '(max-width: 699px)';
  const sheetH = () => (!$('side').hidden && matchMedia(PHONE).matches ? $('side').offsetHeight : 0);

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
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
    drag: '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.2"/><circle cx="7" cy="3" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="11" r="1.2"/><circle cx="7" cy="11" r="1.2"/></svg>',
    xs: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    dot: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12h18"/><circle cx="8" cy="12" r="3" fill="var(--surf)"/></svg>',
    chev: '<svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    save: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    out: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h10v10M19 5L6 18"/></svg>',
  };

  // Media is a file under data/media/, or an image hosted by Wikimedia Commons.
  const mediaUrl = (src) => /^https:\/\//.test(src) ? src : 'data/media/' + src;
  const tileIcon = (t) => t.icon ? `<i style="--icon:url('${esc(mediaUrl(t.icon.src))}')" role="img" aria-label="${esc(t.icon.alt)}"></i>` : esc(t.mono);
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };

  // ---------------------------------------------------------------- dates
  function fmtDate(s, precision) {
    const [y, m, d] = s.split('-').map(Number);
    if (precision === 'circa') return 'c. ' + y;
    if (!m || precision === 'year') return String(y);
    if (!d || precision === 'month') return MONTHS[m - 1] + ' ' + y;
    return d + ' ' + MONTHS[m - 1] + ' ' + y;
  }
  // The short form used on the line itself: a month and year at most.
  const fmtShort = (s, precision) => fmtDate(s.slice(0, 7), precision === 'day' ? 'month' : precision);
  const yearOf = (s) => s.slice(0, 4);
  function fmtSpan(years) {
    if (years < 1) return 'under a year';
    const n = Math.round(years);
    return n + (n === 1 ? ' year' : ' years');
  }

  // ---------------------------------------------------------------- data
  let things = [], byId = new Map(), cats = [], b0 = {}, catById = new Map(), checkpoints = [], views = null, viewById = new Map(), release = '';

  function initials(name) {
    const caps = name.match(/[A-Z0-9#+]/g) || [];
    const words = name.split(/[\s./-]+/).filter(Boolean);
    if (words.length > 1) return (words[0][0] + words[1][0]).slice(0, 2);
    if (caps.length > 1 && /^[A-Za-z]/.test(name)) return caps.slice(0, 2).join('');
    return name.slice(0, 2);
  }

  function prepare() {
    for (const t of things) {
      t.cat = catById.get(t.category);
      const ev = (type) => t.events.find((e) => e.type === type);
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
      t.search = t.names.map((n) => n.name.toLowerCase());
      t.mono = initials(t.name);
      // Dated points drawn on the line, beside the birth and the end.
      t.marks = [
        ...t.renames.map((r) => ({ t: r.t, kind: 'ren', label: r.name, date: fmtShort(r.from), note: 'Renamed from ' + r.prev })),
        ...t.events.filter((e) => EVENT_TITLES[e.type]).map((e) => ({
          t: clamp(parseDate(e.date), t.lead ?? t.born, t.end ?? NOW), kind: 'tick', label: e.label || '', date: fmtShort(e.date, e.precision), note: e.note || '' })),
      ].sort((a, b) => a.t - b.t);
      t.inbound = [];
    }
    for (const t of things) for (const l of t.links || []) byId.get(l.to).inbound.push({ type: l.type, from: t.id });
    score(things, NOW);
    for (const v of views.views) {
      v.set = v.things ? new Set(v.things) : null;
      v.cats = new Set(v.categories);
      for (const c of cats) if ((v.domains || []).includes(c.domain)) v.cats.add(c.id);
      v.count = membersOf(v, v.level).size;
      v.hay = [v.name, v.description, v.author, ...(v.tags || [])].join(' ').toLowerCase();
    }
  }
  // A hand-picked view lists its things. Any other view is categories and a level.
  function inView(v, t, level) {
    if (v.set) return v.set.has(t.id);
    return (v.cats.size === 0 || v.cats.has(t.category)) && t.rank < level;
  }
  // What a view puts on the timeline at a level. A view is never empty: its
  // best few things show even when none of them reaches the level.
  const KEEP = 3;
  function membersOf(v, level) {
    const all = things.filter((t) => inView(v, t, 101)).sort((a, b) => (a.rank - b.rank) || (b.score - a.score));
    return new Set(all.filter((t, i) => i < KEEP || inView(v, t, level)));
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
    const yearsW = measureCtx.measureText(`${c.from}–${c.to}`).width;
    return Math.ceil(2 + 8 + nameW + 7 + yearsW + 8 + 4);
  }

  // The named eras. Each belongs to a view and sits in its section, in its colour.
  function viewEras(v) { return (v.checkpoints || []).map((c) => ({ ...c, view: v, key: v.id + '/' + c.id })).sort((a, b) => a.from - b.from); }
  function erasNow() { return state.views.flatMap((id) => viewEras(viewById.get(id))); }
  function levelName(pct) {
    const name = pct >= 100 ? 'All' : pct >= 60 ? 'Most' : pct >= 30 ? 'Notable' : pct >= 10 ? 'Landmarks' : 'Top few';
    return pct >= 100 ? name : `${name} · top ${pct}%`;
  }

  // ---------------------------------------------------------------- state
  const state = {
    views: [],                // ids of the views on the timeline, in the order they were added
    colors: new Map(),        // view id -> palette index
    level: 100, order: 'old',  // everything that fits, oldest at the top
    pinned: new Set(), open: null, pane: 'views', era: null, trail: [],
    span: null,               // [from, to] years when the reader narrows the timeline
    sizes: new Map(),         // view id -> height in pixels the reader dragged its section's rows to
    fit: true,                // sections share the height of the screen; false: each takes what it needs
  };
  let L = null;               // the current layout

  function addView(id) {
    if (!viewById.has(id) || state.views.includes(id) || state.views.length >= MAX_VIEWS) return false;
    const used = new Set(state.colors.values());
    let n = 0; while (used.has(n)) n++;
    state.views.push(id); state.colors.set(id, n);
    return true;
  }
  function removeView(id) {
    state.views = state.views.filter((v) => v !== id);
    state.colors.delete(id); state.sizes.delete(id);
  }
  function setViews(ids) {
    state.views = []; state.colors.clear(); state.sizes.clear();
    for (const id of ids) addView(id);
    if (state.views.length === 1) {
      const v = viewById.get(state.views[0]);
      state.level = v.level;
      if (v.order) state.order = v.order;
    }
    return state.views.length > 0;
  }

  function readUrl() {
    const q = new URLSearchParams(location.search);
    const ids = (q.get('views') || q.get('view') || '').split(',').filter(Boolean);
    if (!ids.length || !setViews(ids)) return false;
    if (q.has('lv')) state.level = clamp(Number(q.get('lv')) || 100, 5, 100);
    const yr = /^(\d{4})-(\d{4})$/.exec(q.get('yr') || '');
    if (yr && Number(yr[1]) < Number(yr[2])) state.span = [Number(yr[1]), Number(yr[2])];
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
    if (state.views.some((id, i) => state.colors.get(id) !== i)) q.set('c', state.views.map((id) => state.colors.get(id)).join(','));
    history.replaceState(null, '', '?' + q.toString().replace(/%2C/g, ',') + location.hash);
  }

  // ---------------------------------------------------------------- layout
  // Time runs left to right with the years along the bottom. Each view on the
  // timeline owns a block of rows, one row per thing. A thing that is in two
  // views is drawn in both, so every view shows all of its own things.
  const PAD_L = 84, PAD_PHONE = 72;  // room at the ends of the axis for play and reverse
  function layout() {
    const SW = $('stage').clientWidth;
    const narrow = SW < 700;
    const newest = state.order === 'new';

    const groupsOf = new Map();   // thing -> the views on the timeline that hold it
    const selected = state.views.map((id) => viewById.get(id));
    const join = (t, v) => { const gs = groupsOf.get(t); if (!gs) groupsOf.set(t, [v]); else if (!gs.includes(v)) gs.push(v); };
    for (const v of selected) for (const t of membersOf(v, state.level)) join(t, v);
    for (const id of state.pinned) {
      const t = byId.get(id);
      if (!groupsOf.has(t)) join(t, selected.find((v) => v.cats.has(t.category)) || selected[selected.length - 1]);
    }
    // Rows are capped so the page stays fast at any data size: the best ranked come first.
    // The cap counts rows, so a thing drawn in two views counts twice.
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

    // The years: fitted to what is shown, from a little before the first birth
    // to today, or to the last end when everything shown has ended. The
    // reader can narrow it with the year range in the panel.
    const earliest = all.length ? Math.min(...all.map((t) => t.lead ?? t.born)) : NOW - 30;
    const last = all.length ? Math.max(...all.map((t) => Math.max(t.end ?? NOW, t.after ?? 0))) : NOW;
    const fitMax = last >= NOW - 0.5 ? NOW : Math.min(NOW, Math.ceil((last + 1) / 5) * 5);
    const fitMin = Math.floor((Math.min(earliest, fitMax - 10) - 1) / 5) * 5;
    let tMin = fitMin, tMax = fitMax;
    if (state.span) {
      tMin = clamp(state.span[0], fitMin, fitMax - 2);
      tMax = clamp(state.span[1] + 1, tMin + 2, fitMax);
      if (tMax >= NOW_YEAR) tMax = Math.min(tMax, NOW);
    }
    const inSpan = (t) => (t.lead ?? t.born) < tMax && (t.end ?? NOW) >= tMin;
    const pad = narrow ? PAD_PHONE : PAD_L;
    const ppy = Math.max(narrow ? 10 : 9, (SW - 2 * pad) / (tMax - tMin));
    const W = Math.round(2 * pad + (tMax - tMin) * ppy);
    const xOf = (t) => Math.round((pad + (newest ? tMax - clamp(t, tMin, tMax) : clamp(t, tMin, tMax) - tMin) * ppy) * 10) / 10;
    const tOf = (x) => clamp(newest ? tMax - (x - pad) / ppy : tMin + (x - pad) / ppy, tMin, tMax);

    // A view's era titles sit at the top of its section, on as many lines as they need.
    const placeEras = (list) => {
      const out = list.filter((c) => c.to + 1 > tMin && c.from < tMax).map((c) => {
        const a = xOf(c.from), b = xOf(Math.min(c.to + 1, tMax));
        return { c, x: Math.min(a, b), w: Math.abs(a - b), tw: eraTitleWidth(c) };
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

    // Rows: inside a block, by category, then by birth, with linked things side by side.
    const drawn = (l) => BRANCH.includes(l.type) || HANDOVER.includes(l.type);
    const catIndex = (t) => cats.indexOf(t.cat);
    const rowH = (t) => (t.rank < CARD_RANK ? 62 : 34);
    const byRank = (a, b) => (state.pinned.has(b.id) - state.pinned.has(a.id)) || (a.rank - b.rank) || (b.score - a.score);
    const secs = [];
    for (const g of selected) {
      const mine = all.filter((t) => rowsOf.get(g).has(t) && inSpan(t)).sort((a, b) => (catIndex(a) - catIndex(b)) || (a.born - b.born));
      if (!mine.length) continue;
      const set = new Set(mine), seen = new Set(), ordered = [];
      const near = (t) => [
        ...(t.links || []).filter(drawn).map((l) => byId.get(l.to)),
        ...t.inbound.filter(drawn).map((l) => byId.get(l.from)),
      ].filter((o) => set.has(o)).sort((a, b) => a.born - b.born);
      const visit = (t) => { if (seen.has(t)) return; seen.add(t); ordered.push(t); near(t).forEach(visit); };
      mine.forEach(visit);
      const own = placeEras(viewEras(g));
      const head = 30 + (own.list.length ? own.lines * 26 + 2 : 0);
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
      const room = innerHeight - sheetH() - TOP - bottomH() - (eraH + 6) - (narrow ? 48 : 12) - secs.reduce((n, c) => n + c.head + 24, 0);
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
    let y = eraH + 6;
    for (const c of secs) {
      const { g, ordered, own, rows } = c;
      const grp = { view: g, y, n: rows.length, total: ordered.length, eras: own.list };
      groups.push(grp);
      y += 30;
      if (own.list.length) { grp.eraY = y - 4; y += own.lines * 26 + 2; }
      grp.rowsY = y;
      for (const t of rows) {
        const major = t.rank < CARD_RANK;
        const p = { t, major, group: g, y: Math.round(y + (major ? 36 : 22)) };
        p.alive = t.end == null;
        p.xBorn = xOf(t.born); p.xEnd = xOf(t.end ?? NOW);
        p.xL = Math.min(p.xBorn, p.xEnd); p.xR = Math.max(p.xBorn, p.xEnd);
        shown.push(p);
        y += rowH(t);
      }
      grp.end = y + 6;
      y += 18;
    }
    const height = Math.max(Math.round(y + 12), innerHeight - sheetH() - TOP - bottomH());
    L = { W, SW, narrow, height, ppy, tMin, tMax, fitMin, fitMax, xOf, tOf, newest, shown, groups, eras, eraH,
      at: new Map([...shown].reverse().map((p) => [p.t.id, p])), total: groupsOf.size };
    return L;
  }

  // ---------------------------------------------------------------- render
  function render(keepX) {
    if (!state.views.length) return renderEmpty();
    const anchor = keepX ?? (L && L.W > L.SW ? L.tOf(scrollX + L.SW / 2) : null);
    layout();
    const { W, height, xOf, newest, narrow, shown, ppy, tMin, tMax, eras } = L;
    const dx = newest ? -1 : 1;                  // +1 when later times are further right
    $('canvas').style.width = W + 'px';
    $('canvas').style.height = height + 'px';
    $('canvas').classList.toggle('has-open', !!state.open && L.at.has(state.open));

    // Eras, the year grid and the line for today.
    let html = '';
    for (const e of eras) {
      html += `<div class="band" data-era="${esc(e.c.key)}" style="left:${e.x}px;width:${e.w}px"></div>`;
      html += `<button type="button" class="band-title" data-era="${esc(e.c.key)}" style="left:${e.tx}px;top:${6 + e.line * 26}px" title="${esc(e.c.note || '')}">` +
        `<b>${esc(e.c.name)}</b><span>${e.c.from}–${e.c.to}</span></button>`;
    }
    const step = ppy >= 40 ? 1 : ppy >= 9 ? 5 : 10, label = [1, 2, 5, 10, 20, 50].find((n) => n % step === 0 && ppy * n >= 44) || 50;
    const atNow = tMax >= NOW - 0.01;
    let axis = '';
    for (let yr = Math.ceil(tMin); yr <= Math.floor(tMax); yr++) {
      const x = xOf(yr);
      const nearNow = atNow && Math.abs(x - xOf(NOW)) < 40;
      if (yr % step === 0 && (step > 1 || yr % label === 0)) html += `<div class="rule" style="left:${x}px"></div>`;
      if (yr % label === 0 && !nearNow) axis += `<span class="yr" style="left:${x}px">${yr}</span>`;
      else axis += `<i class="tk${yr % step === 0 ? ' big' : ''}" style="left:${x}px"></i>`;
    }
    if (atNow) { html += `<div class="rule now" style="left:${xOf(NOW)}px"></div>`; axis += `<span class="yr now" style="left:${xOf(NOW)}px">Today</span>`; }
    // Each view's own eras: a band down its section and a title in its colour.
    for (const g of L.groups) {
      const c = `--c:var(--p${state.colors.get(g.view.id) % 8})`;
      for (const e of g.eras) {
        html += `<div class="band own" data-era="${esc(e.c.key)}" style="${c};left:${e.x}px;width:${e.w}px;top:${g.y + 8}px;height:${g.end - g.y - 8}px"></div>`;
        html += `<button type="button" class="band-title own" data-era="${esc(e.c.key)}" style="${c};left:${e.tx}px;top:${g.eraY + e.line * 26}px" title="${esc(e.c.note || '')}">` +
          `<b>${esc(e.c.name)}</b><span>${e.c.from}–${e.c.to}</span></button>`;
      }
    }
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
      for (const l of p.t.links || []) {
        const o = shown.find((q) => q.t.id === l.to && q.group === p.group);
        if (!o || o === p) continue;
        const branch = BRANCH.includes(l.type);
        if (!branch && !HANDOVER.includes(l.type)) continue;
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
      let g = `<title>${esc(t.name)}</title>`;
      if (t.lead != null && t.lead < t.born) g += seg(xOf(t.lead), p.xBorn, 'lead');
      if (t.dep != null && !p.alive) g += seg(p.xBorn, xOf(t.dep), 'life') + seg(xOf(t.dep), p.xEnd, 'life fade');
      else g += seg(p.xBorn, p.xEnd, 'life');
      if (t.after != null && !p.alive) g += seg(p.xEnd + 6 * dx, xOf(t.after), 'after');
      g += `<line class="hit" x1="${p.xL - 4}" x2="${p.xR + 4}" y1="${y}" y2="${y}"/>`;
      // A line that runs past the edge of the years shown just reaches the edge.
      if (t.born >= tMin) g += `<circle class="born" cx="${p.xBorn}" cy="${y}" r="3"/>`;
      if (p.alive ? tMax >= NOW - 0.01 : t.end <= tMax) g += p.alive ? `<circle class="alive" cx="${p.xEnd}" cy="${y}" r="3"/>` : `<rect class="end" x="${p.xEnd - 1}" y="${y - 5.5}" width="2" height="11"/>`;
      // Dated points. A major row has room under its line to say what each one is.
      let lastLab = -1e9, lastMark = -1e9;
      const ends = [p.xBorn, p.xEnd];
      for (const m of t.marks) {
        if (m.t < tMin || m.t > tMax) continue;
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

      // The name sits above the start of the line: a card for the major things, a quiet label for the rest.
      const years = p.alive ? 'since ' + yearOf(t.bornEv.date) : yearOf(t.bornEv.date) + '–' + yearOf(t.endEv.date);
      const open = state.open === t.id ? ' open' : '';
      const x0 = newest ? Math.max(p.xR, t.lead != null ? xOf(t.lead) : p.xR) : Math.max(4, Math.min(p.xL, t.lead != null ? xOf(t.lead) : p.xL));
      if (p.major) {
        labs += `<button type="button" class="card${open}" data-id="${t.id}" data-k="${k}" style="${cvar};left:${x0}px;top:${y - 36}px">` +
          `<span class="tile">${tileIcon(t)}</span><b>${esc(t.name)}</b><small>${years}</small></button>`;
      } else {
        labs += `<button type="button" class="nm${p.alive ? '' : ' dead'}${open}" data-id="${t.id}" data-k="${k}" style="${cvar};left:${x0}px;top:${y - 19}px" title="${esc(t.name)}, ${years}">` +
          `${esc(t.name)}<small>${years}</small></button>`;
      }
    });
    const el = $('lines');
    el.setAttribute('viewBox', `0 0 ${W} ${height}`);
    el.setAttribute('width', W); el.setAttribute('height', height);
    el.innerHTML = svg;
    $('labels').innerHTML = labs;
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
    if (anchor != null && L.W > L.SW) scrollTo({ left: Math.max(0, L.xOf(anchor) - L.SW / 2), top: scrollY });
    onScroll();
  }

  function renderEmpty() {
    L = null;
    $('bands').innerHTML = ''; $('lines').innerHTML = ''; $('labels').innerHTML = ''; $('ticks').innerHTML = '';
    $('canvas').style.height = '0'; $('canvas').style.width = '';
    $('status').hidden = false;
    $('status').textContent = 'Add a view to draw its timeline.';
    renderSide();
    showSide(true);
  }

  // The axis follows the page sideways, and names stay on screen while their line does.
  let ticking = false;
  function onScroll() {
    ticking = false;
    if (!L) return;
    $('axis-in').style.transform = `translateX(${-scrollX}px)`;
    if (L.W <= L.SW + 1) return;
    const edge = scrollX + 8;
    for (const p of L.shown) {
      if (!p.nameEl) continue;
      const room = Math.max(p.nameX, p.xR - p.nameW);
      p.nameEl.style.left = clamp(edge, p.nameX, room) + 'px';
    }
  }
  function scrollToYear(year, smooth = true) {
    if (!L || L.W <= L.SW) return;
    scrollTo({ left: Math.max(0, L.xOf(Number(year)) - L.SW / 2), top: scrollY, behavior: smooth ? 'smooth' : 'auto' });
  }
  function scrollToThing(id) {
    const p = L && L.at.get(id);
    if (!p) return;
    const seen = innerHeight - sheetH() - TOP - bottomH();
    const top = p.y < scrollY + 60 || p.y > scrollY + seen - 60 ? Math.max(0, p.y - seen * 0.4) : scrollY;
    const left = L.W > L.SW && (p.xL < scrollX || p.xL > scrollX + L.SW - 120) ? Math.max(0, p.xL - 80) : scrollX;
    scrollTo({ top, left, behavior: 'smooth' });
  }

  // Takes the timeline to a moment on one line and marks the spot for a moment.
  function jumpTo(id, at) {
    const p = L && L.at.get(id);
    if (!p) return;
    const t = clamp(at, p.t.lead ?? p.t.born, p.t.end ?? NOW), x = L.xOf(t);
    scrollTo({ top: Math.max(0, p.y - (innerHeight - sheetH() - TOP - bottomH()) * 0.4), left: L.W > L.SW ? Math.max(0, x - L.SW / 2) : 0, behavior: 'smooth' });
    $('lines').querySelector('.flash')?.remove();
    $('lines').insertAdjacentHTML('beforeend', `<circle class="flash" cx="${x}" cy="${p.y}" r="4"/>`);
  }

  // ---------------------------------------------------------------- search the timeline
  // The box in the top bar finds anything on the timeline: a thing by any of
  // its names, an event on a line, an era or a year, and goes there.
  let hits = [], hit = -1;
  // Small symbols in the timeline's own drawing language.
  const KIND_ICON = {
    'k-thing': '<svg width="18" height="12" aria-hidden="true"><line x1="5" y1="6" x2="18" y2="6" stroke="var(--c)" stroke-width="1.6"/><circle cx="4.5" cy="6" r="2.6" fill="var(--bg)" stroke="var(--c)" stroke-width="1.5"/></svg>',
    'k-ev': '<svg width="18" height="12" aria-hidden="true"><line x1="0" y1="4" x2="18" y2="4" stroke="var(--c)" stroke-width="1.4" opacity=".55"/><line x1="9" y1="4" x2="9" y2="11" stroke="var(--c)" stroke-width="1.6"/></svg>',
    'k-era': '<svg width="18" height="12" aria-hidden="true"><rect x="2" y="0" width="14" height="12" fill="var(--band-hot)"/><line x1="2.5" y1="0" x2="2.5" y2="12" stroke="var(--bandtext)" stroke-width="1.6"/></svg>',
    'k-year': '<svg width="18" height="12" aria-hidden="true"><line x1="5" y1="0" x2="5" y2="12" stroke="var(--muted)"/><line x1="13" y1="0" x2="13" y2="12" stroke="var(--muted)"/></svg>',
  };
  function findOnTimeline() {
    const q = $('q').value.trim().toLowerCase();
    hits = [];
    if (q) {
      // With no view on the timeline nothing is drawn (L is null), and every match is "not on the timeline".
      const at = L ? [...L.at.values()] : [], eras = L ? [...L.eras, ...L.groups.flatMap((g) => g.eras)] : [];
      if (L && /^\d{4}$/.test(q) && Number(q) >= Math.ceil(L.tMin) && Number(q) <= Math.floor(L.tMax)) hits.push({ year: Number(q) });
      for (const p of at) if (p.t.search.some((n) => n.includes(q))) hits.push({ p, s: p.t.search.some((n) => n === q) ? 3 : p.t.search.some((n) => n.startsWith(q)) ? 2 : 1 });
      for (const e of eras) if (e.c.name.toLowerCase().includes(q)) hits.push({ era: e.c });
      for (const p of at) for (const m of p.t.marks) {
        if (m.label && (m.label.toLowerCase().includes(q) || m.note.toLowerCase().includes(q) || m.date.includes(q))) hits.push({ p, m });
      }
      hits.sort((a, b) => (!!b.year - !!a.year) || ((b.s || 0) - (a.s || 0)) || (!!b.era - !!a.era) || (!!a.m - !!b.m) || ((a.p && !a.m ? a.p.t.name.length : 0) - (b.p && !b.m ? b.p.t.name.length : 0)) || ((a.p ? a.p.t.rank : 0) - (b.p ? b.p.t.rank : 0)));
      // Things in views that are not on the timeline: listed after a divider,
      // and picking one adds a view that holds it.
      const onPage = new Set(L ? L.shown.map((p) => p.t.id) : []);
      const away = things.filter((t) => !onPage.has(t.id) && t.search.some((n) => n.includes(q)))
        .sort((a, b) => (b.search.some((n) => n.startsWith(q)) - a.search.some((n) => n.startsWith(q))) || (a.rank - b.rank))
        .slice(0, L ? 4 : 8);
      hits = hits.slice(0, away.length ? 6 : 9);
      for (const t of away) {
        const holders = views.views.filter((v) => inView(v, t, 101));
        const v = holders.find((x) => (x.tags || []).includes('kind')) || holders.find((x) => (x.tags || []).includes('domain')) || holders.find((x) => !(x.tags || []).includes('all')) || holders[0];
        if (v) hits.push({ t, away: v });
      }
    }
    // Nothing in the data has this name: offer to suggest it, so a failed
    // search tells the editors what people came looking for.
    if (q.length > 1 && !/^\d+$/.test(q) && !things.some((t) => t.search.some((n) => n.includes(q)))) hits.push({ suggest: $('q').value.trim() });
    hit = hits.length ? 0 : -1;
    drawHits(q);
  }
  function drawHits(q) {
    const box = $('qlist');
    if (!q) { box.hidden = true; $('q').setAttribute('aria-expanded', false); return; }
    box.hidden = false; $('q').setAttribute('aria-expanded', true);
    const col = (p) => `--c:var(--p${state.colors.get(p.group.id) % 8})`;
    let divided = false;
    box.innerHTML = !hits.length ? '<li class="none" role="presentation">Nothing matches. Try a name, an event or a year.</li>'
      : hits.map((h, i) => {
        let main, sub, cls = 'k-year', st = '', pre = '';
        if (h.suggest) {
          return `<li class="sep" role="presentation">Not here yet</li><li role="option" id="qo-${i}" aria-selected="${i === hit}" data-h="${i}" class="k-thing away">${KIND_ICON['k-thing']}<span class="r-txt"><b>Suggest \u201c${esc(h.suggest)}\u201d</b><small>Tell us about it on GitHub; no code needed</small></span><span class="add">${ICON.plus}</span></li>`;
        }
        if (h.away) {
          if (!divided) { divided = true; pre = '<li class="sep" role="presentation">Not on the timeline</li>'; }
          return pre + `<li role="option" id="qo-${i}" aria-selected="${i === hit}" data-h="${i}" class="k-thing away">${KIND_ICON['k-thing']}<span class="r-txt"><b>${mark(h.t.name, q)}</b><small>In ${esc(h.away.name)} · ${yearOf(h.t.bornEv.date)}${h.t.endEv ? '–' + yearOf(h.t.endEv.date) : ' to today'}</small></span><span class="add">${ICON.plus}</span></li>`;
        }
        if (h.year) { main = String(h.year); sub = 'Year'; }
        else if (h.era) { main = mark(h.era.name, q); sub = `Era · ${h.era.from}–${h.era.to}`; cls = 'k-era'; }
        else if (h.m) { main = mark(h.m.label, q); sub = `${esc(h.p.t.name)} · ${esc(h.m.date)}`; cls = 'k-ev'; st = col(h.p); }
        else { main = mark(h.p.t.name, q); sub = `${esc(h.p.group.name)} · ${yearOf(h.p.t.bornEv.date)}${h.p.t.endEv ? '–' + yearOf(h.p.t.endEv.date) : ' to today'}`; cls = 'k-thing'; st = col(h.p); }
        return `<li role="option" id="qo-${i}" aria-selected="${i === hit}" data-h="${i}" class="${cls}" style="${st}">${KIND_ICON[cls]}<span class="r-txt"><b>${main}</b><small>${sub}</small></span></li>`;
      }).join('');
    $('q').setAttribute('aria-activedescendant', hit >= 0 ? 'qo-' + hit : '');
  }
  function goHit(i) {
    const h = hits[i];
    if (h && h.suggest) return void window.open(`${REPO}/issues/new?template=new-thing.yml&title=${encodeURIComponent('Add: ' + h.suggest)}&name=${encodeURIComponent(h.suggest)}`, '_blank', 'noopener');
    if (!h) return;
    $('q').value = ''; drawHits(''); $('q').blur();
    if (h.year) return flashYear(h.year);
    if (h.era) return openEra(h.era.key);
    if (h.away) {
      // Add a view that holds it (dropping the oldest when the timeline is full), then open it.
      if (!state.views.includes(h.away.id)) {
        if (state.views.length >= MAX_VIEWS) removeView(state.views[0]);
        addView(h.away.id);
      }
      state.pinned.add(h.t.id);
      changed();
      return openThing(h.t.id, { scroll: true, focus: false });
    }
    openThing(h.p.t.id, { scroll: !h.m, focus: false });
    if (h.m) jumpTo(h.p.t.id, h.m.t);
  }
  // Brings a year into view and lights its column for a moment.
  function flashYear(year) {
    if (!L) return;
    scrollToYear(year);
    const a = L.xOf(year), b = L.xOf(year + 1);
    $('bands').querySelector('.yflash')?.remove();
    $('bands').insertAdjacentHTML('beforeend', `<div class="yflash" style="left:${Math.min(a, b)}px;width:${Math.max(3, Math.abs(b - a))}px"></div>`);
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

  function renderSide() {
    // The views on the timeline: one pill each in the strip under the years.
    const n = L ? L.at.size : 0, more = L && L.total > L.at.size ? ` of ${L.total}` : '';
    $('shown-n').textContent = state.views.length ? `${n}${more} ${n === 1 && !more ? 'thing' : 'things'}` : '';
    $('pills').innerHTML = `<button type="button" class="padd" data-add>${ICON.plus}<span>Add view</span></button>` + state.views.map((id) => {
      const v = viewById.get(id);
      return `<div class="pill" data-pill="${id}" style="--c:var(--p${state.colors.get(id) % 8})" title="Drag to reorder">` +
        `<button type="button" class="dot" data-colour="${id}" aria-label="Colour of ${esc(v.name)}" title="Colour"></button><span>${esc(v.name)}</span>` +
        `<button type="button" data-remove="${id}" aria-label="Remove ${esc(v.name)}" title="Remove">${ICON.xs}</button></div>`;
    }).join('');
    $('save-mine').disabled = !state.views.length;
    $('shuffle').disabled = state.views.length < 2;
    $('swatches').hidden = true;

    // How much to show: the nearest of the four named levels is marked.
    const near = LEVELS.reduce((a, l) => Math.abs(l.pct - state.level) < Math.abs(a.pct - state.level) ? l : a);
    for (const b of $('level').querySelectorAll('[data-lv]')) b.setAttribute('aria-checked', Number(b.dataset.lv) === near.pct);
    drawYears();
    runSearch();
  }
  // The year range: a picture of how busy each stretch of years is, with two
  // handles to narrow the timeline to the years between them.
  function drawYears() {
    const a = L ? L.fitMin : NOW_YEAR - 30, b = L ? Math.floor(L.fitMax) : NOW_YEAR;
    const lo = L ? Math.ceil(L.tMin) : a, hi = L ? Math.min(b, Math.ceil(L.tMax) - 1) : b;
    for (const id of ['y-from', 'y-to']) { $(id).min = a; $(id).max = b; }
    if (document.activeElement !== $('y-from')) $('y-from').value = lo;
    if (document.activeElement !== $('y-to')) $('y-to').value = hi;
    const end = hi >= NOW_YEAR ? 'today' : hi;
    $('years-out').textContent = `${lo} – ${end}`;
    $('years-reset').hidden = !state.span;
    const pct = (v) => ((v - a) / Math.max(1, b - a)) * 100;
    $('yearbar').style.setProperty('--lo', pct(lo) + '%');
    $('yearbar').style.setProperty('--hi', pct(hi) + '%');
    const N = 32, bins = new Array(N).fill(0), span = b + 1 - a;
    const bump = (t) => { if (t >= a && t <= b + 1) bins[Math.min(N - 1, Math.floor(((t - a) / span) * N))]++; };
    const pool = things.filter((t) => state.views.some((id) => inView(viewById.get(id), t, state.level)));
    for (const t of pool) { bump(t.born); if (t.end != null) bump(t.end); t.marks.forEach((m) => bump(m.t)); }
    const max = Math.max(1, ...bins);
    $('hist').innerHTML = bins.map((v, i) => {
      const y0 = a + (i / N) * span, y1 = a + ((i + 1) / N) * span;
      return `<i class="${y1 <= lo || y0 >= hi + 1 ? 'off' : ''}" style="height:${Math.round((v / max) * 26) + 2}px"></i>`;
    }).join('');
    const mid = (f) => Math.round((a + (b - a) * f) / 10) * 10;
    $('year-ticks').innerHTML = [a, mid(1 / 3), mid(2 / 3), b].map((y) => `<span>${y}</span>`).join('');
  }

  // The list: every view, ticked when it is on the timeline. Search narrows it
  // to views by their own words and by the things they hold, then things and years.
  let found = [], active = -1;
  function runSearch() {
    const q = $('vq').value.trim().toLowerCase();
    found = [];
    if (!q) {
      // One list: community views in the editors' order, then classical views by name.
      // A small icon on each row says which is which.
      const rank = (v) => { const i = views.featured.indexOf(v.id); return i < 0 ? 100 : i; };
      const mine = myView();
      if (mine) found.push({ mine });
      const listed = (kind) => views.views.filter((v) => tabOf(v) === kind && v.count > 0);   // a domain with nothing in it yet is not listed
      found.push(...listed('community').sort((a, b) => (rank(a) - rank(b)) || a.name.localeCompare(b.name)).map((v) => ({ v })));
      found.push(...listed('featured').sort((a, b) => a.name.localeCompare(b.name)).map((v) => ({ v })));
      found.push({ propose: true });
      active = -1;
      $('vnote').textContent = '';
    } else {
      const hits = things.filter((t) => t.search.some((n) => n.includes(q))).sort((a, b) => b.score - a.score);
      const scored = [];
      for (const v of views.views) {
        const name = v.name.toLowerCase();
        const holds = hits.find((t) => inView(v, t, 101));
        const s = name.startsWith(q) ? 4 : name.includes(q) ? 3 : v.hay.includes(q) ? 2 : holds ? 1 : 0;
        if (s) scored.push({ v, s, why: s === 1 ? 'Contains ' + holds.name : '' });
      }
      scored.sort((a, b) => b.s - a.s || a.v.name.localeCompare(b.v.name));
      found = scored.slice(0, 8);
      found.push(...hits.slice(0, 6).map((t) => ({ t })));
      $('vnote').textContent = found.length ? '' : 'Nothing matches. Try a name, a topic or a year.';
      active = found.length ? 0 : -1;
    }
    drawResults();
  }
  function mark(text, q) {
    const i = q ? text.toLowerCase().indexOf(q) : -1;
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }
  // Classical ('featured'): one view per domain, and everything. Community: every
  // view that tells a story, added through a pull request. A view of one kind
  // (tagged `kind`) is in neither list; search finds it.
  function tabOf(v) {
    const tags = v.tags || [];
    if (tags.includes('domain') || tags.includes('all')) return 'featured';
    return tags.includes('kind') ? 'kind' : 'community';
  }
  // A view's thumbnail, made by the build: its own picture, or a miniature of its lines.
  function thumb(v) {
    const t = v.thumb || {};
    if (t.image) return `<img src="${esc(mediaUrl(t.image))}" alt="" loading="lazy">`;
    return `<svg class="th" viewBox="0 0 64 40" aria-hidden="true"><path class="dead" d="${t.dead || ''}"/><path d="${t.live || ''}"/></svg>`;
  }
  // The thumbnail is the switch: a view on the timeline draws it in its own colour.
  function drawResults() {
    const q = $('vq').value.trim().toLowerCase();
    const full = state.views.length >= MAX_VIEWS;
    $('vlist').innerHTML = found.map(row).join('');
    if (!q && full) $('vnote').textContent = `${MAX_VIEWS} views is the most at once. Remove one to add another.`;
    function row(f, i) {
      let name, sub, tb, attrs = '';
      if (f.mine) { name = 'Your view'; sub = f.mine.views.map((id) => viewById.get(id)?.name).filter(Boolean).join(', '); tb = `<span class="tb icon">${ICON.save}</span>`; }
      else if (f.propose) { name = 'Propose a view'; sub = 'Send the timeline you see now, or describe a new one'; tb = `<span class="tb icon">${ICON.plus}</span>`; }
      else if (f.t) { name = mark(f.t.name, q); sub = `${esc(f.t.cat.name)} · ${yearOf(f.t.bornEv.date)}${f.t.endEv ? '–' + yearOf(f.t.endEv.date) : ' to today'}`; tb = `<span class="tb icon">${ICON.dot}</span>`; }
      else {
        const v = f.v, on = state.views.includes(v.id), kind = tabOf(v) === 'featured' ? 'classical' : 'community';
        name = `<span>${mark(v.name, q)}</span><i title="${kind === 'classical' ? 'Classical view' : 'Community view'}">${ICON[kind]}</i>`;
        sub = (on ? '<span class="st">On the timeline</span> · ' : '') + (f.why ? mark(f.why, q) : `${v.count} things · ${esc(v.description || '')}`);
        tb = `<span class="tb">${thumb(v)}<span class="go">${ICON.plus}</span></span>`;
        attrs = ` aria-checked="${on}"${on ? ` style="--c:var(--p${state.colors.get(v.id) % 8})"` : ''}${!on && full ? ' aria-disabled="true"' : ''}`;
      }
      return `<li role="option" aria-selected="${i === active}"${attrs} data-i="${i}">${tb}<span class="r-txt"><b>${name}</b><small>${sub}</small></span></li>`;
    }
  }
  function pick(i) {
    const f = found[i];
    if (!f) return;
    if (f.mine) return loadMine(f.mine);
    if (f.propose) return void window.open(`${REPO}/issues/new?template=propose-view.yml&link=${encodeURIComponent(location.href)}`, '_blank', 'noopener');
    if (f.t) { $('vq').value = ''; state.pinned.add(f.t.id); runSearch(); return openThing(f.t.id, { scroll: true }); }
    if (state.views.includes(f.v.id)) { removeView(f.v.id); return changed(); }
    if (addView(f.v.id)) changed();
  }

  // One saved view per visitor, kept in this browser. Saving again replaces it.
  function myView() {
    try { const v = JSON.parse(store.get('cg-mine') || 'null'); return v && Array.isArray(v.views) && v.views.some((id) => viewById.has(id)) ? v : null; }
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
  function loadMine(v) { applyMine(v); drawReverse(); changed(); }
  function applyMine(v) {
    setViews(v.views.filter((id) => viewById.has(id)));
    state.level = clamp(Number(v.level) || 100, 5, 100);
    state.order = v.order === 'new' ? 'new' : 'old';
    state.span = Array.isArray(v.span) ? v.span : null;
  }

  function changed(keepX) { render(keepX); writeUrl(); }

  // ---------------------------------------------------------------- panel: history of one thing
  function thingButton(id) { return `<button type="button" class="tlink" data-id="${id}">${esc(byId.get(id).name)}</button>`; }
  function figure(m, cls) {
    if (!m) return '';
    return `<figure class="${cls}"><img src="${esc(mediaUrl(m.src))}" alt="${esc(m.alt)}" loading="lazy"><figcaption>${m.caption ? esc(m.caption) + ' ' : ''}<a href="${esc(m.source)}" target="_blank" rel="noopener">${esc(m.credit)}</a> · ${esc(m.licence)}</figcaption></figure>`;
  }

  // The way back: Timeline / an era / a thing / another thing. Opening something
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
    if (!t) return;
    if (!opts.keep) step('thing', id, opts);
    state.open = id;
    if (!L || !L.at.has(id)) state.pinned.add(id);
    const years = (t.end ?? NOW) - t.born;
    const status = t.status === 'dead' ? 'ended' : t.status === 'fading' ? 'fading' : 'alive';
    const meta = `${esc(t.cat.name)} · ${yearOf(t.bornEv.date)}–${t.endEv ? yearOf(t.endEv.date) : 'today'} · ${t.endEv ? 'lived ' + fmtSpan(years) : fmtSpan(years) + ' so far'} · <b>${status}</b>`;

    // Every dated thing we know, in date order.
    const rows = [];
    if (t.startEv) rows.push({ at: t.lead - 1e-6, kind: 'dot', title: 'Work begins', date: fmtDate(t.startEv.date, t.startEv.precision), note: t.startEv.note, url: t.startEv.url });
    rows.push({ at: t.born, kind: 'born', title: 'Born' + (t.names.length > 1 ? ' as ' + t.names[0].name : ''), date: fmtDate(t.bornEv.date, t.bornEv.precision),
      note: t.bornEv.note || ('First public release' + (t.maker ? ', by ' + t.maker : '') + '.'), image: t.bornEv.image, url: t.bornEv.url });
    for (const r of t.renames) rows.push({ at: r.t, kind: 'ren', title: 'Renamed ' + r.name, date: fmtDate(r.from), note: 'Until then it was ' + r.prev + '.' });
    for (const e of t.events.filter((x) => EVENT_TITLES[x.type])) {
      rows.push({ at: parseDate(e.date), kind: 'tick', title: e.label || EVENT_TITLES[e.type], date: fmtDate(e.date, e.precision),
        note: e.note + (e.type === 'deprecated' ? ' From here the line is dotted.' : ''), image: e.image, url: e.url });
    }
    if (t.endEv) rows.push({ at: t.end + 1e-6, kind: 'end', title: 'Ended', date: fmtDate(t.endEv.date, t.endEv.precision), note: t.endEv.note || t.cause || 'Official end.', image: t.endEv.image, url: t.endEv.url });
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
      `<p class="ev-head"><b>${esc(r.title)}</b><time>${esc(r.date)}</time></p><p class="ev-note">${esc(r.note || '')}</p>` +
      (r.at != null ? '</button>' : '</div>') +
      (r.url ? `<a class="ev-src" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(host(r.url))} ${ICON.out}</a>` : '') +
      `${figure(r.image, 'ev-img')}</div></li>`).join('');

    const rel = [];
    const relRow = (label, other, note) => `<div class="rel"><i>${label}</i>${thingButton(other)}<small>${note ? esc(note) : L && L.at.has(other) ? '' : 'not on screen'}</small></div>`;
    for (const l of t.links || []) rel.push(relRow(LINK_LABELS[l.type], l.to, l.note));
    for (const l of t.inbound) rel.push(relRow(INBOUND_LABELS[l.type], l.from, ''));

    const link = location.origin + location.pathname + '#' + t.id;
    const issue = `${REPO}/issues/new?title=${encodeURIComponent('Correction: ' + t.name)}&body=${encodeURIComponent(`Entry: ${t.id}\n\nWhat is wrong:\n\nSource for the correction:\n`)}`;
    const icon = tileIcon(t);
    const text = t.summary || (t.status === 'fading' ? t.note : '') || '';
    const official = (t.website ? [{ title: 'Official website', url: t.website }] : []).concat(t.official || []);

    const onLine = L && L.at.get(id);
    $('p-thing').style.setProperty('--c', onLine ? `var(--p${state.colors.get(onLine.group.id) % 8})` : 'var(--acc)');
    $('p-thing').innerHTML = `
      <div class="pane-head">${crumbs()}<button class="ibtn" type="button" data-hide-side aria-label="Hide the panel">${ICON.x}</button></div>
      <div class="th-head"><span class="tile big">${icon}</span><div><h2 id="thing-title" tabindex="-1">${esc(t.name)}</h2><p class="meta">${meta}</p></div></div>
      ${figure(t.image, 'lead-img')}
      ${text ? `<p class="summary">${esc(text)}</p>` : ''}
      ${official.length ? `<p class="official">${official.map((o) => `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.title)} ${ICON.out}</a>`).join('')}</p>` : ''}
      ${t.names.length > 1 ? `<p class="fine">Names over time: ${t.names.map((n) => `${esc(n.name)} (${esc(yearOf(n.from))})`).join(', ')}.</p>` : ''}
      <section><h3 class="cap">History</h3><ol class="history">${history}</ol></section>
      ${rel.length ? `<section><h3 class="cap">Connections</h3>${rel.join('')}</section>` : ''}
      <section><h3 class="cap">Sources</h3><ol class="sources">${t.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>${s.kind ? ` <small>${esc(s.kind)}</small>` : ''}</li>`).join('')}</ol>
        <p class="fine">${t.verified ? 'Dates checked against these sources.' : 'Seed entry. Its dates are not yet checked against a source.'} Ranked in the top ${t.topPct}% of ${esc(t.peers)}.</p></section>
      <div class="pane-foot"><button type="button" class="btn" data-copy="${esc(link)}">Copy link</button><a class="btn" href="${esc(issue)}" target="_blank" rel="noopener">Suggest a correction</a></div>`;
    showPane('thing');
    if ($('side').hidden) showSide(true); else render();
    if (opts.scroll) scrollToThing(id);
    // Re-colour after render: the thing may have just been placed under a view.
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
  // What began and what ended in an era, among the things of the views on the timeline.
  function openEra(key, opts = {}) {
    const c = erasNow().find((e) => e.key === key);
    if (!c) return;
    if (!opts.keep) step('era', key, opts);
    state.era = key;
    const from = c.from, to = c.to + 1;
    const pool = things.filter((t) => state.views.some((id) => inView(viewById.get(id), t, 101)));
    const colourOf = (t) => { const p = L && L.at.get(t.id); return p ? `var(--p${state.colors.get(p.group.id) % 8})` : 'var(--rule2)'; };
    const row = (t, date) => `<li style="--c:${colourOf(t)}"><i></i>${thingButton(t.id)}<small>${esc(date)}</small></li>`;
    const born = pool.filter((t) => t.born >= from && t.born < to).sort((a, b) => a.born - b.born);
    const ended = pool.filter((t) => t.end != null && t.end >= from && t.end < to).sort((a, b) => a.end - b.end);
    const lived = pool.filter((t) => t.born < from && (t.end ?? NOW) >= to).sort((a, b) => a.rank - b.rank).slice(0, 8);
    const list = (title, arr, date) => arr.length ? `<section><h3 class="cap">${title} · ${arr.length}</h3><ul class="era-list">${arr.map((t) => row(t, date(t))).join('')}</ul></section>` : '';
    $('p-era').innerHTML = `
      <div class="pane-head">${crumbs()}<button class="ibtn" type="button" data-hide-side aria-label="Hide the panel">${ICON.x}</button></div>
      <div><h2 class="serif" id="era-title" tabindex="-1">${esc(c.name)}</h2><p class="era-years">${c.from}–${c.to} · ${c.to - c.from + 1} years${c.view ? ' · from the view ' + esc(c.view.name) : ''}</p></div>
      ${c.note ? `<p class="summary">${esc(c.note)}</p>` : ''}
      ${list('Born in these years', born, (t) => fmtDate(t.bornEv.date, t.bornEv.precision))}
      ${list('Ended in these years', ended, (t) => fmtDate(t.endEv.date, t.endEv.precision))}
      ${list('Carried on through it', lived, (t) => 'since ' + yearOf(t.bornEv.date))}
      ${!born.length && !ended.length ? '<p class="fine">Nothing in the views on the timeline began or ended in these years.</p>' : ''}
      <div class="pane-foot"><button type="button" class="btn solid" data-zoom="${c.from}-${c.to}">Only these years</button><button type="button" class="btn" data-play-from="${c.from}">Play from ${c.from}</button></div>`;
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
  // A whole run takes about twenty seconds, however many years it covers.
  const yearsPerSecond = () => Math.max(2, (L.tMax - L.tMin) / 20);
  const atEnd = () => play.t == null || play.t >= L.tMax - 1e-6;

  function startPlay(fromYear) {
    if (!L) return;
    if (matchMedia(PHONE).matches) showSide(false);
    if (fromYear != null) play.t = clamp(Number(fromYear), L.tMin, L.tMax);
    else if (atEnd()) play.t = L.tMin;
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
      if (x > scrollX + L.SW * 0.7 || x < scrollX + L.SW * 0.2) scrollTo({ left: Math.max(0, x - L.SW / 2), top: scrollY });
    }
    drawPlay();
    play.raf = requestAnimationFrame(tick);
  }
  function drawPlay() {
    if (!L) return;
    if (play.t != null) play.t = clamp(play.t, L.tMin, L.tMax);
    const end = atEnd(), t = end ? L.tMax : play.t, x = L.xOf(t);
    document.body.classList.toggle('revealing', !end);
    document.body.classList.toggle('play-rev', L.newest);
    $('canvas').style.setProperty('--reveal', (L.newest ? L.W - x : x) + 'px');
    $('playhead').style.left = x + 'px';
    $('playhead').firstElementChild.textContent = Math.floor(t);
    $('playhead').classList.toggle('show-year', !end || play.drag);
    $('stop').hidden = end && !play.on;
    const b = $('play');
    b.setAttribute('aria-pressed', play.on);
    b.setAttribute('aria-label', play.on ? 'Pause' : end ? 'Play the timeline' : 'Carry on playing');
    b.innerHTML = play.on ? ICON_PAUSE : ICON_PLAY;
  }
  function pausePlay() { play.on = false; cancelAnimationFrame(play.raf); drawPlay(); }
  function stopPlay() { play.on = false; cancelAnimationFrame(play.raf); play.t = null; drawPlay(); }
  function togglePlay() { if (play.on) pausePlay(); else startPlay(); }
  // Dragging along the axis moves the marker, playing or not.
  function scrubTo(clientX) {
    if (!L) return;
    const t = L.tOf(clientX + scrollX);
    play.t = t >= L.tMax - 0.05 ? null : t;
    drawPlay();
  }

  // The symbols, and where the data comes from. Opened from the panel's info button.
  function drawInfo() {
    const row = (svg, a, b) => `<li><svg width="28" height="28" aria-hidden="true">${svg}</svg><span><b>${a}</b><small>${b}</small></span></li>`;
    $('info').innerHTML = `<div class="pane-head"><h2>How to read the timeline</h2><button class="ibtn" type="button" data-info-close aria-label="Close">${ICON.x}</button></div><ul class="legend">` +
      row('<line x1="14" y1="2" x2="14" y2="16" class="s-line2"/><circle cx="14" cy="19" r="3" class="s-born2"/>', 'Born', 'First public release') +
      row('<line x1="14" y1="13" x2="14" y2="27" class="s-line2"/><rect x="8.5" y="12" width="11" height="2" class="s-fill2"/>', 'Ended', 'Official end of support or sale') +
      row('<line x1="14" y1="9" x2="14" y2="27" class="s-line2"/><circle cx="14" cy="9" r="3" class="s-fill2"/>', 'Alive', 'The line reaches today') +
      row('<line x1="14" y1="14" x2="14" y2="27" class="s-line2"/><line x1="14" y1="1" x2="14" y2="14" class="s-line2 s-dots"/>', 'Dotted', 'Its end has been announced') +
      row('<line x1="14" y1="1" x2="14" y2="27" class="s-line2"/><rect x="10.5" y="10.5" width="7" height="7" class="s-born2" transform="rotate(45 14 14)"/>', 'Renamed', 'Same thing, new name') +
      row('<line x1="14" y1="1" x2="14" y2="27" class="s-line2"/><line x1="14" y1="14" x2="21" y2="14" class="s-dim2"/>', 'Tick', 'A dated event in its life') +
      row('<line x1="6" y1="1" x2="6" y2="27" class="s-line2"/><path d="M6 22Q6 14 14 14H22" class="s-dim2" fill="none"/><circle cx="22" cy="14" r="2.5" class="s-born2"/>', 'Link', 'One thing grew out of another') +
      `</ul><p class="fine">Things with a card rank in the top tenth of their kind. Click any line to read its full history. Things only, never entries about people.</p>
      <p class="fine">Ranking weighs ${Object.entries(WEIGHTS).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')}. This is seed data and its dates are still being checked. Release ${esc(release)}, ${things.length} things. <a href="${REPO}" target="_blank" rel="noopener">Data and code on GitHub</a>. Text and data <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>, code MIT; images credited to their authors.</p>`;
  }

  // ---------------------------------------------------------------- events
  function wire() {
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    let rt = null, lastW = innerWidth, lastH = innerHeight;
    addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (innerWidth !== lastW || Math.abs(innerHeight - lastH) > 120) { lastW = innerWidth; lastH = innerHeight; if (state.views.length) render(); }
      }, 150);
    });

    const hot = (id, on) => { for (const el of document.querySelectorAll(`#canvas [data-id="${id}"]`)) el.classList.toggle('hot', on); };
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
      render(L.tOf(scrollX + L.SW / 2));
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
      if (el && state.sizes.delete(el.dataset.grip)) render(L.tOf(scrollX + L.SW / 2));
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
      const era = el('[data-era]');
      if (era && !el('#side')) return openEra(era.dataset.era);
      const zoom = el('[data-zoom]');
      if (zoom) {
        const [a, b] = zoom.dataset.zoom.split('-').map(Number);
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
      const thing = el('[data-id]');
      if (thing) return openThing(thing.dataset.id, { scroll: !!thing.closest('#side'), push: !!thing.closest('#side') });
    });

    $('toggle-side').addEventListener('click', () => showSide($('side').hidden));
    $('play').addEventListener('click', togglePlay);
    $('stop').addEventListener('click', stopPlay);
    $('axis').addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (play.on) pausePlay();
      play.drag = true; $('axis').setPointerCapture(e.pointerId); $('axisbar').classList.add('dragging');
      scrubTo(e.clientX);
    });
    $('axis').addEventListener('pointermove', (e) => { if (play.drag) scrubTo(e.clientX); });
    for (const ev of ['pointerup', 'pointercancel']) $('axis').addEventListener(ev, () => { play.drag = false; $('axisbar').classList.remove('dragging'); drawPlay(); });
    $('axis').addEventListener('keydown', (e) => {
      if (!L || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const now = atEnd() ? L.tMax : play.t, step = (e.key === 'ArrowRight') !== L.newest ? 1 : -1;
      const t = e.key === 'Home' ? L.tMin : e.key === 'End' ? L.tMax : now + step;
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
      document.documentElement.dataset.theme = next; store.set('cg-theme', next);
    });

    $('q').addEventListener('input', findOnTimeline);
    $('q').addEventListener('focus', () => { if ($('q').value) findOnTimeline(); });
    $('q').addEventListener('blur', () => setTimeout(() => drawHits(''), 150));
    $('q').addEventListener('keydown', (e) => {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && hits.length) { e.preventDefault(); hit = (hit + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; drawHits($('q').value.trim().toLowerCase()); }
      else if (e.key === 'Enter') { e.preventDefault(); goHit(Math.max(0, hit)); }
      else if (e.key === 'Escape') { e.stopPropagation(); $('q').value = ''; drawHits(''); $('q').blur(); }
    });
    $('qlist').addEventListener('pointerdown', (e) => { const li = e.target.closest('[data-h]'); if (li) { e.preventDefault(); goHit(Number(li.dataset.h)); } });
    $('vq').addEventListener('input', runSearch);
    $('vq').addEventListener('keydown', (e) => {
      const ok = found.map((f, i) => i);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!ok.length) return;
        const at = ok.indexOf(active);
        active = ok[(at + (e.key === 'ArrowDown' ? 1 : at < 0 ? 0 : -1) + ok.length) % ok.length];
        drawResults();
        $('vlist').querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
      }
      else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) pick(active); }
      else if (e.key === 'Escape' && $('vq').value) { e.stopPropagation(); $('vq').value = ''; runSearch(); }
    });

    // The bars redraw as they move, and record the link once let go.
    $('level').addEventListener('click', (e) => {
      const b = e.target.closest('[data-lv]');
      if (b) { state.level = Number(b.dataset.lv); changed(); }
    });
    const years = () => {
      let a = Number($('y-from').value), b = Number($('y-to').value);
      if (a > b - 2) { if (document.activeElement === $('y-from')) a = b - 2; else b = a + 2; }
      state.span = a <= L.fitMin && b >= Math.floor(L.fitMax) ? null : [a, b];
      render();
    };
    for (const id of ['y-from', 'y-to']) { $(id).addEventListener('input', years); $(id).addEventListener('change', writeUrl); }
    $('years-reset').addEventListener('click', () => { state.span = null; changed(); });
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
    const b = $('reverse'), rev = state.order === 'new';
    b.setAttribute('aria-pressed', rev);
    b.setAttribute('aria-label', rev ? 'Show oldest on the left' : 'Show newest on the left');
    b.title = rev ? 'Newest on the left' : 'Oldest on the left';
  }

  function followHash(smooth) {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) return false;
    if (/^\d{4}$/.test(h)) { flashYear(Number(h)); return true; }
    if (byId.has(h)) { if (state.open !== h) openThing(h, { scroll: true, focus: smooth }); return true; }
    return false;
  }

  // ---------------------------------------------------------------- start
  async function start() {
    const get = (f) => fetch('data/' + f).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
    try {
      const [a, b, c, d] = await Promise.all([get('things.json'), get('categories.json'), get('checkpoints.json'), get('views.json')]);
      things = a.things; release = a.release; cats = b.categories; b0 = b; checkpoints = c.checkpoints; views = d;
    } catch (e) {
      $('status').textContent = 'The timeline data could not be loaded. Please reload the page.';
      return;
    }
    byId = new Map(things.map((t) => [t.id, t]));
    catById = new Map(cats.map((c) => [c.id, c]));
    for (const c of cats) c.domainName = (b0.domains || []).find((d) => d.id === c.domain)?.name;
    viewById = new Map(views.views.map((v) => [v.id, v]));
    prepare();
    if (!readUrl()) {
      const mine = myView();
      if (mine) applyMine(mine);
      else setViews([].concat(views.default));
    }
    wire();
    drawReverse(); drawFit();
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
    render(L ? undefined : null);
    const first = state.views.length === 1 ? viewById.get(state.views[0]) : null;
    if (!followHash(false)) {
      if (first && first.year) scrollToYear(first.year, false);
      else scrollTo(0, 0);
    }
  }
  start();
})();
