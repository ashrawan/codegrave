/* picture { entry, index?, kenBurns?, duration }: one of an entry's pictures over the whole stage,
   whole and never cropped, moving slowly. `index` counts the entry's pictures from 0 (its own
   first, then its media and its events'); manifest() lists them. kenBurns: "in" (default), "out",
   "left", "right", "up", "down" or false for a still. It comes in over `in` seconds (0.5) and goes
   over `out` (0.4). The camera stays where it is, and no card is up. Options: back (0 to 1: how
   dark the stage behind it is, 0.86). */
import { fade, clamp01 } from '../timeline.js';

const MOVES = ['in', 'out', 'left', 'right', 'up', 'down'];
export default {
  type: 'picture', track: 'camera',
  validate(s, ctx) {
    const e = [], i = typeof s.entry === 'string' ? ctx.index.get(s.entry) : null;
    if (i == null) e.push(typeof s.entry === 'string' ? `entry: no entry "${s.entry}" in this timeline` : 'give "entry": an entry id');
    const n = s.index ?? 0;
    if (!(Number.isInteger(n) && n >= 0)) e.push('index: which picture, counted from 0');
    else if (i != null && ctx.pictures && n >= ctx.pictures(i).length) e.push(`index: "${s.entry}" has ${ctx.pictures(i).length} picture${ctx.pictures(i).length === 1 ? '' : 's'}`);
    if (s.kenBurns != null && s.kenBurns !== false && !MOVES.includes(s.kenBurns)) e.push(`kenBurns: one of ${MOVES.join(', ')}, or false`);
    return e;
  },
  prepare(s, { ctx, seconds }) {
    return { i: ctx.index.get(s.entry), n: s.index ?? 0, kb: s.kenBurns === false ? '' : s.kenBurns || 'in', d: seconds ?? s.duration, in: s.in ?? 0.5, out: s.out ?? 0.4, back: clamp01(s.back ?? 0.86) };
  },
  draw(u, F, D) {
    F.a = 0; F.z = 0; F.way = null;
    F.pic = { i: D.i, n: D.n, u, kb: D.kb, o: fade(u, D.d, D.in, D.out), back: D.back };
  },
};
