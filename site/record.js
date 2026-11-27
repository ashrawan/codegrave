// Export video: the timeline recorded as it plays, with its voice and music, into one MP4 in the reader's own
// browser (asked for, Nov 2026: "just like export as PDF, you can have the export video", for YouTube later).
// Nothing goes to a server. The browser records this tab (it asks once), the page plays the timeline from the
// beginning in full view, and when play has ended and the last line is said the file is saved.
// It runs in real time: a timeline that plays for three minutes takes three minutes. For exact frames, film
// mode (docs/FILM_MODE.md) renders on a computer instead.
//
// The first half is plain functions with tests (tests/record.test.mjs).

// MP4 first (H.264 and AAC: what YouTube and every player take), WebM where the browser records only that.
export const TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];
export function pickType(ok = (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
  return TYPES.find((t) => { try { return ok(t); } catch (e) { return false; } }) || null;
}
export const extOf = (type) => (/mp4/.test(type || '') ? 'mp4' : 'webm');
export function fileOf(title, type) {
  const base = String(title || 'timeline').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'timeline';
  return `${base}.${extOf(type)}`;
}
export const canRecord = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined' && !!pickType();

// One recording. `audio` is a MediaStream of the page's sound (voice, music, the breath of the cards), `el`
// the part of the page to keep (cropped to it where the browser can), `done(blob, type)` is given the file.
// Returns { stop } once the reader has agreed to share this tab; throws if they did not.
export async function startRecording({ audio, el, done, ended = () => {} }) {
  const type = pickType();
  if (!type) throw new Error('This browser cannot record video. Try Chrome or Edge on a computer.');
  const screen = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser', frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude',
  });
  const [track] = screen.getVideoTracks();
  // Keep only the stage, not the browser's own bars, where the browser can crop a tab to an element.
  try { if (el && window.CropTarget && track.cropTo) await track.cropTo(await CropTarget.fromElement(el)); } catch (e) { /* the whole tab */ }
  const stream = new MediaStream([track, ...(audio ? audio.getAudioTracks() : [])]);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
  const parts = [];
  let over = false;
  rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
  rec.onstop = () => { for (const t of screen.getTracks()) t.stop(); done(new Blob(parts, { type: type.split(';')[0] }), type); };
  // The reader pressed the browser's own "Stop sharing": what was recorded is kept.
  track.addEventListener('ended', () => { if (!over) { over = true; ended(); if (rec.state !== 'inactive') rec.stop(); } });
  rec.start(1000);
  return { type, stop() { if (over) return; over = true; if (rec.state !== 'inactive') rec.stop(); } };
}
