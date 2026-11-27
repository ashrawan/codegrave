// film-auth: the gate of film mode (site/film/, docs/FILM_MODE.md).
//
// Film mode's code is public; what it may reach is decided here. Two calls, both POST with JSON:
//
//   { key }                 the film key, checked against the FILM_KEY secret without leaking by
//                           timing how much of it was right. Answers { token, expires, scopes }:
//                           a signed token good for a quarter of an hour.
//   { token, open }         one stored timeline, private ones too, by "t/<id>" or
//                           "<username>/<slug>". Read only. Answers { view, entries, spec }.
//
// Every call is written to the film log, and the log is the rate limit: a few wrong keys a minute
// from one address, or a burst from anywhere, and the door stays shut for that minute.
// Row level security is untouched: this function reads with the service role and hands out only
// what a valid token asks for. Deployed with JWT verification off, like ai-timeline: the key is
// the check.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   FILM_KEY   required, at least 24 characters. Without it film mode is off for everyone.
//              To rotate it, set a new value: every token signed with the old one stops working.

const KEY = Deno.env.get("FILM_KEY") ?? "";
const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_SECONDS = 15 * 60;
const PER_ADDRESS = 5, PER_MINUTE = 30;      // wrong keys a minute from one address, and key checks a minute in all
const READS_PER_MINUTE = 120;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hmacKey = (secret: Uint8Array | string) => crypto.subtle.importKey("raw", typeof secret === "string" ? enc.encode(secret) : secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const mac = async (key: CryptoKey, text: string) => new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text)));

// Two strings are the same: both are first signed with a key made for this one check, so the
// compare runs over two digests of the same length and takes the same time whatever was sent.
async function same(a: string, b: string) {
  const k = await hmacKey(crypto.getRandomValues(new Uint8Array(32)));
  const [x, y] = await Promise.all([mac(k, a), mac(k, b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
// Tokens are signed with a key that follows from FILM_KEY, so a new FILM_KEY ends the old tokens.
const signer = () => hmacKey("film-token:" + KEY);
async function sign(scopes: string[]) {
  const body = b64(enc.encode(JSON.stringify({ s: scopes, e: Math.floor(Date.now() / 1000) + TOKEN_SECONDS })));
  return body + "." + b64(await mac(await signer(), body));
}
async function read(token: unknown): Promise<string[] | null> {
  if (typeof token !== "string" || token.length > 600) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || !(await same(sig, b64(await mac(await signer(), body))))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64(body)));
    return Array.isArray(p.s) && Number(p.e) > Date.now() / 1000 ? p.s : null;
  } catch { return null; }
}

const rest = (path: string, init: RequestInit = {}) => fetch(URL_ + "/rest/v1/" + path, { ...init, headers: { apikey: SERVICE, Authorization: "Bearer " + SERVICE, "Content-Type": "application/json", ...(init.headers || {}) } });
const log = (ip: string, what: string, ok: boolean, detail = "") => rest("film_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ip, what, ok, detail: detail.slice(0, 2000) }) }).catch(() => {});
// The calls of one kind in the last minute. When the log cannot be read the door stays shut.
async function lately(what: string): Promise<{ ip: string; ok: boolean }[] | null> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const r = await rest(`film_log?select=ip,ok&what=eq.${what}&at=gt.${encodeURIComponent(since)}&limit=500`).catch(() => null);
  return r && r.ok ? await r.json() : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
async function open(id: string) {
  let row = null, username = "";
  const cols = "select=id,owner,slug,title,description,data";
  if (id.startsWith("t/") && UUID.test(id.slice(2))) {
    row = (await (await rest(`timelines?id=eq.${id.slice(2)}&${cols}`)).json())[0];
    if (row) username = (await (await rest(`profiles?id=eq.${row.owner}&select=username`)).json())[0]?.username ?? "";
  } else {
    const [user, slug, more] = id.split("/");
    if (more !== undefined || !NAME.test(user ?? "") || !NAME.test(slug ?? "")) return null;
    const owner = (await (await rest(`profiles?username=eq.${user}&select=id`)).json())[0]?.id;
    if (owner) row = (await (await rest(`timelines?owner=eq.${owner}&slug=eq.${slug}&${cols}`)).json())[0];
    username = user;
  }
  if (!row) return null;
  // The same view file the page makes of a stored timeline (payloadOf in site/account.js), with its spec beside it.
  const d = row.data ?? {}, view = { ...(d.view ?? {}), id: "t/" + row.id, name: row.title, description: row.description ?? "", author: username || "you", type: "community", picked: true, count: (d.entries ?? []).length, stored: true };
  delete view.topic;
  return { view, entries: d.entries ?? [], spec: d.spec ?? null, slug: username ? `${username}/${row.slug}` : null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (KEY.length < 24) return json({ error: "off" }, 503);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }

  if (typeof body.key === "string") {
    const seen = await lately("key");
    if (!seen || seen.length >= PER_MINUTE || seen.filter((r) => r.ip === ip && !r.ok).length >= PER_ADDRESS) return json({ error: "slow down" }, 429);
    const ok = body.key.length <= 400 && await same(body.key, KEY);
    await log(ip, "key", ok);
    if (!ok) return json({ error: "no" }, 403);
    return json({ token: await sign(["read"]), expires: TOKEN_SECONDS, scopes: ["read"] });
  }

  const scopes = await read(body.token);
  if (!scopes) return json({ error: "no" }, 403);
  if (typeof body.open === "string" && scopes.includes("read")) {
    const seen = await lately("open");
    if (!seen || seen.length >= READS_PER_MINUTE) return json({ error: "slow down" }, 429);
    const got = await open(body.open.slice(0, 200)).catch(() => null);
    await log(ip, "open", !!got, body.open.slice(0, 200));
    return got ? json(got) : json({ error: "not found" }, 404);
  }
  return json({ error: "bad request" }, 400);
});
