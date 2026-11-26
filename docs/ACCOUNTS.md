# Accounts and your own timelines

Phase 1 of the move to a server and a database: a reader can sign in, keep
timelines of their own, and publish them under a username. The official
data (the base, `wiki` and classical views) is still built from this
repository into static files, exactly as before.

## What a reader can do

- **Sign in** with Google, GitHub or a link sent by email. Nothing asks for
  it until they press "New timeline" or "Sign in".
- **New timeline**: a private copy of the view on the road, under a name of
  their own. Creating one from a sentence with AI is the next phase.
- **Change it**: rename or delete it (the three dots on its row), add an
  entry ("Add to a timeline" in any entry's pane) or remove one ("Remove
  from this timeline", with Undo).
- **Publish**: "Everyone" gives it the address `/<username>/<slug>`;
  "Only people with the link" gives `/t/<id>`; "Only me" takes it down.
  The username is picked once, on the first publish.

## Where it lives

A free Supabase project holds two tables (`supabase/migrations/`):

- `profiles`: one row per account, with its `username` (one for now).
- `timelines`: one row per timeline. `data` is a whole view file,
  `{ view, entries }`, the same shape the build writes to
  `site/data/v/`, so the page draws it with the code it already has and
  opening a timeline is one request. A row may be at most about 3 MB and
  an account keeps at most 50.

Row level security decides everything: anyone may read public timelines
and usernames; only the owner reads, changes or deletes the rest.
"Link" timelines are read through the function `open_timeline()`, so they
can be opened by id but never listed. The key in `site/account.js` is the
publishable one and is meant to be public.

## Setting up sign-in (once, in the Supabase dashboard)

1. **Authentication → URL Configuration**: set the Site URL to
   `https://codegrave.com` and add `https://codegrave.com/**`, the Netlify
   preview pattern (`https://*--<site>.netlify.app/**`) and
   `http://localhost:8080/**` to the redirect URLs.
2. **Authentication → Providers**: turn on Google and GitHub with an OAuth
   client from each (their callback is
   `https://<project>.supabase.co/auth/v1/callback`).
3. **Email**: the built-in sender only reaches the project's own team and
   a few messages an hour. For links to anyone, add an SMTP sender
   (Resend's free plan is enough to start).

## Limits known today

- "Export as PDF" is hidden for stored timelines: the print page reads
  built view files only.
- A stored timeline does not appear in the search or the views pane yet,
  and has no link preview of its own.
- A copied timeline keeps its entries as they were when copied; later
  corrections to the base do not reach it.
