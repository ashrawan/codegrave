#!/usr/bin/env node
// The checks of film mode that need a browser (the rest are in tests/film.test.mjs):
//   node scripts/build.mjs && node tools/film/check.mjs
// It serves this checkout's site/, answers the account check itself, and looks at what a real page does:
// a normal page fetches nothing of film mode; signed out, or an account not switched on, changes nothing;
// the same time gives the same frame; nothing is written.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockAccount } from './film.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const port = 8900 + Math.floor(Math.random() * 90), base = `http://localhost:${port}`;
const server = spawn(process.execPath, [join(repo, 'scripts', 'serve.mjs'), String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => server.stdout.once('data', r));
// The same browser the films are made with (launch() in film.mjs): on a Mac the full Chromium, drawing with Metal.
const flags = ['--ignore-gpu-blocklist', '--enable-webgl'];
const browser = process.platform === 'linux' ? await chromium.launch({ args: [...flags, '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  : await chromium.launch({ channel: 'chromium', args: [...flags, '--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] }).catch(() => chromium.launch({ args: flags }));
let failed = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failed++; };

// One page, with every request it makes written down. `who`: nobody signed in (null), an account that is not
// switched on for film mode (false), or one that is (true).
async function visit(url, who = null) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }), reqs = [];
  page.on('request', (r) => reqs.push({ url: r.url(), method: r.method() }));
  if (who !== null) await mockAccount(page, who);
  await page.goto(base + url);
  return { page, reqs };
}
const settled = (page) => page.waitForFunction(() => document.querySelector('#globe')?.dataset.idle === '1', null, { timeout: 60000 });
const film = (reqs) => reqs.filter((r) => /\/film\/|select=film/.test(r.url)).map((r) => r.url.replace(base, '').replace(/^https:\/\/[^/]+/, ''));

{ // a normal page
  const { page, reqs } = await visit('/wiki/japan');
  await settled(page);
  check(film(reqs).length === 0, `a normal page fetches nothing of film mode (${reqs.length} requests, none of film mode)`);
  check(await page.evaluate(() => !window.codegraveFilm && !document.querySelector('#film-stage')), 'a normal page has no film API and no film stage');
  await page.close();
}
for (const [name, who] of [['signed out', null], ['an account not switched on', false]]) {
  const { page, reqs } = await visit('/wiki/japan?film=1', who);
  await settled(page);
  const got = film(reqs);
  check(!got.some((u) => /film\.js|film\.css|shots/.test(u)) && got.filter((u) => u.includes('select=film')).length === (who === null ? 0 : 1), `${name}: only the gate is fetched (${got.join(', ') || 'nothing'})`);
  check(await page.evaluate(() => !window.codegraveFilm && !document.querySelector('#film-stage') && getComputedStyle(document.querySelector('#sb')).display !== 'none'), `${name}: the page is the normal page`);
  await page.close();
}
{ // film mode
  const { page, reqs } = await visit('/wiki/japan?film=1&w=1920&h=1080', true);
  await page.waitForFunction(() => !!window.codegraveFilm, null, { timeout: 30000 });
  await page.evaluate(() => window.codegraveFilm.ready);
  check(await page.evaluate(() => document.querySelector('meta[name=robots]')?.content === 'noindex,nofollow' && getComputedStyle(document.querySelector('#sb')).display === 'none'), 'film mode: noindex is set and the chrome is hidden');
  const total = await page.evaluate(() => window.codegraveFilm.loadShots([{ type: 'fly', to: 'kyoto', duration: 2 }, { type: 'hold', entry: 'kyoto', duration: 3 }, { type: 'step', entries: ['kinkaku-ji', 'tokyo'], durations: 3 }, { type: 'camera', lat: 35.36, lng: 138.73, altitude: 300, heading: 30, tilt: 45, duration: 3 }]));
  check(total === 14, `the shot list loads and runs ${total}s`);
  const hash = async (t) => { await page.evaluate((x) => window.codegraveFilm.seek(x), t); return createHash('sha256').update(await page.screenshot()).digest('hex').slice(0, 16); };
  for (const t of [1.2, 4, 9.5, 12.5]) { const a = await hash(t); await hash(6.7); const b = await hash(t); check(a === b, `seek(${t}) twice gives the same frame (${a})`); }
  check(await page.evaluate(() => Object.keys(localStorage).join() === 'cg-session' && sessionStorage.length === 0), 'nothing is written to storage but the session');
  const writes = reqs.filter((r) => r.method !== 'GET' && r.method !== 'OPTIONS');
  check(writes.length === 0, `nothing is sent anywhere (${writes.map((r) => r.method + ' ' + r.url).join(', ') || 'no other writes'})`);
  await page.close();
}
await browser.close(); server.kill();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
