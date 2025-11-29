import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  getAsignaciones,
  createAsignacion,
  updateAsignacion,
  deleteAsignacion,
} from "../lib/asignacionesApi";
import AsignacionesTable from "../components/asignaciones/AsignacionesTable";

const ESTADOS = [
  { value: "todos", label: "Todos" },
  { value: "activa", label: "Activas" },
  { value: "inactiva", label: "Inactivas" },
];

export default function AsignacionesPage() {
  // ---------------------------------------------
  // Estado general
  // ---------------------------------------------
  const [asignaciones, setAsignaciones] = useState([]);
  const [loadingAsignaciones, setLoadingAsignaciones] = useState(true);
  const [error, setError] = useState(null);

  // Filtros
  const [estadoFilter, setEstadoFilter] = useState("todos");

  // Formulario
  const [selectedPersonalId, setSelectedPersonalId] = useState("");
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

  // ---------------------------------------------
  // Carga de asignaciones
  // ---------------------------------------------
  const loadAsignaciones = async () => {
    setLoadingAsignaciones(true);
    setError(null);
    const { data, error } = await getAsignaciones();
    if (error) {
      console.error("[AsignacionesPage] Error al cargar asignaciones:", error);
      setError("Error al cargar asignaciones");
    } else {
      setAsignaciones(data || []);
    }
    setLoadingAsignaciones(false);
  };

  // ---------------------------------------------
  // Carga de catálogos (personal, geocercas, actividades)
  // ---------------------------------------------
  const loadCatalogos = async () => {
    setLoadingCatalogos(true);
    setError(null);

    try {
      const [
        { data: personalData, error: personalError },
        { data: geocercasData, error: geocercasError },
        { data: activitiesData, error: activitiesError },
      ] = await Promise.all([
        // PERSONAL: aquí SÍ existe is_deleted
        supabase
          .from("personal")
          .select("id, nombre, apellido, email, is_deleted")
          .eq("is_deleted", false)
          .order("nombre", { ascending: true }),

        // GEOCERCAS: sin is_deleted (no lo tiene)
        supabase.from("geocercas").select("id, nombre").order("nombre", {
          ascending: true,
        }),

        // ACTIVITIES: usamos name (en inglés)
        supabase.from("activities").select("id, name").order("name", {
          ascending: true,
        }),
      ]);

      if (personalError) throw personalError;
      if (geocercasError) throw geocercasError;
      if (activitiesError) throw activitiesError;

      setPersonalOptions(
        (personalData || []).filter((p) => p.is_deleted === false)
      );
      setGeocercaOptions(geocercasData || []);
      setActivityOptions(activitiesData || []);
    } catch (err) {
      console.error("[AsignacionesPage] Error cargando catálogos:", err);
      setError("Error al cargar catálogos de personal/geocercas/actividades");
    } finally {
      setLoadingCatalogos(false);
    }
  };

  // ---------------------------------------------
  // useEffect inicial
  // ---------------------------------------------
  useEffect(() => {
    loadAsignaciones();
    loadCatalogos();
  }, []);

  // ---------------------------------------------
  // Asignaciones filtradas por estado
  // ---------------------------------------------
  const filteredAsignaciones = useMemo(() => {
    if (estadoFilter === "todos") return asignaciones;
    return (asignaciones || []).filter((a) => a.status === estadoFilter);
  }, [asignaciones, estadoFilter]);

  // ---------------------------------------------
  // Manejo de formulario (crear / editar)
  // ---------------------------------------------
  const resetForm = () => {
    setSelectedPersonalId("");
    setSelectedGeocercaId("");
    setSelectedActivityId("");
    setStartTime("");
    setEndTime("");
    setFrecuenciaEnvioMin(5);
    setStatus("activa");
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);

    if (!selectedPersonalId || !selectedGeocercaId) {
      setError("Selecciona persona y geocerca");
      return;
    }
    if (!startTime || !endTime) {
      setError("Selecciona las fechas de inicio y fin");
      return;
    }

    const freqMin = Number(frecuenciaEnvioMin) || 0;
    if (freqMin < 5) {
      setError("La frecuencia no puede ser menor a 5 minutos.");
      return;
    }

    const payload = {
      personal_id: selectedPersonalId,
      geocerca_id: selectedGeocercaId,
      activity_id: selectedActivityId || null,
      start_time: startTime,
      end_time: endTime,
      // Convertimos minutos -> segundos para la BD
      frecuencia_envio_sec: freqMin * 60,
      status,
      is_deleted: false,
    };

    try {
      if (editingId) {
        const { error: updateError } = await updateAsignacion(editingId, payload);
        if (updateError) {
          console.error("[AsignacionesPage] UPDATE error:", updateError);
          // Si es el check constraint, damos mensaje amable
          if (
            updateError.message &&
            updateError.message.includes("asignaciones_freq_chk")
          ) {
            setError(
              "La frecuencia no puede ser menor a 5 minutos (regla de la BD)."
            );
          } else {
            setError(
              updateError.message || "Error al actualizar la asignación"
            );
          }
          return;
        }
      } else {
        const { error: insertError } = await createAsignacion(payload);
        if (insertError) {
          console.error("[AsignacionesPage] INSERT error:", insertError);
          if (
            insertError.message &&
            insertError.message.includes("asignaciones_freq_chk")
          ) {
            setError(
              "La frecuencia no puede ser menor a 5 minutos (regla de la BD)."
            );
          } else {
            setError(insertError.message || "Error al crear la asignación");
          }
          return;
        }
      }

      await loadAsignaciones();
      resetForm();
    } catch (err) {
      console.error("[AsignacionesPage] handleSubmit error general:", err);
      setError("Error al guardar la asignación");
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
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm("¿Eliminar asignación?");
    if (!confirmed) return;

    const { error: deleteError } = await deleteAsignacion(id);
    if (deleteError) {
      console.error("[AsignacionesPage] delete error:", deleteError);
      setError("No se pudo eliminar la asignación");
      return;
    }

    await loadAsignaciones();
  };

  // ---------------------------------------------
  // Render
  // ---------------------------------------------
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Asignaciones</h1>

      {/* FILTRO POR ESTADO */}
      <div className="mb-4 flex items-center gap-3">
        <label className="font-medium">Filtrar por estado:</label>
        <select
          className="border rounded px-3 py-2"
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
        >
          {ESTADOS.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
      </div>

      {/* FORMULARIO NUEVA/EDITAR ASIGNACIÓN */}
      <div className="mb-6 border rounded-lg bg-white shadow-sm p-4">
        <h2 className="text-lg font-semibold mb-4">
          {editingId ? "Editar asignación" : "Nueva asignación"}
        </h2>

        {(loadingCatalogos || loadingAsignaciones) && (
          <p className="text-sm text-gray-500 mb-3">Cargando datos…</p>
        )}

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {/* Persona */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">Persona</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedPersonalId}
              onChange={(e) => setSelectedPersonalId(e.target.value)}
              required
            >
              <option value="">Selecciona una persona</option>
              {personalOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.nombre || ""} ${p.apellido || ""}`.trim() || p.email}
                </option>
              ))}
            </select>
          </div>

          {/* Geocerca */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">Geocerca</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
              required
            >
              <option value="">Selecciona una geocerca</option>
              {geocercaOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre || "Sin nombre"}
                </option>
              ))}
            </select>
          </div>

          {/* Actividad */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">Actividad</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
            >
              <option value="">(Opcional) Selecciona una actividad</option>
              {activityOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || "Sin nombre"}
                </option>
              ))}
            </select>
          </div>

          {/* Inicio */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">Inicio</label>
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
            <label className="mb-1 font-medium text-sm">Fin</label>
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
            <label className="mb-1 font-medium text-sm">Estado</label>
            <select
              className="border rounded px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="activa">Activa</option>
              <option value="inactiva">Inactiva</option>
            </select>
          </div>

          {/* Frecuencia */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">
              Frecuencia envío (minutos, mínimo 5)
            </label>
            <input
              type="number"
              className="border rounded px-3 py-2"
              value={frecuenciaEnvioMin}
              min={5}
              onChange={(e) =>
                setFrecuenciaEnvioMin(Number(e.target.value) || 5)
              }
            />
          </div>
        </form>

        {/* Botones */}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            {editingId ? "Actualizar" : "Guardar"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="border px-4 py-2 rounded"
            >
              Cancelar edición
            </button>
          )}
        </div>

        {error && (
          <p className="text-red-600 mt-3 font-semibold">{error}</p>
        )}
      </div>

      {/* TABLA DE ASIGNACIONES */}
      <AsignacionesTable
        asignaciones={filteredAsignaciones}
        loading={loadingAsignaciones}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
