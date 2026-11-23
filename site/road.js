/* The road: the timeline drawn in depth. Time runs into the screen towards
   one vanishing point, and each view is a lane. The road is not an even
   ruler: a stretch where much happens is drawn longer and an empty one
   shorter, and things that share a date stand one after another (warp), so
   the reader meets things at an even pace.
   This file is the arithmetic only, as pure functions with tests: the
   scale, the projection, where each line runs across its lane, which names
   are shown, and the years along the edge. app.js draws what these return. */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Distance is counted along the road ahead of the reader (u), in the road's own
// years: a place on the road is a number between its first year and its last,
// and `warp` says which moment lies at which place. D is the focal length in
// those years: something D ahead is drawn at half size.
export const NEAR = -0.42, GONE = -0.16, FAR = 10.8;   // in focal lengths: the edge of the screen behind the reader, where a name lets go, the horizon
export const FULL = 0.56, SMALL = 0.3;                  // the size from which a name is a full card, and from which it is a small card
export const CARD_MIN = 0.7;                            // a full card is never drawn smaller than this, so it can be read from where it first shows
export const sizeAt = (u, D) => D / (D + u);

// A step from the 1, 2, 5 series that is at least v.
export function step125(v) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1e-9))));
  for (const k of [1, 2, 5, 10]) if (k * p >= v - 1e-9) return k * p;
  return 10 * p;
}

// The scale of the road. Time does not run evenly along it. `marks` is what
// happens, as [moment, weight] pairs (a start counts 1), in the order they
// are to stand when several share a moment. A share `even` of the road
// follows the calendar, so a long quiet stretch is still longer than a short
// one; the rest is shared out by what happens, so each thing has the same
// room before it whether the one before came a day or a century earlier. A
// busy period is stretched and an empty one shrunk, and nowhere is the road
// more than 1 / (1 - even) times as crowded as on average.
// Things that share a moment do not share a spot: they stand one after
// another, each with its own room, and the calendar waits while they do.
// Nothing is given a different date by this: the whole stretch they stand on
// is that one moment.
// Returns `at`, the place of each mark; `place(moment)`, which for a moment
// several things share is where the first of them stands; and `when(place)`.
// The road runs from tMin to tMax as before, so both ends stay where they
// were, and outside them a moment is its own place.
export const EVEN = 0.25;
export function warp(marks, tMin, tMax, even = EVEN) {
  const same = (v) => v, span = tMax - tMin, at = marks.map((m) => m[0]);
  const order = marks.map((m, i) => i).filter((i) => marks[i][0] >= tMin && marks[i][0] <= tMax).sort((a, b) => marks[a][0] - marks[b][0] || a - b);
  const total = order.reduce((sum, i) => sum + marks[i][1], 0);
  if (!(span > 0) || !(total > 0)) return { place: same, when: same, at };
  // One knot for each moment: the moment, where the first thing of that moment stands, and where the last does.
  const T = [tMin], A = [tMin], B = [tMin];
  let sum = 0;
  for (const i of order) {
    const t = marks[i][0];
    sum += marks[i][1];
    const x = at[i] = Math.min(tMax, tMin + even * (t - tMin) + (1 - even) * span * (sum / total));
    if (t > T[T.length - 1]) { T.push(t); A.push(x); B.push(x); } else B[B.length - 1] = x;
  }
  if (T[T.length - 1] < tMax) { T.push(tMax); A.push(tMax); B.push(tMax); }
  // The knot at or before v, going by `by` (the moments, or the places where each moment begins).
  const knot = (by, v) => {
    let lo = 0, hi = by.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (by[mid] <= v) lo = mid; else hi = mid; }
    return lo;
  };
  const place = (t) => {
    if (!(t > tMin && t < tMax)) return t;
    const i = knot(T, t);
    return t === T[i] ? A[i] : B[i] + ((t - T[i]) / (T[i + 1] - T[i])) * (A[i + 1] - B[i]);
  };
  const when = (x) => {
    if (!(x > tMin && x < tMax)) return x;
    const i = knot(A, x);
    return x <= B[i] ? T[i] : T[i] + ((x - B[i]) / (A[i + 1] - B[i])) * (T[i + 1] - T[i]);
  };
  return { place, when, at };
}

// The focal length, in the road's years, for a set of starts (their places on
// the road) between tMin and tMax: long
// enough that the stretch in front of the reader holds about three starts in
// its nearest 0.39 focal lengths where the road is typically busy: the
// median, over the starts, of the years that three in a row take. It is never
// so short that crossing the road would take many minutes, nor so long that
// everything sits at the reader's feet.
export function focalYears(starts, tMin, tMax) {
  const span = Math.max(1e-9, tMax - tMin), n = starts.length;
  if (n < 5) return span / 6;
  const s = starts.map((t) => clamp(t, tMin, tMax)).sort((a, b) => a - b);
  const three = [];
  for (let i = 1; i < n - 1; i++) three.push(s[i + 1] - s[i - 1]);
  three.sort((a, b) => a - b);
  return clamp(three[three.length >> 1] / 0.39, span / 120, span / 6);
}

// Where each line runs across its lane, from 0 to 1. A track is used again
// once its entry has ended (and `rest` years have passed), and each new entry
// takes the free track farthest from the last few, so neighbours in time
// stand apart. `items` are { id, a, b }: b is null while it is still going.
export function tracks(items, rest = 0) {
  const es = [...items].sort((p, q) => p.a - q.a);
  const until = (e) => (e.b == null ? Infinity : e.b + rest);
  const evs = [];
  for (const e of es) { evs.push([e.a, 1]); evs.push([until(e), -1]); }
  evs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  let c = 0, most = 0;
  for (const x of evs) { c += x[1]; if (c > most) most = c; }
  const T = Math.max(most, 6), free = new Array(T).fill(-Infinity), recent = [], out = new Map();
  for (const e of es) {
    let best = -1, bs = -Infinity;
    for (let i = 0; i < T; i++) {
      if (free[i] > e.a) continue;
      let dmin = T;
      for (const r of recent) dmin = Math.min(dmin, Math.abs(r - i));
      const sc = dmin * 10 - Math.abs(i - (T - 1) / 2) * 0.01;
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best < 0) best = free.indexOf(Math.min(...free));
    free[best] = until(e);
    recent.push(best);
    if (recent.length > 3) recent.shift();
    out.set(e.id, (best + 0.5) / T);
  }
  return out;
}

// The stage: where the horizon and the foot of the road sit in a box SW by SH
// pixels, how wide the road is at the reader's feet, and how big cards are.
// On a narrow stage the road sits a little left, so the years have a margin.
// `top` is the band at the top that the page's bar may cover: the road stands below it, and so do the names.
// `shift` moves the vanishing point right (half the bar's width), so the road
// stands in the middle of the page, not of the space left of the bar (asked for, Nov 2026).
export function stageOf(SW, SH, top = 0, shift = 0) {
  const phone = SW < 700;
  const vx = (phone ? SW * 0.43 : SW / 2) + shift, vy = top + Math.round((SH - top) * (phone ? 0.17 : 0.2)), by = SH - (phone ? 8 : 12);
  const RW = phone ? SW * 0.385 : Math.min(SW * 0.4, 640);
  const short = SH - top < 430, ks = short ? 0.84 : clamp((SH - top) / (phone ? 560 : 620), 0.8, 1);
  return { SW, SH, top, phone, vx, vy, by, gh: by - vy, RW, short, ks, FW: phone ? 216 : 288, NW: phone ? 200 : 244 };
}

// How a name is drawn at each size: a start is a full card, a small card or a
// bare name; an end is a plate with its cause, or a small plate.
export const zoneOf = (s) => (s >= FULL ? 0 : s >= SMALL ? 1 : 2);
export const modesOf = (end, zone) => (end ? (zone === 0 ? ['near', 'endc'] : zone === 1 ? ['endc'] : []) : zone === 0 ? ['full', 'compact'] : zone === 1 ? ['compact', 'tag'] : ['tag']);
export const isBig = (mode) => mode === 'full' || mode === 'near';

// The box a name takes on the stage. It stands on the point (gx, gy) of the
// ground, lifted a little, and is drawn at scale k. `m` holds its sizes at
// full scale: fullH, nearH, compactW, tagW, endW. `lean` is the side of the
// road its lane is on, from -1 (the left lane) through 0 (the middle, or a
// road of one lane) to 1 (the right lane): a card on a side lane stands to
// the outer side of its point, like a flag on its pole, so the lanes' cards
// part and the road between them stays open. `ax` is where its stem meets it.
export function labelRect(mode, s, gx, gy, m, G, lean = 0) {
  let w, h, lift, k = 1;
  if (mode === 'full') { k = clamp(s, CARD_MIN, 1.3) * G.ks; w = G.FW * k; h = m.fullH * k; lift = 22 * k; }
  else if (mode === 'compact') { k = clamp(0.62 + 0.55 * s, 0.8, 1); w = m.compactW * k; h = 28 * k; lift = 8 + 14 * s; }
  else if (mode === 'tag') { w = m.tagW; h = 15; lift = 6; }
  else if (mode === 'near') { k = clamp(s, CARD_MIN, 1.3) * G.ks; w = G.NW * k; h = m.nearH * k; lift = 18 * k; }
  else { k = clamp(0.62 + 0.55 * s, 0.8, 1); w = m.endW * k; h = 26 * k; lift = 8 + 12 * s; }
  // A name stays on the stage, and a small one also stays off the years along the right edge:
  // it stands upright, so it is its top corner that must stay inside the road.
  const half = w / 2, big = isBig(mode), sTop = Math.max(0, (gy - lift - h - G.vy) / G.gh);
  const out = big ? lean * Math.max(0, half - 26 * k) : 0;
  const cx = Math.max(half + 4, Math.min(big ? G.SW - half - 4 : G.vx + G.RW * sTop - half - 3, gx + out));
  const ax = clamp(gx, cx - half + 12 * k, cx + half - 12 * k);
  return { mode, big, k, w, h, lift, cx, ax, gx, gy, x0: cx - half, x1: cx + half, y0: gy - lift - h, y1: gy - lift, area: w * h };
}

// A card opens out of its small card. While it comes up it is drawn between
// the two: at first it is the small card's box, no wider and no taller and
// standing where that stands, and then it grows into its own place. It grows
// upwards, since both stand on the same foot, and on a side lane towards its
// side of the road. `g` runs from 0 (the small card) to 1 (the card), and
// `small` and `card` are their boxes from labelRect. Returns where its foot
// stands (x, y), its scale, how tall it is drawn (h, in pixels on the screen:
// the page cuts the card to that from the top) and where its stem meets it (ax).
export function openFrom(small, card, g) {
  const e = g <= 0 ? 0 : g >= 1 ? 1 : g * g * (3 - 2 * g), k0 = Math.min(card.k, (card.k * small.w) / card.w);
  const x = small.cx + (card.cx - small.cx) * e, y = small.y1 + (card.y1 - small.y1) * e, k = k0 + (card.k - k0) * e;
  const half = ((card.w / card.k) * k) / 2, h = Math.min(card.h, small.h) + (card.h - Math.min(card.h, small.h)) * e;
  return { x, y, k, h, ax: clamp(card.gx, x - half + 12 * k, x + half - 12 * k) };
}

// Which names are shown. `cands` come best first: { key, end, s, gx, gy, m, lean, closed }.
// Each takes the biggest form its distance allows that fits. Near cards may
// overlap a little, as things do in depth; smaller names never touch
// anything, and one that would is left out. The small ones are capped.
export function placeLabels(cands, G, caps = {}) {
  const maxSmall = caps.small ?? (G.phone ? 5 : 10), maxTags = caps.tags ?? (G.phone ? 3 : 6);
  const taken = [], out = new Map();
  let small = 0, tags = 0;
  const blocked = (r) => {
    if (r.y1 < (G.top || 0) + 4 || r.y0 > G.SH) return true;
    for (const a of taken) {
      const both = r.big && a.big, m = both ? 0 : 5;
      const ox = Math.min(r.x1, a.x1) - Math.max(r.x0, a.x0) + m, oy = Math.min(r.y1, a.y1) - Math.max(r.y0, a.y0) + m;
      if (ox > 0 && oy > 0 && (!both || ox * oy > 0.1 * Math.min(r.area, a.area))) return true;
    }
    return false;
  };
  for (const c of cands) {
    for (const mode of modesOf(c.end, zoneOf(c.s))) {
      if (c.closed && isBig(mode)) continue;        // a card that has had its turn and closed stays closed
      const isSmall = mode === 'compact' || mode === 'endc';
      if ((isSmall && small >= maxSmall) || (mode === 'tag' && tags >= maxTags)) continue;
      const r = labelRect(mode, c.s, c.gx, c.gy, c.m, G, c.lean);
      // The card whose turn it is (`lead`) may overlap the others; it only has to be on the stage.
      if (c.lead && r.big ? r.y1 < (G.top || 0) + 4 || r.y0 > G.SH : blocked(r)) continue;
      taken.push(r); out.set(c.key, r);
      if (mode === 'tag') tags++; else if (isSmall) small++;
      break;
    }
  }
  return out;
}

// The years to mark along a scale that is not even. `at(y)` is where written
// year y falls, in pixels along the scale (all one way), or null when it is
// out of sight behind the reader. Every year has a grid: the roundest step it
// is a multiple of, from 1, 5, 10, 50, 100 and so on. A year is marked when
// the years next to it on its own grid are at least `tick` pixels off, and
// written when they are `room(p, q)` pixels off, the room two written years
// at p and q must keep. So round years are written first and the years
// between them follow where the scale opens up, two written years never
// touch, and a year once written stays written as it comes nearer. Where the
// scale is crowded on one side of a year only, that rule leaves a gap, so the
// marked years left over are then written wherever they still have room, the
// rounder first and in a fixed order, so the choice does not flicker as the
// reader moves. The work is bounded by what fits on the screen, whatever the
// span: a stretch too small to hold a mark is not looked into. There is no
// year 0.
export function yearMarks(from, to, at, room, tick = 4) {
  const out = [];
  const gap = (p, q) => (q == null ? Infinity : Math.abs(p - q));
  const mark = (y, step, turn = 0) => {
    if (y === 0 || y < from || y > to) return;
    const p = at(y);
    if (p == null) return;
    const a = at(y - step), b = at(y + step), ga = gap(p, a), gb = gap(p, b);
    if (Math.min(ga, gb) < tick) return;
    const label = ga >= room(p, a) && gb >= room(p, b);
    out.push({ y, step, p, turn, label, major: label || Math.min(ga, gb) >= 3 * tick });
  };
  // The years between a and a + step: a step of 10 is halved into fives, a step of 5 into ones.
  const walk = (a, step, five) => {
    const lo = Math.max(a, from), hi = Math.min(a + step, to);
    if (step <= 1 || lo >= hi) return;
    const pl = at(lo), ph = at(hi);
    if (pl != null && ph != null && Math.abs(pl - ph) < 2 * tick) return;
    const sub = five ? step / 5 : step / 2;
    for (let y = a + sub, j = 0; y < a + step; y += sub, j++) mark(y, sub, five ? [2, 0, 1, 3][j] : 0);      // of four, the middle ones first
    for (let y = a; y < a + step; y += sub) walk(y, sub, !five);
  };
  // The grid of a year: the roundest step of the series that divides it.
  const gridOf = (y) => {
    let s = 1;
    for (;;) { if (y % (s * 5)) return s; s *= 5; if (y % (s * 2)) return s; s *= 2; }
  };
  let top = 10;
  while (top < to - from) top *= 10;
  for (let a = Math.floor(from / top) * top; a <= to; a += top) { if (a) mark(a, gridOf(a)); walk(a, top, false); }
  const written = out.filter((k) => k.label);
  for (const k of out.filter((k) => !k.label).sort((a, b) => b.step - a.step || a.turn - b.turn || a.y - b.y)) {
    if (written.every((q) => Math.abs(k.p - q.p) >= room(k.p, q.p))) { k.label = k.major = true; written.push(k); }
  }
  return out;
}

// The years along the edge of the road, nearest first: a tick where there is
// room for one and the year written where there is room for that (yearMarks).
// Years are written years (no year 0); `at` is where each sits on the number
// line. `place` and `when` are the road's scale (warp); `fsOf(s)` is the size
// of the writing at scale s, in pixels, and gh the height of the ground.
export function ruler({ t, dir, D, tMin, tMax, gh, fsOf, place = (v) => v, when = (v) => v }) {
  const lineOf = (y) => (y < 0 ? y + 1 : y), written = (v) => { const y = Math.floor(v); return y <= 0 ? y - 1 : y; };
  const x0 = Math.max(tMin, dir > 0 ? t + NEAR * D : t - FAR * D), x1 = Math.min(tMax, dir > 0 ? t + FAR * D : t - NEAR * D);
  if (!(x1 > x0)) return [];
  const ahead = (y) => dir * (place(lineOf(y)) - t);
  const at = (y) => { const u = ahead(y); return u <= NEAR * D ? null : gh * sizeAt(u, D); };
  const room = (p, q) => 1.5 * fsOf(Math.max(p, q ?? 0) / gh);
  const out = [];
  for (const k of yearMarks(written(when(x0)), written(when(x1)), at, room)) {
    const line = lineOf(k.y), s = k.p / gh;
    if (line < tMin || line > tMax || ahead(k.y) >= FAR * D) continue;
    out.push({ y: k.y, at: line, s, fs: fsOf(s), step: k.step, label: k.label, major: k.major });
  }
  return out.sort((a, b) => b.s - a.s);
}

// How fast play travels, as a share of its usual speed: slower while cards
// stand in front of the reader or wait for their turn, so each can be read,
// and much quicker through years where nothing begins or ends. `within1` and
// `within3` count what begins or ends in the next one and the next three
// focal lengths.
export function paceFor(cards, within1, within3) {
  if (!within3) return 5;
  if (!within1) return 2.2;
  return 1 / (1 + 0.42 * Math.max(0, cards));
}

// Cards in play. While play travels a start is a full card exactly while it
// stands in a window ahead of the reader: it opens when it comes within
// OPEN_AT focal lengths (where a name first becomes a card) and closes when
// it is CLOSE_AT short of the reader. Distance alone decides, the same in
// every lane, so cards open in the order things happened and always at the
// same point. Cards in the window may overlap; the nearer one stands in
// front, and when it closes the next comes forward. Play slows where starts
// are close together so that each has at least MIN_FRONT seconds in front
// of its lane, and never travels slower than CRAWL.
export const OPEN_AT = 0.5, CLOSE_AT = 0.06, MIN_FRONT = 1.0, HOLD_AT = CLOSE_AT, CRAWL = 0.035;
export const inWindow = (ahead) => ahead > CLOSE_AT && ahead <= OPEN_AT;
// The most play may travel, in focal lengths a second. `lanes` holds, for
// each lane, how far ahead its starts stand (focal lengths). With no starts
// close together there is no limit.
export function windowPace(lanes) {
  let pace = Infinity;
  for (const ahead of lanes) {
    const s = ahead.filter((a) => a > CLOSE_AT && a <= OPEN_AT * 1.5).sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) pace = Math.min(pace, (s[i] - s[i - 1]) / MIN_FRONT);
  }
  return pace === Infinity ? pace : Math.max(CRAWL, pace);
}

// The order in which names are offered a place, lowest first. The open entry
// and the one under the pointer come first; then the nearest zone, starts
// before ends, what is already up before a newcomer (and a card that is up
// stays a card), then the better ranked. `turn` is set while play takes turns,
// for a name near enough to be a card: 'due' until it has had its time, then
// 'done'. A start that is due keeps its place if it is up, and otherwise waits
// in line by distance (`ahead`, in focal lengths) in front of every card that
// has had its turn. The open entry's card takes its turn like any other.
export function orderOf({ open = false, hover = false, zone = 0, end = false, up = null, score = 0, turn = null, ahead = 0 }) {
  const first = (open && turn !== 'done' ? -100 : 0) + (hover ? -50 : 0), big = isBig(up);
  if (turn === 'due' && !end) return first + (big ? -9 : 1) + clamp(ahead, 0, 1);
  return first + zone * 10 + (end ? 4 : 0) + (up ? 0 : 2) + (big ? -3 : 0) + (turn === 'done' ? 8 : 0) - score;
}
