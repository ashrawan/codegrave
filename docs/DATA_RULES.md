# Data rules

These rules keep the timeline accurate and consistent. `scripts/build.mjs`
enforces the ones a script can check.

## Two layers

- **The base** is the encyclopedia itself: one reviewed file per entry,
  `data/base/<kind>/<id>.json`. Anyone may propose a change; editors review
  it. Every view draws on the base, so a fact is written once and is the same
  everywhere.
- **Community folders** hold what one person or group made:
  `data/community/<github-name>/` with a `profile.json`, their views in
  `views/` and, when the base lacks something they need, their own entries in
  `entries/`. See `docs/VIEWS.md`.

A community entry follows every rule on this page. It is marked as the
community's on the page, never outranks a base entry of the same name in
search, and can be moved into the base by an editor once it is checked. It
cannot repeat a base entry (same name and kind, or the same `wikidata` item),
and a base entry never links to a community entry.

## Where an entry lives

The file name is the `id` and the folder is the kind (the entry's
`category`). Ids are unique across the whole base. A folder may be split
further once it grows large (`people/a/…`); only the first folder has
meaning.

The map is one tree in `data/categories.json`. Its ten top branches are
People, Places, Organisations, Events, Arts & media, Knowledge & belief,
Society & daily life, Life, Earth & space, and Technology. Computing sits
under Technology with its own seven sections. Each branch holds kinds (the
`categories`, such as rulers, cities, wars, books or browsers), and each kind
is one folder. File an entry by what it is, not by who made it or who uses
it.

## What belongs

- Anything a general encyclopedia would have: a person, a place, an
  organisation, an event, a work, an idea, a living thing, a part of the
  Earth or the sky, a tool or a machine.
- One entry per thing. A version gets its own entry only when it has its own
  life and end (Python 2, the Western Roman Empire).
- People: only public figures, and only public facts about their public life
  (birth, death, offices, works, relations that are part of the record).
  Nothing private about a living person, and nothing without a source.

## An entry

```json
{
  "id": "marie-curie",
  "category": "scientists",
  "wikidata": "Q7186",
  "labels": ["science", "women"],
  "aliases": ["Maria Skłodowska"],
  "status": "dead",
  "names": [{ "name": "Marie Curie", "from": "1867-11-07" }],
  "summary": "One short paragraph in your own words. Optional.",
  "events": [
    { "type": "born", "date": "1867-11-07", "precision": "day" },
    { "type": "milestone", "date": "1903", "precision": "year",
      "label": "Nobel Prize", "note": "Shares the physics prize for work on radioactivity." },
    { "type": "ended", "date": "1934-07-04", "precision": "day" }
  ],
  "signals": { "adoption": 5, "standard": 0, "editor": 0 },
  "links": [{ "type": "spouse", "to": "pierre-curie" }],
  "sources": [{ "title": "Wikidata: Marie Curie", "url": "https://www.wikidata.org/wiki/Q7186" }],
  "verified": true
}
```

- `id` never changes once published. It is the permalink
  (`codegrave.com/#marie-curie`). If an entry must move, the old id goes in
  `data/redirects.json`.
- `names` are in date order. The timeline shows the name an entry had at each
  point in time, so a rename adds a name and never rewrites the old one
  (Byzantium, Constantinople, Istanbul).
- `aliases` are up to 12 other spellings and names, so search finds the entry
  under any of them. Names are in English for now; other spellings go here.
- `labels` say what the entry is about: up to 6 from `data/labels.json`. A
  label never replaces the kind. Marie Curie is filed under scientists and
  labelled science and women.
- `wikidata` is the entry's Wikidata item. It is how the build knows that two
  entries are the same thing, so no item may appear twice.
- `maker`, `cause`, `website`, `official`, `icon` and `image` are optional
  and described below.

## Dates

A date is a year, a year and month, or a full day: `1995`, `1995-08`,
`1995-08-16`.

- A year before the common era has a minus sign and at least four digits,
  counted as historians do: `-0044-03-15` is 15 March 44 BCE. There is no
  year 0.
- Deep time uses the same form with more digits: `-66000000` is 66 million
  years ago.
- `precision` says how exact the date really is: `day`, `month`, `year` or
  `circa`. Never invent a day or a year. If sources only agree on "about 550",
  write `"date": "0550", "precision": "circa"`.
- Dates are given in the calendar that reference works use for that period;
  the page does not convert between calendars.

## Events

The types are the same for every entry. The words the page uses for them
depend on the branch (`words` in `data/categories.json`): a person is born
and dies, a city is founded, a war begins and ends, a species appears and
goes extinct.

| Type | Meaning | On the line |
| --- | --- | --- |
| `born` | The start: birth, founding, first release, first appearance, formation. Exactly one per entry. | Open circle |
| `project_start` | Optional. When work began, if well before the start. Needs a note. | Faint dotted lead-in |
| `released` | Optional. A major version or edition worth marking. Needs a note. | Grey tick |
| `changed_hands` | Optional. Sold, conquered, inherited or moved to a new owner. Needs a note. | Grey tick |
| `milestone` | Optional. Any other turning point. Needs a note. | Grey tick |
| `deprecated` | Optional, at most one. The end is announced. Needs a date. | The line turns dotted from here |
| `ended` | The end: death, dissolution, extinction, shutdown, destruction. At most one. | Short bar |
| `afterlife` | Optional. Life after the end. Needs a note, and `until` if it has stopped. | Faint dotted tail |

What counts as the start and the end:

| Branch | Start | End |
| --- | --- | --- |
| People | Birth | Death |
| Places, organisations | Founding | Dissolution, abandonment or destruction |
| Events | The year it began | The year it finished |
| Arts & media | First publication, release, performance or completion | Only when it truly ended: a show's original run, a destroyed artwork, a closed newspaper |
| Knowledge, society | First appearance | Only if it is gone or abandoned |
| Life, Earth & space | First appearance or formation | Extinction or disappearance |
| Technology | First release or introduction | Withdrawal, end of support or shutdown |

A rename is not an event. Add the new name to `names` and the page draws a
diamond at its date.

An event may fall in the years between `project_start` and `born`, but never
before `project_start` and never after `ended`.

Any event may carry three more fields:

- `label`: at most 16 characters, such as `"IE 6"` or `"Nobel Prize"`. An
  event with a label is written on the line of an entry that has a card.
  Without a label the event is a bare tick, and its `note` is read in the
  history.
- `image`: a picture for the history, in the form described under Icons and
  images.
- `url`: an `https` link to the official announcement or record of that
  event, shown under it in the history.

An entry may also have a `website` (its official site) and up to six
`official` links (`title` and `url`), shown at the top of its history.

## Status

- `alive`: still living, standing, active or in use.
- `dead`: has an `ended` event.
- `fading`: an editor's judgement that it is in clear decline. It must carry
  a `note` that says why, and it has no `ended` event.

`cause` is one line on why it ended. In Computing every ended entry needs
one; elsewhere it is optional, and it is left out when there is nothing to
say (a person's death needs no cause).

## Links

A link points from this entry `to` another entry's `id`. It is stored on one
side only; the build works out the other side. It may carry a `note`, a
`date` when the link belongs at a moment other than the default, and `until`
when it stopped (a membership, a marriage).

| Type | Meaning | Drawn |
| --- | --- | --- |
| `version_of` | A numbered generation of the same thing. | Branch, at this entry's start |
| `forked_from` | Copied and went its own way. | Branch |
| `spun_off_from` | A part that became its own thing. | Branch |
| `extends` | Adds to another thing and depends on it. | Branch |
| `built_on` | Uses another thing as its base. | Branch |
| `succeeded_by` | What came next: a successor state, a ruler's heir, a replacement product. | Handover, at this entry's end |
| `merged_into` | Folded into another thing. | Handover |
| `open_sourced_as` | Released as open code under a new name. | Handover |
| `contains`, `standardised_as`, `influenced_by` | Related, with no moment to draw. | Listed in the history only |
| `in` | Where it is or was: a building in a city, a city in a country. | Listed |
| `part_of` | The larger whole: a battle in a war, a book in a series. | Listed |
| `member_of` | A person or group that belonged to another. | Listed |
| `made_by` | The author, artist, inventor, founder or maker, when they have an entry. | Listed |
| `parent`, `spouse` | Family. `parent` points from the child to the parent. | Listed |
| `about` | A work about this subject. | Listed |
| `related` | Any other real tie. Use it sparingly, with a note. | Listed |

A branch or handover is drawn only when both lines are on screen and near
each other. Every link is always listed in the history, on both entries.
Family links are the start of family trees: the data is the same whether it
is drawn as a timeline or, later, as a tree.

## The page and the data

- **Cards.** An entry in the top tenth of its peers gets a card with its
  icon and name at the head of its line. Everything else gets a thinner line
  and a name. The ranking decides, so there is no field for it.
- **History.** Clicking a line opens every event, name, image, link and
  source of that entry in the panel, in date order. `summary` is the opening
  paragraph, at most 600 characters. Each entry in the history is a button
  that scrolls the timeline to that moment on the line.

## Icons and images

Files live under `data/media/`, and the build copies them to the site.
Images may instead be hot-linked from Wikimedia Commons: then `src` is an
`https://upload.wikimedia.org/wikipedia/commons/…` address and `source` is the
file's page on Commons, which records its author and licence. An entry may
have an `icon` (shown on its card) and an `image` (shown at the top of its
history). An event may have an `image`.

```json
"icon": { "src": "icons/typescript.svg", "alt": "TypeScript logo",
          "credit": "Microsoft", "licence": "Apache-2.0", "source": "https://…" }
```

Every one needs `src`, `alt`, `credit`, `licence` and an `https` `source`,
because we only show pictures we are allowed to show. `src` is a path under
`data/media/` ending in `svg`, `png`, `jpg` or `webp`, or a Commons address
as above. An image may add a `caption` of up to 200 characters. Without an
icon the card shows the entry's initials. Icons are drawn in the text colour
as a mask, so use one-colour marks; see `data/media/icons/README.md`.

## Ranking

There are thousands of entries, so each one gets a significance score and the
page shows the top share of each kind and era.

| Signal | Weight | Where it comes from |
| --- | --- | --- |
| Adoption | 35% | `signals.adoption`, a band from 1 (known to specialists) to 5 (known almost everywhere) |
| Influence | 25% | Counted from the links other base entries make to this one |
| Longevity | 15% | Years from start to end, or to today, up to 40 |
| Standard | 10% | `signals.standard`, 1 if it is or became a formal standard |
| Editor | 15% | `signals.editor`, from -2 to 2, for what the numbers miss |

The score becomes a percentile among peers: entries of the same kind that
began in the same era. An era is a decade since 1800, a century back to the
year 1, a thousand years back to 10,000 BCE, and one group for everything
older. With fewer than five peers the comparison widens to the whole kind,
then to its branch, then to everything. The "How much to show" control sets
the cut. What passes the cut but does not fit on the screen is left out from
the lowest rank up, and the panel says how many fit.

What the community does never changes a rank. How often community views list
an entry feeds only the order of search results (`docs/BUILD.md`).

## Sources and verification

- Every entry needs at least one source with an `https` URL.
- Prefer a primary source (the maker's own announcement, an official record)
  and mark it `"kind": "primary"`.
- Set `"verified": true` only after each date in the entry has been checked
  against a source listed on it. Unverified entries are labelled on the page.
- Wikidata may be used for identity and for dates, and then it is listed as
  a source. An entry whose start and end both agree with its Wikidata item
  counts as checked. Where an editor's year and Wikidata's differ, the entry
  stays unverified until someone settles it from a better source.
- Never copy text. Summaries, notes and causes are written in your own words;
  Wikipedia and other references are sources to cite, not text to reuse.

## Checkpoints and views

- A checkpoint is a named era with whole-year `from` and `to` (negative
  before the common era, never 0). Checkpoints of one list must not overlap.
  A `note` is at most 400 characters. A view carries its own eras, drawn
  inside its section (see `docs/VIEWS.md`); `data/checkpoints.json` holds a
  shared list that is not drawn.
- Views are covered in `docs/VIEWS.md`.
