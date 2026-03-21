// src/components/Billing/ManageSubscriptionButton.jsx
import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient.js";



export default function ManageSubscriptionButton({
  orgId,
  getAccessToken,
  returnUrl,
  disabled = false,
  unavailableMessage = "La administracion de suscripcion no esta disponible en produccion en esta version.",
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [portalUrl, setPortalUrl] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);

  async function handleClick() {
    if (portalLoading || disabled) return;
    try {
      setPortalLoading(true);
      setError("");
      const accessToken = await getAccessToken?.();
      if (!accessToken) {
        throw new Error("No se pudo obtener la sesión del usuario.");
      }
      throw new Error("Portal deshabilitado temporalmente (migrando a Paddle)");
    } catch (err) {
      setError(err?.message || "No se pudo abrir el portal de suscripción.");
    } finally {
      setPortalLoading(false);
    }
  }

  const canManageSubscription = !portalLoading && !disabled;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={!canManageSubscription}
        className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          !canManageSubscription
            ? "bg-slate-300 text-slate-500 cursor-not-allowed"
            : "bg-slate-900 text-white hover:bg-slate-800"
        }`}
      >
        {portalLoading ? "Abriendo portal..." : "Administrar suscripción"}
      </button>

      {error && !portalLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </div>
      )}
    </div>
  );
}