/* The arithmetic of the globe (globe.js), as pure functions with tests:
   how far two places are apart, the arc between them, how close the camera
   comes to a place, how long a flight takes, and when an entry with no place
   only dims the map or sends the reader out to space.
   A place is [lat, lon, level]: level says how exactly it is known. */

const RAD = Math.PI / 180, EARTH = 6371;              // km
const ROUND = 40075.017;                              // km round the equator
const TILE = 512;                                     // MapLibre's tile size: zoom 0 shows the world ROUND km wide in TILE px

// How close the camera may come to a place of each level, and no closer: a building can be
// seen from the street, a country cannot.
export const LEVELS = { spot: 14.6, city: 10.4, region: 6.2, country: 4.3, globe: 1.9 };
export const CLOSE = 13;   // the closest the camera comes for a view whose places all lie near each other
export const levelZoom = (level) => LEVELS[level] ?? LEVELS.city;

// Kilometres between two places, along the ground.
export function distance(a, b) {
  const p1 = a[0] * RAD, p2 = b[0] * RAD, dl = (b[1] - a[1]) * RAD;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

// The shortest way from a to b over the globe, as [lon, lat] points for a line. Longitudes run on
// past 180 rather than jump back, so the line does not loop round the world at the date line.
export function greatCircle(a, b, n = 64) {
  const [p1, l1] = [a[0] * RAD, a[1] * RAD], [p2, l2] = [b[0] * RAD, b[1] * RAD];
  const d = distance(a, b) / EARTH, out = [];
  if (d < 1e-6) return [[a[1], a[0]], [b[1], b[0]]];
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    let lon = Math.atan2(y, x) / RAD;
    if (out.length) { const was = out[out.length - 1][0]; while (lon - was > 180) lon -= 360; while (lon - was < -180) lon += 360; }
    out.push([lon, Math.atan2(z, Math.hypot(x, y)) / RAD]);
  }
  return out;
}

// The place a fraction `f` of the way from a to b, along the shortest way over the globe: [lat, lon].
export function between(a, b, f) {
  const d = distance(a, b) / EARTH;
  if (d < 1e-6 || f <= 0) return [a[0], a[1]];
  if (f >= 1) return [b[0], b[1]];
  const [p1, l1] = [a[0] * RAD, a[1] * RAD], [p2, l2] = [b[0] * RAD, b[1] * RAD];
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return [Math.atan2(z, Math.hypot(x, y)) / RAD, Math.atan2(y, x) / RAD];
}

// The zoom at which `km` on the ground, at latitude `lat`, is `px` pixels long.
export const zoomFor = (km, px, lat = 0) => Math.log2((ROUND * Math.max(0.2, Math.cos(lat * RAD)) * px) / (TILE * Math.max(km, 0.05)));
// The kilometres that `px` pixels show at a zoom, at latitude `lat`: zoomFor the other way round.
export const spanKm = (zoom, px, lat = 0) => (ROUND * Math.max(0.2, Math.cos(lat * RAD)) * px) / (TILE * 2 ** zoom);
// The camera tilts as it comes down: flat over the whole globe, about 55 degrees in a street.
export function pitchFor(zoom) {
  const stops = [[3, 0], [6.2, 35], [10.4, 45], [14.6, 55]];
  if (zoom <= stops[0][0]) return 0;
  for (let i = 1; i < stops.length; i++) {
    if (zoom <= stops[i][0]) { const [z0, p0] = stops[i - 1], [z1, p1] = stops[i]; return p0 + ((zoom - z0) / (z1 - z0)) * (p1 - p0); }
  }
  return 55;
}

// MapLibre draws the globe larger the nearer the middle of the picture is to a pole (its zoom is the
// zoom of the flat map there), so the widest view is found for the latitude: the globe then always
// looks the same size.
export const farAt = (far, lat) => far + Math.log2(Math.max(0.3, Math.cos(lat * RAD)));

// Where the camera stands for the entry in front. Two rules, and the farther wins: how exactly the
// place is known (its level), and keeping the place the reader comes from in sight, so near places
// are a short glide and only far ones pull back to the globe. `size` is the shorter side of the
// stage in pixels; `far` the widest the stage goes (the whole globe).
export function cameraFor(cur, prev, size, far = LEVELS.globe) {
  let zoom = levelZoom(cur[2]);
  if (prev) {
    const km = distance(prev, cur);
    if (km > 0.5) zoom = Math.min(zoom, zoomFor(km, 0.36 * size, cur[0]));
  }
  zoom = Math.max(farAt(far, cur[0]), Math.min(zoom, LEVELS.spot));
  return { center: [cur[1], cur[0]], zoom, pitch: pitchFor(zoom) };
}

// The first look at a view: every place of it in the frame. The middle of the places is found on
// the sphere, not by averaging degrees, so places either side of the date line stay together.
export function opening(places, size, far = LEVELS.globe) {
  if (!places.length) return { center: [0, 20], zoom: farAt(far, 20), pitch: 0 };
  let x = 0, y = 0, z = 0;
  for (const p of places) { x += Math.cos(p[0] * RAD) * Math.cos(p[1] * RAD); y += Math.cos(p[0] * RAD) * Math.sin(p[1] * RAD); z += Math.sin(p[0] * RAD); }
  const mid = Math.hypot(x, y, z) < 1e-9 ? [20, 0] : [Math.atan2(z, Math.hypot(x, y)) / RAD, Math.atan2(y, x) / RAD];
  const reach = Math.max(...places.map((p) => distance(mid, p)));
  // `fit` is the zoom that just frames them all, however close that is: a view of one town is told from over
  // that town (CLOSE), not from over the whole globe.
  const fit = Math.min(CLOSE, zoomFor(reach, 0.36 * size, mid[0]));
  const zoom = Math.max(farAt(far, mid[0]), Math.min(LEVELS.city, fit));
  return { center: [mid[1], mid[0]], zoom, fit, pitch: pitchFor(zoom) };
}

// Seconds a flight takes: a glide next door is short, a flight across the world is not long either.
export const flightSeconds = (km) => 0.8 + 1.7 * Math.min(1, km / 8000);

// What the stage does for the entry in front. `placed` says of each entry in play order whether it
// has a place. With a place, the map. Without: out to space when most of the view has no place or
// the entry stands in a run of RUN or more without one; else the map only steps back and dims,
// since flying out and back for one card would tire.
export const RUN = 5, MOSTLY = 0.6;
export function stageFor(placed, i) {
  if (i < 0 || i >= placed.length) return placed.some(Boolean) ? 'map' : 'space';
  if (placed[i]) return 'map';
  const none = placed.filter((p) => !p).length;
  if (none >= MOSTLY * placed.length) return 'space';
  let a = i, b = i;
  while (a > 0 && !placed[a - 1]) a--;
  while (b < placed.length - 1 && !placed[b + 1]) b++;
  return b - a + 1 >= RUN ? 'space' : 'dim';
}

// "28.2° N, 177.4° W"
export const coords = (p) => `${Math.abs(p[0]).toFixed(1)}° ${p[0] >= 0 ? 'N' : 'S'}, ${Math.abs(p[1]).toFixed(1)}° ${p[1] >= 0 ? 'E' : 'W'}`;
