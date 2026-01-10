// src/pages/AsignacionesPage.jsx
// VERSION CANONICA: usa org_people_id y activity_id OBLIGATORIO
// ✅ Alineado a AuthContext nuevo: espera authReady + orgsReady, usa currentOrg.id como fuente única

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
import { useAuth } from "../context/AuthContext";

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

  // ✅ Nuevo contrato AuthContext
  const { authReady, orgsReady, currentOrg } = useAuth();
  const orgId = currentOrg?.id || null;

  const [asignaciones, setAsignaciones] = useState([]);
  const [loadingAsignaciones, setLoadingAsignaciones] = useState(true);
  const [loadingCatalogos, setLoadingCatalogos] = useState(true);

  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [estadoFilter, setEstadoFilter] = useState("todos");

  // FORM
  const [selectedOrgPeopleId, setSelectedOrgPeopleId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState(""); // ✅ OBLIGATORIO
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [frecuenciaEnvioMin, setFrecuenciaEnvioMin] = useState(5);
  const [status, setStatus] = useState("activa");
  const [editingId, setEditingId] = useState(null);

  // CATALOGOS
  const [peopleOptions, setPeopleOptions] = useState([]);
  const [geocercaOptions, setGeocercaOptions] = useState([]);
  const [activityOptions, setActivityOptions] = useState([]);

  async function loadAsignaciones() {
    setLoadingAsignaciones(true);
    setError(null);

    try {
      // ⚠️ No asumo firma del API: si internamente filtra por org vía RLS/vistas, OK.
      // Si tu API acepta orgId, en el siguiente paso la ajustamos con el archivo asignacionesApi.jsx
      const { data, error } = await getAsignaciones();

      if (error) {
        console.error("[AsignacionesPage] getAsignaciones error:", error);
        setError(t("asignaciones.messages.loadError"));
        setAsignaciones([]);
      } else {
        setAsignaciones(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("[AsignacionesPage] loadAsignaciones exception:", e);
      setError(t("asignaciones.messages.loadError"));
      setAsignaciones([]);
    } finally {
      setLoadingAsignaciones(false);
    }
  }

  async function loadActivitiesWithFallback(activeOrgId) {
    if (!activeOrgId) return [];

    // ✅ Intento 1 (recomendado): org_id
    const q1 = await supabase
      .from("activities")
      .select("id,name,org_id")
      .eq("org_id", activeOrgId)
      .order("name", { ascending: true });

    if (!q1.error && Array.isArray(q1.data) && q1.data.length > 0) return q1.data;

    // 🟡 Fallback legacy: tenant_id (solo por compatibilidad con datos antiguos)
    const q2 = await supabase
      .from("activities")
      .select("id,name,tenant_id")
      .eq("tenant_id", activeOrgId)
      .order("name", { ascending: true });

    if (q2.error) throw q2.error;
    return q2.data || [];
  }

  async function loadCatalogos() {
    if (!orgId) return;

    setLoadingCatalogos(true);
    setError(null);

    try {
      const [peopleRes, geocercasRes, activities] = await Promise.all([
        supabase
          .from("v_org_people_ui")
          .select("org_people_id, nombre, apellido, is_deleted, org_id")
          .eq("org_id", orgId)
          .eq("is_deleted", false)
          .order("nombre", { ascending: true }),

        supabase
          .from("geocercas")
          .select("id,nombre,org_id")
          .eq("org_id", orgId)
          .order("nombre", { ascending: true }),

        loadActivitiesWithFallback(orgId),
      ]);

      if (peopleRes.error) throw peopleRes.error;
      if (geocercasRes.error) throw geocercasRes.error;

      setPeopleOptions(peopleRes.data || []);
      setGeocercaOptions(geocercasRes.data || []);
      setActivityOptions(activities || []);

      // Si solo hay 1 activity, autoseleccionar (reduce fricción)
      if (!selectedActivityId && activities && activities.length === 1) {
        setSelectedActivityId(activities[0].id);
      }
    } catch (e) {
      console.error("[AsignacionesPage] loadCatalogos error:", e);
      setError(t("asignaciones.messages.catalogError"));
      setPeopleOptions([]);
      setGeocercaOptions([]);
      setActivityOptions([]);
    } finally {
      setLoadingCatalogos(false);
    }
  }

  // ✅ Solo dispara cargas cuando el contexto está realmente listo
  useEffect(() => {
    if (!authReady || !orgsReady || !orgId) return;

    loadAsignaciones();
    loadCatalogos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, orgsReady, orgId]);

  const filteredAsignaciones = useMemo(() => {
    let rows = Array.isArray(asignaciones) ? asignaciones : [];
    if (estadoFilter !== "todos") rows = rows.filter((a) => a.status === estadoFilter);
    if (selectedOrgPeopleId) rows = rows.filter((a) => a.org_people_id === selectedOrgPeopleId);
    return rows;
  }, [asignaciones, estadoFilter, selectedOrgPeopleId]);

  function resetForm() {
    setSelectedOrgPeopleId("");
    setSelectedGeocercaId("");
    // NO limpiamos selectedActivityId para mantenerlo como default
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
      setError(t("asignaciones.messages.noOrg") || "No hay organización activa.");
      return;
    }

    if (!selectedOrgPeopleId || !selectedGeocercaId) {
      setError(t("asignaciones.messages.selectPersonAndFence"));
      return;
    }

    // ✅ activity_id obligatorio (por constraint)
    if (!selectedActivityId) {
      setError("Debes seleccionar una Actividad (activity_id es obligatorio en la base de datos).");
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

    const payload = {
      org_id: orgId,
      org_people_id: selectedOrgPeopleId,
      geocerca_id: selectedGeocercaId,
      activity_id: selectedActivityId, // ✅ SIEMPRE
      start_time: localDateTimeToISO(startTime),
      end_time: localDateTimeToISO(endTime),
      frecuencia_envio_sec: freqMin * 60,
      status,
    };

    try {
      const resp = editingId
        ? await updateAsignacion(editingId, payload)
        : await createAsignacion(payload);

      if (resp?.error) {
        console.error("[AsignacionesPage] save error:", resp.error);
        setError(resp.error.message || "Error guardando asignación.");
        return;
      }

      setSuccessMessage(
        editingId
          ? t("asignaciones.messages.updateSuccess")
          : t("asignaciones.messages.createSuccess")
      );

      resetForm();
      await loadAsignaciones();
    } catch (e) {
      console.error("[AsignacionesPage] handleSubmit exception:", e);
      setError(e?.message || "Error guardando asignación.");
    }
  }

  // ------------------------------
  // Estados de carga correctos (nuevo contrato)
  // ------------------------------
  if (!authReady || !orgsReady) {
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
          {t("asignaciones.messages.noOrg") || "No hay organización activa."}
        </div>
      </div>
    );
  }

  // ------------------------------
  // Render normal
  // ------------------------------
  return (
    <div className="w-full">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">{t("asignaciones.title")}</h1>
        <p className="text-xs text-gray-500 mt-1">
          {t("asignaciones.currentOrgLabel", "Organización actual")}:{" "}
          <span className="font-medium">{currentOrg?.name || "—"}</span>
        </p>
      </div>

      {/* Filtro estado */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="font-medium">{t("asignaciones.filters.statusLabel")}</label>
          <select
            className="border rounded px-3 py-2"
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value)}
          >
            {ESTADOS.map((v) => (
              <option key={v} value={v}>
                {t(`asignaciones.filters.status.${v}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Form */}
      <div className="mb-6 border rounded-lg bg-white shadow-sm p-4">
        <h2 className="text-lg font-semibold mb-4">
          {editingId ? t("asignaciones.form.editTitle") : t("asignaciones.form.newTitle")}
        </h2>

        {(loadingCatalogos || loadingAsignaciones) && (
          <p className="text-sm text-gray-500 mb-3">{t("asignaciones.messages.loadingData")}</p>
        )}

        {/* Si no hay actividades, bloquea creación */}
        {activityOptions.length === 0 && (
          <p className="text-red-600 font-semibold mb-3">
            No hay actividades creadas para esta organización. Crea al menos una Actividad para poder asignar.
          </p>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Persona */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.personLabel")}</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedOrgPeopleId}
              onChange={(e) => setSelectedOrgPeopleId(e.target.value)}
              required
            >
              <option value="">{t("asignaciones.form.personPlaceholder")}</option>
              {peopleOptions.map((p) => (
                <option key={p.org_people_id} value={p.org_people_id}>
                  {`${p.nombre || ""} ${p.apellido || ""}`.trim()}
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

          {/* Actividad (OBLIGATORIA) */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.activityLabel")}</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
              required
              disabled={activityOptions.length === 0}
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
            <select
              className="border rounded px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
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
              disabled={loadingCatalogos || loadingAsignaciones || activityOptions.length === 0}
            >
              {editingId ? t("asignaciones.form.updateButton") : t("asignaciones.form.saveButton")}
            </button>

            {editingId && (
              <button type="button" onClick={resetForm} className="border px-4 py-2 rounded">
                {t("asignaciones.form.cancelEditButton")}
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
        loading={loadingAsignaciones}
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
          const ok = window.confirm(t("asignaciones.messages.confirmDelete"));
          if (!ok) return;
          const { error } = await deleteAsignacion(id);
          if (error) setError(t("asignaciones.messages.deleteError"));
          else {
            setSuccessMessage(t("asignaciones.messages.deleteSuccess"));
            loadAsignaciones();
          }
        }}
      />
    </div>
  );
}
