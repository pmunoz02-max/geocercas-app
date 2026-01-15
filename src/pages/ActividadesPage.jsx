// src/pages/ActividadesPage.jsx
// Gestión de catálogo de actividades (con costos) por organización

import { useEffect, useState } from "react";
import {
  listActividades,
  createActividad,
  updateActividad,
  toggleActividadActiva,
  deleteActividad,
} from "../lib/actividadesApi";

import { useAuth } from "../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";

// Lista de monedas
const CURRENCIES = [
  { code: "USD", labelKey: "actividades.currencies.USD" },
  { code: "EUR", labelKey: "actividades.currencies.EUR" },
  { code: "MXN", labelKey: "actividades.currencies.MXN" },
  { code: "COP", labelKey: "actividades.currencies.COP" },
  { code: "PEN", labelKey: "actividades.currencies.PEN" },
  { code: "CLP", labelKey: "actividades.currencies.CLP" },
  { code: "ARS", labelKey: "actividades.currencies.ARS" },
  { code: "BRL", labelKey: "actividades.currencies.BRL" },
  { code: "CAD", labelKey: "actividades.currencies.CAD" },
  { code: "GBP", labelKey: "actividades.currencies.GBP" },
];

export default function ActividadesPage() {
  const { ready, currentOrg, role, currentRole } = useAuth();
  const { t } = useTranslation();

  const effectiveRole = (currentRole || role || "").toLowerCase();
  const canEdit = effectiveRole === "owner" || effectiveRole === "admin";

  const [actividades, setActividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [formMode, setFormMode] = useState("create");
  const [editingId, setEditingId] = useState(null);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [hourlyRate, setHourlyRate] = useState("");

  async function loadActividades() {
    if (!currentOrg?.id) {
      setActividades([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const data = await listActividades({ includeInactive: true });
      setActividades(data || []);
    } catch (err) {
      console.error("[ActividadesPage] load error:", err);
      setErrorMsg(err.message || t("actividades.errorLoad"));
    }

    setLoading(false);
  }

  useEffect(() => {
    if (ready) {
      loadActividades();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, currentOrg?.id]);

  function resetForm() {
    setFormMode("create");
    setEditingId(null);
    setNombre("");
    setDescripcion("");
    setCurrency("USD");
    setHourlyRate("");
    setErrorMsg("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!nombre.trim()) {
      setErrorMsg(t("actividades.errorMissingName"));
      return;
    }

    if (!hourlyRate || Number(hourlyRate) <= 0) {
      setErrorMsg(t("actividades.errorMissingRate"));
      return;
    }

    try {
      if (formMode === "create") {
        await createActividad({
          name: nombre.trim(),
          description: descripcion.trim() || null,
          active: true,
          currency_code: currency,
          hourly_rate: Number(hourlyRate),
        });
      } else if (editingId) {
        await updateActividad(editingId, {
          name: nombre.trim(),
          description: descripcion.trim() || null,
          currency_code: currency,
          hourly_rate: Number(hourlyRate),
        });
      }

      resetForm();
      await loadActividades();
    } catch (err) {
      console.error("[ActividadesPage] save error:", err);
      setErrorMsg(err.message || t("actividades.errorSave"));
    }
  }

  if (!ready) {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <div className="border rounded px-4 py-3 text-sm text-gray-600">
          {t("actividades.loadingAuth", "Cargando tu sesión y organización actual…")}
        </div>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <div className="border rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("actividades.noOrgAssigned")}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">
        {t("actividades.title")}
      </h1>

      {errorMsg && (
        <div className="mb-4 border rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="border rounded px-4 py-3 text-sm text-gray-600">
          {t("actividades.loadingList", "Cargando actividades…")}
        </div>
      ) : (
        <pre className="text-xs bg-gray-50 p-3 rounded">
          {JSON.stringify(actividades, null, 2)}
        </pre>
      )}
    </div>
  );
}
