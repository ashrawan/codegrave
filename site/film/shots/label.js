/* label { text, place? | x?, y?, style?, duration }: words on the stage. On a place (an entry, a
   place of the scene or { lat, lng }) they travel with the map; with x and y (0 to 1, from the
   left and the top) they stand still. `label` may also name a label of the scene by its id.
   style: "plain" (default), "title", "caption", "chip" or "quote". It comes in over `in` seconds
   (0.35) and goes over `out` (0.3). Options: color, size (1 is the style's own), align
   ("left", "center", "right"). An overlay. */
import { fade, colorOf, colorError, spot, spotError } from '../timeline.js';

export const LABEL_STYLES = ['plain', 'title', 'caption', 'chip', 'quote'];
const pick = (s, ctx) => (s.label != null && ctx.label ? { ...(ctx.label(s.label) || {}), ...s } : s);
export default {
  type: 'label', track: 'overlay',
  validate(s0, ctx) {
    const e = [];
    if (s0.label != null && !(ctx.label && ctx.label(s0.label))) return [`label: the scene has no label "${s0.label}"`];
    const s = pick(s0, ctx);
    if (typeof s.text !== 'string' || !s.text) e.push('give "text"');
    const at = s.place != null ? s.place : s.x != null || s.y != null ? { x: s.x, y: s.y } : null;
    if (at == null) e.push('say where: "place", or "x" and "y" from 0 to 1'); else e.push(...spotError(at, ctx, s.place != null ? 'place' : 'x, y'));
    if (s.style != null && typeof s.style === 'string' && !LABEL_STYLES.includes(s.style)) e.push(`style: one of ${LABEL_STYLES.join(', ')}`);
    e.push(...colorError(s.color));
    return e;
  },
  prepare(s0, { ctx, seconds, index }) {
    const s = pick(s0, ctx), st = s.style && typeof s.style === 'object' ? s.style : {};
    return { at: spot(s.place != null ? s.place : { x: s.x, y: s.y }, ctx), text: s.text, style: typeof s.style === 'string' ? s.style : st.name || ctx.labelStyle || 'plain', c: s.color != null || st.color != null ? colorOf(s.color ?? st.color) : '', size: s.size ?? st.size ?? 1,
      align: s.align || st.align || '', d: seconds, in: s.in ?? 0.35, out: s.out ?? 0.3, id: `lb${index}` };
  },
  draw(u, F, D) {
    const o = fade(u, D.d, D.in, D.out);
    F.ov.push({ k: 'label', id: D.id, at: D.at, text: D.text, style: D.style, c: D.c, size: D.size, align: D.align, o, rise: 1 - (D.in > 0 ? Math.min(1, (u * D.d) / D.in) : 1) });
  },
};
