import Stripe from "npm:stripe@16.2.0";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const SB_URL =
  Deno.env.get("SB_URL") ??
  Deno.env.get("SUPABASE_URL") ??
  "";

const SB_SERVICE_ROLE =
  Deno.env.get("SB_SERVICE_ROLE") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

const EXPECTED_ENV = (Deno.env.get("APP_ENV") ?? "production").trim().toLowerCase();

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

function toIsoTimestamptz(v: unknown): string | null {
  if (v === null || v === undefined) return null;

  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }

  const n = asNumberOrNull(v);
  if (n !== null) {
    const d = new Date(Math.round(n * 1000));
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  const s = asString(v);
  if (!s) return null;

  if (/^\d+$/.test(s)) {
    const nn = asNumberOrNull(s);
    if (nn === null) return null;
    const d = new Date(Math.round(nn * 1000));
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function pickOrgIdFromAny(obj: any): string | null {
  return (
    asString(obj?.metadata?.org_id) ??
    asString(obj?.customer_details?.metadata?.org_id) ??
    asString(obj?.subscription_details?.metadata?.org_id) ??
    asString(obj?.parent?.subscription_details?.metadata?.org_id) ??
    asString(obj?.lines?.data?.[0]?.metadata?.org_id) ??
    null
  );
}

function pickEnvFromAny(obj: any): string | null {
  return (
    asString(obj?.metadata?.env) ??
    asString(obj?.customer_details?.metadata?.env) ??
    asString(obj?.subscription_details?.metadata?.env) ??
    asString(obj?.parent?.subscription_details?.metadata?.env) ??
    asString(obj?.lines?.data?.[0]?.metadata?.env) ??
    null
  );
}

function pickUserIdFromAny(obj: any): string | null {
  return (
    asString(obj?.metadata?.user_id) ??
    asString(obj?.customer_details?.metadata?.user_id) ??
    asString(obj?.subscription_details?.metadata?.user_id) ??
    asString(obj?.parent?.subscription_details?.metadata?.user_id) ??
    asString(obj?.lines?.data?.[0]?.metadata?.user_id) ??
    null
  );
}

function pickEmailFromAny(obj: any): string | null {
  return (
    asString(obj?.metadata?.user_email) ??
    asString(obj?.customer_details?.email) ??
    asString(obj?.customer_email) ??
    asString(obj?.receipt_email) ??
    asString(obj?.lines?.data?.[0]?.metadata?.user_email) ??
    null
  );
}

function pickPlanFromAny(obj: any): string | null {
  return (
    asString(obj?.metadata?.plan) ??
    asString(obj?.subscription_details?.metadata?.plan) ??
    asString(obj?.parent?.subscription_details?.metadata?.plan) ??
    asString(obj?.lines?.data?.[0]?.metadata?.plan) ??
    null
  );
}

function pickPriceIdFromSubscriptionLike(obj: any): string | null {
  return asString(obj?.items?.data?.[0]?.price?.id);
}

function pickSubscriptionIdFromInvoice(inv: any): string | null {
  return (
    asString(inv?.subscription) ??
    asString(inv?.parent?.subscription_details?.subscription) ??
    asString(inv?.lines?.data?.[0]?.parent?.subscription_item_details?.subscription) ??
    null
  );
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
  p_cancel_at_period_end: boolean | null;
  p_canceled_at: string | null;
  p_payload: unknown;
};

async function callRpc<T = unknown>(
  rpcName: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const url = `${SB_URL}/rest/v1/rpc/${rpcName}`;

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
    throw new Error(`RPC ${rpcName} failed: ${res.status} ${res.statusText} :: ${text}`);
  }

  try {
    return text ? JSON.parse(text) as T : ({} as T);
  } catch {
    return {} as T;
  }
}

async function callApplyRpc(payload: ApplyRpcInput) {
  return await callRpc("apply_stripe_subscription_to_org_billing", payload);
}

Deno.serve(async (req) => {
  try {
    mustGet("STRIPE_SECRET_KEY", STRIPE_SECRET_KEY);
    mustGet("STRIPE_WEBHOOK_SECRET", STRIPE_WEBHOOK_SECRET);
    mustGet("SB_URL/SUPABASE_URL", SB_URL);
    mustGet("SB_SERVICE_ROLE/SUPABASE_SERVICE_ROLE_KEY", SB_SERVICE_ROLE);

    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return json(400, { error: "Missing stripe-signature header" });
    }

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
    let user_id: string | null = pickUserIdFromAny(obj);
    let user_email: string | null = pickEmailFromAny(obj);
    let plan_code: string | null = pickPlanFromAny(obj);
    const env = pickEnvFromAny(obj);

    if (env && env !== EXPECTED_ENV) {
      return json(200, {
        received: true,
        ignored: type,
        reason: `env mismatch: got=${env} expected=${EXPECTED_ENV}`,
      });
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
      const sub = await stripe.subscriptions.retrieve(subId);

      org_id = org_id ?? pickOrgIdFromAny(sub);
      user_id = user_id ?? pickUserIdFromAny(sub);
      user_email = user_email ?? pickEmailFromAny(sub);
      plan_code = plan_code ?? pickPlanFromAny(sub);

      stripe_customer_id = stripe_customer_id ?? asString(sub?.customer);
      stripe_subscription_id = stripe_subscription_id ?? asString(sub?.id);
      status = asString(sub?.status) ?? status;
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
        (sub as any)?.current_period_end !== undefined
          ? asNumberOrNull((sub as any).current_period_end)
          : current_period_end_epoch;
    };

    if (type === "checkout.session.completed") {
      stripe_customer_id = asString(obj?.customer);
      stripe_subscription_id = asString(obj?.subscription);
      user_email = user_email ?? asString(obj?.customer_details?.email) ?? asString(obj?.customer_email);

      if (stripe_subscription_id) {
        await hydrateFromSubscription(stripe_subscription_id);
      }
    } else if (type.startsWith("customer.subscription.")) {
      stripe_subscription_id = asString(obj?.id);
      stripe_customer_id = asString(obj?.customer);
      status = asString(obj?.status);
      stripe_price_id = pickPriceIdFromSubscriptionLike(obj);

      cancel_at_period_end =
        obj?.cancel_at_period_end !== undefined ? Boolean(obj.cancel_at_period_end) : null;

      canceled_at_epoch =
        obj?.canceled_at !== undefined ? asNumberOrNull(obj.canceled_at) : null;

      trial_end_epoch =
        obj?.trial_end !== undefined ? asNumberOrNull(obj.trial_end) : null;

      current_period_end_epoch =
        obj?.current_period_end !== undefined ? asNumberOrNull(obj.current_period_end) : null;

      if (!org_id && stripe_subscription_id) {
        await hydrateFromSubscription(stripe_subscription_id);
      }
    } else if (type === "invoice.paid" || type === "invoice.payment_failed") {
      stripe_customer_id = asString(obj?.customer);
      stripe_subscription_id = pickSubscriptionIdFromInvoice(obj);
      user_email = user_email ?? asString(obj?.customer_email) ?? asString(obj?.receipt_email);

      if (!org_id) {
        const invoiceId = asString(obj?.id);
        if (invoiceId) {
          const invFull = await stripe.invoices.retrieve(invoiceId, {
            expand: ["lines.data", "parent.subscription_details"],
          });
          org_id = pickOrgIdFromAny(invFull);
          user_id = user_id ?? pickUserIdFromAny(invFull);
          user_email = user_email ?? pickEmailFromAny(invFull);
          plan_code = plan_code ?? pickPlanFromAny(invFull);
        }
      }

      if (stripe_subscription_id) {
        await hydrateFromSubscription(stripe_subscription_id);
      }
    }

    if (!org_id) {
      return json(200, {
        received: true,
        warning: "org_id not found in metadata",
        type,
      });
    }

    const p_current_period_end = toIsoTimestamptz(current_period_end_epoch);
    const p_trial_end = toIsoTimestamptz(trial_end_epoch);
    const p_canceled_at = toIsoTimestamptz(canceled_at_epoch);

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
      p_payload: {
        stripe_event: event,
        extracted: {
          org_id,
          user_id,
          user_email,
          plan_code,
          stripe_customer_id,
          stripe_subscription_id,
          stripe_price_id,
          status,
          cancel_at_period_end,
          canceled_at_epoch,
          trial_end_epoch,
          current_period_end_epoch,
          env,
        },
      },
    });

    await callRpc("saas_mark_trial_consumed_from_billing", {
      p_org_id: org_id,
      p_user_id: user_id,
      p_email: user_email,
      p_stripe_customer_id: stripe_customer_id,
      p_stripe_subscription_id: stripe_subscription_id,
      p_trial_end,
      p_plan_code: plan_code,
      p_status: status,
    });

    const overLimit = await callRpc("refresh_org_limit_status", {
      p_org_id: org_id,
    });

    return json(200, {
      received: true,
      ok: true,
      type,
      org_id,
      user_id,
      user_email,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      status,
      p_current_period_end,
      p_trial_end,
      p_canceled_at,
      cancel_at_period_end,
      over_limit: overLimit,
    });
  } catch (e) {
    return json(500, {
      error: "Webhook error",
      detail: String((e as any)?.message ?? e),
    });
  }
});