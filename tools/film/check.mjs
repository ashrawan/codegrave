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
  await page.evaluate(() => window.codegraveFilm.prefetch());      // as a render does: every tile and picture is in before a frame is taken
  const hash = async (t) => { await page.evaluate((x) => window.codegraveFilm.seek(x), t); return createHash('sha256').update(await page.screenshot()).digest('hex').slice(0, 16); };
  for (const t of [1.2, 4, 9.5, 12.5]) { const a = await hash(t); await hash(6.7); const b = await hash(t); check(a === b, `seek(${t}) twice gives the same frame (${a})`); }
  check(await page.evaluate(() => Object.keys(localStorage).join() === 'cg-session' && sessionStorage.length === 0), 'nothing is written to storage but the session');
  const writes = reqs.filter((r) => r.method !== 'GET' && r.method !== 'OPTIONS');
  check(writes.length === 0, `nothing is sent anywhere (${writes.map((r) => r.method + ' ' + r.url).join(', ') || 'no other writes'})`);
  await page.close();
}
{ // a vertical stage, a preset, a scene and overlays: the pixels asked for, and the same frame twice
  const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await mockAccount(page, true);
  await page.goto(base + '/film?film=1&w=1080&h=1920&preset=short-question');
  await page.waitForFunction(() => !!window.codegraveFilm, null, { timeout: 30000 });
  await page.evaluate(() => window.codegraveFilm.ready);
  const caps = await page.evaluate(() => window.codegraveFilm.capabilities());
  check(caps.presets.length === 7 && caps.shots.compare && caps.looks.includes('night') && !caps.shots.timeTravel, `capabilities: ${Object.keys(caps.shots).length} shot types, ${caps.presets.length} presets`);
  const got = await page.evaluate(() => window.codegraveFilm.loadScene({ places: [{ id: 'lisbon', name: 'Lisbon', lat: 38.72, lng: -9.14, summary: 'Where the fleet set out.' }, { id: 'calicut', name: 'Calicut', lat: 11.26, lng: 75.78 }], routes: [{ id: 'gama', from: 'lisbon', to: 'calicut' }], regions: [{ id: 'home', iso: 'PT' }] }));
  check(got.places === 2 && got.routes === 1, 'a scene loads with no timeline in the address');
  const total = await page.evaluate(() => window.codegraveFilm.loadShots([{ type: 'fly', to: 'lisbon', duration: 1 }, { type: 'hold', entry: 'lisbon', duration: 2 }, { type: 'highlight', region: 'home', duration: 2 }, { type: 'label', text: 'The sea road', x: 0.5, y: 0.15, duration: 2 },
    { type: 'camera', lat: 20, lng: 35, altitude: 12000, duration: 1 }, { type: 'hold', duration: 2 }, { type: 'route', route: 'gama', icon: 'ship', duration: 2 }, { type: 'marker', place: 'calicut', label: 'Calicut', duration: 2 }], { preset: 'short-question' }));
  check(total === 6, `overlays run during the camera shots: ${total}s`);
  await page.evaluate(() => window.codegraveFilm.prefetch());
  const shot = async (t) => { await page.evaluate((x) => window.codegraveFilm.seek(x), t); return page.screenshot(); };
  const first = await shot(2);
  check(first.readUInt32BE(16) === 1080 && first.readUInt32BE(20) === 1920, `a vertical frame is ${first.readUInt32BE(16)} by ${first.readUInt32BE(20)} pixels`);
  check(await page.evaluate(() => { const c = document.querySelector('#globe .g-card').getBoundingClientRect(); return c.top > 960 * 0.3 && c.bottom <= 960 * (1 - 0.17) + 2 && !!document.querySelector('.film-label'); }), 'the card stands in the lower half, clear of the safe area, with the label up');
  const hash = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
  for (const t of [2, 5]) { const a = hash(await shot(t)); await shot(3.3); const b = hash(await shot(t)); check(a === b, `vertical, with overlays: seek(${t}) twice gives the same frame (${a})`); }
  await page.close();
}
await browser.close(); server.kill();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
