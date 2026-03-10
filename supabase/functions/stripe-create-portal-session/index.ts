import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.10.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const SB_URL =
  Deno.env.get("SB_URL") ||
  Deno.env.get("SUPABASE_URL") ||
  "";

const SB_ANON =
  Deno.env.get("SB_ANON") ||
  Deno.env.get("SB_ANON_KEY") ||
  Deno.env.get("SUPABASE_ANON_KEY") ||
  "";

const SB_SERVICE_ROLE =
  Deno.env.get("SB_SERVICE_ROLE") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "";

const APP_URL =
  Deno.env.get("APP_URL") ||
  Deno.env.get("APP_BASE_URL") ||
  "https://preview.tugeocercas.com";

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

async function getUserFromAccessToken(accessToken: string) {
  if (!SB_URL || !SB_ANON) {
    throw new Error("Missing Supabase auth env vars.");
  }

  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: SB_ANON,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Auth validation failed: ${res.status} ${text}`);
  }

  return await res.json();
}

function normalizeReturnUrl(rawReturnUrl?: unknown) {
  const fallback = `${APP_URL.replace(/\/+$/, "")}/billing`;

  if (typeof rawReturnUrl !== "string" || !rawReturnUrl.trim()) {
    return fallback;
  }

  try {
    const candidate = new URL(rawReturnUrl);
    const appBase = new URL(APP_URL);

    if (candidate.origin !== appBase.origin) {
      return fallback;
    }

    return candidate.toString();
  } catch {
    return fallback;
  }
}

function getBearer(req: Request) {
  const authHeader =
    req.headers.get("Authorization") || req.headers.get("authorization") || "";

  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.slice("Bearer ".length).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req),
    });
  }

  if (req.method !== "POST") {
    return json(req, 405, { error: "Method not allowed." });
  }

  try {
    if (!STRIPE_SECRET_KEY) {
      return json(req, 500, { error: "Missing STRIPE_SECRET_KEY." });
    }

    if (!SB_URL || !SB_SERVICE_ROLE) {
      return json(req, 500, { error: "Missing Supabase service env vars." });
    }

    const accessToken = getBearer(req);
    if (!accessToken) {
      return json(req, 401, { error: "Missing bearer token." });
    }

    const user = await getUserFromAccessToken(accessToken);
    if (!user?.id) {
      return json(req, 401, { error: "Invalid user session." });
    }

    const body = await req.json().catch(() => ({}));
    const orgId = String(body?.org_id || "").trim();
    const returnUrl = normalizeReturnUrl(body?.return_url);

    if (!orgId) {
      return json(req, 400, { error: "Missing org_id." });
    }

    const admin = createClient(SB_URL, SB_SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const { data: billing, error: billingError } = await admin
      .from("org_billing")
      .select(`
        org_id,
        plan_code,
        plan_status,
        stripe_customer_id,
        stripe_subscription_id,
        over_limit,
        over_limit_reason
      `)
      .eq("org_id", orgId)
      .maybeSingle();

    if (billingError) {
      return json(req, 500, {
        error: "Could not load org billing.",
        details: billingError.message,
      });
    }

    if (!billing) {
      return json(req, 404, {
        error: "Billing record not found for org.",
      });
    }

    let stripeCustomerId = String(billing.stripe_customer_id || "").trim();
    const stripeSubscriptionId = String(billing.stripe_subscription_id || "").trim();

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });

    if (!stripeCustomerId && stripeSubscriptionId) {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      const customer =
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id || "";

      stripeCustomerId = String(customer || "").trim();

      if (stripeCustomerId) {
        const { error: updateError } = await admin
          .from("org_billing")
          .update({
            stripe_customer_id: stripeCustomerId,
          })
          .eq("org_id", orgId);

        if (updateError) {
          console.warn(
            "[stripe-create-portal-session] backfill stripe_customer_id failed:",
            updateError.message,
          );
        }
      }
    }

    if (!stripeCustomerId) {
      return json(req, 400, {
        error:
          "No Stripe customer is linked to this organization. Portal unavailable.",
        org_id: orgId,
        plan_code: billing.plan_code,
        plan_status: billing.plan_status,
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    return json(req, 200, {
      ok: true,
      url: session.url,
      customer_id: stripeCustomerId,
      org_id: orgId,
      plan_code: billing.plan_code,
      plan_status: billing.plan_status,
      over_limit: billing.over_limit,
      over_limit_reason: billing.over_limit_reason,
      return_url: returnUrl,
    });
  } catch (err) {
    console.error("[stripe-create-portal-session] error", err);

    return json(req, 500, {
      error: "Failed to create Stripe Customer Portal session.",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});