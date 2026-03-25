
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, paddle-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function verifyPaddleSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  // Paddle v2: HMAC-SHA256, signature is base64
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64ToBytes(signature),
    enc.encode(rawBody)
  );
  return valid;
}

function base64ToBytes(b64: string): Uint8Array {
  // atob is not available in Deno Deploy, use Buffer
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
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
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const PADDLE_WEBHOOK_SECRET = requireEnv("PADDLE_WEBHOOK_SECRET");


    // 1. Leer raw body
    const rawBody = await req.text();
    // 2. Leer header
    const signatureHeader = req.headers.get("Paddle-Signature");
    console.log("[WEBHOOK] signature header exists:", !!signatureHeader);
    if (!signatureHeader) {
      return json(401, { ok: false, error: "Missing Paddle-Signature header" });
    }

    // 3. Parsear header Paddle-Signature para extraer ts y h1
    let ts = null;
    let h1 = null;
    try {
      const parts = signatureHeader.split(",").map((s) => s.trim());
      for (const part of parts) {
        if (part.startsWith("ts:")) ts = part.slice(3);
        if (part.startsWith("v1:")) h1 = part.slice(3);
      }
    } catch {}
    console.log("[WEBHOOK] ts:", ts);
    console.log("[WEBHOOK] has h1:", !!h1);
    if (!ts || !h1) {
      return json(401, { ok: false, error: "Invalid Paddle-Signature format" });
    }

    // 4. Construir signed payload EXACTO
    const signedPayload = `${ts}:${rawBody}`;

    // 5. Calcular HMAC SHA-256 usando Web Crypto API
    let computedSig = "";
    try {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(PADDLE_WEBHOOK_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sigBuf = await crypto.subtle.sign(
        "HMAC",
        key,
        enc.encode(signedPayload)
      );
      computedSig = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    } catch (err) {
      console.log("[WEBHOOK] signature valid:", false);
      return json(401, { ok: false, error: "Invalid signature (exception)" });
    }
    console.log("[WEBHOOK] computed signature prefix:", computedSig.slice(0, 12));

    // 7. Comparar el digest calculado contra h1
    const validSig = computedSig === h1;
    console.log("[WEBHOOK] signature valid:", validSig);
    if (!validSig) {
      return json(401, { ok: false, error: "Invalid signature" });
    }

    const event = JSON.parse(rawBody);
    const eventType = event?.event_type ?? event?.eventType ?? null;

    if (eventType !== "transaction.completed") {
      return json(200, { ok: true, ignored: true, eventType });
    }

    const data = event?.data ?? {};
    const orgId = data?.custom_data?.org_id ?? null;
    const transactionId = data?.id ?? null;
    const customerId = data?.customer_id ?? null;
    const subscriptionId = data?.subscription_id ?? null;
    const priceId =
      data?.items?.[0]?.price?.id ??
      data?.items?.[0]?.price_id ??
      null;

    if (!orgId) {
      return json(400, {
        ok: false,
        error: "Missing custom_data.org_id in transaction.completed",
        transactionId,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const updatePayload: Record<string, unknown> = {
      billing_provider: "paddle",
      plan_code: "pro",
      subscribed_plan_code: "pro",
      plan_status: "active",
      cancel_at_period_end: false,
      canceled_at: null,
      trial_ends_at: null,
      updated_at: new Date().toISOString(),
      last_paddle_event_at: new Date().toISOString(),
    };

    if (customerId) updatePayload.paddle_customer_id = customerId;
    if (subscriptionId) updatePayload.paddle_subscription_id = subscriptionId;
    if (priceId) updatePayload.paddle_price_id = priceId;

    const { error } = await supabase
      .from("org_billing")
      .update(updatePayload)
      .eq("org_id", orgId);

    if (error) {
      return json(500, {
        ok: false,
        error: "Failed to update org_billing",
        details: error.message,
        orgId,
        transactionId,
      });
    }

    return json(200, {
      ok: true,
      eventType,
      orgId,
      transactionId,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
