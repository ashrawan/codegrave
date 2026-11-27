/* Film mode: the gate. This small file is all a link with ?film=1 fetches until its key is proved.
   The key stands after "#" (#k=<key>), so it never reaches a server's log, and it is taken out of
   the address at once. The function "film-auth" checks it and answers with a short-lived token;
   without one this returns false and the page starts as it always does. The account signed in in
   this browser goes with the key: the token is good for what that account may read and, later, for
   generating on that account's own allowance. With nobody signed in, only public timelines open. Nothing here is secret:
   the code is public, and what is protected (private timelines, the generator) is protected by the
   server asking for that token. docs/FILM_MODE.md has the whole story. */
export const AUTH = 'https://wwgmelafchslapxiccot.supabase.co/functions/v1/film-auth';

export default async function boot(kit) {
  const m = /(?:^#|&)k=([^&]+)/.exec(location.hash);
  if (!m) return false;
  history.replaceState(null, '', location.pathname + location.search);
  let auth = null;
  try {
    const r = await fetch(AUTH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: decodeURIComponent(m[1]), user: await kit.token().catch(() => null) }) });
    if (r.ok) auth = await r.json();
  } catch (e) { /* no answer is a no */ }
  if (!auth || !auth.token) return false;
  const { startFilm } = await import('./film.js');
  startFilm(kit, auth);
  return true;
}
