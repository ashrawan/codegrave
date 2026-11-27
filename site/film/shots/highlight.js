/* highlight { region, color?, pulse?, duration }: a region lit on the map: a country by its name
   or two-letter code ("Japan", "JP"), or a region of the scene by its id. `pulse: true` makes it
   breathe. It comes in over `in` seconds (0.4) and goes over `out` (0.4). Options: opacity (0.45),
   outline: false for no edge. An overlay: it shows during the camera shot listed before it. */
import { fade, colorOf, colorError, clamp01 } from '../timeline.js';

export default {
  type: 'highlight', track: 'overlay',
  validate(s, ctx) {
    const e = [];
    if (s.region == null || !ctx.region(s.region)) e.push(s.region == null ? 'give "region": a country by name or code, or a region of the scene' : `region: nothing called "${s.region}" (a country's name as manifest() lists it, its two-letter code, or a region of the scene)`);
    e.push(...colorError(s.color));
    return e;
  },
  prepare(s, { ctx, seconds, index }) {
    const R = ctx.region(s.region);
    return { key: R.key, c: colorOf(s.color ?? R.color), pulse: !!s.pulse, d: seconds, in: s.in ?? 0.4, out: s.out ?? 0.4, o: clamp01(s.opacity ?? 0.45), line: s.outline !== false, id: `hl${index}` };
  },
  draw(u, F, D) {
    const f = fade(u, D.d, D.in, D.out), beat = D.pulse ? 0.72 + 0.28 * Math.sin((u * D.d * 2 * Math.PI) / 1.4) : 1;
    F.ov.push({ k: 'region', id: D.id, key: D.key, c: D.c, o: D.o * f * beat, lo: D.line ? f : 0, w: 1.6 });
  },
};
