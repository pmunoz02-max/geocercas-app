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
  session_id?: string | null;
  provider?: string;
  mode?: string;
  plan?: string;
  error?: string;
  message?: string;
};

function cleanId(value: unknown): string {
  return String(value || "").trim();
}

function buildLoginUrl(language: string | undefined): string {
  const params = new URLSearchParams();
  params.set("lang", language || "es");
  params.set("next", "/billing");
  return `/login?${params.toString()}`;
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

export default function UpgradeToProButton({ orgId, plan = "pro", className = "", label }: Props) {
  const { t, i18n } = useTranslation();
  const auth = useAuth() as any;
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

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
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (error) {
        throw error;
      }

      const response = data as DodoCheckoutResponse | null;
      const checkoutUrl = cleanId(response?.checkout_url || response?.checkoutUrl);

      if (!response?.ok || !checkoutUrl) {
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

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || !configured}
        className={className || defaultClassName}
      >
        {loading
          ? t("dashboard.openingCheckout", { defaultValue: "Opening checkout..." })
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
    </div>
  );
}
