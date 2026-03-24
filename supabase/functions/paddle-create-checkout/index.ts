// supabase/functions/paddle-create-checkout/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function log(
  level: "log" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
) {
  console[level](message, meta ?? {});
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

serve(async (req) => {
  let stage = "init";

  try {
    stage = "function_hit";
    console.log("🚀 NEW DEPLOY MARKER v2");
    console.log("[paddle-create-checkout] FUNCTION HIT");

    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const authHeader = req.headers.get("Authorization");
    console.log("[paddle-create-checkout] auth_header_received", {
      present: !!authHeader,
      bearer:
        typeof authHeader === "string" && authHeader.startsWith("Bearer "),
      preview: authHeader ? `${authHeader.slice(0, 20)}...` : null,
    });

    if (!authHeader) {
      return json(401, { error: "Missing Authorization header" });
    }

    stage = "load_env";

    const SUPABASE_URL = getEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = getEnv("SUPABASE_ANON_KEY");
    const PADDLE_API_KEY = getEnv("PADDLE_API_KEY");
    const PADDLE_PRICE_ID_PRO = getEnv("PADDLE_PRICE_ID_PRO");
    const PADDLE_ENV = Deno.env.get("PADDLE_ENV") ?? "sandbox";

    // --- DIAGNOSTIC LOGS ---
    const paddleEnv = PADDLE_ENV;
    const keyPreview = PADDLE_API_KEY ? PADDLE_API_KEY.slice(0, 20) : null;
    const isSandbox = !!PADDLE_API_KEY && PADDLE_API_KEY.startsWith("pdl_sdbx_apikey_");
    const isLive = !!PADDLE_API_KEY && PADDLE_API_KEY.startsWith("pdl_live_apikey_");
    const pricePreview = PADDLE_PRICE_ID_PRO ? PADDLE_PRICE_ID_PRO.slice(0, 10) : null;
    console.log("🚀 NEW DEPLOY MARKER v2");
    console.log("[PADDLE KEY CHECK]", { paddleEnv, keyPreview, isSandbox, isLive, pricePreview });

    // --- EARLY VALIDATION ---
    if (!PADDLE_ENV) {
      return json(500, { error: "Missing PADDLE_ENV" });
    }
    if (!PADDLE_API_KEY) {
      return json(500, { error: "Missing PADDLE_API_KEY" });
    }
    if (!PADDLE_PRICE_ID_PRO) {
      return json(500, { error: "Missing PADDLE_PRICE_ID_PRO" });
    }
    if (PADDLE_ENV === "sandbox" && !PADDLE_API_KEY.startsWith("pdl_sdbx_apikey_")) {
      return json(500, { error: "Sandbox key must start with pdl_sdbx_apikey_" });
    }
    if (PADDLE_ENV === "live" && !PADDLE_API_KEY.startsWith("pdl_live_apikey_")) {
      return json(500, { error: "Live key must start with pdl_live_apikey_" });
    }

    stage = "get_user";
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();

    console.log("[paddle-create-checkout] get_user_result", {
      hasUser: !!user,
      userId: user?.id ?? null,
      userError: userError?.message ?? null,
    });

    if (userError || !user) {
      return json(401, {
        ok: false,
        stage: "getUser",
        authHeaderPresent: !!authHeader,
        bearerFormat:
          typeof authHeader === "string" && authHeader.startsWith("Bearer "),
        error: userError?.message ?? "Unauthorized",
      });
    }

    stage = "parse_body";
    const requestBody = await req.json();
    console.log("[paddle-create-checkout] request_body", {
      org_id:
        typeof requestBody?.org_id === "string" ? requestBody.org_id : null,
      plan: typeof requestBody?.plan === "string" ? requestBody.plan : null,
      return_url:
        typeof requestBody?.return_url === "string"
          ? requestBody.return_url
          : null,
    });

    stage = "validate_env";

    log("log", "[PADDLE ENV FULL DEBUG]", {
      rawKeyLength: PADDLE_API_KEY.length,
      rawKeyFirstChar: PADDLE_API_KEY.charCodeAt(0),
      rawKeyLastChar: PADDLE_API_KEY.charCodeAt(PADDLE_API_KEY.length - 1),
      rawKeyPreview: PADDLE_API_KEY.slice(0, 25),
      startsWithSandbox: PADDLE_API_KEY.startsWith("pdl_sandbox_"),
      startsWithLive: PADDLE_API_KEY.startsWith("pdl_live_"),
      paddleEnv: PADDLE_ENV,
    });

    // TEMP DEBUG LOG FOR KEY CHECK
    log("log", "[PADDLE KEY CHECK]", {
      preview: PADDLE_API_KEY.slice(0, 20),
      isSandbox: PADDLE_API_KEY.startsWith("pdl_sdbx_apikey_"),
      isLive: PADDLE_API_KEY.startsWith("pdl_live_apikey_"),
      paddleEnv: PADDLE_ENV,
    });

    const isSandboxKey =
      PADDLE_API_KEY.startsWith("pdl_sdbx_apikey_") ||
      PADDLE_API_KEY.startsWith("pdl_sandbox_");

    const isLiveKey =
      PADDLE_API_KEY.startsWith("pdl_live_apikey_") ||
      PADDLE_API_KEY.startsWith("pdl_live_");

    if (!isSandboxKey && !isLiveKey) {
      return json(500, {
        error: "Invalid Paddle API key format",
        hint: "Expected sandbox key like pdl_sdbx_apikey_* or live key like pdl_live_apikey_*",
      });
    }

    if (PADDLE_ENV === "sandbox" && !isSandboxKey) {
      return json(500, {
        error: "Paddle API key/environment mismatch",
        expected: "sandbox key: pdl_sdbx_apikey_*",
      });
    }

    if ((PADDLE_ENV === "production" || PADDLE_ENV === "live") && !isLiveKey) {
      return json(500, {
        error: "Paddle API key/environment mismatch",
        expected: "live key: pdl_live_apikey_*",
      });
    }

    if (!PADDLE_PRICE_ID_PRO.startsWith("pri_")) {
      return json(500, {
        error: "Invalid Paddle price_id",
        value: PADDLE_PRICE_ID_PRO,
      });
    }

    stage = "create_admin_client";
    const adminClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false },
      },
    );

    stage = "validate_input";
    const orgId =
      typeof requestBody?.org_id === "string" ? requestBody.org_id.trim() : "";
    const returnUrl =
      typeof requestBody?.return_url === "string"
        ? requestBody.return_url.trim()
        : undefined;

    if (!orgId) {
      log("warn", "[paddle-create-checkout] org_id missing");
      return json(400, { error: "org_id is required" });
    }

    if (returnUrl && !isValidHttpUrl(returnUrl)) {
      log("warn", "[paddle-create-checkout] return_url invalid");
      return json(400, {
        error: "return_url must be a valid http/https URL",
      });
    }

    log("log", "[paddle-create-checkout] request received", {
      method: req.method,
      origin: req.headers.get("origin") || null,
      hasAuthHeader: !!authHeader,
      orgId,
      hasReturnUrl: !!returnUrl,
      userId: user.id,
      userEmail: user.email ?? null,
    });

    stage = "load_org";
    try {
      const { data: membership, error: membershipError } = await adminClient.rpc(
        "gc_is_member_of_org",
        {
          p_user_id: user.id,
          p_org_id: orgId,
        },
      );

      log("log", "[paddle-create-checkout] membership debug", {
        userId: user.id,
        orgId,
        membership,
        membershipError: membershipError?.message ?? null,
      });
    } catch (err) {
      log("warn", "[paddle-create-checkout] membership check failed", {
        userId: user.id,
        orgId,
        details: err instanceof Error ? err.message : String(err),
      });
    }

    const { data: billingRow, error: billingError } = await adminClient
      .from("org_billing")
      .select(
        "org_id, plan_code, plan_status, billing_provider, paddle_customer_id, paddle_subscription_id, paddle_price_id",
      )
      .eq("org_id", orgId)
      .maybeSingle();

    if (billingError) {
      log("error", "[paddle-create-checkout] failed to load billing row", {
        orgId,
        details: billingError.message,
      });
      return json(500, {
        error: "Failed to load billing row.",
        details: billingError.message,
      });
    }

    if (!billingRow) {
      log("warn", "[paddle-create-checkout] org_billing row not found", {
        orgId,
      });
      return json(404, {
        error: "Billing row not found for org.",
        org_id: orgId,
      });
    }

    stage = "build_checkout_payload";
    const paddleApiBase =
      PADDLE_ENV === "sandbox"
        ? "https://sandbox-api.paddle.com"
        : "https://api.paddle.com";

    const payload: JsonRecord = {
      items: [
        {
          price_id: PADDLE_PRICE_ID_PRO,
          quantity: 1,
        },
      ],
      collection_mode: "automatic",
      custom_data: {
        org_id: orgId,
        user_id: user.id,
        source: "geocercas_app",
        requested_plan_code: "pro",
      },
    };

    if (
      typeof billingRow.paddle_customer_id === "string" &&
      billingRow.paddle_customer_id
    ) {
      payload.customer_id = billingRow.paddle_customer_id;
    } else if (user.email) {
      payload.customer = {
        email: user.email,
      };
    }

    if (returnUrl) {
      payload.checkout = {
        success_url: returnUrl,
      };
    }

    log("log", "[paddle-create-checkout] paddle request debug", {
      apiBase: paddleApiBase,
      hasApiKey: !!PADDLE_API_KEY,
      apiKeyPrefix: PADDLE_API_KEY.slice(0, 15),
      env: PADDLE_ENV,
      priceId: PADDLE_PRICE_ID_PRO,
      orgId,
    });

    // --- TEMP DIAGNOSTIC: Paddle /event-types ---
    try {
      const eventTypesResp = await fetch(`${paddleApiBase}/event-types`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${PADDLE_API_KEY}`,
        },
      });
      const eventTypesBody = await eventTypesResp.json();
      console.log("[PADDLE DIAG] /event-types status", eventTypesResp.status);
      console.log("[PADDLE DIAG] /event-types body", eventTypesBody);
    } catch (e) {
      console.error("[PADDLE DIAG] /event-types error", e);
    }

    stage = "call_paddle";
    let paddleResponse: Response;
    let paddleJson: JsonRecord = {};

    try {

      // Diagnóstico: log payload antes del fetch
      console.log("[PADDLE CREATE] payload", JSON.stringify(payload, null, 2));
      paddleResponse = await fetch(`${paddleApiBase}/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PADDLE_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      // Diagnóstico: log status y response como texto
      console.log("[PADDLE CREATE] status", paddleResponse.status);
      const text = await paddleResponse.clone().text();
      console.log("[PADDLE CREATE] response", text);

      paddleJson = await paddleResponse.json().catch(() => ({}));

      log("log", "[paddle-create-checkout] paddle raw response", {
        status: paddleResponse.status,
        ok: paddleResponse.ok,
        body: paddleJson,
      });
    } catch (err) {
      log("error", "[paddle-create-checkout] error calling paddle api", {
        orgId,
        details: err instanceof Error ? err.message : String(err),
      });
      return json(500, { error: "Error calling Paddle API." });
    }

    stage = "paddle_response";
    if (!paddleResponse.ok) {
      log(
        "error",
        "[paddle-create-checkout] failed to create Paddle checkout transaction",
        {
          status: paddleResponse.status,
          response: paddleJson,
        },
      );
      return json(400, {
        error: "Failed to create Paddle checkout transaction.",
        paddle_status: paddleResponse.status,
        paddle_response: paddleJson,
      });
    }

    const paddleData =
      paddleJson && typeof paddleJson === "object" && "data" in paddleJson
        ? (paddleJson.data as Record<string, unknown>)
        : undefined;

    const transactionId =
      typeof paddleData?.id === "string" ? paddleData.id : undefined;

    const checkoutObj =
      paddleData?.checkout &&
      typeof paddleData.checkout === "object" &&
      paddleData.checkout !== null
        ? (paddleData.checkout as Record<string, unknown>)
        : undefined;

    const checkoutUrl =
      typeof checkoutObj?.url === "string" ? checkoutObj.url : undefined;

    const paddleCustomerId =
      typeof paddleData?.customer_id === "string"
        ? paddleData.customer_id
        : undefined;

    if (!transactionId || !checkoutUrl) {
      log(
        "error",
        "[paddle-create-checkout] paddle did not return checkout url",
        {
          orgId,
          transactionId: transactionId ?? null,
          hasCheckoutUrl: !!checkoutUrl,
        },
      );
      return json(500, {
        error: "Paddle did not return a checkout URL.",
        paddle_response: paddleJson,
      });
    }

    stage = "persist_billing_metadata";
    const updatePayload: JsonRecord = {
      billing_provider: "paddle",
      paddle_price_id: PADDLE_PRICE_ID_PRO,
      updated_at: new Date().toISOString(),
    };

    if (paddleCustomerId) {
      updatePayload.paddle_customer_id = paddleCustomerId;
    }

    const { error: updateError } = await adminClient
      .from("org_billing")
      .update(updatePayload)
      .eq("org_id", orgId);

    if (updateError) {
      log(
        "error",
        "[paddle-create-checkout] failed to persist billing metadata",
        {
          orgId,
          transactionId,
          details: updateError.message,
        },
      );
      return json(500, {
        error: "Checkout created, but failed to persist billing metadata.",
        details: updateError.message,
        checkout_url: checkoutUrl,
        transaction_id: transactionId,
      });
    }

    log("log", "[paddle-create-checkout] checkout created successfully", {
      orgId,
      transactionId,
      checkoutUrl,
      environment: PADDLE_ENV,
    });

    return json(200, {
      url: checkoutUrl,
      transaction_id: transactionId,
      environment: PADDLE_ENV,
    });
  } catch (error) {
    console.error("[paddle-create-checkout] unhandled_error", {
      stage,
      message: error instanceof Error ? error.message : String(error),
      stack:
        error instanceof Error && error.stack
          ? error.stack.slice(0, 500)
          : null,
    });

    return json(500, {
      ok: false,
      stage,
      error: error instanceof Error ? error.message : String(error),
      stack:
        error instanceof Error && error.stack
          ? error.stack.slice(0, 500)
          : null,
    });
  }
});