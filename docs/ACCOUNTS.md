# Accounts and your own timelines

Phase 1 of the move to a server and a database: a reader can sign in, keep
timelines of their own, and publish them under a username. The official
data (the base, `wiki` and classical views) is still built from this
repository into static files, exactly as before.

## What a reader can do

- **Sign in** with Google, GitHub or a link sent by email. Nothing asks for
  it until they press "New timeline" or "Sign in".
- **New timeline**: say what it is about and a model writes it (see
  "Create with AI" below), or start from a private copy of the view on the
  road.
- **Ask for a change** to a timeline made with AI, in the box under the
  road: "add the women of jazz", "start in 1900". The toast offers Undo.
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

## Create with AI

The page sends `{ prompt, model, effort, current? }` and the reader's session to
the Edge Function `ai-timeline` (`supabase/functions/ai-timeline/`). The
function checks who is asking, counts the day's requests in `ai_requests`
(20 a day per account by default), asks the model through OpenRouter for a
**spec**, adds a free picture from Wikipedia to each entry that names its
article, and sends the spec back. The page turns the spec into a view file
(`specToView()` in `site/ai.js`) and stores it itself, so row level
security still decides who writes what. The spec is stored beside the view
file (`data.spec`), which is what "Ask for a change" sends back to the
model.

A request can be anything that happens in time: a history, a company, a
life, a subject to learn, a news story so far, or a plan dated ahead of
today (a trip day by day, a course week by week). The function tells the
model today's date for that.

The model menu offers these, by their OpenRouter ids (`MODELS` in
`site/ai.js`, and the same list as `OFFERED` in the function):

| Name in the page | OpenRouter model | Shown |
| --- | --- | --- |
| DeepSeek V4.1 Flash | `deepseek/deepseek-v4.1-flash` | at once (the default) |
| Claude Haiku 5.5 | `anthropic/claude-haiku-5.5` | at once |
| GPT-6 Luna | `openai/gpt-6-luna` | at once |
| Claude Sonnet 5.5 | `anthropic/claude-sonnet-5.5` | under "More models" |
| GPT-6.1 Terra | `openai/gpt-6.1-terra` | under "More models" |
| DeepSeek V4 Pro | `deepseek/deepseek-v4-pro` | under "More models" |

Effort (Quick, Balanced, Thorough) is sent as OpenRouter's
`reasoning.effort` (low, medium, high).

Secrets of the function (Supabase → Edge Functions → Secrets):
`OPENROUTER_API_KEY` (required; without it the page says Create with AI is
not switched on yet), `AI_MODELS` (optional: more OpenRouter ids to allow,
separated by commas; `*` allows any id, for the day the page lists
everything OpenRouter has) and `AI_DAILY` (optional). Spending is capped
twice: by the credit limit set on the OpenRouter key itself, and by
`AI_DAILY` requests per account a day. A cap per person inside OpenRouter
would need one key per account (OpenRouter's key-provisioning API); that
is not built. Entries made this way are not reviewed: they are marked
unverified and carry a link to their Wikipedia article as the source.

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

- "Export as PDF" of a stored timeline works from the page (the view file
  is handed over in the tab's storage); the print page's own address does
  not open such a timeline in another tab or for another person.
- A plan is drawn by day on its cards, but the road's scale and the export
  still write only years.
- A public stored timeline is listed in Explore under "New from the
  community", but the search does not find it yet, and it has no link
  preview of its own.
- Only a timeline made with AI can be changed with AI; a copied one is
  edited by hand.
- A copied timeline keeps its entries as they were when copied; later
  corrections to the base do not reach it.
