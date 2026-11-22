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
  chapters. The folder `codegrave` belongs to the editors.

## Commands

```sh
node scripts/build.mjs --check      # check all data; must print "0 errors"
node scripts/build.mjs              # also write site/data/ so the page can load
node --test                         # run the tests
python3 -m http.server 8080 --directory site    # view the page
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
| The pictures and films on the walls beside the road, era by era | `data/wall.json` (`docs/WALL.md`) | |
| How ranking works | `site/rank.js`, then `tests/rank.test.mjs` and `docs/DATA_RULES.md` | |
| What the build writes for the page | `scripts/build.mjs`, then `docs/BUILD.md` and `tests/build.test.mjs` | |
| How the page looks or behaves | `site/app.js`, `site/styles.css`, `site/index.html` | |
| The arithmetic of the road (its scale, which stretches busy periods; sizes in depth, tracks, which names fit and in what order, how a card opens, turns during play, the years) | `site/road.js`, then `tests/road.test.mjs` | |
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
- `v/<view-id>.json`: one view and the entries it shows (at most 200, best
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

- **Loading.** `start()` asks for `boot.json` and, at the same time, the
  views the link names (or the saved "Your view", else `home.json`).
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
  evenly: see the next point). Each view is a lane and each entry a line
  along it, on a track of its own (`tracks()`). The reader stands at
  `road.t` facing the future, or the past when reversed (`camDir()`). `L.D`
  is the focal length, a length of road (`focalYears()`): what is `D` ahead
  is drawn half size.
  The ground (road, lanes, years, lines, starts, ends, chapters) is one
  canvas, `#road-cv`. Names are elements in `#road-labels`: a start is a
  card when near (from size `FULL`, never drawn smaller than `CARD_MIN`), a
  small card further off, then a bare name; an end is a dashed plate with
  its cause. `placeLabels()` decides every frame which fit, best first and
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
  thing. A card that leaves fades where it stands. This was asked for in so
  many words ("think like opening scroll"), so do not bring back a slide or
  a pop.
- **The look.** Dark by default, like a museum at night: a sky of stars,
  glass cards with a lit edge, the road lit warm from the left and cool from
  the right. Light stays as a softer gallery (`cg-theme`).
- **The media wall** (`site/wall.js`, `docs/WALL.md`). The road runs
  through a dark void (a CSS gradient, stars drawn once), with rails of
  light either side whose pulses rush towards the reader and about 200 motes
  of dust fading into fog, all on one 2D canvas and only while something
  moves. Asked for as "great performance on all devices": no WebGL, no
  library, no grid on the flanks. Six frames float either side (two on a
  phone) and show the
  pictures and films of the era in front of the reader, from
  `data/wall.json` by way of `boot.json`. Crossing into another era fades
  the frames one after another and eases the light of the walls and the
  road's edges to the era's `tone`. `roadFrame()` calls `wall.frame()` once
  a frame; the wall knows nothing about entries or views. Films play muted
  and only for the era in sight; less motion shows posters. Keep it behind
  the road (`#wall`, under `#road-cv`) and keep the frames few.
- **The front card** is selected by itself: the nearest card in front of
  the reader (`road.focus`) has its line drawn in its view's colour and its
  events written along it, like the open and the hovered entry
  (`road.heat` eases the colour). It is not `state.open`; do not write one
  to the other.
- **The bar** (`#axisbar`) stands upright on the right: reverse
  (`state.order`) at the top, play at the bottom, the whole span between
  them with ahead upwards, on the road's own scale so the marker climbs
  steadily (`barY()`, `barT()`, `barTicks()`), the stretch
  in sight shaded (`#axis-win`) and the marker at the reader. Dragging the
  marker moves the reader. Play moves the reader `PLAY_PACE` focal lengths
  a second, a little slower while cards stand in front and quicker through
  empty years (`paceFor()`). Because the road gives every start its own
  room, that pace stays nearly even. Every change of speed is eased, up to
  speed, down to the turn limit and to a stop on pause (`road.vel`), so the
  road never jerks under the reader. Space plays and pauses. At the far end the button offers to
  play again from the beginning.
- **Cards take turns while play travels.** The uneven scale keeps starts
  apart along the road, but cards are wide, so on a narrow screen or a
  crowded lane they would still cover one another, and before this the one
  behind passed without ever being shown. Now every start is owed a moment
  as a full card. A card that is up keeps its place for `DWELL` seconds
  once it has opened (`dwellFor()`: less when more than two wait); then it
  gives way to one it was hiding, and those come nearest first, in the
  order things happened (`orderOf()` in `site/road.js` decides the order
  for every name; `road.turn` counts each card's seconds). Play never
  stands still for this. It slows down early instead: each frame
  `turnPace()` works out how fast the reader may travel so that every card
  still owed its turn has had it by the time the reader is nearly on it
  (`road.limit`), and it never goes below `CRAWL`. A full stop was tried
  and was not wanted, so keep the floor. The open entry's card takes its
  turn like any other. Moving by hand, or any change to what is drawn,
  starts the turns afresh (`turnsOver()`). Standing still and travelling by
  hand, nothing takes turns: a card does not leave while someone reads it.
  Keep it this simple: no queue, no timers, only an order and a speed limit
  worked out each frame.
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
  Play also has music: one track, `site/media/gallery-of-glass.mp3`, that
  sounds only while play travels, eases in and out, keeps its place on
  pause and starts over when it ends (`tune()`). It is fetched when play is
  first pressed with the sound on, and the same button silences it. This
  was asked for with this file; do not swap the track without asking.
- **The panel** is hidden until its button, the "Views" button in the strip
  or a name is clicked. It never covers the road: on wide screens and
  tablets it sits beside it and the road narrows; on phones (under 700 px)
  it is a sheet over the lower half, and the road and the bar move up above
  it. It has three panes: views, the history of one entry, and one era. The
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
  colour, and the cross removes one of several. The strip starts at the
  left with the "Views" button and the pills; shuffle and the bookmark
  stand at its right end, the bookmark last. This was asked for; do not
  centre the strip again.
- **One view at a time.** Picking a view shows it alone (`showOnly()`): the
  others leave and the road opens at its beginning. Putting a view beside
  the others is the second action (`turnOn()`): the small plus at the end
  of its row, a right click, Shift, Ctrl or Cmd with a click, or
  Shift+Enter in the search. The same button takes a view off again when
  it is one of several. An entry found by a search that no view on the
  timeline holds brings its own view alone too (`bringIn()`); only a link
  that names its views keeps them and adds. Do not make adding the default
  again: it was changed on purpose.
- **The views pane** is search, then a row of chips (`drawChips()`: All,
  then the editors' topics from `data/editors-choice.json`, today History,
  Science, Technology and Culture), then the list of community views in the
  order `boot.json` gives them (topic by topic; under All each topic has a
  small heading), then the filters: the year range (`state.span`) and how
  much to show (`state.level`). On a phone the filters fold into one line
  (`#filters-btn`) so the list has the sheet. Only community views are
  listed. Classical views are found by the search, where every result
  carries an icon that says which sort it is. A row is a thumbnail made by
  the build (`scripts/thumb.mjs`), then the name and one quiet line
  (`viewSub()`: the years the view covers and how many entries it holds).
  The description is the row's tooltip and is searched; it is not printed
  in the list. Keep the row to those two lines.
- **The years.** `ruler()` writes the years along the edge of the road and
  `barTicks()` those on the bar. Because the scale is uneven there is no
  fixed step: `yearMarks()` in `site/road.js` writes a year where the years
  next to it leave room, round ones first (1, 5, 10, 50, 100 and so on, up
  to a billion), so single years are written where much happens and only
  round ones where little does. It is bounded by what fits on the screen, whatever the
  span; keep it so. There is no year 0; deep time is labelled ka, Ma and
  Ga. When a few entries start far earlier than the rest, the view opens on
  the rest and "Show all years" reaches back. Every date on the page goes
  through `fmtDate()` and `spanText()`, which read BCE and deep-time dates.
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
- "Propose a view" at the end of the list opens the "Propose a view" issue
  form with the current link filled in. The bookmark icon saves the timeline
  as "Your view" in this browser (`cg-mine`, one slot), and the page opens
  on it when the link names no views.
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
  `http://localhost:<port>/?views=<owner>/<id>` (or `#<entry-id>`), and save
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
