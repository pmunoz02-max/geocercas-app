import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { HttpError, requireOrgAdmin } from "../_shared/authz.ts";


// --- Paddle environment/config logic ---
function getPaddleEnv(): "sandbox" | "live" {
  const env = Deno.env.get("PADDLE_ENV")?.trim().toLowerCase();

  if (env !== "sandbox" && env !== "live") {
    throw new Error('PADDLE_ENV must be exactly "sandbox" or "live"');
  }

  return env;
}

function getPaddleApiKey() {
  const env = getPaddleEnv();
  const key =
    env === "live"
      ? Deno.env.get("PADDLE_API_KEY_LIVE")
      : Deno.env.get("PADDLE_API_KEY_SANDBOX");

  if (!key) {
    throw new Error(`Missing Paddle API key for env: ${env}`);
  }

  return key;
}

function getPaddlePriceId(plan: unknown) {
  const env = getPaddleEnv();
  const normalizedPlan = typeof plan === "string" ? plan.trim().toLowerCase() : "";

  let priceId: string | undefined;
  if (normalizedPlan === "pro") {
    priceId =
      env === "live"
        ? Deno.env.get("PADDLE_PRO_PRICE_ID_LIVE")
        : Deno.env.get("PADDLE_PRO_PRICE_ID_SANDBOX");
  } else if (normalizedPlan === "enterprise_100") {
    priceId = env === "live" ? Deno.env.get("PADDLE_ENTERPRISE_100_PRICE_ID_LIVE") : Deno.env.get("PADDLE_ENTERPRISE_100_PRICE_ID_SANDBOX");
  } else if (normalizedPlan === "enterprise") {
    priceId =
      env === "live"
        ? Deno.env.get("PADDLE_ENTERPRISE_PRICE_ID_LIVE")
        : Deno.env.get("PADDLE_ENTERPRISE_PRICE_ID_SANDBOX");
  } else {
    throw new Error(`Unsupported plan: ${String(plan)}`);
  }

  if (!priceId) {
    throw new Error(`Missing Paddle ${normalizedPlan.toUpperCase()} price id for env: ${env}`);
  }

  return priceId;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json(405, { ok: false, error: "Method not allowed" });
    }



    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      console.error("[paddle-create-checkout] invalid json body", e);
      return json(400, { ok: false, error: "Invalid JSON body" });
    }

    // Normaliza org id
    const rawOrgIdSnake = body?.org_id ?? null;
    const rawOrgIdCamel = body?.orgId ?? null;
    const orgId = rawOrgIdSnake ?? rawOrgIdCamel ?? null;
    const plan = body?.plan ?? null;

    if (!orgId || !plan) {
      return new Response(
        JSON.stringify({
          error: "missing_org_id_or_plan",
          org_id: rawOrgIdSnake,
          orgId: rawOrgIdCamel,
          normalizedOrgId: orgId,
          plan,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await requireOrgAdmin(req, String(orgId));
    const { data: billing, error: billingError } = await getAdminClient()
      .from("org_billing").select("plan_status, subscribed_plan_code, plan_code, billing_provider")
      .eq("org_id", String(orgId)).maybeSingle();
    if (billingError) return json(503, { ok: false, error: "billing_lookup_failed" });
    const billingStatus = String(billing?.plan_status || "").toLowerCase();
    const existingPlan = String(billing?.subscribed_plan_code || billing?.plan_code || "free").toLowerCase();
    if (["active", "trialing", "past_due", "paused"].includes(billingStatus) && existingPlan !== "free") {
      return json(409, { ok: false, error: "existing_subscription_requires_plan_change" });
    }

    console.log("[paddle-create-checkout] BODY:", body);
    console.log("[paddle-create-checkout] ORG ID:", orgId);
    console.log("[paddle-create-checkout] PLAN:", plan);
    console.log("[paddle-create-checkout] ENV:", {
      paddleEnv: getPaddleEnv(),
      hasApiKeySandbox: !!Deno.env.get("PADDLE_API_KEY_SANDBOX"),
      hasApiKeyLive: !!Deno.env.get("PADDLE_API_KEY_LIVE"),
      hasProPriceIdSandbox: !!Deno.env.get("PADDLE_PRO_PRICE_ID_SANDBOX"),
      hasProPriceIdLive: !!Deno.env.get("PADDLE_PRO_PRICE_ID_LIVE"),
      hasEnterprisePriceIdSandbox: !!Deno.env.get("PADDLE_ENTERPRISE_PRICE_ID_SANDBOX"),
      hasEnterprisePriceIdLive: !!Deno.env.get("PADDLE_ENTERPRISE_PRICE_ID_LIVE"),
    });

    console.log("[paddle-create-checkout] validating inputs", { orgId, plan });

    if (!orgId || !plan) {
      console.error("[paddle-create-checkout] missing required fields", { orgId, plan });
      return json(400, { error: "missing_orgId_or_plan", orgId, plan });
    }

    // Central Paddle config
    const paddleEnv = getPaddleEnv();
    const PADDLE_API_KEY = getPaddleApiKey();
    let priceId: string;
    try {
      priceId = getPaddlePriceId(plan);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unsupported plan:")) {
        return json(400, {
          ok: false,
          error: "unsupported_plan",
          plan,
          allowed: ["pro", "enterprise", "enterprise_100"],
        });
      }
      throw error;
    }

    console.log("[paddle-create-checkout] paddleEnv:", paddleEnv);
    console.log("[paddle-create-checkout] using API key exists:", !!PADDLE_API_KEY);
    console.log("[paddle-create-checkout] using priceId:", priceId);

    if (!PADDLE_API_KEY) {
      return json(500, { ok: false, error: "Missing PADDLE_API_KEY for env", paddleEnv });
    }

    if (!priceId) {
      return json(400, {
        error: "missing_price_id_for_plan",
        plan,
        paddleEnv,
      });
    }



    // Determina el dominio correcto para success_url según el entorno
    const isLive = getPaddleEnv() === "live";
    const APP_URL = isLive
      ? "https://app.tugeocercas.com"
      : "https://preview.tugeocercas.com";

    const successUrl = `${APP_URL}/dashboard?billing=success`;
    const cancelUrl = `${APP_URL}/billing?billing=cancel`;

    const paddlePayload = {
      items: [
        {
          price_id: priceId,
          quantity: 1,
        },
      ],
      custom_data: {
        org_id: orgId,
        plan,
      },
      checkout: {
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
    };

    console.log("[paddle-create-checkout] creating paddle transaction", {
      orgId,
      plan,
      priceId,
    });

    const paddleApiUrl = paddleEnv === "live"
      ? "https://api.paddle.com/transactions"
      : "https://sandbox-api.paddle.com/transactions";

    const paddleResponse = await fetch(paddleApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PADDLE_API_KEY}`,
      },
      body: JSON.stringify(paddlePayload),
    });

    const rawText = await paddleResponse.text();
    console.log("[paddle-create-checkout] PADDLE STATUS:", paddleResponse.status);

    let paddleJson: any = null;
    try {
      paddleJson = rawText ? JSON.parse(rawText) : null;
    } catch (parseError) {
      console.error("[paddle-create-checkout] paddle json parse error", parseError);
    }


    if (!paddleResponse.ok) {
      const paddleError = paddleJson?.error;
      const paddleCode =
        typeof paddleError?.code === "string" ? paddleError.code : null;
      const paddleDetail =
        typeof paddleError?.detail === "string"
          ? paddleError.detail
          : typeof paddleError?.message === "string"
            ? paddleError.message
            : "Paddle request failed";
      const paddleRequestId =
        typeof paddleJson?.meta?.request_id === "string"
          ? paddleJson.meta.request_id
          : null;

      console.error("[paddle-create-checkout] Paddle request failed", {
        status: paddleResponse.status,
        code: paddleCode,
        detail: paddleDetail,
        requestId: paddleRequestId,
      });

      const responseStatus =
        paddleResponse.status >= 400 && paddleResponse.status < 500
          ? paddleResponse.status
          : 500;

      return json(responseStatus, {
        error: "paddle_request_failed",
        message: paddleDetail,
        status: paddleResponse.status,
        code: paddleCode,
        detail: paddleDetail,
        request_id: paddleRequestId,
      });
    }

    const checkoutUrl = paddleJson?.data?.checkout?.url;

    if (!checkoutUrl) {
      return json(500, {
        ok: false,
        error: "no_checkout_url",
      });
    }

    return json(200, {
      ok: true,
      checkout_url: checkoutUrl,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      const publicError =
        error.status === 401
          ? "unauthorized"
          : error.status === 403
            ? "forbidden"
            : "bad_request";

      return json(error.status, {
        ok: false,
        error: publicError,
      });
    }

    console.error("[paddle-create-checkout] unhandled error", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "UnknownError",
    });

    return json(500, {
      error: "internal_error",
    });
  }
});
