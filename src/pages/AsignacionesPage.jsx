import { useEffect, useMemo, useState } from "react";
import { createAsignacion, getAsignacionesBundle, listAsignaciones } from "../lib/asignacionesApi";
import { useAuth } from "@/context/auth.js";

export default function AsignacionesPage() {
  const { activeOrgId } = useAuth();

  const [personas, setPersonas] = useState([]);
  const [geocercas, setGeocercas] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);

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

    if (error) {
      throw new Error(error.message);
    }

    const catalogs = data?.catalogs || {};

    setPersonas(catalogs.personal || []);
    setGeocercas(catalogs.geocercas || []);
    setActividades(catalogs.activities || []);
    setError("");
  } catch (e) {
    console.error(e);
    setError("Error al cargar datos de asignaciones.");
  }
}

  const personasDisponibles = useMemo(() => {
    return (personas || []).filter((p) => {
      const id = p?.id ?? p?.personal_id;
      if (!id) return false;
      const org = p?.org_id ?? p?.tenant_id;
      return !org || String(org) === String(activeOrgId);
    });
  }, [personas, activeOrgId]);

  const selectedPerson = useMemo(() => {
    return personasDisponibles.find(
      (p) =>
        String(p?.id ?? p?.personal_id ?? "") === String(selectedPersonId)
    );
  }, [personasDisponibles, selectedPersonId]);

  const resolvedSelectedPersonId =
    selectedPerson?.id ?? selectedPerson?.personal_id ?? null;

  const trackerUserId = selectedPerson?.user_id ?? null;

  const showNoTrackerWarning = !!selectedPerson && !trackerUserId;

  async function handleSubmit() {
    setError("");
    setSuccess("");

    if (!resolvedSelectedPersonId) {
      setError("Debe seleccionar una persona válida.");
      return;
    }

    const payload = {
      personal_id: resolvedSelectedPersonId,
      org_id: activeOrgId,
      tenant_id: activeOrgId,
      geofence_id: selectedGeocercaId || null,
      activity_id: selectedActivityId || null,
      start_time: startTime ? new Date(startTime).toISOString() : null,
      end_time: endTime ? new Date(endTime).toISOString() : null,
      frecuencia_envio_sec: Number(freqMin) * 60,
      status,
      ...(trackerUserId ? { tracker_user_id: trackerUserId } : {}),
    };

    try {
      await createAsignacion(payload);
      await loadAll();
      setSuccess("Asignación guardada correctamente.");
    } catch (e) {
      console.error(e);
      setError("Error al guardar asignación.");
    }
  }

  return (
    <div className="p-4 max-w-3xl">
      <h2 className="text-xl font-semibold mb-4">
        Nueva asignación DEBUG OK
      </h2>

      <select
        className="w-full border p-2 rounded mb-2"
        value={selectedPersonId}
        onChange={(e) => setSelectedPersonId(e.target.value)}
      >
        <option value="">Seleccionar persona</option>
        {personasDisponibles.map((p) => (
          <option key={p.id || p.personal_id} value={p.id || p.personal_id}>
            {p.nombre || p.email} {!p.user_id && " (sin tracker)"}
          </option>
        ))}
      </select>

      {showNoTrackerWarning && (
        <div className="text-yellow-600 text-sm mb-2">
          Sin tracker → no habrá tracking aún
        </div>
      )}

      <button
        onClick={handleSubmit}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Guardar asignación
      </button>

      {error && <div className="text-red-500">{error}</div>}
      {success && <div className="text-green-500">{success}</div>}
    </div>
  );
}