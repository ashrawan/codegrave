# Film mode

Film mode turns the page into a camera for making videos: a script says what to show, second by
second, and takes exact frames. It is not a feature of the site. No reader sees it, nothing links
to it, and it opens only for a signed-in account that has been switched on for it. For everyone
else a film address is the normal page.

This guide is written stage by stage. **Stage 1** is here: the clock, `seek(t)`, the shot types
`fly`, `hold`, `camera` and `step`, and the `render` command, in landscape. Vertical video,
presets, layers, generating, runtime scenes and the other shot types follow; ask
`capabilities()` what a site supports.

## How it is kept apart

- All of it lives in `site/film/`. The normal page has one line for it, at the end of
  `site/app.js`: if the address has `?film=1`, fetch `film/boot.js`. Without `?film=1` nothing of
  film mode is fetched. (`site/globe.js` also takes an optional clock and a `drive()` call, which
  only film mode uses.)
- `film/boot.js` looks at who is signed in in this browser and asks whether that account is
  switched on for film mode. Only then is the engine (`film/film.js`) fetched. Signed out, or
  with an account that is not switched on, the page starts normally.
- There is no key and nothing of film mode on the server. It runs in the browser of the person
  using it, on their computer, as their account: it reads what that account may read and (from
  stage 3) generates through the site's own generator on that account's daily allowance. The
  switch keeps it out of sight; it is not what protects anything. Private data is protected by
  the database's own rules, which film mode does not touch.
- Film pages carry `noindex,nofollow`, and `robots.txt` closes `/film` and any `?film=` address.
- Film mode writes nothing: storage is switched off (only the session may be renewed), no sound
  is made, nothing is sent anywhere.

## The address

```
https://codegrave.com/<owner>/<slug>?film=1&w=1920&h=1080
```

| Option | Meaning |
| --- | --- |
| `film=1` | asks for film mode (the account decides) |
| `w`, `h` | the stage in CSS pixels; give the browser window the same size |
| `dpr` | 1 or 2: the pixels of the result are `w × dpr` by `h × dpr`. Set the browser's device scale to match (the command line does) |
| `fps` | 30 (default) or 60 |
| `look` | `atlas` (default), `day`, `dots` |
| `detail` | `less` (default), `medium`, `full` |
| `seed` | the seed of anything drawn by chance (default 1) |

The timeline is the path: `wiki/japan`, `<username>/<slug>`, or `t/<id>` for one of the account's own.

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
node tools/film/film.mjs login                                      # once: sign in in the window that opens
node tools/film/film.mjs render <folder>                            # <folder>/shots.json -> <folder>/film.mov
```

`render` opens the timeline in a browser on this computer, prefetches, draws every frame with
`seek(t)` and joins them with ffmpeg into ProRes 422 HQ (`--format mp4` for a high-bitrate MP4,
`--format png` for a frame sequence). The options are listed at the top of `tools/film/film.mjs`:
`--timeline`, `--base`, `--serve` (film this checkout's `site/`), `--w`, `--h`, `--dpr`, `--fps`,
`--look`, `--detail`, `--from`, `--to`, `--headed`, `--workers`.

Several browsers draw at once (`--workers`, 6 by default on a Mac), each taking the next stretch of
frames; a frame depends only on its time, so the film is the same however many draw it. On a Mac
the full Chromium is used so the globe is drawn by the graphics chip.

`--mock-auth` answers the account check on this computer with a made-up account. It is for trying
things on built views with nobody signed in; it opens nothing stored, because it reaches no database.

Checks: `node --test` (the arithmetic, the gate, that the normal page has no film code) and
`node tools/film/check.mjs` (a real browser: requests, the gate, identical frames, no writes).

## Adding a shot type

One file in `site/film/shots/`, and a line in `shots/index.js`. A type is an object with
`type`, `track`, `validate(shot, ctx)` (a list of faults in plain words), `prepare(shot, env)`
(worked out once) and `draw(u, F, data, env)`, which writes the frame `F` for `u` from 0 to 1.
`site/film/timeline.js` describes `F`. A type must be a pure function of `u`: no clock, no chance,
nothing remembered from the frame before. Add it to the schema and to `tests/film.test.mjs`.

## The account

Film mode is switched on per account: the field `film` on the account's row (Supabase, Table
Editor, `profiles`), off for everyone until it is set by hand. An account can write only its
username, so nobody switches it on for themselves.

Everything film mode does, it does as that account: it opens public timelines and the account's
own, and what `generate()` makes (stage 3) is the account's own and counts against its daily
allowance like any other request.

For the tools: `node tools/film/film.mjs login` opens a window on the site; sign in as usual and
it closes. The session is kept in `tools/film/.session.json` (never committed) and every render
starts signed in with it. Delete the file to sign out.
