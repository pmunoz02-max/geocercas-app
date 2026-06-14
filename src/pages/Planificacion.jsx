import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";
import { useAuth } from "@/context/auth.js";

const mockTareasBase = [
  {
    id: "T-001",
    geofenceId: "mock-campus-norte",
    activityId: "mock-levantamiento",
    geocerca: "Campus Norte",
    actividad: "Levantamiento inicial",
    estado: "En progreso",
    statusRaw: "approved",
    avance: 65,
    fechaInicio: "2026-06-01",
    fechaFin: "2026-06-03",
    horasPlanificadas: 24,
    costoPlanificado: 0,
    horasReales: 0,
    costoReal: 0,
    diferenciaHoras: -24,
    diferenciaCosto: 0,
    desviacionHorasPct: getDeviationPercent(0, 24),
    desviacionCostoPct: getDeviationPercent(0, 0),
    semaforoPlanVsReal: getTrafficLightFromDeviation(getDeviationPercent(0, 24), getDeviationPercent(0, 0)),
    inicio: 1,
    duracion: 3,
  },
  {
    id: "T-002",
    geofenceId: "mock-campus-norte",
    activityId: "mock-marcacion",
    geocerca: "Campus Norte",
    actividad: "Marcación de perímetro",
    estado: "Pendiente",
    statusRaw: "draft",
    avance: 20,
    fechaInicio: "2026-06-03",
    fechaFin: "2026-06-04",
    horasPlanificadas: 16,
    costoPlanificado: 0,
    horasReales: 0,
    costoReal: 0,
    diferenciaHoras: -16,
    diferenciaCosto: 0,
    desviacionHorasPct: getDeviationPercent(0, 16),
    desviacionCostoPct: getDeviationPercent(0, 0),
    semaforoPlanVsReal: getTrafficLightFromDeviation(getDeviationPercent(0, 16), getDeviationPercent(0, 0)),
    inicio: 3,
    duracion: 2,
  },
];

const PERIODO_RANGO_PERSONALIZADO = "Rango personalizado";
const PERIODO_ANALISIS_INICIAL = PERIODO_RANGO_PERSONALIZADO;
const periodos = ["Semana", "Mes", "Trimestre", "Semestre", "Año", PERIODO_RANGO_PERSONALIZADO];
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

const FILTROS_PLANIFICACION_INICIAL = {
  semaforo: "all",
  geofenceId: "all",
  activityId: "all",
  estado: "all",
  fechaDesde: "",
  fechaHasta: "",
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

function formatDateInput(date) {
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getPeriodoAnalisisRange(periodo, baseDate = new Date()) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  let start = null;
  let end = null;

  if (periodo === "Semana") {
    const mondayOffset = (baseDate.getDay() + 6) % 7;
    start = new Date(year, month, baseDate.getDate() - mondayOffset);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  }

  if (periodo === "Mes") {
    start = new Date(year, month, 1);
    end = new Date(year, month + 1, 0);
  }

  if (periodo === "Trimestre") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    start = new Date(year, quarterStartMonth, 1);
    end = new Date(year, quarterStartMonth + 3, 0);
  }

  if (periodo === "Semestre") {
    const semesterStartMonth = month < 6 ? 0 : 6;
    start = new Date(year, semesterStartMonth, 1);
    end = new Date(year, semesterStartMonth + 6, 0);
  }

  if (periodo === "Año") {
    start = new Date(year, 0, 1);
    end = new Date(year, 11, 31);
  }

  return {
    fechaDesde: formatDateInput(start),
    fechaHasta: formatDateInput(end),
  };
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getMonthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getDaysDiffInclusive(start, end) {
  if (!start || !end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function normalizeDateRange(start, end) {
  if (!start || !end) return { start: null, end: null };
  if (end.getTime() < start.getTime()) {
    return { start: end, end: start };
  }

  return { start, end };
}

function minDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

function maxDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

function getTaskDateRange(tareas) {
  return tareas.reduce(
    (acc, tarea) => {
      const start = parseLocalDate(tarea.fechaInicio);
      const end = parseLocalDate(tarea.fechaFin) || start;

      if (!start) return acc;

      return {
        start: minDate(acc.start, start),
        end: maxDate(acc.end, end || start),
      };
    },
    { start: null, end: null }
  );
}

function rangesOverlap(startA, endA, startB, endB) {
  if (!startA || !startB || !endB) return false;
  const safeEndA = endA || startA;

  return safeEndA.getTime() >= startB.getTime() && startA.getTime() <= endB.getTime();
}

function formatShortDate(date) {
  if (!date) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${day}/${month}`;
}

const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function planningT(tr, key, defaultValue, values = {}) {
  return tr(`planning.${key}`, { defaultValue, ...values });
}

function getMonthLabel(monthIndex, tr) {
  const keys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  return planningT(tr, `calendar.monthsShort.${keys[monthIndex]}`, monthLabels[monthIndex] || "", {});
}

function getWeekdayLabel(dayIndex, tr) {
  const labels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return planningT(tr, `calendar.weekdaysShort.${keys[dayIndex]}`, labels[dayIndex] || "", {});
}

function getPeriodoLabel(periodo, tr) {
  if (periodo === "Semana") return planningT(tr, "periods.week", "Semana");
  if (periodo === "Mes") return planningT(tr, "periods.month", "Mes");
  if (periodo === "Trimestre") return planningT(tr, "periods.quarter", "Trimestre");
  if (periodo === "Semestre") return planningT(tr, "periods.semester", "Semestre");
  if (periodo === "Año") return planningT(tr, "periods.year", "Año");
  return planningT(tr, "periods.custom", "Rango personalizado");
}

function getStatusDisplayLabel(status, tr, fallback = "Pendiente") {
  const s = String(status || "").toLowerCase();
  if (s === "closed") return planningT(tr, "status.closed", "Completada");
  if (s === "approved") return planningT(tr, "status.approved", "En progreso");
  if (s === "archived") return planningT(tr, "status.archived", "Archivada");
  if (s === "draft") return planningT(tr, "status.draft", "Pendiente");
  return fallback;
}

function getTrafficLightDisplayLabel(level, tr) {
  if (level === "green") return planningT(tr, "traffic.green", "En rango");
  if (level === "yellow") return planningT(tr, "traffic.yellow", "Desviación moderada");
  if (level === "red") return planningT(tr, "traffic.red", "Desviación alta");
  return planningT(tr, "traffic.none", "Sin base");
}

function getTrafficLightDisplayDescription(level, tr) {
  if (level === "green") return planningT(tr, "trafficDescriptions.green", "Desviación hasta 10%.");
  if (level === "yellow") return planningT(tr, "trafficDescriptions.yellow", "Desviación mayor a 10% y hasta 25%.");
  if (level === "red") return planningT(tr, "trafficDescriptions.red", "Desviación mayor a 25%.");
  return planningT(tr, "trafficDescriptions.none", "No hay base planificada suficiente.");
}

function getGanttScale(periodo, start, end) {
  const totalDays = getDaysDiffInclusive(start, end);

  if (periodo === "Semana") return "day";
  if (periodo === "Mes") return "week";
  if (periodo === "Trimestre" || periodo === "Semestre" || periodo === "Año") return "month";
  if (totalDays <= 31) return "day";
  if (totalDays <= 120) return "week";

  return "month";
}

function getGanttColumnWidth(scale) {
  if (scale === "day") return 76;
  if (scale === "week") return 96;
  return 104;
}

function getGanttTitle(periodo, scale, tr) {
  if (periodo === "Semana") return planningT(tr, "gantt.titles.week", "Gantt operativo semanal");
  if (periodo === "Mes") return planningT(tr, "gantt.titles.month", "Gantt operativo mensual");
  if (periodo === "Trimestre") return planningT(tr, "gantt.titles.quarter", "Gantt operativo trimestral");
  if (periodo === "Semestre") return planningT(tr, "gantt.titles.semester", "Gantt operativo semestral");
  if (periodo === "Año") return planningT(tr, "gantt.titles.year", "Gantt operativo anual");
  if (scale === "day") return planningT(tr, "gantt.titles.customDay", "Gantt operativo personalizado por día");
  if (scale === "week") return planningT(tr, "gantt.titles.customWeek", "Gantt operativo personalizado por semana");

  return planningT(tr, "gantt.titles.customMonth", "Gantt operativo personalizado por mes");
}

function getGanttSubtitle(periodo, scale, start, end, showArchived, tr) {
  const mode = showArchived
    ? planningT(tr, "gantt.modes.archived", "planificaciones archivadas")
    : planningT(tr, "gantt.modes.active", "planificaciones activas");
  const rangeLabel = start && end
    ? planningT(tr, "gantt.rangeLabel", " Del {{from}} al {{to}}.", {
        from: formatShortDate(start),
        to: formatShortDate(end),
      })
    : "";

  if (scale === "day") {
    return planningT(tr, "gantt.subtitles.day", "Vista por días calendario para revisar {{mode}}.{{rangeLabel}}", { mode, rangeLabel });
  }

  if (scale === "week") {
    return planningT(tr, "gantt.subtitles.week", "Vista por semanas operativas para revisar {{mode}}.{{rangeLabel}}", { mode, rangeLabel });
  }

  if (periodo === "Trimestre") {
    return planningT(tr, "gantt.subtitles.quarter", "Vista trimestral agrupada por meses para revisar {{mode}}.{{rangeLabel}}", { mode, rangeLabel });
  }

  if (periodo === "Semestre") {
    return planningT(tr, "gantt.subtitles.semester", "Vista semestral agrupada por meses para revisar {{mode}}.{{rangeLabel}}", { mode, rangeLabel });
  }

  if (periodo === "Año") {
    return planningT(tr, "gantt.subtitles.year", "Vista anual agrupada por meses para revisar {{mode}}.{{rangeLabel}}", { mode, rangeLabel });
  }

  return planningT(tr, "gantt.subtitles.month", "Vista agrupada por meses para revisar {{mode}}.{{rangeLabel}}", { mode, rangeLabel });
}

function buildGanttColumns(scale, start, end, tr) {
  const columns = [];

  if (!start || !end) return columns;

  if (scale === "day") {
    let cursor = start;

    while (cursor.getTime() <= end.getTime()) {
      const bucketStart = cursor;
      const bucketEnd = cursor;

      columns.push({
        id: `day-${formatDateInput(bucketStart)}`,
        label: getWeekdayLabel(bucketStart.getDay(), tr),
        sublabel: formatShortDate(bucketStart),
        start: bucketStart,
        end: bucketEnd,
      });

      cursor = addDays(cursor, 1);
    }
  }

  if (scale === "week") {
    let cursor = start;
    let weekNumber = 1;

    while (cursor.getTime() <= end.getTime()) {
      const bucketStart = cursor;
      const bucketEnd = minDate(addDays(cursor, 6), end);

      columns.push({
        id: `week-${formatDateInput(bucketStart)}`,
        label: planningT(tr, "calendar.weekLabel", "Sem {{number}}", { number: weekNumber }),
        sublabel: `${formatShortDate(bucketStart)}-${formatShortDate(bucketEnd)}`,
        start: bucketStart,
        end: bucketEnd,
      });

      cursor = addDays(bucketEnd, 1);
      weekNumber += 1;
    }
  }

  if (scale === "month") {
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);

    while (cursor.getTime() <= end.getTime()) {
      const naturalMonthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const naturalMonthEnd = getMonthEnd(cursor);
      const bucketStart = maxDate(naturalMonthStart, start);
      const bucketEnd = minDate(naturalMonthEnd, end);

      columns.push({
        id: `month-${cursor.getFullYear()}-${cursor.getMonth() + 1}`,
        label: getMonthLabel(cursor.getMonth(), tr),
        sublabel: String(cursor.getFullYear()),
        start: bucketStart,
        end: bucketEnd,
      });

      cursor = addMonths(cursor, 1);
    }
  }

  return columns;
}

function buildGanttConfig(periodo, filtros, tareas, showArchived, tr) {
  const filterRange = normalizeDateRange(parseLocalDate(filtros.fechaDesde), parseLocalDate(filtros.fechaHasta));
  const taskRange = getTaskDateRange(tareas);
  const fallbackRange = getPeriodoAnalisisRange("Semana");
  const fallbackStart = parseLocalDate(fallbackRange.fechaDesde);
  const fallbackEnd = parseLocalDate(fallbackRange.fechaHasta);
  const start = filterRange.start || taskRange.start || fallbackStart;
  const end = filterRange.end || taskRange.end || fallbackEnd || start;
  const safeRange = normalizeDateRange(start, end);
  const scale = getGanttScale(periodo, safeRange.start, safeRange.end);
  const columns = buildGanttColumns(scale, safeRange.start, safeRange.end, tr);
  const columnWidth = getGanttColumnWidth(scale);

  return {
    columns,
    columnWidth,
    minWidth: 220 + Math.max(columns.length, 1) * columnWidth,
    title: getGanttTitle(periodo, scale, tr),
    subtitle: getGanttSubtitle(periodo, scale, safeRange.start, safeRange.end, showArchived, tr),
  };
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

function getDeviationPercent(actual, planned) {
  const plannedNumber = toNumber(planned, 0);
  const actualNumber = toNumber(actual, 0);

  if (plannedNumber <= 0) return null;

  return (Math.abs(actualNumber - plannedNumber) / plannedNumber) * 100;
}

function getTrafficLightFromDeviation(hoursDeviation, costDeviation) {
  const values = [hoursDeviation, costDeviation].filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return {
      level: "none",
      label: "Sin base",
      description: "No hay base planificada suficiente para calcular desviación.",
    };
  }

  const worstDeviation = Math.max(...values);

  if (worstDeviation <= 10) {
    return {
      level: "green",
      label: "En rango",
      description: `Desviación máxima ${worstDeviation.toFixed(2)}%.`,
    };
  }

  if (worstDeviation <= 25) {
    return {
      level: "yellow",
      label: "Desviación moderada",
      description: `Desviación máxima ${worstDeviation.toFixed(2)}%.`,
    };
  }

  return {
    level: "red",
    label: "Desviación alta",
    description: `Desviación máxima ${worstDeviation.toFixed(2)}%.`,
  };
}

function getTrafficLightStyle(level) {
  if (level === "green") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (level === "yellow") return "border-amber-200 bg-amber-50 text-amber-800";
  if (level === "red") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function getTrafficLightIcon(level) {
  if (level === "green") return "🟢";
  if (level === "yellow") return "🟡";
  if (level === "red") return "🔴";
  return "⚪";
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
}

function downloadCsv(filename, rows) {
  const csvContent = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function Planificacion() {
  const { t } = useTranslation();
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
  const [filtrosPlanificacion, setFiltrosPlanificacion] = useState(FILTROS_PLANIFICACION_INICIAL);
  const [periodoAnalisis, setPeriodoAnalisis] = useState(PERIODO_ANALISIS_INICIAL);

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
          const desviacionHorasPct = getDeviationPercent(horasReales, row.planned_hours);
          const desviacionCostoPct = getDeviationPercent(costoReal, row.planned_cost);
          const semaforoPlanVsReal = getTrafficLightFromDeviation(desviacionHorasPct, desviacionCostoPct);

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
            desviacionHorasPct,
            desviacionCostoPct,
            semaforoPlanVsReal,
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
          setErrorDb(t("planning.errors.loadDb", { defaultValue: "No se pudo cargar planificación desde Supabase. Mostrando demo local." }));
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
    [orgId, showArchived, t]
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

  const tareasFiltradas = useMemo(() => {
    const filtroDesde = parseLocalDate(filtrosPlanificacion.fechaDesde);
    const filtroHasta = parseLocalDate(filtrosPlanificacion.fechaHasta);

    return tareas.filter((tarea) => {
      if (filtrosPlanificacion.semaforo !== "all") {
        const level = tarea.semaforoPlanVsReal?.level || "none";
        if (level !== filtrosPlanificacion.semaforo) return false;
      }

      if (filtrosPlanificacion.geofenceId !== "all" && tarea.geofenceId !== filtrosPlanificacion.geofenceId) {
        return false;
      }

      if (filtrosPlanificacion.activityId !== "all" && tarea.activityId !== filtrosPlanificacion.activityId) {
        return false;
      }

      if (filtrosPlanificacion.estado !== "all" && tarea.statusRaw !== filtrosPlanificacion.estado) {
        return false;
      }

      if (filtroDesde || filtroHasta) {
        const tareaInicio = parseLocalDate(tarea.fechaInicio);
        const tareaFin = parseLocalDate(tarea.fechaFin) || tareaInicio;

        if (!tareaInicio || !tareaFin) return false;
        if (filtroDesde && tareaFin.getTime() < filtroDesde.getTime()) return false;
        if (filtroHasta && tareaInicio.getTime() > filtroHasta.getTime()) return false;
      }

      return true;
    });
  }, [filtrosPlanificacion, tareas]);

  const ganttConfig = useMemo(
    () => buildGanttConfig(periodoAnalisis, filtrosPlanificacion, tareasFiltradas, showArchived, t),
    [periodoAnalisis, filtrosPlanificacion, tareasFiltradas, showArchived, t]
  );

  const hayFiltrosPlanificacion = useMemo(
    () =>
      filtrosPlanificacion.semaforo !== "all" ||
      filtrosPlanificacion.geofenceId !== "all" ||
      filtrosPlanificacion.activityId !== "all" ||
      filtrosPlanificacion.estado !== "all" ||
      filtrosPlanificacion.fechaDesde !== "" ||
      filtrosPlanificacion.fechaHasta !== "",
    [filtrosPlanificacion]
  );

  const total = tareasFiltradas.length;
  const completadas = tareasFiltradas.filter((t) => t.estado === "Completada").length;
  const enProgreso = tareasFiltradas.filter((t) => t.estado === "En progreso").length;
  const avancePromedio =
    total > 0 ? Math.round(tareasFiltradas.reduce((acc, t) => acc + t.avance, 0) / total) : 0;
  const planVsRealKpis = useMemo(() => {
    const totalHorasPlanificadas = tareasFiltradas.reduce((acc, tarea) => acc + toNumber(tarea.horasPlanificadas), 0);
    const totalHorasReales = tareasFiltradas.reduce((acc, tarea) => acc + toNumber(tarea.horasReales), 0);
    const totalCostoPlanificado = tareasFiltradas.reduce((acc, tarea) => acc + toNumber(tarea.costoPlanificado), 0);
    const totalCostoReal = tareasFiltradas.reduce((acc, tarea) => acc + toNumber(tarea.costoReal), 0);
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
  }, [tareasFiltradas]);

  const totalesTablaPlanificacion = useMemo(
    () => ({
      horasPlanificadas: planVsRealKpis.totalHorasPlanificadas,
      costoPlanificado: planVsRealKpis.totalCostoPlanificado,
      horasReales: planVsRealKpis.totalHorasReales,
      costoReal: planVsRealKpis.totalCostoReal,
      diferenciaHoras: planVsRealKpis.diferenciaHoras,
      diferenciaCosto: planVsRealKpis.diferenciaCosto,
    }),
    [planVsRealKpis]
  );

  const resumenSemaforoKpis = useMemo(() => {
    const totalSemaforo = tareasFiltradas.length;
    const base = {
      green: 0,
      yellow: 0,
      red: 0,
      none: 0,
    };

    tareasFiltradas.forEach((tarea) => {
      const level = tarea.semaforoPlanVsReal?.level || "none";

      if (base[level] === undefined) {
        base.none += 1;
        return;
      }

      base[level] += 1;
    });

    const pct = (value) => (totalSemaforo > 0 ? (value / totalSemaforo) * 100 : 0);

    return {
      totalSemaforo,
      green: base.green,
      yellow: base.yellow,
      red: base.red,
      none: base.none,
      greenPct: pct(base.green),
      yellowPct: pct(base.yellow),
      redPct: pct(base.red),
      nonePct: pct(base.none),
    };
  }, [tareasFiltradas]);

  const mostrandoDemo = !dbReady;
  const sinDatosReales = tareasFiltradas.length === 0;
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

    if (!form.geofenceId) errors.geofenceId = t("planning.validation.selectGeofence", { defaultValue: "Selecciona una geocerca." });
    if (!form.activityId) errors.activityId = t("planning.validation.selectActivity", { defaultValue: "Selecciona una actividad." });
    if (!form.fechaInicio) errors.fechaInicio = t("planning.validation.startDate", { defaultValue: "Ingresa fecha de inicio." });
    if (!form.fechaFin) errors.fechaFin = t("planning.validation.endDate", { defaultValue: "Ingresa fecha de fin." });

    if (form.fechaInicio && form.fechaFin) {
      const start = parseLocalDate(form.fechaInicio);
      const end = parseLocalDate(form.fechaFin);
      if (!start || !end) {
        errors.fechas = t("planning.validation.invalidDates", { defaultValue: "Formato de fechas inválido." });
      } else if (end.getTime() < start.getTime()) {
        errors.fechas = t("planning.validation.endBeforeStart", { defaultValue: "La fecha fin no puede ser anterior a la fecha inicio." });
      }
    }

    if (form.horasPlanificadas === "") {
      errors.horasPlanificadas = t("planning.validation.plannedHours", { defaultValue: "Ingresa horas planificadas." });
    } else {
      const horas = Number(form.horasPlanificadas);
      if (!Number.isFinite(horas) || horas < 0) {
        errors.horasPlanificadas = t("planning.validation.plannedHoursPositive", { defaultValue: "Las horas deben ser un número mayor o igual a 0." });
      }
    }

    if (form.costoPlanificado === "") {
      errors.costoPlanificado = t("planning.validation.plannedCost", { defaultValue: "Ingresa costo planificado." });
    } else {
      const costo = Number(form.costoPlanificado);
      if (!Number.isFinite(costo) || costo < 0) {
        errors.costoPlanificado = t("planning.validation.plannedCostPositive", { defaultValue: "El costo debe ser un número mayor o igual a 0." });
      }
    }

    if (!ESTADOS_PLANIFICACION.includes(form.estado)) {
      errors.estado = t("planning.validation.invalidStatus", { defaultValue: "Estado inválido." });
    }

    return errors;
  }, [nuevaPlanificacionVisual, t]);

  const formularioVisualValido = Object.keys(erroresNuevaPlanificacion).length === 0;
  const claseCampoBase = "mt-1 rounded-lg border px-3 py-2 text-sm normal-case text-slate-700";
  const getClaseCampo = (errorKey) =>
    `${claseCampoBase} ${
      intentoGuardarVisual && erroresNuevaPlanificacion[errorKey] ? "border-rose-400 bg-rose-50" : "border-slate-300 bg-white"
    }`;

  const limpiarFiltrosPlanificacion = () => {
    setPeriodoAnalisis(PERIODO_ANALISIS_INICIAL);
    setFiltrosPlanificacion(FILTROS_PLANIFICACION_INICIAL);
  };

  const handleCambiarFechaFiltro = (campo, value) => {
    setPeriodoAnalisis(PERIODO_RANGO_PERSONALIZADO);
    setFiltrosPlanificacion((prev) => ({ ...prev, [campo]: value }));
  };

  const handleSeleccionarPeriodoAnalisis = (periodo) => {
    setPeriodoAnalisis(periodo);

    if (periodo === PERIODO_RANGO_PERSONALIZADO) {
      return;
    }

    const rango = getPeriodoAnalisisRange(periodo);
    setFiltrosPlanificacion((prev) => ({
      ...prev,
      fechaDesde: rango.fechaDesde,
      fechaHasta: rango.fechaHasta,
    }));
  };

  const handleExportarCsvPlanificacion = () => {
    const exportedAt = new Date().toISOString();
    const modo = showArchived
      ? t("planning.modes.archived", { defaultValue: "Archivadas" })
      : t("planning.modes.active", { defaultValue: "Activas" });

    const rows = [
      [
        t("planning.csv.id", { defaultValue: "ID" }),
        t("planning.csv.geofence", { defaultValue: "Geocerca" }),
        t("planning.csv.activity", { defaultValue: "Actividad" }),
        t("planning.csv.startDate", { defaultValue: "Fecha inicio" }),
        t("planning.csv.endDate", { defaultValue: "Fecha fin" }),
        t("planning.csv.plannedHours", { defaultValue: "Horas planificadas" }),
        t("planning.csv.plannedCost", { defaultValue: "Costo planificado" }),
        t("planning.csv.realHours", { defaultValue: "Horas reales" }),
        t("planning.csv.realCost", { defaultValue: "Costo real" }),
        t("planning.csv.hoursDifference", { defaultValue: "Diferencia horas" }),
        t("planning.csv.costDifference", { defaultValue: "Diferencia costo" }),
        t("planning.csv.trafficLight", { defaultValue: "Semáforo" }),
        t("planning.csv.trafficDetail", { defaultValue: "Detalle semáforo" }),
        t("planning.csv.status", { defaultValue: "Estado" }),
        t("planning.csv.notes", { defaultValue: "Notas" }),
        t("planning.csv.mode", { defaultValue: "Modo" }),
        t("planning.csv.exportDate", { defaultValue: "Fecha exportación" }),
      ],
      ...tareasFiltradas.map((tarea) => [
        tarea.id,
        tarea.geocerca || "",
        tarea.actividad || "",
        tarea.fechaInicio || "",
        tarea.fechaFin || "",
        formatMetric(tarea.horasPlanificadas),
        formatMetric(tarea.costoPlanificado),
        formatMetric(tarea.horasReales),
        formatMetric(tarea.costoReal),
        formatMetric(tarea.diferenciaHoras),
        formatMetric(tarea.diferenciaCosto),
        getTrafficLightDisplayLabel(tarea.semaforoPlanVsReal?.level, t),
        getTrafficLightDisplayDescription(tarea.semaforoPlanVsReal?.level, t),
        getStatusDisplayLabel(tarea.statusRaw, t, tarea.estado || ""),
        tarea.notes || "",
        modo,
        exportedAt,
      ]),
    ];

    const safeMode = showArchived ? "archivadas" : "activas";
    downloadCsv(`planificacion_${safeMode}_${exportedAt.slice(0, 10)}.csv`, rows);
  };

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
      window.alert(t("planning.alerts.completeRequired", { defaultValue: "Completa los campos requeridos antes de guardar." }));
      return;
    }

    if (!orgId) {
      window.alert(t("planning.alerts.noActiveOrg", { defaultValue: "No hay organización activa para guardar planificación." }));
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
        window.alert(t("planning.alerts.updated", { defaultValue: "Planificación actualizada correctamente." }));
        return;
      }

      const { error } = await supabase.from("planning_items").insert(payload);
      if (error) throw error;

      await loadPlanningData();
      setNuevaPlanificacionVisual(NUEVA_PLANIFICACION_INICIAL);
      setIntentoGuardarVisual(false);
      window.alert(t("planning.alerts.saved", { defaultValue: "Planificación guardada correctamente." }));
    } catch (err) {
      console.error("[Planificacion] Error guardando planificación:", err);
      window.alert(t("planning.alerts.saveError", { defaultValue: "No se pudo guardar la planificación." }));
    } finally {
      setSavingPlanning(false);
    }
  };

  const handleArchivarPlanificacion = async (tarea) => {
    if (!tarea?.dbId || !orgId) return;

    const confirmado = window.confirm(
      t("planning.confirm.archive", {
        defaultValue: "Archivar la planificación {{id}}? Esta acción la ocultará de la lista activa.",
        id: tarea.id,
      })
    );
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
      window.alert(t("planning.alerts.archived", { defaultValue: "Planificación archivada correctamente." }));
    } catch (err) {
      console.error("[Planificacion] Error archivando planificación:", err);
      window.alert(t("planning.alerts.archiveError", { defaultValue: "No se pudo archivar la planificación." }));
    } finally {
      setArchivingPlanningId(null);
    }
  };

  const handleRestaurarPlanificacion = async (tarea) => {
    if (!tarea?.dbId || !orgId) return;

    const confirmado = window.confirm(
      t("planning.confirm.restore", {
        defaultValue: "Restaurar la planificación {{id}}? Volverá como borrador en la lista activa.",
        id: tarea.id,
      })
    );
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
      window.alert(t("planning.alerts.restored", { defaultValue: "Planificación restaurada correctamente." }));
    } catch (err) {
      console.error("[Planificacion] Error restaurando planificación:", err);
      window.alert(t("planning.alerts.restoreError", { defaultValue: "No se pudo restaurar la planificación." }));
    } finally {
      setRestoringPlanningId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl bg-gradient-to-r from-cyan-700 via-teal-700 to-emerald-700 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-100">
                {t("planning.header.badge", { defaultValue: "Control gerencial operativo" })}
              </p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
                {t("planning.header.title", { defaultValue: "Planificación Operativa" })}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-cyan-50 sm:text-base">
                {t("planning.header.subtitle", {
                  defaultValue:
                    "Planifica trabajos por geocerca, compara ejecución real contra presupuesto operativo y detecta desviaciones con semáforos, filtros y exportación gerencial.",
                })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/30">
                {t("planning.badges.preview", { defaultValue: "Preview seguro" })}
              </span>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/30">
                {t("planning.badges.planVsReal", { defaultValue: "Plan vs Real" })}
              </span>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/30">
                {t("planning.badges.csv", { defaultValue: "CSV ejecutivo" })}
              </span>
            </div>
          </div>
        </header>

        {loadingDb ? (
          <section className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
            {t("planning.loading.fromSupabase", { defaultValue: "Cargando planificación desde Supabase..." })}
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
              <p className="text-sm font-semibold text-slate-800">
                {t("planning.periodSelector.title", { defaultValue: "Período de análisis" })}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {periodos.map((periodo) => {
                  const activo = periodoAnalisis === periodo;

                  return (
                    <button
                      key={periodo}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => handleSeleccionarPeriodoAnalisis(periodo)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                        activo
                          ? "border-cyan-600 bg-cyan-50 text-cyan-700"
                          : "border-slate-300 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50"
                      }`}
                    >
                      {getPeriodoLabel(periodo, t)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("planning.periodSelector.from", { defaultValue: "Desde" })}
                <input
                  type="date"
                  value={filtrosPlanificacion.fechaDesde}
                  onChange={(e) => handleCambiarFechaFiltro("fechaDesde", e.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("planning.periodSelector.to", { defaultValue: "Hasta" })}
                <input
                  type="date"
                  value={filtrosPlanificacion.fechaHasta}
                  onChange={(e) => handleCambiarFechaFiltro("fechaHasta", e.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {t("planning.filters.title", { defaultValue: "Filtros gerenciales Plan vs Real" })}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("planning.filters.subtitle", {
                  defaultValue:
                    "Enfoca la revisión por desviaciones, geocerca, actividad, estado o período. La vista filtrada alimenta KPIs, tabla, Gantt y CSV.",
                })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportarCsvPlanificacion}
                disabled={tareasFiltradas.length === 0}
                className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {t("planning.actions.exportCsv", { defaultValue: "Exportar CSV ejecutivo" })}
              </button>
              <button
                type="button"
                onClick={limpiarFiltrosPlanificacion}
                disabled={!hayFiltrosPlanificacion}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("planning.actions.clearFilters", { defaultValue: "Limpiar filtros" })}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("planning.filters.trafficLight", { defaultValue: "Semáforo" })}
              <select
                value={filtrosPlanificacion.semaforo}
                onChange={(e) => setFiltrosPlanificacion((prev) => ({ ...prev, semaforo: e.target.value }))}
                className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-slate-700"
              >
                <option value="all">{t("planning.filters.all", { defaultValue: "Todos" })}</option>
                <option value="green">{t("planning.traffic.green", { defaultValue: "En rango" })}</option>
                <option value="yellow">{t("planning.traffic.yellow", { defaultValue: "Desviación moderada" })}</option>
                <option value="red">{t("planning.traffic.red", { defaultValue: "Desviación alta" })}</option>
                <option value="none">{t("planning.traffic.none", { defaultValue: "Sin base" })}</option>
              </select>
            </label>

            <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("planning.filters.geofence", { defaultValue: "Geocerca" })}
              <select
                value={filtrosPlanificacion.geofenceId}
                onChange={(e) => setFiltrosPlanificacion((prev) => ({ ...prev, geofenceId: e.target.value }))}
                className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-slate-700"
              >
                <option value="all">{t("planning.filters.allFeminine", { defaultValue: "Todas" })}</option>
                {geofencesDb.map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {g.name || t("planning.fallbacks.unnamedGeofence", { defaultValue: "Geocerca sin nombre" })}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("planning.filters.activity", { defaultValue: "Actividad" })}
              <select
                value={filtrosPlanificacion.activityId}
                onChange={(e) => setFiltrosPlanificacion((prev) => ({ ...prev, activityId: e.target.value }))}
                className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-slate-700"
              >
                <option value="all">{t("planning.filters.allFeminine", { defaultValue: "Todas" })}</option>
                {activitiesDb.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.name || t("planning.fallbacks.unnamedActivity", { defaultValue: "Actividad sin nombre" })}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("planning.filters.status", { defaultValue: "Estado" })}
              <select
                value={filtrosPlanificacion.estado}
                onChange={(e) => setFiltrosPlanificacion((prev) => ({ ...prev, estado: e.target.value }))}
                className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-slate-700"
              >
                <option value="all">{t("planning.filters.all", { defaultValue: "Todos" })}</option>
                <option value="draft">{t("planning.status.draft", { defaultValue: "Pendiente" })}</option>
                <option value="approved">{t("planning.status.approved", { defaultValue: "En progreso" })}</option>
                <option value="closed">{t("planning.status.closed", { defaultValue: "Completada" })}</option>
                <option value="archived">{t("planning.status.archived", { defaultValue: "Archivada" })}</option>
              </select>
            </label>

            <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("planning.filters.dateFrom", { defaultValue: "Fecha desde" })}
              <input
                type="date"
                value={filtrosPlanificacion.fechaDesde}
                onChange={(e) => handleCambiarFechaFiltro("fechaDesde", e.target.value)}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
              />
            </label>

            <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("planning.filters.dateTo", { defaultValue: "Fecha hasta" })}
              <input
                type="date"
                value={filtrosPlanificacion.fechaHasta}
                onChange={(e) => handleCambiarFechaFiltro("fechaHasta", e.target.value)}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
              />
            </label>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            {t("planning.filters.showing", {
              defaultValue:
                "Mostrando {{filtered}} de {{total}} planificaciones de la vista actual. Los KPIs, la tabla, el Gantt y la exportación usan este mismo filtro.",
              filtered: tareasFiltradas.length,
              total: tareas.length,
            })}
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{t("planning.kpis.visible", { defaultValue: "Planificaciones visibles" })}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{total}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{t("planning.kpis.closed", { defaultValue: "Cerradas" })}</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-600">{completadas}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{t("planning.kpis.inProgress", { defaultValue: "En ejecución" })}</p>
            <p className="mt-1 text-2xl font-semibold text-sky-600">{enProgreso}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{t("planning.kpis.operationalProgress", { defaultValue: "Avance operativo" })}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{avancePromedio}%</p>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{t("planning.kpis.plannedHours", { defaultValue: "Horas planificadas" })}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatMetric(planVsRealKpis.totalHorasPlanificadas)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{t("planning.kpis.realHours", { defaultValue: "Horas reales" })}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatMetric(planVsRealKpis.totalHorasReales)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{t("planning.kpis.hoursDifference", { defaultValue: "Dif. horas" })}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatMetric(planVsRealKpis.diferenciaHoras)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{t("planning.kpis.hoursCompliance", { defaultValue: "% cumplimiento horas" })}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {planVsRealKpis.cumplimientoHoras === null ? "-" : `${formatMetric(planVsRealKpis.cumplimientoHoras)}%`}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{t("planning.kpis.plannedCost", { defaultValue: "Costo planificado" })}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatMetric(planVsRealKpis.totalCostoPlanificado)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{t("planning.kpis.realCost", { defaultValue: "Costo real" })}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatMetric(planVsRealKpis.totalCostoReal)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{t("planning.kpis.costDifference", { defaultValue: "Dif. costo" })}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatMetric(planVsRealKpis.diferenciaCosto)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{t("planning.kpis.currentView", { defaultValue: "Vista actual" })}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{showArchived ? t("planning.modes.archived", { defaultValue: "Archivadas" }) : t("planning.modes.active", { defaultValue: "Activas" })}</p>
          </article>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("planning.summary.title", { defaultValue: "Resumen ejecutivo por semáforo" })}
            </h2>
            <p className="text-sm text-slate-500">
              {t("planning.summary.subtitle", {
                defaultValue: "Lectura rápida del riesgo operativo según la peor desviación entre horas y costo.",
              })}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className={`rounded-xl border p-4 shadow-sm ${getTrafficLightStyle("green")}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{t("planning.traffic.green", { defaultValue: "En rango" })}</p>
                <span className="text-xl" aria-hidden="true">
                  {getTrafficLightIcon("green")}
                </span>
              </div>
              <p className="mt-2 text-2xl font-semibold">{resumenSemaforoKpis.green}</p>
              <p className="mt-1 text-xs">
                {t("planning.summary.percentOfTotal", { defaultValue: "{{percent}}% de {{total}} planificaciones", percent: formatMetric(resumenSemaforoKpis.greenPct), total: resumenSemaforoKpis.totalSemaforo })}
              </p>
            </article>

            <article className={`rounded-xl border p-4 shadow-sm ${getTrafficLightStyle("yellow")}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{t("planning.traffic.yellow", { defaultValue: "Desviación moderada" })}</p>
                <span className="text-xl" aria-hidden="true">
                  {getTrafficLightIcon("yellow")}
                </span>
              </div>
              <p className="mt-2 text-2xl font-semibold">{resumenSemaforoKpis.yellow}</p>
              <p className="mt-1 text-xs">
                {t("planning.summary.percentOfTotal", { defaultValue: "{{percent}}% de {{total}} planificaciones", percent: formatMetric(resumenSemaforoKpis.yellowPct), total: resumenSemaforoKpis.totalSemaforo })}
              </p>
            </article>

            <article className={`rounded-xl border p-4 shadow-sm ${getTrafficLightStyle("red")}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{t("planning.traffic.red", { defaultValue: "Desviación alta" })}</p>
                <span className="text-xl" aria-hidden="true">
                  {getTrafficLightIcon("red")}
                </span>
              </div>
              <p className="mt-2 text-2xl font-semibold">{resumenSemaforoKpis.red}</p>
              <p className="mt-1 text-xs">
                {t("planning.summary.percentOfTotal", { defaultValue: "{{percent}}% de {{total}} planificaciones", percent: formatMetric(resumenSemaforoKpis.redPct), total: resumenSemaforoKpis.totalSemaforo })}
              </p>
            </article>

            <article className={`rounded-xl border p-4 shadow-sm ${getTrafficLightStyle("none")}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{t("planning.traffic.none", { defaultValue: "Sin base" })}</p>
                <span className="text-xl" aria-hidden="true">
                  {getTrafficLightIcon("none")}
                </span>
              </div>
              <p className="mt-2 text-2xl font-semibold">{resumenSemaforoKpis.none}</p>
              <p className="mt-1 text-xs">
                {t("planning.summary.percentOfTotal", { defaultValue: "{{percent}}% de {{total}} planificaciones", percent: formatMetric(resumenSemaforoKpis.nonePct), total: resumenSemaforoKpis.totalSemaforo })}
              </p>
            </article>
          </div>
        </section>

        {!showArchived ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingPlanningId
                  ? t("planning.form.editTitle", { defaultValue: "Editar planificación operativa" })
                  : t("planning.form.newTitle", { defaultValue: "Nueva planificación operativa" })}
              </h2>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">{t("planning.badges.previewShort", { defaultValue: "Preview" })}</span>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              {editingPlanningId
                ? t("planning.form.editSubtitle", { defaultValue: "Actualiza una planificación activa sin duplicar registros. El cambio queda limitado a Preview." })
                : t("planning.form.newSubtitle", { defaultValue: "Registra una planificación operativa para comparar luego contra la ejecución real." })}
            </p>
            {intentoGuardarVisual && !formularioVisualValido ? (
              <section className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {t("planning.validation.reviewFields", { defaultValue: "Revisa los campos marcados para continuar." })}
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
                  <option value="">{t("planning.form.selectGeofence", { defaultValue: "Seleccionar geocerca" })}</option>
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
                  <option value="">{t("planning.form.selectActivity", { defaultValue: "Seleccionar actividad" })}</option>
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
                {t("planning.form.startDate", { defaultValue: "Fecha inicio" })}
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
                {t("planning.form.endDate", { defaultValue: "Fecha fin" })}
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
                {t("planning.form.plannedHours", { defaultValue: "Horas planificadas" })}
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
                {t("planning.form.plannedCost", { defaultValue: "Costo planificado" })}
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
                    ? t("planning.form.autoCostHint", {
                        defaultValue: "Se calcula automáticamente según tarifa de actividad y horas{{currency}}.",
                        currency: monedaActividad ? ` (${monedaActividad})` : "",
                      })
                    : t("planning.form.manualCostHint", {
                        defaultValue: "Sin tarifa por hora{{currency}}. Ingresa el costo manualmente.",
                        currency: monedaActividad ? ` (${monedaActividad})` : "",
                      })}
                </span>
              </label>

              <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("planning.form.status", { defaultValue: "Estado" })}
                <select
                  value={nuevaPlanificacionVisual.estado}
                  onChange={(e) => setNuevaPlanificacionVisual((prev) => ({ ...prev, estado: e.target.value }))}
                  className={getClaseCampo("estado")}
                >
                  <option value="draft">{t("planning.status.draft", { defaultValue: "Pendiente" })}</option>
                  <option value="approved">{t("planning.status.approved", { defaultValue: "En progreso" })}</option>
                  <option value="closed">{t("planning.status.closed", { defaultValue: "Completada" })}</option>
                  <option value="archived">{t("planning.status.archived", { defaultValue: "Archivada" })}</option>
                </select>
                {intentoGuardarVisual && erroresNuevaPlanificacion.estado ? (
                  <span className="mt-1 text-xs normal-case text-rose-600">{erroresNuevaPlanificacion.estado}</span>
                ) : null}
              </label>

              <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500 xl:col-span-4">
                {t("planning.form.notes", { defaultValue: "Notas" })}
                <textarea
                  rows={3}
                  placeholder={t("planning.form.notesPlaceholder", { defaultValue: "Notas operativas" })}
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
                {t("planning.actions.cancel", { defaultValue: "Cancelar" })}
              </button>
              <button
                type="button"
                onClick={handleGuardarVisual}
                disabled={savingPlanning}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {savingPlanning
                  ? t("planning.actions.saving", { defaultValue: "Guardando..." })
                  : editingPlanningId
                    ? t("planning.actions.saveEdit", { defaultValue: "Guardar edición" })
                    : t("planning.actions.savePlanning", { defaultValue: "Guardar planificación" })}
              </button>
              <span className="text-xs text-slate-500">
                {editingPlanningId
                  ? t("planning.form.editSaveHint", { defaultValue: "Al guardar, se actualiza la planificación activa en Preview." })
                  : t("planning.form.newSaveHint", { defaultValue: "Al guardar, se inserta en Preview y se recarga la lista." })}
              </span>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {showArchived
                  ? t("planning.table.archivedTitle", { defaultValue: "Planificaciones archivadas" })
                  : t("planning.table.activeTitle", { defaultValue: "Planificaciones activas" })}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {showArchived
                  ? t("planning.table.archivedSubtitle", { defaultValue: "Historial operativo archivado. Útil para auditoría y revisión posterior." })
                  : t("planning.table.activeSubtitle", { defaultValue: "Vista activa con presupuesto, ejecución real, desviaciones, semáforo y totales." })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {mostrandoDemo
                  ? t("planning.badges.localDemo", { defaultValue: "Datos demo locales" })
                  : t("planning.badges.realPreview", { defaultValue: "Datos reales Preview" })}
              </span>
              <button
                type="button"
                onClick={() => setShowArchived((prev) => !prev)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {showArchived
                  ? t("planning.actions.viewActive", { defaultValue: "Ver activas" })
                  : t("planning.actions.viewArchived", { defaultValue: "Ver archivadas" })}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t("planning.table.columns.id", { defaultValue: "ID" })}</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t("planning.table.columns.geofence", { defaultValue: "Geocerca" })}</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t("planning.table.columns.activity", { defaultValue: "Actividad" })}</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t("planning.table.columns.startDate", { defaultValue: "Fecha inicio" })}</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t("planning.table.columns.endDate", { defaultValue: "Fecha fin" })}</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t("planning.table.columns.plannedHours", { defaultValue: "Horas planificadas" })}</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t("planning.table.columns.plannedCost", { defaultValue: "Costo planificado" })}</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t("planning.table.columns.realHours", { defaultValue: "Horas reales" })}</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t("planning.table.columns.realCost", { defaultValue: "Costo real" })}</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t("planning.table.columns.hoursDiff", { defaultValue: "Dif. horas" })}</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t("planning.table.columns.costDiff", { defaultValue: "Dif. costo" })}</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t("planning.table.columns.trafficLight", { defaultValue: "Semáforo" })}</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t("planning.table.columns.status", { defaultValue: "Estado" })}</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t("planning.table.columns.actions", { defaultValue: "Acciones" })}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {sinDatosReales ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={14}>
                      {hayFiltrosPlanificacion
                        ? t("planning.empty.noFilterResults", { defaultValue: "No hay planificaciones que coincidan con los filtros seleccionados." })
                        : showArchived
                          ? t("planning.empty.noArchived", { defaultValue: "No hay planificaciones archivadas para esta organización." })
                          : t("planning.empty.noActive", { defaultValue: "No hay planificación registrada para esta organización." })}
                    </td>
                  </tr>
                ) : (
                  tareasFiltradas.map((tarea) => (
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
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${getTrafficLightStyle(
                            tarea.semaforoPlanVsReal?.level
                          )}`}
                          title={getTrafficLightDisplayDescription(tarea.semaforoPlanVsReal?.level, t)}
                        >
                          <span aria-hidden="true">{getTrafficLightIcon(tarea.semaforoPlanVsReal?.level)}</span>
                          {getTrafficLightDisplayLabel(tarea.semaforoPlanVsReal?.level, t)}
                        </span>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {getTrafficLightDisplayDescription(tarea.semaforoPlanVsReal?.level, t)}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getEstadoStyle(tarea.estado)}`}>
                          {getStatusDisplayLabel(tarea.statusRaw, t, tarea.estado)}
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
                              {t("planning.actions.edit", { defaultValue: "Editar" })}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleArchivarPlanificacion(tarea)}
                              disabled={archivingPlanningId === tarea.dbId}
                              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {archivingPlanningId === tarea.dbId
                                ? t("planning.actions.archiving", { defaultValue: "Archivando..." })
                                : t("planning.actions.archive", { defaultValue: "Archivar" })}
                            </button>
                          </div>
                        ) : tarea.dbId && showArchived ? (
                          <button
                            type="button"
                            onClick={() => handleRestaurarPlanificacion(tarea)}
                            disabled={restoringPlanningId === tarea.dbId}
                            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {restoringPlanningId === tarea.dbId
                              ? t("planning.actions.restoring", { defaultValue: "Restaurando..." })
                              : t("planning.actions.restore", { defaultValue: "Restaurar" })}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {!sinDatosReales ? (
                <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-700">
                  <tr>
                    <td className="px-3 py-3 text-slate-900" colSpan={5}>
                      {t("planning.table.totalFilteredView", { defaultValue: "Total vista filtrada" })}
                    </td>
                    <td className="px-3 py-3">{formatMetric(totalesTablaPlanificacion.horasPlanificadas)}</td>
                    <td className="px-3 py-3">{formatMetric(totalesTablaPlanificacion.costoPlanificado)}</td>
                    <td className="px-3 py-3">{formatMetric(totalesTablaPlanificacion.horasReales)}</td>
                    <td className="px-3 py-3">{formatMetric(totalesTablaPlanificacion.costoReal)}</td>
                    <td className="px-3 py-3">{formatMetric(totalesTablaPlanificacion.diferenciaHoras)}</td>
                    <td className="px-3 py-3">{formatMetric(totalesTablaPlanificacion.diferenciaCosto)}</td>
                    <td className="px-3 py-3 text-xs font-medium text-slate-500">{t("planning.table.filteredView", { defaultValue: "Vista filtrada" })}</td>
                    <td className="px-3 py-3 text-xs font-medium text-slate-500">-</td>
                    <td className="px-3 py-3 text-xs font-medium text-slate-500">-</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">{ganttConfig.title}</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">{ganttConfig.subtitle}</p>

          <div className="overflow-x-auto">
            <div style={{ minWidth: `${ganttConfig.minWidth}px` }}>
              <div
                className="grid gap-2 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
                style={{ gridTemplateColumns: `220px repeat(${ganttConfig.columns.length}, minmax(${ganttConfig.columnWidth}px, 1fr))` }}
              >
                <div>{t("planning.gantt.task", { defaultValue: "Tarea" })}</div>
                {ganttConfig.columns.map((column) => (
                  <div key={column.id} className="text-center">
                    <div>{column.label}</div>
                    <div className="mt-1 text-[10px] font-medium normal-case tracking-normal text-slate-400">{column.sublabel}</div>
                  </div>
                ))}
              </div>

              <div className="mt-2 space-y-2">
                {tareasFiltradas.map((tarea) => {
                  const tareaInicio = parseLocalDate(tarea.fechaInicio);
                  const tareaFin = parseLocalDate(tarea.fechaFin) || tareaInicio;

                  return (
                    <div
                      key={`gantt-${tarea.id}`}
                      className="grid items-center gap-2"
                      style={{ gridTemplateColumns: `220px repeat(${ganttConfig.columns.length}, minmax(${ganttConfig.columnWidth}px, 1fr))` }}
                    >
                      <div className="truncate text-sm text-slate-700">{tarea.actividad}</div>
                      {ganttConfig.columns.map((column) => {
                        const activa = rangesOverlap(tareaInicio, tareaFin, column.start, column.end);

                        return (
                          <div key={`${tarea.id}-${column.id}`} className="h-8 rounded-md border border-slate-200 bg-slate-50 p-1">
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
