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
const BEFORE = '#8f8f8f';   // entries before the first chapter
// The poster's paper, always landscape: A2 as designed, A3, or A4 and Letter for a home printer.
export const POSTER_PAPERS = { a2: { w: 594, h: 420, css: 'A2 landscape', name: 'A2' }, a3: { w: 420, h: 297, css: 'A3 landscape', name: 'A3' },
  a4: { w: 297, h: 210, css: 'A4 landscape', name: 'A4' }, letter: { w: 279.4, h: 215.9, css: 'letter landscape', name: 'Letter' } };
// The fonts offered in Export options (asked for, Nov 2026): free fonts (SIL Open Font License) from
// Google Fonts, fetched only when picked. Lora is the default (picked from the ten, Nov 2026).
export const FONT_DEFAULT = 'lora';
export const FONTS_OFFERED = {
  lora: { name: 'Lora', q: 'Lora:wght@400;500;600' },
  literata: { name: 'Literata', q: 'Literata:opsz,wght@7..72,400;7..72,500;7..72,600' },
  'source-serif': { name: 'Source Serif 4', q: 'Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600' },
  newsreader: { name: 'Newsreader', q: 'Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600' },
  merriweather: { name: 'Merriweather', q: 'Merriweather:wght@400;700' },
  'eb-garamond': { name: 'EB Garamond', q: 'EB+Garamond:wght@400;500;600' },
  'libre-baskerville': { name: 'Libre Baskerville', q: 'Libre+Baskerville:wght@400;700' },
  'crimson-pro': { name: 'Crimson Pro', q: 'Crimson+Pro:wght@400;500;600' },
  atkinson: { name: 'Atkinson Hyperlegible', q: 'Atkinson+Hyperlegible:wght@400;700', sans: true },
  inter: { name: 'Inter', q: null, sans: true },
};
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
export const spanText = (a, b) => (b == null ? yearText(a) + ' – Today' : yearText(a) + ' – ' + yearText(b));
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
      t: when(born.date), y, end: end ? dateParts(end.date).y : null, date: fmtDate(born.date, born.precision), rank: e.rank ?? 1e9,
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
let rev = false; // newest first, like the timeline turned round (`o=backward`)
// Entries in reading order: oldest first, or newest first when reversed; the better ranked first within a moment.
export const inOrder = (es, newest) => es.slice().sort((a, b) => (newest ? b.t - a.t : a.t - b.t) || a.rank - b.rank || a.vi - b.vi);
// A span in reading order: "1957 – 1966", or "1966 – 1957" and "Today – 1957" when reversed.
const rs = (a, b) => (rev ? (b == null ? 'Today' : yearText(b)) + ' – ' + yearText(a) : spanText(a, b));
const ends = (first) => (rev ? ['Today', yearText(first)] : [yearText(first), 'Today']);
const linkOf = (views) => 'https://codegrave.com/?views=' + views.map((v) => v.id).join(',') + (yr ? '&yr=' + yr.join('-') : '') + '&o=' + (rev ? 'backward' : 'forward');
const today = () => { const d = new Date(); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };

// ---------------------------------------------------------------- one view
function single(D) {
  const T = (ci) => (ci < 0 ? BEFORE : TINTS[ci % TINTS.length]);
  const link = linkOf([D]);
  function frame(p, chName, withLink) {
    p.insertAdjacentHTML('beforeend', '<div class="head"><b>' + esc(D.name) + '</b><span>' + esc(chName || '') + '</span></div><div class="foot"><span class="lnk">' + (withLink ? esc(link) : '') + '</span><span>' + pageNo + '</span></div><div class="main"></div><div class="rail"></div>');
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
      r.insertAdjacentHTML('beforeend', '<div class="band" style="top:' + y + 'px;height:' + (h - 2) + 'px;background:' + T(k.i) + '"></div><div class="tl" style="top:' + y + 'px">' + esc(rev ? (k.c.to >= 1e9 ? 'Today' : yearText(k.c.to)) : yearText(k.c.from)) + '</div><div class="bn" style="top:' + (y + 2) + 'px">' + esc(k.c.name) + '<span>' + k.n + ' entries</span></div>');
      y += h;
    });
    if (keys.length) r.insertAdjacentHTML('beforeend', '<div class="tl" style="top:' + y + 'px">' + esc(rev ? yearText(keys.at(-1).c.from) : 'Today') + '</div>');
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
    p.innerHTML = '<div class="head"><div class="vs">' + names('l') + '</div><span class="sp">' + esc(sect || '') + '</span><div class="vs r">' + names('r') + '</div></div><div class="foot"><span class="lnk">' + (withLink ? esc(link) : '') + '</span><span>' + pageNo + '</span></div>';
    return p;
  }
  // the cover: the views as tiles around the middle, in the same places their entries will stand
  {
    const p = newManyPage('cover', 'Timelines from codegrave.com');
    p.insertAdjacentHTML('beforeend', '<div class="title"><h1>' + V.map((v) => esc(v.name)).join(' <span>·</span> ') + '</h1><p>' + N + ' views read side by side, ' + all.length + ' entries. The years run down the middle in order; each view keeps its side and its colour.</p></div>'
      + '<div class="body"><div class="col L"></div><div class="hub"><div class="ln"></div><div class="yr a"></div><div class="yr b">Today</div></div><div class="col R"></div></div>');
    const top = yearText(Math.min(...V.map((v) => v.first))), bot = V[0].last != null ? yearText(V[0].last) : 'Today';
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

// ---------------------------------------------------------------- the poster
// "Poster" in the Format switch (asked for, Nov 2026, after several rounds): A2 landscape sheets, as
// few as the cards need. One thick line across the middle, coloured by chapter and named on itself;
// every entry is a card (picture, kind, name, years, summary, the picture's credit). The cards stand
// on one grid of columns shared by four rows, so every row starts at the left edge and ends at the
// right. A column holds up to four entries in date order, read from top to bottom: top outer, top
// inner, bottom inner, bottom outer. The inner cards' lines drop straight to the line; the outer
// cards' lines run down the gutter beside the column, so no line crosses a card. A small ring marks
// where each line meets the band, with the year written beside it (not a pill: asked for).
export const POSTER = { w: 594, h: 420, side: 22, gutter: 7, minCard: 44, maxCard: 62 };
// Smaller paper (asked for, Nov 2026: "we cannot print in the A4 or letter"). The poster is laid out
// on a sheet of the paper's shape in the A2 sizes, then the whole sheet is scaled down by k. A3 is A2
// at 0.71 with the same four rows. A4 and Letter would be too small that way, so they keep two rows
// (the inner cards only) at 0.8 and take more sheets. The text size (`fs`, Export options) scales the
// sheet the same way: larger text lays the poster out on a smaller sheet, so it takes more sheets, and
// a sheet too low for four rows takes two. Two rows need 232 mm before scaling, which caps the size.
export function posterSheet(P, fs = 1) {
  const base = P.h / POSTER.h >= 0.7 ? P.h / POSTER.h : 0.8, fit = P.h / 232;
  const k = Math.min(base * fs, fit), h = P.h / k;
  return { w: P.w / k, h, rows: h >= 392 ? 4 : 2, k, capped: base * fs > fit + 1e-9 };
}
// Card width for C columns on a sheet W wide: a gutter before the first and after the last for their lines.
export const posterCardWidth = (C, W = POSTER.w) => Math.min(POSTER.maxCard, (W - 2 * POSTER.side - (C + 1) * POSTER.gutter) / C);
// How the entries share the sheets: the fewest sheets whose cards are at least minCard wide.
// Returns the number of entries on each sheet and the columns per sheet.
export function posterSheets(n, sheet = { w: POSTER.w, rows: 4 }) {
  const R = sheet.rows;
  for (let P = 1; ; P++) {
    const per = Math.ceil(n / P), C = Math.ceil(per / R);
    if (posterCardWidth(C, sheet.w) >= POSTER.minCard || per <= R) {
      const sizes = []; for (let i = 0; i < n; i += per) sizes.push(Math.min(per, n - i));
      return { sizes, C };
    }
  }
}
// The slots of one sheet, [column, slot] in date order. A sheet with fewer entries than rows × C
// gives up a slot in columns inside it (an outer one with four rows; top and bottom in turn), so its
// first and last columns stay full and the edges line up. With two rows only slots 1 and 2 are used.
export function posterSlots(n, C, rows = 4) {
  const empty = Math.max(0, C * rows - n), short = new Set();
  for (let k = 0; k < empty; k++) short.add(Math.min(C - 1, Math.max(0, Math.round((k + 1) * (C - 1) / (empty + 1)))));
  const full = rows === 4 ? [0, 1, 2, 3] : [1, 2], less = (c) => (rows === 4 ? (c % 2 ? [0, 1, 2] : [1, 2, 3]) : (c % 2 ? [2] : [1]));
  const out = [];
  for (let c = 0; c < C; c++) out.push(...(short.has(c) ? less(c) : full).map((s) => [c, s]));
  return out.slice(0, n);
}

function poster(vs, inks, paper, fs) {
  const sheet = posterSheet(paper, fs), S = { ...POSTER, w: sheet.w, h: sheet.h }, one = vs.length === 1, link = linkOf(vs);
  const all = one ? vs[0].es : inOrder(vs.flatMap((v) => v.es), rev);
  const chs = one ? vs[0].chs : [];
  const ink = (e) => (one ? (e.ci < 0 ? BEFORE : TINTS[e.ci % TINTS.length]) : inks[e.vi]);
  const { sizes, C } = posterSheets(all.length, sheet), CW = posterCardWidth(C, S.w);
  const BAND = 8, MID = 40 + (S.h - 14 - 40) / 2;
  // two rows leave room above and below: the cards grow taller, with a larger picture and more words
  const room = MID - 40 - BAND / 2 - 7 - 4;
  const CH = sheet.rows === 4 ? CW * 0.56 + 42 : Math.min(room, CW * 0.8 + 46), PIC = sheet.rows === 4 ? CW * 0.56 : CH - 46;
  const name = vs.map((v) => v.name).join(', ');
  // with several views the title names them in their colours, which are the cards' colours
  const title = one ? esc(name) : vs.map((v, i) => '<span style="color:' + inks[i] + '">' + esc(v.name) + '</span>').join(', ');
  const first = Math.min(...vs.map((v) => v.first)), last = vs.every((v) => v.last != null) ? Math.max(...vs.map((v) => v.last)) : null;
  const yearsOf = (e) => (e.end != null && e.end !== e.y ? (rev ? yearText(e.end) + ' – ' + yearText(e.y) : yearText(e.y) + ' – ' + yearText(e.end)) : yearText(e.y));
  let at = 0;
  sizes.forEach((n, pi) => {
    const part = all.slice(at, at + n); at += n;
    const pg = newPage('sheet'), lastSheet = pi === sizes.length - 1;
    // everything stands on the sheet in A2 sizes, scaled down to the paper
    const p = document.createElement('div'); p.className = 'vs'; pg.appendChild(p);
    p.style.cssText = 'width:' + S.w + 'mm;height:' + S.h + 'mm;transform:scale(' + sheet.k + ')';
    p.style.setProperty('--mid', MID + 'mm');
    const slots = posterSlots(n, C, sheet.rows);
    // the grid stands in the middle of the sheet, also when its cards are at their widest and it is narrower than the sheet
    const x0 = (S.w - C * CW - (C - 1) * S.gutter) / 2;
    const items = part.map((e, i) => {
      const [c, s] = slots[i], a = x0 + c * (CW + S.gutter);
      const x = s === 0 ? a - S.gutter / 2 + 1.4 : s === 1 ? a + CW * 0.35 : s === 2 ? a + CW * 0.65 : a + CW + S.gutter / 2 - 1.4;
      return { e, a, x, up: s <= 1, outer: s === 0 || s === 3 };
    });
    let h = '';
    // the band: one stretch per chapter (one view) or a plain line (several views)
    const key = (e) => (one ? e.ci : -2);
    const runs = [];
    items.forEach((it, i) => { if (!i || key(it.e) !== key(items[i - 1].e)) runs.push({ k: key(it.e), a: i ? (it.x + items[i - 1].x) / 2 : S.side - 4 }); });
    runs.forEach((r, j) => {
      const b = j < runs.length - 1 ? runs[j + 1].a : S.w - S.side + 4, c = chs[r.k];
      const col = r.k === -2 ? '#3a3631' : r.k < 0 ? BEFORE : TINTS[r.k % TINTS.length];
      h += '<div class="seg" style="left:' + r.a + 'mm;width:' + (b - r.a) + 'mm;background:' + col + '">' + (c ? '<b>' + esc(c.name) + '</b><span>' + esc(rs(c.from, c.to >= 1e9 ? null : c.to)) + '</span>' : '') + '</div>';
    });
    h += '<div class="arrow" style="left:' + (S.w - S.side + 4) + 'mm;top:' + MID + 'mm"></div>';
    for (const { e, a, x, up, outer } of items) {
      const k = ink(e), near = up ? MID - BAND / 2 - 7 - CH : MID + BAND / 2 + 7, top = outer ? (up ? near - CH - 6 : near + CH + 6) : near;
      const edge = up ? MID - BAND / 2 : MID + BAND / 2;
      if (outer) {
        const my = top + CH / 2;
        h += '<div class="arm" style="left:' + (up ? x : a + CW) + 'mm;top:' + my + 'mm;width:' + (up ? a - x : x - a - CW) + 'mm;background:' + k + '"></div>'
          + '<div class="stem" style="left:' + x + 'mm;top:' + Math.min(my, edge) + 'mm;height:' + Math.abs(edge - my) + 'mm;background:' + k + '"></div>';
      } else {
        const s0 = up ? top + CH : edge, s1 = up ? edge : top;
        h += '<div class="stem" style="left:' + x + 'mm;top:' + s0 + 'mm;height:' + (s1 - s0) + 'mm;background:' + k + '"></div>';
      }
      h += '<div class="tick" style="left:' + x + 'mm;top:' + edge + 'mm;border-color:' + k + '"></div><div class="yr ' + (up ? 'u' : 'd') + '" style="left:' + x + 'mm;top:' + edge + 'mm;color:' + k + '">' + esc(yearText(e.y)) + '</div>';
      h += '<div class="card" style="left:' + a + 'mm;top:' + top + 'mm;width:' + CW + 'mm;height:' + CH + 'mm;--k:' + k + '">'
        + (e.img ? '<figure style="height:' + PIC + 'mm"><img crossorigin="anonymous" src="' + esc(e.img.src) + '" alt=""></figure>' : '')
        + '<div class="tx"><em>' + esc(e.kind) + '</em><b>' + esc(e.name) + '</b><small>' + esc(yearsOf(e)) + '</small><p>' + esc(e.summary) + '</p></div></div>';
    }
    // where this sheet sits in the whole span, when there are several
    const t0 = Math.min(...all.map((e) => e.y)), t1 = new Date().getFullYear(), pos = (y) => ((y - t0) / Math.max(1, t1 - t0)) * 100;
    const ys = part.map((e) => e.y), toNow = rev ? pi === 0 : lastSheet;
    const lo = Math.min(...ys), hi = toNow ? t1 : Math.max(...ys);
    const from = rev && pi === 0 ? 'Today' : yearText(part[0].y), to = !rev && lastSheet ? 'Today' : yearText(part.at(-1).y);
    // top right: the whole span as a bar in the chapters' colours (one view) or the views' (several),
    // with this sheet's stretch outlined, and which part this is
    const clamp = (v) => Math.max(0, Math.min(100, v));
    const bands = one
      ? chs.map((c, i) => { const a = clamp(pos(c.from)), b = clamp(pos(c.to >= 1e9 ? t1 : c.to)); return b > a ? '<i style="left:' + a + '%;width:' + (b - a) + '%;background:' + TINTS[i % TINTS.length] + '"></i>' : ''; }).join('')
      : vs.map((v, i) => { const a = clamp(pos(v.first)), b = clamp(pos(v.last ?? t1)); return '<i style="left:' + a + '%;width:' + Math.max(1, b - a) + '%;top:' + (i * 100 / vs.length) + '%;height:' + (100 / vs.length) + '%;background:' + inks[i] + '"></i>'; }).join('');
    const win = sizes.length > 1 ? '<b style="left:' + clamp(pos(lo)) + '%;width:' + Math.max(1.5, clamp(pos(hi)) - clamp(pos(lo))) + '%"></b>' : '';
    const label = sizes.length > 1 ? 'Part ' + (pi + 1) + ' of ' + sizes.length + ' · ' + esc(from + ' – ' + to) : esc(rs(first, last));
    const mini = '<div class="where"><div class="mini">' + bands + win + '</div><div class="ends"><span>' + esc(rev ? 'Today' : yearText(t0)) + '</span><span class="pn">' + label + '</span><span>' + esc(rev ? yearText(t0) : 'Today') + '</span></div></div>';
    const head = '<div class="t' + (pi ? ' sm' : '') + '"><div class="ti"><h1>' + title + '</h1>' + (pi === 0 && one && vs[0].description ? '<p>' + esc(vs[0].description) + '</p>' : '') + '</div>' + mini + '</div>';
    const foot = '<div class="foot"><span class="lnk"></span><span>A timeline from codegrave.com</span></div>';
    p.innerHTML = head + h + foot;
  });
  // the pictures' credits on their own sheet at the end (asked for: no credit over the pictures)
  const sheetOf = () => { const pg = newPage('sheet'), v = document.createElement('div'); v.className = 'vs'; pg.appendChild(v);
    v.style.cssText = 'width:' + S.w + 'mm;height:' + S.h + 'mm;transform:scale(' + sheet.k + ')'; return v; };
  flowCredits(all.filter((e) => e.img || e.src).map((e) => creditHtml(e, one ? null : inks[e.vi])), (first) => {
    const p = sheetOf();
    p.innerHTML = '<div class="cr-h"><h1>' + (first ? 'Pictures and sources' : '&nbsp;') + '</h1>' + (first ? '<p>' + esc(creditLine()) + '</p>' : '') + '</div><div class="cred"></div>'
      + '<div class="foot"><span class="lnk"></span><span>A timeline from codegrave.com</span></div>';
    return { p, box: p.querySelector('.cred') };
  }, link);
  // a chapter's stretch of the band too short for its label drops the years, then the label
  for (const el of doc.querySelectorAll('.sheet .seg')) {
    if (el.scrollWidth > el.clientWidth + 1) el.querySelector('span')?.remove();
    if (el.scrollWidth > el.clientWidth + 1) el.textContent = '';
  }
  // each summary keeps the whole words that fit its card
  for (const el of doc.querySelectorAll('.sheet .tx p')) {
    const words = el.textContent.split(' ');
    while (words.length > 1 && el.scrollHeight > el.clientHeight + 1) { words.pop(); el.textContent = words.join(' ').replace(/[,;:]?$/, '…'); }
  }
}

// ---------------------------------------------------------------- download
const LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
const script = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('could not load ' + src)); document.head.appendChild(s); });
// A file name from the views' names: "space-exploration-computers.pdf".
export const fileName = (names) => (names.join(' ').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'codegrave') + '.pdf';
async function download(paper, fmt) {
  const btn = $('save'), msg = $('msg'), was = msg.textContent;
  btn.disabled = true; for (const id of ['paper', 'order', 'fmt', 'font', 'size']) $(id).disabled = true;
  try {
    msg.textContent = 'Making the PDF…';
    if (!window.html2canvas || !window.jspdf) for (const src of LIBS) await script(src);
    const P = fmt === 'poster' ? POSTER_PAPERS[paper] || POSTER_PAPERS.a2 : PAPERS[paper] || PAPERS.a4, turn = P.w > P.h ? 'landscape' : 'portrait';
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: [P.w, P.h], orientation: turn, compress: true });
    const pages = [...doc.children];   // a page, or the frame a scaled book page stands in
    for (let i = 0; i < pages.length; i++) {
      msg.textContent = 'Making the PDF: page ' + (i + 1) + ' of ' + pages.length + '…';
      // a poster is drawn as sharp as an A2 sheet at 1.5, whatever the paper, without a huge file
      const c = await window.html2canvas(pages[i], { scale: fmt === 'poster' ? Math.min(3, 1.5 * 594 / P.w) : 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
      if (i) pdf.addPage([P.w, P.h], turn);
      pdf.addImage(c.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, P.w, P.h, undefined, 'FAST');
    }
    pdf.setProperties({ title: shaped.views.map((v) => v.name).join(', '), creator: 'codegrave.com' });
    pdf.save(fileName(shaped.views.map((v) => v.name).concat(fmt === 'poster' ? ['poster'] : [])));
    msg.textContent = was;
  } catch (err) {
    msg.textContent = 'The PDF could not be made (' + err.message + '). Try again, or print the page to PDF.';
  } finally { btn.disabled = false; for (const id of ['paper', 'order', 'fmt', 'font', 'size']) $(id).disabled = false; }
}

// ---------------------------------------------------------------- start
async function getJSON(path) {
  const r = await fetch('data/' + path);
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}
const FONTS = ['400 9px Lora', '500 9px Lora', '600 9px Lora', '400 9px Inter', '700 9px Inter', '500 9px Inter', '600 9px Inter', 'italic 400 9px Inter', '17px "Instrument Serif"', 'italic 17px "Instrument Serif"'];
let shaped = null;
// The text size (`fs`, 0.8 to 1.6, Export options, `&size=` in the link) scales whole pages: the book is
// laid out on a page 1/fs the paper's size and each page is scaled up by fs, so larger text means
// fewer entries a page and more pages (asked for, Nov 2026). The poster does the same in posterSheet().
let fs = 1;
function lay(paper, fmt) {
  const P = fmt === 'poster' ? POSTER_PAPERS[paper] || POSTER_PAPERS.a2 : PAPERS[paper] || PAPERS.a4, z = fmt === 'poster' ? 1 : fs;
  document.documentElement.style.setProperty('--pw', P.w / z + 'mm');
  document.documentElement.style.setProperty('--ph', P.h / z + 'mm');
  $('page-size').textContent = '@page { size: ' + P.css + '; }';
  doc.textContent = ''; pageNo = 0;
  const { views, inks } = shaped;
  document.body.className = fmt === 'poster' ? 'poster' : views.length === 1 ? 'one' : 'many';
  const vs = views.map((v) => ({ ...v, es: inOrder(v.es, rev) }));
  if (fmt === 'poster') poster(vs, inks, P, fs); else if (vs.length === 1) single(vs[0]); else many(vs, inks);
  // each book page stands in a frame of the paper's size, scaled up to fill it
  if (z !== 1) for (const pg of [...doc.children]) {
    const o = document.createElement('div'); o.className = 'pgo'; o.style.width = P.w + 'mm'; o.style.height = P.h + 'mm';
    pg.replaceWith(o); o.appendChild(pg); pg.style.transform = 'scale(' + z + ')';
  }
  const cap = fmt === 'poster' && posterSheet(P, fs).capped ? ' Text is at the largest size that fits this paper.' : '';
  $('msg').textContent = (fmt === 'poster' ? pageNo + (pageNo === 1 ? ' sheet' : ' sheets') + ', ' + P.name + ' landscape.' : pageNo + ' pages, ' + PAPERS[paper].css.replace('letter', 'Letter') + '.') + cap;
  return Promise.all([...doc.querySelectorAll('img')].map((im) => (im.complete ? null : new Promise((ok) => { im.onload = im.onerror = ok; }))));
}
// Sets the export's reading font, fetching it from Google Fonts first if needed.
async function useFont(key) {
  const f = FONTS_OFFERED[key] || FONTS_OFFERED[FONT_DEFAULT], id = 'font-' + key;
  if (f.q && !document.getElementById(id)) {
    const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + f.q + '&display=swap';
    await new Promise((ok) => { l.onload = l.onerror = ok; document.head.appendChild(l); });
  }
  await Promise.all(['400', '500', '600'].map((w) => document.fonts.load(w + ' 9px "' + f.name + '"').catch(() => null)));
  document.documentElement.style.setProperty('--serif', '"' + f.name + '", ' + (f.sans ? 'Inter, sans-serif' : 'Georgia, serif'));
}
async function start() {
  const q = new URLSearchParams(location.search);
  const ids = (q.get('views') || '').split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9][a-z0-9/_-]*$/i.test(s) && !s.includes('..'));
  if (!ids.length) { $('msg').textContent = 'No views named. Open a timeline and press Download PDF.'; return; }
  const m = /^(-?\d+)-(-?\d+)$/.exec(q.get('yr') || '');
  if (m && Number(m[1]) < Number(m[2])) yr = [Number(m[1]), Number(m[2])];
  rev = q.get('o') === 'backward';
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
  // Format: the book (A4 or Letter pages) or the poster (landscape sheets, A2 to A4); kept in the link as `fmt=poster`
  const fm = $('fmt'); fm.value = q.get('fmt') === 'poster' ? 'poster' : 'book';
  const keepLink = () => history.replaceState(null, '', '?' + q.toString().replace(/%2C/g, ',').replace(/%2F/g, '/'));
  // The paper starts as the one used where the reader is (Letter in the US and a few others, A4 elsewhere).
  // The book offers A4 and Letter; the poster A2, A3, A4 and Letter. Kept in the link as `paper`.
  const sel = $('paper'), home = paperFor(navigator.language);
  const papers = () => { const set = fm.value === 'poster' ? POSTER_PAPERS : PAPERS, was = sel.value || q.get('paper');
    sel.innerHTML = Object.entries(set).map(([k, v]) => '<option value="' + k + '">' + (v.name || v.css.replace('letter', 'Letter (US)')) + '</option>').join('');
    sel.value = set[was] ? was : home; };
  sel.textContent = ''; papers();
  // Font: kept in the link as `font`; a font other than Lora or Inter is fetched when picked
  const fo = $('font');
  fo.innerHTML = Object.entries(FONTS_OFFERED).map(([k, f]) => '<option value="' + k + '">' + f.name + (k === FONT_DEFAULT ? ' (default)' : '') + '</option>').join('');
  fo.value = FONTS_OFFERED[q.get('font')] ? q.get('font') : FONT_DEFAULT;
  await useFont(fo.value);
  { const a = Number(q.get('size')); if (a >= 80 && a <= 160) fs = a / 100; }
  await lay(sel.value, fm.value);
  const relay = async () => { $('save').disabled = true; await lay(sel.value, fm.value); $('save').disabled = false; };
  sel.addEventListener('change', () => { q.set('paper', sel.value); keepLink(); relay(); });
  fo.addEventListener('change', async () => { if (fo.value === FONT_DEFAULT) q.delete('font'); else q.set('font', fo.value); keepLink();
    $('save').disabled = true; await useFont(fo.value); relay(); });
  // Text size: a slider from 80 % to 160 %; the pages are laid out again when it is let go
  const sz = $('size'), szv = $('size-v'), showSize = () => { szv.textContent = sz.value + '%'; };
  sz.value = Math.round(fs * 100); showSize();
  sz.addEventListener('input', showSize);
  sz.addEventListener('change', () => { fs = sz.value / 100; if (fs === 1) q.delete('size'); else q.set('size', sz.value); keepLink(); relay(); });
  fm.addEventListener('change', () => { if (fm.value === 'poster') q.set('fmt', 'poster'); else q.delete('fmt'); papers(); keepLink(); relay(); });
  const ord = $('order'); ord.value = rev ? 'new' : 'old';
  ord.addEventListener('change', () => { rev = ord.value === 'new';
    q.set('o', rev ? 'backward' : 'forward'); keepLink();
    relay(); });
  $('save').disabled = false;
  $('save').addEventListener('click', () => download(sel.value, fm.value));
  document.body.dataset.done = '1';
}
if (typeof document !== 'undefined') start().catch((err) => { $('msg').textContent = 'Something went wrong: ' + err.message; });
