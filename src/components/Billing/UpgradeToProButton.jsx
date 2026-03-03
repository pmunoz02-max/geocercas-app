// src/components/Billing/UpgradeToProButton.jsx
import React, { useMemo, useState } from "react";

/**
 * Botón universal para abrir Stripe Checkout (PREVIEW/TEST).
 * Requiere orgId (UUID). Usa getAccessToken() para obtener JWT.
 */
export default function UpgradeToProButton({
  orgId,
  plan = "PRO",
  projectRef = "mujwsfhkocsuuahlrssn",
  getAccessToken, // async () => string | null
  className = "",
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const endpoint = useMemo(
    () => `https://${projectRef}.functions.supabase.co/stripe-create-checkout`,
    [projectRef]
  );

  const isUuid = (v) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(v || "").trim()
    );

  const disabled = loading || !orgId || !isUuid(orgId) || typeof getAccessToken !== "function";

  async function startCheckout() {
    setMsg(null);

    try {
      if (!orgId || !isUuid(orgId)) {
        setMsg("Org ID inválido. Revisa que exista una organización activa.");
        return;
      }
      if (typeof getAccessToken !== "function") {
        setMsg("No se pudo obtener sesión. Re-login e intenta de nuevo.");
        return;
      }

      setLoading(true);

      const token = await getAccessToken();
      if (!token) {
        setMsg("Sesión no disponible. Cierra sesión e inicia sesión nuevamente.");
        return;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan, org_id: orgId }),
      });

      const out = await res.json().catch(async () => ({ raw: await res.text() }));

      if (!res.ok) {
        const m = out?.message || out?.error || JSON.stringify(out);
        setMsg(`Error ${res.status}: ${m}`);
        return;
      }

      if (out?.url) {
        window.location.href = out.url;
        return;
      }

      setMsg("Respuesta inesperada (no vino url). Revisa logs de stripe-create-checkout.");
    } catch (e) {
      setMsg(`Error: ${String(e?.message ?? e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm p-6 ${className}`}>
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-900">Geocercas PRO</div>
          <div className="text-sm text-slate-600">
            USD $29/mes · 14 días trial · Stripe TEST (Preview)
          </div>
        </div>

        <div className="text-sm text-slate-700">
          <b>Org ID:</b> <span className="font-mono">{orgId || "(no resuelta)"}</span>
        </div>

        <button
          type="button"
          onClick={startCheckout}
          disabled={disabled}
          className="
            rounded-xl
            bg-slate-900 hover:bg-slate-800
            text-white font-semibold
            px-5 py-3
            transition
            disabled:opacity-60 disabled:cursor-not-allowed
          "
        >
          {loading ? "Abriendo Stripe..." : "Suscribirme a PRO"}
        </button>

        <div className="text-xs text-slate-500">
          Endpoint: <code className="font-mono">{endpoint}</code>
        </div>

        {msg && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}