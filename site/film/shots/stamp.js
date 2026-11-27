/* stamp { text, place? | x?, y?, angle?, duration }: a rubber stamp that hits the stage, for a
   comic beat: it lands large and settles in a fifth of a second, then stands. On a place it
   travels with the map; with x and y (0 to 1) it stands still (the middle when neither is given).
   `angle` is in degrees (-8). It goes over `out` seconds (0.25). Options: color (red), size. An
   overlay. */
import { colorOf, colorError, spot, spotError, clamp01 } from '../timeline.js';

export default {
  type: 'stamp', track: 'overlay',
  validate(s, ctx) {
    const e = [];
    if (typeof s.text !== 'string' || !s.text) e.push('give "text"');
    if (s.place != null) e.push(...spotError(s.place, ctx, 'place'));
    if (s.angle != null && !Number.isFinite(s.angle)) e.push('angle: degrees');
    e.push(...colorError(s.color));
    return e;
  },
  prepare(s, { ctx, seconds, index }) {
    return { at: spot(s.place != null ? s.place : { x: s.x ?? 0.5, y: s.y ?? 0.5 }, ctx), text: s.text, angle: s.angle ?? -8, c: colorOf(s.color, '#e5484d'), size: s.size ?? 1, d: seconds, out: s.out ?? 0.25, id: `st${index}` };
  },
  draw(u, F, D) {
    const t = u * D.d, hit = clamp01(t / 0.2), back = hit < 1 ? 0 : Math.exp(-(t - 0.2) * 14) * Math.sin((t - 0.2) * 38) * 0.05;
    const o = Math.min(clamp01(t / 0.07), D.out > 0 ? clamp01((D.d - t) / D.out) : 1);
    F.ov.push({ k: 'stamp', id: D.id, at: D.at, text: D.text, angle: D.angle, c: D.c, size: D.size, o, s: 1 + 1.6 * (1 - hit) ** 3 + back });
  },
};
