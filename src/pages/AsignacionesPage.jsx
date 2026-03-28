import { useEffect, useMemo, useState } from "react";
import { createAsignacion, getAsignacionesBundle } from "../lib/asignacionesApi";
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
      const { data, error } = await getAsignacionesBundle(activeOrgId);

      if (error) throw new Error(error.message);

      const catalogs = data?.catalogs || {};

      // LOGS TEMPORALES
      console.log("[AsignacionesPage] activeOrgId", activeOrgId);
      console.log("[AsignacionesPage] bundle data", data);
      console.log("[AsignacionesPage] catalogs", catalogs);
      console.log("[AsignacionesPage] rawPersonas", catalogs.personal || catalogs.people || []);
      console.log("[AsignacionesPage] rawGeocercas", catalogs.geocercas || catalogs.geofences || []);
      console.log("[AsignacionesPage] rawActividades", catalogs.activities || catalogs.actividades || []);

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

  return (
    <div className="p-4 max-w-3xl">
      <h2 className="text-xl font-semibold mb-4">Nueva asignación</h2>


      {/* DEBUG TEMPORAL */}
      <div className="mb-3 rounded border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <div>activeOrgId: {String(activeOrgId || "")}</div>
        <div>personas: {personas.length}</div>
        <div>geocercas: {geocercas.length}</div>
        <div>actividades: {actividades.length}</div>
      </div>

      {personasDisponibles.length === 0 && (
        <p className="text-amber-700 text-sm mb-3">
          No hay personas disponibles para esta organización.
        </p>
      )}

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
            const personId = p?.id || p?.personal_id;
            const label =
              p?.full_name ||
              [p?.nombre, p?.apellido].filter(Boolean).join(" ") ||
              p?.email ||
              `Persona ${personId}`;

            return (
              <option key={personId} value={personId}>
                {label}
              </option>
            );
          })}
        </select>
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
              {g.name || g.nombre || g.title || g.id}
            </option>
          ))}
        </select>
        {geocercas.length === 0 && (
          <p className="text-amber-700 text-sm mt-1">
            No hay geocercas disponibles para esta organización.
          </p>
        )}
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
              {a.name || a.nombre || a.title || a.id}
            </option>
          ))}
        </select>
        {actividades.length === 0 && (
          <p className="text-amber-700 text-sm mt-1">
            No hay actividades disponibles para esta organización.
          </p>
        )}
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