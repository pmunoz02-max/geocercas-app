// src/pages/AsignacionesPage.jsx
// DEFINITIVO (preview): catálogos canónicos para selects
// - Personas: /api/personal
// - Geocercas: /api/geofences?action=list&onlyActive=true  (misma fuente que /geocerca)
// Bundle /api/asignaciones queda para listado + activities (si existe)

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import {
  getAsignacionesBundle,
  createAsignacion,
  updateAsignacion,
  deleteAsignacion,
} from "../lib/asignacionesApi";
import AsignacionesTable from "../components/asignaciones/AsignacionesTable";

function localDateTimeToISO(localDateTime) {
  if (!localDateTime) return null;
  const [d, t] = String(localDateTime).split("T");
  if (!d || !t) return null;
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return new Date(y, m - 1, day, hh, mm, 0, 0).toISOString();
}

// Importante: valores internos siguen siendo "activa/inactiva" (compat backend).
const ESTADOS = ["todos", "activa", "inactiva"];

// ✅ Clases UI (alto contraste)
const inputBase =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 " +
  "placeholder:text-gray-400 shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 " +
  "disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed";

const selectBase =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 " +
  "shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 " +
  "disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed";

const cardBase = "rounded-xl border border-gray-200 bg-white shadow-sm";

async function fetchJsonSafe(url) {
  const res = await fetch(url, { credentials: "include" });
  const txt = await res.text();
  let payload = null;
  try {
    payload = txt ? JSON.parse(txt) : null;
  } catch {
    payload = null;
  }

  // Soportar tanto {ok:true,data:...} como arrays planos
  if (!res.ok || payload?.ok === false) {
    const msg = payload?.error || payload?.message || `HTTP ${res.status}`;
    return { payload, error: { message: msg, status: res.status } };
  }
  return { payload, error: null };
}

function extractArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const keys = ["data", "rows", "items", "personal", "people", "geocercas", "geofences"];
  for (const k of keys) {
    if (Array.isArray(payload[k])) return payload[k];
  }
  if (payload.data && typeof payload.data === "object") {
    for (const k of keys) {
      if (Array.isArray(payload.data[k])) return payload.data[k];
    }
  }
  return [];
}

function normalizePersonRow(p) {
  const id =
    p?.id ||
    p?.personal_id ||
    p?.org_people_id ||
    p?.user_id ||
    p?.uuid ||
    "";

  const nombre =
    p?.nombre ||
    p?.first_name ||
    p?.firstname ||
    (typeof p?.full_name === "string" ? p.full_name.split(" ")[0] : "") ||
    "";

  const apellido =
    p?.apellido ||
    p?.last_name ||
    p?.lastname ||
    (typeof p?.full_name === "string"
      ? p.full_name.split(" ").slice(1).join(" ")
      : "") ||
    "";

  const label = String(
    p?.display_name ||
      p?.full_name ||
      `${nombre} ${apellido}`.trim() ||
      p?.email ||
      id
  ).trim();

  return {
    id,
    nombre: String(nombre || "").trim(),
    apellido: String(apellido || "").trim(),
    email: String(p?.email || "").trim(),
    label,
  };
}

function normalizeGeofenceRow(g) {
  const id = g?.id || "";
  const nombre = String(g?.name || g?.nombre || g?.label || "").trim();
  return { id, nombre: nombre || id };
}

export default function AsignacionesPage() {
  const { t } = useTranslation();
  const { ready, currentOrg } = useAuth();
  const orgId = currentOrg?.id || null;

  const [asignaciones, setAsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [estadoFilter, setEstadoFilter] = useState("todos");

  // FORM
  const [selectedPersonalId, setSelectedPersonalId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [frecuenciaEnvioMin, setFrecuenciaEnvioMin] = useState(5);
  const [status, setStatus] = useState("activa");
  const [editingId, setEditingId] = useState(null);

  // CATALOGOS
  const [personalOptions, setPersonalOptions] = useState([]);
  const [geocercaOptions, setGeocercaOptions] = useState([]);
  const [activityOptions, setActivityOptions] = useState([]);

  // UI
  const [showForm, setShowForm] = useState(true);

  async function loadCatalogsCanonical() {
    // Personas
    const rP = await fetchJsonSafe("/api/personal?onlyActive=1&limit=500");
    const personalRaw = extractArray(rP.payload);
    const personalNorm = personalRaw.map(normalizePersonRow).filter((p) => p.id);

    // Geocercas (desde geofences)
    const rG = await fetchJsonSafe("/api/geofences?action=list&onlyActive=true");
    const geofencesRaw = extractArray(rG.payload);
    const geofencesNorm = geofencesRaw.map(normalizeGeofenceRow).filter((g) => g.id);

    // Setear aunque una falle (evita “no se puede seleccionar”)
    setPersonalOptions(personalNorm);
    setGeocercaOptions(geofencesNorm);
  }

  async function loadAll() {
    setLoading(true);
    setError(null);

    // 1) Siempre cargar catálogos canónicos (esto NO depende del bundle)
    try {
      await loadCatalogsCanonical();
    } catch (e) {
      console.error("[AsignacionesPage] canonical catalogs crash:", e);
      // No bloqueamos la página por catálogos
      setPersonalOptions([]);
      setGeocercaOptions([]);
    }

    // 2) Cargar bundle (listado + activities si existen)
    const { data, error: bundleError } = await getAsignacionesBundle();

    if (bundleError) {
      console.error("[AsignacionesPage] bundle error:", bundleError);
      setAsignaciones([]); // listado vacío pero el form debe seguir usable
      setActivityOptions([]); // si quieres, luego lo conectamos a /api/activities
      setError(
        bundleError.message ||
          t("asignaciones.messages.loadError", { defaultValue: "Error loading assignments." })
      );
      setLoading(false);
      return;
    }

    const bundle = data || {};
    const rows = Array.isArray(bundle.asignaciones) ? bundle.asignaciones : [];
    const catalogs = bundle.catalogs || {};

    setAsignaciones(rows);

    // Activities: mantenemos lo que venga del bundle
    const activitiesRaw = Array.isArray(catalogs.activities) ? catalogs.activities : [];
    setActivityOptions(activitiesRaw);

    if (!selectedActivityId && activitiesRaw.length === 1) {
      setSelectedActivityId(activitiesRaw[0].id);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!ready || !orgId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, orgId]);

  const filteredAsignaciones = useMemo(() => {
    let rows = Array.isArray(asignaciones) ? asignaciones : [];
    if (estadoFilter !== "todos") {
      rows = rows.filter((a) => (a.status || a.estado) === estadoFilter);
    }
    if (selectedPersonalId) rows = rows.filter((a) => a.personal_id === selectedPersonalId);
    return rows;
  }, [asignaciones, estadoFilter, selectedPersonalId]);

  function resetForm() {
    setSelectedPersonalId("");
    setSelectedGeocercaId("");
    setSelectedActivityId("");
    setStartTime("");
    setEndTime("");
    setFrecuenciaEnvioMin(5);
    setStatus("activa");
    setEditingId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!orgId) {
      setError(t("asignaciones.messages.noOrg", { defaultValue: "No active organization." }));
      return;
    }

    if (!selectedPersonalId || !selectedGeocercaId) {
      setError(
        t("asignaciones.messages.selectPersonAndFence", {
          defaultValue: "You must select a person and a geofence.",
        })
      );
      return;
    }

    if (!selectedActivityId) {
      setError(
        t("asignaciones.error.missingActivity", {
          defaultValue: "You must select an activity.",
        })
      );
      return;
    }

    if (!startTime || !endTime) {
      setError(
        t("asignaciones.messages.selectDates", {
          defaultValue: "You must enter start and end date/time.",
        })
      );
      return;
    }

    const freqMin = Number(frecuenciaEnvioMin) || 0;
    if (freqMin < 5) {
      setError(
        t("asignaciones.messages.frequencyTooLow", {
          defaultValue: "The minimum allowed frequency is 5 minutes.",
        })
      );
      return;
    }

    const payload = {
      personal_id: selectedPersonalId,
      geofence_id: selectedGeocercaId, // ✅ canónico
      geocerca_id: null, // ✅ legacy trace nullable (evita FK vieja)
      activity_id: selectedActivityId,
      start_time: localDateTimeToISO(startTime),
      end_time: localDateTimeToISO(endTime),
      frecuencia_envio_sec: freqMin * 60,
      status,
    };

    const resp = editingId
      ? await updateAsignacion(editingId, payload)
      : await createAsignacion(payload);

    if (resp.error) {
      console.error("[AsignacionesPage] save error:", resp.error);
      setError(
        resp.error.message ||
          t("asignaciones.messages.saveGenericError", { defaultValue: "Error saving assignment." })
      );
      return;
    }

    setSuccessMessage(
      editingId
        ? t("asignaciones.banner.updated", { defaultValue: "Assignment updated." })
        : t("asignaciones.banner.created", { defaultValue: "Assignment created successfully." })
    );

    resetForm();
    await loadAll();
  }

  if (!ready) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className={`${cardBase} px-4 py-3 text-sm text-gray-700`}>
          {t("asignaciones.messages.loadingData", { defaultValue: "Loading assignment data…" })}
        </div>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {t("asignaciones.messages.noOrg", { defaultValue: "No active organization." })}
        </div>
      </div>
    );
  }

  const labelForEstado = (v) => {
    if (v === "todos") return t("asignaciones.filters.status.todos", { defaultValue: "All" });
    if (v === "activa") return t("asignaciones.filters.status.activo", { defaultValue: "Active" });
    if (v === "inactiva") return t("asignaciones.filters.status.inactivo", { defaultValue: "Inactive" });
    return v;
  };

  return (
    <div className="w-full px-3 md:px-6 py-4">
      {/* HEADER */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("asignaciones.title", { defaultValue: "Asignaciones" })}
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            {t("asignaciones.currentOrgLabel", { defaultValue: "Current organization" })}:{" "}
            <span className="font-medium text-gray-900">{currentOrg?.name || "—"}</span>
          </p>
        </div>

        {/* FILTRO + TOGGLE FORM */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="font-medium text-sm text-gray-900">
              {t("asignaciones.filters.statusLabel", { defaultValue: "Estado" })}
            </label>
            <select className={selectBase} value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)}>
              {ESTADOS.map((v) => (
                <option key={v} value={v}>
                  {labelForEstado(v)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            {showForm
              ? t("asignaciones.ui.hideForm", { defaultValue: "Ocultar formulario" })
              : t("asignaciones.ui.showForm", { defaultValue: "Mostrar formulario" })}
          </button>
        </div>
      </div>

      {/* LAYOUT DASHBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        {/* FORM PANEL */}
        {showForm && (
          <div className={`${cardBase} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900">
                {editingId
                  ? t("asignaciones.form.editTitle", { defaultValue: "Editar asignación" })
                  : t("asignaciones.form.newTitle", { defaultValue: "Nueva asignación" })}
              </h2>
              {loading && <span className="text-xs text-gray-500">Loading…</span>}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t("asignaciones.form.personLabel", { defaultValue: "Persona" })}
                </label>
                <select
                  className={selectBase}
                  value={selectedPersonalId}
                  onChange={(e) => setSelectedPersonalId(e.target.value)}
                  required
                >
                  <option value="">
                    {t("asignaciones.form.personPlaceholder", { defaultValue: "Selecciona una persona" })}
                  </option>
                  {personalOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label || `${p.nombre || ""} ${p.apellido || ""}`.trim() || p.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t("asignaciones.form.geofenceLabel", { defaultValue: "Geocerca" })}
                </label>
                <select
                  className={selectBase}
                  value={selectedGeocercaId}
                  onChange={(e) => setSelectedGeocercaId(e.target.value)}
                  required
                >
                  <option value="">
                    {t("asignaciones.form.geofencePlaceholder", { defaultValue: "Selecciona una geocerca" })}
                  </option>
                  {geocercaOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nombre || g.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t("asignaciones.form.activityLabel", { defaultValue: "Actividad" })}
                </label>
                <select
                  className={selectBase}
                  value={selectedActivityId}
                  onChange={(e) => setSelectedActivityId(e.target.value)}
                  required
                  disabled={activityOptions.length === 0}
                >
                  <option value="">
                    {t("asignaciones.form.activityPlaceholder", { defaultValue: "Selecciona una actividad" })}
                  </option>
                  {activityOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || a.nombre || a.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t("asignaciones.form.startLabel", { defaultValue: "Fecha/hora inicio" })}
                  </label>
                  <input
                    type="datetime-local"
                    className={inputBase}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t("asignaciones.form.endLabel", { defaultValue: "Fecha/hora fin" })}
                  </label>
                  <input
                    type="datetime-local"
                    className={inputBase}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t("asignaciones.form.statusLabel", { defaultValue: "Estado" })}
                  </label>
                  <select className={selectBase} value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="activa">{t("asignaciones.form.statusActive", { defaultValue: "Activa" })}</option>
                    <option value="inactiva">{t("asignaciones.form.statusInactive", { defaultValue: "Inactiva" })}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t("asignaciones.form.frequencyLabel", { defaultValue: "Frecuencia (min)" })}
                  </label>
                  <input
                    type="number"
                    className={inputBase}
                    min={5}
                    value={frecuenciaEnvioMin}
                    onChange={(e) => setFrecuenciaEnvioMin(Number(e.target.value) || 5)}
                  />
                  <p className="mt-1 text-[11px] text-gray-500">
                    {t("asignaciones.form.frequencyHint", { defaultValue: "Mínimo: 5 minutos." })}
                  </p>
                </div>
              </div>

              {/* BOTONES */}
              <div className="flex items-center justify-end gap-2 pt-2">
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    {t("asignaciones.form.cancelEditButton", { defaultValue: "Cancelar" })}
                  </button>
                )}

                <button
                  type="submit"
                  className="rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={
                    loading ||
                    activityOptions.length === 0 ||
                    personalOptions.length === 0 ||
                    geocercaOptions.length === 0
                  }
                >
                  {editingId
                    ? t("asignaciones.form.updateButton", { defaultValue: "Actualizar" })
                    : t("asignaciones.form.saveButton", { defaultValue: "Guardar" })}
                </button>
              </div>

              {/* MENSAJES */}
              <div className="pt-1">
                {successMessage && <p className="text-green-700 text-sm font-semibold">{successMessage}</p>}
                {error && <p className="text-red-700 text-sm font-semibold">{error}</p>}
              </div>
            </form>
          </div>
        )}

        {/* LISTADO PANEL (GRANDE + SCROLL) */}
        <div className={`${cardBase} overflow-hidden`}>
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              {t("asignaciones.list.title", { defaultValue: "Listado de asignaciones" })}
            </h2>
            <span className="text-xs text-gray-500">
              {loading ? "Loading…" : `${filteredAsignaciones.length} items`}
            </span>
          </div>

          <div className="px-2 pb-2 overflow-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
            <AsignacionesTable
              asignaciones={filteredAsignaciones}
              loading={loading}
              people={personalOptions}
              geofences={geocercaOptions}
              activities={activityOptions}
              onEdit={(a) => {
                setEditingId(a.id);
                setSelectedPersonalId(a.personal_id || "");

                // ✅ canónico: geofence_id, fallback legacy: geocerca_id
                setSelectedGeocercaId(a.geofence_id || a.geocerca_id || "");

                setSelectedActivityId(a.activity_id || "");
                setStartTime(a.start_time?.slice(0, 16) || "");
                setEndTime(a.end_time?.slice(0, 16) || "");
                setFrecuenciaEnvioMin(Math.max(5, Math.round((a.frecuencia_envio_sec || 300) / 60)));
                setStatus(a.status || "activa");
                setError(null);
                setSuccessMessage(null);
                setShowForm(true);
              }}
              onDelete={async (id) => {
                const ok = window.confirm(
                  t("asignaciones.messages.confirmDelete", {
                    defaultValue: "Are you sure you want to delete this assignment?",
                  })
                );
                if (!ok) return;

                const resp = await deleteAsignacion(id);
                if (resp.error) {
                  setError(
                    t("asignaciones.messages.deleteError", {
                      defaultValue: "Could not delete the assignment.",
                    })
                  );
                } else {
                  setSuccessMessage(t("asignaciones.banner.deleted", { defaultValue: "Assignment deleted." }));
                  loadAll();
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}