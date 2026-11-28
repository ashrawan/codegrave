// Billing: sends a signed-in reader to Stripe, to become pro or to manage the plan they have.
//
// The page asks, with the reader's session:
//
//   { checkout: true }   Answer: { url }, Stripe's own checkout page for the pro plan.
//   { portal: true }     Answer: { url }, Stripe's own page to change the card or cancel.
//
// Nothing here makes an account pro. Stripe tells the function "stripe-webhook" when a subscription
// starts, renews or ends, and only that writes the plan on the account's row.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY   required: the account's secret key (a test key until the site takes money)
//   STRIPE_PRICE        required: the id of the pro plan's monthly price (price_...)

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://codegrave.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Where Stripe sends the reader back: the site, one of its previews, or a developer's own machine.
// Never an address a request made up.
export const backTo = (origin: string | null) =>
  origin && /^https:\/\/(www\.)?codegrave\.com$|^https:\/\/[a-z0-9-]+\.netlify\.app$|^http:\/\/localhost(:\d+)?$/.test(origin) ? origin : SITE;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Not found." }, 404);
  const who = await fetch(URL_ + "/auth/v1/user", { headers: { apikey: ANON, Authorization: req.headers.get("Authorization") ?? "" } });
  if (!who.ok) return json({ error: "Sign in first." }, 401);
  const user = await who.json();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch (_e) { return json({ error: "That request could not be read." }, 400); }

  const key = Deno.env.get("STRIPE_SECRET_KEY"), price = Deno.env.get("STRIPE_PRICE");
  if (!key || !price) return json({ error: "The pro plan is not switched on yet.", code: "not_configured" }, 503);
  const stripe = (path: string, form: Record<string, string>) =>
    fetch("https://api.stripe.com/v1/" + path, { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });

  const own = await fetch(`${URL_}/rest/v1/profiles?id=eq.${user.id}&select=plan,stripe_customer`, { headers: { apikey: SERVICE, Authorization: "Bearer " + SERVICE } })
    .then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const customer: string = own[0]?.stripe_customer ?? "";
  const back = backTo(req.headers.get("Origin"));

  let r: Response;
  if (body.portal) {
    if (!customer) return json({ error: "There is no plan to manage yet." }, 400);
    r = await stripe("billing_portal/sessions", { customer, return_url: back + "/" });
  } else if (body.checkout) {
    if (own[0]?.plan === "pro") return json({ error: "This account is already pro." }, 400);
    r = await stripe("checkout/sessions", {
      mode: "subscription", "line_items[0][price]": price, "line_items[0][quantity]": "1",
      client_reference_id: user.id, "subscription_data[metadata][account]": user.id,
      ...(customer ? { customer } : user.email ? { customer_email: user.email } : {}),
      allow_promotion_codes: "true",
      success_url: back + "/?pro=welcome", cancel_url: back + "/",
    });
  } else return json({ error: "That request could not be read." }, 400);

  const got = await r.json().catch(() => ({}));
  if (!r.ok || !got.url) { console.error("billing", r.status, JSON.stringify(got).slice(0, 400)); return json({ error: "Stripe could not be reached. Try again." }, 502); }
  return json({ url: got.url });
});
