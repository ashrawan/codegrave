/* hold { entry?, card?, picture?, duration }: the camera rests on an entry while its card stands
   beside it. card: false holds the place with no card; picture: false shows the card without its
   picture. With no entry the camera simply stays where it is. The card comes in over `in` seconds
   (0.45) and goes over `out` (0.4); a hold of the same entry straight after keeps it up. An entry
   with no place is told among the stars, or over a dimmed map, as on the site. Options: zoom. */
import { ease, mix, clamp01, resolve, refError } from '../timeline.js';

export default {
  type: 'hold', track: 'camera',
  validate(s, ctx) {
    const e = [];
    if (s.entry != null) { if (typeof s.entry !== 'string') e.push('entry: give an entry id'); else e.push(...refError(s.entry, ctx, 'entry')); }
    for (const k of ['card', 'picture']) if (s[k] != null && typeof s[k] !== 'boolean') e.push(`${k}: true or false`);
    for (const k of ['in', 'out']) if (s[k] != null && !(Number.isFinite(s[k]) && s[k] >= 0)) e.push(`${k}: seconds, 0 or more`);
    return e;
  },
  prepare(s, { ctx, from, prev, next }) {
    const card = s.entry != null && s.card !== false, R = s.entry != null ? resolve(s.entry, ctx, card ? 1 : 0) : null;
    const i = R ? R.i : -1, cam = R && R.cam ? { ...R.cam, zoom: s.zoom ?? R.cam.zoom } : { ...from.cam };
    const stage = i >= 0 ? ctx.stage(i) : from.stage;
    const same = (o) => !!o && o.type === 'hold' && o.entry === s.entry && o.card !== false;
    return { i, cam, card, nopic: s.picture === false, stage, sp0: from.sp, sp1: stage === 'space' ? 1 : 0, dim0: from.dim, dim1: stage === 'dim' ? 1 : 0,
      fly0: from.fly, d: s.duration, in: card && same(prev) ? 0 : s.in ?? 0.45, out: card && same(next) ? 0 : s.out ?? 0.4 };
  },
  draw(u, F, D) {
    const t = u * D.d, k = ease('inOut', D.d > 0 ? t / Math.min(0.8, D.d / 2) : 1);
    F.cam = { ...D.cam };
    if (D.i >= 0) { F.c = D.i; F.pos = D.i; }
    F.stage = D.stage; F.sp = mix(D.sp0, D.sp1, k); F.dim = mix(D.dim0, D.dim1, k);
    F.a = !D.card ? 0 : D.in > 0 ? clamp01(t / D.in) : 1;
    F.z = D.card && D.out > 0 ? clamp01((t - (D.d - D.out)) / D.out) : 0;
    F.g = u; F.nopic = D.nopic;
    F.fly = D.fly0 + (D.sp1 ? 0.03 * t : 0); F.warp = D.sp1 ? 0.03 : 0;
    F.way = null;
  },
};
