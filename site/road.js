/* The road: the timeline drawn in depth. Time runs into the screen on a
   straight scale towards one vanishing point, and each view is a lane.
   This file is the arithmetic only, as pure functions with tests: the
   projection, where each line runs across its lane, which names are shown,
   and the years along the edge. app.js draws what these return. */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Distance is counted in years ahead of the reader (u). D is the focal length
// in years: something D years ahead is drawn at half size.
export const NEAR = -0.42, GONE = -0.16, FAR = 10.8;   // in focal lengths: the edge of the screen behind the reader, where a name lets go, the horizon
export const FULL = 0.64, SMALL = 0.3;                  // the size from which a name is a full card, and from which it is a small card
export const CARD_MIN = 0.7;                            // a full card is never drawn smaller than this, so it can be read from where it first shows
export const sizeAt = (u, D) => D / (D + u);

// A step from the 1, 2, 5 series that is at least v.
export function step125(v) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1e-9))));
  for (const k of [1, 2, 5, 10]) if (k * p >= v - 1e-9) return k * p;
  return 10 * p;
}

// The focal length, in years, for a set of starts between tMin and tMax: long
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
export function stageOf(SW, SH) {
  const phone = SW < 700;
  const vx = phone ? SW * 0.43 : SW / 2, vy = Math.round(SH * (phone ? 0.13 : 0.07)), by = SH - (phone ? 8 : 12);
  const RW = phone ? SW * 0.385 : Math.min(SW * 0.4, 640);
  const short = SH < 430, ks = short ? 0.84 : clamp(SH / (phone ? 560 : 620), 0.8, 1);
  return { SW, SH, phone, vx, vy, by, gh: by - vy, RW, short, ks, FW: phone ? 216 : 288, NW: phone ? 200 : 244 };
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

// Which names are shown. `cands` come best first: { key, end, s, gx, gy, m, lean }.
// Each takes the biggest form its distance allows that fits. Near cards may
// overlap a little, as things do in depth; smaller names never touch
// anything, and one that would is left out. The small ones are capped.
export function placeLabels(cands, G, caps = {}) {
  const maxSmall = caps.small ?? (G.phone ? 5 : 10), maxTags = caps.tags ?? (G.phone ? 3 : 6);
  const taken = [], out = new Map();
  let small = 0, tags = 0;
  const blocked = (r) => {
    if (r.y1 < 4 || r.y0 > G.SH) return true;
    for (const a of taken) {
      const both = r.big && a.big, m = both ? 0 : 5;
      const ox = Math.min(r.x1, a.x1) - Math.max(r.x0, a.x0) + m, oy = Math.min(r.y1, a.y1) - Math.max(r.y0, a.y0) + m;
      if (ox > 0 && oy > 0 && (!both || ox * oy > 0.1 * Math.min(r.area, a.area))) return true;
    }
    return false;
  };
  for (const c of cands) {
    for (const mode of modesOf(c.end, zoneOf(c.s))) {
      const isSmall = mode === 'compact' || mode === 'endc';
      if ((isSmall && small >= maxSmall) || (mode === 'tag' && tags >= maxTags)) continue;
      const r = labelRect(mode, c.s, c.gx, c.gy, c.m, G, c.lean);
      if (blocked(r)) continue;
      taken.push(r); out.set(c.key, r);
      if (mode === 'tag') tags++; else if (isSmall) small++;
      break;
    }
  }
  return out;
}

// The years along the edge of the road, nearest first. Every `unit` years
// there may be a tick; a year is written where there is room for it, at a
// round step that grows with distance. Years are written years (no year 0);
// `at` is where each sits on the number line. `fsOf(s)` is the size of the
// writing at scale s, in pixels, and gh the height of the ground.
export function ruler({ t, dir, D, tMin, tMax, gh, fsOf }) {
  const unit = Math.max(1, step125(D / 8));
  const lineOf = (y) => (y < 0 ? y + 1 : y);
  const from = dir > 0 ? Math.max(tMin, t + NEAR * D) : Math.max(tMin, t - FAR * D);
  const to = dir > 0 ? Math.min(tMax, t + FAR * D) : Math.min(tMax, t - NEAR * D);
  const n0 = Math.ceil((from - 1) / unit), n1 = Math.floor((to + 1) / unit);
  const out = [];
  let lastY = Infinity;
  for (let i = 0; i <= n1 - n0; i++) {
    const y = (dir > 0 ? n0 + i : n1 - i) * unit;
    if (y === 0) continue;
    const at = lineOf(y);
    if (at < tMin || at > tMax) continue;
    const u = dir * (at - t);
    if (u <= NEAR * D || u >= FAR * D) continue;
    const s = sizeAt(u, D), gap = gh * Math.abs(s - sizeAt(u + unit, D)), yy = gh * s, fs = fsOf(s);
    // The smallest round step, a multiple of the unit, whose years are far enough apart to read.
    let step = step125((fs * 1.5 * unit) / Math.max(gap, 1e-9));
    while (step % unit) step = step125(step * 1.01);
    step = Math.max(step, unit);
    const five = y % (unit * 5) === 0;
    if (y % step === 0 && lastY - yy >= fs * 1.3) { out.push({ y, at, s, fs, step, label: true, major: true }); lastY = yy; }
    else if (gap >= 3 || five) out.push({ y, at, s, fs, step, label: false, major: five });
  }
  return out;
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

// Taking turns. Where things begin close together their cards would cover one
// another, and the one behind would pass without ever being shown. So while
// play travels, every start is owed a moment as a full card. A card that is up
// keeps its place for a few seconds (less the more wait behind it); then it
// gives way to one it was hiding, and those come nearest first, in the order
// things happened. Play does not stop for them: it slows early, by as much as
// the cards in front still need, so that each has had its turn by the time
// the reader reaches it (HOLD_AT focal lengths short of it), and it never
// travels slower than CRAWL.
export const DWELL = 2.3, DWELL_BUSY = 1.6, DWELL_CROWD = 1.2, HOLD_AT = 0.03, CRAWL = 0.035;
export const dwellFor = (waiting) => (waiting > 5 ? DWELL_CROWD : waiting > 2 ? DWELL_BUSY : DWELL);
// The most play may travel, in focal lengths a second. `owed` are the starts
// still owed their turn: { ahead (focal lengths), up (its card is up), left
// (the seconds it still needs) }. Cards that are up spend their time together;
// those that wait follow one after another, nearest first. With nothing owed
// there is no limit.
export function turnPace(owed) {
  const line = [...owed].sort((a, b) => a.ahead - b.ahead);
  let together = 0, queue = 0, pace = Infinity;
  for (const c of line) if (c.up) together = Math.max(together, c.left);
  for (const c of line) {
    const need = c.up ? c.left : together + (queue += Math.max(0, c.left));
    if (need > 0) pace = Math.min(pace, Math.max(0, c.ahead - HOLD_AT) / need);
  }
  return Math.max(CRAWL, pace);
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
