// Makes and uploads the sound of every default voiceover that the store does not have yet in its current
// words, one view after another (tools/voice/make.mjs, then tools/voice/publish.mjs). Safe to run on two
// computers at once: each asks the database which views are done before it starts the next one.
//
//   VOICE_ADMIN_KEY=... node tools/voice/all.mjs             (--reverse: from the end of the list)
// Start it several times on one computer to use more of it; VOICE_DEVICE picks the engine (cpu by default).
import { readFileSync, readdirSync, openSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { versionOf } from './version.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = join(root, 'data/community/wiki/voices');
const REST = 'https://wwgmelafchslapxiccot.supabase.co/rest/v1/view_voices?owner=eq.wiki&select=view,audio';
const ANON = 'sb_publishable_IykysSfgNLw4CfaqxP2CqA_YNcfq0SW';
const voice = 'af_heart';
let ids = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
if (process.argv.includes('--reverse')) ids.reverse();

const done = async () => {
  const r = await fetch(REST, { headers: { apikey: ANON } });
  return new Map((await r.json()).filter((x) => x.audio).map((x) => [x.view, x.audio.v]));
};
for (const id of ids) {
  const vo = JSON.parse(readFileSync(join(dir, id + '.json'), 'utf8'));
  const v = versionOf(voice, vo.lines);
  if ((await done()).get(id) === v) continue;
  // Several runs on one computer share the work: a view is taken by making its claim file first.
  const claims = join(root, 'tools/voice/out/claims');
  mkdirSync(claims, { recursive: true });
  try { openSync(join(claims, `${id}-${v}`), 'wx'); } catch (e) { continue; }
  console.log(new Date().toISOString().slice(11, 16), id);
  execFileSync('node', [join(root, 'tools/voice/make.mjs'), id], { stdio: 'inherit' });
  execFileSync('node', [join(root, 'tools/voice/publish.mjs'), id], { stdio: 'inherit' });
}
console.log('all done');
