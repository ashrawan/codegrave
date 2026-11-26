/* Ranking: how significant each entry is among its peers.
   Pure functions with no page or browser code, so the same file is used by
   the build, the page and the tests (tests/rank.test.mjs). See docs/DATA_RULES.md. */

// Weights of the significance score. They add up to 1.
export const WEIGHTS = { adoption: 0.35, influence: 0.25, longevity: 0.15, standard: 0.10, editor: 0.15 };

// The year a date names, as it is written: 1995 for "1995-08-16", -44 for "-0044-03-15" (44 BCE).
export function yearOf(s) {
  return Number(/^-?\d+/.exec(s)[0]);
}

// "1995", "1995-08" or "1995-08-16" as a decimal year. A bare year sits mid-year.
// A leading minus is a year before the common era, counted as historians do
// (there is no year zero), so 1 BCE sits at 0 on the number line and 44 BCE at -43.
// The same form carries deep time: "-66000000" is 66 million years back.
// A full date may carry a time of day, "2027-04-03T09:30", for a plan made by the hour.
export function parseDate(s) {
  const neg = s[0] === '-';
  const [day, time] = (neg ? s.slice(1) : s).split('T');
  const [y, m, d] = day.split('-').map(Number);
  const year = neg ? 1 - y : y;
  if (!m) return year + 0.5;
  if (!d) return year + (m - 0.5) / 12;
  const [h = 0, mi = 0] = time ? time.split(':').map(Number) : [];
  // A day is a true day of the calendar, so a road drawn in days spaces them evenly across the months.
  return year + (dayOfYear(year, m, d) + (h + mi / 60) / 24) / daysInYear(year);
}
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
// Leap years of the Gregorian calendar, carried back: `year` is on the number line (1 BCE is 0).
export const daysInYear = (year) => ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365);
// Days before the given month and day in that year, from 0.
export const dayOfYear = (year, m, d) => CUM[m - 1] + (m > 2 && daysInYear(year) === 366 ? 1 : 0) + d - 1;

// The stretch of time whose entries count as peers of one born at `born` (a
// decimal year): a decade since 1800, a century back to the year 1, a
// thousand years back to 10,000 BCE, and one bucket for everything older.
export function eraOf(born) {
  const y = Math.floor(born);
  if (y >= 1800) { const d = Math.floor(y / 10) * 10; return { key: 'd' + d, name: `the ${d}s` }; }
  if (y >= 1) { const c = Math.floor((y - 1) / 100) + 1; return { key: 'c' + c, name: `the ${ordinal(c)} century` }; }
  if (y > -10000) { const k = Math.floor(-y / 1000) + 1; return { key: 'k' + k, name: `the ${ordinal(k)} millennium BCE` }; }
  return { key: 'deep', name: 'prehistory' };
}
function ordinal(n) {
  const t = n % 100, u = n % 10;
  return n + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th');
}

// Expects each entry to carry `born`, `end` (or null), `inbound` (links
// pointing at it) and `cat` (its kind record: name, domain, domainName and
// `from`, the words that join it to an era, such as "born in"). Adds `parts`,
// `score`, `era`, `rank` (0 is best), `topPct` and `peers`.
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
    t.era = eraOf(t.born);
  }
  // Rank against peers: same kind and era. Small groups widen (to the kind,
  // then its branch of the map, then everything) so a lone entry is not
  // automatically "top of its class".
  const groups = new Map();
  const add = (key, t) => { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t); };
  for (const t of things) { add(t.category + '|' + t.era.key, t); add(t.category, t); if (t.cat.domain) add('@' + t.cat.domain, t); add('*', t); }
  for (const t of things) {
    let key = t.category + '|' + t.era.key, peers = `${t.cat.name.toLowerCase()} ${t.cat.from || 'first released in'} ${t.era.name}`;
    if (groups.get(key).length < 5) { key = t.category; peers = `all ${t.cat.name.toLowerCase()}`; }
    if (groups.get(key).length < 5 && t.cat.domain) { key = '@' + t.cat.domain; peers = `everything in ${t.cat.domainName || t.cat.domain}`; }
    if (groups.get(key).length < 5) { key = '*'; peers = 'everything on the timeline'; }
    const g = groups.get(key);
    if (!g.pos) { g.sort((a, b) => b.score - a.score); g.pos = new Map(g.map((x, i) => [x, i])); }   // sorted once per group
    const idx = g.pos.get(t);
    t.rank = (idx / g.length) * 100;                  // 0 is best; shown if below the level
    t.topPct = Math.max(1, Math.ceil(((idx + 1) / g.length) * 100));
    t.peers = peers;
  }
}
