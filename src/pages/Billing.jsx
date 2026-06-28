// src/pages/Billing.jsx
import React, { useEffect, useMemo, useState } from "react";
import useOrgEntitlements from "@/hooks/useOrgEntitlements.js";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import { supabase } from "../lib/supabaseClient.js";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton";
import ManageSubscriptionButton from "../components/Billing/ManageSubscriptionButton";
import { formatPlanPrice } from "../config/pricing";

function resolveDateLocale(language) {
  const lang = String(language || "").toLowerCase();
  if (lang.startsWith("es")) return "es-EC";
  if (lang.startsWith("en")) return "en-US";
  if (lang.startsWith("fr")) return "fr-FR";
  return "es-EC";
}

function formatDate(value, locale) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function formatLimit(value, unlimitedLabel = "Unlimited") {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n === 0) return "0";
  if (n >= 9999) return unlimitedLabel;
  return String(n);
}

function formatUsage(current, limit, unlimitedLabel = "Unlimited") {
  const c = Number(current);
  const l = Number(limit);

  if (!Number.isFinite(c)) return "—";
  if (!Number.isFinite(l) || l < 0) return "—";
  if (l >= 9999) return `${c} / ${unlimitedLabel}`;
  return `${c} / ${l}`;
}

function buildUsageState(current, limit) {
  const c = Number(current);
  const l = Number(limit);

  if (!Number.isFinite(c) || !Number.isFinite(l) || l <= 0) {
    return { hasData: false, pct: null };
  }

  return {
    hasData: true,
    pct: clampPct((c / l) * 100),
  };
}

function getUsageSeverity(state, isOverLimit) {
  if (!state?.hasData) return "neutral";
  if (isOverLimit || state.pct >= 100) return "critical";
  if (state.pct >= 80) return "warning";
  return "ok";
}

function usageCardTone(severity) {
  if (severity === "critical") return "border-rose-300 bg-rose-50";
  if (severity === "warning") return "border-amber-300 bg-amber-50";
  if (severity === "ok") return "border-emerald-100 bg-emerald-50";
  return "border-emerald-100 bg-emerald-50";
}

function formatTrialCountdown(value, locale, labels) {
  if (!value) return "";
  const end = new Date(value);
  if (Number.isNaN(end.getTime())) return "";

  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return labels.expired;

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) {
    return labels.daysHours.replace("{{days}}", String(days)).replace("{{hours}}", String(hours));
  }

  if (hours > 0) {
    return labels.hours.replace("{{hours}}", String(hours));
  }

  return labels.lessThanHour;
}

function isMissingBillingViewError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("v_billing_panel")
  );
}

function normalizePlanCode(value) {
  return String(value || "free").toLowerCase();
}

function normalizePlanStatus(value) {
  return String(value || "").toLowerCase().trim();
}

function hasActivePaidOrgBilling(orgBilling) {
  const planCode = normalizePlanCode(
    orgBilling?.subscribed_plan_code || orgBilling?.plan_code || "free"
  );
  const status = normalizePlanStatus(orgBilling?.plan_status);
  return planCode !== "free" && ["active", "trialing", "past_due", "paused"].includes(status);
}

function mergeBillingPanelWithOrgBilling(panelBilling, orgBilling, orgId) {
  if (!panelBilling && !orgBilling) return null;

  const base = panelBilling || {};
  const useDirectBilling = Boolean(orgBilling?.billing_provider) || hasActivePaidOrgBilling(orgBilling);

  const directPlanCode =
    orgBilling?.subscribed_plan_code || orgBilling?.plan_code || base.effective_plan_code || base.billing_plan_code;
  const basePlanCode = base.effective_plan_code || base.billing_plan_code || orgBilling?.subscribed_plan_code || orgBilling?.plan_code;

  return {
    ...base,
    org_id: base.org_id || orgBilling?.org_id || orgId || null,
    billing_plan_code: useDirectBilling
      ? orgBilling?.plan_code || base.billing_plan_code || "free"
      : base.billing_plan_code || orgBilling?.plan_code || "free",
    effective_plan_code: useDirectBilling ? directPlanCode || "free" : basePlanCode || "free",
    plan_status: useDirectBilling
      ? orgBilling?.plan_status || base.plan_status || "unknown"
      : base.plan_status || orgBilling?.plan_status || "unknown",
    current_period_end: useDirectBilling
      ? orgBilling?.current_period_end || base.current_period_end || null
      : base.current_period_end || orgBilling?.current_period_end || null,
    subscribed_plan_code: orgBilling?.subscribed_plan_code || base.subscribed_plan_code || null,
    billing_provider: orgBilling?.billing_provider || base.billing_provider || null,
    dodo_customer_id: orgBilling?.dodo_customer_id || base.dodo_customer_id || null,
    dodo_subscription_id: orgBilling?.dodo_subscription_id || base.dodo_subscription_id || null,
    dodo_product_id: orgBilling?.dodo_product_id || base.dodo_product_id || null,
    dodo_checkout_session_id:
      orgBilling?.dodo_checkout_session_id || base.dodo_checkout_session_id || null,
    dodo_payment_id: orgBilling?.dodo_payment_id || base.dodo_payment_id || null,
    last_dodo_event_at: orgBilling?.last_dodo_event_at || base.last_dodo_event_at || null,
  };
}

function labelPlan(planCode, tr) {
  const code = normalizePlanCode(planCode);

  if (code === "free" || code === "starter") {
    return tr("billing.status.free", "Free");
  }

  if (code === "pro") {
    return "PRO";
  }

  if (code === "enterprise") {
    return "Enterprise";
  }

  return String(code || "—").toUpperCase();
}

function labelStatus(status, tr) {
  const v = String(status || "").toLowerCase();
  if (v === "trialing") return tr("billing.status.trialing", "Trial");
  if (v === "active") return tr("billing.status.active", "Active");
  if (v === "past_due") return tr("billing.status.pastDue", "Past due");
  if (v === "canceled") return tr("billing.status.canceled", "Canceled");
  if (v === "free") return tr("billing.status.free", "Free");
  return tr("billing.status.unknown", "No commercial data");
}

function buildLangPath(pathname, language) {
  const lang = encodeURIComponent(language || "es");
  return `${pathname}?lang=${lang}`;
}

function localizedCopy(language, es, en, fr) {
  const lang = String(language || "").toLowerCase();
  if (lang.startsWith("en")) return en;
  if (lang.startsWith("fr")) return fr;
  return es;
}

export default function Billing() {
    // Get cancellationScheduled from entitlements
    const { cancellationScheduled } = useOrgEntitlements();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { loading, ready, authenticated, user, currentOrgId, isAdmin } = useAuth();

  const tr = React.useCallback(
    (key, fallback, options = {}) =>
      t(key, { defaultValue: fallback, ...options }),
    [t]
  );

  const dateLocale = useMemo(() => resolveDateLocale(i18n?.language), [i18n?.language]);

  const currentLang = useMemo(() => {
    const qp = new URLSearchParams(location.search).get("lang");
    return qp || i18n?.language || "es";
  }, [location.search, i18n?.language]);

  const billingCopy = React.useCallback(
    (es, en, fr) => localizedCopy(currentLang || i18n?.language, es, en, fr),
    [currentLang, i18n?.language]
  );

  const pricingHref = useMemo(() => buildLangPath("/pricing", currentLang), [currentLang]);
  const homeHref = useMemo(() => buildLangPath("/inicio", currentLang), [currentLang]);

  const [billing, setBilling] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [billingFallback, setBillingFallback] = useState(false);

  const unlimitedLabel = tr("pricing.common.unlimited", "Unlimited");
  const noDataLabel = tr("billing.common.noData", "No data");

  useEffect(() => {
    let cancelled = false;

    async function loadBilling() {
      if (!authenticated || !currentOrgId) {
        if (!cancelled) {
          setBilling(null);
          setBillingError("");
          setBillingFallback(false);
          setBillingLoading(false);
        }
        return;
      }

      try {
        if (!cancelled) {
          setBillingLoading(true);
          setBillingError("");
          setBillingFallback(false);
        }

        let panelBilling = null;
        let panelMissing = false;

        const { data, error } = await supabase
          .from("v_billing_panel")
          .select(`
            org_id,
            org_name,
            billing_plan_code,
            effective_plan_code,
            plan_status,
            trial_end,
            current_period_end,
            billing_over_limit,
            over_limit_reason,
            max_trackers,
            max_geocercas,
            trackers_used,
            geocercas_used,
            active_trackers_24h
          `)
          .eq("org_id", currentOrgId)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          if (isMissingBillingViewError(error)) {
            panelMissing = true;
          } else {
            throw error;
          }
        } else {
          panelBilling = data || null;
        }

        const { data: orgBilling, error: orgBillingError } = await supabase
          .from("org_billing")
          .select(`
            org_id,
            plan_code,
            subscribed_plan_code,
            plan_status,
            billing_provider,
            current_period_end,
            dodo_customer_id,
            dodo_subscription_id,
            dodo_product_id,
            dodo_checkout_session_id,
            dodo_payment_id,
            last_dodo_event_at
          `)
          .eq("org_id", currentOrgId)
          .maybeSingle();

        if (cancelled) return;

        if (orgBillingError) {
          console.warn("[Billing] could not load org_billing", orgBillingError);
        }

        const mergedBilling = mergeBillingPanelWithOrgBilling(
          panelBilling,
          orgBillingError ? null : orgBilling,
          currentOrgId
        );

        setBilling(mergedBilling);
        setBillingError("");
        setBillingFallback(panelMissing && !mergedBilling);
      } catch (err) {
        if (cancelled) return;

        setBilling(null);

        if (isMissingBillingViewError(err)) {
          setBillingFallback(true);
          setBillingError("");
        } else {
          setBillingFallback(false);
          setBillingError(
            tr("billing.errors.loadPlanStatus", "Could not load the plan status.")
          );
        }
      } finally {
        if (!cancelled) {
          setBillingLoading(false);
        }
      }
    }

    loadBilling();

    return () => {
      cancelled = true;
    };
  }, [authenticated, currentOrgId, tr]);

  const effectivePlanCode = useMemo(() => {
    return normalizePlanCode(
      billing?.effective_plan_code || billing?.billing_plan_code || "free"
    );
  }, [billing]);

  const effectivePlanStatus = useMemo(() => {
    const raw = billing?.plan_status;
    if (raw == null || raw === "") return "unknown";
    return String(raw).toLowerCase();
  }, [billing]);

  const isOverLimit = Boolean(billing?.billing_over_limit);
  const trialEndsAt = billing?.trial_end || null;

  const trackerUsageState = useMemo(
    () => buildUsageState(billing?.trackers_used, billing?.max_trackers),
    [billing]
  );

  const geofenceUsageState = useMemo(
    () => buildUsageState(billing?.geocercas_used, billing?.max_geocercas),
    [billing]
  );

  const trackerUsageSeverity = useMemo(
    () => getUsageSeverity(trackerUsageState, isOverLimit),
    [trackerUsageState, isOverLimit]
  );

  const geofenceUsageSeverity = useMemo(
    () => getUsageSeverity(geofenceUsageState, isOverLimit),
    [geofenceUsageState, isOverLimit]
  );

  const trialCountdown = useMemo(() => {
    return formatTrialCountdown(trialEndsAt, dateLocale, {
      expired: tr("billing.trial.expired", "Trial expired"),
      daysHours: tr("billing.trial.daysHours", "{{days}}d {{hours}}h remaining"),
      hours: tr("billing.trial.hours", "{{hours}}h remaining"),
      lessThanHour: tr("billing.trial.lessThanHour", "Less than 1 hour remaining"),
    });
  }, [trialEndsAt, dateLocale, tr]);

  const ctaVariant = useMemo(() => {
    if (billingFallback) return "none";
    if (isOverLimit) return "over_limit";
    if (effectivePlanStatus === "trialing") return "trialing";
    if (["free", "starter"].includes(effectivePlanCode)) return "free";
    return "none";
  }, [billingFallback, isOverLimit, effectivePlanStatus, effectivePlanCode]);

  const hasActivePlan = useMemo(
    () => ["active", "past_due", "paused"].includes(effectivePlanStatus),
    [effectivePlanStatus]
  );

  const normalizedPlanCodeForUpgrade = String(effectivePlanCode || "").toLowerCase();
  const normalizedPlanStatusForUpgrade = String(effectivePlanStatus || "").toLowerCase();
  const paidStatusForUpgrade = ["active", "trialing", "past_due", "paused"].includes(
    normalizedPlanStatusForUpgrade
  );
  const canUpgradeToEnterprise =
    normalizedPlanCodeForUpgrade === "pro" && paidStatusForUpgrade;

  if (loading || !ready) return null;

  if (!authenticated || !user) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-lg shadow-emerald-950/5">
          <h1 className="text-xl font-semibold text-emerald-950">
            {tr("billing.title", "Billing")}
          </h1>
          <p className="mt-2 text-emerald-700">
            {tr("billing.authRequired", "Sign in to manage your plan.")}
          </p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h1 className="text-xl font-semibold">
            {tr("billing.title", "Billing")}
          </h1>
          <p className="mt-2 text-sm">
            {tr(
              "billing.accessDenied",
              "You do not have permission to view monetization for this organization."
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">

      <section className="relative overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-950 via-emerald-800 to-teal-700 px-5 py-6 text-white shadow-xl shadow-emerald-950/15 md:px-7 md:py-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-lime-200/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50">
              {tr("billing.heroEyebrow", billingCopy("Plan y pagos", "Plan & payments", "Plan et paiements"))}
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                {tr("billing.title", "Billing")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/90">
                {tr(
                  "billing.heroSubtitle",
                  billingCopy(
                    "Revisa el estado del plan, capacidad y opciones de actualización de tu organización.",
                    "Review your organization’s plan status, capacity, and upgrade options.",
                    "Consultez l’état du plan, la capacité et les options de mise à niveau de votre organisation."
                  )
                )}
              </p>
            </div>
          </div>
        </div>
      </section>
      <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-lg shadow-emerald-950/5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-emerald-950">
              {tr("billing.title", "Billing")}
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to={pricingHref}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
            >
              {tr("billing.actions.viewPlans", "View plans")}
            </Link>
          </div>
        </div>

        {(() => {
          const orgId = billing?.org_id ?? currentOrgId ?? null;
          const normalizedPlanCode = String(effectivePlanCode || "").toLowerCase();
          const normalizedPlanStatus = String(effectivePlanStatus || "").toLowerCase();
          const hasPaidPlanAccess =
            ["pro", "enterprise"].includes(normalizedPlanCode) &&
            ["active", "trialing", "past_due", "paused"].includes(normalizedPlanStatus);
          const showUpgradeCta =
            !hasPaidPlanAccess && ["free", "trialing", "over_limit"].includes(ctaVariant);
          const activePlanLabel = labelPlan(effectivePlanCode, tr);

          if (hasPaidPlanAccess) {
            return (
              <div className="mt-6 mb-6 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xl font-bold text-emerald-950">
                      {tr("billing.currentPlanBanner.title", billingCopy("Plan actual", "Current plan", "Plan actuel"))}: {activePlanLabel}
                    </div>
                    <div className="mt-1 text-sm text-emerald-800">
                      {tr("billing.currentPlanBanner.status", billingCopy("Estado", "Status", "Statut"))}: {labelStatus(effectivePlanStatus, tr)}
                    </div>
                    {billing?.current_period_end ? (
                      <div className="mt-1 text-sm text-emerald-800">
                        {tr(
                          "billing.currentPlanBanner.currentPeriodUntil",
                          billingCopy("Período actual hasta", "Current period until", "Période actuelle jusqu’au")
                        )}: {formatDate(billing.current_period_end, dateLocale)}
                      </div>
                    ) : null}
                  </div>

                  {canUpgradeToEnterprise ? (
                    <UpgradeToProButton
                      orgId={currentOrgId}
                      plan="enterprise"
                      label={tr(
                        "billing.actions.upgradeToEnterprise",
                        billingCopy("Subir a Enterprise", "Upgrade to Enterprise", "Passer à Enterprise")
                      )}
                      className="inline-flex items-center justify-center rounded-xl bg-emerald-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900"
                    />
                  ) : (
                    <Link
                      to={pricingHref}
                      className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
                    >
                      {tr("billing.actions.viewPlans", billingCopy("Ver planes", "View plans", "Voir les plans"))}
                    </Link>
                  )}
                </div>
              </div>
            );
          }

          return showUpgradeCta ? (
            <div className="mt-6 mb-6 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-6 shadow-sm">
              <div className="text-xl font-bold text-emerald-950">
                {tr("billing.upgrade.productTitle", "Geocercas PRO")}
              </div>
              <div className="mt-1 text-sm text-emerald-800">
                {formatPlanPrice("pro", i18n.language)}
              </div>
              <div className="mt-2 text-xs text-emerald-800">
                <b>{tr("billing.upgrade.orgIdLabel", "Org ID")}:</b>{" "}
                <span className="font-mono break-all text-emerald-950">
                  {orgId || tr("billing.upgrade.notResolved", "(not resolved)")}
                </span>
              </div>
              <div className="mt-4">
                <UpgradeToProButton
                  orgId={currentOrgId}
                  plan="pro"
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white bg-emerald-900 hover:bg-emerald-800"
                />
              </div>
            </div>
          ) : null;
        })()}

        <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-emerald-800 md:grid-cols-2">
          <div>
            <b>{tr("billing.labels.email", "Email")}:</b> {user.email}
          </div>
          <div>
            <b>{tr("billing.labels.orgId", "Org ID")}:</b>{" "}
            <span className="break-all font-mono">{currentOrgId || "—"}</span>
          </div>
          <div>
            <b>{tr("billing.labels.orgName", "Organization")}:</b> {billing?.org_name || "—"}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-lg shadow-emerald-950/5">
        <h2 className="text-lg font-semibold text-emerald-950">
          {tr("billing.planState.title", "Plan status")}
        </h2>

        {/* Scheduled cancellation banner */}
        {!billingLoading &&
          !billingError &&
          !billingFallback &&
          cancellationScheduled &&
          effectivePlanStatus === "active" &&
          billing?.current_period_end ? (
            <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="font-semibold">
                {tr(
                  "billing.messages.cancellationScheduledTitle",
                  "Your plan will be cancelled at the end of the current period."
                )}
              </div>
              <div className="mt-1">
                {tr(
                  "billing.messages.cancellationScheduledBody",
                  "You will retain access to PRO features until the end of your current billing period:"
                )}
                <span className="ml-1 font-semibold text-emerald-950">
                  {formatDate(billing?.current_period_end, dateLocale)}
                </span>
              </div>
            </div>
          ) : null}

        {!billingLoading && !billingError && !billingFallback && isOverLimit ? (
          <div className="mt-4 rounded-xl border-2 border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="font-semibold">
              {tr("billing.messages.overLimitTitle", "Limit exceeded for this organization")}
            </div>
            <div className="mt-1">
              {billing?.over_limit_reason ||
                tr("billing.messages.overLimit", "Current usage exceeded plan limits.")}
            </div>
          </div>
        ) : null}

        {!billingLoading &&
        !billingError &&
        !billingFallback &&
        effectivePlanStatus === "trialing" ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="font-semibold">
              {tr("billing.messages.trialActive", "Trial active")}
            </div>
            <div className="mt-1">
              {trialCountdown || noDataLabel}
              {trialEndsAt ? ` (${formatDate(trialEndsAt, dateLocale)})` : ""}
            </div>
          </div>
        ) : null}

        {billingLoading ? (
          <p className="mt-3 text-sm text-emerald-700">
            {tr("billing.states.loadingPlanStatus", "Loading plan status...")}
          </p>
        ) : billingFallback ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <b>{tr("billing.errors.missingViewTitle", "Billing unavailable")}</b>
            <div className="mt-1">
              {tr("billing.errors.missingViewBody", "Billing information is being updated.")}
            </div>
          </div>
        ) : billingError ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {billingError}
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="text-xs uppercase tracking-wide text-emerald-600">
                  {tr("billing.cards.currentPlan", "Current plan")}
                </div>
                <div className="mt-1 text-lg font-semibold text-emerald-950">
                  {labelPlan(effectivePlanCode, tr)}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="text-xs uppercase tracking-wide text-emerald-600">
                  {tr("billing.cards.status", "Status")}
                </div>
                <div className="mt-1 text-lg font-semibold text-emerald-950">
                  {labelStatus(effectivePlanStatus, tr)}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="text-xs uppercase tracking-wide text-emerald-600">
                  {tr("billing.cards.trialUntil", "Trial until")}
                </div>
                <div className="mt-1 text-base font-medium text-emerald-950">
                  {formatDate(billing?.trial_end, dateLocale)}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="text-xs uppercase tracking-wide text-emerald-600">
                  {tr("billing.cards.currentPeriodUntil", "Current period until")}
                </div>
                <div className="mt-1 text-base font-medium text-emerald-950">
                  {formatDate(billing?.current_period_end, dateLocale)}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="text-xs uppercase tracking-wide text-emerald-600">
                  {tr("billing.cards.trackerLimit", "Tracker limit")}
                </div>
                <div className="mt-1 text-base font-medium text-emerald-950">
                  {formatLimit(billing?.max_trackers, unlimitedLabel)}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="text-xs uppercase tracking-wide text-emerald-600">
                  {tr("billing.cards.geofenceLimit", "Geofence limit")}
                </div>
                <div className="mt-1 text-base font-medium text-emerald-950">
                  {formatLimit(billing?.max_geocercas, unlimitedLabel)}
                </div>
              </div>

              <div className={`rounded-xl border p-4 ${usageCardTone(trackerUsageSeverity)}`}>
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-emerald-600">
                  <span>{tr("billing.cards.trackerUsage", "Tracker usage")}</span>
                  <span>
                    {trackerUsageState.hasData
                      ? `${trackerUsageState.pct.toFixed(1)}%`
                      : noDataLabel}
                  </span>
                </div>

                {trackerUsageSeverity === "warning" ? (
                  <div className="mt-1 text-xs font-semibold text-amber-700">
                    {tr("billing.usage.warning", "Near limit")}
                  </div>
                ) : null}

                {trackerUsageSeverity === "critical" ? (
                  <div className="mt-1 text-xs font-semibold text-rose-700">
                    {tr("billing.usage.critical", "Limit exceeded")}
                  </div>
                ) : null}

                <div className="mt-2 text-base font-medium text-emerald-950">
                  {trackerUsageState.hasData
                    ? formatUsage(billing?.trackers_used, billing?.max_trackers, unlimitedLabel)
                    : noDataLabel}
                </div>

                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-emerald-100">
                  <div
                    className={`h-full rounded-full ${
                      trackerUsageState.hasData ? "bg-emerald-600" : "bg-emerald-300"
                    }`}
                    style={{
                      width: trackerUsageState.hasData ? `${trackerUsageState.pct}%` : "100%",
                    }}
                  />
                </div>
              </div>

              <div className={`rounded-xl border p-4 ${usageCardTone(geofenceUsageSeverity)}`}>
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-emerald-600">
                  <span>{tr("billing.cards.geofenceUsage", "Geofence usage")}</span>
                  <span>
                    {geofenceUsageState.hasData
                      ? `${geofenceUsageState.pct.toFixed(1)}%`
                      : noDataLabel}
                  </span>
                </div>

                {geofenceUsageSeverity === "warning" ? (
                  <div className="mt-1 text-xs font-semibold text-amber-700">
                    {tr("billing.usage.warning", "Near limit")}
                  </div>
                ) : null}

                {geofenceUsageSeverity === "critical" ? (
                  <div className="mt-1 text-xs font-semibold text-rose-700">
                    {tr("billing.usage.critical", "Limit exceeded")}
                  </div>
                ) : null}

                <div className="mt-2 text-base font-medium text-emerald-950">
                  {geofenceUsageState.hasData
                    ? formatUsage(billing?.geocercas_used, billing?.max_geocercas, unlimitedLabel)
                    : noDataLabel}
                </div>

                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-emerald-100">
                  <div
                    className={`h-full rounded-full ${
                      geofenceUsageState.hasData ? "bg-emerald-600" : "bg-emerald-300"
                    }`}
                    style={{
                      width: geofenceUsageState.hasData ? `${geofenceUsageState.pct}%` : "100%",
                    }}
                  />
                </div>
              </div>
            </div>

          </>
        )}
      </div>

      <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
        {ctaVariant === "over_limit" ? (
          <>
            <div className="text-sm font-semibold text-rose-800">
              {tr("billing.cta.overLimitTitle", "Action required: upgrade your plan")}
            </div>
            <p className="mt-1 text-sm text-emerald-800">
              {billing?.over_limit_reason ||
                tr("billing.cta.overLimitBody", "Your organization exceeded the current plan limits.")}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {canUpgradeToEnterprise ? (
                <UpgradeToProButton
                  orgId={currentOrgId}
                  plan="enterprise"
                  label={tr(
                        "billing.actions.upgradeToEnterprise",
                        billingCopy("Subir a Enterprise", "Upgrade to Enterprise", "Passer à Enterprise")
                      )}
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900"
                />
              ) : (
                <Link
                  to={pricingHref}
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900"
                >
                  {tr("billing.actions.viewPlans", "View plans")}
                </Link>
              )}
            </div>
          </>
        ) : null}

        {ctaVariant === "trialing" ? (
          <>
            <div className="text-sm font-semibold text-emerald-900">
              {tr("billing.cta.trialingTitle", "Convert your trial before it expires")}
            </div>
            <p className="mt-1 text-sm text-emerald-800">
              {trialCountdown ||
                tr(
                  "billing.cta.trialingBody",
                  "Review the plans and activate a subscription before the trial ends."
                )}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to={pricingHref}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                {tr("billing.actions.viewPlans", "View plans")}
              </Link>
            </div>
          </>
        ) : null}

        {ctaVariant === "free" ? (
          <>
            <div className="text-sm font-semibold text-emerald-950">
              {tr("billing.compareBeforeUpgrade.title", "Do you want to compare before upgrading?")}
            </div>
            <p className="mt-1 text-sm text-emerald-700">
              {tr(
                "billing.compareBeforeUpgrade.description",
                "Review the plans page to compare Free, Pro, and Enterprise."
              )}
            </p>
            <div className="mt-4">
              <Link
                to={pricingHref}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
              >
                {tr("billing.actions.viewPlans", "View plans")}
              </Link>
            </div>
          </>
        ) : null}

        {ctaVariant === "none" ? (
          <div className="space-y-3">
            <div className="text-sm text-emerald-800">
              {tr(
                "billing.messages.activePlanExists",
                "There is already an active plan for this organization. The upgrade button is not shown."
              )}
            </div>

            {hasActivePlan ? (
              <ManageSubscriptionButton
                orgId={billing?.org_id ?? currentOrgId ?? null}
                buttonLabel={tr("billing.subscriptionManagement.suspendPlan", "Suspend plan")}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
        <div className="text-sm text-emerald-700">
          <Link to={homeHref} className="font-medium text-emerald-950 underline">
            {tr("billing.backHome", "Go home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
