import test from 'node:test';
import assert from 'node:assert/strict';
import { schedule, sceneAt, wrap, fileOf, wav, sizeOf, posAt, layout, SILENT, LEAD, GAP, FADE, MOVE } from '../site/export.js';

test('with no voice every entry is up the same while', () => {
  const p = schedule(['a', 'b', 'c']);
  assert.equal(p.cues.length, 0);
  for (const s of p.scenes) assert.ok(Math.abs(s.t1 - s.t0 - SILENT) < 1e-9);
  assert.ok(Math.abs(p.total - 3 * SILENT) < 1e-9);
});

test('a line holds its entry until it is said; the opening and closing go on the first and last', () => {
  const p = schedule(['a', 'b'], { intro: 3, a: 6, b: 5, outro: 2 });
  assert.deepEqual(p.cues.map((c) => c.id), ['intro', 'a', 'b', 'outro']);
  assert.equal(p.cues[0].at, LEAD);
  assert.equal(p.cues[1].at, LEAD + 3 + GAP);
  // No line runs past the end of its scene, and none starts before it.
  for (const c of p.cues) { const s = p.scenes.find((x) => c.at >= x.t0 && c.at < x.t1); assert.ok(s && c.at + c.secs <= s.t1, c.id); }
  assert.equal(p.scenes[1].t0, p.scenes[0].t1);
  assert.equal(p.total, p.scenes[1].t1);
});

test('the scene at a time, fading from the one before', () => {
  const { scenes } = schedule(['a', 'b']);
  assert.deepEqual(sceneAt(scenes, 1), { i: 0, into: 1, fade: 0 });
  const s = sceneAt(scenes, SILENT + FADE / 2);
  assert.equal(s.i, 1); assert.ok(Math.abs(s.fade - 0.5) < 1e-9);
  assert.equal(sceneAt(scenes, 999).i, 1);
});

test('text is wrapped to the width, and cut with an ellipsis', () => {
  const m = (s) => s.length;
  assert.deepEqual(wrap(m, 'one two three four', 9, 3), ['one two', 'three', 'four']);
  assert.deepEqual(wrap(m, 'one two three four five six', 9, 2), ['one two', 'three…']);
  assert.deepEqual(wrap(m, '', 9), []);
});

test('files are named after the timeline; a WAV has its header', () => {
  assert.equal(fileOf('Space Exploration', 'mp4'), 'space-exploration.mp4');
  assert.equal(fileOf('', 'wav'), 'timeline.wav');
  const b = wav([new Float32Array([0, 1, -1]), new Float32Array([0, 0, 0])], 48000), v = new DataView(b);
  assert.equal(b.byteLength, 44 + 3 * 2 * 2);
  assert.equal(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)), 'RIFF');
  assert.equal(v.getUint16(22, true), 2); assert.equal(v.getUint32(24, true), 48000);
  assert.equal(v.getInt16(48, true), 0x7fff); assert.equal(v.getInt16(52, true), -0x8000);
});

test('the three shapes, at 1080 or 720 on the short side, always even', () => {
  assert.deepEqual(sizeOf('wide', 1080), { w: 1920, h: 1080 });
  assert.deepEqual(sizeOf('tall', 1080), { w: 1080, h: 1920 });
  assert.deepEqual(sizeOf('square', 720), { w: 720, h: 720 });
  assert.deepEqual(sizeOf('wide', 720), { w: 1280, h: 720 });
  assert.deepEqual(sizeOf('nonsense'), { w: 1920, h: 1080 });
});

test('on the globe the camera travels at the start of a scene and then rests on its entry', () => {
  const { scenes } = schedule(['a', 'b', 'c']);
  assert.equal(posAt(scenes, 0), -1);                       // the whole globe before the first
  assert.equal(posAt(scenes, scenes[0].t1 - 0.01), 0);
  const m = Math.min(MOVE, SILENT * 0.45);
  assert.ok(Math.abs(posAt(scenes, scenes[1].t0 + m / 2) - 0.5) < 1e-9);
  assert.equal(posAt(scenes, scenes[1].t0 + m + 0.1), 1);
  assert.equal(posAt(scenes, 999), 2);
});

test('the card keeps to one side of the map: the right of a wide frame, the foot of a tall one', () => {
  const wide = layout(1920, 1080, true), tall = layout(1080, 1920, true), full = layout(1920, 1080, false);
  assert.ok(wide.card.x >= 960 && wide.pad.right > 0.3 && wide.pad.bottom === 0);
  assert.ok(tall.card.y >= 960 && tall.pad.bottom > 0.3 && tall.pad.right === 0);
  assert.equal(full.pad, null);
  for (const l of [wide, tall, full, layout(720, 720, true)]) assert.ok(l.card.w > 0 && l.card.h > 0);
});
