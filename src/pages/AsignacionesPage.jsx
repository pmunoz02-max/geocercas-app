// src/pages/AsignacionesPage.jsx
// CANONICO: respeta AuthContext (ready/currentOrg) y usa SOLO /api/asignaciones

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

const ESTADOS = ["todos", "activa", "inactiva"];

export default function AsignacionesPage() {
  const { t } = useTranslation();

  // ✅ Contrato REAL de tu AuthContext
  const { ready, currentOrg } = useAuth(); // :contentReference[oaicite:4]{index=4}
  const orgId = currentOrg?.id || null;

  const [asignaciones, setAsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [estadoFilter, setEstadoFilter] = useState("todos");

  // FORM
  const [selectedOrgPeopleId, setSelectedOrgPeopleId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [frecuenciaEnvioMin, setFrecuenciaEnvioMin] = useState(5);
  const [status, setStatus] = useState("activa");
  const [editingId, setEditingId] = useState(null);

  // CATALOGOS
  const [peopleOptions, setPeopleOptions] = useState([]);
  const [geocercaOptions, setGeocercaOptions] = useState([]);
  const [activityOptions, setActivityOptions] = useState([]);

  async function loadAll() {
    setLoading(true);
    setError(null);

    const { data, error } = await getAsignacionesBundle();
    if (error) {
      console.error("[AsignacionesPage] getAsignacionesBundle error:", error);
      setError(error.message || t("asignaciones.messages.loadError"));
      setAsignaciones([]);
      setPeopleOptions([]);
      setGeocercaOptions([]);
      setActivityOptions([]);
      setLoading(false);
      return;
    }

    const bundle = data || {};
    const rows = bundle.asignaciones || [];
    const catalogs = bundle.catalogs || {};

    setAsignaciones(Array.isArray(rows) ? rows : []);
    setPeopleOptions(Array.isArray(catalogs.people) ? catalogs.people : []);
    setGeocercaOptions(Array.isArray(catalogs.geocercas) ? catalogs.geocercas : []);
    setActivityOptions(Array.isArray(catalogs.activities) ? catalogs.activities : []);

    if (!selectedActivityId && Array.isArray(catalogs.activities) && catalogs.activities.length === 1) {
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
    if (estadoFilter !== "todos") rows = rows.filter((a) => (a.status || a.estado) === estadoFilter);
    if (selectedOrgPeopleId) rows = rows.filter((a) => a.org_people_id === selectedOrgPeopleId);
    return rows;
  }, [asignaciones, estadoFilter, selectedOrgPeopleId]);

  function resetForm() {
    setSelectedOrgPeopleId("");
    setSelectedGeocercaId("");
    // no limpiamos selectedActivityId para mantener default
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
      setError(t("asignaciones.messages.noOrg", "No hay organización activa."));
      return;
    }

    if (!selectedOrgPeopleId || !selectedGeocercaId) {
      setError(t("asignaciones.messages.selectPersonAndFence", "Selecciona persona y geocerca."));
      return;
    }

    if (!selectedActivityId) {
      setError("Debes seleccionar una Actividad (activity_id es obligatorio).");
      return;
    }

    if (!startTime || !endTime) {
      setError(t("asignaciones.messages.selectDates", "Selecciona inicio y fin."));
      return;
    }

    const freqMin = Number(frecuenciaEnvioMin) || 0;
    if (freqMin < 5) {
      setError(t("asignaciones.messages.frequencyTooLow", "Frecuencia mínima: 5 minutos."));
      return;
    }

    const payload = {
      // org_id NO es fuente de verdad: el backend lo fuerza desde contexto
      org_people_id: selectedOrgPeopleId,
      geocerca_id: selectedGeocercaId,
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
      setError(resp.error.message || "Error guardando asignación.");
      return;
    }

    setSuccessMessage(
      editingId
        ? t("asignaciones.messages.updateSuccess", "Asignación actualizada.")
        : t("asignaciones.messages.createSuccess", "Asignación creada.")
    );

    resetForm();
    await loadAll();
  }

  // ---- estados de carga
  if (!ready) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          {t("asignaciones.messages.loadingAuth", "Cargando tu sesión y organización actual…")}
        </div>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("asignaciones.messages.noOrg", "No hay organización activa.")}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">{t("asignaciones.title", "Asignaciones")}</h1>
        <p className="text-xs text-gray-500 mt-1">
          {t("asignaciones.currentOrgLabel", "Organización actual")}:{" "}
          <span className="font-medium">{currentOrg?.name || "—"}</span>
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="font-medium">{t("asignaciones.filters.statusLabel", "Estado")}</label>
          <select
            className="border rounded px-3 py-2"
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value)}
          >
            {ESTADOS.map((v) => (
              <option key={v} value={v}>
                {t(`asignaciones.filters.status.${v}`, v)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-6 border rounded-lg bg-white shadow-sm p-4">
        <h2 className="text-lg font-semibold mb-4">
          {editingId ? t("asignaciones.form.editTitle", "Editar asignación") : t("asignaciones.form.newTitle", "Nueva asignación")}
        </h2>

        {loading && (
          <p className="text-sm text-gray-500 mb-3">{t("asignaciones.messages.loadingData", "Cargando datos...")}</p>
        )}

        {activityOptions.length === 0 && (
          <p className="text-red-600 font-semibold mb-3">
            No hay actividades creadas para esta organización. Crea al menos una Actividad para poder asignar.
          </p>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Persona */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.personLabel", "Persona")}</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedOrgPeopleId}
              onChange={(e) => setSelectedOrgPeopleId(e.target.value)}
              required
            >
              <option value="">{t("asignaciones.form.personPlaceholder", "Selecciona una persona")}</option>
              {peopleOptions.map((p) => (
                <option key={p.org_people_id} value={p.org_people_id}>
                  {`${p.nombre || ""} ${p.apellido || ""}`.trim()}
                </option>
              ))}
            </select>
          </div>

          {/* Geocerca */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.geofenceLabel", "Geocerca")}</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
              required
            >
              <option value="">{t("asignaciones.form.geofencePlaceholder", "Selecciona una geocerca")}</option>
              {geocercaOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre || g.id}
                </option>
              ))}
            </select>
          </div>

          {/* Actividad */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.activityLabel", "Actividad")}</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
              required
              disabled={activityOptions.length === 0}
            >
              <option value="">{t("asignaciones.form.activityPlaceholder", "Selecciona una actividad")}</option>
              {activityOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.id}
                </option>
              ))}
            </select>
          </div>

          {/* Inicio */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.startLabel", "Inicio")}</label>
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
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.endLabel", "Fin")}</label>
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
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.statusLabel", "Estado")}</label>
            <select className="border rounded px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="activa">{t("asignaciones.form.statusActive", "Activa")}</option>
              <option value="inactiva">{t("asignaciones.form.statusInactive", "Inactiva")}</option>
            </select>
          </div>

          {/* Frecuencia */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.frequencyLabel", "Frecuencia (min)")}</label>
            <input
              type="number"
              className="border rounded px-3 py-2"
              min={5}
              value={frecuenciaEnvioMin}
              onChange={(e) => setFrecuenciaEnvioMin(Number(e.target.value) || 5)}
            />
          </div>

          {/* Botones */}
          <div className="md:col-span-2 flex flex-wrap gap-3 mt-2">
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
              disabled={loading || activityOptions.length === 0}
            >
              {editingId ? t("asignaciones.form.updateButton", "Actualizar") : t("asignaciones.form.saveButton", "Guardar")}
            </button>

            {editingId && (
              <button type="button" onClick={resetForm} className="border px-4 py-2 rounded">
                {t("asignaciones.form.cancelEditButton", "Cancelar")}
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
          setSelectedOrgPeopleId(a.org_people_id || "");
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
          const ok = window.confirm(t("asignaciones.messages.confirmDelete", "¿Eliminar asignación?"));
          if (!ok) return;
          const resp = await deleteAsignacion(id);
          if (resp.error) setError(t("asignaciones.messages.deleteError", "Error eliminando."));
          else {
            setSuccessMessage(t("asignaciones.messages.deleteSuccess", "Asignación eliminada."));
            loadAll();
          }
        }}
      />
    </div>
  );
}
