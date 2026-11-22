# The media wall

Either side of the road stands a wall: a fine grid of points that flows past
as the reader travels, with frames floating in front of it. The frames show
pictures and short films of the era the reader is in. When the reader
crosses into another era, the frames fade one after another to the new
era's media, and the light on the walls and along the edges of the road
eases to the new era's colours.

## The data: `data/wall.json`

One list of eras, in order:

```json
{
  "id": "1960s",
  "name": "The 1960s",
  "from": 1960,
  "to": 1970,
  "tone": { "warm": "#e0a85a", "cool": "#7fa6e8" },
  "media": [
    { "type": "image", "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/…/500px-….jpg",
      "alt": "Buzz Aldrin on the Moon, 1969", "credit": "Neil A. Armstrong",
      "licence": "Public domain", "source": "https://commons.wikimedia.org/wiki/File:…" },
    { "type": "video", "src": "https://upload.wikimedia.org/wikipedia/commons/transcoded/…/….webm.480p.vp9.webm",
      "poster": "https://upload.wikimedia.org/wikipedia/commons/thumb/…/500px--….webm.jpg",
      "alt": "Apollo 11 lifting off", "credit": "NASA", "licence": "Public domain",
      "source": "https://commons.wikimedia.org/wiki/File:…", "start": 4, "end": 18 }
  ]
}
```

- `from` and `to` are written years (negative before the common era, no
  year 0); `to` is not included. Eras must not overlap. A year that falls
  between two eras, before the first or after the last shows the nearest.
- `tone.warm` lights the left wall and `tone.cool` the right one.
- `media`: up to six a side. Items alternate left and right, left first;
  `"side": "left"` or `"right"` puts one on a wall. The first items stand
  nearest, so put the strongest first.
- Pictures are 500 px thumbnails from Wikimedia Commons (a standard size;
  others may be refused) or files under `data/media/`. Films are a `.webm`
  transcode from Commons (360p or 480p) with a `poster`. A film plays muted
  and looped, only while its era is in sight; `start` and `end` (seconds)
  pick the stretch that loops. Readers who ask for less motion, or to save
  data, see the poster instead.
- Every item needs `alt`, `credit` (the author), `licence` and `source` (the
  file's page). Use only free licences (public domain, CC0, CC BY, CC BY-SA).
  The frame's tooltip names the author and licence, and a click opens the
  source page.

`scripts/build.mjs` checks the file and puts the eras in `boot.json` as
`wall`, so the wall costs no extra request.

## The code: `site/wall.js`

One component with one way in, independent of entries and views:

```js
import { createWall } from './wall.js';
const wall = createWall(element, { eras });      // eras: the list above
// once a frame, from the road:
const busy = wall.frame({ year, travel, G, dark, dt });
wall.setEras(otherEras);                         // any list of eras, e.g. a view's own
wall.light();                                    // { warm, cool }: the light now, for the road to borrow
```

- `year`: the written year in front of the reader; picks the era.
- `travel`: how far the reader has come, in focal lengths; the points flow
  past with it.
- `G`: the stage from `stageOf()` in `road.js`. The walls are drawn in the
  road's own perspective: a frame at depth `d` stands where the road's
  `u / D` is `d`.
- `frame()` returns true while the light is still easing, so the road keeps
  drawing until it settles.

The sky and the walls of points are two canvases; the frames are a dozen
elements placed with CSS 3D transforms around the road's vanishing point.
`FRAMES` and `FRAMES_PHONE` say where they stand. `eraAt()` and `sidesOf()`
are pure and tested in `tests/wall.test.mjs`.
