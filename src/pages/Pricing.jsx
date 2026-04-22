import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import { supabase } from "@/lib/supabaseClient.js";
import useOrgEntitlements from "@/hooks/useOrgEntitlements.js";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton";

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
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
        tones[tone] || tones.slate
      }`}
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
      className={`relative rounded-2xl border p-6 shadow-sm ${
        highlight
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            className={`text-xl font-semibold ${
              highlight ? "text-white" : "text-slate-900"
            }`}
          >
            {title}
          </h2>
          <p
            className={`mt-1 text-sm ${
              highlight ? "text-slate-300" : "text-slate-600"
            }`}
          >
            {subtitle}
          </p>
        </div>

        {current ? (
          <PlanBadge tone={highlight ? "amber" : "emerald"}>
            {currentBadgeLabel}
          </PlanBadge>
        ) : null}
      </div>

      <div className="mt-6">
        <div
          className={`text-3xl font-bold ${
            highlight ? "text-white" : "text-slate-900"
          }`}
        >
          {price}
        </div>
        <p
          className={`mt-2 text-sm ${
            highlight ? "text-slate-300" : "text-slate-600"
          }`}
        >
          {description}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {features.map((item) => (
          <div
            key={item}
            className={`flex items-start gap-3 text-sm ${
              highlight ? "text-slate-200" : "text-slate-700"
            }`}
          >
            <span className={`mt-0.5 ${highlight ? "text-white" : "text-slate-900"}`}>
              •
            </span>
            <span>{item}</span>
          </div>
        ))}
      </div>

      <div className="relative z-20 mt-8">{cta}</div>
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
      className="inline-flex w-full items-center justify-center px-6 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold transition"
    >
      {billingLabel}
    </Link>
  );
}

function ProPlanAction({
  authenticated,
  currentOrgId,
  currentPlanCode,
  billingLabel,
  higherPlanMessage,
  reviewBillingMessage,
}) {
  if (!authenticated || !currentOrgId) {
    return (
      <Link
        to="/billing"
        className="inline-flex w-full items-center justify-center px-6 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold transition"
      >
        {billingLabel}
      </Link>
    );
  }

  if (currentPlanCode === "free") {
    return (
      <div className="space-y-2 relative z-20">
        <div className="relative z-30">
          <UpgradeToProButton orgId={currentOrgId} plan="pro" />
        </div>
      </div>
    );
  }

  if (currentPlanCode === "pro") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <span className="block text-sm font-medium text-green-800">
          {reviewBillingMessage}
        </span>
        <div className="mt-3 sm:mt-0 sm:shrink-0">
          <Link
            to="/billing"
            className="inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            {billingLabel}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
      <div className="text-sm text-green-800">
        <div className="font-medium">{higherPlanMessage}</div>
        <div className="mt-1">{reviewBillingMessage}</div>
      </div>
      <div className="mt-3 sm:mt-0 sm:shrink-0">
        <Link
          to="/billing"
          className="inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
        >
          {billingLabel}
        </Link>
      </div>
    </div>
  );
}

function EnterprisePlanAction({
  authenticated,
  currentOrgId,
  currentPlanCode,
  billingLabel,
  contactSalesLabel,
  reviewBillingMessage,
}) {
  if (!authenticated || !currentOrgId) {
    return (
      <Link
        to="/billing"
        className="inline-flex w-full items-center justify-center px-6 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold transition"
      >
        {billingLabel}
      </Link>
    );
  }

  if (currentPlanCode === "enterprise") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <span className="block text-sm font-medium text-green-800">
          {reviewBillingMessage}
        </span>
        <div className="mt-3 sm:mt-0 sm:shrink-0">
          <Link
            to="/billing"
            className="inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            {billingLabel}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 relative z-20">
      <div className="relative z-30">
        <UpgradeToProButton orgId={currentOrgId} plan="enterprise" />
      </div>
      <ContactSalesButton label={contactSalesLabel} />
    </div>
  );
}

export default function Pricing() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { loading, ready, authenticated, currentOrgId, isAdmin } = useAuth();
  const {
    loading: entitlementsLoading,
    error: entitlementsError,
    planCode,
    maxGeocercas,
    maxTrackers,
    normalizedPlanStatus,
    statusLabelKey,
  } = useOrgEntitlements();

  const [billingPanel, setBillingPanel] = useState(null);

  const tp = React.useCallback(
    (key, options) => {
      const value = t([`pricing.${key}`, `pricingPage.${key}`], options);
      if (
        value === `pricing.${key}` ||
        value === `pricingPage.${key}` ||
        value === key
      ) {
        return null;
      }
      return value;
    },
    [t]
  );

  const tt = React.useCallback(
    (key, fallback, options) => {
      const translated = tp(key, options);
      return translated ?? fallback;
    },
    [tp]
  );

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

      if (cancelled) return;

      if (error) {
        if (
          error.message?.includes("does not exist") ||
          error.message?.includes("schema cache")
        ) {
          console.warn("[Pricing] fallback billing");
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

  const currentPlanCode = useMemo(() => {
    return normalizePlanCode(billingPanel?.effective_plan_code || planCode);
  }, [billingPanel, planCode]);

  const notAvailableLabel = tt("common.notAvailable", "—");
  const loadingLabel = tt("common.loading", "Loading...");
  const unlimitedLabel = tt(
    "common.unlimited",
    i18n.language === "fr"
      ? "Illimité"
      : i18n.language === "en"
        ? "Unlimited"
        : "Unlimited"
  );

  const detectedPlanLabel = useMemo(() => {
    const key = `summary.planCodes.${currentPlanCode}`;
    const translated = tp(key);
    if (translated) return translated;
    return tt(
      "summary.planCodeUnknown",
      String(currentPlanCode || "").toUpperCase() || "UNKNOWN",
      { code: String(currentPlanCode || "").toUpperCase() }
    );
  }, [currentPlanCode, tp, tt]);

  // Use normalizedPlanStatus from hook as the only source of truth for status
  const billingStatusLabel = useMemo(() => {
    if (!normalizedPlanStatus || normalizedPlanStatus === "unknown") {
      return tt(
        "summary.noCommercialData",
        i18n.language === "fr"
          ? "Aucune donnée commerciale"
          : i18n.language === "en"
            ? "No commercial data"
            : "No commercial data"
      );
    }
    const statusKey = `status.${statusLabelKey}`;
    const translated = tp(statusKey);
    if (translated) return translated;
    return tt(
      "status.other",
      statusLabelKey,
      { status: statusLabelKey }
    );
  }, [normalizedPlanStatus, statusLabelKey, i18n.language, tp, tt]);

  const trialUntil = useMemo(() => {
    const value = billingPanel?.trial_end;
    if (!value) return notAvailableLabel;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return notAvailableLabel;
    return d.toLocaleDateString();
  }, [billingPanel, notAvailableLabel]);

  const freeFeatures = useMemo(
    () => [
      tt(
        "free.features.validateFlow",
        i18n.language === "fr"
          ? "Idéal pour démarrer et valider le flux de base"
          : i18n.language === "en"
            ? "Ideal to get started and validate the base flow"
            : "Ideal to get started and validate the base flow"
      ),
      tt(
        "free.features.upToTrackers",
        i18n.language === "fr" ? "Jusqu'à 1 tracker" : i18n.language === "en" ? "Up to 1 tracker" : "Up to 1 tracker",
        { count: 1 }
      ),
      tt(
        "free.features.geofenceLimits",
        i18n.language === "fr"
          ? "Géorepères avec limite selon le plan"
          : i18n.language === "en"
            ? "Geofences with plan-based limits"
            : "Geofences with plan-based limits"
      ),
      tt(
        "free.features.billingAndUpgrade",
        i18n.language === "fr"
          ? "Accès à la facturation et à la future mise à niveau du plan"
          : i18n.language === "en"
            ? "Access to Billing and future plan upgrade flow"
            : "Access to Billing and future plan upgrade flow"
      ),
      tt(
        "free.features.backendEnforcement",
        i18n.language === "fr"
          ? "Le backend applique toujours les limites réelles"
          : i18n.language === "en"
            ? "Backend still enforces the real limits"
            : "Backend still enforces the real limits"
      ),
    ],
    [i18n.language, tt]
  );

  const proFeatures = useMemo(
    () => [
      tt(
        "pro.features.upToTrackers",
        i18n.language === "fr"
          ? `Jusqu'à ${formatLimit(maxTrackers || 3, "3", unlimitedLabel)} trackers par organisation`
          : i18n.language === "en"
            ? `Up to ${formatLimit(maxTrackers || 3, "3", unlimitedLabel)} trackers per organization`
            : `Up to ${formatLimit(maxTrackers || 3, "3", unlimitedLabel)} trackers per organization`,
        {
          count: formatLimit(maxTrackers || 3, "3", unlimitedLabel),
        }
      ),
      tt(
        "pro.features.upToGeofences",
        i18n.language === "fr"
          ? `Jusqu'à ${formatLimit(maxGeocercas || 9999, notAvailableLabel, unlimitedLabel)} géorepères`
          : i18n.language === "en"
            ? `Up to ${formatLimit(maxGeocercas || 9999, notAvailableLabel, unlimitedLabel)} geofences`
            : `Up to ${formatLimit(maxGeocercas || 9999, notAvailableLabel, unlimitedLabel)} geofences`,
        {
          count: formatLimit(maxGeocercas || 9999, notAvailableLabel, unlimitedLabel),
        }
      ),
      tt(
        "pro.features.trackerEnabled",
        i18n.language === "fr"
          ? "Module Tracker activé"
          : i18n.language === "en"
            ? "Tracker module enabled"
            : "Tracker module enabled"
      ),
      tt(
        "pro.features.invitesEnabled",
        i18n.language === "fr"
          ? "Invitation des trackers activée"
          : i18n.language === "en"
            ? "Tracker invitations enabled"
            : "Tracker invitations enabled"
      ),
      tt(
        "pro.features.stripeSelfManaged",
        i18n.language === "fr"
          ? "Abonnement autogéré"
          : i18n.language === "en"
            ? "Self-managed subscription"
            : "Self-managed subscription"
      ),
    ],
    [maxTrackers, maxGeocercas, notAvailableLabel, unlimitedLabel, i18n.language, tt]
  );

  const enterpriseFeatures = useMemo(
    () => [
      tt(
        "enterprise.features.salesOnboarding",
        i18n.language === "fr"
          ? "Accompagnement commercial et onboarding guidé"
          : i18n.language === "en"
            ? "Sales assistance and guided onboarding"
            : "Sales assistance and guided onboarding"
      ),
      tt(
        "enterprise.features.flexibleLimits",
        i18n.language === "fr"
          ? "Limites et conditions ajustables"
          : i18n.language === "en"
            ? "Adjustable limits and conditions"
            : "Adjustable limits and conditions"
      ),
      tt(
        "enterprise.features.multiTeamReady",
        i18n.language === "fr"
          ? "Prêt pour les opérations multi-équipes"
          : i18n.language === "en"
            ? "Ready for multi-team operations"
            : "Ready for multi-team operations"
      ),
      tt(
        "enterprise.features.specialAgreements",
        i18n.language === "fr"
          ? "Escalade commerciale et accords spéciaux"
          : i18n.language === "en"
            ? "Commercial escalation and special agreements"
            : "Commercial escalation and special agreements"
      ),
      tt(
        "enterprise.features.directSalesContact",
        i18n.language === "fr"
          ? "Contact direct avec l'équipe commerciale"
          : i18n.language === "en"
            ? "Direct contact with sales"
            : "Direct contact with sales"
      ),
    ],
    [i18n.language, tt]
  );

  if (loading || !ready) return null;

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h1 className="text-xl font-semibold">
            {tt(
              "title",
              i18n.language === "fr"
                ? "Plans et tarifs"
                : i18n.language === "en"
                  ? "Plans and pricing"
                  : "Plans and pricing"
            )}
          </h1>
          <p className="mt-2 text-sm">
            {tt(
              "accessDenied",
              i18n.language === "fr"
                ? "Vous n'avez pas accès à ce module."
                : i18n.language === "en"
                  ? "You do not have access to this module."
                  : "You do not have access to this module."
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">
              {tt(
                "title",
                i18n.language === "fr"
                  ? "Plans et tarifs"
                  : i18n.language === "en"
                    ? "Plans and pricing"
                    : "Plans and pricing"
              )}
            </h1>
            <p className="mt-2 max-w-3xl text-slate-600">
              {tt(
                "page.previewNotice.prefix",
                i18n.language === "fr"
                  ? "Gérez votre forfait et vérifiez la capacité disponible de votre organisation."
                  : i18n.language === "en"
                    ? "Manage your plan and review your organization capacity."
                    : "Manage your plan and review your organization capacity."
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/billing"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold transition"
            >
              {tt(
                "actions.goToBilling",
                i18n.language === "fr"
                  ? "Aller à la facturation"
                  : i18n.language === "en"
                    ? "Go to Billing"
                    : "Go to Billing"
              )}
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {tt(
                "summary.detectedPlan",
                i18n.language === "fr"
                  ? "Plan détecté"
                  : i18n.language === "en"
                    ? "Detected plan"
                    : "Detected plan"
              )}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {detectedPlanLabel}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {tt(
                "summary.status",
                i18n.language === "fr"
                  ? "Statut"
                  : i18n.language === "en"
                    ? "Status"
                    : "Status"
              )}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {billingStatusLabel}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {tt(
                "summary.trialUntil",
                i18n.language === "fr"
                  ? "Essai jusqu'au"
                  : i18n.language === "en"
                    ? "Trial until"
                    : "Trial until"
              )}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{trialUntil}</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {tt(
                "summary.maxGeofences",
                i18n.language === "fr"
                  ? "Max. géorepères"
                  : i18n.language === "en"
                    ? "Max geofences"
                    : "Max geofences"
              )}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {entitlementsLoading
                ? loadingLabel
                : formatLimit(maxGeocercas, notAvailableLabel, unlimitedLabel)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {tt(
                "summary.maxTrackers",
                i18n.language === "fr"
                  ? "Max. trackers"
                  : i18n.language === "en"
                    ? "Max trackers"
                    : "Max trackers"
              )}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {entitlementsLoading
                ? loadingLabel
                : formatLimit(maxTrackers, notAvailableLabel, unlimitedLabel)}
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
          title={tt("free.title", "Free")}
          subtitle={tt(
            "free.subtitle",
            i18n.language === "fr"
              ? "Pour commencer"
              : i18n.language === "en"
                ? "To get started"
                : "To get started"
          )}
          price={tt("free.price", "$0")}
          description={tt(
            "free.description",
            i18n.language === "fr"
              ? "Conçu pour valider l'usage initial de la plateforme."
              : i18n.language === "en"
                ? "Designed to validate initial platform usage."
                : "Designed to validate initial platform usage."
          )}
          current={currentPlanCode === "free"}
          currentBadgeLabel={tt(
            "common.currentPlan",
            i18n.language === "fr"
              ? "Plan actuel"
              : i18n.language === "en"
                ? "Current plan"
                : "Current plan"
          )}
          features={freeFeatures}
          cta={
            <FreePlanAction
              currentPlanCode={currentPlanCode}
              currentPlanLabel={tt(
                "free.currentPlanMessage",
                i18n.language === "fr"
                  ? "Vous utilisez déjà le plan Free."
                  : i18n.language === "en"
                    ? "You are already using the Free plan."
                    : "You are already using the Free plan."
              )}
              billingLabel={tt(
                "actions.goToBilling",
                i18n.language === "fr"
                  ? "Aller à la facturation"
                  : i18n.language === "en"
                    ? "Go to Billing"
                    : "Go to Billing"
              )}
            />
          }
        />

        <PlanCard
          title={tt("pro.title", "Pro")}
          subtitle={tt(
            "pro.subtitle",
            i18n.language === "fr"
              ? "Opérations SaaS actives"
              : i18n.language === "en"
                ? "Active SaaS operations"
                : "Active SaaS operations"
          )}
          price={tt("pro.price", "Pro")}
          description={tt(
            "pro.description",
            i18n.language === "fr"
              ? "Plan recommandé pour activer le module Tracker et fonctionner avec abonnement."
              : i18n.language === "en"
                ? "Recommended plan to enable the Tracker module and operate with subscriptions."
                : "Recommended plan to enable the Tracker module and operate with subscriptions."
          )}
          highlight
          current={currentPlanCode === "pro"}
          currentBadgeLabel={tt(
            "common.currentPlan",
            i18n.language === "fr"
              ? "Plan actuel"
              : i18n.language === "en"
                ? "Current plan"
                : "Current plan"
          )}
          features={proFeatures}
          cta={
            <ProPlanAction
              authenticated={authenticated}
              currentOrgId={currentOrgId}
              currentPlanCode={currentPlanCode}
              billingLabel={tt(
                "actions.goToBilling",
                i18n.language === "fr"
                  ? "Aller à la facturation"
                  : i18n.language === "en"
                    ? "Go to Billing"
                    : "Go to Billing"
              )}
              higherPlanMessage={tt(
                "pro.higherPlanMessage",
                i18n.language === "fr"
                  ? "Votre organisation a déjà un plan supérieur ou différent de Free."
                  : i18n.language === "en"
                    ? "Your organization already has a plan higher than or different from Free."
                    : "Your organization already has a plan higher than or different from Free."
              )}
              reviewBillingMessage={tt(
                "pro.reviewBillingMessage",
                i18n.language === "fr"
                  ? "Consultez la facturation pour le gérer."
                  : i18n.language === "en"
                    ? "Review Billing to manage it."
                    : "Review Billing to manage it."
              )}
            />
          }
        />

        <PlanCard
          title={tt("enterprise.title", "Enterprise")}
          subtitle={tt(
            "enterprise.subtitle",
            i18n.language === "fr"
              ? "Vente assistée"
              : i18n.language === "en"
                ? "Assisted sales"
                : "Assisted sales"
          )}
          price={tt(
            "enterprise.price",
            i18n.language === "fr"
              ? "Sur mesure"
              : i18n.language === "en"
                ? "Custom"
                : "Custom"
          )}
          description={tt(
            "enterprise.description",
            i18n.language === "fr"
              ? "Pour les organisations qui nécessitent des conditions commerciales spéciales."
              : i18n.language === "en"
                ? "For organizations that require special commercial conditions."
                : "For organizations that require special commercial conditions."
          )}
          current={currentPlanCode === "enterprise"}
          currentBadgeLabel={tt(
            "common.currentPlan",
            i18n.language === "fr"
              ? "Plan actuel"
              : i18n.language === "en"
                ? "Current plan"
                : "Current plan"
          )}
          features={enterpriseFeatures}
          cta={
            <EnterprisePlanAction
              authenticated={authenticated}
              currentOrgId={currentOrgId}
              currentPlanCode={currentPlanCode}
              billingLabel={tt(
                "actions.goToBilling",
                i18n.language === "fr"
                  ? "Aller à la facturation"
                  : i18n.language === "en"
                    ? "Go to Billing"
                    : "Go to Billing"
              )}
              contactSalesLabel={tt(
                "actions.contactSales",
                i18n.language === "fr"
                  ? "Contacter l'équipe commerciale"
                  : i18n.language === "en"
                    ? "Contact sales"
                    : "Contact sales"
              )}
              reviewBillingMessage={tt(
                "pro.reviewBillingMessage",
                i18n.language === "fr"
                  ? "Consultez la facturation pour le gérer."
                  : i18n.language === "en"
                    ? "Review Billing to manage it."
                    : "Review Billing to manage it."
              )}
            />
          }
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          {tt(
            "notes.title",
            i18n.language === "fr"
              ? "Notes pour cette phase"
              : i18n.language === "en"
                ? "Notes for this phase"
                : "Notes for this phase"
          )}
        </h2>
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          <p>
            {tt(
              "notes.backendAuthority",
              i18n.language === "fr"
                ? "Le backend reste l'autorité réelle du plan. Cette page reflète seulement le plan et affiche les actions commerciales disponibles."
                : i18n.language === "en"
                  ? "The backend remains the real source of truth for the plan. This page only reflects the plan and shows the available commercial actions."
                  : "The backend remains the real source of truth for the plan. This page only reflects the plan and shows the available commercial actions."
            )}
          </p>
          <p>
            {tt(
              "notes.proCheckout",
              i18n.language === "fr"
                ? "La mise à niveau vers Pro utilise un paiement sécurisé. La gestion de l'abonnement sera disponible depuis la facturation."
                : i18n.language === "en"
                  ? "Upgrading to Pro uses a secure checkout. Subscription management will be available from Billing."
                  : "Upgrading to Pro uses a secure checkout. Subscription management will be available from Billing."
            )}
          </p>
          <p>
            {tt(
              "notes.enterpriseSales",
              i18n.language === "fr"
                ? "Enterprise est présenté comme un canal commercial, sans activer de checkout automatique."
                : i18n.language === "en"
                  ? "Enterprise is presented as a sales channel, without enabling automatic checkout."
                  : "Enterprise is presented as a sales channel, without enabling automatic checkout."
            )}
          </p>
        </div>
      </div>
    </div>
  );
}