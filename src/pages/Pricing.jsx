import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import { supabase } from "@/lib/supabaseClient.js";
import useOrgEntitlements from "@/hooks/useOrgEntitlements.js";
import UpgradeToProButton from "../components/Billing/UpgradeToProButton";
import ManageSubscriptionButton from "../components/Billing/ManageSubscriptionButton.jsx";

function normalizePlanCode(value) {
  return String(value || "free").toLowerCase();
}

function formatLimit(value, fallback, unlimitedLabel) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  if (n >= 9999) return unlimitedLabel;
  return String(n);
}

function PlanBadge({ children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    blue: "border-blue-200 bg-blue-100 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-100 text-emerald-700",
    amber: "border-amber-200 bg-amber-100 text-amber-700",
    violet: "border-violet-200 bg-violet-100 text-violet-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone] || tones.slate}`}
    >
      {children}
    </span>
  );
}

function PlanCard({
  title,
  subtitle,
  price,
  description,
  features,
  cta,
  highlight = false,
  current = false,
  currentBadgeLabel,
}) {
  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm ${
        highlight
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={`text-xl font-semibold ${highlight ? "text-white" : "text-slate-900"}`}>
            {title}
          </h2>
          <p className={`mt-1 text-sm ${highlight ? "text-slate-300" : "text-slate-600"}`}>
            {subtitle}
          </p>
        </div>

        {current ? (
          <PlanBadge tone={highlight ? "amber" : "emerald"}>{currentBadgeLabel}</PlanBadge>
        ) : null}
      </div>

      <div className="mt-6">
        <div className={`text-3xl font-bold ${highlight ? "text-white" : "text-slate-900"}`}>
          {price}
        </div>
        <p className={`mt-2 text-sm ${highlight ? "text-slate-300" : "text-slate-600"}`}>
          {description}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {features.map((item) => (
          <div
            key={item}
            className={`flex items-start gap-3 text-sm ${highlight ? "text-slate-200" : "text-slate-700"}`}
          >
            <span className={`mt-0.5 ${highlight ? "text-white" : "text-slate-900"}`}>•</span>
            <span>{item}</span>
          </div>
        ))}
      </div>

      <div className="mt-8">{cta}</div>
    </div>
  );
}

function ContactSalesButton({ label }) {
  return (
    <a
      href="mailto:ventas@tugeocercas.com?subject=App%20Geocercas%20-%20Plan%20Enterprise"
      className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
    >
      {label}
    </a>
  );
}

function FreePlanAction({ currentPlanCode, currentPlanLabel, billingLabel }) {
  if (currentPlanCode === "free") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {currentPlanLabel}
      </div>
    );
  }

  return (
    <Link
      to="/billing"
      className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
    >
      {billingLabel}
    </Link>
  );
}

function ProPlanAction({
  authenticated,
  currentOrgId,
  currentPlanCode,
  getAccessToken,
  billingLabel,
  higherPlanMessage,
  reviewBillingMessage,
}) {
  if (!authenticated || !currentOrgId) {
    return (
      <Link
        to="/billing"
        className="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
      >
        {billingLabel}
      </Link>
    );
  }

  if (currentPlanCode === "free") {
    return <UpgradeToProButton orgId={currentOrgId} getAccessToken={getAccessToken} />;
  }

  if (currentPlanCode === "pro") {
    return (
      <ManageSubscriptionButton
        orgId={currentOrgId}
        getAccessToken={getAccessToken}
        returnUrl={`${window.location.origin}/pricing`}
      />
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
      {higherPlanMessage}
      <br />
      {reviewBillingMessage}
      <div className="mt-3">
        <Link
          to="/billing"
          className="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white transition hover:bg-emerald-800"
        >
          {billingLabel}
        </Link>
      </div>
    </div>
  );
}

export default function Pricing() {
  const { t } = useTranslation();
  const tp = React.useCallback((key, options) => t(`pricing.${key}`, options), [t]);
  const { loading, ready, authenticated, currentOrgId, isAdmin } = useAuth();
  const {
    loading: entitlementsLoading,
    error: entitlementsError,
    planCode,
    maxGeocercas,
    maxTrackers,
  } = useOrgEntitlements();

  const [billingPanel, setBillingPanel] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBillingPanel() {
      if (!authenticated || !currentOrgId) {
        if (!cancelled) setBillingPanel(null);
        return;
      }

      const { data, error } = await supabase
        .from("v_billing_panel")
        .select("org_id, effective_plan_code, plan_status, trial_end")
        .eq("org_id", currentOrgId)
        .maybeSingle();

      if (error) {
        if (
          error.message?.includes("does not exist") ||
          error.message?.includes("schema cache")
        ) {
          console.warn("[Pricing] fallback billing");
          setBillingPanel(null);
          return;
        }

        setBillingPanel(null);
        return;
      }

      setBillingPanel(data || null);
    }

    loadBillingPanel();

    return () => {
      cancelled = true;
    };
  }, [authenticated, currentOrgId]);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  const currentPlanCode = useMemo(() => {
    return normalizePlanCode(billingPanel?.effective_plan_code || planCode);
  }, [billingPanel, planCode]);

  const notAvailableLabel = tp("common.notAvailable");

  const detectedPlanLabel = useMemo(() => {
    const key = `summary.planCodes.${currentPlanCode}`;
    const translated = tp(key);
    if (translated !== `pricing.${key}`) {
      return translated;
    }
    return tp("summary.planCodeUnknown", { code: String(currentPlanCode || "").toUpperCase() });
  }, [currentPlanCode, tp]);

  const billingStatus = useMemo(() => {
    const raw = billingPanel?.plan_status;
    if (raw == null || raw === "") return "unknown";
    return String(raw).toLowerCase();
  }, [billingPanel]);

  const billingStatusLabel = useMemo(() => {
    if (billingStatus === "unknown") {
      return tp("summary.noCommercialData");
    }

    const statusKey = `status.${billingStatus}`;
    const translated = tp(statusKey);
    if (translated !== `pricing.${statusKey}`)
      return translated;

    return tp("status.other", { status: billingStatus });
  }, [billingStatus, tp]);

  const trialUntil = useMemo(() => {
    const value = billingPanel?.trial_end;
    if (!value) return notAvailableLabel;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return notAvailableLabel;
    return d.toLocaleDateString();
  }, [billingPanel, notAvailableLabel]);

  const freeFeatures = useMemo(
    () => [
      tp("free.features.validateFlow"),
      tp("free.features.upToTrackers", { count: 1 }),
      tp("free.features.geofenceLimits"),
      tp("free.features.billingAndUpgrade"),
      tp("free.features.backendEnforcement"),
    ],
    [tp]
  );

  const proFeatures = useMemo(
    () => [
      tp("pro.features.upToTrackers", {
        count: formatLimit(maxTrackers || 3, "3", tp("common.unlimited")),
      }),
      tp("pro.features.upToGeofences", {
        count: formatLimit(maxGeocercas || 9999, notAvailableLabel, tp("common.unlimited")),
      }),
      tp("pro.features.trackerEnabled"),
      tp("pro.features.invitesEnabled"),
      tp("pro.features.stripeSelfManaged"),
    ],
    [maxTrackers, maxGeocercas, notAvailableLabel, tp]
  );

  const enterpriseFeatures = useMemo(
    () => [
      tp("enterprise.features.salesOnboarding"),
      tp("enterprise.features.flexibleLimits"),
      tp("enterprise.features.multiTeamReady"),
      tp("enterprise.features.specialAgreements"),
      tp("enterprise.features.directSalesContact"),
    ],
    [tp]
  );

  if (loading || !ready) return null;

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h1 className="text-xl font-semibold">{tp("title")}</h1>
          <p className="mt-2 text-sm">
            {tp("accessDenied")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">{tp("title")}</h1>
            <p className="mt-2 max-w-3xl text-slate-600">
              {tp("page.previewNotice.prefix")} <b>{tp("page.previewNotice.previewTag")}</b>{" "}
              {tp("page.previewNotice.middle")} <b>{tp("page.previewNotice.testTag")}</b>.{" "}
              {tp("page.previewNotice.suffix")}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/billing"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              {tp("actions.goToBilling")}
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {tp("summary.detectedPlan")}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {detectedPlanLabel}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {tp("summary.status")}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {billingStatusLabel}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {tp("summary.trialUntil")}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{trialUntil}</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {tp("summary.maxGeofences")}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {entitlementsLoading
                ? tp("common.loading")
                : formatLimit(maxGeocercas, notAvailableLabel, tp("common.unlimited"))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {tp("summary.maxTrackers")}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {entitlementsLoading
                ? tp("common.loading")
                : formatLimit(maxTrackers, notAvailableLabel, tp("common.unlimited"))}
            </div>
          </div>
        </div>

        {entitlementsError ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {entitlementsError}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <PlanCard
          title={tp("free.title")}
          subtitle={tp("free.subtitle")}
          price={tp("free.price")}
          description={tp("free.description")}
          current={currentPlanCode === "free"}
          currentBadgeLabel={tp("common.currentPlan")}
          features={freeFeatures}
          cta={
            <FreePlanAction
              currentPlanCode={currentPlanCode}
              currentPlanLabel={tp("free.currentPlanMessage")}
              billingLabel={tp("actions.goToBilling")}
            />
          }
        />

        <PlanCard
          title={tp("pro.title")}
          subtitle={tp("pro.subtitle")}
          price={tp("pro.price")}
          description={tp("pro.description")}
          highlight
          current={currentPlanCode === "pro"}
          currentBadgeLabel={tp("common.currentPlan")}
          features={proFeatures}
          cta={
            <ProPlanAction
              authenticated={authenticated}
              currentOrgId={currentOrgId}
              currentPlanCode={currentPlanCode}
              getAccessToken={getAccessToken}
              billingLabel={tp("actions.goToBilling")}
              higherPlanMessage={tp("pro.higherPlanMessage")}
              reviewBillingMessage={tp("pro.reviewBillingMessage")}
            />
          }
        />

        <PlanCard
          title={tp("enterprise.title")}
          subtitle={tp("enterprise.subtitle")}
          price={tp("enterprise.price")}
          description={tp("enterprise.description")}
          current={currentPlanCode === "enterprise"}
          currentBadgeLabel={tp("common.currentPlan")}
          features={enterpriseFeatures}
          cta={<ContactSalesButton label={tp("actions.contactSales")} />}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{tp("notes.title")}</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          <p>{tp("notes.backendAuthority")}</p>
          <p>{tp("notes.proCheckout")}</p>
          <p>{tp("notes.enterpriseSales")}</p>
        </div>
      </div>
    </div>
  );
}