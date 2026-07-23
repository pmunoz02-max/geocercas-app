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

async function markPaddleWebhookEventApplied(supabase: any, eventId: string) {
  const { error } = await supabase.rpc("mark_paddle_webhook_event_applied", {
    p_event_id: eventId,
  });

  if (error) {
    throw new Error(`mark_paddle_webhook_event_applied failed: ${error.message}`);
  }
}

async function markPaddleWebhookEventFailed(
  supabase: any,
  eventId: string,
  sanitizedMessage: string,
) {
  const { error } = await supabase.rpc("mark_paddle_webhook_event_failed", {
    p_event_id: eventId,
    p_last_error: sanitizedMessage,
  });

  if (error) {
    throw new Error(`mark_paddle_webhook_event_failed failed: ${error.message}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  let claimedEventId: string | null = null;
  let claimedSupabase: any = null;

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
        console.warn("[PADDLE WEBHOOK] signature mismatch");
        return json(401, { ok: false, error: "Invalid signature" });
      }
    } catch (err) {
      console.warn("[PADDLE WEBHOOK] signature validation error", err);
      return json(401, { ok: false, error: "Signature validation failed" });
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

    // --- Idempotency: event_id and occurred_at ---
    const eventId = asString(event?.event_id);
    const occurredAt = asString(event?.occurred_at);
    if (!eventId || !occurredAt) {
      return json(400, { ok: false, error: "Missing event_id or occurred_at" });
    }

    const occurredAtDate = new Date(occurredAt);
    if (Number.isNaN(occurredAtDate.getTime())) {
      return json(400, { ok: false, error: "Invalid occurred_at timestamp" });
    }
    const occurredAtIso = occurredAtDate.toISOString();

    const { data: claimData, error: claimError } = await supabase.rpc(
      "claim_paddle_webhook_event",
      {
        p_event_id: eventId,
        p_event_type: type,
        p_occurred_at: occurredAtIso,
        p_received_at: new Date().toISOString(),
      },
    );

    if (claimError) {
      console.error("[PADDLE WEBHOOK] event claim error", claimError);
      return json(500, { ok: false, error: "Event claim failed" });
    }

    const claimRow = Array.isArray(claimData) ? claimData[0] : claimData;
    const wasClaimed = claimRow?.claimed === true;
    const previousStatus = asString(claimRow?.previous_status);

    if (!wasClaimed) {
      console.log("[PADDLE WEBHOOK] event not claimed", {
        event_id: eventId,
        previous_status: previousStatus,
      });
      return json(200, {
        ok: true,
        claimed: false,
        not_claimed: true,
        duplicate: previousStatus === "applied",
        event_id: eventId,
        previous_status: previousStatus,
      });
    }

    const eventClaimed = true;
    claimedEventId = eventId;
    claimedSupabase = supabase;

    console.log("[PADDLE WEBHOOK] event claimed", { type, eventClaimed, event_id: eventId });

    if (type === "transaction.completed") {
      const paddleSubscriptionId = pickSubscriptionId(data);
      const paddleCustomerId = pickCustomerId(data);
      const paddlePriceId = pickPriceIdFromTransactionData(data);
      const transactionId = asString(data?.id);

      console.log("[PADDLE WEBHOOK] transaction.completed", {
        transaction_id: transactionId,
        paddle_customer_id: paddleCustomerId,
        paddle_subscription_id: paddleSubscriptionId,
        paddle_price_id: paddlePriceId,
        custom_data_present: data?.custom_data != null,
      });

      if (!paddlePriceId) {
        const failureMessage = "Cannot resolve price_id from transaction.completed";
        try {
          await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markFailedError) {
          console.error("[PADDLE WEBHOOK] failed to mark event as failed", {
            event_id: eventId,
            original_failure: failureMessage,
            mark_failed_error: markFailedError,
          });
          return json(500, {
            ok: false,
            error: "Event processing failed",
          });
        }

        return json(400, {
          ok: false,
          error: "Cannot resolve price_id from transaction.completed",
        });
      }

      const resolvedPlan = resolvePlanByPriceId(paddlePriceId);
      if (!resolvedPlan) {
        const failureMessage = "Unsupported Paddle price_id for current environment";
        try {
          await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markFailedError) {
          console.error("[PADDLE WEBHOOK] failed to mark event as failed", {
            event_id: eventId,
            original_failure: failureMessage,
            mark_failed_error: markFailedError,
          });
          return json(500, {
            ok: false,
            error: "Event processing failed",
          });
        }

        return json(400, {
          ok: false,
          error: "Unsupported Paddle price_id for current environment",
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
        const failureMessage = "Cannot resolve org_id for transaction.completed";
        try {
          await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markFailedError) {
          console.error("[PADDLE WEBHOOK] failed to mark event as failed", {
            event_id: eventId,
            original_failure: failureMessage,
            mark_failed_error: markFailedError,
          });
          return json(500, {
            ok: false,
            error: "Event processing failed",
          });
        }

        return json(400, {
          ok: false,
          error: "Cannot resolve org_id for transaction.completed",
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
        const failureMessage = `DB update failed: ${upsertError.message}`;
        try {
          await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markFailedError) {
          console.error("[PADDLE WEBHOOK] failed to mark event as failed", {
            event_id: eventId,
            original_failure: failureMessage,
            mark_failed_error: markFailedError,
          });
          return json(500, {
            ok: false,
            error: "Event processing failed",
          });
        }

        return json(500, {
          ok: false,
          error: "Event processing failed",
        });
      }

      console.log("[PADDLE WEBHOOK] org activated from transaction", {
        org_id: orgId,
        plan_code: resolvedPlan.planCode,
        transaction_id: transactionId,
      });

      try {
        await markPaddleWebhookEventApplied(supabase, eventId);
        claimedEventId = null;
        claimedSupabase = null;
      } catch (markAppliedError) {
        const failureMessage = "Failed to mark event as applied";
        console.error("[PADDLE WEBHOOK] failed to mark event as applied", {
          event_id: eventId,
          mark_applied_error: markAppliedError,
        });

        try {
          await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markFailedError) {
          console.error("[PADDLE WEBHOOK] failed to mark event as failed after mark applied error", {
            event_id: eventId,
            original_failure: failureMessage,
            mark_failed_error: markFailedError,
          });
        }

        return json(500, {
          ok: false,
          error: "Event processing failed",
        });
      }

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
        custom_data_present: data?.custom_data != null,
      });

      if (!paddleSubscriptionId) {
        const failureMessage = "Cannot resolve subscription id";
        try {
          await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markFailedError) {
          console.error("[PADDLE WEBHOOK] failed to mark event as failed", {
            event_id: eventId,
            original_failure: failureMessage,
            mark_failed_error: markFailedError,
          });
          return json(500, {
            ok: false,
            error: "Event processing failed",
          });
        }

        return json(400, {
          ok: false,
          error: "Cannot resolve subscription id",
        });
      }

      if (!paddlePriceId) {
        const failureMessage = "Cannot resolve price_id from subscription event";
        try {
          await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markFailedError) {
          console.error("[PADDLE WEBHOOK] failed to mark event as failed", {
            event_id: eventId,
            original_failure: failureMessage,
            mark_failed_error: markFailedError,
          });
          return json(500, {
            ok: false,
            error: "Event processing failed",
          });
        }

        return json(400, {
          ok: false,
          error: "Cannot resolve price_id from subscription event",
        });
      }

      const resolvedPlan = resolvePlanByPriceId(paddlePriceId);
      if (!resolvedPlan) {
        const failureMessage = "Unsupported Paddle price_id for current environment";
        try {
          await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markFailedError) {
          console.error("[PADDLE WEBHOOK] failed to mark event as failed", {
            event_id: eventId,
            original_failure: failureMessage,
            mark_failed_error: markFailedError,
          });
          return json(500, {
            ok: false,
            error: "Event processing failed",
          });
        }

        return json(400, {
          ok: false,
          error: "Unsupported Paddle price_id for current environment",
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
        const failureMessage = "Cannot resolve org_id for subscription event";
        console.warn("[PADDLE WEBHOOK] org_id not resolved for subscription event", {
          event_type: type,
          paddle_subscription_id: paddleSubscriptionId,
          paddle_customer_id: paddleCustomerId,
          method_tried: method,
        });

        try {
          await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markFailedError) {
          console.error("[PADDLE WEBHOOK] failed to mark event as failed", {
            event_id: eventId,
            original_failure: failureMessage,
            mark_failed_error: markFailedError,
          });
          return json(500, {
            ok: false,
            error: "Event processing failed",
          });
        }

        return json(400, {
          ok: false,
          error: "Cannot resolve org_id for subscription event",
        });
      }

      const existingBilling = await getExistingBillingRow(supabase, orgId);
      const now = new Date().toISOString();

      // Only update if this event is newer than last_paddle_event_at
      const { data: currentBilling } = await supabase
        .from("org_billing")
        .select("last_paddle_event_at")
        .eq("org_id", orgId)
        .maybeSingle();

      if (currentBilling?.last_paddle_event_at && new Date(currentBilling.last_paddle_event_at) >= new Date(occurredAtIso)) {
        console.log("[PADDLE WEBHOOK] Ignoring out-of-order subscription.updated", { org_id: orgId, eventId });
        try {
          await markPaddleWebhookEventApplied(supabase, eventId);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markAppliedError) {
          const failureMessage = "Failed to mark out-of-order subscription event as applied";
          console.error("[PADDLE WEBHOOK] failed to mark event as applied", {
            event_id: eventId,
            mark_applied_error: markAppliedError,
          });

          try {
            await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
            claimedEventId = null;
            claimedSupabase = null;
          } catch (markFailedError) {
            console.error("[PADDLE WEBHOOK] failed to mark event as failed after mark applied error", {
              event_id: eventId,
              original_failure: failureMessage,
              mark_failed_error: markFailedError,
            });
          }

          return json(500, {
            ok: false,
            error: "Event processing failed",
          });
        }

        return json(200, { ok: true, ignored: true, reason: "event_out_of_order" });
      }

      // Scheduled change fields
      const scheduledChange = data?.scheduled_change;
      const hasScheduled = !!scheduledChange;
      const scheduled_change_action = hasScheduled ? asString(scheduledChange?.action) : null;
      const scheduled_change_effective_at = hasScheduled ? asString(scheduledChange?.effective_at) : null;

      const upsertPayload = {
        org_id: orgId,
        billing_provider: "paddle",
        plan_code: resolvedPlan.planCode,
        subscribed_plan_code: resolvedPlan.planCode,
        plan_status: "active",
        tracker_limit_override: resolvedPlan.trackerLimit,
        updated_at: now,
        last_paddle_event_at: occurredAtIso,
        last_paddle_event_id: eventId,
        last_paddle_event_type: type,
        last_paddle_event_occurred_at: occurredAtIso,
        cancel_at_period_end: hasScheduled ? true : false,
        scheduled_change_action,
        scheduled_change_effective_at,
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
        const failureMessage = `DB update failed: ${upsertError.message}`;
        try {
          await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markFailedError) {
          console.error("[PADDLE WEBHOOK] failed to mark event as failed", {
            event_id: eventId,
            original_failure: failureMessage,
            mark_failed_error: markFailedError,
          });
          return json(500, {
            ok: false,
            error: "Event processing failed",
          });
        }

        return json(500, {
          ok: false,
          error: "Event processing failed",
        });
      }

      console.log("[PADDLE WEBHOOK] org_billing upserted for subscription event", {
        org_id: orgId,
        subscription_id: paddleSubscriptionId,
        plan_code: resolvedPlan.planCode,
        plan_status: "active",
        method_used: method,
      });

      try {
        await markPaddleWebhookEventApplied(supabase, eventId);
        claimedEventId = null;
        claimedSupabase = null;
      } catch (markAppliedError) {
        const failureMessage = "Failed to mark subscription event as applied";
        console.error("[PADDLE WEBHOOK] failed to mark event as applied", {
          event_id: eventId,
          mark_applied_error: markAppliedError,
        });

        try {
          await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markFailedError) {
          console.error("[PADDLE WEBHOOK] failed to mark event as failed after mark applied error", {
            event_id: eventId,
            original_failure: failureMessage,
            mark_failed_error: markFailedError,
          });
        }

        return json(500, {
          ok: false,
          error: "Event processing failed",
        });
      }

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

      console.log("[PADDLE WEBHOOK] cancellation/pause event", {
        type,
        subscription_id: subscriptionId,
        customer_id: customerId,
        custom_data_present: data?.custom_data != null,
      });

      const { orgId, method } = await resolveOrgIdForSubscription({
        supabase,
        customOrgId: asString(data?.custom_data?.org_id),
        paddleCustomerId: customerId,
        paddleSubscriptionId: subscriptionId,
        logPrefix: "[PADDLE WEBHOOK]",
      });

      if (!orgId) {
        const failureMessage = "Cannot resolve org_id for cancellation/pause event";
        console.warn("[PADDLE WEBHOOK] org_id not resolved for cancellation/pause", {
          event_type: type,
          subscription_id: subscriptionId,
          customer_id: customerId,
          method_tried: method,
        });

        try {
          await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markFailedError) {
          console.error("[PADDLE WEBHOOK] failed to mark event as failed", {
            event_id: eventId,
            original_failure: failureMessage,
            mark_failed_error: markFailedError,
          });
          return json(500, {
            ok: false,
            error: "Event processing failed",
          });
        }

        return json(400, {
          ok: false,
          error: "Cannot resolve org_id for cancellation/pause event",
        });
      }

      const existingBilling = await getExistingBillingRow(supabase, orgId);
      const now = new Date().toISOString();

      // Only update if this event is newer than last_paddle_event_at
      const { data: currentBilling } = await supabase
        .from("org_billing")
        .select("last_paddle_event_at")
        .eq("org_id", orgId)
        .maybeSingle();

      if (currentBilling?.last_paddle_event_at && new Date(currentBilling.last_paddle_event_at) >= new Date(occurredAtIso)) {
        console.log("[PADDLE WEBHOOK] Ignoring out-of-order subscription.canceled", { org_id: orgId, eventId });
        try {
          await markPaddleWebhookEventApplied(supabase, eventId);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markAppliedError) {
          const failureMessage = "Failed to mark out-of-order cancellation/pause event as applied";
          console.error("[PADDLE WEBHOOK] failed to mark event as applied", {
            event_id: eventId,
            mark_applied_error: markAppliedError,
          });

          try {
            await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
            claimedEventId = null;
            claimedSupabase = null;
          } catch (markFailedError) {
            console.error("[PADDLE WEBHOOK] failed to mark event as failed after mark applied error", {
              event_id: eventId,
              original_failure: failureMessage,
              mark_failed_error: markFailedError,
            });
          }

          return json(500, {
            ok: false,
            error: "Event processing failed",
          });
        }

        return json(200, { ok: true, ignored: true, reason: "event_out_of_order" });
      }

      // Only for canceled, not paused
      const isCanceled = type === "subscription.canceled";
      const upsertPayload = {
        org_id: orgId,
        billing_provider: "paddle",
        plan_status: isCanceled ? "canceled" : "inactive",
        cancel_at_period_end: false,
        canceled_at: isCanceled ? now : null,
        scheduled_change_action: null,
        scheduled_change_effective_at: null,
        updated_at: now,
        last_paddle_event_at: occurredAtIso,
        last_paddle_event_id: eventId,
        last_paddle_event_type: type,
        last_paddle_event_occurred_at: occurredAtIso,
        ...buildPaddleFields({
          existingBilling,
          paddleSubscriptionId: subscriptionId,
          paddleCustomerId: customerId,
          paddlePriceId: null,
        }),
      };

      const { error: updateError } = await supabase
        .from("org_billing")
        .upsert(upsertPayload, { onConflict: "org_id" });

      if (updateError) {
        console.error("[PADDLE WEBHOOK] cancellation update error", updateError);
        const failureMessage = `DB update failed: ${updateError.message}`;
        try {
          await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markFailedError) {
          console.error("[PADDLE WEBHOOK] failed to mark event as failed", {
            event_id: eventId,
            original_failure: failureMessage,
            mark_failed_error: markFailedError,
          });
          return json(500, {
            ok: false,
            error: "Event processing failed",
          });
        }

        return json(500, {
          ok: false,
          error: "Event processing failed",
        });
      }

      try {
        await markPaddleWebhookEventApplied(supabase, eventId);
        claimedEventId = null;
        claimedSupabase = null;
      } catch (markAppliedError) {
        const failureMessage = "Failed to mark cancellation/pause event as applied";
        console.error("[PADDLE WEBHOOK] failed to mark event as applied", {
          event_id: eventId,
          mark_applied_error: markAppliedError,
        });

        try {
          await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
          claimedEventId = null;
          claimedSupabase = null;
        } catch (markFailedError) {
          console.error("[PADDLE WEBHOOK] failed to mark event as failed after mark applied error", {
            event_id: eventId,
            original_failure: failureMessage,
            mark_failed_error: markFailedError,
          });
        }

        return json(500, {
          ok: false,
          error: "Event processing failed",
        });
      }

      return json(200, {
        ok: true,
        event_type: type,
        org_id: orgId,
        subscription_id: subscriptionId,
        plan_status: isCanceled ? "canceled" : "inactive",
        method_used: method,
      });
    }

    console.log("[PADDLE WEBHOOK] ignored event", { type });

    try {
      await markPaddleWebhookEventApplied(supabase, eventId);
      claimedEventId = null;
      claimedSupabase = null;
    } catch (markAppliedError) {
      const failureMessage = "Failed to mark unknown event as applied";
      console.error("[PADDLE WEBHOOK] failed to mark event as applied", {
        event_id: eventId,
        mark_applied_error: markAppliedError,
      });

      try {
        await markPaddleWebhookEventFailed(supabase, eventId, failureMessage);
        claimedEventId = null;
        claimedSupabase = null;
      } catch (markFailedError) {
        console.error("[PADDLE WEBHOOK] failed to mark event as failed after mark applied error", {
          event_id: eventId,
          original_failure: failureMessage,
          mark_failed_error: markFailedError,
        });
      }

      return json(500, {
        ok: false,
        error: "Event processing failed",
      });
    }

    return json(200, {
      ok: true,
      ignored: true,
      event_type: type,
    });
  } catch (error) {
    console.error("[PADDLE WEBHOOK] fatal error", error);

    if (claimedEventId && claimedSupabase) {
      const failureMessage = "Unhandled webhook processing error";
      try {
        await markPaddleWebhookEventFailed(claimedSupabase, claimedEventId, failureMessage);
        claimedEventId = null;
        claimedSupabase = null;
      } catch (markFailedError) {
        console.error("[PADDLE WEBHOOK] failed to mark event as failed in global catch", {
          event_id: claimedEventId,
          original_failure: failureMessage,
          mark_failed_error: markFailedError,
        });
      }
    }

    return json(500, {
      ok: false,
      error: "internal_error",
    });
  }
});