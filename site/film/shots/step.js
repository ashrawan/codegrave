/* step { entries, durations }: steps through cards the way the arrow keys do on the site: the
   camera travels to each entry and stops, and its card stands for the rest of that entry's time.
   `durations` is one number for all, or one per entry (from the voice timings); each is the whole
   time an entry has, travel included. `travel` is the most seconds a move takes (1.4), never more
   than 45% of the entry's time. Options: card, picture, in, out, as on hold. */
import { copy, rest, endOf, refError } from '../timeline.js';
import fly from './fly.js';
import hold from './hold.js';

const durs = (s) => (Array.isArray(s.durations) ? s.durations : (s.entries || []).map(() => s.durations));
export default {
  type: 'step', track: 'camera',
  duration: (s) => (Array.isArray(s.entries) && s.entries.length ? durs(s).reduce((a, b) => a + b, 0) : NaN),
  validate(s, ctx) {
    const e = [];
    if (!Array.isArray(s.entries) || !s.entries.length) return ['entries: give a list of entry ids'];
    s.entries.forEach((id, k) => { if (typeof id !== 'string') e.push(`entries[${k}]: give an entry id`); else e.push(...refError(id, ctx, `entries[${k}]`)); });
    const d = durs(s);
    if (Array.isArray(s.durations) && d.length !== s.entries.length) e.push(`durations: ${d.length} given for ${s.entries.length} entries`);
    else if (!d.every((v) => Number.isFinite(v) && v > 0)) e.push('durations: seconds for each entry (one number, or one per entry), more than 0');
    e.push(...hold.validate({ ...s, entry: undefined }, ctx));
    return e;
  },
  prepare(s, { ctx, from, prev, next, index }) {
    const subs = [], d = durs(s);
    let F = from, at = 0, before = prev;
    const add = (plugin, shot, nextShot) => {
      const env = { ctx, from: F, prev: before, next: nextShot, index: `${index}.${subs.length}` }, data = plugin.prepare(shot, env);
      subs.push({ plugin, shot, data, env, from: F, start: at, end: at + shot.duration });
      F = endOf(plugin, data, F, env); at += shot.duration; before = shot;
    };
    s.entries.forEach((id, k) => {
      const there = F.c === ctx.index.get(id);
      const travel = there ? 0 : Math.min(s.travel ?? 1.4, 0.45 * d[k]);
      const stay = { type: 'hold', entry: id, duration: d[k] - travel, card: s.card, picture: s.picture, in: s.in, out: s.out };
      if (travel > 0) add(fly, { type: 'fly', to: id, duration: travel, ease: s.ease }, stay);
      add(hold, stay, k === s.entries.length - 1 ? next : null);
    });
    return { subs, total: at };
  },
  draw(u, F, D) {
    const t = u * D.total, sub = D.subs.find((x) => t < x.end) || D.subs[D.subs.length - 1];
    Object.assign(F, rest(copy(sub.from)));
    sub.plugin.draw(sub.end > sub.start ? Math.min(1, (t - sub.start) / (sub.end - sub.start)) : 1, F, sub.data, sub.env);
  },
  // When each entry's card comes up, for lining up captions.
  cues: (it) => it.data.subs.filter((x) => x.plugin === hold).map((x) => ({ entry: x.shot.entry, start: it.start + x.start, end: it.start + x.end })),
};
