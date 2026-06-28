import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BILLING_CHECKOUT_MODE,
  BILLING_CHECKOUT_PROVIDER,
  getCheckoutSafetyLabel,
  isCheckoutConfigured,
  type CheckoutPlanCode,
} from "@/config/billingCheckout";
import { useAuth } from "@/context/auth.js";
import { supabase } from "@/lib/supabaseClient.js";

type Props = {
  orgId?: string;
  plan?: CheckoutPlanCode;
  className?: string;
  label?: string;
};

type DodoCheckoutResponse = {
  ok?: boolean;
  checkout_url?: string;
  checkoutUrl?: string;
  redirect_url?: string;
  redirectUrl?: string;
  session_id?: string | null;
  provider?: string;
  mode?: string;
  plan?: string;
  checkout_intent?: string;
  change_plan_completed?: boolean;
  error?: string;
  message?: string;
  current_plan_code?: string;
  current_plan_status?: string;
};

type BillingSnapshot = {
  planCode: string;
  planStatus: string;
};

function cleanId(value: unknown): string {
  return String(value || "").trim();
}

function normalizePlan(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function isActivePaidStatus(value: unknown): boolean {
  return ["active", "trialing", "past_due", "paused"].includes(normalizePlan(value));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildLoginUrl(language: string | undefined): string {
  const params = new URLSearchParams();
  params.set("lang", language || "es");
  params.set("next", "/billing");
  return `/login?${params.toString()}`;
}

function buildBillingUrl(language: string | undefined): string {
  const params = new URLSearchParams();
  params.set("lang", language || "es");
  params.set("upgrade", "enterprise");
  params.set("billing_refresh", String(Date.now()));
  params.set("source", "dodo_change_plan");
  return `/billing?${params.toString()}`;
}

function forceBillingReload(language: string | undefined): void {
  const url = buildBillingUrl(language);

  // Use a hard navigation instead of React-only routing so Billing reloads
  // org_billing after Dodo emits subscription.plan_changed.
  window.location.replace(url);

  // Fallback for browsers that ignore replace during an in-flight state update.
  window.setTimeout(() => {
    if (!window.location.pathname.toLowerCase().startsWith("/billing")) {
      window.location.href = url;
    }
  }, 350);
}

function readAuthTokenFromContext(auth: any): string {
  return cleanId(
    auth?.session?.access_token ||
      auth?.session?.accessToken ||
      auth?.access_token ||
      auth?.accessToken ||
      "",
  );
}

async function readSupabaseAccessToken(): Promise<string> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return "";
    return cleanId(data?.session?.access_token);
  } catch {
    return "";
  }
}

async function readBillingSnapshot(orgId: string): Promise<BillingSnapshot | null> {
  if (!orgId) return null;

  try {
    const { data, error } = await supabase
      .from("org_billing")
      .select("plan_code, subscribed_plan_code, plan_status")
      .eq("org_id", orgId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      planCode: normalizePlan(data.subscribed_plan_code || data.plan_code),
      planStatus: normalizePlan(data.plan_status),
    };
  } catch {
    return null;
  }
}

async function hasEnterpriseActiveBilling(orgId: string): Promise<boolean> {
  const snapshot = await readBillingSnapshot(orgId);

  if (!snapshot) return false;

  return snapshot.planCode === "enterprise" && isActivePaidStatus(snapshot.planStatus);
}

async function waitForEnterpriseActiveBilling(orgId: string, attempts = 10): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (await hasEnterpriseActiveBilling(orgId)) return true;
    await delay(i < 3 ? 800 : 1200);
  }

  return false;
}

function isActiveProBilling(snapshot: BillingSnapshot | null): boolean {
  if (!snapshot) return false;

  return snapshot.planCode === "pro" && isActivePaidStatus(snapshot.planStatus);
}

export default function UpgradeToProButton({ orgId, plan = "pro", className = "", label }: Props) {
  const { t, i18n } = useTranslation();
  const auth = useAuth() as any;
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmUpgradeOpen, setConfirmUpgradeOpen] = useState(false);

  const checkoutPlan = plan || "pro";
  const configured = isCheckoutConfigured(checkoutPlan) && BILLING_CHECKOUT_PROVIDER !== "disabled";

  const effectiveOrgId = useMemo(() => {
    return cleanId(orgId || auth?.currentOrgId || auth?.activeOrgId || auth?.orgId);
  }, [orgId, auth?.currentOrgId, auth?.activeOrgId, auth?.orgId]);

  const isAuthenticated = Boolean(
    auth?.authenticated ?? auth?.isAuthenticated ?? auth?.isLoggedIn ?? auth?.user?.id,
  );

  const buttonLabel =
    label ||
    (checkoutPlan === "enterprise"
      ? t("dashboard.subscribeEnterprise", { defaultValue: "Subscribe to Enterprise" })
      : t("dashboard.subscribePro", { defaultValue: "Subscribe to PRO" }));

  const defaultClassName =
    "inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500";

  async function redirectToBillingAfterUpgrade() {
    forceBillingReload(i18n?.language);
  }

  async function finishEnterpriseChangePlan() {
    if (effectiveOrgId) {
      await waitForEnterpriseActiveBilling(effectiveOrgId, 14);
    }

    forceBillingReload(i18n?.language);
  }

  async function runCheckout({ confirmedPlanChange = false }: { confirmedPlanChange?: boolean } = {}) {
    setErrorMsg(null);

    if (!configured) {
      setErrorMsg(
        t("billing.checkout.notConfigured", {
          defaultValue: "Secure checkout is not configured yet. Please contact support.",
        }),
      );
      return;
    }

    if (!isAuthenticated) {
      setErrorMsg(
        t("billing.checkout.loginRequired", {
          defaultValue: "Please sign in to choose an organization before opening checkout.",
        }),
      );

      window.location.assign(buildLoginUrl(i18n?.language));
      return;
    }

    if (!effectiveOrgId) {
      setErrorMsg(
        t("billing.checkout.orgRequired", {
          defaultValue: "Please select an organization before opening checkout.",
        }),
      );
      return;
    }

    try {
      setLoading(true);

      if (checkoutPlan === "enterprise" && !confirmedPlanChange) {
        const billingSnapshot = await readBillingSnapshot(effectiveOrgId);

        if (isActiveProBilling(billingSnapshot)) {
          setConfirmUpgradeOpen(true);
          setLoading(false);
          return;
        }
      }

      const accessToken = readAuthTokenFromContext(auth) || (await readSupabaseAccessToken());

      if (!accessToken) {
        throw new Error(
          t("billing.checkout.sessionRequired", {
            defaultValue: "Your session could not be verified. Please sign in again.",
          }),
        );
      }

      const { data, error } = await supabase.functions.invoke("dodo-create-checkout", {
        body: {
          org_id: effectiveOrgId,
          plan: checkoutPlan,
          lang: i18n?.language || "es",
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const response = data as DodoCheckoutResponse | null;
      const checkoutUrl = cleanId(response?.checkout_url || response?.checkoutUrl);

      if (error) {
        if (checkoutPlan === "enterprise" && (await waitForEnterpriseActiveBilling(effectiveOrgId))) {
          await redirectToBillingAfterUpgrade();
          return;
        }

        throw error;
      }

      if (!response?.ok) {
        const responsePlan = normalizePlan(response?.current_plan_code);
        const responseStatus = normalizePlan(response?.current_plan_status);
        const alreadyEnterprise =
          checkoutPlan === "enterprise" &&
          (response?.error === "enterprise_already_active" ||
            (responsePlan === "enterprise" && isActivePaidStatus(responseStatus)) ||
            (await waitForEnterpriseActiveBilling(effectiveOrgId)));

        if (alreadyEnterprise) {
          await finishEnterpriseChangePlan();
          return;
        }

        throw new Error(
          response?.message ||
            response?.error ||
            t("billing.checkout.openError", {
              defaultValue: "Could not open secure checkout. Please try again.",
            }),
        );
      }

      if (response.change_plan_completed) {
        await finishEnterpriseChangePlan();
        return;
      }

      if (!checkoutUrl) {
        if (checkoutPlan === "enterprise" && (await waitForEnterpriseActiveBilling(effectiveOrgId))) {
          await finishEnterpriseChangePlan();
          return;
        }

        throw new Error(
          response?.message ||
            response?.error ||
            t("billing.checkout.openError", {
              defaultValue: "Could not open secure checkout. Please try again.",
            }),
        );
      }

      window.location.assign(checkoutUrl);
    } catch (error) {
      console.error("[billing-checkout] create checkout error", error);
      setErrorMsg(
        error instanceof Error
          ? error.message
          : t("billing.checkout.openError", {
              defaultValue: "Could not open secure checkout. Please try again.",
            }),
      );
      setLoading(false);
    }
  }

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    await runCheckout();
  }

  async function confirmEnterpriseUpgrade() {
    setConfirmUpgradeOpen(false);
    await runCheckout({ confirmedPlanChange: true });
  }

  function cancelEnterpriseUpgrade() {
    if (loading) return;
    setConfirmUpgradeOpen(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || !configured}
        className={className || defaultClassName}
      >
        {loading
          ? checkoutPlan === "enterprise"
            ? t("billing.checkout.confirmEnterpriseProcessing", {
                defaultValue: "Changing plan...",
              })
            : t("dashboard.openingCheckout", { defaultValue: "Opening checkout..." })
          : buttonLabel}
      </button>

      {BILLING_CHECKOUT_MODE === "test" ? (
        <p className="mt-2 text-xs text-slate-500">
          {getCheckoutSafetyLabel()}:{" "}
          {t("billing.checkout.testNotice", { defaultValue: "no real charge will be made." })}
        </p>
      ) : null}

      {errorMsg && !loading ? (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {errorMsg}
        </div>
      ) : null}

      {confirmUpgradeOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="enterprise-upgrade-confirm-title"
        >
          <div className="w-full max-w-lg rounded-3xl border border-emerald-100 bg-white p-6 shadow-2xl shadow-emerald-950/20">
            <div className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
              {t("billing.checkout.confirmUpgradeBadge", { defaultValue: "Plan change" })}
            </div>

            <h2 id="enterprise-upgrade-confirm-title" className="mt-4 text-xl font-bold text-slate-950">
              {t("billing.checkout.confirmEnterpriseTitle", {
                defaultValue: "Confirm change to Enterprise",
              })}
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              {t("billing.checkout.confirmEnterpriseBody", {
                defaultValue:
                  "Your organization will change from PRO to Enterprise. Dodo will use the payment method associated with your current subscription. No second subscription will be created.",
              })}
            </p>

            <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-4">
                <span className="font-semibold">
                  {t("billing.checkout.confirmEnterprisePlanLabel", { defaultValue: "New plan" })}
                </span>
                <span className="font-bold text-slate-950">Enterprise</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="font-semibold">
                  {t("billing.checkout.confirmEnterprisePriceLabel", { defaultValue: "Price" })}
                </span>
                <span className="font-bold text-slate-950">USD 99 / month</span>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={cancelEnterpriseUpgrade}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </button>

              <button
                type="button"
                onClick={confirmEnterpriseUpgrade}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {loading
                  ? t("billing.checkout.confirmEnterpriseProcessing", {
                      defaultValue: "Changing plan...",
                    })
                  : t("billing.checkout.confirmEnterpriseAction", {
                      defaultValue: "Confirm change",
                    })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
