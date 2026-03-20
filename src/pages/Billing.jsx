// src/pages/Billing.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import { supabase } from "../lib/supabaseClient.js";
import UpgradeToProButton from "../components/Billing/UpgradeToProButton.jsx";
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

function formatLimit(value) {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n === 0) return "0";
  if (n >= 9999) return "Unlimited";
  return String(n);
}

function buildUsageState(current, limit, pct) {
  const hasCurrent = current !== null && current !== undefined;
  const hasLimit = limit !== null && limit !== undefined;
  const hasPct = pct !== null && pct !== undefined;

  if (!hasCurrent || !hasLimit || !hasPct) {
    return { hasData: false, pct: null };
  }

  const safeLimit = Number(limit);
  const safePct = Number(pct);

  if (!Number.isFinite(safeLimit) || safeLimit <= 0 || !Number.isFinite(safePct)) {
    return { hasData: false, pct: null };
  }

  return { hasData: true, pct: clampPct(safePct) };
}

function formatUsage(current, limit) {
  const c = Number(current);
  const l = Number(limit);

  if (!Number.isFinite(c) || c < 0) return "—";
  if (!Number.isFinite(l) || l <= 0) return `${c}`;
  if (l >= 9999) return `${c} / Unlimited`;
  return `${c} / ${l}`;
}

function getUsageSeverity(usageState, isOverLimit) {
  if (isOverLimit) return "critical";
  if (!usageState?.hasData) return "unknown";

  const pct = Number(usageState?.pct);
  if (!Number.isFinite(pct)) return "unknown";
  if (pct >= 100) return "critical";
  if (pct >= 80) return "warning";
  return "normal";
}

function usageCardTone(severity) {
  if (severity === "critical") return "border-rose-300 bg-rose-50";
  if (severity === "warning") return "border-amber-300 bg-amber-50";
  return "border-slate-200 bg-slate-50";
}

function formatTrialCountdown(trialEndIso) {
  if (!trialEndIso) return null;

  const endMs = Date.parse(trialEndIso);
  if (!Number.isFinite(endMs)) return null;

  const diffMs = endMs - Date.now();
  if (diffMs <= 0) return "Trial finalizado";

  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;

  const days = Math.floor(diffMs / dayMs);
  if (days >= 1) {
    return `Quedan ${days} dia${days === 1 ? "" : "s"} de trial`;
  }

  const hours = Math.max(1, Math.floor(diffMs / hourMs));
  return `Quedan ${hours} hora${hours === 1 ? "" : "s"} de trial`;
}

function labelPlan(planCode) {
  const v = String(planCode || "free").toLowerCase();
  if (v === "pro") return "PRO";
  if (v === "free") return "FREE";
  if (v === "enterprise") return "ENTERPRISE";
  if (v === "starter") return "STARTER";
  if (v === "elite") return "ELITE";
  if (v === "elite_plus") return "ELITE+";
  return v.toUpperCase();
}

function labelStatus(planStatus, t) {
  const v = String(planStatus || "unknown").toLowerCase();

  if (v === "trialing") return t("billing.status.trialing", { defaultValue: "Trial" });
  if (v === "active") return t("billing.status.active", { defaultValue: "Active" });
  if (v === "past_due") return t("billing.status.pastDue", { defaultValue: "Past due" });
  if (v === "canceled") return t("billing.status.canceled", { defaultValue: "Canceled" });
  if (v === "free") return t("billing.status.free", { defaultValue: "Free" });
  if (v === "unknown") return t("billing.status.unknown", { defaultValue: "Sin datos comerciales" });

  return v;
}

export default function Billing() {
  const { t, i18n } = useTranslation();
  const tr = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const dateLocale = useMemo(() => resolveDateLocale(i18n?.language), [i18n?.language]);

  const { loading, ready, authenticated, user, currentOrgId, isAdmin } = useAuth();

  const isPreviewBillingNoticeVisible = useMemo(() => {
    if (import.meta.env.DEV) return true;

    const appEnv = String(import.meta.env.VITE_APP_ENV || "").toLowerCase();
    if (appEnv === "preview" || appEnv === "test") return true;

    const hostname =
      typeof window !== "undefined" ? String(window.location?.hostname || "") : "";

    return hostname.startsWith("preview.");
  }, []);

  const [billing, setBilling] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadBilling() {
      if (!authenticated || !currentOrgId) {
        if (!cancelled) {
          setBilling(null);
          setBillingError("");
          setBillingLoading(false);
        }
        return;
      }

      try {
        setBillingLoading(true);
        setBillingError("");

        const { data, error } = await supabase
          .from("v_billing_panel")
          .select(
            `
            org_id,
            org_name,
            billing_plan_code,
            effective_plan_code,
            plan_status,
            trial_end,
            current_period_end,
            max_trackers,
            max_geocercas,
            trackers_used,
            geocercas_used,
            active_trackers_24h,
            geocercas_used,
            billing_over_limit,
            over_limit_reason
          `
          )
          .eq("org_id", currentOrgId)
          .maybeSingle();

        if (error) throw error;

        if (!cancelled) {
          setBilling(data || null);
        }
      } catch (err) {
        if (!cancelled) {
          setBilling(null);
          setBillingError(
            err?.message ||
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
  }, [authenticated, currentOrgId]);

  const effectivePlanCode = useMemo(() => {
    return String(billing?.effective_plan_code || billing?.billing_plan_code || "starter").toLowerCase();
  }, [billing]);

  const effectivePlanStatus = useMemo(() => {
    const raw = billing?.plan_status;
    if (raw == null || raw === "") return "unknown";
    return String(raw).toLowerCase();
  }, [billing]);

  const hasStripeSubscription = useMemo(() => {
    return !!billing && !['unknown', 'free'].includes(String(billing?.plan_status || '').toLowerCase());
  }, [billing]);

  const shouldShowManageButton = useMemo(() => {
    if (!currentOrgId) return false;
    if (!hasStripeSubscription) return false;

    return ["trialing", "active", "past_due", "canceled"].includes(effectivePlanStatus);
  }, [currentOrgId, hasStripeSubscription, effectivePlanStatus]);

  const isOverLimit = Boolean(billing?.billing_over_limit);
  const trialEndsAt = billing?.trial_end || null;
  const trialCountdown = useMemo(() => formatTrialCountdown(trialEndsAt), [trialEndsAt]);

  const trackerUsageState = useMemo(() => {
    return buildUsageState(
      billing?.trackers_used,
      billing?.max_trackers,
      billing?.active_trackers_24h
    );
  }, [billing]);

  const geofenceUsageState = useMemo(() => {
    return buildUsageState(
      billing?.geocercas_used,
      billing?.max_geocercas,
      billing?.geocercas_used
    );
  }, [billing]);

  const trackerUsageSeverity = useMemo(() => {
    return getUsageSeverity(trackerUsageState, isOverLimit);
  }, [trackerUsageState, isOverLimit]);

  const geofenceUsageSeverity = useMemo(() => {
    return getUsageSeverity(geofenceUsageState, isOverLimit);
  }, [geofenceUsageState, isOverLimit]);

  const ctaVariant = useMemo(() => {
    if (isOverLimit) return "over_limit";
    if (effectivePlanStatus === "trialing") return "trialing";
    if (["free", "starter"].includes(effectivePlanCode)) return "free";
    return "none";
  }, [isOverLimit, effectivePlanStatus, effectivePlanCode]);

  if (loading || !ready) return null;

  if (!authenticated || !user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
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
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h1 className="text-xl font-semibold">{tr("billing.title", "Billing")}</h1>
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
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {tr("billing.title", "Billing")}
            </h1>
            {isPreviewBillingNoticeVisible ? (
              <p className="mt-2 text-slate-600">
                {tr("billing.previewNotice.prefix", "Monetization in")} <b>PREVIEW</b>{" "}
                {tr("billing.previewNotice.middle", "(Stripe TEST).")}{" "}
                {tr("billing.previewNotice.suffix", "It does not affect production.")}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              {tr("billing.actions.viewPlans", "View plans")}
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
          <div>
            <b>{tr("billing.labels.email", "Email")}:</b> {user.email}
          </div>
          <div>
            <b>{tr("billing.labels.orgId", "Org ID")}:</b>{" "}
            <span className="font-mono break-all">{currentOrgId || "—"}</span>
          </div>
          <div>
            <b>{tr("billing.labels.orgName", "Organization")}:</b> {billing?.org_name || "—"}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          {tr("billing.planState.title", "Plan status")}
        </h2>

        {!billingLoading && !billingError && isOverLimit ? (
          <div className="mt-4 rounded-xl border-2 border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="font-semibold">
              {tr("billing.messages.overLimitTitle", "Limite excedido en esta organizacion")}
            </div>
            <div className="mt-1">
              {billing?.over_limit_reason ||
                tr("billing.messages.overLimit", "Current usage exceeded plan limits.")}
            </div>
          </div>
        ) : null}

        {!billingLoading && !billingError && effectivePlanStatus === "trialing" ? (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="font-semibold">
              {tr("billing.messages.trialActive", "Trial activo")}
            </div>
            <div className="mt-1">
              {trialCountdown || tr("billing.common.noData", "Sin datos")}
              {trialEndsAt ? ` (${formatDate(trialEndsAt, dateLocale)})` : ""}
            </div>
          </div>
        ) : null}

        {billingLoading ? (
          <p className="mt-3 text-sm text-slate-600">
            {tr("billing.states.loadingPlanStatus", "Loading plan status...")}
          </p>
        ) : billingError ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {billingError}
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {tr("billing.cards.currentPlan", "Current plan")}
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {labelPlan(effectivePlanCode)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {tr("billing.cards.status", "Status")}
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {labelStatus(effectivePlanStatus, t)}
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
                  {formatLimit(billing?.max_trackers)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {tr("billing.cards.geofenceLimit", "Geofence limit")}
                </div>
                <div className="mt-1 text-base font-medium text-slate-900">
                  {formatLimit(billing?.max_geocercas)}
                </div>
              </div>

              <div className={`rounded-xl border p-4 ${usageCardTone(trackerUsageSeverity)}`}>
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                  <span>{tr("billing.cards.trackerUsage", "Tracker usage")}</span>
                  <span>
                    {trackerUsageState.hasData
                      ? `${trackerUsageState.pct.toFixed(1)}%`
                      : tr("billing.common.noData", "Sin datos")}
                  </span>
                </div>
                {trackerUsageSeverity === "warning" ? (
                  <div className="mt-1 text-xs font-semibold text-amber-700">
                    {tr("billing.usage.warning", "Cerca del limite")}
                  </div>
                ) : null}
                {trackerUsageSeverity === "critical" ? (
                  <div className="mt-1 text-xs font-semibold text-rose-700">
                    {tr("billing.usage.critical", "Limite excedido")}
                  </div>
                ) : null}
                <div className="mt-2 text-base font-medium text-slate-900">
                  {trackerUsageState.hasData
                    ? formatUsage(billing?.trackers_used, billing?.max_trackers)
                    : tr("billing.common.noData", "Sin datos")}
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${
                      trackerUsageState.hasData ? "bg-emerald-600" : "bg-slate-300"
                    }`}
                    style={{ width: trackerUsageState.hasData ? `${trackerUsageState.pct}%` : "100%" }}
                  />
                </div>
              </div>

              <div className={`rounded-xl border p-4 ${usageCardTone(geofenceUsageSeverity)}`}>
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                  <span>{tr("billing.cards.geofenceUsage", "Geofence usage")}</span>
                  <span>
                    {geofenceUsageState.hasData
                      ? `${geofenceUsageState.pct.toFixed(1)}%`
                      : tr("billing.common.noData", "Sin datos")}
                  </span>
                </div>
                {geofenceUsageSeverity === "warning" ? (
                  <div className="mt-1 text-xs font-semibold text-amber-700">
                    {tr("billing.usage.warning", "Cerca del limite")}
                  </div>
                ) : null}
                {geofenceUsageSeverity === "critical" ? (
                  <div className="mt-1 text-xs font-semibold text-rose-700">
                    {tr("billing.usage.critical", "Limite excedido")}
                  </div>
                ) : null}
                <div className="mt-2 text-base font-medium text-slate-900">
                  {geofenceUsageState.hasData
                    ? formatUsage(billing?.geocercas_used, billing?.max_geocercas)
                    : tr("billing.common.noData", "Sin datos")}
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${
                      geofenceUsageState.hasData ? "bg-indigo-600" : "bg-slate-300"
                    }`}
                    style={{ width: geofenceUsageState.hasData ? `${geofenceUsageState.pct}%` : "100%" }}
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
                    "Open Stripe Customer Portal to update your card, cancel, or review your subscription."
                  )}
                </p>

                <div className="mt-4">
                  <ManageSubscriptionButton
                    orgId={currentOrgId}
                    getAccessToken={getAccessToken}
                    returnUrl={`${window.location.origin}/billing`}
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
              {tr("billing.cta.overLimitTitle", "Accion requerida: aumenta tu plan")}
            </div>
            <p className="mt-1 text-sm text-slate-700">
              {billing?.over_limit_reason ||
                tr("billing.cta.overLimitBody", "Tu organizacion excedio limites del plan actual.")}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {currentOrgId ? (
                <UpgradeToProButton orgId={currentOrgId} getAccessToken={getAccessToken} />
              ) : null}
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                {tr("billing.actions.viewPlans", "View plans")}
              </Link>
            </div>
          </>
        ) : null}

        {ctaVariant === "trialing" ? (
          <>
            <div className="text-sm font-semibold text-blue-900">
              {tr("billing.cta.trialingTitle", "Convierte tu trial antes del vencimiento")}
            </div>
            <p className="mt-1 text-sm text-slate-700">
              {trialCountdown || tr("billing.cta.trialingBody", "Revisa planes y activa suscripcion antes de finalizar trial.")}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
              >
                {tr("billing.actions.viewPlans", "View plans")}
              </Link>
              {shouldShowManageButton ? (
                <ManageSubscriptionButton
                  orgId={currentOrgId}
                  getAccessToken={getAccessToken}
                  returnUrl={`${window.location.origin}/billing`}
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
              {tr("billing.compareBeforeUpgrade.description", "Review the plans page to compare Free, Pro, and Enterprise.")}
            </p>
            <div className="mt-4">
              <Link
                to="/pricing"
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
    </div>
  );
}
