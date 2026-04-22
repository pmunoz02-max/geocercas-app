// Friendly error handler for Paddle subscription_locked_pending_changes
function getFriendlyError(err, t) {
  if (!err) return null;
  const text = typeof err === 'string' ? err : JSON.stringify(err);
  if (text.includes('subscription_locked_pending_changes')) {
    return t('billing.errors.pendingChange');
  }
  return t('billing.errors.generic');
}
// src/pages/BillingCancel.jsx
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

function withLang(pathname, search, i18nLanguage) {
  const params = new URLSearchParams(search || "");
  const lang = params.get("lang") || i18nLanguage || "es";
  return `${pathname}?lang=${encodeURIComponent(lang)}`;
}

export default function BillingCancel() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  // Simulación: podrías obtener el error real de la navegación, querystring, o estado
  // const error = ...
  const error = null; // Reemplaza esto por la fuente real del error si aplica

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("billing.cancel.title")}
        </h1>

        <p className="text-slate-700">
          {t("billing.cancel.subtitle")}
        </p>

        {/* Mostrar error amigable si existe */}
        {error && <div className="text-red-600 text-sm mt-2">{getFriendlyError(error, t)}</div>}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(withLang("/billing", location.search, i18n.language))}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold px-5 py-3 transition"
          >
            {t("billing.cancel.backToBilling")}
          </button>

          <button
            type="button"
            onClick={() => navigate(withLang("/inicio", location.search, i18n.language))}
            className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-medium px-5 py-3 transition"
          >
            {t("billing.cancel.goHome")}
          </button>
        </div>
      </div>
    </div>
  );
}