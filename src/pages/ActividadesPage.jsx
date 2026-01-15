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
    if (ready && currentOrg) {
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

  function startEdit(a) {
    setFormMode("edit");
    setEditingId(a.id);
    setNombre(a.name);
    setDescripcion(a.description || "");
    setCurrency(a.currency_code || "USD");
    setHourlyRate(a.hourly_rate || "");
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
      <h1 className="text-2xl font-semibold mb-4">
        {t("actividades.title")}
      </h1>

      {errorMsg && (
        <div className="mb-4 border rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* FORM */}
      {canEdit && (
        <form onSubmit={handleSubmit} className="border rounded p-4 mb-6 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="border rounded px-3 py-2"
              placeholder={t("actividades.name")}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />

            <input
              className="border rounded px-3 py-2"
              placeholder={t("actividades.hourlyRate")}
              type="number"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
            />

            <select
              className="border rounded px-3 py-2"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {t(c.labelKey)}
                </option>
              ))}
            </select>

            <input
              className="border rounded px-3 py-2"
              placeholder={t("actividades.description")}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>

          <div className="mt-3 flex gap-2">
            <button className="px-4 py-2 rounded bg-blue-600 text-white text-sm">
              {formMode === "create"
                ? t("actividades.create")
                : t("actividades.update")}
            </button>
            {formMode === "edit" && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded bg-gray-300 text-sm"
              >
                {t("common.cancel")}
              </button>
            )}
          </div>
        </form>
      )}

      {/* LIST */}
      {loading ? (
        <div className="border rounded px-4 py-3 text-sm text-gray-600">
          {t("actividades.loadingList", "Cargando actividades…")}
        </div>
      ) : (
        <div className="space-y-2">
          {actividades.map((a) => (
            <div
              key={a.id}
              className="border rounded p-3 flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-gray-500">
                  {a.currency_code} · {a.hourly_rate} ·{" "}
                  {a.active ? t("common.active") : t("common.inactive")}
                </div>
                {a.description && (
                  <div className="text-sm text-gray-600">{a.description}</div>
                )}
              </div>

              {canEdit && (
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(a)}
                    className="text-xs px-2 py-1 rounded bg-yellow-500 text-white"
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    onClick={() => toggleActividadActiva(a.id, !a.active).then(loadActividades)}
                    className="text-xs px-2 py-1 rounded bg-blue-500 text-white"
                  >
                    {a.active ? t("common.disable") : t("common.enable")}
                  </button>
                  <button
                    onClick={() => deleteActividad(a.id).then(loadActividades)}
                    className="text-xs px-2 py-1 rounded bg-red-600 text-white"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
