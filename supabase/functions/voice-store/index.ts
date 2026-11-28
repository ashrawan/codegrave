// Puts the sound of a built view's default voiceover in the public store (Cloudflare R2), with its words in
// the database (docs/VIEWS.md, "A default voiceover"). Only for the editors: the request carries a key whose
// hash is on the list of keys kept for this, and which has not run out. tools/voice/publish.mjs calls it.
//
//   POST ?owner=wiki&view=japan&voice=af_heart&v=<version>
//       body: the length of the words in bytes (4 bytes, big end first), the voices file as JSON
//       ({ style, audio, lines }), then the MP3
//       The file goes to views/<owner>/<view>/<voice>/<v>.mp3, immutable; the older versions of that view and
//       voice are deleted, and the row of the view gets the words and the new audio. Answer: { url }.
//
// Secrets: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, VOICE_PUBLIC_URL (as `voiceover`).

import { AwsClient } from "npm:aws4fetch@1.0.20";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const R2 = { at: Deno.env.get("R2_ENDPOINT"), bucket: Deno.env.get("R2_BUCKET"), id: Deno.env.get("R2_ACCESS_KEY_ID"), secret: Deno.env.get("R2_SECRET_ACCESS_KEY"), open: Deno.env.get("VOICE_PUBLIC_URL") };
const r2 = R2.at && R2.bucket && R2.id && R2.secret ? new AwsClient({ accessKeyId: R2.id, secretAccessKey: R2.secret, service: "s3", region: "auto" }) : null;
const base = () => `${R2.at!.replace(/\/+$/, "")}/${R2.bucket}`;
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/, VOICES = ["af_heart", "am_michael", "af_bella", "af_nicole", "bf_emma", "bm_george"];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const service = (path: string, init: RequestInit = {}) =>
  fetch(URL_ + path, { ...init, headers: { apikey: SERVICE, Authorization: "Bearer " + SERVICE, "Content-Type": "application/json", ...(init.headers ?? {}) } });
const hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Send a POST." }, 405);
  if (!r2) return json({ error: "The store is not set up." }, 503);
  const key = req.headers.get("x-admin-key") ?? "";
  if (key.length < 32) return json({ error: "Not allowed." }, 401);
  const ok = await service(`/rest/v1/admin_keys?hash=eq.${await hex(key)}&expires_at=gt.${new Date().toISOString()}&select=hash`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  if (!ok.length) return json({ error: "Not allowed." }, 401);

  const q = new URL(req.url).searchParams;
  const owner = q.get("owner") ?? "", view = q.get("view") ?? "", voice = q.get("voice") ?? "", v = q.get("v") ?? "";
  if (!ID.test(owner) || !ID.test(view) || !VOICES.includes(voice) || !/^[0-9a-f]{8,32}$/.test(v)) return json({ error: "That request could not be read." }, 400);
  const all = new Uint8Array(await req.arrayBuffer());
  const n = all.length > 4 ? new DataView(all.buffer).getUint32(0) : 0;
  let meta: any;
  try { meta = JSON.parse(new TextDecoder().decode(all.subarray(4, 4 + n))); } catch (_e) { return json({ error: "The words could not be read." }, 400); }
  if (!Array.isArray(meta?.lines) || meta.audio?.v !== v || meta.audio?.voice !== voice || meta.audio?.cues?.length !== meta.lines.length) return json({ error: "The words and the sound do not match." }, 400);

  const body = all.slice(4 + n);
  if (body.byteLength < 1000 || body.byteLength > 60e6) return json({ error: "That is not a voiceover." }, 400);
  const dir = `views/${owner}/${view}/${voice}/`, at = `${dir}${v}.mp3`;
  const put = await r2.fetch(`${base()}/${at}`, { method: "PUT", body, headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=31536000, immutable" } });
  if (!put.ok) return json({ error: "The store said " + put.status }, 502);
  // The versions before this one: no page points at them any more.
  const list = await r2.fetch(`${base()}?list-type=2&prefix=${encodeURIComponent(dir)}`);
  const old = list.ok ? [...(await list.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]).filter((k) => k !== at) : [];
  await Promise.all(old.map((k) => r2.fetch(`${base()}/${k}`, { method: "DELETE" }).catch(() => null)));

  const script = { style: String(meta.style ?? ""), lines: meta.lines.map((l: any) => ({ id: String(l.id), text: String(l.text) })) };
  const audio = { voice, v, secs: Number(meta.audio.secs), cues: meta.audio.cues, path: at };
  const row = await service("/rest/v1/view_voices?on_conflict=owner,view", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ owner, view, script, audio, updated_at: new Date().toISOString() }) });
  if (!row.ok) return json({ error: "The database said " + row.status, detail: (await row.text()).slice(0, 300) }, 502);
  return json({ url: R2.open ? `${R2.open.replace(/\/+$/, "")}/${at}` : at, removed: old.length });
});
