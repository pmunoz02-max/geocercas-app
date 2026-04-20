import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  orgId: string;
  plan: "pro" | "enterprise";
  className?: string;
};

export default function UpgradeToProButton({ orgId, plan, className = "" }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    console.clear();
    console.log("[UpgradeToProButton] click", { orgId, plan });

    try {
      setLoading(true);

      console.log("[UpgradeToProButton] before invoke");

      const { data, error } = await supabase.functions.invoke(
        "paddle-create-checkout",
        {
          body: { orgId, plan },
        }
      );

      console.log("[UpgradeToProButton] after invoke", { data, error });

      if (error) {
        console.error("[UpgradeToProButton] function error", error);

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
        return;
      }

      console.log("[UpgradeToProButton] redirecting to", checkoutUrl);
      console.log("[UpgradeToProButton] redirecting to", checkoutUrl);
      window.location.assign(checkoutUrl);
    } catch (err) {
      console.error("[UpgradeToProButton] unexpected error", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={className}
    >
      {loading ? "Abriendo checkout..." : "Suscribirme a PRO"}
    </button>
  );
}
