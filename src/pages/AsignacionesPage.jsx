import { useEffect, useState } from "react";
import {
  listAsignaciones,
  createAsignacion,
} from "../lib/asignacionesApi";

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

  // 🔥 FILTRO CANÓNICO DE TRACKERS
  const validPersonas = (personas || []).filter(
    (p) =>
      p &&
      p.user_id &&
      String(p.org_id) === String(activeOrgId)
  );

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

      setPersonas(p || []);
      setGeocercas(g || []);
      setActividades(a || []);
    } catch (e) {
      console.error(e);
    }
  }

  function localDateTimeToISO(val) {
    if (!val) return null;
    return new Date(val).toISOString();
  }

  async function handleSubmit() {
    setError("");

    const selectedPerson = validPersonas.find(
      (p) => String(p.id) === String(selectedPersonId)
    );

    // 🔥 VALIDACIÓN CRÍTICA
    if (!selectedPerson) {
      setError("Selecciona un tracker válido.");
      return;
    }

    const payload = {
      personal_id: selectedPerson.id,
      tracker_user_id: selectedPerson.user_id,
      org_id: activeOrgId,
      tenant_id: activeOrgId,
      geofence_id: selectedGeocercaId,
      geocerca_id: null,
      activity_id: selectedActivityId,
      start_time: localDateTimeToISO(startTime),
      end_time: localDateTimeToISO(endTime),
      frecuencia_envio_sec: freqMin * 60,
      status,
    };

    try {
      await createAsignacion(payload);
      await loadAll();
      setSelectedPersonId("");
      setError("");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Error al guardar asignación");
    }
  }

  return (
    <div className="p-4 max-w-3xl">
      <h2 className="text-xl font-semibold mb-4">Nueva asignación</h2>

      {/* PERSONA */}
      <div className="mb-3">
        <label>Persona</label>
        <select
          className="w-full border p-2 rounded"
          value={selectedPersonId}
          onChange={(e) => setSelectedPersonId(e.target.value)}
        >
          <option value="">Seleccionar</option>
          {validPersonas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>

        {validPersonas.length === 0 && (
          <p className="text-red-600 text-sm mt-1">
            No hay trackers disponibles en esta organización.
          </p>
        )}
      </div>

      {/* GEO */}
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

      {/* ACTIVIDAD */}
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

      {/* FECHAS */}
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

      {/* STATUS */}
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

      {/* FRECUENCIA */}
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

      {/* ERROR */}
      {error && <div className="text-red-600 mb-3">{error}</div>}

      <button
        onClick={handleSubmit}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Guardar asignación
      </button>
    </div>
  );
}