# Contributing

Thank you for helping. codegrave is built so that many people can work at
once without getting in each other's way. This page says how.

## Issues or pull requests?

- **Open an issue** to report a bug, to point out a wrong fact when you
  cannot fix it yourself, or to suggest an idea, a featured view, a category
  or an era. For anything bigger than one file, such as a change to how the
  page works or to the data rules, open an "Idea or proposal" issue first
  and agree on the approach before writing code.
- **Open a pull request** to add or correct a thing, to add a view, or to
  fix something already agreed in an issue.

The issue and pull request forms on GitHub ask for what is needed. Please
fill them in rather than deleting them.

## Three habits

1. **One file per thing, one file per view.** Adding or fixing something
   touches one small file, so two pull requests almost never conflict.
2. **One topic per pull request.** A new thing, a correction, a new view, or
   one change to the page. Small pull requests are reviewed quickly.
3. **The check must pass.** Run `node scripts/build.mjs --check` and
   `node --test` before you push. The same check runs on every pull request,
   and Netlify builds a preview of the page for it.

## What a good pull request has

- **A clear title** that says what changes, such as "Add Elixir" or "Fix
  Flash end date".
- **What and why** in a few sentences: what changes on the timeline, and
  why it is right or worth having.
- **Sources** for every date or fact added or changed, listed on the entry
  itself (see `docs/DATA_RULES.md`) and linked in the description.
- **Screenshots** whenever what the page shows changes: a new view, a new
  or changed thing, or any change in `site/`. Take one at a wide window
  (about 1440 pixels) and one at phone width (about 390 pixels). For a fix,
  show before and after. Drag the images into the description on GitHub.
- **The link** to see it locally, such as `?views=<id>` or `#<thing-id>`.
- **The checklist** in the template, ticked honestly.

If an AI assistant wrote part of the change, that is welcome. Say so in the
description, and check its dates against the sources yourself: an assistant
can invent a date that looks right.

## What you can add

| You want to | You change | Rules |
| --- | --- | --- |
| Add or correct a thing | `data/things/<category>/<id>.json` | `docs/DATA_RULES.md` |
| Add a view | `data/views/<id>.json` (see "Propose a view" in `README.md`) | `docs/VIEWS.md` |
| Add an icon or image | `data/media/`, or a Wikimedia Commons address, named on the thing | "Icons and images" in `docs/DATA_RULES.md` |
| Change the page | `site/` | `AGENTS.md`; open an issue first |
| Suggest a featured view, category or era | Open an issue | Editors decide |

Facts need sources. A correction without a source cannot be merged. Images
need an author and a free licence; we only show pictures we are allowed to
show.

## What stays fixed

The base timeline is the same for everyone. A view chooses which things to
show; it cannot change dates, names, causes or ranks. Ids of things and
views never change once merged, because links depend on them. Only things
are listed, never people.

Generated files in `site/data/` are not committed. The build writes them.

## Review

A maintainer or an editor reviews each pull request, usually within a few
days. Files listed in `.github/CODEOWNERS` (the page, the scripts and the
editors' choices) need a maintainer's approval. Expect questions about
sources; they are how the timeline stays trustworthy.

Be kind and assume good intent. See `CODE_OF_CONDUCT.md`.

## Licence of contributions

This repository has two licences (see `LICENSE`). By opening a pull request
you agree that your contribution is licensed the same way as the part of the
repository it changes:

- code, components and build tools (`site/`, `scripts/`, `tests/`,
  `schema/` and configuration files) under the **MIT License**;
- written content, data and diagrams (`data/`, `docs/`, Markdown files and
  any diagrams) under **CC BY-NC-SA 4.0**.

Images hot-linked from Wikimedia Commons, and icons in `data/media/icons/`,
keep their own licences, recorded next to each one.
