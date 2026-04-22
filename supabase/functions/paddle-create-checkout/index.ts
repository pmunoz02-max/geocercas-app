import { serve } from "https://deno.land/std@0.168.0/http/server.ts";


// --- Paddle environment/config logic ---
function getPaddleEnv() {
  const env = Deno.env.get("PADDLE_ENV")?.toLowerCase();
  return env === "live" ? "live" : "sandbox";
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

function getPaddleProPriceId() {
  const env = getPaddleEnv();
  const priceId =
    env === "live"
      ? Deno.env.get("PADDLE_PRO_PRICE_ID_LIVE")
      : Deno.env.get("PADDLE_PRO_PRICE_ID_SANDBOX");

  if (!priceId) {
    throw new Error(`Missing Paddle PRO price id for env: ${env}`);
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
    // Paddle env/key debug log
    const env = Deno.env.get("PADDLE_ENV");
    const apiKey = Deno.env.get("PADDLE_API_KEY_LIVE") || "";
    console.log("[PADDLE DEBUG]", {
      env,
      keyPrefix: apiKey?.slice(0, 4),
    });

    if (env === "live" && !apiKey.startsWith("pdl_")) {
      throw new Error("Invalid Paddle live API key");
    }
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
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log("[paddle-create-checkout] BODY:", body);
    console.log("[paddle-create-checkout] ORG ID:", orgId);
    console.log("[paddle-create-checkout] PLAN:", plan);
    console.log("[paddle-create-checkout] ENV:", {
      hasPaddleApiKey: !!Deno.env.get("PADDLE_API_KEY"),
      hasProPriceId: !!Deno.env.get("PADDLE_PRICE_ID_PRO"),
      hasEnterprisePriceId: !!Deno.env.get("PADDLE_PRICE_ID_ENTERPRISE"),
    });

    console.log("[paddle-create-checkout] validating inputs", { orgId, plan });

    if (!orgId || !plan) {
      console.error("[paddle-create-checkout] missing required fields", { orgId, plan });
      return json(400, { error: "missing_orgId_or_plan", orgId, plan });
    }

    // Central Paddle config
    const paddleEnv = getPaddleEnv();
    const PADDLE_API_KEY = getPaddleApiKey();
    const priceId = getPaddleProPriceId();

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



    // Determina dominio correcto para success_url según entorno
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
    console.log("[paddle-create-checkout] PADDLE PAYLOAD:", JSON.stringify(paddlePayload));

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
    console.log("[paddle-create-checkout] PADDLE RAW RESPONSE:", rawText);

    let paddleJson: any = null;
    try {
      paddleJson = rawText ? JSON.parse(rawText) : null;
    } catch (parseError) {
      console.error("[paddle-create-checkout] paddle json parse error", parseError);
    }
    console.log("[paddle-create-checkout] PADDLE RESPONSE JSON:", paddleJson);

    if (!paddleResponse.ok) {
      return json(500, {
        error: "paddle_request_failed",
        status: paddleResponse.status,
        paddle: paddleJson ?? rawText,
      });
    }

    const checkoutUrl = paddleJson?.data?.checkout?.url;

    if (!checkoutUrl) {
      return json(500, {
        ok: false,
        error: "no_checkout_url",
        raw: paddleJson,
      });
    }

    return json(200, {
      ok: true,
      checkout_url: checkoutUrl,
    });
  } catch (error) {
    console.error("[paddle-create-checkout] unhandled error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
      error,
    });

    return json(500, {
      error: "internal_error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});