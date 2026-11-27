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
- **Ask AI** for a change to a timeline made with AI, in the box at the
  foot of the road: "add the women of jazz", "start in 1900". The toast offers Undo.
- **Change it**: rename or delete it (the three dots on its row), add an
  entry ("Add to a timeline" in any entry's pane) or remove one ("Remove
  from this timeline", with Undo).
- **Publish**: "Everyone" gives it the address `/<username>/<slug>`;
  "Only people with the link" gives `/t/<id>`; "Only me" takes it down.
  The username is picked once, on the first publish.

## Where it lives

A free Supabase project holds two tables (`supabase/migrations/`):

- `profiles`: one row per account, with its `username` (one for now) and
  `ai_daily`, how many AI requests it may make in a day.
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

Everything happens on the server, in the Edge Function `ai-timeline`
(`supabase/functions/ai-timeline/`), and the timeline is kept in the
database from the first moment, so it is there on every device and is
finished even when the tab is closed.

1. The page stores an empty row for the timeline (`data.making`), goes to
   the road at once and sends `{ prompt, model, effort, timeline, seed }`
   with the reader's session. The answer is always a stream; a model the
   function does not offer is refused (there is no support for older pages).
2. The function checks who is asking and counts the day's requests in
   `ai_requests` against the allowance on the account's own row, `profiles.ai_daily` (20 a day unless changed; see "The day's allowance" below).
3. It reads up on the subject in Wikipedia (the best article whole, the
   openings of three more), so recent facts come from today's Wikipedia
   and not only from the model's memory.
4. It asks the model through OpenRouter for a **spec** and streams the
   answer to the page as it is written (`data: {"d": "..."}` lines; also
   `{"note"}`, `{"r": 1}` while the model thinks, then `{"done"}` or
   `{"error"}`). The page draws every entry whose JSON is closed
   (`partialSpec()`), so the timeline grows on the road.
5. It finds a free picture for each entry from its Wikipedia article, else
   the picture Wikidata keeps for the subject (`findPictures()` in
   `site/ai.js`; never a picture named by the model).
6. It writes the view file (`specToView()`) into the row, only if the row
   is the reader's own, and sends the spec back.

If Wikimedia turned the server away, the page looks for the missing
pictures once more from the reader's browser. The spec is stored beside the
view file (`data.spec`), which is what "Ask AI" (the box at the foot of a
timeline made this way) sends back to the model with the request.

`site/ai.js` is used by both sides: in the repository
`supabase/functions/ai-timeline/ai.js` is a link to it, and it is deployed
as a file beside `index.ts`. Deploy the function again whenever it changes.

A request can be anything that happens in time: a history, a company, a
life, a subject to learn, a news story so far, or a plan dated ahead of
today (a trip day by day, a course week by week). The function tells the
model today's date for that.

The models are open ones, the cheapest and most used on OpenRouter's
ranking (asked for, Nov 2026). Measured on a request with Wikipedia
reading and effort Quick:

| Name in the page | OpenRouter model | Shown | Time | Price per million tokens, in / out |
| --- | --- | --- | --- | --- |
| DeepSeek V4.1 Flash | `deepseek/deepseek-v4.1-flash` | at once (the default) | 11 s | $0.14 / $0.42 |
| MiniMax M3.1 Flash | `minimax/minimax-m3.1-flash` | at once | 16 s | $0.15 / $0.60 |
| GLM 5.3 Flash | `z-ai/glm-5.3-flash` | at once | 27 s | $0.15 / $0.50 |
| Qwen3.8 Flash | `qwen/qwen3.8-flash` | under "More models" | 42 s | $0.15 / $0.47 |
| Hy4 Flash | `tencent/hy4-flash` | under "More models" | 39 s | $0.035 / $0.14 |

Effort (Quick, Balanced, Thorough) is OpenRouter's reasoning: Quick
switches thinking off (`reasoning.enabled: false`) and is the default,
because thinking made a timeline take a minute or more; Balanced and
Thorough are `effort` low and high. GLM and MiniMax cannot switch thinking
off, so for them Quick is sent again as low.

None of these models searches the web by itself. The Wikipedia reading
covers most requests for free. OpenRouter's web search tool can be turned
on with the secret `AI_WEB=1`; it is paid per search (about half a cent a
request plus the results) and was not tested with the stream.

### The day's allowance

How many AI requests an account may make in a day is one number on its own
row: `profiles.ai_daily`, 20 for every new account. The function reads it
by the row's key, at the same time as it counts the account's requests of
the last 24 hours in `ai_requests` (by the index on owner and time), and
refuses the request once the count reaches the number. The account menu
shows the same two numbers ("12 of 20 requests left today"). To give one
account more, change `ai_daily` on its row in Supabase's table editor; it
holds from the next request. Nobody can change their own: an account may
write only its `username`. A paid plan will set the same number.

Secrets of the function (Supabase → Edge Functions → Secrets):
`OPENROUTER_API_KEY` (required; without it the page says Create with AI is
not switched on yet), `AI_MODELS` (optional: more OpenRouter ids to allow,
separated by commas; `*` allows any id, for the day the page lists
everything OpenRouter has), and `AI_WEB` (optional). Spending is capped
twice: by the credit limit set on the OpenRouter key itself, and by
the day's allowance of each account. A cap per person inside OpenRouter
would need one key per account (OpenRouter's key-provisioning API); that
is not built. Entries made this way are not reviewed: they are marked
unverified and carry a link to their Wikipedia article as the source.

## Voiceover

A timeline of your own can be told aloud while it plays. "Generate voiceover", in the three dots at the top
right, opens a list of voices, each with Listen, and then:

1. The function `voiceover` has a model write the script: an opening that fits the title, one line for each
   entry in the order play meets them, and a closing, in a tone that suits the subject. This counts as one of
   the day's requests.
2. The words and the chosen voice are written on the timeline's row under `voice`. Nothing else is kept on
   the server: there are no sound files.
3. When anyone plays the timeline, their own browser speaks the lines. The voices, Heart (the default) and
   Michael, are Kokoro's, a small free voice model that runs on the device: about 92 MB downloaded once, then
   kept by the browser, with its progress shown while it comes; each voice adds about half a MB. Each line made
   is kept in that browser, so playing again is instant. A third choice, This device, is the browser's own voice: nothing
   to download and instant, if plainer. It costs nothing however many hours people listen.
   Where the model cannot run, the device's own voice is used. A minute of speech takes from about a minute (a
   good laptop) to two (a small one) to make; play only waits for the line in front. When the device turns out
   slower than real time, the dialog warns and the foot says that play waits at each card.
   On a device with a graphics card the browser can use (WebGPU), "Faster voice" can be turned on in the voice
   dialog or the settings: the model then runs on the graphics card, a one-time 326 MB download instead of
   92 MB. It is off by default, and if the card cannot run it the voice goes back to the processor.

Changing the voice later is free ("Use this voice"); "Write again" writes a new script after the timeline
changes; "Remove the voiceover" takes the words away. An entry without a line is simply shown without one.

While play travels, the line of the entry in front is said, the music plays softly under it, and play stops on
each card until its line is said, then goes on to the next. A line that is not ready yet holds play at its card
with "Preparing the voice" at the foot. "Voiceover" and "Subtitles" in the settings menu turn the voice off and
write each line at the foot while it is said. Kokoro speaks English only.

The function needs the secret `OPENROUTER_API_KEY`; `VOICE_SCRIPT_MODEL` names another model for the script.

## Who is signed in, and where they publish

The bar on the left and the account menu show the person who signed in:
their name from Google or GitHub, else their email. A username is kept
apart from that: it is only the space a person publishes under
(`codegrave.com/<username>/<slug>`), picked on first publishing, and the
menu shows it as "Publishes as" (asked for, Nov 2026).

## Finding people's timelines

The search in Explore has a filter (the sliders at its right end) with one
switch, People's timelines, off by default. When it is on, the search also
asks the database for public timelines whose name or description matches,
or whose owner's username does (two requests per search, kept for the
session; `searchPeople()` in `site/account.js`). Lately published ones are
listed under All without it.

## Ranked lists

Not everything is a story in time. A request for a ranking ("the 100 most
popular foods") gets `"axis": "rank"` from the model and a `rank` on each
entry instead of dates; the road then stands them in rank order, #1 first,
and writes "#n" wherever it would write a year. Chapters run from rank to
rank. In the editor the Starts column becomes Rank: typing a rank moves the
entry there. A timeline holds at most 100 entries.

A measured list ("the tallest buildings", "the largest countries by area")
gets `"axis": "scale"`, a `unit` on the spec and a `value` on each entry.
The road stands them from smallest to largest and writes values ("828 m",
"$1.2 trillion") instead of years; a spread of a hundredfold or more is
drawn on a log scale. Entries without a value are dropped. If the model
forgets the axis, the page works it out from what the entries carry
(`axisOfSpec()`). Rank and scale entries have no events, and a view on one
axis is never put beside a view on another: it is shown alone.

## Open in editor

A timeline made with AI can also be changed by hand. "Open in editor",
in the three dots at the top right, swaps the road for one page (asked for, Nov 2026: one page,
no tabs): the title and description typed in place, then every entry as a
row under its chapter (picture, name, kind, starts, ends, weight). A click
opens a row in place for its summary and Wikipedia article; Enter or a
click elsewhere keeps it. A chapter is a heading that can be renamed, given
other dates or deleted (its entries stay). The road stays live on the right
and travels to the row being edited; a card clicked there opens its row.
On a phone the list fills the screen and an entry opens as a sheet with the
road above it.

The editor changes the spec, the same file Ask AI rewrites, and turns it
into the view file with `specToView()` after every change
(`site/editor.js`), so the road, Ask AI and the export read one thing.
Dates are typed as people write them ("20 Jul 1969", "44 BCE",
"3 Apr 2027, 09:30"; `readDate()` and `showDate()` in `site/ai.js`). An
edit that `cleanSpec()` would quietly drop (a date it cannot read, two
entries of one name, chapters that overlap) is refused with the reason
(`specProblem()`). Every change is kept by itself 0.7 s after the last one,
and Undo and Redo (also Ctrl+Z and Ctrl+Shift+Z outside a field) step
through the session's changes. A timeline without a spec (a copy of a view)
is not offered the editor.

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
