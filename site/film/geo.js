/* Film mode: shapes on the sphere, as pure functions with tests. A shape is GeoJSON geometry
   (Polygon or MultiPolygon, [lng, lat]); a place is [lat, lng]. Nothing here knows the page. */
const RAD = Math.PI / 180;
const vec = (lat, lng) => [Math.cos(lat * RAD) * Math.cos(lng * RAD), Math.cos(lat * RAD) * Math.sin(lng * RAD), Math.sin(lat * RAD)];
const unvec = (v) => [Math.atan2(v[2], Math.hypot(v[0], v[1])) / RAD, Math.atan2(v[1], v[0]) / RAD];
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

// The middle of a shape: of its corners on the sphere, so a country across the date line has its middle on land.
export function middle(g) {
  let x = 0, y = 0, z = 0;
  for (const p of polys(g)) for (const [lng, lat] of p[0]) { const v = vec(lat, lng); x += v[0]; y += v[1]; z += v[2]; }
  return Math.hypot(x, y, z) < 1e-9 ? [0, 0] : unvec([x, y, z]);
}

// The shape carried over the globe so that the place `from` comes to `to`, a part `e` of the way: turned about
// the axis through both, which keeps its true size and form wherever it lands (a flat map would stretch it).
export function carry(g, from, to, e = 1) {
  const a = vec(from[0], from[1]), b = vec(to[0], to[1]);
  let k = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const n = Math.hypot(k[0], k[1], k[2]), dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  if (n < 1e-9 || e === 0) return g;
  k = k.map((v) => v / n);
  const th = Math.acos(dot) * e, c = Math.cos(th), s = Math.sin(th);
  const turn = ([lng, lat]) => {
    const v = vec(lat, lng), kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    const out = unvec([0, 1, 2].map((i) => v[i] * c + (k[(i + 1) % 3] * v[(i + 2) % 3] - k[(i + 2) % 3] * v[(i + 1) % 3]) * s + k[i] * kv * (1 - c)));
    return [out[1], out[0]];
  };
  // Longitudes run on past 180 rather than jump back, so an edge never loops round the world.
  const ring = (r) => { const out = []; for (const p of r) { const q = turn(p); if (out.length) { const was = out[out.length - 1][0]; while (q[0] - was > 180) q[0] -= 360; while (q[0] - was < -180) q[0] += 360; } out.push([Math.round(q[0] * 1e5) / 1e5, Math.round(q[1] * 1e5) / 1e5]); } return out; };
  const out = polys(g).map((p) => p.map(ring));
  return g.type === 'Polygon' ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
}

// A shape with fewer corners, for one that is redrawn every frame: every n-th corner of a long ring.
export function thin(g, most = 1500) {
  const count = polys(g).reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0), step = Math.ceil(count / most);
  if (step <= 1) return g;
  const ring = (r) => (r.length < 12 ? r : r.filter((_, i) => i % step === 0 || i === r.length - 1));
  const out = polys(g).map((p) => p.map(ring)).filter((p) => p[0].length >= 4);
  return g.type === 'Polygon' ? { type: 'Polygon', coordinates: out[0] || g.coordinates } : { type: 'MultiPolygon', coordinates: out };
}

// A line through places along the shortest ways over the globe: [lng, lat] points, with how far along each is (0 to 1).
export function path(points, greatCircle, distance) {
  const coords = [], at = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], d = distance(a, b), n = Math.max(2, Math.min(96, Math.round(d / 60)));
    const seg = greatCircle(a, b, n);
    seg.forEach((p, k) => {
      if (i && !k) return;
      if (coords.length) { const was = coords[coords.length - 1][0]; while (p[0] - was > 180) p[0] -= 360; while (p[0] - was < -180) p[0] += 360; }
      coords.push(p); at.push(total + (d * k) / n);
    });
    total += d;
  }
  return { coords, at: at.map((v) => (total > 0 ? v / total : 0)), km: total };
}
// The part of such a line up to `e` (0 to 1), and its tip with the point just before it.
export function upTo(line, e) {
  const { coords, at } = line;
  if (e >= 1) return { coords, tip: coords[coords.length - 1], before: coords[coords.length - 2] || coords[0] };
  if (e <= 0) return { coords: [], tip: coords[0], before: coords[0] };
  let i = 1;
  while (i < at.length - 1 && at[i] < e) i++;
  const f = (e - at[i - 1]) / Math.max(1e-9, at[i] - at[i - 1]), A = coords[i - 1], B = coords[i];
  const tip = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
  return { coords: [...coords.slice(0, i), tip], tip, before: A };
}

// Whether a place lies inside a shape (holes are outside).
export function inside(g, lat, lng) {
  const inRing = (r) => { let on = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) on = !on; } return on; };
  return polys(g).some((p) => inRing(p[0]) && !p.slice(1).some(inRing));
}
