import LanguageSwitcher from "../components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton";
import { useAuth } from "@/context/auth.js";
import { supabase } from "@/lib/supabaseClient.js";
import { BILLING_CHECKOUT_MODE } from "@/config/billingCheckout";
import { PRICING, PLAN_RANK, formatPlanPrice } from "@/config/pricing";


function normalizePlanCode(value) {
  const code = String(value || "free").toLowerCase().trim();
  if (code === "enterprise_100") return "enterprise_100";
  if (code === "enterprise") return "enterprise";
  if (code === "pro") return "pro";
  return "free";
}

function normalizePlanStatus(value) {
  return String(value || "free").toLowerCase().trim();
}

function isActivePaidStatus(status) {
  return ["active", "trialing"].includes(normalizePlanStatus(status));
}

function formatDate(value, language) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(language, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function CurrentPlanNotice({ children, highlighted = false }) {
  return (
    <div
      className={`rounded-xl border p-4 text-sm ${
        highlighted
          ? "border-emerald-200 bg-white/10 text-emerald-50"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {children}
    </div>
  );
}

function PlanAction({
  plan,
  currentPlanCode,
  hasActivePaidPlan,
  authenticated,
  currentOrgId,
  currentPeriodEnd,
  highlighted,
}) {
  const { t, i18n } = useTranslation();
  const buttonLabel = t("publicPricing.subscribe", { plan: PRICING[plan].label });
  const currentPlanLabel = PRICING[currentPlanCode]?.label || "Free";
  const billingButtonClass = highlighted
    ? "mt-3 inline-flex w-full items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
    : "mt-3 inline-flex w-full items-center justify-center rounded-xl border border-emerald-300 bg-white px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50";
  const checkoutButtonClass = highlighted
    ? "inline-flex w-full items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
    : "inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500";

  if (authenticated && currentOrgId && hasActivePaidPlan && currentPlanCode === plan) {
    const renewal = formatDate(currentPeriodEnd, i18n.language);
    return (
      <CurrentPlanNotice highlighted={highlighted}>
        <div className="font-semibold">{t("publicPricing.activeNotice")}</div>
        {renewal ? <div className="mt-1">{t("publicPricing.renewal", { date: renewal })}</div> : null}
        <Link to={`/billing?lang=${i18n.language}`} className={billingButtonClass}>
          {t("publicPricing.billing")}
        </Link>
      </CurrentPlanNotice>
    );
  }

  if (
    authenticated &&
    currentOrgId &&
    hasActivePaidPlan &&
    (PLAN_RANK[currentPlanCode] || 0) > (PLAN_RANK[plan] || 0)
  ) {
    return (
      <CurrentPlanNotice highlighted={highlighted}>
        <div className="font-semibold">{t("publicPricing.alreadyHas", { plan: currentPlanLabel })}</div>
        <div className="mt-1">{t("publicPricing.noCheckout")}</div>
        <Link to={`/billing?lang=${i18n.language}`} className={billingButtonClass}>
          {t("publicPricing.billing")}
        </Link>
      </CurrentPlanNotice>
    );
  }

  if (!authenticated || !currentOrgId) {
    return (
      <div className="space-y-2">
        <Link to={`/billing?lang=${i18n.language}`} className={checkoutButtonClass}>
          {t("publicPricing.signIn")}
        </Link>
        <p className={`text-xs ${highlighted ? "text-emerald-200" : "text-slate-500"}`}>
          {t("publicPricing.orgRequired")}
        </p>
      </div>
    );
  }

  return (
    <UpgradeToProButton
      orgId={currentOrgId}
      plan={plan}
      label={buttonLabel}
      className={checkoutButtonClass}
    />
  );
}

function PlanCard({
  plan,
  title,
  subtitle,
  description,
  features,
  highlighted = false,
  currentPlanCode,
  hasActivePaidPlan,
  authenticated,
  currentOrgId,
  currentPeriodEnd,
}) {
  const { t, i18n } = useTranslation();
  const price = formatPlanPrice(plan, i18n.language);
  const isCurrentPlan = hasActivePaidPlan && currentPlanCode === plan;

  return (
    <article
      className={`flex h-full flex-col rounded-3xl border p-7 shadow-sm ${
        highlighted
          ? "border-emerald-950 bg-emerald-950 text-white"
          : "border-emerald-100 bg-white text-emerald-950"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-sm font-semibold ${highlighted ? "text-emerald-200" : "text-emerald-700"}`}>
            {subtitle}
          </p>
          <h2 className={`mt-2 text-2xl font-bold ${highlighted ? "text-white" : "text-emerald-950"}`}>
            {title}
          </h2>
        </div>
        {isCurrentPlan ? (
          <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-950">
            {t("publicPricing.current")}
          </span>
        ) : highlighted ? (
          <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-950">
            {t("publicPricing.recommended")}
          </span>
        ) : null}
      </div>

      <div className="mt-7">
        <div className={`text-4xl font-bold ${highlighted ? "text-white" : "text-emerald-950"}`}>{price}</div>
        <p className="mt-1 text-sm">{t("publicPricing.perMonth")}</p>
        <p className={`mt-3 text-sm leading-6 ${highlighted ? "text-emerald-100" : "text-emerald-700"}`}>
          {description}
        </p>
      </div>

      <ul className="mt-7 flex-1 space-y-3">
        {features.map((feature) => (
          <li key={feature} className={`flex gap-3 text-sm ${highlighted ? "text-emerald-50" : "text-emerald-800"}`}>
            <span aria-hidden="true" className={highlighted ? "text-emerald-200" : "text-emerald-700"}>✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <PlanAction
          plan={plan}
          currentPlanCode={currentPlanCode}
          hasActivePaidPlan={hasActivePaidPlan}
          authenticated={authenticated}
          currentOrgId={currentOrgId}
          currentPeriodEnd={currentPeriodEnd}
          highlighted={highlighted}
        />
      </div>
    </article>
  );
}

export default function PublicPricing() {
  const { t, i18n } = useTranslation();
  const { authenticated, currentOrgId } = useAuth();
  const [billing, setBilling] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadBilling() {
      if (!authenticated || !currentOrgId) {
        setBilling(null);
        setBillingLoading(false);
        return;
      }

      setBillingLoading(true);

      const { data, error } = await supabase
        .from("org_billing")
        .select("org_id, plan_code, subscribed_plan_code, plan_status, billing_provider, current_period_end")
        .eq("org_id", currentOrgId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn("[PublicPricing] could not load org_billing", error);
        setBilling(null);
      } else {
        setBilling(data || null);
      }

      setBillingLoading(false);
    }

    loadBilling();

    return () => {
      cancelled = true;
    };
  }, [authenticated, currentOrgId]);

  const currentPlanCode = useMemo(() => {
    return normalizePlanCode(billing?.subscribed_plan_code || billing?.plan_code);
  }, [billing]);

  const currentPlanStatus = normalizePlanStatus(billing?.plan_status);
  const hasActivePaidPlan = isActivePaidStatus(currentPlanStatus) && currentPlanCode !== "free";
  const currentPlanLabel = PRICING[currentPlanCode]?.label || "Free";
  const currentPeriodEnd = billing?.current_period_end || null;

  return (
    <main className="min-h-screen bg-slate-50 text-emerald-950">
      <section className="mx-auto max-w-6xl px-6 py-8 sm:py-12">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link to={`/inicio?lang=${i18n.language}`} className="font-semibold text-emerald-700 hover:underline">{t("publicPricing.back")}</Link>
          <LanguageSwitcher />
        </div>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Geocercas GPS</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-emerald-950 sm:text-5xl">
              {t("publicPricing.title")}
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-700 sm:text-lg">
              {t("publicPricing.intro")}
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <div className="font-semibold">{t("publicPricing.mode")}</div>
              <div>{t("publicPricing.mode_" + (["test", "live"].includes(BILLING_CHECKOUT_MODE) ? BILLING_CHECKOUT_MODE : "preview"))}</div>
            </div>

            {authenticated && currentOrgId ? (
              <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800 shadow-sm">
                <div className="font-semibold">{t("publicPricing.organization")}</div>
                <div>
                  {billingLoading
                    ? t("publicPricing.checking")
                    : hasActivePaidPlan
                      ? t("publicPricing.activePlan", { plan: currentPlanLabel })
                      : t("publicPricing.noPaidPlan")}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <PlanCard
            plan="pro"
            title="Geocercas GPS PRO"
            subtitle={t("publicPricing.proSubtitle")}
            description={t("publicPricing.proDescription")}
            highlighted
            currentPlanCode={currentPlanCode}
            hasActivePaidPlan={hasActivePaidPlan}
            authenticated={authenticated}
            currentOrgId={currentOrgId}
            currentPeriodEnd={currentPeriodEnd}
            features={[
              t("publicPricing.monthlyCheckout"),
              t("publicPricing.trackers"),
              t("publicPricing.geofences"),
              t("publicPricing.reports"),
              t("publicPricing.android"),
            ]}
          />

          <PlanCard
            plan="enterprise"
            title="Geocercas GPS Enterprise"
            subtitle={t("publicPricing.enterpriseSubtitle")}
            description={t("publicPricing.enterpriseDescription")}
            currentPlanCode={currentPlanCode}
            hasActivePaidPlan={hasActivePaidPlan}
            authenticated={authenticated}
            currentOrgId={currentOrgId}
            currentPeriodEnd={currentPeriodEnd}
            features={[
              t("publicPricing.monthlyCheckout"),
              t("publicPricing.teams"),
              t("publicPricing.capacity"),
              t("publicPricing.management"),
              t("publicPricing.support"),
            ]}
          />
          <PlanCard
            plan="enterprise_100"
            title="ENTERPRISE 100"
            subtitle={t("plans100.description")}
            description={t("plans100.limits")}
            currentPlanCode={currentPlanCode}
            hasActivePaidPlan={hasActivePaidPlan}
            authenticated={authenticated}
            currentOrgId={currentOrgId}
            currentPeriodEnd={currentPeriodEnd}
            features={[t("plans100.limits")]}
          />
        </div>

        <div className="mt-10 rounded-3xl border border-emerald-100 bg-white p-6 text-sm leading-6 text-slate-700 shadow-sm">
          <h2 className="text-lg font-semibold text-emerald-950">{t("publicPricing.authorizedTitle")}</h2>
          <p className="mt-2">
            {t("publicPricing.authorizedBody")}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className="font-semibold text-emerald-700 hover:text-emerald-900" to={`/authorized-location-use?lang=${i18n.language}`}>
              {t("publicPricing.locationPolicy")}
            </Link>
            <Link className="font-semibold text-emerald-700 hover:text-emerald-900" to={`/terms?lang=${i18n.language}`}>
              {t("publicPricing.terms")}
            </Link>
            <Link className="font-semibold text-emerald-700 hover:text-emerald-900" to={`/privacy?lang=${i18n.language}`}>
              {t("publicPricing.privacy")}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
