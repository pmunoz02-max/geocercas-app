// src/pages/Billing.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import { supabase } from "../lib/supabaseClient.js";
import UpgradeToProButton from "../components/Billing/UpgradeToProButton";
import ManageSubscriptionButton from "../components/Billing/ManageSubscriptionButton.jsx";

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
  if (severity === "ok") return "border-slate-200 bg-slate-50";
  return "border-slate-200 bg-slate-50";
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

export default function Billing() {
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

  const pricingHref = useMemo(() => buildLangPath("/pricing", currentLang), [currentLang]);
  const billingHref = useMemo(() => buildLangPath("/billing", currentLang), [currentLang]);
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

        const { data, error } = await supabase
          .from("v_billing_panel")
          .select(`
            org_id,
            org_name,
            billing_provider,
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

        if (error) throw error;

        setBilling(data || null);
        setBillingError("");
        setBillingFallback(false);
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

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

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

  const billingProvider = billing?.billing_provider || null;
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

  const shouldShowManageButton = useMemo(() => {
    if (!currentOrgId) return false;
    if (!billingProvider) return false;
    if (billingProvider === "stripe") {
      return ["trialing", "active", "past_due", "canceled"].includes(effectivePlanStatus);
    }
    return false;
  }, [currentOrgId, billingProvider, effectivePlanStatus]);

  const ctaVariant = useMemo(() => {
    if (billingFallback) return "none";
    if (isOverLimit) return "over_limit";
    if (effectivePlanStatus === "trialing") return "trialing";
    if (["free", "starter"].includes(effectivePlanCode)) return "free";
    return "none";
  }, [billingFallback, isOverLimit, effectivePlanStatus, effectivePlanCode]);

  if (loading || !ready) return null;

  if (!authenticated || !user) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">
            {tr("billing.title", "Billing")}
          </h1>
          <p className="mt-2 text-slate-600">
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
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {tr("billing.title", "Billing")}
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to={pricingHref}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              {tr("billing.actions.viewPlans", "View plans")}
            </Link>
          </div>
        </div>

        {(() => {
          const orgId = billing?.org_id ?? currentOrgId ?? null;
          const showPaddleUpgrade =
            billingProvider === "paddle" || !billingProvider || ctaVariant === "free";

          return showPaddleUpgrade ? (
            <div className="mt-6 mb-6 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-6 shadow-sm">
              <div className="text-xl font-bold text-slate-900">
                {tr("billing.upgrade.productTitle", "Geocercas PRO")}
              </div>
              <div className="mt-1 text-sm text-slate-700">
                {tr("billing.upgrade.priceLabel", "USD $29/month · Paddle")}
              </div>
              <div className="mt-2 text-xs text-slate-700">
                <b>{tr("billing.upgrade.orgIdLabel", "Org ID")}:</b>{" "}
                <span className="break-all font-mono text-slate-900">{orgId || "—"}</span>
              </div>
              <div className="mt-4">
                <UpgradeToProButton orgId={orgId} getAccessToken={getAccessToken} />
              </div>
            </div>
          ) : null;
        })()}

        <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2">
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

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          {tr("billing.planState.title", "Plan status")}
        </h2>

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
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
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
          <p className="mt-3 text-sm text-slate-600">
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
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {tr("billing.cards.currentPlan", "Current plan")}
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {labelPlan(effectivePlanCode, tr)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {tr("billing.cards.status", "Status")}
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {labelStatus(effectivePlanStatus, tr)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {tr("billing.cards.trialUntil", "Trial until")}
                </div>
                <div className="mt-1 text-base font-medium text-slate-900">
                  {formatDate(billing?.trial_end, dateLocale)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {tr("billing.cards.currentPeriodUntil", "Current period until")}
                </div>
                <div className="mt-1 text-base font-medium text-slate-900">
                  {formatDate(billing?.current_period_end, dateLocale)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {tr("billing.cards.trackerLimit", "Tracker limit")}
                </div>
                <div className="mt-1 text-base font-medium text-slate-900">
                  {formatLimit(billing?.max_trackers, unlimitedLabel)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {tr("billing.cards.geofenceLimit", "Geofence limit")}
                </div>
                <div className="mt-1 text-base font-medium text-slate-900">
                  {formatLimit(billing?.max_geocercas, unlimitedLabel)}
                </div>
              </div>

              <div className={`rounded-xl border p-4 ${usageCardTone(trackerUsageSeverity)}`}>
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
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

                <div className="mt-2 text-base font-medium text-slate-900">
                  {trackerUsageState.hasData
                    ? formatUsage(billing?.trackers_used, billing?.max_trackers, unlimitedLabel)
                    : noDataLabel}
                </div>

                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${
                      trackerUsageState.hasData ? "bg-emerald-600" : "bg-slate-300"
                    }`}
                    style={{
                      width: trackerUsageState.hasData ? `${trackerUsageState.pct}%` : "100%",
                    }}
                  />
                </div>
              </div>

              <div className={`rounded-xl border p-4 ${usageCardTone(geofenceUsageSeverity)}`}>
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
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

                <div className="mt-2 text-base font-medium text-slate-900">
                  {geofenceUsageState.hasData
                    ? formatUsage(billing?.geocercas_used, billing?.max_geocercas, unlimitedLabel)
                    : noDataLabel}
                </div>

                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${
                      geofenceUsageState.hasData ? "bg-indigo-600" : "bg-slate-300"
                    }`}
                    style={{
                      width: geofenceUsageState.hasData ? `${geofenceUsageState.pct}%` : "100%",
                    }}
                  />
                </div>
              </div>
            </div>

            {shouldShowManageButton ? (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  {tr("billing.subscriptionManagement.title", "Subscription management")}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {tr(
                    "billing.subscriptionManagement.description",
                    "Open the subscription portal to update payment details or review your subscription."
                  )}
                </p>

                <div className="mt-4">
                  <ManageSubscriptionButton
                    orgId={currentOrgId}
                    getAccessToken={getAccessToken}
                    returnUrl={billingHref}
                  />
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {ctaVariant === "over_limit" ? (
          <>
            <div className="text-sm font-semibold text-rose-800">
              {tr("billing.cta.overLimitTitle", "Action required: upgrade your plan")}
            </div>
            <p className="mt-1 text-sm text-slate-700">
              {billing?.over_limit_reason ||
                tr("billing.cta.overLimitBody", "Your organization exceeded the current plan limits.")}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to={pricingHref}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {tr("billing.actions.viewPlans", "View plans")}
              </Link>
            </div>
          </>
        ) : null}

        {ctaVariant === "trialing" ? (
          <>
            <div className="text-sm font-semibold text-blue-900">
              {tr("billing.cta.trialingTitle", "Convert your trial before it expires")}
            </div>
            <p className="mt-1 text-sm text-slate-700">
              {trialCountdown ||
                tr(
                  "billing.cta.trialingBody",
                  "Review the plans and activate a subscription before the trial ends."
                )}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to={pricingHref}
                className="inline-flex items-center justify-center rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
              >
                {tr("billing.actions.viewPlans", "View plans")}
              </Link>
              {shouldShowManageButton ? (
                <ManageSubscriptionButton
                  orgId={currentOrgId}
                  getAccessToken={getAccessToken}
                  returnUrl={billingHref}
                />
              ) : null}
            </div>
          </>
        ) : null}

        {ctaVariant === "free" ? (
          <>
            <div className="text-sm font-semibold text-slate-900">
              {tr("billing.compareBeforeUpgrade.title", "Do you want to compare before upgrading?")}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {tr(
                "billing.compareBeforeUpgrade.description",
                "Review the plans page to compare Free, Pro, and Enterprise."
              )}
            </p>
            <div className="mt-4">
              <Link
                to={pricingHref}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                {tr("billing.actions.viewPlans", "View plans")}
              </Link>
            </div>
          </>
        ) : null}

        {ctaVariant === "none" ? (
          <div className="text-sm text-emerald-800">
            {tr(
              "billing.messages.activePlanExists",
              "There is already an active plan for this organization. The upgrade button is not shown."
            )}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-slate-600">
          <Link to={homeHref} className="font-medium text-slate-900 underline">
            {tr("billing.backHome", "Go home")}
          </Link>
        </div>
      </div>
    </div>
  );
}