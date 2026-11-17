# Guide for AI agents and new developers

Read this first. It is the whole map; you should not need to open many files
to make a correct change.

## What this is

codegrave.com is one page: a left-to-right timeline of digital things from first
release to official end. Things only, never entries about people. There is
no framework, no package manager and nothing to install. You need Node 22.

## Commands

```sh
node scripts/build.mjs --check      # check all data; must print "0 errors"
node scripts/build.mjs              # also write site/data/ so the page can load
node --test                         # run the tests
python3 -m http.server 8080 --directory site    # view the page
node scripts/new.mjs thing <category> <id> "<Name>" <born-date>
node scripts/new.mjs view <id> "<Name>"
```

## Where things are

| You want to change | Edit | Do not edit |
| --- | --- | --- |
| A fact about a thing | `data/things/<category>/<id>.json` (one file) | `site/data/` (generated) |
| A view | `data/views/<id>.json` (one file) | another person's view |
| Featured or default views | `data/editors-choice.json` | |
| Categories, named eras | `data/categories.json`, `data/checkpoints.json` | |
| An icon or image | `data/media/`, then name it on the thing or event | `site/data/media/` (generated) |
| How ranking works | `site/rank.js`, then `tests/rank.test.mjs` and `docs/DATA_RULES.md` | |
| How the page looks or behaves | `site/app.js`, `site/styles.css`, `site/index.html` | |
| The data rules themselves | `scripts/build.mjs`, then `docs/` and `schema/` to match | |

To find a thing without listing folders: its path is always
`data/things/<category>/<id>.json`, and the id is in its link,
`codegrave.com/#<id>`. Search by name with `grep -rl '"name": "Flash' data/things`.

## Rules that are easy to break

1. One thing or one view per file. The file name is the `id`; for a thing the
   folder is its `category`. Never rename an id that has been merged.
2. A view only chooses what to show. Never put dates, names or ranks in a view.
3. Never invent a date. Use the `precision` you can support (`year` is fine)
   and list the source. Leave `"verified": false` unless you checked every
   date in the file against a listed source.
4. A dead thing needs an `ended` event and a one-line `cause`.
5. `site/data/` is generated and git-ignored. Change `data/` and rebuild.
6. Keep one topic per pull request.

Full rules: `docs/DATA_RULES.md` (things) and `docs/VIEWS.md` (views).
`schema/` holds JSON Schemas for editor hints; `scripts/build.mjs` is the
authority when they differ.

## How the page code is laid out

`site/app.js` is one module in sections, in this order: constants, dates,
data, state and URL, layout, render, panel (views, then the history of one
thing, then one era, then the info popup), events, start. Each section
starts with a `// ----` comment line with its name. `site/rank.js` holds the
ranking as pure functions with tests.

The page redraws from `state` in one function, `render()`. To change
behaviour: change `state`, then call `changed()` (which also updates the
link) or `render()`. Do not patch the drawn page directly. The one exception
is `onScroll()`, which only moves names so they stay in sight.

How the page is put together:

- The timeline fills the page. The panel is hidden until its button or a
  line is clicked. It never covers the timeline: on wide screens and tablets
  it sits beside it and the timeline narrows; on phones (under 700 px) it is a
  sheet over the lower half and the timeline and axis move up above it
  (`sheetH()`). It has three panes: views, the history of one thing, and
  one era.
- `state.views` is the list of views on the timeline. Each owns a block of
  rows (a section) under its coloured heading line. A view's own eras
  (`checkpoints`) are drawn inside its section in its colour; there is no
  timeline-wide strip of eras (`data/checkpoints.json` is not drawn). The
  grip under a section drags it shorter or taller (`state.sizes`, pixels; a
  shorter section keeps its best-ranked rows), redrawing once a frame.
  `state.fit` (the button above reverse, bottom right; `?h=expand` turns it off) makes the
  sections share the screen height; Expand lets each take what it needs.
  In the panel, "Showing" lists the views as rows: drag a row to reorder
  the sections, its dot (left) picks the view's colour, its cross (right)
  removes it, and shuffle mixes the colours (`?c=` in the link).
  There is no category control; categories only exist as views.
  The views pane is search, then one ticked list of every view (grouped
  Classical, Featured, Community by `tabOf()`), then a sentence naming what
  is on the timeline, then the filters at the bottom: the year range
  (`state.span`) and how much to show (`state.level`).
- Play sits at the bottom left of the axis and reverse (`state.order`) at
  the bottom right. A marker on the axis (`play.t`, null at the far end)
  can be dragged at any time; the timeline shows only what had happened by
  then. Play just moves the same marker.
- The search in the top bar (`findOnTimeline()`) finds things, events,
  eras and years among what is drawn and goes there. Below a divider it
  lists matching things that are not on the timeline; picking one adds a
  view that holds it (the category view first). The GitHub icon next to the
  theme switch opens the repository. The panel's search
  finds views to add.
- The panel list is grouped Featured (open), Classical, Community (folded,
  `openGroups`). "Propose a view" at the end of Community links to the
  README's guide (`PROPOSE`); views arrive as pull requests, not from a form.
  The bookmark icon saves the timeline as "Your view" in
  this browser (`cg-mine`, one slot; saving again replaces it), and the
  page opens on it when the link names no views.
- Each history entry is a button; `jumpTo()` scrolls to that moment on the
  line and marks it briefly.
- Time is a straight scale left to right (`L.xOf`, `L.tOf`), years on the fixed axis at the bottom.
- Lines are neutral. Colour is only for view names and the open line.
- A thing with `rank < CARD_RANK` gets a card; the rest get a name.

Layout draws at most `MAX_ROWS` lines, best ranked first, so it stays fast
at any data size. Keep it that way: never draw one element per
thing without a cap.

## Before you finish

- `node scripts/build.mjs --check` prints `0 errors`.
- `node --test` passes.
- If you changed the page, load it and check the browser console is clean at
  1440 and 390 pixels wide.
- If what the page shows changed (a view, a thing, or `site/`), take
  screenshots at 1440 and 390 pixels wide for the pull request. With
  Playwright: build, serve `site/` on a local port, open
  `http://localhost:<port>/?views=<id>` (or `#<thing-id>`), and save a
  full-window screenshot at each width.

## Opening the pull request

Fill in `.github/pull_request_template.md`; do not delete its sections.
Use a title that says what changes ("Add Elixir", "Fix Flash end date").
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
