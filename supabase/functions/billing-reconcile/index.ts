import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { HttpError, requireOrgAdmin } from "../_shared/authz.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";

type BillingProvider = "stripe" | "paddle" | "dodo";
type PlanCode = "pro" | "enterprise";
type PlanStatus = "active" | "trialing" | "past_due" | "inactive" | "canceled";

type OrgBillingRow = {
  org_id: string;
  plan_code: string | null;
  subscribed_plan_code: string | null;
  plan_status: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean | null;
  canceled_at: string | null;
  billing_provider: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  paddle_price_id: string | null;
  scheduled_change_action: string | null;
  scheduled_change_effective_at: string | null;
  dodo_customer_id: string | null;
  dodo_subscription_id: string | null;
  dodo_product_id: string | null;
  updated_at: string | null;
};

type ReconcileInput = {
  org_id: string;
  dry_run: boolean;
};

type ProviderObservation = {
  provider: BillingProvider;
  provider_status_raw: string | null;
  mapped_plan_status: PlanStatus | null;
  mapped_plan_code: PlanCode | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean | null;
  canceled_at: string | null;
  external_ids: Record<string, string | null>;
  scheduled_change_action: string | null;
  scheduled_change_effective_at: string | null;
  terminal_confirmed: boolean;
  source: Record<string, unknown>;
};

type ProviderResolution = {
  provider: BillingProvider | null;
  reason: string | null;
};

type PlanEvidence = {
  known: boolean;
  consistent: boolean;
  unequivocal: boolean;
  reason: string | null;
  stale_subscription: boolean;
};

class ProviderRequestError extends Error {
  upstreamStatus: number | null;

  constructor(message: string, upstreamStatus: number | null = null) {
    super(message);
    this.upstreamStatus = upstreamStatus;
  }
}

type ReconcileDecision = {
  ok: boolean;
  dry_run: boolean;
  org_id: string;
  auth_mode: "user" | "server";
  provider_detected: BillingProvider;
  org_billing_current: Partial<OrgBillingRow>;
  provider_observed: ProviderObservation;
  proposed_changes: Record<string, unknown>;
  blocked_changes: Record<string, { reason: string; attempted_value: unknown }>;
  would_apply: boolean;
  applied: boolean;
  no_downgrade_guard_applied: boolean;
  message: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ALLOWED_PATCH_FIELDS = new Set([
  "plan_code",
  "subscribed_plan_code",
  "plan_status",
  "current_period_end",
  "trial_ends_at",
  "cancel_at_period_end",
  "canceled_at",
  "billing_provider",
  "stripe_customer_id",
  "stripe_subscription_id",
  "stripe_price_id",
  "paddle_customer_id",
  "paddle_subscription_id",
  "paddle_price_id",
  "scheduled_change_action",
  "scheduled_change_effective_at",
  "dodo_customer_id",
  "dodo_subscription_id",
  "dodo_product_id",
  "updated_at",
]);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanLower(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function asBooleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return null;
}

function parseIsoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : Math.round(value * 1000);
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;

    if (/^\d+$/.test(s)) {
      const n = Number(s);
      return parseIsoTimestamp(n);
    }

    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  return null;
}

function toPlanCodeByStripePrice(priceId: string | null): PlanCode | null {
  if (!priceId) return null;
  const pro = Deno.env.get("STRIPE_PRICE_PRO") ?? "";
  const enterprise = Deno.env.get("STRIPE_PRICE_ENTERPRISE") ?? "";
  if (pro && priceId === pro) return "pro";
  if (enterprise && priceId === enterprise) return "enterprise";
  return null;
}

function getPaddleEnv(): "sandbox" | "live" {
  const v = cleanLower(Deno.env.get("PADDLE_ENV"));
  if (v === "live") return "live";
  return "sandbox";
}

function getPaddleApiKey(env: "sandbox" | "live"): string {
  const key = env === "live"
    ? Deno.env.get("PADDLE_API_KEY_LIVE")
    : Deno.env.get("PADDLE_API_KEY_SANDBOX");
  if (!key) throw new Error(`Missing Paddle API key for env: ${env}`);
  return key;
}

function getPaddlePriceIds(env: "sandbox" | "live") {
  const pro = env === "live"
    ? Deno.env.get("PADDLE_PRO_PRICE_ID_LIVE")
    : Deno.env.get("PADDLE_PRO_PRICE_ID_SANDBOX");
  const enterprise = env === "live"
    ? Deno.env.get("PADDLE_ENTERPRISE_PRICE_ID_LIVE")
    : Deno.env.get("PADDLE_ENTERPRISE_PRICE_ID_SANDBOX");
  return { pro: pro ?? null, enterprise: enterprise ?? null };
}

function toPlanCodeByPaddlePrice(priceId: string | null): PlanCode | null {
  if (!priceId) return null;
  const env = getPaddleEnv();
  const ids = getPaddlePriceIds(env);
  if (ids.pro && priceId === ids.pro) return "pro";
  if (ids.enterprise && priceId === ids.enterprise) return "enterprise";
  return null;
}

function getDodoEnv(): "test" | "live" {
  return cleanLower(Deno.env.get("DODO_ENV")) === "live" ? "live" : "test";
}

function getDodoEnvValue(baseName: string, env: "test" | "live", fallback?: string): string {
  const suffix = env === "live" ? "LIVE" : "TEST";
  const envSpecific = Deno.env.get(`${baseName}_${suffix}`);
  if (envSpecific) return envSpecific;
  if (fallback) return fallback;
  throw new Error(`Missing env var: ${baseName}_${suffix}`);
}

function dodoProductIdForPlan(plan: PlanCode): string {
  const env = getDodoEnv();
  return plan === "pro"
    ? getDodoEnvValue("DODO_PRODUCT_ID_PRO", env)
    : getDodoEnvValue("DODO_PRODUCT_ID_ENTERPRISE", env);
}

function toPlanCodeByDodoProduct(productId: string | null): PlanCode | null {
  if (!productId) return null;
  const env = getDodoEnv();
  const pro = getDodoEnvValue("DODO_PRODUCT_ID_PRO", env);
  const enterprise = getDodoEnvValue("DODO_PRODUCT_ID_ENTERPRISE", env);
  if (productId === pro) return "pro";
  if (productId === enterprise) return "enterprise";
  return null;
}

function mapStripeStatus(status: string | null): PlanStatus | null {
  const v = cleanLower(status);
  if (v === "active") return "active";
  if (v === "trialing") return "trialing";
  if (v === "past_due") return "past_due";
  if (v === "canceled" || v === "cancelled") return "canceled";
  if (v === "unpaid" || v === "incomplete_expired") return "inactive";
  return null;
}

function mapPaddleStatus(status: string | null): PlanStatus | null {
  const v = cleanLower(status);
  if (v === "active") return "active";
  if (v === "trialing") return "trialing";
  if (v === "past_due") return "past_due";
  if (v === "paused") return "inactive";
  if (v === "canceled" || v === "cancelled") return "canceled";
  return null;
}

function mapDodoStatus(status: string | null): PlanStatus | null {
  const v = cleanLower(status);
  if (v === "active") return "active";
  if (v === "trialing") return "trialing";
  if (v === "past_due") return "past_due";
  if (v === "paused") return "inactive";
  if (v === "canceled" || v === "cancelled" || v === "expired") return "canceled";
  return null;
}

function isDowngradeStatus(fromStatus: string | null, toStatus: string | null): boolean {
  const rank: Record<string, number> = {
    active: 5,
    trialing: 4,
    past_due: 3,
    inactive: 2,
    canceled: 1,
    free: 0,
    unknown: 0,
  };

  const from = rank[cleanLower(fromStatus) || "unknown"] ?? 0;
  const to = rank[cleanLower(toStatus) || "unknown"] ?? 0;
  return to < from;
}

function resolveProvider(row: OrgBillingRow): ProviderResolution {
  const current = cleanLower(row.billing_provider);
  if (current === "stripe" || current === "paddle" || current === "dodo") {
    return { provider: current, reason: null };
  }

  const candidates = new Set<BillingProvider>();
  if (row.stripe_subscription_id || row.stripe_customer_id) candidates.add("stripe");
  if (row.paddle_subscription_id || row.paddle_customer_id) candidates.add("paddle");
  if (row.dodo_subscription_id || row.dodo_customer_id || row.dodo_product_id) {
    candidates.add("dodo");
  }

  if (candidates.size === 1) {
    return { provider: Array.from(candidates)[0], reason: null };
  }

  if (candidates.size === 0) {
    return {
      provider: null,
      reason: "provider_unresolved_no_external_ids",
    };
  }

  return {
    provider: null,
    reason: "provider_ambiguous_multiple_external_ids",
  };
}

function isServerToServerRequest(req: Request): boolean {
  const rawSecretKeys = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
  if (!rawSecretKeys) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawSecretKeys);
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;

  const defaultSecret = (parsed as Record<string, unknown>).default;
  if (typeof defaultSecret !== "string" || !defaultSecret) return false;

  const apikey = req.headers.get("apikey") || "";
  return apikey === defaultSecret;
}

function normalizePlanCode(value: unknown): PlanCode | null {
  const v = cleanLower(value);
  if (v === "pro") return "pro";
  if (v === "enterprise") return "enterprise";
  return null;
}

function planRank(value: PlanCode): number {
  return value === "enterprise" ? 2 : 1;
}

function providerSubscriptionIdFromRow(row: OrgBillingRow, provider: BillingProvider): string | null {
  if (provider === "stripe") return asString(row.stripe_subscription_id);
  if (provider === "paddle") return asString(row.paddle_subscription_id);
  return asString(row.dodo_subscription_id);
}

function providerSubscriptionIdFromObservation(obs: ProviderObservation): string | null {
  if (obs.provider === "stripe") return asString(obs.external_ids.stripe_subscription_id);
  if (obs.provider === "paddle") return asString(obs.external_ids.paddle_subscription_id);
  return asString(obs.external_ids.dodo_subscription_id);
}

function evaluatePlanEvidence(current: OrgBillingRow, obs: ProviderObservation): PlanEvidence {
  const observedPlan = obs.mapped_plan_code;
  if (!observedPlan) {
    return {
      known: false,
      consistent: false,
      unequivocal: false,
      reason: "unknown_price_or_product_mapping",
      stale_subscription: false,
    };
  }

  const currentSubscriptionId = providerSubscriptionIdFromRow(current, obs.provider);
  const observedSubscriptionId = providerSubscriptionIdFromObservation(obs);

  const staleSubscription = Boolean(
    currentSubscriptionId &&
      observedSubscriptionId &&
      currentSubscriptionId !== observedSubscriptionId,
  );

  if (!observedSubscriptionId) {
    return {
      known: true,
      consistent: false,
      unequivocal: false,
      reason: "missing_provider_subscription_evidence",
      stale_subscription: staleSubscription,
    };
  }

  if (staleSubscription) {
    return {
      known: true,
      consistent: false,
      unequivocal: false,
      reason: "stale_subscription",
      stale_subscription: true,
    };
  }

  if (obs.provider === "stripe") {
    const priceId = asString(obs.external_ids.stripe_price_id);
    if (!priceId) {
      return {
        known: false,
        consistent: false,
        unequivocal: false,
        reason: "missing_stripe_price_id",
        stale_subscription: false,
      };
    }

    const mapped = toPlanCodeByStripePrice(priceId);
    const consistent = mapped === observedPlan;
    return {
      known: mapped !== null,
      consistent,
      unequivocal: Boolean(mapped && consistent),
      reason: consistent ? null : "stripe_price_plan_mismatch",
      stale_subscription: false,
    };
  }

  if (obs.provider === "paddle") {
    const priceId = asString(obs.external_ids.paddle_price_id);
    if (!priceId) {
      return {
        known: false,
        consistent: false,
        unequivocal: false,
        reason: "missing_paddle_price_id",
        stale_subscription: false,
      };
    }

    const mapped = toPlanCodeByPaddlePrice(priceId);
    const consistent = mapped === observedPlan;
    return {
      known: mapped !== null,
      consistent,
      unequivocal: Boolean(mapped && consistent),
      reason: consistent ? null : "paddle_price_plan_mismatch",
      stale_subscription: false,
    };
  }

  const productId = asString(obs.external_ids.dodo_product_id);
  if (!productId) {
    return {
      known: false,
      consistent: false,
      unequivocal: false,
      reason: "missing_dodo_product_id",
      stale_subscription: false,
    };
  }

  const mapped = toPlanCodeByDodoProduct(productId);
  if (!mapped) {
    return {
      known: false,
      consistent: false,
      unequivocal: false,
      reason: "unknown_dodo_product_id",
      stale_subscription: false,
    };
  }

  const expectedProductId = dodoProductIdForPlan(observedPlan);
  const consistent = mapped === observedPlan && productId === expectedProductId;

  return {
    known: true,
    consistent,
    unequivocal: consistent,
    reason: consistent ? null : "dodo_product_plan_mismatch",
    stale_subscription: false,
  };
}

function summarizeCurrent(row: OrgBillingRow): Partial<OrgBillingRow> {
  return {
    org_id: row.org_id,
    plan_code: row.plan_code,
    subscribed_plan_code: row.subscribed_plan_code,
    plan_status: row.plan_status,
    current_period_end: row.current_period_end,
    trial_ends_at: row.trial_ends_at,
    cancel_at_period_end: row.cancel_at_period_end,
    canceled_at: row.canceled_at,
    billing_provider: row.billing_provider,
    stripe_customer_id: row.stripe_customer_id,
    stripe_subscription_id: row.stripe_subscription_id,
    stripe_price_id: row.stripe_price_id,
    paddle_customer_id: row.paddle_customer_id,
    paddle_subscription_id: row.paddle_subscription_id,
    paddle_price_id: row.paddle_price_id,
    scheduled_change_action: row.scheduled_change_action,
    scheduled_change_effective_at: row.scheduled_change_effective_at,
    dodo_customer_id: row.dodo_customer_id,
    dodo_subscription_id: row.dodo_subscription_id,
    dodo_product_id: row.dodo_product_id,
    updated_at: row.updated_at,
  };
}

async function getOrgBilling(orgId: string): Promise<OrgBillingRow> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("org_billing")
    .select(
      [
        "org_id",
        "plan_code",
        "subscribed_plan_code",
        "plan_status",
        "current_period_end",
        "trial_ends_at",
        "cancel_at_period_end",
        "canceled_at",
        "billing_provider",
        "stripe_customer_id",
        "stripe_subscription_id",
        "stripe_price_id",
        "paddle_customer_id",
        "paddle_subscription_id",
        "paddle_price_id",
        "scheduled_change_action",
        "scheduled_change_effective_at",
        "dodo_customer_id",
        "dodo_subscription_id",
        "dodo_product_id",
        "updated_at",
      ].join(","),
    )
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`org_billing lookup failed: ${error.message}`);
  }

  if (!data) {
    throw new HttpError(404, "org_billing row not found");
  }

  return data as unknown as OrgBillingRow;
}

async function observeStripe(row: OrgBillingRow): Promise<ProviderObservation> {
  const subscriptionId = asString(row.stripe_subscription_id);
  if (!subscriptionId) {
    throw new Error("Missing stripe_subscription_id in org_billing");
  }

  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");

  const res = await fetch(
    `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=items.data.price`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );

  const raw = await res.text();
  let subObj: Record<string, unknown> | null = null;
  try {
    subObj = raw ? JSON.parse(raw) as Record<string, unknown> : null;
  } catch {
    subObj = null;
  }

  if (!res.ok || !subObj) {
    throw new ProviderRequestError(`Stripe subscription query failed (${res.status})`, res.status);
  }

  const items = asArray(asObject(subObj.items)?.data);
  const firstItem = asObject(items[0]);
  const firstItemPrice = asObject(firstItem?.price);

  const stripeStatus = asString(subObj.status);
  const stripePriceId = asString(firstItemPrice?.id);
  const currentPeriodEnd = parseIsoTimestamp(subObj.current_period_end);
  const trialEnd = parseIsoTimestamp(subObj.trial_end);
  const canceledAt = parseIsoTimestamp(subObj.canceled_at);
  const cancelAtPeriodEnd = subObj.cancel_at_period_end !== undefined
    ? Boolean(subObj.cancel_at_period_end)
    : null;

  const mappedStatus = mapStripeStatus(stripeStatus);
  const mappedPlan = toPlanCodeByStripePrice(stripePriceId);

  return {
    provider: "stripe",
    provider_status_raw: stripeStatus,
    mapped_plan_status: mappedStatus,
    mapped_plan_code: mappedPlan,
    current_period_end: currentPeriodEnd,
    trial_ends_at: trialEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    canceled_at: canceledAt,
    external_ids: {
      stripe_customer_id: asString(subObj.customer),
      stripe_subscription_id: asString(subObj.id),
      stripe_price_id: stripePriceId,
    },
    scheduled_change_action: null,
    scheduled_change_effective_at: null,
    terminal_confirmed: mappedStatus === "inactive" || mappedStatus === "canceled",
    source: {
      status: stripeStatus,
      cancel_at_period_end: cancelAtPeriodEnd,
      has_trial_end: Boolean(trialEnd),
      has_current_period_end: Boolean(currentPeriodEnd),
    },
  };
}

async function observePaddle(row: OrgBillingRow): Promise<ProviderObservation> {
  const subscriptionId = asString(row.paddle_subscription_id);
  if (!subscriptionId) {
    throw new Error("Missing paddle_subscription_id in org_billing");
  }

  const env = getPaddleEnv();
  const apiKey = getPaddleApiKey(env);
  const baseUrl = env === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

  const res = await fetch(`${baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  const raw = await res.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }

  if (!res.ok || !body) {
    throw new ProviderRequestError(`Paddle subscription query failed (${res.status})`, res.status);
  }

  const dataObj = asObject(body?.data) ?? body;
  const firstItem = asObject(asArray(dataObj?.items)[0]);
  const firstItemPrice = asObject(firstItem?.price);
  const firstSubItem = asObject(asArray(dataObj?.subscription_items)[0]);
  const firstSubItemPrice = asObject(firstSubItem?.price);
  const currentBillingPeriod = asObject(dataObj?.current_billing_period);
  const customerObj = asObject(dataObj?.customer);
  const scheduledChange = asObject(dataObj?.scheduled_change);
  const priceId = asString(
    firstItemPrice?.id ??
      firstItem?.price_id ??
      firstSubItemPrice?.id ??
      firstSubItem?.price_id,
  );
  const statusRaw = asString(dataObj?.status);
  const scheduledChangeAction = asString(scheduledChange?.action);
  const scheduledChangeEffectiveAt = parseIsoTimestamp(scheduledChange?.effective_at);
  const currentPeriodEnd = parseIsoTimestamp(
    currentBillingPeriod?.ends_at ??
      dataObj?.next_billed_at ??
      dataObj?.next_bill_date,
  );
  const canceledAt = parseIsoTimestamp(dataObj?.canceled_at ?? dataObj?.cancelled_at);
  const mappedStatus = mapPaddleStatus(statusRaw);
  const mappedPlan = toPlanCodeByPaddlePrice(priceId);
  const cancelAtPeriodEnd = scheduledChangeAction === "cancel" ? true : null;

  return {
    provider: "paddle",
    provider_status_raw: statusRaw,
    mapped_plan_status: mappedStatus,
    mapped_plan_code: mappedPlan,
    current_period_end: currentPeriodEnd,
    trial_ends_at: null,
    cancel_at_period_end: cancelAtPeriodEnd,
    canceled_at: canceledAt,
    external_ids: {
      paddle_customer_id: asString(dataObj?.customer_id ?? customerObj?.id),
      paddle_subscription_id: asString(dataObj?.id ?? dataObj?.subscription_id),
      paddle_price_id: priceId,
    },
    scheduled_change_action: scheduledChangeAction,
    scheduled_change_effective_at: scheduledChangeEffectiveAt,
    terminal_confirmed: mappedStatus === "inactive" || mappedStatus === "canceled",
    source: {
      env,
      status: statusRaw,
      has_scheduled_change: Boolean(scheduledChange),
    },
  };
}

async function observeDodo(row: OrgBillingRow): Promise<ProviderObservation> {
  const subscriptionId = asString(row.dodo_subscription_id);
  if (!subscriptionId) {
    throw new Error("Missing dodo_subscription_id in org_billing");
  }

  const env = getDodoEnv();
  const apiKey = getDodoEnvValue("DODO_API_KEY", env);
  const baseUrl = getDodoEnvValue(
    "DODO_API_BASE_URL",
    env,
    env === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com",
  ).replace(/\/+$/, "");

  const res = await fetch(`${baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  const raw = await res.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }

  if (!res.ok || !body) {
    throw new ProviderRequestError(`DODO subscription query failed (${res.status})`, res.status);
  }

  const dataObj = asObject(body?.data) ?? body;
  const productObj = asObject(dataObj?.product);
  const customerObj = asObject(dataObj?.customer);
  const statusRaw = asString(dataObj?.status);
  const productId = asString(dataObj?.product_id ?? productObj?.product_id ?? productObj?.id);
  const currentPeriodEnd = parseIsoTimestamp(
    dataObj?.next_billing_date ??
      dataObj?.current_period_end ??
      dataObj?.expires_at,
  );
  const cancelAtPeriodEnd = asBooleanOrNull(dataObj?.cancel_at_period_end);
  const canceledAt = parseIsoTimestamp(dataObj?.canceled_at ?? dataObj?.cancelled_at ?? dataObj?.ended_at);

  const mappedStatus = mapDodoStatus(statusRaw);
  const mappedPlan = toPlanCodeByDodoProduct(productId);
  const terminalConfirmed =
    mappedStatus === "inactive" ||
    mappedStatus === "canceled" ||
    cleanLower(statusRaw) === "expired";

  return {
    provider: "dodo",
    provider_status_raw: statusRaw,
    mapped_plan_status: mappedStatus,
    mapped_plan_code: mappedPlan,
    current_period_end: currentPeriodEnd,
    trial_ends_at: null,
    cancel_at_period_end: cancelAtPeriodEnd,
    canceled_at: canceledAt,
    external_ids: {
      dodo_customer_id: asString(dataObj?.customer_id ?? customerObj?.id),
      dodo_subscription_id: asString(dataObj?.subscription_id ?? dataObj?.id),
      dodo_product_id: productId,
    },
    scheduled_change_action: null,
    scheduled_change_effective_at: null,
    terminal_confirmed: terminalConfirmed,
    source: {
      env,
      status: statusRaw,
      has_product_id: Boolean(productId),
    },
  };
}

function buildCandidatePatch(_row: OrgBillingRow, obs: ProviderObservation): Record<string, unknown> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    billing_provider: obs.provider,
    updated_at: now,
  };

  if (obs.mapped_plan_code) {
    patch.plan_code = obs.mapped_plan_code;
    patch.subscribed_plan_code = obs.mapped_plan_code;
  }

  if (obs.mapped_plan_status) {
    patch.plan_status = obs.mapped_plan_status;
  }

  if (obs.current_period_end !== null) {
    patch.current_period_end = obs.current_period_end;
  }

  if (obs.provider === "stripe" && obs.trial_ends_at !== null) {
    // Stripe is the only source allowed to set trial_ends_at in reconcile.
    patch.trial_ends_at = obs.trial_ends_at;
  }

  if (obs.cancel_at_period_end !== null) {
    patch.cancel_at_period_end = obs.cancel_at_period_end;
  }

  if (obs.canceled_at !== null) {
    patch.canceled_at = obs.canceled_at;
  }

  if (obs.provider === "paddle") {
    patch.scheduled_change_action = obs.scheduled_change_action;
    patch.scheduled_change_effective_at = obs.scheduled_change_effective_at;
  }

  for (const [k, v] of Object.entries(obs.external_ids)) {
    if (v !== null) patch[k] = v;
  }

  const allowedOnly = Object.fromEntries(
    Object.entries(patch).filter(([k]) => ALLOWED_PATCH_FIELDS.has(k)),
  );

  // Never modify provider event timestamps in reconcile.
  delete (allowedOnly as Record<string, unknown>).last_stripe_event_at;
  delete (allowedOnly as Record<string, unknown>).last_paddle_event_at;
  delete (allowedOnly as Record<string, unknown>).last_dodo_event_at;

  return allowedOnly;
}

function filterChangedFields(
  current: OrgBillingRow,
  candidatePatch: Record<string, unknown>,
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, next] of Object.entries(candidatePatch)) {
    const prev = (current as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      changed[key] = next;
    }
  }
  return changed;
}

function applyNoDowngradeGuards(params: {
  current: OrgBillingRow;
  observed: ProviderObservation;
  proposedChanges: Record<string, unknown>;
}): { safeChanges: Record<string, unknown>; blockedChanges: Record<string, { reason: string; attempted_value: unknown }>; guardApplied: boolean } {
  const { current, observed } = params;
  const proposed = { ...params.proposedChanges };
  const blocked: Record<string, { reason: string; attempted_value: unknown }> = {};
  let guardApplied = false;

  const evidence = evaluatePlanEvidence(current, observed);

  if (evidence.stale_subscription) {
    for (const [key, attemptedValue] of Object.entries(proposed)) {
      blocked[key] = {
        reason: "stale_subscription_no_write",
        attempted_value: attemptedValue,
      };
    }

    return {
      safeChanges: {},
      blockedChanges: blocked,
      guardApplied: true,
    };
  }

  const currentPlan = normalizePlanCode(current.subscribed_plan_code ?? current.plan_code);
  const nextPlan = normalizePlanCode(proposed.subscribed_plan_code ?? proposed.plan_code);
  const hasPlanChangeRequest = "plan_code" in proposed || "subscribed_plan_code" in proposed;

  if (hasPlanChangeRequest) {
    let blockReason: string | null = null;

    if (!nextPlan) {
      blockReason = "unknown_target_plan";
    } else if (!evidence.known) {
      blockReason = evidence.reason ?? "unknown_price_or_product_mapping";
    } else if (!evidence.consistent) {
      blockReason = evidence.reason ?? "mapping_inconsistent";
    } else if (evidence.stale_subscription) {
      blockReason = "stale_subscription";
    }

    if (blockReason) {
      if ("plan_code" in proposed) {
        blocked.plan_code = {
          reason: blockReason,
          attempted_value: proposed.plan_code,
        };
        delete proposed.plan_code;
      }
      if ("subscribed_plan_code" in proposed) {
        blocked.subscribed_plan_code = {
          reason: blockReason,
          attempted_value: proposed.subscribed_plan_code,
        };
        delete proposed.subscribed_plan_code;
      }
      guardApplied = true;
    }

    const safeNextPlan = normalizePlanCode(proposed.subscribed_plan_code ?? proposed.plan_code);
    if (currentPlan && safeNextPlan && planRank(safeNextPlan) < planRank(currentPlan) && !evidence.unequivocal) {
      if ("plan_code" in proposed) {
        blocked.plan_code = {
          reason: "downgrade_dubious_without_unequivocal_evidence",
          attempted_value: proposed.plan_code,
        };
        delete proposed.plan_code;
      }
      if ("subscribed_plan_code" in proposed) {
        blocked.subscribed_plan_code = {
          reason: "downgrade_dubious_without_unequivocal_evidence",
          attempted_value: proposed.subscribed_plan_code,
        };
        delete proposed.subscribed_plan_code;
      }
      guardApplied = true;
    }
  }

  const nextStatus = asString(proposed.plan_status);
  const currentStatus = asString(current.plan_status);

  if (
    nextStatus &&
    isDowngradeStatus(currentStatus, nextStatus) &&
    (!observed.terminal_confirmed || evidence.stale_subscription)
  ) {
    blocked.plan_status = {
      reason: "no_downgrade_without_terminal_provider_confirmation",
      attempted_value: nextStatus,
    };
    delete proposed.plan_status;
    guardApplied = true;
  }

  if (blocked.plan_status) {
    if ("cancel_at_period_end" in proposed) {
      blocked.cancel_at_period_end = {
        reason: "blocked_with_plan_status_downgrade",
        attempted_value: proposed.cancel_at_period_end,
      };
      delete proposed.cancel_at_period_end;
    }
    if ("canceled_at" in proposed) {
      blocked.canceled_at = {
        reason: "blocked_with_plan_status_downgrade",
        attempted_value: proposed.canceled_at,
      };
      delete proposed.canceled_at;
    }
  }

  return {
    safeChanges: proposed,
    blockedChanges: blocked,
    guardApplied,
  };
}

async function applyPatch(orgId: string, patch: Record<string, unknown>) {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from("org_billing")
    .update(patch)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`org_billing update failed: ${error.message}`);
  }
}

function parseInput(body: Record<string, unknown>): ReconcileInput {
  const orgId = asString(body.org_id ?? body.orgId);
  if (!orgId) throw new HttpError(400, "org_id required");

  const dryRaw = body.dry_run ?? body.dryRun;
  const dryRun = dryRaw === undefined
    ? true
    : typeof dryRaw === "boolean"
    ? dryRaw
    : cleanLower(dryRaw) === "true";

  return { org_id: orgId, dry_run: dryRun };
}

async function authorize(req: Request, orgId: string): Promise<{ authMode: "user" | "server" }> {
  if (isServerToServerRequest(req)) {
    return { authMode: "server" };
  }

  await requireOrgAdmin(req, orgId);
  return { authMode: "user" };
}

async function observeProvider(provider: BillingProvider, row: OrgBillingRow): Promise<ProviderObservation> {
  if (provider === "stripe") return await observeStripe(row);
  if (provider === "paddle") return await observePaddle(row);
  return await observeDodo(row);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { ok: false, error: "invalid_json_body" });
    }

    const input = parseInput(body);
    const { authMode } = await authorize(req, input.org_id);

    if (authMode === "user" && !input.dry_run) {
      return json(403, {
        ok: false,
        error: "forbidden_non_dry_run_for_user",
        message: "Only server mode can execute dry_run=false",
      });
    }

    const current = await getOrgBilling(input.org_id);
    const providerResolution = resolveProvider(current);
    if (!providerResolution.provider) {
      return json(409, {
        ok: false,
        error: "provider_ambiguous",
        reason: providerResolution.reason,
        org_id: input.org_id,
      });
    }
    const provider = providerResolution.provider;

    const observed = await observeProvider(provider, current);
    const candidatePatch = buildCandidatePatch(current, observed);
    const changedPatch = filterChangedFields(current, candidatePatch);

    const { safeChanges, blockedChanges, guardApplied } = applyNoDowngradeGuards({
      current,
      observed,
      proposedChanges: changedPatch,
    });

    const wouldApply = Object.keys(safeChanges).length > 0;

    let applied = false;
    if (!input.dry_run && wouldApply) {
      await applyPatch(input.org_id, safeChanges);
      applied = true;
    }

    const decision: ReconcileDecision = {
      ok: true,
      dry_run: input.dry_run,
      org_id: input.org_id,
      auth_mode: authMode,
      provider_detected: provider,
      org_billing_current: summarizeCurrent(current),
      provider_observed: observed,
      proposed_changes: safeChanges,
      blocked_changes: blockedChanges,
      would_apply: wouldApply,
      applied,
      no_downgrade_guard_applied: guardApplied,
      message: input.dry_run
        ? "dry_run completed without DB writes"
        : applied
        ? "reconcile applied"
        : "no changes required",
    };

    return json(200, decision);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      return json(502, {
        ok: false,
        error: "provider_request_failed",
        message: error.message,
        retryable: true,
        upstream_status: error.upstreamStatus,
      });
    }

    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);

    // Provider/API failures are conservative: no write, no downgrade.
    const providerFailure = status === 500;
    return json(status, {
      ok: false,
      error: status === 500 ? "reconcile_failed_provider_or_internal" : "reconcile_failed",
      message,
      no_downgrade_preserved: providerFailure,
    });
  }
});
