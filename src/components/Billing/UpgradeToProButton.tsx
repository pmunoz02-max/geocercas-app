import React from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  orgId: string;
  plan: "pro" | "enterprise";
};

export default function UpgradeToProButton({ orgId, plan }: Props) {
  console.log("[UpgradeToProButton] mounted from Billing component", {
    orgId,
    plan,
  });

  const handleUpgrade = async () => {
    console.clear();
    console.log("[UpgradeToProButton] click", { orgId, plan });

    try {
      console.log("[UpgradeToProButton] before invoke");

      const { data, error } = await supabase.functions.invoke(
        "paddle-create-checkout",
        { body: { orgId, plan } }
      );

      console.log("[UpgradeToProButton] after invoke", { data, error });

      if (error) {
        console.error("[UpgradeToProButton] error", error);
        return;
      }

      if (!data?.checkout_url) {
        console.error("[UpgradeToProButton] Missing checkout_url", data);
        return;
      }

      console.log("[UpgradeToProButton] redirect", data.checkout_url);
      window.location.assign(data.checkout_url);
        } catch (error: any) {
          console.error("[UpgradeToProButton] error raw", error);

          const response = error?.context;

          if (response instanceof Response) {
            const cloned = response.clone();
            const raw = await cloned.text();

            console.error("[UpgradeToProButton] function response status", response.status);
            console.error("[UpgradeToProButton] function response raw", raw);

            try {
              const parsed = JSON.parse(raw);
              console.error("[UpgradeToProButton] function response json", parsed);
            } catch {
              // raw no era json
            }
          }

          console.error("[UpgradeToProButton] error", error);
        }
  };

  return (
    <button
      type="button"
      onClick={handleUpgrade}
      className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700"
      style={{
        position: "relative",
        zIndex: 10,
        pointerEvents: "auto",
      }}
    >
      Suscribirme a PRO
    </button>
  );
}