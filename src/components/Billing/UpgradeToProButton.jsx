// src/components/Billing/UpgradeToProButton.jsx
import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient.js";

/**
 * Botón universal para abrir Stripe Checkout (PREVIEW / TEST).
 * Requiere orgId (UUID) y getAccessToken().
 *
 * Ventajas:
 * - No depende de projectRef hardcodeado
 * - Usa supabase.functions.invoke igual que el portal
 * - Envía success_url y cancel_url explícitas
 * - Muestra detail real devuelto por la Edge Function
 */
export default function UpgradeToProButton({
  orgId,
  plan = "PRO",
  getAccessToken,
  className = "",
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  function isUuid(v) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(v || "").trim()
    );
  }

  function getOriginSafe() {
    try {
      if (typeof window !== "undefined" && window.location?.origin) {
        return window.location.origin;
      }
    } catch (_) {
      // no-op
    }
    return "";
  }

  function buildUrls() {
    const origin = getOriginSafe();
    return {
      success_url: origin ? `${origin}/billing/success` : "",
      cancel_url: origin ? `${origin}/billing/cancel` : "",
    };
  }

  function stringifyDetail(detail) {
    if (!detail) return "";
    if (typeof detail === "string") return detail;

    try {
      return JSON.stringify(detail, null, 2);
    } catch (_) {
      return String(detail);
    }
  }

  const disabled =
    loading || !orgId || !isUuid(orgId) || typeof getAccessToken !== "function";

  async function startCheckout() {
    setMsg("");

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

      const { success_url, cancel_url } = buildUrls();

      if (!success_url || !cancel_url) {
        setMsg("No se pudo resolver la URL base del entorno preview.");
        return;
      }

      const { data, error } = await supabase.functions.invoke(
        "stripe-create-checkout",
        {
          body: {
            plan: String(plan || "PRO").trim().toUpperCase(),
            org_id: String(orgId || "").trim(),
            success_url,
            cancel_url,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (error) {
        throw new Error(error.message || "No se pudo crear la sesión de Checkout.");
      }

      if (!data?.url) {
        const detailText =
          stringifyDetail(data?.detail) ||
          stringifyDetail(data) ||
          "Stripe no devolvió URL de Checkout.";

        setMsg(detailText);
        return;
      }

      window.location.href = data.url;
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
          <b>Org ID:</b> <span className="font-mono break-all">{orgId || "(no resuelta)"}</span>
        </div>

        <div className="text-xs text-slate-500 break-all">
          Return URL base:{" "}
          <code className="font-mono">
            {typeof window !== "undefined" ? window.location.origin : "(sin window)"}
          </code>
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

        {msg ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 whitespace-pre-wrap break-words">
            {msg}
          </div>
        ) : null}
      </div>
    </div>
  );
}