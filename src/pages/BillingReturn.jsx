// src/pages/BillingReturn.jsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

function normalizeLang(search, i18nLanguage) {
  const params = new URLSearchParams(search || "");
  const raw = String(params.get("lang") || i18nLanguage || "es").toLowerCase();
  return ["es", "en", "fr"].includes(raw) ? raw : "es";
}

function withLang(pathname, lang) {
  return `${pathname}?lang=${encodeURIComponent(lang)}`;
}

const COPY = {
  es: {
    eyebrow: "Checkout externo",
    title: "Regreso desde el checkout",
    body: "Has vuelto desde la página externa de checkout.",
    notice:
      "Esta ruta no confirma un pago ni modifica tu plan. En esta fase TEST, el estado real de la suscripción sigue dependiendo de la base de datos interna de GeoField GPS.",
    primary: "Volver a Precios",
    secondary: "Ir al inicio",
  },
  en: {
    eyebrow: "External checkout",
    title: "Return from checkout",
    body: "You have returned from the external checkout page.",
    notice:
      "This route does not confirm a payment or change your plan. During this TEST phase, the subscription status still depends on GeoField GPS's internal database.",
    primary: "Back to Pricing",
    secondary: "Go to home",
  },
  fr: {
    eyebrow: "Paiement externe",
    title: "Retour depuis le paiement",
    body: "Vous êtes revenu depuis la page de paiement externe.",
    notice:
      "Cette route ne confirme aucun paiement et ne modifie pas votre forfait. Pendant cette phase TEST, l'état réel de l'abonnement dépend toujours de la base de données interne de GeoField GPS.",
    primary: "Retour aux tarifs",
    secondary: "Aller à l'accueil",
  },
};

export default function BillingReturn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n } = useTranslation();
  const lang = normalizeLang(location.search, i18n.language);
  const copy = COPY[lang];

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <section className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-emerald-100 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            {copy.eyebrow}
          </p>

          <h1 className="mt-3 text-3xl font-bold tracking-tight text-emerald-950 sm:text-4xl">
            {copy.title}
          </h1>

          <p className="mt-5 text-base leading-7 text-slate-700">{copy.body}</p>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            {copy.notice}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => navigate(withLang("/pricing", lang))}
              className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800"
            >
              {copy.primary}
            </button>

            <button
              type="button"
              onClick={() => navigate(withLang("/", lang))}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-900 transition hover:bg-slate-50"
            >
              {copy.secondary}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
