/* Film mode: the gate. This small file is all a link with ?film=1 fetches until the account is known.
   Film mode is for the account signed in in this browser, and only when that account has been
   switched on for it (`film` on its row, which no account can write itself). Otherwise this
   returns false and the page starts as it always does. Nothing here is secret and nothing here is
   a lock: film mode runs in the reader's own browser, as that account, and reads and makes only
   what that account may anyway. docs/FILM_MODE.md has the whole story. */
export default async function boot(kit) {
  let id = '';
  try { id = JSON.parse(localStorage.getItem('cg-session')).user.id; } catch (e) { /* nobody is signed in */ }
  if (!/^[0-9a-f-]{36}$/.test(id)) return false;
  const row = await kit.api(`/rest/v1/profiles?id=eq.${id}&select=film`).catch(() => null);
  if (!(row && row[0] && row[0].film === true)) return false;
  const { startFilm } = await import('./film.js');
  startFilm(kit);
  return true;
}
