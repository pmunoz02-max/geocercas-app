import { supabase } from "@/lib/supabaseClient";

type Props = {
  orgId?: string | null;
  plan?: "pro" | "enterprise";
};

export default function UpgradeToProButton({ orgId, plan = "pro" }: Props) {
  const handleUpgrade = async () => {
    console.log("[UpgradeToProButton] click", { orgId, plan });
    alert("UPGRADE CLICK");

    try {
      const { data, error } = await supabase.functions.invoke("paddle-create-checkout", {
        body: { orgId, plan },
      });

      console.log("[UpgradeToProButton] response", data);
      console.log("[UpgradeToProButton] error", error);

      if (error) return;
      if (!data?.checkout_url) return;

      window.location.assign(data.checkout_url);
    } catch (err) {
      console.error("[UpgradeToProButton] catch", err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleUpgrade}
      className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700"
      style={{ position: "relative", zIndex: 999999, pointerEvents: "auto" }}
    >
      Suscribirme a PRO
    </button>
  );
}