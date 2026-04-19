import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  orgId?: string | null;
  plan?: "pro" | "enterprise";
  projectRef?: string;
  onStarted?: () => void;
  getAccessToken?: () => Promise<string | null>;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v.trim()
  );
}

export default function UpgradeToProButton({
  orgId,
  plan = "pro",
  onStarted,
}: Props) {
  const { t } = useTranslation();
  const [orgInput, setOrgInput] = useState<string>(
    () => localStorage.getItem("gc_active_org_id") || ""
  );
  const [isLoading, setIsLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const resolvedOrgId = useMemo(
    () => (orgId && orgId.trim() ? orgId.trim() : orgInput.trim()),
    [orgId, orgInput]
  );

  console.log("UpgradeToProButton render", { orgId, resolvedOrgId });

  const disabled = !resolvedOrgId || !isUuid(resolvedOrgId) || isLoading;

  const handleUpgrade = async () => {
    if (isLoading) return;

    try {
      setIsLoading(true);
      setMsg(null);

      const { data, error } = await supabase.functions.invoke("paddle-create-checkout", {
        body: {
          plan_code: "pro",
        },
      });

      if (error) {
        console.error("[upgrade-pro] invoke error", error);
        throw error;
      }

      if (!data?.ok) {
        console.error("[upgrade-pro] backend error", data);
        throw new Error(JSON.stringify(data));
      }

      const checkoutUrl = data.checkout_url || data.checkoutUrl;

      if (!checkoutUrl) {
        throw new Error("Missing checkout URL");
      }

      if (typeof onStarted === "function") {
        onStarted();
      }

      window.location.href = checkoutUrl;
    } catch (err: any) {
      console.error("[upgrade-pro] final error", err);
      setMsg(err.message || "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-lg font-bold text-slate-900">
            {t("billing.upgrade.productTitle")}
          </div>
          <div className="text-sm text-slate-700">
            {t("billing.upgrade.priceLabel")}
          </div>
        </div>

        <div className="text-sm text-slate-800">
          <b>{t("billing.upgrade.orgIdLabel")}:</b>{" "}
          <span className="font-mono break-all text-slate-900">
            {resolvedOrgId || t("billing.upgrade.notResolved")}
          </span>
        </div>

        {!orgId && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-900">
              {t("billing.upgrade.organizationInputLabel")}
            </label>
            <input
              value={orgInput}
              onChange={(e) => setOrgInput(e.target.value)}
              placeholder={t("billing.upgrade.organizationInputPlaceholder")}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none"
            />
            <div className="text-xs text-slate-600">
              {t("billing.upgrade.organizationInputHelp")}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleUpgrade}
          disabled={disabled}
          className="rounded-xl bg-slate-900 px-5 py-3 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading
            ? t("billing.upgrade.processing")
            : t("billing.upgrade.subscribe", {
                defaultValue:
                  plan === "enterprise"
                    ? "Subscribe to ENTERPRISE"
                    : "Subscribe to PRO",
              })}
        </button>

        {msg && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">{t("billing.upgrade.noticeTitle")}</div>
            <div className="mt-1 whitespace-pre-wrap break-words">{msg}</div>
          </div>
        )}
      </div>
    </div>
  );
}