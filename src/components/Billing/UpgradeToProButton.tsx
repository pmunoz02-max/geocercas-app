type Props = {
  orgId?: string | null;
  plan?: "pro" | "enterprise";
};

export default function UpgradeToProButton({ orgId, plan = "pro" }: Props) {
  const handleUpgrade = async () => {
    console.log("[UpgradeToProButton] click", { orgId, plan });
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