// TEMPORARY TEST-ONLY Dodo webhook payload capture.
// Environment: Preview only.
// Purpose: discover Dodo TEST event names/payload shape safely before final webhook.
// This function does NOT activate plans and does NOT update org_billing.
// It stores only a minimal sanitized summary in public.audit_log using service_role.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, dodo-signature, webhook-signature, svix-id, svix-timestamp, svix-signature, x-capture-read-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

const SENSITIVE_KEYS = new Set([
  "card_holder_name",
  "card_issuing_country",
  "card_last_four",
  "card_network",
  "card_type",
  "invoice_url",
  "payment_link",
  "billing",
  "address",
  "email",
  "customer_email",
  "phone",
  "name",
]);

function json(status: number, body: Record<string, unknown> | unknown[]) {
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

function getEnvAny(names: string[]): string | null {
  for (const name of names) {
    const value = asString(Deno.env.get(name));
    if (value) return value;
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSensitiveKeyName(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    SENSITIVE_KEYS.has(normalized) ||
    normalized.includes("card") ||
    normalized.includes("email") ||
    normalized.includes("invoice_url") ||
    normalized.includes("payment_link") ||
    normalized.includes("billing") ||
    normalized.includes("address")
  );
}

function objectKeys(value: unknown, limit = 80): string[] {
  if (!isPlainObject(value)) return [];
  return Object.keys(value)
    .filter((key) => !isSensitiveKeyName(key))
    .slice(0, limit);
}

function sensitiveKeyCount(value: unknown, limit = 200): number {
  if (!isPlainObject(value)) return 0;
  const found = new Set<string>();
  const stack: unknown[] = [value];

  while (stack.length > 0 && found.size < limit) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (const item of current.slice(0, 20)) stack.push(item);
      continue;
    }
    if (!isPlainObject(current)) continue;

    for (const [key, entry] of Object.entries(current)) {
      if (isSensitiveKeyName(key)) {
        found.add(key);
      }
      if (isPlainObject(entry) || Array.isArray(entry)) stack.push(entry);
    }
  }

  return found.size;
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

  const result: Record<string, boolean> = {};
  for (const name of interesting) {
    if (headers.get(name)) result[name] = true;
  }
  return result;
}

function pickFirstString(obj: any, paths: string[][]): string | null {
  for (const path of paths) {
    let current = obj;
    for (const key of path) {
      if (current === null || current === undefined) break;
      if (Array.isArray(current) && /^\d+$/.test(key)) {
        current = current[Number(key)];
      } else {
        current = current[key];
      }
    }
    const value = asString(current);
    if (value) return value;
  }
  return null;
}

function pickFirstNumber(obj: any, paths: string[][]): number | null {
  for (const path of paths) {
    let current = obj;
    for (const key of path) {
      if (current === null || current === undefined) break;
      if (Array.isArray(current) && /^\d+$/.test(key)) {
        current = current[Number(key)];
      } else {
        current = current[key];
      }
    }
    if (typeof current === "number" && Number.isFinite(current)) return current;
    if (typeof current === "string") {
      const parsed = Number(current);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function uniqueStrings(values: unknown[], limit = 20): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = asString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function collectProductIdsFromCart(data: any): string[] {
  const carts = [data?.product_cart, data?.items, data?.line_items].filter(Array.isArray) as any[][];
  const ids: unknown[] = [];

  for (const cart of carts) {
    for (const item of cart.slice(0, 20)) {
      ids.push(item?.product_id, item?.product?.id, item?.id);
    }
  }

  return uniqueStrings(ids);
}

function summarizePayload(payload: any) {
  const data = payload?.data ?? payload?.payload ?? payload?.object ?? payload;
  const productCartIds = collectProductIdsFromCart(data);

  return {
    summary_schema_version: 2,
    top_level_keys: objectKeys(payload),
    data_keys: objectKeys(data),
    sensitive_key_count: sensitiveKeyCount(payload),

    event_type: pickFirstString(payload, [
      ["event_type"],
      ["type"],
      ["event", "type"],
      ["data", "event_type"],
      ["data", "type"],
    ]),
    event_id: pickFirstString(payload, [
      ["event_id"],
      ["id"],
      ["event", "id"],
      ["data", "event_id"],
      ["data", "id"],
    ]),

    business_id: pickFirstString(payload, [["business_id"], ["data", "business_id"], ["data", "brand_id"]]),
    brand_id: pickFirstString(payload, [["brand_id"], ["data", "brand_id"]]),
    payload_type: pickFirstString(payload, [["payload_type"], ["data", "payload_type"]]),
    status: pickFirstString(payload, [["status"], ["data", "status"]]),

    product_id: pickFirstString(payload, [
      ["product_id"],
      ["data", "product_id"],
      ["data", "product", "id"],
      ["data", "items", "0", "product_id"],
      ["data", "items", "0", "product", "id"],
      ["data", "line_items", "0", "product_id"],
      ["data", "line_items", "0", "product", "id"],
    ]) ?? productCartIds[0] ?? null,
    product_cart_product_ids: productCartIds,

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
      ["data", "customer", "customer_id"],
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
    invoice_id: pickFirstString(payload, [["invoice_id"], ["data", "invoice_id"], ["data", "invoice", "id"]]),
    checkout_session_id: pickFirstString(payload, [["checkout_session_id"], ["data", "checkout_session_id"]]),

    currency: pickFirstString(payload, [["currency"], ["data", "currency"]]),
    total_amount: pickFirstNumber(payload, [["total_amount"], ["data", "total_amount"]]),
    recurring_pre_tax_amount: pickFirstNumber(payload, [["recurring_pre_tax_amount"], ["data", "recurring_pre_tax_amount"]]),
    payment_frequency_interval: pickFirstString(payload, [["payment_frequency_interval"], ["data", "payment_frequency_interval"]]),
    payment_frequency_count: pickFirstNumber(payload, [["payment_frequency_count"], ["data", "payment_frequency_count"]]),
    next_billing_date: pickFirstString(payload, [["next_billing_date"], ["data", "next_billing_date"]]),
    created_at: pickFirstString(payload, [["created_at"], ["data", "created_at"]]),

    metadata_keys: objectKeys(payload?.metadata ?? payload?.custom_data ?? payload?.data?.metadata ?? payload?.data?.custom_data),
    custom_field_response_keys: objectKeys(payload?.custom_field_responses ?? payload?.data?.custom_field_responses),
  };
}

function scrubStoredKeyArrays(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item !== "string" || !isSensitiveKeyName(item));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === "sensitive_keys_present_redacted") {
        if (Array.isArray(entry)) out.sensitive_key_count = entry.length;
        continue;
      }
      if (key.endsWith("_preview")) continue;
      out[key] = scrubStoredKeyArrays(entry);
    }
    return out;
  }
  return value;
}

function sanitizeStoredDetails(details: any) {
  if (!isPlainObject(details)) return details;
  return scrubStoredKeyArrays(JSON.parse(JSON.stringify(details)));
}

async function insertAuditLog(summary: Record<string, unknown>) {
  const supabaseUrl = getEnvAny(["SUPABASE_URL", "SB_URL"]);
  const serviceRoleKey = getEnvAny(["SUPABASE_SERVICE_ROLE_KEY", "SB_SERVICE_ROLE_KEY", "SB_SERVICE_ROLE"]);

  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, reason: "missing_supabase_service_env" };
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/audit_log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify({
      action: "dodo.webhook.test_capture",
      entity: "dodo_webhook_test_capture",
      details: summary,
    }),
  });

  if (!response.ok) {
    return { ok: false, reason: "audit_insert_failed", status: response.status, body: await response.text() };
  }

  return { ok: true };
}

async function readAuditLog(req: Request) {
  const readKey = asString(Deno.env.get("DODO_CAPTURE_READ_KEY"));
  const provided = asString(req.headers.get("x-capture-read-key"));

  if (!readKey) {
    return json(500, { ok: false, error: "DODO_CAPTURE_READ_KEY is not configured" });
  }

  if (!provided || provided !== readKey) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  const supabaseUrl = getEnvAny(["SUPABASE_URL", "SB_URL"]);
  const serviceRoleKey = getEnvAny(["SUPABASE_SERVICE_ROLE_KEY", "SB_SERVICE_ROLE_KEY", "SB_SERVICE_ROLE"]);

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, error: "Missing Supabase service env" });
  }

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;

  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/audit_log?select=id,at,action,entity,details&action=eq.dodo.webhook.test_capture&order=at.desc&limit=${limit}`;
  const response = await fetch(endpoint, {
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    return json(500, { ok: false, error: "audit_read_failed", status: response.status, body: await response.text() });
  }

  const rows = await response.json();
  const safeRows = Array.isArray(rows)
    ? rows.map((row) => ({ ...row, details: sanitizeStoredDetails(row?.details) }))
    : rows;
  return json(200, { ok: true, rows: safeRows });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return await readAuditLog(req);
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
    summary_schema_version: 2,
    environment: "preview-test-only",
    received_at: new Date().toISOString(),
    body_bytes: rawBody.length,
    parse_error: parseError,
    header_names_present: safeHeaderPresence(req.headers),
    payload_summary: parsed ? summarizePayload(parsed) : null,
  };

  console.log("[DODO WEBHOOK TEST CAPTURE]", JSON.stringify({
    capture: summary.capture,
    environment: summary.environment,
    event_type: summary.payload_summary?.event_type ?? null,
    product_id: summary.payload_summary?.product_id ?? null,
    subscription_id: summary.payload_summary?.subscription_id ?? null,
    payment_id: summary.payload_summary?.payment_id ?? null,
    parse_error: summary.parse_error,
  }));

  const storeResult = await insertAuditLog(summary);
  if (!storeResult.ok) {
    console.warn("[DODO WEBHOOK TEST CAPTURE] audit_log store failed", JSON.stringify(storeResult));
  }

  return json(200, {
    ok: true,
    captured: true,
    stored: storeResult.ok,
    mode: "preview-test-only",
    db_writes: "audit_log_minimal_summary_only",
    summary_schema_version: 2,
  });
});
