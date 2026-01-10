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

// Lista de monedas, nombres vía i18n (actividades.currencies.*)
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
  const {
    authReady,
    orgsReady,
    currentOrg,
    role,
    currentRole,
  } = useAuth();

  const { t } = useTranslation();

  // Rol efectivo del usuario en la organización actual
  const effectiveRole = (currentRole || role || "").toLowerCase();
  const canEdit = effectiveRole === "owner" || effectiveRole === "admin";

  const [actividades, setActividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [formMode, setFormMode] = useState("create"); // 'create' | 'edit'
  const [editingId, setEditingId] = useState(null);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [hourlyRate, setHourlyRate] = useState("");

  // ------------------------------
  // Carga de actividades por org
  // ------------------------------
  async function loadActividades() {
    if (!currentOrg?.id) {
      setActividades([]);
      return;
    }

    setLoading(true);
    setErrorMsg("");

    const { data, error } = await listActividades({
      includeInactive: true,
      orgId: currentOrg.id, // ✅ fuente única
    });

    if (error) {
      console.error("[ActividadesPage] listActividades error:", error);
      setErrorMsg(error.message || t("actividades.errorLoad"));
    } else {
      setActividades(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (authReady && orgsReady && currentOrg?.id) {
      loadActividades();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, orgsReady, currentOrg?.id]);

  // ------------------------------
  // Helpers de formulario
  // ------------------------------
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
        const payload = {
          name: nombre.trim(),
          description: descripcion.trim() || null,
          active: true,
          currency_code: currency,
          hourly_rate: Number(hourlyRate),
        };

        const { error } = await createActividad(payload, {
          orgId: currentOrg.id,
        });
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
      console.error("[ActividadesPage] handleSubmit error:", err);
      setErrorMsg(err.message || t("actividades.errorSave"));
    }
  }

  function handleEdit(act) {
    setFormMode("edit");
    setEditingId(act.id);
    setNombre(act.name || "");
    setDescripcion(act.description || "");
    setCurrency(act.currency_code || "USD");
    setHourlyRate(
      act.hourly_rate !== null && act.hourly_rate !== undefined
        ? String(act.hourly_rate)
        : ""
    );
  }

  async function handleToggle(act) {
    try {
      const { error } = await toggleActividadActiva(act.id, !act.active);
      if (error) throw error;
      await loadActividades();
    } catch (err) {
      console.error("[ActividadesPage] handleToggle error:", err);
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
      console.error("[ActividadesPage] handleDelete error:", err);
      setErrorMsg(err.message || t("actividades.errorDelete"));
    }
  }

  // ------------------------------
  // Estados de carga correctos
  // ------------------------------
  if (!authReady || !orgsReady) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          {t(
            "actividades.loadingAuth",
            "Cargando tu sesión y organización actual…"
          )}
        </div>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t(
            "actividades.noOrgAssigned",
            "No hay organización asignada para el usuario actual. Cierra sesión y vuelve a entrar o contacta con el administrador."
          )}
        </div>
      </div>
    );
  }

  // ------------------------------
  // Render normal
  // ------------------------------
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-1 mb-4">
        <h1 className="text-2xl font-semibold">
          {t("actividades.title")}
        </h1>
        <p className="text-xs text-gray-500">
          {t("actividades.currentOrgLabel", "Organización actual")}:{" "}
          <span className="font-medium">
            {currentOrg.name}
          </span>
        </p>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
          {errorMsg}
        </div>
      )}

      {/* resto del render SIN CAMBIOS */}
      {/* … */}
    </div>
  );
}
