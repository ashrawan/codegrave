/* Ranking: how significant each thing is among its peers.
   Pure functions with no page or browser code, so the same file is used by
   the page and by the tests (tests/rank.test.mjs). See docs/DATA_RULES.md. */

// Weights of the significance score. They add up to 1.
export const WEIGHTS = { adoption: 0.35, influence: 0.25, longevity: 0.15, standard: 0.10, editor: 0.15 };

// "1995", "1995-08" or "1995-08-16" as a decimal year. A bare year sits mid-year.
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  if (!m) return y + 0.5;
  if (!d) return y + (m - 0.5) / 12;
  return y + (m - 1) / 12 + (d - 1) / 365.25;
}

// Expects each thing to carry `born`, `end` (or null), `inbound` (links
// pointing at it) and `cat` (its category record). Adds `parts`, `score`,
// `decade`, `rank` (0 is best), `topPct` and `peers`.
export function score(things, NOW) {
  for (const t of things) {
    const s = t.signals || {};
    const parts = {
      adoption: ((s.adoption ?? 3) - 1) / 4,
      influence: Math.min(1, t.inbound.length / 5),
      longevity: Math.min(1, ((t.end ?? NOW) - t.born) / 40),
      standard: s.standard ? 1 : 0,
      editor: ((s.editor ?? 0) + 2) / 4,
    };
    t.parts = parts;
    t.score = Object.keys(WEIGHTS).reduce((sum, k) => sum + WEIGHTS[k] * parts[k], 0);
    t.decade = Math.floor(t.born / 10) * 10;
  }
  // Rank against peers: same category and decade. Small groups widen so a
  // lone entry is not automatically "top of its class".
  const groups = new Map();
  const add = (key, t) => { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t); };
  for (const t of things) { add(t.category + '|' + t.decade, t); add(t.category, t); add('*', t); }
  for (const t of things) {
    let key = t.category + '|' + t.decade, peers = `${t.cat.name.toLowerCase()} first released in the ${t.decade}s`;
    if (groups.get(key).length < 5) { key = t.category; peers = `all ${t.cat.name.toLowerCase()}`; }
    if (groups.get(key).length < 5) { key = '*'; peers = 'everything on the timeline'; }
    const g = groups.get(key);
    if (!g.sorted) { g.sort((a, b) => b.score - a.score); g.sorted = true; }
    const idx = g.indexOf(t);
    t.rank = (idx / g.length) * 100;                  // 0 is best; shown if below the level
    t.topPct = Math.max(1, Math.ceil(((idx + 1) / g.length) * 100));
    t.peers = peers;
  }
}

