import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, paddle-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
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

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseSignature(header: string) {
  const parts = header.split(";").map((p) => p.trim());
  const out: Record<string, string> = {};

  for (const part of parts) {
    const [key, ...rest] = part.split("=");
    if (!key || rest.length === 0) continue;
    out[key] = rest.join("=");
  }

  return {
    ts: out.ts ?? null,
    h1: out.h1 ?? null,
  };
}

async function hmac(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const bytes = new Uint8Array(signature);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getPaddleEnv(): "sandbox" | "live" {
  const env = Deno.env.get("PADDLE_ENV")?.toLowerCase();
  return env === "live" ? "live" : "sandbox";
}

function getPaddleProPriceId(): string {
  const env = getPaddleEnv();
  const value =
    env === "live"
      ? Deno.env.get("PADDLE_PRO_PRICE_ID_LIVE")
      : Deno.env.get("PADDLE_PRO_PRICE_ID_SANDBOX");

  if (!value) {
    throw new Error(`Missing Paddle PRO price id for env: ${env}`);
  }

  return value;
}

function getPaddleEnterprisePriceId(): string | null {
  const env = getPaddleEnv();
  return env === "live"
    ? Deno.env.get("PADDLE_ENTERPRISE_PRICE_ID_LIVE") ?? null
    : Deno.env.get("PADDLE_ENTERPRISE_PRICE_ID_SANDBOX") ?? null;
}

function pickPriceIdFromTransactionData(data: any): string | null {
  const candidates = [
    data?.details?.line_items?.[0]?.price?.id,
    data?.details?.line_items?.[0]?.price_id,
    data?.items?.[0]?.price?.id,
    data?.items?.[0]?.price_id,
    data?.billing_details?.line_items?.[0]?.price?.id,
    data?.billing_details?.line_items?.[0]?.price_id,
    data?.price_id,
  ];

  for (const candidate of candidates) {
    const value = asString(candidate);
    if (value) return value;
  }

  return null;
}

function pickPriceIdFromSubscriptionData(data: any): string | null {
  const candidates = [
    data?.items?.[0]?.price?.id,
    data?.items?.[0]?.price_id,
    data?.subscription_items?.[0]?.price?.id,
    data?.subscription_items?.[0]?.price_id,
    data?.price_id,
  ];

  for (const candidate of candidates) {
    const value = asString(candidate);
    if (value) return value;
  }

  return null;
}

function pickSubscriptionId(data: any): string | null {
  const candidates = [
    data?.subscription_id,
    data?.subscription?.id,
    data?.id,
  ];

  for (const candidate of candidates) {
    const value = asString(candidate);
    if (value) return value;
  }

  return null;
}

function pickCustomerId(data: any): string | null {
  const candidates = [
    data?.customer_id,
    data?.customer?.id,
  ];

  for (const candidate of candidates) {
    const value = asString(candidate);
    if (value) return value;
  }

  return null;
}

function resolvePlanByPriceId(priceId: string): {
  planCode: "pro" | "enterprise";
  trackerLimit: number;
} | null {
  const proPriceId = getPaddleProPriceId();
  const enterprisePriceId = getPaddleEnterprisePriceId();

  if (priceId === proPriceId) {
    return { planCode: "pro", trackerLimit: 3 };
  }

  if (enterprisePriceId && priceId === enterprisePriceId) {
    return { planCode: "enterprise", trackerLimit: 10 };
  }

  return null;
}

async function resolveOrgIdForSubscription({
  supabase,
  customOrgId,
  paddleCustomerId,
  paddleSubscriptionId,
  logPrefix = "[PADDLE WEBHOOK]",
}: {
  supabase: any;
  customOrgId: string | null;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
  logPrefix?: string;
}): Promise<{ orgId: string | null; method: string }> {
  if (customOrgId) {
    console.log(`${logPrefix} org_id resolved from custom_data.org_id`, {
      org_id: customOrgId,
    });
    return { orgId: customOrgId, method: "custom_data.org_id" };
  }

  if (paddleCustomerId) {
    const { data: row, error } = await supabase
      .from("org_billing")
      .select("org_id")
      .eq("billing_provider", "paddle")
      .eq("paddle_customer_id", paddleCustomerId)
      .maybeSingle();

    if (error) {
      console.error(`${logPrefix} org_billing lookup by paddle_customer_id error`, error);
    }

    if (row?.org_id) {
      console.log(`${logPrefix} org_id resolved from paddle_customer_id`, {
        org_id: row.org_id,
        paddle_customer_id: paddleCustomerId,
      });
      return { orgId: row.org_id, method: "paddle_customer_id" };
    }
  }

  if (paddleSubscriptionId) {
    const { data: row, error } = await supabase
      .from("org_billing")
      .select("org_id")
      .eq("billing_provider", "paddle")
      .eq("paddle_subscription_id", paddleSubscriptionId)
      .maybeSingle();

    if (error) {
      console.error(`${logPrefix} org_billing lookup by paddle_subscription_id error`, error);
    }

    if (row?.org_id) {
      console.log(`${logPrefix} org_id resolved from paddle_subscription_id`, {
        org_id: row.org_id,
        paddle_subscription_id: paddleSubscriptionId,
      });
      return { orgId: row.org_id, method: "paddle_subscription_id" };
    }
  }

  console.warn(`${logPrefix} org_id could not be resolved by any method`, {
    paddle_customer_id: paddleCustomerId,
    paddle_subscription_id: paddleSubscriptionId,
  });

  return { orgId: null, method: "not_found" };
}

async function getExistingBillingRow(supabase: any, orgId: string) {
  const { data, error } = await supabase
    .from("org_billing")
    .select("paddle_subscription_id, paddle_customer_id, paddle_price_id")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("[PADDLE WEBHOOK] existing org_billing lookup error", error);
    return null;
  }

  return data ?? null;
}

function buildPaddleFields({
  existingBilling,
  paddleSubscriptionId,
  paddleCustomerId,
  paddlePriceId,
}: {
  existingBilling: any;
  paddleSubscriptionId: string | null;
  paddleCustomerId: string | null;
  paddlePriceId: string | null;
}) {
  return {
    paddle_subscription_id:
      paddleSubscriptionId ??
      asString(existingBilling?.paddle_subscription_id) ??
      null,
    paddle_customer_id:
      paddleCustomerId ??
      asString(existingBilling?.paddle_customer_id) ??
      null,
    paddle_price_id:
      paddlePriceId ??
      asString(existingBilling?.paddle_price_id) ??
      null,
  };
}

serve(async (req) => {
      // --- Idempotency: event_id and occurred_at ---
      const eventId = asString(event?.event_id);
      const occurredAt = asString(event?.occurred_at);
      if (!eventId || !occurredAt) {
        return json(400, { ok: false, error: "Missing event_id or occurred_at" });
      }

      // Check if event already processed
      const { data: existingEvent, error: eventLookupError } = await supabase
        .from("paddle_webhook_events")
        .select("event_id")
        .eq("event_id", eventId)
        .maybeSingle();

      if (eventLookupError) {
        console.error("[PADDLE WEBHOOK] event lookup error", eventLookupError);
        return json(500, { ok: false, error: "Event lookup failed" });
      }

      if (existingEvent) {
        console.log("[PADDLE WEBHOOK] duplicate event ignored", { event_id: eventId });
        return json(200, { ok: true, duplicate: true, event_id: eventId });
      }

      // Insert event as processed (before actual processing for strict idempotency)
      const { error: insertEventError } = await supabase
        .from("paddle_webhook_events")
        .insert({ event_id: eventId, occurred_at: occurredAt, event_type: type });
      if (insertEventError) {
        console.error("[PADDLE WEBHOOK] event insert error", insertEventError);
        return json(500, { ok: false, error: "Event insert failed" });
      }
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  try {
    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const WEBHOOK_SECRET = requireEnv("PADDLE_WEBHOOK_SECRET");

    const rawBody = await req.text();

    const signatureHeader =
      req.headers.get("paddle-signature") ??
      req.headers.get("Paddle-Signature");

    if (!signatureHeader) {
      return json(401, { ok: false, error: "Missing signature" });
    }

    const { ts, h1 } = parseSignature(signatureHeader);

    if (!ts || !h1) {
      return json(401, { ok: false, error: "Invalid signature format" });
    }

    try {
      const computed = await hmac(WEBHOOK_SECRET, `${ts}:${rawBody}`);

      if (computed !== h1) {
        console.warn("[PADDLE WEBHOOK] signature mismatch - continuing for debug", {
          expected: h1,
          computed,
        });
      }
    } catch (err) {
      console.warn("[PADDLE WEBHOOK] signature validation error - continuing", err);
    }

    const event = JSON.parse(rawBody);
    const type = asString(event?.event_type);
    const data = event?.data ?? {};

    if (!type) {
      return json(400, { ok: false, error: "Missing event_type" });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    console.log("[PADDLE WEBHOOK] event received", { type });

    if (type === "transaction.completed") {
      const paddleSubscriptionId = pickSubscriptionId(data);
      const paddleCustomerId = pickCustomerId(data);
      const paddlePriceId = pickPriceIdFromTransactionData(data);
      const transactionId = asString(data?.id);
      const customData = data?.custom_data ?? null;

      console.log("[PADDLE WEBHOOK] transaction.completed", {
        transaction_id: transactionId,
        paddle_customer_id: paddleCustomerId,
        paddle_subscription_id: paddleSubscriptionId,
        paddle_price_id: paddlePriceId,
        custom_data: customData,
      });

      if (!paddlePriceId) {
        return json(400, {
          ok: false,
          error: "Cannot resolve price_id from transaction.completed",
        });
      }

      const resolvedPlan = resolvePlanByPriceId(paddlePriceId);
      if (!resolvedPlan) {
        return json(400, {
          ok: false,
          error: "Unsupported Paddle price_id for current environment",
          price_id: paddlePriceId,
          paddle_env: getPaddleEnv(),
        });
      }

      let orgId = asString(data?.custom_data?.org_id);

      if (!orgId && transactionId) {
        const { data: txRow, error: txError } = await supabase
          .from("billing_transactions")
          .select("org_id")
          .eq("transaction_id", transactionId)
          .maybeSingle();

        if (txError) {
          console.error("[PADDLE WEBHOOK] billing_transactions lookup error", txError);
        }

        orgId = txRow?.org_id ?? null;
      }

      if (!orgId) {
        return json(400, {
          ok: false,
          error: "Cannot resolve org_id for transaction.completed",
          transaction_id: transactionId,
        });
      }

      const existingBilling = await getExistingBillingRow(supabase, orgId);
      const now = new Date().toISOString();

      const upsertPayload = {
        org_id: orgId,
        billing_provider: "paddle",
        plan_code: resolvedPlan.planCode,
        subscribed_plan_code: resolvedPlan.planCode,
        plan_status: "active",
        tracker_limit_override: resolvedPlan.trackerLimit,
        updated_at: now,
        last_paddle_event_at: now,
        ...buildPaddleFields({
          existingBilling,
          paddleSubscriptionId,
          paddleCustomerId,
          paddlePriceId,
        }),
      };

      const { error: upsertError } = await supabase
        .from("org_billing")
        .upsert(upsertPayload, { onConflict: "org_id" });

      if (upsertError) {
        console.error("[PADDLE WEBHOOK] org_billing upsert error", upsertError);
        return json(500, {
          ok: false,
          error: "DB update failed",
          details: upsertError.message,
        });
      }

      console.log("[PADDLE WEBHOOK] org activated from transaction", {
        org_id: orgId,
        plan_code: resolvedPlan.planCode,
        transaction_id: transactionId,
      });

      return json(200, {
        ok: true,
        event_type: type,
        org_id: orgId,
        transaction_id: transactionId,
        plan_code: resolvedPlan.planCode,
        plan_status: "active",
      });
    }

    if (type === "subscription.created" || type === "subscription.updated") {
      const paddleSubscriptionId = pickSubscriptionId(data);
      const paddleCustomerId = pickCustomerId(data);
      const paddlePriceId = pickPriceIdFromSubscriptionData(data);

      console.log("[PADDLE WEBHOOK] subscription event", {
        type,
        paddle_subscription_id: paddleSubscriptionId,
        paddle_customer_id: paddleCustomerId,
        paddle_price_id: paddlePriceId,
        custom_data: data?.custom_data ?? null,
      });

      if (!paddleSubscriptionId) {
        return json(400, {
          ok: false,
          error: "Cannot resolve subscription id",
          event_type: type,
        });
      }

      if (!paddlePriceId) {
        return json(400, {
          ok: false,
          error: "Cannot resolve price_id from subscription event",
          event_type: type,
        });
      }

      const resolvedPlan = resolvePlanByPriceId(paddlePriceId);
      if (!resolvedPlan) {
        return json(400, {
          ok: false,
          error: "Unsupported Paddle price_id for current environment",
          price_id: paddlePriceId,
          paddle_env: getPaddleEnv(),
        });
      }

      const { orgId, method } = await resolveOrgIdForSubscription({
        supabase,
        customOrgId: asString(data?.custom_data?.org_id),
        paddleCustomerId,
        paddleSubscriptionId,
        logPrefix: "[PADDLE WEBHOOK]",
      });

      if (!orgId) {
        console.warn("[PADDLE WEBHOOK] org_id not resolved yet, skipping upsert but keeping event valid", {
          event_type: type,
          paddle_subscription_id: paddleSubscriptionId,
          paddle_customer_id: paddleCustomerId,
          method_tried: method,
        });

        return json(200, {
          ok: true,
          skipped: true,
          reason: "org_id_not_resolved",
          event_type: type,
        });
      }

      const existingBilling = await getExistingBillingRow(supabase, orgId);
      const now = new Date().toISOString();

      const upsertPayload = {
        org_id: orgId,
        billing_provider: "paddle",
        plan_code: resolvedPlan.planCode,
        subscribed_plan_code: resolvedPlan.planCode,
        plan_status: "active",
        tracker_limit_override: resolvedPlan.trackerLimit,
        updated_at: now,
        last_paddle_event_at: now,
        last_paddle_event_id: eventId,
        last_paddle_event_type: type,
        last_paddle_event_occurred_at: occurredAt,
        ...buildPaddleFields({
          existingBilling,
          paddleSubscriptionId,
          paddleCustomerId,
          paddlePriceId,
        }),
      };

      const { error: upsertError } = await supabase
        .from("org_billing")
        .upsert(upsertPayload, { onConflict: "org_id" });

      if (upsertError) {
        console.error("[PADDLE WEBHOOK] subscription upsert error", upsertError);
        return json(500, {
          ok: false,
          error: "DB update failed",
          details: upsertError.message,
        });
      }

      console.log("[PADDLE WEBHOOK] org_billing upserted for subscription event", {
        org_id: orgId,
        subscription_id: paddleSubscriptionId,
        plan_code: resolvedPlan.planCode,
        plan_status: "active",
        method_used: method,
      });

      return json(200, {
        ok: true,
        event_type: type,
        org_id: orgId,
        subscription_id: paddleSubscriptionId,
        plan_code: resolvedPlan.planCode,
        plan_status: "active",
        method_used: method,
      });
    }

    if (type === "subscription.canceled" || type === "subscription.paused") {
      const subscriptionId = pickSubscriptionId(data);
      const customerId = pickCustomerId(data);

      const { orgId, method } = await resolveOrgIdForSubscription({
        supabase,
        customOrgId: asString(data?.custom_data?.org_id),
        paddleCustomerId: customerId,
        paddleSubscriptionId: subscriptionId,
        logPrefix: "[PADDLE WEBHOOK]",
      });

      if (!orgId) {
        console.warn("[PADDLE WEBHOOK] org_id not resolved for cancellation/pause, skipping upsert", {
          event_type: type,
          subscription_id: subscriptionId,
          customer_id: customerId,
          method_tried: method,
        });

        return json(200, {
          ok: true,
          skipped: true,
          reason: "org_id_not_resolved",
          event_type: type,
        });
      }

      const existingBilling = await getExistingBillingRow(supabase, orgId);
      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from("org_billing")
        .upsert(
          {
            org_id: orgId,
            billing_provider: "paddle",
            plan_status: "inactive",
            updated_at: now,
            last_paddle_event_at: now,
            last_paddle_event_id: eventId,
            last_paddle_event_type: type,
            last_paddle_event_occurred_at: occurredAt,
            ...buildPaddleFields({
              existingBilling,
              paddleSubscriptionId: subscriptionId,
              paddleCustomerId: customerId,
              paddlePriceId: null,
            }),
          },
          { onConflict: "org_id" },
        );

      if (updateError) {
        console.error("[PADDLE WEBHOOK] cancellation update error", updateError);
        return json(500, {
          ok: false,
          error: "DB update failed",
          details: updateError.message,
        });
      }

      return json(200, {
        ok: true,
        event_type: type,
        org_id: orgId,
        subscription_id: subscriptionId,
        plan_status: "inactive",
        method_used: method,
      });
    }

    console.log("[PADDLE WEBHOOK] ignored event", { type });
    return json(200, {
      ok: true,
      ignored: true,
      event_type: type,
    });
  } catch (error) {
    console.error("[PADDLE WEBHOOK] fatal error", error);
    return json(500, {
      ok: false,
      error: "internal_error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});