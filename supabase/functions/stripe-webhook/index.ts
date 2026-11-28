// The payment webhook: Stripe calls this when a subscription starts, changes or ends, and this alone
// writes the plan on the account's row (`plan`, and with it the day's AI allowance, `ai_daily`).
//
// It trusts nothing but Stripe's signature on the exact bytes it received. Deploy it without the
// session check (verify_jwt false): Stripe has no session.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   STRIPE_WEBHOOK_SECRET   required: the signing secret of this endpoint (whsec_...)
//   STRIPE_SECRET_KEY       required: to read a subscription's state from Stripe itself
//   PRO_AI_DAILY            optional: the AI requests a day a pro account gets (200)

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FREE_DAILY = 20, PRO_DAILY = Number(Deno.env.get("PRO_AI_DAILY")) || 200;
const TOLERANCE = 300;   // seconds a signed event stays good for

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
// Stripe signs "<time>.<body>" with the endpoint's secret (HMAC SHA-256) and sends "t=<time>,v1=<hex>".
export async function signed(body: string, header: string, secret: string, now = Date.now() / 1000) {
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1] ?? "", sent = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sent.length || Math.abs(now - Number(t)) > TOLERANCE) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + body)));
  // Compared without stopping at the first difference.
  return sent.some((s) => { if (s.length !== want.length) return false; let d = 0; for (let i = 0; i < s.length; i++) d |= s.charCodeAt(i) ^ want.charCodeAt(i); return d === 0; });
}
// A subscription that is paid for, or in its trial, is pro; anything else is free.
export const planOf = (status: string) => (status === "active" || status === "trialing" ? "pro" : "free");

const rows = (query: string, fields: Record<string, unknown>) =>
  fetch(`${URL_}/rest/v1/profiles?${query}`, { method: "PATCH", headers: { apikey: SERVICE, Authorization: "Bearer " + SERVICE, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(fields) })
    .then(async (r) => (r.ok ? (await r.json()).length : (console.error("profiles", r.status, await r.text()), -1)));
// What a plan allows, written on the account's row (each can then be changed for one account by hand).
const fieldsFor = (plan: string) => plan === "pro"
  ? { plan, ai_daily: PRO_DAILY, publish_max: 1000, voice_monthly: 500000 }
  : { plan, ai_daily: FREE_DAILY, publish_max: 10, voice_monthly: 5000 };
const uuid = (s: unknown) => (typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s) ? s : "");

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Not found.", { status: 404 });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET"), key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret || !key) return new Response("Not switched on.", { status: 503 });
  const body = await req.text();
  if (!(await signed(body, req.headers.get("Stripe-Signature") ?? "", secret))) return new Response("Bad signature.", { status: 400 });
  const event = JSON.parse(body), o = event.data?.object ?? {};

  let done = 0;
  if (event.type === "checkout.session.completed" && o.mode === "subscription") {
    // The first payment: the session names the account, and from now on the account its customer.
    const account = uuid(o.client_reference_id), customer = String(o.customer ?? "");
    if (account && customer) done = await rows(`id=eq.${account}`, { ...fieldsFor("pro"), stripe_customer: customer });
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted" || event.type === "customer.subscription.created") {
    // Events can arrive out of order, so the state is read from Stripe as it is now, not from the event.
    const customer = String(o.customer ?? "");
    const now = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=20`, { headers: { Authorization: "Bearer " + key } }).then((r) => r.json()).catch(() => null);
    if (!now?.data) return new Response("Stripe could not be read.", { status: 502 });
    const plan = now.data.some((s: { status: string }) => planOf(s.status) === "pro") ? "pro" : "free";
    done = await rows(`stripe_customer=eq.${encodeURIComponent(customer)}`, fieldsFor(plan));
    // A subscription can be heard of before its checkout is: then the account is named on the subscription.
    const account = uuid(o.metadata?.account);
    if (done === 0 && account && plan === "pro") done = await rows(`id=eq.${account}`, { ...fieldsFor(plan), stripe_customer: customer });
  }
  // A failed write is answered as a failure, so Stripe sends the event again.
  return done < 0 ? new Response("Not saved.", { status: 500 }) : new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
