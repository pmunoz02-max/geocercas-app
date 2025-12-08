// src/pages/AsignacionesPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { supabase } from "../supabaseClient";
import {
  getAsignaciones,
  createAsignacion,
  updateAsignacion,
  deleteAsignacion,
} from "../lib/asignacionesApi";
import AsignacionesTable from "../components/asignaciones/AsignacionesTable";
import { useAuth } from "../contexts/AuthContext";

// Helper para asegurar que el datetime-local se guarda con zona horaria local
function localToISOWithTZ(localDateTime) {
  if (!localDateTime) return null;

  const date = new Date(localDateTime);

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes()
  ).toISOString();
}

// Estados posibles para el filtro
const ESTADOS = ["todos", "activa", "inactiva"];

export default function AsignacionesPage() {
  const { t } = useTranslation();
  const { currentOrg } = useAuth();

  // ---------------------------------------------
  // Estado general
  // ---------------------------------------------
  const [asignaciones, setAsignaciones] = useState([]);
  const [loadingAsignaciones, setLoadingAsignaciones] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Filtros
  const [estadoFilter, setEstadoFilter] = useState("todos");

  // Formulario
  const [selectedPersonalId, setSelectedPersonalId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  // Frecuencia en MINUTOS (UI) -> se convierte a segundos para la BD
  const [frecuenciaEnvioMin, setFrecuenciaEnvioMin] = useState(5);
  const [status, setStatus] = useState("activa");
  const [editingId, setEditingId] = useState(null);

  // Catálogos para dropdowns
  const [personalOptions, setPersonalOptions] = useState([]);
  const [geocercaOptions, setGeocercaOptions] = useState([]);
  const [activityOptions, setActivityOptions] = useState([]);
  const [loadingCatalogos, setLoadingCatalogos] = useState(true);

  // ---------------------------------------------
  // Carga de asignaciones
  // ---------------------------------------------
  const loadAsignaciones = async () => {
    setLoadingAsignaciones(true);
    setError(null);

    const { data, error } = await getAsignaciones();
    if (error) {
      console.error("[AsignacionesPage] Error al cargar asignaciones:", error);
      setError(t("asignaciones.messages.loadError"));
    } else {
      setAsignaciones(data || []);
    }
    setLoadingAsignaciones(false);
  };

  // ---------------------------------------------
  // Carga de catálogos (personal, geocercas, actividades)
  // ---------------------------------------------
  const loadCatalogos = async () => {
    setLoadingCatalogos(true);
    setError(null);

    try {
      const [
        { data: personalData, error: personalError },
        { data: geocercasData, error: geocercasError },
        { data: activitiesData, error: activitiesError },
      ] = await Promise.all([
        // PERSONAL: aquí SÍ existe is_deleted
        supabase
          .from("personal")
          .select("id, nombre, apellido, email, is_deleted")
          .eq("is_deleted", false)
          .order("nombre", { ascending: true }),

        // GEOCERCAS: sin is_deleted
        supabase
          .from("geocercas")
          .select("id, nombre")
          .order("nombre", { ascending: true }),

        // ACTIVITIES: usamos name (en inglés)
        supabase.from("activities").select("id, name").order("name", {
          ascending: true,
        }),
      ]);

      if (personalError) throw personalError;
      if (geocercasError) throw geocercasError;
      if (activitiesError) throw activitiesError;

      setPersonalOptions(
        (personalData || []).filter((p) => p.is_deleted === false)
      );
      setGeocercaOptions(geocercasData || []);
      setActivityOptions(activitiesData || []);
    } catch (err) {
      console.error("[AsignacionesPage] Error cargando catálogos:", err);
      setError(t("asignaciones.messages.catalogError"));
    } finally {
      setLoadingCatalogos(false);
    }
  };

  // ---------------------------------------------
  // useEffect inicial
  // ---------------------------------------------
  useEffect(() => {
    loadAsignaciones();
    loadCatalogos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------
  // Asignaciones filtradas por estado y PERSONA
  // ---------------------------------------------
  const filteredAsignaciones = useMemo(() => {
    let result = asignaciones || [];

    if (estadoFilter !== "todos") {
      result = result.filter((a) => a.status === estadoFilter);
    }

    if (selectedPersonalId) {
      result = result.filter((a) => a.personal_id === selectedPersonalId);
    }

    return result;
  }, [asignaciones, estadoFilter, selectedPersonalId]);

  // ---------------------------------------------
  // Manejo de formulario (crear / editar)
  // ---------------------------------------------
  const resetForm = () => {
    setSelectedGeocercaId("");
    setSelectedActivityId("");
    setStartTime("");
    setEndTime("");
    setFrecuenciaEnvioMin(5);
    setStatus("activa");
    setEditingId(null);
    setError(null);
    // NO limpiamos selectedPersonalId para que la tabla siga filtrando
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!currentOrg?.id) {
      // Mensaje directo para no depender de traducción nueva
      setError("No hay organización seleccionada. Cierre sesión y vuelva a entrar.");
      return;
    }

    if (!selectedPersonalId || !selectedGeocercaId) {
      setError(t("asignaciones.messages.selectPersonAndFence"));
      return;
    }
    if (!startTime || !endTime) {
      setError(t("asignaciones.messages.selectDates"));
      return;
    }

    const freqMin = Number(frecuenciaEnvioMin) || 0;
    if (freqMin < 5) {
      setError(t("asignaciones.messages.frequencyTooLow"));
      return;
    }

    const freqSec = freqMin * 60;
    if (freqSec <= 0 || freqSec > 12 * 3600) {
      setError(t("asignaciones.messages.frequencyInvalidRange"));
      return;
    }

    const payload = {
      personal_id: selectedPersonalId,
      geocerca_id: selectedGeocercaId,
      activity_id: selectedActivityId || null,
      start_time: localToISOWithTZ(startTime),
      end_time: localToISOWithTZ(endTime),
      frecuencia_envio_sec: freqSec,
      status,
      org_id: currentOrg.id, // <-- clave para multi-tenant
    };

    try {
      if (editingId) {
        // UPDATE
        const { data: updatedRows, error: updateError } = await updateAsignacion(
          editingId,
          payload
        );

        if (updateError) {
          console.error(
            "[AsignacionesPage] updateAsignacion error:",
            updateError
          );
          if (
            updateError.message &&
            updateError.message.includes("asignaciones_personal_no_overlap")
          ) {
            setError(t("asignaciones.messages.overlapError"));
          } else {
            setError(
              updateError.message ||
                t("asignaciones.messages.updateGenericError")
            );
          }
          return;
        }

        if (updatedRows && updatedRows.length > 0) {
          setAsignaciones((prev) =>
            prev.map((a) => (a.id === editingId ? updatedRows[0] : a))
          );
        }

        setSuccessMessage(t("asignaciones.messages.updateSuccess"));
      } else {
        // INSERT
        const {
          data: insertedRows,
          error: insertError,
        } = await createAsignacion(payload);

        if (insertError) {
          console.error(
            "[AsignacionesPage] createAsignacion error:",
            insertError
          );
          if (
            insertError.message &&
            insertError.message.includes("asignaciones_personal_no_overlap")
          ) {
            setError(t("asignaciones.messages.overlapError"));
          } else {
            setError(
              insertError.message ||
                t("asignaciones.messages.createGenericError")
            );
          }
          return;
        }

        if (insertedRows && insertedRows.length > 0) {
          setAsignaciones((prev) => [...prev, ...insertedRows]);
        }

        setSuccessMessage(t("asignaciones.messages.createSuccess"));
      }

      resetForm();
    } catch (err) {
      console.error("[AsignacionesPage] handleSubmit error general:", err);
      setError(t("asignaciones.messages.saveGenericError"));
    }
  };

  // ---------------------------------------------
  // Editar / Eliminar
  // ---------------------------------------------
  const handleEdit = (asignacion) => {
    setEditingId(asignacion.id);
    setSelectedPersonalId(asignacion.personal_id || "");
    setSelectedGeocercaId(asignacion.geocerca_id || "");
    setSelectedActivityId(asignacion.activity_id || "");
    setStartTime(asignacion.start_time?.slice(0, 16) || "");
    setEndTime(asignacion.end_time?.slice(0, 16) || "");
    const freqSec = asignacion.frecuencia_envio_sec || 300;
    setFrecuenciaEnvioMin(Math.max(5, Math.round(freqSec / 60)));
    setStatus(asignacion.status || "activa");
    setError(null);
    setSuccessMessage(null);
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm(t("asignaciones.messages.confirmDelete"));
    if (!confirmed) return;

    const { error: deleteError } = await deleteAsignacion(id);
    if (deleteError) {
      console.error("[AsignacionesPage] delete error:", deleteError);
      setError(t("asignaciones.messages.deleteError"));
      setSuccessMessage(null);
      return;
    }

    // Eliminación instantánea en la UI
    setAsignaciones((prev) => prev.filter((a) => a.id !== id));

    setSuccessMessage(t("asignaciones.messages.deleteSuccess"));
    setError(null);
  };

  // ---------------------------------------------
  // REFRESCAR: limpia filtros y recarga
  // ---------------------------------------------
  const handleRefresh = async () => {
    setEstadoFilter("todos");
    setSelectedPersonalId("");
    setSuccessMessage(null);
    setError(null);
    await loadAsignaciones();
  };

  // ---------------------------------------------
  // Render
  // ---------------------------------------------
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">
        {t("asignaciones.title")}
      </h1>

      {/* FILTRO POR ESTADO + BOTÓN REFRESCAR */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="font-medium">
            {t("asignaciones.filters.statusLabel")}
          </label>
          <select
            className="border rounded px-3 py-2"
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value)}
          >
            {ESTADOS.map((value) => (
              <option key={value} value={value}>
                {t(`asignaciones.filters.status.${value}`)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={loadingAsignaciones}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingAsignaciones
            ? t("asignaciones.filters.refreshLoading")
            : t("asignaciones.filters.refresh")}
        </button>
      </div>

      {/* FORMULARIO NUEVA/EDITAR ASIGNACIÓN */}
      <div className="mb-6 border rounded-lg bg-white shadow-sm p-4">
        <h2 className="text-lg font-semibold mb-4">
          {editingId
            ? t("asignaciones.form.editTitle")
            : t("asignaciones.form.newTitle")}
        </h2>

        {(loadingCatalogos || loadingAsignaciones) && (
          <p className="text-sm text-gray-500 mb-3">
            {t("asignaciones.messages.loadingData")}
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {/* Persona */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">
              {t("asignaciones.form.personLabel")}
            </label>
            <select
              className="border rounded px-3 py-2"
              value={selectedPersonalId}
              onChange={(e) => setSelectedPersonalId(e.target.value)}
              required
            >
              <option value="">
                {t("asignaciones.form.personPlaceholder")}
              </option>
              {personalOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.nombre || ""} ${p.apellido || ""}`.trim() ||
                    p.email ||
                    p.id}
                </option>
              ))}
            </select>
          </div>

          {/* Geocerca */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">
              {t("asignaciones.form.geofenceLabel")}
            </label>
            <select
              className="border rounded px-3 py-2"
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
              required
            >
              <option value="">
                {t("asignaciones.form.geofencePlaceholder")}
              </option>
              {geocercaOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre || g.id}
                </option>
              ))}
            </select>
          </div>

          {/* Actividad (opcional) */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">
              {t("asignaciones.form.activityLabel")}
            </label>
            <select
              className="border rounded px-3 py-2"
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
            >
              <option value="">
                {t("asignaciones.form.activityPlaceholder")}
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
              {t("asignaciones.form.startLabel")}
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
              {t("asignaciones.form.endLabel")}
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
              {t("asignaciones.form.statusLabel")}
            </label>
            <select
              className="border rounded px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="activa">
                {t("asignaciones.form.statusActive")}
              </option>
              <option value="inactiva">
                {t("asignaciones.form.statusInactive")}
              </option>
            </select>
          </div>

          {/* Frecuencia */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">
              {t("asignaciones.form.frequencyLabel")}
            </label>
            <input
              type="number"
              className="border rounded px-3 py-2"
              value={frecuenciaEnvioMin}
              min={5}
              onChange={(e) =>
                setFrecuenciaEnvioMin(Number(e.target.value) || 5)
              }
            />
          </div>
        </form>

        {/* Mensajes + botones */}
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              {editingId
                ? t("asignaciones.form.updateButton")
                : t("asignaciones.form.saveButton")}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="border px-4 py-2 rounded"
              >
                {t("asignaciones.form.cancelEditButton")}
              </button>
            )}
          </div>

          {successMessage && (
            <p className="text-green-600 font-semibold">{successMessage}</p>
          )}
          {error && <p className="text-red-600 font-semibold">{error}</p>}
        </div>
      </div>

      {/* TABLA DE ASIGNACIONES (filtrada por estado + persona) */}
      <AsignacionesTable
        asignaciones={filteredAsignaciones}
        loading={loadingAsignaciones}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
