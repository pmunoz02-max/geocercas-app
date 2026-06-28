import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Content-Type": "application/json",
};

type JsonObject = Record<string, unknown>;
type PlanCode = "pro" | "enterprise";

type DodoExtractedEvent = {
  eventId: string;
  eventType: string | null;
  payloadType: string | null;
  orgId: string | null;
  planCode: PlanCode | null;
  productId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  paymentId: string | null;
  checkoutSessionId: string | null;
  dodoStatus: string | null;
  currency: string | null;
  totalAmount: number | null;
  currentPeriodEnd: string | null;
  receivedAt: string;
  summary: JsonObject;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePlan(value: unknown): PlanCode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pro") return "pro";
  if (normalized === "enterprise") return "enterprise";
  return null;
}

function looksLikeUuid(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function productIdForPlan(plan: PlanCode): string {
  if (plan === "pro") return getEnv("DODO_PRODUCT_ID_PRO_TEST");
  return getEnv("DODO_PRODUCT_ID_ENTERPRISE_TEST");
}

function planFromProductId(productId: string | null): PlanCode | null {
  if (!productId) return null;
  if (productId === Deno.env.get("DODO_PRODUCT_ID_PRO_TEST")) return "pro";
  if (productId === Deno.env.get("DODO_PRODUCT_ID_ENTERPRISE_TEST")) return "enterprise";
  return null;
}

function safeKeys(value: unknown): string[] {
  const obj = asObject(value);
  if (!obj) return [];
  const blocked = [
    "card", "billing", "invoice_url", "payment_link", "phone", "email",
    "address", "tax_id", "ip", "browser", "user_agent", "customer_business_name",
  ];
  return Object.keys(obj)
    .filter((key) => !blocked.some((blockedKey) => key.toLowerCase().includes(blockedKey)))
    .sort();
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const array = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < array.length; i += 1) binary += String.fromCharCode(array[i]);
  return btoa(binary);
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const len = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < len; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

function signatureCandidates(signatureHeader: string): string[] {
  return signatureHeader
    .split(/\s+/)
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.startsWith("v1,") ? part.slice(3) : part)
    .map((part) => part.startsWith("v1=") ? part.slice(3) : part)
    .filter((part) => part !== "v1");
}

async function sign(secretBytes: Uint8Array, content: string): Promise<{ base64: string; base64Url: string }> {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(content));
  return {
    base64: bytesToBase64(signature),
    base64Url: bytesToBase64Url(signature),
  };
}

async function verifySvixLikeSignature(req: Request, rawBody: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const messageId = req.headers.get("svix-id") ?? req.headers.get("webhook-id") ?? req.headers.get("dodo-webhook-id");
  const timestamp = req.headers.get("svix-timestamp") ?? req.headers.get("webhook-timestamp") ?? req.headers.get("dodo-webhook-timestamp");
  const signature = req.headers.get("svix-signature") ?? req.headers.get("webhook-signature") ?? req.headers.get("dodo-webhook-signature");

  if (!messageId || !timestamp || !signature) {
    return { ok: false, error: "missing_webhook_signature_headers" };
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, error: "invalid_webhook_timestamp" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > 5 * 60) {
    return { ok: false, error: "webhook_timestamp_outside_tolerance" };
  }

  const secret = getEnv("DODO_WEBHOOK_SECRET_TEST").trim();
  const secretBody = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const secretCandidates: Uint8Array[] = [];

  try {
    secretCandidates.push(base64ToBytes(secretBody));
  } catch {
    // Some providers expose raw secrets. We keep a raw fallback below.
  }
  secretCandidates.push(new TextEncoder().encode(secret));
  if (secretBody !== secret) secretCandidates.push(new TextEncoder().encode(secretBody));

  const signedContent = `${messageId}.${timestamp}.${rawBody}`;
  const receivedCandidates = signatureCandidates(signature);

  for (const secretBytes of secretCandidates) {
    const expected = await sign(secretBytes, signedContent);
    for (const received of receivedCandidates) {
      if (timingSafeEqual(expected.base64, received) || timingSafeEqual(expected.base64Url, received)) {
        return { ok: true };
      }
    }
  }

  return { ok: false, error: "invalid_webhook_signature" };
}

function getProductCartProductIds(data: JsonObject): string[] {
  return asArray(data.product_cart)
    .map(asObject)
    .filter((item): item is JsonObject => Boolean(item))
    .map((item) => stringOrNull(item.product_id))
    .filter((value): value is string => Boolean(value));
}

function makeFallbackEventId(payload: JsonObject, data: JsonObject, eventType: string | null): string {
  const existing = stringOrNull(payload.id) ?? stringOrNull(payload.event_id) ?? stringOrNull(data.event_id);
  if (existing) return existing;

  const stableId =
    stringOrNull(data.payment_id) ??
    stringOrNull(data.subscription_id) ??
    stringOrNull(data.checkout_session_id) ??
    "unknown";

  const stableTime =
    stringOrNull(data.updated_at) ??
    stringOrNull(data.created_at) ??
    stringOrNull(payload.timestamp) ??
    "no-time";

  return `dodo:${eventType ?? "unknown"}:${stableId}:${stableTime}`;
}

function parseTimestamp(value: unknown): string | null {
  const raw = stringOrNull(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function extractEvent(payload: JsonObject): DodoExtractedEvent {
  const receivedAt = new Date().toISOString();
  const data = asObject(payload.data) ?? {};
  const metadata = asObject(data.metadata) ?? asObject(payload.metadata) ?? {};
  const eventType = stringOrNull(payload.type) ?? stringOrNull(payload.event_type);
  const payloadType = stringOrNull(data.payload_type) ?? stringOrNull(payload.payload_type);
  const productCartProductIds = getProductCartProductIds(data);
  const productId = stringOrNull(data.product_id) ?? productCartProductIds[0] ?? null;
  const metadataPlan = normalizePlan(metadata.plan_code ?? metadata.plan ?? metadata.planCode);
  const planCode = metadataPlan ?? planFromProductId(productId);
  const orgIdRaw = stringOrNull(metadata.org_id ?? metadata.orgId);
  const orgId = looksLikeUuid(orgIdRaw) ? orgIdRaw : null;
  const currentPeriodEnd = parseTimestamp(
    data.next_billing_date ?? data.current_period_end ?? data.expires_at ?? data.subscription_current_period_end,
  );

  const summary = {
    schema_version: 1,
    mode: "preview-test-only",
    event_type: eventType,
    payload_type: payloadType,
    dodo_status: stringOrNull(data.status),
    currency: stringOrNull(data.currency),
    total_amount: numberOrNull(data.total_amount),
    product_id: productId,
    product_cart_product_ids: productCartProductIds,
    plan_code: planCode,
    org_id_present: Boolean(orgId),
    metadata_keys: safeKeys(data.metadata),
    top_level_keys: safeKeys(payload),
    data_keys: safeKeys(data),
    checkout_session_id_present: Boolean(stringOrNull(data.checkout_session_id)),
    payment_id_present: Boolean(stringOrNull(data.payment_id)),
    subscription_id_present: Boolean(stringOrNull(data.subscription_id)),
    next_billing_date_present: Boolean(currentPeriodEnd),
  };

  return {
    eventId: makeFallbackEventId(payload, data, eventType),
    eventType,
    payloadType,
    orgId,
    planCode,
    productId,
    customerId: stringOrNull(data.customer_id) ?? stringOrNull(asObject(data.customer)?.customer_id) ?? stringOrNull(asObject(data.customer)?.id),
    subscriptionId: stringOrNull(data.subscription_id),
    paymentId: stringOrNull(data.payment_id),
    checkoutSessionId: stringOrNull(data.checkout_session_id),
    dodoStatus: stringOrNull(data.status),
    currency: stringOrNull(data.currency),
    totalAmount: numberOrNull(data.total_amount),
    currentPeriodEnd,
    receivedAt,
    summary,
  };
}

function shouldActivateBilling(event: DodoExtractedEvent): boolean {
  const eventType = event.eventType ?? "";
  const status = (event.dodoStatus ?? "").toLowerCase();

  if (eventType === "payment.succeeded" && status === "succeeded") return true;
  if (eventType.startsWith("subscription.") && status === "active") return true;
  return false;
}

function shouldCancelBilling(event: DodoExtractedEvent): boolean {
  const eventType = (event.eventType ?? "").toLowerCase();
  const status = (event.dodoStatus ?? "").toLowerCase();
  return eventType.includes("cancel") || eventType.includes("expired") || ["canceled", "cancelled", "expired"].includes(status);
}

function withDefinedValues(input: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method === "GET") {
      return json(200, {
        ok: true,
        function: "dodo-webhook",
        mode: "preview-test-only",
        verifies_signature: true,
        writes: ["dodo_webhook_events", "org_billing"],
      });
    }

    if (req.method !== "POST") {
      return json(405, { ok: false, error: "method_not_allowed" });
    }

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase service role environment");
    }

    const rawBody = await req.text();
    const signatureResult = await verifySvixLikeSignature(req, rawBody);

    if (!signatureResult.ok) {
      console.warn("[dodo-webhook] rejected unsigned/invalid webhook", { error: signatureResult.error });
      return json(401, { ok: false, error: signatureResult.error });
    }

    let payload: JsonObject;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json(400, { ok: false, error: "invalid_json_body" });
    }

    const event = extractEvent(payload);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const insertResult = await supabase
      .from("dodo_webhook_events")
      .insert({
        event_id: event.eventId,
        event_type: event.eventType,
        org_id: event.orgId,
        subscription_id: event.subscriptionId,
        customer_id: event.customerId,
        payment_id: event.paymentId,
        product_id: event.productId,
        status: "received",
        received_at: event.receivedAt,
        payload_summary: event.summary,
      });

    if (insertResult.error) {
      if ((insertResult.error as { code?: string }).code === "23505") {
        return json(200, { ok: true, duplicate: true, event_id: event.eventId });
      }
      throw insertResult.error;
    }

    if (!event.orgId || !event.planCode) {
      const missing = !event.orgId ? "missing_org_id" : "missing_plan_code";
      await supabase
        .from("dodo_webhook_events")
        .update({
          status: "ignored",
          processed_at: new Date().toISOString(),
          error_detail: missing,
        })
        .eq("event_id", event.eventId);

      return json(200, {
        ok: true,
        processed: false,
        ignored: true,
        reason: missing,
        event_id: event.eventId,
        event_type: event.eventType,
      });
    }

    if (event.productId && event.productId !== productIdForPlan(event.planCode)) {
      await supabase
        .from("dodo_webhook_events")
        .update({
          status: "error",
          processed_at: new Date().toISOString(),
          error_detail: "product_id_plan_mismatch",
        })
        .eq("event_id", event.eventId);

      return json(200, {
        ok: true,
        processed: false,
        ignored: true,
        reason: "product_id_plan_mismatch",
        event_id: event.eventId,
        event_type: event.eventType,
      });
    }

    const now = new Date().toISOString();
    let billingAction = "logged_only";

    if (shouldActivateBilling(event)) {
      const billingPatch = withDefinedValues({
        org_id: event.orgId,
        plan_code: event.planCode,
        subscribed_plan_code: event.planCode,
        plan_status: "active",
        billing_provider: "dodo",
        current_period_end: event.currentPeriodEnd ?? undefined,
        cancel_at_period_end: false,
        canceled_at: null,
        dodo_customer_id: event.customerId ?? undefined,
        dodo_subscription_id: event.subscriptionId ?? undefined,
        dodo_product_id: event.productId ?? undefined,
        dodo_checkout_session_id: event.checkoutSessionId ?? undefined,
        dodo_payment_id: event.paymentId ?? undefined,
        last_dodo_event_at: now,
        updated_at: now,
      });

      const billingResult = await supabase
        .from("org_billing")
        .upsert(billingPatch, { onConflict: "org_id" });

      if (billingResult.error) throw billingResult.error;
      billingAction = "activated";
    } else if (shouldCancelBilling(event)) {
      const billingPatch = withDefinedValues({
        org_id: event.orgId,
        plan_status: "canceled",
        billing_provider: "dodo",
        cancel_at_period_end: true,
        canceled_at: now,
        dodo_customer_id: event.customerId ?? undefined,
        dodo_subscription_id: event.subscriptionId ?? undefined,
        dodo_product_id: event.productId ?? undefined,
        dodo_checkout_session_id: event.checkoutSessionId ?? undefined,
        dodo_payment_id: event.paymentId ?? undefined,
        last_dodo_event_at: now,
        updated_at: now,
      });

      const billingResult = await supabase
        .from("org_billing")
        .upsert(billingPatch, { onConflict: "org_id" });

      if (billingResult.error) throw billingResult.error;
      billingAction = "canceled";
    }

    await supabase
      .from("dodo_webhook_events")
      .update({
        status: "processed",
        processed_at: now,
        error_detail: billingAction,
      })
      .eq("event_id", event.eventId);

    return json(200, {
      ok: true,
      processed: true,
      billing_action: billingAction,
      event_id: event.eventId,
      event_type: event.eventType,
      org_id: event.orgId,
      plan_code: event.planCode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[dodo-webhook] unhandled error", { message });
    return json(500, { ok: false, error: "internal_error" });
  }
});
