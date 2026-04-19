import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  orgId?: string | null;
  plan?: "pro" | "enterprise";
  onStarted?: () => void;
};

export default function UpgradeToProButton({
  orgId,
  plan = "pro",
  onStarted,
}: Props) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const resolvedOrgId = useMemo(
    () => (orgId && orgId.trim() ? orgId.trim() : ""),
    [orgId]
  );

  const handleUpgrade = async () => {
    console.log("CLICK UPGRADE BUTTON");

    if (isLoading) return;

    try {
      setIsLoading(true);
      setMsg(null);

      if (!resolvedOrgId) {
        throw new Error("Missing organization context.");
      }

      console.log("[upgrade-plan] click", {
        orgId,
        resolvedOrgId,
        plan,
      });

      console.log("Calling paddle-create-checkout...");
      const { data, error } = await supabase.functions.invoke(
        "paddle-create-checkout",
        {
          body: {
            org_id: resolvedOrgId,
            plan_code: plan,
            return_url: `${window.location.origin}/billing`,
          },
        }
      );

      console.log("[upgrade-plan] invoke result", { data, error });
      console.log("Response:", data);

      if (error) {
        console.error("[upgrade-plan] invoke error", error);

        let details = error.message || "Unknown error";
        try {
          const raw = await error.context?.text?.();
          console.error("[upgrade-plan] raw error body", raw);
          if (raw) details = raw;
        } catch {
          // noop
        }

        throw new Error(details);
      }

      if (!data?.ok) {
        console.error("[upgrade-plan] backend returned not ok", data);
        throw new Error(JSON.stringify(data));
      }

      const checkoutUrl =
        data?.checkout_url ||
        data?.checkoutUrl ||
        data?.url ||
        null;

      console.log("[upgrade-plan] checkoutUrl", checkoutUrl);

      if (!checkoutUrl) {
        throw new Error(`Missing checkout URL: ${JSON.stringify(data)}`);
      }

      if (onStarted) onStarted();

      console.log("[upgrade-plan] redirecting", checkoutUrl);
      window.location.assign(checkoutUrl);
    } catch (err: any) {
      console.error("[upgrade-plan] final error", err);
      setMsg(err?.message || "Could not start checkout.");
    } finally {
      setIsLoading(false);
    }
  };

  const label =
    plan === "enterprise"
      ? t("billing.subscribeEnterprise", { defaultValue: "Suscribirme a ENTERPRISE" })
      : t("billing.subscribePro", { defaultValue: "Suscribirme a PRO" });

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleUpgrade}
        disabled={isLoading || !resolvedOrgId}
        className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
          isLoading || !resolvedOrgId
            ? "bg-slate-300 text-slate-500 cursor-not-allowed"
            : "bg-slate-900 text-white hover:bg-slate-800"
        }`}
      >
        {isLoading
          ? t("billing.processing", { defaultValue: "Procesando..." })
          : label}
      </button>

      {msg && !isLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 whitespace-pre-wrap break-words">
          {msg}
        </div>
      )}
    </div>
  );
}