// Makes the sound of default voiceovers (docs/VIEWS.md, "A default voiceover"): for each view named, every
// line of data/community/<owner>/voices/<view>.json is said by Kokoro, the voice the page itself uses, and the
// lines are joined into one MP3 with a short silence between them. Where each line starts and ends is written
// back into the voices file as `audio`, so the page can fetch the one file and play each card's part of it.
//
//   cd tools/voice && npm install --onnxruntime-node-install-cuda=skip      once (needs ffmpeg too)
//   node tools/voice/make.mjs dinosaurs japan          these views
//   node tools/voice/make.mjs                          every view whose words changed since its sound was made
//   ... --voice am_michael   another voice than Heart      --owner <name>   another folder than wiki
//   ... --out <dir>          where the MP3s go (default tools/voice/out, which git ignores)
//
// The file is out/<owner>/<view>/<voice>/<v>/voice.mp3, the same path it has in the store; `v` is a hash of the
// voice and the words, so new words are a new file and an old address never changes what it says.
// tools/voice/publish.mjs sends them.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sayText, versionOf } from './version.mjs';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, d) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
const owner = opt('--owner', 'wiki'), voice = opt('--voice', 'af_heart'), out = opt('--out', join(root, 'tools/voice/out'));
const only = args.filter((a, i) => !a.startsWith('--') && !String(args[i - 1]).startsWith('--'));
const RATE = 24000, GAP = 0.35, KBPS = 48;


const dir = join(root, 'data/community', owner, 'voices');
const fileOf = (id) => join(dir, id + '.json');
const todo = (only.length ? only : readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)))
  .filter((id) => {
    if (!existsSync(fileOf(id))) { console.error('no words for', id); return false; }
    const vo = JSON.parse(readFileSync(fileOf(id), 'utf8'));
    return only.length || vo.audio?.voice !== voice || vo.audio?.v !== versionOf(voice, vo.lines);
  });
const warm = args.includes('--warm');   // only fetch the model, once, before several runs start side by side
if (!todo.length && !warm) { console.log('nothing to make'); process.exit(0); }

const { KokoroTTS } = await import('kokoro-js');
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX', THREADS = +process.env.VOICE_THREADS || 0;
let tts;
if (THREADS) {
  // Several runs side by side (the Mac script): each keeps to its share of the processor's cores.
  const { StyleTextToSpeech2Model, AutoTokenizer } = await import('@huggingface/transformers');
  const model = await StyleTextToSpeech2Model.from_pretrained(MODEL, { dtype: 'fp32', device: 'cpu', session_options: { intraOpNumThreads: THREADS, interOpNumThreads: 1 } });
  tts = new KokoroTTS(model, await AutoTokenizer.from_pretrained(MODEL));
} else tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'fp32', device: process.env.VOICE_DEVICE || 'cpu' });
if (warm) { console.log('model ready'); process.exit(0); }

for (const id of todo) {
  const vo = JSON.parse(readFileSync(fileOf(id), 'utf8')), v = versionOf(voice, vo.lines), t0 = Date.now();
  const parts = [], cues = [];
  let at = 0;
  for (const l of vo.lines) {
    const got = await tts.generate(sayText(l.text), { voice });
    if (got.sampling_rate !== RATE) throw new Error('unexpected rate ' + got.sampling_rate);
    cues.push([+(at / RATE).toFixed(2), +((at + got.audio.length) / RATE).toFixed(2)]);
    parts.push(got.audio, new Float32Array(Math.round(GAP * RATE)));
    at += got.audio.length + Math.round(GAP * RATE);
  }
  // 16-bit samples to ffmpeg, which writes the MP3: one channel, the voice's own rate.
  const pcm = Buffer.alloc(at * 2);
  let o = 0;
  for (const p of parts) for (let i = 0; i < p.length; i++, o += 2) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(p[i] * 32767))), o);
  const to = join(out, owner, id, voice, v);
  rmSync(join(out, owner, id, voice), { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 's16le', '-ar', String(RATE), '-ac', '1', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', KBPS + 'k', join(to, 'voice.mp3')], { input: pcm, maxBuffer: 1 << 30 });
  vo.audio = { voice, v, secs: +(at / RATE).toFixed(2), cues };
  // The file keeps its shape: a line a row, and the cues on one row.
  const text = '{\n  "style": ' + JSON.stringify(vo.style || '') + ',\n'
    + `  "audio": { "voice": ${JSON.stringify(voice)}, "v": ${JSON.stringify(v)}, "secs": ${vo.audio.secs}, "cues": ${JSON.stringify(cues)} },\n`
    + '  "lines": [\n' + vo.lines.map((l) => `    { "id": ${JSON.stringify(l.id)}, "text": ${JSON.stringify(l.text)} }`).join(',\n') + '\n  ]\n}\n';
  writeFileSync(fileOf(id), text);
  console.log(id, vo.lines.length, 'lines,', Math.round(at / RATE), 's of sound, made in', Math.round((Date.now() - t0) / 1000), 's');
}
