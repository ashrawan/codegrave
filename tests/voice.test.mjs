import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceOf, lineKey, madeOrder, isVoice, isSlow, gpuOk, DEFAULT_VOICE, VOICES } from '../site/voice.js';

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

test('the voices offered are known, and Heart, Michael and the browser voice are offered', () => {
  assert.ok(isVoice(DEFAULT_VOICE) && isVoice('am_michael') && isVoice('device') && !isVoice('Charon') && VOICES.length === 3);
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
