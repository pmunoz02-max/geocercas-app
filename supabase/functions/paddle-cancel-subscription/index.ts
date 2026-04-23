import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "missing_authorization" });
    }

    const body = await req.json().catch(() => null);
    const orgId = body?.org_id;

    if (!orgId || typeof orgId !== "string") {
      return jsonResponse(400, { error: "org_id_required" });
    }

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const PADDLE_API_KEY = requireEnv("PADDLE_API_KEY");
    const PADDLE_ENV = (Deno.env.get("PADDLE_ENV") || "sandbox").toLowerCase();

    const baseUrl =
      PADDLE_ENV === "live"
        ? "https://api.paddle.com"
        : "https://sandbox-api.paddle.com";

    const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
      },
    });

    const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await userSupabase.auth.getUser();

    if (authError || !user) {
      console.warn("[paddle-cancel] unauthorized", {
        orgId,
        authError: authError?.message ?? null,
      });
      return jsonResponse(401, { error: "unauthorized" });
    }


    // Only allow owner or admin roles to cancel
    const { data: memberData, error: memberError } = await userSupabase
      .from("org_members")
      .select("org_id, role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError || !memberData) {
      console.warn("[paddle-cancel] forbidden membership", {
        orgId,
        userId: user.id,
        memberError: memberError?.message ?? null,
      });
      return jsonResponse(403, { error: "forbidden" });
    }

    const role = String(memberData.role || "").toLowerCase();
    if (role !== "owner" && role !== "admin") {
      console.warn("[paddle-cancel] forbidden: insufficient role", {
        orgId,
        userId: user.id,
        role,
      });
      return jsonResponse(403, { error: "forbidden_role" });
    }


    const { data: billingRow, error: billingError } = await serviceSupabase
      .from("org_billing")
      .select("paddle_subscription_id, billing_provider, paddle_customer_id, paddle_price_id, cancel_at_period_end")
      .eq("org_id", orgId)
      .maybeSingle();

    if (billingError) {
      console.error("[paddle-cancel] org_billing lookup error", {
        orgId,
        error: billingError.message,
      });
      return jsonResponse(500, {
        error: "billing_lookup_failed",
        detail: billingError.message,
      });
    }


    if (!billingRow || billingRow.billing_provider !== "paddle") {
      return jsonResponse(400, { error: "no_paddle_subscription" });
    }

    // Idempotency: if already scheduled, do not call Paddle again
    if (billingRow.cancel_at_period_end === true) {
      return jsonResponse(200, {
        success: true,
        already_scheduled: true,
        org_id: orgId,
        subscription_id: billingRow.paddle_subscription_id,
        paddle_env: PADDLE_ENV,
      });
    }

    const subscriptionId = billingRow.paddle_subscription_id;
    if (!subscriptionId) {
      return jsonResponse(400, { error: "no_paddle_subscription" });
    }

    if (PADDLE_ENV === "live") {
      // Minimal log in production
      console.log("[paddle-cancel] config", {
        orgId,
        userId: user.id,
        env: PADDLE_ENV,
        baseUrl,
        subscriptionId,
      });
    } else {
      // Full log in non-production
      console.log("[paddle-cancel] config", {
        orgId,
        userId: user.id,
        env: PADDLE_ENV,
        baseUrl,
        subscriptionId,
        paddleCustomerId: billingRow.paddle_customer_id ?? null,
        paddlePriceId: billingRow.paddle_price_id ?? null,
        hasApiKey: !!PADDLE_API_KEY,
        apiKeyPrefix: PADDLE_API_KEY ? PADDLE_API_KEY.slice(0, 8) : null,
      });
    }

    const response = await fetch(`${baseUrl}/subscriptions/${subscriptionId}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const raw = await response.text();

    console.log("[paddle-cancel] paddle response", {
      status: response.status,
      body: raw,
    });

    if (!response.ok) {
      let parsed: any = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }

      const paddleCode =
        parsed?.error?.code ??
        parsed?.paddle_error?.error?.code ??
        null;

      // 🔥 CASO CRÍTICO NORMALIZADO
      if (paddleCode === "subscription_locked_pending_changes") {
        return jsonResponse(409, {
          ok: false,
          code: "subscription_has_pending_change",
          error: "subscription_has_pending_change",
          paddle_status: response.status,
          paddle_env: PADDLE_ENV,
          subscription_id: subscriptionId,
        });
      }

      // Preserve Paddle's error status for common client errors
      const allowedStatus = [400, 401, 404, 409];
      const statusToReturn = allowedStatus.includes(response.status)
        ? response.status
        : 500;

      return jsonResponse(statusToReturn, {
        error: "paddle_cancel_failed",
        paddle_status: response.status,
        paddle_env: PADDLE_ENV,
        subscription_id: subscriptionId,
        paddle_error: parsed ?? raw,
      });
    }

    const now = new Date().toISOString();

    const { error: updateError } = await serviceSupabase
      .from("org_billing")
      .update({
        cancel_at_period_end: true,
        updated_at: now,
        last_paddle_event_at: now,
      })
      .eq("org_id", orgId);

    if (updateError) {
      console.error("[paddle-cancel] org_billing update desync", {
        orgId,
        error: updateError.message,
      });
      return jsonResponse(500, {
        error: "org_billing_update_failed",
        detail: updateError.message,
        org_id: orgId,
        subscription_id: subscriptionId,
        paddle_env: PADDLE_ENV,
        paddle_cancelled: true,
      });
    }

    return jsonResponse(200, {
      success: true,
      org_id: orgId,
      subscription_id: subscriptionId,
      paddle_env: PADDLE_ENV,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[paddle-cancel] fatal error", { message });

    return jsonResponse(500, {
      error: "internal_error",
      message,
    });
  }
});