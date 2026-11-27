import test from 'node:test';
import assert from 'node:assert/strict';
import { parts, pcmOf, pauses, cuts, toldPace, voiceOf, PART_LINES } from '../site/voice.js';

const RATE = 24000;
// Speech stood in for by a tone: [seconds of sound, seconds of quiet, ...].
function speech(spans) {
  const n = Math.round(spans.reduce((s, v) => s + v, 0) * RATE), pcm = new Int16Array(n);
  let i = 0;
  spans.forEach((secs, k) => {
    const m = Math.round(secs * RATE);
    if (k % 2 === 0) for (let j = 0; j < m; j++) pcm[i + j] = Math.round(9000 * Math.sin(j * 0.11) * (0.6 + 0.4 * Math.sin(j * 0.0021)));
    i += m;
  });
  return pcm;
}
const secs = (c) => c.map(([a, b]) => [Math.round(a / RATE * 10) / 10, Math.round(b / RATE * 10) / 10]);

test('lines are shared out into parts no longer than asked', () => {
  const lines = Array.from({ length: 14 }, (_, i) => ({ id: 'e' + i, text: 'x'.repeat(100) }));
  const p = parts(lines);
  assert.equal(p.flat().length, 14);
  assert.ok(p.every((x) => x.length <= PART_LINES));
  assert.deepEqual(parts([{ id: 'a', text: 'x'.repeat(700) }, { id: 'b', text: 'x'.repeat(200) }]).map((x) => x.length), [1, 1]);
});

test('a WAV file and bare samples read the same', () => {
  const pcm = Int16Array.from([1, -2, 300, -32768, 32767]);
  const raw = new Uint8Array(pcm.buffer.slice(0));
  const wav = new Uint8Array(44 + raw.length), dv = new DataView(wav.buffer);
  wav.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0); wav.set([...'WAVEfmt '].map((c) => c.charCodeAt(0)), 8);
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 16000, true);
  wav.set([...'data'].map((c) => c.charCodeAt(0)), 36); dv.setUint32(40, raw.length, true); wav.set(raw, 44);
  assert.deepEqual([...pcmOf(wav).pcm], [...pcm]);
  assert.equal(pcmOf(wav).rate, 16000);
  assert.deepEqual([...pcmOf(raw).pcm], [...pcm]);
  assert.equal(pcmOf(raw).rate, 24000);
});

test('the pauses of a piece of speech are found', () => {
  const p = pauses(speech([1, 0.5, 1, 0.1, 1]), RATE);
  assert.equal(p.length, 1);
  assert.ok(Math.abs(p[0][0] / RATE - 1) < 0.03 && Math.abs(p[0][1] / RATE - 1.5) < 0.03);
});

test('lines are cut at the long pauses, not at a breath inside a line', () => {
  // Three lines; the first and the second have a breath in them, as long as a short pause.
  const pcm = speech([0.2, 0.3, 3, 0.8, 2, 0.3, 2, 0.9, 3, 0.4]);
  assert.deepEqual(secs(cuts(pcm, RATE, [60, 80, 60])), [[0, 3.6], [4.2, 8.7], [9.4, 12.6]]);
});

test('with too few pauses the lines are cut by their share', () => {
  const pcm = speech([0, 0, 6]);
  const c = cuts(pcm, RATE, [10, 10, 10]);
  assert.equal(c.length, 3);
  assert.ok(Math.abs(c[1][0] / RATE - 2) < 0.2 && Math.abs(c[2][0] / RATE - 4) < 0.2);
  assert.equal(cuts(pcm, RATE, [10]).length, 1);
});

test('play goes no faster than the line, waits for it, and goes on at its own pace after', () => {
  assert.equal(toldPace(0.3, 0.2, 0), 0.3);             // nothing being said: the usual pace
  assert.equal(toldPace(0.3, 0, 1), 0.3);               // a short line: never faster than usual
  assert.ok(Math.abs(toldPace(0.3, 0, 6.75) - 0.1) < 1e-9);   // a long one: there as it ends
  assert.equal(toldPace(0.3, 0.7, 2), 0);               // not over when the card would go: wait
});

test('a stored voiceover is read, and a broken one is none', () => {
  assert.equal(voiceOf(null), null);
  assert.equal(voiceOf({ base: 'a/', lines: [{ id: 'x', text: 'Hi' }] }), null);
  assert.equal(voiceOf({ at: 1, base: 'a/', lines: [{ id: 'x', text: 'Hi', src: '1-0.mp3', secs: 2 }, { id: 'y' }] }).lines.length, 1);
});
