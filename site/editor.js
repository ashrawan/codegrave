/* "Open in editor": a timeline of the reader's own as one page of rows, with the road live beside it
   (asked for, Nov 2026: option 2 of the designs, "we dont want multiple tabs and complexity").

   The editor changes the timeline's spec (site/ai.js), the same small file Ask AI rewrites, and turns
   it into the view file with specToView() after every change, so the road, Ask AI and the export all
   read one thing. Every change is kept by itself (a moment after the last one) and can be undone.
   The page lends what it needs through `deps`; the editor never reaches into the page's state. */
import { cleanSpec, specToView, specProblem, readDate, showDate, readBound, chapterOf, findPictures, yearOfDate, fmtValue, MAX_ENTRIES } from './ai.js';

const SAVE_AFTER = 700;      // ms of quiet before a change is written to the database
const KEEP = 100;            // steps of undo

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const UNDO = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
const REDO = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>';
const DOTS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/></svg>';

/* deps: $, esc, phone(), toast(text, {undo}), popover(anchor, html, cls) -> element, closeLayer(),
   write(row, body) -> Promise (keeps title, description and data in the database),
   show(row) (the page takes the row's new data), goTo(entryId) (the road travels to it),
   relayout() (the road's room changed), publish(anchor), listChanged() (the sidebar's names). */
export function createEditor(deps) {
  const { $, esc } = deps;
  let ed = null;          // { row, spec, keys, seed, data, open, chOpen, undo, redo, find, timer, saving, err, opened }
  let nextKey = 1;

  // ---- the timeline being edited
  function open(row) {
    let data;
    try { data = JSON.parse(row.text); } catch (e) { return false; }
    if (!data.spec) return false;
    const spec = cleanSpec(data.spec);
    const seed = /^x([a-z0-9]+)-/.exec(data.entries?.[0]?.id || '')?.[1] || Math.random().toString(36).slice(2, 8);
    ed = { row, data, spec, keys: spec.entries.map(() => nextKey++), seed, open: null, chOpen: null, undo: [], redo: [], find: '', timer: 0, saving: false, err: '', at: 0 };
    let el = $('editor');
    if (!el) { el = document.createElement('section'); el.id = 'editor'; el.setAttribute('aria-label', 'Edit timeline'); document.body.append(el); wire(el); }
    el.hidden = false;
    document.body.classList.add('editing');
    draw();
    deps.relayout();
    return true;
  }
  function close() {
    if (!ed) return;
    flush();
    ed = null;
    $('editor').hidden = true; $('editor').innerHTML = '';
    document.body.classList.remove('editing', 'ed-sheet');
    deps.relayout();
  }
  // The timeline changed from elsewhere (Ask AI, its Undo): the editor takes it, as a step that can be undone.
  function reload() {
    if (!ed) return;
    let data; try { data = JSON.parse(ed.row.text); } catch (e) { return; }
    if (!data.spec || JSON.stringify(cleanSpec(data.spec)) === JSON.stringify(ed.spec)) return;
    take(cleanSpec(data.spec), data, false);
  }
  // Takes a new spec: keys follow the entries by name, the road is redrawn at once, the database a moment later.
  function take(spec, data = ed.data, save = true, keyOf = null) {
    ed.undo.push(JSON.stringify(ed.spec)); if (ed.undo.length > KEEP) ed.undo.shift();
    ed.redo = [];
    set(spec, data, save, keyOf);
  }
  function set(spec, data, save, keyOf) {
    const byName = keyOf || new Map(ed.spec.entries.map((e, i) => [norm(e.name), ed.keys[i]]));
    ed.spec = spec;
    ed.keys = spec.entries.map((e) => byName.get(norm(e.name)) ?? nextKey++);
    const f = specToView(spec, ed.seed);
    ed.data = { ...data, view: f.view, entries: f.entries, spec: f.spec };
    ed.row.title = spec.title; ed.row.description = spec.description;
    ed.row.text = JSON.stringify(ed.data);
    deps.show(ed.row);
    if (save) later();
    draw();
    if (ed.open != null) follow(ed.open);
  }
  // One edit: `mut` changes a copy of the spec. Returns why it cannot be kept, or ''.
  function change(mut) {
    const draft = JSON.parse(JSON.stringify(ed.spec));
    const keyOf = new Map(), objKey = new Map(draft.entries.map((e, i) => [e, ed.keys[i]]));
    mut(draft);
    const why = specProblem(draft);
    if (why) return why;
    for (const e of draft.entries) keyOf.set(norm(e.name), objKey.get(e) ?? nextKey++);
    const clean = cleanSpec(draft);
    if (JSON.stringify(clean) === JSON.stringify(ed.spec)) return '';
    take(clean, ed.data, true, keyOf);
    return '';
  }
  function undo(back = true) {
    const from = back ? ed.undo : ed.redo, to = back ? ed.redo : ed.undo;
    if (!from.length) return;
    to.push(JSON.stringify(ed.spec));
    set(JSON.parse(from.pop()), ed.data, true, null);
  }

  // ---- keeping it
  function later() { clearTimeout(ed.timer); ed.timer = setTimeout(flush, SAVE_AFTER); ed.err = ''; ed.dirty = true; status(); }
  async function flush() {
    if (!ed || !ed.dirty) return;
    clearTimeout(ed.timer);
    const me = ed, titled = me.row.title;
    me.dirty = false; me.saving = true; status();
    try {
      await deps.write(me.row, { title: me.spec.title, description: me.spec.description, data: me.data });
      me.at = Date.now(); me.err = '';
      if (titled !== me.lastTitle) { me.lastTitle = titled; deps.listChanged(); }
    } catch (e) { me.err = e.message || 'Not saved.'; me.dirty = true; }
    me.saving = false;
    if (ed === me) { status(); if (me.dirty && !me.err) later(); }
  }
  function status() {
    const s = $('ed-saved');
    if (!s || !ed) return;
    s.classList.toggle('err', !!ed.err);
    s.innerHTML = ed.err ? `Not saved: ${esc(ed.err)} <button type="button" class="lnk" data-ed-retry>Try again</button>`
      : ed.saving || ed.dirty ? 'Saving…' : ed.at ? 'Saved · just now' : 'Saved';
    const u = $('editor').querySelector('[data-ed-undo]'), r = $('editor').querySelector('[data-ed-redo]');
    if (u) u.disabled = !ed.undo.length;
    if (r) r.disabled = !ed.redo.length;
  }
  addEventListener('beforeunload', (e) => { if (ed?.dirty || ed?.saving) { flush(); e.preventDefault(); } });

  // ---- what is drawn
  const idOf = (k) => { const i = ed.keys.indexOf(k); return i < 0 ? null : ed.data.entries[i]?.id; };
  function follow(k) { const id = idOf(k); if (id) deps.goTo(id); }
  const boundText = (b) => (ed.spec.axis === 'scale' ? String(b) : showDate(b));
  const dots = (k, n) => `<span class="ed-wt" role="group" aria-label="How much it matters">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-ed-wt="${k}:${i}" class="${i <= n ? 'on' : ''}" aria-label="${i} of 5"></button>`).join('')}</span>`;
  const pic = (e) => (e.image ? `<span class="ed-pic"><img src="${esc(e.image.src)}" alt="" loading="lazy"></span>` : '<span class="ed-pic none" title="No picture"></span>');
  function row(e, i) {
    const k = ed.keys[i];
    if (ed.open === k) return openRow(e, k);
    return `<div class="ed-row" data-k="${k}" tabindex="0" role="button" aria-label="Edit ${esc(e.name)}">${pic(e)}<span class="ed-name">${esc(e.name)}</span><span class="ed-kind">${esc(e.kind)}</span>${e.value != null ? `<span class="ed-d">${esc(fmtValue(e.value, ed.spec.unit))}</span><span class="ed-d"></span>` : e.rank ? `<span class="ed-d">#${e.rank}</span><span class="ed-d"></span>` : `<span class="ed-d">${esc(showDate(e.start))}</span><span class="ed-d">${e.end ? esc(showDate(e.end)) : '<i>still going</i>'}</span>`}${dots(k, e.importance)}<button type="button" class="ibtn sm ed-more" data-ed-menu="${k}" aria-label="More for ${esc(e.name)}">${DOTS}</button>
      <span class="ed-sub">${e.value != null ? esc(fmtValue(e.value, ed.spec.unit)) : e.rank ? '#' + e.rank : esc(showDate(e.start))}${e.end ? ' – ' + esc(showDate(e.end)) : ''} · ${esc(e.kind)}${e.image ? '' : ' · no picture'}</span></div>`;
  }
  function openRow(e, k) {
    const f = (name, label, value, cls = '') => `<label class="ed-f ${cls}"><span>${label}</span><input type="text" data-f="${name}" value="${esc(value)}" autocomplete="off" spellcheck="${name === 'name' || name === 'kind' ? 'true' : 'false'}"></label>`;
    return `<div class="ed-row open" data-k="${k}">
      <div class="ed-sheet-head"><button type="button" class="lnk" data-ed-cancel>Cancel</button><b>Edit entry</b><button type="button" class="lnk acc" data-ed-done>Done</button></div>
      <div class="ed-grid">${pic(e)}${f('name', 'Name', e.name, 'grow')}${f('kind', 'Kind', e.kind)}${e.value != null ? f('value', 'Value' + (ed.spec.unit ? ` (${esc(ed.spec.unit)})` : ''), String(e.value)) : e.rank ? f('start', 'Rank', String(e.rank)) : f('start', 'Starts', showDate(e.start)) + f('end', 'Ends', e.end ? showDate(e.end) : '')}<div class="ed-f"><span>Weight</span>${dots(k, e.importance)}</div></div>
      <label class="ed-f"><span>Summary</span><textarea data-f="summary" rows="2" maxlength="400">${esc(e.summary)}</textarea></label>
      <div class="ed-line">${f('wikipedia', 'Wikipedia article', e.wikipedia, 'grow')}${e.image ? '<button type="button" class="btn" data-ed-nopic>Remove picture</button>' : `<button type="button" class="btn" data-ed-pic${e.wikipedia ? '' : ' disabled title="Name its Wikipedia article first"'}>Find a picture</button>`}</div>
      <p class="ed-err" role="alert"></p>
      <div class="ed-line end"><button type="button" class="lnk danger" data-ed-del="${k}">Delete entry</button><span class="ed-hint">Enter or a click elsewhere keeps it. Ends empty means still going.</span><button type="button" class="btn" data-ed-close>Done</button></div>
    </div>`;
  }
  function chapter(c, i, n) {
    const head = `<div class="ed-ch" data-ch="${i}"><i class="sq" style="background: var(--p${i % 8})"></i><input type="text" class="ed-chname" data-ch-f="name" data-ch="${i}" value="${esc(c.name)}" aria-label="Chapter name" style="color: var(--p${i % 8})"><span class="ed-chd">${esc(boundText(c.from))} – ${esc(boundText(c.to))} · ${n} ${n === 1 ? 'entry' : 'entries'}</span><button type="button" class="btn sm" data-ed-ch="${i}" aria-expanded="${ed.chOpen === i}">Edit chapter</button></div>`;
    if (ed.chOpen !== i) return head;
    return head + `<div class="ed-chform" data-ch="${i}">
      <label class="ed-f"><span>Starts</span><input type="text" data-ch-f="from" data-ch="${i}" value="${esc(boundText(c.from))}"></label>
      <label class="ed-f"><span>Ends</span><input type="text" data-ch-f="to" data-ch="${i}" value="${esc(boundText(c.to))}"></label>
      <label class="ed-f grow"><span>Note</span><textarea data-ch-f="note" data-ch="${i}" rows="2" maxlength="400">${esc(c.note)}</textarea></label>
      <p class="ed-err" role="alert"></p>
      <div class="ed-line end"><button type="button" class="lnk danger" data-ed-chdel="${i}">Delete chapter</button><span class="ed-hint">A year (1969) or a full date (27 Nov 2026) at both ends. Its entries stay.</span></div></div>`;
  }
  function list() {
    const s = ed.spec, of = chapterOf(s), q = norm(ed.find);
    const hit = (e) => !q || norm(e.name + ' ' + e.kind + ' ' + e.summary).includes(q);
    const rows = (ix) => ix.filter((i) => hit(s.entries[i])).map((i) => row(s.entries[i], i)).join('');
    const add = (i) => `<button type="button" class="ed-add" data-ed-add="${i}">+ Add entry here</button>`;
    let html = '';
    s.chapters.forEach((c, ci) => {
      const ix = s.entries.map((_, i) => i).filter((i) => of[i] === ci), r = rows(ix);
      if (q && !r) return;
      html += `<div class="ed-group">${chapter(c, ci, ix.length)}${r}${q ? '' : add(ci)}</div>`;
    });
    const rest = s.entries.map((_, i) => i).filter((i) => of[i] < 0), r = rows(rest);
    if (r || (!s.chapters.length && !q)) html += `<div class="ed-group">${s.chapters.length ? '<div class="ed-ch none"><span>Not in a chapter</span></div>' : ''}${r}${q ? '' : add(-1)}</div>`;
    return html || `<p class="ed-empty">Nothing matches “${esc(ed.find)}”.</p>`;
  }
  function draw() {
    if (!ed) return;
    const el = $('editor'), s = ed.spec;
    // Keep the caret where it was: the list is drawn again after every change.
    const a = document.activeElement, keep = a && el.contains(a) && (a.dataset.f || a.dataset.chF || a.dataset.edFind != null)
      ? { f: a.dataset.f, ch: a.dataset.chF, chi: a.dataset.ch, k: a.closest('[data-k]')?.dataset.k, find: a.dataset.edFind != null, top: a.dataset.top, s: a.selectionStart, e: a.selectionEnd } : null;
    const scroll = el.querySelector('.ed-scroll')?.scrollTop || 0;
    el.innerHTML = `<div class="ed-in">
      <header class="ed-head"><button type="button" class="lnk ed-back" data-ed-back>‹ Back to the road</button><span class="ed-saved" id="ed-saved" role="status"></span>
        <button type="button" class="ibtn" data-ed-undo aria-label="Undo" title="Undo">${UNDO}</button><button type="button" class="ibtn" data-ed-redo aria-label="Redo" title="Redo">${REDO}</button>
        <button type="button" class="pbtn" data-ed-publish>${ed.row.visibility === 'private' ? 'Publish' : 'Share'}</button></header>
      <div class="ed-scroll">
        <input type="text" class="ed-title" data-f="title" data-top="1" value="${esc(s.title)}" maxlength="80" aria-label="Title">
        <textarea class="ed-desc" data-f="description" data-top="1" rows="2" maxlength="300" placeholder="A line on what this timeline is about" aria-label="Description">${esc(s.description)}</textarea>
        <div class="ed-tools"><input type="search" data-ed-find value="${esc(ed.find)}" placeholder="Find an entry" aria-label="Find an entry"><span class="ed-count">${s.entries.length} ${s.entries.length === 1 ? 'entry' : 'entries'}</span><button type="button" class="btn" data-ed-add="end"${s.entries.length >= MAX_ENTRIES ? ' disabled' : ''}>+ Add entry</button></div>
        <div class="ed-cols" aria-hidden="true"><span></span><span>Name</span><span>Kind</span><span>${s.axis === 'rank' ? 'Rank' : s.axis === 'scale' ? 'Value' : 'Starts'}</span><span>${s.axis ? '' : 'Ends'}</span><span>Weight</span><span></span></div>
        <div class="ed-list">${list()}</div>
        <div class="ed-foot"><button type="button" class="ed-add" data-ed-addch${s.chapters.length >= 12 ? ' disabled' : ''}>+ Add chapter</button></div>
      </div></div>`;
    el.querySelector('.ed-scroll').scrollTop = scroll;
    // On a phone an open entry is a sheet, and the road takes the room above it.
    const sheet = deps.phone() && ed.open != null;
    if (sheet !== document.body.classList.contains('ed-sheet')) { document.body.classList.toggle('ed-sheet', sheet); deps.relayout(); }
    status();
    if (keep) {
      const sel = keep.find ? '[data-ed-find]' : keep.top ? `[data-f="${keep.f}"][data-top]` : keep.ch ? `[data-ch-f="${keep.ch}"][data-ch="${keep.chi}"]` : `[data-k="${keep.k}"] [data-f="${keep.f}"]`;
      const n = el.querySelector(sel);
      if (n) { n.focus({ preventScroll: true }); try { n.setSelectionRange(keep.s, keep.e); } catch (x) { /* not text */ } }
    }
  }
  function openEntry(k) {
    if (ed.open === k) return;
    ed.open = k; ed.sheetFrom = JSON.stringify(ed.spec); ed.chOpen = null;
    draw();
    follow(k);
    const n = $('editor').querySelector(`[data-k="${k}"]`);
    n?.scrollIntoView({ block: 'nearest' });
    if (!deps.phone()) n?.querySelector('[data-f="name"]')?.focus({ preventScroll: true });
  }
  function closeEntry() { if (ed.open == null) return; ed.open = null; draw(); }
  // The road was clicked while editing: the entry opens here.
  function openById(id) {
    if (!ed) return false;
    const i = ed.data.entries.findIndex((e) => e.id === id);
    if (i < 0) return false;
    openEntry(ed.keys[i]);
    return true;
  }

  // ---- edits
  const entryAt = (spec, k) => spec.entries[ed.keys.indexOf(k)];
  function fail(where, why) {
    const p = where?.closest('.ed-row, .ed-chform, .ed-ch')?.parentElement?.querySelector('.ed-err') || where?.closest('.ed-row, .ed-chform')?.querySelector('.ed-err');
    if (p) p.textContent = why; else deps.toast(why);
  }
  function field(input) {
    const k = Number(input.closest('[data-k]')?.dataset.k), f = input.dataset.f, v = input.value;
    if (input.dataset.top) return change((s) => { s[f] = v; });
    let why = '';
    if (f === 'value') {
      const n = Number(v.replace(/[, _]/g, ''));
      why = Number.isFinite(n) && v.trim() ? change((s) => { entryAt(s, k).value = n; }) : 'Write a number, such as 828 or 1.5.';
    } else if (f === 'start' && ed.spec.axis === 'rank') {
      // A ranked list: the entry moves to that place, and the others close up behind it.
      const n = Math.round(Number(v.replace(/^#/, ''))), was = entryAt(ed.spec, k)?.rank;
      if (!(n >= 1)) why = `Write a rank: 1 for the first.`;
      else why = change((s) => { s.entries.forEach((e, i) => { e.rank = e.rank ?? i + 1; }); entryAt(s, k).rank = n < was ? n - 0.5 : n + 0.5; });
    } else if (f === 'start' || f === 'end') {
      const d = readDate(v);
      if (!d && (f === 'start' || v.trim())) why = `“${v.trim()}” is not a date the timeline can read. Write 1969, Jul 1969, 20 Jul 1969 or 44 BCE.`;
      else why = change((s) => { entryAt(s, k)[f] = d; });
      if (!why) input.value = d ? showDate(d) : '';
    } else {
      why = change((s) => { entryAt(s, k)[f] = v; });
      if (!why && f === 'wikipedia' && v.trim() && !entryAt(ed.spec, k)?.image) picture(k, true);
    }
    if (why) fail(input, why); else { const p = input.closest('.ed-row')?.querySelector('.ed-err'); if (p) p.textContent = ''; }
  }
  function chField(input) {
    const i = Number(input.dataset.ch), f = input.dataset.chF, v = input.value;
    let why = '';
    if (f === 'from' || f === 'to') {
      const b = ed.spec.axis === 'scale' ? (Number.isFinite(Number(v.replace(/[, _]/g, ''))) && v.trim() ? Number(v.replace(/[, _]/g, '')) : null) : readBound(v);
      why = b == null ? `“${v.trim()}” is not a year (1969) or a full date (27 Nov 2026).` : change((s) => { s.chapters[i][f] = b; });
    } else why = change((s) => { s.chapters[i][f] = v; });
    const p = $('editor').querySelector(`.ed-chform[data-ch="${i}"] .ed-err`);
    if (why) { if (p) p.textContent = why; else deps.toast(why); }
  }
  // A date a new entry or chapter can start on: a chapter's start, or the last entry's.
  const startOf = (b) => (typeof b === 'number' ? readDate(b < 0 ? `${-b} BCE` : String(b)) : b);
  function addEntry(where, near) {
    const s = ed.spec;
    if (s.entries.length >= MAX_ENTRIES) return deps.toast(`A timeline holds at most ${MAX_ENTRIES} entries.`);
    let name = 'New entry';
    for (let n = 2; s.entries.some((e) => norm(e.name) === norm(name)); n++) name = 'New entry ' + n;
    const ch = where >= 0 ? s.chapters[where] : null, last = s.entries[s.entries.length - 1];
    const start = ch ? startOf(ch.from) : where === -1 && s.chapters.length ? last.start : last ? last.start : String(new Date().getFullYear());
    const why = change((d) => { d.entries.push({ ...(d.axis === 'rank' ? { rank: ch ? ch.to + 0.5 : d.entries.length + 1 } : d.axis === 'scale' ? { value: ch ? ch.from : last.value } : {}), name, kind: last?.kind || 'Entry', type: last?.type || 'events', start, end: '', summary: '', wikipedia: '', importance: 3, events: [] }); });
    if (why) return fail(near, why);
    const i = ed.spec.entries.findIndex((e) => norm(e.name) === norm(name));
    openEntry(ed.keys[i]);
    const n = $('editor').querySelector(`[data-k="${ed.keys[i]}"] [data-f="name"]`);
    n?.focus(); n?.select();
  }
  function addChapter() {
    const s = ed.spec;
    let name = 'New chapter';
    for (let n = 2; s.chapters.some((c) => norm(c.name) === norm(name)); n++) name = 'New chapter ' + n;
    const last = s.chapters[s.chapters.length - 1], lastStart = s.entries[s.entries.length - 1].start;
    let from, to;
    const vals = s.entries.map((e) => e.value).filter((v) => v != null);
    if (s.axis === 'scale') { from = last ? last.to : Math.min(...vals); to = Math.max(from, ...vals); if (last) from = +(from + (to - from) / 1000).toPrecision(6); }
    else if (last && typeof last.from === 'string') {
      const day = new Date(last.to + 'T00:00:00Z'); day.setUTCDate(day.getUTCDate() + 1);
      from = day.toISOString().slice(0, 10);
      to = lastStart.slice(0, 10) > from && /^\d{4}-\d\d-\d\d/.test(lastStart) ? lastStart.slice(0, 10) : from;
    } else if (last) {
      from = last.to + 1 || 1; to = Math.max(from, yearOfDate(lastStart));
    } else {
      const first = s.entries[0].start, day = /^\d{4}-\d\d-\d\d/;
      const fine = s.entries.every((e) => day.test(e.start)) && yearOfDate(lastStart) - yearOfDate(first) < 4;
      from = fine ? first.slice(0, 10) : yearOfDate(first);
      to = fine ? lastStart.slice(0, 10) : yearOfDate(lastStart);
    }
    const why = change((d) => { d.chapters.push({ name, from, to, note: '' }); });
    if (why) return deps.toast(why);
    const i = ed.spec.chapters.findIndex((c) => norm(c.name) === norm(name));
    ed.chOpen = i; ed.open = null; draw();
    const n = $('editor').querySelector(`.ed-chname[data-ch="${i}"]`);
    n?.scrollIntoView({ block: 'nearest' }); n?.focus(); n?.select();
  }
  function remove(k) {
    const e = entryAt(ed.spec, k);
    if (!e) return;
    if (ed.spec.entries.length <= 1) return deps.toast('A timeline keeps at least one entry.');
    const why = change((s) => { s.entries.splice(ed.keys.indexOf(k), 1); });
    if (why) return deps.toast(why);
    if (ed.open === k) { ed.open = null; draw(); }
    deps.toast(`Deleted “${e.name}”.`, { undo: () => undo(true) });
  }
  function duplicate(k) {
    const e = entryAt(ed.spec, k);
    let name = e.name + ' (copy)';
    for (let n = 2; ed.spec.entries.some((x) => norm(x.name) === norm(name)); n++) name = `${e.name} (copy ${n})`;
    const why = change((s) => { s.entries.push({ ...JSON.parse(JSON.stringify(e)), name }); });
    if (why) return deps.toast(why);
    openEntry(ed.keys[ed.spec.entries.findIndex((x) => norm(x.name) === norm(name))]);
  }
  // A free picture for one entry, from the Wikipedia article it names (the same search as the server's).
  async function picture(k, quiet = false) {
    const me = ed, e = entryAt(me.spec, k);
    if (!e?.wikipedia) return;
    const one = [{ wikipedia: e.wikipedia }];
    const get = (host, q) => fetch(`https://${host}/w/api.php?format=json&origin=*&${q}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    try { await findPictures(one, get); } catch (x) { /* none */ }
    if (ed !== me) return;
    if (!one[0].image) { if (!quiet) deps.toast('No free picture was found for that article.'); return; }
    change((s) => { const t = entryAt(s, k); if (t && t.wikipedia === e.wikipedia) t.image = one[0].image; });
  }

  // ---- events
  function wire(el) {
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.f) field(t);
      else if (t.dataset.chF) chField(t);
    });
    el.addEventListener('input', (e) => {
      if (e.target.dataset.edFind != null) { ed.find = e.target.value; draw(); }
    });
    el.addEventListener('keydown', (e) => {
      const t = e.target;
      if (e.key === 'Enter' && t.tagName === 'INPUT' && (t.dataset.f || t.dataset.chF)) { e.preventDefault(); t.blur(); }
      else if (e.key === 'Enter' && t.tagName === 'TEXTAREA' && !e.shiftKey && t.dataset.f !== 'summary') { e.preventDefault(); t.blur(); }
      else if (e.key === 'Enter' && t.classList.contains('ed-row') && !t.classList.contains('open')) { e.preventDefault(); openEntry(Number(t.dataset.k)); }
    });
    el.addEventListener('focusout', (e) => {
      // Leaving the open row for another part of the page closes it (its last field is kept first, by "change").
      const r = e.target.closest?.('.ed-row.open');
      if (!r || deps.phone()) return;
      setTimeout(() => { if (ed && !r.contains(document.activeElement) && document.activeElement?.closest?.('#editor') && !document.activeElement.closest('.ed-row.open')) closeEntry(); }, 0);
    });
    el.addEventListener('click', (e) => {
      const c = (s) => e.target.closest(s);
      if (c('[data-ed-back]')) return close();
      if (c('[data-ed-undo]')) return undo(true);
      if (c('[data-ed-redo]')) return undo(false);
      if (c('[data-ed-retry]')) { ed.err = ''; return flush(); }
      if (c('[data-ed-publish]')) { flush(); return deps.publish(c('[data-ed-publish]')); }
      if (c('[data-ed-done]') || c('[data-ed-close]')) return closeEntry();
      if (c('[data-ed-cancel]')) {
        // Cancel puts the entry back as it was when the sheet opened.
        if (ed.sheetFrom && ed.sheetFrom !== JSON.stringify(ed.spec)) take(JSON.parse(ed.sheetFrom));
        return closeEntry();
      }
      const wt = c('[data-ed-wt]');
      if (wt) { const [k, n] = wt.dataset.edWt.split(':').map(Number); e.stopPropagation(); return change((s) => { entryAt(s, k).importance = n; }); }
      const add = c('[data-ed-add]');
      if (add) return addEntry(add.dataset.edAdd === 'end' ? -2 : Number(add.dataset.edAdd), add);
      if (c('[data-ed-addch]')) return addChapter();
      const del = c('[data-ed-del]');
      if (del) return remove(Number(del.dataset.edDel));
      if (c('[data-ed-pic]')) return picture(Number(c('[data-k]').dataset.k));
      if (c('[data-ed-nopic]')) { const k = Number(c('[data-k]').dataset.k); return change((s) => { delete entryAt(s, k).image; }); }
      const ch = c('[data-ed-ch]');
      if (ch) { const i = Number(ch.dataset.edCh); ed.chOpen = ed.chOpen === i ? null : i; ed.open = null; return draw(); }
      const chd = c('[data-ed-chdel]');
      if (chd) {
        const i = Number(chd.dataset.edChdel), name = ed.spec.chapters[i].name;
        change((s) => { s.chapters.splice(i, 1); });
        ed.chOpen = null; draw();
        return deps.toast(`Deleted the chapter “${name}”. Its entries stay.`, { undo: () => undo(true) });
      }
      const menu = c('[data-ed-menu]');
      if (menu) {
        const k = Number(menu.dataset.edMenu);
        const d = deps.popover(menu, '<button type="button" class="nv" data-act="edit">Edit</button><button type="button" class="nv" data-act="dup">Duplicate</button><button type="button" class="nv danger" data-act="del">Delete</button>', 'menu');
        d.addEventListener('click', (x) => {
          const a = x.target.closest('[data-act]')?.dataset.act;
          if (!a) return;
          deps.closeLayer();
          if (a === 'edit') openEntry(k); else if (a === 'dup') duplicate(k); else remove(k);
        });
        return undefined;
      }
      const r = c('.ed-row:not(.open)');
      if (r) return openEntry(Number(r.dataset.k));
      return undefined;
    });
    addEventListener('keydown', (e) => {
      if (!ed || !$('layer').hidden) return;
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName);
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        if (typing) document.activeElement.blur();
        else if (ed.open != null) closeEntry();
        else if (ed.chOpen != null) { ed.chOpen = null; draw(); }
        else close();
        return;
      }
      // Undo and Redo of the whole timeline, when no field is being typed in (a field keeps its own).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(!e.shiftKey); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); undo(false); }
    }, true);
  }

  return { open, close, reload, openById, isOpen: () => !!ed, row: () => ed?.row || null, flush };
}
