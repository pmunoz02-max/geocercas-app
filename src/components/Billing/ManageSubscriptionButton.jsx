// src/components/Billing/ManageSubscriptionButton.jsx
import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient.js";

export default function ManageSubscriptionButton({
  orgId,
  getAccessToken,
  returnUrl,
  disabled = false,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    if (loading || disabled) return;

    try {
      setLoading(true);
      setError("");

      const accessToken = await getAccessToken?.();
      if (!accessToken) {
        throw new Error("No se pudo obtener la sesión del usuario.");
      }

      const { data, error: fnError } = await supabase.functions.invoke(
        "stripe-create-portal-session",
        {
          body: {
            org_id: orgId,
            return_url: returnUrl || `${window.location.origin}/billing`,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (fnError) {
        throw new Error(fnError.message || "No se pudo abrir el portal de Stripe.");
      }

      if (!data?.url) {
        throw new Error("Stripe no devolvió la URL del portal.");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err?.message || "No se pudo abrir el portal de suscripción.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          disabled || loading
            ? "bg-slate-300 text-slate-500 cursor-not-allowed"
            : "bg-slate-900 text-white hover:bg-slate-800"
        }`}
      >
        {loading ? "Abriendo portal..." : "Administrar suscripción"}
      </button>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </div>
      ) : null}
    </div>
  );
}