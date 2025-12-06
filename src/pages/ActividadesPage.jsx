// src/pages/ActividadesPage.jsx
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

// 🔹 Lista de monedas, nombres vía i18n (actividades.currencies.*)
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
  const { profile, role } = useAuth(); // tenant_id/org_id + rol
  const { t } = useTranslation();

  const [actividades, setActividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [formMode, setFormMode] = useState("create"); // 'create' | 'edit'
  const [editingId, setEditingId] = useState(null);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [currency, setCurrency] = useState("USD");
  const [hourlyRate, setHourlyRate] = useState("");

  async function loadActividades() {
    setLoading(true);
    setErrorMsg("");

    const { data, error } = await listActividades({ includeInactive: true });

    if (error) {
      console.error(error);
      setErrorMsg(error.message || t("actividades.errorLoad"));
    } else {
      setActividades(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadActividades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setFormMode("create");
    setEditingId(null);
    setNombre("");
    setDescripcion("");
    setCurrency("USD");
    setHourlyRate("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!nombre.trim()) {
      setErrorMsg(t("actividades.errorNameRequired"));
      return;
    }

    if (!hourlyRate || Number(hourlyRate) <= 0) {
      setErrorMsg(t("actividades.errorRatePositive"));
      return;
    }

    try {
      if (formMode === "create") {
        const tenantId = profile?.tenant_id || profile?.org_id;
        if (!tenantId) {
          setErrorMsg(t("actividades.errorMissingTenant"));
          return;
        }

        const payload = {
          tenant_id: tenantId,
          name: nombre.trim(),
          description: descripcion.trim() || null,
          active: true,
          currency_code: currency,
          hourly_rate: Number(hourlyRate),
        };

        const { error } = await createActividad(payload);
        if (error) throw error;
      } else if (formMode === "edit" && editingId) {
        const { error } = await updateActividad(editingId, {
          name: nombre.trim(),
          description: descripcion.trim() || null,
          currency_code: currency,
          hourly_rate: Number(hourlyRate),
        });
        if (error) throw error;
      }

      resetForm();
      await loadActividades();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || t("actividades.errorSave"));
    }
  }

  function handleEdit(act) {
    setFormMode("edit");
    setEditingId(act.id);

    setNombre(act.name || "");
    setDescripcion(act.description || "");
    setCurrency(act.currency_code || "USD");
    setHourlyRate(act.hourly_rate || "");
  }

  async function handleToggle(act) {
    try {
      const { error } = await toggleActividadActiva(act.id, !act.active);
      if (error) throw error;
      await loadActividades();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || t("actividades.errorToggle"));
    }
  }

  async function handleDelete(act) {
    if (!window.confirm(t("actividades.confirmDelete", { name: act.name }))) {
      return;
    }
    try {
      const { error } = await deleteActividad(act.id);
      if (error) throw error;
      await loadActividades();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || t("actividades.errorDelete"));
    }
  }

  // 🔒 Trackers no pueden crear ni editar actividades
  const canEdit = role === "owner" || role === "admin";

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">
        {t("actividades.title")}
      </h1>

      {errorMsg && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Formulario */}
      {canEdit ? (
        <div className="mb-8 bg-white shadow-sm rounded-lg p-4 border border-gray-100">
          <h2 className="text-lg font-medium mb-3">
            {formMode === "create"
              ? t("actividades.formTitleNew")
              : t("actividades.formTitleEdit")}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("actividades.fieldName")}
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder={t("actividades.fieldNamePlaceholder")}
              />
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("actividades.fieldDescription")}
              </label>
              <textarea
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                rows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder={t("actividades.fieldDescriptionPlaceholder")}
              />
            </div>

            {/* Moneda */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("actividades.fieldCurrency")}
              </label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {t(c.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            {/* Tarifa por hora */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("actividades.fieldHourlyRate")}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder={t("actividades.fieldHourlyRatePlaceholder")}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
              >
                {formMode === "create"
                  ? t("actividades.buttonCreate")
                  : t("actividades.buttonSave")}
              </button>

              {formMode === "edit" && (
                <button
                  type="button"
                  className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
                  onClick={resetForm}
                >
                  {t("actividades.buttonCancel")}
                </button>
              )}
            </div>
          </form>
        </div>
      ) : (
        <div className="mb-6 text-sm text-gray-600">
          {t("actividades.readOnlyNote")}
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-700">
            {t("actividades.tableTitle")}
          </h2>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-500">
            {t("actividades.loading")}
          </div>
        ) : actividades.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            {t("actividades.empty")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    {t("actividades.thName")}
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    {t("actividades.thDescription")}
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    {t("actividades.thCost")}
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    {t("actividades.thStatus")}
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">
                    {t("actividades.thActions")}
                  </th>
                </tr>
              </thead>

              <tbody>
                {actividades.map((act) => (
                  <tr key={act.id} className="border-t border-gray-100">
                    {/* Nombre */}
                    <td className="px-4 py-2 align-top">
                      <div className="font-medium text-gray-900">
                        {act.name}
                      </div>
                    </td>

                    {/* Descripción */}
                    <td className="px-4 py-2 align-top">
                      {act.description || "—"}
                    </td>

                    {/* Tarifa */}
                    <td className="px-4 py-2 align-top">
                      {act.hourly_rate
                        ? `${act.currency_code} ${act.hourly_rate.toFixed(2)}`
                        : "—"}
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-2 align-top">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          act.active
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-gray-50 text-gray-500 border border-gray-200"
                        }`}
                      >
                        {act.active
                          ? t("actividades.statusActive")
                          : t("actividades.statusInactive")}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-2 align-top text-right space-x-2">
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                            onClick={() => handleEdit(act)}
                          >
                            {t("actividades.actionEdit")}
                          </button>

                          <button
                            type="button"
                            className="inline-flex items-center rounded-md bg-slate-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-600"
                            onClick={() => handleToggle(act)}
                          >
                            {act.active
                              ? t("actividades.actionDeactivate")
                              : t("actividades.actionActivate")}
                          </button>

                          <button
                            type="button"
                            className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700"
                            onClick={() => handleDelete(act)}
                          >
                            {t("actividades.actionDelete")}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
