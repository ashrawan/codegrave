/* Keys shared by the build and the page, so both find the same file for an
   entry or a search without asking a server. Pure functions, no browser code. */

// Which detail file (data/d/<key>.json) holds an entry: the first `chars`
// hex digits of a hash of its id. The build picks `chars` from the size of
// the data and writes it to boot.json.
export function shardOf(id, chars) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0').slice(0, chars);
}

// Text as the search compares it: lower case, accents removed.
export function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// The words of a name or a query.
export function tokens(s) {
  return fold(s).split(/[^a-z0-9]+/).filter(Boolean);
}

// Which search file (data/s/<key>.json) lists a word, once the index is too
// big for one file: its first two letters, or the letter and "_" for a
// one-letter word.
export function prefixOf(word) {
  return word.length > 1 ? word.slice(0, 2) : word + '_';
}
