// Create with AI: a sentence in, a timeline out.
//
// The page sends { prompt, model, effort?, current?, timeline?, seed? } with the reader's session. This
// function reads up on the subject in Wikipedia, asks a model through OpenRouter for
// a "spec" (site/ai.js says what that is), adds a free picture to each entry where
// there is one, and sends the spec back. The page turns it into a view file and
// stores it itself, so row level security still decides who may write what. A new timeline
// (`timeline`: the id of the empty row the page made for it) is also written into that row here,
// so it is finished and kept even when the reader closes the tab.
//
// The answer is a stream of lines ("data: {...}\n\n"), so the page can draw the
// timeline while it is written:
//   { "d": "text" }        the next piece of the model's JSON
//   { "r": 1 }             the model is thinking (nothing to draw yet)
//   { "note": "..." }      what the function is doing ("Looking for pictures…")
//   { "done": { spec, changed, model, left } }   or   { "error": "..." }
// What goes wrong before the model is asked is answered as plain JSON with a status.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   OPENROUTER_API_KEY   required
//   AI_MODELS            optional: more OpenRouter model ids to allow, separated by commas; "*" allows any
//                        (the plan: offer everything OpenRouter has, and let the key's own limit cap the spending)
//   AI_DAILY             optional: requests one account may make in a day (default 20)
//   AI_WEB               optional: "1" also lets the model search the web (OpenRouter's web search tool, paid per search)

import { findPictures, specToView } from "./ai.js";   // the page's own site/ai.js, deployed beside this file

// The models this function will run, by OpenRouter id (site/ai.js lists the same ones for the page):
// the cheapest and most used of OpenRouter's ranking, and the cheapest of OpenAI, Anthropic and Google (asked for, Nov 2026).
const OFFERED = ["deepseek/deepseek-v4.1-flash", "openai/gpt-6-luna", "anthropic/claude-haiku-5.5", "google/gemini-3.1-flash-lite", "minimax/minimax-m3.1-flash", "z-ai/glm-5.3-flash", "qwen/qwen3.8-flash", "tencent/hy4-flash"];
const EXTRA = (Deno.env.get("AI_MODELS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
// Only a model this function offers is run; any other is refused.
const allowed = (id: string) => OFFERED.includes(id) || EXTRA.includes(id) || (EXTRA.includes("*") && /^[a-z0-9-]+\/[a-z0-9.:_-]+$/i.test(id));
// How long the model may think before it writes. "none" switches thinking off: the fastest, and the default.
const EFFORTS = ["none", "low", "medium", "high"];
const DAILY = Number(Deno.env.get("AI_DAILY") ?? "20");
const WEB = Deno.env.get("AI_WEB") === "1";
const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AGENT = { "User-Agent": "codegrave.com timeline builder (https://codegrave.com)" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TYPES = "people, places, organisations, events, arts, knowledge, society, life, earth-space, technology, computing";
const system = (today: string) => `You make timelines for codegrave.com, where anything that happens in time is drawn along a road. People ask for anything: a history, the story of a company, the life of a person, a subject to learn, a news story so far, or a plan that has not happened yet (a trip, a course for learning a skill, a project). Whatever it is, lay it out in time. Today is ${today}. Answer with one JSON object and nothing else, its fields in this order:

{
  "title": "the subject in the plain words people search for, at most 6 words, no subtitle",
  "description": "one sentence, at most 220 characters, saying what the timeline covers",
  "axis": "time" (the usual), or "rank" for a ranked list,
  "chapters": [ { "name": "plain name of a period", "from": 1957, "to": 1961, "note": "one or two sentences telling this part of the story" } ],
  "entries": [ {
    "name": "the usual name of one thing: a person, place, organisation, event, work, idea, species, machine...",
    "kind": "what it is, in one to three words, e.g. Spacecraft, Composer, Battle, Novel",
    "type": "one of: ${TYPES}",
    "start": "when it began or was born",
    "end": "when it ended or died, or null if it still exists",
    "summary": "one or two sentences in your own words, at most 280 characters, facts only",
    "wikipedia": "the exact title of its English Wikipedia article, or null if unsure",
    "importance": 1 to 5 (5 = nobody could leave it out),
    "events": [ { "date": "...", "label": "a turning point in a few words", "note": "one sentence" } ]
  } ]
}

Rules:
- Time is whatever the subject needs: billions of years, centuries, years, months, weeks, days or hours. Never stretch a short subject into years; the road is drawn in the units of its own length.
- Dates are text: "1969", "1969-07" or "1969-07-20", and with a time of day "2027-04-03T09:30" (24-hour clock) for something planned by the hour. Before the common era use a minus sign and four digits: "-0044-03-15". Deep time is a negative year: "-66000000". There is no year 0. Give only the precision you are sure of; a year alone is fine. Never invent the date of something that happened: leave out an entry rather than guess.
- Chapters use whole years ("from" and "to" are numbers, negative before the common era), run in order, do not overlap, and together cover the entries. Use 3 to 7 chapters. For a plan, or anything inside a year or two, a chapter's "from" and "to" are full dates instead ("2027-04-01" to "2027-04-07": a week, a phase, a day of a working week), or there are none ("chapters": []).
- Write 20 to 40 entries unless the subject is small or the request names a number; never more than 100. Pick what a good book on the subject would cover, spread across its whole span, in date order.
- Give "wikipedia" for every entry that has an article of its own: the picture comes from it. For a product or an event without one, name the closest article that shows it.
- A plan (a trip, a course, a training schedule, a project, a working week) is dated forward: from the day or month the request names ("Monday to Friday" means the coming Monday to Friday), else starting tomorrow, and lasts exactly as long as the request says ("in 30 days" is 30 days, not a year). Each step is one entry with a full date for "start" and for "end" ("2027-04-03"; the same day twice for one day), and a time of day when the plan is by the hour ("2027-04-05T09:00" to "2027-04-05T11:00"): a day of a trip, a day of a course, a task, a meeting, a milestone. Keep the steps of one day in the order they happen. "name" says what happens ("Day 3: Kyoto temples", "Week 2: loops and functions"), "kind" is Day, Week, Lesson, Task, Milestone and the like, "summary" says what to do and why, "type" is the nearest fit (a place visited: places; a lesson: knowledge), and "wikipedia" names the article of the place or subject of that step, so it gets a picture. Write as many steps as the plan has.
- A ranked list (the most popular, the biggest, the best, "top 100 ..."): set "axis": "rank" and give every entry "rank" (1 = first) instead of "start" and "end", in rank order, as many as the request names (at most 100). Chapters then run from one rank to another ("from": 1, "to": 10, "name": "The top ten"). Rank by what the request asks for, from the best sources you know; the summary says why it stands where it does. Everything else is laid out in time.
- A subject to learn: order it the way it is best understood, which is usually the order in which it was discovered, and let each summary teach one idea.
- The news: tell the story up to today. Reading from Wikipedia, fetched now, may follow the request: trust it over your memory for recent facts and dates, use it only where it is about the subject, and never copy its sentences.
- "events" are optional, at most 3 per entry, and only for the most important entries.
- People: public figures and the public record only. Nothing hateful, sexual or defamatory. Only if the request cannot be laid out in time at all, answer {"error": "a short sentence saying why"}.
- Write in the language of the request. Everything in the JSON is plain text: no Markdown, no links.`;

const CHANGE = `The reader already has the timeline below and asks for a change. Apply the change and answer with the whole timeline again in the same JSON shape, keeping everything they did not ask to change (the same names, dates and wording). Put a field "changed" first, before "title": one short sentence saying what you changed.`;

// The JSON a model wrote, even when it wrapped it in a code fence or a sentence.
function parse(text: string): Record<string, unknown> | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch (_e) { return null; }
}

// One request to a Wikimedia API, tried again after a pause when Wikimedia asks to slow down.
const wiki = async (host: string, query: string) => {
  for (let i = 0; ; i++) {
    const r = await fetch(`https://${host}/w/api.php?format=json&${query}`, { headers: AGENT, signal: AbortSignal.timeout(8000) });
    if (r.ok) return await r.json();
    console.error("wikimedia", host, r.status);
    if (i >= 2 || (r.status !== 429 && r.status < 500)) throw new Error("wiki " + r.status);
    await new Promise((ok) => setTimeout(ok, 700 * (i + 1)));
  }
};

// What Wikipedia says about the subject today, for the model to read: the article that fits the
// request best, whole, and the openings of the next few. Two requests; nothing when it fails.
async function reading(prompt: string): Promise<string> {
  try {
    const found = await wiki("en.wikipedia.org", "action=query&list=search&srlimit=4&srprop=&srsearch=" + encodeURIComponent(prompt.slice(0, 280)));
    const titles: string[] = (found.query?.search ?? []).map((s: { title: string }) => s.title);
    if (!titles.length) return "";
    const [whole, openings] = await Promise.all([
      wiki("en.wikipedia.org", "action=query&prop=extracts&explaintext=1&exsectionformat=plain&redirects=1&titles=" + encodeURIComponent(titles[0])),
      titles.length > 1 ? wiki("en.wikipedia.org", "action=query&prop=extracts&explaintext=1&exintro=1&exlimit=3&redirects=1&titles=" + encodeURIComponent(titles.slice(1).join("|"))) : null,
    ]);
    const text = (d: any, max: number) => Object.values(d?.query?.pages ?? {}).map((p: any) => (p.extract ? `## ${p.title}\n${String(p.extract).replace(/\n{2,}/g, "\n").slice(0, max)}` : "")).filter(Boolean);
    return [...text(whole, 14000), ...text(openings, 1500)].join("\n\n");
  } catch (_e) { return ""; }
}

const service = (path: string, init: RequestInit = {}) =>
  fetch(URL_ + path, { ...init, headers: { apikey: SERVICE, Authorization: "Bearer " + SERVICE, "Content-Type": "application/json", ...(init.headers ?? {}) } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Send a POST." }, 405);

  // Who is asking: the reader's own session, checked by Supabase Auth.
  const auth = req.headers.get("Authorization") ?? "";
  const who = await fetch(URL_ + "/auth/v1/user", { headers: { apikey: ANON, Authorization: auth } });
  if (!who.ok) return json({ error: "Sign in to make a timeline." }, 401);
  const user = await who.json();

  let body: Record<string, any>;
  try { body = await req.json(); } catch (_e) { return json({ error: "That request could not be read." }, 400); }
  const prompt = String(body.prompt ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
  const model = String(body.model ?? "");
  if (!allowed(model)) return json({ error: "That model is not offered. Pick another." }, 400);
  const effort = EFFORTS.includes(body.effort) ? String(body.effort) : "none";
  if (prompt.length < 3) return json({ error: "Say what you want to make." }, 400);
  const current = body.current && typeof body.current === "object" ? body.current : null;
  const timeline = !current && /^[0-9a-f-]{36}$/.test(String(body.timeline ?? "")) ? String(body.timeline) : null;
  const seed = /^[a-z0-9]{1,12}$/.test(String(body.seed ?? "")) ? String(body.seed) : Math.random().toString(36).slice(2, 8);
  if (current && JSON.stringify(current).length > 120_000) return json({ error: "That timeline is too large to change with AI for now." }, 413);

  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) return json({ error: "Create with AI is not switched on yet.", code: "not_configured" }, 503);

  // A day's allowance per account.
  const since = new Date(Date.now() - 864e5).toISOString();
  const used = await service(`/rest/v1/ai_requests?owner=eq.${user.id}&created_at=gte.${since}&select=id`, { headers: { Prefer: "count=exact", Range: "0-0" } });
  const count = Number((used.headers.get("content-range") ?? "*/0").split("/")[1] || 0);
  if (count >= DAILY) return json({ error: `That is ${DAILY} requests today, the most for now. Try again tomorrow.`, code: "limit" }, 429);

  const log = (ok: boolean, usage: Record<string, number> = {}) =>
    service("/rest/v1/ai_requests", { method: "POST", body: JSON.stringify({ owner: user.id, model, kind: current ? "change" : "create", prompt, ok, tokens_in: usage.prompt_tokens ?? 0, tokens_out: usage.completion_tokens ?? 0 }) }).catch(() => {});

  // The work itself, telling its caller each step through send().
  const work = async (send: (o: Record<string, unknown>) => void) => {
      try {
        send({ note: "Reading up on the subject…" });
        const read = current ? "" : await reading(prompt);
        const now = new Date(), SYSTEM = system(now.toISOString().slice(0, 10) + ", a " + now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }));
        const messages = current
          ? [{ role: "system", content: SYSTEM + "\n\n" + CHANGE }, { role: "user", content: "The timeline now:\n" + JSON.stringify(current) + "\n\nThe change asked for: " + prompt }]
          : [{ role: "system", content: SYSTEM }, { role: "user", content: "Make this: " + prompt + (read ? "\n\nReading from Wikipedia, fetched today:\n\n" + read : "") }];
        const ask = (thinking: string) => fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "HTTP-Referer": "https://codegrave.com", "X-Title": "codegrave" },
          body: JSON.stringify({
            model, messages, stream: true, reasoning: thinking === "none" ? { enabled: false } : { effort: thinking }, max_tokens: 32000,
            ...(WEB ? { tools: [{ type: "openrouter:web_search", parameters: { max_results: 5, max_uses: 2 } }] } : { response_format: { type: "json_object" } }),
          }),
          signal: AbortSignal.timeout(140_000),
        });
        let r = await ask(effort);
        // Some models always think: asked not to, they refuse, so they are asked to think briefly instead.
        if (r.status === 400 && effort === "none") {
          const why = await r.text().catch(() => "");
          r = /reasoning/i.test(why) ? await ask("low") : new Response(why, { status: 400 });
        }
        if (!r.ok || !r.body) {
          const detail = await r.text().catch(() => "");
          console.error("openrouter", r.status, detail.slice(0, 400));
          await log(false);
          send({ error: "The model could not be reached. Try again, or pick another model." });
          return;
        }
        send({ note: "Writing…" });
        // OpenRouter's own stream: lines of "data: {choices:[{delta:{content, reasoning}}], usage}".
        const dec = new TextDecoder(), reader = r.body.getReader();
        let buf = "", text = "", usage: Record<string, number> = {}, thought = 0, why = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") continue;
            let ev: any; try { ev = JSON.parse(data); } catch (_e) { continue; }
            if (ev.usage) usage = ev.usage;
            if (ev.choices?.[0]?.finish_reason) why = ev.choices[0].finish_reason;
            const delta = ev.choices?.[0]?.delta;
            if (typeof delta?.content === "string" && delta.content) { text += delta.content; send({ d: delta.content }); }
            else if (delta?.reasoning && Date.now() - thought > 1000) { thought = Date.now(); send({ r: 1 }); }
          }
        }
        const spec = parse(text);
        if (!spec) { console.error("no timeline", model, why, text.length, text.slice(-200)); await log(false, usage); send({ error: "The model did not answer with a timeline. Try again, or pick another model." }); return; }
        if (typeof spec.error === "string") { await log(false, usage); send({ error: spec.error.slice(0, 200) }); return; }
        if (!Array.isArray(spec.entries) || !spec.entries.length) { await log(false, usage); send({ error: "The model wrote no entries. Try saying more about what you want." }); return; }
        send({ note: "Looking for pictures…" });
        // Pictures are found here, never taken from the model; a change keeps the ones the timeline had.
        if (!current) for (const e of spec.entries as Record<string, unknown>[]) delete e.image;
        const pics = await findPictures(spec.entries, wiki);
        console.log("pictures", pics, "of", (spec.entries as unknown[]).length);
        // The new timeline is written into the reader's row (only theirs: owner is checked), the same view file the page makes.
        let saved = false;
        if (timeline) {
          try {
            const f = specToView(spec, seed);
            if (f.entries.length) {
              const w = await service(`/rest/v1/timelines?id=eq.${timeline}&owner=eq.${user.id}`, { method: "PATCH", headers: { Prefer: "return=representation" },
                body: JSON.stringify({ title: f.spec.title.slice(0, 120), description: f.spec.description.slice(0, 600), data: { view: f.view, entries: f.entries, spec: f.spec, prompt } }) });
              saved = w.ok && (await w.json()).length === 1;
            }
          } catch (e) { console.error("save", String(e)); }
        }
        await log(true, usage);
        send({ done: { saved, spec, changed: typeof spec.changed === "string" ? spec.changed.slice(0, 200) : "", model, left: Math.max(0, DAILY - count - 1) } });
      } catch (e) {
        console.error("ai-timeline", String(e));
        await log(false);
        send({ error: "The model took too long. Try again, or ask for something smaller." });
      }
  };
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      let open = true;
      await work((o) => { if (!open) return; try { ctl.enqueue(enc.encode("data: " + JSON.stringify(o) + "\n\n")); } catch (_e) { open = false; } });
      if (open) { try { ctl.close(); } catch (_e) { /* gone */ } }
    },
  });
  return new Response(stream, { headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
});
