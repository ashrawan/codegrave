# Views

A view is a named way of looking at the timeline, such as "The browser wars"
or "What the iPhone ended". Anyone can add one with a pull request. Visitors
find views by searching in the panel, and can put several side by side. Each
view on the timeline gets its own block of rows under its name. Every view
has its own link, `codegrave.com/?views=<id>`, and a link can name several:
`?views=languages,browsers`.

Things are filed on one map, `data/categories.json`: seven domains (Machines,
Parts, Devices, Software, Networks, Online, AI), each holding several kinds
(the `categories`, such as phones or browsers). A thing is filed by what it
is, never by who made it or who uses it. On the page the map appears only as
views: one view per domain, kept in `data/views/` like any other.

The panel has a search box that finds views and things, and one list of every
view, ticked when it is on the timeline, in two groups:

- **Community views**: every view that tells a story, such as "The browser wars",
  whoever made it, in rank order: those named in `featured` in
  `data/editors-choice.json` first, then the rest by name. A new view lands here.
- **Classical views**: one view per domain (tagged `domain`) and "Everything"
  (tagged `all`), by name. Each shows all it holds. A domain with no things
  yet is not listed.

A view of a single kind, such as "Browsers", is tagged `kind`. It is in
neither group; the search finds it and its link works.

Each group shows three rows at a time and scrolls the rest.

Below the list, "Showing" has one row per view on the timeline: drag to
reorder, the dot picks its colour, the cross takes it off.

A thing that is in two views on the timeline is drawn in both sections, so
every view always shows all of its own things.

A view only chooses what to show. It never changes a fact. Dates, names,
causes and ranks come from `data/things/` and are the same in every view.

## Add a view

The steps, from fork to pull request, are in "Propose a view" in
`README.md`; "Propose a view" on the page links there. Include a screenshot
of the view in the pull request.

Start the file by hand, or with `node scripts/new.mjs view <id> "<Name>"`:

Create one file, `data/views/<id>.json`. The file name is the `id`.

```json
{
  "id": "browser-wars",
  "name": "The browser wars",
  "description": "Netscape against Internet Explorer, and the languages that grew up around them.",
  "author": "your-github-name",
  "tags": ["browsers", "web", "1990s"],
  "categories": ["browsers", "languages"],
  "level": 60,
  "year": 2001
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Lower-case letters, digits and hyphens. Never changes once merged, because links use it. |
| `name` | yes | At most 60 characters. |
| `description` | yes | One or two sentences, at most 200 characters. |
| `author` | yes | Your GitHub user name. |
| `tags` | no | Up to 8 words people might search for. |
| `categories` | yes | The kinds whose things the view holds, at most 8. Empty means every kind. |
| `domains` | no | Domain ids. The view also holds every kind in these domains, including kinds added later. |
| `level` | yes | How much to show, from 5 to 100. 10 is landmarks, 30 notable, 60 most, 100 all. |
| `year` | no | The year to centre on when the timeline is wider than the screen. |
| `order` | no | `"old"` (the default, oldest on the left) or `"new"` (newest on the left). |
| `checkpoints` | no | The view's own eras, in the same shape as `data/checkpoints.json`: `id`, `name`, whole-year `from` and `to`, and an optional `note` (at most 400 characters). They are drawn inside the view's own section, in its colour. There is no shared strip of eras across the top. Eras of one view must not overlap. |
| `things` | no | A hand-picked list of thing ids. When present, the view shows exactly these things. |
| `image` | no | The view's thumbnail in the list: a picture with `src` (a file under `data/media/` or a Wikimedia Commons file), `alt`, `credit` and `licence`, as for a thing's image. Leave it out and the build makes one: a small drawing of the view's own lines, made once when the site is built, so the page never draws thumbnails from the whole dataset. |

There are two kinds of view. Without `things`, the view is a set of
categories and a level, and it grows by itself as new things are added.
With `things`, it is a hand-picked list and shows only what it names.

The page opens in the light theme, oldest on the left, with everything
shown (level 100). The views on the timeline sit as pills in a strip under
the years. The years run along the bottom and fit the things on
screen: from a little before the earliest of them to today, or to the last
ending when all of them have ended. The year range in the panel narrows it;
the link then carries `yr=<from>-<to>`, for example `?views=browsers&yr=1995-2001`.
A marker on the axis can be dragged to see the timeline as it stood in
any year; Play (bottom left) moves the same marker and draws each line as
it reaches it. The button at the bottom right flips the order.

A view is never drawn empty: its three best things show even when none
reaches the level. A thing that is in two views on screen is drawn once,
under the first.

## Editor's choice

`data/editors-choice.json` is the one place that decides what is featured:

```json
{ "default": ["endings-2020s", "browser-wars"], "featured": ["endings-2020s", "browser-wars"] }
```

`default` is what a new visitor sees: one view id, or a list of up to eight
shown side by side. It can be any view, from either group. `featured` ranks
the Community views: the views it names come first, in that order. Only editors change this file.

## What makes a good view

- It has a point of view that the name states plainly.
- It is about things, not people.
- It does not repeat an existing view under a new name.
- If a thing you need is missing, add the thing in its own pull request
  first, following `docs/DATA_RULES.md`.
