import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { HttpError, requireOrgAdmin } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type PlanCode = "pro" | "enterprise";

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

    if (!orgId) {
      return json(400, { ok: false, error: "missing_org_id" });
    }

    if (!plan) {
      return json(400, { ok: false, error: "invalid_plan", allowed: ["pro", "enterprise"] });
    }

    const { user, role } = await requireOrgAdmin(req, orgId);

    const productId = productIdForPlan(plan);
    const dodoApiKey = getEnv("DODO_API_KEY_TEST");
    const dodoBaseUrl = getDodoBaseUrl();
    const appBaseUrl = getAppBaseUrl();

    const returnUrl = Deno.env.get("DODO_RETURN_URL_TEST") ?? `${appBaseUrl}/billing/return?lang=es`;
    const cancelUrl = Deno.env.get("DODO_CANCEL_URL_TEST") ?? `${appBaseUrl}/billing/cancel?lang=es`;

    const dodoPayload = {
      product_cart: [
        {
          product_id: productId,
          quantity: 1,
        },
      ],
      return_url: returnUrl,
      cancel_url: cancelUrl,
      metadata: {
        org_id: orgId,
        plan_code: plan,
        source: "geofield-preview",
        environment: "preview",
        requested_by: user.id,
      },
    };

    console.log("[dodo-create-checkout] creating checkout", {
      org_id: orgId,
      plan,
      role,
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
