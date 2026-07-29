import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { HttpError, requireOrgAdmin } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ACTIVE_PLAN_STATUSES = new Set(["active", "trialing", "past_due"]);

type BillingRow = {
  plan_code: string;
  subscribed_plan_code: string | null;
  plan_status: string;
  billing_provider: string | null;
  paddle_subscription_id: string | null;
  paddle_price_id: string | null;
  cancel_at_period_end: boolean;
  scheduled_change_action: string | null;
  scheduled_change_effective_at: string | null;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireEnv(name: string): string {
  const value = cleanString(Deno.env.get(name));
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function normalizePaddleEnv(): "sandbox" | "live" {
  const value = cleanString(Deno.env.get("PADDLE_ENV")).toLowerCase();
  if (value !== "sandbox" && value !== "live") {
    throw new Error("PADDLE_ENV must be sandbox or live");
  }
  return value;
}

function getEnterprisePriceId(paddleEnv: "sandbox" | "live"): string {
  return requireEnv(
    paddleEnv === "live"
      ? "PADDLE_ENTERPRISE_PRICE_ID_LIVE"
      : "PADDLE_ENTERPRISE_PRICE_ID_SANDBOX",
  );
}

function getPaddleApiKey(paddleEnv: "sandbox" | "live"): string {
  return requireEnv(
    paddleEnv === "live"
      ? "PADDLE_API_KEY_LIVE"
      : "PADDLE_API_KEY_SANDBOX",
  );
}

function parsePaddleBody(raw: string): any | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getPaddleErrorCode(body: any): string {
  return cleanString(
    body?.error?.code ??
      body?.paddle_error?.error?.code ??
      body?.code,
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  let orgId = "";

  try {
    const body = await req.json().catch(() => null);
    orgId = cleanString(body?.org_id);
    const targetPlan = cleanString(body?.plan_code || "enterprise").toLowerCase();

    if (!orgId) {
      return jsonResponse(400, { error: "org_id_required" });
    }

    if (targetPlan !== "enterprise") {
      return jsonResponse(400, {
        error: "unsupported_target_plan",
        allowed: ["enterprise"],
      });
    }

    const { user } = await requireOrgAdmin(req, orgId);
    const supabase = getAdminClient();

    const { data: billingData, error: billingError } = await supabase
      .from("org_billing")
      .select(
        [
          "plan_code",
          "subscribed_plan_code",
          "plan_status",
          "billing_provider",
          "paddle_subscription_id",
          "paddle_price_id",
          "cancel_at_period_end",
          "scheduled_change_action",
          "scheduled_change_effective_at",
        ].join(","),
      )
      .eq("org_id", orgId)
      .maybeSingle();

    if (billingError) {
      console.error("[paddle-change-plan] billing lookup failed", {
        orgId,
        error: billingError.message,
      });
      return jsonResponse(500, { error: "billing_lookup_failed" });
    }

    const billingRow = billingData as unknown as BillingRow | null;

    if (!billingRow) {
      return jsonResponse(404, { error: "billing_not_found" });
    }

    const currentPlan = cleanString(
      billingRow.subscribed_plan_code || billingRow.plan_code || "free",
    ).toLowerCase();
    const planStatus = cleanString(billingRow.plan_status).toLowerCase();
    const billingProvider = cleanString(billingRow.billing_provider).toLowerCase();
    const subscriptionId = cleanString(billingRow.paddle_subscription_id);
    const scheduledAction = cleanString(billingRow.scheduled_change_action);

    if (
      currentPlan === "enterprise" &&
      ACTIVE_PLAN_STATUSES.has(planStatus) &&
      billingProvider === "paddle"
    ) {
      return jsonResponse(200, {
        success: true,
        already_active: true,
        org_id: orgId,
        plan_code: "enterprise",
        plan_status: planStatus,
      });
    }

    if (billingProvider !== "paddle") {
      return jsonResponse(409, {
        error: billingProvider
          ? "subscription_managed_by_other_provider"
          : "no_active_paddle_subscription",
        billing_provider: billingProvider || null,
      });
    }

    if (
      currentPlan !== "pro" ||
      !ACTIVE_PLAN_STATUSES.has(planStatus) ||
      !subscriptionId
    ) {
      return jsonResponse(409, {
        error: "paddle_pro_subscription_required",
        plan_code: currentPlan,
        plan_status: planStatus || null,
      });
    }

    if (billingRow.cancel_at_period_end === true) {
      return jsonResponse(409, { error: "subscription_cancel_pending" });
    }

    if (scheduledAction) {
      return jsonResponse(409, {
        error: "subscription_has_pending_change",
        scheduled_change_action: scheduledAction,
        scheduled_change_effective_at:
          billingRow.scheduled_change_effective_at ?? null,
      });
    }

    const paddleEnv = normalizePaddleEnv();
    const paddleApiKey = getPaddleApiKey(paddleEnv);
    const enterprisePriceId = getEnterprisePriceId(paddleEnv);
    const paddleBaseUrl =
      paddleEnv === "live"
        ? "https://api.paddle.com"
        : "https://sandbox-api.paddle.com";

    if (cleanString(billingRow.paddle_price_id) === enterprisePriceId) {
      return jsonResponse(409, {
        error: "billing_webhook_sync_pending",
        plan_code: currentPlan,
        target_plan: "enterprise",
      });
    }

    console.log("[paddle-change-plan] request", {
      orgId,
      userId: user.id,
      paddleEnv,
      subscriptionId,
      targetPlan: "enterprise",
    });

    const paddleResponse = await fetch(
      `${paddleBaseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${paddleApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [{ price_id: enterprisePriceId, quantity: 1 }],
          proration_billing_mode: "prorated_immediately",
          on_payment_failure: "prevent_change",
        }),
      },
    );

    const raw = await paddleResponse.text();
    const paddleBody = parsePaddleBody(raw);

    if (!paddleResponse.ok) {
      const paddleCode = getPaddleErrorCode(paddleBody);

      console.warn("[paddle-change-plan] Paddle rejected update", {
        orgId,
        paddleEnv,
        subscriptionId,
        status: paddleResponse.status,
        paddleCode: paddleCode || null,
      });

      if (paddleCode === "subscription_locked_pending_changes") {
        return jsonResponse(409, {
          error: "subscription_has_pending_change",
          paddle_status: paddleResponse.status,
          paddle_env: paddleEnv,
        });
      }

      const clientStatuses = new Set([400, 401, 403, 404, 409, 422]);
      return jsonResponse(
        clientStatuses.has(paddleResponse.status) ? paddleResponse.status : 502,
        {
          error: "paddle_change_plan_failed",
          paddle_status: paddleResponse.status,
          paddle_code: paddleCode || null,
          paddle_env: paddleEnv,
        },
      );
    }

    const responseSubscriptionId = cleanString(paddleBody?.data?.id);
    if (responseSubscriptionId && responseSubscriptionId !== subscriptionId) {
      console.error("[paddle-change-plan] subscription id mismatch", {
        orgId,
        requestedSubscriptionId: subscriptionId,
        responseSubscriptionId,
      });
      return jsonResponse(502, { error: "paddle_response_mismatch" });
    }

    // The webhook remains the only authority that updates org_billing.
    return jsonResponse(200, {
      success: true,
      pending_webhook: true,
      org_id: orgId,
      previous_plan: "pro",
      target_plan: "enterprise",
      subscription_id: subscriptionId,
      paddle_env: paddleEnv,
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);

    if (status >= 500) {
      console.error("[paddle-change-plan] fatal", { orgId, message });
    }

    return jsonResponse(status, {
      error:
        status === 401
          ? "unauthorized"
          : status === 403
            ? "forbidden"
            : status === 400
              ? "invalid_request"
              : "internal_error",
      message,
    });
  }
});
