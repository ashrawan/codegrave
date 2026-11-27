# Film mode

Film mode turns the page into a camera for making videos: a script says what to show, second by
second, and takes exact frames. It is not a feature of the site. No reader sees it, nothing links
to it, and a page opened without the key behaves exactly as it always does.

This guide is written stage by stage. **Stage 1** is here: the clock, `seek(t)`, the shot types
`fly`, `hold`, `camera` and `step`, and the `render` command, in landscape. Vertical video,
presets, layers, generating, runtime scenes and the other shot types follow; ask
`capabilities()` what a site supports.

## How it is kept apart

- All of it lives in `site/film/`. The normal page has one line for it, at the end of
  `site/app.js`: if the address has `?film=1`, fetch `film/boot.js`. Without `?film=1` nothing of
  film mode is fetched. (`site/globe.js` also takes an optional clock and a `drive()` call, which
  only film mode uses.)
- `film/boot.js` reads the key from after the `#` (`#k=<key>`), takes it out of the address at
  once, and asks the Supabase function `film-auth` whether it is right. Only then is the engine
  (`film/film.js`) fetched. With no key or a wrong one the page starts normally.
- The code is public. What is protected is data: private timelines (and, from stage 3, the
  generator) are reached only through `film-auth`, which wants the short-lived token it gave for
  the key and the signed-in account ("The account" below).
- Film pages carry `noindex,nofollow`, and `robots.txt` closes `/film` and any `?film=` address.
- Film mode writes nothing: storage is switched off, no sound is made, nothing is sent anywhere.

## The address

```
https://codegrave.com/<owner>/<slug>?film=1&w=1920&h=1080#k=<key>
```

| Option | Meaning |
| --- | --- |
| `film=1` | asks for film mode (the key decides) |
| `w`, `h` | the stage in CSS pixels; give the browser window the same size |
| `dpr` | 1 or 2: the pixels of the result are `w × dpr` by `h × dpr`. Set the browser's device scale to match (the command line does) |
| `fps` | 30 (default) or 60 |
| `look` | `atlas` (default), `day`, `dots` |
| `detail` | `less` (default), `medium`, `full` |
| `seed` | the seed of anything drawn by chance (default 1) |

The timeline is the path: `wiki/japan`, `<username>/<slug>`, or `t/<id>` for a private one.

## The API: `window.codegraveFilm`

| Call | What it does |
| --- | --- |
| `ready` | a promise: fonts, data and the first tiles of the globe are in |
| `version`, `capabilities()` | the API version, and every shot type, ease, look and option this site supports |
| `getTimeline(slug?)` | the timeline as JSON: entries in order with id, title, date, summary, place, lat/lng and pictures (address, source, author, licence), and `data.spec` for a stored one |
| `loadShots(shots)` | checks every shot and answers the film's length in seconds. Faults are thrown together, each named (`error.errors`) |
| `prefetch()` | loads the tiles and pictures the whole list needs; answers `{ frames, failed }` |
| `seek(t)` | draws the exact frame at `t` seconds and answers when it is fully drawn |
| `getCues()` | the start and end of every shot (and of each card inside a `step`) |
| `missing()` | what could not be had: a picture, a tile |

The clock is the script's: nothing on the stage moves unless `seek` says so, and the same `t`
draws the same frame whatever came before.

## Shots

A shot list is a JSON list. Every shot has a `type` and a `duration` in seconds, and may have
`start`, `ease` (`smooth`, `linear`, `in`, `out`, `inOut`) and `track`. Camera shots follow one
another; give `start` to leave a gap. The schema is `site/film/schema/shots.schema.json`.

```json
{ "timeline": "wiki/japan", "shots": [
  { "type": "fly", "to": "kyoto", "duration": 2.5 },
  { "type": "hold", "entry": "kyoto", "duration": 4 },
  { "type": "step", "entries": ["kinkaku-ji", "tokyo"], "durations": [5.2, 6.1] },
  { "type": "camera", "lat": 35.36, "lng": 138.73, "altitude": 300, "heading": 30, "tilt": 45, "duration": 3 }
] }
```

- **fly** `{ to, from?, duration }`: travels to an entry (by id) or a place (`{ lat, lng, zoom | altitude }`),
  the short way over the globe, pulling back only as far as it must. `zoom`, `shift`, `trail: false`.
- **hold** `{ entry?, card?, picture?, duration }`: rests on an entry with its card up. `card: false`
  for the place alone, `picture: false` for the card without its picture, no `entry` to simply wait.
  `in` and `out` are the seconds the card takes to come and go.
- **camera** `{ lat, lng, altitude | zoom, heading, tilt, duration }`: goes to exactly this view.
  What is left out stays as it was. A duration of 0 cuts.
- **step** `{ entries, durations }`: through cards one by one like the arrow keys; `durations` is one
  number or one per entry (your voice timings), travel included.

An entry with no place is told among the stars or over a dimmed map, as on the site.

## The command line

```sh
cd tools/film && npm install && npx playwright install chromium    # once
cp .env.example .env                                               # put FILM_KEY in it
node tools/film/film.mjs render <folder>                            # <folder>/shots.json -> <folder>/film.mov
```

`render` opens the timeline in a browser on this computer, prefetches, draws every frame with
`seek(t)` and joins them with ffmpeg into ProRes 422 HQ (`--format mp4` for a high-bitrate MP4,
`--format png` for a frame sequence). The options are listed at the top of `tools/film/film.mjs`:
`--timeline`, `--base`, `--serve` (film this checkout's `site/`), `--w`, `--h`, `--dpr`, `--fps`,
`--look`, `--detail`, `--from`, `--to`, `--headed`.

`--mock-auth` answers the key check on this computer. It is for trying things on built views
without a key; it opens nothing private, because private data is checked on the server.

Checks: `node --test` (the arithmetic, the gate, that the normal page has no film code) and
`node tools/film/check.mjs` (a real browser: requests, keys, identical frames, no writes).

## Adding a shot type

One file in `site/film/shots/`, and a line in `shots/index.js`. A type is an object with
`type`, `track`, `validate(shot, ctx)` (a list of faults in plain words), `prepare(shot, env)`
(worked out once) and `draw(u, F, data, env)`, which writes the frame `F` for `u` from 0 to 1.
`site/film/timeline.js` describes `F`. A type must be a pure function of `u`: no clock, no chance,
nothing remembered from the frame before. Add it to the schema and to `tests/film.test.mjs`.

## The account

The key says film mode may be used; the account signed in says for whom. The page sends its
session with the key, and the token that comes back carries that account. It opens public
timelines and that account's own private ones, never another account's, and what `generate()`
makes (stage 3) is that account's own and counts against its daily allowance like any other
request. With nobody signed in, only public timelines and built views open.

For the tools: `node tools/film/film.mjs login` opens a window on the site; sign in as usual and
it closes. The session is kept in `tools/film/.session.json` (never committed) and every render
starts signed in with it. Delete the file to sign out.

## The key

`FILM_KEY` is a secret of the Supabase function `film-auth` (Supabase, Edge Functions, Secrets)
and a line in `tools/film/.env` on the computer that renders. It is never in the repository and
never in the page. Use at least 20 random characters, for example `openssl rand -base64 32`.

To rotate it: set a new value in Supabase and in `.env`. Tokens are signed with a key made from
it, so every token given for the old key stops working at once. Every call of `film-auth` is
logged, and wrong keys are limited to a few a minute.
