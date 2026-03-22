// supabase/functions/paddle-create-checkout/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

function json(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PADDLE_API_KEY = Deno.env.get("PADDLE_API_KEY")!;
    const PADDLE_PRICE_ID_PRO = Deno.env.get("PADDLE_PRICE_ID_PRO")!;
    const PADDLE_ENV = Deno.env.get("PADDLE_ENV") || "sandbox";

    if (
      !SUPABASE_URL ||
      !SUPABASE_ANON_KEY ||
      !SUPABASE_SERVICE_ROLE_KEY ||
      !PADDLE_API_KEY ||
      !PADDLE_PRICE_ID_PRO
    ) {
      return json(500, {
        error: "Missing required environment variables.",
      });
    }


    // --- DEBUG LOGS ---
    const method = req.method;
    const origin = req.headers.get("origin") || null;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    const requestBody = await req.json().catch(() => ({}));
    const orgId = requestBody?.org_id as string | undefined;
    const returnUrl = requestBody?.return_url as string | undefined;

    console.log("paddle-create-checkout auth debug", {
      method,
      origin,
      hasAuthHeader: !!authHeader,
      tokenSample: token ? token.slice(0, 20) : null,
      tokenSegments: token ? token.split(".").length : 0,
      orgId,
    });

    if (!orgId) {
      return json(400, { error: "Missing org_id." });
    }

    // Siempre usar el cliente admin para operaciones internas en preview
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Opcional: solo para debug, no bloquear el flujo si falla
    let user = null;
    let userError = null;
    try {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const userRes = await userClient.auth.getUser();
      user = userRes.data?.user || null;
      userError = userRes.error || null;
      console.log("paddle-create-checkout getUser debug", {
        userId: user?.id,
        userError,
      });
    } catch (err) {
      console.warn("getUser failed", err);
    }

    // En preview, no bloquear por userError
    // if (userError || !user) {
    //   return json(401, { error: "Not authenticated." });
    // }


    // En preview, puedes omitir validación estricta de membresía
    // Si quieres validar, puedes dejarlo como debug opcional
    if (user && user.id) {
      try {
        const { data: membership, error: membershipError } = await adminClient.rpc(
          "gc_is_member_of_org",
          {
            p_user_id: user.id,
            p_org_id: orgId,
          }
        );
        console.log("paddle-create-checkout membership debug", {
          membership,
          membershipError,
        });
        // No bloquear en preview
      } catch (err) {
        console.warn("membership check failed", err);
      }
    }

    const { data: billingRow, error: billingError } = await adminClient
      .from("org_billing")
      .select(
        "org_id, plan_code, plan_status, billing_provider, paddle_customer_id, paddle_subscription_id, paddle_price_id"
      )
      .eq("org_id", orgId)
      .maybeSingle();

    if (billingError) {
      console.error("paddle-create-checkout billing error", billingError);
      return json(500, {
        error: "Failed to load billing row.",
        details: billingError.message,
      });
    }

    const paddleApiBase =
      PADDLE_ENV === "sandbox"
        ? "https://sandbox-api.paddle.com"
        : "https://api.paddle.com";


    console.log("paddle payload debug", {
      orgId,
      userId: user?.id ?? null,
      hasUser: !!user,
    });

    const payload: JsonRecord = {
      items: [
        {
          price_id: PADDLE_PRICE_ID_PRO
        },
      ],
      collection_mode: "automatic",
      custom_data: {
        org_id: orgId,
        user_id: user?.id ?? null,
        source: "geocercas_app",
        requested_plan_code: "pro",
      },
    };

    if (billingRow?.paddle_customer_id) {
      payload.customer_id = billingRow.paddle_customer_id;
    } else if (user?.email) {
      payload.customer = {
        email: user.email,
      };
    }

    if (returnUrl) {
      payload.checkout = {
        success_url: returnUrl,
      };
    }


    let paddleResponse, paddleJson;
    try {
      paddleResponse = await fetch(`${paddleApiBase}/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PADDLE_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      paddleJson = await paddleResponse.json().catch(() => ({}));
      console.log("paddle-create-checkout paddle response", {
        status: paddleResponse.status,
        ok: paddleResponse.ok,
        bodySample: JSON.stringify(paddleJson).slice(0, 200),
      });
    } catch (err) {
      console.error("paddle-create-checkout paddle fetch error", err);
      return json(500, { error: "Error calling Paddle API." });
    }

    if (!paddleResponse.ok) {
      return json(400, {
        error: "Failed to create Paddle checkout transaction.",
        paddle_status: paddleResponse.status,
        paddle_response: paddleJson,
      });
    }

    const transactionId = paddleJson?.data?.id as string | undefined;
    const checkoutUrl = paddleJson?.data?.checkout?.url as string | undefined;
    const paddleCustomerId = paddleJson?.data?.customer_id as string | undefined;

    if (!transactionId || !checkoutUrl) {
      return json(500, {
        error: "Paddle did not return a checkout URL.",
        paddle_response: paddleJson,
      });
    }

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
      console.error("paddle-create-checkout update error", updateError);
      return json(500, {
        error: "Checkout created, but failed to persist billing metadata.",
        details: updateError.message,
        checkout_url: checkoutUrl,
        transaction_id: transactionId,
      });
    }

    console.log("paddle-create-checkout success", {
      checkoutUrl,
      transactionId,
      environment: PADDLE_ENV,
    });
    return json(200, {
      url: checkoutUrl,
      transaction_id: transactionId,
      environment: PADDLE_ENV,
    });
  } catch (error) {
    return json(500, {
      error: "Unexpected server error.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});