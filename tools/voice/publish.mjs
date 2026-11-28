// Sends the sound made by tools/voice/make.mjs to the public store, with the words, through the function
// `voice-store` (supabase/functions/voice-store). Needs an editor's key: VOICE_ADMIN_KEY.
//
//   VOICE_ADMIN_KEY=... node tools/voice/publish.mjs dinosaurs japan      (--owner, --out as make.mjs)
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, d) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
const owner = opt('--owner', 'wiki'), out = opt('--out', join(root, 'tools/voice/out'));
const only = args.filter((a, i) => !a.startsWith('--') && !String(args[i - 1]).startsWith('--'));
const FN = process.env.VOICE_STORE_URL || 'https://wwgmelafchslapxiccot.supabase.co/functions/v1/voice-store';
const key = process.env.VOICE_ADMIN_KEY;
if (!key) { console.error('Set VOICE_ADMIN_KEY.'); process.exit(1); }

for (const id of only) {
  const vo = JSON.parse(readFileSync(join(root, 'data/community', owner, 'voices', id + '.json'), 'utf8'));
  if (!vo.audio) { console.error('no sound made yet:', id); continue; }
  const mp3 = join(out, owner, id, vo.audio.voice, vo.audio.v, 'voice.mp3');
  if (!existsSync(mp3)) { console.error('missing', mp3); continue; }
  const q = new URLSearchParams({ owner, view: id, voice: vo.audio.voice, v: vo.audio.v });
  for (let go = 0; go < 3; go++) {
    const words = Buffer.from(JSON.stringify(vo)), len = Buffer.alloc(4);
    len.writeUInt32BE(words.length);
    const r = await fetch(`${FN}?${q}`, { method: 'POST', headers: { 'x-admin-key': key, 'Content-Type': 'application/octet-stream' }, body: Buffer.concat([len, words, readFileSync(mp3)]) }).catch((e) => ({ ok: false, status: String(e) }));
    if (r.ok) { console.log(id, await r.json()); break; }
    console.error(id, r.status, r.text ? (await r.text()).slice(0, 300) : '');
  }
}
