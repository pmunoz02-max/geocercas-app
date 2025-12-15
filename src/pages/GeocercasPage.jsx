import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export default function GeocercasPage() {
  const { t } = useTranslation();

  // Ajusta estas rutas si en tu app son distintas
  const newGeofenceHref = "/geocerca";
  const backHref = "/inicio";

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-4xl font-bold">{t("geocercas.pageTitle")}</h1>
        <p className="text-gray-600 mt-2">{t("geocercas.pageSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-2">{t("geocercas.cardNewTitle")}</h2>
          <p className="text-gray-600 mb-4">{t("geocercas.cardNewBody")}</p>
          <Link to={newGeofenceHref} className="text-green-700 font-semibold hover:underline">
            {t("geocercas.cardNewCta")}
          </Link>
        </div>

        <div className="bg-white border rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-2">{t("geocercas.cardListTitle")}</h2>
          <p className="text-gray-600">{t("geocercas.cardListBody")}</p>
        </div>
      </div>

      <div className="mt-6">
        <Link to={backHref} className="text-gray-700 hover:underline">
          {t("common.actions.back")}
        </Link>
      </div>
    </div>
  );
}
