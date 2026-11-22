/* The printable export: the views a link names, laid out on A4 or Letter pages to save as a PDF.
   One style for every view (asked for, Nov 2026):
   - One view: a cover, then the entries in date order on the left under their chapters, and the
     page's own stretch of the timeline down the right. Each entry has a dot level with its name
     and a straight dotted line to it; entries that share a year share one dot and curve into it.
     A bar at the top of the timeline shows where the page sits in the whole view.
   - Several views: one timeline down the middle of every page, in strict date order, each year
     written once. A view's entries stand on its side (the 1st, 3rd, 5th view on the left, the
     others on the right, like the pips of a die), in a box bordered in its colour that appears
     where its entries fall. Lines run straight from the timeline, curving only into a shared year.
   The pages are measured in the browser, so everything is placed where it really fits. "Download PDF"
   then draws each page to an image (html2canvas) and saves them as one file (jsPDF), both fetched
   from cdnjs only when pressed; printing is left to the browser, whose print uses print.css. Pure helpers are exported for tests/print.test.mjs. */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// The light theme's view colours (--p0 to --p7 in styles.css): inks that print well on white.
export const INKS = ['#a5621a', '#2c58a6', '#a23b67', '#1f7a5c', '#6a4aa8', '#7a6a1c', '#1f7187', '#a2492f'];
// Chapter tints of a single view.
const TINTS = ['#b5651d', '#2f6b9a', '#7a4f9e', '#2e7d6b', '#a83b3b', '#8a7a2a', '#5b6b7a', '#9a5a7a'];
const BEFORE = '#9a8f7e';   // entries before the first chapter
export const PAPERS = { a4: { w: 210, h: 297, css: 'A4' }, letter: { w: 215.9, h: 279.4, css: 'letter' } };
const MM = 96 / 25.4;

// ---------------------------------------------------------------- dates (as the page writes them)
const sig = (n) => Number(n.toPrecision(3));
const group = (n) => n.toLocaleString('en-US');
export function dateParts(s) {
  const neg = s[0] === '-';
  const [y, m, d] = (neg ? s.slice(1) : s).split('-').map(Number);
  return { y: neg ? -y : y, m, d };
}
export function yearText(y) {
  if (y > 0) return y < 1000 ? y + ' CE' : String(y);
  const a = -y;
  if (a < 10000) return a + ' BCE';
  if (a < 1e5) return group(sig(a)) + ' BCE';
  if (a < 1e6) return group(sig(a)) + ' years ago';
  if (a < 1e9) return sig(a / 1e6) + ' million years ago';
  return sig(a / 1e9) + ' billion years ago';
}
export function fmtDate(s, precision) {
  const { y, m, d } = dateParts(s);
  const Y = yearText(y);
  if (precision === 'circa') return y <= -1e5 ? Y : 'c. ' + Y;
  if (!m || precision === 'year') return Y;
  if (!d || precision === 'month') return MONTHS[m - 1] + ' ' + Y;
  return d + ' ' + MONTHS[m - 1] + ' ' + Y;
}
// A point on the number line for ordering: the written year, then month and day.
export function when(s) {
  const { y, m, d } = dateParts(s);
  return y + ((m || 1) - 1) / 12 + ((d || 1) - 1) / 365;
}
export const spanText = (a, b) => (b == null ? yearText(a) + ' – today' : yearText(a) + ' – ' + yearText(b));
// Which side of the middle timeline a view stands on: like a die, read left to right, then down.
export const sideOf = (i) => (i % 2 === 0 ? 'l' : 'r');
// Letter where it is the usual paper (the US, Canada, Mexico, the Philippines, Chile, Colombia), else A4.
export function paperFor(lang) {
  return /-(US|CA|MX|PH|CL|CO)$/i.test(lang || '') ? 'letter' : 'a4';
}
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- data
// One view file (v/<id>.json) as the export needs it: its chapters and its entries in date order.
// `span` ([from, to] written years, from the timeline's year range) keeps only the entries begun in it.
export function shapeView(payload, boot, i, span) {
  const catName = Object.fromEntries(boot.categories.map((c) => [c.id, c.name]));
  const domOf = Object.fromEntries(boot.categories.map((c) => [c.id, c.domain]));
  const words = Object.fromEntries(boot.domains.map((d) => [d.id, d.words]));
  const v = payload.view;
  const inSpan = (y) => !span || (y >= span[0] && y <= span[1]);
  // chapters that overlap the range; they are not numbered (asked for, Nov 2026)
  const chs = (v.checkpoints || []).map((c) => ({ name: c.name, from: c.from, to: c.to ?? 1e9, note: c.note || '' }))
    .filter((c) => !span || (c.to >= span[0] && c.from <= span[1]));
  const es = payload.entries.filter((e) => inSpan(dateParts(e.events.find((x) => x.type === 'born').date).y)).map((e) => {
    const born = e.events.find((x) => x.type === 'born');
    const end = e.events.find((x) => x.type === 'ended');
    const w = words[domOf[e.category]] || { ended: 'Ended' };
    const y = dateParts(born.date).y;
    const img = e.image || (e.media || []).find((m) => m.type === 'image');
    return {
      vi: i, id: e.id, name: e.names.at(-1).name, kind: catName[e.category] || e.category, summary: e.summary || '',
      t: when(born.date), y, date: fmtDate(born.date, born.precision), rank: e.rank ?? 1e9,
      endText: end ? `${w.ended} ${fmtDate(end.date, end.precision)}${e.cause ? '. ' + e.cause : ''}` : '',
      ci: chs.findIndex((c) => y >= c.from && y <= c.to),
      img: img ? { src: img.src, credit: String(img.credit || '').replace(/<[^>]*>/g, '').slice(0, 90), licence: img.licence || '' } : null,
      src: (e.sources || [])[0]?.title || '',
    };
  }).sort((a, b) => a.t - b.t || a.rank - b.rank);
  return { id: v.id, name: v.name, description: v.description || '', chs, es, first: span ? span[0] : es[0]?.y ?? 0, last: span ? span[1] : null, flag: v.thumb?.image || null };
}

// ---------------------------------------------------------------- the page shell
const $ = (id) => document.getElementById(id);
const doc = typeof document !== 'undefined' ? $('doc') : null;
let pageNo = 0;
function newPage(cls) {
  const p = document.createElement('div'); p.className = 'pg ' + (cls || '');
  doc.appendChild(p); pageNo++; return p;
}
let yr = null;   // the year range the timeline was narrowed to, if any
let rev = false; // newest first, like the timeline turned round (`o=new`)
// Entries in reading order: oldest first, or newest first when reversed; the better ranked first within a moment.
export const inOrder = (es, newest) => es.slice().sort((a, b) => (newest ? b.t - a.t : a.t - b.t) || a.rank - b.rank || a.vi - b.vi);
// A span in reading order: "1957 – 1966", or "1966 – 1957" and "today – 1957" when reversed.
const rs = (a, b) => (rev ? (b == null ? 'today' : yearText(b)) + ' – ' + yearText(a) : spanText(a, b));
const ends = (first) => (rev ? ['today', yearText(first)] : [yearText(first), 'today']);
const linkOf = (views) => 'codegrave.com/?views=' + views.map((v) => v.id).join(',') + (yr ? '&yr=' + yr.join('-') : '') + (rev ? '&o=new' : '');
const today = () => { const d = new Date(); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };

// ---------------------------------------------------------------- one view
function single(D) {
  const T = (ci) => (ci < 0 ? BEFORE : TINTS[ci % TINTS.length]);
  const link = linkOf([D]);
  function frame(p, chName, withLink) {
    p.insertAdjacentHTML('beforeend', '<div class="head"><b>' + esc(D.name) + '</b><span>' + esc(chName || '') + '</span></div><div class="foot"><span>' + (withLink ? esc(link) : '') + '</span><span>' + pageNo + '</span></div><div class="main"></div><div class="rail"></div>');
    return p.querySelector('.main');
  }
  // the cover: title, numbers, the best pictures, the chapters, and the whole view as bands
  {
    const p = newPage('cover'); const m = frame(p, 'A timeline from codegrave.com');
    const pics = coverPictures(D.es, 12); if (rev) pics.reverse();
    m.innerHTML = '<div class="ttl">' + (D.flag ? '<img class="flag" src="' + esc(D.flag) + '" alt="">' : '') + '<h1>' + esc(D.name) + '</h1></div><div class="desc">' + esc(D.description) + '</div>'
      + '<div class="stats"><div><b>' + esc(rs(D.first, D.last)) + '</b>Years</div><div><b>' + D.es.length + '</b>Entries</div><div><b>' + D.chs.length + '</b>Chapters</div></div>'
      + '<div class="mos">' + pics.map((e) => '<div><img crossorigin="anonymous" src="' + esc(e.img.src) + '" alt=""></div>').join('') + '</div>'
      + '<div class="toc">' + (rev ? D.chs.slice().reverse() : D.chs).map((c, i) => '<div>' + esc(c.name) + '<span>' + esc(rs(c.from, c.to >= 1e9 ? null : c.to)) + '</span></div>').join('') + '</div>';
    // The cover is one page: 12 small pictures in rows of 6 (picked, Nov 2026), 6 in one row when the
    // chapters need the room, and a long list of chapters closes up last.
    const mos = m.querySelector('.mos'), over = () => m.scrollHeight > m.clientHeight + 1;
    for (const [cols, n] of [[6, 12], [6, 6]]) {
      mos.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';
      [...mos.children].forEach((d, k) => { d.style.display = k < n ? '' : 'none'; });
      if (!over()) break;
    }
    if (over()) m.classList.add('tight');
    const r = p.querySelector('.rail'); const H = r.clientHeight;
    const keys = D.chs.map((c, i) => ({ c, i, n: Math.max(1, D.es.filter((e) => e.ci === i).length) }));
    if (rev) keys.reverse();   // newest at the top
    const total = keys.reduce((s, k) => s + k.n, 0) || 1; let y = 6 * MM;
    r.insertAdjacentHTML('beforeend', '<div class="mini"><div class="lab" style="padding-left:12.6mm">The whole view</div></div><div class="ax" style="top:6mm"></div>');
    keys.forEach((k) => {
      const h = (H - 8 * MM) * k.n / total;
      r.insertAdjacentHTML('beforeend', '<div class="band" style="top:' + y + 'px;height:' + (h - 2) + 'px;background:' + T(k.i) + '"></div><div class="tl" style="top:' + y + 'px">' + esc(rev ? (k.c.to >= 1e9 ? 'today' : yearText(k.c.to)) : yearText(k.c.from)) + '</div><div class="bn" style="top:' + (y + 2) + 'px">' + esc(k.c.name) + '<span>' + k.n + ' entries</span></div>');
      y += h;
    });
    if (keys.length) r.insertAdjacentHTML('beforeend', '<div class="tl" style="top:' + y + 'px">' + esc(rev ? yearText(keys.at(-1).c.from) : 'today') + '</div>');
  }
  // the pages: chapters and entries flow down the left; a page ends when the next one does not fit
  let page, main, items = [];
  const startPage = (chName) => { page = newPage(); main = frame(page, chName); items = []; };
  const fits = () => main.scrollHeight <= main.clientHeight + 1;
  function place(html, meta) {
    main.insertAdjacentHTML('beforeend', html);
    if (!fits()) {
      main.lastElementChild.remove(); let carry = null;
      if (items.length && !items.at(-1).e) { carry = items.pop(); carry.el.remove(); }   // a chapter heading goes with its first entry
      finishPage(); startPage(meta.chName);
      if (carry) { main.appendChild(carry.el); items.push(carry); }
      main.insertAdjacentHTML('beforeend', html);
    }
    items.push({ el: main.lastElementChild, ...meta });
  }
  function finishPage() {
    const r = page.querySelector('.rail'); const ents = items.filter((i) => i.e);
    if (!ents.length) return;
    const i0 = D.es.indexOf(ents[0].e), i1 = D.es.indexOf(ents.at(-1).e), N = D.es.length;
    let mini = '<div class="mini"><div class="lab">Page ' + pageNo + ' in the whole view</div><div class="bar">';
    D.chs.forEach((c, i) => {
      const ks = D.es.map((e, k) => (e.ci === i ? k : -1)).filter((k) => k >= 0); if (!ks.length) return;
      mini += '<div class="seg" style="left:' + (ks[0] / N * 100) + '%;width:' + ((ks.at(-1) - ks[0] + 1) / N * 100) + '%;background:' + T(i) + ';opacity:.45"></div>';
    });
    mini += '<div class="win" style="left:' + (i0 / N * 100) + '%;width:' + Math.max(2, (i1 - i0 + 1) / N * 100) + '%"></div></div><div class="ends"><span>' + esc(ends(D.first)[0]) + '</span><span>' + esc(ends(D.first)[1]) + '</span></div></div>';
    r.insertAdjacentHTML('beforeend', mini + '<div class="scale"><div class="ax"></div></div>');
    const sc = r.querySelector('.scale'); const H = sc.clientHeight;
    const pr = page.getBoundingClientRect(), sr = sc.getBoundingClientRect(); const off = sr.top - pr.top;
    const pts = ents.map((i) => { const h = i.el.querySelector('h3').getBoundingClientRect(); return { e: i.e, y1: h.top + h.height / 2 - pr.top, xe: i.el.getBoundingClientRect().right - pr.left + 2 * MM }; });
    const groups = []; for (const p of pts) { const g = groups.at(-1); if (g && g[0].e.y === p.e.y) g.push(p); else groups.push([p]); }
    groups.forEach((g) => { const y = g.length === 1 ? g[0].y1 : (g[0].y1 + g.at(-1).y1) / 2; g.forEach((p) => { p.y2 = y; }); g.y = y - off; });
    const cis = [...new Set(ents.map((i) => i.e.ci))];
    cis.forEach((ci, k) => {
      const mine = pts.filter((p) => p.e.ci === ci).map((p) => p.y2 - off);
      const top = k === 0 ? 0 : Math.min(...mine) - 4 * MM, bot = k === cis.length - 1 ? H : Math.max(...mine) + 4 * MM;
      sc.insertAdjacentHTML('afterbegin', '<div class="band" style="top:' + Math.max(0, top) + 'px;height:' + (Math.min(H, bot) - Math.max(0, top)) + 'px;background:' + T(ci) + ';opacity:' + (ci < 0 ? 0.22 : 0.18) + '"></div>');
    });
    let svg = '<svg class="links">';
    const x2 = sr.left - pr.left + 14 * MM - 1.4 * MM;
    groups.forEach((g) => {
      sc.insertAdjacentHTML('beforeend', '<div class="dot" style="top:' + g.y + 'px;border-color:' + T(g[0].e.ci) + '"></div><div class="dl" style="top:' + g.y + 'px">' + esc(yearText(g[0].e.y)) + ' · ' + esc(g[0].e.name) + (g.length > 1 ? ' <span style="color:#968e80">+' + (g.length - 1) + '</span>' : '') + '</div>');
      g.forEach((p) => {
        const c = T(p.e.ci);
        const d = Math.abs(p.y2 - p.y1) < 1.5 ? 'M' + p.xe + ' ' + p.y1 + ' H ' + x2 : 'M' + p.xe + ' ' + p.y1 + ' H ' + (x2 - 12 * MM) + ' C ' + (x2 - 5 * MM) + ' ' + p.y1 + ', ' + (x2 - 7 * MM) + ' ' + p.y2 + ', ' + x2 + ' ' + p.y2;
        svg += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="0.8" stroke-dasharray="1 1.8" stroke-linecap="round" opacity=".75"/><circle cx="' + p.xe + '" cy="' + p.y1 + '" r="1.6" fill="' + c + '"/>';
      });
    });
    page.insertAdjacentHTML('beforeend', svg + '</svg>');
  }
  startPage(D.chs[0]?.name);
  let lastCi = -2;
  for (const e of D.es) {
    const c = D.chs[e.ci];
    if (e.ci !== lastCi) {
      lastCi = e.ci;
      if (c) place('<div class="ch"><div class="k">' + esc(rs(c.from, c.to >= 1e9 ? null : c.to)) + '</div><h2>' + esc(c.name) + '</h2>' + (c.note ? '<p>' + esc(c.note) + '</p>' : '') + '</div>', { chName: c.name });
    }
    place(entryHtml(e), { e, chName: c?.name });
  }
  finishPage();
  // credits
  flowCredits(D.es.map((e) => creditHtml(e)), (first) => {
    const p = newPage(); const m = frame(p, 'Pictures and sources'); m.style.width = 'auto'; m.style.right = '14mm';
    m.innerHTML = (first ? '<div class="ch"><div class="k">Credits</div><h2>Pictures and sources</h2><p>' + esc(creditLine()) + '</p></div>' : '') + '<div class="cred"></div>';
    p.querySelector('.rail').remove();
    const box = m.querySelector('.cred'); box.style.height = (m.clientHeight - box.offsetTop) + 'px';
    return { p, box };
  }, link);
}
// The credits fill as many pages as they need, two columns a page; the link to the views is on the last.
function flowCredits(list, open, link) {
  let c = open(true);
  const over = () => c.box.scrollWidth > c.box.clientWidth + 1;
  for (const html of list) {
    c.box.insertAdjacentHTML('beforeend', html);
    if (over() && c.box.children.length > 1) { c.box.lastElementChild.remove(); c = open(false); c.box.insertAdjacentHTML('beforeend', html); }
  }
  c.p.querySelector('.foot span').textContent = link;
}
// The cover's pictures: `n` of them spread over the whole view and over its kinds, in date order.
// The entries with a picture are cut into `n` stretches in date order; from each comes the best ranked
// of a kind used least so far, and never the same picture twice.
export function coverPictures(es, n) {
  const withImg = es.filter((e) => e.img).sort((a, b) => a.t - b.t);
  const used = new Map(), srcs = new Set(), out = [];
  const k = Math.min(n, withImg.length);
  for (let i = 0; i < k; i++) {
    const part = withImg.slice(Math.floor(i * withImg.length / k), Math.floor((i + 1) * withImg.length / k)).filter((e) => !srcs.has(e.img.src));
    if (!part.length) continue;
    const pick = part.reduce((b, e) => ((used.get(e.kind) || 0) < (used.get(b.kind) || 0) || ((used.get(e.kind) || 0) === (used.get(b.kind) || 0) && e.rank < b.rank) ? e : b));
    out.push(pick); srcs.add(pick.img.src); used.set(pick.kind, (used.get(pick.kind) || 0) + 1);
  }
  return out.sort((a, b) => a.t - b.t);
}
function entryHtml(e) {
  return '<div class="e' + (e.img ? '' : ' noimg') + '">' + (e.img ? '<div class="ph"><img crossorigin="anonymous" src="' + esc(e.img.src) + '" alt=""></div>' : '')
    + '<div><div class="d"><b>' + esc(e.date) + '</b> · ' + esc(e.kind) + '</div><h3>' + esc(e.name) + '</h3><p>' + esc(e.summary) + '</p>' + (e.endText ? '<div class="end">' + esc(e.endText) + '</div>' : '') + '</div></div>';
}
const creditLine = () => 'Pictures are free-licensed and credited below. Text is written for codegrave and shared under CC BY-NC-SA 4.0. Saved ' + today() + '.';
const creditHtml = (e, c) => '<div><b' + (c ? ' style="color:' + c + '"' : '') + '>' + esc(e.name) + '.</b> ' + (e.img ? 'Picture: ' + esc(e.img.credit) + (e.img.licence ? ', ' + esc(e.img.licence) : '') + '. ' : '') + (e.src ? 'Source: ' + esc(e.src) + '.' : '') + '</div>';

// ---------------------------------------------------------------- several views
function many(V, inks) {
  const N = V.length;
  const all = inOrder(V.flatMap((v) => v.es), rev);
  const link = linkOf(V);
  function newManyPage(cls, sect, withLink) {
    const p = newPage(cls);
    const names = (s) => V.map((v, i) => (sideOf(i) === s ? '<b><i style="background:' + inks[i] + '"></i>' + esc(v.name) + '</b>' : '')).join('');
    p.innerHTML = '<div class="head"><div class="vs">' + names('l') + '</div><span class="sp">' + esc(sect || '') + '</span><div class="vs r">' + names('r') + '</div></div><div class="foot"><span>' + (withLink ? esc(link) : '') + '</span><span>' + pageNo + '</span></div>';
    return p;
  }
  // the cover: the views as tiles around the middle, in the same places their entries will stand
  {
    const p = newManyPage('cover', 'Timelines from codegrave.com');
    p.insertAdjacentHTML('beforeend', '<div class="title"><h1>' + V.map((v) => esc(v.name)).join(' <span>·</span> ') + '</h1><p>' + N + ' views read side by side, ' + all.length + ' entries. The years run down the middle in order; each view keeps its side and its colour.</p></div>'
      + '<div class="body"><div class="col L"></div><div class="hub"><div class="ln"></div><div class="yr a"></div><div class="yr b">today</div></div><div class="col R"></div></div>');
    const top = yearText(Math.min(...V.map((v) => v.first))), bot = V[0].last != null ? yearText(V[0].last) : 'today';
    p.querySelector('.yr.a').textContent = rev ? bot : top; p.querySelector('.yr.b').textContent = rev ? top : bot;
    V.forEach((v, i) => {
      const el = document.createElement('div'); el.className = 'panel ' + sideOf(i); el.style.setProperty('--c', inks[i]);
      el.style.flex = '1 1 0'; el.style.display = 'block'; if (N > 4) el.style.minHeight = '0';
      const pics = coverPictures(v.es, N <= 2 ? 18 : 4); if (rev) pics.reverse();   // two views: three rows of 6 each (asked for, Nov 2026)
      el.innerHTML = '<div class="tab"><b>' + esc(v.name) + '</b><span>' + v.es.length + ' entries</span></div><div class="tile' + (N <= 2 ? ' roomy' : '') + '"><div class="top">' + (v.flag ? '<img crossorigin="anonymous" src="' + esc(v.flag) + '" alt="">' : '') + '<h2>' + esc(v.name) + '</h2></div><div class="m">' + esc(rs(v.first, v.last)) + ' · ' + v.chs.length + ' chapters</div><p>' + esc(v.description) + '</p><div class="pics" style="grid-template-columns:repeat(' + (N <= 2 ? 6 : 4) + ',1fr)">' + pics.map((e) => '<div><img crossorigin="anonymous" src="' + esc(e.img.src) + '" alt=""></div>').join('') + '</div>'
        + (N > 4 ? '' : '<div class="chl">Chapters</div><ol>' + (rev ? v.chs.slice().reverse() : v.chs).map((c) => '<li>' + esc(c.name) + '<span>' + esc(rs(c.from, c.to >= 1e9 ? null : c.to)) + '</span></li>').join('') + '</ol>') + '</div>';
      p.querySelector(sideOf(i) === 'l' ? '.col.L' : '.col.R').appendChild(el);
    });
  }
  // the pages: entries in date order, each on its view's side, level with its year's dot
  const lastCh = V.map(() => -2);
  let page, flow, FH, CW, open, colY, lastDotY, lastYear, dots;
  function startPage() {
    page = newManyPage('', ''); page.insertAdjacentHTML('beforeend', '<div class="mini"></div><div class="flow"><div class="spine"></div></div>');
    flow = page.querySelector('.flow'); FH = flow.clientHeight; CW = (flow.clientWidth - 16 * MM) / 2;
    open = { l: null, r: null }; colY = { l: 0, r: 0 }; lastDotY = -1e9; lastYear = null; dots = [];
  }
  const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 - flow.getBoundingClientRect().top; };
  function openBox(vi, s, y) {
    const v = V[vi]; const el = document.createElement('div'); el.className = 'panel ' + s;
    el.style.cssText = '--c:' + inks[vi] + ';position:absolute;top:' + y + 'px;width:' + CW + 'px;' + (s === 'l' ? 'left:0' : 'right:0');
    el.innerHTML = '<div class="tab"><b>' + (v.flag ? '<img crossorigin="anonymous" src="' + esc(v.flag) + '" alt="">' : '') + esc(v.name) + '</b><span></span></div><div class="list"></div>';
    flow.appendChild(el); return { el, vi, list: el.querySelector('.list') };
  }
  function chapHtml(e) {
    const c = V[e.vi].chs[e.ci];
    return '<div class="ch"><div class="k">' + esc(rs(c.from, c.to >= 1e9 ? null : c.to)) + '</div><h2>' + esc(c.name) + '</h2>' + (c.note ? '<p>' + esc(c.note) + '</p>' : '') + '</div>';
  }
  function add(e, force) {
    const s = sideOf(e.vi); const prev = open[s], prevY = colY[s]; let b = prev, fresh = false;
    if (!b || b.vi !== e.vi) { colY[s] = b ? b.el.offsetTop + b.el.offsetHeight + 5.5 * MM : 2.6 * MM; b = openBox(e.vi, s, colY[s]); fresh = true; }
    const added = [];
    if (e.ci >= 0 && e.ci !== lastCh[e.vi]) { b.list.insertAdjacentHTML('beforeend', chapHtml(e)); added.push(b.list.lastElementChild); }
    b.list.insertAdjacentHTML('beforeend', entryHtml(e)); const ent = b.list.lastElementChild; added.push(ent);
    const hy = mid(ent.querySelector('h3'));
    const same = lastYear === e.y;
    // a new year goes below the last one; an entry of the same year shares its dot
    const want = same ? lastDotY : Math.max(hy, lastDotY + 8 * MM);
    const push = want - hy;
    if (push > 0.5) { if (fresh) b.el.style.top = (b.el.offsetTop + push) + 'px'; else added[0].style.marginTop = push + 'px'; }
    if (!force && b.el.offsetTop + b.el.offsetHeight > FH) {
      added.forEach((x) => x.remove()); if (fresh) b.el.remove(); open[s] = prev; colY[s] = prevY; return false;
    }
    if (same) dots.at(-1).pts.push({ e, ent, s }); else dots.push({ y: want, year: e.y, pts: [{ e, ent, s }] });
    lastDotY = want; lastYear = e.y; open[s] = b; if (e.ci >= 0) lastCh[e.vi] = e.ci;
    return true;
  }
  function finishPage() {
    const es = dots.flatMap((d) => d.pts.map((p) => p.e)); if (!es.length) return;
    page.querySelector('.head .sp').textContent = spanText(es[0].y, es.at(-1).y);
    const i0 = all.indexOf(es[0]), i1 = all.indexOf(es.at(-1)), NN = all.length;
    page.querySelector('.mini').innerHTML = '<div class="lab">Page ' + pageNo + ' in the whole timeline</div><div class="bar"><div class="win" style="left:' + (i0 / NN * 100) + '%;width:' + Math.max(2, (i1 - i0 + 1) / NN * 100) + '%"></div></div><div class="ends"><span>' + esc(ends(Math.min(...V.map((v) => v.first)))[0]) + '</span><span>' + esc(ends(Math.min(...V.map((v) => v.first)))[1]) + '</span></div>';
    const fr = flow.getBoundingClientRect(); const X = CW + 8 * MM;
    let svg = '<svg class="links">', html = '';
    dots.forEach((d) => {
      const one = new Set(d.pts.map((p) => p.e.vi)).size === 1; const c = one ? inks[d.pts[0].e.vi] : 'var(--ink)';
      html += '<div class="sdot" style="left:' + X + 'px;top:' + d.y + 'px;border-color:' + c + '"></div><div class="syl" style="left:' + X + 'px;top:' + (d.y - 3.3 * MM) + 'px">' + esc(yearText(d.year)) + '</div>';
      d.pts.forEach((p) => {
        const pc = inks[p.e.vi]; const er = p.ent.getBoundingClientRect(); const y1 = mid(p.ent.querySelector('h3'));
        const xe = p.s === 'l' ? er.right - fr.left + 1 * MM : er.left - fr.left - 1 * MM; const k = p.s === 'l' ? -1 : 1; const x2 = X + k * 1.3 * MM;
        const path = Math.abs(d.y - y1) < 1.5 ? 'M' + x2 + ' ' + d.y + ' H ' + xe : 'M' + x2 + ' ' + d.y + ' C ' + (x2 + k * 4 * MM) + ' ' + d.y + ', ' + (x2 + k * 3 * MM) + ' ' + y1 + ', ' + (x2 + k * 7 * MM) + ' ' + y1 + ' H ' + xe;
        svg += '<path d="' + path + '" fill="none" stroke="' + pc + '" stroke-width="0.8" stroke-dasharray="1 1.8" stroke-linecap="round" opacity=".85"/><circle cx="' + xe + '" cy="' + y1 + '" r="1.3" fill="' + pc + '"/>';
      });
    });
    flow.insertAdjacentHTML('beforeend', svg + '</svg>' + html);
  }
  let k = 0;
  while (k < all.length) {
    startPage(); const k0 = k;
    while (k < all.length && add(all[k])) k++;
    if (k === k0) { add(all[k], true); k++; }
    finishPage();
  }
  flowCredits(all.map((e) => creditHtml(e, inks[e.vi])), (first) => {
    const p = newManyPage('', 'Pictures and sources');
    if (first) p.insertAdjacentHTML('beforeend', '<div class="credl">' + esc(creditLine()) + '</div>');
    p.insertAdjacentHTML('beforeend', '<div class="cred" style="top:' + (first ? 30 : 22) + 'mm"></div>');
    return { p, box: p.querySelector('.cred') };
  }, link);
}

// ---------------------------------------------------------------- download
const LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
const script = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('could not load ' + src)); document.head.appendChild(s); });
// A file name from the views' names: "space-exploration-computers.pdf".
export const fileName = (names) => (names.join(' ').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'codegrave') + '.pdf';
async function download(paper) {
  const btn = $('save'), msg = $('msg'), was = msg.textContent;
  btn.disabled = true; $('paper').disabled = true; $('order').disabled = true;
  try {
    msg.textContent = 'Making the PDF…';
    if (!window.html2canvas || !window.jspdf) for (const src of LIBS) await script(src);
    const P = PAPERS[paper] || PAPERS.a4;
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: [P.w, P.h], orientation: 'portrait', compress: true });
    const pages = [...doc.querySelectorAll('.pg')];
    for (let i = 0; i < pages.length; i++) {
      msg.textContent = 'Making the PDF: page ' + (i + 1) + ' of ' + pages.length + '…';
      const c = await window.html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
      if (i) pdf.addPage([P.w, P.h], 'portrait');
      pdf.addImage(c.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, P.w, P.h, undefined, 'FAST');
    }
    pdf.setProperties({ title: shaped.views.map((v) => v.name).join(', '), creator: 'codegrave.com' });
    pdf.save(fileName(shaped.views.map((v) => v.name)));
    msg.textContent = was;
  } catch (err) {
    msg.textContent = 'The PDF could not be made (' + err.message + '). Try again, or print the page to PDF.';
  } finally { btn.disabled = false; $('paper').disabled = false; $('order').disabled = false; }
}

// ---------------------------------------------------------------- start
async function getJSON(path) {
  const r = await fetch('data/' + path);
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}
const FONTS = ['400 9px Inter', '500 9px Inter', '600 9px Inter', 'italic 400 9px Inter', '17px "Instrument Serif"', 'italic 17px "Instrument Serif"'];
let shaped = null;
function lay(paper) {
  const P = PAPERS[paper] || PAPERS.a4;
  document.documentElement.style.setProperty('--pw', P.w + 'mm');
  document.documentElement.style.setProperty('--ph', P.h + 'mm');
  $('page-size').textContent = '@page { size: ' + P.css + '; }';
  doc.textContent = ''; pageNo = 0;
  const { views, inks } = shaped;
  document.body.className = views.length === 1 ? 'one' : 'many';
  const vs = views.map((v) => ({ ...v, es: inOrder(v.es, rev) }));
  if (vs.length === 1) single(vs[0]); else many(vs, inks);
  $('msg').textContent = pageNo + ' pages, ' + PAPERS[paper].css.replace('letter', 'Letter') + '.';
  return Promise.all([...doc.querySelectorAll('img')].map((im) => (im.complete ? null : new Promise((ok) => { im.onload = im.onerror = ok; }))));
}
async function start() {
  const q = new URLSearchParams(location.search);
  const ids = (q.get('views') || '').split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9][a-z0-9/_-]*$/i.test(s) && !s.includes('..'));
  if (!ids.length) { $('msg').textContent = 'No views named. Open a timeline and press Download PDF.'; return; }
  const m = /^(-?\d+)-(-?\d+)$/.exec(q.get('yr') || '');
  if (m && Number(m[1]) < Number(m[2])) yr = [Number(m[1]), Number(m[2])];
  rev = q.get('o') === 'new';
  const cs = (q.get('c') || '').split(',').map(Number);
  const inks = ids.map((_, i) => INKS[(cs.length === ids.length && cs[i] >= 0 && cs[i] < 8 ? cs[i] : i) % INKS.length]);
  const [boot, ...payloads] = await Promise.all([getJSON('boot.json'), ...ids.map((id) => getJSON('v/' + id + '.json').catch(() => null))]);
  const views = [], keep = [];
  payloads.forEach((p, i) => { const sv = p && p.entries?.length ? shapeView(p, boot, views.length, yr) : null;
    if (sv && sv.es.length) { views.push(sv); keep.push(inks[i]); } });
  if (!views.length) { $('msg').textContent = yr ? 'Nothing in these views begins between ' + yearText(yr[0]) + ' and ' + yearText(yr[1]) + '.' : 'These views could not be loaded.'; return; }
  document.title = views.map((v) => v.name).join(', ') + ' — codegrave';
  await Promise.all(FONTS.map((f) => document.fonts.load(f).catch(() => null)));
  await document.fonts.ready;
  shaped = { views, inks: keep };
  const sel = $('paper'); sel.value = PAPERS[q.get('paper')] ? q.get('paper') : paperFor(navigator.language);
  await lay(sel.value);
  const relay = async () => { $('save').disabled = true; await lay(sel.value); $('save').disabled = false; };
  sel.addEventListener('change', relay);
  const ord = $('order'); ord.value = rev ? 'new' : 'old';
  ord.addEventListener('change', () => { rev = ord.value === 'new'; relay(); });
  $('save').disabled = false;
  $('save').addEventListener('click', () => download(sel.value));
  document.body.dataset.done = '1';
}
if (typeof document !== 'undefined') start().catch((err) => { $('msg').textContent = 'Something went wrong: ' + err.message; });
