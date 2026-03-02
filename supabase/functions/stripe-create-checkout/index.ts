import Stripe from "npm:stripe@14.25.0";

type ReqBody = {
  org_id: string;          // UUID organizations.id
  price_id: string;        // Stripe price_...
  success_path?: string;   // default: /billing/success
  cancel_path?: string;    // default: /billing/cancel
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function supabaseAdminFetch(path: string, init: RequestInit) {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRole = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  return await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      ...(init.headers ?? {}),
    },
  });
}

async function getOrgBilling(orgId: string) {
  const res = await supabaseAdminFetch(
    `/rest/v1/org_billing?org_id=eq.${encodeURIComponent(orgId)}&select=org_id,plan_code,plan_status,stripe_customer_id`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`org_billing fetch failed: ${await res.text()}`);
  const rows = await res.json();
  return rows?.[0] ?? null;
}

async function upsertStripeCustomerId(orgId: string, customerId: string) {
  const res = await supabaseAdminFetch(`/rest/v1/org_billing`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      org_id: orgId,
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`org_billing upsert failed: ${await res.text()}`);
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const stripeSecret = getEnv("STRIPE_SECRET_KEY");
    const appBaseUrl = getEnv("APP_BASE_URL");

    const stripe = new Stripe(stripeSecret, { apiVersion: "2023-10-16" });

    const body = (await req.json()) as ReqBody;
    const orgId = body.org_id?.trim();
    const priceId = body.price_id?.trim();

    if (!orgId || !priceId) {
      return json({ error: "org_id and price_id are required" }, 400);
    }

    // 1) Buscar billing
    const ob = await getOrgBilling(orgId);

    // 2) Crear customer si no existe
    let customerId = ob?.stripe_customer_id as string | null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { org_id: orgId },
        description: `Geocercas Org ${orgId}`,
      });
      customerId = customer.id;
      await upsertStripeCustomerId(orgId, customerId);
    } else {
      // garantizar metadata org_id
      await stripe.customers.update(customerId, { metadata: { org_id: orgId } });
    }

    const successPath = body.success_path ?? "/billing/success";
    const cancelPath = body.cancel_path ?? "/billing/cancel";

    // 3) Checkout Session (subscription + trial 14 días)
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 14,
        metadata: { org_id: orgId }, // CLAVE para webhook
      },
      success_url: `${appBaseUrl}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBaseUrl}${cancelPath}`,
    });

    return json({ url: session.url, session_id: session.id });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
