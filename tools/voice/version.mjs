// The version of a voiceover's sound: a hash of the voice and every line's words (make.mjs names files by it).
import { createHash } from 'node:crypto';
export const sayText = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 700);
export const versionOf = (voice, lines) => createHash('sha256').update(voice + '\n' + lines.map((l) => l.id + '\t' + sayText(l.text)).join('\n')).digest('hex').slice(0, 12);
