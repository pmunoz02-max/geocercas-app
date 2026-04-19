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

  console.log("[UpgradeToProButton] render", { orgId, plan });

  const handleUpgrade = async () => {
    console.log("[UpgradeToProButton] click", { orgId, plan });

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

      console.log("[UpgradeToProButton] starting checkout");
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

      console.log("[UpgradeToProButton] response", data);
      console.log("[UpgradeToProButton] checkout_url", data?.checkout_url);

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

      if (!data?.checkout_url) {
        console.error("Missing checkout_url", data);
        return;
      }

      if (onStarted) onStarted();

      console.log("[upgrade-plan] redirecting", data.checkout_url);
      window.location.assign(data.checkout_url);
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

  const loading = isLoading;
  const disabled = false;

  console.log("[UpgradeToProButton] state", { orgId, plan, loading, disabled });

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => {
          console.log("[UpgradeToProButton] click");
          handleUpgrade();
        }}
        className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition bg-slate-900 text-white hover:bg-slate-800"
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