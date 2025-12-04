// src/pages/CostosPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { getCostosAsignaciones } from "../lib/costosApi";
import { listPersonal } from "../lib/personalApi";
import { listGeocercas } from "../lib/geocercasApi";
import { listActivities } from "../lib/activitiesApi";

/** Devuelve YYYY-MM-DD para un Date o string */
function formatDateInput(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Rango por defecto: últimos 7 días */
function getDefaultRange() {
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);
  return {
    from: formatDateInput(sevenDaysAgo),
    to: formatDateInput(today),
  };
}

export default function CostosPage() {
  const { user, currentOrg, currentRole } = useAuth();

  const [dateFrom, setDateFrom] = useState(getDefaultRange().from);
  const [dateTo, setDateTo] = useState(getDefaultRange().to);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [rows, setRows] = useState([]);

  // Filtros adicionales
  const [personasOptions, setPersonasOptions] = useState([]);
  const [geocercasOptions, setGeocercasOptions] = useState([]);
  const [activitiesOptions, setActivitiesOptions] = useState([]);
  const [filtersLoading, setFiltersLoading] = useState(false);

  const [selectedPersonaId, setSelectedPersonaId] = useState(null);
  const [selectedGeocercaId, setSelectedGeocercaId] = useState(null);
  const [selectedActivityId, setSelectedActivityId] = useState(null);

  // Controles de gráficos
  const [chartGrouping, setChartGrouping] = useState("actividad"); // actividad | persona | geocerca
  const [chartType, setChartType] = useState("bar"); // bar | line

  const isAdminOrOwner = currentRole === "owner" || currentRole === "admin";

  if (!user || !currentOrg) {
    return (
      <div className="p-4">
        <p>Debes iniciar sesión y tener una organización seleccionada.</p>
      </div>
    );
  }

  // Carga de opciones de filtros (persona, geocerca, actividad)
  useEffect(() => {
    let cancelled = false;

    async function loadFilterOptions() {
      try {
        setFiltersLoading(true);
        const orgId = currentOrg?.id || currentOrg?.org_id;

        const [personal, geos, acts] = await Promise.all([
          listPersonal({ orgId, onlyActive: true }).catch((e) => {
            console.warn("[CostosPage] listPersonal error", e);
            return [];
          }),
          listGeocercas({ orgId, onlyActive: true }).catch((e) => {
            console.warn("[CostosPage] listGeocercas error", e);
            return [];
          }),
          listActivities({ includeInactive: false }).catch((e) => {
            console.warn("[CostosPage] listActivities error", e);
            return [];
          }),
        ]);

        if (cancelled) return;

        setPersonasOptions(personal || []);
        setGeocercasOptions(geos || []);
        setActivitiesOptions(acts || []);
      } catch (err) {
        console.error("[CostosPage] loadFilterOptions exception:", err);
      } finally {
        if (!cancelled) setFiltersLoading(false);
      }
    }

    loadFilterOptions();
    return () => {
      cancelled = true;
    };
  }, [currentOrg?.id]);

  async function handleLoad(e) {
    if (e) e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      if (!dateFrom || !dateTo) {
        setErrorMsg("Debes seleccionar fecha inicio y fin.");
        setLoading(false);
        return;
      }

      const fromDate = new Date(`${dateFrom}T00:00:00`);
      const toDate = new Date(`${dateTo}T23:59:59`);

      if (fromDate > toDate) {
        setErrorMsg("La fecha inicio no puede ser mayor que la fecha fin.");
        setLoading(false);
        return;
      }

      const orgId = currentOrg?.id || currentOrg?.org_id;
      if (!orgId) {
        setErrorMsg("No se pudo determinar la organización actual.");
        setLoading(false);
        return;
      }

      const { data, error } = await getCostosAsignaciones({
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        orgId,
      });

      if (error) {
        console.error("[CostosPage] getCostosAsignaciones error:", error);
        setErrorMsg(error.message || "Error cargando costos.");
      } else {
        setRows(data || []);
      }
    } catch (err) {
      console.error("[CostosPage] handleLoad exception:", err);
      setErrorMsg(err.message || "Error inesperado cargando costos.");
    } finally {
      setLoading(false);
    }
  }

  // Aplica filtros (persona / geocerca / actividad) a las filas
  const filteredRows = useMemo(() => {
    if (!rows || rows.length === 0) return [];

    return rows.filter((r) => {
      const personaId =
        r.personal_id ?? r.persona_id ?? r.person_id ?? r.personaId ?? null;
      const geocercaId =
        r.geocerca_id ?? r.geocercaId ?? r.geofence_id ?? null;
      const activityId =
        r.activity_id ?? r.actividad_id ?? r.activityId ?? null;

      if (selectedPersonaId && personaId !== selectedPersonaId) return false;
      if (selectedGeocercaId && geocercaId !== selectedGeocercaId) return false;
      if (selectedActivityId && activityId !== selectedActivityId) return false;

      return true;
    });
  }, [rows, selectedPersonaId, selectedGeocercaId, selectedActivityId]);

  /** Exportar tabla detallada filtrada a CSV (compatible Excel) */
  function handleExportCsv() {
    if (!filteredRows || filteredRows.length === 0) return;

    const headers = [
      "Persona",
      "Geocerca",
      "Actividad",
      "Inicio",
      "Fin",
      "Horas",
      "Tarifa",
      "Costo",
      "Moneda",
    ];

    const csvRows = filteredRows.map((r) => [
      r.persona_nombre || "",
      r.geocerca_nombre || "",
      r.activity_name || "",
      r.start_time ? new Date(r.start_time).toISOString() : "",
      r.end_time ? new Date(r.end_time).toISOString() : "",
      r.horas_trabajadas ?? "",
      r.hourly_rate ?? "",
      r.costo ?? "",
      r.currency_code || "",
    ]);

    const escapeCell = (value) => {
      const s = String(value ?? "");
      if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const csv =
      [headers, ...csvRows]
        .map((row) => row.map(escapeCell).join(","))
        .join("\n") + "\n";

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeFrom = dateFrom?.replace(/-/g, "") || "";
    const safeTo = dateTo?.replace(/-/g, "") || "";
    a.href = url;
    a.download = `reporte_costos_${safeFrom}_${safeTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Totales por moneda
  const totalsByCurrency = useMemo(() => {
    const acc = {};
    for (const r of filteredRows) {
      const curr = r.currency_code || "SIN_MONEDA";
      acc[curr] = (acc[curr] || 0) + Number(r.costo || 0);
    }
    return acc;
  }, [filteredRows]);

  // Totales por actividad + moneda
  const totalsByActivity = useMemo(() => {
    const acc = {};
    for (const r of filteredRows) {
      const key = `${r.activity_name || "Sin actividad"}|${
        r.currency_code || "SIN_MONEDA"
      }`;
      acc[key] = (acc[key] || 0) + Number(r.costo || 0);
    }
    return acc;
  }, [filteredRows]);

  // Totales por persona + moneda
  const totalsByPersona = useMemo(() => {
    const acc = {};
    for (const r of filteredRows) {
      const key = `${r.persona_nombre || "Sin persona"}|${
        r.currency_code || "SIN_MONEDA"
      }`;
      acc[key] = (acc[key] || 0) + Number(r.costo || 0);
    }
    return acc;
  }, [filteredRows]);

  // Totales por geocerca + moneda
  const totalsByGeocerca = useMemo(() => {
    const acc = {};
    for (const r of filteredRows) {
      const key = `${r.geocerca_nombre || "Sin geocerca"}|${
        r.currency_code || "SIN_MONEDA"
      }`;
      acc[key] = (acc[key] || 0) + Number(r.costo || 0);
    }
    return acc;
  }, [filteredRows]);

  // KPIs generales estilo "tarjetas Power BI"
  const kpis = useMemo(() => {
    const totalCost = filteredRows.reduce(
      (sum, r) => sum + Number(r.costo || 0),
      0
    );
    const totalHours = filteredRows.reduce(
      (sum, r) => sum + Number(r.horas_trabajadas || 0),
      0
    );

    const personasSet = new Set(
      filteredRows.map((r) => r.persona_nombre || r.personal_id)
    );
    const geosSet = new Set(
      filteredRows.map((r) => r.geocerca_nombre || r.geocerca_id)
    );
    const actsSet = new Set(
      filteredRows.map((r) => r.activity_name || r.activity_id)
    );

    return {
      totalCost,
      totalHours,
      personasCount: personasSet.size || 0,
      geosCount: geosSet.size || 0,
      actsCount: actsSet.size || 0,
    };
  }, [filteredRows]);

  // Datos para gráficos según agrupación
  const chartEntries = useMemo(() => {
    let source = totalsByActivity;
    if (chartGrouping === "persona") source = totalsByPersona;
    if (chartGrouping === "geocerca") source = totalsByGeocerca;

    const entries = Object.entries(source).map(([key, total]) => {
      const [label, curr] = key.split("|");
      return {
        label: label || "",
        currency: curr || "SIN_MONEDA",
        total: Number(total || 0),
      };
    });

    entries.sort((a, b) => b.total - a.total);
    return entries;
  }, [chartGrouping, totalsByActivity, totalsByPersona, totalsByGeocerca]);

  const maxChartValue = useMemo(() => {
    if (!chartEntries.length) return 0;
    return Math.max(...chartEntries.map((e) => e.total));
  }, [chartEntries]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Reporte de costos</h1>
      <p className="text-sm text-gray-500 mb-4">
        Calcula costos aproximados por actividad, geocerca y persona, usando la
        tarifa horaria definida en cada actividad y las fechas de las
        asignaciones.
      </p>

      {!isAdminOrOwner && (
        <div className="mb-4 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 text-xs">
          Tu rol es <strong>{currentRole}</strong>. Puedes ver este reporte,
          pero solo los owners/admins deberían usarlo para decisiones de
          facturación.
        </div>
      )}

      {/* Filtros */}
      <form
        onSubmit={handleLoad}
        className="mb-6 bg-white shadow-sm rounded-lg p-4 border border-gray-100 space-y-4"
      >
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-1">
            Filtros de rango de fechas
          </h2>
          <p className="text-xs text-gray-500 mb-2">
            El cálculo usa únicamente el tiempo de las asignaciones que cae
            dentro del rango seleccionado.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Desde
              </label>
              <input
                type="date"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Hasta
              </label>
              <input
                type="date"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div className="flex flex-col md:flex-row gap-2 md:justify-end">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                disabled={loading}
              >
                {loading ? "Calculando..." : "Calcular costos"}
              </button>
              <button
                type="button"
                className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                onClick={() => {
                  const def = getDefaultRange();
                  setDateFrom(def.from);
                  setDateTo(def.to);
                  setSelectedPersonaId(null);
                  setSelectedGeocercaId(null);
                  setSelectedActivityId(null);
                }}
                disabled={loading}
              >
                Últimos 7 días (reset)
              </button>
            </div>
          </div>
        </div>

        {/* Filtros avanzados */}
        <div>
          <h3 className="text-xs font-semibold text-gray-700 mb-2">
            Filtros adicionales
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Persona
              </label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={selectedPersonaId || ""}
                onChange={(e) =>
                  setSelectedPersonaId(e.target.value || null)
                }
                disabled={filtersLoading}
              >
                <option value="">Todas las personas</option>
                {personasOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre ||
                      p.full_name ||
                      p.name ||
                      p.email ||
                      `ID ${p.id}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Geocerca
              </label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={selectedGeocercaId || ""}
                onChange={(e) =>
                  setSelectedGeocercaId(e.target.value || null)
                }
                disabled={filtersLoading}
              >
                <option value="">Todas las geocercas</option>
                {geocercasOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre || g.name || g.id_text || `ID ${g.id}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Actividad
              </label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={selectedActivityId || ""}
                onChange={(e) =>
                  setSelectedActivityId(e.target.value || null)
                }
                disabled={filtersLoading}
              >
                <option value="">Todas las actividades</option>
                {activitiesOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.nombre || `ID ${a.id}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {filtersLoading && (
            <p className="mt-2 text-[11px] text-gray-400">
              Cargando opciones de filtros…
            </p>
          )}
        </div>

        {errorMsg && (
          <div className="mt-1 rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
            {errorMsg}
          </div>
        )}
      </form>

      {/* KPIs estilo panel */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-indigo-100 shadow-sm rounded-lg p-4">
          <p className="text-[11px] uppercase tracking-wide text-indigo-500 font-semibold mb-1">
            Costo total
          </p>
          <p className="text-xl font-bold text-gray-900 mb-1">
            {kpis.totalCost.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            <span className="text-xs text-gray-400">
              {Object.keys(totalsByCurrency)[0] || ""}
            </span>
          </p>
          <p className="text-[11px] text-gray-500">
            Suma de todos los costos en el rango.
          </p>
        </div>

        <div className="bg-white border border-indigo-100 shadow-sm rounded-lg p-4">
          <p className="text-[11px] uppercase tracking-wide text-indigo-500 font-semibold mb-1">
            Horas trabajadas
          </p>
          <p className="text-xl font-bold text-gray-900 mb-1">
            {kpis.totalHours.toLocaleString(undefined, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}{" "}
            <span className="text-xs text-gray-400">h</span>
          </p>
          <p className="text-[11px] text-gray-500">
            Horas efectivas según asignaciones.
          </p>
        </div>

        <div className="bg-white border border-indigo-100 shadow-sm rounded-lg p-4">
          <p className="text-[11px] uppercase tracking-wide text-indigo-500 font-semibold mb-1">
            Personas
          </p>
          <p className="text-xl font-bold text-gray-900 mb-1">
            {kpis.personasCount}
          </p>
          <p className="text-[11px] text-gray-500">
            Personas con asignaciones en el rango.
          </p>
        </div>

        <div className="bg-white border border-indigo-100 shadow-sm rounded-lg p-4">
          <p className="text-[11px] uppercase tracking-wide text-indigo-500 font-semibold mb-1">
            Geocercas / Actividades
          </p>
          <p className="text-xl font-bold text-gray-900 mb-1">
            {kpis.geosCount}{" "}
            <span className="text-xs text-gray-400">geocercas</span>
            <span className="mx-1 text-gray-300">·</span>
            {kpis.actsCount}{" "}
            <span className="text-xs text-gray-400">activ.</span>
          </p>
          <p className="text-[11px] text-gray-500">
            Cobertura del rango seleccionado.
          </p>
        </div>
      </div>

      {/* Resumen de totales por dimensión */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        {/* Moneda */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Totales por moneda
          </h2>
          {filteredRows.length === 0 ? (
            <p className="text-xs text-gray-500">
              No hay datos en el rango / filtros seleccionados.
            </p>
          ) : (
            <ul className="text-xs space-y-1 max-h-56 overflow-y-auto">
              {Object.entries(totalsByCurrency).map(([curr, total]) => (
                <li
                  key={curr}
                  className="flex justify-between gap-2 border-b border-gray-100 pb-1"
                >
                  <span className="text-gray-600">{curr}</span>
                  <span className="font-semibold whitespace-nowrap">
                    {curr}{" "}
                    {Number(total || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actividad */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Totales por actividad
          </h2>
          {filteredRows.length === 0 ? (
            <p className="text-xs text-gray-500">
              No hay datos en el rango / filtros seleccionados.
            </p>
          ) : (
            <ul className="text-xs space-y-1 max-h-56 overflow-y-auto">
              {Object.entries(totalsByActivity).map(([key, total]) => {
                const [name, curr] = key.split("|");
                return (
                  <li
                    key={key}
                    className="flex justify-between gap-2 border-b border-gray-100 pb-1"
                  >
                    <span className="text-gray-600 truncate">
                      {name || "Sin actividad"}
                    </span>
                    <span className="font-semibold whitespace-nowrap">
                      {curr}{" "}
                      {Number(total || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Persona */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Totales por persona
          </h2>
          {filteredRows.length === 0 ? (
            <p className="text-xs text-gray-500">
              No hay datos en el rango / filtros seleccionados.
            </p>
          ) : (
            <ul className="text-xs space-y-1 max-h-56 overflow-y-auto">
              {Object.entries(totalsByPersona).map(([key, total]) => {
                const [name, curr] = key.split("|");
                return (
                  <li
                    key={key}
                    className="flex justify-between gap-2 border-b border-gray-100 pb-1"
                  >
                    <span className="text-gray-600 truncate">
                      {name || "Sin persona"}
                    </span>
                    <span className="font-semibold whitespace-nowrap">
                      {curr}{" "}
                      {Number(total || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Geocerca */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Totales por geocerca
          </h2>
          {filteredRows.length === 0 ? (
            <p className="text-xs text-gray-500">
              No hay datos en el rango / filtros seleccionados.
            </p>
          ) : (
            <ul className="text-xs space-y-1 max-h-56 overflow-y-auto">
              {Object.entries(totalsByGeocerca).map(([key, total]) => {
                const [name, curr] = key.split("|");
                return (
                  <li
                    key={key}
                    className="flex justify-between gap-2 border-b border-gray-100 pb-1"
                  >
                    <span className="text-gray-600 truncate">
                      {name || "Sin geocerca"}
                    </span>
                    <span className="font-semibold whitespace-nowrap">
                      {curr}{" "}
                      {Number(total || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Visualización gráfica tipo panel */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-100 p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-gray-700">
            Visualización gráfica de costos
          </h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Agrupar por:</span>
              <select
                className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={chartGrouping}
                onChange={(e) => setChartGrouping(e.target.value)}
              >
                <option value="actividad">Actividad</option>
                <option value="persona">Persona</option>
                <option value="geocerca">Geocerca</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Tipo:</span>
              <select
                className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={chartType}
                onChange={(e) => setChartType(e.target.value)}
              >
                <option value="bar">Barras</option>
                <option value="line">Líneas</option>
              </select>
            </div>
          </div>
        </div>

        {chartEntries.length === 0 || maxChartValue <= 0 ? (
          <p className="text-xs text-gray-500">
            No hay datos suficientes para generar el gráfico con los filtros
            actuales.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Gráfico principal */}
            <div className="lg:col-span-2">
              {chartType === "bar" ? (
                <div className="relative h-56 px-2">
                  {/* Líneas guía horizontales */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    <div className="border-t border-dashed border-gray-200" />
                    <div className="border-t border-dashed border-gray-200" />
                    <div className="border-t border-dashed border-gray-200" />
                  </div>

                  <div className="relative h-full flex items-end gap-3">
                    {chartEntries.map((e, idx) => {
                      // Escalamos 10–90% para dar margen tipo BI
                      const scaledPct =
                        maxChartValue > 0
                          ? 10 + (e.total / maxChartValue) * 80
                          : 0;

                      return (
                        <div
                          key={`${e.label}-${e.currency}-${idx}`}
                          className="flex-1 flex flex-col items-center min-w-[50px] h-full"
                        >
                          {/* valor numérico */}
                          <div className="mb-1 text-[10px] text-gray-600 font-semibold whitespace-nowrap">
                            {e.currency}{" "}
                            {e.total.toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}
                          </div>
                          {/* barra */}
                          <div className="w-full flex-1 flex items-end">
                            <div
                              className="w-full rounded-t-md bg-indigo-500 shadow-sm"
                              style={{ height: `${scaledPct}%` }}
                              title={`${e.label} (${e.currency}) - ${e.total.toLocaleString(
                                undefined,
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }
                              )}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="h-56">
                  <svg
                    viewBox="0 0 100 100"
                    className="w-full h-full text-indigo-500"
                    preserveAspectRatio="none"
                  >
                    <line
                      x1="0"
                      y1="100"
                      x2="100"
                      y2="100"
                      stroke="#E5E7EB"
                      strokeWidth="0.5"
                    />
                    {chartEntries.length > 0 && (
                      <polyline
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        points={chartEntries
                          .map((e, i) => {
                            const x =
                              (i / Math.max(chartEntries.length - 1, 1)) * 100;
                            const y =
                              100 -
                              (maxChartValue > 0
                                ? (e.total / maxChartValue) * 100
                                : 0);
                            return `${x},${y}`;
                          })
                          .join(" ")}
                      />
                    )}
                  </svg>
                </div>
              )}
            </div>

            {/* Ranking a la derecha, estilo tabla de BI */}
            <div className="border-l border-gray-100 pl-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">
                Top {Math.min(chartEntries.length, 6)}{" "}
                {chartGrouping === "actividad"
                  ? "actividades"
                  : chartGrouping === "persona"
                  ? "personas"
                  : "geocercas"}
              </p>
              <ul className="space-y-1 text-[11px] text-gray-600 max-h-56 overflow-y-auto">
                {chartEntries.slice(0, 6).map((e, idx) => (
                  <li
                    key={`${e.label}-${e.currency}-rank-${idx}`}
                    className="flex justify-between gap-2 border-b border-gray-100 pb-1"
                  >
                    <span className="truncate">
                      <span className="font-medium text-gray-800">
                        {idx + 1}.
                      </span>{" "}
                      {e.label}
                    </span>
                    <span className="whitespace-nowrap font-semibold">
                      {e.currency}{" "}
                      {e.total.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Tabla detalle */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-medium text-gray-700">
              Detalle de asignaciones con costo
            </h2>
            <span className="text-xs text-gray-400">
              {filteredRows.length} registro(s)
            </span>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Exportar a Excel (CSV)
          </button>
        </div>

        {filteredRows.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            No hay asignaciones con actividad y fechas que coincidan con el
            rango y filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">
                    Persona
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">
                    Geocerca
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">
                    Actividad
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">
                    Inicio (rango)
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">
                    Fin (rango)
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">
                    Horas
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">
                    Tarifa
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">
                    Costo
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">
                    Moneda
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((r) => (
                  <tr
                    key={
                      r.asignacion_id ||
                      `${r.persona_nombre}-${r.start_time}`
                    }
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.persona_nombre || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.geocerca_nombre || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.activity_name || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.start_time
                        ? new Date(r.start_time).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.end_time
                        ? new Date(r.end_time).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {Number(r.horas_trabajadas || 0).toLocaleString(
                        undefined,
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {Number(r.hourly_rate || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {Number(r.costo || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {r.currency_code || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
