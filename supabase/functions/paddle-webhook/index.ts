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

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickPriceIdFromTransactionData(data: any): string | null {
  if (!data || typeof data !== "object") return null;

  const direct = asString(data?.price_id) ?? asString(data?.price?.id);
  if (direct) return direct;

  const items = Array.isArray(data?.items) ? data.items : [];
  for (const item of items) {
    const candidate = asString(item?.price_id) ?? asString(item?.price?.id);
    if (candidate) return candidate;
  }

  const lineItems = Array.isArray(data?.details?.line_items)
    ? data.details.line_items
    : [];
  for (const item of lineItems) {
    const candidate = asString(item?.price_id) ?? asString(item?.price?.id);
    if (candidate) return candidate;
  }

  return asString(data?.custom_data?.price_id);
}

function pickSubscriptionId(data: any): string | null {
  return asString(data?.id) ?? asString(data?.subscription_id);
}

function pickCurrentPeriodEnd(data: any): string | null {
  return (
    asString(data?.current_period_end) ??
    asString(data?.current_billing_period?.ends_at) ??
    asString(data?.next_billed_at) ??
    asString(data?.scheduled_change?.effective_at)
  );
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function parseSignature(header: string) {
  const normalized = header.replace(/,/g, ";");

  const parts = normalized.split(";").map((p) => p.trim());

  let ts: string | null = null;
  let h1: string | null = null;

  for (const part of parts) {
    const [k, v] = part.split("=");
    if (!k || !v) continue;

    if (k === "ts") ts = v;
    if (k === "h1" && !h1) h1 = v;
  }

  return { ts, h1 };
}

async function hmac(secret: string, payload: string) {
  const enc = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));

  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const SECRET = requireEnv("PADDLE_WEBHOOK_SECRET");

    const rawBody = await req.text();

    const header =
      req.headers.get("paddle-signature") ??
      req.headers.get("Paddle-Signature");

    if (!header) {
      return json(401, { ok: false, error: "Missing signature" });
    }

    const { ts, h1 } = parseSignature(header);

    if (!ts || !h1) {
      return json(401, { ok: false, error: "Invalid signature format" });
    }

    const computed = await hmac(SECRET, `${ts}:${rawBody}`);

    if (computed !== h1) {
      return json(401, { ok: false, error: "Invalid signature" });
    }

    // ---------------------------------
    // EVENT
    // ---------------------------------

    const event = JSON.parse(rawBody);
    const type = event?.event_type;
    const data = event?.data;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    if (type === "transaction.completed") {
      const PADDLE_PRO_PRICE_ID = requireEnv("PADDLE_PRO_PRICE_ID");
      const PADDLE_ENTERPRISE_PRICE_ID = requireEnv("PADDLE_ENTERPRISE_PRICE_ID");

      if (!PADDLE_PRO_PRICE_ID.startsWith("pri_")) {
        return json(500, {
          ok: false,
          error: "Invalid Paddle price id in env",
          env: "PADDLE_PRO_PRICE_ID",
          value: PADDLE_PRO_PRICE_ID,
        });
      }

      if (!PADDLE_ENTERPRISE_PRICE_ID.startsWith("pri_")) {
        return json(500, {
          ok: false,
          error: "Invalid Paddle price id in env",
          env: "PADDLE_ENTERPRISE_PRICE_ID",
          value: PADDLE_ENTERPRISE_PRICE_ID,
        });
      }

      const transactionPriceId = pickPriceIdFromTransactionData(data);

      if (!transactionPriceId) {
        return json(400, {
          ok: false,
          error: "Cannot resolve price_id from transaction event",
        });
      }

      const planByPriceId: Record<string, "pro" | "enterprise"> = {
        [PADDLE_PRO_PRICE_ID]: "pro",
        [PADDLE_ENTERPRISE_PRICE_ID]: "enterprise",
      };

      const trackerLimitByPlan: Record<"pro" | "enterprise", number> = {
        pro: 3,
        enterprise: 10,
      };

      const planCode = planByPriceId[transactionPriceId];
      if (!planCode) {
        return json(400, {
          ok: false,
          error: "Unsupported Paddle price_id for this environment",
          price_id: transactionPriceId,
        });
      }

      const trackerLimit = trackerLimitByPlan[planCode];
      const transactionId = data?.id ?? null;

      console.log("[WEBHOOK] transactionId:", transactionId);

      let orgId: string | null = null;

      if (data?.custom_data?.org_id) {
        orgId = data.custom_data.org_id;
        console.log("[WEBHOOK] orgId from custom_data:", orgId);
      }

      if (!orgId && transactionId) {
        const { data: tx } = await supabase
          .from("billing_transactions")
          .select("org_id")
          .eq("transaction_id", transactionId)
          .maybeSingle();

        orgId = tx?.org_id ?? null;
        console.log("[WEBHOOK] orgId from DB:", orgId);
      }

      if (!orgId) {
        return json(400, {
          ok: false,
          error: "Cannot resolve org_id",
          transactionId,
        });
      }

      const now = new Date().toISOString();

      const { error } = await supabase
        .from("org_billing")
        .upsert({
          org_id: orgId,
          billing_provider: "paddle",
          plan_code: planCode,
          subscribed_plan_code: planCode,
          plan_status: "active",
          tracker_limit_override: trackerLimit,
          updated_at: now,
          last_paddle_event_at: now,
          paddle_price_id: transactionPriceId,
          paddle_subscription_id: data?.subscription_id ?? null,
          paddle_customer_id: data?.customer_id ?? null,
        }, { onConflict: "org_id" });

      if (error) {
        return json(500, {
          ok: false,
          error: "DB update failed",
          details: error.message,
        });
      }

      const { data: entitlementsRow } = await supabase
        .from("org_entitlements")
        .select("org_id, max_trackers")
        .eq("org_id", orgId)
        .maybeSingle();

      console.log("[WEBHOOK] SUCCESS → org activated:", orgId, {
        plan_code: planCode,
        price_id: transactionPriceId,
        tracker_limit_override: trackerLimit,
        effective_max_trackers: entitlementsRow?.max_trackers ?? null,
      });

      return json(200, {
        ok: true,
        orgId,
        transactionId,
        plan_code: planCode,
        price_id: transactionPriceId,
        tracker_limit: trackerLimit,
        max_trackers: entitlementsRow?.max_trackers ?? null,
      });
    }

    if (type === "subscription.updated" || type === "subscription.canceled") {
      const subscriptionId = pickSubscriptionId(data);
      if (!subscriptionId) {
        return json(400, {
          ok: false,
          error: "Cannot resolve subscription id from subscription event",
          event_type: type,
        });
      }

      let orgId = asString(data?.custom_data?.org_id);

      if (!orgId) {
        const { data: row } = await supabase
          .from("org_billing")
          .select("org_id")
          .eq("billing_provider", "paddle")
          .eq("paddle_subscription_id", subscriptionId)
          .maybeSingle();

        orgId = row?.org_id ?? null;
      }

      if (!orgId) {
        return json(400, {
          ok: false,
          error: "Cannot resolve org_id from subscription event",
          event_type: type,
          subscription_id: subscriptionId,
        });
      }

      const now = new Date().toISOString();
      const planStatus = type === "subscription.canceled" ? "canceled" : "active";
      const currentPeriodEnd = pickCurrentPeriodEnd(data);
      const canceledAt =
        asString(data?.canceled_at) ??
        asString(data?.scheduled_change?.effective_at) ??
        (type === "subscription.canceled" ? asString(event?.occurred_at) ?? now : null);

      const { data: updatedRow, error } = await supabase
        .from("org_billing")
        .update({
          plan_status: planStatus,
          cancel_at_period_end: true,
          current_period_end: currentPeriodEnd,
          canceled_at: canceledAt,
          updated_at: now,
          last_paddle_event_at: now,
        })
        .eq("org_id", orgId)
        .eq("billing_provider", "paddle")
        .select("org_id")
        .maybeSingle();

      if (error) {
        return json(500, {
          ok: false,
          error: "DB update failed",
          details: error.message,
          event_type: type,
        });
      }

      if (!updatedRow) {
        return json(404, {
          ok: false,
          error: "Paddle billing row not found",
          org_id: orgId,
          subscription_id: subscriptionId,
        });
      }

      console.log("[WEBHOOK] subscription state updated", {
        org_id: orgId,
        event_type: type,
        plan_status: planStatus,
        cancel_at_period_end: true,
        current_period_end: currentPeriodEnd,
        canceled_at: canceledAt,
      });

      return json(200, {
        ok: true,
        org_id: orgId,
        subscription_id: subscriptionId,
        event_type: type,
        plan_status: planStatus,
        cancel_at_period_end: true,
        current_period_end: currentPeriodEnd,
        canceled_at: canceledAt,
      });
    }

    return json(200, { ok: true, ignored: true });
  } catch (err) {
    return json(500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});