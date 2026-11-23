# What the build writes

`node scripts/build.mjs` checks everything under `data/` and writes the files
the page loads into `site/data/`. The page never loads the whole dataset. It
asks for small ready-made files with fixed names, so every action costs one
request and never a chain of lookups, however large the data grows.

| File | Holds | Loaded when |
| --- | --- | --- |
| `boot.json` | The map (branches and kinds, with each branch's words), the labels, the community views the panel lists (each with its topic, the years it covers and its thumbnail), the editors' topics, the default views, the 12 most-referenced entries, how the detail and search files are keyed, and the eras of the media wall (`data/wall.json`). | Always, once. |
| `home.json` | The default views, ready to draw, and `phone`: the ones a phone opens on. | The link names no views and the reader has saved none. Fetched at the same time as `boot.json`. |
| `v/<view-id>.json` | One view and everything it shows: its details, its eras, and the full entries it holds (a hand-picked view all of them up to 1,000, a classical view at most 200, best ranked first; `view.count` is how many it really holds). A community view is `v/<owner>/<id>.json`. | A view is put on the timeline. One request each, fetched together. |
| `d/<key>.json` | Full entries by id. `key` is the first hex digits of a hash of the id (`shardOf` in `site/keys.js`). | A link or a search result points at an entry that is not loaded. |
| `s/all.json` | The search index: one short line per entry and per view. | A search box is first used. |
| `c/<owner>.json` | One community folder: its profile, its views and its own entries. | A page about one contributor (not built yet). |
| `media/` | A copy of `data/media/`. | An icon or picture is shown. |

Old addresses keep working at the same cost: a view that moved (listed in
`data/redirects.json`) also gets its file under the old name, with the new id
inside it.

## What the build works out

So that the page does not have to hold everything to know what matters, the
build adds to each entry:

- `rank`, `score`, `topPct`, `peers` and `parts`: the ranking in
  `site/rank.js`, run once over all entries.
- `inbound`: the links other entries make to it (the best 40), and on every
  link the name of the entry at the other end (`n`), so the panel can show a
  link without loading that entry.
- `home`: the classical view that shows it, for "show this on the timeline".
- `tier`: `base` or `community`, and `owner` for a community entry.
- `pop`: how much the community leans on it (see below).

Each view gets its thumbnail (`scripts/thumb.mjs`) and its `count`.

## The search index

The index is its own file, used for nothing but searching. One line per
entry: `[id, name, kind, born year, end year, rank, popularity, tier, other
names]`; one line per view: `[id, name, type, count, description and tags]`.
The kind is its position in `boot.json`'s `categories`. The tier is 0 for a
verified base entry, 1 for a base entry not yet verified and 2 for a
community entry. A view's type is 0 for community and 1 for classical.

Lines are ordered by popularity, a number the build works out from what the
community itself does:

```
popularity = log2(1 + links pointing at it)
           + log2(1 + community views that list it)
           + 2 × log2(1 + different people who wrote those views)
```

So an entry that many separate people reach for outranks one that a single
person lists many times. A community entry counts the same way as a base
entry. The page orders results by how well the name matches, then base before
community, then rank, then popularity.

While the index is small it is one file. Past 20,000 lines the build splits it
by the first two letters of every word (`s/cu.json` holds everything with a
word that starts "cu"), and `boot.json` says which form is in use
(`search.mode`). The page handles both.

## Pages for search engines and link previews

Search engines and link previews (chat apps, social sites) read a page
before any script runs, so the one page would say the same thing for every
view. The build therefore also writes, outside `site/data/`'s JSON:

| File | What it is |
| --- | --- |
| `site/data/pages/<address>.html` | a copy of `site/index.html` for each view, with the block between `<!-- page meta` and `<!-- /page meta -->` filled in for that view: its title, description, canonical link, Open Graph and Twitter tags, and its own picture (a flag) or else `site/media/og.jpg` |
| `site/_redirects` | one Netlify rewrite per view: `/wiki/nepal` serves `/data/pages/wiki/nepal.html` and the address stays as it is |
| `site/sitemap.xml` | the home page and every view's address |

All three are generated and git-ignored. `site/robots.txt` is a plain file
that points at the sitemap. The addresses use `https://codegrave.com`
(`SITE` in the build). Once the page runs, it names the views shown in the
tab title itself (`writeUrl()`).

## Sizes to expect

Measured on 4,420 entries and 202 views (61 of them community views): the
build takes under a second; `boot.json` is about 20 KB compressed, a
community view 5 to 16 KB, the largest classical view about 68 KB, the
search index about 167 KB, a detail file about 6 KB. Detail files hold at most about 64 entries
each: the build uses more hex digits of the hash as the data grows
(`detail.chars` in `boot.json`). A classical view carries its 200 best-ranked
entries however many it holds, so no file grows with the dataset except the
search index, which splits itself, and `boot.json`, which lists every
community view with its thumbnail (about 0.2 KB compressed each). Past about
1,000 views, move that list into files per topic and load one when its chip
is picked.
