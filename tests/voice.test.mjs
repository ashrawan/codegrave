import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceOf, lineKey, madeOrder, isVoice, DEFAULT_VOICE, VOICES } from '../site/voice.js';

test('a stored voiceover is read, and a broken one is none', () => {
  assert.equal(voiceOf(null), null);
  assert.equal(voiceOf({ lines: [] }), null);
  assert.equal(voiceOf({ lines: [{ id: 'x', text: '  ' }] }), null);
  const v = voiceOf({ at: 1, voice: 'bm_george', lines: [{ id: 'x', text: 'Hi' }, { id: 'y' }] });
  assert.equal(v.lines.length, 1);
  assert.equal(v.voice, 'bm_george');
  // A voice that is not offered (an older one) falls back to the first.
  assert.equal(voiceOf({ voice: 'Charon', lines: [{ id: 'x', text: 'Hi' }] }).voice, DEFAULT_VOICE);
});

test('the voices offered are known, and the device voice is among them', () => {
  assert.ok(isVoice(DEFAULT_VOICE) && isVoice('device') && !isVoice('Charon'));
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
