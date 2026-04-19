import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    } catch {
      return json(400, { ok: false, error: "Invalid JSON body" });
    }

    const planCode = String(body.plan_code || body.plan || "").trim().toLowerCase();

    const PADDLE_API_KEY = Deno.env.get("PADDLE_API_KEY");
    const PADDLE_PRO_PRICE_ID = Deno.env.get("PADDLE_PRO_PRICE_ID");
    const PADDLE_ENTERPRISE_PRICE_ID = Deno.env.get("PADDLE_ENTERPRISE_PRICE_ID");

    if (!PADDLE_API_KEY) {
      return json(500, { ok: false, error: "Missing PADDLE_API_KEY" });
    }

    const selectedPriceId =
      planCode === "enterprise"
        ? PADDLE_ENTERPRISE_PRICE_ID
        : planCode === "pro"
        ? PADDLE_PRO_PRICE_ID
        : null;

    if (!selectedPriceId) {
      return json(400, {
        ok: false,
        error: "Invalid or missing plan_code",
        received: planCode,
      });
    }

    console.log("[paddle-create-checkout] selectedPriceId", selectedPriceId);
    console.log("[paddle-create-checkout] planCode", planCode);

    const paddleRes = await fetch("https://sandbox-api.paddle.com/transactions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            price_id: selectedPriceId,
            quantity: 1,
          },
        ],
        checkout: {
          success_url: "https://preview.tugeocercas.com/billing",
          cancel_url: "https://preview.tugeocercas.com/billing",
        },
      }),
    });

    const result = await paddleRes.json();
    console.log("[paddle-create-checkout] paddle status", paddleRes.status);
    console.log("[paddle-create-checkout] paddle body", result);

    if (!paddleRes.ok) {
      return json(500, {
        ok: false,
        error: "paddle_checkout_failed",
        status: paddleRes.status,
        details: result,
      });
    }

    const checkoutUrl = result?.data?.checkout?.url;

    if (!checkoutUrl) {
      return json(500, {
        ok: false,
        error: "no_checkout_url",
        raw: result,
      });
    }

    return json(200, {
      ok: true,
      checkout_url: checkoutUrl,
    });
  } catch (err) {
    console.error("[paddle-create-checkout] fatal", err);

    return json(500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});