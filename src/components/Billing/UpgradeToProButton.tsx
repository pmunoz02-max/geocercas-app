import React, { useState } from "react";
// Detectar entorno preview para mostrar nota
const hostname = typeof window !== "undefined" ? window.location.hostname : "";
const isPreviewEnv = hostname.includes("preview") || hostname.includes("vercel.app");
import { supabase } from "@/lib/supabaseClient";
import { getPaddleEnv } from "@/config/paddleEnv";

type Props = {
  orgId: string;
  plan: "pro" | "enterprise";
  className?: string;
};

export default function UpgradeToProButton({ orgId, plan, className = "" }: Props) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    console.clear();
    console.log("[UpgradeToProButton] click", { orgId, plan });

    try {
      setLoading(true);
      setErrorMsg(null);

      console.log("[UpgradeToProButton] before invoke");

      // Log Paddle env for diagnostics
      const paddleEnv = getPaddleEnv();
      console.log("[UpgradeToProButton] paddleEnv:", paddleEnv);

      const { data, error } = await supabase.functions.invoke(
        "paddle-create-checkout",
        {
          body: { orgId, plan },
        }
      );

      console.log("[UpgradeToProButton] after invoke", { data, error });

      if (error) {
        console.error("[UpgradeToProButton] function error", error);

        setErrorMsg("No se pudo iniciar el checkout. Intenta nuevamente en unos minutos o contacta soporte.");

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
        setErrorMsg("No se pudo iniciar el checkout. Intenta nuevamente en unos minutos o contacta soporte.");
        return;
      }

      console.log("[UpgradeToProButton] redirecting to", checkoutUrl);
      console.log("[UpgradeToProButton] redirecting to", checkoutUrl);
      window.location.assign(checkoutUrl);
    } catch (e) {
      console.error(e);
      alert("No se pudo iniciar el checkout. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={className}
      >
        {loading ? "Abriendo checkout..." : "Suscribirme a PRO"}
      </button>
      {errorMsg && (
        <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {errorMsg}
        </div>
      )}
      {isPreviewEnv && (
        <p className="mt-2 text-xs text-gray-500">
          Nota: PREVIEW/TEST. No afecta producción.
        </p>
      )}
    </div>
  );
}
