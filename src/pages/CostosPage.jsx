// src/pages/CostosPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";
import CostosChartPanel from "../components/CostosChartPanel";

const emptyOption = { value: "", label: "Todos" };

function summarizeByCurrency(rows) {
  const map = new Map();

  for (const row of rows || []) {
    const currency = row.currency_code || "N/A";
    const prev = map.get(currency) || { currency, totalCost: 0, totalHours: 0 };

    map.set(currency, {
      currency,
      totalCost: prev.totalCost + (Number(row.costo) || 0),
      totalHours: prev.totalHours + (Number(row.horas) || 0),
    });
  }

  return Array.from(map.values());
}

function formatNumber(n, decimals = 2) {
  if (n == null || Number.isNaN(Number(n))) return "-";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CostosPage = () => {
  const { currentOrg, currentRole } = useAuth();

  // Filtros
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [selectedActividadId, setSelectedActividadId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");

  // Datos para combos
  const [personas, setPersonas] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [geocercas, setGeocercas] = useState([]);

  // Filas detalladas del reporte
  const [rows, setRows] = useState([]);

  // Estado del panel de gráficos
  const [chartGrouping, setChartGrouping] = useState("actividad"); // actividad | persona | geocerca
  const [chartType, setChartType] = useState("bar"); // bar | line | pie

  const [loading, setLoading] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [error, setError] = useState("");

  // Solo owner/admin pueden ver Costos/Reportes
  const role = (currentRole || "").toLowerCase();
  const canView = role === "owner" || role === "admin";

  // Cargar combos básicos (personas, actividades, geocercas)
  useEffect(() => {
    if (!currentOrg?.id || !canView) return;

    const loadFilters = async () => {
      setLoadingFilters(true);
      setError("");

      try {
        // Personas
        const { data: personasData, error: personasErr } = await supabase
          .from("personal")
          .select("id, nombre, email")
          .eq("org_id", currentOrg.id)
          .eq("is_deleted", false)
          .order("nombre", { ascending: true });

        if (personasErr) throw personasErr;

        // Actividades
       const { data: geoData, error: geoErr } = await supabase
  .from("geocercas")
  .select("id, nombre")
  .eq("org_id", currentOrg.id)
  .order("nombre", { ascending: true });

        if (actErr) throw actErr;

        // Geocercas (QUITAMOS is_deleted para evitar error 400)
        
          .from("geocercas")
          .select("id, nombre")
          .eq("org_id", currentOrg.id)
          .order("nombre", { ascending: true });
const { data: geoData, error: geoErr } = await supabase
        if (geoErr) throw geoErr;

        setPersonas(personasData || []);
        setActividades(actData || []);
        setGeocercas(geoData || []);
      } catch (e) {
        console.error("[CostosPage] Error cargando filtros:", e);
        setError(
          "Error al cargar filtros (personas, actividades, geocercas). Revisa la consola."
        );
      } finally {
        setLoadingFilters(false);
      }
    };

    loadFilters();
  }, [currentOrg?.id, canView]);

  // Cargar reporte principal
  const fetchReport = async () => {
    if (!currentOrg?.id || !canView) return;

    setLoading(true);
    setError("");

    try {
      /**
       * IMPORTANTE:
       * Aquí asumimos que existe una vista v_costos_detalle con:
       *  - id
       *  - org_id
       *  - personal_id, personal_nombre
       *  - actividad_id, actividad_nombre
       *  - geocerca_id, geocerca_nombre
       *  - start_time, end_time
       *  - horas
       *  - hourly_rate
       *  - costo
       *  - currency_code
       */

      let query = supabase
        .from("v_costos_detalle")
        .select(
          `
          id,
          org_id,
          personal_id,
          personal_nombre,
          actividad_id,
          actividad_nombre,
          geocerca_id,
          geocerca_nombre,
          start_time,
          end_time,
          horas,
          hourly_rate,
          costo,
          currency_code
        `
        )
        .eq("org_id", currentOrg.id);

      if (fromDate) {
        query = query.gte("start_time", fromDate);
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        query = query.lte("end_time", to.toISOString());
      }

      if (selectedPersonaId) {
        query = query.eq("personal_id", selectedPersonaId);
      }
      if (selectedActividadId) {
        query = query.eq("actividad_id", selectedActividadId);
      }
      if (selectedGeocercaId) {
        query = query.eq("geocerca_id", selectedGeocercaId);
      }

      const { data, error: dataErr, status } = await query;

      if (dataErr) {
        // Si la vista no existe todavía, evitamos romper la página
        if (status === 404) {
          console.warn(
            "[CostosPage] La vista v_costos_detalle no existe aún en Supabase."
          );
          setRows([]);
          setError(
            "La vista v_costos_detalle aún no existe en la base de datos. Créala en Supabase para ver datos."
          );
          return;
        }
        throw dataErr;
      }

      setRows(data || []);
    } catch (e) {
      console.error("[CostosPage] Error cargando reporte:", e);
      setError(
        e?.message ||
          e?.details ||
          "Error al cargar el reporte de costos. Revisa la consola."
      );
    } finally {
      setLoading(false);
    }
  };

  // Carga inicial automática
  useEffect(() => {
    if (!currentOrg?.id || !canView) return;
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id, canView]);

  // === RESÚMENES NUMÉRICOS ===
  const resumenMoneda = useMemo(
    () => summarizeByCurrency(rows || []),
    [rows]
  );

  const totalGlobal = useMemo(() => {
    let totalCost = 0;
    let totalHours = 0;

    for (const r of rows || []) {
      totalCost += Number(r.costo) || 0;
      totalHours += Number(r.horas) || 0;
    }

    return { totalCost, totalHours };
  }, [rows]);

  // === DATOS PARA CostosChartPanel (agrupar y sumar) ===
  const chartEntries = useMemo(() => {
    if (!rows || rows.length === 0) return [];

    const map = new Map();

    for (const r of rows) {
      const currency = r.currency_code || "N/A";

      let label = "Sin dato";
      if (chartGrouping === "actividad") {
        label = r.actividad_nombre || "Sin actividad";
      } else if (chartGrouping === "persona") {
        label = r.personal_nombre || "Sin persona";
      } else if (chartGrouping === "geocerca") {
        label = r.geocerca_nombre || "Sin geocerca";
      }

      const key = `${label}__${currency}`;
      const prev = map.get(key) || { label, currency, total: 0 };

      const costo = Number(r.costo) || 0;

      map.set(key, {
        label,
        currency,
        total: prev.total + costo,
      });
    }

    // Ordenar de mayor a menor total
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows, chartGrouping]);

  const maxChartValue = useMemo(() => {
    if (!chartEntries.length) return 0;
    return chartEntries.reduce(
      (max, e) => Math.max(max, Number(e.total) || 0),
      0
    );
  }, [chartEntries]);

  if (!canView) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-semibold mb-2">Reportes de Costos</h1>
        <p className="text-sm text-gray-600">
          Solo los usuarios con rol <strong>OWNER</strong> o{" "}
          <strong>ADMIN</strong> pueden acceder a este módulo.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reportes de Costos</h1>
          <p className="text-sm text-gray-600">
            Analiza horas trabajadas y costos por actividad, persona y geocerca.
            Incluye tarjetas, panel gráfico tipo Power BI y tabla detallada.
          </p>
        </div>
        {loading && (
          <div className="text-xs text-gray-500 animate-pulse">
            Calculando reporte...
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">
          Filtros del reporte
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Fecha desde */}
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600 mb-1">
              Desde
            </label>
            <input
              type="date"
              className="border rounded-lg px-2 py-1 text-sm"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          {/* Fecha hasta */}
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600 mb-1">
              Hasta
            </label>
            <input
              type="date"
              className="border rounded-lg px-2 py-1 text-sm"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          {/* Persona */}
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600 mb-1">
              Persona
            </label>
            <select
              className="border rounded-lg px-2 py-1 text-sm"
              value={selectedPersonaId}
              onChange={(e) => setSelectedPersonaId(e.target.value)}
              disabled={loadingFilters}
            >
              <option value={emptyOption.value}>{emptyOption.label}</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre || p.email || "Sin nombre"}
                </option>
              ))}
            </select>
          </div>

          {/* Actividad */}
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600 mb-1">
              Actividad
            </label>
            <select
              className="border rounded-lg px-2 py-1 text-sm"
              value={selectedActividadId}
              onChange={(e) => setSelectedActividadId(e.target.value)}
              disabled={loadingFilters}
            >
              <option value={emptyOption.value}>{emptyOption.label}</option>
              {actividades.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Geocerca */}
          <div className="flex flex-col md:col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1">
              Geocerca
            </label>
            <select
              className="border rounded-lg px-2 py-1 text-sm"
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
              disabled={loadingFilters}
            >
              <option value={emptyOption.value}>{emptyOption.label}</option>
              {geocercas.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="px-3 py-1 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setFromDate("");
              setToDate("");
              setSelectedPersonaId("");
              setSelectedActividadId("");
              setSelectedGeocercaId("");
            }}
            disabled={loading || loadingFilters}
          >
            Limpiar filtros
          </button>

          <button
            type="button"
            className="px-4 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={fetchReport}
            disabled={loading || loadingFilters}
          >
            Aplicar filtros
          </button>
        </div>

        {error && (
          <div className="text-xs text-red-600 mt-1">
            <strong>Error: </strong>
            {error}
          </div>
        )}
      </div>

      {/* Tarjetas resumen generales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl shadow p-3 flex flex-col">
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            Total de horas
          </span>
          <span className="text-xl font-bold">
            {formatNumber(totalGlobal.totalHours, 2)}
          </span>
          <span className="text-[11px] text-gray-500 mt-1">
            Suma de todas las horas trabajadas en el período filtrado.
          </span>
        </div>

        <div className="bg-white rounded-xl shadow p-3 flex flex-col">
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            Costo total (todas las monedas)
          </span>
          <span className="text-xl font-bold">
            {formatNumber(totalGlobal.totalCost, 2)}
          </span>
          <span className="text-[11px] text-gray-500 mt-1">
            Suma global sin distinguir moneda. Revisa abajo por moneda.
          </span>
        </div>

        <div className="bg-white rounded-xl shadow p-3 flex flex-col">
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            Registros
          </span>
          <span className="text-xl font-bold">{rows.length}</span>
          <span className="text-[11px] text-gray-500 mt-1">
            Número de filas detalladas que alimentan las tarjetas, gráficos y
            tabla.
          </span>
        </div>
      </div>

      {/* Tarjetas por moneda */}
      {resumenMoneda.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {resumenMoneda.map((m) => (
            <div
              key={m.currency}
              className="bg-white rounded-xl shadow p-3 flex flex-col border border-emerald-50"
            >
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                {m.currency}
              </span>
              <span className="text-lg font-semibold">
                {formatNumber(m.totalCost, 2)}
              </span>
              <span className="text-[11px] text-gray-500">
                Horas: {formatNumber(m.totalHours, 2)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* PANEL DE GRÁFICOS TIPO POWER BI */}
      <CostosChartPanel
        chartEntries={chartEntries}
        maxChartValue={maxChartValue}
        chartGrouping={chartGrouping}
        chartType={chartType}
        onChangeChartGrouping={setChartGrouping}
        onChangeChartType={setChartType}
      />

      {/* Tabla detallada */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Detalle de registros
          </h2>
          <span className="text-[11px] text-gray-500">
            Puedes exportar esta tabla a Excel/CSV con tu módulo actual si ya lo
            tienes implementado.
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs table-auto">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left font-semibold text-gray-600">
                  Persona
                </th>
                <th className="px-2 py-1 text-left font-semibold text-gray-600">
                  Geocerca
                </th>
                <th className="px-2 py-1 text-left font-semibold text-gray-600">
                  Actividad
                </th>
                <th className="px-2 py-1 text-left font-semibold text-gray-600">
                  Inicio
                </th>
                <th className="px-2 py-1 text-left font-semibold text-gray-600">
                  Fin
                </th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600">
                  Horas
                </th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600">
                  Tarifa
                </th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600">
                  Costo
                </th>
                <th className="px-2 py-1 text-left font-semibold text-gray-600">
                  Moneda
                </th>
              </tr>
            </thead>
            <tbody>
              {(!rows || rows.length === 0) && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-2 py-6 text-center text-xs text-gray-500"
                  >
                    No hay datos para los filtros seleccionados.
                  </td>
                </tr>
              )}
              {(rows || []).map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-2 py-1">
                    {r.personal_nombre || "Sin nombre"}
                  </td>
                  <td className="px-2 py-1">
                    {r.geocerca_nombre || "Sin geocerca"}
                  </td>
                  <td className="px-2 py-1">
                    {r.actividad_nombre || "Sin actividad"}
                  </td>
                  <td className="px-2 py-1">{formatDateTime(r.start_time)}</td>
                  <td className="px-2 py-1">{formatDateTime(r.end_time)}</td>
                  <td className="px-2 py-1 text-right">
                    {formatNumber(r.horas, 2)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatNumber(r.hourly_rate, 2)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatNumber(r.costo, 2)}
                  </td>
                  <td className="px-2 py-1">{r.currency_code || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CostosPage;
