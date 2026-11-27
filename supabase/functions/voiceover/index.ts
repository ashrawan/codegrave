// Voiceover: a timeline told aloud.
//
// The page asks twice, with the reader's session:
//
//   { script: { title, description, entries: [{ id, name, when, summary }] } }
//       A model (through OpenRouter, like Create with AI) writes what is said: an opening that fits the
//       title, one line for each entry in the order given, and a closing. Answer:
//       { style, parts: [{ ids, texts, sig }], left }. The lines come shared out into parts, each signed, so
//       that only words this function wrote can be spoken. One script counts as one of the day's requests.
//
//   { speak: { texts, sig }, voice, style }
//       One part is spoken by Gemini's text to speech, with a pause between its lines. Answer:
//       { audio: "<base64>", mime }, 24 kHz 16-bit sound (a WAV file, or bare samples). The page cuts it into
//       one clip a line, makes MP3 of them and keeps them in the account's own folder (site/voice.js).
//       When the voice's own limits are met the answer is 429 with { code: "wait", wait: <seconds> } (ask
//       again then) or { code: "quota" } (no more today).
//
//   { sample: "<voice>" }
//       A few words in that voice, to choose by ear. It is spoken once ever and kept (voice/samples/), so
//       the page plays the kept file and asks here only when there is none. Answer: { url }.
//
// Who speaks is a provider (PROVIDERS below): Gemini today. Another is added as one more entry there with
// its own secret, and named in VOICE_PROVIDERS; a voice of another provider is written "<provider>:<voice>".
//
// Secrets (Supabase → Edge Functions → Secrets):
//   GEMINI_API_KEY       required: a Gemini API key (Google AI Studio)
//   OPENROUTER_API_KEY   required: the same one Create with AI uses, for writing the script
//   VOICE_MODEL          optional: Gemini's text-to-speech models, in the order tried, instead of the ones below
//   VOICE_PROVIDERS      optional: the providers in the order tried, by their names in PROVIDERS ("gemini")
//   VOICE_SCRIPT_MODEL   optional: the OpenRouter model that writes the script

// The cheapest of Gemini's Flash text-to-speech models first (asked for, Nov 2026); the next is tried when a
// model is not there for the key.
const TTS = (Deno.env.get("VOICE_MODEL") ?? "gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts").split(",").map((s) => s.trim()).filter(Boolean);
const WRITER = Deno.env.get("VOICE_SCRIPT_MODEL") ?? "deepseek/deepseek-v4.1-flash";
const VOICES = ["Charon", "Sulafat", "Algieba", "Kore", "Achird", "Gacrux"];
const MAX_ENTRIES = 120, LINE_CHARS = 320, PART_LINES = 10, PART_CHARS = 1300;   // as in site/voice.js
const DAILY = 20;
const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const service = (path: string, init: RequestInit = {}) =>
  fetch(URL_ + path, { ...init, headers: { apikey: SERVICE, Authorization: "Bearer " + SERVICE, "Content-Type": "application/json", ...(init.headers ?? {}) } });

const WRITE = `You write the voiceover for a timeline on codegrave.com. The viewer watches the timeline play like a short documentary: a globe turns, and one card at a time comes up for each entry, in the order given. A narrator speaks one line while each card is up. You write what the narrator says.

Answer with one JSON object and nothing else:

{
  "style": "how the narrator should sound, in three to eight words that fit this subject",
  "intro": "the opening, said before the first card",
  "lines": ["the line for entry 1", "the line for entry 2", "..."],
  "outro": "the closing, said after the last card"
}

The lines
- Exactly one line for each entry, in the same order, and no line for anything else. The number of lines must equal the number of entries.
- One or two short sentences, 12 to 30 words. It is heard, not read: plain spoken words, easy to say aloud.
- Say what happened and why it matters to this story. Use the entry's summary and date; add nothing you are not sure of, and no fact that is not in the entry or common knowledge about it.
- Tell one story: a line may pick up from the one before ("Two years later...", "Meanwhile...", "That changed in..."). Do not start every line the same way, and do not start each one with the year.
- Say a date the way people speak it ("in the spring of 1969", "by the nineties"), and only when it helps. Never read out a list, a bracket, a URL or a number with many digits; round it ("almost four hundred metres").
- No headings, no quotation marks, no emoji, no stage directions, no angle brackets.

The opening and the closing
- intro: one or two sentences, 12 to 30 words, that say what this timeline is, in a way that fits its title, and make the viewer want to watch. Never "Welcome to" and never "In this video".
- outro: one sentence, at most 20 words, that closes this story. No call to subscribe, like or follow.

The kind of timeline decides the tone, and "style" says it
- A history, a war, a disaster: calm and serious. "measured, serious documentary narrator"
- A company, a product, a technology: clear and brisk. "clear, confident, a little brisk"
- A life: warm, as of someone telling about a person. "warm, unhurried storyteller"
- A trip or a plan (the dates are ahead of today): friendly, speaking to the traveller as "you", in the future or the present. "friendly travel guide, relaxed"
- A course or a skill to learn: encouraging, speaking to the learner as "you". "encouraging teacher, steady"
- A ranked list ("top ten..."): the entries are given from first to last as they play; say the place where it helps ("At number three...") and keep it lively. "lively countdown host, not shouting"
- A list by a measure (tallest, richest): say the measure in round words. "bright, curious explainer"
- Something for children, or a light subject: simple words and a smile. "gentle, playful, simple"
- Science and nature: curious and precise. "curious, precise science narrator"

Examples of lines
- Entry "Sputnik 1", 1957: "In October 1957 a metal ball the size of a beach ball began to circle the Earth, and the space race was on."
- Entry "Apple II", 1977: "Then came the Apple the second: a computer in a friendly case that a family could actually use."
- Entry "Arrive in Kyoto", 5 Apr 2027: "On day three you take the fast train to Kyoto, in time to walk the old streets before dark."
- Entry "Burj Khalifa", 828 m: "And at the top, Dubai's Burj Khalifa, more than eight hundred metres of glass and steel."
- Entry "Week 2: Chords", a course: "In your second week you learn the first three chords, enough to play a real song."

Write in the language of the timeline's title.`;

function parse(text: string): Record<string, unknown> | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch (_e) { return null; }
}
// A line as it is spoken: one line of plain text, with nothing that the speech model would read as a tag.
const line = (s: unknown) => String(s ?? "").replace(/[<>*_#`"“”]/g, "").replace(/\s+/g, " ").trim().slice(0, LINE_CHARS);
const short = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

async function sign(owner: string, texts: string[]): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(SERVICE), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(owner + "\n" + JSON.stringify(texts)));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The sound in an answer of Gemini's, wherever it stands: the longest text under a key named "data".
function soundIn(o: unknown): { data: string; mime: string } | null {
  let best: { data: string; mime: string } | null = null;
  const walk = (v: any) => {
    if (!v || typeof v !== "object") return;
    if (typeof v.data === "string" && v.data.length > (best?.data.length ?? 200)) best = { data: v.data, mime: String(v.mime_type ?? v.mimeType ?? "") };
    for (const k of Object.keys(v)) if (typeof v[k] === "object") walk(v[k]);
  };
  walk(o);
  return best;
}

type Spoken = { data: string; mime: string } | { error: string; status: number; code?: string; wait?: number };

// One part, spoken by Gemini. Its Interactions API first; a model that is only served the older way is asked
// that way. Each model has limits of its own (on a free key: a few requests a minute and a day), so a model
// that is at its limit is passed over for the next, and only when all are does the page hear of it.
async function gemini(text: string, voice: string, style: string): Promise<Spoken> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return { error: "Voiceover is not switched on yet.", status: 503, code: "not_configured" };
  const head = { "x-goog-api-key": key, "Content-Type": "application/json" };
  let last: Spoken = { error: "The voice could not be reached. Try again.", status: 502 };
  let wait = 0, full = 0;
  for (const model of TTS) {
    const asks = [
      () => fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST", headers: head, signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({
          model,
          input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style }] }] }],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice }] },
        }),
      }),
      () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: head, signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Say this as a ${style}:\n\n${text}` }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
        }),
      }),
    ];
    for (const ask of asks) {
      let r: Response;
      try { r = await ask(); } catch (e) { console.error("tts", model, String(e)); last = { error: "The voice took too long. Try again.", status: 504 }; continue; }
      if (r.ok) {
        const got = soundIn(await r.json().catch(() => null));
        if (got) return got;
        console.error("tts", model, "no sound in the answer");
        continue;
      }
      const why = (await r.text().catch(() => "")).slice(0, 400);
      console.error("tts", model, r.status, why);
      if (r.status === 429) {
        // "…per day…" is over for today; anything else passes: how long is read from "retry in 44s".
        const m = /retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(why);
        const secs = m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Math.ceil(Number(m[3] || 0)) : 30;
        if (/per day/i.test(why) || secs > 600) full++; else wait = wait ? Math.min(wait, secs) : secs;
        break;   // the other way of asking meets the same limit: on to the next model
      }
      if (r.status === 401 || r.status === 403) return { error: "The voice is not switched on yet.", status: 503, code: "not_configured" };
    }
  }
  if (wait) return { error: "The voice is busy just now. Try again in a minute.", status: 429, code: "wait", wait: Math.min(90, wait + 2) };
  if (full) return { error: "The voice has reached its limit for today. Try again tomorrow.", status: 429, code: "quota" };
  return last;
}

// Who can speak. A provider is its voices and one function; the first that is named in VOICE_PROVIDERS and
// has the voice asked for speaks. To add one: an entry here, its secret, and its voices in site/voice.js.
const PROVIDERS: Record<string, { voices: string[]; speak: (text: string, voice: string, style: string) => Promise<Spoken>; pause: string }> = {
  gemini: { voices: VOICES, speak: gemini, pause: "\n\n<long pause>\n\n" },
};
const ORDER = (Deno.env.get("VOICE_PROVIDERS") ?? "gemini").split(",").map((s) => s.trim()).filter((n) => PROVIDERS[n]);
// "Charon" is a voice of the first provider that has it; "gemini:Charon" names the provider.
function voiceFor(raw: unknown): { name: string; voice: string } {
  const s = String(raw ?? ""), i = s.indexOf(":"), want = i > 0 ? s.slice(0, i) : "", v = i > 0 ? s.slice(i + 1) : s;
  for (const name of want && PROVIDERS[want] ? [want] : ORDER) if (PROVIDERS[name].voices.includes(v)) return { name, voice: v };
  const name = ORDER[0] ?? "gemini";
  return { name, voice: PROVIDERS[name].voices[0] };
}
const bytesOf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
// Bare samples are given the few bytes that make them a WAV file a browser plays.
function wavOf(pcm: Uint8Array, mime: string): Uint8Array {
  if (pcm.length > 12 && String.fromCharCode(...pcm.subarray(0, 4)) === "RIFF") return pcm;
  const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000), out = new Uint8Array(44 + pcm.length), dv = new DataView(out.buffer);
  const put = (at: number, t: string) => { for (let i = 0; i < t.length; i++) out[at + i] = t.charCodeAt(i); };
  put(0, "RIFF"); dv.setUint32(4, 36 + pcm.length, true); put(8, "WAVEfmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); put(36, "data"); dv.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}
const SAMPLE = "Every timeline has a story. This is how I would tell yours.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Send a POST." }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const who = await fetch(URL_ + "/auth/v1/user", { headers: { apikey: ANON, Authorization: auth } });
  if (!who.ok) return json({ error: "Sign in to make a voiceover." }, 401);
  const user = await who.json();

  let body: Record<string, any>;
  try { body = await req.json(); } catch (_e) { return json({ error: "That request could not be read." }, 400); }

  const router = Deno.env.get("OPENROUTER_API_KEY");
  if (!router || !ORDER.length) return json({ error: "Voiceover is not switched on yet.", code: "not_configured" }, 503);

  // ---- a few words in one voice, to choose by ear: spoken once ever, then kept
  if (body.sample) {
    const { name, voice } = voiceFor(body.sample);
    const path = `samples/${name}-${voice.toLowerCase()}.wav`, url = `${URL_}/storage/v1/object/public/voice/${path}`;
    if ((await fetch(url, { method: "HEAD" }).catch(() => null))?.ok) return json({ url });
    const got = await PROVIDERS[name].speak(SAMPLE, voice, "warm, clear documentary narrator");
    if ("error" in got) return json({ error: got.error, code: got.code, wait: got.wait }, got.status);
    const put = await fetch(`${URL_}/storage/v1/object/voice/${path}`, { method: "POST", headers: { apikey: SERVICE, Authorization: "Bearer " + SERVICE, "Content-Type": "audio/wav", "cache-control": "max-age=31536000", "x-upsert": "true" }, body: wavOf(bytesOf(got.data), got.mime) });
    if (!put.ok) { console.error("sample", put.status, (await put.text().catch(() => "")).slice(0, 200)); return json({ error: "The sample could not be kept. Try again." }, 502); }
    return json({ url });
  }

  // ---- one part, spoken
  if (body.speak) {
    const texts: string[] = Array.isArray(body.speak.texts) ? body.speak.texts.map((t: unknown) => String(t)) : [];
    if (!texts.length || texts.length > PART_LINES || texts.join("").length > PART_CHARS + LINE_CHARS) return json({ error: "That part cannot be spoken." }, 400);
    if (String(body.speak.sig ?? "") !== await sign(user.id, texts)) return json({ error: "That part cannot be spoken." }, 403);
    const { name, voice } = voiceFor(body.voice);
    const style = short(body.style, 80).replace(/[<>"]/g, "") || "calm, clear documentary narrator";
    // A long pause between the lines, so the page can tell where one ends and the next begins.
    const got = await PROVIDERS[name].speak(texts.join(PROVIDERS[name].pause), voice, style);
    if ("error" in got) return json({ error: got.error, code: got.code, wait: got.wait }, got.status);
    return json({ audio: got.data, mime: got.mime });
  }

  // ---- the script
  const s = body.script;
  if (!s || typeof s !== "object") return json({ error: "That request could not be read." }, 400);
  const title = short(s.title, 120), description = short(s.description, 600);
  const entries = (Array.isArray(s.entries) ? s.entries : []).slice(0, MAX_ENTRIES)
    .map((e: any) => ({ id: short(e?.id, 80), name: short(e?.name, 120), when: short(e?.when, 60), summary: short(e?.summary, 320) }))
    .filter((e: { id: string; name: string }) => e.id && e.name);
  if (!title || !entries.length) return json({ error: "There is nothing to tell yet." }, 400);

  // The day's allowance, the same one Create with AI counts against: a voiceover is one request.
  const since = new Date(Date.now() - 864e5).toISOString();
  const [used, own] = await Promise.all([
    service(`/rest/v1/ai_requests?owner=eq.${user.id}&created_at=gte.${since}&select=id`, { headers: { Prefer: "count=exact", Range: "0-0" } }),
    service(`/rest/v1/profiles?id=eq.${user.id}&select=ai_daily`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);
  const count = Number((used.headers.get("content-range") ?? "*/0").split("/")[1] || 0);
  const daily = Number.isFinite(Number(own[0]?.ai_daily)) ? Number(own[0].ai_daily) : DAILY;
  if (count >= daily) return json({ error: `That is ${daily} requests today, the most for now. Try again tomorrow.`, code: "limit" }, 429);
  const log = (ok: boolean, usage: Record<string, number> = {}) =>
    service("/rest/v1/ai_requests", { method: "POST", body: JSON.stringify({ owner: user.id, model: TTS[0], kind: "voice", prompt: ("Voiceover: " + title).slice(0, 600), ok, tokens_in: usage.prompt_tokens ?? 0, tokens_out: usage.completion_tokens ?? 0 }) }).catch(() => {});

  try {
    const ask = (thinking: boolean) => fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + router, "Content-Type": "application/json", "HTTP-Referer": "https://codegrave.com", "X-Title": "codegrave" },
      body: JSON.stringify({
        model: WRITER, max_tokens: 12000, response_format: { type: "json_object" }, reasoning: thinking ? { effort: "low" } : { enabled: false },
        messages: [
          { role: "system", content: WRITE },
          { role: "user", content: `Today is ${new Date().toISOString().slice(0, 10)}.\n\nThe timeline: ${title}\n${description ? "About it: " + description + "\n" : ""}\nIts ${entries.length} entries, in the order they play:\n` + entries.map((e: any, i: number) => `${i + 1}. ${e.name}${e.when ? " (" + e.when + ")" : ""}${e.summary ? ": " + e.summary : ""}`).join("\n") },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    let r = await ask(false);
    if (r.status === 400) r = await ask(true);
    if (!r.ok) { console.error("script", r.status, (await r.text().catch(() => "")).slice(0, 400)); await log(false); return json({ error: "The script could not be written. Try again." }, 502); }
    const answer = await r.json();
    const got = parse(String(answer.choices?.[0]?.message?.content ?? ""));
    const lines = Array.isArray(got?.lines) ? got!.lines as unknown[] : [];
    if (!got || lines.length < entries.length * 0.6) { console.error("script", "no lines", lines.length, entries.length); await log(false, answer.usage ?? {}); return json({ error: "The script could not be written. Try again." }, 502); }
    // Told in order: the opening, a line an entry (an entry the model passed over is simply named), the closing.
    const told = [
      { id: "intro", text: line(got.intro) },
      ...entries.map((e: any, i: number) => ({ id: e.id, text: line(lines[i]) || e.name + "." })),
      { id: "outro", text: line(got.outro) },
    ].filter((l) => l.text);
    const parts: { ids: string[]; texts: string[]; sig: string }[] = [];
    let cur: { id: string; text: string }[] = [], n = 0;
    const close = async () => { if (cur.length) { const texts = cur.map((l) => l.text); parts.push({ ids: cur.map((l) => l.id), texts, sig: await sign(user.id, texts) }); } cur = []; n = 0; };
    for (const l of told) {
      if (cur.length && (cur.length >= PART_LINES || n + l.text.length > PART_CHARS)) await close();
      cur.push(l); n += l.text.length;
    }
    await close();
    await log(true, answer.usage ?? {});
    return json({ style: short(got.style, 80) || "calm, clear documentary narrator", parts, left: Math.max(0, daily - count - 1) });
  } catch (e) {
    console.error("voiceover", String(e));
    await log(false);
    return json({ error: "The script took too long. Try again." }, 504);
  }
});
