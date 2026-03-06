// supabase/functions/stripe-webhook/index.ts
import Stripe from "npm:stripe@16.2.0";

/**
 * Stripe Webhook - App Geocercas (PREVIEW)
 *
 * Mejoras:
 * - Logs claros en cada fase
 * - Respuestas explícitas para Missing stripe-signature / Invalid signature / RPC failed
 * - Mantiene guard de preview por metadata.env
 * - Convierte epoch -> ISO para RPC timestamptz
 *
 * IMPORTANTE:
 * - Esta función debe tener verify_jwt = false
 * - STRIPE_WEBHOOK_SECRET debe ser el whsec_... del webhook exacto configurado en Stripe TEST
 */

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SB_URL = Deno.env.get("SB_URL") ?? "";
const SB_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE") ?? "";

const EXPECTED_ENV = "preview";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mustGet(name: string, value: string) {
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function logInfo(message: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level: "info", message, ...extra }));
}

function logWarn(message: string, extra: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ level: "warn", message, ...extra }));
}

function logError(message: string, extra: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ level: "error", message, ...extra }));
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function asNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIsoTimestamptz(v: unknown): string | null {
  if (v === null || v === undefined) return null;

  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }

  const n = asNumberOrNull(v);
  if (n !== null) {
    const ms = Math.round(n * 1000);
    const d = new Date(ms);
    const t = d.getTime();
    return Number.isFinite(t) ? d.toISOString() : null;
  }

  const s = asString(v);
  if (!s) return null;

  if (/^\d+$/.test(s)) {
    const nn = asNumberOrNull(s);
    if (nn === null) return null;
    const d = new Date(Math.round(nn * 1000));
    const t = d.getTime();
    return Number.isFinite(t) ? d.toISOString() : null;
  }

  const d = new Date(s);
  const t = d.getTime();
  return Number.isFinite(t) ? d.toISOString() : null;
}

function pickOrgIdFromAny(obj: any): string | null {
  const m = obj?.metadata;
  if (m?.org_id) return asString(m.org_id);

  const cm = obj?.customer_details?.metadata;
  if (cm?.org_id) return asString(cm.org_id);

  const sm = obj?.subscription_details?.metadata;
  if (sm?.org_id) return asString(sm.org_id);

  const pm = obj?.parent?.subscription_details?.metadata;
  if (pm?.org_id) return asString(pm.org_id);

  const lm = obj?.lines?.data?.[0]?.metadata;
  if (lm?.org_id) return asString(lm.org_id);

  return null;
}

function pickEnvFromAny(obj: any): string | null {
  const m = obj?.metadata;
  if (m?.env) return asString(m.env);

  const cm = obj?.customer_details?.metadata;
  if (cm?.env) return asString(cm.env);

  const sm = obj?.subscription_details?.metadata;
  if (sm?.env) return asString(sm.env);

  const pm = obj?.parent?.subscription_details?.metadata;
  if (pm?.env) return asString(pm.env);

  const lm = obj?.lines?.data?.[0]?.metadata;
  if (lm?.env) return asString(lm.env);

  return null;
}

function pickPriceIdFromSubscriptionLike(obj: any): string | null {
  const item0 = obj?.items?.data?.[0];
  const pid = item0?.price?.id ? String(item0.price.id) : null;
  return pid ? pid : null;
}

function pickSubscriptionIdFromInvoice(inv: any): string | null {
  const s1 = inv?.subscription ? asString(inv.subscription) : null;
  if (s1) return s1;

  const s2 = inv?.parent?.subscription_details?.subscription
    ? asString(inv.parent.subscription_details.subscription)
    : null;
  if (s2) return s2;

  const s3 =
    inv?.lines?.data?.[0]?.parent?.subscription_item_details?.subscription
      ? asString(inv.lines.data[0].parent.subscription_item_details.subscription)
      : null;
  if (s3) return s3;

  return null;
}

type ApplyRpcInput = {
  p_event_id: string;
  p_event_type: string;
  p_org_id: string;

  p_stripe_customer_id: string | null;
  p_stripe_subscription_id: string | null;
  p_stripe_price_id: string | null;
  p_status: string | null;

  p_current_period_end: string | null;
  p_trial_end: string | null;
  p_canceled_at: string | null;

  p_cancel_at_period_end: boolean | null;
  p_payload: unknown;
};

async function callApplyRpc(payload: ApplyRpcInput) {
  const url = `${SB_URL}/rest/v1/rpc/apply_stripe_subscription_to_org_billing`;

  logInfo("Calling billing RPC", {
    event_id: payload.p_event_id,
    event_type: payload.p_event_type,
    org_id: payload.p_org_id,
    stripe_subscription_id: payload.p_stripe_subscription_id,
    stripe_customer_id: payload.p_stripe_customer_id,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SB_SERVICE_ROLE,
      Authorization: `Bearer ${SB_SERVICE_ROLE}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    logError("Billing RPC failed", {
      status: res.status,
      status_text: res.statusText,
      body: text,
      event_id: payload.p_event_id,
      org_id: payload.p_org_id,
    });
    throw new Error(`RPC failed: ${res.status} ${res.statusText} :: ${text}`);
  }

  logInfo("Billing RPC applied", {
    status: res.status,
    event_id: payload.p_event_id,
    org_id: payload.p_org_id,
  });

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  try {
    mustGet("STRIPE_SECRET_KEY", STRIPE_SECRET_KEY);
    mustGet("STRIPE_WEBHOOK_SECRET", STRIPE_WEBHOOK_SECRET);
    mustGet("SB_URL", SB_URL);
    mustGet("SB_SERVICE_ROLE", SB_SERVICE_ROLE);

    if (req.method !== "POST") {
      logWarn("Method not allowed", { method: req.method });
      return json(405, { error: "Method not allowed" });
    }

    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      logWarn("Missing stripe-signature header", {
        user_agent: req.headers.get("user-agent"),
        content_length: req.headers.get("content-length"),
      });
      return json(400, { error: "Missing stripe-signature header" });
    }

    const rawBody = new TextDecoder().decode(await req.arrayBuffer());

    logInfo("Webhook received", {
      has_signature: true,
      body_length: rawBody.length,
      user_agent: req.headers.get("user-agent"),
      host: req.headers.get("host"),
    });

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        sig,
        STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      const detail = String((err as any)?.message ?? err);
      logError("Invalid webhook signature", {
        detail,
        webhook_secret_prefix: STRIPE_WEBHOOK_SECRET ? STRIPE_WEBHOOK_SECRET.slice(0, 8) : null,
      });
      return json(400, {
        error: "Invalid signature",
        detail,
      });
    }

    const type = event.type;

    logInfo("Webhook verified", {
      event_id: event.id,
      type,
    });

    const interesting = new Set<string>([
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
    ]);

    if (!interesting.has(type)) {
      logInfo("Webhook ignored: event not tracked", {
        event_id: event.id,
        type,
      });
      return json(200, { received: true, ignored: type });
    }

    const obj: any = (event.data as any)?.object ?? {};
    let org_id: string | null = pickOrgIdFromAny(obj);

    const env = pickEnvFromAny(obj);
    const env_warning =
      env && env !== EXPECTED_ENV
        ? `metadata.env=${env} differs from expected=${EXPECTED_ENV}`
        : null;

    if (env && env !== EXPECTED_ENV) {
      logWarn("Webhook ignored: env mismatch", {
        event_id: event.id,
        type,
        env,
        expected_env: EXPECTED_ENV,
      });
      return json(200, { received: true, ignored: type, env_warning });
    }

    let stripe_customer_id: string | null = null;
    let stripe_subscription_id: string | null = null;
    let stripe_price_id: string | null = null;
    let status: string | null = null;

    let cancel_at_period_end: boolean | null = null;
    let canceled_at_epoch: number | null = null;
    let trial_end_epoch: number | null = null;
    let current_period_end_epoch: number | null = null;

    const hydrateFromSubscription = async (subId: string) => {
      logInfo("Hydrating from Stripe subscription", {
        event_id: event.id,
        type,
        subscription_id: subId,
      });

      const sub = await stripe.subscriptions.retrieve(subId);

      org_id = org_id ?? pickOrgIdFromAny(sub);
      stripe_customer_id = stripe_customer_id ?? (sub?.customer ? asString(sub.customer) : null);
      stripe_subscription_id = stripe_subscription_id ?? (sub?.id ? asString(sub.id) : null);

      status = sub?.status ? asString(sub.status) : status;
      stripe_price_id = stripe_price_id ?? pickPriceIdFromSubscriptionLike(sub);

      cancel_at_period_end =
        sub?.cancel_at_period_end !== undefined
          ? Boolean(sub.cancel_at_period_end)
          : cancel_at_period_end;

      canceled_at_epoch =
        sub?.canceled_at !== undefined ? asNumberOrNull(sub.canceled_at) : canceled_at_epoch;

      trial_end_epoch =
        sub?.trial_end !== undefined ? asNumberOrNull(sub.trial_end) : trial_end_epoch;

      current_period_end_epoch =
        sub?.current_period_end !== undefined
          ? asNumberOrNull(sub.current_period_end)
          : current_period_end_epoch;
    };

    if (type === "checkout.session.completed") {
      stripe_customer_id = obj?.customer ? asString(obj.customer) : null;
      stripe_subscription_id = obj?.subscription ? asString(obj.subscription) : null;

      logInfo("Processing checkout.session.completed", {
        event_id: event.id,
        stripe_customer_id,
        stripe_subscription_id,
        org_id,
      });

      if (stripe_subscription_id) {
        await hydrateFromSubscription(stripe_subscription_id);
      }
    } else if (type.startsWith("customer.subscription.")) {
      stripe_subscription_id = obj?.id ? asString(obj.id) : null;
      stripe_customer_id = obj?.customer ? asString(obj.customer) : null;

      status = obj?.status ? asString(obj.status) : null;
      stripe_price_id = pickPriceIdFromSubscriptionLike(obj);

      cancel_at_period_end =
        obj?.cancel_at_period_end !== undefined ? Boolean(obj.cancel_at_period_end) : null;

      canceled_at_epoch =
        obj?.canceled_at !== undefined ? asNumberOrNull(obj.canceled_at) : null;

      trial_end_epoch =
        obj?.trial_end !== undefined ? asNumberOrNull(obj.trial_end) : null;

      current_period_end_epoch =
        obj?.current_period_end !== undefined ? asNumberOrNull(obj.current_period_end) : null;

      logInfo("Processing customer.subscription event", {
        event_id: event.id,
        type,
        stripe_customer_id,
        stripe_subscription_id,
        org_id,
        status,
      });

      if (!org_id && stripe_subscription_id) {
        await hydrateFromSubscription(stripe_subscription_id);
      }
    } else if (type === "invoice.paid" || type === "invoice.payment_failed") {
      stripe_customer_id = obj?.customer ? asString(obj.customer) : null;
      stripe_subscription_id = pickSubscriptionIdFromInvoice(obj);

      logInfo("Processing invoice event", {
        event_id: event.id,
        type,
        stripe_customer_id,
        stripe_subscription_id,
        org_id,
      });

      if (!org_id) {
        const invoiceId = obj?.id ? asString(obj.id) : null;
        if (invoiceId) {
          logInfo("Hydrating full invoice for metadata", {
            event_id: event.id,
            invoice_id: invoiceId,
          });

          const invFull = await stripe.invoices.retrieve(invoiceId, {
            expand: ["lines.data", "parent.subscription_details"],
          });
          org_id = pickOrgIdFromAny(invFull);
        }
      }

      if (stripe_subscription_id) {
        await hydrateFromSubscription(stripe_subscription_id);
      }
    }

    if (!org_id) {
      logWarn("org_id not found in metadata", {
        event_id: event.id,
        type,
        env,
      });
      return json(200, {
        received: true,
        warning: "org_id not found in metadata",
        type,
        env_warning,
      });
    }

    const p_current_period_end = toIsoTimestamptz(current_period_end_epoch);
    const p_trial_end = toIsoTimestamptz(trial_end_epoch);
    const p_canceled_at = toIsoTimestamptz(canceled_at_epoch);

    const fullPayload = {
      stripe_event: event,
      extracted: {
        org_id,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_price_id,
        status,
        cancel_at_period_end,
        canceled_at_epoch,
        trial_end_epoch,
        current_period_end_epoch,
        p_canceled_at,
        p_trial_end,
        p_current_period_end,
        env,
      },
    };

    await callApplyRpc({
      p_event_id: event.id,
      p_event_type: type,
      p_org_id: org_id,
      p_stripe_customer_id: stripe_customer_id,
      p_stripe_subscription_id: stripe_subscription_id,
      p_stripe_price_id: stripe_price_id,
      p_status: status,
      p_current_period_end,
      p_trial_end,
      p_cancel_at_period_end: cancel_at_period_end,
      p_canceled_at,
      p_payload: fullPayload,
    });

    logInfo("Webhook applied successfully", {
      event_id: event.id,
      type,
      org_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      status,
    });

    return json(200, {
      received: true,
      ok: true,
      type,
      org_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      status,
      p_current_period_end,
      p_trial_end,
      p_canceled_at,
      cancel_at_period_end,
      env_warning,
    });
  } catch (e) {
    const detail = String((e as any)?.message ?? e);
    logError("Webhook fatal error", { detail });
    return json(500, {
      error: "Webhook error",
      detail,
    });
  }
});