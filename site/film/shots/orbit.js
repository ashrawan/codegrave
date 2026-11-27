/* orbit { around?, degrees, duration }: the camera turns round a place, which stays in the middle.
   `around` is an entry, a place of the scene or { lat, lng }; without it the camera turns round
   what it is looking at. `degrees` may be negative (the other way round). Options: tilt (45; how
   far the camera leans, so the turn can be seen), zoom or altitude in km, card: true to keep an
   entry's card up. From elsewhere the camera travels to the place in the first third of the shot. */
import { ease, mix, mixCam, resolve, refError, zoomOfAltitude } from '../timeline.js';

export default {
  type: 'orbit', track: 'camera',
  validate(s, ctx) {
    const e = [];
    if (s.around != null) e.push(...refError(s.around, ctx, 'around'));
    if (!Number.isFinite(s.degrees)) e.push('degrees: how far to turn, such as 90 or -180');
    if (s.tilt != null && !(s.tilt >= 0 && s.tilt <= 60)) e.push('tilt: a number from 0 to 60');
    return e;
  },
  prepare(s, { ctx, from }) {
    const R = s.around != null ? resolve(s.around, ctx, 0) : null, A = from.cam;
    const at = R && R.cam ? R.cam : A;
    const zoom = s.zoom ?? (s.altitude != null ? zoomOfAltitude(s.altitude, ctx.h, at.lat) : R && R.cam ? Math.max(R.cam.zoom, A.zoom) : A.zoom);
    const B = { lat: at.lat, lng: at.lng, zoom, bearing: A.bearing, pitch: s.tilt ?? Math.max(A.pitch, 45), shift: s.card && R && R.i >= 0 ? 1 : 0 };
    return { A, B, i: R ? R.i : -1, card: !!s.card && !!R && R.i >= 0, degrees: s.degrees, ease: s.ease || 'inOut', sp0: from.sp, dim0: from.dim };
  },
  draw(u, F, D, { ctx }) {
    const k = ease('inOut', Math.min(1, u / 0.34));
    F.cam = mixCam(D.A, D.B, k, ctx);
    F.cam.bearing = D.A.bearing + D.degrees * ease(D.ease, u);
    F.stage = 'map'; F.sp = mix(D.sp0, 0, k); F.dim = mix(D.dim0, 0, k);
    if (D.i >= 0) { F.c = D.i; F.pos = D.i; }
    F.a = D.card ? 1 : 0; F.z = 0; F.g = u; F.way = null;
  },
};
