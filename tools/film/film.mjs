#!/usr/bin/env node
// The command line of film mode (docs/FILM_MODE.md): one command per job, each on a folder.
//
//   node tools/film/film.mjs login                 sign the account in once (a window opens)
//   node tools/film/film.mjs generate <folder>     a timeline from "prompt" -> timeline.json, kept private
//   node tools/film/film.mjs manifest <folder>     manifest.json (places, dates, pictures and their licences) and cues.json
//   node tools/film/film.mjs shots <folder>        shots.json written for you from the voice timings
//   node tools/film/film.mjs frames <folder>       board/: one small JPEG from the middle of every shot; --stills 3,12.5 for large PNGs
//   node tools/film/film.mjs preview <folder>      plays the film in a window as it runs, with the voice
//   node tools/film/film.mjs render <folder>       film.mov (or .mp4, or a PNG for every frame)
//   node tools/film/film.mjs make <folder>         all of it in order: generate, manifest, shots, board frames; stops for
//                                                  you to look; renders once the voice is in the folder
//   node tools/film/film.mjs jobs <folder>         make, for every folder inside, one after another
//
// A job's folder holds what you give and gets what is made:
//   film.json      the settings below, without the dashes: { "timeline": "wiki/japan", "preset": "long-explainer" }
//                  or { "prompt": "The rise and fall of the Roman Empire", "preset": "long-rise-fall" }
//   shots.json     the shots: a list, or { timeline, preset, shots }
//   scene.json     places, routes, regions and labels for this film only (optional)
//   voice.mp3      the voice for the whole film (.wav, .m4a, .aac too), or voice/01.mp3, voice/02.mp3 ... one per
//                  entry in order (named by entry id, "03-kyoto.mp3", they also say which entries), or
//                  timings.json: [seconds for each entry]
// Film mode opens for a signed-in account that has been switched on for it; there is no key.
//
// Options (each may also stand in <folder>/film.json):
//   --timeline <owner/slug>   the timeline to film: wiki/japan, <username>/<slug>, t/<id>
//   --prompt "<words>"        what generate asks for; --model, --effort; --save private (default) or none
//   --preset <name>           short-question, short-mystery, long-explainer, long-mystery, long-map-story,
//                             long-rise-fall, long-chronicle: the style, and vertical or landscape with it
//   --base <url>              the site (default: FILM_BASE, else https://codegrave.com)
//   --serve                   serve this checkout's site/ and film that instead of --base
//   --w 1920 --h 1080         the pixels of the stage (--vertical: 1080 by 1920); --dpr 2 doubles the result
//   --fps 30                  30 or 60
//   --look atlas|day|dots|night   --detail less|medium|full   --safe shorts|none
//   --bg transparent          nothing behind the globe and the cards: PNGs with alpha (or ProRes 4444)
//   --format prores|mp4|png   ProRes 422 HQ (default), a high-bitrate MP4, or a PNG for every frame
//   --out <file>              where the film goes (default: <folder>/film.mov or .mp4, or <folder>/frames/)
//   --from <s> --to <s>       only this stretch of the film
//   --stills 3,12.5           frames: these seconds as large PNGs (--still-w 3840 pixels across)
//   --voice <file>            the voice, when it is not in the folder
//   --headed                  show the browser while it works
//   --workers <n>             browsers that draw at once (on a Mac 6 by default, elsewhere 1)
//   --mock-auth               answer the account check locally: for trying things on built views, with
//                             nobody signed in and no access to anything private
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '..', '..');
class Stop extends Error {}
const fail = (msg) => { throw new Stop(msg); };
const say = (msg) => console.log('film: ' + msg);

// ---- settings: .env, the command line, <folder>/film.json
function readEnv() {
  const env = { ...process.env };
  for (const file of [join(repo, '.env'), join(here, '.env')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return env;
}
function readArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const k = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[k] = argv[++i]; else out[k] = true;
  }
  return out;
}
const readJSON = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { fail(`${file}: ${e.message}`); } };

async function playwright() {
  try { return await import('playwright'); } catch (e) { /* not installed beside this file: try the machine's own */ }
  try { return createRequire(import.meta.url)('playwright'); } catch (e) { fail('Playwright is not installed. Run: cd tools/film && npm install && npx playwright install chromium'); }
}

// Serves site/ the way the site is served (scripts/serve.mjs), on a port of its own.
function serve() {
  return new Promise((done, no) => {
    const port = 8700 + Math.floor(Math.random() * 200), child = spawn(process.execPath, [join(repo, 'scripts', 'serve.mjs'), String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
    child.on('error', no);
    child.stdout.once('data', () => done({ base: `http://localhost:${port}`, stop: () => child.kill() }));
  });
}

// ---- one job: the folder, what it holds and how it is to be filmed
const SOUND = ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'];
const presetOf = (name) => { const f = join(repo, 'site', 'film', 'presets', name + '.json'); if (!existsSync(f)) fail(`no preset "${name}" (see site/film/presets/)`); return readJSON(f); };
function jobOf(folder, args, env) {
  if (!folder) fail('give the folder of the job');
  const dir = resolve(folder), file = join(dir, 'shots.json'), cfile = join(dir, 'film.json');
  if (!existsSync(dir)) fail(`${dir} is not there`);
  const raw = existsSync(file) ? readJSON(file) : null, conf = existsSync(cfile) ? readJSON(cfile) : {};
  const o = { ...(raw && !Array.isArray(raw) ? raw : {}), ...conf, ...args };
  const n = (k, d) => (o[k] == null ? d : Number(o[k]));
  const preset = o.preset || null, tall = o.vertical || (preset && presetOf(preset).format === 'vertical' && !o.w && !o.h);
  const job = { dir, conf, shots: raw ? (Array.isArray(raw) ? raw : raw.shots) : null, auto: !!(raw && raw.auto), timeline: o.timeline || '', preset, prompt: o.prompt || '', model: o.model || null, effort: o.effort || null, save: o.save || 'private',
    scene: existsSync(join(dir, 'scene.json')) ? readJSON(join(dir, 'scene.json')) : null, base: (o.base || env.FILM_BASE || 'https://codegrave.com').replace(/\/+$/, ''),
    w: n('w', tall ? 1080 : 1920), h: n('h', tall ? 1920 : 1080), dpr: n('dpr', 1), fps: n('fps', 30), look: o.look || null, detail: o.detail || null, safe: o.safe || null, bg: o.bg || null,
    format: o.format || (o.bg === 'transparent' ? 'png' : 'prores'), from: n('from', 0), to: o.to == null ? null : Number(o.to), headed: !!o.headed,
    workers: Math.max(1, Math.min(16, Math.round(n('workers', process.platform === 'darwin' ? Math.min(6, Math.ceil(cpus().length / 2)) : 1)))), mock: !!o.mockAuth, serve: !!o.serve, out: o.out ? resolve(o.out) : null,
    stills: o.stills == null ? [] : String(o.stills).split(',').map(Number).filter(Number.isFinite), stillW: n('stillW', 3840), voice: o.voice ? resolve(o.voice) : null, entries: Array.isArray(o.entries) ? o.entries : null };
  if (raw && !Array.isArray(job.shots)) fail(`${file}: give a list of shots, or { "timeline": "...", "shots": [...] }`);
  if (!['prores', 'mp4', 'png'].includes(job.format)) fail('--format is prores, mp4 or png');
  if (job.bg && job.bg !== 'transparent') fail('--bg is transparent, or left out');
  if (job.bg === 'transparent' && job.format === 'mp4') fail('an MP4 has no see-through: with --bg transparent use --format png or prores');
  for (const k of ['w', 'h', 'dpr', 'fps', 'from']) if (!Number.isFinite(job[k])) fail(`--${k} must be a number`);
  // A vertical stage is laid out as the site lays out a phone, at half its pixels, and drawn two pixels for one.
  job.k = job.h > job.w && job.w >= 700 ? 2 : 1; job.cw = Math.round(job.w / job.k); job.ch = Math.round(job.h / job.k);
  if (!job.out) job.out = job.format === 'png' ? join(dir, 'frames') : join(dir, job.format === 'mp4' ? 'film.mp4' : 'film.mov');
  return job;
}
const need = (job, what) => {
  if (what.includes('subject') && !job.timeline && !job.scene) fail('which timeline? Give --timeline <owner/slug> (or "timeline" in film.json), a "prompt" for generate, or a scene.json');
  if (what.includes('shots') && !job.shots) fail(`${join(job.dir, 'shots.json')} is not there (film.mjs shots writes one for you)`);
};
const keep = (job, more) => { Object.assign(job.conf, more); writeFileSync(join(job.dir, 'film.json'), JSON.stringify(job.conf, null, 2) + '\n'); };
const write = (job, name, data) => { writeFileSync(join(job.dir, name), JSON.stringify(data, null, 2) + '\n'); say('wrote ' + join(job.dir, name)); };

// The voice: one file for the whole film, or one for each entry in the folder voice/.
function voiceOf(job) {
  const one = job.voice || SOUND.map((e) => join(job.dir, 'voice' + e)).find(existsSync) || null, dir = join(job.dir, 'voice');
  const parts = existsSync(dir) && statSync(dir).isDirectory() ? readdirSync(dir).filter((f) => SOUND.includes(extname(f).toLowerCase())).sort().map((f) => join(dir, f)) : [];
  return { one, parts };
}
function seconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  if (r.error || r.status) fail(`ffprobe could not read ${file} (it comes with ffmpeg: brew install ffmpeg)`);
  return Math.round(Number(r.stdout.trim()) * 1000) / 1000;
}
// How long each entry has, from timings.json or from the voice files, and which entries when the files say.
function timingsOf(job, ids) {
  const file = join(job.dir, 'timings.json'), { parts } = voiceOf(job);
  if (existsSync(file)) { const t = readJSON(file); return { durations: Array.isArray(t) ? t : t.durations, entries: (!Array.isArray(t) && t.entries) || job.entries }; }
  if (!parts.length) return { durations: null, entries: job.entries };
  const named = parts.map((f) => basename(f, extname(f)).replace(/^\d+[-_ .]*/, '')), byId = named.every((n) => ids.includes(n));
  return { durations: parts.map(seconds), entries: byId ? named : job.entries };
}

// The browser. On a Mac the full Chromium draws the globe on the graphics chip (Metal), many times faster than
// the headless shell, which draws in software; where that build is missing the shell is used.
async function launch(headless) {
  const { chromium } = await playwright();
  const args = ['--ignore-gpu-blocklist', '--enable-webgl'];
  if (process.platform === 'linux') return chromium.launch({ headless, args: [...args, '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const gpu = [...args, '--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])];
  return chromium.launch({ headless, channel: 'chromium', args: gpu }).catch(() => chromium.launch({ headless, args: gpu }));
}

// The account films are made for: `login` keeps its session in tools/film/.session.json (never committed), and
// every page opened here starts signed in with it, so film mode reads that account's own timelines and nobody
// else's private ones. The page renews a session; what it renewed is kept.
const SESSION = join(here, '.session.json'), SKEY = 'cg-session';
async function signIn(page, base) {
  if (!existsSync(SESSION)) return;
  await page.addInitScript(([k, v, origin]) => { try { if (location.origin === origin && !sessionStorage.getItem('film-in')) { localStorage.setItem(k, v); sessionStorage.setItem('film-in', '1'); } } catch (e) { /* no storage */ } }, [SKEY, readFileSync(SESSION, 'utf8'), new URL(base).origin]);
}
async function keepSession(page) {
  const now = await page.evaluate((k) => localStorage.getItem(k), SKEY).catch(() => null);
  if (now && now.includes('refresh_token') && (!existsSync(SESSION) || readFileSync(SESSION, 'utf8') !== now)) writeFileSync(SESSION, now, { mode: 0o600 });
}
// login: a window on the site; sign in there as usual and it closes by itself.
async function login(args, env) {
  const server = args.serve ? await serve() : null, base = (server ? server.base : args.base || env.FILM_BASE || 'https://codegrave.com').replace(/\/+$/, '');
  const browser = await launch(false), page = await browser.newPage();
  await page.goto(base + '/');
  console.error('film: sign in in the window that opened (Sign in, at the bottom left). It closes when you are in.');
  const got = await page.waitForFunction((k) => { try { return JSON.parse(localStorage.getItem(k)).refresh_token ? localStorage.getItem(k) : null; } catch (e) { return null; } }, SKEY, { timeout: 10 * 60000, polling: 500 }).then((h) => h.jsonValue(), () => null);
  await browser.close(); if (server) server.stop();
  if (!got) fail('nobody signed in within ten minutes');
  writeFileSync(SESSION, got, { mode: 0o600 });
  console.error('film: signed in as ' + (JSON.parse(got).user?.email || 'your account') + '. The session is kept in tools/film/.session.json.');
}

// --mock-auth: a made-up account that is switched on, answered on this computer. Nothing of Supabase is reached,
// so only built views open.
export const MOCK = { access_token: 'mock', refresh_token: 'mock', expires_at: 4102444800, user: { id: '00000000-0000-4000-8000-000000000000' } };
export async function mockAccount(page, film = true) {
  await page.addInitScript((s) => { try { localStorage.setItem('cg-session', s); } catch (e) { /* no storage */ } }, JSON.stringify(MOCK));
  await page.route(/supabase\.co\/(rest|auth|functions)\/v1\//, (r) => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: /select=film/.test(r.request().url()) ? JSON.stringify([{ film }]) : '[]' }));
}

// What the page cannot do itself: take the picture of a frame, and draw with more pixels. The page asks for it
// through `window.codegraveFilmCapture` (boardFrames, snapshot). A script of your own may give it the same way.
export async function captureHook(page, job) {
  const cdp = await page.context().newCDPSession(page);
  let scaled = false;
  await page.exposeFunction('codegraveFilmCapture', async (o = {}) => {
    if (o.op === 'scale') { scaled = o.scale !== job.dpr; await cdp.send('Emulation.setDeviceMetricsOverride', { width: job.cw, height: job.ch, deviceScaleFactor: o.scale * job.k, mobile: false }); return true; }
    const jpeg = o.type === 'jpeg', clear = job.bg === 'transparent' && !jpeg;
    // With more pixels asked for than the page was opened with, the browser is asked directly: Playwright would put its own size back.
    if (scaled) {
      if (clear) await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
      const shot = await cdp.send('Page.captureScreenshot', { format: jpeg ? 'jpeg' : 'png', ...(jpeg ? { quality: o.quality || 86 } : {}), clip: { x: 0, y: 0, width: job.cw, height: job.ch, scale: 1 } });
      if (clear) await cdp.send('Emulation.setDefaultBackgroundColorOverride', {});
      return shot.data;
    }
    return (await page.screenshot({ type: jpeg ? 'jpeg' : 'png', ...(jpeg ? { quality: o.quality || 86 } : {}), clip: { x: 0, y: 0, width: job.cw, height: job.ch }, omitBackground: clear })).toString('base64');
  });
}

// Opens the job in film mode (its timeline, or the bare stage for a scene), and waits until it is ready.
async function open(job, headed = job.headed) {
  if (!job.mock && !existsSync(SESSION)) fail('nobody is signed in. Run: node tools/film/film.mjs login   (or use --mock-auth for a built view)');
  const browser = await launch(!headed);
  const page = await browser.newPage({ viewport: { width: job.cw, height: job.ch }, deviceScaleFactor: job.dpr * job.k });
  const stop = async (msg) => { await browser.close().catch(() => {}); fail(msg); };
  if (job.mock) await mockAccount(page); else await signIn(page, job.base);
  await captureHook(page, job);
  const q = new URLSearchParams({ film: '1', w: job.w, h: job.h, dpr: job.dpr, fps: job.fps });
  for (const k of ['look', 'detail', 'safe', 'bg', 'preset']) if (job[k]) q.set(k, job[k]);
  await page.goto(`${job.base}/${job.timeline || 'film'}?${q}`);
  const on = await page.waitForFunction(() => !!window.codegraveFilm, null, { timeout: 30000 }).catch(() => null);
  if (!on) await stop('film mode did not start: the session has run out (run film.mjs login again), this account is not switched on for film mode, or this site has no film mode yet');
  await page.evaluate(() => window.codegraveFilm.ready).catch((e) => stop(e.message.split('\n')[0]));
  if (!job.mock) await keepSession(page);
  if (job.scene) { const got = await call(page, 'loadScene', job.scene); if (got.errors) await stop('scene.json has faults:\n  ' + got.errors.join('\n  ')); }
  return { browser, page };
}
// One call of the page's API. Faults a script can mend come back as { errors }.
const call = (page, name, ...args) => page.evaluate(([n, a]) => window.codegraveFilm[n](...a).then((v) => v, (e) => ({ errors: e.errors || [e.message] })), [name, args]);
async function load(page, job) {
  const got = await page.evaluate(({ shots, preset }) => window.codegraveFilm.loadShots(shots, preset ? { preset } : {}).then((total) => ({ total }), (e) => ({ errors: e.errors || [e.message] })), { shots: job.shots, preset: job.preset });
  if (got.errors) fail('the shot list has faults:\n  ' + got.errors.join('\n  '));
  return got.total;
}
// A job done with one page: the site served if asked, the page opened, closed whatever happens.
async function withPage(job, work, { headed } = {}) {
  const site = job.serve ? await serve() : null;
  if (site) job.base = site.base;
  let w = null;
  try { w = await open(job, headed ?? job.headed); return await work(w.page); } finally { if (w) await w.browser.close().catch(() => {}); if (site) site.stop(); }
}
const missing = async (page) => { for (const m of await page.evaluate(() => window.codegraveFilm.missing())) say(`missing ${m.kind}: ${m.what}`); };

// ---- generate: a timeline from a prompt, by the site's own generator, as the account signed in
async function generateIn(page, job) {
  if (!job.prompt) fail('give --prompt "<words>" (or "prompt" in film.json)');
  if (job.mock) fail('generate needs a real account: run film.mjs login, and leave --mock-auth out');
  say(`asking for "${job.prompt}"${job.save === 'none' ? ', kept nowhere' : ', kept as a private timeline'}`);
  const tick = setInterval(async () => { const p = await page.evaluate(() => window.codegraveFilm.progress()).catch(() => null); if (p) process.stdout.write(`\rfilm: ${p.stage}${p.entries ? `, ${p.entries} entries` : ''}${p.note ? ` (${p.note})` : ''}        `); }, 1000);
  const got = await call(page, 'generate', { prompt: job.prompt, save: job.save, ...(job.model ? { model: job.model } : {}), ...(job.effort ? { effort: job.effort } : {}) }).finally(() => { clearInterval(tick); process.stdout.write('\n'); });
  if (got.errors) fail('the generator: ' + got.errors.join('; '));
  write(job, 'timeline.json', { prompt: job.prompt, slug: got.slug, saved: got.saved, timeline: got.timeline });
  if (got.slug) { job.timeline = got.slug; keep(job, { timeline: got.slug }); } else say('it was kept nowhere, so it cannot be filmed later: generate again without --save none to film it');
  say(`${got.timeline.entries.length} entries: "${got.timeline.title}"${got.slug ? ' at ' + got.slug : ''}`);
  return got;
}
async function generate(args, env) {
  const job = jobOf(args._[0], args, env), subject = job.timeline;
  job.timeline = ''; job.scene = null;
  if (subject && !args.again) fail(`this job already has a timeline (${subject}). Give --again to make another`);
  await withPage(job, (page) => generateIn(page, job));
}

// ---- manifest, shots, frames
async function manifestIn(page, job) {
  const m = await call(page, 'manifest');
  if (!m || m.errors) fail('the manifest could not be made' + (m ? ': ' + m.errors.join('; ') : ''));
  write(job, 'manifest.json', m);
  if (m.unclear.length) say(`${m.unclear.length} picture${m.unclear.length === 1 ? ' has' : 's have'} no plainly free licence (manifest.json, "unclear")`);
  return m;
}
async function shotsIn(page, job) {
  const ids = (await call(page, 'getTimeline')).entries.map((e) => e.id), t = timingsOf(job, ids);
  if (job.shots && !job.auto) return false;
  if (job.shots && JSON.stringify(readJSON(join(job.dir, 'shots.json')).durations ?? null) === JSON.stringify(t.durations)) return false;
  const got = await call(page, 'autoShots', { ...(t.entries ? { entries: t.entries } : {}), ...(t.durations ? { durations: t.durations } : {}), ...(job.preset ? { preset: job.preset } : {}) });
  if (got.errors) fail('the shots could not be written:\n  ' + got.errors.join('\n  '));
  job.shots = got.shots; job.auto = true;
  write(job, 'shots.json', { auto: true, ...(job.timeline ? { timeline: job.timeline } : {}), ...(job.preset ? { preset: job.preset } : {}), durations: t.durations, shots: got.shots });
  say(`${got.shots.length} shots, ${got.total}s${t.durations ? ', timed to the voice' : ', at the pace of the preset (put the voice in and run again to time them)'}`);
  return true;
}
const data = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
async function framesIn(page, job) {
  const total = await load(page, job);
  write(job, 'cues.json', { total, fps: job.fps, cues: await page.evaluate(() => window.codegraveFilm.getCues()) });
  await page.evaluate(() => window.codegraveFilm.prefetch());
  const dir = join(job.dir, 'board'), board = await call(page, 'boardFrames', { width: 480 });
  if (board.errors) fail('the board frames: ' + board.errors.join('; '));
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  for (const b of board) { const name = `${String(b.index).padStart(3, '0')}-${b.type}${b.entry ? '-' + b.entry.replace(/[^\w-]+/g, '_').slice(0, 40) : ''}.jpg`; writeFileSync(join(dir, name), data(b.jpeg)); b.file = 'board/' + name; delete b.jpeg; }
  write(job, 'board.json', board);
  say(`${board.length} board frames in ${dir}`);
  if (job.stills.length) {
    mkdirSync(join(job.dir, 'stills'), { recursive: true });
    for (const t of job.stills) { const s = await call(page, 'snapshot', t, { w: job.stillW }); if (s.errors) fail('the still: ' + s.errors.join('; ')); const f = join(job.dir, 'stills', `${t.toFixed(2).replace('.', '_')}s-${s.w}x${s.h}.png`); writeFileSync(f, data(s.png)); say('wrote ' + f); }
  }
  await missing(page);
}
async function manifest(args, env) { const job = jobOf(args._[0], args, env); need(job, ['subject']); await withPage(job, async (page) => { await manifestIn(page, job); if (job.shots) { const total = await load(page, job); write(job, 'cues.json', { total, fps: job.fps, cues: await page.evaluate(() => window.codegraveFilm.getCues()) }); } }); }
async function shots(args, env) { const job = jobOf(args._[0], args, env); need(job, ['subject']); if (job.shots && !job.auto && !args.again) fail('shots.json is there and was written by hand: give --again to write over it'); if (args.again) { job.shots = null; job.auto = false; } await withPage(job, async (page) => { if (!(await shotsIn(page, job))) say('shots.json is up to date'); }); }
async function frames(args, env) { const job = jobOf(args._[0], args, env); need(job, ['subject', 'shots']); await withPage(job, (page) => framesIn(page, job)); }

// ---- preview: the film as it runs, in a window, with the voice
async function preview(args, env) {
  const job = jobOf(args._[0], args, env); need(job, ['subject', 'shots']);
  const { one } = voiceOf(job);
  await withPage(job, async (page) => {
    const total = await load(page, job);
    await page.evaluate(() => window.codegraveFilm.prefetch());
    if (one) await page.route('**/__film_voice', (r) => r.fulfill({ body: readFileSync(one), contentType: 'audio/' + extname(one).slice(1).replace('mp3', 'mpeg') }));
    say(`playing ${total.toFixed(1)}s${one ? ' with ' + basename(one) : ' (no voice.mp3 in the folder: silent)'}. Close the window to stop.`);
    await Promise.race([page.evaluate((v) => window.codegraveFilm.play(v ? { audioUrl: '/__film_voice' } : {}), !!one), new Promise((r) => page.on('close', r))]).catch(() => {});
  }, { headed: true });
}

// ---- render: every frame by seek(t), joined by ffmpeg
const CODECS = {
  prores: ['-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-pix_fmt', 'yuv422p10le'],
  clear: ['-c:v', 'prores_ks', '-profile:v', '4', '-vendor', 'apl0', '-pix_fmt', 'yuva444p10le'],
  mp4: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
};
const run = (cmd, argv) => new Promise((r) => { const p = spawn(cmd, argv, { stdio: ['ignore', 'inherit', 'inherit'] }); p.on('error', () => r(-1)); p.on('close', r); });
async function render(args, env, given) {
  const job = given || jobOf(args._[0], args, env); need(job, ['subject', 'shots']);
  const site = job.serve ? await serve() : null;
  if (site) job.base = site.base;
  // Several browsers draw at once, each taking the next stretch of frames. A frame depends only on its time, so
  // the film is the same however many draw it; a Mac with many cores is several times faster this way.
  const crew = [], clear = job.bg === 'transparent';
  const film = !(job.format === 'png'), frames = film ? join(job.dir, '.frames') : job.out;
  try {
    crew.push(await open(job));
    const total = await load(crew[0].page, job), a = Math.max(0, job.from), b = Math.min(total, job.to ?? total);
    const first = Math.round(a * job.fps), last = Math.round(b * job.fps), count = Math.max(1, Math.min(job.workers, Math.ceil((last - first) / 30)));
    say(`${total.toFixed(2)}s, frames ${first} to ${last - 1} at ${job.fps} fps, ${job.w * job.dpr}×${job.h * job.dpr}${clear ? ', see-through' : ''}, ${count} ${count === 1 ? 'browser' : 'browsers'}`);
    crew.push(...await Promise.all(Array.from({ length: count - 1 }, async () => { const w = await open(job); await load(w.page, job); return w; })));
    const pre = (await Promise.all(crew.map((w) => w.page.evaluate(() => window.codegraveFilm.prefetch()))))[0];
    for (const m of pre.failed) say(`could not get ${m.kind}: ${m.what}`);
    if (film || !given) rmSync(frames, { recursive: true, force: true });
    mkdirSync(frames, { recursive: true });
    const t0 = Date.now(), CHUNK = 15;
    let next = first, done = 0;
    const said = () => process.stdout.write(`\rfilm: ${done}/${last - first} frames, ${(done / ((Date.now() - t0) / 1000)).toFixed(1)} a second   `);
    await Promise.all(crew.map(async ({ page }) => {
      while (next < last) {
        const from = next, to = Math.min(last, from + CHUNK); next = to;
        for (let i = from; i < to; i++) {
          await page.evaluate((t) => window.codegraveFilm.seek(t), i / job.fps);
          writeFileSync(join(frames, String(i).padStart(6, '0') + '.png'), await page.screenshot({ type: 'png', omitBackground: clear, clip: { x: 0, y: 0, width: job.cw, height: job.ch } }));
          if (++done % job.fps === 0) said();
        }
      }
    }));
    said(); process.stdout.write('\n');
    if (film) {
      // The voice goes into the film when it is there: one file, or the entries' files one after another.
      const v = voiceOf(job), sound = v.one ? [v.one] : v.parts, whole = a === 0 && b === total;
      const mix = sound.length > 1 ? ['-filter_complex', sound.map((_, i) => `[${i + 1}:a]`).join('') + `concat=n=${sound.length}:v=0:a=1[a]`, '-map', '0:v', '-map', '[a]'] : sound.length ? ['-map', '0:v', '-map', '1:a'] : [];
      const code = await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(job.fps), '-start_number', String(first), '-i', join(frames, '%06d.png'), ...(whole ? sound.flatMap((f) => ['-i', f]) : []),
        ...(whole ? mix : []), ...CODECS[clear ? 'clear' : job.format], ...(whole && sound.length ? (job.format === 'mp4' ? ['-c:a', 'aac', '-b:a', '256k'] : ['-c:a', 'pcm_s24le']) : []),
        ...(clear ? [] : ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709']), '-r', String(job.fps), job.out]);
      if (code) fail(code === -1 ? `ffmpeg is not installed (brew install ffmpeg). The frames are in ${frames}` : 'ffmpeg stopped with an error');
      rmSync(frames, { recursive: true, force: true });
      if (sound.length && whole) say(`with the voice (${sound.length === 1 ? basename(sound[0]) : sound.length + ' files'})`);
    }
    const lost = (await Promise.all(crew.map((w) => w.page.evaluate(() => window.codegraveFilm.missing())))).flat();
    for (const m of new Map(lost.map((m) => [m.kind + m.what, m])).values()) say(`missing ${m.kind}: ${m.what}`);
    say('wrote ' + job.out);
  } finally {
    await Promise.all(crew.map((w) => w.browser.close().catch(() => {})));
    if (site) site.stop();
  }
}

// ---- make: a whole film from a folder, in order, stopping for you before the render
async function make(args, env) {
  const job = jobOf(args._[0], args, env);
  const site = job.serve ? await serve() : null;
  if (site) { job.base = site.base; job.serve = false; }
  try {
    if (!job.timeline && !job.scene) {
      if (!job.prompt) fail('nothing to film: give "timeline" or "prompt" in film.json, or a scene.json');
      const scene = job.scene; job.scene = null;
      await withPage(job, (page) => generateIn(page, job));
      job.scene = scene;
      if (!job.timeline) fail('a timeline kept nowhere cannot be made into a film: leave --save none out');
    }
    await withPage(job, async (page) => { await manifestIn(page, job); await shotsIn(page, job); await framesIn(page, job); });
    const v = voiceOf(job);
    if (!v.one && !v.parts.length && !args.render) {
      say(`ready for you to look at: ${join(job.dir, 'board')} (one frame a shot), shots.json, manifest.json, cues.json.`);
      say('Put the voice in the folder (voice.mp3, or voice/01.mp3, voice/02.mp3 ... one per entry) and run make again to render; or give --render to render without one.');
      return 'review';
    }
    await render(args, env, job);
    return 'rendered';
  } finally { if (site) site.stop(); }
}
// jobs: every folder inside, one after another; one that fails does not stop the rest.
async function jobs(args, env) {
  const root = resolve(args._[0] || '.');
  if (!existsSync(root)) fail(`${root} is not there`);
  const dirs = readdirSync(root).map((d) => join(root, d)).filter((d) => statSync(d).isDirectory() && ['film.json', 'shots.json', 'scene.json'].some((f) => existsSync(join(d, f)))).sort();
  if (!dirs.length) fail(`no jobs in ${root}: a job is a folder with a film.json, a shots.json or a scene.json`);
  const site = args.serve ? await serve() : null, out = [];
  try {
    for (const d of dirs) {
      say(`---- ${basename(d)}`);
      try { out.push([d, await make({ ...args, _: [d], serve: false, ...(site ? { base: site.base } : {}) }, env)]); } catch (e) { if (!(e instanceof Stop)) console.error(e); say('failed: ' + e.message); out.push([d, 'failed: ' + e.message.split('\n')[0]]); }
    }
  } finally { if (site) site.stop(); }
  say('----'); for (const [d, what] of out) say(`${basename(d)}: ${what}`);
  if (out.some(([, w]) => String(w).startsWith('failed'))) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const COMMANDS = { login, generate, manifest, shots, frames, preview, render, make, jobs };
  const args = readArgs(process.argv.slice(3)), cmd = COMMANDS[process.argv[2]];
  try {
    if (!cmd) fail(`give a command: ${Object.keys(COMMANDS).join(', ')}. The options are at the top of tools/film/film.mjs and in docs/FILM_MODE.md.`);
    await cmd(args, readEnv());
  } catch (e) { if (!(e instanceof Stop)) throw e; console.error('film: ' + e.message); process.exit(1); }
}
