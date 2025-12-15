import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";

export default function GeocercasPage() {
  const { t } = useTranslation();
  const { currentOrg, user } = useAuth();

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mb-2">
          {t("geocercas.pageTitle")}
        </h1>

        <p className="text-sm md:text-base text-slate-600">
          {t("geocercas.pageSubtitle")}
        </p>

        <div className="mt-3 text-xs text-slate-500 space-y-1">
          <p>
            <span className="font-semibold">
              {t("geocercas.currentOrgLabel")}
            </span>{" "}
            {currentOrg?.name ||
              t("geocercas.noOrgFallback", "— (no organization selected)")}
          </p>

          <p>
            <span className="font-semibold">
              {t("geocercas.currentUserLabel")}
            </span>{" "}
            <span className="font-mono">{user?.email || "—"}</span>
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {/* Crear nueva geocerca */}
        <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-1">
              {t("geocercas.cardNewTitle")}
            </h2>
            <p className="text-sm text-slate-600">
              {t("geocercas.cardNewBody")}
            </p>
          </div>

          <div className="mt-4">
            <Link
              to="/nueva-geocerca"
              className="inline-flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              {t("geocercas.cardNewCta")}
            </Link>
          </div>
        </article>

        {/* Placeholder de listado */}
        <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-1">
              {t("geocercas.cardListTitle")}
            </h2>
            <p className="text-sm text-slate-600">
              {t("geocercas.cardListBody")}
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}
