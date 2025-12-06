// src/pages/CostosDashboardPage.jsx
// VERSION INTERNACIONALIZADA (ES/EN/FR)
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";

// Recharts para gráficos
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

// === Utilidades comunes (alineadas con CostosPage) ===

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

/**
 * Normaliza las fechas de filtro (inputs type="date") a un rango de
 * timestamptz ISO listo para enviar a Supabase.
 *
 * - fromDateStr → YYYY-MM-DD → fromIso = ese día a las 00:00:00
 * - toDateStr   → YYYY-MM-DD → toIsoExclusive = día siguiente a las 00:00:00
 *
 * Rango aplicado como:
 *   start_time >= fromIso
 *   start_time  < toIsoExclusive
 */
function buildDateRange(fromDateStr, toDateStr) {
  let fromIso = null;
  let toIsoExclusive = null;

  if (fromDateStr) {
    const d = new Date(fromDateStr + "T00:00:00");
    if (!Number.isNaN(d.getTime())) {
      fromIso = d.toISOString();
    }
  }

  if (toDateStr) {
    const d = new Date(toDateStr + "T00:00:00");
    if (!Number.isNaN(d.getTime())) {
      d.setDate(d.getDate() + 1);
      toIsoExclusive = d.toISOString();
    }
  }

  return { fromIso, toIsoExclusive };
}

// Configuración de dimensiones para análisis
// Usamos labelKey para que se traduzca con i18n
const DIMENSIONS = {
  persona: {
    id: "persona",
    labelKey: "dashboardCostos.dimensionPersona",
    groupKey: "personal_id",
    labelField: "personal_nombre",
  },
  actividad: {
    id: "actividad",
    labelKey: "dashboardCostos.dimensionActividad",
    groupKey: "actividad_id",
    labelField: "actividad_nombre",
  },
  geocerca: {
    id: "geocerca",
    labelKey: "dashboardCostos.dimensionGeocerca",
    groupKey: "geocerca_id",
    labelField: "geocerca_nombre",
  },
  moneda: {
    id: "moneda",
    labelKey: "dashboardCostos.dimensionMoneda",
    groupKey: "currency_code",
    labelField: "currency_code",
  },
};

// Tipos de gráficos
const CHART_TYPES = {
  bar: { id: "bar", labelKey: "dashboardCostos.chartTypeBar" },
  line: { id: "line", labelKey: "dashboardCostos.chartTypeLine" },
  pie: { id: "pie", labelKey: "dashboardCostos.chartTypePie" },
};

// Tipos de métricas
const METRICS = {
  cost: {
    id: "cost",
    labelKey: "dashboardCostos.metricCost",
    key: "totalCost",
  },
  hours: {
    id: "hours",
    labelKey: "dashboardCostos.metricHours",
    key: "totalHours",
  },
};

// Paleta de colores
const PIE_COLORS = [
  "#6366F1",
  "#10B981",
  "#F97316",
  "#EC4899",
  "#0EA5E9",
  "#84CC16",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#14B8A6",
];

// === Helpers de agregación ===

function aggregateBy(rows, { groupKey, labelField }) {
  const map = new Map();

  for (const r of rows || []) {
    const keyValue = r[groupKey] || "SIN_DATO";
    const label = r[labelField] || keyValue;

    const prev = map.get(keyValue) || {
      key: keyValue,
      label,
      totalCost: 0,
      totalHours: 0,
      registros: 0,
    };

    map.set(keyValue, {
      ...prev,
      totalCost: prev.totalCost + (Number(r.costo) || 0),
      totalHours: prev.totalHours + (Number(r.horas) || 0),
      registros: prev.registros + 1,
    });
  }

  return Array.from(map.values()).sort(
    (a, b) => (b.totalCost || 0) - (a.totalCost || 0)
  );
}

// === RENDERIZADOR DE GRÁFICOS ===

function ChartRenderer({ chartType, data, metricKey, valueLabel, maxItems = 15 }) {
  const { t } = useTranslation();
  const trimmedData = (data || []).slice(0, maxItems);
  const hasData = trimmedData.length > 0;

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-gray-500">
        {t("dashboardCostos.chartNoData")}
      </div>
    );
  }

  // === GRÁFICO DE PASTEL ===
  if (chartType === "pie") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Tooltip formatter={(value) => formatNumber(value, 2)} />
          <Legend />
          <Pie
            data={trimmedData}
            dataKey={metricKey}
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={120}
            label={(entry) =>
              `${entry.label} (${formatNumber(entry[metricKey], 0)})`
            }
          >
            {trimmedData.map((entry, index) => (
              <Cell
                key={`cell-${entry.key}-${index}`}
                fill={PIE_COLORS[index % PIE_COLORS.length]}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // === GRÁFICO DE LÍNEAS ===
  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={trimmedData} margin={{ top: 10, right: 20, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            angle={-35}
            textAnchor="end"
            interval={0}
            height={60}
          />
          <YAxis />
          <Tooltip formatter={(value) => formatNumber(value, 2)} />
          <Legend />
          <Line type="monotone" dataKey={metricKey} stroke="#6366F1" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // === GRÁFICO DE BARRAS ===
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={trimmedData} margin={{ top: 10, right: 20, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          angle={-35}
          textAnchor="end"
          interval={0}
          height={60}
        />
        <YAxis />
        <Tooltip formatter={(value) => formatNumber(value, 2)} />
        <Legend />

        <Bar dataKey={metricKey} name={valueLabel} radius={[4, 4, 0, 0]}>
          {trimmedData.map((entry, index) => (
            <Cell
              key={`bar-${entry.key}-${index}`}
              fill={PIE_COLORS[index % PIE_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// === PÁGINA PRINCIPAL ===

const CostosDashboardPage = () => {
  const { currentOrg, currentRole } = useAuth();
  const { t } = useTranslation();

  // Filtros
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [selectedActividadId, setSelectedActividadId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");

  // Combos
  const [personas, setPersonas] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [geocercas, setGeocercas] = useState([]);

  // Datos base
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(false);

  // Controles del gráfico
  const [selectedDimension, setSelectedDimension] = useState("persona");
  const [selectedChartType, setSelectedChartType] = useState("bar");
  const [selectedMetric, setSelectedMetric] = useState("cost");

  const role = (currentRole || "").toLowerCase();
  const canView = role === "owner" || role === "admin";

  // Cargar combos
  useEffect(() => {
    if (!currentOrg?.id || !canView) return;

    const loadFilters = async () => {
      setLoadingFilters(true);

      try {
        const { data: personasData } = await supabase
          .from("personal")
          .select("id, nombre, email")
          .eq("org_id", currentOrg.id)
          .eq("is_deleted", false)
          .order("nombre");

        const { data: actData } = await supabase
          .from("activities")
          .select("id, name")
          .eq("tenant_id", currentOrg.id)
          .eq("active", true)
          .order("name");

        const { data: geoData } = await supabase
          .from("geocercas")
          .select("id, nombre")
          .eq("org_id", currentOrg.id)
          .order("nombre");

        setPersonas(personasData || []);
        setActividades(actData || []);
        setGeocercas(geoData || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingFilters(false);
      }
    };

    loadFilters();
  }, [currentOrg?.id, canView]);

  // Cargar datos del dashboard
  const fetchReport = async () => {
    if (!currentOrg?.id) return;

    setLoading(true);

    try {
      const { fromIso, toIsoExclusive } = buildDateRange(fromDate, toDate);

      let query = supabase
        .from("v_costos_detalle")
        .select("*")
        .eq("org_id", currentOrg.id);

      if (fromIso) query = query.gte("start_time", fromIso);
      if (toIsoExclusive) query = query.lt("start_time", toIsoExclusive);

      if (selectedPersonaId) query = query.eq("personal_id", selectedPersonaId);
      if (selectedActividadId) query = query.eq("actividad_id", selectedActividadId);
      if (selectedGeocercaId) query = query.eq("geocerca_id", selectedGeocercaId);

      const { data } = await query;

      setRows(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Carga inicial
  useEffect(() => {
    if (currentOrg?.id && canView) fetchReport();
  }, [currentOrg?.id, canView]);

  const resumenMoneda = useMemo(() => summarizeByCurrency(rows), [rows]);

  const totalGlobal = useMemo(() => {
    let totalCost = 0;
    let totalHours = 0;

    for (const r of rows) {
      totalCost += Number(r.costo) || 0;
      totalHours += Number(r.horas) || 0;
    }

    return { totalCost, totalHours };
  }, [rows]);

  const aggregatedData = useMemo(() => {
    const dim = DIMENSIONS[selectedDimension];
    return aggregateBy(rows, {
      groupKey: dim.groupKey,
      labelField: dim.labelField,
    });
  }, [rows, selectedDimension]);

  const metricConfig = METRICS[selectedMetric];

  if (!canView) {
    return (
      <div className="p-4 text-red-600">
        {t("dashboardCostos.noAccess")}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* TITULO */}
      <div className="flex flex-col md:flex-row justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">
            {t("dashboardCostos.title")}
          </h1>
          <p className="text-sm text-gray-600">
            {t("dashboardCostos.subtitle")}
          </p>
        </div>

        <button
          onClick={fetchReport}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
        >
          {t("dashboardCostos.refreshButton")}
        </button>
      </div>

      {/* FILTROS */}
      <div className="bg-white shadow rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold">
          {t("dashboardCostos.filtersTitle")}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs">
              {t("dashboardCostos.filtersFrom")}
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm w-full"
            />
          </div>

          <div>
            <label className="text-xs">
              {t("dashboardCostos.filtersTo")}
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm w-full"
            />
          </div>

          <div>
            <label className="text-xs">
              {t("dashboardCostos.filtersPerson")}
            </label>
            <select
              value={selectedPersonaId}
              onChange={(e) => setSelectedPersonaId(e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm w-full"
            >
              <option value="">
                {t("dashboardCostos.filtersAll")}
              </option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre || p.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs">
              {t("dashboardCostos.filtersActivity")}
            </label>
            <select
              value={selectedActividadId}
              onChange={(e) => setSelectedActividadId(e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm w-full"
            >
              <option value="">
                {t("dashboardCostos.filtersAll")}
              </option>
              {actividades.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs">
              {t("dashboardCostos.filtersGeofence")}
            </label>
            <select
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm w-full"
            >
              <option value="">
                {t("dashboardCostos.filtersAll")}
              </option>
              {geocercas.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-1 border rounded-lg text-sm"
            onClick={() => {
              setFromDate("");
              setToDate("");
              setSelectedPersonaId("");
              setSelectedActividadId("");
              setSelectedGeocercaId("");
            }}
          >
            {t("dashboardCostos.filtersClear")}
          </button>

          <button
            className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm"
            onClick={fetchReport}
          >
            {t("dashboardCostos.filtersApply")}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3 shadow">
          <p className="text-xs text-gray-500">
            {t("dashboardCostos.kpiTotalHours")}
          </p>
          <p className="text-xl font-bold">
            {formatNumber(totalGlobal.totalHours)}
          </p>
        </div>

        <div className="bg-white rounded-xl p-3 shadow">
          <p className="text-xs text-gray-500">
            {t("dashboardCostos.kpiTotalCost")}
          </p>
          <p className="text-xl font-bold">
            {formatNumber(totalGlobal.totalCost)}
          </p>
        </div>

        <div className="bg-white rounded-xl p-3 shadow">
          <p className="text-xs text-gray-500">
            {t("dashboardCostos.kpiRecords")}
          </p>
          <p className="text-xl font-bold">{rows.length}</p>
        </div>

        <div className="bg-white rounded-xl p-3 shadow">
          <p className="text-xs text-gray-500">
            {t("dashboardCostos.kpiCurrencies")}
          </p>
          <p className="text-xl font-bold">{resumenMoneda.length}</p>
        </div>
      </div>

      {/* Controles del gráfico principal */}
      <div className="bg-white rounded-xl p-4 shadow space-y-3">
        <h2 className="text-sm font-semibold">
          {t("dashboardCostos.chartTitle")}
        </h2>

        <div className="flex flex-wrap gap-3 text-xs">
          <div>
            <label className="text-[11px]">
              {t("dashboardCostos.chartDimension")}
            </label>
            <select
              value={selectedDimension}
              onChange={(e) => setSelectedDimension(e.target.value)}
              className="border rounded-lg px-2 py-1"
            >
              {Object.values(DIMENSIONS).map((d) => (
                <option key={d.id} value={d.id}>
                  {t(d.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px]">
              {t("dashboardCostos.chartMetric")}
            </label>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="border rounded-lg px-2 py-1"
            >
              {Object.values(METRICS).map((m) => (
                <option key={m.id} value={m.id}>
                  {t(m.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px]">
              {t("dashboardCostos.chartType")}
            </label>
            <select
              value={selectedChartType}
              onChange={(e) => setSelectedChartType(e.target.value)}
              className="border rounded-lg px-2 py-1"
            >
              {Object.values(CHART_TYPES).map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {t(ct.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ChartRenderer
          chartType={selectedChartType}
          data={aggregatedData}
          metricKey={metricConfig.key}
          valueLabel={t(metricConfig.labelKey)}
        />
      </div>

      {/* Tabla resumen */}
      <div className="bg-white p-4 shadow rounded-xl">
        <h2 className="text-sm font-semibold mb-2">
          {t("dashboardCostos.tableTitle")}
        </h2>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left">
                  {t("dashboardCostos.colCategoria")}
                </th>
                <th className="px-2 py-1 text-right">
                  {t("dashboardCostos.colHoras")}
                </th>
                <th className="px-2 py-1 text-right">
                  {t("dashboardCostos.colCosto")}
                </th>
                <th className="px-2 py-1 text-right">
                  {t("dashboardCostos.colRegistros")}
                </th>
              </tr>
            </thead>

            <tbody>
              {aggregatedData.slice(0, 15).map((row) => (
                <tr key={row.key} className="border-t">
                  <td className="px-2 py-1">{row.label}</td>
                  <td className="px-2 py-1 text-right">
                    {formatNumber(row.totalHours)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatNumber(row.totalCost)}
                  </td>
                  <td className="px-2 py-1 text-right">{row.registros}</td>
                </tr>
              ))}

              {aggregatedData.length === 0 && (
                <tr>
                  <td
                    colSpan="4"
                    className="px-2 py-4 text-center text-gray-500"
                  >
                    {t("dashboardCostos.tableEmpty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CostosDashboardPage;
