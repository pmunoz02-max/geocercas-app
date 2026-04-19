import { supabase } from "@/lib/supabaseClient";

type Props = {
  orgId?: string | null;
  plan?: "pro" | "enterprise";
};

export default function UpgradeToProButton({ orgId, plan = "pro" }: Props) {
  const handleUpgrade = async () => {
    console.log("[UpgradeToProButton] click", { orgId, plan });

    try {
      console.log("[UpgradeToProButton] starting checkout");

      const { data, error } = await supabase.functions.invoke(
        "paddle-create-checkout",
        {
          body: { orgId, plan },
        }
      );

      console.log("[UpgradeToProButton] response", data);
      console.log("[UpgradeToProButton] error", error);

      if (error) {
        console.error("Edge function error", error);
        return;
      }

      if (!data?.checkout_url) {
        console.error("Missing checkout_url", data);
        return;
      }

      window.location.assign(data.checkout_url);
    } catch (err) {
      console.error("Checkout error", err);
    }
  };

  console.log("[UpgradeToProButton] mounted from Billing component", { orgId, plan });

  return (
    <button
      type="button"
      onClick={handleUpgrade}
      className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700"
      style={{ position: "relative", zIndex: 999999, pointerEvents: "auto" }}
    >
      Suscribirme a PRO [BILLING-COMPONENT]
    </button>
  );
}