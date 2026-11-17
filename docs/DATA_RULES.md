# Data rules

These rules keep the timeline accurate and consistent. `scripts/build.mjs`
enforces the ones a script can check.

## Where a thing lives

Each thing is one file: `data/things/<category>/<id>.json`. The file name is
the `id` and the folder is the `category`. Ids are unique across all
categories. One file per thing means two people adding two things never
touch the same file.

## What belongs

- Things only: languages, tools, products, machines, formats, networks.
  Never an entry about a person. Makers are named only as the `maker` of a thing.
- One entry per thing. A major version gets its own entry only when it has
  its own official end (Python 2, AngularJS).

## An entry

```json
{
  "id": "flash",
  "category": "platforms",
  "maker": "FutureWave, then Macromedia and Adobe",
  "status": "dead",
  "cause": "One line on why it ended.",
  "names": [
    { "name": "FutureSplash Animator", "from": "1996-05" },
    { "name": "Macromedia Flash", "from": "1996-12" },
    { "name": "Adobe Flash", "from": "2005-12-03" }
  ],
  "summary": "One short paragraph on what it was. Optional.",
  "website": "https://… the official site, if there is one. Optional.",
  "official": [{ "title": "Release notes", "url": "https://…" }],
  "events": [
    { "type": "born", "date": "1996-05", "precision": "month" },
    { "type": "milestone", "date": "2010-04", "precision": "month",
      "label": "No iPhone", "note": "Apple explains why the iPhone will not run Flash." },
    { "type": "deprecated", "date": "2017-07", "precision": "month",
      "label": "End set", "note": "Adobe announces that Flash will end in 2020.",
      "url": "https://blog.adobe.com/…" },
    { "type": "ended", "date": "2020-12-31", "precision": "day" },
    { "type": "afterlife", "note": "What still runs after the official end." }
  ],
  "signals": { "adoption": 5, "standard": 0, "editor": 0 },
  "links": [{ "type": "contains", "to": "actionscript" }],
  "sources": [{ "title": "…", "url": "https://…", "kind": "primary" }],
  "verified": false
}
```

- `id` never changes once published. It is the permalink (`codegrave.com/#flash`).
- `names` are in date order. The timeline shows the name a thing had at each
  point in time, so a rename adds a name and never rewrites the old one.
- Dates are `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. `precision` says how exact the
  date really is: `day`, `month`, `year` or `circa`. Never invent a day.

## Events

The terms are the same for every kind of thing, whether a language, a
machine or a network.

| Type | Meaning | On the line |
| --- | --- | --- |
| `born` | First public release. Exactly one per entry. | Open circle |
| `project_start` | Optional. When work began, if well before the release. Needs a note. | Faint dotted lead-in |
| `released` | Optional. A major version worth marking. Needs a note. | Grey tick |
| `changed_hands` | Optional. Sold, donated or moved to a new owner. Needs a note. | Grey tick |
| `milestone` | Optional. Any other turning point. Needs a note. | Grey tick |
| `deprecated` | Optional, at most one. The end is announced. Needs a date. | The line turns dotted from here |
| `ended` | Official end: end of support, shutdown, or discontinuation. At most one. | Short bar |
| `afterlife` | Optional. Life after the official end. Needs a note, and `until` if it has stopped. | Faint dotted tail |

A rename is not an event. Add the new name to `names` and the page draws a
diamond at its date.

An event may fall in the years between `project_start` and `born` (work
before the first release), but never before `project_start`.

Any event may carry three more fields:

- `label`: at most 16 characters, such as `"IE 6"` or `"End set"`. An event
  with a label is written on the line of a thing that has a card, with its
  month and year. Without a label the event is a bare tick, and its `note`
  is read in the history.
- `image`: a picture for the history, in the form described under Icons and
  images.
- `url`: an `https` link to the official announcement or record of that
  event, shown under it in the history.

A thing may also have a `website` (its official site) and up to six
`official` links (`title` and `url`), shown at the top of its history.

## The page and the data

- **Cards.** A thing in the top tenth of its peers gets a card with its icon
  and name at the head of its line. Everything else gets a thinner line and a
  name. The ranking decides, so there is no field for it.
- **History.** Clicking a line opens every event, name, image, link and
  source of that thing in the panel, in date order. `summary` is the opening
  paragraph, at most 600 characters. Each entry in the history is a button
  that scrolls the timeline to that moment on the line.

## Icons and images

Files live under `data/media/`, and the build copies them to the site.
Images may instead be hot-linked from Wikimedia Commons: then `src` is an
`https://upload.wikimedia.org/wikipedia/commons/…` address and `source` is the
file's page on Commons, which records its author and licence. A
thing may have an `icon` (shown on its card) and an `image` (shown at the top
of its history). An event may have an `image`.

```json
"icon": { "src": "icons/typescript.svg", "alt": "TypeScript logo",
          "credit": "Microsoft", "licence": "Apache-2.0", "source": "https://…" }
```

Every one needs `src`, `alt`, `credit`, `licence` and an `https` `source`,
because we only show pictures we are allowed to show. `src` is a path under
`data/media/` ending in `svg`, `png`, `jpg` or `webp`, or a Commons address
as above. An image may add a `caption` of up to 200 characters. Without an
icon the card shows the thing's initials. Icons are drawn in the text colour
as a mask, so use one-colour marks; see `data/media/icons/README.md`.

## Status

- `alive`: still supported.
- `dead`: has an `ended` event and a one-line `cause`.
- `fading`: an editor's judgement that it is in clear decline. It must carry
  a `note` that says why, and it has no `ended` event.

## Links

A link points from this entry `to` another entry's `id`. It may carry a
`note`, and a `date` when the link belongs at a moment other than the default.

| Type | Meaning | Drawn |
| --- | --- | --- |
| `version_of` | A numbered generation of the same thing. | Branch, at this thing's birth |
| `forked_from` | Copied the code and went its own way. | Branch |
| `spun_off_from` | A part that became its own thing. | Branch |
| `extends` | Adds to another thing and depends on it. TypeScript extends JavaScript. | Branch |
| `built_on` | Uses another thing as its base. | Branch |
| `succeeded_by` | Its makers or users moved on to this. | Handover, at this thing's end |
| `merged_into` | Folded into another thing. | Handover |
| `open_sourced_as` | Released as open code under a new name. | Handover |
| `contains`, `standardised_as`, `influenced_by` | Related, with no moment to draw. | Listed in the history only |

A branch or handover is drawn only when both lines are on screen and near
each other. Every link is always listed in the history.

## Ranking

There may be thousands of entries, so each one gets a significance score and
the page shows the top share of each category and decade.

| Signal | Weight | Where it comes from |
| --- | --- | --- |
| Adoption | 35% | `signals.adoption`, a band from 1 (niche) to 5 (everywhere at its peak) |
| Influence | 25% | Counted from the links other entries make to this one |
| Longevity | 15% | Years from birth to end, or to today |
| Standard | 10% | `signals.standard`, 1 if it is or became a formal standard |
| Editor | 15% | `signals.editor`, from -2 to 2, for what the numbers miss |

The score becomes a percentile among peers of the same category and decade
of birth. With fewer than five peers the comparison widens to the whole
category, then to everything. The "How much to show" control sets the cut.
What passes the cut but does not fit on the screen is left out from the
lowest rank up, and the panel says how many fit.

## Sources and verification

- Every entry needs at least one source with an `https` URL.
- Prefer a primary source (the maker's own announcement, release notes or
  end-of-life notice) and mark it `"kind": "primary"`.
- Set `"verified": true` only after each date in the entry has been checked
  against a source listed on it. Unverified entries are labelled on the page.

## Checkpoints and views

- A checkpoint is a named era with whole-year `from` and `to`, kept in
  `data/checkpoints.json`. Checkpoints must not overlap. They are drawn as
  shaded bands across the timeline, and clicking one opens its `note` with
  what was born, ended and carried on through it. A `note` is at most 400
  characters. A view can carry its own eras (see `docs/VIEWS.md`).
- Views are covered in `docs/VIEWS.md`.
