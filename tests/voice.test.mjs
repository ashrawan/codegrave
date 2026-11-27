import test from 'node:test';
import assert from 'node:assert/strict';
import { gpuPick, voiceOf, lineKey, madeOrder, isVoice, isSlow, gpuOk, stretch, voiceRate, DEFAULT_VOICE, VOICES } from '../site/voice.js';

test('a stored voiceover is read, and a broken one is none', () => {
  assert.equal(voiceOf(null), null);
  assert.equal(voiceOf({ lines: [] }), null);
  assert.equal(voiceOf({ lines: [{ id: 'x', text: '  ' }] }), null);
  const v = voiceOf({ at: 1, voice: 'am_michael', lines: [{ id: 'x', text: 'Hi' }, { id: 'y' }] });
  assert.equal(v.lines.length, 1);
  assert.equal(v.voice, 'am_michael');
  // A voice that is not offered (an older one) falls back to the first.
  assert.equal(voiceOf({ voice: 'Charon', lines: [{ id: 'x', text: 'Hi' }] }).voice, DEFAULT_VOICE);
});

test('the voices offered are known, and six Kokoro voices and the browser voice are offered', () => {
  assert.ok(isVoice(DEFAULT_VOICE) && isVoice('am_michael') && isVoice('device') && !isVoice('Charon') && VOICES.length === 7);
  assert.equal(new Set(VOICES.map((v) => v[0])).size, VOICES.length);
});

test('a line is kept under its voice and its words', () => {
  assert.equal(lineKey('af_heart', 'Hello there'), lineKey('af_heart', 'Hello there'));
  assert.notEqual(lineKey('af_heart', 'Hello there'), lineKey('bm_george', 'Hello there'));
  assert.notEqual(lineKey('af_heart', 'Hello there'), lineKey('af_heart', 'Hello where'));
  assert.match(lineKey('af_heart', 'x'), /^https:\/\//);
});

test('lines are made from where play starts, then the ones before', () => {
  assert.deepEqual(madeOrder(['intro', 'a', 'b', 'outro'], 'b'), ['b', 'outro', 'intro', 'a']);
  assert.deepEqual(madeOrder(['intro', 'a'], undefined), ['intro', 'a']);
});

test('a device slower than real time is warned about', () => {
  assert.equal(isSlow(null), false);
  assert.equal(isSlow(0.6), false);
  assert.equal(isSlow(2), true);
});

test('without WebGPU the faster voice is not offered', async () => {
  assert.equal(await gpuOk(), false);
});

test('speech is made quicker or slower to length, and left alone at 1x', () => {
  const sr = 24000, x = new Float32Array(sr * 2);
  for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.5;
  assert.equal(stretch(x, 1, sr), x);
  assert.equal(stretch(x, 1.5, sr).length, Math.floor(x.length / 1.5));
  assert.equal(stretch(x, 0.8, sr).length, Math.floor(x.length / 0.8));
  // The pitch is kept: a 220 Hz tone still crosses zero about 440 times a second.
  const y = stretch(x, 1.5, sr); let z = 0;
  for (let i = sr / 10; i < y.length - sr / 10; i++) if ((y[i - 1] < 0) !== (y[i] < 0)) z++;
  const hz = z / 2 / ((y.length - sr / 5) / sr);
  assert.ok(Math.abs(hz - 220) < 8, 'pitch ' + hz);
  assert.equal(voiceRate(2), 1.6); assert.equal(voiceRate(0.25), 0.7); assert.equal(voiceRate(1), 1);
});

test('the graphics card is used where there is one, unless the reader turned it off', () => {
  assert.equal(gpuPick(null, true), true);
  assert.equal(gpuPick(null, false), false);
  assert.equal(gpuPick(false, true), false);
  assert.equal(gpuPick(true, false), true);
});
