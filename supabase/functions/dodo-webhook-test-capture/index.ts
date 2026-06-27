// TEMPORARY TEST-ONLY Dodo webhook payload capture.
// Environment: Preview only.
// Purpose: discover Dodo TEST event names/payload shape safely before DB writes.
// This function intentionally does NOT update org_billing and does NOT persist payloads.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, dodo-signature, webhook-signature, svix-id, svix-timestamp, svix-signature",
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
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function truncate(value: string | null, max = 96): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function safeHeaderPresence(headers: Headers) {
  const interesting = [
    "dodo-signature",
    "webhook-signature",
    "x-signature",
    "x-dodo-signature",
    "svix-id",
    "svix-timestamp",
    "svix-signature",
    "user-agent",
    "content-type",
  ];

  const result: Record<string, boolean | string> = {};
  for (const name of interesting) {
    const value = headers.get(name);
    if (!value) continue;
    result[name] = name === "user-agent" || name === "content-type" ? truncate(value) ?? true : true;
  }
  return result;
}

function pickFirstString(obj: any, paths: string[][]): string | null {
  for (const path of paths) {
    let current = obj;
    for (const key of path) {
      if (current === null || current === undefined) break;
      current = current[key];
    }
    const value = asString(current);
    if (value) return value;
  }
  return null;
}

function objectKeys(value: unknown, limit = 40): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).slice(0, limit);
}

function summarizePayload(payload: any) {
  const data = payload?.data ?? payload?.payload ?? payload?.object ?? payload;

  return {
    top_level_keys: objectKeys(payload),
    data_keys: objectKeys(data),
    event_id: pickFirstString(payload, [
      ["event_id"],
      ["id"],
      ["event", "id"],
      ["data", "event_id"],
      ["data", "id"],
    ]),
    event_type: pickFirstString(payload, [
      ["event_type"],
      ["type"],
      ["event", "type"],
      ["data", "event_type"],
      ["data", "type"],
    ]),
    product_id: pickFirstString(payload, [
      ["product_id"],
      ["data", "product_id"],
      ["data", "product", "id"],
      ["data", "items", "0", "product_id"],
      ["data", "items", "0", "product", "id"],
      ["data", "line_items", "0", "product_id"],
      ["data", "line_items", "0", "product", "id"],
    ]),
    price_id: pickFirstString(payload, [
      ["price_id"],
      ["data", "price_id"],
      ["data", "price", "id"],
      ["data", "items", "0", "price_id"],
      ["data", "items", "0", "price", "id"],
      ["data", "line_items", "0", "price_id"],
      ["data", "line_items", "0", "price", "id"],
    ]),
    customer_id: pickFirstString(payload, [
      ["customer_id"],
      ["data", "customer_id"],
      ["data", "customer", "id"],
    ]),
    subscription_id: pickFirstString(payload, [
      ["subscription_id"],
      ["data", "subscription_id"],
      ["data", "subscription", "id"],
    ]),
    payment_id: pickFirstString(payload, [
      ["payment_id"],
      ["data", "payment_id"],
      ["data", "payment", "id"],
      ["data", "transaction_id"],
      ["data", "transaction", "id"],
    ]),
    metadata_keys: objectKeys(
      payload?.metadata ??
        payload?.custom_data ??
        payload?.data?.metadata ??
        payload?.data?.custom_data,
    ),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const rawBody = await req.text();
  let parsed: any = null;
  let parseError: string | null = null;

  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  const summary = {
    capture: "dodo-webhook-test-capture",
    environment: "preview-test-only",
    received_at: new Date().toISOString(),
    body_bytes: rawBody.length,
    parse_error: parseError,
    headers_present: safeHeaderPresence(req.headers),
    payload_summary: parsed ? summarizePayload(parsed) : null,
  };

  console.log("[DODO WEBHOOK TEST CAPTURE]", JSON.stringify(summary));

  return json(200, {
    ok: true,
    captured: true,
    mode: "preview-test-only",
    db_writes: false,
  });
});
