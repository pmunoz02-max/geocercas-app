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

const ESTADOS = ["todos", "activa", "inactiva"];

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

function detectDominantOrgId(items) {
  const counts = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const rawOrgId =
      item?.org_id ??
      item?.tenant_id ??
      item?.organization_id ??
      item?.orgId ??
      item?.tenantId ??
      null;

    if (!rawOrgId) continue;

    const normalizedOrgId = String(rawOrgId);
    counts.set(normalizedOrgId, (counts.get(normalizedOrgId) || 0) + 1);
  }

  let dominantOrgId = null;
  let dominantCount = 0;

  for (const [candidateOrgId, candidateCount] of counts.entries()) {
    if (candidateCount > dominantCount) {
      dominantOrgId = candidateOrgId;
      dominantCount = candidateCount;
    }
  }

  return dominantOrgId;
}

export default function AsignacionesPage() {
  const { t } = useTranslation();
  const tt = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const { ready, isAuthenticated, currentOrg, activeOrgId } = useAuth();
  const orgId = activeOrgId || null;

  const [asignaciones, setAsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [estadoFilter, setEstadoFilter] = useState("todos");

  const [selectedPersonalId, setSelectedPersonalId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [frecuenciaEnvioMin, setFrecuenciaEnvioMin] = useState(5);
  const [status, setStatus] = useState("activa");
  const [editingId, setEditingId] = useState(null);

  const [personalOptions, setPersonalOptions] = useState([]);
  const [geocercaOptions, setGeocercaOptions] = useState([]);
  const [activityOptions, setActivityOptions] = useState([]);
  const [catalogOrgId, setCatalogOrgId] = useState(null);

  const [showForm, setShowForm] = useState(true);

  useEffect(() => {
    setAsignaciones([]);
    setPersonalOptions([]);
    setGeocercaOptions([]);
    setActivityOptions([]);
    setCatalogOrgId(null);
    setSelectedPersonalId("");
    setSelectedGeocercaId("");
    setSelectedActivityId("");
    setEditingId(null);
    setError(null);
    setSuccessMessage(null);
  }, [orgId]);

  function keepIfSameOrgOrUnknown(row) {
    if (!row) return false;
    if (!orgId) return true;

    const rowOrgId =
      row.org_id ??
      row.tenant_id ??
      row.organization_id ??
      row.orgId ??
      row.tenantId ??
      null;

    if (!rowOrgId) return true;
    return String(rowOrgId) === String(orgId);
  }

  async function loadCatalogsCanonical() {
    if (!isAuthenticated || !orgId) {
      setPersonalOptions([]);
      setGeocercaOptions([]);
      setCatalogOrgId(null);
      return;
    }

    const params = new URLSearchParams({ onlyActive: "1", limit: "500", org_id: String(orgId) });
    const rP = await fetchJsonSafe(`/api/personal?${params.toString()}`);
    const personalRaw = extractArray(rP.payload);
    const personalNorm = personalRaw
      .map(normalizePersonRow)
      .filter((p) => p.id);

    const geofenceParams = new URLSearchParams({ action: "list", onlyActive: "true", org_id: String(orgId) });
    const rG = await fetchJsonSafe(`/api/geofences?${geofenceParams.toString()}`);
    const geofencesRaw = extractArray(rG.payload);
    const geofencesNorm = geofencesRaw
      .map(normalizeGeofenceRow)
      .filter((g) => g.id);

    const dominantCatalogOrgId = detectDominantOrgId([...personalRaw, ...geofencesRaw]);
    if (dominantCatalogOrgId && String(dominantCatalogOrgId) !== String(orgId)) {
      setCatalogOrgId(String(dominantCatalogOrgId));
    } else {
      setCatalogOrgId(null);
    }

    setPersonalOptions(personalNorm);
    setGeocercaOptions(geofencesNorm);
  }

  async function loadAll() {
    if (!isAuthenticated || !orgId) {
      setAsignaciones([]);
      setPersonalOptions([]);
      setGeocercaOptions([]);
      setActivityOptions([]);
      setCatalogOrgId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await loadCatalogsCanonical();
    } catch (e) {
      console.error("[AsignacionesPage] canonical catalogs crash:", e);
      setPersonalOptions([]);
      setGeocercaOptions([]);
      setCatalogOrgId(null);
    }

    const { data, error: bundleError } = await getAsignacionesBundle(orgId);

    if (bundleError) {
      console.error("[AsignacionesPage] bundle error:", bundleError);
      setAsignaciones([]);
      setActivityOptions([]);
      setError(
        bundleError.message ||
          t("asignaciones.messages.loadError", {
            defaultValue: "Error loading assignments.",
          })
      );
      setLoading(false);
      return;
    }

    const bundle = data || {};
    const rows = Array.isArray(bundle.asignaciones)
      ? bundle.asignaciones.filter((a) => keepIfSameOrgOrUnknown(a))
      : [];
    const catalogs = bundle.catalogs || {};

    setAsignaciones(rows);

    const activitiesRaw = Array.isArray(catalogs.activities)
      ? catalogs.activities.filter((a) => keepIfSameOrgOrUnknown(a))
      : [];
    setActivityOptions(activitiesRaw);

    if (!selectedActivityId && activitiesRaw.length === 1) {
      setSelectedActivityId(activitiesRaw[0].id);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!ready) return;

    if (!isAuthenticated) {
      setAsignaciones([]);
      setPersonalOptions([]);
      setGeocercaOptions([]);
      setActivityOptions([]);
      setCatalogOrgId(null);
      setError(null);
      setSuccessMessage(null);
      setLoading(false);
      return;
    }

    if (!orgId) {
      setAsignaciones([]);
      setPersonalOptions([]);
      setGeocercaOptions([]);
      setActivityOptions([]);
      setCatalogOrgId(null);
      setError(
        tt(
          "asignaciones.messages.noOrg",
          "No active organization in session. Select an organization to create assignments."
        )
      );
      return;
    }

    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isAuthenticated, orgId]);

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
        if (!startTime || !endTime) {
          // Validación existente para fechas faltantes
          setError(
            tt(
              "asignaciones.messages.selectDates",
              "You must enter start and end date/time."
            )
          );
          return;
        }
        if (endTime < startTime) {
          setError("La fecha final no puede ser anterior a la fecha inicial");
          return;
        }
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!isAuthenticated) {
      setError("Debes iniciar sesión para crear asignaciones");
      return;
    }

    if (!orgId) {
      setError(tt("asignaciones.messages.noOrg", "No active organization."));
      return;
    }

    if (!selectedPersonalId || !selectedGeocercaId) {
      setError(
        tt(
          "asignaciones.messages.selectPersonAndFence",
          "You must select a person and a geofence."
        )
      );
      return;
    }

    if (!selectedActivityId) {
      setError(
        tt(
          "asignaciones.error.missingActivity",
          "You must select an activity."
        )
      );
      return;
    }

    if (!startTime || !endTime) {
      setError(
        tt(
          "asignaciones.messages.selectDates",
          "You must enter start and end date/time."
        )
      );
      return;
    }

    const freqMin = Number(frecuenciaEnvioMin) || 0;
    if (freqMin < 5) {
      setError(
        tt(
          "asignaciones.messages.frequencyTooLow",
          "The minimum allowed frequency is 5 minutes."
        )
      );
      return;
    }

    const payload = {
      personal_id: selectedPersonalId,
      geofence_id: selectedGeocercaId,
      geocerca_id: null,
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
          tt(
            "asignaciones.messages.saveGenericError",
            "Error saving assignment."
          )
      );
      return;
    }

    setSuccessMessage(
      editingId
        ? tt("asignaciones.banner.updated", "Assignment updated.")
        : tt(
            "asignaciones.banner.created",
            "Assignment created successfully."
          )
    );

    resetForm();
    await loadAll();
  }

  if (!ready) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className={`${cardBase} px-4 py-3 text-sm text-gray-700`}>
          {tt("asignaciones.messages.loadingData", "Loading assignment data…")}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-800">
            Debes iniciar sesión para crear asignaciones
          </p>
          <p className="text-xs text-red-700">
            Inicia sesión para cargar personas, geocercas y actividades
          </p>
        </div>
      </div>
    );
  }

  const labelForEstado = (v) => {
    if (v === "todos") {
      return tt("asignaciones.filters.status.todos", "All");
    }
    if (v === "activa") {
      return tt("asignaciones.filters.status.activo", "Active");
    }
    if (v === "inactiva") {
      return tt("asignaciones.filters.status.inactivo", "Inactive");
    }
    return v;
  };

  const hasCatalogOrgMismatch = Boolean(catalogOrgId && String(catalogOrgId) !== String(orgId));

  return (
    <div className="w-full px-3 md:px-6 py-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {tt("asignaciones.title", "Assignments")}
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            {tt("asignaciones.currentOrgLabel", "Current organization")}:{" "}
            <span className="font-medium text-gray-900">
              {currentOrg?.name || orgId || tt("common.unknown", "Unknown")}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="font-medium text-sm text-gray-900">
              {tt("asignaciones.filters.statusLabel", "Status")}
            </label>
            <select
              className={selectBase}
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
            >
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
              ? tt("asignaciones.ui.hideForm", "Hide form")
              : tt("asignaciones.ui.showForm", "Show form")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        {showForm && (
          <div className={`${cardBase} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900">
                {editingId
                  ? tt("asignaciones.form.editTitle", "Edit assignment")
                  : tt("asignaciones.form.newTitle", "New assignment")}
              </h2>
              {loading && (
                <span className="text-xs text-gray-500">
                  {tt("common.loading", "Loading…")}
                </span>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {hasCatalogOrgMismatch && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  La organización activa no coincide con la organización de personas/geocercas cargadas. Cambia la organización antes de guardar.
                </div>
              )}

              {!orgId && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {tt(
                    "asignaciones.messages.noOrg",
                    "No active organization in session. Select an organization to create assignments."
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {tt("asignaciones.form.personLabel", "Person")}
                </label>
                <select
                  className={selectBase}
                  value={selectedPersonalId}
                  onChange={(e) => setSelectedPersonalId(e.target.value)}
                  required
                >
                  <option value="">
                    {tt(
                      "asignaciones.form.personPlaceholder",
                      "Select a person"
                    )}
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
                  {tt("asignaciones.form.geofenceLabel", "Geofence")}
                </label>
                <select
                  className={selectBase}
                  value={selectedGeocercaId}
                  onChange={(e) => setSelectedGeocercaId(e.target.value)}
                  required
                >
                  <option value="">
                    {tt(
                      "asignaciones.form.geofencePlaceholder",
                      "Select a geofence"
                    )}
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
                  {tt("asignaciones.form.activityLabel", "Activity")}
                </label>
                <select
                  className={selectBase}
                  value={selectedActivityId}
                  onChange={(e) => setSelectedActivityId(e.target.value)}
                  required
                  disabled={activityOptions.length === 0}
                >
                  <option value="">
                    {tt(
                      "asignaciones.form.activityPlaceholder",
                      "Select an activity"
                    )}
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
                    {tt("asignaciones.form.startLabel", "Start date/time")}
                  </label>
                  <input
                    type="datetime-local"
                    className={inputBase}
                    value={startTime}
                    onChange={(e) => {
                      const nuevoStart = e.target.value;
                      setStartTime(nuevoStart);
                      if (endTime && endTime < nuevoStart) setEndTime("");
                    }}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {tt("asignaciones.form.endLabel", "End date/time")}
                  </label>
                  <input
                    type="datetime-local"
                    className={inputBase}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                    min={startTime || undefined}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {tt("asignaciones.form.statusLabel", "Status")}
                  </label>
                  <select
                    className={selectBase}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="activa">
                      {tt("asignaciones.form.statusActive", "Active")}
                    </option>
                    <option value="inactiva">
                      {tt("asignaciones.form.statusInactive", "Inactive")}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {tt("asignaciones.form.frequencyLabel", "Frequency (min)")}
                  </label>
                  <input
                    type="number"
                    className={inputBase}
                    min={5}
                    value={frecuenciaEnvioMin}
                    onChange={(e) => setFrecuenciaEnvioMin(Number(e.target.value) || 5)}
                  />
                  <p className="mt-1 text-[11px] text-gray-500">
                    {tt(
                      "asignaciones.form.frequencyHint",
                      "Minimum: 5 minutes."
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    {tt("asignaciones.form.cancelEditButton", "Cancel")}
                  </button>
                )}

                <button
                  type="submit"
                  className="rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={
                    hasCatalogOrgMismatch ||
                    !orgId ||
                    loading ||
                    activityOptions.length === 0 ||
                    personalOptions.length === 0 ||
                    geocercaOptions.length === 0
                  }
                >
                  {editingId
                    ? tt("asignaciones.form.updateButton", "Update")
                    : tt("asignaciones.form.saveButton", "Save")}
                </button>
              </div>

              <div className="pt-1">
                {successMessage && (
                  <p className="text-green-700 text-sm font-semibold">
                    {successMessage}
                  </p>
                )}
                {error && (
                  <p className="text-red-700 text-sm font-semibold">
                    {error}
                  </p>
                )}
              </div>
            </form>
          </div>
        )}

        <div className={`${cardBase} overflow-hidden`}>
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              {tt("asignaciones.list.title", "Assignment list")}
            </h2>
            <span className="text-xs text-gray-500">
              {loading
                ? tt("common.loading", "Loading…")
                : `${filteredAsignaciones.length} ${tt("common.items", "items")}`}
            </span>
          </div>

          <div
            className="px-2 pb-2 overflow-auto"
            style={{ maxHeight: "calc(100vh - 220px)" }}
          >
            <AsignacionesTable
              asignaciones={filteredAsignaciones}
              loading={loading}
              people={personalOptions}
              geofences={geocercaOptions}
              activities={activityOptions}
              onEdit={(a) => {
                setEditingId(a.id);
                setSelectedPersonalId(a.personal_id || "");
                setSelectedGeocercaId(a.geofence_id || a.geocerca_id || "");
                setSelectedActivityId(a.activity_id || "");
                setStartTime(a.start_time?.slice(0, 16) || "");
                setEndTime(a.end_time?.slice(0, 16) || "");
                setFrecuenciaEnvioMin(
                  Math.max(5, Math.round((a.frecuencia_envio_sec || 300) / 60))
                );
                setStatus(a.status || "activa");
                setError(null);
                setSuccessMessage(null);
                setShowForm(true);
              }}
              onDelete={async (id) => {
                const ok = window.confirm(
                  tt(
                    "asignaciones.messages.confirmDelete",
                    "Are you sure you want to delete this assignment?"
                  )
                );
                if (!ok) return;

                const resp = await deleteAsignacion(id);
                if (resp.error) {
                  setError(
                    tt(
                      "asignaciones.messages.deleteError",
                      "Could not delete the assignment."
                    )
                  );
                } else {
                  setSuccessMessage(
                    tt("asignaciones.banner.deleted", "Assignment deleted.")
                  );
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