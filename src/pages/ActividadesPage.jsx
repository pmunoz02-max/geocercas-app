// src/pages/ActividadesPage.jsx
// ============================================================
// ACTIVIDADES — UI canónica (Feb 2026)
// - Fuente de verdad: AuthContext (backend)
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";

import {
  listActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  toggleActivityActive,
} from "../lib/activitiesApi";

const CURRENCIES = ["USD", "EUR", "MXN", "COP", "PEN", "CLP", "ARS", "BRL", "CAD", "GBP"];

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export default function ActividadesPage() {
  const { t } = useTranslation();

  const {
    loading,
    isAuthenticated,
    user,
    role,
    currentRole,
    currentOrg, // ✅ org canónica
  } = useAuth();

  const activeOrgId = currentOrg?.id ?? null;

  const effectiveRole = useMemo(
    () => String(currentRole || role || "").toLowerCase(),
    [currentRole, role]
  );

  const canEdit = effectiveRole === "owner" || effectiveRole === "admin";

  const [includeInactive, setIncludeInactive] = useState(true);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [mode, setMode] = useState("create");
  const [editingId, setEditingId] = useState(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [hourlyRate, setHourlyRate] = useState("");

  function resetForm() {
    setMode("create");
    setEditingId(null);
    setName("");
    setDescription("");
    setCurrencyCode("USD");
    setHourlyRate("");
    setErrorMsg("");
  }

  function startEdit(r) {
    setMode("edit");
    setEditingId(r.id);
    setName(r.name || "");
    setDescription(r.description || "");
    setCurrencyCode(r.currency_code || "USD");
    setHourlyRate(r.hourly_rate == null ? "" : String(r.hourly_rate));
  }

  async function load() {
    if (!activeOrgId) {
      setRows([]);
      setLoadingList(false);
      setErrorMsg(
        t("actividades.errorMissingTenant", {
          defaultValue: "No se encontró la organización del usuario.",
        })
      );
      return;
    }

    setLoadingList(true);
    setErrorMsg("");

    try {
      const { data, error } = await listActivities({ includeInactive });
      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("[ActividadesPage] load error", e);
      setRows([]);
      setErrorMsg(
        e?.message || t("actividades.errorLoad", { defaultValue: "No se pudo cargar actividades." })
      );
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (!loading && isAuthenticated && user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAuthenticated, user?.id, includeInactive, activeOrgId]);

  // --- UI estados ---
  if (loading) {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <div className="border rounded px-4 py-3 text-sm text-gray-600">
          {t("common.actions.loading", { defaultValue: "Cargando…" })}
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <div className="border rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("auth.loginRequired", { defaultValue: "Debes iniciar sesión." })}
        </div>
      </div>
    );
  }

  if (!activeOrgId) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <div className="border rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("actividades.errorMissingTenant", {
            defaultValue: "No se encontró la organización del usuario.",
          })}
        </div>
      </div>
    );
  }

  // --- resto del JSX: SIN CAMBIOS ---
  // (formularios, lista, botones, etc.)
}
