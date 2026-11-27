# Guide for AI agents and new developers

Read this first. It is the whole map; you should not need to open many files
to make a correct change.

## What this is

codegrave.com is one page: a timeline of everything, from its start to its
end. It is drawn in depth, as a road that time runs along into the screen,
and you travel it. It is an encyclopedia drawn in time: people, places, organisations, events, works,
ideas, living things, the Earth and the sky, and technology, with computing
as the oldest and deepest shelf. There is no framework, no package manager
and nothing to install. You need Node 22.

The data has two layers:

- **The base** (`data/base/`): one reviewed file per entry. Every view draws
  on it, so a fact is written once.
- **Community folders** (`data/community/<github-name>/`): what one person or
  group publishes. A view is one subject under a plain name ("Ancient Egypt",
  "US Presidents", "Video Games"): a hand-picked list of entries, and
  chapters. The folder `wiki` belongs to the editors, so their
  views live at `codegrave.com/wiki/<view>`. Classical views live at
  `codegrave.com/classical/<view>`; `wiki` and `classical` are reserved names.

## Commands

```sh
node scripts/build.mjs --check      # check all data; must print "0 errors"
node scripts/build.mjs              # also write site/data/ so the page can load
node --test                         # run the tests
node scripts/serve.mjs 8080                     # view the page (view paths such as /wiki/<id> work)
node scripts/new.mjs entry <kind> <id> "<Name>" <born-date>
node scripts/new.mjs view <github-name> <id> "<Title>"
```

## Where things are

| You want to change | Edit | Do not edit |
| --- | --- | --- |
| A fact about an entry | `data/base/<kind>/<id>.json` (one file) | `site/data/` (generated) |
| A view | `data/community/<owner>/views/<id>.json` (one file) | another person's folder |
| An entry the base lacks, for your own view | `data/base/` in the same pull request, or `data/community/<owner>/entries/<id>.json` | |
| The default views, and the topics the panel lists views under | `data/editors-choice.json` | |
| The map (branches and their kinds, which are the folders of `data/base/`) | `data/categories.json` | |
| Labels | `data/labels.json` | |
| An old address that must keep working | `data/redirects.json` | |
| An icon or image | `data/media/`, then name it on the entry or event | `site/data/media/` (generated) |
| The pictures and films beside the road | An entry's own: `media` on the entry. The stand-ins, era by era: `data/wall.json` (`docs/WALL.md`) | |
| How ranking works | `site/rank.js`, then `tests/rank.test.mjs` and `docs/DATA_RULES.md` | |
| What the build writes for the page | `scripts/build.mjs`, then `docs/BUILD.md` and `tests/build.test.mjs` | |
| What search engines and link previews read (title, description, Open Graph, `robots.txt`, the sitemap) | The `page meta` block in `site/index.html`, `site/robots.txt`, `writePages()` in `scripts/build.mjs` | `site/_redirects`, `site/sitemap.xml` (generated) |
| How the page looks or behaves | `site/app.js`, `site/styles.css`, `site/index.html` | |
| The bar on the left, signing in, and the timelines people keep | `site/account.js`, `site/account.css`, then `tests/account.test.mjs` and `docs/ACCOUNTS.md` | |
| Open in editor (a timeline of one's own as rows, the road live beside it) | `site/editor.js`, `site/editor.css`; the date reading and checks in `site/ai.js`, then `tests/ai.test.mjs` and `docs/ACCOUNTS.md` | |
| The full picture (a picture in the panel opened over the page) | `site/picture.js`, its styles at the end of `site/styles.css` | |
| Voiceover (a timeline told aloud: the script, the voices, the speech made in the browser, how play waits for a line) | `site/voice.js` (the voices, the speaker and the player), `site/account.js` (making one), `site/app.js` (`tell()`), then `tests/voice.test.mjs` and `docs/ACCOUNTS.md`; the server side is `supabase/functions/voiceover/index.ts`, deployed to the Supabase project | |
| Create with AI (the prompt page, the models offered, what a model must write and how it becomes a view file) | `site/ai.js` and `site/account.js`, then `tests/ai.test.mjs`; the server side is `supabase/functions/ai-timeline/index.ts`, deployed to the Supabase project | |
| The database (tables, who may read and write what) | A new file in `supabase/migrations/`, applied to the Supabase project | a migration that has been applied |
| Export video (the timeline drawn and encoded into one file in the browser: video, voiceover, or both) | `site/export.js`, `exportVideo()` in `site/app.js`, `videoMenu()` in `site/account.js`, then `tests/export.test.mjs` | |
| The printable export ("Export as PDF") | `site/print.js`, `site/print.css`, `site/print.html`, then `tests/print.test.mjs` | |
| The arithmetic of the road (its scale, which stretches busy periods; sizes in depth, tracks, which names fit and in what order, how a card opens, turns during play, the years) | `site/road.js`, then `tests/road.test.mjs` | |
| The globe (the timeline on the Earth, the only way it is drawn): the map, pins, cards, the strip of rows | `site/globe.js`; its arithmetic (camera heights, arcs, when to dim or go to space) in `site/globe-path.js`, then `tests/globe.test.mjs` | |
| Where entries are on the Earth | `node scripts/places.mjs` writes `data/places.json` from Wikidata | `data/places.json` by hand |
| Film mode (frames for videos, driven by a script; hidden, only for signed-in accounts switched on for it with `film` on their row, never for a reader; no key and nothing of its own on the server) | `site/film/`, `tools/film/`, then `tests/film.test.mjs` and `docs/FILM_MODE.md`. Keep the normal page's part to the one line at the end of `site/app.js` | |
| The data rules themselves | `scripts/build.mjs`, then `docs/` and `schema/` to match | |

To find an entry without listing folders: its path is always
`data/base/<kind>/<id>.json`, and the id is in its link,
`codegrave.com/#<id>`. Search by name with
`grep -rl '"name": "Marie Curie' data/base`.

Classical views (Everything, one per branch, one per kind) are not files.
The build makes them from `data/categories.json`.

## Rules that are easy to break

1. One entry or one view per file. The file name is the `id`; for a base
   entry the folder is its kind (`category`). Never rename an id that has
   been merged; if something must move, add the old id to
   `data/redirects.json`.
2. A view only chooses what to show. Never put dates, names or ranks in a
   view. Chapter notes tell the story; the facts live on the entries. Name a
   view after its subject in the words people search for ("World War II",
   "Dinosaurs"), never with a book title or a subtitle, and name its chapters
   the same way.
3. Never invent a date. Use the `precision` you can support (`year` and
   `circa` are fine) and list the source. Leave `"verified": false` unless
   every date in the file was checked against a listed source.
4. Dates before the common era have a minus sign and four or more digits
   (`-0044-03-15`); there is no year 0. Compare dates with `parseDate` and
   `yearOf` from `site/rank.js`, never as text.
5. An ended entry needs an `ended` event. In Computing it also needs a
   one-line `cause`.
6. One thing has one entry. Check the base before adding (by name, and by
   `wikidata` id, which the build keeps unique).
7. Never copy text from a source into a summary or a note. Write it in your
   own words and cite the source.
8. Entries about people: public figures and the public record only.
9. `site/data/` is generated and git-ignored. Change `data/` and rebuild.
10. Keep one topic per pull request.

Full rules: `docs/DATA_RULES.md` (entries), `docs/VIEWS.md` (views and
community folders) and `docs/BUILD.md` (what the build writes). `schema/`
holds JSON Schemas for editor hints; `scripts/build.mjs` is the authority
when they differ.

## How the data reaches the page

The page never loads the whole dataset. `scripts/build.mjs` writes small
ready-made files with fixed names into `site/data/`, and every action on the
page costs one request (`docs/BUILD.md` has the full table):

- `boot.json`: the map, the labels and the list of community views. Always.
- `home.json`: the default views, ready to draw.
- `v/<view-id>.json`: one view and the entries it shows (a hand-picked view up to 1,000, a classical view at most 200, best
  ranked first). A community view is `v/<owner>/<id>.json`.
- `d/<key>.json`: full entries by a hash of their id (`shardOf` in
  `site/keys.js`), for a link or search result that is not loaded.
- `s/all.json`: the search index, loaded when a search box is first used.
- `c/<owner>.json`: one community folder.

The build ranks every entry once (`score()` in `site/rank.js`) and adds to
each what the page needs so it never has to look anything up: the rank, the
names at the other end of its links, the links that point at it, and its
home view. Keep it that way: if the page needs a new fact about the whole
dataset, have the build work it out.

## How the page code is laid out

`site/app.js` is one module in sections, in this order: constants, dates,
data, state and URL, what is drawn, render, the road, search the timeline,
panel (views, then the history of one entry, then one era), play and scrub,
events, start. Each section starts with a `// ----` comment line with its
name. `site/rank.js` holds the ranking and the date functions as pure
functions with tests; `site/road.js` holds the arithmetic of the road the
same way; `site/keys.js` holds the file keys and the word-splitting the
search uses.

The page redraws from `state` in one function, `render()`. To change
behaviour: change `state`, then call `changed()` (which also updates the
link) or `render()`. Do not patch the drawn page directly. There is one
exception: `roadFrame()` moves the reader and `roadDraw()` paints what is
in sight, once a frame and only while something moves; a change of `state`
still goes through `render()`.

How the page is put together:

- **The bar on the left and your own timelines** (`site/account.js`,
  `docs/ACCOUNTS.md`; asked for and designed in Nov 2026, like the sidebar
  of an AI chat app, "so it is scalable"). From the top: the logo, Explore, "Your
  timelines" with "Create timeline" first under it, the one lit button of the bar, in the accent colour (`#sb-new`; asked for, Nov 2026, after a plain "New timeline" row went unseen), and
  the account at the bottom left (Sign in when signed out; the account's
  menu opens upward). It folds to a strip of icons (`cg-sb` in this
  browser); like a chat app, the fold button shows while the pointer is over
  the head, and on the folded strip the logo turns into the open button
  while the pointer is over it, and a click on the empty strip opens it and is a drawer behind a menu button on a phone. The road, the
  top bar and the strip start where it ends (`--sb`). Signing in is asked
  only when something needs it, with Google, GitHub or an emailed link
  (Supabase Auth, called over HTTPS with no library). A timeline someone
  keeps is one row in the database holding a whole view file
  (`{ view, entries }`), so opening it is still one request. The page
  knows it as `t/<id>`; `loadView()` asks `account.fetchView()` for it,
  and its address is `/t/<id>`, or `/<username>/<slug>` once it is public
  (`addr()`). The username is picked once, when first publishing. One
  username per account for now. The bar and the account menu show the
  person who signed in (name or email), never the username, which is only
  the space they publish under (asked for, Nov 2026). Publish and its state sit beside the
  search only while the road shows one timeline of the reader's own. The
  module borrows what it needs from the page through the object given to
  `createAccount()` and never reaches into `state`.
- **Loading.** `start()` asks for `boot.json` and, at the same time, the
  views the link names (else `home.json`; a phone opens only on its
  `phone` views, from `data/editors-choice.json`, asked for in Nov 2026).
  `loadView()` and `loadEntry()` fetch one file each, once; `ingest()` keeps
  every loaded entry as a single object in `byId`. A view that fails to load
  leaves a note and the page keeps working. An old address is answered by
  the build's redirect file and the link is rewritten to the new id.
- **What is drawn.** `chosen()` picks the views, their entries (at most
  `MAX_ROWS`) and the years. `roadLayout()` lays them out in depth and
  leaves `L` with `tMin`, `tMax`, `shown`, `groups` and `lanes`, which the
  panel, the searches and the links read. Whatever goes somewhere
  (`roadToView()`, `roadToThing()`, `jumpTo()`, `flashYear()`) calls
  `roadTo()`. There is one way to draw the timeline. The flat, left-to-right
  timeline was removed in November 2026; an old link with `?m=flat` or
  `?h=expand` simply opens the road.
- **The road.** Time runs into the screen, towards one vanishing point (not
  evenly: see the next point), which stands in the middle of the page,
  under the search, not of the space left of the bar (`stageOf()`'s
  `shift`, asked for, Nov 2026). Each view is a lane and each entry a line
  along it, on a track of its own (`tracks()`). The reader stands at
  `road.t` facing the future, or the past when reversed (`camDir()`). `L.D`
  is the focal length, a length of road (`focalYears()`): what is `D` ahead
  is drawn half size.
  The ground (road, lanes, years, lines, starts, ends, chapters) is one
  canvas, `#road-cv`. Names are elements in `#road-labels`: a start is a
  card when near (from size `FULL`, never drawn smaller than `CARD_MIN`), a
  small card further off, then a bare name; an end is a grey, see-through
  dashed plate with its cause, quieter than any card (asked for, Nov 2026). `placeLabels()` decides every frame which fit, best first and
  capped, and they fade in and out. Writing on the ground (a chapter's
  name, a year at the edge) steps aside while a name stands over it
  (`covered()`, `soft()`). Wheel, drag and the arrow keys travel
  (`roadBy()`).
- **The road stretches busy periods and shrinks empty ones.** The road is not
  an even ruler. `warp()` in `site/road.js` shares it out: a quarter (`EVEN`)
  follows the calendar, and the rest goes to what happens (a start counts 1,
  an end half), so each start has the same room before it whether the one
  before came a day or a century earlier. Things that share a moment (three
  entries dated only "1961") do not share a spot either: they stand one
  after another, what ended first, then what began, the better ranked
  first, and the calendar waits while they do. No date changes by this: the
  whole stretch they stand on is that one moment, and the year is written
  once, where it begins. This was asked for, so that play can keep an even
  pace instead of crawling through a crowd and racing over nothing; do not
  go back to an even scale. The road code therefore works in places, not
  moments. `road.t`, a line's `p.a` and `p.b` (its own spots), a chapter's
  `xa` and `xb` and `L.D` are places or lengths of road. Dates stay moments:
  `t.born`, `t.end`, an event's `m.t`, a chapter's `a` and `b`, and anything
  written or kept in the link or in `state`. `L.place(moment)` and
  `L.when(place)` convert; for a moment several things share, `L.place()`
  is where the first of them stands, so go to an entry by `p.a` or `p.b`,
  never by `L.place(t.born)`. Convert at the edge (`jumpTo()`, `flashYear()`
  and `startPlay()` take moments; `roadTo()` takes a place). `L.tMin` and
  `L.tMax` are both at once: the road starts and ends where it did.
  `render()` carries the reader over as a moment, because the scale changes
  with what is drawn.
- **Lanes have sides.** With more than one view, `ln.lean` is -1 for the
  left lane, 0 for a middle one and 1 for the right lane. A card on a side
  lane stands to the outer side of its point, like a flag on its pole
  (`labelRect()` takes the lean); a card in the middle, or on a road of one
  lane, stands on its point. Keep it so: the left lane's cards never cross
  to the right.
- **A card opens like a scroll.** A card is never brought in from the side
  and never pops up. It opens out of its small card: it starts as that box,
  where that stands, and unrolls upwards into its own place over `OPENS`
  seconds, easing in and out (`openFrom()` in `site/road.js` gives the box
  for how far it has opened, `n.g`; the page cuts the card to that height,
  and what the card holds keeps to its foot, so nothing in it moves). The
  small card goes with it and dissolves into it, so the two read as one
  thing. A card that closes while its small card is on the stage rolls back
  down into it the same way (`n.roll`, asked for in Nov 2026); a card that
  leaves the stage fades where it stands. This was asked for in so
  many words ("think like opening scroll"), so do not bring back a slide or
  a pop.
- **The look.** Dark by default, like a museum at night: a sky of stars,
  glass cards with a lit edge, the road lit warm from the left and cool from
  the right. The light theme is the same place by day: a blue sky, the sun
  low over the far end of the road, a pale moon and soft clouds (`cg-theme2`; the key was renamed in Nov 2026 so everyone starts on dark).
- **The media wall** (`site/wall.js`, `docs/WALL.md`). The road runs
  through open air (a CSS gradient; stars or clouds drawn once), with rails
  of light either side whose pulses rush towards the reader and about 200
  motes of dust fading into fog, all on one 2D canvas and only while
  something moves. Asked for as "great performance on all devices": no
  WebGL, no library, no grid on the flanks. Six frames float either side
  (two on a phone), in fixed places that never overlap and are filled in
  a set order (`FRAMES`; asked for: nothing random, no pictures on top of
  each other). They show the media of the cards that are up
  (`wallMedia()`: an entry's `image`, its `media` list and its events'
  images); with several views each keeps to its lane's side and is bordered
  in its view's colour, and on a road of one view they fill both sides in
  turn; `placeLabels()` already knows which cards are up, so the
  page only hands that list over (`road.shows`) and the wall shares the
  frames out when the list changes, never per frame. With several views, a
  side whose lane has no card up shows one small picture of the nearest
  name there (what comes next, else what just passed), so it never stands
  empty beside a full one. This was asked for:
  the wall follows the views and the cards on show. The eras of
  `data/wall.json` fill the frames only for views with few pictures of
  their own (`L.own`), and always give the light of the rails and the
  road's edges (`tone`). Pointing at a frame shows its caption. The wall
  knows nothing about entries or views. Films play muted; less motion shows
  posters. Keep it behind the road (`#wall`, under `#road-cv`) and keep the
  frames few.
- **The front card** is selected by itself: the nearest card in front of
  the reader (`road.focus`) has its line drawn in its view's colour and its
  events written along it, like the open and the hovered entry
  (`road.heat` eases the colour). It is not `state.open`; do not write one
  to the other.
- **The bar** (`#axisbar`) stands upright on the right, slim (`--bar`: 44 px, 34 px on a phone; asked for, Nov 2026): tick marks, the shaded stretch in sight, the marker and short years of at most four characters (`shortYear()`: 1969, 500B, 3kB, 66M, 4.5G; the end of the road at the present reads Now) ("Years on the bar" in the three-dot menu was removed on request, Nov 2026). The marker shows its year only while dragged, since the year is written large on the road. The year pill is `#filters` (not `.yr`, which is a year on the bar). On a phone the strip at the foot steps away while play travels and the road takes its place. It stands play at the
  bottom and the whole span above it with ahead upwards, on the road's own scale so the marker climbs
  steadily (`barY()`, `barT()`, `barTicks()`), the stretch
  in sight shaded (`#axis-win`) and the marker at the reader. Dragging the
  marker moves the reader. Play moves the reader `PLAY_PACE` focal lengths
  a second, a little slower while cards stand in front and quicker through
  empty years (`paceFor()`). Because the road gives every start its own
  room, that pace stays nearly even. Every change of speed is eased, up to
  speed, down to the turn limit and to a stop on pause (`road.vel`), so the
  road never jerks under the reader. The reader can travel to just short of the end (`camLimits()`), close enough that the last starts stand open in front of them, and past the end the road's edges and lanes run on as dotted lines for `RUN_OUT` focal lengths, so the road does not stop at the reader's feet (asked for, Nov 2026). Space plays and pauses. At the far end the button offers to
  play again from the beginning.
- **Cards open by distance while play travels.** One rule, asked for in Nov
  2026 ("on multiple lanes the order is not there"): while play travels, a
  start is a full card exactly while it stands in one window ahead of the
  reader (`inWindow()`: from `OPEN_AT` to `CLOSE_AT` focal lengths), the
  same in every lane, so cards open in the order of their dates and close
  just before the reader reaches them. Outside the window it is a small
  card. Cards in the window may overlap; the nearer stands on top. Ends stay
  small plates in play, so one entry never seems to open twice. Where starts
  in a lane come close, play slows so each stands in front about
  `MIN_FRONT` seconds (`windowPace()`, never below `CRAWL`). The open entry
  is exempt; pointing at a card never keeps it open. Clicking a card while play travels opens
  its entry and play goes on (asked for, Nov 2026). Standing still, nothing
  takes turns: a card stays while someone reads it. Keep it this simple: no
  queue, no timers, no turns.
- **Voiceover** (`site/voice.js`, `docs/ACCOUNTS.md`; asked for, Nov 2026: "voiceover will be main", the music "should
  be subtle", play "should wait on the cards if its corresponding voiceover not done", "and also a subtitle. if
  its on"). On a timeline of the reader's own, "Generate voiceover" is in the three dots at the top right (`#tl-more`).
  It opens a dialog of voices, each with Listen (asked for: "to try which voice is good"). The function `voiceover`
  writes an opening that fits the title, a line for each entry in the order play meets them (`told` lent by the
  page) and a closing; only those words and the voice are kept, on the row (`voice`: `{ at, voice, style, lines }`),
  so opening the timeline is still one request. It counts as one of the day's requests; changing the voice later
  costs nothing. **The sound is made in the reader's own browser, never on the server and never stored there**
  (asked for, Nov 2026, after a first version recorded MP3s with Gemini into Supabase: no files on the server, and a
  cost that does not grow with the hours people listen). `createSpeaker()` runs Kokoro (82M, Apache 2.0; `kokoro-js`
  from jsDelivr, the q8 model from Hugging Face, about 92 MB once, then kept by the browser) in a Web Worker on the
  CPU (wasm), one line at a time, the line asked for now first; each line made is kept in this browser's Cache
  Storage (`lineKey()`), so playing again is instant. Two voices are offered, Heart (warm, American; the default)
  and Michael (calm, American) (asked for, Nov 2026), and third "This device", the browser's own voice
  (`speechSynthesis`: no download, instant, plainer; asked for, Nov 2026, and good for testing); the Kokoro two share the model and each adds about half a MB, fetched
  only when used. The model starts downloading as soon as a timeline with a voiceover opens, or the voice dialog
  does (`speaker.warm()`), and the foot and the dialog say how far it has come, first time only (asked for: "so
  user know what's happening"). Each line made is timed (`cg-voice-speed`); on a device slower than real time
  (`SLOW`) the dialog warns and the foot says play waits at each card (asked for). Where Kokoro cannot run, the
  browser's own voice says the line. Where the browser finds a real graphics card (`gpuOk()`: WebGPU, not a software
  fallback), "Faster voice" is offered in the voice dialog and in the settings (`#gpu-row`, `cg-voice-gpu`, off by
  default; asked for, Nov 2026, for "users who have a good PC, like good internet"): the same model at full precision
  on the graphics card, a 326 MB download (`GPU_MB`). The worker asks for the card before downloading, and if it
  cannot run there the voice goes back to the processor by itself (`engine()`). Speed is kept per engine.
  Kokoro speaks English only. While play travels every line is made in order from where play is (`prepare()`), the
  line of the entry in front is said (`tell()`; the opening on the first entry, the closing after the last), the
  music sinks to `MUSIC_UNDER`, and the reader stops on each card until its line is said, then goes on, like Arrow
  keys play (asked for: "we need to stop in the card"). A line not made yet holds play at its card, and the foot
  says "Preparing the voice" (`#subs.wait`). A pause holds the line where it is. "Voiceover" and "Subtitles" in the
  settings (`cg-voice`, on; `cg-subs`, off) show only for a timeline that has one; the subtitle is the line being
  said, at the foot (`#subs`; at the top on a phone, where the card stands at the foot). Only a road of one view is
  told, and play by the arrow keys says a line as its entry arrives without waiting. The script's prompt has many
  short examples by kind of timeline; add to them rather than cut them. Another engine (a cheaper paid voice, or
  another free model) would go beside Kokoro in `voice.js`, with its voices in `VOICES`.
- **Voiceover, round 2 (Nov 2026, asked for).** By play stands a chip, "Voiceover" (`#vo-chip`, `drawChip()`), on
  a timeline that has one: its dot is lit when every line is already made in this browser (`speaker.kept()`),
  hollow while they still have to be; a press turns the voiceover off and on. Play speed changes the voice's speed
  too, at the same pitch (`stretch()` in `site/voice.js`, WSOLA; `voiceRate()` keeps it between 0.7x and 1.6x).
  The voices are Heart and Michael first, then Bella, Nicole, Emma and George, then This device. While play
  rests at a place the map comes slowly closer and glides a little east (`DRIFT_*` in `site/globe.js`), so the
  picture is never still; north stays up and a pause stops it dead.
- **Export video** (`site/export.js`; asked for, Nov 2026: "just like export as PDF, you can have the export
  video", then, after a first version that recorded the tab: "it should not control the browser and record",
  "you just click, and the MP4 ... should process and download"). In the three dots at the top right, for any
  timeline: Video with voiceover, Video only (music, no voice) or Voiceover only (a WAV). Nothing is recorded
  from the screen and nothing is uploaded. `exportFilm()` draws the film frame by frame on a 1920 by 1080 canvas
  (`painter()`: the entry in front as in Full view, its picture whole and coming slowly closer, its text under
  it, stars drifting, the title, the period, how far along), hands each frame to the browser's encoder
  (WebCodecs: H.264 where there is one, else VP9 or AV1; AAC, else Opus), mixes the voice's lines and the music
  off-line (`mix()`, `schedule()` says when each entry is up and each line said) and joins them with
  `mp4-muxer` from jsDelivr, fetched only then. It runs as fast as the device draws. The pill at the top right
  says how far it has come (`voicing.exporting` in `account.js`) and can cancel. The map is not in the film yet,
  and the voice of This device cannot be saved to a file. Exact frames of the page itself are film mode's job
  (`docs/FILM_MODE.md`). Generate voiceover is two steps (asked for): the script, then the voice made for every
  line at once (`record()` in `account.js`), so play never waits.
- **The sound of play.** A card that opens while play travels gets a ring
  in its view's colour that fades (`.rc.full.ring`) and a quiet breath of
  air (`breath()`): noise through a filter that closes as the sound
  settles, made with Web Audio on the spot, so there is no sound file. It
  has no note and no tap, and it is quiet on purpose. A short pop was tried
  first and was not liked; this one was picked by ear from six, and then
  turned down, so do not make it louder or swap it without asking. The left
  lane sounds a tone lower and from the left, the right lane a tone higher
  and from the right. Nothing sounds before play is pressed, travelling by
  hand is silent, and the small button above play turns the sound off
  (`cg-sound` in this browser).
  Play also has music (`tune()`): one track, looped, that sounds only
  while play travels, eases in and out and keeps its place on pause. A view
  may bring its own (`audio` on the view, `docs/VIEWS.md`); otherwise it is
  `site/media/gallery-of-glass.mp3`. A view with its own music gets two
  plays side by side in one pill (one above the other on a phone): the
  house play, and a second dressed in the view's thumbnail (a country's
  flag) that plays its own track (`play.own`, `playWith()`). Pressing the
  other while playing changes the music without stopping. Showing another view, or playing again
  from the beginning, starts the track from its beginning. It is fetched
  when play is first pressed with the sound on, and the same button
  silences it. The house track was asked for with this file; do not swap it
  without asking.
- **The globe** (`site/globe.js`, `site/globe-path.js`; asked for and designed in Nov 2026, plan and
  mockups in the design doc "3D world map"). The same timeline drawn on the Earth. It is the only
  way the timeline is shown (asked for, Nov 2026: "by default all should be globe", "we are not supporting
  the old timeline at all"; `GLOBE` in `site/app.js` is always true and an old `?globe` in a link is ignored).
  The road is no longer drawn for the reader; its layout and travel remain underneath only as the clock, so
  what this guide says about the road's look describes code that is hidden and may be removed. The road stays the clock: in globe mode
  it is laid out and travelled as ever, only not shown (`body.globe`), so the bar, play, the wheel,
  the year on top, the panel and the links work unchanged. `globeShow()` hands the globe the entries
  in the order play meets them and `globeFrame()` tells it which one stands in front (the open
  entry, else the last one within `AHEAD` of the reader). An entry with a place is a pin: the camera
  flies to it and its card stands beside it (above the strip on a phone), opening upwards like a
  scroll. Everything on the globe follows from one number, where the reader is among the entries
  (`S.pos` in `site/globe.js`: 2.4 is four tenths of the way from the third entry to the fourth), which
  the page gives it whenever the reader moves (`globe.at(id, frac, playing)`): the camera, the time
  line, the stars, which card is up and how far it has come. So nothing flies by itself and nothing
  waits: it all moves exactly while the reader does. This was asked for after a first version that
  flew to a place and stood there ("it shows the card and freezes there. But should be more like it
  keeps moving", "we wanted a smooth approach"); do not bring back a flight with a hold. The camera
  is on the way from the view of the last place to the view of the next (`camAt()`); it comes to
  rest at each place and is quickest half way, with no speed ever jumped to, north stays up, and a
  light runs along the way from place to place (`trail()`), so going on is seen even where the
  camera has no need to move. Livelier motions were tried and rejected ("not steady at all", "if you
  change orientation it will feel flaky, and user will find difficult to focus"), so do not add
  swings or a camera that dives at every pin. The way it travels is "turn", picked from three clean ways: the globe turns
  under a camera that keeps its height (`cams()`: a height that suits the place's neighbourhood and
  changes by at most `STEP` from one place to the next, never tilted), so each place comes to the
  same spot of the picture and its card to the same place. Near places are a short glide and only far ones pull back to the
  whole globe (asked for: "it doesn't need to jump out to the full globe"). Play takes a set time from each entry to the next (`globe.legSecs()`), longer for a long way. An
  entry with no place is a row on the time line at the foot; its card rises over its row while the
  map dims, and where most of a view has no place, or five or more in a row have none, the map goes
  out of sight and the reader flies on among the stars with no Earth (`stageFor()`; asked for: "it
  can hide away"). In space (`.g-space`, one small 2D canvas) the stars stream past as fast as the
  reader travels, a card comes out of the distance and passes away below the reader ("think like we
  are flying in the space craft"), its picture is not in the card but fills the sky behind it
  (`.g-bimg`), and the pictures of the last few entries passed stand small at the left (`.g-past`).
  The time line runs along the foot, not upright on the right (asked for: "so it shows moving", "so
  right side can be cleaned up"): `body.globe` sets `--bar` to 0 and hides `#axis`, play and the
  sound button stand at the strip's right end (asked for), and the strip slides under a marker that
  stands still, with a year written where it changes. The entries stand on it by name, one with no place in italics (design C, picked from three).
  While play travels a card on the map keeps the spot its pin comes to rest at and goes away into its own
  centre, a little smaller, never sliding to a side as the globe turns on (`S.fix`; asked for, Nov 2026).
  A card shows the picture, kind, dates, name and summary, and neither coordinates nor a note that
  an entry has no place (asked for: "it will be in details"). The card is a label written on the map, with no box and a rule in the view's colour
  (design B, picked from three; a glass box on a phone). The credits the map's licences ask for
  are behind a small button in the bottom right corner, beside the three dots (`.g-credit`, asked for), not
  written on the map. The time line at the foot is dragged like a strip under its marker (`globeSeek()`, asked
  for: "like we had before"). "Play speed" in the three-dot menu (`play.speed`, `cg-pace` in this browser; 0.25x
  to 2x, 1x by default) slows or quickens play, on the road too (asked for, to linger longer on the cards). The look is "Atlas" (picked after "Day", NASA's Blue Marble, was built
  first and found "a bit heavy"): dark land, coasts in a warm line, a faint grid, the same map with
  streets close in. From far off the land is Natural Earth's small-scale coast
  (`site/media/land.json`, public domain); from country height down it is OpenFreeMap's tiles, free
  and without a key; MapLibre GL JS comes from cdnjs only when a globe first opens. Places come from
  `data/places.json`, made by `scripts/places.mjs` from Wikidata and never guessed; an entry older
  than five million years has no place on today's map (`DEEP`). Still to come, in this order: a
  place on the entry itself (`where`, which needs an agreed issue), places for timelines made with
  AI, places that are not sure (an area, a traditional site), the Earth as it was for deep time, and
  other looks. Never draw a pin for a guessed place.
- **Play on the globe is watched like a film** (asked for, Nov 2026). The entry in front is shown the same
  way on the map as among the stars: its picture large (`.g-bimg`), its text under it on a plain plate
  (`.g-card`), a little right of the middle on the map so the globe shows at the left, in the middle and
  larger in full view (`--sp` runs from 0 to 1 between the two, `midX()`), so a change of stage is a glide and
  never a cut. On a phone it is a glass box over the time line (kind, dates, name, three lines of summary).
  At the left stand the picture of the entry in front, on top and lit, then the last few passed (`.g-past`,
  keyed by step so nothing is rebuilt); never one that is still ahead. The frames of the wall are hidden
  while play travels. The camera rests at a place for `STAY` of the way and then moves, and the next card
  comes in `early` before its place, so the map is never shown travelling with no card up. A view opens on
  the whole globe and a place is at most `NEARER` closer than that while travelling, however narrow the
  years. A quiet pill at the top right (`.g-mode`, `cg-stage` in this browser) switches between Globe and
  Full view, which is the stars for every entry. While play travels the bar on the left and the strip at the
  foot step away (`body.playing` sets `--sb` to 0); play, sound and full screen (`#full`, the browser's own
  full screen; a double click on the stage does the same) fade while the pointer rests (`body.idle`) and
  come back when it moves.
- **The card on the globe is one piece** (asked for, Nov 2026): on a wide screen the picture stands in the card,
  over its text, on one plate, the same on the map and in full view, and a thin line in the view's colour
  runs from the place on the map to the card (`.g-lead`, drawn in `place()`). On a phone the period stands in
  the top corner. With the buttons of play comes a menu button at the top left (`#film-menu`): it brings the
  bar on the left and the strip back while play goes on (`body.unfilm`), and takes them away again.
- **Round 3 of the same asks (Nov 2026), which replace what the points above say where they differ.** There is
  no line from the place to the card (tried, not wanted). The card stands in the middle of the stage top to
  bottom. Globe or Full view is chosen in the three-dot menu ("View", `globe.mode()`), not by a pill on the
  stage. A pause stops dead and leaves everything where play had it: the card keeps its size and place
  (`S.hold`), and the film layout stays (`body.film`, set when play starts) until the menu button at the top
  left, which is the search's height and glass and stands just before it, brings the bar and the strip back.
  Globe detail is Less by default.
- **Round 4 (Nov 2026).** Pressing play takes the browser's full screen by itself (`goFull()` in `startPlay()`);
  the button and a double click still toggle it. The marker of the time line at the foot stands near the left
  end (`nowAt()`: 16 % of the strip, 20 % on a phone), not in the middle, so a view opens with its line running
  from the left. Showing another view alone closes the open entry and takes its id out of the link
  (`showOnly()`), or a reload would bring that entry's view back beside the new one.
- **Several views are a grid of globes** (asked for, Nov 2026: "each one may have their own globe and own cards",
  "while the timeline runs a single one below"). With more than one view, each gets a pane of its own in
  `.g-grid` inside `#globe` (`globePanes()` in `site/app.js`; a pane is `createGlobe(el, { pane: true })`, with
  no time line, a smaller card sized by the pane with container units, and its view's name in its colour): two
  side by side, three as two over one, then two rows of two, three or four (CSS on `data-n`); on a phone two
  stand one over the other and more go two across. The page's own globe keeps only the time line
  (`globe.bare(true)`). Every pane goes by the same reader: `globeFrame()` tells each the last of its own
  entries the reader has come to. "Several views" in the three-dot menu (`cg-grid` in this browser) switches
  between Grid, the default, and One globe, which is all the views on the page's one globe. The small pictures
  at the left of a single globe are pressed to go back to their entry.
  The panes the entry in front belongs to are lit with a border in their view's colour (`.g-pane.live`; views
  with an entry at the same date light together); the others dim and put their card away, so it is plain which
  globe is being told about (asked for). The film layout belongs to full screen: leaving full screen brings the
  bar on the left and the strip of views back, playing or not (asked for).
- **Round 5 (Nov 2026), which replaces what the rounds above say where they differ.** The marker of the time line
  at the foot stands at the left end (`nowAt()`: 34 px, 22 px on a phone), so a view opens with its first entry at
  the left edge. In full screen the search, the menu button beside it and `.top` go away too; they come back while
  the pointer is at the top edge, for a few seconds after a click on the stage, and while the search is used
  (`body.fullscreen:not(.peek)`). "Play" in the three-dot menu (`#step-row`, `play.step`, `cg-step` in this
  browser) is Auto or Arrow keys: with Arrow keys, play sounds and takes the screen as ever but the reader stands
  still until an arrow is pressed, and then travels to the next entry or back to the one before at the pace of
  automatic play, and stops there (`playStep()`, `road.stepEnd`; a quick glide was tried first and found too fast).
- **The camera comes down where places are near** (asked for, Nov 2026, after "things to do in Seattle" showed
  every pin on one dot from far off, then: "little bit closer if upcoming 2 or more distances are closer"). This
  replaces the `NEARER` limit above, which now holds only for a view of one place. In `cams()` a place's height is
  the closest that keeps the two places either side of it in the frame, so a run of places in one town or one
  country is told from over it and only far ones pull back to the globe; the height changes by at most `STEP`
  from one place to the next. When all of a view's places fit the frame at zoom `LOCAL` or closer (about 100 km
  across) it may come as close as frames them all (`fit` from `opening()`, at most `CLOSE`).
- **Globe look** (three-dot menu: Atlas, Day, Dots; `cg-look` in this browser; asked for, Nov 2026). Atlas is the
  default. Day lays NASA's Blue Marble over the far globe (`DAY` in `site/globe.js`: NASA's own tiles, public
  domain); Dots draws the land as a field of points made in the browser from the coast file (`landDots()`). A look
  is layers put on the one map by `look()`, never another style, and what it needs is fetched only when it is
  picked. From country height down every look is the same map of streets. Over Day a country is shown by its
  outline alone.
- **Globe detail** (three-dot menu: Less, Medium, Full; `cg-detail` in this browser; asked
  for, Nov 2026, so the globe is less crowded). Full names every country, as the map's tiles do. Medium names
  and tints only the countries the timeline's entries fall in. Less names and tints only the country of the
  entry in front and shows only its pin. The countries are Natural Earth's (`site/media/countries.json`, public
  domain, names and label points included); `landOf()` in `site/globe.js` finds the one a place falls in.
- **Places for timelines made with AI.** The model says where an entry is in words first:
  `place`, the Wikipedia article of the most exact place (a venue before its city), and, for something at one
  spot (an event, a restaurant, a stop on a trip), `address`, the venue's name with its city, region and
  country. `findPlaces()` in `site/ai.js` writes `where: [lat, lon]` from the most exact of these it can
  find: the address looked up in OpenStreetMap (Photon, free and without a key; only the function passes it,
  and a hit counts only within `NEAR_KM` of the place Wikipedia gave, so a namesake is never drawn), else the
  entry's own article when Wikipedia calls it one spot, else the model's own `coordinates` when they fall
  within `GUESS_KM` of the place Wikipedia gave (asked for, Nov 2026: a model knows where famous spots are;
  its numbers only refine a known place and never stand alone), else the article of `place`, else the
  entry's article. An entry with no picture of its own shows the picture of its `place` (`findPictures()`).
  Asked for, Nov 2026, after "events in Seattle and Bellevue" put every pin on the middle of its city. The
  function does it after the pictures, and the editor (Wikipedia only) when an entry's article changes.
- **The prompt for timelines made with AI** (`supabase/functions/ai-timeline/index.ts`) is written in sections
  (time and dates, where things are, pictures, kinds of request, lists, always) with many short examples; the
  examples were asked for (Nov 2026), so add to them rather than cut them. The Wikipedia reading before the
  model is skipped for plans, local requests and lists (`NO_READING`), where it never helped.
- **Pictures for timelines made with AI** (asked for, Nov 2026: "Wikipedia goes first", then the model's own
  links, and the reader can always set one). `findPictures()` takes the article's free picture, else the picture
  of the `place`. Then `linkPictures()` opens every link the model gave (`pictures`: a Commons file page or a
  direct image) and keeps those that answer as a picture: the first is the entry's picture when Wikipedia had
  none, the others stand beside it (`more` on the spec's entry, `media` on the view's, at most `MORE_PICS`).
  In the editor "Picture link" sets any https picture. A picture that is not Wikimedia's is credited to its site.
- **Explore is a page over the road** (`#explore`; asked for, Nov 2026:
  "think it is like community posted, meaning even the admin ones", after a
  list in the sidebar was found "not professional"). Explore in the bar on
  the left opens it and closes it; Escape and picking a timeline close it
  too (`account.explore(on)`, `body.exploring`). It is a gallery: a large
  search, the topic chips ("All" first), then every timeline as a card
  (its thumbnail, name, two lines of description, who made it, its years
  and size). "All" shows what people have published lately
  (`account.published()`, one request the first time), then eight cards of
  each topic with "See all" (`SHELF`); Countries come last. The editors'
  timelines are listed as the community's, by `wiki`. A community page of
  people's own creations is planned; keep this page able to grow into it.
  There is no "Views" button in the strip (removed on request).
  Under the chips a bar says what is on the timeline now (`#vnow`, `drawNow()`): a pill a view, with a cross
  to take one of several off. A click on a card shows that timeline alone and closes Explore; the card's Add
  button (a plain, always visible "+ Add", "Remove" once it is on) puts it beside the others and leaves
  Explore open, so several can be added in a row (asked for, Nov 2026).
- **New timeline is a page with one box** (`#create`, filled by
  `account.js`): "What do you want to make?", a prompt, the model menu and,
  under the box, the kinds of thing people come to make (`KINDS`: a
  company, a life, a subject to learn, a trip, a skill, the news, history),
  each opening four requests that work as they stand. Asked for, Nov 2026:
  "user can build anything", with ideas chosen for what people need, no
  "copy this view" link, and a see-through page: the road shows, blurred,
  behind it. The model menu is like a chat app's (asked for): the models by
  name with a line each, "More models" folded away, and the effort (Quick,
  Balanced, Thorough: OpenRouter's reasoning effort); `MODELS` and
  `EFFORTS` in `site/ai.js` (ids are OpenRouter ids), `cg-model` and
  `cg-model-effort` in this browser. The function runs only the ids it
  lists (`OFFERED`, plus the secret `AI_MODELS`, where `*` allows any); the
  plan is to offer everything OpenRouter has and let OpenRouter cap the
  spending. A plan (a trip, a course) is dated ahead of today: then the
  road runs on past today to its last step (`chosen()`), "Today" is not
  written at its end, and a step shows its days ("5 Apr 2027", `daysOf()`).
  Pressing Enter goes to the road at once (asked for, Nov 2026: it "should
  be on timeline", streamed while it comes): the page stores an empty row,
  and the Edge Function `supabase/functions/ai-timeline` reads up on the
  subject in Wikipedia, asks the model through OpenRouter for a small
  "spec" and streams it; the page draws each entry as soon as its JSON is
  closed (`partialSpec()`). While it is made, it says how far it
  has come: its three steps (reading up, writing the entries with their
  count, finding pictures) stand at the horizon (`#ai-live`) and a bar runs
  along the top edge of the strip at the foot (`#ai-bar`; asked for, Nov
  2026: "a proper loading"). The function then finds free pictures
  (`findPictures()`: the article's picture, else Wikidata's; Wikimedia now
  serves thumbnails from `thumb.wikimedia.org`) and writes the finished
  view file into the row itself, so it is kept on every device even when
  the tab is closed. `site/ai.js` is shared by the page and the function
  (`supabase/functions/ai-timeline/ai.js` links to it; deploy both files).
  The models are cheap and fast (DeepSeek V4.1 Flash first; asked
  for, Nov 2026), with the cheapest of OpenAI, Anthropic and Google beside
  them (GPT-6 Luna, Claude Haiku 5.5, Gemini 3.1 Flash-Lite), and Quick
  (thinking off) is the default effort. Nothing is kept for older pages:
  the function always streams and refuses a model it does not offer.
  `specToView()` in `site/ai.js` turns a spec into a view file, stored
  with the spec beside it. For such a timeline of the reader's own, "Ask
  AI" is a lit, one-line pill standing just above the strip at the foot
  of the road (`#ask`; design B of four, asked for in Nov 2026 with "that
  should be above that footer"), growing to a few lines as it is typed
  into: the model gets the spec and the
  request and writes the whole spec again; the toast says what changed and
  offers Undo. While it works, its steps (reading the timeline, thinking,
  writing the entries with their count, finding pictures) stand in a row just above
  the box (`#ai-live.low`) and the bar runs along the strip (asked for, Nov 2026). A timeline the reader keeps shows only its own pictures on
  the walls, never the eras' stand-ins (`L.own`). An entry made this way names its kind in
  words (`category`) and its branch in `domain`, and its id starts with
  `x`. A plan is dated by the day, or by the hour (`2027-04-05T09:00`), and
  its chapters may be full dates; the function's prompt asks for the units of
  the subject's own length ("in 30 days" is 30 days, not a year). The cards
  on the road are drawn afresh when the finished timeline arrives
  (`replaceView()`), so its pictures show at once. The centre of the page is meant as a canvas where a reader can make
  anything (asked for, Nov 2026); a timeline is the first kind, so keep the
  spec and the function free of anything only a timeline could use.
- **The year range** (`#filters`, `state.span`) is a quiet, see-through pill
  at the bottom right of the road; pressed, it opens the range with its
  picture of busy years (moved there from the views pane on request, Nov
  2026). It hides while play travels.
- **There is no bar across the top** (asked for, Nov 2026: "the top
  navigation bar we only want on the left side, so the middle canvas stays
  full"). What it held is in the three-dot menu. The search box
  (`.tsearch`, `#q`) stands at the top left of the road, always: a
  see-through pill, "Search: person, place, event…" ("Search" on a phone,
  beside the menu button), that widens while it is used; it steps away
  with the top while play travels, and "/" opens it (asked for, Nov 2026,
  instead of Search in the bar on the left). `.top` is
  now an unseen strip that holds the phone's round menu button (top left)
  and, top right, the state and Publish button of a timeline of the
  reader's own. `TOP` is only a little air above the road.
- **A phone must never get stuck zoomed in** (reported, Nov 2026). Two
  fingers do not zoom the page (`touch-action: pan-x pan-y`), fields are
  16px on a phone so the browser does not zoom into them, and if the page
  is zoomed anyway a "Reset zoom" button appears at the top of what is in
  sight (`#unzoom`, placed from `visualViewport`) and puts it back.
- **Two menus, one for the timeline and one for settings** (asked for, Nov 2026: "remove that publish and
  voiceover into the 3 dot in the top", "the bottom footer 3 dots should be like the settings"; this replaces
  what the point below and the points above say where they differ). At the top right stands one quiet
  three-dot button (`#tl-more`, drawn by `account.js` in `#tl-state`; `timelineMenu()`): "This timeline" holds
  Generate voiceover (lit until there is one), Open in editor, Publish with its state, Export as PDF, Turn
  round, Rename and Delete. For a timeline that is not the reader's own it holds Export as PDF and Turn round
  only. Publish, Open in editor and the voiceover no longer stand as buttons at the top. Export as PDF and
  Turn round are still done by the page: `#pdf` and `#reverse` are kept as two unseen buttons that the menu
  presses. The button at the foot (`#more-btn`) is a gear and its menu (`#more-menu`) holds settings only:
  Play, Globe, Appearance and How to read the timeline. While a voiceover is made the three dots become a
  pill ("Writing the script…", `#vo-pill`), with a note under it (`#vo-panel`, `drawVoicing()`); pressing the
  pill hides or shows the note, and the timeline can be used meanwhile. The year on the road stands under the button.
- **The three-dot menu** (`#more-btn`, `#more-menu`) is at the bottom right, under play, at the
  right end of the strip (asked for, Nov 2026, after it stood at the foot of the bar on the left).
  It is in groups under small headings (restructured on request, Nov 2026, after a first list was found
  "crappy"): This timeline (Export as PDF, `#pdf`; Turn round, `#reverse`, `state.order`), Play (Speed,
  Advance), Globe (View, Look, Detail, Several views), Appearance (Theme: Dark or Light, `#theme-seg`) and
  How to read the timeline. A setting is a row (`.set`): its name on the left and its control on the right,
  every control the same width so they stand in one column, with no icon; the choice that is on is lit in the
  accent colour. Keep new settings in that shape. Export as PDF lives only here. For a timeline someone keeps, which is
  not a built file, the page hands the view file to the print page through this tab's storage
  (`cg-print`).
- **The panel** on the right is only for one thing at a time: it is hidden
  until a name or a chapter is clicked. It never covers the road: on wide screens and
  tablets it sits beside it and the road narrows; on phones (under 700 px)
  it is a sheet over the lower half, and the road and the bar move up above
  it. It has two panes: the history of one entry, and one era. The
  entry and era panes head with a trail back (`state.trail`, `crumbs()`).
  Opening something from inside the panel adds a step, opening it from the
  road starts over, and Escape goes back one step.
- **Views.** `state.views` is the list of views on the timeline, each a
  lane, in order from the left. An entry in two views is drawn in both
  lanes; `L.at` maps an id to its first line. A view's chapters
  (`checkpoints`) are lines across its lane, named in its colour. The road
  opens where the first view begins (`roadOpening()`, `laneStart()`): at its
  first entry, or its first chapter when that opens a little before; a
  classical view opens on its busiest stretch. The views on the timeline
  sit as pills in a strip along the bottom (`#dock`), which scrolls
  sideways when they do not fit: drag to reorder (with a finger, hold a
  pill first, because a finger scrolls the strip), the dot picks the
  colour (a row of the theme's eight, then a ninth, a rainbow ring, that opens the system's colour picker for any colour; asked for, Nov 2026: a colour is 0 to 7 or '#rrggbb', `colVar()` and `colRgb()` read either, and the link and the export carry it as `c=3` or `c=f05a28`), and the cross removes one of several. The strip starts at the
  left with the pills; at its right end stand shuffle and the three dots (Export as PDF and reverse
  moved into that menu on request, Nov 2026). There is no bookmark: "Your view" was
  removed on request (Nov 2026). This was asked for; do not centre the
  strip again.
- **One view at a time.** Picking a view shows it alone (`showOnly()`): the
  others leave and the road opens at its beginning. Putting a view beside
  the others is the second action (`turnOn()`): the small plus at the end
  of its row, a right click, Shift, Ctrl or Cmd with a click, or
  Shift+Enter in the search. The same button takes a view off again when
  it is one of several. An entry found by a search that no view on the
  timeline holds brings its own view alone too (`bringIn()`); only a link
  that names its views keeps them and adds. Do not make adding the default
  again: it was changed on purpose.
- **The search and chips of Explore.** The search finds every timeline,
  community and classical (people's published timelines too when the
  filter at the end of the box has People's timelines on; off by default,
  asked for, Nov 2026: `account.searchPeople()`), and entries and years (`runSearch()`,
  `drawResults()`); entries and years are slim rows under the cards.
  Pressing a chip lists that topic's timelines; pressing it again, or
  "All", goes back. Both search boxes have a cross that clears them
  (`.clr`). With several views on the road, shuffle (which mixes their
  colours) sits in the strip beside the three dots (`#shuffle`).
  Classical views are found by the search, where every result
  carries an icon that says which sort it is. A card's picture is the
  thumbnail made by the build (`scripts/thumb.mjs`); a timeline someone
  stored shows its initials.
- **The heading.** The views on the road are named across the top centre, in the order of their lanes, each with the chapter in sight below it in small capitals in its colour, with no lines (`#road-views`; style "A", picked from six); the year in sight is written large on the right (`#road-year`); both keep moving with the road and read exactly the selected card's own period (year, rank or value, whatever the road is in) at the moment that card is selected (`road.focus`); while it is selected the period runs on towards the next card (`road.after`), and with none selected it reads where cards open (`OPEN_AT` ahead), so it never jumps (asked for, Nov 2026), and where the road stops at the present it reads "Today". Asked for in Nov 2026.
- **The years.** `ruler()` writes the years along the edge of the road and
  `barTicks()` those on the bar. Because the scale is uneven there is no
  fixed step: `yearMarks()` in `site/road.js` writes a year where the years
  next to it leave room, round ones first (1, 5, 10, 50, 100 and so on, up
  to a billion), so single years are written where much happens and only
  round ones where little does. It is bounded by what fits on the screen, whatever the
  span; keep it so. There is no year 0; deep time is labelled ka, Ma and
  Ga. BCE and CE are written only where the era changes (`eraMarked()`):
  on the BCE year nearest the change and the CE year nearest it; the line
  under the big year spells out the era of the year in sight ("BCE: Before
  the Common Era"), as it does deep time's units (`#road-unit`, moved there
  from the strip on request, Nov 2026). Asked for in Nov 2026. A road shorter than `FINE` (four years) is marked in
  the calendar instead: months, Mondays, days and hours (`calMarks()` in
  `site/road.js`; on the bar "Dec", "7", "9h"); the big label reads the day
  ("30 Nov", "Monday, 2026") or, on a road of a few days, the hour, and the
  year range is hidden (`body.fine`). Asked for, Nov 2026: time is "not
  forcefully always year". `parseDate()` counts true days of the calendar
  and reads a time of day. When a few entries start far earlier than the rest, the view opens on
  the rest and "Show all years" reaches back. Every date on the page goes
  through `fmtDate()` and `spanText()`, which read BCE and deep-time dates;
  on a phone deep time is written short (100k, 66M, 13.8B years ago, asked
  for, Nov 2026).
- **Export as PDF.** "Export as PDF" in the three-dot menu (with the PDF icon, `site/media/pdf.svg`, from Wikimedia Commons, asked for) opens `print.html` in a new tab (asked for, Nov 2026, after a round in the same tab; a stored timeline reaches it through `cg-print` in this tab's storage, which a tab opened from it copies) with the views on the timeline, their order and colours (`?views=…&c=…`, `&yr=` when the year range is narrowed: then only the entries begun in that range are printed, and `&o=forward` or `&o=backward`, the direction of the timeline (the page's own link carries it too): backward: then every page reads from today back, newest first; the print page also has a Timeline switch: Forward, past to today, or Backward, today to past, which rewrites `o` in its link). `site/print.js` loads the same view files, lays the pages out by measuring them in the browser, and waits (nothing opens by itself, asked for in Nov 2026). Its "Download PDF" button saves a .pdf in one click (picked over the print dialog and over a server, Nov 2026): each page is drawn to an image by html2canvas and the images are put into one file by jsPDF, both fetched from cdnjs only when pressed; so the text in the file is not selectable, and pictures must allow CORS (`crossorigin` on every picture; Wikimedia does). Printing is left to the browser, which uses `print.css`. With a year range, only the chapters that overlap it are shown. Chapters are not numbered anywhere in the export (asked for, Nov 2026). The reading font (names, headings, summaries; `--serif`) is picked under Text from ten free fonts (`FONTS_OFFERED`, SIL Open Font License, fetched from Google Fonts only when picked, `&font=` in the link); Lora is the default (picked from the ten, Nov 2026; Bookerly was asked for first, but it is Amazon's and cannot be served). Text size, a slider from 60 to 150 % under Text (`&size=`); its 100 % is 1.4 times the size the layout was drawn for (`TEXT_BASE`; asked for, Nov 2026: the old 140 % read best, so it became the default): the book scales its reading text (`--fs`; the headers, rails and cover titles keep their size) and keeps its layout, so larger text takes more pages; the poster scales whole sheets in `posterSheet()` as far as two rows of cards fit the paper, then the cards' text alone (`--tf`). Only the codegrave name keeps Instrument Serif. The bar has two menus, each naming its current choices on its button (asked for, Nov 2026, as the old Template plus Export options felt mixed): Layout, the shape of the document (Template, Paper, Timeline), and Text, how it reads (Font, Size); opening one closes the other, and on a phone their buttons read just Layout and Text. On a screen narrower than the paper the pages are zoomed out to its width with a CSS transform (`fit()`), so the layout is exactly the full-size one and nothing reflows (CSS zoom drew the pages wrongly on phones and was replaced, Nov 2026); the PDF and images are drawn at full size (`onclone` takes the transform off). A folded top right corner on each poster sheet, like frosted glass, with a small download arrow, saves that sheet as a PNG (`sheetImage()`, asked for, Nov 2026), never printed. The paper is A4 or Letter: `paperFor()` picks the one used where the reader is (Letter for the US and a few others), and the Paper switch offers both. One style for every view, asked for in Nov 2026 after several rounds: no full-page pictures, printable pages. One view: a cover with its thumbnail picture (a flag), then entries on the left under their chapters and the page's stretch of the timeline down the right, with a bar at its top showing where the page sits, no scale numbers, a dot level with each name and a straight dotted line, beside the dot only the year it began, in a size that fills the rail (not its name again, nor the year it ended; asked for, Nov 2026), a curve only where entries share a year, chapter tints (grey before the first chapter). Several views: a cover whose tiles start just under the title and fit their boxes for 2 to 8 views (`fitTiles()`: the chapter list is cut short with "… and N more", then the description to two lines, then the pictures; asked for, Nov 2026), then one timeline down the exact middle in strict date order, each year written once; views stand left and right like the pips of a die (1st left, 2nd right, 3rd left…), each in a box bordered in its colour that appears where its entries fall; the heading names the left views on the left and the right views on the right. The cover's heading reads "A timeline from codegrave.com"; the link in the footer is printed only on the last page. The Template switch (the poster is the default, asked for in Nov 2026; `fmt=book` for the book) also offers a Poster ( `poster()` in `site/print.js`, picked from four designs and reworked over several rounds, Nov 2026): landscape sheets on A2, A3, A4 or Letter (the Paper switch; asked for, Nov 2026, so it prints at home): laid out in A2 sizes and scaled to the paper (`posterSheet()`), A3 as A2 at 0.71 with four rows, A4 and Letter at 0.8 with two rows of taller cards, as few sheets as keep the cards at least 44 mm wide before scaling (Space Exploration: three on A2 or A3, eight on A4, nine on Letter); one thick line across the middle coloured by chapter and named on itself; every entry a card (picture, kind, name, years, summary; no credit over the picture: the credits are listed on a sheet of their own at the end, asked for), on white paper with few colours: the chapters' colours on the band, the cards' top edges and years, the rest grey on one grid shared by four rows, so every row starts at the left edge and ends at the right, with any gaps inside; each column reads top to bottom in date order, the inner cards' lines drop straight to the line and the outer cards' run down the gutter, so no line crosses a card; a small ring and the year in plain text where each line meets the band (pills were rejected); cards that share a year meet the band at one point with the year written once on each side a line comes from, their lines bending to it in a short curve so the order holds (asked for, Nov 2026); a small heading on every sheet (on the first sheet the view's thumbnail, a flag, stands just before its name in the title, 4 mm high on paper, asked for, Nov 2026): alone in the top right corner the whole span as a bar in the chapters' colours with this sheet's stretch outlined and its years (no "Part 2 of 3"), and below it the title in a light weight with, on the first sheet, the description just after it (asked for: the heading is not the focus); cards bordered all round in a soft tint of their chapter's colour (`soften()`, asked for); with several views a card whose view has a thumbnail carries it small (2.4 mm on paper) on its top border at the left, with no name (`.cthumb`); the book's view boxes show the thumbnail at the top left when there is one, else the view's name in its colour (asked for, Nov 2026); the band ends in a point of its own last colour; a footer from the start of the line to its point with the note of each chapter on the sheet in its colour (several views: a key of the views); "codegrave.com" very small at the bottom centre of every sheet, under the footer, so the chapter notes have the footer's whole width and nothing overlaps (asked for, Nov 2026); nothing stands nearer than about 5 mm to the edge of the paper, and the band's point stands as far from the right edge as its start from the left, because home printers cut the edges (asked for, Nov 2026). The downloaded file is named after the views, the template and the paper (`space-exploration-poster-a4.pdf`). Keep the rules above unless asked.
- **Words.** A person is born and dies; a city is founded; a species goes
  extinct. The words come from the entry's branch (`words` in `boot.json`,
  `wordsNow()` for mixed text).
- **The top search** (`findOnTimeline()`) finds entries, events, chapters
  and years among what is drawn and goes there; it understands `44 BCE` and
  `66 ma`. Below a divider it lists matches from the search index that are
  not on the timeline, ordered by how well the name matches (a match in the
  name always beats a match in another name), then base before community,
  then rank, then popularity. For a year that is not drawn it lists what
  began or ended in that year (`entriesInYear()`), and the panel's search
  does the same. Picking one (`bringIn()`) fetches the entry, shows its
  home view and opens it. When nothing matches it offers "Suggest …", which
  opens the "New entry" issue form.
- **The entry pane** shows the kind and branch, labels, other names, every
  event, link and source, and a note when the entry is a community entry.
  A link to an entry that is not loaded shows its name and loads on click.
- "Propose it to the editors" at the foot of Explore opens the "Propose a view" issue
  form with the current link filled in; under it a quiet link says the data and code are on GitHub (asked for, Nov 2026, in place of the menu item).
- **Play takes the whole screen.** The road (`#stage`) always fills the
  page from the top (`stageOf(SW, SH, top)` keeps `TOP` pixels of air
  above it). While play travels, what floats at the top (the phone's menu
  button, Publish) slides away (`body.playing`); pointing at the top edge
  brings it back (`body.peek`), and it returns when play stops.
- **Open in editor** (`site/editor.js`, `docs/ACCOUNTS.md`; option 2 of
  the designs, asked for in Nov 2026 with "no multiple tabs"): beside
  Publish on a timeline of the reader's own made with AI. One page over the
  left of the road (`#editor`, `body.editing`): the title and description
  typed in place, every entry a row under its chapter, a row opening in
  place; the road narrows to `--edroad` on the right and travels to the row
  being edited (`goTo` lent by the page). It edits the spec and redraws
  through `specToView()`; it saves by itself, with Undo and Redo. On a
  phone an entry opens as a sheet with the road above it (`body.ed-sheet`).
- **A ranked list** ("top 100 foods"; asked for, Nov 2026, because the
  model laid such a list out by year): a spec with `axis: "rank"` gives
  each entry a `rank` instead of dates (`cleanSpec()` numbers them again
  1, 2, 3); rank n stands where the year n would, and its entry carries
  `pos`. While every view on the road is ranked (`RANKED`, `body.ranked`)
  every year is written "#n", the calendar marks and the year pill are off,
  and the panel says "Number n of N". The pill in the strip shows a view's
  number of entries in grey brackets (asked for, Nov 2026).
  A measured list ("tallest buildings", "richest people") has
  `axis: "scale"`: each entry a `value` and the spec a `unit`; entries
  stand from smallest to largest, mapped onto years 1 to 1001 (`scaleYear()`
  in `site/ai.js`, on a log scale when the values spread a hundredfold),
  and the road writes the value (`axisLabel()`, `fmtValue()`). When the
  model names no axis, `axisOfSpec()` infers it from what the entries
  carry. Rank and scale entries have no events. Views on another axis than
  the road's are shown alone, never side by side (`axisKey()`).
- **The full picture** (`site/picture.js`; asked for, Nov 2026): a picture
  in the panel shows "View full" and opens over the whole page, whole,
  with its caption, credit, licence and the original, stepping through the
  entry's pictures and films (arrows, keys, the strip, a swipe). A click
  shows the picture at its own size; the page itself never zooms.
- Pictures are never cropped: cards, the walls, the panel and the view
  thumbnails show the whole picture (`object-fit: contain`), portrait or
  landscape. A wall frame takes the shape of its picture (`fit()` in
  `site/wall.js`, at most `TALL` taller than its place; the tests keep
  every shape clear of the other frames). When other views take the road, `wall.reset()` empties every
  frame at once so no picture of the old views lingers.
- Lines are neutral. Colour is only for view names and the selected line.
- Whether a name is a card is decided by distance, not by rank.

The road draws at most `MAX_ROWS` lines, best ranked first, so it stays
fast at any data size. It draws them on one canvas and makes an element
only for the few names in sight. Keep it that way: never draw one element
per entry without a cap, and never make the page fetch a chain of files to
answer one click.

## Before you finish

- `node scripts/build.mjs --check` prints `0 errors`.
- `node --test` passes.
- If you changed the page, load it and check the browser console is clean at
  1440 and 390 pixels wide. Watch it move as well: press play, and look at a
  road of two or three views, since cards behave differently by lane.
- If what the page shows changed (a view, an entry, or `site/`), take
  screenshots at 1440 and 390 pixels wide for the pull request. With
  Playwright: build, serve `site/` on a local port, open
  `http://localhost:<port>/<owner>/<id>` (or `#<entry-id>`), and save
  a full-window screenshot at each width.

## Opening the pull request

Fill in `.github/pull_request_template.md`; do not delete its sections.
Use a title that says what changes ("Add Hypatia", "Fix Flash end date").
Describe what changes and why, link a source for every date you added or
changed, attach the screenshots, tick the checklist honestly, and say that
an AI assistant helped. Keep one topic per pull request.

A change to the page itself, or to the data rules, needs an agreed issue
first (an "Idea or proposal"). Do not open a large unrequested refactor.

## Licence

Code (`site/`, `scripts/`, `tests/`, `schema/`, config) is MIT. Content
(`data/`, `docs/`, Markdown, diagrams) is CC BY-NC-SA 4.0. Do not copy text
from sources into summaries or notes: write it in your own words and cite
the source. Only use images with a free licence and record their author.
