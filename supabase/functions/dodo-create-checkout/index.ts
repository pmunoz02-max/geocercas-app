import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { HttpError, requireOrgAdmin } from "../_shared/authz.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type PlanCode = "pro" | "enterprise";
type CheckoutIntent = "new_subscription" | "upgrade_to_enterprise";

type OrgBillingState = {
  org_id?: string | null;
  plan_code?: string | null;
  subscribed_plan_code?: string | null;
  plan_status?: string | null;
  billing_provider?: string | null;
  dodo_subscription_id?: string | null;
  dodo_product_id?: string | null;
  current_period_end?: string | null;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function getEnv(name: string, fallback?: string): string {
  const value = Deno.env.get(name) ?? fallback;
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function normalizePlan(input: unknown): PlanCode | null {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "pro") return "pro";
  if (value === "enterprise") return "enterprise";
  return null;
}

function normalizeText(input: unknown, fallback = "") {
  return String(input ?? fallback).trim().toLowerCase();
}

function normalizeLang(input: unknown) {
  const value = normalizeText(input || "es", "es");
  if (value.startsWith("en")) return "en";
  if (value.startsWith("fr")) return "fr";
  return "es";
}

function activePaidStatus(input: unknown) {
  return ["active", "trialing", "past_due", "paused"].includes(normalizeText(input));
}

function effectiveOrgPlan(billing: OrgBillingState | null): string {
  return normalizeText(
    billing?.subscribed_plan_code || billing?.plan_code || "free",
    "free",
  );
}

function productIdForPlan(plan: PlanCode): string {
  if (plan === "pro") return getEnv("DODO_PRODUCT_ID_PRO_TEST");
  return getEnv("DODO_PRODUCT_ID_ENTERPRISE_TEST");
}

function getDodoBaseUrl() {
  const raw = Deno.env.get("DODO_API_BASE_URL") ?? "https://test.dodopayments.com";
  return raw.replace(/\/+$/, "");
}

function getAppBaseUrl() {
  const raw = Deno.env.get("DODO_APP_BASE_URL") ?? "https://preview.tugeocercas.com";
  return raw.replace(/\/+$/, "");
}

function safeDodoMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Dodo checkout request failed";
  const obj = payload as Record<string, unknown>;
  const error = obj.error;
  const message = obj.message;
  if (typeof message === "string") return message.slice(0, 300);
  if (typeof error === "string") return error.slice(0, 300);
  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message.slice(0, 300);
    if (typeof nested.code === "string") return nested.code.slice(0, 300);
  }
  return "Dodo checkout request failed";
}

async function getOrgBillingState(orgId: string): Promise<OrgBillingState | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("org_billing")
    .select(`
      org_id,
      plan_code,
      subscribed_plan_code,
      plan_status,
      billing_provider,
      dodo_subscription_id,
      dodo_product_id,
      current_period_end
    `)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("[dodo-create-checkout] org_billing lookup failed", {
      org_id: orgId,
      code: error.code,
      message: error.message,
    });
    throw new Error("Could not verify current billing state");
  }

  return (data ?? null) as OrgBillingState | null;
}

function resolveCheckoutIntent(plan: PlanCode, billing: OrgBillingState | null) {
  const currentPlan = effectiveOrgPlan(billing);
  const currentStatus = normalizeText(billing?.plan_status || "free", "free");
  const hasPaidAccess = activePaidStatus(currentStatus) && ["pro", "enterprise"].includes(currentPlan);

  if (!hasPaidAccess) {
    return {
      ok: true as const,
      checkoutIntent: "new_subscription" as CheckoutIntent,
      currentPlan,
      currentStatus,
    };
  }

  if (currentPlan === "enterprise") {
    return {
      ok: false as const,
      status: 409,
      error: "enterprise_already_active",
      message: "This organization already has an active Enterprise plan.",
      currentPlan,
      currentStatus,
    };
  }

  if (currentPlan === "pro" && plan === "pro") {
    return {
      ok: false as const,
      status: 409,
      error: "pro_already_active",
      message: "This organization already has an active PRO plan.",
      currentPlan,
      currentStatus,
    };
  }

  if (currentPlan === "pro" && plan === "enterprise") {
    return {
      ok: true as const,
      checkoutIntent: "upgrade_to_enterprise" as CheckoutIntent,
      currentPlan,
      currentStatus,
    };
  }

  return {
    ok: false as const,
    status: 409,
    error: "paid_plan_already_active",
    message: "This organization already has an active paid plan.",
    currentPlan,
    currentStatus,
  };
}

function compactMetadata(input: Record<string, unknown>) {
  const output: Record<string, string> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;
    const text = String(value).trim();
    if (!text) continue;
    output[key] = text;
  }

  return output;
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json(405, { ok: false, error: "method_not_allowed" });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { ok: false, error: "invalid_json_body" });
    }

    const orgId = String(body.org_id ?? body.orgId ?? "").trim();
    const plan = normalizePlan(body.plan ?? body.plan_code ?? body.planCode);
    const lang = normalizeLang(body.lang ?? body.language);

    if (!orgId) {
      return json(400, { ok: false, error: "missing_org_id" });
    }

    if (!plan) {
      return json(400, { ok: false, error: "invalid_plan", allowed: ["pro", "enterprise"] });
    }

    const { user, role } = await requireOrgAdmin(req, orgId);
    const orgBilling = await getOrgBillingState(orgId);
    const checkoutAccess = resolveCheckoutIntent(plan, orgBilling);

    if (!checkoutAccess.ok) {
      return json(checkoutAccess.status, {
        ok: false,
        error: checkoutAccess.error,
        message: checkoutAccess.message,
        current_plan_code: checkoutAccess.currentPlan,
        current_plan_status: checkoutAccess.currentStatus,
        requested_plan_code: plan,
        allowed_next_plan_codes:
          checkoutAccess.currentPlan === "pro" ? ["enterprise"] : [],
      });
    }

    const productId = productIdForPlan(plan);
    const dodoApiKey = getEnv("DODO_API_KEY_TEST");
    const dodoBaseUrl = getDodoBaseUrl();
    const appBaseUrl = getAppBaseUrl();

    const returnUrl = Deno.env.get("DODO_RETURN_URL_TEST") ?? `${appBaseUrl}/billing/return?lang=${lang}`;
    const cancelUrl = Deno.env.get("DODO_CANCEL_URL_TEST") ?? `${appBaseUrl}/billing/cancel?lang=${lang}`;

    const metadata = compactMetadata({
      org_id: orgId,
      plan_code: plan,
      checkout_intent: checkoutAccess.checkoutIntent,
      source: "geofield-preview",
      environment: "preview",
      requested_by: user.id,
      current_plan_code: checkoutAccess.currentPlan,
      current_plan_status: checkoutAccess.currentStatus,
      existing_dodo_subscription_id: orgBilling?.dodo_subscription_id ?? null,
    });

    // Preview behavior: an active PRO org upgrading to Enterprise still opens Dodo Checkout
    // so the user can review/confirm the Enterprise purchase in the Dodo interface.
    // The webhook is responsible for activating Enterprise only after a signed Dodo event
    // confirms the Enterprise product. Metadata preserves the previous PRO subscription id
    // so a later production-safe replacement/cancellation flow can be implemented.

    const dodoPayload = {
      product_cart: [
        {
          product_id: productId,
          quantity: 1,
        },
      ],
      return_url: returnUrl,
      cancel_url: cancelUrl,
      metadata,
    };

    console.log("[dodo-create-checkout] creating checkout", {
      org_id: orgId,
      plan,
      role,
      current_plan_code: checkoutAccess.currentPlan,
      current_plan_status: checkoutAccess.currentStatus,
      checkout_intent: checkoutAccess.checkoutIntent,
      product_id: productId,
      dodo_base_url: dodoBaseUrl,
      return_url: returnUrl,
      cancel_url: cancelUrl,
    });

    const response = await fetch(`${dodoBaseUrl}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dodoApiKey}`,
      },
      body: JSON.stringify(dodoPayload),
    });

    const responseText = await response.text();
    let responseJson: any = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }

    if (!response.ok) {
      console.error("[dodo-create-checkout] Dodo request failed", {
        status: response.status,
        response_keys: responseJson && typeof responseJson === "object" ? Object.keys(responseJson) : [],
      });

      return json(response.status >= 400 && response.status < 500 ? response.status : 500, {
        ok: false,
        error: "dodo_checkout_request_failed",
        status: response.status,
        message: safeDodoMessage(responseJson ?? responseText),
      });
    }

    const checkoutUrl = responseJson?.checkout_url ?? responseJson?.data?.checkout_url ?? responseJson?.data?.checkout?.url ?? null;
    const sessionId = responseJson?.session_id ?? responseJson?.data?.session_id ?? null;

    if (!checkoutUrl) {
      console.error("[dodo-create-checkout] no checkout_url returned", {
        response_keys: responseJson && typeof responseJson === "object" ? Object.keys(responseJson) : [],
      });

      return json(500, {
        ok: false,
        error: "missing_checkout_url_from_dodo",
      });
    }

    return json(200, {
      ok: true,
      checkout_url: checkoutUrl,
      session_id: sessionId,
      provider: "dodo",
      mode: "test",
      plan,
      checkout_intent: checkoutAccess.checkoutIntent,
      current_plan_code: checkoutAccess.currentPlan,
      current_plan_status: checkoutAccess.currentStatus,
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);

    console.error("[dodo-create-checkout] unhandled error", {
      status,
      message,
    });

    return json(status, {
      ok: false,
      error: status === 500 ? "internal_error" : message,
      message: status === 500 ? "Internal error" : message,
    });
  }
});
