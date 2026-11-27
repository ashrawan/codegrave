/* marker { place, label?, style?, duration }: a mark on a place: style "pin" (default), "dot" or
   "pulse" (a dot with a ring that spreads). `place` is an entry, a place of the scene or
   { lat, lng }; `label` is written beside it. It comes in over `in` seconds (0.3) and goes over
   `out` (0.3). Options: color. An overlay. */
import { fade, colorOf, colorError, spot, spotError } from '../timeline.js';

const STYLES = ['pin', 'dot', 'pulse'];
export default {
  type: 'marker', track: 'overlay',
  validate(s, ctx) {
    const e = [];
    if (s.place == null) e.push('give "place"'); else { e.push(...spotError(s.place, ctx, 'place')); const a = spot(s.place, ctx); if (a && a.lat == null) e.push('place: a marker stands on the map; for a spot of the stage use a label'); }
    if (s.style != null && !STYLES.includes(s.style)) e.push(`style: one of ${STYLES.join(', ')}`);
    if (s.label != null && typeof s.label !== 'string') e.push('label: text');
    e.push(...colorError(s.color));
    return e;
  },
  prepare(s, { ctx, seconds, index }) {
    const P = ctx.places && typeof s.place === 'string' ? ctx.places.get(s.place) : null;
    return { at: spot(s.place, ctx), label: s.label ?? (s.label === undefined && P && s.named ? P.name : ''), style: s.style || 'pin', c: colorOf(s.color), d: seconds, in: s.in ?? 0.3, out: s.out ?? 0.3, id: `mk${index}` };
  },
  draw(u, F, D) {
    F.ov.push({ k: 'marker', id: D.id, at: D.at, label: D.label || '', style: D.style, c: D.c, o: fade(u, D.d, D.in, D.out), t: u * D.d, pop: D.in > 0 ? Math.min(1, (u * D.d) / D.in) : 1 });
  },
};
