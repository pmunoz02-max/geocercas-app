// src/components/Billing/ManageSubscriptionButton.jsx
import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient.js";

function isPortalAvailableInCurrentEnv() {
  if (import.meta.env.DEV) return true;

  const appEnv = String(import.meta.env.VITE_APP_ENV || "").toLowerCase();
  if (appEnv === "preview" || appEnv === "test") return true;

  try {
    const hostname = String(window.location?.hostname || "").toLowerCase();
    return hostname.startsWith("preview.") || hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export default function ManageSubscriptionButton({
  orgId,
  getAccessToken,
  returnUrl,
  disabled = false,
  unavailableMessage = "La administracion de suscripcion no esta disponible en produccion en esta version.",
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const portalAvailable = isPortalAvailableInCurrentEnv();

  async function handleClick() {
    if (loading || disabled || !portalAvailable) return;

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
        disabled={disabled || loading || !portalAvailable}
        className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          disabled || loading || !portalAvailable
            ? "bg-slate-300 text-slate-500 cursor-not-allowed"
            : "bg-slate-900 text-white hover:bg-slate-800"
        }`}
      >
        {loading ? "Abriendo portal..." : "Administrar suscripción"}
      </button>

      {!portalAvailable ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {unavailableMessage}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </div>
      ) : null}
    </div>
  );
}