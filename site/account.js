/* Accounts and your own timelines: the bar on the left, signing in, and the
   timelines a person keeps (Supabase: auth, and two tables behind row level
   security). No library: the auth and data APIs are plain HTTPS calls.
   A timeline is stored whole, in the shape of a built view file
   ({ view, entries }), so opening one costs one request, like any view.
   The page knows a stored timeline as "t/<its id>". Its address is
   /t/<id>, or /<username>/<slug> once it is public. */
import { shardOf } from './keys.js';
import { EFFORTS, MAX_ENTRIES, MODELS, findPictures, partialSpec, specToView, viewToSpec } from './ai.js';
import { createEditor } from './editor.js';

// Public by design: the key only allows what the database's row level security allows.
import { VOICES, DEFAULT_VOICE, isVoice, voiceLabel, voiceOf, isSlow, gpuOk, GPU_MB, MODEL_MB, listen as hear } from './voice.js';
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
  out: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M15 8l4 4-4 4"/><path d="M19 12H9"/></svg>',
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
const KEY = 'cg-session', FOLD = 'cg-sb', INTENT = 'cg-intent', MODEL = 'cg-model', PROMPT = 'cg-prompt', FAILED = 'cg-ai-failed';
const AI_PER_DAY = 20;      // the allowance until the account's row is read (`profiles.ai_daily`)

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
      api(`/rest/v1/profiles?id=eq.${user.id}&select=username,ai_daily`),
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
    // Its voiceover, if it has one, with the full address of its clips.
    const vo = voiceOf(d.voice);
    if (vo) view.voice = vo;
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
  // A timeline that is not the reader's own, made theirs (asked for, Nov 2026: "then it will be their own, and
  // then they can make the edit by asking the AI, in their own space"): a private copy written as a spec, so the
  // editor and Ask AI work on it. The wiki's own file never changes.
  async function makeMine() {
    const from = app.views()[0], v = from && app.view(from);
    if (!v || working) return;
    if (!user) return signIn('Sign in to make this timeline your own. Your copy is private until you publish it.');
    const src = await rawView(from).catch(() => null), n = src?.entries?.length || 0;
    if (!n) return toast('This timeline could not be copied. Try again.');
    const a = await ask({ title: 'Make it your own', text: `A private copy of “${v.name}” that you can change in the editor or by asking AI. The original stays as it is.${n > MAX_ENTRIES ? ` A timeline of your own holds ${MAX_ENTRIES} entries for now, so the copy keeps the ${MAX_ENTRIES} best ranked of its ${n}.` : ''}`, label: 'Name', value: 'My ' + v.name, ok: 'Make a copy' });
    if (!a.value) return;
    a.busy();
    try {
      const file = specToView(viewToSpec(src, a.value, app.about), seed());
      const id = await insert(a.value, file.spec.description, { view: file.view, entries: file.entries, spec: file.spec }, from);
      closeLayer();
      await refreshList();
      app.show(id);
      toast('This copy is yours. Ask AI at the foot, or open it in the editor.');
    } catch (e) { a.fail(e.message); }
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
  function closeLayer() { hush(); $('layer').hidden = true; $('layer').innerHTML = ''; $('layer').className = ''; }
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
  const sayOf = (e) => (e.status === 401 ? 'Sign in again to make a timeline.' : e.status === 429 ? 'Request limit reached. ' + (e.message || '') : e.message || 'That did not work. Try again.');
  const fail = (el, e) => { if (el) { el.classList.add('err'); el.textContent = sayOf(e); } else toast(sayOf(e)); };
  // Asks the function and reads its answer as it comes: `onText` gets the JSON written so far, `onNote`
  // what the function is doing. Resolves with the finished answer, or throws with a sentence to show.
  async function ask_ai(body, onText, onNote) {
    const t = await token();
    const r = await fetch(CONFIG.url + '/functions/v1/ai-timeline', {
      method: 'POST',
      headers: { apikey: CONFIG.key, ...(t ? { Authorization: 'Bearer ' + t } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, effort, ...body }),
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
    el.innerHTML = '<ol>' + steps.map((s, i) => `<li class="${i < step ? 'done' : i === step ? 'now' : ''}">${s}${i === w && n ? ` <b>${n}</b>` : ''}${i === step ? '<span class="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>' : ''}</li>`).join('') + '</ol>';
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
    let shown = 0, last = 0, seen = 0, pics = false;
    const put = (spec, data) => {
      const f = specToView(spec, sd);
      row.title = f.spec.title !== 'Untitled timeline' ? f.spec.title : row.title;
      row.description = f.spec.description;
      row.text = JSON.stringify(data ? { ...data(f) } : { view: f.view, entries: f.entries, prompt, making: true });
      app.replace(payloadOf(row));
      // While it is written the reader goes along to each new entry, so all of it passes by; at the end the
      // timeline goes back to its beginning (asked for, Nov 2026).
      if (!data && f.entries.length > seen) { seen = f.entries.length; const last = f.entries[seen - 1].id; setTimeout(() => app.goTo(last), 30); }
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
      // The finished timeline opens at its beginning, wherever the reader stood while it was written (asked for, Nov 2026).
      setTimeout(() => app.start(id), 60);
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
      // The page is loaded afresh on the way home, so what went wrong is kept for the page that follows to show
      // with the request (reported, Nov 2026: the limit's message was never seen).
      try { sessionStorage.setItem(FAILED, JSON.stringify({ prompt, message: e.message || '', status: e.status || 0 })); } catch (x) { /* fine */ }
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
      await patch(row, { title: file.spec.title, description: file.spec.description, data: { view: file.view, entries: file.entries, spec: file.spec, prompt: before.data.prompt, ...(before.data.voice ? { voice: before.data.voice } : {}) } });
      live(null);
      $('ask-q').value = '';
      toast(got.changed || 'Changed.', { undo: () => patch(row, before).catch((e) => toast(e.message)) });
      morePictures(row, file.entries[0].id.split('-')[0].slice(1));
    } catch (e) { live(null); fail(st, e); setTimeout(() => { if (st.classList.contains('err')) { st.textContent = ''; st.classList.remove('err'); } }, 7000); }
    working = false; document.body.classList.remove('ai-busy');
  }
  // The requests offered under one kind: pressing the kind again folds them away.
  // ---- voiceover (site/voice.js, the function `voiceover`): a timeline of the reader's own, told aloud.
  // The function writes the script (one of the day's requests) and only the words are kept on the row, with
  // the voice; the sound is made in the reader's browser while play goes, so nothing else is stored.
  const MIC = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/></svg>';
  const READY_AT = 3;          // lines made before play may begin
  let voicing = null;
  async function voiceFn(body) {
    const t = await token();
    const r = await fetch(CONFIG.url + '/functions/v1/voiceover', { method: 'POST', headers: { apikey: CONFIG.key, ...(t ? { Authorization: 'Bearer ' + t } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => null);
    if (r.ok && d) return d;
    throw new Error(d?.error || (r.status === 404 ? 'Voiceover is not switched on yet.' : 'That did not work. Try again.'));
  }
  const keepVoice = (v) => { try { localStorage.setItem('cg-voice-name', v); } catch (x) { /* private window */ } };
  // What holds the voiceover of the timeline on show: the row of a timeline of the reader's own, or, for any
  // other single view, this browser (asked for, Nov 2026: Generate voiceover on the existing views too).
  function holder() {
    const cur = current();
    if (cur) return { own: true, title: cur.title, description: cur.description || '', get: () => JSON.parse(cur.text).voice, set: (v) => { const data = JSON.parse(cur.text); if (v) data.voice = v; else delete data.voice; return patch(cur, { data }); } };
    const o = app.one();
    return o ? { own: false, title: o.title, description: o.description, get: () => app.one()?.voice, set: async (v) => app.keepVoice(v) } : null;
  }
  const onNow = () => app.views().join();
  // `guide` is the reader's own words on how to tell it (asked for, Nov 2026; not needed): the function gives
  // them to the writer, and they are kept beside the script. `prior` is the script as it is now, for a
  // rewrite (asked for, Nov 2026: "AI will use the current voiceover and update that accordingly"): with words
  // from the reader the writer changes that script; with none it is written afresh.
  // `span` is the part of the timeline to tell, by entry ([from, to]; asked for, Nov 2026, like the period of
  // an export: not needed, and without it the whole timeline is told).
  async function voiceover(row, voice, guide = '', span = null, prior = null) {
    if (voicing || working) return;
    voicing = { key: onNow(), step: 1, note: 'Writing the script…', open: true };
    draw();
    try {
      const src = app.told();
      if (!src || !src.entries.length) throw new Error('There is nothing to tell yet.');
      const part = span ? src.entries.slice(span[0], span[1] + 1) : src.entries;
      const script = await voiceFn({ script: { title: row.title, description: row.description || '', entries: part, ...(guide ? { guide } : {}), ...(prior && guide ? { prior } : {}) } });
      await row.set({ at: Date.now(), voice, style: script.style || '', ...(guide ? { guide } : {}), lines: script.lines });
      await record(voice, script.lines);
      if (!voicing.early) toast('The voiceover is ready. Press play to hear it.');
    } catch (e) {
      toast(e.message || 'The voiceover could not be made. Try again.');
    } finally { voicing = null; draw(true); }
  }
  // The second step (asked for, Nov 2026: "generate the voiceover script, then generate the voice"): every
  // line is spoken once now, in this browser, and kept there, so play never waits. The device's own voice has
  // nothing to make. A line that cannot be made is left for play, which makes it again or uses the device.
  async function record(voice, lines) {
    if (voice === 'device' || !lines?.length) return;
    voicing.step = 2; voicing.total = lines.length; voicing.made = 0;
    const tick = setInterval(() => { if (voicing) { noteOf(); draw(); } }, 400);
    try {
      for (const l of lines) {
        await app.speaker().line(l.text, voice).catch(() => null);
        voicing.made++;
        // Three lines are enough to start (asked for, Nov 2026: "should be able to play while the rest could
        // happen in the background"): the note folds away to its pill, and the rest is made as play goes,
        // the line play needs next always first.
        if (voicing.made === Math.min(READY_AT, lines.length) && lines.length > READY_AT) { voicing.open = false; voicing.early = true; toast('The voiceover is ready to play. The rest is made in the background.'); draw(true); }
      }
    } finally { clearInterval(tick); }
  }
  function noteOf() {
    const l = app.voiceLoad();
    voicing.note = l ? `Downloading the voice: ${Math.round(l.part * 100)}%` : voicing.early ? `Ready to play · voice ${voicing.made} of ${voicing.total}` : `Making the voice: ${voicing.made} of ${voicing.total}`;
  }
  // Another voice for the same words: nothing is asked of the server but the change to the row, then the voice.
  async function revoice(row, voice) {
    if (voicing || working) return;
    try {
      const was = row.get();
      await row.set({ ...was, at: Date.now(), voice });
      voicing = { key: onNow(), step: 2, note: 'Making the voice…', open: true, skip: true };
      draw();
      await record(voice, was?.lines || []);
      toast(`${voiceLabel(voice)} will tell this timeline.`);
    } catch (e) { toast(e.message); } finally { voicing = null; draw(true); }
  }
  async function unvoice(row) {
    try {
      await row.set(null);
      toast('The voiceover is deleted.');
    } catch (e) { toast(e.message); } finally { draw(true); }
  }
  // From the menu by play (asked for, Nov 2026): with no voiceover yet it is made at once in the voice the
  // reader chose last; only someone who never chose one is shown the voices first. A timeline that has one
  // opens its dialog (another voice, write again, remove).
  function voiceQuick() {
    const h = working ? null : holder();
    if (!h || voicing) return;
    let v = null; try { v = localStorage.getItem('cg-voice-name'); } catch (e) { /* private window */ }
    if (voiceOf(h.get()) || !isVoice(v)) return voiceMenu($('tl-more'), h);
    if (!user) return signIn('Sign in to generate a voiceover. Writing the script uses one of your requests for the day.');
    voiceover(h, v);
  }
  // Under the pill while the script is written.
  function drawVoicing(on) {
    const p = $('vo-panel');
    p.hidden = !on || !voicing.open;
    if (p.hidden) { p.innerHTML = ''; return; }
    if (voicing.exporting) {
      const order = ['voice', 'sound', 'pictures', 'map', 'video', 'saving'], at = order.indexOf(voicing.what);
      if (!p.querySelector('.vp-ex')) p.innerHTML = `<div class="vp-head"><b>Export</b><small></small></div><div class="vp-bar vp-ex"><i></i></div><p class="vp-note"></p><p class="vp-foot">Made on your device. Keep this tab open until the file is saved.</p><button type="button" class="linkish" id="ex-stop">Cancel the export</button>`;
      p.querySelector('.vp-head small').textContent = at >= 0 ? `Step ${at + 1} of ${order.length}` : '';
      p.querySelector('.vp-bar i').style.width = Math.round((voicing.part || 0) * 100) + '%';
      p.querySelector('.vp-note').textContent = voicing.note;
      return;
    }
    const two = voicing.step === 2, part = two && voicing.total ? voicing.made / voicing.total : 0;
    const step = (n, label, state) => `<li class="${state}"><i>${state === 'done' ? '✓' : n}</i><span>${label}</span></li>`;
    p.innerHTML = `<div class="vp-head"><b>Voiceover</b><small>Step ${voicing.step} of 2</small></div>
      <ol class="vp-steps">${voicing.skip ? '' : step(1, 'Write the script', two ? 'done' : 'now')}${step(2, 'Make the voice', two ? 'now' : '')}</ol>
      <div class="vp-bar${two ? '' : ' run'}"><i${two ? ` style="width: ${Math.round(part * 100)}%"` : ''}></i></div>
      <p class="vp-note">${two ? esc(voicing.note) : 'Writing a script that fits the title and every entry'}<span class="dots"><i></i><i></i><i></i></span></p>
      <p class="vp-foot">${two ? 'Each line is spoken once on your device and kept in this browser, so play never waits.' : 'This takes a few seconds. Then each line is spoken on your device.'}</p>`;
  }
  // The three dots at the top right: what can be done with the timeline on show (asked for, Nov 2026: Publish
  // and the voiceover moved in here, and the menu at the foot became settings only).
  const TL = {
    edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
    share: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.5 2.6 14.5 0 17M12 3.5c-2.6 2.5-2.6 14.5 0 17"/></svg>',
    turn: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4v15M20 15l-4 4-4-4M8 20V5M12 9 8 5 4 9"/></svg>',
    name: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7V5h14v2M12 5v14M9 19h6"/></svg>',
    film: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M10 9.5v5l4.5-2.5z"/></svg>',
    bin: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/></svg>',
  };
  function timelineMenu(anchor) {
    const cur = current(), free = !!cur && !working, hold = working ? null : holder(), told = !!hold && !!voiceOf(hold.get());
    const item = (act, icon, label, note = '', cls = '') => `<button type="button" class="nv${cls}" data-act="${act}" role="menuitem">${icon}<span>${label}</span>${note ? `<small>${note}</small>` : ''}</button>`;
    // Design A with B's publish row (picked from three, Nov 2026): a heading that names the timeline, its size
    // and state; Publish on top as a row of its own with a Share button, which opens the sharing box and never
    // shares by itself; then Export, Sound and Edit as short rows with their state at the right; Rename and
    // Delete quietly at the foot.
    const ents = app.told()?.entries || [], one = hold || {}, vo = told ? voiceOf(hold.get()) : null;
    const span = ents.length ? `${ents[0].mark || ''}${ents[0].mark && ents[ents.length - 1].mark && ents[0].mark !== ents[ents.length - 1].mark ? ' to ' + ents[ents.length - 1].mark : ''}` : '';
    const priv = cur?.visibility === 'private';
    const d = popover(anchor, `<div class="tl-head"><b>${esc(one.title || 'This timeline')}</b><small>${[ents.length ? `${ents.length} ${ents.length === 1 ? 'entry' : 'entries'}` : '', esc(span), cur ? SEEN[cur.visibility] : ''].filter(Boolean).join(' · ')}</small></div>
      ${cur ? `<button type="button" class="tl-pub" data-act="publish" role="menuitem">${TL.share}<span><b>${priv ? 'Publish' : 'Sharing'}</b><small>${priv ? 'Private: only you can open it' : cur.visibility === 'public' ? 'Public: anyone can find it' : 'Anyone with the link can open it'}</small></span><i>${priv ? 'Share' : 'Manage'}</i></button>` : ''}
      <div class="cap">Export</div>
      ${item('video', TL.film, 'Video', 'MP4')}
      ${item('pdf', '<img src="media/pdf.svg" width="13" height="16" alt="">', 'Document', 'PDF')}
      ${hold ? '<div class="cap">Sound</div>' + item('voice', MIC, told ? 'Voiceover' : 'Generate voiceover', vo ? `${esc(voiceLabel(vo.voice))} · Ready` : '', told ? ' has' : ' lit') : ''}
      <div class="cap">${cur ? 'Edit' : 'This timeline'}</div>
      ${free && cur.text.includes('"spec":{') ? item('edit', TL.edit, 'Open in editor') : ''}
      ${!cur && hold ? item('mine', TL.edit, 'Make it your own', 'Edit a copy') : ''}
      ${item('turn', TL.turn, esc($('reverse').textContent.trim() || 'Turn round'))}
      ${cur ? `<hr><div class="tl-foot"><button type="button" data-act="rename" role="menuitem">Rename</button><button type="button" class="danger" data-act="delete" role="menuitem">Delete</button></div>` : ''}`, 'menu tl');
    d.addEventListener('click', (x) => {
      const a = x.target.closest('[data-act]')?.dataset.act, at = $('tl-more');
      if (!a) return;
      x.stopPropagation();
      if (a === 'voice') return voiceMenu(at, hold);
      if (a === 'video') { closeLayer(); return videoMenu(); }
      if (a === 'publish') return publish(at);
      closeLayer();
      if (a === 'edit') { if (!editor.open(cur)) toast('This timeline cannot be opened in the editor.'); }
      else if (a === 'mine') makeMine();
      else if (a === 'pdf') $('pdf').click();
      else if (a === 'turn') $('reverse').click();
      else if (a === 'rename') rename(cur);
      else if (a === 'delete') remove(cur);
    });
  }
  // The voiceover of one timeline: the voices, each with a few words to hear before choosing (asked for,
  // Nov 2026: "to try which voice is good"), then Generate. The words are spoken in this browser.
  const PLAY = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>', HALT = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5.5" y="5" width="4.5" height="14" rx="1"/><rect x="14" y="5" width="4.5" height="14" rx="1"/></svg>';
  let sample = null;
  function hush() { if (sample) { sample.stop(); sample.b.classList.remove('on', 'wait'); sample.b.innerHTML = PLAY + '<span>Listen</span>'; sample = null; } }
  function sampleOf(b, fail, text) {
    const same = sample && sample.b === b;
    hush();
    if (same) return;
    const me = { b, stop: () => {} };
    sample = me;
    // The button turns until the sound starts: the model may still be coming, and a voice not used before
    // fetches its own small file first (asked for, Nov 2026: "it's not showing that loading").
    b.classList.add('wait'); b.innerHTML = '<span>Loading…</span>';
    const note = b.closest('.dlg, form')?.querySelector('.vo-fetch');
    if (note && b.dataset.sample !== 'device') { note.textContent = `Getting ${voiceLabel(b.dataset.sample)} ready…`; note.hidden = false; }
    const quiet = () => { if (note) note.hidden = true; };
    me.stop = hear(app.speaker(), b.dataset.sample, app.audio, () => { if (sample === me) hush(); }, (e) => { quiet(); if (sample === me) { hush(); fail(e.message === 'no voice' ? 'The voice could not be loaded on this device. Play will use the device’s own voice instead.' : 'The voice could not be played. Try again.'); } }, text || undefined,
      () => { quiet(); if (sample === me) { b.classList.replace('wait', 'on'); b.innerHTML = HALT + '<span>Stop</span>'; } });
    const stop = me.stop; me.stop = () => { quiet(); stop(); };
  }
  // The part of the timeline a voiceover tells: the same strip with two handles as in the export dialog.
  function spanPick(ents) {
    const n = ents.length - 1, st = { from: 0, to: Math.max(0, n) };
    const html = n < 1 ? '' : `<div class="ex-span vo-span"><div class="ex-span-h"><b>Period <small>Optional</small></b><span class="ex-snote"></span></div>
      <div class="yearbar ex-yb"><div class="ex-hist">${Array.from({ length: Math.min(ents.length, 60) }, () => '<i></i>').join('')}</div><input type="range" data-span="from" min="0" max="${n}" step="1" aria-label="First entry"><input type="range" data-span="to" min="0" max="${n}" step="1" aria-label="Last entry"></div>
      <div class="ex-ends"><span data-end="from"></span><span data-end="to"></span></div></div>`;
    const wire = (d) => {
      const box = d.querySelector('.vo-span');
      if (!box) return;
      const q = (x) => box.querySelector(x), hs = box.querySelectorAll('.ex-hist i');
      const show = () => {
        q('[data-span=from]').value = st.from; q('[data-span=to]').value = st.to;
        const a = ents[st.from], b = ents[st.to], yb = q('.ex-yb'), count = st.to - st.from + 1;
        yb.style.setProperty('--lo', (st.from / n * 100) + '%'); yb.style.setProperty('--hi', (st.to / n * 100) + '%');
        hs.forEach((el, k) => { const at = hs.length > 1 ? k / (hs.length - 1) * n : 0; el.classList.toggle('off', at < st.from - 0.5 || at > st.to + 0.5); });
        q('.ex-snote').textContent = `${a.mark || ''}${a.mark && b.mark && a.mark !== b.mark ? ' to ' + b.mark : ''} · ${count === ents.length ? `all ${ents.length} entries` : `${count} of ${ents.length} entries`}`;
        q('[data-end=from]').textContent = a.name; q('[data-end=to]').textContent = b.name;
      };
      box.addEventListener('input', (e) => {
        const k = e.target.dataset.span, v = Number(e.target.value);
        if (k === 'from') st.from = Math.min(v, st.to); else if (k === 'to') st.to = Math.max(v, st.from); else return;
        show();
      });
      show();
    };
    return { html, wire, get: () => (st.from > 0 || st.to < n ? [st.from, st.to] : null) };
  }
  function voiceMenu(anchor, row) {
    if (voicing) return;
    const has = voiceOf(row.get()), was = has?.voice || (() => { try { const v = localStorage.getItem('cg-voice-name'); return isVoice(v) ? v : null; } catch (e) { return null; } })() || DEFAULT_VOICE;
    // Two dialogs (designs A and B, picked from three each, Nov 2026). With no voiceover yet: the voices as
    // cards, each with Listen, and one button that names the voice. With one: the voices at the left and the
    // script as it is told at the right, "this is your script", to write again or to try in another voice.
    const kok = VOICES.filter(([v]) => v !== 'device'), dev = VOICES.find(([v]) => v === 'device');
    const voiceEl = ([v, name, w], cls = '') => `<label class="vo-voice ${cls}"><input type="radio" name="voice" value="${v}"${v === was ? ' checked' : ''}><button type="button" class="vo-listen" data-sample="${v}" aria-label="Listen to ${esc(name)}" title="Listen">${PLAY}<span>Listen</span></button><span><b>${esc(name)}</b><small>${esc(w)}</small></span><i aria-hidden="true"></i></label>`;
    const notes = `<label class="vo-gpu" hidden><input type="checkbox"><span><b>Faster voice</b><small>Uses your graphics card: a one-time ${GPU_MB} MB download instead of ${MODEL_MB} MB.</small></span></label>
      <p class="vo-load" hidden></p>
      <p class="vo-fetch" hidden></p>
      <p class="vo-slow" hidden>This device makes the voice slowly. Play will pause at each card until its line is ready.</p>
      <p class="dlg-err" role="alert"></p>`;
    const ents = app.told()?.entries || [], span = spanPick(ents);
    const byId = new Map(ents.map((e) => [e.id, e]));
    const lineEl = (l) => { const e = byId.get(l.id), edge = l.id === 'intro' ? 'Opening' : l.id === 'outro' ? 'Closing' : ''; return `<li${edge ? ' class="edge"' : ''}><span>${esc(edge || e?.when || '')}</span><div>${e ? `<b>${esc(e.name)}</b>` : ''}<p>${esc(l.text)}</p></div></li>`; };
    const d = modal(has ? `<form class="vo-form vb">
      <div class="vo-list"><h2>Voiceover</h2><div class="cap">Voice</div>
        <div class="vo-voices" role="radiogroup" aria-label="Voice">${VOICES.map((v) => voiceEl(v, 'row')).join('')}</div>${notes}</div>
      <div class="vo-script"><div class="vo-shead"><span><small>Script${row.own ? '' : ', kept in this browser'}</small><b>${esc(row.title || 'This timeline')}</b></span><button type="button" class="vo-del" data-unvoice title="Delete this voiceover">Delete</button></div>
        <label class="vo-guide"><span>What should change? <small>Leave empty to write it afresh</small></span><textarea name="guide" rows="2" maxlength="400" placeholder="For example: make it shorter · funnier, for children · more on the early years · write it again from scratch"></textarea></label>${span.html}<div class="vo-re"><small>Uses one of today’s requests.</small><button type="submit" class="big">Rewrite</button></div>
        <ol>${has.lines.map(lineEl).join('')}</ol></div>
      <div class="exf"><span class="ex-say"><span>${has.lines.length} lines. Made on your device; changing the voice is free.</span></span><button type="button" class="big" data-close>Close</button><button type="button" class="big pri" data-revoice>Use <span data-vname></span></button></div></form>`
      : `<form class="vo-form va">
      <div class="vo-head"><h2>Choose a voice</h2><p class="dlg-sub">It tells ${esc(row.title || 'this timeline')} while it plays: an opening, a line for each entry${byId.size ? ` (${byId.size})` : ''}, and a closing.${row.own ? '' : ' Kept in this browser, for you alone.'}</p></div>
      <div class="vo-body"><div class="vo-voices cards" role="radiogroup" aria-label="Voice">${kok.map((v) => voiceEl(v, 'card')).join('')}</div>
        ${voiceEl(dev, 'row dev')}
        <label class="vo-guide"><span>How should it be told? <small>Optional</small></span><textarea name="guide" rows="2" maxlength="400" placeholder="For example: for children, in short lines · light and funny · in more detail">${esc(has?.guide || '')}</textarea></label>${span.html}${notes}</div>
      <div class="exf"><span class="ex-say"><span>Uses one of today's requests.</span></span><button type="button" class="big" data-close>Cancel</button><button type="submit" class="big pri">Generate with <span data-vname></span></button></div></form>`, 'vodlg ' + (has ? 'vb' : 'va'));
    const nameIt = () => { const n = d.querySelector('[data-vname]'); if (n) n.textContent = voiceLabel(d.querySelector('input[name=voice]:checked')?.value || DEFAULT_VOICE); };
    nameIt(); d.addEventListener('change', nameIt); span.wire(d);
    // The voice starts downloading as the dialog opens, and the dialog says how far it has come. Where the
    // graphics card can make it, the faster voice is used and shown ticked; the reader can untick it.
    const pick = () => d.querySelector('input[name=voice]:checked')?.value || DEFAULT_VOICE;
    const sp = app.speaker(), gp = d.querySelector('.vo-gpu'), slow = d.querySelector('.vo-slow');
    const drawSlow = () => { slow.hidden = !isSlow(); };
    // "This device" downloads nothing: the model is fetched only once a Kokoro voice is picked.
    let gpuFine = false;
    const kokoro = () => pick() !== 'device';
    const drawPick = () => { gp.hidden = !gpuFine || !kokoro(); if (kokoro()) sp.warm(); };
    gpuOk().then((ok) => { gpuFine = ok; gp.querySelector('input').checked = sp.gpu(); drawPick(); });
    gp.querySelector('input').addEventListener('change', (e) => { sp.engine(e.target.checked); drawSlow(); sp.warm(); });
    d.addEventListener('change', (e) => { if (e.target.name === 'voice') drawPick(); });
    const ld = d.querySelector('.vo-load'), tick = setInterval(() => {
      if (!d.isConnected) return clearInterval(tick);
      const l = kokoro() ? app.voiceLoad() : null;
      ld.hidden = !l;
      drawSlow(); slow.hidden ||= !kokoro(); gp.querySelector('input').checked = sp.gpu();
      if (l) ld.innerHTML = `<span>${l.part >= 0.95 ? 'Getting the voice ready' : `Downloading the ${sp.gpu() ? 'faster ' : ''}voice, first time only`}</span><b>${Math.round(l.part * 100)}% of ${l.mb} MB</b><i><u style="width: ${Math.round(l.part * 100)}%"></u></i>`;
    }, 250);
    const err = d.querySelector('.dlg-err');
    d.addEventListener('click', (e) => { const b = e.target.closest('[data-sample]'); if (b) { e.preventDefault(); e.stopPropagation(); err.textContent = ''; app.audio(); sampleOf(b, (m) => { err.textContent = m; }, has && has.lines.length ? has.lines.map((l) => l.text) : ''); } });
    d.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const v = pick(); keepVoice(v); closeLayer(); if (!user) return signIn('Sign in to generate a voiceover. Writing the script uses one of your requests for the day.'); voiceover(row, v, d.querySelector('[name=guide]')?.value.trim().slice(0, 400) || '', span.get(), has?.lines || null); });
    d.querySelector('[data-revoice]')?.addEventListener('click', () => { const v = pick(); keepVoice(v); closeLayer(); revoice(row, v); });
    d.querySelector('[data-unvoice]')?.addEventListener('click', () => { closeLayer(); ask({ title: 'Delete this voiceover?', text: 'Its script is deleted. The timeline itself stays as it is.', ok: 'Delete', danger: true }).then(() => { closeLayer(); unvoice(row); }); });
  }
  // Export video (site/export.js): one press makes the file in this browser; the pill at the top right says how
  // far it has come and the timeline can be used meanwhile (asked for, Nov 2026: three files to choose from).
  // The shape of the film (asked for, Nov 2026: "the first important thing is the format"), with where each is watched.
  const SHAPES = [
    ['wide', 'Landscape', '16:9', 'YouTube, a screen', 16, 9],
    ['tall', 'Vertical', '9:16', 'Shorts, Reels, TikTok', 9, 16],
    ['square', 'Square', '1:1', 'A feed', 1, 1],
  ];
  const SCENES = [
    ['globe', 'Default', 'As play shows it: the globe from place to place, the stars where there is none', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/></svg>'],
    ['full', 'Full view', 'Every card large, among the stars', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 15h8M10 9.5h4"/></svg>'],
  ];
  // 240p is the quick test (the smallest and so the fastest; 480p was first) (asked for, Nov 2026, in place of 4K and 8K): small and fast, to check a film before the real one.
  const QUALITY = [[240, 'Quick test · 240p'], [720, '720p'], [1080, '1080p']];
  const EX_STEP = { voice: 'Making the voice', sound: 'Mixing the sound', pictures: 'Fetching the pictures', map: 'Getting the map ready', video: 'Drawing the video', saving: 'Saving the file' };
  const LOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
  // Export (asked for, Nov 2026, twice: first the choices, then "a standard UI ... like the Canva standard"):
  // the film as it will look on the left, drawn from the timeline's own first entry and following every choice;
  // the choices on the right; one button. Nothing here asks the server for anything.
  function videoMenu() {
    if (voicing) return;
    const can = app.canExport(), cur = holder(), has = !!cur && voiceOf(cur.get()), dev = has && has.voice === 'device', told = !!has && !dev;
    const first = app.first() || {}, ents = app.told()?.entries || [], all0 = ents.length;
    // It always opens on the same choices (asked for, Nov 2026): Landscape, Default, the voiceover on where there is one, 1080p.
    const st = { voice: told, subs: false, shape: 'wide', scene: 'globe', short: 1080, from: 0, to: Math.max(0, all0 - 1) };
    // The part of the timeline that goes into the film (asked for, Nov 2026: the export is to have the span of
    // period the timeline has): it opens on what the timeline shows, and From and To cut it shorter by entry.
    // It is chosen as the years are on the timeline (asked for): a strip with two handles, under the picture
    // at the left, with a line that says from where to where.
    const bars = Array.from({ length: Math.min(all0, 60) }, () => '<i></i>').join('');
    const sw = (name, label, hint) => `<div class="ex-opt"><span><b>${label}</b><small data-hint="${name}">${hint}</small></span><button type="button" class="ex-tog" role="switch" data-sw="${name}" aria-label="${label}"><i></i></button></div>`;
    const d = modal(`<form class="ex">
      <div class="ex-prev" aria-hidden="true">
        <div class="ex-stage"><div class="ex-frame">
          <i class="ex-globe"><u></u></i>
          <span class="ex-title">${esc(cur?.title || 'Timeline')}</span><span class="ex-year">${esc(first.mark || '')}</span>
          <div class="ex-card">${first.img ? `<span class="ex-img" style="background-image: url('${esc(first.img)}')"></span>` : ''}<small>${esc(first.kind || 'Entry')}</small><b>${esc(first.name || 'The first entry')}</b><i></i><i></i></div>
          <span class="ex-line">The line being said is written here</span>
          <span class="ex-bar"><u></u></span>
        </div></div>
        <p class="ex-meta"></p>
        ${all0 > 1 ? `<div class="ex-span" aria-hidden="false"><div class="ex-span-h"><b>Period</b><span class="ex-snote"></span></div>
          <div class="yearbar ex-yb"><div class="ex-hist">${bars}</div><input type="range" data-span="from" min="0" max="${all0 - 1}" step="1" aria-label="First entry"><input type="range" data-span="to" min="0" max="${all0 - 1}" step="1" aria-label="Last entry"></div>
          <div class="ex-ends"><span data-end="from"></span><span data-end="to"></span></div></div>` : ''}
      </div>
      <div class="ex-side">
        <h2>Export</h2>
        <div class="ex-video">
          <h3>Format</h3>
          <div class="ex-shapes" role="radiogroup" aria-label="Format">${SHAPES.map(([k, name, ratio, where, w, h]) => `<button type="button" role="radio" class="ex-tile" data-shape="${k}" title="${where}"><span class="ex-fr"><i style="aspect-ratio: ${w} / ${h}; ${w >= h ? 'width: 30px' : 'height: 30px'}"></i></span><b>${name}</b><small>${ratio}</small></button>`).join('')}</div>
          <h3>Scene</h3>
          <div class="ex-scenes" role="radiogroup" aria-label="Scene">${SCENES.map(([k, name, w, icon]) => `<button type="button" role="radio" class="ex-tile row" data-scene="${k}">${icon}<span><b>${name}</b><small>${w}</small></span></button>`).join('')}</div>
          <h3>Sound and text</h3>
          ${sw('voice', 'Voiceover', '')}
          ${sw('subs', 'Subtitles', 'Each line written at the foot while it is said')}
          <h3>Quality</h3>
          <div class="ex-q" role="radiogroup" aria-label="Quality">${QUALITY.map(([n, label]) => `<button type="button" role="radio" data-short="${n}">${label}</button>`).join('')}</div>
          <p class="ex-qnote"></p>
        </div>
        <p class="dlg-err" role="alert">${!can ? 'This browser cannot make a video file. Try Chrome or Edge.' : ''}</p>
      </div>
      <div class="exf"><i class="ex-run"><u></u></i>
        <span class="ex-say">${LOCK}<span>Made on your device. Nothing is uploaded.</span></span>
        <button type="button" class="big" data-ex-cancel>Cancel</button><button type="submit" class="big pri"${can ? '' : ' disabled'}>Export video</button>
      </div></form>`, 'exdlg');
    const q = (x) => d.querySelector(x), all = (x) => d.querySelectorAll(x);
    let busy = false, asking = false;
    function show() {
      const audio = false, voiceOn = st.voice && told, subsOn = voiceOn && st.subs, count = st.to - st.from + 1;
      if (q('.ex-span')) {
        q('[data-span=from]').value = st.from; q('[data-span=to]').value = st.to;
        const a = ents[st.from], b = ents[st.to], yb = q('.ex-yb'), n = all0 - 1, hs = all('.ex-hist i');
        yb.style.setProperty('--lo', (st.from / n * 100) + '%'); yb.style.setProperty('--hi', (st.to / n * 100) + '%');
        hs.forEach((el, k) => { const at = hs.length > 1 ? k / (hs.length - 1) * n : 0; el.classList.toggle('off', at < st.from - 0.5 || at > st.to + 0.5); });
        q('.ex-snote').textContent = `${a.mark || ''}${a.mark && b.mark && a.mark !== b.mark ? ' to ' + b.mark : ''} · ${count === all0 ? `all ${all0} entries` : `${count} of ${all0} entries`}`;
        q('[data-end=from]').textContent = a.name; q('[data-end=to]').textContent = b.name;
      }
      all('[data-shape]').forEach((b) => b.setAttribute('aria-checked', b.dataset.shape === st.shape));
      all('[data-scene]').forEach((b) => b.setAttribute('aria-checked', b.dataset.scene === st.scene));
      all('[data-short]').forEach((b) => b.setAttribute('aria-checked', Number(b.dataset.short) === st.short));
      const v = q('[data-sw=voice]'), sb = q('[data-sw=subs]');
      v.setAttribute('aria-checked', voiceOn); v.disabled = !told;
      q('[data-hint=voice]').textContent = told ? `Told by ${voiceLabel(has.voice)}, with the music soft under it` : dev ? 'The voice of This device cannot be saved. Choose another voice first.' : 'This timeline has no voiceover yet. Generate one first.';
      sb.setAttribute('aria-checked', subsOn); sb.disabled = !voiceOn;
      const f = q('.ex-frame'); f.dataset.shape = st.shape; f.dataset.scene = st.scene; f.classList.toggle('subs', subsOn);
      const [, , , , w, h] = SHAPES.find(([k]) => k === st.shape), k = st.short / Math.min(w, h), secs = count * (voiceOn || audio ? 9 : 4.2);
      const long = secs < 90 ? `about ${Math.max(5, Math.round(secs / 5) * 5)} seconds` : `about ${Math.round(secs / 60)} minutes`;
      q('.ex-meta').innerHTML = audio ? `<b>WAV</b> · the voice alone · ${long}` : `<b>${Math.round(w * k)} × ${Math.round(h * k)}</b> · MP4 · ${long}`;
      q('.ex-qnote').textContent = st.short === 240 ? 'The smallest and fastest: for checking the film before the real export.' : st.short === 720 ? '720p is quicker to make than 1080p.' : '';
      // What this device's encoder cannot make at this shape is not offered.
      const shape = st.shape;
      // Where the device's graphics hardware makes the film, the foot says so (asked for, Nov 2026).
      const short = st.short;
      app.canFast(shape, short).then((fast) => { if (!d.isConnected || busy || st.shape !== shape || st.short !== short) return; q('.ex-say span').textContent = fast ? 'Made on your device, sped up by its graphics hardware. Nothing is uploaded.' : 'Made on your device. Nothing is uploaded.'; q('.ex-say').classList.toggle('fast', !!fast); });
      for (const [n] of QUALITY) app.canSize(shape, n).then((ok) => { if (!d.isConnected || st.shape !== shape) return; const b = q(`[data-short="${n}"]`); b.disabled = !ok; b.title = ok ? '' : 'This device cannot make a video of this size'; if (!ok && st.short === n) { st.short = 1080; show(); } });
    }
    show();
    d.addEventListener('click', (e) => {
      // The left button of the foot: Cancel before the export, then the way to stop it.
      if (e.target.closest('[data-ex-cancel]')) {
        if (!(busy && voicing)) { closeLayer(); return; }
        // Stopping is asked once more first (asked for, Nov 2026): the export goes on meanwhile.
        if (!asking) { asking = true; d.querySelector('form').classList.add('asking'); q('.ex-say span').textContent = 'Stop the export? What is made so far is lost.'; q('[data-ex-cancel]').textContent = 'Yes, stop'; q('button[type=submit]').textContent = 'Keep exporting'; }
        else { asking = false; d.querySelector('form').classList.remove('asking'); voicing.stop = true; q('.ex-say span').textContent = 'Stopping…'; q('[data-ex-cancel]').disabled = true; q('button[type=submit]').textContent = 'Hide'; }
        return;
      }
      const b = e.target.closest('[data-shape], [data-scene], [data-short], [data-sw]');
      if (!b || b.disabled || busy) return;
      if (b.dataset.shape) st.shape = b.dataset.shape; else if (b.dataset.scene) st.scene = b.dataset.scene;
      else if (b.dataset.short) st.short = Number(b.dataset.short); else st[b.dataset.sw] = !(b.getAttribute('aria-checked') === 'true');
      show();
    });
    d.addEventListener('input', (e) => {
      const sel = e.target.closest('[data-span]'); if (!sel || busy) return;
      st[sel.dataset.span] = Number(sel.value);
      if (st.from > st.to) { if (sel.dataset.span === 'from') st.to = st.from; else st.from = st.to; }
      show();
    });
    d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy && asking) { asking = false; d.querySelector('form').classList.remove('asking'); q('[data-ex-cancel]').textContent = 'Stop'; q('button[type=submit]').textContent = 'Hide'; q('.ex-say span').textContent = voicing?.note || 'Exporting…'; return; }
      if (busy) { closeLayer(); return; }      // "Hide": the export goes on, and the pill at the top right says how far
      const voiceOn = st.voice && told, kind = voiceOn ? 'both' : 'video';
      const o = { kind, shape: st.shape, scene: st.scene, subs: voiceOn && st.subs, short: st.short, from: st.from, to: st.to };
      // The dialog stays and its foot says how far the export has come, with a line along the foot's edge
      // (asked for, Nov 2026). It can be hidden: the export goes on behind the pill at the top right.
      busy = true; d.querySelector('form').classList.add('busy');
      q('[data-ex-cancel]').textContent = 'Stop'; q('button[type=submit]').textContent = 'Hide';
      const say = (text, part) => { if (!d.isConnected) return; if (!asking) q('.ex-say span').textContent = text; q('.ex-run u').style.width = Math.round(part * 100) + '%'; };
      say('Starting…', 0);
      voicing = { key: onNow(), exporting: true, note: 'Exporting…', part: 0, open: false, stop: false };
      draw();
      let last = 0;
      try {
        const name = await app.exportVideo(o, (what, part) => {
          if (!voicing) return;
          voicing.note = `${EX_STEP[what] || 'Exporting'}${what === 'map' ? '…' : ': ' + Math.round(part * 100) + '%'}`; voicing.what = what; voicing.part = part;
          const order = ['voice', 'sound', 'pictures', 'map', 'video', 'saving'];
          if (!voicing.stop) say(`Step ${order.indexOf(what) + 1} of ${order.length} · ${voicing.note}`, part);
          if (Date.now() - last > 250) { last = Date.now(); draw(); }
        }, () => !voicing || voicing.stop);
        exported(name);
      } catch (x) {
        if (x.message !== 'stopped') toast(x.message || 'The export could not be made.');
      } finally { voicing = null; if (d.isConnected && busy) closeLayer(); draw(true); }
    });
  }
  // When the film is saved a note stands at the top right until the reader closes it (asked for, Nov 2026: a
  // toast was gone before anyone looked): what was downloaded, and a cross.
  function exported(name) {
    let n = $('ex-done');
    if (!n) { n = document.createElement('div'); n.id = 'ex-done'; n.setAttribute('role', 'status'); document.body.appendChild(n); n.addEventListener('click', (e) => { if (e.target.closest('button')) n.remove(); }); }
    n.innerHTML = `<span class="ok" aria-hidden="true">✓</span><span class="tx"><b>Video downloaded</b><small>${esc(name)} is in your downloads.</small></span><button type="button" aria-label="Close" title="Close">×</button>`;
  }
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
          profile = { ...profile, username: un.value.trim().toLowerCase() };
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
    const on = app.views(), cur = current(), key = [user?.id, profile?.username, listed, on.join(), list.map((t) => t.id + t.title + t.visibility).join(), cur?.visibility, voicing?.note, voicing?.open, cur && cur.text.includes('"voice":{')].join('|');
    if (!force && key === drawn) return;
    drawn = key;
    // "Create timeline" stands first under "Your timelines", as a lit button so it is seen (asked for, Nov 2026).
    const NEW = `<button id="sb-new" class="nv${document.body.classList.contains('creating') ? ' on' : ''}" type="button" title="Create a timeline">${ICON.plus}<span class="lbl">Create timeline</span></button>`;
    $('sb-list').innerHTML = !user
      ? `<h2 class="cap">Your timelines</h2>${NEW}<p class="sb-note">Sign in to make your own timelines and keep them here.</p>`
      : `<h2 class="cap">Your timelines</h2>${NEW}${!listed ? '' : list.length ? list.map((t, i) => `<div class="sb-row${on.length === 1 && on[0] === 't/' + t.id ? ' on' : ''}"><button type="button" class="nv" data-open="${t.id}" title="${esc(t.title)}"><i class="dot" style="background: var(--p${i % 8})"></i><span class="lbl">${esc(t.title)}</span>${t.visibility === 'private' ? '<small class="lbl">Draft</small>' : ''}</button><button type="button" class="ibtn sm more" data-more="${t.id}" aria-label="More for ${esc(t.title)}">${ICON.dots}</button></div>`).join('') : '<p class="sb-note">None yet. “Create timeline” makes one from a sentence.</p>'}`;
    $('sb-foot').innerHTML = user
      ? `<button type="button" class="nv who" id="sb-me" aria-haspopup="menu"><i class="av">${esc(shown()[0].toUpperCase())}</i><span class="lbl"><b>${esc(shown())}</b><small>${esc(user.email || 'Free plan')}</small></span><span class="lbl chev">${ICON.chev}</span></button>`
      : `<button type="button" class="big" id="sb-in" title="Sign in">${ICON.login}<span class="lbl">Sign in</span></button>`;
    // Beside the search: what this timeline is, and the way to publish it.
    if (editor.isOpen() && editor.row() !== cur) editor.close();
    const editable = !!cur && !working && cur.text.includes('"spec":{');
    // One quiet button at the top right opens what can be done with the timeline; while a voiceover is
    // made it is a pill that says how far it has come, with the script under it (asked for, Nov 2026).
    const busyHere = !!voicing && voicing.key === on.join();
    $('tl-state').innerHTML = busyHere
      ? `<button type="button" class="ebtn vo-pill" id="vo-pill" aria-expanded="${voicing.open}" aria-controls="vo-panel" title="Show or hide the script"><i class="rec"></i><span>${esc(voicing.note)}</span></button>`
      : `<button type="button" class="ibtn tl-more${cur && cur.visibility !== 'private' ? ' live' : ''}" id="tl-more" aria-haspopup="menu" aria-label="This timeline: voiceover, publish, export" title="This timeline">${ICON.dots}</button>`;
    drawVoicing(busyHere);
    document.body.classList.toggle('mine', !!cur);
    const canAsk = !!cur && cur.text.includes('"spec":{');
    if ($('ask').hidden === canAsk) {
      $('ask').hidden = !canAsk;
      $('ask').innerHTML = canAsk ? `<p id="ask-status" class="cr-status" role="status"></p><div class="ask-box"><span class="ask-spark" aria-hidden="true">✦</span><textarea id="ask-q" rows="1" maxlength="600" placeholder="Ask AI for a change…" aria-label="Ask AI to change this timeline"></textarea>${modelBtn('ask-model')}<button type="submit" class="cr-go" aria-label="Send" title="Send">${SEND}</button><span class="ask-lab">Ask AI</span><button type="button" class="ask-fold" aria-label="Fold or open Ask AI" title="Fold or open"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>` : '';
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
    // The box folds to a small pill in the middle and opens again at any time (asked for, Nov 2026): the small
    // arrow at its end folds it, and a press anywhere on the pill opens it.
    $('ask').addEventListener('click', (e) => {
      const folded = document.body.classList.contains('ask-min') && !$('ask').classList.contains('open');
      if (folded) { $('ask').classList.add('open'); $('ask-q')?.focus(); }
      else if (e.target.closest('.ask-fold')) { document.body.classList.add('ask-min'); $('ask').classList.remove('open'); }
    });
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
      if (el('#tl-more')) return timelineMenu(el('#tl-more'));
      if (el('#ex-stop')) { ask({ title: 'Stop the export?', text: 'What is made so far is lost. The export goes on until you answer.', ok: 'Stop the export', danger: true }).then(() => { closeLayer(); if (voicing && voicing.exporting) { voicing.stop = true; voicing.note = 'Stopping…'; draw(); } }); return undefined; }
      if (el('#vo-pill')) { if (voicing) { voicing.open = !voicing.open; draw(); } return undefined; }
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
        const d = popover(el('#sb-me'), `<div class="me"><b>${esc(shown())}</b><small>Signed in as ${esc(user.email || shown())}</small></div>${profile?.username ? `<div class="me"><small>Publishes as</small><span>${esc(location.host)}/${esc(profile.username)}</span></div>` : ''}<hr><div class="me" id="me-ai"><small>Create with AI</small><span>&nbsp;</span><i><u></u></i></div><hr><div class="me-row"><span>Theme</span><div class="seg" role="radiogroup" aria-label="Theme"><button type="button" role="radio" data-theme-to="light">Light</button><button type="button" role="radio" data-theme-to="dark">Dark</button></div></div><hr><button type="button" class="nv out" data-act="out">${ICON.out}<span>Sign out</span></button>`, 'menu wide acct');
        // Light or dark: said as it is, and the menu stays open (asked for, Nov 2026, in place of "Switch theme").
        const themed = () => { const now = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; for (const b of d.querySelectorAll('[data-theme-to]')) b.setAttribute('aria-checked', String(b.dataset.themeTo === now)); return now; };
        themed();
        d.addEventListener('click', (x) => {
          const to = x.target.closest('[data-theme-to]')?.dataset.themeTo;
          if (to) { if (to !== themed()) $('theme').click(); themed(); return; }
          if (x.target.closest('[data-act="out"]')) { closeLayer(); signOut(); }
        });
        // How many requests are left today (asked for, Nov 2026; the line has its room from the start, since the
        // menu is placed by its height when it opens): the account's own requests of the last 24
        // hours against its allowance, the number on its own row (`profile.ai_daily`).
        api(`/rest/v1/ai_requests?select=id&created_at=gte.${new Date(Date.now() - 864e5).toISOString()}&limit=20000`).then((used) => {
          const box = d.querySelector('#me-ai'); if (!box) return;
          const most = Number.isFinite(Number(profile?.ai_daily)) ? Number(profile.ai_daily) : AI_PER_DAY, left = Math.max(0, most - (used?.length || 0));
          box.querySelector('span').textContent = `${left.toLocaleString('en-US')} of ${most.toLocaleString('en-US')} requests left today`;
          box.querySelector('u').style.width = (most ? 100 * left / most : 0) + '%';
          box.classList.toggle('none', !left);
        }).catch(() => {});
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
      // A request that failed before the page was loaded afresh: it comes back with what went wrong.
      let bad = null; try { bad = JSON.parse(sessionStorage.getItem(FAILED) || 'null'); sessionStorage.removeItem(FAILED); } catch (e) { /* fine */ }
      if (bad && !kept) { openCreate(bad.prompt || ''); fail($('cr-status'), bad); }
    } catch (e) { if (e.status === 401 || e.status === 403) signedOut(); }
  }

  return { voiceQuick, boot, start, api, ask: ask_ai, explore, searchPeople, published: () => people, payload: (id) => { const r = rowOf(id); return r ? payloadOf(r) : null; }, sync: () => draw(false), fetchView, addressOf, isMine, entryActions, signedIn: () => !!session, editing: () => editor.isOpen(), editEntry: (id) => editor.openById(id) };
}
