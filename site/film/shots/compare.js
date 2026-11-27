/* compare { region, onto, duration }: a country's outline lifted off the map and carried over the
   globe onto another place, at its true size: the way to see how large it really is. `region` is
   a country by name or code, or a region of the scene; `onto` is a place (an entry, a place of the
   scene, { lat, lng }) or another region, whose middle is meant. The outline travels for `travel`
   seconds (40% of the shot, at most 2.5) and then stands; it goes over `out` (0.4). Options:
   color, opacity (0.4), ghost: false to leave no faint outline where it came from. An overlay. */
import { ease, fade, colorOf, colorError, spot, clamp01 } from '../timeline.js';
import { middle, carry, thin } from '../geo.js';

const target = (v, ctx) => { const R = typeof v === 'string' ? ctx.region(v) : null; if (R) return middle(R.geometry); const a = spot(v, ctx); return a && a.lat != null ? [a.lat, a.lng] : null; };
export default {
  type: 'compare', track: 'overlay',
  validate(s, ctx) {
    const e = [];
    if (s.region == null || !ctx.region(s.region)) e.push(`region: nothing called "${s.region}" (a country by name or code, or a region of the scene)`);
    if (s.onto == null || !target(s.onto, ctx)) e.push('onto: a place (an entry, a place of the scene, { lat, lng }) or another region');
    e.push(...colorError(s.color));
    return e;
  },
  prepare(s, { ctx, seconds, index }) {
    const R = ctx.region(s.region), g = thin(R.geometry);
    return { g, key: R.key, from: middle(R.geometry), to: target(s.onto, ctx), c: colorOf(s.color ?? R.color, '#3e8bff'), o: clamp01(s.opacity ?? 0.4), ghost: s.ghost !== false,
      d: seconds, travel: Math.min(seconds, s.travel ?? Math.min(2.5, 0.4 * seconds)), in: s.in ?? 0.3, out: s.out ?? 0.4, ease: s.ease || 'inOut', id: `cp${index}` };
  },
  draw(u, F, D) {
    const e = D.travel > 0 ? ease(D.ease, clamp01((u * D.d) / D.travel)) : 1, f = fade(u, D.d, D.in, D.out);
    if (D.ghost) F.ov.push({ k: 'region', id: D.id + 'g', key: D.key, c: D.c, o: 0, lo: 0.45 * f, w: 1, dash: true });
    F.ov.push({ k: 'shape', id: D.id, geometry: carry(D.g, D.from, D.to, e), sig: `${D.id}:${Math.round(e * 4000)}`, c: D.c, o: D.o * f, lo: f, w: 2 });
  },
};
