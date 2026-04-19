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

  const loading = isLoading;

  const handleUpgrade = async () => {
    console.log("CLICK DETECTED");

    const setLoading = setIsLoading;
    const setError = setMsg;

    try {
      setLoading(true);
      setError(null);

      console.log("[upgrade-pro] click", {
        orgId,
        resolvedOrgId,
      });

      const { data, error } = await supabase.functions.invoke(
        "paddle-create-checkout",
        {
          body: {
            org_id: resolvedOrgId || orgId,
            plan_code: "pro",
            return_url: `${window.location.origin}/billing`,
          },
        }
      );

      console.log("[upgrade-pro] invoke result", { data, error });

      if (error) {
        console.error("[upgrade-pro] invoke error", error);

        let details = error.message || "Unknown error";
        try {
          const raw = await error.context?.text?.();
          console.error("[upgrade-pro] raw error body", raw);
          if (raw) details = raw;
        } catch {
          // noop
        }

        throw new Error(details);
      }

      if (!data?.ok) {
        console.error("[upgrade-pro] backend returned not ok", data);
        throw new Error(JSON.stringify(data));
      }

      const checkoutUrl =
        data?.checkout_url ||
        data?.checkoutUrl ||
        data?.url ||
        null;

      console.log("[upgrade-pro] checkoutUrl", checkoutUrl);

      if (!checkoutUrl) {
        throw new Error(`Missing checkout URL: ${JSON.stringify(data)}`);
      }

      console.log("[upgrade-pro] redirecting", checkoutUrl);
      window.location.assign(checkoutUrl);
    } catch (err: any) {
      console.error("[upgrade-pro] final error", err);
      setError(err?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  console.log("HANDLE UPGRADE READY");

  return (
    <button
      onClick={handleUpgrade}
      disabled={loading}
      style={{
        width: "100%",
        padding: "12px",
        borderRadius: "8px",
        backgroundColor: "#0b1b34",
        color: "white",
        fontWeight: "bold",
        cursor: "pointer"
      }}
    >
      {loading ? "Procesando..." : "Suscribirme a PRO"}
    </button>
  );
}