import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
// Detectar entorno preview para mostrar nota (solo preview.* o *.vercel.app)
const hostname = typeof window !== "undefined" ? window.location.hostname : "";
const isPreviewEnv = hostname.includes("preview.") || hostname.includes("vercel.app");
import { supabase } from "@/lib/supabaseClient";
import { getPaddleEnv } from "@/config/paddleEnv";

type Props = {
  orgId?: string;
  plan?: "pro" | "enterprise";
  className?: string;
  label?: string;
};


export default function UpgradeToProButton({ orgId, plan = "pro", className = "", label }: Props) {
  const { t } = useTranslation();
  const checkoutPlan = plan || "pro";
  const { activeOrgId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    console.clear();


    try {
      setLoading(true);
      setErrorMsg(null);

      console.log("[UpgradeToProButton] before invoke");

      // Log Paddle env for diagnostics
      const paddleEnv = getPaddleEnv();
      console.log("[UpgradeToProButton] paddleEnv:", paddleEnv);

      const normalizedOrgId = activeOrgId ?? null;

      console.log("[UpgradeToProButton] click", {
        normalizedOrgId,
        activeOrgId,
        plan: checkoutPlan,
      });

      if (!normalizedOrgId) {
        throw new Error("No active organization id");
      }

      const payload = {
        org_id: normalizedOrgId,
        orgId: normalizedOrgId,
        plan: checkoutPlan,
      };

      const { data, error } = await supabase.functions.invoke(
        "paddle-create-checkout",
        {
          body: payload,
        }
      );

      console.log("[UpgradeToProButton] after invoke", { data, error });

      if (error) {
        console.error("[UpgradeToProButton] function error", error);

        setErrorMsg("No se pudo iniciar el checkout. Intenta nuevamente en unos minutos o contacta soporte.");

        const response = (error as any)?.context;
        if (response instanceof Response) {
          const raw = await response.clone().text();
          console.error("[UpgradeToProButton] function response status", response.status);
          console.error("[UpgradeToProButton] function response raw", raw);
        }

        return;
      }

      const checkoutUrl = data?.checkout_url;
      if (!checkoutUrl) {
        console.error("[UpgradeToProButton] missing checkout_url", data);
        setErrorMsg("No se pudo iniciar el checkout. Intenta nuevamente en unos minutos o contacta soporte.");
        return;
      }

      console.log("[UpgradeToProButton] redirecting to", checkoutUrl);
      console.log("[UpgradeToProButton] redirecting to", checkoutUrl);
      window.location.assign(checkoutUrl);
    } catch (e) {
      console.error(e);
      alert("No se pudo iniciar el checkout. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  const buttonLabel =
    label ||
    (checkoutPlan === "enterprise"
      ? t("dashboard.subscribeEnterprise", { defaultValue: "Subscribe to Enterprise" })
      : t("dashboard.subscribePro", { defaultValue: "Subscribe to PRO" }));

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={className}
      >
        {loading ? t("dashboard.openingCheckout", { defaultValue: "Opening checkout..." }) : buttonLabel}
      </button>
      {errorMsg && (
        <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {errorMsg}
        </div>
      )}
      {isPreviewEnv && (
        <p className="mt-2 text-xs text-slate-500">
        </p>
      )}
    </div>
  );
}
