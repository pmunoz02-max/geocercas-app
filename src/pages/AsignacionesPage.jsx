import React, { useEffect, useState } from "react";
import { getAsignaciones, createAsignacion, updateAsignacion, deleteAsignacion } from "../lib/asignacionesApi";
import AsignacionesTable from "../components/asignaciones/AsignacionesTable";

const ESTADOS = [
  { value: "todos", label: "Todos" },
  { value: "activa", label: "Activas" },
  { value: "inactiva", label: "Inactivas" },
];

export default function AsignacionesPage() {
  const [asignaciones, setAsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [personalId, setPersonalId] = useState("");
  const [geocercaId, setGeocercaId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [frecuenciaEnvio, setFrecuenciaEnvio] = useState(60);
  const [status, setStatus] = useState("activa");

  const [estadoFilter, setEstadoFilter] = useState("todos");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await getAsignaciones();
      if (error) {
        console.error("[AsignacionesPage] Error al cargar asignaciones:", error);
        setError("Error al cargar asignaciones");
      } else {
        setAsignaciones(data || []);
      }
      setLoading(false);
    }
    load();
  }, []);

  const filteredAsignaciones = asignaciones.filter(a => {
    if (estadoFilter !== "todos") {
      return a.status === estadoFilter; // <-- AHORA COINCIDE: activa / inactiva
    }
    return true;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const payload = {
      personal_id: personalId,
      geocerca_id: geocercaId,
      activity_id: activityId,
      start_time: startTime,
      end_time: endTime,
      frecuencia_envio_sec: frecuenciaEnvio,
      status: status,
      is_deleted: false,
    };

    console.log("[AsignacionesPage] Enviando payload:", payload);

    let result;
    try {
      result = await createAsignacion(payload);
    } catch (err) {
      console.error("[AsignacionesPage] handleSubmit error general:", err);
      setError("Error al guardar asignación");
      return;
    }

    if (result.error) {
      console.error("[AsignacionesPage] handleSubmit INSERT error:", result.error);
      setError(result.error.message || "Error al guardar asignación");
      return;
    }

    setAsignaciones(prev => [...prev, result.data[0]]);
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm("¿Eliminar asignación?");
    if (!confirmed) return;

    const { error } = await deleteAsignacion(id);
    if (error) {
      console.error("Error al eliminar", error);
      setError("No se pudo eliminar la asignación");
      return;
    }
    setAsignaciones(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Asignaciones</h1>

      {/* FILTRO DE ESTADO */}
      <div className="mb-4">
        <label className="block font-medium mb-1">Filtrar por estado:</label>
        <select
          className="border p-2 rounded"
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
        >
          {ESTADOS.map((e) => (
            <option key={e.value} value={e.value}>{e.label}</option>
          ))}
        </select>
      </div>

      {/* FORMULARIO */}
      <form onSubmit={handleSubmit} className="border p-4 rounded mb-6 bg-gray-50">
        <h2 className="text-lg font-semibold mb-3">Nueva Asignación</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* PERSONAL */}
          <div>
            <label>Personal ID</label>
            <input
              type="text"
              value={personalId}
              onChange={(e) => setPersonalId(e.target.value)}
              className="border p-2 w-full rounded"
              required
            />
          </div>

          {/* GEOCERCA */}
          <div>
            <label>Geocerca ID</label>
            <input
              type="text"
              value={geocercaId}
              onChange={(e) => setGeocercaId(e.target.value)}
              className="border p-2 w-full rounded"
              required
            />
          </div>

          {/* ACTIVIDAD */}
          <div>
            <label>Actividad ID</label>
            <input
              type="text"
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              className="border p-2 w-full rounded"
              required
            />
          </div>

          {/* START */}
          <div>
            <label>Inicio</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="border p-2 w-full rounded"
              required
            />
          </div>

          {/* END */}
          <div>
            <label>Fin</label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="border p-2 w-full rounded"
              required
            />
          </div>

          {/* ESTADO */}
          <div>
            <label>Estado</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="border p-2 w-full rounded"
            >
              <option value="activa">Activa</option>
              <option value="inactiva">Inactiva</option>
            </select>
          </div>

          {/* FRECUENCIA */}
          <div>
            <label>Frecuencia envío (segundos)</label>
            <input
              type="number"
              value={frecuenciaEnvio}
              onChange={(e) => setFrecuenciaEnvio(Number(e.target.value))}
              className="border p-2 w-full rounded"
              min="5"
            />
          </div>
        </div>

        {/* BOTÓN */}
        <button
          type="submit"
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Guardar
        </button>

        {error && (
          <p className="text-red-600 mt-3 font-semibold">{error}</p>
        )}
      </form>

      {/* TABLA */}
      <AsignacionesTable asignaciones={filteredAsignaciones} onDelete={handleDelete} />

    </div>
  );
}
