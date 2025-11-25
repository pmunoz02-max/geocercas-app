import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/SupabaseClient";
import { useAuth } from "../context/AuthContext";

const ESTADOS = [
  { value: "todos", label: "Todos" },
  { value: "activo", label: "Activos" },
  { value: "inactivo", label: "Inactivos" },
];

function formatDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function AsignacionesPage() {
  const { user, currentOrg, currentRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);
  const [error, setError] = useState(null);

  const [personal, setPersonal] = useState([]);
  const [geocercas, setGeocercas] = useState([]);
  const [activities, setActivities] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);

  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("todos");

  const [personaId, setPersonaId] = useState("");
  const [geocercaId, setGeocercaId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [frecuenciaMin, setFrecuenciaMin] = useState(5);
  const [estado, setEstado] = useState("activo");

  const [editingId, setEditingId] = useState(null);

  const [newActivityName, setNewActivityName] = useState("");
  const [newActivityDesc, setNewActivityDesc] = useState("");

  const isAdminOrOwner = currentRole === "owner" || currentRole === "admin";

  // ------------------------------------------------------------------
  // Carga de datos
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!user || !currentOrg) return;

    async function loadAll() {
      setLoading(true);
      setError(null);

      try {
        // PERSONAL
        const { data: personalData, error: personalErr } = await supabase
          .from("personal")
          .select("*")
          .eq("owner_id", user.id)
          .eq("is_deleted", false)
          .order("id", { ascending: true });

        if (personalErr) {
          console.error("[AsignacionesPage] error personal:", personalErr);
          throw personalErr;
        }

        // GEOCERCAS
        const { data: geocercasData, error: geocercasErr } = await supabase
          .from("geocercas")
          .select("*")
          .eq("org_id", currentOrg.id)
          .order("nombre", { ascending: true });

        if (geocercasErr) {
          console.error("[AsignacionesPage] error geocercas:", geocercasErr);
          throw geocercasErr;
        }

        // ACTIVITIES
        const { data: activitiesData, error: activitiesErr } = await supabase
          .from("activities")
          .select("*")
          .eq("active", true)
          .order("name", { ascending: true });

        if (activitiesErr) {
          console.error("[AsignacionesPage] error activities:", activitiesErr);
          throw activitiesErr;
        }

        // ASIGNACIONES
        const { data: asignacionesData, error: asignacionesErr } =
          await supabase
            .from("asignaciones")
            .select("*")
            .eq("org_id", currentOrg.id)
            .eq("owner_id", user.id)
            .eq("is_deleted", false)
            .order("id", { ascending: false });

        if (asignacionesErr) {
          console.error(
            "[AsignacionesPage] error asignaciones:",
            asignacionesErr
          );
          throw asignacionesErr;
        }

        setPersonal(personalData || []);
        setGeocercas(geocercasData || []);
        setActivities(activitiesData || []);
        setAsignaciones(asignacionesData || []);
      } catch (err) {
        console.error("[AsignacionesPage] loadAll error general:", err);
        setError("Error al cargar datos de asignaciones. Intenta de nuevo.");
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, [user, currentOrg]);

  // --------------------------------------------------
  // MAPAS PARA MOSTRAR NOMBRES
  // --------------------------------------------------
  const personalMap = useMemo(() => {
    const m = {};
    for (const p of personal) {
      const firstName =
        p.nombres ?? p.nombre ?? p.first_name ?? p.full_name ?? "";
      const lastName = p.apellidos ?? p.last_name ?? "";
      const fullName = `${firstName} ${lastName}`.trim();
      m[p.id] = fullName || p.email || p.telefono || "Sin nombre";
    }
    return m;
  }, [personal]);

  const geocercaMap = useMemo(() => {
    const m = {};
    for (const g of geocercas) {
      m[g.id] = g.nombre || g.name || "Sin nombre";
    }
    return m;
  }, [geocercas]);

  const activityMap = useMemo(() => {
    const m = {};
    for (const a of activities) {
      m[a.id] = a.name || "Actividad";
    }
    return m;
  }, [activities]);

  // --------------------------------------------------
  // FILTRO TABLA
  // --------------------------------------------------
  const filteredAsignaciones = useMemo(() => {
    let list = asignaciones;

    if (estadoFilter !== "todos") {
      const target = estadoFilter;
      list = list.filter((a) => {
        const st = a.estado ?? a.status ?? "activo";
        return st === target;
      });
    }

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((a) => {
        const persona = personalMap[a.personal_id] || "";
        const geocerca = geocercaMap[a.geocerca_id] || "";
        const actividad = a.activity_id ? activityMap[a.activity_id] || "" : "";
        return (
          persona.toLowerCase().includes(s) ||
          geocerca.toLowerCase().includes(s) ||
          actividad.toLowerCase().includes(s)
        );
      });
    }

    return list;
  }, [asignaciones, estadoFilter, search, personalMap, geocercaMap, activityMap]);

  // --------------------------------------------------
  // FORMULARIO ASIGNACIONES
  // --------------------------------------------------
  const resetForm = () => {
    setPersonaId("");
    setGeocercaId("");
    setActivityId("");
    setStartDate("");
    setEndDate("");
    setFrecuenciaMin(5);
    setEstado("activo");
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!isAdminOrOwner) {
      setError("Solo el owner o un admin pueden crear o editar asignaciones.");
      return;
    }

    if (!personaId || !geocercaId) {
      setError("Persona y geocerca son obligatorias.");
      return;
    }

    if (!startDate) {
      setError("La fecha de inicio es obligatoria.");
      return;
    }

    if (!endDate) {
      setError("La fecha de fin es obligatoria.");
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      setError("La fecha de inicio no puede ser mayor que la de fin.");
      return;
    }

    const freq = parseInt(frecuenciaMin, 10);
    if (Number.isNaN(freq) || freq <= 0) {
      setError("La frecuencia (minutos) debe ser un número positivo.");
      return;
    }

    setSaving(true);

    try {
      const frecuenciaSegundos = freq * 60;

      if (editingId) {
        const payload = {
          personal_id: personaId,
          geocerca_id: geocercaId,
          activity_id: activityId || null,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          status: estado,
        };

        const { data, error: updateErr } = await supabase
          .from("asignaciones")
          .update(payload)
          .eq("id", editingId)
          .eq("owner_id", user.id)
          .select()
          .single();

        if (updateErr) {
          console.error(
            "[AsignacionesPage] handleSubmit UPDATE error:",
            updateErr
          );
          throw updateErr;
        }

        setAsignaciones((prev) =>
          prev.map((a) => (a.id === editingId ? { ...a, ...data } : a))
        );
      } else {
        const payload = {
          personal_id: personaId,
          geocerca_id: geocercaId,
          activity_id: activityId || null,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          status: estado,
          frequency_sec: frecuenciaSegundos,
          owner_id: user.id,
          org_id: currentOrg.id,
          is_deleted: false,
        };

        const { data, error: insertErr } = await supabase
          .from("asignaciones")
          .insert([payload])
          .select()
          .single();

        if (insertErr) {
          console.error(
            "[AsignacionesPage] handleSubmit INSERT error:",
            insertErr
          );
          throw insertErr;
        }

        setAsignaciones((prev) => [data, ...prev]);
      }

      resetForm();
    } catch (err) {
      console.error("[AsignacionesPage] handleSubmit error general:", err);
      setError(
        editingId
          ? "Error al actualizar la asignación."
          : "Error al crear la asignación."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (asig) => {
    setEditingId(asig.id);
    setPersonaId(asig.personal_id || "");
    setGeocercaId(asig.geocerca_id || "");
    setActivityId(asig.activity_id || "");

    const startValue = asig.start_date || asig.start_time;
    const endValue = asig.end_date || asig.end_time;

    setStartDate(formatDateInput(startValue));
    setEndDate(formatDateInput(endValue));

    const frecuenciaSeg =
      asig.frecuencia_envio_sec ?? asig.frequency_sec ?? null;
    const freqMin =
      frecuenciaSeg != null ? Math.round(frecuenciaSeg / 60) : 5;
    setFrecuenciaMin(freqMin);

    setEstado(asig.estado ?? asig.status ?? "activo");
  };

  // --------------------------------------------------
  // ELIMINAR (soft delete)
  // --------------------------------------------------
  const handleDelete = async (asig) => {
    if (!isAdminOrOwner) {
      setError("Solo el owner o un admin pueden eliminar asignaciones.");
      return;
    }

    const ok = window.confirm(
      "¿Seguro que deseas eliminar esta asignación? Se marcará como eliminada."
    );
    if (!ok) return;

    try {
      const { error: delErr } = await supabase
        .from("asignaciones")
        .update({ is_deleted: true })
        .eq("id", asig.id)
        .eq("owner_id", user.id);

      if (delErr) {
        console.error("[AsignacionesPage] handleDelete error:", delErr);
        throw delErr;
      }

      setAsignaciones((prev) => prev.filter((a) => a.id !== asig.id));
      if (editingId === asig.id) {
        resetForm();
      }
    } catch (err) {
      console.error("[AsignacionesPage] handleDelete error general:", err);
      setError("Error al eliminar la asignación.");
    }
  };

  // --------------------------------------------------
  // NUEVA ACTIVIDAD
  // --------------------------------------------------
  const handleCreateActivity = async (e) => {
    e.preventDefault();
    setError(null);

    if (!isAdminOrOwner) {
      setError("Solo el owner o un admin pueden crear actividades.");
      return;
    }

    const name = newActivityName.trim();
    if (!name) {
      setError("El nombre de la actividad es obligatorio.");
      return;
    }

    const tenantIdForActivity = activities[0]?.tenant_id || null;
    if (!tenantIdForActivity) {
      setError(
        "No se pudo determinar el tenant de las actividades. Revisa la tabla activities."
      );
      return;
    }

    setSavingActivity(true);

    try {
      const payload = {
        name,
        description: newActivityDesc || null,
        active: true,
        tenant_id: tenantIdForActivity,
      };

      const { data, error: actErr } = await supabase
        .from("activities")
        .insert([payload])
        .select()
        .single();

      if (actErr) {
        console.error("[AsignacionesPage] handleCreateActivity error:", actErr);
        throw actErr;
      }

      setActivities((prev) =>
        [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
      );
      setActivityId(data.id);
      setNewActivityName("");
      setNewActivityDesc("");
    } catch (err) {
      console.error(
        "[AsignacionesPage] handleCreateActivity error general:",
        err
      );
      setError("Error al crear la actividad.");
    } finally {
      setSavingActivity(false);
    }
  };

  if (!user || !currentOrg) {
    return (
      <div className="p-4">
        <p>Debes iniciar sesión y tener una organización seleccionada.</p>
      </div>
    );
  }

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------
  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">
        Asignaciones de personal a geocercas
      </h1>
      <p className="text-sm text-gray-500 mb-4">
        Administra qué persona está asignada a qué geocerca, con fechas y
        actividades opcionales.
      </p>

      {error && (
        <div className="mb-2 rounded bg-red-100 text-red-800 px-4 py-2">
          {error}
        </div>
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium mb-1">Buscar</label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Nombre, email o geocerca"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Estado</label>
          <select
            className="border rounded px-3 py-2 text-sm"
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value)}
          >
            {ESTADOS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Layout principal: tabla arriba, formulario abajo */}
      <div className="space-y-6">
        {/* Tabla */}
        <div>
          <h2 className="text-lg font-medium mb-2">Asignaciones</h2>
          <div className="border rounded">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left w-32">Persona</th>
                  <th className="px-3 py-2 text-left w-32">Geocerca</th>
                  <th className="px-3 py-2 text-left w-32">Actividad</th>
                  <th className="px-3 py-2 text-left w-24">Inicio</th>
                  <th className="px-3 py-2 text-left w-24">Fin</th>
                  <th className="px-3 py-2 text-left w-24">Freq (min)</th>
                  <th className="px-3 py-2 text-left w-24">Estado</th>
                  <th className="px-3 py-2 text-left w-28">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-4 text-center text-gray-500"
                    >
                      Cargando...
                    </td>
                  </tr>
                ) : filteredAsignaciones.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-4 text-center text-gray-500"
                    >
                      No hay asignaciones.
                    </td>
                  </tr>
                ) : (
                  filteredAsignaciones.map((a) => {
                    const estadoAsignacion = a.estado ?? a.status ?? "activo";
                    const frecuenciaSeg =
                      a.frecuencia_envio_sec ?? a.frequency_sec ?? null;
                    const frecuenciaMin =
                      frecuenciaSeg != null
                        ? Math.round(frecuenciaSeg / 60)
                        : null;

                    const startValue = a.start_date || a.start_time;
                    const endValue = a.end_date || a.end_time;

                    return (
                      <tr key={a.id} className="border-t">
                        <td className="px-3 py-2 truncate">
                          {personalMap[a.personal_id] || "—"}
                        </td>
                        <td className="px-3 py-2 truncate">
                          {geocercaMap[a.geocerca_id] || "—"}
                        </td>
                        <td className="px-3 py-2 truncate">
                          {a.activity_id
                            ? activityMap[a.activity_id] || "—"
                            : "Sin actividad"}
                        </td>
                        <td className="px-3 py-2">
                          {formatDateInput(startValue)}
                        </td>
                        <td className="px-3 py-2">
                          {formatDateInput(endValue)}
                        </td>
                        <td className="px-3 py-2">
                          {frecuenciaMin ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {estadoAsignacion === "activo"
                            ? "Activo"
                            : "Inactivo"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              className="px-2 py-1 text-xs rounded bg-blue-600 text-white disabled:bg-gray-400"
                              disabled={!isAdminOrOwner}
                              onClick={() => handleStartEdit(a)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1 text-xs rounded bg-red-600 text-white disabled:bg-gray-400"
                              disabled={!isAdminOrOwner}
                              onClick={() => handleDelete(a)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {filteredAsignaciones.length} asignaciones
          </div>
        </div>

        {/* Formulario + nueva actividad */}
        <div>
          <h2 className="text-lg font-medium mb-2">
            {editingId ? "Editar asignación" : "Nueva asignación"}
          </h2>
          {!isAdminOrOwner && (
            <p className="mb-2 text-xs text-yellow-700 bg-yellow-50 px-3 py-2 rounded">
              Solo el owner o un admin pueden crear o editar asignaciones.
            </p>
          )}
          <form
            onSubmit={handleSubmit}
            className="border rounded px-4 py-3 space-y-3 mb-4"
          >
            <div>
              <label className="block text-sm font-medium mb-1">
                Persona
              </label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={personaId}
                onChange={(e) => setPersonaId(e.target.value)}
              >
                <option value="">Selecciona una persona</option>
                {personal.map((p) => {
                  const firstName =
                    p.nombres ??
                    p.nombre ??
                    p.first_name ??
                    p.full_name ??
                    "";
                  const lastName = p.apellidos ?? p.last_name ?? "";
                  const fullName = `${firstName} ${lastName}`.trim();
                  const label =
                    fullName || p.email || p.telefono || "Sin nombre";
                  return (
                    <option key={p.id} value={p.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Geocerca
              </label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={geocercaId}
                onChange={(e) => setGeocercaId(e.target.value)}
              >
                <option value="">Selecciona una geocerca</option>
                {geocercas.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre || g.name || "Sin nombre"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Actividad (opcional)
              </label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={activityId}
                onChange={(e) => setActivityId(e.target.value)}
              >
                <option value="">(Sin actividad)</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Fecha inicio
                </label>
                <input
                  type="date"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Fecha fin
                </label>
                <input
                  type="date"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Frecuencia (min)
                </label>
                <input
                  type="number"
                  min={1}
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={frecuenciaMin}
                  onChange={(e) => setFrecuenciaMin(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Estado
                </label>
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex gap-2 flex-wrap">
              <button
                type="submit"
                disabled={saving || !isAdminOrOwner}
                className="inline-flex items-center justify-center px-4 py-2 rounded bg-emerald-600 text-white text-sm font-medium disabled:bg-gray-400"
              >
                {saving
                  ? editingId
                    ? "Guardando cambios..."
                    : "Guardando..."
                  : editingId
                  ? "Actualizar asignación"
                  : "Crear asignación"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center justify-center px-4 py-2 rounded border text-sm"
                >
                  Cancelar edición
                </button>
              )}
            </div>
          </form>

          {/* Bloque Nueva actividad */}
          <div className="border rounded px-4 py-3 space-y-2">
            <h3 className="text-sm font-semibold mb-1">
              Nueva actividad rápida
            </h3>
            <p className="text-xs text-gray-500 mb-1">
              Crea una actividad y quedará disponible en la lista de
              actividades. Se marcará como activa.
            </p>
            <form onSubmit={handleCreateActivity} className="space-y-2">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Nombre de la actividad
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={newActivityName}
                  onChange={(e) => setNewActivityName(e.target.value)}
                  placeholder="Ej: Fumigación, Monitoreo, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Descripción (opcional)
                </label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={newActivityDesc}
                  onChange={(e) => setNewActivityDesc(e.target.value)}
                  rows={2}
                />
              </div>
              <button
                type="submit"
                disabled={savingActivity || !isAdminOrOwner}
                className="inline-flex items-center justify-center px-3 py-2 rounded bg-blue-600 text-white text-xs font-medium disabled:bg-gray-400"
              >
                {savingActivity ? "Creando..." : "Crear actividad"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AsignacionesPage;
