// src/pages/ActivityAssignments.jsx
// Asignación de actividades a trackers/personas
// Evita que la misma persona tenga dos actividades al mismo tiempo.

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { listActivities } from "../lib/activitiesApi";
import { listTrackers } from "../lib/trackersApi";
import {
  listActivityAssignments,
  createActivityAssignment,
  updateActivityAssignment,
  deleteActivityAssignment,
} from "../lib/activityAssignmentsApi";

// Form vacío
const initialForm = {
  id: null,
  tracker_user_id: "",
  activity_id: "",
  start_date: "",
  end_date: "",
};

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !bStart) return false;
  const aS = aStart;
  const aE = aEnd || "9999-12-31";
  const bS = bStart;
  const bE = bEnd || "9999-12-31";

  // En fechas YYYY-MM-DD se puede comparar como string
  return aS <= bE && bS <= aE;
}

export default function ActivityAssignmentsPage() {
  const { user } = useAuth() || {};

  const [activities, setActivities] = useState([]);
  const [trackers, setTrackers] = useState([]);
  const [rows, setRows] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadingForm, setLoadingForm] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Filtros
  const [trackerFilter, setTrackerFilter] = useState("");
  const [activityFilter, setActivityFilter] = useState("");
  const [startFilter, setStartFilter] = useState("");
  const [endFilter, setEndFilter] = useState("");

  // Formulario
  const [form, setForm] = useState(initialForm);
  const [mode, setMode] = useState("view"); // view | create | edit
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    cargarBase();
  }, []);

  async function cargarBase() {
    try {
      setLoading(true);
      setErrorMsg("");
      await Promise.all([
        fetchActivities(),
        fetchTrackers(),
        fetchAssignments(),
      ]);
    } catch (err) {
      console.error("Error carga inicial ActivityAssignments:", err);
      setErrorMsg(err.message || "Error al cargar datos iniciales");
    } finally {
      setLoading(false);
    }
  }

  async function fetchActivities() {
    try {
      const data = await listActivities({ includeInactive: false });
      setActivities(data || []);
    } catch (err) {
      console.error("Error listActivities:", err);
      setErrorMsg("No se pudieron cargar las actividades");
    }
  }

  async function fetchTrackers() {
    try {
      const data = await listTrackers();
      setTrackers(data || []);
    } catch (err) {
      console.error("Error listTrackers:", err);
      setErrorMsg("No se pudieron cargar los trackers");
    }
  }

  async function fetchAssignments(extraFilters = {}) {
    try {
      setLoading(true);
      const data = await listActivityAssignments({
        tracker_user_id: trackerFilter,
        activity_id: activityFilter,
        start_date: startFilter,
        end_date: endFilter,
        ...extraFilters,
      });
      setRows(data || []);
    } catch (err) {
      console.error("Error listActivityAssignments:", err);
      setErrorMsg(err.message || "No se pudieron cargar las asignaciones");
    } finally {
      setLoading(false);
    }
  }

  const trackersById = useMemo(() => {
    const m = new Map();
    trackers.forEach((t) => m.set(t.id, t));
    return m;
  }, [trackers]);

  const activitiesById = useMemo(() => {
    const m = new Map();
    activities.forEach((a) => m.set(a.id, a));
    return m;
  }, [activities]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedId) || null,
    [rows, selectedId]
  );

  function resetForm() {
    setForm(initialForm);
    setMode("view");
    setSelectedId(null);
    setErrorMsg("");
    setSuccessMsg("");
  }

  function handleNueva() {
    setForm(initialForm);
    setMode("create");
    setSelectedId(null);
    setErrorMsg("");
    setSuccessMsg("");
  }

  function handleSelectRow(row) {
    setSelectedId(row.id);
    setMode("edit");
    setForm({
      id: row.id,
      tracker_user_id: row.tracker_user_id,
      activity_id: row.activity_id,
      start_date: row.start_date || "",
      end_date: row.end_date || "",
    });
    setSuccessMsg("");
    setErrorMsg("");
  }

  function handleChangeForm(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  // Filtros -> recargar lista
  useEffect(() => {
    fetchAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackerFilter, activityFilter, startFilter, endFilter]);

  /**
   * Chequeo local de solapamiento para el mismo tracker.
   */
  function checkOverlapLocal({ tracker_user_id, start_date, end_date, id }) {
    if (!tracker_user_id || !start_date) return null;

    const conflict = rows.find((r) => {
      if (r.tracker_user_id !== tracker_user_id) return false;
      if (id && r.id === id) return false; // ignoramos la misma fila en edición
      return rangesOverlap(start_date, end_date, r.start_date, r.end_date);
    });

    return conflict || null;
  }

  async function handleSubmitForm(e) {
    e.preventDefault();
    setLoadingForm(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      if (!form.tracker_user_id || !form.activity_id || !form.start_date) {
        setErrorMsg(
          "Tracker, actividad y fecha de inicio son obligatorios"
        );
        return;
      }

      // Validación local
      const overlap = checkOverlapLocal(form);
      if (overlap) {
        const t = trackersById.get(overlap.tracker_user_id);
        const a = activitiesById.get(overlap.activity_id);
        setErrorMsg(
          `La persona ${
            t?.full_name || t?.email || "seleccionada"
          } ya tiene asignada la actividad "${
            a?.name || "otra actividad"
          }" entre ${overlap.start_date} y ${
            overlap.end_date || "sin fecha de fin"
          }.`
        );
        return;
      }

      if (mode === "create") {
        await createActivityAssignment({
          tracker_user_id: form.tracker_user_id,
          activity_id: form.activity_id,
          start_date: form.start_date,
          end_date: form.end_date || null,
        });
        setSuccessMsg("Actividad asignada correctamente");
      } else if (mode === "edit" && form.id) {
        await updateActivityAssignment(form.id, {
          tracker_user_id: form.tracker_user_id,
          activity_id: form.activity_id,
          start_date: form.start_date,
          end_date: form.end_date || null,
        });
        setSuccessMsg("Asignación actualizada correctamente");
      } else {
        setErrorMsg("Modo de formulario inválido");
        return;
      }

      await fetchAssignments();
      if (mode === "create") {
        resetForm();
      }
    } catch (err) {
      // Manejo especial de error de constraint de solapamiento
      const msg = String(err.message || "");
      if (msg.includes("activity_assignments_no_overlap")) {
        setErrorMsg(
          "No se puede asignar esta actividad: la persona ya tiene otra actividad en ese rango de fechas."
        );
      } else {
        setErrorMsg(
          err.message ||
            "Error al guardar la asignación de actividad"
        );
      }
      console.error("Error al guardar ActivityAssignment:", err);
    } finally {
      setLoadingForm(false);
    }
  }

  async function handleDelete(row) {
    const t = trackersById.get(row.tracker_user_id);
    const a = activitiesById.get(row.activity_id);

    const ok = window.confirm(
      `¿Seguro que deseas eliminar la asignación de "${a?.name || "actividad"}" para "${t?.full_name || t?.email || "tracker"}"?`
    );
    if (!ok) return;

    try {
      await deleteActivityAssignment(row.id);
      setSuccessMsg("Asignación eliminada correctamente");
      if (selectedId === row.id) {
        resetForm();
      }
      await fetchAssignments();
    } catch (err) {
      console.error("Error al eliminar ActivityAssignment:", err);
      setErrorMsg(
        err.message || "No se pudo eliminar la asignación de actividad"
      );
    }
  }

  return (
    <div className="p-4 space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Asignación de actividades</h1>
          <p className="text-sm text-gray-600">
            Define qué actividad realiza cada persona en un rango de fechas.
            La misma persona no puede tener dos actividades al mismo tiempo.
          </p>
          {user && (
            <p className="text-xs text-gray-500 mt-1">
              Sesión: <span className="font-mono">{user.email}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleNueva}
            className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            + Nueva asignación
          </button>
          <button
            type="button"
            onClick={() => fetchAssignments()}
            className="px-3 py-1 rounded border text-sm hover:bg-gray-100"
          >
            Refrescar
          </button>
        </div>
      </header>

      {(errorMsg || successMsg) && (
        <div className="space-y-2">
          {errorMsg && (
            <div className="px-3 py-2 rounded bg-red-100 text-red-800 text-sm">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="px-3 py-2 rounded bg-green-100 text-green-800 text-sm">
              {successMsg}
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <section className="border rounded p-3 bg-gray-50 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-700">
              Tracker / Persona
            </label>
            <select
              value={trackerFilter}
              onChange={(e) => setTrackerFilter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="">Todos</option>
              {trackers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name || t.email} ({t.email})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-700">
              Actividad
            </label>
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="">Todas</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-700">
              Inicio desde
            </label>
            <input
              type="date"
              value={startFilter}
              onChange={(e) => setStartFilter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-700">
              Fin hasta
            </label>
            <input
              type="date"
              value={endFilter}
              onChange={(e) => setEndFilter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        {/* Tabla */}
        <section className="border rounded p-2">
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="font-medium text-sm">Listado de asignaciones</h2>
            {loading && (
              <span className="text-xs text-gray-500">Cargando...</span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 text-left">Persona</th>
                  <th className="border px-2 py-1 text-left">Actividad</th>
                  <th className="border px-2 py-1 text-left">Inicio</th>
                  <th className="border px-2 py-1 text-left">Fin</th>
                  <th className="border px-2 py-1 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="border px-2 py-3 text-center text-gray-500"
                    >
                      No hay asignaciones para los filtros actuales.
                    </td>
                  </tr>
                )}

                {rows.map((row) => {
                  const t = trackersById.get(row.tracker_user_id);
                  const a = activitiesById.get(row.activity_id);
                  return (
                    <tr
                      key={row.id}
                      className={
                        "cursor-pointer hover:bg-blue-50" +
                        (selectedId === row.id ? " bg-blue-100" : "")
                      }
                      onClick={() => handleSelectRow(row)}
                    >
                      <td className="border px-2 py-1">
                        {t?.full_name || t?.email || row.tracker_user_id}
                        {t?.email ? ` (${t.email})` : ""}
                      </td>
                      <td className="border px-2 py-1">
                        {a?.name || row.activity_id}
                      </td>
                      <td className="border px-2 py-1">
                        {row.start_date || "-"}
                      </td>
                      <td className="border px-2 py-1">
                        {row.end_date || "-"}
                      </td>
                      <td
                        className="border px-2 py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex gap-1 justify-center">
                          <button
                            type="button"
                            className="px-2 py-0.5 text-xs rounded border hover:bg-gray-100"
                            onClick={() => handleSelectRow(row)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="px-2 py-0.5 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                            onClick={() => handleDelete(row)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Formulario */}
        <section className="border rounded p-3 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm">
              {mode === "create"
                ? "Nueva asignación"
                : mode === "edit"
                ? "Editar asignación"
                : "Detalles / nueva asignación"}
            </h2>
            <button
              type="button"
              className="text-xs text-gray-600 hover:underline"
              onClick={resetForm}
            >
              Limpiar
            </button>
          </div>

          <form className="space-y-3" onSubmit={handleSubmitForm}>
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-700">
                Persona / Tracker
              </label>
              <select
                name="tracker_user_id"
                value={form.tracker_user_id}
                onChange={handleChangeForm}
                className="border rounded px-2 py-1 text-sm"
                required
              >
                <option value="">Seleccione...</option>
                {trackers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name || t.email} ({t.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-700">
                Actividad
              </label>
              <select
                name="activity_id"
                value={form.activity_id}
                onChange={handleChangeForm}
                className="border rounded px-2 py-1 text-sm"
                required
              >
                <option value="">Seleccione...</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-700">
                  Fecha inicio
                </label>
                <input
                  type="date"
                  name="start_date"
                  value={form.start_date}
                  onChange={handleChangeForm}
                  className="border rounded px-2 py-1 text-sm"
                  required
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-700">
                  Fecha fin (opcional)
                </label>
                <input
                  type="date"
                  name="end_date"
                  value={form.end_date || ""}
                  onChange={handleChangeForm}
                  className="border rounded px-2 py-1 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              {mode === "edit" && (
                <button
                  type="button"
                  className="px-3 py-1 rounded border text-sm hover:bg-gray-100"
                  onClick={handleNueva}
                >
                  Nueva
                </button>
              )}
              <button
                type="submit"
                disabled={loadingForm}
                className="px-3 py-1 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
              >
                {loadingForm
                  ? "Guardando..."
                  : mode === "edit"
                  ? "Guardar cambios"
                  : "Crear asignación"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
