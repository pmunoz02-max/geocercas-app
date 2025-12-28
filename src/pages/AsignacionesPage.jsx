// src/pages/AsignacionesPage.jsx
// VERSION CANONICA: usa org_people_id (NO personal_id)

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
  const [d, t] = localDateTime.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return new Date(y, m - 1, day, hh, mm, 0, 0).toISOString();
}

const ESTADOS = ["todos", "activa", "inactiva"];

export default function AsignacionesPage() {
  const { t } = useTranslation();
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id || null;

  const [asignaciones, setAsignaciones] = useState([]);
  const [loadingAsignaciones, setLoadingAsignaciones] = useState(true);
  const [loadingCatalogos, setLoadingCatalogos] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [estadoFilter, setEstadoFilter] = useState("todos");

  const [selectedOrgPeopleId, setSelectedOrgPeopleId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [frecuenciaEnvioMin, setFrecuenciaEnvioMin] = useState(5);
  const [status, setStatus] = useState("activa");
  const [editingId, setEditingId] = useState(null);

  const [peopleOptions, setPeopleOptions] = useState([]);
  const [geocercaOptions, setGeocercaOptions] = useState([]);
  const [activityOptions, setActivityOptions] = useState([]);

  async function loadAsignaciones() {
    setLoadingAsignaciones(true);
    const { data, error } = await getAsignaciones();
    if (error) {
      setError(t("asignaciones.messages.loadError"));
      setAsignaciones([]);
    } else {
      setAsignaciones(data || []);
    }
    setLoadingAsignaciones(false);
  }

  async function loadCatalogos() {
    if (!orgId) return;
    setLoadingCatalogos(true);
    try {
      const [{ data: people }, { data: geocercas }, { data: activities }] =
        await Promise.all([
          supabase
            .from("v_org_people_ui")
            .select("org_people_id, nombre, apellido")
            .eq("org_id", orgId)
            .eq("is_deleted", false)
            .order("nombre"),
          supabase.from("geocercas").select("id,nombre").eq("org_id", orgId),
          supabase.from("activities").select("id,name").eq("tenant_id", orgId),
        ]);

      setPeopleOptions(people || []);
      setGeocercaOptions(geocercas || []);
      setActivityOptions(activities || []);
    } catch (e) {
      setError(t("asignaciones.messages.catalogError"));
    }
    setLoadingCatalogos(false);
  }

  useEffect(() => {
    if (!orgId) return;
    loadAsignaciones();
    loadCatalogos();
    // eslint-disable-next-line
  }, [orgId]);

  const filteredAsignaciones = useMemo(() => {
    let rows = asignaciones;
    if (estadoFilter !== "todos") {
      rows = rows.filter((a) => a.status === estadoFilter);
    }
    if (selectedOrgPeopleId) {
      rows = rows.filter((a) => a.org_people_id === selectedOrgPeopleId);
    }
    return rows;
  }, [asignaciones, estadoFilter, selectedOrgPeopleId]);

  function resetForm() {
    setSelectedOrgPeopleId("");
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

    if (!selectedOrgPeopleId || !selectedGeocercaId) {
      setError(t("asignaciones.messages.selectPersonAndFence"));
      return;
    }

    const payload = {
      org_id: orgId,
      org_people_id: selectedOrgPeopleId,
      geocerca_id: selectedGeocercaId,
      activity_id: selectedActivityId || null,
      start_time: localDateTimeToISO(startTime),
      end_time: localDateTimeToISO(endTime),
      frecuencia_envio_sec: frecuenciaEnvioMin * 60,
      status,
    };

    const resp = editingId
      ? await updateAsignacion(editingId, payload)
      : await createAsignacion(payload);

    if (resp.error) {
      setError(resp.error.message);
      return;
    }

    setSuccessMessage(
      editingId
        ? t("asignaciones.messages.updateSuccess")
        : t("asignaciones.messages.createSuccess")
    );
    resetForm();
    loadAsignaciones();
  }

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold mb-4">{t("asignaciones.title")}</h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label>{t("asignaciones.form.personLabel")}</label>
          <select
            value={selectedOrgPeopleId}
            onChange={(e) => setSelectedOrgPeopleId(e.target.value)}
            required
          >
            <option value="">{t("asignaciones.form.personPlaceholder")}</option>
            {peopleOptions.map((p) => (
              <option key={p.org_people_id} value={p.org_people_id}>
                {`${p.nombre || ""} ${p.apellido || ""}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>{t("asignaciones.form.geofenceLabel")}</label>
          <select
            value={selectedGeocercaId}
            onChange={(e) => setSelectedGeocercaId(e.target.value)}
            required
          >
            <option value="">{t("asignaciones.form.geofencePlaceholder")}</option>
            {geocercaOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>{t("asignaciones.form.startLabel")}</label>
          <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        </div>

        <div>
          <label>{t("asignaciones.form.endLabel")}</label>
          <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
        </div>

        <div>
          <label>{t("asignaciones.form.frequencyLabel")}</label>
          <input
            type="number"
            min={5}
            value={frecuenciaEnvioMin}
            onChange={(e) => setFrecuenciaEnvioMin(Number(e.target.value))}
          />
        </div>

        <div>
          <label>{t("asignaciones.form.statusLabel")}</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="activa">{t("asignaciones.form.statusActive")}</option>
            <option value="inactiva">{t("asignaciones.form.statusInactive")}</option>
          </select>
        </div>

        <button type="submit" className="md:col-span-2">
          {editingId ? t("asignaciones.form.updateButton") : t("asignaciones.form.saveButton")}
        </button>
      </form>

      <AsignacionesTable
        asignaciones={filteredAsignaciones}
        loading={loadingAsignaciones}
        onEdit={(a) => {
          setEditingId(a.id);
          setSelectedOrgPeopleId(a.org_people_id);
          setSelectedGeocercaId(a.geocerca_id);
          setSelectedActivityId(a.activity_id || "");
          setStartTime(a.start_time?.slice(0, 16));
          setEndTime(a.end_time?.slice(0, 16));
          setFrecuenciaEnvioMin(Math.round((a.frecuencia_envio_sec || 300) / 60));
          setStatus(a.status);
        }}
        onDelete={deleteAsignacion}
      />

      {error && <p className="text-red-600">{error}</p>}
      {successMessage && <p className="text-green-600">{successMessage}</p>}
    </div>
  );
}