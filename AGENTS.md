# Guide for AI agents and new developers

Read this first. It is the whole map; you should not need to open many files
to make a correct change.

## What this is

codegrave.com is one page: a left-to-right timeline of everything, from its
start to its end. It is an encyclopedia drawn in time: people, places,
organisations, events, works, ideas, living things, the Earth and the sky,
and technology, with computing as the oldest and deepest shelf. There is no
framework, no package manager and nothing to install. You need Node 22.

The data has two layers:

- **The base** (`data/base/`): one reviewed file per entry. Every view draws
  on it, so a fact is written once.
- **Community folders** (`data/community/<github-name>/`): what one person or
  group publishes. Their views are "books": a title, a hand-picked list of
  entries, and chapters. The folder `codegrave` belongs to the editors.

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
| A view (a book) | `data/community/<owner>/views/<id>.json` (one file) | another person's folder |
| An entry the base lacks, for your own view | `data/base/` in the same pull request, or `data/community/<owner>/entries/<id>.json` | |
| Featured or default views | `data/editors-choice.json` | |
| The map (branches and their kinds, which are the folders of `data/base/`) | `data/categories.json` | |
| Labels | `data/labels.json` | |
| An old address that must keep working | `data/redirects.json` | |
| An icon or image | `data/media/`, then name it on the entry or event | `site/data/media/` (generated) |
| How ranking works | `site/rank.js`, then `tests/rank.test.mjs` and `docs/DATA_RULES.md` | |
| What the build writes for the page | `scripts/build.mjs`, then `docs/BUILD.md` and `tests/build.test.mjs` | |
| How the page looks or behaves | `site/app.js`, `site/styles.css`, `site/index.html` | |
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
   view. Chapter notes tell the story; the facts live on the entries.
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
data, state and URL, layout, render, search the timeline, panel (views, then
the history of one entry, then one era), play and scrub, events, start. Each
section starts with a `// ----` comment line with its name. `site/rank.js`
holds the ranking and the date functions as pure functions with tests;
`site/keys.js` holds the file keys and the word-splitting the search uses.

The page redraws from `state` in one function, `render()`. To change
behaviour: change `state`, then call `changed()` (which also updates the
link) or `render()`. Do not patch the drawn page directly. The one exception
is `onScroll()`, which only moves names so they stay in sight.

How the page is put together:

- **Loading.** `start()` asks for `boot.json` and, at the same time, the
  views the link names (or the saved "Your view", else `home.json`).
  `loadView()` and `loadEntry()` fetch one file each, once; `ingest()` keeps
  every loaded entry as a single object in `byId`. A view that fails to load
  leaves a note and the page keeps working. An old address is answered by
  the build's redirect file and the link is rewritten to the new id.
- **The timeline** fills the page. The panel is hidden until its button or a
  line is clicked. It never covers the timeline: on wide screens and tablets
  it sits beside it and the timeline narrows; on phones (under 700 px) it is
  a sheet over the lower half and the timeline and axis move up above it
  (`sheetH()`). It has three panes: views, the history of one entry, and one
  era. The entry and era panes head with a trail back (`state.trail`,
  `crumbs()`). Opening something from inside the panel adds a step, opening
  it from the timeline starts over, and Escape goes back one step.
- **Views.** `state.views` is the list of views on the timeline. Each owns a
  block of rows (a section) under its coloured heading line. An entry in two
  views is drawn in both sections; `L.at` maps an id to its first row. A
  view's chapters (`checkpoints`) are drawn inside its section in its
  colour. The grip under a section drags it shorter or taller
  (`state.sizes`; a shorter section keeps its best-ranked rows). `state.fit`
  makes the sections share the screen height; Expand lets each take what it
  needs. The views on the timeline sit as pills in a strip under the years
  (`#dock`): drag to reorder, the dot picks the colour, the cross removes
  it, "Add view" opens the panel.
- **The views pane** is search, then a row of branch chips
  (`drawBranches()`: All, then each branch that has community views), then
  the list of community views in the order `boot.json` gives them (featured
  first, then by name), then the filters: the year range (`state.span`) and
  how much to show (`state.level`). Only community views are listed.
  Classical views are found by the search, and every result carries an icon
  that says which sort it is. Each row has a thumbnail made by the build
  (`scripts/thumb.mjs`), which is also the switch that puts the view on the
  timeline.
- **Time** is a straight scale left to right (`L.xOf`, `L.tOf`) with the
  years on the fixed axis at the bottom. `axisTicks()` picks round steps
  from one year to a billion; there is no year 0; deep time is labelled ka,
  Ma and Ga. A long view is fitted to a few screens (`MAX_SCREENS`). When a
  few entries start far earlier than the rest, the view opens on the rest
  and "Show all years" reaches back. Every date on the page goes through
  `fmtDate()` and `spanText()`, which read BCE and deep-time dates.
- **Words.** A person is born and dies; a city is founded; a species goes
  extinct. The words come from the entry's branch (`words` in `boot.json`,
  `wordsNow()` for mixed text).
- **Play** sits at the bottom left of the axis and reverse (`state.order`)
  at the bottom right. A marker on the axis (`play.t`, null at the far end)
  can be dragged at any time; the timeline shows only what had happened by
  then. Play moves the same marker and crosses any span in about 20 seconds.
- **The top search** (`findOnTimeline()`) finds entries, events, chapters
  and years among what is drawn and goes there; it understands `44 BCE` and
  `66 ma`. Below a divider it lists matches from the search index that are
  not on the timeline, ordered by how well the name matches, then base
  before community, then rank, then popularity. Picking one (`bringIn()`)
  fetches the entry, adds its home view and opens it. When nothing matches
  it offers "Suggest …", which opens the "New entry" issue form.
- **The entry pane** shows the kind and branch, labels, other names, every
  event, link and source, and a note when the entry is a community entry.
  A link to an entry that is not loaded shows its name and loads on click.
- "Propose a view" at the end of the list opens the "Propose a view" issue
  form with the current link filled in. The bookmark icon saves the timeline
  as "Your view" in this browser (`cg-mine`, one slot), and the page opens
  on it when the link names no views.
- Lines are neutral. Colour is only for view names and the open line.
- An entry with `rank < CARD_RANK` gets a card; the rest get a name.

Layout draws at most `MAX_ROWS` lines, best ranked first, so it stays fast
at any data size. Keep it that way: never draw one element per entry
without a cap, and never make the page fetch a chain of files to answer one
click.

## Before you finish

- `node scripts/build.mjs --check` prints `0 errors`.
- `node --test` passes.
- If you changed the page, load it and check the browser console is clean at
  1440 and 390 pixels wide.
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
