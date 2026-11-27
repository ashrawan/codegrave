/* camera { lat?, lng?, altitude? | zoom?, heading?, tilt?, duration }: the camera goes to exactly
   this view, from wherever it is. What is left out stays as it was, so { heading: 40 } only turns.
   altitude is in kilometres; zoom is the map's own number and wins when both are given. tilt runs
   from 0 (straight down) to 60. A duration of 0 cuts. No card is up. */
import { ease, mix, mixCam, zoomOfAltitude } from '../timeline.js';

const FIELDS = { lat: [-85, 85], lng: [-360, 360], altitude: [0.05, 60000], zoom: [0, 20], heading: [-720, 720], tilt: [0, 60], shift: [0, 1] };
export default {
  type: 'camera', track: 'camera',
  validate(s) {
    const e = [];
    let any = false;
    for (const [k, [lo, hi]] of Object.entries(FIELDS)) {
      if (s[k] == null) continue;
      any = true;
      if (!(Number.isFinite(s[k]) && s[k] >= lo && s[k] <= hi)) e.push(`${k}: a number from ${lo} to ${hi}`);
    }
    if (!any) e.push('give at least one of lat, lng, altitude, zoom, heading, tilt');
    return e;
  },
  prepare(s, { ctx, from }) {
    const A = from.cam, lat = s.lat ?? A.lat;
    const B = { lat, lng: s.lng ?? A.lng, zoom: s.zoom ?? (s.altitude != null ? zoomOfAltitude(s.altitude, ctx.h, lat) : A.zoom),
      bearing: s.heading ?? A.bearing, pitch: s.tilt ?? A.pitch, shift: s.shift ?? 0 };
    return { A, B, ease: s.ease, sp0: from.sp, dim0: from.dim };
  },
  draw(u, F, D, { ctx }) {
    F.cam = mixCam(D.A, D.B, ease(D.ease, u), ctx);
    const k = ease('inOut', u);
    F.stage = 'map'; F.sp = mix(D.sp0, 0, k); F.dim = mix(D.dim0, 0, k);
    F.a = 0; F.z = 0; F.way = null;
  },
};
