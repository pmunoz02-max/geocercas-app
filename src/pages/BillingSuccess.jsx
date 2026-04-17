// src/pages/BillingSuccess.jsx
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

function withLang(pathname, search, i18nLanguage) {
  const params = new URLSearchParams(search || "");
  const lang = params.get("lang") || i18nLanguage || "es";
  return `${pathname}?lang=${encodeURIComponent(lang)}`;
}

export default function BillingSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("billing.success.title", { defaultValue: "Payment started ✅" })}
        </h1>

        <p className="text-slate-700">
          {t("billing.success.subtitle", {
            defaultValue:
              "The checkout was confirmed. Your plan should update shortly after the webhook is processed.",
          })}
        </p>

        <div className="text-sm text-slate-600">
          {t("billing.success.note", {
            defaultValue:
              'If you still see "FREE", wait 10–30 seconds and refresh. Then verify the billing record again.',
          })}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(withLang("/billing", location.search, i18n.language))}
            className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800"
          >
            {t("billing.success.backToBilling", { defaultValue: "Back to Billing" })}
          </button>

          <button
            type="button"
            onClick={() => navigate(withLang("/inicio", location.search, i18n.language))}
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-900 transition hover:bg-slate-50"
          >
            {t("billing.success.goHome", { defaultValue: "Go home" })}
          </button>
        </div>
      </div>
    </div>
  );
}