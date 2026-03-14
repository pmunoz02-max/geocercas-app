// src/pages/Landing.jsx
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import HeroGeocercasDemo from "@/components/marketing/HeroGeocercasDemo.jsx";
import LanguageSwitcher from "../components/LanguageSwitcher";

const BUILD_MARKER = "PREVIEW_20260218_A"; // <- cambia el marker para validar deploy

export default function Landing() {
  const { t } = useTranslation();
  const location = useLocation();

  // Conserva querystring (incluye ?lang=fr) cuando navegas a /login y /help
  const withSameSearch = (to) => `${to}${location.search || ""}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative">
      {/* ✅ marcador VISIBLE */}
      <div className="fixed bottom-3 right-4 text-[11px] text-slate-400 select-none">
        {BUILD_MARKER}
      </div>

      <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-6 sm:px-6 lg:px-8">
        <HeroGeocercasDemo />

        <section className="flex justify-center pb-10">
          <div className="max-w-xl w-full px-0 sm:px-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-8 shadow-2xl">
              <div className="flex items-center justify-between gap-4">
                {/* Antes decía "Geocercas" hardcodeado */}
                <h1 className="text-3xl font-semibold">
                  {t("landing.brandName")}
                </h1>

                <LanguageSwitcher />
              </div>

              {/* Antes decía "Bienvenido..." hardcodeado */}
              <p className="mt-4 text-sm text-slate-300">
                {t("landing.accessBody")}
              </p>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link
                  to={withSameSearch("/login")}
                  className="inline-flex items-center justify-center rounded-2xl px-5 py-3 font-semibold"
                  // ✅ inline style para ganar a cualquier CSS global raro
                  style={{
                    backgroundColor: "#ffffff",
                    color: "#0f172a",
                    opacity: 1,
                    pointerEvents: "auto",
                    filter: "none",
                  }}
                >
                  {t("app.header.login")}
                </Link>

                <Link
                  to={withSameSearch("/help/instructions")}
                  className="inline-flex items-center justify-center rounded-2xl px-5 py-3"
                  style={{
                    backgroundColor: "transparent",
                    color: "#e5e7eb",
                    border: "1px solid #334155",
                    opacity: 1,
                    pointerEvents: "auto",
                    filter: "none",
                  }}
                >
                  {/* Usamos una key ya existente con traducción FR */}
                  {t("help.common.badge")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
