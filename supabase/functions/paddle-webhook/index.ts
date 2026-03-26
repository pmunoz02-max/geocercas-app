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

    if (type !== "transaction.completed") {
      return json(200, { ok: true, ignored: true });
    }

    const data = event.data;

    const transactionId = data?.id ?? null;

    console.log("[WEBHOOK] transactionId:", transactionId);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ---------------------------------
    // 🔥 RESOLVER org_id (NUEVO)
    // ---------------------------------

    let orgId: string | null = null;

    // 1. intentar desde custom_data
    if (data?.custom_data?.org_id) {
      orgId = data.custom_data.org_id;
      console.log("[WEBHOOK] orgId from custom_data:", orgId);
    }

    // 2. fallback → DB
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

    // ---------------------------------
    // ACTIVAR PLAN
    // ---------------------------------

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("org_billing")
      .update({
        billing_provider: "paddle",
        plan_code: "pro",
        subscribed_plan_code: "pro",
        plan_status: "active",
        updated_at: now,
        last_paddle_event_at: now,
        paddle_subscription_id: data?.subscription_id ?? null,
        paddle_customer_id: data?.customer_id ?? null,
      })
      .eq("org_id", orgId);

    if (error) {
      return json(500, {
        ok: false,
        error: "DB update failed",
        details: error.message,
      });
    }

    console.log("[WEBHOOK] SUCCESS → org activated:", orgId);

    return json(200, {
      ok: true,
      orgId,
      transactionId,
    });
  } catch (err) {
    return json(500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});