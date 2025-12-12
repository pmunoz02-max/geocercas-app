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
import { useAuth } from "../context/AuthContext";

// Helper datetime-local → ISO con TZ
function localToISOWithTZ(localDateTime) {
  if (!localDateTime) return null;
  const d = new Date(localDateTime);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes()
  ).toISOString();
}

const ESTADOS = ["todos", "activa", "inactiva"];

export default function AsignacionesPage() {
  const { t } = useTranslation();
  const { currentOrg } = useAuth();

  const [asignaciones, setAsignaciones] = useState([]);
  const [loadingAsignaciones, setLoadingAsignaciones] = useState(true);
  const [loadingCatalogos, setLoadingCatalogos] = useState(true);
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

  // -----------------------------
  // ASIGNACIONES
  // -----------------------------
  const loadAsignaciones = async () => {
    if (!currentOrg?.id) {
      setAsignaciones([]);
      setLoadingAsignaciones(false);
      return;
    }

    setLoadingAsignaciones(true);
    setError(null);

    const { data, error } = await getAsignaciones(currentOrg.id);

    if (error) {
      console.error("[Asignaciones] load error:", error);
      setError(t("asignaciones.messages.loadError"));
    } else {
      setAsignaciones(data || []);
    }
    setLoadingAsignaciones(false);
  };

  // -----------------------------
  // CATÁLOGOS (FILTRADOS POR ORG)
  // -----------------------------
  const loadCatalogos = async () => {
    if (!currentOrg?.id) {
      setPersonalOptions([]);
      setGeocercaOptions([]);
      setActivityOptions([]);
      setLoadingCatalogos(false);
      return;
    }

    setLoadingCatalogos(true);
    setError(null);

    try {
      const [
        { data: personalData, error: personalError },
        { data: geocercasData, error: geocercasError },
        { data: activitiesData, error: activitiesError },
      ] = await Promise.all([
        supabase
          .from("personal")
          .select("id, nombre, apellido, email")
          .eq("org_id", currentOrg.id)
          .eq("is_deleted", false)
          .order("nombre"),

        supabase
          .from("geocercas")
          .select("id, nombre")
          .eq("org_id", currentOrg.id)
          .order("nombre"),

        supabase
          .from("activities")
          .select("id, name")
          .eq("tenant_id", currentOrg.id)
          .eq("active", true)
          .order("name"),
      ]);

      if (personalError) throw personalError;
      if (geocercasError) throw geocercasError;
      if (activitiesError) throw activitiesError;

      setPersonalOptions(personalData || []);
      setGeocercaOptions(geocercasData || []);
      setActivityOptions(activitiesData || []);
    } catch (err) {
      console.error("[Asignaciones] catálogo error:", err);
      setError(t("asignaciones.messages.catalogError"));
    } finally {
      setLoadingCatalogos(false);
    }
  };

  // -----------------------------
  // EFFECT: ORG CAMBIA → RECARGA
  // -----------------------------
  useEffect(() => {
    loadAsignaciones();
    loadCatalogos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id]);

  // -----------------------------
  // FILTROS
  // -----------------------------
  const filteredAsignaciones = useMemo(() => {
    let r = asignaciones || [];
    if (estadoFilter !== "todos") {
      r = r.filter((a) => a.status === estadoFilter);
    }
    if (selectedPersonalId) {
      r = r.filter((a) => a.personal_id === selectedPersonalId);
    }
    return r;
  }, [asignaciones, estadoFilter, selectedPersonalId]);

  // -----------------------------
  // SUBMIT
  // -----------------------------
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!currentOrg?.id) {
      setError("No hay organización activa");
      return;
    }

    const payload = {
      personal_id: selectedPersonalId,
      geocerca_id: selectedGeocercaId,
      activity_id: selectedActivityId || null,
      start_time: localToISOWithTZ(startTime),
      end_time: localToISOWithTZ(endTime),
      frecuencia_envio_sec: frecuenciaEnvioMin * 60,
      status,
      org_id: currentOrg.id,
    };

    try {
      if (editingId) {
        await updateAsignacion(editingId, payload);
        setSuccessMessage(t("asignaciones.messages.updateSuccess"));
      } else {
        await createAsignacion(payload);
        setSuccessMessage(t("asignaciones.messages.createSuccess"));
      }
      loadAsignaciones();
      resetForm();
    } catch (err) {
      console.error(err);
      setError(t("asignaciones.messages.saveGenericError"));
    }
  };

  const resetForm = () => {
    setSelectedGeocercaId("");
    setSelectedActivityId("");
    setStartTime("");
    setEndTime("");
    setFrecuenciaEnvioMin(5);
    setStatus("activa");
    setEditingId(null);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">
        {t("asignaciones.title")}
      </h1>

      <AsignacionesTable
        asignaciones={filteredAsignaciones}
        loading={loadingAsignaciones}
      />
    </div>
  );
}
