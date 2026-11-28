// Writes the default voiceover of built timelines: the words only, one file per view under
// data/community/<owner>/voices/<view>.json, which the build puts into the view's own file
// (docs/VIEWS.md). The words are written by the same model, with the same instructions, as a
// voiceover made on the page (supabase/functions/voiceover/index.ts).
//
//   OPENROUTER_API_KEY=... node scripts/voices.mjs                 every wiki view that has none yet
//   OPENROUTER_API_KEY=... node scripts/voices.mjs dinosaurs japan  only these
//   ... --again        write those that have one again
//   ... --owner <name> another community folder than wiki
//   VOICE_ADMIN_KEY=... node scripts/voices.mjs   the same, written by the function `voiceover` (editors' key)
//
// Run `node scripts/build.mjs` first: the entries are read from site/data/, as the page shows them.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDate, yearOf } from '../site/rank.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const again = args.includes('--again');
const owner = args.includes('--owner') ? args[args.indexOf('--owner') + 1] : 'wiki';
const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--owner');
const key = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.VOICE_SCRIPT_MODEL || 'deepseek/deepseek-v4.1-flash';
const PART = 40, AT_ONCE = 4;

// The instructions are the function's own, read from its file so there is one copy.
const fn = readFileSync(join(root, 'supabase/functions/voiceover/index.ts'), 'utf8');
const WRITE = fn.slice(fn.indexOf('const WRITE = `') + 15, fn.indexOf('`;', fn.indexOf('const WRITE = `')));

const clean = (s) => String(s ?? '').replace(/[<>*_#`"“”]/g, '').replace(/\s+/g, ' ').trim().slice(0, 320);
// A year as people say it: deep time in round words, so the writer never reads out a long number.
const yr = (d) => {
  const y = yearOf(d), a = -y;
  if (a >= 1e9) return `${+(a / 1e9).toFixed(1)} billion years ago`;
  if (a >= 1e6) return `${+(a / 1e6).toFixed(a < 1e7 ? 1 : 0)} million years ago`;
  if (a >= 1e4) return `${Math.round(a / 1e3)} thousand years ago`;
  return y < 0 ? `${a} BCE` : String(y);
};
// The entries in the order play meets them: by when they began, the better ranked first.
export function toldOf(file) {
  const when = (e, type) => e.events?.find((x) => x.type === type)?.date;
  return file.entries.filter((e) => when(e, 'born'))
    .map((e) => ({ e, t: parseDate(when(e, 'born')) }))
    .sort((a, b) => (a.t - b.t) || ((a.e.rank ?? 0) - (b.e.rank ?? 0)))
    .map(({ e }) => {
      const born = when(e, 'born'), end = when(e, 'ended');
      const name = e.names?.[e.names.length - 1]?.name || e.name || e.id;
      return { id: e.id, name, when: end ? `${yr(born)} to ${yr(end)}` : yr(born), summary: String(e.summary || '').slice(0, 320) };
    });
}

async function part(view, entries, k, n, total, before) {
  const where = n === 1 ? '' : `\nThis is part ${k + 1} of ${n} of one long timeline of ${total} entries. Write the lines for these ${entries.length} entries only, so that the parts read as one story.${k > 0 ? ` The entry just before this part was "${before}"; pick up from there, with no new opening: answer "intro" with an empty string.` : ''}${k < n - 1 ? ' The story goes on after this part: answer "outro" with an empty string.' : ''}\n`;
  const user = `Today is ${new Date().toISOString().slice(0, 10)}.\n\nThe timeline: ${view.name}\n${view.description ? 'About it: ' + view.description + '\n' : ''}${where}\nIts ${entries.length} entries, in the order they play:\n` + entries.map((e, i) => `${i + 1}. ${e.name} (${e.when})${e.summary ? ': ' + e.summary : ''}`).join('\n');
  for (let go = 0; go < 3; go++) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://codegrave.com', 'X-Title': 'codegrave' },
        body: JSON.stringify({ model: MODEL, max_tokens: 8000, response_format: { type: 'json_object' }, reasoning: { enabled: false }, messages: [{ role: 'system', content: WRITE }, { role: 'user', content: user }] }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!r.ok) { console.error('  ', view.id, 'part', k + 1, r.status); continue; }
      const text = String((await r.json()).choices?.[0]?.message?.content ?? '');
      const got = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      if (Array.isArray(got.lines) && got.lines.length >= entries.length * 0.8) return got;
    } catch (e) { console.error('  ', view.id, 'part', k + 1, String(e.message || e)); }
  }
  return null;
}

// With an editors' key instead of a model key, the function `voiceover` writes it: the same writer and the
// same instructions as a voiceover made on the page, and the model key stays on the server.
const admin = process.env.VOICE_ADMIN_KEY;
const FN = process.env.VOICE_URL || 'https://wwgmelafchslapxiccot.supabase.co/functions/v1/voiceover';
async function viaFunction(view, entries) {
  for (let go = 0; go < 3; go++) {
    try {
      const r = await fetch(FN, { method: 'POST', headers: { 'x-admin-key': admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ script: { title: view.name, description: view.description || '', entries } }), signal: AbortSignal.timeout(300_000) });
      if (r.ok) return r.json();
      console.error('  ', view.id, r.status, (await r.text()).slice(0, 200));
    } catch (e) { console.error('  ', view.id, String(e.message || e)); }
  }
  return null;
}

async function write(id) {
  const file = JSON.parse(readFileSync(join(root, 'site/data/v', owner, id + '.json'), 'utf8'));
  const entries = toldOf(file);
  if (!entries.length) return console.log('nothing to tell:', id);
  if (admin) {
    const got = await viaFunction(file.view, entries);
    if (!got?.lines?.length) return console.error('FAILED:', id);
    const lines = got.lines.map((l) => ({ id: l.id, text: clean(l.text) })).filter((l) => l.text);
    const out = join(root, 'data/community', owner, 'voices', id + '.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, '{\n  "style": ' + JSON.stringify(String(got.style || '').slice(0, 80)) + ',\n  "lines": [\n' + lines.map((l) => `    { "id": ${JSON.stringify(l.id)}, "text": ${JSON.stringify(l.text)} }`).join(',\n') + '\n  ]\n}\n');
    return console.log('wrote', id, lines.length, 'lines');
  }
  const parts = [];
  for (let i = 0; i < entries.length; i += PART) parts.push(entries.slice(i, i + PART));
  const wrote = await Promise.all(parts.map((p, k) => part(file.view, p, k, parts.length, entries.length, k ? entries[k * PART - 1].name : '')));
  if (wrote.some((g) => !g)) return console.error('FAILED:', id);
  const lines = [
    { id: 'intro', text: clean(wrote[0].intro) },
    ...entries.map((e, i) => ({ id: e.id, text: clean(wrote[Math.floor(i / PART)].lines[i % PART]) || e.name + '.' })),
    { id: 'outro', text: clean(wrote[wrote.length - 1].outro) },
  ].filter((l) => l.text);
  const out = join(root, 'data/community', owner, 'voices', id + '.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ style: String(wrote[0].style || '').slice(0, 80), lines }, null, 2) + '\n');
  console.log('wrote', id, lines.length, 'lines');
}

if (import.meta.url === 'file://' + process.argv[1]) {
  if (!key && !admin) { console.error('Set OPENROUTER_API_KEY, or VOICE_ADMIN_KEY to write through the function.'); process.exit(1); }
  const dir = join(root, 'site/data/v', owner);
  if (!existsSync(dir)) { console.error('Run node scripts/build.mjs first.'); process.exit(1); }
  const have = (id) => existsSync(join(root, 'data/community', owner, 'voices', id + '.json'));
  const views = existsSync(join(root, 'data/community', owner, 'views')) ? readdirSync(join(root, 'data/community', owner, 'views')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
  const todo = (only.length ? only : views).filter((id) => views.includes(id) && (again || only.length || !have(id)) && (again || !have(id) || only.length));
  console.log(todo.length, 'to write');
  for (let i = 0; i < todo.length; i += AT_ONCE) await Promise.all(todo.slice(i, i + AT_ONCE).map((id) => write(id).catch((e) => console.error('FAILED:', id, e.message))));
}
