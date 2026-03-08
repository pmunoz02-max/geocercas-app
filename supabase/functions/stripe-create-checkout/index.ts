// supabase/functions/stripe-create-checkout/index.ts
// PREVIEW ONLY — Stripe TEST

const SB_URL = Deno.env.get("SB_URL") ?? "";
const SB_ANON = Deno.env.get("SB_ANON") ?? "";
const SB_ANON_KEY = Deno.env.get("SB_ANON_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? ""; // ej: https://preview.tugeocercas.com

// Stripe Price IDs (TEST)
// Define en secrets: STRIPE_PRICE_PRO, STRIPE_PRICE_ENTERPRISE
const STRIPE_PRICE_PRO = Deno.env.get("STRIPE_PRICE_PRO") ?? "";
const STRIPE_PRICE_ENTERPRISE = Deno.env.get("STRIPE_PRICE_ENTERPRISE") ?? "";

// Trial
const TRIAL_DAYS = Number(Deno.env.get("TRIAL_DAYS") ?? "14");

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

function getBearer(req: Request): string {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

async function authUser(jwt: string): Promise<{ ok: true; user: any } | { ok: false; status: number; body: string }> {
  const apikeyToUse = (SB_ANON || SB_ANON_KEY || "").trim();
  if (!SB_URL || !apikeyToUse) {
    return { ok: false, status: 500, body: "Missing SB_URL or SB_ANON/SB_ANON_KEY" };
  }

  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: apikeyToUse,
      Authorization: `Bearer ${jwt}`,
    },
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, status: res.status, body: text };

  try {
    return { ok: true, user: JSON.parse(text) };
  } catch {
    return { ok: false, status: 500, body: "Auth returned non-JSON" };
  }
}

function pickPriceId(plan: string): string {
  const p = (plan || "").toUpperCase().trim();
  if (p === "PRO") return STRIPE_PRICE_PRO;
  if (p === "ENTERPRISE") return STRIPE_PRICE_ENTERPRISE;
  return "";
}

async function stripeCreateCheckoutSession(args: {
  priceId: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  trialDays: number;
}): Promise<{ ok: true; url: string; id: string } | { ok: false; status: number; body: string }> {
  if (!STRIPE_SECRET_KEY) return { ok: false, status: 500, body: "Missing STRIPE_SECRET_KEY" };

  // Stripe Checkout Sessions API expects form-encoded body
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("success_url", args.successUrl);
  form.set("cancel_url", args.cancelUrl);

  // Line item
  form.set("line_items[0][price]", args.priceId);
  form.set("line_items[0][quantity]", "1");

  // Trial (Stripe: subscription_data[trial_period_days])
  if (Number.isFinite(args.trialDays) && args.trialDays > 0) {
    form.set("subscription_data[trial_period_days]", String(args.trialDays));
  }

  // Customer email (opcional)
  if (args.customerEmail) form.set("customer_email", args.customerEmail);

  // Metadata (en Session y en Subscription)
  // Session metadata
  for (const [k, v] of Object.entries(args.metadata)) {
    form.set(`metadata[${k}]`, v);
  }
  // Subscription metadata
  for (const [k, v] of Object.entries(args.metadata)) {
    form.set(`subscription_data[metadata][${k}]`, v);
  }

  // Important: allow promotion codes? (opcional)
  // form.set("allow_promotion_codes", "true");

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, status: res.status, body: text };

  try {
    const data = JSON.parse(text);
    return { ok: true, url: data.url, id: data.id };
  } catch {
    return { ok: false, status: 500, body: "Stripe returned non-JSON" };
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);

  // Preflight
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (req.method !== "POST") return json(405, { code: 405, message: "Method not allowed" }, cors);

  try {
    const jwt = getBearer(req);
    if (!jwt) return json(401, { code: 401, message: "Missing authorization header" }, cors);

    const auth = await authUser(jwt);
    if (!auth.ok) {
      return json(401, { code: 401, message: "Invalid JWT", detail: auth.body }, cors);
    }

    const user = auth.user;
    const userId = String(user?.id ?? "");
    const email = String(user?.email ?? "");

    const body = await req.json().catch(() => ({} as any));

    const org_id = String(body?.org_id ?? "").trim();
    const plan = String(body?.plan ?? "PRO").trim();

    if (!org_id) return json(400, { code: 400, message: "Missing org_id" }, cors);

    const priceId = pickPriceId(plan);
    if (!priceId) {
      return json(
        400,
        { code: 400, message: "Unknown plan or missing Stripe price id for plan", plan },
        cors,
      );
    }

    // URLs: si no vienen, cae a APP_URL
    const success_url =
      String(body?.success_url ?? "").trim() ||
      (APP_URL ? `${APP_URL}/billing/success` : "https://example.com/billing/success");
    const cancel_url =
      String(body?.cancel_url ?? "").trim() ||
      (APP_URL ? `${APP_URL}/billing/cancel` : "https://example.com/billing/cancel");

    const metadata = {
      env: "preview",
      org_id,
      user_id: userId,
      plan: plan.toUpperCase(),
    };

    const stripe = await stripeCreateCheckoutSession({
      priceId,
      customerEmail: email || undefined,
      successUrl: success_url,
      cancelUrl: cancel_url,
      metadata,
      trialDays: TRIAL_DAYS,
    });

    if (!stripe.ok) {
      return json(
        502,
        { code: 502, message: "Stripe error", status: stripe.status, detail: stripe.body },
        cors,
      );
    }

    return json(200, { url: stripe.url, session_id: stripe.id }, cors);
  } catch (e) {
    return json(500, { code: 500, message: "Server error", detail: String((e as any)?.message ?? e) }, cors);
  }
});