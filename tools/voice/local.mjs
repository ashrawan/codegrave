// Makes the sound of every default voiceover that the store does not have yet in its current words, on this
// computer only, with several runs of tools/voice/make.mjs side by side (each keeps to a share of the cores).
// Nothing is uploaded: the MP3s stay under tools/voice/out, the timings go into the voices files, and the last
// lines printed say what was made. tools/voice/mac.sh runs it.
//
//   node tools/voice/local.mjs                    as many runs as suits this computer
//   node tools/voice/local.mjs --workers 6 --threads 2
//   node tools/voice/local.mjs dinosaurs japan    only these views
import { readFileSync, readdirSync, mkdirSync, createWriteStream, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { cpus } from 'node:os';
import { versionOf } from './version.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = join(root, 'data/community/wiki/voices');
const out = join(root, 'tools/voice/out');
const REST = 'https://wwgmelafchslapxiccot.supabase.co/rest/v1/view_voices?owner=eq.wiki&select=view,audio';
const ANON = 'sb_publishable_IykysSfgNLw4CfaqxP2CqA_YNcfq0SW';
const voice = 'af_heart';
const args = process.argv.slice(2);
const opt = (name, d) => (args.includes(name) ? +args[args.indexOf(name) + 1] : d);
const only = args.filter((a, i) => !a.startsWith('--') && !String(args[i - 1]).startsWith('--'));
const cores = cpus().length;
const THREADS = opt('--threads', 2), WORKERS = opt('--workers', Math.max(1, Math.floor(cores / THREADS)));

mkdirSync(join(out, 'logs'), { recursive: true });
const log = createWriteStream(join(out, 'logs', 'run-' + new Date().toISOString().replace(/[:.]/g, '-') + '.log'));
const say = (...a) => { const s = a.join(' '); console.log(s); log.write(s + '\n'); };

const done = async () => {
  try {
    const r = await fetch(REST, { headers: { apikey: ANON } });
    return new Map((await r.json()).filter((x) => x.audio).map((x) => [x.view, x.audio.v]));
  } catch (e) { return new Map(); }
};
const words = (id) => JSON.parse(readFileSync(join(dir, id + '.json'), 'utf8'));
const have = await done();
const all = (only.length ? only : readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort());
// Longest first, so the runs end together.
const queue = all.map((id) => ({ id, n: words(id).lines.length }))
  .filter((x) => {
    if (only.length) return true;
    const w = words(x.id), v = versionOf(voice, w.lines);
    // Done already: in the store, or made here by an earlier run (its timings in the file, its MP3 in out/).
    return have.get(x.id) !== v && !(w.audio?.v === v && existsSync(join(out, 'wiki', x.id, voice, v, 'voice.mp3')));
  })
  .sort((a, b) => b.n - a.n);
const lines = queue.reduce((s, x) => s + x.n, 0);
say(`${cores} cores: ${WORKERS} runs side by side, ${THREADS} threads each`);
say(`${queue.length} views to make (${lines} lines); ${all.length - queue.length} already done`);
if (!queue.length) { say('nothing to make'); process.exit(0); }

say('getting the voice model ready (about 330 MB the first time)');
execFileSync('node', [join(root, 'tools/voice/make.mjs'), '--warm'], { stdio: 'inherit' });

const t0 = Date.now(), made = [], failed = [];
let linesDone = 0;
const mins = (ms) => Math.round(ms / 60000);
const worker = async (k) => {
  for (let x; (x = queue.shift()); ) {
    const ok = await new Promise((res) => {
      const p = spawn('node', [join(root, 'tools/voice/make.mjs'), x.id], { env: { ...process.env, VOICE_THREADS: String(THREADS) } });
      let text = '';
      p.stdout.on('data', (d) => (text += d));
      p.stderr.on('data', (d) => (text += d));
      p.on('close', (code) => { log.write(`--- ${x.id} (run ${k}, exit ${code})\n${text}\n`); res(code === 0 ? text : null); });
    });
    linesDone += x.n;
    if (ok) made.push(x.id); else failed.push(x.id);
    const left = lines - linesDone, rate = linesDone / (Date.now() - t0);
    say(`${String(made.length + failed.length).padStart(3)}/${made.length + failed.length + queue.length} ${ok ? 'made  ' : 'FAILED'} ${x.id}`
      + (ok ? ` (${(ok.match(/(\d+) s of sound/) || [])[1] || '?'} s of sound)` : '')
      + `   ${mins(Date.now() - t0)} min so far, about ${mins(left / rate)} min left`);
  }
};
await Promise.all(Array.from({ length: WORKERS }, (_, k) => worker(k + 1)));

say('');
say(`all done in ${mins(Date.now() - t0)} min: ${made.length} made, ${failed.length} failed${failed.length ? ' (' + failed.join(', ') + ')' : ''}`);
say(`folder: ${out}`);
say('Tell Claude this folder. The words with their timings are in ' + dir);
log.end();
