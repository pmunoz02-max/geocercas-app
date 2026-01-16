// src/pages/AsignacionesPage.jsx
// DEFINITIVO: Asignaciones usa personal (personal_id) + /api/asignaciones

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
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

export default function AsignacionesPage() {
  const { t } = useTranslation();
  const { ready, currentOrg } = useAuth();
  const orgId = currentOrg?.id || null;

  const [asignaciones, setAsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [estadoFilter, setEstadoFilter] = useState("todos");

  // FORM (✅ personal_id)
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

  async function loadAll() {
    setLoading(true);
    setError(null);

    const { data, error } = await getAsignacionesBundle();
    if (error) {
      console.error("[AsignacionesPage] bundle error:", error);
      setError(
        error.message ||
          t("asignaciones.messages.loadError", { defaultValue: "Error loading assignments." })
      );
      setAsignaciones([]);
      setPersonalOptions([]);
      setGeocercaOptions([]);
      setActivityOptions([]);
      setLoading(false);
      return;
    }

    const bundle = data || {};
    const rows = bundle.asignaciones || [];
    const catalogs = bundle.catalogs || {};

    setAsignaciones(Array.isArray(rows) ? rows : []);

    // ✅ Fuente de verdad
    const personal = Array.isArray(catalogs.personal) ? catalogs.personal : [];

    // Fallback de compat: si por algún motivo llega vacío pero hay "people" (alias), lo usamos
    const fallback = Array.isArray(catalogs.people) ? catalogs.people : [];
    const normalizedPersonal =
      personal.length > 0
        ? personal
        : fallback.map((p) => ({
            id: p.org_people_id, // alias
            nombre: p.nombre,
            apellido: p.apellido,
            email: p.email,
          }));

    setPersonalOptions(normalizedPersonal);
    setGeocercaOptions(Array.isArray(catalogs.geocercas) ? catalogs.geocercas : []);
    setActivityOptions(Array.isArray(catalogs.activities) ? catalogs.activities : []);

    if (
      !selectedActivityId &&
      Array.isArray(catalogs.activities) &&
      catalogs.activities.length === 1
    ) {
      setSelectedActivityId(catalogs.activities[0].id);
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
      personal_id: selectedPersonalId, // ✅ definitivo
      geocerca_id: selectedGeocercaId,
      activity_id: selectedActivityId,
      start_time: localDateTimeToISO(startTime),
      end_time: localDateTimeToISO(endTime),
      frecuencia_envio_sec: freqMin * 60,
      status, // "activa" | "inactiva"
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
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          {t("asignaciones.messages.loadingData", { defaultValue: "Loading assignment data…" })}
        </div>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("asignaciones.messages.noOrg", { defaultValue: "No active organization." })}
        </div>
      </div>
    );
  }

  // Traducción de filtro sin tocar valores internos:
  const labelForEstado = (v) => {
    if (v === "todos") return t("asignaciones.filters.status.todos", { defaultValue: "All" });
    if (v === "activa") return t("asignaciones.filters.status.activo", { defaultValue: "Active" });
    if (v === "inactiva") return t("asignaciones.filters.status.inactivo", { defaultValue: "Inactive" });
    return v;
  };

  return (
    <div className="w-full">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">
          {t("asignaciones.title", { defaultValue: "Assignments" })}
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          {t("asignaciones.currentOrgLabel", { defaultValue: "Current organization" })}:{" "}
          <span className="font-medium">{currentOrg?.name || "—"}</span>
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="font-medium">
            {t("asignaciones.filters.statusLabel", { defaultValue: "Status" })}
          </label>
          <select
            className="border rounded px-3 py-2"
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
      </div>

      <div className="mb-6 border rounded-lg bg-white shadow-sm p-4">
        <h2 className="text-lg font-semibold mb-4">
          {editingId
            ? t("asignaciones.form.editTitle", { defaultValue: "Edit assignment" })
            : t("asignaciones.form.newTitle", { defaultValue: "New assignment" })}
        </h2>

        {loading && (
          <p className="text-sm text-gray-500 mb-3">
            {t("asignaciones.messages.loadingData", { defaultValue: "Loading assignment data…" })}
          </p>
        )}

        {personalOptions.length === 0 && (
          <p className="text-red-600 font-semibold mb-3">
            {t("asignaciones.messages.noPersonal", {
              defaultValue: "There is no active personnel in this organization. Create or reactivate at least one person.",
            })}
          </p>
        )}

        {activityOptions.length === 0 && (
          <p className="text-red-600 font-semibold mb-3">
            {t("asignaciones.messages.noActivities", {
              defaultValue: "There are no activities created. Create at least one activity to assign.",
            })}
          </p>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Persona */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">
              {t("asignaciones.form.personLabel", { defaultValue: "Person" })}
            </label>
            <select
              className="border rounded px-3 py-2"
              value={selectedPersonalId}
              onChange={(e) => setSelectedPersonalId(e.target.value)}
              required
            >
              <option value="">
                {t("asignaciones.form.personPlaceholder", { defaultValue: "Select a person" })}
              </option>
              {personalOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.nombre || ""} ${p.apellido || ""}`.trim()}
                </option>
              ))}
            </select>
          </div>

          {/* Geocerca */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">
              {t("asignaciones.form.geofenceLabel", { defaultValue: "Geofence" })}
            </label>
            <select
              className="border rounded px-3 py-2"
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
              required
            >
              <option value="">
                {t("asignaciones.form.geofencePlaceholder", { defaultValue: "Select a geofence" })}
              </option>
              {geocercaOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre || g.id}
                </option>
              ))}
            </select>
          </div>

          {/* Actividad */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">
              {t("asignaciones.form.activityLabel", { defaultValue: "Activity" })}
            </label>
            <select
              className="border rounded px-3 py-2"
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
              required
              disabled={activityOptions.length === 0}
            >
              <option value="">
                {t("asignaciones.form.activityPlaceholder", { defaultValue: "Select an activity" })}
              </option>
              {activityOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.id}
                </option>
              ))}
            </select>
          </div>

          {/* Inicio */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">
              {t("asignaciones.form.startLabel", { defaultValue: "Start date/time" })}
            </label>
            <input
              type="datetime-local"
              className="border rounded px-3 py-2"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>

          {/* Fin */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">
              {t("asignaciones.form.endLabel", { defaultValue: "End date/time" })}
            </label>
            <input
              type="datetime-local"
              className="border rounded px-3 py-2"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>

          {/* Estado */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">
              {t("asignaciones.form.statusLabel", { defaultValue: "Status" })}
            </label>
            <select
              className="border rounded px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="activa">
                {t("asignaciones.form.statusActive", { defaultValue: "Active" })}
              </option>
              <option value="inactiva">
                {t("asignaciones.form.statusInactive", { defaultValue: "Inactive" })}
              </option>
            </select>
          </div>

          {/* Frecuencia */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">
              {t("asignaciones.form.frequencyLabel", { defaultValue: "Frequency (min)" })}
            </label>
            <input
              type="number"
              className="border rounded px-3 py-2"
              min={5}
              value={frecuenciaEnvioMin}
              onChange={(e) => setFrecuenciaEnvioMin(Number(e.target.value) || 5)}
            />
          </div>

          <div className="md:col-span-2 flex flex-wrap gap-3 mt-2">
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
              disabled={loading || activityOptions.length === 0 || personalOptions.length === 0}
            >
              {editingId
                ? t("asignaciones.form.updateButton", { defaultValue: "Update assignment" })
                : t("asignaciones.form.saveButton", { defaultValue: "Save assignment" })}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="border px-4 py-2 rounded"
              >
                {t("asignaciones.form.cancelEditButton", { defaultValue: "Cancel editing" })}
              </button>
            )}
          </div>

          <div className="md:col-span-2">
            {successMessage && <p className="text-green-600 font-semibold">{successMessage}</p>}
            {error && <p className="text-red-600 font-semibold">{error}</p>}
          </div>
        </form>
      </div>

      <AsignacionesTable
        asignaciones={filteredAsignaciones}
        loading={loading}
        onEdit={(a) => {
          setEditingId(a.id);
          setSelectedPersonalId(a.personal_id || "");
          setSelectedGeocercaId(a.geocerca_id || "");
          setSelectedActivityId(a.activity_id || "");
          setStartTime(a.start_time?.slice(0, 16) || "");
          setEndTime(a.end_time?.slice(0, 16) || "");
          setFrecuenciaEnvioMin(Math.max(5, Math.round((a.frecuencia_envio_sec || 300) / 60)));
          setStatus(a.status || "activa");
          setError(null);
          setSuccessMessage(null);
        }}
        onDelete={async (id) => {
          const ok = window.confirm(
            t("asignaciones.messages.confirmDelete", { defaultValue: "Are you sure you want to delete this assignment?" })
          );
          if (!ok) return;

          const resp = await deleteAsignacion(id);
          if (resp.error) {
            setError(
              t("asignaciones.messages.deleteError", { defaultValue: "Could not delete the assignment." })
            );
          } else {
            setSuccessMessage(
              t("asignaciones.banner.deleted", { defaultValue: "Assignment deleted." })
            );
            loadAll();
          }
        }}
      />
    </div>
  );
}
