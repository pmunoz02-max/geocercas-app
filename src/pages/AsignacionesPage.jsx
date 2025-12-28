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
import { useAuth } from "../context/AuthContext"; // ✅ 'context' (singular)

// Helper: convierte un datetime-local (YYYY-MM-DDTHH:mm) a ISO manteniendo la hora local
function localDateTimeToISO(localDateTime) {
  if (!localDateTime) return null;
  const [datePart, timePart] = String(localDateTime).split("T");
  if (!datePart || !timePart) return null;

  const [y, m, d] = datePart.split("-").map((n) => Number(n));
  const [hh, mm] = timePart.split(":").map((n) => Number(n));

  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return null;

  // Date(year, monthIndex, day, hour, minute) crea un Date en hora LOCAL
  const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  return dt.toISOString();
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
  const [selectedPersonalId, setSelectedPersonalId] = useState(""); // ✅ ahora será person_id (no org_people.id)
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

  const orgId = currentOrg?.id || null;

  // ---------------------------------------------
  // Carga de asignaciones (refresca cuando cambia org)
  // ---------------------------------------------
  const loadAsignaciones = async (activeOrgId) => {
    setLoadingAsignaciones(true);
    setError(null);

    try {
      const { data, error: apiError } = await getAsignaciones();

      if (apiError) {
        console.error("[AsignacionesPage] Error al cargar asignaciones:", apiError);
        setError(t("asignaciones.messages.loadError"));
        setAsignaciones([]);
        return;
      }

      const rows = Array.isArray(data) ? data : [];

      // Seguridad extra en frontend (no reemplaza backend/RLS):
      // si el dataset trae org_id, filtramos por la organización activa.
      const filtered =
        activeOrgId &&
        rows.length > 0 &&
        rows[0] &&
        Object.prototype.hasOwnProperty.call(rows[0], "org_id")
          ? rows.filter((r) => r.org_id === activeOrgId)
          : rows;

      setAsignaciones(filtered);
    } catch (err) {
      console.error("[AsignacionesPage] loadAsignaciones error:", err);
      setError(t("asignaciones.messages.loadError"));
      setAsignaciones([]);
    } finally {
      setLoadingAsignaciones(false);
    }
  };

  // ---------------------------------------------
  // Carga de catálogos (personal, geocercas, actividades) filtrados por org
  // ---------------------------------------------
  const loadCatalogos = async (activeOrgId) => {
    setLoadingCatalogos(true);
    setError(null);

    if (!activeOrgId) {
      // No cargamos catálogos sin org (evita “datos fantasmas” por consultas globales)
      setPersonalOptions([]);
      setGeocercaOptions([]);
      setActivityOptions([]);
      setLoadingCatalogos(false);
      return;
    }

    try {
      const [
        { data: peopleUiData, error: peopleUiError },
        { data: geocercasData, error: geocercasError },
        { data: activitiesData, error: activitiesError },
      ] = await Promise.all([
        // ✅ PERSONAL (CANÓNICO): usar vista basada en org_people + people
        supabase
          .from("v_org_people_ui")
          .select("person_id, nombre, apellido, email, telefono, vigente, org_id")
          .eq("org_id", activeOrgId)
          .eq("is_deleted", false) // si la vista la expone, perfecto; si no, el select fallará y lo veremos en consola
          .order("nombre", { ascending: true }),

        // GEOCERCAS: filtrar por org_id
        supabase
          .from("geocercas")
          .select("id, nombre, org_id")
          .eq("org_id", activeOrgId)
          .order("nombre", { ascending: true }),

        // ACTIVITIES: en tu esquema suele ser tenant_id (si es org_id, ajustamos luego)
        // Intentamos tenant_id primero; si falla, cae a org_id (sin romper la UI)
        (async () => {
          const q1 = await supabase
            .from("activities")
            .select("id, name, tenant_id")
            .eq("tenant_id", activeOrgId)
            .order("name", { ascending: true });

          if (!q1.error) return q1;

          const q2 = await supabase
            .from("activities")
            .select("id, name, org_id")
            .eq("org_id", activeOrgId)
            .order("name", { ascending: true });

          return q2;
        })(),
      ]);

      if (peopleUiError) throw peopleUiError;
      if (geocercasError) throw geocercasError;
      if (activitiesError) throw activitiesError;

      // Nota: en el select de persona usaremos person_id (porque asignaciones.personal_id apunta a la PERSONA, no al org_people)
      setPersonalOptions(Array.isArray(peopleUiData) ? peopleUiData : []);
      setGeocercaOptions(Array.isArray(geocercasData) ? geocercasData : []);
      setActivityOptions(Array.isArray(activitiesData) ? activitiesData : []);
    } catch (err) {
      console.error("[AsignacionesPage] Error cargando catálogos:", err);
      setError(t("asignaciones.messages.catalogError"));
      setPersonalOptions([]);
      setGeocercaOptions([]);
      setActivityOptions([]);
    } finally {
      setLoadingCatalogos(false);
    }
  };

  // ---------------------------------------------
  // Carga inicial y al cambiar org
  // ---------------------------------------------
  useEffect(() => {
    if (!orgId) {
      setAsignaciones([]);
      setLoadingAsignaciones(false);
      setLoadingCatalogos(false);
      return;
    }

    loadAsignaciones(orgId);
    loadCatalogos(orgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // ---------------------------------------------
  // Asignaciones filtradas por estado y PERSONA
  // ---------------------------------------------
  const filteredAsignaciones = useMemo(() => {
    let result = Array.isArray(asignaciones) ? asignaciones : [];

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

    if (!orgId) {
      setError(t("asignaciones.messages.noOrg") || "No hay organización seleccionada.");
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
      personal_id: selectedPersonalId, // ✅ person_id
      geocerca_id: selectedGeocercaId,
      activity_id: selectedActivityId || null,
      start_time: localDateTimeToISO(startTime),
      end_time: localDateTimeToISO(endTime),
      frecuencia_envio_sec: freqSec,
      status,
      org_id: orgId, // ✅ clave multi-tenant
    };

    try {
      if (editingId) {
        // UPDATE
        const { data: updatedRows, error: updateError } = await updateAsignacion(editingId, payload);

        if (updateError) {
          console.error("[AsignacionesPage] updateAsignacion error:", updateError);
          if (String(updateError.message || "").includes("asignaciones_personal_no_overlap")) {
            setError(t("asignaciones.messages.overlapError"));
          } else {
            setError(updateError.message || t("asignaciones.messages.updateGenericError"));
          }
          return;
        }

        if (Array.isArray(updatedRows) && updatedRows.length > 0) {
          setAsignaciones((prev) => prev.map((a) => (a.id === editingId ? updatedRows[0] : a)));
        } else {
          // fallback seguro
          await loadAsignaciones(orgId);
        }

        setSuccessMessage(t("asignaciones.messages.updateSuccess"));
      } else {
        // INSERT
        const { data: insertedRows, error: insertError } = await createAsignacion(payload);

        if (insertError) {
          console.error("[AsignacionesPage] createAsignacion error:", insertError);
          if (String(insertError.message || "").includes("asignaciones_personal_no_overlap")) {
            setError(t("asignaciones.messages.overlapError"));
          } else {
            setError(insertError.message || t("asignaciones.messages.createGenericError"));
          }
          return;
        }

        if (Array.isArray(insertedRows) && insertedRows.length > 0) {
          setAsignaciones((prev) => [...prev, ...insertedRows]);
        } else {
          // fallback seguro
          await loadAsignaciones(orgId);
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
    if (orgId) await loadAsignaciones(orgId);
  };

  // ---------------------------------------------
  // Render
  // ---------------------------------------------
  if (!orgId) {
    return (
      <div className="w-full">
        <h1 className="text-2xl font-bold mb-2">{t("asignaciones.title")}</h1>
        <p className="text-sm text-slate-600">
          {t("asignaciones.messages.noOrg") ||
            "No hay organización activa. Selecciona una organización o vuelve a iniciar sesión."}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold mb-4">{t("asignaciones.title")}</h1>

      {/* FILTRO POR ESTADO + BOTÓN REFRESCAR */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="font-medium">{t("asignaciones.filters.statusLabel")}</label>
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
          {editingId ? t("asignaciones.form.editTitle") : t("asignaciones.form.newTitle")}
        </h2>

        {(loadingCatalogos || loadingAsignaciones) && (
          <p className="text-sm text-gray-500 mb-3">{t("asignaciones.messages.loadingData")}</p>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Persona */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.personLabel")}</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedPersonalId}
              onChange={(e) => setSelectedPersonalId(e.target.value)}
              required
            >
              <option value="">{t("asignaciones.form.personPlaceholder")}</option>
              {personalOptions.map((p) => (
                <option key={p.person_id} value={p.person_id}>
                  {`${p.nombre || ""} ${p.apellido || ""}`.trim() || p.email || p.person_id}
                </option>
              ))}
            </select>
          </div>

          {/* Geocerca */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.geofenceLabel")}</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
              required
            >
              <option value="">{t("asignaciones.form.geofencePlaceholder")}</option>
              {geocercaOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre || g.id}
                </option>
              ))}
            </select>
          </div>

          {/* Actividad (opcional) */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.activityLabel")}</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
            >
              <option value="">{t("asignaciones.form.activityPlaceholder")}</option>
              {activityOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.id}
                </option>
              ))}
            </select>
          </div>

          {/* Inicio */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.startLabel")}</label>
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
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.endLabel")}</label>
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
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.statusLabel")}</label>
            <select className="border rounded px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="activa">{t("asignaciones.form.statusActive")}</option>
              <option value="inactiva">{t("asignaciones.form.statusInactive")}</option>
            </select>
          </div>

          {/* Frecuencia */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.frequencyLabel")}</label>
            <input
              type="number"
              className="border rounded px-3 py-2"
              value={frecuenciaEnvioMin}
              min={5}
              onChange={(e) => setFrecuenciaEnvioMin(Number(e.target.value) || 5)}
            />
          </div>

          {/* Botones */}
          <div className="md:col-span-2 flex flex-wrap gap-3 mt-2">
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              disabled={loadingCatalogos || loadingAsignaciones}
            >
              {editingId ? t("asignaciones.form.updateButton") : t("asignaciones.form.saveButton")}
            </button>

            {editingId && (
              <button type="button" onClick={resetForm} className="border px-4 py-2 rounded">
                {t("asignaciones.form.cancelEditButton")}
              </button>
            )}
          </div>

          {/* Mensajes */}
          <div className="md:col-span-2">
            {successMessage && <p className="text-green-600 font-semibold">{successMessage}</p>}
            {error && <p className="text-red-600 font-semibold">{error}</p>}
          </div>
        </form>
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