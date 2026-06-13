import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "@/context/auth.js";

const mockTareasBase = [
  {
    id: "T-001",
    geocerca: "Campus Norte",
    actividad: "Levantamiento inicial",
    estado: "En progreso",
    avance: 65,
    fechaInicio: "2026-06-01",
    fechaFin: "2026-06-03",
    horasPlanificadas: 24,
    costoPlanificado: 0,
    horasReales: 0,
    costoReal: 0,
    diferenciaHoras: -24,
    diferenciaCosto: 0,
    inicio: 1,
    duracion: 3,
  },
  {
    id: "T-002",
    geocerca: "Campus Norte",
    actividad: "Marcación de perímetro",
    estado: "Pendiente",
    avance: 20,
    fechaInicio: "2026-06-03",
    fechaFin: "2026-06-04",
    horasPlanificadas: 16,
    costoPlanificado: 0,
    horasReales: 0,
    costoReal: 0,
    diferenciaHoras: -16,
    diferenciaCosto: 0,
    inicio: 3,
    duracion: 2,
  },
];

const ganttDias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const periodos = ["Semana", "Mes", "Trimestre", "Semestre", "Año", "Rango personalizado"];
const ESTADOS_PLANIFICACION = ["draft", "approved", "closed", "archived"];
const NUEVA_PLANIFICACION_INICIAL = {
  geofenceId: "",
  activityId: "",
  fechaInicio: "",
  fechaFin: "",
  horasPlanificadas: "",
  costoPlanificado: "",
  estado: "draft",
  notas: "",
};

function getEstadoStyle(estado) {
  if (estado === "Completada") return "bg-emerald-100 text-emerald-700";
  if (estado === "En progreso") return "bg-sky-100 text-sky-700";
  if (estado === "En riesgo") return "bg-amber-100 text-amber-800";
  if (estado === "Archivada") return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

function toEstadoLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "closed") return "Completada";
  if (s === "approved") return "En progreso";
  if (s === "archived") return "Archivada";
  if (s === "draft") return "Pendiente";
  return "Pendiente";
}

function toAvance(status) {
  const s = String(status || "").toLowerCase();
  if (s === "closed") return 100;
  if (s === "approved") return 65;
  if (s === "archived") return 0;
  if (s === "draft") return 20;
  return 30;
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = String(dateStr).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function toTimeline(startDate, endDate) {
  const s = parseLocalDate(startDate);
  const e = endDate ? parseLocalDate(endDate) : s;

  if (!s || Number.isNaN(s.getTime())) {
    return { inicio: 1, duracion: 1 };
  }

  const startWeekday = ((s.getDay() + 6) % 7) + 1;
  let duration = 1;

  if (e && !Number.isNaN(e.getTime())) {
    const diffDays = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
    duration = Math.max(1, Math.min(7, diffDays));
  }

  return { inicio: startWeekday, duracion: duration };
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMetric(value) {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "-";
}

function getRealWorkDate(row) {
  const source = row?.work_date || row?.start_time || row?.end_time;
  if (!source) return null;
  return parseLocalDate(String(source).slice(0, 10));
}

function isDateWithinRange(date, startDate, endDate) {
  if (!date || !startDate || !endDate) return false;
  const d = date.getTime();
  return d >= startDate.getTime() && d <= endDate.getTime();
}

export default function Planificacion() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id || null;
  const [tareasDb, setTareasDb] = useState([]);
  const [geofencesDb, setGeofencesDb] = useState([]);
  const [activitiesDb, setActivitiesDb] = useState([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const [errorDb, setErrorDb] = useState("");
  const [dbReady, setDbReady] = useState(false);
  const [nuevaPlanificacionVisual, setNuevaPlanificacionVisual] = useState(NUEVA_PLANIFICACION_INICIAL);
  const [intentoGuardarVisual, setIntentoGuardarVisual] = useState(false);
  const [savingPlanning, setSavingPlanning] = useState(false);
  const [archivingPlanningId, setArchivingPlanningId] = useState(null);
  const [restoringPlanningId, setRestoringPlanningId] = useState(null);
  const [editingPlanningId, setEditingPlanningId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const loadPlanningData = useCallback(
    async (isActive = () => true) => {
      if (!orgId) {
        if (isActive()) {
          setTareasDb([]);
          setGeofencesDb([]);
          setActivitiesDb([]);
          setErrorDb("");
          setDbReady(false);
          setLoadingDb(false);
        }
        return;
      }

      setLoadingDb(true);
      setErrorDb("");

      try {
        let planningQuery = supabase
          .from("planning_items")
          .select(
            "id, org_id, geofence_id, activity_id, start_date, end_date, planned_hours, planned_cost, status, notes, archived_at"
          )
          .eq("org_id", orgId)
          .order("start_date", { ascending: true });

        planningQuery = showArchived
          ? planningQuery.not("archived_at", "is", null)
          : planningQuery.is("archived_at", null);

        const geofencesQuery = supabase
          .from("geofences")
          .select("id, name, active")
          .eq("org_id", orgId)
          .eq("active", true)
          .order("name", { ascending: true });

        const activitiesQuery = supabase
          .from("activities")
          .select("id, name, active, hourly_rate, currency_code")
          .eq("org_id", orgId)
          .eq("active", true)
          .order("name", { ascending: true });

        const realCostsQuery = supabase
          .from("v_costos_hybrid_preview")
          .select("org_id, geofence_id, activity_id, work_date, start_time, end_time, horas, costo_final, costo_base")
          .eq("org_id", orgId);

        const [planningResult, geofencesResult, activitiesResult, realCostsResult] = await Promise.all([
          planningQuery,
          geofencesQuery,
          activitiesQuery,
          realCostsQuery,
        ]);

        const { data: planningData, error: planningError } = planningResult;
        const { data: geofencesData, error: geofencesError } = geofencesResult;
        const { data: activitiesData, error: activitiesError } = activitiesResult;
        const { data: realCostsData, error: realCostsError } = realCostsResult;

        if (planningError) throw planningError;
        if (geofencesError) throw geofencesError;
        if (activitiesError) throw activitiesError;
        if (realCostsError) throw realCostsError;

        const geofenceNames = new Map(
          (geofencesData || []).map((g) => [String(g.id), g.name || "Geocerca sin nombre"])
        );
        const activityNames = new Map(
          (activitiesData || []).map((a) => [String(a.id), a.name || "Actividad sin nombre"])
        );

        const mapped = (planningData || []).map((row, index) => {
          const timeline = toTimeline(row.start_date, row.end_date);
          const estado = toEstadoLabel(row.status);
          const geofenceId = row.geofence_id ? String(row.geofence_id) : "";
          const activityId = row.activity_id ? String(row.activity_id) : "";
          const planStart = parseLocalDate(row.start_date);
          const planEnd = parseLocalDate(row.end_date) || planStart;
          const matchingReals = (realCostsData || []).filter((real) => {
            const realGeofenceId = real.geofence_id ? String(real.geofence_id) : "";
            const realActivityId = real.activity_id ? String(real.activity_id) : "";
            if (realGeofenceId !== geofenceId || realActivityId !== activityId) return false;

            const realDate = getRealWorkDate(real);
            return isDateWithinRange(realDate, planStart, planEnd);
          });
          const horasReales = matchingReals.reduce((acc, real) => acc + toNumber(real.horas), 0);
          const costoReal = matchingReals.reduce(
            (acc, real) => acc + toNumber(real.costo_final ?? real.costo_base),
            0
          );
          const diferenciaHoras = horasReales - toNumber(row.planned_hours);
          const diferenciaCosto = costoReal - toNumber(row.planned_cost);

          return {
            dbId: row.id || null,
            id: row.id ? `P-${String(row.id).slice(0, 6).toUpperCase()}` : `P-${index + 1}`,
            geofenceId,
            activityId,
            geocerca: geofenceId
              ? geofenceNames.get(geofenceId) || `Geocerca ${geofenceId.slice(0, 8)}`
              : "Geocerca sin definir",
            actividad: activityId
              ? activityNames.get(activityId) || `Actividad ${activityId.slice(0, 8)}`
              : "Actividad sin definir",
            fechaInicio: row.start_date,
            fechaFin: row.end_date,
            horasPlanificadas: row.planned_hours,
            costoPlanificado: row.planned_cost,
            horasReales,
            costoReal,
            diferenciaHoras,
            diferenciaCosto,
            notes: row.notes || "",
            statusRaw: row.status,
            archivedAt: row.archived_at,
            estado,
            avance: toAvance(row.status),
            inicio: timeline.inicio,
            duracion: timeline.duracion,
          };
        });

        if (isActive()) {
          setTareasDb(mapped);
          setGeofencesDb(geofencesData || []);
          setActivitiesDb(activitiesData || []);
          setDbReady(true);
        }
      } catch (err) {
        console.error("[Planificacion] Error cargando datos de planificación:", err);
        if (isActive()) {
          setErrorDb("No se pudo cargar planificación desde Supabase. Mostrando demo local.");
          setTareasDb([]);
          setGeofencesDb([]);
          setActivitiesDb([]);
          setDbReady(false);
        }
      } finally {
        if (isActive()) {
          setLoadingDb(false);
        }
      }
    },
    [orgId, showArchived]
  );

  useEffect(() => {
    if (!orgId) {
      setTareasDb([]);
      setGeofencesDb([]);
      setActivitiesDb([]);
      setErrorDb("");
      setDbReady(false);
      return;
    }

    let isActive = true;
    loadPlanningData(() => isActive);

    return () => {
      isActive = false;
    };
  }, [orgId, loadPlanningData]);

  const tareas = useMemo(() => {
    if (dbReady) return tareasDb;
    return mockTareasBase;
  }, [dbReady, tareasDb]);

  const actividadSeleccionada = useMemo(
    () => activitiesDb.find((activity) => String(activity.id) === nuevaPlanificacionVisual.activityId) || null,
    [activitiesDb, nuevaPlanificacionVisual.activityId]
  );

  const total = tareas.length;
  const completadas = tareas.filter((t) => t.estado === "Completada").length;
  const enProgreso = tareas.filter((t) => t.estado === "En progreso").length;
  const avancePromedio = total > 0 ? Math.round(tareas.reduce((acc, t) => acc + t.avance, 0) / total) : 0;
  const planVsRealKpis = useMemo(() => {
    const totalHorasPlanificadas = tareas.reduce((acc, tarea) => acc + toNumber(tarea.horasPlanificadas), 0);
    const totalHorasReales = tareas.reduce((acc, tarea) => acc + toNumber(tarea.horasReales), 0);
    const totalCostoPlanificado = tareas.reduce((acc, tarea) => acc + toNumber(tarea.costoPlanificado), 0);
    const totalCostoReal = tareas.reduce((acc, tarea) => acc + toNumber(tarea.costoReal), 0);
    const diferenciaHoras = totalHorasReales - totalHorasPlanificadas;
    const diferenciaCosto = totalCostoReal - totalCostoPlanificado;
    const cumplimientoHoras = totalHorasPlanificadas > 0 ? (totalHorasReales / totalHorasPlanificadas) * 100 : null;

    return {
      totalHorasPlanificadas,
      totalHorasReales,
      diferenciaHoras,
      totalCostoPlanificado,
      totalCostoReal,
      diferenciaCosto,
      cumplimientoHoras,
    };
  }, [tareas]);

  const mostrandoDemo = !dbReady;
  const sinDatosReales = dbReady && tareas.length === 0;
  const rawTarifaActividad = actividadSeleccionada?.hourly_rate;
  const tarifaActividad = Number(rawTarifaActividad);
  const tieneTarifaAutomatica =
    nuevaPlanificacionVisual.activityId !== "" &&
    rawTarifaActividad !== null &&
    rawTarifaActividad !== undefined &&
    rawTarifaActividad !== "" &&
    Number.isFinite(tarifaActividad) &&
    tarifaActividad >= 0;
  const monedaActividad = actividadSeleccionada?.currency_code || null;

  const erroresNuevaPlanificacion = useMemo(() => {
    const errors = {};
    const form = nuevaPlanificacionVisual;

    if (!form.geofenceId) errors.geofenceId = "Selecciona una geocerca.";
    if (!form.activityId) errors.activityId = "Selecciona una actividad.";
    if (!form.fechaInicio) errors.fechaInicio = "Ingresa fecha de inicio.";
    if (!form.fechaFin) errors.fechaFin = "Ingresa fecha de fin.";

    if (form.fechaInicio && form.fechaFin) {
      const start = parseLocalDate(form.fechaInicio);
      const end = parseLocalDate(form.fechaFin);
      if (!start || !end) {
        errors.fechas = "Formato de fechas inválido.";
      } else if (end.getTime() < start.getTime()) {
        errors.fechas = "La fecha fin no puede ser anterior a la fecha inicio.";
      }
    }

    if (form.horasPlanificadas === "") {
      errors.horasPlanificadas = "Ingresa horas planificadas.";
    } else {
      const horas = Number(form.horasPlanificadas);
      if (!Number.isFinite(horas) || horas < 0) {
        errors.horasPlanificadas = "Las horas deben ser un número mayor o igual a 0.";
      }
    }

    if (form.costoPlanificado === "") {
      errors.costoPlanificado = "Ingresa costo planificado.";
    } else {
      const costo = Number(form.costoPlanificado);
      if (!Number.isFinite(costo) || costo < 0) {
        errors.costoPlanificado = "El costo debe ser un número mayor o igual a 0.";
      }
    }

    if (!ESTADOS_PLANIFICACION.includes(form.estado)) {
      errors.estado = "Estado inválido.";
    }

    return errors;
  }, [nuevaPlanificacionVisual]);

  const formularioVisualValido = Object.keys(erroresNuevaPlanificacion).length === 0;
  const claseCampoBase = "mt-1 rounded-lg border px-3 py-2 text-sm normal-case text-slate-700";
  const getClaseCampo = (errorKey) =>
    `${claseCampoBase} ${
      intentoGuardarVisual && erroresNuevaPlanificacion[errorKey] ? "border-rose-400 bg-rose-50" : "border-slate-300 bg-white"
    }`;

  const handleCancelarVisual = () => {
    setNuevaPlanificacionVisual(NUEVA_PLANIFICACION_INICIAL);
    setIntentoGuardarVisual(false);
    setEditingPlanningId(null);
  };

  const handleEditarPlanificacion = (tarea) => {
    if (!tarea?.dbId) return;

    setEditingPlanningId(tarea.dbId);
    setIntentoGuardarVisual(false);
    setNuevaPlanificacionVisual({
      geofenceId: tarea.geofenceId || "",
      activityId: tarea.activityId || "",
      fechaInicio: tarea.fechaInicio || "",
      fechaFin: tarea.fechaFin || "",
      horasPlanificadas:
        tarea.horasPlanificadas === null || tarea.horasPlanificadas === undefined ? "" : String(tarea.horasPlanificadas),
      costoPlanificado:
        tarea.costoPlanificado === null || tarea.costoPlanificado === undefined ? "" : String(tarea.costoPlanificado),
      estado: tarea.statusRaw || "draft",
      notas: tarea.notes || "",
    });
  };

  useEffect(() => {
    const horas = Number(nuevaPlanificacionVisual.horasPlanificadas);

    if (!tieneTarifaAutomatica || nuevaPlanificacionVisual.horasPlanificadas === "") {
      return;
    }

    if (!Number.isFinite(horas) || horas < 0) {
      return;
    }

    const costoCalculado = (horas * tarifaActividad).toFixed(2);
    setNuevaPlanificacionVisual((prev) =>
      prev.costoPlanificado === costoCalculado ? prev : { ...prev, costoPlanificado: costoCalculado }
    );
  }, [nuevaPlanificacionVisual.horasPlanificadas, tarifaActividad, tieneTarifaAutomatica]);

  const handleGuardarVisual = async () => {
    setIntentoGuardarVisual(true);
    if (!formularioVisualValido) {
      window.alert("Completa los campos requeridos antes de guardar.");
      return;
    }

    if (!orgId) {
      window.alert("No hay organización activa para guardar planificación.");
      return;
    }

    setSavingPlanning(true);
    try {
      const payload = {
        org_id: orgId,
        geofence_id: nuevaPlanificacionVisual.geofenceId,
        activity_id: nuevaPlanificacionVisual.activityId,
        start_date: nuevaPlanificacionVisual.fechaInicio,
        end_date: nuevaPlanificacionVisual.fechaFin,
        planned_hours: Number(nuevaPlanificacionVisual.horasPlanificadas),
        planned_cost: Number(nuevaPlanificacionVisual.costoPlanificado),
        status: nuevaPlanificacionVisual.estado,
        notes: nuevaPlanificacionVisual.notas?.trim() || null,
      };

      if (editingPlanningId) {
        const { error } = await supabase
          .from("planning_items")
          .update({
            ...payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingPlanningId)
          .eq("org_id", orgId);

        if (error) throw error;

        await loadPlanningData();
        setNuevaPlanificacionVisual(NUEVA_PLANIFICACION_INICIAL);
        setIntentoGuardarVisual(false);
        setEditingPlanningId(null);
        window.alert("Planificación actualizada correctamente.");
        return;
      }

      const { error } = await supabase.from("planning_items").insert(payload);
      if (error) throw error;

      await loadPlanningData();
      setNuevaPlanificacionVisual(NUEVA_PLANIFICACION_INICIAL);
      setIntentoGuardarVisual(false);
      window.alert("Planificación guardada correctamente.");
    } catch (err) {
      console.error("[Planificacion] Error guardando planificación:", err);
      window.alert("No se pudo guardar la planificación.");
    } finally {
      setSavingPlanning(false);
    }
  };

  const handleArchivarPlanificacion = async (tarea) => {
    if (!tarea?.dbId || !orgId) return;

    const confirmado = window.confirm(`Archivar la planificación ${tarea.id}? Esta acción la ocultará de la lista activa.`);
    if (!confirmado) return;

    setArchivingPlanningId(tarea.dbId);
    try {
      const { error } = await supabase
        .from("planning_items")
        .update({
          status: "archived",
          archived_at: new Date().toISOString(),
        })
        .eq("id", tarea.dbId)
        .eq("org_id", orgId);

      if (error) throw error;

      await loadPlanningData();
      window.alert("Planificación archivada correctamente.");
    } catch (err) {
      console.error("[Planificacion] Error archivando planificación:", err);
      window.alert("No se pudo archivar la planificación.");
    } finally {
      setArchivingPlanningId(null);
    }
  };

  const handleRestaurarPlanificacion = async (tarea) => {
    if (!tarea?.dbId || !orgId) return;

    const confirmado = window.confirm(`Restaurar la planificación ${tarea.id}? Volverá como borrador en la lista activa.`);
    if (!confirmado) return;

    setRestoringPlanningId(tarea.dbId);
    try {
      const { error } = await supabase
        .from("planning_items")
        .update({
          status: "draft",
          archived_at: null,
        })
        .eq("id", tarea.dbId)
        .eq("org_id", orgId);

      if (error) throw error;

      await loadPlanningData();
      window.alert("Planificación restaurada correctamente.");
    } catch (err) {
      console.error("[Planificacion] Error restaurando planificación:", err);
      window.alert("No se pudo restaurar la planificación.");
    } finally {
      setRestoringPlanningId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl bg-gradient-to-r from-cyan-700 via-teal-700 to-emerald-700 p-6 text-white shadow-lg">
          <h1 className="text-2xl font-bold sm:text-3xl">Planificación Operativa</h1>
          <p className="mt-2 text-sm text-cyan-50 sm:text-base">
            Vista conectada a Preview con planificación, archivado y comparación básica Plan vs Real.
          </p>
        </header>

        {loadingDb ? (
          <section className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
            Cargando planificación desde Supabase...
          </section>
        ) : null}

        {errorDb ? (
          <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {errorDb}
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Período</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {periodos.map((periodo) => (
                  <button
                    key={periodo}
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      periodo === "Semana" ? "border-cyan-600 bg-cyan-50 text-cyan-700" : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {periodo}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
                Desde
                <input
                  type="date"
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
                  defaultValue="2026-06-01"
                />
              </label>
              <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
                Hasta
                <input
                  type="date"
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
                  defaultValue="2026-06-30"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Total de tareas</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{total}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Completadas</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-600">{completadas}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">En progreso</p>
            <p className="mt-1 text-2xl font-semibold text-sky-600">{enProgreso}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Avance promedio</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{avancePromedio}%</p>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Horas planificadas</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatMetric(planVsRealKpis.totalHorasPlanificadas)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Horas reales</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatMetric(planVsRealKpis.totalHorasReales)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Dif. horas</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatMetric(planVsRealKpis.diferenciaHoras)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">% cumplimiento horas</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {planVsRealKpis.cumplimientoHoras === null ? "-" : `${formatMetric(planVsRealKpis.cumplimientoHoras)}%`}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Costo planificado</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatMetric(planVsRealKpis.totalCostoPlanificado)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Costo real</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatMetric(planVsRealKpis.totalCostoReal)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Dif. costo</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatMetric(planVsRealKpis.diferenciaCosto)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Modo actual</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{showArchived ? "Archivadas" : "Activas"}</p>
          </article>
        </section>

        {!showArchived ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingPlanningId ? "Editar planificación" : "Nueva planificación"}
              </h2>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Preview</span>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              {editingPlanningId
                ? "Editando planificación activa. Al guardar, se actualiza el registro en Preview."
                : "Formulario en Preview con validación local y guardado en `planning_items`."}
            </p>
            {intentoGuardarVisual && !formularioVisualValido ? (
              <section className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                Revisa los campos marcados para continuar.
              </section>
            ) : null}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
                Geocerca
                <select
                  value={nuevaPlanificacionVisual.geofenceId}
                  onChange={(e) => setNuevaPlanificacionVisual((prev) => ({ ...prev, geofenceId: e.target.value }))}
                  className={getClaseCampo("geofenceId")}
                >
                  <option value="">Seleccionar geocerca</option>
                  {geofencesDb.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name || "Geocerca sin nombre"}
                    </option>
                  ))}
                </select>
                {intentoGuardarVisual && erroresNuevaPlanificacion.geofenceId ? (
                  <span className="mt-1 text-xs normal-case text-rose-600">{erroresNuevaPlanificacion.geofenceId}</span>
                ) : null}
              </label>

              <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
                Actividad
                <select
                  value={nuevaPlanificacionVisual.activityId}
                  onChange={(e) => setNuevaPlanificacionVisual((prev) => ({ ...prev, activityId: e.target.value }))}
                  className={getClaseCampo("activityId")}
                >
                  <option value="">Seleccionar actividad</option>
                  {activitiesDb.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || "Actividad sin nombre"}
                    </option>
                  ))}
                </select>
                {intentoGuardarVisual && erroresNuevaPlanificacion.activityId ? (
                  <span className="mt-1 text-xs normal-case text-rose-600">{erroresNuevaPlanificacion.activityId}</span>
                ) : null}
              </label>

              <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
                Fecha inicio
                <input
                  type="date"
                  value={nuevaPlanificacionVisual.fechaInicio}
                  onChange={(e) => setNuevaPlanificacionVisual((prev) => ({ ...prev, fechaInicio: e.target.value }))}
                  className={getClaseCampo("fechaInicio")}
                />
                {intentoGuardarVisual && erroresNuevaPlanificacion.fechaInicio ? (
                  <span className="mt-1 text-xs normal-case text-rose-600">{erroresNuevaPlanificacion.fechaInicio}</span>
                ) : null}
              </label>

              <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
                Fecha fin
                <input
                  type="date"
                  value={nuevaPlanificacionVisual.fechaFin}
                  onChange={(e) => setNuevaPlanificacionVisual((prev) => ({ ...prev, fechaFin: e.target.value }))}
                  className={getClaseCampo("fechaFin")}
                />
                {intentoGuardarVisual && erroresNuevaPlanificacion.fechaFin ? (
                  <span className="mt-1 text-xs normal-case text-rose-600">{erroresNuevaPlanificacion.fechaFin}</span>
                ) : null}
                {intentoGuardarVisual && erroresNuevaPlanificacion.fechas ? (
                  <span className="mt-1 text-xs normal-case text-rose-600">{erroresNuevaPlanificacion.fechas}</span>
                ) : null}
              </label>

              <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
                Horas planificadas
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="0"
                  value={nuevaPlanificacionVisual.horasPlanificadas}
                  onChange={(e) =>
                    setNuevaPlanificacionVisual((prev) => ({
                      ...prev,
                      horasPlanificadas: e.target.value,
                    }))
                  }
                  className={getClaseCampo("horasPlanificadas")}
                />
                {intentoGuardarVisual && erroresNuevaPlanificacion.horasPlanificadas ? (
                  <span className="mt-1 text-xs normal-case text-rose-600">{erroresNuevaPlanificacion.horasPlanificadas}</span>
                ) : null}
              </label>

              <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
                Costo planificado
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={nuevaPlanificacionVisual.costoPlanificado}
                  onChange={(e) =>
                    setNuevaPlanificacionVisual((prev) => ({
                      ...prev,
                      costoPlanificado: e.target.value,
                    }))
                  }
                  readOnly={tieneTarifaAutomatica}
                  className={getClaseCampo("costoPlanificado")}
                />
                {intentoGuardarVisual && erroresNuevaPlanificacion.costoPlanificado ? (
                  <span className="mt-1 text-xs normal-case text-rose-600">{erroresNuevaPlanificacion.costoPlanificado}</span>
                ) : null}
                <span className="mt-1 text-xs normal-case text-slate-500">
                  {tieneTarifaAutomatica
                    ? `Se calcula automáticamente según tarifa de actividad y horas${monedaActividad ? ` (${monedaActividad})` : ""}.`
                    : `Sin tarifa por hora${monedaActividad ? ` (${monedaActividad})` : ""}. Ingresa el costo manualmente.`}
                </span>
              </label>

              <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
                Estado
                <select
                  value={nuevaPlanificacionVisual.estado}
                  onChange={(e) => setNuevaPlanificacionVisual((prev) => ({ ...prev, estado: e.target.value }))}
                  className={getClaseCampo("estado")}
                >
                  <option value="draft">Pendiente</option>
                  <option value="approved">En progreso</option>
                  <option value="closed">Completada</option>
                  <option value="archived">Archivada</option>
                </select>
                {intentoGuardarVisual && erroresNuevaPlanificacion.estado ? (
                  <span className="mt-1 text-xs normal-case text-rose-600">{erroresNuevaPlanificacion.estado}</span>
                ) : null}
              </label>

              <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500 xl:col-span-4">
                Notas
                <textarea
                  rows={3}
                  placeholder="Notas operativas"
                  value={nuevaPlanificacionVisual.notas}
                  onChange={(e) => setNuevaPlanificacionVisual((prev) => ({ ...prev, notas: e.target.value }))}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case text-slate-700"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCancelarVisual}
                disabled={savingPlanning}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarVisual}
                disabled={savingPlanning}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {savingPlanning ? "Guardando..." : editingPlanningId ? "Guardar edición" : "Guardar planificación"}
              </button>
              <span className="text-xs text-slate-500">
                {editingPlanningId
                  ? "Al guardar, se actualiza la planificación activa en Preview."
                  : "Al guardar, se inserta en Preview y se recarga la lista."}
              </span>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {showArchived ? "Planificaciones archivadas" : "Planificaciones activas"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {showArchived
                  ? "Historial de planificaciones archivadas. Solo lectura."
                  : "Planificaciones activas con comparación básica Plan vs Real."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-500">{mostrandoDemo ? "Datos demo locales" : "Datos reales Preview"}</span>
              <button
                type="button"
                onClick={() => setShowArchived((prev) => !prev)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {showArchived ? "Ver activas" : "Ver archivadas"}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Geocerca</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Actividad</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Fecha inicio</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Fecha fin</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Horas planificadas</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Costo planificado</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Horas reales</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Costo real</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Dif. horas</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Dif. costo</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Estado</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {sinDatosReales ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={13}>
                      {showArchived
                        ? "No hay planificaciones archivadas para esta organización."
                        : "No hay planificación registrada para esta organización."}
                    </td>
                  </tr>
                ) : (
                  tareas.map((tarea) => (
                    <tr key={tarea.id}>
                      <td className="px-3 py-2 text-slate-700">{tarea.id}</td>
                      <td className="px-3 py-2 text-slate-700">{tarea.geocerca || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{tarea.actividad}</td>
                      <td className="px-3 py-2 text-slate-700">{tarea.fechaInicio || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{tarea.fechaFin || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{tarea.horasPlanificadas ?? "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{tarea.costoPlanificado ?? "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{formatMetric(tarea.horasReales)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatMetric(tarea.costoReal)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatMetric(tarea.diferenciaHoras)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatMetric(tarea.diferenciaCosto)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getEstadoStyle(tarea.estado)}`}>
                          {tarea.estado}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {tarea.dbId && !showArchived ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditarPlanificacion(tarea)}
                              disabled={archivingPlanningId === tarea.dbId || editingPlanningId === tarea.dbId}
                              className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleArchivarPlanificacion(tarea)}
                              disabled={archivingPlanningId === tarea.dbId}
                              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {archivingPlanningId === tarea.dbId ? "Archivando..." : "Archivar"}
                            </button>
                          </div>
                        ) : tarea.dbId && showArchived ? (
                          <button
                            type="button"
                            onClick={() => handleRestaurarPlanificacion(tarea)}
                            disabled={restoringPlanningId === tarea.dbId}
                            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {restoringPlanningId === tarea.dbId ? "Restaurando..." : "Restaurar"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Vista temporal simple</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">
            {showArchived
              ? "Escala semanal de días calendario para planificaciones archivadas."
              : "Escala semanal de días calendario. Permite planificar de lunes a domingo, incluyendo sábado y domingo."}
          </p>

          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[220px_repeat(7,minmax(70px,1fr))] gap-2 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <div>Tarea</div>
                {ganttDias.map((dia) => (
                  <div key={dia} className="text-center">
                    {dia}
                  </div>
                ))}
              </div>

              <div className="mt-2 space-y-2">
                {tareas.map((tarea) => {
                  const inicio = Math.max(1, tarea.inicio);
                  const fin = Math.min(7, inicio + tarea.duracion - 1);
                  return (
                    <div key={`gantt-${tarea.id}`} className="grid grid-cols-[220px_repeat(7,minmax(70px,1fr))] items-center gap-2">
                      <div className="truncate text-sm text-slate-700">{tarea.actividad}</div>
                      {ganttDias.map((_, idx) => {
                        const dia = idx + 1;
                        const activa = dia >= inicio && dia <= fin;
                        return (
                          <div key={`${tarea.id}-${dia}`} className="h-8 rounded-md border border-slate-200 bg-slate-50 p-1">
                            {activa ? (
                              <div className="flex h-full items-center justify-center rounded bg-teal-600 text-[10px] font-semibold text-white">
                                {tarea.id}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
