# Views

A view is a named way of looking at the timeline. There are two sorts.

- A **community view** is one subject, hand-picked: "Ancient Egypt", "The
  Space Race", "US Presidents". It has a plain name, a list of entries, and
  chapters that tell the story in order. Anyone can write one.
- A **classical view** is a shelf of the encyclopedia: Everything, one view
  per branch of the map (People, Places, … Technology, Computing) and one per
  kind (Rulers, Cities, Browsers). Nobody writes these. The build makes them
  from `data/categories.json`, so they hold every entry of their kind and
  take no side.

The panel lists community views only. Classical views are found by search,
where every result says which sort it is, and their links work like any
other.

Every view has its own link, a path like a repository on GitHub. A
community view's address is its owner and its id:
`codegrave.com/wiki/space-exploration` for the editors' views,
`codegrave.com/<github-name>/<id>` for anyone else's. A classical view's
address is `classical/` and its id: `codegrave.com/classical/rulers`.
`wiki` and `classical` are reserved, so no one can take them as a name. A
link can name several: the first is the path and the others follow in
`with`: `codegrave.com/classical/people?with=wiki/the-space-race`. `o=forward` or
`o=backward` gives the direction, `yr=` the year range and `c=` the colours. Each view on the
timeline gets a lane of its own on the road. Picking a view in the panel
shows it alone; the small plus at the end of its row, or a right click, puts
it beside the ones already there.

A view only chooses what to show. It never changes a fact. Dates, names,
causes and ranks come from the entries and are the same in every view.

## A community folder

Everything one person or group publishes lives in one folder named after
their GitHub name, in lower case:

```
data/community/<github-name>/
  profile.json        who you are
  views/<id>.json     one file per view
  entries/<id>.json   your own entries, only for what the base lacks
```

```json
{ "title": "Ada's shelf", "about": "Timelines of mathematics and the people behind it.", "url": "https://example.org" }
```

`title` is required (at most 60 characters); `about` (at most 300) and `url`
are optional. You only ever edit your own folder, so two people never touch
the same file. The folder `wiki` belongs to the editors.

Start a view by hand or with
`node scripts/new.mjs view <github-name> <id> "<Title>"`, which also makes
the profile if you have none.

## A view file

```json
{
  "id": "the-space-race",
  "name": "The Space Race",
  "description": "The contest between the United States and the Soviet Union to reach orbit and the Moon.",
  "category": "technology",
  "labels": ["space-race", "exploration"],
  "tags": ["apollo", "nasa", "sputnik", "moon landing"],
  "entries": ["sputnik-1", "yuri-gagarin", "nasa", "saturn-v", "apollo-11", "neil-armstrong"],
  "checkpoints": [
    { "id": "the-first-people-in-space", "name": "The first people in space", "from": 1957, "to": 1961,
      "note": "Sputnik 1 starts the race and Yuri Gagarin becomes the first person in orbit." },
    { "id": "the-moon-landing", "name": "The Moon landing", "from": 1962, "to": 1972,
      "note": "NASA builds the Saturn V, and Apollo 11 puts Neil Armstrong on the Moon." }
  ],
  "year": 1965
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Lower-case letters, digits and hyphens. The file name. Never changes once merged, because links use it. |
| `name` | yes | The subject, in the plainest words people would search for, at most 60 characters. |
| `description` | yes | One or two sentences, at most 200 characters. The list shows it as a tooltip and the search reads it. |
| `category` | no | The one branch of the map the view mostly belongs to. It files the view; it does not limit what the view may hold. |
| `labels` | no | Up to 4 labels from `data/labels.json`, for what the view is about. |
| `tags` | no | Up to 8 words people might search for. |
| `entries` | yes, for a hand-picked view | The entries the view shows, by id: any base entry, or an entry of your own. The older name `things` still works. |
| `checkpoints` | no | The chapters: named eras with `id`, `name`, whole-year `from` and `to` (negative before the common era, never 0) and a `note` of at most 400 characters. They must not overlap. They are drawn as lines across the view's lane, named in its colour, and clicking one opens its note with what began and ended in those years. |
| `year` | no | Not read for a hand-picked view, which opens at its beginning. Older files may carry it. |
| `order` | no | `"old"` (the default: the road starts at the oldest and runs towards the present) or `"new"` (it starts at the present and runs back). |
| `image` | no | The thumbnail: a picture with `src`, `alt`, `credit`, `licence` and `source`, as for an entry's image. Leave it out and the build draws a miniature of the view's own lines. |
| `audio` | no | The view's own music for play: `src` (a sound file under `data/media/`, or an `https` link ending in mp3, ogg, oga, m4a, mp4, webm or wav), `credit`, `licence` and `source`, and an optional `title`. It plays, looped, while play travels. Leave it out and play uses the site's track. With several views on the road, the first one that brings a track is heard. |
| `categories`, `domains`, `level` | no | Instead of `entries`: draw the view from whole kinds or branches of the base, showing the top `level` percent (5 to 100). Such a view grows by itself as entries are added. |

A view holds any number of entries, and its file on the site carries up to
1,000 of them, best ranked first. A view is one whole subject ("Wars",
"Music", "Science"), so it may hold a few hundred: the road stretches busy
years and the cards open by distance, so a big view still reads well. Group
related subjects into one view rather than making many small ones.

An entry may be in any number of views. One that is in two views on the
timeline is drawn in both lanes, so every view always shows all of its
own.

## Your own entries

If your view needs something the base does not have, the best fix is to add
it to the base in the same pull request (`docs/DATA_RULES.md`). When that is
not possible, put it in your folder's `entries/`. It follows the same rules,
names its kind in `category`, and is listed in your views by its short id.
The page marks it as a community entry. It may link to base entries; base
entries never link to it; other people's views cannot list it. If the base
already has the same thing (same name and kind, or the same Wikidata item),
the build refuses it: use the base entry.

## How views are ranked and found

- The panel lists community views under the editors' topics (`topics` in
  `data/editors-choice.json`), in the order given there. A view that is in no
  topic comes after them, by name, under "More". Each row shows the view's
  name, the years it covers and how many entries it holds.
- Search finds every view, of both sorts, and every entry. See
  `docs/BUILD.md` for how the search index is ordered.
- What the community lists most becomes easier to find, but it never changes
  an entry's rank on the timeline.

## Old addresses

A view that moves keeps its old address in `data/redirects.json`:

```json
{ "views": { "browser-wars": "wiki/browser-wars" }, "entries": {} }
```

The old link keeps working at the same speed.

## Editor's choice

`data/editors-choice.json` decides what a new visitor sees and how the
panel is ordered:

```json
{
  "default": ["wiki/space-exploration", "wiki/computer-generations"],
  "phone": ["wiki/computer-generations"],
  "topics": [
    { "id": "history", "name": "History", "views": ["wiki/the-ancient-world", "wiki/wars"] },
    { "id": "science", "name": "Science", "views": ["wiki/evolution-of-life", "wiki/space-exploration"] }
  ]
}
```

`default` is what a new visitor sees: one view id, or a list of up to eight
shown side by side. `phone`, if given, names the ones of those a phone
opens on (a narrow screen has room for fewer lanes). `topics` are the chips above the list, in order; each
names its views in the order they are listed, and a view sits in one topic
at most. Keep the topics few and broad. Only editors change this file.

## Add a view

The steps, from fork to pull request, are in "Propose a view" in
`README.md`; "Propose a view" on the page opens a form for those who would
rather describe the view than write it. Include a screenshot of the view in
the pull request.

## What makes a good view

- It is a subject many people look for, and its name is that subject in the
  plainest words: "World War II", "Dinosaurs", "Video Games". Not a book
  title, and no subtitle. Chapter names are plain too: "The first raids",
  not a phrase that needs explaining.
- A set that people expect to be complete is complete: every US president,
  every British monarch.
- It crosses kinds where the story does: the people, the places, the events
  and the things of one subject, side by side.
- Its chapters tell that story in order and name the entries they cover.
- It does not repeat an existing view under a new name.
- Every fact in a chapter note is one the entries themselves support. Notes
  are written in your own words.

## A default voiceover

A view may come with the words of a voiceover, so that play is told aloud for everyone without a request.
They live beside the view, in `data/community/<owner>/voices/<view-id>.json`:

```json
{ "style": "curious, precise science narrator",
  "lines": [ { "id": "intro", "text": "…" }, { "id": "<entry-id>", "text": "…" }, { "id": "outro", "text": "…" } ] }
```

One line for an entry (at most 400 characters), plus an opening (`intro`) and a closing (`outro`). The words
follow the same rule as a summary: your own, and nothing the entries do not say. The build puts them into the
view's own file; the reader's browser makes the sound. A reader who writes their own voiceover for the view
hears theirs instead. `node scripts/voices.mjs` writes these files with a model (it needs
`OPENROUTER_API_KEY`); read what it wrote before you commit it.

Its sound is made once, for everyone, by `tools/voice/make.mjs` (Kokoro, the voice the page uses, run on a
computer; `cd tools/voice && npm install --onnxruntime-node-install-cuda=skip` first, and ffmpeg). It writes one
MP3 for the view and voice and adds `audio` to the voices file: the voice, a version (a hash of the voice and the
words) and where each line starts and ends. `tools/voice/publish.mjs` sends the MP3 to the public store, with the
words, through the function `voice-store` (an editor's key is needed). The page fetches the one file when play
starts and plays each card's part of it; if the file cannot be had, the lines are made as for any voiceover. New
words are a new version: run both again, and the old file is removed.
