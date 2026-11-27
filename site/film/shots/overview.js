/* overview { duration }: the camera pulls back to the whole globe, over the middle of the
   timeline's places (where a view opens on the site). No card is up. Options: zoom, lat, lng. */
import { ease, mix, mixCam } from '../timeline.js';

export default {
  type: 'overview', track: 'camera',
  validate: () => [],
  prepare(s, { ctx, from }) {
    const o = ctx.opening;
    return { A: from.cam, B: { lat: s.lat ?? o.lat, lng: s.lng ?? o.lng, zoom: s.zoom ?? o.zoom, bearing: 0, pitch: 0, shift: 0 }, ease: s.ease, sp0: from.sp, dim0: from.dim };
  },
  draw(u, F, D, { ctx }) {
    const k = ease('inOut', u);
    F.cam = mixCam(D.A, D.B, ease(D.ease, u), ctx);
    F.stage = 'map'; F.sp = mix(D.sp0, 0, k); F.dim = mix(D.dim0, 0, k);
    F.c = -1; F.a = 0; F.z = 0; F.way = null;
  },
};
