import { useEffect, useMemo, useState } from "react";
import { createAsignacion } from "../lib/asignacionesApi";
import { listGeofences } from "../lib/geofencesApi";
import { listActividades } from "../lib/actividadesApi";
import { listPersonal } from "../lib/personalApi";
import { useAuth } from "@/context/auth.js";

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
      const [p, g, a] = await Promise.all([
        listPersonal(),
        listGeofences(activeOrgId, true),
        listActividades({ orgId: activeOrgId }),
      ]);

      setPersonas(Array.isArray(p) ? p : []);
      setGeocercas(Array.isArray(g) ? g : []);
      setActividades(Array.isArray(a) ? a : []);
      setError("");
    } catch (e) {
      console.error(e);
      setError("Error al cargar datos de asignaciones.");
    }
  }

  const personasDisponibles = useMemo(() => {
    const base = Array.isArray(personas) ? personas.filter(Boolean) : [];

    return base.filter((p) => {
      const personId = p?.id ?? p?.personal_id ?? null;
      if (!personId) return false;

      const personOrgId = p?.org_id ?? p?.tenant_id ?? null;

      if (!activeOrgId) return true;

      if (!personOrgId) return true;

      return String(personOrgId) === String(activeOrgId);
    });
  }, [personas, activeOrgId]);

  const selectedPerson = useMemo(() => {
    return (
      personasDisponibles.find(
        (p) =>
          String(p?.id ?? p?.personal_id ?? "") === String(selectedPersonId)
      ) ?? null
    );
  }, [personasDisponibles, selectedPersonId]);

  const resolvedSelectedPersonId =
    selectedPerson?.id ?? selectedPerson?.personal_id ?? null;

  const selectedTrackerUserId = selectedPerson?.user_id ?? null;

  const showNoTrackerWarning = !!selectedPerson && !selectedTrackerUserId;

  function localDateTimeToISO(val) {
    if (!val) return null;
    return new Date(val).toISOString();
  }

  function resetForm() {
    setSelectedPersonId("");
    setSelectedGeocercaId("");
    setSelectedActivityId("");
    setStartTime("");
    setEndTime("");
    setStatus("active");
    setFreqMin(5);
  }

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
      start_time: localDateTimeToISO(startTime),
      end_time: localDateTimeToISO(endTime),
      frecuencia_envio_sec: parsedFreqMin * 60,
      status,
      ...(selectedTrackerUserId
        ? { tracker_user_id: selectedTrackerUserId }
        : {}),
    };

    try {
      await createAsignacion(payload);
      await loadAll();
      resetForm();

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

  return (
    <div className="p-4 max-w-3xl">
      <h2 className="text-xl font-semibold mb-4">Nueva asignación</h2>

      <div className="mb-3">
        <label>Persona</label>
        <select
          className="w-full border p-2 rounded"
          value={selectedPersonId}
          onChange={(e) => {
            setSelectedPersonId(e.target.value);
            setError("");
            setSuccess("");
          }}
        >
          <option value="">Seleccionar</option>
          {personasDisponibles.map((p) => {
            const personId = p?.id ?? p?.personal_id ?? "";
            const nombre =
              p?.nombre ||
              p?.name ||
              p?.full_name ||
              p?.email ||
              `Persona ${personId}`;

            return (
              <option key={personId} value={personId}>
                {nombre}
                {!p?.user_id ? " — sin tracker" : ""}
              </option>
            );
          })}
        </select>

        {personasDisponibles.length === 0 && (
          <p className="text-amber-700 text-sm mt-1">
            No hay personas disponibles para esta organización.
          </p>
        )}

        {showNoTrackerWarning && (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Esta persona aún no tiene tracker vinculado. La asignación se
            guardará, pero el tracking no se activará hasta vincular un
            usuario/tracker.
          </div>
        )}
      </div>

      <div className="mb-3">
        <label>Geocerca</label>
        <select
          className="w-full border p-2 rounded"
          value={selectedGeocercaId}
          onChange={(e) => setSelectedGeocercaId(e.target.value)}
        >
          <option value="">Seleccionar</option>
          {geocercas.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label>Actividad</label>
        <select
          className="w-full border p-2 rounded"
          value={selectedActivityId}
          onChange={(e) => setSelectedActivityId(e.target.value)}
        >
          <option value="">Seleccionar</option>
          {actividades.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label>Fecha/hora inicio</label>
        <input
          type="datetime-local"
          className="w-full border p-2 rounded"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
      </div>

      <div className="mb-3">
        <label>Fecha/hora fin</label>
        <input
          type="datetime-local"
          className="w-full border p-2 rounded"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
        />
      </div>

      <div className="mb-3">
        <label>Estado</label>
        <select
          className="w-full border p-2 rounded"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="active">Activa</option>
          <option value="inactive">Inactiva</option>
        </select>
      </div>

      <div className="mb-3">
        <label>Frecuencia (minutos)</label>
        <input
          type="number"
          className="w-full border p-2 rounded"
          value={freqMin}
          min={1}
          onChange={(e) => setFreqMin(Number(e.target.value))}
        />
      </div>

      {error && <div className="text-red-600 mb-3">{error}</div>}
      {success && <div className="text-green-600 mb-3">{success}</div>}

      <button
        onClick={handleSubmit}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Guardar asignación
      </button>
    </div>
  );
}