// One MP3 made of several (asked for, Nov 2026: a published timeline's voiceover is one file, like a wiki
// view's). Each line comes from the server voice as an MP3 of its own; MP3 is a run of frames that stand on
// their own, so the lines are joined frame after frame, with frames of silence between them, and nothing is
// encoded again (an encoder would cost the function more time than it has). Plain JavaScript, so the
// function (Deno) and the tests (Node) share it.

const KBPS_1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];   // MPEG-1 Layer III
const KBPS_2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];       // MPEG-2 and 2.5 Layer III
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

// What a frame header says: { len, rate, spf, side } or null when the four bytes at `i` are not one.
function head(b, i) {
  if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bi = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
  if (ver === 1 || layer !== 1 || bi === 0 || bi === 15 || sri === 3) return null;
  const one = ver === 3, rate = RATES[ver][sri], kbps = (one ? KBPS_1 : KBPS_2)[bi], mono = b[i + 3] >> 6 === 3;
  return { len: Math.floor(((one ? 144 : 72) * kbps * 1000) / rate) + pad, rate, spf: one ? 1152 : 576, side: one ? (mono ? 17 : 32) : (mono ? 9 : 17) };
}

// The audio frames of one MP3: { frames: [Uint8Array], rate, spf, first } (`first` is a frame to copy the
// header of). The tags before and after, and the frame that only carries the file's length (Xing, Info,
// VBRI), are left out, since the joined file is one new stream.
export function framesOf(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), out = [];
  let i = 0, rate = 0, spf = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) i = 10 + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127)) + (b[5] & 0x10 ? 10 : 0);
  while (i + 4 <= b.length) {
    const h = head(b, i);
    if (!h || i + h.len > b.length || (rate && h.rate !== rate)) { i++; continue; }
    const f = b.subarray(i, i + h.len), tag = String.fromCharCode(...f.subarray(4 + h.side, 8 + h.side)), vbri = String.fromCharCode(...f.subarray(36, 40));
    if (!out.length && (tag === 'Xing' || tag === 'Info' || vbri === 'VBRI')) { i += h.len; continue; }
    rate = h.rate; spf = h.spf; out.push(f); i += h.len;
  }
  return { frames: out, rate, spf, first: out[0] || null };
}

// A frame of silence shaped like `like`: the lowest bit rate, no padding, no checksum, and all its side
// information zero, so a decoder reads no sound in it.
export function silentFrame(like) {
  const f = new Uint8Array(4);
  f[0] = 0xff; f[1] = like[1] | 1; f[2] = (1 << 4) | (like[2] & 0x0c); f[3] = like[3];
  const h = head(f, 0), out = new Uint8Array(h.len);
  out.set(f);
  return out;
}

// Joins the lines' MP3s, `gap` seconds of silence after each. Answers { mp3, secs, cues } with a
// [start, end] in seconds for each line, or throws when the lines are not one kind of MP3.
export function joinMp3(parts, gap = 0.35) {
  const got = parts.map(framesOf);
  if (!got.length || got.some((g) => !g.frames.length)) throw new Error('a line has no sound');
  const { rate, spf, first } = got[0];
  if (got.some((g) => g.rate !== rate || g.spf !== spf)) throw new Error('the lines are not one kind of MP3');
  const quiet = silentFrame(first), n = Math.max(0, Math.round((gap * rate) / spf)), cues = [], all = [];
  let at = 0;
  for (const g of got) {
    cues.push([+((at * spf) / rate).toFixed(2), +(((at + g.frames.length) * spf) / rate).toFixed(2)]);
    all.push(...g.frames);
    for (let k = 0; k < n; k++) all.push(quiet);
    at += g.frames.length + n;
  }
  const mp3 = new Uint8Array(all.reduce((s, f) => s + f.length, 0));
  let o = 0;
  for (const f of all) { mp3.set(f, o); o += f.length; }
  return { mp3, secs: +((at * spf) / rate).toFixed(2), cues };
}
