// src/pages/AsignacionesPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import {
  getAsignacionesBundle,
  createAsignacion,
  updateAsignacion,
  deleteAsignacion,
} from "../lib/asignacionesApi";
import AsignacionesTable from "../components/asignaciones/AsignacionesTable";

function toMap(arr) {
  const m = new Map();
  (arr || []).forEach((x) => x?.id && m.set(x.id, x));
  return m;
}

export default function AsignacionesPage() {
  const { t } = useTranslation();
  const { ready, currentOrg } = useAuth();

  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const res = await getAsignacionesBundle();
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    setBundle(res.data || {});
    setLoading(false);
  }

  useEffect(() => {
    if (ready && currentOrg?.id) load();
  }, [ready, currentOrg?.id]);

  // =========================
  // ENRIQUECIMIENTO CANONICO
  // =========================
  const enrichedAsignaciones = useMemo(() => {
    if (!bundle) return [];

    const asignaciones = bundle.asignaciones || [];
    const catalogs = bundle.catalogs || {};

    const geocercasMap = toMap(catalogs.geocercas);
    const activitiesMap = toMap(catalogs.activities);
    const personalMap = toMap(catalogs.personal);

    return asignaciones.map((a) => ({
      ...a,

      // joins virtuales
      geocerca: geocercasMap.get(a.geocerca_id) || null,
      activity: activitiesMap.get(a.activity_id) || null,
      personal: personalMap.get(a.personal_id) || null,

      // alias compatibles con tabla
      geocerca_nombre:
        geocercasMap.get(a.geocerca_id)?.nombre ||
        geocercasMap.get(a.geocerca_id)?.name ||
        null,

      activity_name:
        activitiesMap.get(a.activity_id)?.name ||
        activitiesMap.get(a.activity_id)?.nombre ||
        null,
    }));
  }, [bundle]);

  if (!ready) return null;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">
        {t("asignaciones.title", { defaultValue: "Asignaciones" })}
      </h1>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-2 rounded">
          {error}
        </div>
      )}

      <AsignacionesTable
        asignaciones={enrichedAsignaciones}
        loading={loading}
        onEdit={(row) => {
          /* mantiene tu lógica actual */
        }}
        onDelete={async (id) => {
          const ok = window.confirm(
            t("asignaciones.messages.confirmDelete", {
              defaultValue: "Delete assignment?",
            })
          );
          if (!ok) return;
          await deleteAsignacion(id);
          load();
        }}
      />
    </div>
  );
}
