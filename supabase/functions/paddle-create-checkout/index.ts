import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
interface JsonObject {
  [key: string]: JsonValue;
}
interface JsonArray extends Array<JsonValue> {}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: JsonObject) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

serve(async (req: Request) => {
  let stage = "init";

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json(405, {
        ok: false,
        error: "Method not allowed",
      });
    }

    stage = "load_env";

    const SUPABASE_URL = getEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const PADDLE_API_KEY = getEnv("PADDLE_API_KEY");
    const PADDLE_PRICE_ID_PRO = getEnv("PADDLE_PRICE_ID_PRO");
    const PADDLE_ENV = (Deno.env.get("PADDLE_ENV") || "sandbox").trim();

    const isSandboxKey = PADDLE_API_KEY.startsWith("pdl_sdbx_apikey_");
    const isLiveKey = PADDLE_API_KEY.startsWith("pdl_live_apikey_");

    if (!isSandboxKey && !isLiveKey) {
      return json(500, {
        ok: false,
        error: "Invalid Paddle API key format",
      });
    }

    if (PADDLE_ENV === "sandbox" && !isSandboxKey) {
      return json(500, {
        ok: false,
        error: "Paddle API key/environment mismatch",
        expected: "sandbox key must start with pdl_sdbx_apikey_",
      });
    }

    if ((PADDLE_ENV === "live" || PADDLE_ENV === "production") && !isLiveKey) {
      return json(500, {
        ok: false,
        error: "Paddle API key/environment mismatch",
        expected: "live key must start with pdl_live_apikey_",
      });
    }

    if (!PADDLE_PRICE_ID_PRO.startsWith("pri_")) {
      return json(500, {
        ok: false,
        error: "Invalid Paddle price id in env",
        value: PADDLE_PRICE_ID_PRO,
      });
    }

    stage = "parse_body";

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, {
        ok: false,
        error: "Invalid JSON body",
      });
    }

    const orgIdRaw =
      typeof body.org_id === "string"
        ? body.org_id
        : typeof body.orgId === "string"
        ? body.orgId
        : "";

    const returnUrlRaw =
      typeof body.return_url === "string"
        ? body.return_url
        : typeof body.returnUrl === "string"
        ? body.returnUrl
        : "";

    const requestedPriceId =
      typeof body.price_id === "string"
        ? body.price_id
        : typeof body.priceId === "string"
        ? body.priceId
        : "";

    const fallbackEmail =
      typeof body.email === "string" ? body.email.trim() : "";

    const orgId = orgIdRaw.trim();
    const returnUrl = returnUrlRaw.trim();

    if (!orgId) {
      return json(400, {
        ok: false,
        error: "org_id is required",
      });
    }

    if (returnUrl && !isValidHttpUrl(returnUrl)) {
      return json(400, {
        ok: false,
        error: "return_url must be a valid http/https URL",
      });
    }

    if (requestedPriceId && requestedPriceId !== PADDLE_PRICE_ID_PRO) {
      return json(400, {
        ok: false,
        error: "priceId does not match server configured plan",
      });
    }

    stage = "authenticate_user";

    const accessToken = getBearerToken(req);
    if (!accessToken) {
      return json(401, {
        ok: false,
        error: "Missing or invalid Bearer token",
        stage,
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const userResult = await adminClient.auth.getUser(accessToken);
    const user = userResult.data.user;
    const userError = userResult.error;

    if (userError || !user) {
      return json(401, {
        ok: false,
        error: userError?.message || "Unauthorized",
        stage,
      });
    }

    stage = "check_membership";

    const membershipResult = await adminClient.rpc("gc_is_member_of_org", {
      p_user_id: user.id,
      p_org_id: orgId,
    });

    if (membershipResult.error) {
      return json(500, {
        ok: false,
        error: "Failed to validate org membership",
        details: membershipResult.error.message,
        stage,
      });
    }

    const isMember = !!membershipResult.data;
    if (!isMember) {
      return json(403, {
        ok: false,
        error: "User is not a member of the organization",
        org_id: orgId,
        stage,
      });
    }

    stage = "load_billing_row";

    const billingResult = await adminClient
      .from("org_billing")
      .select(
        "org_id, billing_provider, paddle_customer_id, paddle_subscription_id, paddle_price_id, plan_code, plan_status"
      )
      .eq("org_id", orgId)
      .maybeSingle();

    if (billingResult.error) {
      return json(500, {
        ok: false,
        error: "Failed to load billing row",
        details: billingResult.error.message,
        stage,
      });
    }

    if (!billingResult.data) {
      return json(404, {
        ok: false,
        error: "Billing row not found for org",
        org_id: orgId,
        stage,
      });
    }

    const billingRow = billingResult.data;
    const paddleApiBase =
      PADDLE_ENV === "sandbox"
        ? "https://sandbox-api.paddle.com"
        : "https://api.paddle.com";

    stage = "build_payload";

    const customerEmail = (user.email || fallbackEmail || "").trim();

    const payload: Record<string, unknown> = {
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
      billingRow.paddle_customer_id.trim() !== ""
    ) {
      payload.customer_id = billingRow.paddle_customer_id.trim();
    } else if (customerEmail) {
      payload.customer = {
        email: customerEmail,
      };
    }

    if (returnUrl) {
      payload.checkout = {
        success_url: returnUrl,
      };
    }

    stage = "call_paddle";

    const paddleResponse = await fetch(`${paddleApiBase}/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PADDLE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const paddleText = await paddleResponse.text();

    let paddleJson: Record<string, unknown> = {};
    try {
      paddleJson = JSON.parse(paddleText);
    } catch {
      paddleJson = { raw: paddleText };
    }

    if (!paddleResponse.ok) {
      return json(500, {
        ok: false,
        error: "Failed to create Paddle checkout transaction",
        paddle_status: paddleResponse.status,
        paddle_response: paddleJson as unknown as JsonObject,
        stage,
      });
    }

    const paddleData =
      paddleJson &&
      typeof paddleJson === "object" &&
      "data" in paddleJson &&
      typeof paddleJson.data === "object" &&
      paddleJson.data !== null
        ? (paddleJson.data as Record<string, unknown>)
        : null;

    const transactionId =
      paddleData && typeof paddleData.id === "string" ? paddleData.id : "";

    const checkoutObj =
      paddleData &&
      typeof paddleData.checkout === "object" &&
      paddleData.checkout !== null
        ? (paddleData.checkout as Record<string, unknown>)
        : null;

    const checkoutUrl =
      checkoutObj && typeof checkoutObj.url === "string"
        ? checkoutObj.url
        : "";

    const paddleCustomerId =
      paddleData && typeof paddleData.customer_id === "string"
        ? paddleData.customer_id
        : "";

    if (!transactionId || !checkoutUrl) {
      return json(500, {
        ok: false,
        error: "Paddle did not return transaction id or checkout URL",
        paddle_response: paddleJson as unknown as JsonObject,
        stage,
      });
    }

    stage = "persist_billing_metadata";

    const updatePayload: Record<string, unknown> = {
      billing_provider: "paddle",
      paddle_price_id: PADDLE_PRICE_ID_PRO,
      updated_at: new Date().toISOString(),
    };

    if (paddleCustomerId) {
      updatePayload.paddle_customer_id = paddleCustomerId;
    }

    const updateResult = await adminClient
      .from("org_billing")
      .update(updatePayload)
      .eq("org_id", orgId);

    if (updateResult.error) {
      return json(500, {
        ok: false,
        error: "Checkout created, but failed to persist billing metadata",
        details: updateResult.error.message,
        checkout_url: checkoutUrl,
        transaction_id: transactionId,
        stage,
      });
    }

    return json(200, {
      ok: true,
      url: checkoutUrl,
      checkoutUrl,
      transaction_id: transactionId,
      transactionId,
      environment: PADDLE_ENV,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      stage,
    });
  }
});