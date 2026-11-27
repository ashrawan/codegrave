/* Accounts and your own timelines: the bar on the left, signing in, and the
   timelines a person keeps (Supabase: auth, and two tables behind row level
   security). No library: the auth and data APIs are plain HTTPS calls.
   A timeline is stored whole, in the shape of a built view file
   ({ view, entries }), so opening one costs one request, like any view.
   The page knows a stored timeline as "t/<its id>". Its address is
   /t/<id>, or /<username>/<slug> once it is public. */
import { shardOf } from './keys.js';
import { EFFORTS, MODELS, findPictures, partialSpec, specToView } from './ai.js';
import { createEditor } from './editor.js';

// Public by design: the key only allows what the database's row level security allows.
export const CONFIG = {
  url: 'https://wwgmelafchslapxiccot.supabase.co',
  key: 'sb_publishable_IykysSfgNLw4CfaqxP2CqA_YNcfq0SW',
};

// ---- pure helpers (tests/account.test.mjs)
export const RESERVED = ['wiki', 'classical', 't', 'data', 'media', 'api', 'auth', 'admin', 'new', 'create', 'explore', 'search', 'settings',
  'login', 'signin', 'signup', 'account', 'about', 'help', 'terms', 'privacy', 'print', 'static', 'assets', 'codegrave', 'www', 'me', 'draft', 'drafts'];
export function slugOf(title) {
  const s = String(title).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return s || 'timeline';
}
// Why a username cannot be used, or '' when its shape is fine.
export function usernameProblem(name) {
  if (name.length < 3) return 'At least 3 characters.';
  if (name.length > 30) return 'At most 30 characters.';
  if (!/^[a-z0-9-]+$/.test(name)) return 'Lowercase letters, numbers and hyphens only.';
  if (/^-|-$/.test(name)) return 'It cannot start or end with a hyphen.';
  if (RESERVED.includes(name)) return 'That name is reserved.';
  return '';
}
// What the sign-in service leaves in the address after "#": a session, an error, or nothing of ours.
export function readAuthHash(hash) {
  const q = new URLSearchParams(String(hash).replace(/^#/, ''));
  if (q.get('access_token') && q.get('refresh_token')) {
    return { session: { access_token: q.get('access_token'), refresh_token: q.get('refresh_token'), expires_at: Number(q.get('expires_at')) || Math.floor(Date.now() / 1000) + (Number(q.get('expires_in')) || 3600) } };
  }
  if (q.get('error') || q.get('error_code')) return { error: (q.get('error_description') || q.get('error') || 'Sign-in failed').replace(/\+/g, ' ') };
  return null;
}
export const isStored = (id) => /^t\/[0-9a-f-]{36}$/.test(id);
export const uuidOf = (id) => id.slice(2);

const ICON = {
  // a door with an arrow going in: Sign in (asked for, Nov 2026)
  login: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M3.5 12H14M10 8l4 4-4 4"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  compass: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
  dots: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/></svg>',
  chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10l4-4 4 4M8 14l4 4 4-4"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5l3.2 3.2L14 6"/></svg>',
  google: '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>',
  github: '<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>',
};
const LOGO = '<svg width="40" height="40" viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 27.5H29" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 27.5V12.5a6.5 6.5 0 0 1 13 0V27.5" stroke="currentColor" stroke-width="1.8"/><path d="M21.5 27.5V20a3.5 3.5 0 0 1 7 0v7.5" stroke="currentColor" stroke-width="1.6" opacity=".55"/><path d="M10 14.5l3 2.5-3 2.5" stroke="currentColor" stroke-width="1.8"/><path d="M14 22.5h3.5" stroke="var(--acc)" stroke-width="2.2"/></svg>';
const SEEN = { private: 'Private draft', link: 'Link only', public: 'Public' };
const PHONE = '(max-width: 699px)';
const KEY = 'cg-session', FOLD = 'cg-sb', INTENT = 'cg-intent', MODEL = 'cg-model', PROMPT = 'cg-prompt';

/* `app` is what the page lends: $, esc, views() (ids on the road), view(id),
   show(id), open(id) (travel to a view's beginning), replace(payload) (a stored view changed), forget(id), home(),
   focusSearch(), redraw(), detailChars(). */
export function createAccount(app) {
  const { $, esc } = app;
  let session = null, user = null, profile = null, list = [], listed = false, refreshing = null, drawn = '';
  const rows = new Map();        // timeline id -> its row, with `text`: the stored data as JSON text, never touched

  // ---- session
  function load() { try { session = JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { session = null; } user = session?.user || null; }
  function save() { try { if (session) localStorage.setItem(KEY, JSON.stringify(session)); else localStorage.removeItem(KEY); } catch (e) { /* private window */ } }
  async function token() {
    if (!session) return null;
    if (session.expires_at - Date.now() / 1000 > 60) return session.access_token;
    if (!refreshing) {
      refreshing = fetch(CONFIG.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: CONFIG.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) })
        .then(async (r) => {
          if (!r.ok) { if (r.status >= 400 && r.status < 500) signedOut(); throw new Error('session'); }
          const d = await r.json();
          session = { ...session, access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + d.expires_in };
          save();
        }).finally(() => { refreshing = null; });
    }
    try { await refreshing; } catch (e) { return null; }
    return session?.access_token || null;
  }
  async function api(path, opt = {}) {
    const t = await token();
    const r = await fetch(CONFIG.url + path, {
      method: opt.method || 'GET',
      headers: { apikey: CONFIG.key, ...(t ? { Authorization: 'Bearer ' + t } : {}), ...(opt.body ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers || {}) },
      body: opt.body ? JSON.stringify(opt.body) : undefined,
    });
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
    if (!r.ok) { const err = new Error(data?.message || data?.msg || data?.error_description || 'The request failed.'); err.status = r.status; err.code = data?.code; throw err; }
    return data;
  }
  function signedOut() { session = user = profile = null; list = []; listed = false; rows.clear(); save(); draw(true); }
  const here = () => location.origin + location.pathname + location.search;
  function oauth(provider) { location.href = `${CONFIG.url}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(here())}`; }
  function emailLink(email) {
    return api('/auth/v1/otp?redirect_to=' + encodeURIComponent(here()), { method: 'POST', body: { email, create_user: true } });
  }
  async function signOut() {
    try { await api('/auth/v1/logout', { method: 'POST' }); } catch (e) { /* the session is dropped here either way */ }
    const mine = app.views().some(isStored);
    signedOut();
    if (mine) app.home();
  }
  async function whoAmI() {
    const u = await api('/auth/v1/user');
    user = { id: u.id, email: u.email || '', name: u.user_metadata?.full_name || u.user_metadata?.name || u.user_metadata?.user_name || '' };
    session.user = user; save();
  }
  async function refreshList() {
    if (!user) return;
    const [p, l] = await Promise.all([
      api(`/rest/v1/profiles?id=eq.${user.id}&select=username`),
      api(`/rest/v1/timelines?owner=eq.${user.id}&select=id,slug,title,visibility,entries,updated_at&order=updated_at.desc`),
    ]);
    profile = p[0] || { username: null };
    list = l; listed = true;
    for (const t of l) { const r = rows.get(t.id); if (r) Object.assign(r, t, { username: profile.username }); }
    draw(true);
  }
  // The account is the person who signed in (their name or email); a username is only the space they
  // publish under, kept apart from it (asked for, Nov 2026).
  const shown = () => user?.name || (user?.email || '').split('@')[0] || 'You';

  // ---- timelines
  function payloadOf(row) {
    const d = JSON.parse(row.text);
    const view = { ...(d.view || {}), id: 't/' + row.id, name: row.title, description: row.description || '', author: row.username || 'you', type: 'community', picked: true, count: (d.entries || []).length, stored: true };
    delete view.topic;
    return { view, entries: d.entries || [] };
  }
  // One stored timeline by "t/<id>" or "<username>/<slug>": what loadView() asks for.
  async function fetchView(id) {
    const args = isStored(id) ? { p_id: uuidOf(id) } : { p_username: id.split('/')[0], p_slug: id.split('/').slice(1).join('/') };
    const got = await api('/rest/v1/rpc/open_timeline', { method: 'POST', body: args });
    const r = got && got[0];
    if (!r) throw new Error('not found');
    const row = { id: r.id, username: r.username, slug: r.slug, title: r.title, description: r.description, visibility: r.visibility, mine: r.mine, entries: (r.data?.entries || []).length, text: JSON.stringify(r.data) };
    // One object per timeline, kept up to date in place: a timeline being made holds on to its row.
    const old = rows.get(row.id);
    if (old) Object.assign(old, row); else rows.set(row.id, row);
    return payloadOf(old || row);
  }
  const rowOf = (id) => (isStored(id) ? rows.get(uuidOf(id)) : null);
  const isMine = (id) => !!rowOf(id)?.mine;
  function addressOf(id) {
    const r = rowOf(id);
    return r && r.visibility === 'public' && r.username ? r.username + '/' + r.slug : null;
  }
  // The one stored timeline on the road that is the reader's own, if that is all the road shows.
  function current() { const v = app.views(); return v.length === 1 && isMine(v[0]) ? rowOf(v[0]) : null; }
  async function rawView(id) {
    const r = rowOf(id);
    if (r) return JSON.parse(r.text);
    const res = await fetch('data/v/' + id + '.json');
    if (!res.ok) throw new Error('That view could not be read.');
    return res.json();
  }
  // A new row, under a slug of its own.
  async function insert(title, description, data, from = null) {
    const base = slugOf(title);
    for (let n = 1; n < 20; n++) {
      try {
        const got = await api('/rest/v1/timelines?select=id', { method: 'POST', headers: { Prefer: 'return=representation' }, body: { title, slug: n === 1 ? base : `${base.slice(0, 56)}-${n}`, description: (description || '').slice(0, 600), ...(from ? { forked_from: from } : {}), data } });
        return 't/' + got[0].id;
      } catch (e) {
        if (e.code !== '23505') throw e.code === '23514' ? new Error('That timeline is too large to keep for now.') : e;
      }
    }
    throw new Error('Pick another name: that one is taken.');
  }
  async function create(title, from) {
    const src = await rawView(from);
    const { id: _i, name: _n, author: _a, type: _t, topic: _o, count: _c, stored: _s, mine: _m, level: _l, ...meta } = src.view || {};
    return insert(title, src.view?.description, { view: meta, entries: src.entries || [] }, from);
  }
  async function patch(row, body) {
    const got = await api(`/rest/v1/timelines?id=eq.${row.id}&select=id,slug,title,description,visibility,entries,updated_at`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body });
    if (!got[0]) throw new Error('That timeline is no longer there.');
    Object.assign(row, got[0]);
    if (body.data) row.text = JSON.stringify(body.data);
    app.replace(payloadOf(row));
    if (editor.row() === row) editor.reload();
    await refreshList();
  }
  async function ensureRow(uuid) { if (!rows.has(uuid)) await fetchView('t/' + uuid); return rows.get(uuid); }
  async function rawEntry(id) {
    for (const r of rows.values()) { const e = JSON.parse(r.text).entries?.find((x) => x.id === id); if (e) return e; }
    const res = await fetch('data/d/' + shardOf(id, app.detailChars()) + '.json');
    const shard = res.ok ? await res.json() : {};
    if (!shard[id]) throw new Error('That entry could not be read.');
    return shard[id];
  }
  async function addEntry(uuid, entryId) {
    const row = await ensureRow(uuid), d = JSON.parse(row.text);
    if (d.entries.some((e) => e.id === entryId)) return toast(`Already in “${row.title}”.`);
    d.entries.push(await rawEntry(entryId));
    await patch(row, { data: d });
    toast(`Added to “${row.title}”.`);
  }
  async function removeEntry(row, entryId) {
    const d = JSON.parse(row.text);
    if (d.entries.length <= 1) return toast('A timeline keeps at least one entry.');
    d.entries = d.entries.filter((e) => e.id !== entryId);
    await patch(row, { data: d });
    toast('Removed from this timeline.', { undo: () => addEntryBack(row, entryId) });
  }
  async function addEntryBack(row, entryId) { try { await addEntry(row.id, entryId); } catch (e) { toast(e.message); } }

  // "Open in editor": the timeline as rows, the road live beside it (site/editor.js).
  const editor = createEditor({
    $, esc, phone: () => matchMedia(PHONE).matches, toast: (t, o) => toast(t, o), popover: (a, h, c) => popover(a, h, c), closeLayer: () => closeLayer(),
    async write(row, body) {
      let got;
      try { got = await api(`/rest/v1/timelines?id=eq.${row.id}&select=id,visibility,entries,updated_at`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body }); } catch (e) { throw e.code === '23514' ? new Error('That timeline is too large to keep.') : e; }
      if (!got[0]) throw new Error('That timeline is no longer there.');
      Object.assign(row, got[0]);
    },
    show: (row) => app.replace(payloadOf(row)), goTo: (id) => app.goTo(id), relayout: () => app.relayout(),
    publish: (anchor) => publish(anchor), listChanged: () => refreshList().catch(() => {}),
  });

  // ---- small pieces of interface
  let toastTimer = null;
  function toast(text, opt = {}) {
    const t = $('toast');
    t.innerHTML = `<span>${esc(text)}</span>${opt.undo ? '<button type="button" data-undo>Undo</button>' : ''}`;
    t.hidden = false;
    t.querySelector('[data-undo]')?.addEventListener('click', () => { t.hidden = true; opt.undo(); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, opt.undo ? 8000 : 4000);
  }
  function closeLayer() { $('layer').hidden = true; $('layer').innerHTML = ''; $('layer').className = ''; }
  function modal(html, cls = '') {
    const l = $('layer');
    l.className = 'modal ' + cls;
    l.innerHTML = `<div class="dlg" role="dialog" aria-modal="true"><button type="button" class="ibtn dlg-x" data-close aria-label="Close">${ICON.x}</button>${html}</div>`;
    l.hidden = false;
    (l.querySelector('[autofocus]') || l.querySelector('button:not(.dlg-x)'))?.focus();
    return l.querySelector('.dlg');
  }
  // A small box anchored to a button: a menu or the publish form.
  function popover(anchor, html, cls = '') {
    const l = $('layer'), r = anchor.getBoundingClientRect();
    l.className = 'pop ' + cls;
    l.innerHTML = `<div class="dlg" role="dialog">${html}</div>`;
    l.hidden = false;
    const d = l.querySelector('.dlg'), w = d.offsetWidth, h = d.offsetHeight, up = r.top > innerHeight / 2;
    d.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right > innerWidth / 2 && !anchor.closest('#sb') ? r.right - w : r.left)) + 'px';
    d.style.top = Math.max(8, Math.min(innerHeight - h - 8, up ? r.top - h - 8 : r.bottom + 8)) + 'px';
    return d;
  }
  // Asks for one line of text, or just a yes.
  function ask({ title, text = '', label = '', value = null, ok, danger = false }) {
    return new Promise((done) => {
      const d = modal(`<h2>${esc(title)}</h2>${text ? `<p class="dlg-sub">${esc(text)}</p>` : ''}
        <form>${value != null ? `<label class="fld"><span>${esc(label)}</span><input type="text" maxlength="120" value="${esc(value)}" autofocus required></label>` : ''}
        <p class="dlg-err" role="alert"></p>
        <div class="dlg-row"><button type="button" class="big" data-close>Cancel</button><button type="submit" class="big ${danger ? 'danger' : 'pri'}"${value == null ? ' autofocus' : ''}>${esc(ok)}</button></div></form>`, 'small');
      d.querySelector('input')?.select();
      d.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); done({ value: d.querySelector('input')?.value.trim() ?? true, fail: (m) => { d.querySelector('.dlg-err').textContent = m; busy(d, false); }, busy: () => busy(d, true) }); });
    });
  }
  function busy(d, on) { d.querySelectorAll('button[type=submit]').forEach((b) => { b.disabled = on; }); }

  function signIn(why = '') {
    const d = modal(`<div class="dlg-logo">${LOGO}</div><h1>Sign in to codegrave</h1>
      <p class="dlg-sub">${esc(why || 'Make your own timelines and keep them here.')}</p>
      <button type="button" class="big pri" data-oauth="google">${ICON.google}Continue with Google</button>
      <button type="button" class="big" data-oauth="github">${ICON.github}Continue with GitHub</button>
      <div class="dlg-or"><span></span>or<span></span></div>
      <form><input type="email" placeholder="Email address" autocomplete="email" required aria-label="Email address">
      <button type="submit" class="big">Email me a sign-in link</button></form>
      <p class="dlg-err" role="alert"></p>
      <p class="dlg-fine">By continuing you agree to use codegrave fairly. We keep your email only to sign you in.</p>`, 'signin');
    d.querySelectorAll('[data-oauth]').forEach((b) => b.addEventListener('click', () => oauth(b.dataset.oauth)));
    d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = d.querySelector('input').value.trim();
      busy(d, true);
      try {
        await emailLink(email);
        d.innerHTML = `<button type="button" class="ibtn dlg-x" data-close aria-label="Close">${ICON.x}</button><div class="dlg-logo">${LOGO}</div><h1>Check your inbox</h1><p class="dlg-sub">We sent a sign-in link to <b>${esc(email)}</b>. Open it on this device and you are in.</p>`;
      } catch (err) { d.querySelector('.dlg-err').textContent = err.status === 429 ? 'Too many emails just now. Try again in a minute.' : err.message; busy(d, false); }
    });
  }

  async function copyTimeline() {
    if (!user) { try { sessionStorage.setItem(INTENT, 'new'); } catch (e) { /* fine */ } return signIn('Sign in to start a timeline of your own.'); }
    if (!src) return;
    const a = await ask({ title: 'New timeline', text: `It starts as a copy of “${src.name}”, private until you publish it. You can then add and remove entries.`, label: 'Name', value: isMine(from) ? src.name + ' 2' : 'My ' + src.name, ok: 'Create' });
    if (!a.value) return;
    a.busy();
    try {
      const id = await create(a.value, from);
      closeLayer();
      closeCreate();
      await refreshList();
      app.show(id);
    } catch (e) { a.fail(e.message); }
  }

  // ---- create with AI: a sentence in, a timeline out (docs/ACCOUNTS.md)
  let model = MODELS[0].id, effort = 'none', working = false, ticker = 0, moreModels = false;
  try {
    const m = localStorage.getItem(MODEL), f = localStorage.getItem(MODEL + '-effort');
    if (MODELS.some((x) => x.id === m)) model = m;
    if (EFFORTS.some((x) => x.id === f)) effort = f;
  } catch (e) { /* fine */ }
  const modelName = () => MODELS.find((m) => m.id === model).name;
  const modelLabel = () => modelName() + (effort === 'none' ? '' : ' · ' + EFFORTS.find((x) => x.id === effort).name);
  // What people come to make, and for each a few requests that work well as they stand. The reader can
  // make anything (asked for, Nov 2026: a company, a life, something to learn, a trip, a skill, the news).
  const KINDS = [
    { id: 'company', name: 'A company', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V6l8-2v16M12 9h8v11M3 20h18M7.5 9v.1M7.5 12.5v.1M7.5 16v.1M16 12.5v.1M16 16v.1"/></svg>', ideas: ['How Apple went from a garage to the iPhone', 'NVIDIA, from graphics cards to AI', 'The rise and fall of Nokia\'s phones', 'Toyota since 1937: every turning point'] },
    { id: 'person', name: 'A life', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/></svg>', ideas: ['The life of Marie Curie', 'Nelson Mandela, year by year', 'Steve Jobs: every product and turning point', 'Leonardo da Vinci\'s works in the order he made them'] },
    { id: 'learn', name: 'Learn a subject', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5C6.5 4.5 9.5 4.7 12 6c2.5-1.3 5.5-1.5 8-.5v13c-2.5-1-5.5-.8-8 .5-2.5-1.3-5.5-1.5-8-.5zM12 6v13"/></svg>', ideas: ['Quantum physics, from Planck to quantum computers', 'How DNA was found, read and edited', 'The story of vaccines, from smallpox to mRNA', 'Life on Earth in 30 steps'] },
    { id: 'trip', name: 'Plan a trip', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/></svg>', ideas: ['Ten days in Japan in April: Tokyo, Kyoto and Osaka, day by day', 'Two weeks trekking to Everest Base Camp in October', 'A long weekend in Rome for a first visit', 'Three weeks by road down the west coast of the United States'] },
    { id: 'skill', name: 'Learn a skill', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/></svg>', ideas: ['Learn Python in 12 weeks, starting from zero', 'From the couch to a 5 km run in nine weeks', 'Guitar in six months at 20 minutes a day', 'Conversational Spanish in 90 days'] },
    { id: 'news', name: 'The news', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h11v14H6.5A1.5 1.5 0 0 1 5 17.5zM16 9h3v8.5a1.5 1.5 0 0 1-3 0M8 9h5M8 12.5h5M8 16h3"/></svg>', note: 'A model knows the news only up to the day its training ended.', ideas: ['The AI race since ChatGPT', 'The return to the Moon: Artemis so far', 'Electric cars over the last ten years', 'Climate summits from Kyoto to today'] },
    { id: 'history', name: 'History', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10M7 20h10M8 4c0 4 8 4.5 8 8s-8 4-8 8M16 4c0 4-8 4.5-8 8s8 4 8 8"/></svg>', ideas: ['The history of jazz, from New Orleans to today', 'The Roman Republic, from the kings to Augustus', 'Every mission to Mars', 'The Cold War in 30 moments'] },
  ];
  const STEPS = ['Reading up on the subject…', 'Choosing what belongs…', 'Checking the dates…', 'Writing the chapters…', 'Looking for pictures…', 'Laying out the road…'];
  const seed = () => Math.random().toString(36).slice(2, 8);
  const modelBtn = (id) => `<button type="button" class="cr-model" id="${id}" data-model-menu aria-haspopup="menu"><i></i><span>${esc(modelLabel())}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>`;
  const SEND = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
  // The page in the middle: one box to say what the timeline is about.
  function openCreate(text = '') {
    explore(false);
    const from = app.views()[0], src = from && app.view(from);
    $('create').innerHTML = `<button class="ibtn ex-x" type="button" data-create-close aria-label="Close" title="Back to the timeline">${ICON.x}</button>
      <div class="cr-in">
        <h1>What do you want to make?</h1>
        <p class="ex-sub">Anything that happens in time: a company, a life, a subject, a trip, a new skill, the news. Say it in a sentence and codegrave lays it out along the road.</p>
        <form id="cr-form" class="cr-box">
          <textarea id="cr-q" rows="2" maxlength="600" placeholder="Describe what you want to make…" aria-label="What do you want to make?" required>${esc(text)}</textarea>
          <div class="cr-row">${modelBtn('cr-model')}<span class="grow"></span><button type="submit" class="cr-go" aria-label="Make it" title="Make it">${SEND}</button></div>
        </form>
        <p id="cr-status" class="cr-status" role="status"></p>
        <div class="cr-ideas" role="group" aria-label="Ideas">${KINDS.map((k) => `<button type="button" data-kind="${k.id}" aria-expanded="false">${k.icon}${esc(k.name)}</button>`).join('')}</div>
        <div id="cr-list" class="cr-list" hidden></div>
      </div>`;
    $('create').hidden = false;
    document.body.classList.add('creating');
    if (phone()) setOpen(false);
    const q = $('cr-q');
    q.focus(); q.setSelectionRange(q.value.length, q.value.length);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('cr-form').requestSubmit(); } });
    $('cr-form').addEventListener('submit', (e) => { e.preventDefault(); make(q.value.trim()); });
  }
  function closeCreate(force) { if (working && !force) return; $('create').hidden = true; $('create').innerHTML = ''; document.body.classList.remove('creating'); }
  function progress(el, on) {
    clearInterval(ticker);
    working = on;
    document.body.classList.toggle('ai-busy', on);
    if (!el) return;
    el.classList.toggle('busy', on);
    el.classList.remove('err');
    if (!on) { el.textContent = ''; return; }
    let i = 0;
    el.textContent = STEPS[0];
    ticker = setInterval(() => { i = Math.min(STEPS.length - 1, i + 1); el.textContent = STEPS[i]; }, 3500);
  }
  const fail = (el, e) => { if (el) { el.classList.add('err'); el.textContent = e.status === 401 ? 'Sign in again to make a timeline.' : e.message || 'That did not work. Try again.'; } else toast(e.message); };
  // Asks the function and reads its answer as it comes: `onText` gets the JSON written so far, `onNote`
  // what the function is doing. Resolves with the finished answer, or throws with a sentence to show.
  async function ask_ai(body, onText, onNote) {
    const t = await token();
    const r = await fetch(CONFIG.url + '/functions/v1/ai-timeline', {
      method: 'POST',
      headers: { apikey: CONFIG.key, ...(t ? { Authorization: 'Bearer ' + t } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, model, effort }),
    });
    if (!/event-stream/.test(r.headers.get('content-type') || '')) {
      const d = await r.json().catch(() => null);
      const err = new Error(d?.error || 'That did not work. Try again.'); err.status = r.status; throw err;
    }
    const rd = r.body.getReader(), dec = new TextDecoder();
    let buf = '', text = '';
    for (;;) {
      const { value, done } = await rd.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (!line.startsWith('data:')) continue;
        let o; try { o = JSON.parse(line.slice(5)); } catch (e) { continue; }
        if (o.error) throw new Error(o.error);
        if (o.done) return o.done;
        if (o.note) onNote?.(o.note);
        if (o.r) onNote?.('Thinking…');
        if (o.d) { text += o.d; onText?.(text); }
      }
    }
    throw new Error('The connection was lost. Your timeline is still being made: it will be in the list in a moment.');
  }
  // Pictures the server could not get (Wikimedia sometimes turns a busy server away) are looked for
  // once more from the reader's own browser, and kept in the row. Quietly: a timeline works without them.
  async function morePictures(row, sd) {
    const data = JSON.parse(row.text), spec = data.spec;
    if (!spec || !spec.entries.some((e) => !e.image && e.wikipedia)) return;
    const get = (host, q) => fetch(`https://${host}/w/api.php?format=json&origin=*&${q}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    try {
      if (!(await findPictures(spec.entries, get))) return;
      const f = specToView(spec, sd);
      await patch(row, { data: { ...data, view: f.view, entries: f.entries, spec: f.spec } });
    } catch (e) { /* fine */ }
  }
  // While a timeline is made, a bar runs along the top edge of the strip at the foot, and the steps stand in
  // the middle of the road, the one under way lit (asked for, Nov 2026: "a proper loading").
  // `step` is 0 (reading up), 1 (writing entries, `n` so far) or 2 (finding pictures); null takes it away.
  const MAKE_STEPS = ['Reading up on the subject', 'Writing the entries', 'Finding pictures'];
  // Ask AI shows the same, low: its own steps in a row just above its box at the foot (asked for, Nov 2026).
  const ASK_STEPS = ['Reading your timeline', 'Thinking', 'Writing the entries', 'Finding pictures'];
  function live(step, n = 0, steps = MAKE_STEPS) {
    let el = $('ai-live'), bar = $('ai-bar');
    if (!el) {
      el = document.createElement('div'); el.id = 'ai-live'; el.setAttribute('role', 'status');
      bar = document.createElement('div'); bar.id = 'ai-bar'; bar.innerHTML = '<i></i>';
      document.body.append(el, bar);
    }
    el.hidden = bar.hidden = step == null; el.classList.toggle('low', steps === ASK_STEPS);
    const w = steps.length - 2;      // the step that writes entries
    if (step == null) { bar.firstChild.style.width = '0'; return; }
    el.innerHTML = '<ol>' + steps.map((s, i) => `<li class="${i < step ? 'done' : i === step ? 'now' : ''}">${s}${i === w && n ? ` <b>${n}</b>` : ''}</li>`).join('') + '</ol>';
    // How far it has come: the entries are not counted ahead, so writing fills the bar more slowly as it goes.
    const f = step < w ? 0.06 + 0.08 * step / Math.max(1, w) + 0.04 : step === w ? 0.15 + 0.65 * (1 - Math.exp(-n / 18)) : 0.9;
    bar.firstChild.style.width = (f * 100).toFixed(1) + '%';
  }
  const draftTitle = (prompt) => prompt.replace(/\s+/g, ' ').trim().slice(0, 80).replace(/[.,;:!?\s]+$/, '') || 'New timeline';
  // Make a timeline: the page goes to the road at once and the timeline grows on it as the model writes.
  // The row is kept from the first moment, and the function fills it in itself when it is done, so the
  // timeline is finished and saved under the account even when the tab is closed (asked for, Nov 2026).
  async function make(prompt) {
    if (working || prompt.length < 3) return;
    if (!user) { try { sessionStorage.setItem(PROMPT, prompt); } catch (e) { /* fine */ } return signIn('Sign in to make this timeline. It is kept under your account, private until you publish it.'); }
    const st = $('cr-status'), sd = seed();
    progress(st, true);
    let id, row;
    try {
      id = await insert(draftTitle(prompt), '', { view: { checkpoints: [] }, entries: [], prompt, making: true });
      row = await ensureRow(uuidOf(id));
    } catch (e) { progress(st, false); return fail(st, e); }
    progress(st, false);
    working = true; document.body.classList.add('ai-busy');
    closeCreate(true);
    refreshList();
    live(0);
    await app.show(id);
    let shown = 0, last = 0, opened = false, pics = false;
    const put = (spec, data) => {
      const f = specToView(spec, sd);
      row.title = f.spec.title !== 'Untitled timeline' ? f.spec.title : row.title;
      row.description = f.spec.description;
      row.text = JSON.stringify(data ? { ...data(f) } : { view: f.view, entries: f.entries, prompt, making: true });
      app.replace(payloadOf(row));
      if (!opened && f.entries.length) { opened = true; setTimeout(() => app.open(id), 30); }
      return f;
    };
    try {
      const got = await ask_ai({ prompt, timeline: uuidOf(id), seed: sd }, (text) => {
        if (Date.now() - last < 600) return;
        last = Date.now();
        const p = partialSpec(text);
        if (p.entries.length > shown || (p.title && row.title === draftTitle(prompt))) { shown = p.entries.length; put(p); }
        if (shown && !pics) live(1, shown);
      }, (note) => { if (/pictures/.test(note)) { pics = true; live(2); } else if (/Writ/.test(note) && !shown) live(1); });
      const f = put(got.spec, (x) => ({ view: x.view, entries: x.entries, spec: x.spec, prompt }));
      if (!f.entries.length) throw new Error('The model wrote no entries with dates. Try saying more about what you want.');
      if (!got.saved) await patch(row, { title: f.spec.title, description: f.spec.description, data: JSON.parse(row.text) });
      live(null);
      working = false; document.body.classList.remove('ai-busy');
      await refreshList();
      draw(true);
      app.open(id);
      toast(`Made with ${modelName()}: ${f.entries.length} entries. Ask AI below to change it, or publish it.`);
      morePictures(row, sd);
    } catch (e) {
      live(null);
      working = false; document.body.classList.remove('ai-busy');
      if (/connection was lost/.test(e.message)) return toast(e.message);
      // Nothing was made: the empty draft goes, and the request comes back to try again.
      api(`/rest/v1/timelines?id=eq.${uuidOf(id)}`, { method: 'DELETE' }).catch(() => {});
      rows.delete(uuidOf(id)); app.forget(id);
      await refreshList();
      app.home();
      openCreate(prompt);
      fail($('cr-status'), e);
    }
  }
  // "Ask AI": the same model reads the timeline and the request, and writes it again.
  const specOf = (row) => { try { return JSON.parse(row.text).spec || null; } catch (e) { return null; } };
  async function change(prompt) {
    const row = current(), spec = row && specOf(row);
    if (working || !spec || prompt.length < 3) return;
    const st = $('ask-status');
    working = true; document.body.classList.add('ai-busy');
    st.classList.remove('err'); st.textContent = '';
    let at = 0, n = 0;
    const go = (k) => { if (k >= at) { at = k; live(at, n, ASK_STEPS); } };
    go(0);
    try {
      const got = await ask_ai({ prompt, current: spec }, (text) => { n = partialSpec(text).entries.length; go(2); }, (note) => { go(/pictures/.test(note) ? 3 : /Writ/.test(note) ? 2 : /Think/.test(note) ? 1 : at); });
      const file = specToView(got.spec, seed());
      if (!file.entries.length) throw new Error('That change would leave the timeline empty.');
      const before = { title: row.title, description: row.description, data: JSON.parse(row.text) };
      await patch(row, { title: file.spec.title, description: file.spec.description, data: { view: file.view, entries: file.entries, spec: file.spec, prompt: before.data.prompt } });
      live(null);
      $('ask-q').value = '';
      toast(got.changed || 'Changed.', { undo: () => patch(row, before).catch((e) => toast(e.message)) });
      morePictures(row, file.entries[0].id.split('-')[0].slice(1));
    } catch (e) { live(null); fail(st, e); setTimeout(() => { if (st.classList.contains('err')) { st.textContent = ''; st.classList.remove('err'); } }, 7000); }
    working = false; document.body.classList.remove('ai-busy');
  }
  // The requests offered under one kind: pressing the kind again folds them away.
  function showKind(id) {
    const list = $('cr-list'), k = KINDS.find((x) => x.id === id), same = !list.hidden && list.dataset.kind === id;
    document.querySelectorAll('.cr-ideas [data-kind]').forEach((b) => b.setAttribute('aria-expanded', !same && b.dataset.kind === id));
    list.hidden = same;
    if (same) return;
    list.dataset.kind = id;
    list.innerHTML = k.ideas.map((t) => `<button type="button" data-idea>${esc(t)}</button>`).join('') + (k.note ? `<p>${esc(k.note)}</p>` : '');
  }
  // The model menu, like the one of a chat app: the models, more of them folded away, and the effort.
  let modelAnchor = null;
  function pickModel(anchor) {
    modelAnchor = anchor;
    const open = moreModels || MODELS.some((m) => m.more && m.id === model);
    const row = (m) => `<button type="button" class="mrow" data-model="${esc(m.id)}" role="menuitemradio" aria-checked="${m.id === model}"><span><b>${esc(m.name)}</b><small>${esc(m.note)}</small></span>${m.id === model ? ICON.check : ''}</button>`;
    popover(anchor, `<div class="cap">Model</div>${MODELS.filter((m) => !m.more).map(row).join('')}
      ${open ? MODELS.filter((m) => m.more).map(row).join('') : `<button type="button" class="mrow more" data-more-models><span><b>More models</b></span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>`}
      <hr><div class="cap">Effort</div>
      <div class="seg" role="radiogroup" aria-label="Effort">${EFFORTS.map((x) => `<button type="button" role="radio" data-effort="${x.id}" aria-checked="${x.id === effort}">${esc(x.name)}</button>`).join('')}</div>
      <p class="dlg-fine">Thorough thinks longer before it writes: slower, and better on hard subjects.</p>`, 'menu models');
  }
  const modelShown = () => document.querySelectorAll('.cr-model span').forEach((n) => { n.textContent = modelLabel(); });
  function setModel(id) {
    model = id;
    try { localStorage.setItem(MODEL, id); } catch (e) { /* fine */ }
    closeLayer();
    modelShown();
  }
  function setEffort(id) {
    effort = id;
    try { localStorage.setItem(MODEL + '-effort', id); } catch (e) { /* fine */ }
    modelShown();
    if (modelAnchor) pickModel(modelAnchor);
  }
  async function rename(row) {
    const a = await ask({ title: 'Rename', label: 'Name', value: row.title, ok: 'Save' });
    if (!a.value) return;
    a.busy();
    try { const r = await ensureRow(row.id); await patch(r, { title: a.value }); closeLayer(); } catch (e) { a.fail(e.message); }
  }
  async function remove(row) {
    const a = await ask({ title: `Delete “${row.title}”?`, text: 'It is removed for good, and its address stops working.', ok: 'Delete', danger: true });
    a.busy();
    try {
      await api(`/rest/v1/timelines?id=eq.${row.id}`, { method: 'DELETE' });
      const id = 't/' + row.id, on = app.views().includes(id);
      rows.delete(row.id); app.forget(id);
      closeLayer();
      await refreshList();
      if (on) app.home();
    } catch (e) { a.fail(e.message); }
  }

  function publish(anchor) {
    const row = current();
    if (!row) return;
    const named = !!profile?.username, link = (vis) => (vis === 'public' ? `${location.host}/${profile?.username || '…'}/${row.slug}` : `${location.host}/t/${row.id}`);
    const opt = (v, name, sub) => `<label class="pick"><input type="radio" name="vis" value="${v}"${(row.visibility === 'private' ? 'public' : row.visibility) === v ? ' checked' : ''}><i></i><span><b>${name}</b><small>${sub}</small></span></label>`;
    const d = popover(anchor, `<form><h2>${row.visibility === 'private' ? 'Publish this timeline' : 'Sharing'}</h2>
      <p class="dlg-sub">${row.entries} ${row.entries === 1 ? 'entry' : 'entries'}. ${row.visibility === 'private' ? 'Only you can see it now.' : ''}</p>
      ${named ? '' : `<div class="cap">Your address</div><label class="addr"><span>${esc(location.host)}/</span><input type="text" name="username" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(slugOf(shown()).slice(0, 30))}" aria-label="Username"><span class="ok">${ICON.check}</span></label>
      <p class="dlg-fine" data-uname>The name is yours from now on. Every timeline you publish will live under it.</p>`}
      <div class="cap">Who can see it</div>
      ${opt('public', 'Everyone', 'Listed on your page, at a short address')}${opt('link', 'Only people with the link', 'Not listed anywhere')}${row.visibility === 'private' ? '' : opt('private', 'Only me', 'Take it down')}
      ${row.visibility === 'private' ? '' : `<button type="button" class="big copy" data-copy-link>Copy link</button>`}
      <p class="dlg-err" role="alert"></p>
      <button type="submit" class="big pri">${row.visibility === 'private' ? 'Publish' : 'Save'}</button>
      <p class="dlg-fine center">You can take it down at any time.</p></form>`, 'publish');
    const f = d.querySelector('form'), err = d.querySelector('.dlg-err'), un = f.username;
    let checkTimer = null, free = named;
    function check() {
      const name = un.value.trim().toLowerCase(), why = usernameProblem(name), note = d.querySelector('[data-uname]');
      un.closest('.addr').classList.remove('good'); free = false;
      clearTimeout(checkTimer);
      if (why) { note.textContent = why; return; }
      note.textContent = 'Checking…';
      checkTimer = setTimeout(async () => {
        try {
          const got = await api(`/rest/v1/profiles?username=eq.${encodeURIComponent(name)}&select=id`);
          if (un.value.trim().toLowerCase() !== name) return;
          free = !got.length;
          un.closest('.addr').classList.toggle('good', free);
          note.textContent = free ? 'The name is free. It is yours from now on, for every timeline you publish.' : 'That name is taken.';
        } catch (e) { note.textContent = 'Could not check the name. Try again.'; }
      }, 300);
    }
    if (un) { un.addEventListener('input', check); check(); }
    d.querySelector('[data-copy-link]')?.addEventListener('click', (e) => {
      navigator.clipboard?.writeText('https://' + link(row.visibility)).then(() => { e.target.textContent = 'Copied'; });
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const vis = f.vis.value;
      err.textContent = '';
      if (un && vis !== 'private' && !free) { err.textContent = usernameProblem(un.value.trim().toLowerCase()) || 'Pick a name that is free.'; return; }
      busy(d, true);
      try {
        if (un && vis !== 'private') {
          try { await api(`/rest/v1/profiles?id=eq.${user.id}`, { method: 'PATCH', body: { username: un.value.trim().toLowerCase() } }); } catch (x) { throw x.code === '23505' ? new Error('That name was just taken. Pick another.') : x; }
          profile = { username: un.value.trim().toLowerCase() };
          row.username = profile.username;
        }
        await patch(row, { visibility: vis });
        closeLayer();
        app.redraw();
        if (vis !== 'private') { navigator.clipboard?.writeText('https://' + link(vis)).catch(() => {}); toast(vis === 'public' ? 'Published. The link is copied.' : 'Shared by link. The link is copied.'); } else toast('It is private again.');
      } catch (x) { err.textContent = x.message; busy(d, false); }
    });
  }

  // ---- the bar on the left
  const phone = () => matchMedia(PHONE).matches;
  function setOpen(on, keep = true) {
    document.body.classList.toggle('sb-open', on);
    $('sb-fold').setAttribute('aria-expanded', on);
    if (keep && !phone()) { try { localStorage.setItem(FOLD, on ? '1' : '0'); } catch (e) { /* fine */ } }
  }
  // Explore: a page over the road with every published timeline as a card (asked for, Nov 2026:
  // the editors' own count as community timelines too). It steps aside when one is picked.
  let people = [], asked = false;
  // People's published timelines that match a search, by name, description or username: two requests
  // the first time a search is made, then kept. Returns what is known now; `again` runs when more arrives.
  const found = new Map();
  const asView = (t) => ({ id: 't/' + t.id, name: t.title, description: t.description || '', author: t.profiles?.username || 'someone', type: 'community', count: t.entries });
  function searchPeople(raw, again) {
    const q = raw.toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (q.length < 2) return [];
    if (found.has(q)) return found.get(q) || [];
    found.set(q, null);
    const pat = encodeURIComponent('*' + q.replace(/ /g, '*') + '*'), sel = 'id,title,description,entries,profiles!inner(username)';
    Promise.all([
      api(`/rest/v1/timelines?visibility=eq.public&select=${sel}&or=(title.ilike.${pat},description.ilike.${pat})&order=updated_at.desc&limit=12`),
      api(`/rest/v1/timelines?visibility=eq.public&select=${sel}&profiles.username=ilike.${pat}&order=updated_at.desc&limit=12`),
    ]).then(([a, b]) => {
      const m = new Map();
      for (const t of [...a, ...b]) m.set(t.id, asView(t));
      found.set(q, [...m.values()]);
      again();
    }).catch(() => { found.delete(q); });
    return [];
  }
  function explore(on) {
    $('explore').hidden = !on;
    document.body.classList.toggle('exploring', on);
    $('sb-explore').classList.toggle('on', on);
    if (!on) return;
    if (phone()) setOpen(false); else $('vq').focus();
    if (asked) return;
    asked = true;
    // What people have published, newest first: one request, the first time Explore opens.
    api('/rest/v1/timelines?visibility=eq.public&select=id,title,description,entries,profiles(username)&order=updated_at.desc&limit=24')
      .then((l) => { people = l.map(asView); app.listChanged(); })
      .catch(() => { asked = false; });
  }
  function draw(force) {
    const on = app.views(), cur = current(), key = [user?.id, profile?.username, listed, on.join(), list.map((t) => t.id + t.title + t.visibility).join(), cur?.visibility].join('|');
    if (!force && key === drawn) return;
    drawn = key;
    // "New timeline" stands first under "Your timelines" (asked for, Nov 2026).
    const NEW = `<button id="sb-new" class="nv${document.body.classList.contains('creating') ? ' on' : ''}" type="button" title="New timeline">${ICON.plus}<span class="lbl">New timeline</span></button>`;
    $('sb-list').innerHTML = !user
      ? `<h2 class="cap">Your timelines</h2>${NEW}<p class="sb-note">Sign in to make your own timelines and keep them here.</p>`
      : `<h2 class="cap">Your timelines</h2>${NEW}${!listed ? '' : list.length ? list.map((t, i) => `<div class="sb-row${on.length === 1 && on[0] === 't/' + t.id ? ' on' : ''}"><button type="button" class="nv" data-open="${t.id}" title="${esc(t.title)}"><i class="dot" style="background: var(--p${i % 8})"></i><span class="lbl">${esc(t.title)}</span>${t.visibility === 'private' ? '<small class="lbl">Draft</small>' : ''}</button><button type="button" class="ibtn sm more" data-more="${t.id}" aria-label="More for ${esc(t.title)}">${ICON.dots}</button></div>`).join('') : '<p class="sb-note">None yet. “New timeline” starts one from what is on the road.</p>'}`;
    $('sb-foot').innerHTML = user
      ? `<button type="button" class="nv who" id="sb-me" aria-haspopup="menu"><i class="av">${esc(shown()[0].toUpperCase())}</i><span class="lbl"><b>${esc(shown())}</b><small>${esc(user.email || 'Free plan')}</small></span><span class="lbl chev">${ICON.chev}</span></button>`
      : `<button type="button" class="big" id="sb-in" title="Sign in">${ICON.login}<span class="lbl">Sign in</span></button>`;
    // Beside the search: what this timeline is, and the way to publish it.
    if (editor.isOpen() && editor.row() !== cur) editor.close();
    const editable = !!cur && !working && cur.text.includes('"spec":{');
    $('tl-state').innerHTML = cur ? `${editable ? '<button type="button" class="ebtn" id="ed-open"><span class="wide">Open in editor</span><span class="narrow">Edit</span></button>' : ''}<span class="st"><i class="dot${cur.visibility === 'private' ? '' : ' live'}"></i>${SEEN[cur.visibility]}</span><button type="button" class="pbtn" id="publish">${cur.visibility === 'private' ? 'Publish' : 'Share'}</button>` : '';
    document.body.classList.toggle('mine', !!cur);
    const canAsk = !!cur && cur.text.includes('"spec":{');
    if ($('ask').hidden === canAsk) {
      $('ask').hidden = !canAsk;
      $('ask').innerHTML = canAsk ? `<p id="ask-status" class="cr-status" role="status"></p><div class="ask-box"><span class="ask-spark" aria-hidden="true">✦</span><textarea id="ask-q" rows="1" maxlength="600" placeholder="Ask AI for a change…" aria-label="Ask AI to change this timeline"></textarea>${modelBtn('ask-model')}<button type="submit" class="cr-go" aria-label="Send" title="Send">${SEND}</button></div>` : '';
    }
  }
  // The buttons the entry pane shows for a signed-in reader.
  function entryActions(entryId) {
    if (!user) return '';
    const cur = current();
    if (cur && app.view('t/' + cur.id)?.memberIds?.has(entryId)) return `<button type="button" class="btn" data-tl-remove="${esc(entryId)}">Remove from this timeline</button>`;
    return list.length ? `<button type="button" class="btn" data-tl-add="${esc(entryId)}">Add to a timeline</button>` : '';
  }

  function wire() {
    // On a phone, picking a view puts the drawer away. Caught on the way down: the list is redrawn by the pick.
    document.addEventListener('click', (e) => {
      if (phone() && e.target.closest('#sb-list [data-open]')) setTimeout(() => setOpen(false), 0);
    }, true);
    $('ask').addEventListener('submit', (e) => { e.preventDefault(); change($('ask-q').value.trim()); });
    $('ask').addEventListener('keydown', (e) => { if (e.target.id === 'ask-q' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('ask').requestSubmit(); } });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('create').hidden && $('layer').hidden) { e.stopImmediatePropagation(); closeCreate(); } }, true);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('explore').hidden && $('layer').hidden && !$('vq').value) { e.stopImmediatePropagation(); explore(false); } }, true);
    document.addEventListener('click', async (e) => {
      const el = (s) => e.target.closest(s);
      const layer = $('layer');
      if (!layer.hidden && (el('[data-close]') || e.target === layer)) return closeLayer();
      if (el('#sb-fold') || el('#sb-btn') || el('#sb-scrim')) return setOpen(!document.body.classList.contains('sb-open'));
      // A click on the empty part of the folded strip opens it.
      if (!phone() && !document.body.classList.contains('sb-open') && el('#sb') && !el('button, a, input')) return setOpen(true);
      if (el('#sb-new')) return $('create').hidden ? openCreate() : closeCreate();
      if (el('[data-create-close]')) return closeCreate();
      const idea = el('[data-idea]');
      if (idea) { $('cr-q').value = idea.textContent; return $('cr-q').focus(); }
      const mm = el('[data-model-menu]');
      if (mm) return pickModel(mm);
      const md = el('[data-model]');
      if (md) return setModel(md.dataset.model);
      if (el('[data-more-models]')) { moreModels = true; return pickModel(modelAnchor); }
      const ef = el('[data-effort]');
      if (ef) return setEffort(ef.dataset.effort);
      const kd = el('[data-kind]');
      if (kd) return showKind(kd.dataset.kind);
      if (el('#sb-explore')) { closeCreate(); return explore($('explore').hidden); }
      if (el('[data-sb-home]')) return explore(false);
      if (el('#sb-in')) return signIn();
      if (el('#publish')) return publish(el('#publish'));
      if (el('#ed-open')) { const r = current(); if (r && !editor.open(r)) toast('This timeline cannot be opened in the editor.'); return undefined; }
      const open = el('[data-open]');
      if (open) { if (phone()) setOpen(false); return app.show('t/' + open.dataset.open); }
      const more = el('[data-more]');
      if (more) {
        const row = list.find((t) => t.id === more.dataset.more);
        const d = popover(more, '<button type="button" class="nv" data-act="rename">Rename</button><button type="button" class="nv danger" data-act="delete">Delete</button>', 'menu');
        d.addEventListener('click', (x) => { const a = x.target.closest('[data-act]')?.dataset.act; if (a === 'rename') rename(row); else if (a === 'delete') remove(row); });
        return undefined;
      }
      if (el('#sb-me')) {
        const d = popover(el('#sb-me'), `<div class="me"><b>${esc(shown())}</b><small>Signed in as ${esc(user.email || shown())}</small></div>${profile?.username ? `<div class="me"><small>Publishes as</small><span>${esc(location.host)}/${esc(profile.username)}</span></div>` : ''}<hr><button type="button" class="nv" data-act="theme">Switch theme</button><hr><button type="button" class="nv" data-act="out">Sign out</button>`, 'menu wide');
        d.addEventListener('click', (x) => { const a = x.target.closest('[data-act]')?.dataset.act; if (!a) return; closeLayer(); if (a === 'out') signOut(); else $('theme').click(); });
        return undefined;
      }
      const add = el('[data-tl-add]');
      if (add) {
        const d = popover(add, `<div class="cap">Add to</div>${list.map((t) => `<button type="button" class="nv" data-to="${t.id}">${esc(t.title)}</button>`).join('')}`, 'menu wide');
        d.addEventListener('click', async (x) => { const to = x.target.closest('[data-to]')?.dataset.to; if (!to) return; closeLayer(); try { await addEntry(to, add.dataset.tlAdd); } catch (err) { toast(err.message); } });
        return undefined;
      }
      const rem = el('[data-tl-remove]');
      if (rem && current()) { try { await removeEntry(current(), rem.dataset.tlRemove); } catch (err) { toast(err.message); } }
      return undefined;
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('layer').hidden) { e.stopPropagation(); closeLayer(); } }, true);
    matchMedia(PHONE).addEventListener('change', () => setOpen(!phone() && stored() !== '0', false));
  }
  const stored = () => { try { return localStorage.getItem(FOLD); } catch (e) { return null; } };

  // Runs before the page reads its address: takes a returning sign-in out of the "#".
  function boot() {
    load();
    const got = readAuthHash(location.hash);
    let failed = '';
    if (got) {
      history.replaceState(null, '', location.pathname + location.search);
      if (got.session) { session = got.session; user = null; save(); } else failed = got.error;
    }
    setOpen(!phone() && (stored() ? stored() === '1' : innerWidth >= 1100), false);
    return failed;
  }
  async function start(failed) {
    wire();
    draw(true);
    if (failed) toast(failed);
    if (!session) return;
    try {
      if (!user) await whoAmI();
      await refreshList();
      let intent = null; try { intent = sessionStorage.getItem(INTENT); sessionStorage.removeItem(INTENT); } catch (e) { /* fine */ }
      if (intent === 'new') copyTimeline();
      // A sentence typed before signing in: carry on with it.
      let kept = ''; try { kept = sessionStorage.getItem(PROMPT) || ''; sessionStorage.removeItem(PROMPT); } catch (e) { /* fine */ }
      if (kept) { openCreate(kept); make(kept); }
    } catch (e) { if (e.status === 401 || e.status === 403) signedOut(); }
  }

  return { boot, start, explore, searchPeople, published: () => people, payload: (id) => { const r = rowOf(id); return r ? payloadOf(r) : null; }, sync: () => draw(false), fetchView, addressOf, isMine, entryActions, signedIn: () => !!session, editing: () => editor.isOpen(), editEntry: (id) => editor.openById(id) };
}
