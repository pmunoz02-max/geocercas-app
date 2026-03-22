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

function log(level: "log" | "warn" | "error", message: string, extra?: JsonRecord) {
  console[level](
    JSON.stringify({
      scope: "paddle-create-checkout",
      message,
      ...(extra ?? {}),
    }),
  );
}

function getEnv(name: string): string | null {
  const value = Deno.env.get(name);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const SUPABASE_URL = getEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = getEnv("SUPABASE_ANON_KEY"); // opcional para debug/auth observability
    const PADDLE_API_KEY = getEnv("PADDLE_API_KEY");
    const PADDLE_PRICE_ID_PRO = getEnv("PADDLE_PRICE_ID_PRO");
    const PADDLE_ENV = getEnv("PADDLE_ENV") ?? "sandbox";

    const requiredEnv = {
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      PADDLE_API_KEY,
      PADDLE_PRICE_ID_PRO,
    };

    const missingEnv = Object.entries(requiredEnv)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missingEnv.length > 0) {
      log("error", "missing required environment variables", {
        missing: missingEnv,
      });
      return json(500, {
        error: "Missing required environment variables",
        missing: missingEnv,
      });
    }

    const method = req.method;
    const origin = req.headers.get("origin") || null;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    const requestBody = await req.json().catch(() => ({} as JsonRecord));
    const orgId =
      typeof requestBody?.org_id === "string" ? requestBody.org_id : undefined;
    const returnUrl =
      typeof requestBody?.return_url === "string"
        ? requestBody.return_url
        : undefined;

    log("log", "request received", {
      method,
      origin,
      hasAuthHeader: !!authHeader,
      tokenSample: token ? token.slice(0, 20) : null,
      tokenSegments: token ? token.split(".").length : 0,
      orgId: orgId ?? null,
      hasReturnUrl: !!returnUrl,
      environment: PADDLE_ENV,
    });

    if (!orgId) {
      return json(400, { error: "Missing org_id." });
    }

    if (returnUrl && !isValidHttpUrl(returnUrl)) {
      return json(400, { error: "Invalid return_url." });
    }

    const adminClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    let user: { id?: string; email?: string } | null = null;
    let userError: unknown = null;

    if (SUPABASE_ANON_KEY && authHeader) {
      try {
        const userClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false },
        });

        const userRes = await userClient.auth.getUser();
        user = userRes.data?.user
          ? {
              id: userRes.data.user.id,
              email: userRes.data.user.email ?? undefined,
            }
          : null;
        userError = userRes.error ?? null;

        log("log", "getUser debug", {
          userId: user?.id ?? null,
          userEmail: user?.email ?? null,
          hasUser: !!user,
          userError:
            userError instanceof Error
              ? userError.message
              : userError
                ? String(userError)
                : null,
        });
      } catch (err) {
        log("warn", "getUser failed", {
          details: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      log("warn", "skipping user resolution", {
        reason: !SUPABASE_ANON_KEY
          ? "SUPABASE_ANON_KEY missing"
          : "Authorization header missing",
      });
    }

    if (user?.id) {
      try {
        const { data: membership, error: membershipError } = await adminClient.rpc(
          "gc_is_member_of_org",
          {
            p_user_id: user.id,
            p_org_id: orgId,
          },
        );

        log("log", "membership debug", {
          userId: user.id,
          orgId,
          membership,
          membershipError: membershipError?.message ?? null,
        });
      } catch (err) {
        log("warn", "membership check failed", {
          userId: user.id,
          orgId,
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const { data: billingRow, error: billingError } = await adminClient
      .from("org_billing")
      .select(
        "org_id, plan_code, plan_status, billing_provider, paddle_customer_id, paddle_subscription_id, paddle_price_id",
      )
      .eq("org_id", orgId)
      .maybeSingle();

    if (billingError) {
      log("error", "failed to load billing row", {
        orgId,
        details: billingError.message,
      });
      return json(500, {
        error: "Failed to load billing row.",
        details: billingError.message,
      });
    }

    if (!billingRow) {
      log("warn", "org_billing row not found", { orgId });
      return json(404, {
        error: "Billing row not found for org.",
        org_id: orgId,
      });
    }

    const paddleApiBase =
      PADDLE_ENV === "sandbox"
        ? "https://sandbox-api.paddle.com"
        : "https://api.paddle.com";

    const payload: JsonRecord = {
      items: [
        {
          price_id: PADDLE_PRICE_ID_PRO!,
          quantity: 1,
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

    if (billingRow.paddle_customer_id) {
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

    log("log", "calling paddle transactions api", {
      orgId,
      userId: user?.id ?? null,
      hasUser: !!user,
      hasCustomerId: !!billingRow.paddle_customer_id,
      hasCustomerEmail: !!user?.email,
      environment: PADDLE_ENV,
      apiBase: paddleApiBase,
    });

    let paddleResponse: Response;
    let paddleJson: JsonRecord = {};

    try {
      paddleResponse = await fetch(`${paddleApiBase}/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PADDLE_API_KEY!}`,
        },
        body: JSON.stringify(payload),
      });

      paddleJson = await paddleResponse.json().catch(() => ({}));

      log("log", "paddle response received", {
        orgId,
        status: paddleResponse.status,
        ok: paddleResponse.ok,
        bodySample: JSON.stringify(paddleJson).slice(0, 500),
      });
    } catch (err) {
      log("error", "error calling paddle api", {
        orgId,
        details: err instanceof Error ? err.message : String(err),
      });
      return json(500, { error: "Error calling Paddle API." });
    }

    if (!paddleResponse.ok) {
      return json(400, {
        error: "Failed to create Paddle checkout transaction.",
        paddle_status: paddleResponse.status,
        paddle_response: paddleJson,
      });
    }

    const transactionId =
      typeof (paddleJson as any)?.data?.id === "string"
        ? (paddleJson as any).data.id
        : undefined;

    const checkoutUrl =
      typeof (paddleJson as any)?.data?.checkout?.url === "string"
        ? (paddleJson as any).data.checkout.url
        : undefined;

    const paddleCustomerId =
      typeof (paddleJson as any)?.data?.customer_id === "string"
        ? (paddleJson as any).data.customer_id
        : undefined;

    if (!transactionId || !checkoutUrl) {
      log("error", "paddle did not return checkout url", {
        orgId,
        transactionId: transactionId ?? null,
        hasCheckoutUrl: !!checkoutUrl,
      });
      return json(500, {
        error: "Paddle did not return a checkout URL.",
        paddle_response: paddleJson,
      });
    }

    const updatePayload: JsonRecord = {
      billing_provider: "paddle",
      paddle_price_id: PADDLE_PRICE_ID_PRO!,
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
      log("error", "failed to persist billing metadata", {
        orgId,
        transactionId,
        details: updateError.message,
      });
      return json(500, {
        error: "Checkout created, but failed to persist billing metadata.",
        details: updateError.message,
        checkout_url: checkoutUrl,
        transaction_id: transactionId,
      });
    }

    log("log", "checkout created successfully", {
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
    log("error", "unexpected server error", {
      details: error instanceof Error ? error.message : String(error),
    });

    return json(500, {
      error: "Unexpected server error.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});