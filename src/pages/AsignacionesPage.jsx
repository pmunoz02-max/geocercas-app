import { useEffect, useMemo, useState } from "react";
import {
  createAsignacion,
  getAsignacionesBundle,
  updateAsignacion,
  toggleAsignacionStatus,
  deleteAsignacion,
} from "../lib/asignacionesApi";
import { useAuth } from "@/context/auth.js";
import AsignacionesTable from "../components/asignaciones/AsignacionesTable.jsx";

function personLabel(persona) {
  const nombre = persona?.nombre || "";
  const apellido = persona?.apellido || "";
  return (
    persona?.full_name?.trim() ||
    [nombre, apellido].filter(Boolean).join(" ").trim() ||
    persona?.email ||
    "Sin nombre"
  );
}

function actividadLabel(item) {
  return item?.name || item?.nombre || item?.title || "Sin nombre";
}

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
  const [endTimeError, setEndTimeError] = useState("");
  const [status, setStatus] = useState("active");
  const [freqMin, setFreqMin] = useState(5);

  const [editingId, setEditingId] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeOrgId) return;
    loadAll();
  }, [activeOrgId]);

  async function loadAll() {
    try {
      const { data, error } = await getAsignacionesBundle(activeOrgId);
      if (error) {
        throw new Error(error.message || "Error al cargar asignaciones");
      }
      const bundle = data || {};
      setPersonas(Array.isArray(bundle.catalogs?.personal) ? bundle.catalogs.personal : []);
      setGeocercas(Array.isArray(bundle.catalogs?.geofences) ? bundle.catalogs.geofences : []);
      setActividades(Array.isArray(bundle.catalogs?.activities) ? bundle.catalogs.activities : []);
      setAsignaciones(Array.isArray(bundle.asignaciones) ? bundle.asignaciones : []);
      setError("");
    } catch (e) {
      console.error(e);
      setError("Error al cargar datos de asignaciones.");
    }
  }

  const personasDisponibles = useMemo(() => {
    return personas.filter((p) => {
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

  const geofenceOptions = geocercas
    .map((g) => ({
      value: g?.id ?? null,
      label: g?.name || `Geocerca ${g?.id ?? ""}`,
    }))
    .filter((opt) => !!opt.value);

  async function handleSubmit(e) {
    e?.preventDefault?.();

    setError("");
    setSuccess("");
    setEndTimeError("");

    if (!activeOrgId) {
      setError("No hay organización activa.");
      return;
    }

    if (!resolvedSelectedPersonId) {
      setError("Debe seleccionar una persona válida.");
      return;
    }

    if (!selectedGeocercaId) {
      setError("Debe seleccionar una geocerca.");
      return;
    }

    if (!selectedActivityId) {
      setError("Debe seleccionar una actividad.");
      return;
    }

    if (!startTime) {
      setError("Debe seleccionar la fecha/hora de inicio.");
      return;
    }

    if (endTime && startTime && new Date(endTime) < new Date(startTime)) {
      const msg =
        "La fecha/hora de fin no puede ser anterior a la fecha/hora de inicio.";
      setEndTimeError(msg);
      setError(msg);
      return;
    }

    const parsedFreqMin = Number(freqMin);
    if (!Number.isFinite(parsedFreqMin) || parsedFreqMin <= 0) {
      setError("La frecuencia debe ser mayor que 0.");
      return;
    }

    // Validate no overlap with other assignments for the same person
    const newStart = startTime ? new Date(startTime) : null;
    const newEnd = endTime ? new Date(endTime) : null;
    const overlap = asignaciones.some(a => {
      if (a.personal_id !== resolvedSelectedPersonId) return false;
      if (editingId && a.id === editingId) return false; // skip self when editing
      const aStart = a.start_time ? new Date(a.start_time) : null;
      const aEnd = a.end_time ? new Date(a.end_time) : null;
      if (!aStart || !newStart) return false;
      // Overlap if (startA <= endB) && (endA >= startB)
      if (newEnd && aEnd) {
        return aStart <= newEnd && aEnd >= newStart;
      } else if (newEnd && !aEnd) {
        return aStart <= newEnd && newStart <= aStart;
      } else if (!newEnd && aEnd) {
        return aEnd >= newStart && newStart <= aEnd;
      } else {
        return aStart.getTime() === newStart.getTime();
      }
    });
    if (overlap) {
      setError("Ya existe otra asignación para esta persona en el rango de fechas seleccionado. Modifica las fechas para evitar traslapes.");
      setSaving(false);
      return;
    }

    setSaving(true);

    const payload = {
      personal_id: resolvedSelectedPersonId,
      org_id: activeOrgId,
      geofence_id: selectedGeocercaId || null,
      geocerca_id: null,
      activity_id: selectedActivityId || null,
      start_time: startTime ? new Date(startTime).toISOString() : null,
      end_time: endTime ? new Date(endTime).toISOString() : null,
      frecuencia_envio_sec: parsedFreqMin * 60,
      status,
      ...(selectedTrackerUserId
        ? { tracker_user_id: selectedTrackerUserId }
        : {}),
    };

    try {
      if (editingId) {
        // Log the update payload before calling updateAsignacion
        console.log("[AsignacionesPage] update payload:", payload);
        await updateAsignacion(editingId, payload, activeOrgId);
        await loadAll();
        setSuccess("Asignación actualizada correctamente.");
      } else {
        await createAsignacion(payload, activeOrgId);
        await loadAll();
        setSuccess("Asignación guardada correctamente.");
        // Reset form only after creating new assignment
        setSelectedPersonId("");
        setSelectedGeocercaId("");
        setSelectedActivityId("");
        setStartTime("");
        setEndTime("");
        setEndTimeError("");
        setStatus("active");
        setFreqMin(5);
      }
      setEditingId(null);
    } catch (e2) {
      console.error(e2);
      setError(e2?.message || (editingId ? "Error al actualizar asignación." : "Error al guardar asignación."));
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(row) {
    setError("");
    setSuccess("");
    setEndTimeError("");

    setEditingId(row?.id || null);
    setSelectedPersonId(String(row?.personal_id || ""));
    setSelectedGeocercaId(String(row?.geofence_id || row?.geocerca_id || ""));
    setSelectedActivityId(String(row?.activity_id || ""));
    setStartTime(row?.start_time ? row.start_time.slice(0, 16) : "");
    setEndTime(row?.end_time ? row.end_time.slice(0, 16) : "");

    const rowStatus = String(row?.status || row?.estado || "").toLowerCase();
    setStatus(rowStatus === "inactive" || rowStatus === "inactiva" ? "inactive" : "active");

    setFreqMin(
      row?.frecuencia_envio_sec
        ? Math.round(Number(row.frecuencia_envio_sec) / 60)
        : 5
    );

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleToggleStatus(row) {
    try {
      setError("");
      setSuccess("");

      const id = row?.id;
      if (!id) return;

      // Normalizar status actual
      const rawStatus = String(row?.status || row?.estado || "").toLowerCase();
      const isActive = rawStatus === "active" || rawStatus === "activa";
      const current = isActive ? "active" : "inactive";
      const next = current === "active" ? "inactive" : "active";

      await toggleAsignacionStatus(id, current, activeOrgId);
      await loadAll();
      setSuccess(
        next === "active"
          ? "Asignación activada correctamente."
          : "Asignación desactivada correctamente."
      );
    } catch (e) {
      console.error(e);
      setError(e?.message || "Error al cambiar estado de asignación.");
    }
  }

  async function handleDelete(id) {
    try {
      setError("");
      setSuccess("");

      if (!id) return;

      await deleteAsignacion(id, activeOrgId);
      await loadAll();
      setSuccess("Asignación eliminada correctamente.");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Error al eliminar asignación.");
    }
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
          {editingId ? "Editar asignación" : "Nueva asignación"}
        </h2>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Persona
            </label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              value={selectedPersonId}
              onChange={(e) => setSelectedPersonId(e.target.value)}
            >
              <option value="">Seleccionar</option>
              {personasDisponibles.map((p) => {
                const id = p?.id ?? p?.personal_id ?? null;
                if (!id) return null;
                return (
                  <option key={id} value={id}>
                    {personLabel(p)}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Geocerca
            </label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
            >
              <option value="">Seleccionar</option>
              {geofenceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Actividad
            </label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
            >
              <option value="">Seleccionar</option>
              {actividades.map((a) => (
                <option key={a.id} value={a.id}>
                  {actividadLabel(a)}
                </option>
              ))}
            </select>
            {actividades.length === 0 ? (
              <p className="mt-2 text-sm text-amber-700">
                No hay actividades disponibles para esta organización.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Fecha/hora inicio
              </label>
              <input
                type="datetime-local"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                value={startTime}
                onChange={(e) => {
                  const nextStart = e.target.value;
                  setStartTime(nextStart);

                  if (
                    endTime &&
                    nextStart &&
                    new Date(endTime) < new Date(nextStart)
                  ) {
                    setEndTimeError(
                      "La fecha/hora de fin no puede ser anterior a la fecha/hora de inicio."
                    );
                  } else {
                    setEndTimeError("");
                  }
                }}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Fecha/hora fin
              </label>
              <input
                type="datetime-local"
                min={startTime || undefined}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                value={endTime}
                onChange={(e) => {
                  const nextEnd = e.target.value;
                  setEndTime(nextEnd);

                  if (
                    startTime &&
                    nextEnd &&
                    new Date(nextEnd) < new Date(startTime)
                  ) {
                    setEndTimeError(
                      "La fecha/hora de fin no puede ser anterior a la fecha/hora de inicio."
                    );
                  } else {
                    setEndTimeError("");
                  }
                }}
              />
              {endTimeError ? (
                <p className="mt-1 text-sm text-red-600">{endTimeError}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Estado
              </label>
              <select
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="active">Activa</option>
                <option value="inactive">Inactiva</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Frecuencia (minutos)
              </label>
              <input
                type="number"
                min="1"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                value={freqMin}
                onChange={(e) => setFreqMin(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? (editingId ? "Actualizando..." : "Guardando...") : (editingId ? "Actualizar asignación" : "Guardar asignación")}
            </button>
          </div>
          {editingId ? (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setSelectedPersonId("");
                setSelectedGeocercaId("");
                setSelectedActivityId("");
                setStartTime("");
                setEndTime("");
                setEndTimeError("");
                setStatus("active");
                setFreqMin(5);
                setError("");
                setSuccess("");
              }}
              className="ml-2 inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 font-medium hover:bg-gray-50"
            >
              Cancelar
            </button>
          ) : null}
        </form>
      </div>

      <AsignacionesTable
        asignaciones={asignaciones}
        people={personas}
        geofences={geocercas}
        activities={actividades}
        onEdit={handleEdit}
        onToggleStatus={handleToggleStatus}
        onDelete={handleDelete}
      />
    </div>
  );
}