type Props = {
  orgId?: string | null;
  plan?: "pro" | "enterprise";
};

export default function UpgradeToProButton({ orgId, plan = "pro" }: Props) {
  const handleUpgrade = async () => {
    console.log("[UpgradeToProButton] click", { orgId, plan });

    try {
      console.log("[UpgradeToProButton] starting checkout");

      const res = await fetch("/api/paddle-create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orgId, plan }),
      });

      const data = await res.json();

      console.log("[UpgradeToProButton] response", data);
      console.log("[UpgradeToProButton] checkout_url", data?.checkout_url);

      if (!data?.checkout_url) {
        console.error("Missing checkout_url");
        return;
      }

      window.location.assign(data.checkout_url);
    } catch (err) {
      console.error("Checkout error", err);
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