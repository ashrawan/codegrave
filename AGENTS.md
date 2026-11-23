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
| How the page looks or behaves | `site/app.js`, `site/styles.css`, `site/index.html` | |
| The printable export ("Export as PDF") | `site/print.js`, `site/print.css`, `site/print.html`, then `tests/print.test.mjs` | |
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
- **The bar** (`#axisbar`) stands upright on the right: play at the
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
- **The panel** is hidden until its button, the "Views" button in the strip
  or a name is clicked. The "Views" button toggles: pressed again while the
  views pane is open, it closes the panel. It never covers the road: on wide screens and
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
  left with the pills; at its right end stand the "Views" button (moved
  there on request, Nov 2026), Export as PDF, then reverse (`state.order`), small, last in the strip
  (moved there on request, Nov 2026). There is no bookmark: "Your view" was
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
- **The views pane** is search, then a row of chips (`drawChips()`: the
  editors' topics from `data/editors-choice.json`, today Countries,
  Culture, History, Science and Technology, after a first chip "My view"),
  then the list, then the filter: the year range (`state.span`). "My view"
  is pressed when no topic is, and the list then holds only the views on
  the timeline; there is no "All" list (removed on request, Nov 2026: "just
  have a current showing there, and anything we search"). With several
  views, the "My view" heading of that list carries shuffle (dots in the views' colours on a turning arrow), which mixes
  their colours (moved there from the strip on request, Nov 2026). Pressing a chip
  lists that topic's views; pressing it again, or "My view", goes back.
  Both search boxes have a cross that clears them (`.clr`). A search finds
  every view, community and classical, and entries and years. "How much to show" was
  removed on request (Nov 2026): every entry of a view is on the road, and
  the road's scale and the cards by distance do the rest. On a phone the filters fold into one line
  (`#filters-btn`) so the list has the sheet. Only community views sit
  under the chips.
  Classical views are found by the search, where every result
  carries an icon that says which sort it is. A row is a thumbnail made by
  the build (`scripts/thumb.mjs`), then the name and one quiet line
  (`viewSub()`: the years the view covers and how many entries it holds).
  The description is the row's tooltip and is searched; it is not printed
  in the list. Keep the row to those two lines.
- **The heading.** The views on the road are named across the top centre, in the order of their lanes, each with the chapter the reader is in below it in small capitals in its colour, with no lines (`#road-views`; style "A", picked from six); the year the reader stands in is written large on the right (`#road-year`), and where the road stops at the present it reads "Today". Asked for in Nov 2026.
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
  from the strip on request, Nov 2026). Asked for in Nov 2026. When a few entries start far earlier than the rest, the view opens on
  the rest and "Show all years" reaches back. Every date on the page goes
  through `fmtDate()` and `spanText()`, which read BCE and deep-time dates.
- **Export as PDF.** The PDF icon in the strip (`site/media/pdf.svg`, from Wikimedia Commons, asked for, its red muted until pointed at; tooltip "Export as PDF"), beside reverse, opens `print.html` in a new tab with the views on the timeline, their order and colours (`?views=…&c=…`, `&yr=` when the year range is narrowed: then only the entries begun in that range are printed, and `&o=forward` or `&o=backward`, the direction of the timeline (the page's own link carries it too): backward: then every page reads from today back, newest first; the print page also has a Timeline switch: Forward, past to today, or Backward, today to past, which rewrites `o` in its link). `site/print.js` loads the same view files, lays the pages out by measuring them in the browser, and waits (nothing opens by itself, asked for in Nov 2026). Its "Download PDF" button saves a .pdf in one click (picked over the print dialog and over a server, Nov 2026): each page is drawn to an image by html2canvas and the images are put into one file by jsPDF, both fetched from cdnjs only when pressed; so the text in the file is not selectable, and pictures must allow CORS (`crossorigin` on every picture; Wikimedia does). Printing is left to the browser, which uses `print.css`. With a year range, only the chapters that overlap it are shown. Chapters are not numbered anywhere in the export (asked for, Nov 2026). The reading font (names, headings, summaries; `--serif`) is picked under Text from ten free fonts (`FONTS_OFFERED`, SIL Open Font License, fetched from Google Fonts only when picked, `&font=` in the link); Lora is the default (picked from the ten, Nov 2026; Bookerly was asked for first, but it is Amazon's and cannot be served). Text size, a slider from 60 to 150 % under Text (`&size=`); its 100 % is 1.4 times the size the layout was drawn for (`TEXT_BASE`; asked for, Nov 2026: the old 140 % read best, so it became the default): the book scales its reading text (`--fs`; the headers, rails and cover titles keep their size) and keeps its layout, so larger text takes more pages; the poster scales whole sheets in `posterSheet()` as far as two rows of cards fit the paper, then the cards' text alone (`--tf`). Only the codegrave name keeps Instrument Serif. The bar has two menus, each naming its current choices on its button (asked for, Nov 2026, as the old Template plus Export options felt mixed): Layout, the shape of the document (Template, Paper, Timeline), and Text, how it reads (Font, Size); opening one closes the other, and on a phone their buttons read just Layout and Text. The paper is A4 or Letter: `paperFor()` picks the one used where the reader is (Letter for the US and a few others), and the Paper switch offers both. One style for every view, asked for in Nov 2026 after several rounds: no full-page pictures, printable pages. One view: a cover with its thumbnail picture (a flag), then entries on the left under their chapters and the page's stretch of the timeline down the right, with a bar at its top showing where the page sits, no scale numbers, a dot level with each name and a straight dotted line, beside the dot only the year it began, in a size that fills the rail (not its name again, nor the year it ended; asked for, Nov 2026), a curve only where entries share a year, chapter tints (grey before the first chapter). Several views: one timeline down the exact middle in strict date order, each year written once; views stand left and right like the pips of a die (1st left, 2nd right, 3rd left…), each in a box bordered in its colour that appears where its entries fall; the heading names the left views on the left and the right views on the right. The cover's heading reads "A timeline from codegrave.com"; the link in the footer is printed only on the last page. The Template switch (the poster is the default, asked for in Nov 2026; `fmt=book` for the book) also offers a Poster ( `poster()` in `site/print.js`, picked from four designs and reworked over several rounds, Nov 2026): landscape sheets on A2, A3, A4 or Letter (the Paper switch; asked for, Nov 2026, so it prints at home): laid out in A2 sizes and scaled to the paper (`posterSheet()`), A3 as A2 at 0.71 with four rows, A4 and Letter at 0.8 with two rows of taller cards, as few sheets as keep the cards at least 44 mm wide before scaling (Space Exploration: three on A2 or A3, eight on A4, nine on Letter); one thick line across the middle coloured by chapter and named on itself; every entry a card (picture, kind, name, years, summary; no credit over the picture: the credits are listed on a sheet of their own at the end, asked for), on white paper with few colours: the chapters' colours on the band, the cards' top edges and years, the rest grey on one grid shared by four rows, so every row starts at the left edge and ends at the right, with any gaps inside; each column reads top to bottom in date order, the inner cards' lines drop straight to the line and the outer cards' run down the gutter, so no line crosses a card; a small ring and the year in plain text where each line meets the band (pills were rejected); a small heading on every sheet: alone in the top right corner the whole span as a bar in the chapters' colours with this sheet's stretch outlined and its years (no "Part 2 of 3"), and below it the title in a light weight with, on the first sheet, the description just after it (asked for: the heading is not the focus); cards bordered all round in a soft tint of their chapter's colour (`soften()`, asked for); the band ends in a point of its own last colour; a footer from the start of the line to its point with the note of each chapter on the sheet in its colour (several views: a key of the views); "codegrave.com" very small at the bottom centre of every sheet, under the footer, so the chapter notes have the footer's whole width and nothing overlaps (asked for, Nov 2026); nothing stands nearer than about 5 mm to the edge of the paper, and the band's point stands as far from the right edge as its start from the left, because home printers cut the edges (asked for, Nov 2026). The downloaded file is named after the views, the template and the paper (`space-exploration-poster-a4.pdf`). Keep the rules above unless asked.
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
- "Propose a view" at the foot of the panel, under the filters (moved
  there on request, Nov 2026), opens the "Propose a view" issue
  form with the current link filled in.
- **Play takes the whole screen.** The top bar floats over the road: the
  road (`#stage`) always fills the page from the top, and keeps a band of
  `TOP` pixels clear (`stageOf(SW, SH, top)` puts the road and the names
  below it), so nothing moves when the bar comes and goes. While play
  travels the bar slides away (`body.playing`); pointing at the top edge
  brings it back (`body.peek`), over the open panel too (asked for, Nov
  2026), and it returns when play stops. Asked for in Nov 2026: do not make the
  road move with the bar again.
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
