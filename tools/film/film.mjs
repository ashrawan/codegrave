#!/usr/bin/env node
// The command line of film mode (docs/FILM_MODE.md): one command per job.
//
//   node tools/film/film.mjs render <folder> [options]
//
// <folder> holds shots.json (a list of shots, or { timeline, preset, shots }) and gets the result.
// The key is read from tools/film/.env (FILM_KEY); it is never printed and never written anywhere.
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
//   --mock-auth               answer the key check locally: for trying things on built views, with
//                             no key and no access to anything private
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    from: n('from', 0), to: o.to == null ? null : Number(o.to), headed: !!o.headed, mock: !!o.mockAuth, serve: !!o.serve, out: o.out ? resolve(o.out) : null };
  if (!Array.isArray(job.shots)) fail(`${file}: give a list of shots, or { "timeline": "...", "shots": [...] }`);
  if (!job.timeline) fail('which timeline? Give --timeline <owner/slug>, or "timeline" in shots.json');
  if (!['prores', 'mp4', 'png'].includes(job.format)) fail('--format is prores, mp4 or png');
  for (const k of ['w', 'h', 'dpr', 'fps', 'from']) if (!Number.isFinite(job[k])) fail(`--${k} must be a number`);
  if (!job.out) job.out = job.format === 'png' ? join(dir, 'frames') : join(dir, job.format === 'mp4' ? 'film.mp4' : 'film.mov');
  return job;
}

// Opens the timeline in film mode and waits until it is ready. The key goes after "#", so it is never sent in a request for the page.
async function open(job, env) {
  const key = job.mock ? 'mock' : env.FILM_KEY;
  if (!key) fail('FILM_KEY is not set. Put it in tools/film/.env (see .env.example), or use --mock-auth for a built view.');
  const { chromium } = await playwright();
  const browser = await chromium.launch({ headless: !job.headed, args: ['--ignore-gpu-blocklist', '--enable-webgl', ...(process.platform === 'linux' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])] });
  const page = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: job.dpr });
  if (job.mock) await page.route('**/functions/v1/film-auth', (r) => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r.request().postDataJSON()?.key ? { token: 'mock', scopes: ['read'] } : { error: 'mock' }), status: r.request().method() === 'OPTIONS' || r.request().postDataJSON()?.key ? 200 : 404 }));
  const q = new URLSearchParams({ film: '1', w: job.w, h: job.h, dpr: job.dpr, fps: job.fps, ...(job.look ? { look: job.look } : {}), ...(job.detail ? { detail: job.detail } : {}) });
  await page.goto(`${job.base}/${job.timeline}?${q}#k=${encodeURIComponent(key)}`);
  const on = await page.waitForFunction(() => !!window.codegraveFilm, null, { timeout: 30000 }).catch(() => null);
  if (!on) { await browser.close(); fail('film mode did not start: the key was not accepted, or this site has no film mode yet'); }
  await page.evaluate(() => window.codegraveFilm.ready).catch(async (e) => { await browser.close(); fail(e.message.split('\n')[0]); });
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
  const { browser, page } = await open(job, env);
  try {
    const total = await load(page, job), a = Math.max(0, job.from), b = Math.min(total, job.to ?? total);
    const first = Math.round(a * job.fps), last = Math.round(b * job.fps);
    console.log(`film: ${total.toFixed(2)}s, frames ${first} to ${last - 1} at ${job.fps} fps, ${job.w * job.dpr}×${job.h * job.dpr}`);
    const pre = await page.evaluate(() => window.codegraveFilm.prefetch());
    for (const m of pre.failed) console.log(`film: could not get ${m.kind}: ${m.what}`);
    let ff = null;
    if (job.format === 'png') mkdirSync(job.out, { recursive: true });
    else {
      ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(job.fps), '-c:v', 'png', '-i', '-', ...CODECS[job.format],
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-r', String(job.fps), job.out], { stdio: ['pipe', 'inherit', 'inherit'] });
      ff.on('error', () => fail('ffmpeg is not installed (brew install ffmpeg), or use --format png'));
    }
    const t0 = Date.now();
    for (let i = first; i < last; i++) {
      await page.evaluate((t) => window.codegraveFilm.seek(t), i / job.fps);
      const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: job.w, height: job.h } });
      if (ff) { if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r)); }
      else writeFileSync(join(job.out, String(i).padStart(6, '0') + '.png'), png);
      if ((i - first) % job.fps === job.fps - 1 || i === last - 1) process.stdout.write(`\rfilm: ${i - first + 1}/${last - first} frames, ${((i - first + 1) / ((Date.now() - t0) / 1000)).toFixed(1)} a second   `);
    }
    process.stdout.write('\n');
    if (ff) { ff.stdin.end(); const code = await new Promise((r) => ff.on('close', r)); if (code) fail('ffmpeg stopped with an error'); }
    const lost = await page.evaluate(() => window.codegraveFilm.missing());
    for (const m of lost) console.log(`film: missing ${m.kind}: ${m.what}`);
    console.log('film: wrote ' + job.out);
  } finally {
    await browser.close();
    if (site) site.stop();
  }
}

const COMMANDS = { render };
const args = readArgs(process.argv.slice(3)), cmd = COMMANDS[process.argv[2]];
if (!cmd) fail(`give a command: ${Object.keys(COMMANDS).join(', ')}. The options are at the top of tools/film/film.mjs and in docs/FILM_MODE.md.`);
await cmd(args, readEnv());
