import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BILLING_CHECKOUT_MODE,
  getCheckoutSafetyLabel,
  getCheckoutUrl,
  isCheckoutConfigured,
  type CheckoutPlanCode,
} from "@/config/billingCheckout";

type Props = {
  orgId?: string;
  plan?: CheckoutPlanCode;
  className?: string;
  label?: string;
};

export default function UpgradeToProButton({ orgId, plan = "pro", className = "", label }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checkoutPlan = plan || "pro";
  const checkoutUrl = useMemo(() => getCheckoutUrl(checkoutPlan), [checkoutPlan]);
  const configured = isCheckoutConfigured(checkoutPlan);

  const buttonLabel =
    label ||
    (checkoutPlan === "enterprise"
      ? t("dashboard.subscribeEnterprise", { defaultValue: "Subscribe to Enterprise" })
      : t("dashboard.subscribePro", { defaultValue: "Subscribe to PRO" }));

  const defaultClassName =
    "inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500";

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    setErrorMsg(null);

    if (!configured || !checkoutUrl) {
      setErrorMsg(
        t("billing.checkout.notConfigured", {
          defaultValue: "Secure checkout is not configured yet. Please contact support.",
        }),
      );
      return;
    }

    try {
      setLoading(true);
      // Fase Preview/Test: usar exactamente el Payment Link generado por el proveedor.
      // No agregamos org_id/plan como query params porque algunos checkout links
      // pueden rechazar parámetros adicionales y devolver /error/not-found.
      window.location.assign(checkoutUrl.trim());
    } catch (error) {
      console.error("[billing-checkout] redirect error", error);
      setErrorMsg(
        t("billing.checkout.openError", {
          defaultValue: "Could not open secure checkout. Please try again.",
        }),
      );
      setLoading(false);
    }
  };

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
          {getCheckoutSafetyLabel()}: {t("billing.checkout.testNotice", { defaultValue: "no real charge will be made." })}
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
