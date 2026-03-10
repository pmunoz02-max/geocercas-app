const SB_URL =
  Deno.env.get("SB_URL") ??
  Deno.env.get("SUPABASE_URL") ??
  "";

const SB_ANON =
  Deno.env.get("SB_ANON") ??
  "";

const SB_ANON_KEY =
  Deno.env.get("SB_ANON_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ??
  "";

const SB_SERVICE_ROLE =
  Deno.env.get("SB_SERVICE_ROLE") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const APP_URL =
  Deno.env.get("APP_URL") ??
  Deno.env.get("APP_BASE_URL") ??
  "";

const APP_ENV = (Deno.env.get("APP_ENV") ?? "production").trim().toLowerCase();

const STRIPE_PRICE_PRO = Deno.env.get("STRIPE_PRICE_PRO") ?? "";
const STRIPE_PRICE_ENTERPRISE = Deno.env.get("STRIPE_PRICE_ENTERPRISE") ?? "";
const TRIAL_DAYS = Number(Deno.env.get("TRIAL_DAYS") ?? "14");

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function resolveAllowedOrigin(req: Request): string {
  const requestOrigin = (req.headers.get("origin") ?? "").trim();

  if (!requestOrigin) return ALLOWED_ORIGINS[0] ?? "*";
  if (ALLOWED_ORIGINS.length === 0) return requestOrigin;

  return ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : ALLOWED_ORIGINS[0];
}

function corsHeaders(req: Request): Record<string, string> {
  const allowedOrigin = resolveAllowedOrigin(req);

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-requested-with",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(
  req: Request,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(req),
      ...extraHeaders,
    },
  });
}

function getBearer(req: Request): string {
  const auth =
    req.headers.get("authorization") ??
    req.headers.get("Authorization") ??
    "";

  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

async function authUser(
  jwt: string,
): Promise<
  { ok: true; user: unknown } |
  { ok: false; status: number; body: string }
> {
  const apikeyToUse = (SB_ANON || SB_ANON_KEY || "").trim();

  if (!SB_URL || !apikeyToUse) {
    return {
      ok: false,
      status: 500,
      body: "Missing SB_URL/SUPABASE_URL or SB_ANON/SB_ANON_KEY/SUPABASE_ANON_KEY",
    };
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
  const p = String(plan || "").toUpperCase().trim();
  if (p === "PRO") return STRIPE_PRICE_PRO;
  if (p === "ENTERPRISE") return STRIPE_PRICE_ENTERPRISE;
  return "";
}

async function callRpc<T = unknown>(
  rpcName: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: string }> {
  if (!SB_URL || !SB_SERVICE_ROLE) {
    return {
      ok: false,
      status: 500,
      body: "Missing SB_URL/SUPABASE_URL or SB_SERVICE_ROLE/SUPABASE_SERVICE_ROLE_KEY",
    };
  }

  const res = await fetch(`${SB_URL}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SB_SERVICE_ROLE,
      Authorization: `Bearer ${SB_SERVICE_ROLE}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, status: res.status, body: text };
  }

  try {
    return { ok: true, data: text ? JSON.parse(text) as T : ({} as T) };
  } catch {
    return { ok: false, status: 500, body: "RPC returned non-JSON" };
  }
}

async function stripeCreateCheckoutSession(args: {
  priceId: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  trialDays: number;
}): Promise<
  { ok: true; url: string; id: string } |
  { ok: false; status: number; body: string }
> {
  if (!STRIPE_SECRET_KEY) {
    return { ok: false, status: 500, body: "Missing STRIPE_SECRET_KEY" };
  }

  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("success_url", args.successUrl);
  form.set("cancel_url", args.cancelUrl);
  form.set("line_items[0][price]", args.priceId);
  form.set("line_items[0][quantity]", "1");

  if (Number.isFinite(args.trialDays) && args.trialDays > 0) {
    form.set("subscription_data[trial_period_days]", String(args.trialDays));
  }

  if (args.customerEmail) {
    form.set("customer_email", args.customerEmail);
  }

  for (const [k, v] of Object.entries(args.metadata)) {
    form.set(`metadata[${k}]`, v);
    form.set(`subscription_data[metadata][${k}]`, v);
  }

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
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req),
    });
  }

  if (req.method !== "POST") {
    return json(req, 405, { code: 405, message: "Method not allowed" });
  }

  try {
    const jwt = getBearer(req);
    if (!jwt) {
      return json(req, 401, { code: 401, message: "Missing authorization header" });
    }

    const auth = await authUser(jwt);
    if (!auth.ok) {
      return json(req, 401, {
        code: 401,
        message: "Invalid JWT",
        detail: auth.body,
      });
    }

    const user = auth.user as Record<string, unknown>;
    const userId = String(user?.id ?? "").trim();
    const email = String(user?.email ?? "").trim();

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const org_id = String(body?.org_id ?? "").trim();
    const plan = String(body?.plan ?? "PRO").trim().toUpperCase();
    const wantsTrialRaw = body?.wants_trial;
    const wantsTrial =
      typeof wantsTrialRaw === "boolean"
        ? wantsTrialRaw
        : plan !== "FREE";

    if (!org_id) {
      return json(req, 400, { code: 400, message: "Missing org_id" });
    }

    const priceId = pickPriceId(plan);
    if (!priceId) {
      return json(req, 400, {
        code: 400,
        message: "Unknown plan or missing Stripe price id for plan",
        plan,
      });
    }

    const success_url =
      String(body?.success_url ?? "").trim() ||
      (APP_URL ? `${APP_URL}/billing/success` : "https://example.com/billing/success");

    const cancel_url =
      String(body?.cancel_url ?? "").trim() ||
      (APP_URL ? `${APP_URL}/billing/cancel` : "https://example.com/billing/cancel");

    const guard = await callRpc<{
      allow_checkout?: boolean;
      allow_trial?: boolean;
      trial_days_applied?: number;
      reason?: string;
    }>(
      "saas_get_checkout_guard",
      {
        p_org_id: org_id,
        p_user_id: userId || null,
        p_email: email || null,
        p_plan: plan,
        p_requested_trial_days: wantsTrial ? TRIAL_DAYS : 0,
      },
    );

    if (!guard.ok) {
      return json(req, 500, {
        code: 500,
        message: "Could not evaluate checkout guard",
        detail: guard.body,
      });
    }

    const guardData = guard.data ?? {};
    const allowCheckout = guardData.allow_checkout !== false;
    const allowTrial = guardData.allow_trial === true;
    const trialDaysApplied = Number(guardData.trial_days_applied ?? 0);
    const guardReason = String(guardData.reason ?? "").trim();

    if (!allowCheckout) {
      return json(req, 403, {
        code: 403,
        message: "Checkout blocked by server-side guard",
        reason: guardReason || "checkout_blocked",
      });
    }

    const metadata = {
      env: APP_ENV,
      org_id,
      user_id: userId,
      user_email: email,
      plan,
      wants_trial: allowTrial ? "true" : "false",
      trial_days_applied: String(trialDaysApplied),
      checkout_guard_reason: guardReason || "ok",
    };

    const stripe = await stripeCreateCheckoutSession({
      priceId,
      customerEmail: email || undefined,
      successUrl: success_url,
      cancelUrl: cancel_url,
      metadata,
      trialDays: allowTrial ? trialDaysApplied : 0,
    });

    if (!stripe.ok) {
      return json(req, 502, {
        code: 502,
        message: "Stripe error",
        status: stripe.status,
        detail: stripe.body,
      });
    }

    return json(req, 200, {
      url: stripe.url,
      session_id: stripe.id,
      guard: {
        allow_trial: allowTrial,
        trial_days_applied: allowTrial ? trialDaysApplied : 0,
        reason: guardReason || null,
      },
    });
  } catch (e) {
    return json(req, 500, {
      code: 500,
      message: "Server error",
      detail: String((e as Error)?.message ?? e),
    });
  }
});