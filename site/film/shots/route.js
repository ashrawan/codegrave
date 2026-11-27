/* route { route | from, to, via?, draw?, icon?, duration }: a line from place to place along the
   shortest way over the globe. `route` names a route of the scene; or give `from` and `to` (and
   `via`, a list) as entries, places of the scene or { lat, lng }. With draw: true (the default)
   the line is drawn over the shot's time, less `stay` seconds at the end for which it stands
   whole; an icon travels at its tip: "dot", "plane", "ship" or "none". It goes over `out`
   seconds (0.4). Options: color, width (3), dash: true. An overlay. */
import { greatCircle, distance } from '../../globe-path.js';
import { ease, fade, colorOf, colorError, spot, clamp01 } from '../timeline.js';
import { path, upTo } from '../geo.js';

const ICONS = ['dot', 'plane', 'ship', 'none'];
export default {
  type: 'route', track: 'overlay',
  validate(s, ctx) {
    const e = [], R = s.route != null ? ctx.route(s.route) : s;
    if (s.route != null && !R) return [`route: the scene has no route "${s.route}"`];
    const pts = [R.from, ...(Array.isArray(R.via) ? R.via : R.via != null ? [R.via] : []), R.to];
    if (R.from == null || R.to == null) e.push('give "route" (a route of the scene), or "from" and "to"');
    else pts.forEach((p, k) => { const at = spot(p, ctx); if (!at || at.lat == null) e.push(`${k === 0 ? 'from' : k === pts.length - 1 ? 'to' : 'via'}: give an entry with a place, a place of the scene, or { lat, lng }`); });
    if (s.icon != null && !ICONS.includes(s.icon)) e.push(`icon: one of ${ICONS.join(', ')}`);
    e.push(...colorError(s.color));
    return e;
  },
  prepare(s, { ctx, seconds, index, raw = s }) {
    const R = s.route != null ? ctx.route(s.route) : s, st = (R && R.style) || {};
    const pts = [R.from, ...(Array.isArray(R.via) ? R.via : R.via != null ? [R.via] : []), R.to].map((p) => { const a = spot(p, ctx); return [a.lat, a.lng]; });
    const stay = Math.min(seconds, Math.max(0, s.stay ?? 0));
    return { line: path(pts, greatCircle, distance), draw: s.draw !== false, icon: raw.icon ?? st.icon ?? s.icon ?? 'dot', c: colorOf(raw.color ?? st.color ?? s.color), w: raw.width ?? st.width ?? s.width ?? 3, dash: !!(raw.dash ?? st.dash ?? s.dash),
      d: seconds, run: Math.max(1e-6, seconds - stay), out: s.out ?? 0.4, in: s.draw === false ? s.in ?? 0.4 : 0, ease: s.ease || 'inOut', id: `rt${index}` };
  },
  draw(u, F, D) {
    const e = D.draw ? ease(D.ease, clamp01((u * D.d) / D.run)) : 1, o = fade(u, D.d, D.in, D.out), part = upTo(D.line, e);
    if (part.coords.length >= 2) F.ov.push({ k: 'route', id: D.id, coords: part.coords, c: D.c, w: D.w, dash: D.dash, o });
    if (D.icon !== 'none' && (D.draw || D.icon !== 'dot')) F.ov.push({ k: 'head', id: D.id, at: { lat: part.tip[1], lng: part.tip[0] }, before: { lat: part.before[1], lng: part.before[0] }, icon: D.icon, c: D.c, o });
  },
};
