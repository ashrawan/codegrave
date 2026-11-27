import test from 'node:test';
import assert from 'node:assert/strict';
import { pickType, extOf, fileOf, TYPES } from '../site/record.js';

test('MP4 is chosen where the browser records it, else WebM, else nothing', () => {
  assert.equal(pickType(() => true), TYPES[0]);
  assert.equal(pickType((t) => t === 'video/mp4'), 'video/mp4');
  assert.equal(pickType((t) => t.startsWith('video/webm')), 'video/webm;codecs=vp9,opus');
  assert.equal(pickType(() => false), null);
  assert.equal(pickType(() => { throw new Error('x'); }), null);
});

test('the file is named after the timeline, with the right ending', () => {
  assert.equal(extOf('video/mp4;codecs=avc1'), 'mp4');
  assert.equal(extOf('video/webm'), 'webm');
  assert.equal(fileOf('Space Exploration: the race', 'video/mp4'), 'space-exploration-the-race.mp4');
  assert.equal(fileOf('Café Été', 'video/webm'), 'cafe-ete.webm');
  assert.equal(fileOf('', 'video/mp4'), 'timeline.mp4');
});
