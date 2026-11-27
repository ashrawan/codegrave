/* pushIn { place, from?, to?, duration }: a slow, even move in on a place, for suspense. `from`
   and `to` are heights in kilometres (or give fromZoom and toZoom, the map's own numbers); without
   `from` it starts at the height the camera has, without `to` it ends half as high. The camera
   cuts to the place if it is not there. Options: tilt, heading, card: true for an entry's card. */
import { ease, mix, resolve, refError, zoomOfAltitude } from '../timeline.js';

export default {
  type: 'pushIn', track: 'camera',
  validate(s, ctx) {
    const e = [];
    if (s.place == null) e.push('give "place": an entry id, a place of the scene, or { lat, lng }'); else e.push(...refError(s.place, ctx, 'place'));
    for (const k of ['from', 'to']) if (s[k] != null && !(Number.isFinite(s[k]) && s[k] > 0)) e.push(`${k}: a height in kilometres`);
    if (s.place != null && resolve(s.place, ctx) && !resolve(s.place, ctx).cam) e.push('place: this entry has no place on the map');
    return e;
  },
  prepare(s, { ctx, from }) {
    const R = resolve(s.place, ctx, s.card ? 1 : 0), at = R.cam, A = from.cam;
    const near = Math.abs(A.lat - at.lat) < 0.01 && Math.abs(A.lng - at.lng) < 0.01;
    const z0 = s.fromZoom ?? (s.from != null ? zoomOfAltitude(s.from, ctx.h, at.lat) : near ? A.zoom : at.zoom - 1);
    const z1 = s.toZoom ?? (s.to != null ? zoomOfAltitude(s.to, ctx.h, at.lat) : z0 + 1);
    return { at, z0, z1, i: R.i, card: !!s.card && R.i >= 0, bearing: s.heading ?? (near ? A.bearing : 0), pitch: s.tilt ?? (near ? A.pitch : 0), ease: s.ease || 'linear', sp0: from.sp, dim0: from.dim };
  },
  draw(u, F, D) {
    const k = ease('inOut', Math.min(1, u / 0.2));
    F.cam = { lat: D.at.lat, lng: D.at.lng, zoom: mix(D.z0, D.z1, ease(D.ease, u)), bearing: D.bearing, pitch: D.pitch, shift: D.card ? 1 : 0 };
    F.stage = 'map'; F.sp = mix(D.sp0, 0, k); F.dim = mix(D.dim0, 0, k);
    if (D.i >= 0) { F.c = D.i; F.pos = D.i; }
    F.a = D.card ? 1 : 0; F.z = 0; F.g = u; F.way = null;
  },
};
