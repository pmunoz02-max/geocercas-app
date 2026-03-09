// src/pages/Billing.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import { supabase } from "../lib/supabaseClient.js";
import UpgradeToProButton from "../components/Billing/UpgradeToProButton.jsx";
import ManageSubscriptionButton from "../components/Billing/ManageSubscriptionButton.jsx";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-EC", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
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
  const v = String(planStatus || "free").toLowerCase();

  if (v === "trialing") return t("billing.status.trialing", { defaultValue: "Trial" });
  if (v === "active") return t("billing.status.active", { defaultValue: "Active" });
  if (v === "past_due") return t("billing.status.pastDue", { defaultValue: "Past due" });
  if (v === "canceled") return t("billing.status.canceled", { defaultValue: "Canceled" });
  if (v === "free") return t("billing.status.free", { defaultValue: "Free" });

  return v;
}

export default function Billing() {
  const { t } = useTranslation();
  const tr = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const { loading, ready, authenticated, user, currentOrgId } = useAuth();

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
      if (!authenticated || !user || !currentOrgId) {
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
          .from("org_billing")
          .select(
            `
            org_id,
            plan_code,
            plan_status,
            trial_ends_at,
            current_period_end,
            stripe_customer_id,
            stripe_subscription_id,
            stripe_price_id,
            cancel_at_period_end,
            canceled_at,
            last_stripe_event_at
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
  }, [authenticated, user, currentOrgId]);

  const effectivePlanCode = useMemo(() => {
    return String(billing?.plan_code || "free").toLowerCase();
  }, [billing]);

  const effectivePlanStatus = useMemo(() => {
    return String(billing?.plan_status || "free").toLowerCase();
  }, [billing]);

  const shouldShowUpgradeButton = useMemo(() => {
    return !!currentOrgId && effectivePlanCode === "free";
  }, [currentOrgId, effectivePlanCode]);

  const hasStripeSubscription = useMemo(() => {
    return !!billing?.stripe_customer_id || !!billing?.stripe_subscription_id;
  }, [billing]);

  const shouldShowManageButton = useMemo(() => {
    if (!currentOrgId) return false;
    if (!hasStripeSubscription) return false;

    return ["trialing", "active", "past_due", "canceled"].includes(effectivePlanStatus);
  }, [currentOrgId, hasStripeSubscription, effectivePlanStatus]);

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

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {tr("billing.title", "Billing")}
            </h1>
            <p className="mt-2 text-slate-600">
              {tr("billing.previewNotice.prefix", "Monetization in")} <b>PREVIEW</b>{" "}
              {tr("billing.previewNotice.middle", "(Stripe TEST).")}{" "}
              {tr("billing.previewNotice.suffix", "It does not affect production.")}
            </p>
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
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          {tr("billing.planState.title", "Plan status")}
        </h2>

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
                  {formatDate(billing?.trial_ends_at)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {tr("billing.cards.currentPeriodUntil", "Current period until")}
                </div>
                <div className="mt-1 text-base font-medium text-slate-900">
                  {formatDate(billing?.current_period_end)}
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

        {!billingLoading && !billingError && billing?.cancel_at_period_end ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {tr(
              "billing.messages.cancelAtPeriodEnd",
              "Your subscription is set to cancel at the end of the current period."
            )}
          </div>
        ) : null}
      </div>

      {shouldShowUpgradeButton ? (
        <div className="space-y-4">
          <UpgradeToProButton
            orgId={currentOrgId}
            getAccessToken={getAccessToken}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">
              {tr(
                "billing.compareBeforeUpgrade.title",
                "Do you want to compare before upgrading?"
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {tr(
                "billing.compareBeforeUpgrade.description",
                "Review the plans page to compare Free, Pro, and Enterprise."
              )}
            </p>
            <div className="mt-4">
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                {tr("billing.actions.viewPlans", "View plans")}
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
          {tr(
            "billing.messages.activePlanExists",
            "There is already an active plan for this organization. The upgrade button is not shown."
          )}
        </div>
      )}
    </div>
  );
}