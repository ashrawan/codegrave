/* Accounts and your own timelines: the bar on the left, signing in, and the
   timelines a person keeps (Supabase: auth, and two tables behind row level
   security). No library: the auth and data APIs are plain HTTPS calls.
   A timeline is stored whole, in the shape of a built view file
   ({ view, entries }), so opening one costs one request, like any view.
   The page knows a stored timeline as "t/<its id>". Its address is
   /t/<id>, or /<username>/<slug> once it is public. */
import { shardOf } from './keys.js';

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
const KEY = 'cg-session', FOLD = 'cg-sb', INTENT = 'cg-intent';

/* `app` is what the page lends: $, esc, views() (ids on the road), view(id),
   show(id), replace(payload) (a stored view changed), forget(id), home(),
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
    user = { id: u.id, email: u.email || '', name: u.user_metadata?.user_name || u.user_metadata?.name || '' };
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
  const shown = () => profile?.username || user?.name || (user?.email || '').split('@')[0] || 'You';

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
    rows.set(row.id, row);
    return payloadOf(row);
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
  async function create(title, from) {
    const src = await rawView(from);
    const { id: _i, name: _n, author: _a, type: _t, topic: _o, count: _c, stored: _s, mine: _m, level: _l, ...meta } = src.view || {};
    const data = { view: meta, entries: src.entries || [] };
    const base = slugOf(title);
    for (let n = 1; n < 20; n++) {
      try {
        const got = await api('/rest/v1/timelines?select=id', { method: 'POST', headers: { Prefer: 'return=representation' }, body: { title, slug: n === 1 ? base : `${base.slice(0, 56)}-${n}`, description: (src.view?.description || '').slice(0, 600), forked_from: from, data } });
        return 't/' + got[0].id;
      } catch (e) {
        if (e.code !== '23505') throw e.code === '23514' ? new Error('That view is too large to copy for now.') : e;
      }
    }
    throw new Error('Pick another name: that one is taken.');
  }
  async function patch(row, body) {
    const got = await api(`/rest/v1/timelines?id=eq.${row.id}&select=id,slug,title,description,visibility,entries,updated_at`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body });
    if (!got[0]) throw new Error('That timeline is no longer there.');
    Object.assign(row, got[0]);
    if (body.data) row.text = JSON.stringify(body.data);
    app.replace(payloadOf(row));
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
    d.style.top = Math.max(8, up ? r.top - h - 8 : r.bottom + 8) + 'px';
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

  async function newTimeline() {
    if (!user) { try { sessionStorage.setItem(INTENT, 'new'); } catch (e) { /* fine */ } return signIn('Sign in to start a timeline of your own.'); }
    const from = app.views()[0], src = from && app.view(from);
    if (!src) return;
    const a = await ask({ title: 'New timeline', text: `It starts as a copy of “${src.name}”, private until you publish it. You can then add and remove entries. Creating one from a sentence with AI comes next.`, label: 'Name', value: isMine(from) ? src.name + ' 2' : 'My ' + src.name, ok: 'Create' });
    if (!a.value) return;
    a.busy();
    try {
      const id = await create(a.value, from);
      closeLayer();
      await refreshList();
      app.show(id);
    } catch (e) { a.fail(e.message); }
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
  // Explore: the views (search, topics, the list, the year filter) take the bar in place of the reader's own lists.
  function explore(on) {
    document.body.classList.toggle('sb-explore', on);
    if (on) { setOpen(true, false); if (!phone()) $('vq').focus(); }
  }
  function draw(force) {
    const on = app.views(), cur = current(), key = [user?.id, profile?.username, listed, on.join(), list.map((t) => t.id + t.title + t.visibility).join(), cur?.visibility].join('|');
    if (!force && key === drawn) return;
    drawn = key;
    $('sb-list').innerHTML = !user
      ? '<p class="sb-note">Sign in to make your own timelines and keep them here.</p>'
      : `<h2 class="cap">Your timelines</h2>${!listed ? '' : list.length ? list.map((t, i) => `<div class="sb-row${on.length === 1 && on[0] === 't/' + t.id ? ' on' : ''}"><button type="button" class="nv" data-open="${t.id}" title="${esc(t.title)}"><i class="dot" style="background: var(--p${i % 8})"></i><span class="lbl">${esc(t.title)}</span>${t.visibility === 'private' ? '<small class="lbl">Draft</small>' : ''}</button><button type="button" class="ibtn sm more" data-more="${t.id}" aria-label="More for ${esc(t.title)}">${ICON.dots}</button></div>`).join('') : '<p class="sb-note">None yet. “New timeline” starts one from what is on the road.</p>'}`;
    $('sb-foot').innerHTML = user
      ? `<button type="button" class="nv who" id="sb-me" aria-haspopup="menu"><i class="av">${esc(shown()[0].toUpperCase())}</i><span class="lbl"><b>${esc(shown())}</b><small>Free plan</small></span><span class="lbl chev">${ICON.chev}</span></button>`
      : `<button type="button" class="big" id="sb-in"><span class="lbl">Sign in</span><i class="rail-only">${ICON.chev}</i></button>`;
    // Beside the search: what this timeline is, and the way to publish it.
    $('tl-state').innerHTML = cur ? `<span class="st"><i class="dot${cur.visibility === 'private' ? '' : ' live'}"></i>${SEEN[cur.visibility]}</span><button type="button" class="pbtn" id="publish">${cur.visibility === 'private' ? 'Publish' : 'Share'}</button>` : '';
    document.body.classList.toggle('mine', !!cur);
    $('pdf').hidden = on.some(isStored);        // the print page reads built view files only
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
      if (phone() && e.target.closest('#vlist li') && !e.target.closest('.radd, .vhead, .none')) setTimeout(() => setOpen(false), 0);
    }, true);
    document.addEventListener('click', async (e) => {
      const el = (s) => e.target.closest(s);
      const layer = $('layer');
      if (!layer.hidden && (el('[data-close]') || e.target === layer)) return closeLayer();
      if (el('#sb-fold') || el('#sb-btn') || el('#sb-scrim')) return setOpen(!document.body.classList.contains('sb-open'));
      if (el('#sb-new')) { if (phone()) setOpen(false); return newTimeline(); }
      if (el('#sb-search')) { if (phone()) setOpen(false); return app.focusSearch(); }
      if (el('#sb-explore')) return explore(true);
      if (el('[data-sb-home]')) return explore(false);
      if (el('#sb-in')) return signIn();
      if (el('#publish')) return publish(el('#publish'));
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
        const d = popover(el('#sb-me'), `<div class="me"><b>${esc(shown())}</b><small>${esc(profile?.username ? location.host + '/' + profile.username : user.email)}</small></div><hr><button type="button" class="nv" data-act="theme">Switch theme</button><hr><button type="button" class="nv" data-act="out">Sign out</button>`, 'menu wide');
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
      if (intent === 'new') newTimeline();
    } catch (e) { if (e.status === 401 || e.status === 403) signedOut(); }
  }

  return { boot, start, explore, sync: () => draw(false), fetchView, addressOf, isMine, entryActions, signedIn: () => !!session };
}
