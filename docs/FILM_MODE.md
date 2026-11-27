# Film mode

Film mode turns the page into a camera for making videos: a script says what to show, second by
second, and takes exact frames. It is not a feature of the site. No reader sees it, nothing links
to it, and it opens only for a signed-in account that has been switched on for it. For everyone
else a film address is the normal page.

This guide is written for the script (or the AI) that drives it. Everything it needs is here:
the address, the API, the shots, scenes and presets with an example of each style, and the
command line. On a running page, `codegraveFilm.capabilities()` lists every shot type, preset,
look, layer and option that site supports; trust it over this file when they differ.

## How it is kept apart

- All of it lives in `site/film/`. The normal page has one line for it, at the end of
  `site/app.js`: if the address has `?film=1`, fetch `film/boot.js`. Without `?film=1` nothing of
  film mode is fetched. (`site/globe.js` also takes an optional clock and a `drive()` call, which
  only film mode uses.)
- `film/boot.js` looks at who is signed in in this browser and asks whether that account is
  switched on for film mode. Only then is the engine (`film/film.js`) fetched. Signed out, or
  with an account that is not switched on, the page starts normally.
- There is no key and nothing of film mode on the server. It runs in the browser of the person
  using it, on their computer, as their account: it reads what that account may read, and
  `generate()` goes through the site's own generator on that account's daily allowance. The
  switch keeps it out of sight; it is not what protects anything. Private data is protected by
  the database's own rules, which film mode does not touch.
- Film pages carry `noindex,nofollow`, and `robots.txt` closes `/film` and any `?film=` address.
- Film mode writes nothing, with one exception a script must ask for: `generate()` keeps what it
  makes as a **private** timeline of the account (or, with `save: "none"`, nowhere). It never
  publishes, and `regenerate()` refuses a timeline that is not private. A scene is never kept.
  Storage is switched off (only the session may be renewed), and nothing sounds but `play()`.

## The address

```
https://codegrave.com/<owner>/<slug>?film=1&w=1920&h=1080
https://codegrave.com/film?film=1&w=1080&h=1920&preset=short-question      (no timeline: a scene, or generate())
```

| Option | Meaning |
| --- | --- |
| `film=1` | asks for film mode (the account decides) |
| `w`, `h` | the pixels of the stage. Landscape: `1920` by `1080`. Vertical: `1080` by `1920` |
| `dpr` | 1 or 2: multiplies the pixels of the result (`w=1920&dpr=2` is 3840 across) |
| `fps` | 30 (default) or 60 |
| `look` | `atlas` (default), `day`, `dots`, `night` (the Earth's lights at night, NASA's Black Marble) |
| `detail` | `less` (default), `medium`, `full`: how many countries are named and tinted |
| `safe` | `shorts`: keeps cards and the time line clear of the bottom 17% and the right 12%, where a Short's own buttons and words stand. `none` (default) |
| `bg` | `transparent`: nothing behind the globe, the cards and the overlays, for PNGs with alpha |
| `preset` | a style (below); what the address itself says (`look`, `detail`, `safe`) wins over it |
| `seed` | the seed of anything drawn by chance (default 1) |

The timeline is the path: `wiki/japan`, `<username>/<slug>`, or `t/<id>` for one of the account's own.

**Vertical.** A vertical stage is laid out the way the site lays out a phone, so the card stands
under the place and the words are large: at half its pixels, drawn two pixels for one. The film
tool sets the browser up for that. In a script of your own, for `w=1080&h=1920` open the browser
with a viewport of 540 by 960 and a device scale of 2 (times `dpr`); `options.css` says
`{ w, h, scale }`.

## The API: `window.codegraveFilm`

| Call | What it does |
| --- | --- |
| `ready` | a promise: fonts, data and the first tiles of the globe are in |
| `version`, `options`, `capabilities()` | the API version, the options in force, and everything this site supports |
| `getTimeline(slug?)` | the timeline as JSON: entries in order with id, title, date, summary, place, lat/lng and pictures (address, source, author, licence), and `data.spec` for a stored one |
| `loadScene(scene)` | places, routes, regions and labels for this film (below). Kept nowhere. Load it before the shots |
| `loadShots(shots, { preset }?)` | checks every shot and answers the film's length in seconds. Faults are thrown together, each named (`error.errors`) |
| `setLayers({ globe, card, strip, title, clock, overlays })` | which parts are drawn, each `true` or `false`; answers the layers now |
| `prefetch()` | loads the tiles and pictures the whole list needs; answers `{ frames, failed }` |
| `seek(t)` | draws the exact frame at `t` seconds and answers when it is fully drawn |
| `getCues()` | the start and end of every shot (and of each card inside a `step`), with the shot's own `id` |
| `missing()` | what could not be had: a picture, a tile |
| `manifest()` | everything a film can be made of (below) |
| `autoShots({ entries?, durations, open?, picture?, preset? })` | a shot list written for you: `{ shots, total, cues }` |
| `boardFrames({ width }?)` | the middle of every shot: `{ index, type, entry?, t, jpeg }` (see "Taking pictures") |
| `snapshot(t, { w })` | one frame as a large PNG, the same picture `w` pixels across: `{ t, w, h, png }` |
| `play({ audioUrl?, from? })`, `stop()` | plays the film as it runs, keeping to the sound; for looking, not exact |
| `generate({ prompt, model?, effort?, save })` | a timeline from a prompt (below) |
| `regenerate({ slug, prompt })` | asks the generator to change one `generate()` kept |
| `progress()` | how far `generate()` has come: `{ stage, entries, note }`; also the window event `codegrave-film-progress` |

The clock is the script's: nothing on the stage moves unless `seek` says so, and the same `t`
draws the same frame whatever came before.

**Layers.** `globe` (the map and the stars), `card` (cards and their pictures), `strip` (the time
line at the foot), `overlays` are on by default; `title` (the timeline's name, top left) and
`clock` (the year of the entry in front, top right) are off. For a film put together elsewhere,
render the same shots twice: once with only `globe`, once with `bg=transparent` and no `globe`.

**Taking pictures.** A page cannot take a picture of itself, so `boardFrames()` and `snapshot()`
ask whatever drives the page. The film tool answers them. A Playwright script of your own does
the same with `captureHook(page, job)` from `tools/film/film.mjs`, or by giving the page a
function `window.codegraveFilmCapture(o)`: for `{ op: 'shoot', type: 'png' | 'jpeg', quality }`
answer the stage's screenshot as base64; for `{ op: 'scale', scale }` set the device scale.
Without it `boardFrames()` answers the times alone and `snapshot()` throws.

## Shots

A shot list is a JSON list. Every shot has a `type` and a `duration` in seconds, and may have
`start`, `ease` (`smooth`, `linear`, `in`, `out`, `inOut`), `track` and an `id` of your own
(it comes back in `getCues()`). There are two tracks:

- **Camera shots** say where the camera is and which card is up. They follow one another; give
  `start` to leave a gap.
- **Overlays** add to the picture. An overlay with no `start` begins with the camera shot listed
  just before it, so write it under the shot it belongs to. It may outlast that shot.

The schema is `site/film/schema/shots.schema.json`.

A place, wherever a shot asks for one, is an entry's id, the id of a place of the scene, or
`{ lat, lng }` (with `zoom` or `altitude` in km where a camera goes there). A colour is `gold`,
`red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `pink`, `white`, `black`, `grey`
or `#rrggbb`. A region is a country by its name as `manifest()` lists it or its two-letter code
(`"Japan"`, `"JP"`), or a region of the scene by its id.

### Camera shots

- **fly** `{ to, from?, duration }`: travels to a place the short way over the globe, pulling back
  only as far as it must. `zoom`, `shift`, `trail: false`.
- **hold** `{ entry?, card?, picture?, duration }`: rests on an entry with its card up. `card: false`
  for the place alone, `picture: false` for the card without its picture, no `entry` to simply wait.
  `in` and `out` are the seconds the card takes to come and go.
- **camera** `{ lat, lng, altitude | zoom, heading, tilt, duration }`: goes to exactly this view.
  What is left out stays as it was (so the tilt an `orbit` left stays until a shot sets `tilt: 0`).
  A duration of 0 cuts.
- **step** `{ entries, durations }`: through cards one by one like the arrow keys; `durations` is one
  number or one per entry (your voice timings), travel included.
- **orbit** `{ around?, degrees, duration }`: turns round a place, which stays in the middle.
  `tilt` (45), `zoom` or `altitude`, `card: true`. Negative degrees turn the other way.
- **pushIn** `{ place, from?, to?, duration }`: a slow, even move in, for suspense. `from` and `to`
  are heights in km. `tilt`, `heading`, `card: true`.
- **overview** `{ duration }`: back to the whole globe over the middle of the timeline's places.
- **picture** `{ entry, index?, kenBurns?, duration }`: one of the entry's pictures over the whole
  stage, whole, moving slowly. `index` counts from 0 as `manifest()` lists them. `kenBurns`: `in`
  (default), `out`, `left`, `right`, `up`, `down`, or `false`.

An entry with no place is told among the stars or over a dimmed map, as on the site.

### Overlays

- **highlight** `{ region, color?, pulse?, duration }`: a region lit. `opacity`, `outline: false`.
- **route** `{ route | from, to, via?, draw?, icon?, duration }`: a line along the shortest way,
  drawn over the shot's time (less `stay` seconds, for which it stands whole), an icon at its tip:
  `dot`, `plane`, `ship`, `none`. `color`, `width`, `dash`.
- **marker** `{ place, label?, style?, duration }`: `pin` (default), `dot` or `pulse`. `color`.
- **label** `{ text, place? | x?, y?, style?, duration }`: words on a place (they travel with the
  map) or at a spot of the stage (`x`, `y` from 0 to 1). `style`: `plain`, `title`, `caption`,
  `chip`, `quote`. `color`, `size`, `align`. `label: "<id>"` uses a label of the scene.
- **stamp** `{ text, place? | x?, y?, angle?, duration }`: a rubber stamp that hits the stage.
- **compare** `{ region, onto, duration }`: a country's outline carried over the globe onto a place
  or another region at its true size. `travel`, `color`, `opacity`, `ghost: false`.

`timeTravel` (borders by year) is not offered: the site has no borders by year. `capabilities()`
lists a type only when it can be drawn.

## Scenes

A scene is what a script brings for one film: places that are on no timeline, routes, regions
and labels. `loadScene(scene)` checks it and names every fault; it is kept nowhere. With a
timeline in the address the scene adds to it. With none (`/film?film=1`) the places are what the
film is about: each can be flown to and held like an entry, and has a card when it has a
`summary`, a `date` or a `picture`. The schema is `site/film/schema/scene.schema.json`.

```json
{ "places":  [ { "id": "lisbon", "name": "Lisbon", "lat": 38.72, "lng": -9.14, "date": "1497", "summary": "Where the fleet set out." },
               { "id": "cape", "name": "Cape of Good Hope", "lat": -34.36, "lng": 18.47 },
               { "id": "calicut", "name": "Calicut", "lat": 11.26, "lng": 75.78 } ],
  "routes":  [ { "id": "gama", "from": "lisbon", "via": ["cape"], "to": "calicut", "style": { "color": "teal", "icon": "ship" } } ],
  "regions": [ { "id": "home", "iso": "PT", "style": { "color": "green" } },
               { "id": "monsoon", "geojson": { "type": "Polygon", "coordinates": [[[60,0],[90,0],[90,25],[60,25],[60,0]]] } } ],
  "labels":  [ { "id": "title", "text": "The sea road to India", "x": 0.5, "y": 0.12, "style": "title" } ] }
```

## Presets

A preset is a style: `site/film/presets/<name>.json` (schema: `site/film/schema/preset.schema.json`).
It sets the look, the detail, the safe area and the layers, the style of labels, the pace
`autoShots()` keeps, and defaults for shots. A shot's own fields always win. Give it in the
address (`&preset=`), to `loadShots(shots, { preset })`, or as `"preset"` in a job.

| Preset | For | Stage |
| --- | --- | --- |
| `short-question` | a Short that asks one question and answers it fast | vertical, day, safe area, bold words |
| `short-mystery` | a Short that holds back its answer | vertical, night, safe area, quiet captions |
| `long-explainer` | a plain explainer | landscape, atlas, time line and year |
| `long-mystery` | slow and dark | landscape, night |
| `long-map-story` | a story told on the map: routes and regions | landscape, day |
| `long-rise-fall` | the rise and fall of something | landscape, atlas, year large |
| `long-chronicle` | many entries in order | landscape, atlas, time line |

### One example of each style

A Short that asks a question (`short-question`, on `wiki/japan`):

```json
{ "timeline": "wiki/japan", "preset": "short-question", "shots": [
  { "type": "overview", "duration": 1.2 },
  { "type": "label", "text": "Why did Japan move\nits capital?", "x": 0.5, "y": 0.16, "duration": 3 },
  { "type": "fly", "to": "kyoto", "duration": 0.9 },
  { "type": "highlight", "region": "JP", "duration": 2.5 },
  { "type": "hold", "entry": "kyoto", "duration": 4 },
  { "type": "fly", "to": "tokyo", "duration": 0.9 },
  { "type": "route", "from": "kyoto", "to": "tokyo", "icon": "dot", "duration": 0.9 },
  { "type": "hold", "entry": "tokyo", "duration": 4 },
  { "type": "stamp", "text": "1868", "y": 0.3, "duration": 1.5 }
] }
```

A Short that holds back its answer (`short-mystery`):

```json
{ "timeline": "wiki/japan", "preset": "short-mystery", "shots": [
  { "type": "pushIn", "place": "kyoto", "from": 2500, "to": 300, "duration": 5 },
  { "type": "label", "text": "For a thousand years the emperor lived here", "x": 0.5, "y": 0.2, "duration": 4 },
  { "type": "marker", "place": "kyoto", "style": "pulse", "start": 2, "duration": 3 },
  { "type": "hold", "entry": "kyoto", "duration": 5 },
  { "type": "picture", "entry": "kyoto", "kenBurns": "in", "duration": 3 }
] }
```

An explainer (`long-explainer`): cards one by one, timed to the voice.

```json
{ "timeline": "wiki/japan", "preset": "long-explainer", "shots": [
  { "type": "overview", "duration": 2 },
  { "type": "label", "text": "Japan", "x": 0.5, "y": 0.2, "style": "title", "duration": 2 },
  { "type": "step", "entries": ["kyoto", "kinkaku-ji", "tokyo"], "durations": [7.2, 6.4, 8.1] },
  { "type": "picture", "entry": "tokyo", "duration": 3 }
] }
```

A mystery (`long-mystery`): slow moves, the night globe.

```json
{ "timeline": "wiki/japan", "preset": "long-mystery", "shots": [
  { "type": "pushIn", "place": "tokyo", "from": 6000, "to": 800, "duration": 8 },
  { "type": "label", "text": "One city. Thirty-seven million people.", "x": 0.5, "y": 0.82, "style": "caption", "duration": 6 },
  { "type": "orbit", "around": "tokyo", "degrees": 60, "duration": 8 },
  { "type": "hold", "entry": "tokyo", "duration": 6 }
] }
```

A map story (`long-map-story`), from a scene with no timeline (`/film?film=1`, the scene above):

```json
{ "preset": "long-map-story", "shots": [
  { "type": "camera", "lat": 5, "lng": 35, "altitude": 14000, "duration": 0 },
  { "type": "hold", "duration": 8 },
  { "type": "label", "label": "title", "duration": 4 },
  { "type": "highlight", "region": "home", "duration": 8 },
  { "type": "route", "route": "gama", "start": 1.5, "duration": 6.5, "stay": 1.5 },
  { "type": "marker", "place": "calicut", "label": "Calicut", "start": 6, "duration": 2 },
  { "type": "fly", "to": "calicut", "duration": 2 },
  { "type": "hold", "entry": "calicut", "card": false, "duration": 3 }
] }
```

A rise and fall (`long-rise-fall`): a region lit, then how large it really was.

```json
{ "timeline": "wiki/japan", "preset": "long-rise-fall", "shots": [
  { "type": "fly", "to": "kyoto", "duration": 2 },
  { "type": "hold", "entry": "kyoto", "duration": 6 },
  { "type": "camera", "lat": 50, "lng": 12, "altitude": 5000, "tilt": 0, "duration": 2.5 },
  { "type": "hold", "duration": 6 },
  { "type": "compare", "region": "Japan", "onto": "Germany", "duration": 6 },
  { "type": "label", "text": "Japan, laid over Germany", "x": 0.5, "y": 0.86, "style": "chip", "start": 12.5, "duration": 4 }
] }
```

A chronicle (`long-chronicle`): let `autoShots()` write it from the voice timings.

```js
const { shots, total, cues } = await codegraveFilm.autoShots({ durations: [6.2, 7.9, 5.4 /* one per entry */], preset: 'long-chronicle' });
await codegraveFilm.loadShots(shots, { preset: 'long-chronicle' });
```

`autoShots` gives each entry a flight, its card, and (when it has a picture and time enough) the
picture over the stage. Each duration is the whole time that entry has, so entry k begins
exactly where its voice does; `cues` says when. `entries` picks and orders them; `open` adds an
overview first; `picture: false` leaves the pictures out.

## Generating a timeline

```js
const { slug, timeline } = await codegraveFilm.generate({ prompt: 'The rise and fall of the Roman Empire', save: 'private' });
```

`generate` asks the site's own generator, as the account signed in: the same models, the same
answer a reader would get from "Create timeline", and one request of the account's daily
allowance. `save: "private"` (the default) keeps it as a private timeline of the account and
answers its slug (`t/<id>`), which opens in film mode later; `save: "none"` keeps it nowhere and
it lasts as long as the page. It is never public. The page then shows the new timeline.
`model` and `effort` are those `capabilities()` lists. `regenerate({ slug, prompt })` asks for a
change to one that was kept ("add the Byzantine years"); entries that keep their name keep their id.

## The manifest

`manifest()` answers what a film can be made of, to plan shots and to write the credits:

- `entries`: each with `id`, `title`, `date`, `end`, `summary`, `place`, `lat`, `lng`, `country`
  and `pictures` (`index`, `url`, `source`, `author`, `licence`, `width`, `height`, `clear`);
- `unclear`: the pictures whose licence is not plainly free (no Creative Commons licence or
  public domain written). Leave them out, or check them by hand;
- `noPicture`, `noPlace`: entries without one;
- `regions`: `onTimeline` (the countries the entries fall in), `countries` (every country that can
  be lit, with its code) and `scene`; `routes`, `places` and `labels` of the scene.

## The command line

```sh
cd tools/film && npm install && npx playwright install chromium    # once
node tools/film/film.mjs login                                      # once: sign in in the window that opens
node tools/film/film.mjs make <folder>                              # the whole film, stopping for you before the render
```

A job is a folder. What you give:

| File | What |
| --- | --- |
| `film.json` | the settings: `{ "timeline": "wiki/japan", "preset": "long-explainer" }`, or `{ "prompt": "...", "preset": "short-question" }`. Any option below, without the dashes |
| `shots.json` | the shots: a list, or `{ timeline, preset, shots }`. Left out, `make` writes one |
| `scene.json` | a scene (optional) |
| `voice.mp3` | the voice for the whole film (`.wav`, `.m4a` too); or `voice/01.mp3`, `voice/02.mp3` ... one per entry in order (named `03-kyoto.mp3` they also say which entries); or `timings.json`: seconds for each entry |

| Command | What it does |
| --- | --- |
| `generate <folder>` | the timeline from `prompt`: `timeline.json`, kept private, its slug written into `film.json` |
| `manifest <folder>` | `manifest.json`, and `cues.json` when there are shots |
| `shots <folder>` | `shots.json` from the voice timings (`autoShots`); written again when the timings change, never over one written by hand |
| `frames <folder>` | `board/`: one small JPEG from the middle of every shot, `board.json`, `cues.json`; `--stills 3,12.5` adds large PNGs in `stills/` (`--still-w 3840`) |
| `preview <folder>` | plays the film in a window as it runs, with the voice |
| `render <folder>` | `film.mov` (ProRes 422 HQ), `--format mp4`, or `--format png` for a frame sequence. The voice goes in when it is in the folder |
| `make <folder>` | generate (when there is a prompt and no timeline), manifest, shots, board frames; then it stops for you to look. Once the voice is in the folder, run it again and it renders (`--render` renders without a voice) |
| `jobs <folder>` | `make` for every job folder inside, one after another; one that fails does not stop the rest |

Options, on the command line or in `film.json`: `--timeline`, `--prompt`, `--model`, `--effort`,
`--save`, `--preset`, `--base`, `--serve` (film this checkout's `site/`), `--w`, `--h`,
`--vertical`, `--dpr`, `--fps`, `--look`, `--detail`, `--safe`, `--bg transparent`, `--format`,
`--out`, `--from`, `--to`, `--stills`, `--still-w`, `--voice`, `--headed`, `--workers`,
`--again`. A preset for Shorts makes the stage 1080 by 1920 unless `--w` and `--h` say otherwise.

`render` draws every frame with `seek(t)` and joins them with ffmpeg. Several browsers draw at
once (`--workers`, 6 by default on a Mac), each taking the next stretch of frames; a frame
depends only on its time, so the film is the same however many draw it. On a Mac the full
Chromium is used so the globe is drawn by the graphics chip. With `--bg transparent` the frames
are PNGs with alpha, or ProRes 4444 with `--format prores`.

`--mock-auth` answers the account check on this computer with a made-up account. It is for trying
things on built views with nobody signed in; it opens nothing stored and cannot generate.

Checks: `node --test` (the arithmetic, every shot type and preset, scenes, the gate, that the
normal page has no film code) and `node tools/film/check.mjs` (a real browser: requests, the
gate, identical frames, a vertical stage, no writes).

## Adding a shot type

One file in `site/film/shots/`, and a line in `shots/index.js`. A type is an object with
`type`, `track`, `validate(shot, ctx)` (a list of faults in plain words), `prepare(shot, env)`
(worked out once) and `draw(u, F, data, env)`, which writes the frame `F` for `u` from 0 to 1.
`site/film/timeline.js` describes `F`. A camera shot sets the camera and the card; an overlay
pushes a plain fact onto `F.ov`, which `site/film/overlays.js` turns into a shape on the map or
an element over it (a new kind of fact needs its few lines there). A type must be a pure
function of `u`: no clock, no chance, nothing remembered from the frame before. Add it to the
schema, to this guide and to `tests/film.test.mjs`, which fails until all three have it.

## The account

Film mode is switched on per account: the field `film` on the account's row (Supabase, Table
Editor, `profiles`), off for everyone until it is set by hand. An account can write only its
username, so nobody switches it on for themselves.

Everything film mode does, it does as that account: it opens public timelines and the account's
own, and what `generate()` makes is the account's own and counts against its daily allowance
like any other request.

For the tools: `node tools/film/film.mjs login` opens a window on the site; sign in as usual and
it closes. The session is kept in `tools/film/.session.json` (never committed) and every job
starts signed in with it. Delete the file to sign out.
