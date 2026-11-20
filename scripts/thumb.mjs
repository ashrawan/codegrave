// A view's thumbnail, made once at build time so the page never draws one
// from the whole dataset. A view may name its own picture (`image`); every
// other view gets a miniature of its timeline: its few most-documented
// things as short lines on the view's own span of years.
//
// The result is two SVG paths in a 64 by 40 box, one for the lines that are
// still running and one for those that ended, so the page can draw them in
// one element each and colour them with CSS.
//
// Other kinds of view (a tree of links, for example) can get their own
// miniature here later; the page only needs { live, dead } or { image }.

export const THUMB_W = 64, THUMB_H = 40;
const LINES = 10;

// spans: [{ born, end, weight }] with whole or fractional years, end null if alive.
export function timelineThumb(spans, nowYear) {
  const picked = [...spans].sort((a, b) => b.weight - a.weight || a.born - b.born).slice(0, LINES)
    .sort((a, b) => a.born - b.born || (a.end ?? nowYear) - (b.end ?? nowYear));
  if (!picked.length) return { live: '', dead: '' };
  const from = Math.min(...picked.map((s) => s.born)) - 1, to = nowYear + 1;
  const x = (y) => +(3 + ((y - from) / (to - from)) * (THUMB_W - 6)).toFixed(1);
  const gap = Math.min(3.6, (THUMB_H - 8) / Math.max(1, picked.length - 1));
  const top = (THUMB_H - gap * (picked.length - 1)) / 2;
  let live = '', dead = '';
  picked.forEach((s, i) => {
    const y = +(top + i * gap).toFixed(1);
    const a = x(s.born), b = Math.max(x(s.end ?? nowYear), a + 1.5);
    const d = `M${a} ${y}H${b}`;
    if (s.end == null) live += d; else dead += d;
  });
  return { live, dead };
}
