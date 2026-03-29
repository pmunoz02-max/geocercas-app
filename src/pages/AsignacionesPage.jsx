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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractBundle(result) {
  // Casos posibles:
  // 1) getAsignacionesBundle -> { data: { catalogs, asignaciones }, error: null }
  // 2) fetch directo -> { ok, data: { catalogs, asignaciones } }
  // 3) variantes con names ingles/español
  const level0 = result ?? {};
  const level1 = level0?.data ?? {};
  const level2 = level1?.data ?? {};

  const candidates = [level0, level1, level2];

  for (const node of candidates) {
    const catalogs = node?.catalogs ?? node?.catalog ?? node?.catalogos ?? null;

    const personal =
      asArray(catalogs?.personal).length > 0
        ? catalogs.personal
        : asArray(catalogs?.people).length > 0
          ? catalogs.people
          : asArray(node?.personal).length > 0
            ? node.personal
            : asArray(node?.people);

    const geofences =
      asArray(catalogs?.geofences).length > 0
        ? catalogs.geofences
        : asArray(catalogs?.geocercas).length > 0
          ? catalogs.geocercas
          : asArray(node?.geofences).length > 0
            ? node.geofences
            : asArray(node?.geocercas);

    const activities =
      asArray(catalogs?.activities).length > 0
        ? catalogs.activities
        : asArray(catalogs?.actividades).length > 0
          ? catalogs.actividades
          : asArray(node?.activities).length > 0
            ? node.activities
            : asArray(node?.actividades);

    const asignaciones =
      asArray(node?.asignaciones).length > 0
        ? node.asignaciones
        : asArray(node?.assignments).length > 0
          ? node.assignments
          : asArray(node?.rows);

    if (
      catalogs ||
      personal.length > 0 ||
      geofences.length > 0 ||
      activities.length > 0 ||
      asignaciones.length > 0
    ) {
      return {
        personas: personal,
        geocercas: geofences,
        actividades: activities,
        asignaciones,
      };
    }
  }

  return {
    personas: [],
    geocercas: [],
    actividades: [],
    asignaciones: [],
  };
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

  // Debug state for counts
  const [debugCounts, setDebugCounts] = useState({ personas: 0, geocercas: 0, actividades: 0, asignaciones: 0 });
  useEffect(() => {
    if (!activeOrgId) return;
    loadAll();
  }, [activeOrgId]);

  async function loadAll() {
    try {
      console.log("[AsignacionesPage] getAsignacionesBundle request org_id:", activeOrgId);
      const result = await getAsignacionesBundle(activeOrgId);
      console.log("[AsignacionesPage] raw bundle response:", result);
      if (result?.error) {
        throw new Error(result.error.message || "Error al cargar asignaciones");
      }
      const next = extractBundle(result);
      setDebugCounts({
        personas: next.personas.length,
        geocercas: next.geocercas.length,
        actividades: next.actividades.length,
        asignaciones: next.asignaciones.length,
      });
      setPersonas(next.personas);
      setGeocercas(next.geocercas);
      setActividades(next.actividades);
      setAsignaciones(next.asignaciones);
      setError("");
    } catch (e) {
      console.error("[AsignacionesPage] loadAll failed:", e);
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


  const geofenceOptions = useMemo(() => {
    return geocercas
      .map((g) => ({
        value: g?.id ?? null,
        label: g?.name || `Geocerca ${g?.id ?? ""}`,
      }))
      .filter((opt) => !!opt.value);
  }, [geocercas]);

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

    setSaving(true);

    const payload = {
      id: editingId || undefined,
      personal_id: resolvedSelectedPersonId,
      org_id: activeOrgId,
      geofence_id: selectedGeocercaId || null,
      activity_id: selectedActivityId || null,
      start_time: startTime ? new Date(startTime).toISOString() : null,
      end_time: endTime ? new Date(endTime).toISOString() : null,
      frequency_minutes: parsedFreqMin,
      frecuencia_envio_sec: parsedFreqMin * 60,
      status,
    };

    try {
      let result;
      if (editingId) {
        result = await updateAsignacion(editingId, payload, activeOrgId);
        if (result?.error) {
          throw new Error(result.error.message || "Error al actualizar asignación");
        }
      } else {
        result = await createAsignacion(payload, activeOrgId);
        if (result?.error) {
          throw new Error(result.error.message || "Error al guardar asignación");
        }
      }

      // Llamar a rpc_upsert_tracker_assignment después de guardar/upd
      const { supabase } = await import("../lib/supabaseClient.js");
      await supabase.rpc("rpc_upsert_tracker_assignment", {
        p_org_id: activeOrgId,
        p_tracker_user_id: resolvedSelectedPersonId,
        p_activity_id: selectedActivityId,
        p_geofence_id: selectedGeocercaId || null,
        p_start_date: startTime ? new Date(startTime).toISOString() : null,
        p_end_date: endTime ? new Date(endTime).toISOString() : null,
      });

      await loadAll();
      setSuccess(editingId ? "Asignación actualizada correctamente." : "Asignación guardada correctamente.");
      setSelectedPersonId("");
      setSelectedGeocercaId("");
      setSelectedActivityId("");
      setStartTime("");
      setEndTime("");
      setEndTimeError("");
      setStatus("active");
      setFreqMin(5);
      setEditingId(null);
    } catch (e2) {
      console.error("[AsignacionesPage] submit failed:", e2);
      setError(
        e2?.message ||
          (editingId
            ? "Error al actualizar asignación."
            : "Error al guardar asignación.")
      );
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
    setStatus(
      rowStatus === "inactive" || rowStatus === "inactiva" ? "inactive" : "active"
    );

    setFreqMin(
      row?.frequency_minutes
        ? Number(row.frequency_minutes)
        : row?.frecuencia_envio_sec
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
      console.error("[AsignacionesPage] toggle status failed:", e);
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
      console.error("[AsignacionesPage] delete failed:", e);
      setError(e?.message || "Error al eliminar asignación.");
    }
  }

  function handleCancelEdit() {
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
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* ...existing code... */}
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
              {saving
                ? editingId
                  ? "Actualizando..."
                  : "Guardando..."
                : editingId
                  ? "Actualizar asignación"
                  : "Guardar asignación"}
            </button>

            {editingId ? (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
            ) : null}
          </div>
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