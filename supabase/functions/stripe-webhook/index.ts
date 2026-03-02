import Stripe from "npm:stripe@16.2.0";

/**
 * Stripe Webhook - App Geocercas (PREVIEW)
 * - Verifica firma Stripe-Signature
 * - Extrae org_id desde metadata (session/subscription/invoice)
 * - Llama RPC (service_role) para aplicar estado a org_billing
 *
 * IMPORTANTES:
 * - Devuelve 2xx para eventos no manejados (evita retries)
 * - No toca producción; pensado para PREVIEW
 */

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SB_URL = Deno.env.get("SB_URL") ?? "";
const SB_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE") ?? "";

// Recomendado: mantener este flag para "hard stop" si alguien intenta mandar env=live a preview.
// Si en Stripe no estás enviando metadata.env, lo dejamos como warn-only.
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

/**
 * Busca org_id en múltiples ubicaciones típicas de Stripe:
 * - object.metadata.org_id
 * - customer_details.metadata.org_id (checkout session)
 * - subscription_details.metadata.org_id (checkout session)
 * - invoice.subscription_details.metadata.org_id (si aplica)
 */
function pickOrgIdFromAny(obj: any): string | null {
  const m = obj?.metadata;
  if (m?.org_id) return asString(m.org_id);

  const cm = obj?.customer_details?.metadata;
  if (cm?.org_id) return asString(cm.org_id);

  const sm = obj?.subscription_details?.metadata;
  if (sm?.org_id) return asString(sm.org_id);

  // Algunos objetos anidan subscription_details dentro de invoice
  const ism = obj?.subscription_details?.metadata;
  if (ism?.org_id) return asString(ism.org_id);

  return null;
}

function pickEnvFromAny(obj: any): string | null {
  const m = obj?.metadata;
  if (m?.env) return asString(m.env);
  const cm = obj?.customer_details?.metadata;
  if (cm?.env) return asString(cm.env);
  const sm = obj?.subscription_details?.metadata;
  if (sm?.env) return asString(sm.env);
  return null;
}

/**
 * RPC que aplica estado Stripe → org_billing.
 * Nota: aquí no invento SQL. Asumo que tu RPC existe:
 *   public.apply_stripe_subscription_to_org_billing(payload json/args...)
 *
 * Si tu RPC todavía no soporta invoice o event_id, no pasa nada:
 * enviamos lo que sabemos (customer/subscription/status/period_end/trial_end/price_id).
 */
async function callApplyRpc(payload: {
  org_id: string;

  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;

  // Opcional: para auditoría o mapping de plan por price_id
  price_id?: string | null;

  // status Stripe: trialing, active, past_due, unpaid, canceled, incomplete, etc.
  status?: string | null;

  // timestamps Stripe (segundos epoch)
  current_period_end?: number | null;
  trial_end?: number | null;

  // Opcionales: útiles si luego amplías la RPC
  // event_id?: string | null;
  // event_type?: string | null;
}) {
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

function pickPriceIdFromSubscriptionLike(obj: any): string | null {
  const item0 = obj?.items?.data?.[0];
  const pid = item0?.price?.id ? String(item0.price.id) : null;
  return pid ? pid : null;
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

    // IMPORTANTE: Stripe firma el RAW body. Usamos arrayBuffer para no alterar bytes.
    const raw = new Uint8Array(await req.arrayBuffer());
    const rawBody = new TextDecoder().decode(raw);

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      // 400 -> Stripe reintentará (está bien, porque la firma falló)
      return json(400, {
        error: "Invalid signature",
        detail: String((err as any)?.message ?? err),
      });
    }

    const type = event.type;

    // Eventos mínimos para monetización real (Stripe web)
    const interesting = new Set<string>([
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
    ]);

    if (!interesting.has(type)) {
      // 200 para que Stripe NO reintente por eventos que no te importan
      return json(200, { received: true, ignored: type });
    }

    const obj: any = (event.data as any)?.object ?? {};
    let org_id: string | null = pickOrgIdFromAny(obj);

    // Soft-guard env (warn-only)
    const env = pickEnvFromAny(obj);
    const env_warning =
      env && env !== EXPECTED_ENV
        ? `metadata.env=${env} differs from expected=${EXPECTED_ENV}`
        : null;

    let stripe_customer_id: string | null = null;
    let stripe_subscription_id: string | null = null;
    let price_id: string | null = null;
    let status: string | null = null;
    let trial_end: number | null = null;
    let current_period_end: number | null = null;

    // 1) checkout.session.completed
    // - trae customer + subscription
    // - a veces metadata viene en subscription, no en session: por eso hacemos retrieve.
    if (type === "checkout.session.completed") {
      stripe_customer_id = obj?.customer ? String(obj.customer) : null;
      stripe_subscription_id = obj?.subscription ? String(obj.subscription) : null;

      // session también puede traer metadata
      if (!org_id && stripe_subscription_id) {
        const sub = await stripe.subscriptions.retrieve(stripe_subscription_id);
        org_id = pickOrgIdFromAny(sub);

        status = sub?.status ? String(sub.status) : null;
        trial_end = sub?.trial_end ?? null;
        current_period_end = sub?.current_period_end ?? null;
        price_id = pickPriceIdFromSubscriptionLike(sub);
      }
    }

    // 2) customer.subscription.*  (created/updated/deleted)
    else if (type.startsWith("customer.subscription.")) {
      stripe_subscription_id = obj?.id ? String(obj.id) : null;
      stripe_customer_id = obj?.customer ? String(obj.customer) : null;
      status = obj?.status ? String(obj.status) : null;
      trial_end = obj?.trial_end ?? null;
      current_period_end = obj?.current_period_end ?? null;
      price_id = pickPriceIdFromSubscriptionLike(obj);
    }

    // 3) invoice.paid / invoice.payment_failed
    // - invoice trae customer y subscription; status real lo leemos desde subscription para consistencia.
    else if (type === "invoice.paid" || type === "invoice.payment_failed") {
      stripe_customer_id = obj?.customer ? String(obj.customer) : null;
      stripe_subscription_id = obj?.subscription ? String(obj.subscription) : null;

      // invoices a veces tienen metadata propia o no; si no hay org_id, lo resolvemos desde subscription.
      if (!org_id && stripe_subscription_id) {
        const sub = await stripe.subscriptions.retrieve(stripe_subscription_id);
        org_id = pickOrgIdFromAny(sub);
      }

      if (stripe_subscription_id) {
        const sub = await stripe.subscriptions.retrieve(stripe_subscription_id);
        status = sub?.status ? String(sub.status) : null;
        trial_end = sub?.trial_end ?? null;
        current_period_end = sub?.current_period_end ?? null;
        price_id = pickPriceIdFromSubscriptionLike(sub);
      } else {
        // fallback mínimo (raro)
        status = null;
      }
    }

    // Si no logramos org_id, respondemos 200 para evitar retries infinitos.
    // Pero avisamos para que tú lo veas en logs.
    if (!org_id) {
      return json(200, {
        received: true,
        warning: "org_id not found in metadata",
        type,
        env_warning,
      });
    }

    await callApplyRpc({
      org_id,
      stripe_customer_id,
      stripe_subscription_id,
      price_id,
      status,
      current_period_end,
      trial_end,
    });

    return json(200, {
      received: true,
      ok: true,
      type,
      org_id,
      env_warning,
    });
  } catch (e) {
    // 500 -> Stripe reintenta, útil si falló tu DB/RPC momentáneamente
    return json(500, {
      error: "Webhook error",
      detail: String((e as any)?.message ?? e),
    });
  }
});