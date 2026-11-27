/* fly { to, from?, duration }: the camera travels to an entry or a place, along the shortest way
   over the globe, with the lit line running ahead of it. `from` cuts to a start first; without it
   the flight begins where the camera is. No card is up on the way. To an entry with no place the
   camera stays and the map gives way to the stars. Options: zoom (how close it ends), shift (0 to 1,
   room at the right for a card), trail: false (no lit line). */
import { ease, mix, mixCam, resolve, refError } from '../timeline.js';

export default {
  type: 'fly', track: 'camera',
  validate(s, ctx) {
    const e = [];
    if (s.to == null) e.push('give "to": an entry id, or { lat, lng }'); else e.push(...refError(s.to, ctx, 'to'));
    if (s.from != null) e.push(...refError(s.from, ctx, 'from'));
    return e;
  },
  prepare(s, { ctx, from, next, index }) {
    // The flight ends where the hold after it stands: beside the place when that hold has a card.
    const room = typeof s.to === 'string' && !(next && next.type === 'hold' && next.entry === s.to && next.card === false) ? 1 : 0;
    const to = resolve(s.to, ctx, s.shift ?? room), start = s.from != null ? resolve(s.from, ctx, 0) : null;
    const A = start && start.cam ? start.cam : from.cam;
    const B = to.cam ? { ...to.cam, zoom: s.zoom ?? to.cam.zoom } : { ...A };
    const stage = to.i >= 0 ? ctx.stage(to.i) : 'map', sp1 = stage === 'space' ? 1 : 0;
    return { A, B, stage, c: to.i >= 0 ? to.i : from.c, pos0: start && start.i >= 0 ? start.i : from.pos, pos1: to.i >= 0 ? to.i : from.pos,
      sp0: start ? 0 : from.sp, sp1, dim0: from.dim, dim1: stage === 'dim' ? 1 : 0, fly0: from.fly, travel: from.sp > 0 || sp1 > 0 ? 1.1 : 0,
      way: to.cam && s.trail !== false ? { a: [A.lat, A.lng], b: [B.lat, B.lng], c: (to.i >= 0 && ctx.steps[to.i].rgb) || 'rgb(236,196,128)' } : null,
      d: s.duration, ease: s.ease, key: index };
  },
  draw(u, F, D, { ctx }) {
    const e = ease(D.ease, u), k = ease('inOut', u);
    F.cam = mixCam(D.A, D.B, e, ctx);
    F.c = D.c; F.a = 0; F.z = 0; F.pos = mix(D.pos0, D.pos1, e);
    F.stage = D.stage; F.sp = mix(D.sp0, D.sp1, k); F.dim = mix(D.dim0, D.dim1, k);
    F.fly = D.fly0 + D.travel * e;
    F.warp = D.d > 0 && D.travel ? Math.min(1.2, (D.travel * (ease(D.ease, u + 0.01) - ease(D.ease, u - 0.01))) / 0.02 / D.d) : 0;
    F.way = D.way ? { ...D.way, e, key: `${D.key} ${Math.round(e * 400)}` } : null;
  },
};
