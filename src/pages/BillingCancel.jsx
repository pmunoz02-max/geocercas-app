// src/pages/BillingCancel.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function BillingCancel() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">{t('billing.cancel.title')}</h1>
        <p className="text-slate-700">{t('billing.cancel.subtitle')}</p>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/billing")}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold px-5 py-3 transition"
          >
            {t('billing.cancel.backToBilling')}
          </button>
          <button
            type="button"
            onClick={() => navigate("/inicio")}
            className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-medium px-5 py-3 transition"
          >
            {t('billing.cancel.goHome')}
          </button>
        </div>
      </div>
    </div>
  );
}