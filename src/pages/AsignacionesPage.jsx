
import { useEffect, useMemo, useState } from "react";
import { createAsignacion, getAsignacionesBundle, updateAsignacion, toggleAsignacionStatus, deleteAsignacion } from "../lib/asignacionesApi";
import { useAuth } from "@/context/auth.js";
import AsignacionesTable from "../components/asignaciones/AsignacionesTable.jsx";

export default function AsignacionesPage() {
  const { activeOrgId } = useAuth();

  const [personas, setPersonas] = useState([]);
  const [geocercas, setGeocercas] = useState([]);
  const [actividades, setActividades] = useState([]);

  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] = useState("active");
  const [freqMin, setFreqMin] = useState(5);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!activeOrgId) return;
    loadAll();
  }, [activeOrgId]);

  async function loadAll() {
    try {
      const { data, error } = await getAsignacionesBundle(activeOrgId);

      if (error) throw new Error(error.message);

      const catalogs = data?.catalogs || {};

      // ...existing code...
      const rawPersonas = catalogs.personal || catalogs.people || [];
      const normalizedPersonas = (rawPersonas || []).map((p) => ({
        ...p,
        id: p?.id ?? p?.personal_id ?? p?.org_people_id ?? null,
        personal_id: p?.personal_id ?? p?.id ?? p?.org_people_id ?? null,
        nombre: p?.nombre ?? p?.name ?? p?.first_name ?? "",
        apellido: p?.apellido ?? p?.last_name ?? "",
        full_name:
          p?.full_name ??
          [
            p?.nombre ?? p?.name ?? p?.first_name ?? "",
            p?.apellido ?? p?.last_name ?? "",
          ]
            .filter(Boolean)
            .join(" "),
      }));
      const rawGeocercas = catalogs.geocercas || catalogs.geofences || [];
      const rawActividades = catalogs.activities || catalogs.actividades || [];
      setPersonas(normalizedPersonas);
      setGeocercas(rawGeocercas);
      setActividades(rawActividades);
      setError("");
    } catch (e) {
      console.error(e);
      setError("Error al cargar datos de asignaciones.");
    }
  }

  const personasDisponibles = useMemo(() => {
    return (personas || []).filter((p) => {
      const id = p?.id ?? p?.personal_id ?? null;
      return !!id;
    });
  }, [personas]);

  const selectedPerson = useMemo(() => {
    return (
      personasDisponibles.find(
        (p) => String(p?.id ?? p?.personal_id ?? "") === String(selectedPersonId)
      ) || null
    );
  }, [personasDisponibles, selectedPersonId]);

  const resolvedSelectedPersonId =
    selectedPerson?.id ?? selectedPerson?.personal_id ?? null;

  const selectedTrackerUserId = selectedPerson?.user_id ?? null;

  async function handleSubmit() {
    setError("");
    setSuccess("");

    if (!resolvedSelectedPersonId) {
      setError("Debe seleccionar una persona válida.");
      return;
    }

    const parsedFreqMin = Number(freqMin);

    if (!Number.isFinite(parsedFreqMin) || parsedFreqMin <= 0) {
      setError("La frecuencia debe ser mayor que 0.");
      return;
    }

    const payload = {
      personal_id: resolvedSelectedPersonId,
      org_id: activeOrgId,
      tenant_id: activeOrgId,
      geofence_id: selectedGeocercaId || null,
      geocerca_id: null,
      activity_id: selectedActivityId || null,
      start_time: startTime ? new Date(startTime).toISOString() : null,
      end_time: endTime ? new Date(endTime).toISOString() : null,
      frecuencia_envio_sec: parsedFreqMin * 60,
      status,
      ...(selectedTrackerUserId ? { tracker_user_id: selectedTrackerUserId } : {}),
    };

    try {
      await createAsignacion(payload, activeOrgId);
      await loadAll();
      setSuccess(
        selectedTrackerUserId
          ? "Asignación guardada correctamente."
          : "Asignación guardada correctamente. El tracking se activará cuando esta persona tenga un usuario/tracker vinculado."
      );
    } catch (e) {
      console.error(e);
      setError(e?.message || "Error al guardar asignación");
    }
  }

  // ...existing code...
  const [asignaciones, setAsignaciones] = useState([]);

  useEffect(() => {
    if (!activeOrgId) return;
    loadAll();
  }, [activeOrgId]);

  async function loadAll() {
    try {
      const { data, error } = await getAsignacionesBundle(activeOrgId);
      if (error) throw new Error(error.message);
      const catalogs = data?.catalogs || {};
      const rawPersonas = catalogs.personal || catalogs.people || [];
      const normalizedPersonas = (rawPersonas || []).map((p) => ({
        ...p,
        id: p?.id ?? p?.personal_id ?? p?.org_people_id ?? null,
        personal_id: p?.personal_id ?? p?.id ?? p?.org_people_id ?? null,
        nombre: p?.nombre ?? p?.name ?? p?.first_name ?? "",
        apellido: p?.apellido ?? p?.last_name ?? "",
        full_name:
          p?.full_name ??
          [
            p?.nombre ?? p?.name ?? p?.first_name ?? "",
            p?.apellido ?? p?.last_name ?? "",
          ]
            .filter(Boolean)
            .join(" "),
      }));
      const rawGeocercas = catalogs.geocercas || catalogs.geofences || [];
      const rawActividades = catalogs.activities || catalogs.actividades || [];
      setPersonas(normalizedPersonas);
      setGeocercas(rawGeocercas);
      setActividades(rawActividades);
      setAsignaciones(data?.asignaciones || []);
      setError("");
    } catch (e) {
      console.error(e);
      setError("Error al cargar datos de asignaciones.");
    }
  }

  // ...existing code...

  return (
    <div className="p-4 max-w-3xl">
      <h2 className="text-xl font-semibold mb-4">Nueva asignación</h2>
      {/* ...formulario de nueva asignación aquí... */}

      <AsignacionesTable
        asignaciones={asignaciones}
        people={personas}
        geofences={geocercas}
        activities={actividades}
        onEdit={async (row) => {
          const { id, ...fields } = row;
          if (!id) return;
          await updateAsignacion(id, fields);
          await loadAll();
        }}
        onToggleStatus={async (row) => {
          const { id, status } = row;
          if (!id) return;
          await toggleAsignacionStatus(id, status);
          await loadAll();
        }}
        onDelete={async (id) => {
          if (!id) return;
          await deleteAsignacion(id);
          await loadAll();
        }}
      />
    </div>
  );
}