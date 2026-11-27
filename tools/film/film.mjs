#!/usr/bin/env node
// The command line of film mode (docs/FILM_MODE.md): one command per job.
//
//   node tools/film/film.mjs render <folder> [options]
//
// <folder> holds shots.json (a list of shots, or { timeline, preset, shots }) and gets the result.
// Film mode opens for a signed-in account that has been switched on for it; there is no key.
// `film.mjs login` signs the account in once (a window opens); films are then made as that account.
//
// Options (each may also stand in <folder>/film.json):
//   --timeline <owner/slug>   the timeline to film: wiki/japan, <username>/<slug>, t/<id>
//   --base <url>              the site (default: FILM_BASE, else https://codegrave.com)
//   --serve                   serve this checkout's site/ and film that instead of --base
//   --w 1920 --h 1080         the stage in CSS pixels; --dpr 1 or 2 multiplies the pixels of the result
//   --fps 30                  30 or 60
//   --look atlas|day|dots     --detail less|medium|full
//   --format prores|mp4|png   ProRes 422 HQ (default), a high-bitrate MP4, or a PNG for every frame
//   --out <file>              where the film goes (default: <folder>/film.mov or .mp4, or <folder>/frames/)
//   --from <s> --to <s>       only this stretch of the film
//   --headed                  show the browser while it works
//   --workers <n>             browsers that draw at once (on a Mac 6 by default, elsewhere 1)
//   --mock-auth               answer the account check locally: for trying things on built views, with
//                             nobody signed in and no access to anything private
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '..', '..');
const fail = (msg) => { console.error('film: ' + msg); process.exit(1); };

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

// ---- one job: the folder, its shots and how it is to be filmed
function jobOf(folder, args, env) {
  if (!folder) fail('give the folder that holds shots.json');
  const dir = resolve(folder), file = join(dir, 'shots.json');
  if (!existsSync(file)) fail(`${file} is not there`);
  const raw = readJSON(file), conf = existsSync(join(dir, 'film.json')) ? readJSON(join(dir, 'film.json')) : {};
  const o = { ...(Array.isArray(raw) ? {} : raw), ...conf, ...args };
  const n = (k, d) => (o[k] == null ? d : Number(o[k]));
  const job = { dir, shots: Array.isArray(raw) ? raw : raw.shots, timeline: o.timeline || '', preset: o.preset || null, base: (o.base || env.FILM_BASE || 'https://codegrave.com').replace(/\/+$/, ''),
    w: n('w', 1920), h: n('h', 1080), dpr: n('dpr', 1), fps: n('fps', 30), look: o.look || null, detail: o.detail || null, format: o.format || 'prores',
    from: n('from', 0), to: o.to == null ? null : Number(o.to), headed: !!o.headed, workers: Math.max(1, Math.min(16, Math.round(n('workers', process.platform === 'darwin' ? Math.min(6, Math.ceil(cpus().length / 2)) : 1)))), mock: !!o.mockAuth, serve: !!o.serve, out: o.out ? resolve(o.out) : null };
  if (!Array.isArray(job.shots)) fail(`${file}: give a list of shots, or { "timeline": "...", "shots": [...] }`);
  if (!job.timeline) fail('which timeline? Give --timeline <owner/slug>, or "timeline" in shots.json');
  if (!['prores', 'mp4', 'png'].includes(job.format)) fail('--format is prores, mp4 or png');
  for (const k of ['w', 'h', 'dpr', 'fps', 'from']) if (!Number.isFinite(job[k])) fail(`--${k} must be a number`);
  if (!job.out) job.out = job.format === 'png' ? join(dir, 'frames') : join(dir, job.format === 'mp4' ? 'film.mp4' : 'film.mov');
  return job;
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

// Opens the timeline in film mode and waits until it is ready.
async function open(job) {
  if (!job.mock && !existsSync(SESSION)) fail('nobody is signed in. Run: node tools/film/film.mjs login   (or use --mock-auth for a built view)');
  const browser = await launch(!job.headed);
  const page = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: job.dpr });
  if (job.mock) await mockAccount(page); else await signIn(page, job.base);
  const q = new URLSearchParams({ film: '1', w: job.w, h: job.h, dpr: job.dpr, fps: job.fps, ...(job.look ? { look: job.look } : {}), ...(job.detail ? { detail: job.detail } : {}) });
  await page.goto(`${job.base}/${job.timeline}?${q}`);
  const on = await page.waitForFunction(() => !!window.codegraveFilm, null, { timeout: 30000 }).catch(() => null);
  if (!on) { await browser.close(); fail('film mode did not start: the session has run out (run film.mjs login again), this account is not switched on for film mode, or this site has no film mode yet'); }
  await page.evaluate(() => window.codegraveFilm.ready).catch(async (e) => { await browser.close(); fail(e.message.split('\n')[0]); });
  if (!job.mock) await keepSession(page);
  return { browser, page };
}
async function load(page, job) {
  const got = await page.evaluate(({ shots, preset }) => window.codegraveFilm.loadShots(shots, preset ? { preset } : {}).then((total) => ({ total }), (e) => ({ errors: e.errors || [e.message] })), { shots: job.shots, preset: job.preset });
  if (got.errors) fail('the shot list has faults:\n  ' + got.errors.join('\n  '));
  return got.total;
}

// ---- render: every frame by seek(t), joined by ffmpeg
const CODECS = {
  prores: ['-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-pix_fmt', 'yuv422p10le'],
  mp4: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
};
async function render(args, env) {
  const job = jobOf(args._[0], args, env);
  const site = job.serve ? await serve() : null;
  if (site) job.base = site.base;
  // Several browsers draw at once, each taking the next stretch of frames. A frame depends only on its time, so
  // the film is the same however many draw it; a Mac with many cores is several times faster this way.
  const crew = [];
  const film = !(job.format === 'png'), frames = film ? join(job.dir, '.frames') : job.out;
  try {
    crew.push(await open(job));
    const total = await load(crew[0].page, job), a = Math.max(0, job.from), b = Math.min(total, job.to ?? total);
    const first = Math.round(a * job.fps), last = Math.round(b * job.fps), count = Math.max(1, Math.min(job.workers, Math.ceil((last - first) / 30)));
    console.log(`film: ${total.toFixed(2)}s, frames ${first} to ${last - 1} at ${job.fps} fps, ${job.w * job.dpr}×${job.h * job.dpr}, ${count} ${count === 1 ? 'browser' : 'browsers'}`);
    crew.push(...await Promise.all(Array.from({ length: count - 1 }, async () => { const w = await open(job); await load(w.page, job); return w; })));
    const pre = (await Promise.all(crew.map((w) => w.page.evaluate(() => window.codegraveFilm.prefetch()))))[0];
    for (const m of pre.failed) console.log(`film: could not get ${m.kind}: ${m.what}`);
    if (film) rmSync(frames, { recursive: true, force: true });
    mkdirSync(frames, { recursive: true });
    const t0 = Date.now(), CHUNK = 15;
    let next = first, done = 0;
    const said = () => process.stdout.write(`\rfilm: ${done}/${last - first} frames, ${(done / ((Date.now() - t0) / 1000)).toFixed(1)} a second   `);
    await Promise.all(crew.map(async ({ page }) => {
      while (next < last) {
        const from = next, to = Math.min(last, from + CHUNK); next = to;
        for (let i = from; i < to; i++) {
          await page.evaluate((t) => window.codegraveFilm.seek(t), i / job.fps);
          writeFileSync(join(frames, String(i).padStart(6, '0') + '.png'), await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: job.w, height: job.h } }));
          if (++done % job.fps === 0) said();
        }
      }
    }));
    said(); process.stdout.write('\n');
    if (film) {
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(job.fps), '-start_number', String(first), '-i', join(frames, '%06d.png'), ...CODECS[job.format],
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-r', String(job.fps), job.out], { stdio: ['ignore', 'inherit', 'inherit'] });
      const code = await new Promise((r) => { ff.on('error', () => r(-1)); ff.on('close', r); });
      if (code) fail(code === -1 ? `ffmpeg is not installed (brew install ffmpeg). The frames are in ${frames}` : 'ffmpeg stopped with an error');
      rmSync(frames, { recursive: true, force: true });
    }
    const lost = (await Promise.all(crew.map((w) => w.page.evaluate(() => window.codegraveFilm.missing())))).flat();
    for (const m of new Map(lost.map((m) => [m.kind + m.what, m])).values()) console.log(`film: missing ${m.kind}: ${m.what}`);
    console.log('film: wrote ' + job.out);
  } finally {
    await Promise.all(crew.map((w) => w.browser.close().catch(() => {})));
    if (site) site.stop();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const COMMANDS = { render, login };
  const args = readArgs(process.argv.slice(3)), cmd = COMMANDS[process.argv[2]];
  if (!cmd) fail(`give a command: ${Object.keys(COMMANDS).join(', ')}. The options are at the top of tools/film/film.mjs and in docs/FILM_MODE.md.`);
  await cmd(args, readEnv());
}
