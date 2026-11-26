// Create with AI: a sentence in, a timeline out.
//
// The page sends { prompt, model, current? } with the reader's session. This
// function asks a model through OpenRouter for a "spec" (site/ai.js says what
// that is), adds a free picture from Wikipedia where there is one, and sends
// the spec back. The page turns it into a view file and stores it itself, so
// row level security still decides who may write what.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   OPENROUTER_API_KEY   required
//   MODEL_DEEPSEEK, MODEL_CLAUDE, MODEL_GPT   optional: another OpenRouter model id for a name
//   AI_DAILY             optional: requests one account may make in a day (default 20)

const MODELS: Record<string, string> = {
  deepseek: Deno.env.get("MODEL_DEEPSEEK") ?? "deepseek/deepseek-v4.1-flash",
  claude: Deno.env.get("MODEL_CLAUDE") ?? "anthropic/claude-haiku-5.5",
  gpt: Deno.env.get("MODEL_GPT") ?? "openai/gpt-6-luna",
};
const DAILY = Number(Deno.env.get("AI_DAILY") ?? "20");
const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TYPES = "people, places, organisations, events, arts, knowledge, society, life, earth-space, technology, computing";
const SYSTEM = `You write timelines for codegrave.com, an encyclopedia drawn in time. Given a subject, answer with one JSON object and nothing else:

{
  "title": "the subject in the plain words people search for, at most 6 words, no subtitle",
  "description": "one sentence, at most 220 characters, saying what the timeline covers",
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
- Dates are text: "1969", "1969-07" or "1969-07-20". Before the common era use a minus sign and four digits: "-0044-03-15". Deep time is a negative year: "-66000000". There is no year 0. Give only the precision you are sure of; a year alone is fine. Never invent a date: leave out an entry rather than guess.
- Chapters use whole years ("from" and "to" are numbers, negative before the common era), run in order, do not overlap, and together cover the entries. Use 3 to 7 chapters.
- Write 20 to 40 entries unless the subject is small or the request names a number; never more than 70. Pick what a good book on the subject would cover, spread across its whole span, in date order.
- "events" are optional, at most 3 per entry, and only for the most important entries.
- People: public figures and the public record only. Nothing hateful, sexual or defamatory. If the request is not something a timeline can be made of, answer {"error": "a short sentence saying why"}.
- Write in the language of the request. Everything in the JSON is plain text: no Markdown, no links.`;

const CHANGE = `The reader already has the timeline below and asks for a change. Apply the change and answer with the whole timeline again in the same JSON shape, keeping everything they did not ask to change (the same names, dates and wording). Add a field "changed": one short sentence saying what you changed.`;

// The JSON a model wrote, even when it wrapped it in a code fence or a sentence.
function parse(text: string): Record<string, unknown> | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch (_e) { return null; }
}

// A free picture for each entry that names its Wikipedia article: one request per 50 titles.
async function pictures(entries: Record<string, unknown>[]) {
  const titles = [...new Set(entries.map((e) => (typeof e.wikipedia === "string" ? e.wikipedia.trim() : "")).filter(Boolean))].slice(0, 100);
  const found = new Map<string, { src: string; source: string }>();
  for (let i = 0; i < titles.length; i += 50) {
    const u = "https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail%7Cname&pilicense=free&pithumbsize=500&pilimit=50&titles=" +
      encodeURIComponent(titles.slice(i, i + 50).join("|"));
    try {
      const r = await fetch(u, { headers: { "User-Agent": "codegrave.com timeline builder" }, signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const d = await r.json();
      const back = new Map<string, string>();      // the title Wikipedia settled on -> the title we asked for
      for (const n of d.query?.normalized ?? []) back.set(n.to, n.from);
      for (const n of d.query?.redirects ?? []) back.set(n.to, back.get(n.from) ?? n.from);
      for (const p of Object.values(d.query?.pages ?? {}) as Record<string, any>[]) {
        if (!p.thumbnail?.source) continue;
        const asked = back.get(p.title) ?? p.title;
        found.set(asked, { src: p.thumbnail.source, source: p.pageimage ? "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(p.pageimage) : "" });
      }
    } catch (_e) { /* a timeline without pictures is still a timeline */ }
  }
  for (const e of entries) {
    const hit = typeof e.wikipedia === "string" ? found.get(e.wikipedia.trim()) : null;
    if (hit) e.image = hit; else delete e.image;
  }
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
  const name = String(body.model ?? "deepseek");
  const model = MODELS[name];
  if (prompt.length < 3) return json({ error: "Say what the timeline is about." }, 400);
  if (!model) return json({ error: "That model is not offered." }, 400);
  const current = body.current && typeof body.current === "object" ? body.current : null;
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

  const messages = current
    ? [{ role: "system", content: SYSTEM + "\n\n" + CHANGE }, { role: "user", content: "The timeline now:\n" + JSON.stringify(current) + "\n\nThe change asked for: " + prompt }]
    : [{ role: "system", content: SYSTEM }, { role: "user", content: "Make a timeline of: " + prompt }];
  let out: Record<string, any>;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "HTTP-Referer": "https://codegrave.com", "X-Title": "codegrave" },
      body: JSON.stringify({ model, messages, response_format: { type: "json_object" }, max_tokens: 16000, temperature: 0.3 }),
      signal: AbortSignal.timeout(120_000),
    });
    out = await r.json();
    if (!r.ok) { await log(false); return json({ error: "The model could not be reached. Try again, or pick another model.", detail: out?.error?.message ?? "" }, 502); }
  } catch (_e) { await log(false); return json({ error: "The model took too long. Try again, or ask for something smaller." }, 504); }

  const spec = parse(String(out.choices?.[0]?.message?.content ?? ""));
  if (!spec) { await log(false, out.usage); return json({ error: "The model did not answer with a timeline. Try again, or pick another model." }, 502); }
  if (typeof spec.error === "string") { await log(false, out.usage); return json({ error: spec.error.slice(0, 200) }, 422); }
  if (!Array.isArray(spec.entries) || !spec.entries.length) { await log(false, out.usage); return json({ error: "The model wrote no entries. Try saying more about the subject." }, 502); }

  await pictures(spec.entries as Record<string, unknown>[]);
  await log(true, out.usage);
  return json({ spec, changed: typeof spec.changed === "string" ? spec.changed.slice(0, 200) : "", model: name, left: Math.max(0, DAILY - count - 1) });
});
