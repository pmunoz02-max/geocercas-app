// C:\dev\geocercas-app-starter\geocercas-app\supabase\functions\stripe-webhook\index.ts
import Stripe from "npm:stripe@16.2.0";

/**
 * Stripe Webhook - App Geocercas (PREVIEW)
 * - Verifica firma Stripe-Signature (ASYNC en Deno)
 * - Extrae org_id desde metadata (session/subscription/invoice)
 * - Si invoice llega "parcial", re-trae invoice con expand y vuelve a buscar org_id
 * - Llama RPC (service_role) para aplicar estado a org_billing
 *
 * IMPORTANTE:
 * - Esta función es para PREVIEW. Si metadata.env existe y NO coincide con "preview", se ignora el evento (200 OK).
 * - La RPC real espera parámetros p_* y payload completo (jsonb).
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

function pickOrgIdFromAny(obj: any): string | null {
  // 1) metadata directo
  const m = obj?.metadata;
  if (m?.org_id) return asString(m.org_id);

  // 2) checkout session
  const cm = obj?.customer_details?.metadata;
  if (cm?.org_id) return asString(cm.org_id);

  const sm = obj?.subscription_details?.metadata;
  if (sm?.org_id) return asString(sm.org_id);

  // 3) invoice: parent.subscription_details.metadata
  const pm = obj?.parent?.subscription_details?.metadata;
  if (pm?.org_id) return asString(pm.org_id);

  // 4) invoice: lines.data[0].metadata
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
  // Firma RPC real (p_*)
  p_cancel_at_period_end: boolean | null;
  p_canceled_at: number | null; // epoch seconds (Stripe uses seconds)
  p_current_period_end: number | null; // epoch seconds
  p_event_id: string;
  p_event_type: string;
  p_org_id: string;
  p_payload: unknown; // jsonb
  p_status: string | null;
  p_stripe_customer_id: string | null;
  p_stripe_price_id: string | null;
  p_stripe_subscription_id: string | null;
  p_trial_end: number | null; // epoch seconds
};

async function callApplyRpc(payload: ApplyRpcInput) {
  const url = `${SB_URL}/rest/v1/rpc/apply_stripe_subscription_to_org_billing`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SB_SERVICE_ROLE,
      Authorization: `Bearer ${SB_SERVICE_ROLE}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RPC failed: ${res.status} ${res.statusText} :: ${text}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return await res.json().catch(() => ({}));
  return {};
}

Deno.serve(async (req) => {
  try {
    mustGet("STRIPE_SECRET_KEY", STRIPE_SECRET_KEY);
    mustGet("STRIPE_WEBHOOK_SECRET", STRIPE_WEBHOOK_SECRET);
    mustGet("SB_URL", SB_URL);
    mustGet("SB_SERVICE_ROLE", SB_SERVICE_ROLE);

    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const sig = req.headers.get("stripe-signature");
    if (!sig) return json(400, { error: "Missing stripe-signature header" });

    const rawBody = new TextDecoder().decode(await req.arrayBuffer());

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
      return json(400, {
        error: "Invalid signature",
        detail: String((err as any)?.message ?? err),
      });
    }

    const type = event.type;

    const interesting = new Set<string>([
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
    ]);

    if (!interesting.has(type)) {
      return json(200, { received: true, ignored: type });
    }

    const obj: any = (event.data as any)?.object ?? {};
    let org_id: string | null = pickOrgIdFromAny(obj);

    const env = pickEnvFromAny(obj);
    const env_warning =
      env && env !== EXPECTED_ENV
        ? `metadata.env=${env} differs from expected=${EXPECTED_ENV}`
        : null;

    // 🔒 PREVIEW guard: si viene env explícito y NO es preview, ignoramos.
    if (env && env !== EXPECTED_ENV) {
      return json(200, { received: true, ignored: type, env_warning });
    }

    let stripe_customer_id: string | null = null;
    let stripe_subscription_id: string | null = null;
    let stripe_price_id: string | null = null;
    let status: string | null = null;

    // campos opcionales de sub
    let cancel_at_period_end: boolean | null = null;
    let canceled_at: number | null = null;
    let trial_end: number | null = null;
    let current_period_end: number | null = null;

    // Helper: cargar subscription canónica
    const hydrateFromSubscription = async (subId: string) => {
      const sub = await stripe.subscriptions.retrieve(subId);

      org_id = org_id ?? pickOrgIdFromAny(sub);
      stripe_customer_id = stripe_customer_id ?? (sub?.customer ? asString(sub.customer) : null);
      stripe_subscription_id = stripe_subscription_id ?? (sub?.id ? asString(sub.id) : null);

      status = sub?.status ? asString(sub.status) : status;

      stripe_price_id = stripe_price_id ?? pickPriceIdFromSubscriptionLike(sub);

      cancel_at_period_end =
        sub?.cancel_at_period_end !== undefined ? Boolean(sub.cancel_at_period_end) : cancel_at_period_end;

      canceled_at = sub?.canceled_at !== undefined ? asNumberOrNull(sub.canceled_at) : canceled_at;
      trial_end = sub?.trial_end !== undefined ? asNumberOrNull(sub.trial_end) : trial_end;
      current_period_end =
        sub?.current_period_end !== undefined ? asNumberOrNull(sub.current_period_end) : current_period_end;
    };

    if (type === "checkout.session.completed") {
      stripe_customer_id = obj?.customer ? asString(obj.customer) : null;
      stripe_subscription_id = obj?.subscription ? asString(obj.subscription) : null;

      // checkout.session suele venir sin status/price → traer subscription
      if (stripe_subscription_id) {
        await hydrateFromSubscription(stripe_subscription_id);
      }
    } else if (type.startsWith("customer.subscription.")) {
      stripe_subscription_id = obj?.id ? asString(obj.id) : null;
      stripe_customer_id = obj?.customer ? asString(obj.customer) : null;

      status = obj?.status ? asString(obj.status) : null;
      trial_end = obj?.trial_end !== undefined ? asNumberOrNull(obj.trial_end) : null;
      current_period_end =
        obj?.current_period_end !== undefined ? asNumberOrNull(obj.current_period_end) : null;

      cancel_at_period_end =
        obj?.cancel_at_period_end !== undefined ? Boolean(obj.cancel_at_period_end) : null;
      canceled_at = obj?.canceled_at !== undefined ? asNumberOrNull(obj.canceled_at) : null;

      stripe_price_id = pickPriceIdFromSubscriptionLike(obj);

      // si org_id no está, re-hidratar
      if (!org_id && stripe_subscription_id) {
        await hydrateFromSubscription(stripe_subscription_id);
      }
    } else if (type === "invoice.paid" || type === "invoice.payment_failed") {
      stripe_customer_id = obj?.customer ? asString(obj.customer) : null;
      stripe_subscription_id = pickSubscriptionIdFromInvoice(obj);

      // ✅ Si invoice llegó parcial, lo re-traemos expandido para metadata
      if (!org_id) {
        const invoiceId = obj?.id ? asString(obj.id) : null;
        if (invoiceId) {
          const invFull = await stripe.invoices.retrieve(invoiceId, {
            expand: ["lines.data", "parent.subscription_details"],
          });
          org_id = pickOrgIdFromAny(invFull);
        }
      }

      // Canon: status/period/price desde subscription
      if (stripe_subscription_id) {
        await hydrateFromSubscription(stripe_subscription_id);
      }
    }

    if (!org_id) {
      return json(200, {
        received: true,
        warning: "org_id not found in metadata",
        type,
        env_warning,
      });
    }

    // payload completo para auditoría / idempotencia / debug en SQL
    const fullPayload = {
      stripe_event: event,
      extracted: {
        org_id,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_price_id,
        status,
        cancel_at_period_end,
        canceled_at,
        trial_end,
        current_period_end,
        env,
      },
    };

    // ✅ RPC con firma real p_*
    await callApplyRpc({
      p_cancel_at_period_end: cancel_at_period_end,
      p_canceled_at: canceled_at,
      p_current_period_end: current_period_end,
      p_event_id: event.id,
      p_event_type: type,
      p_org_id: org_id,
      p_payload: fullPayload,
      p_status: status,
      p_stripe_customer_id: stripe_customer_id,
      p_stripe_price_id: stripe_price_id,
      p_stripe_subscription_id: stripe_subscription_id,
      p_trial_end: trial_end,
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
      cancel_at_period_end,
      canceled_at,
      current_period_end,
      trial_end,
      env_warning,
    });
  } catch (e) {
    return json(500, {
      error: "Webhook error",
      detail: String((e as any)?.message ?? e),
    });
  }
});