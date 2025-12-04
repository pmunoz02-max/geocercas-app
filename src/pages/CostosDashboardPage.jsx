// src/pages/CostosDashboardPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";

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

// === Utilidades comunes (copiadas de CostosPage para consistencia) ===

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

// Configuración de dimensiones para el análisis
const DIMENSIONS = {
  persona: {
    id: "persona",
    label: "Por persona",
    groupKey: "personal_id",
    labelField: "personal_nombre",
  },
  actividad: {
    id: "actividad",
    label: "Por actividad",
    groupKey: "actividad_id",
    labelField: "actividad_nombre",
  },
  geocerca: {
    id: "geocerca",
    label: "Por geocerca",
    groupKey: "geocerca_id",
    labelField: "geocerca_nombre",
  },
  moneda: {
    id: "moneda",
    label: "Por moneda",
    groupKey: "currency_code",
    labelField: "currency_code",
  },
};

const CHART_TYPES = {
  bar: { id: "bar", label: "Barras" },
  line: { id: "line", label: "Líneas" },
  pie: { id: "pie", label: "Pastel" },
};

const METRICS = {
  cost: { id: "cost", label: "Costo total", key: "totalCost" },
  hours: { id: "hours", label: "Horas totales", key: "totalHours" },
};

// Paleta simple para el pastel
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
    const labelRaw =
      (labelField && r[labelField]) ||
      (typeof keyValue === "string" ? keyValue : String(keyValue));
    const label =
      (labelRaw || "").trim() !== "" ? labelRaw : "Sin dato / N/A";

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

// === Componente para renderizar gráficos según tipo ===

function ChartRenderer({ chartType, data, metricKey, valueLabel, maxItems = 15 }) {
  const trimmedData = (data || []).slice(0, maxItems);
  const hasData = trimmedData.length > 0;

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-gray-500">
        No hay datos para graficar con los filtros actuales.
      </div>
    );
  }

  if (chartType === "pie") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Tooltip
            formatter={(value) => formatNumber(value, 2)}
            labelFormatter={(label) => label}
          />
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

  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={trimmedData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
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
          <Line
            type="monotone"
            dataKey={metricKey}
            name={valueLabel}
            stroke="#6366F1"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Default: barras
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={trimmedData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
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
        <Bar
          dataKey={metricKey}
          name={valueLabel}
          fill="#10B981"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// === Página principal del dashboard ===

const CostosDashboardPage = () => {
  const { currentOrg, currentRole } = useAuth();

  // Filtros compartidos con CostosPage
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [selectedActividadId, setSelectedActividadId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");

  // Combos
  const [personas, setPersonas] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [geocercas, setGeocercas] = useState([]);

  // Datos base (detalle) y estados
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [error, setError] = useState("");

  // Controles del dashboard
  const [selectedDimension, setSelectedDimension] = useState("persona");
  const [selectedChartType, setSelectedChartType] = useState("bar");
  const [selectedMetric, setSelectedMetric] = useState("cost");

  // Permisos
  const role = (currentRole || "").toLowerCase();
  const canView = role === "owner" || role === "admin";

  // Cargar combos (personas, actividades, geocercas)
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
        const { data: actData, error: actErr } = await supabase
          .from("activities")
          .select("id, name")
          .eq("tenant_id", currentOrg.id)
          .eq("active", true)
          .order("name", { ascending: true });

        if (actErr) throw actErr;

        // Geocercas
        const { data: geoData, error: geoErr } = await supabase
          .from("geocercas")
          .select("id, nombre")
          .eq("org_id", currentOrg.id)
          .order("nombre", { ascending: true });

        if (geoErr) throw geoErr;

        setPersonas(personasData || []);
        setActividades(actData || []);
        setGeocercas(geoData || []);
      } catch (e) {
        console.error("[CostosDashboardPage] Error cargando filtros:", e);
        setError(
          "Error al cargar filtros (personas, actividades, geocercas). Revisa la consola."
        );
      } finally {
        setLoadingFilters(false);
      }
    };

    loadFilters();
  }, [currentOrg?.id, canView]);

  // Cargar datos base desde la vista v_costos_detalle
  const fetchReport = async () => {
    if (!currentOrg?.id || !canView) return;

    setLoading(true);
    setError("");

    try {
      let query = supabase
        .from("v_costos_detalle")
        .select(
          `
          id,
          org_id,
          tenant_id,
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
        if (status === 404) {
          console.warn(
            "[CostosDashboardPage] La vista v_costos_detalle no existe aún en Supabase."
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
      console.error("[CostosDashboardPage] Error cargando reporte:", e);
      setError(
        e?.message ||
          e?.details ||
          "Error al cargar el reporte de costos para el dashboard. Revisa la consola."
      );
    } finally {
      setLoading(false);
    }
  };

  // Carga inicial
  useEffect(() => {
    if (!currentOrg?.id || !canView) return;
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id, canView]);

  // Resúmenes numéricos
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

  // Datos agregados para el gráfico según dimensión y métrica
  const aggregatedData = useMemo(() => {
    const dim = DIMENSIONS[selectedDimension];
    if (!dim) return [];
    return aggregateBy(rows, {
      groupKey: dim.groupKey,
      labelField: dim.labelField,
    });
  }, [rows, selectedDimension]);

  const metricConfig = METRICS[selectedMetric] || METRICS.cost;
  const metricKey = metricConfig.key;
  const metricLabel = metricConfig.label;

  if (!canView) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-semibold mb-2">Dashboard de Costos</h1>
        <p className="text-sm text-gray-600">
          Solo los usuarios con rol <strong>OWNER</strong> o{" "}
          <strong>ADMIN</strong> pueden acceder a este módulo.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Encabezado principal */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Dashboard de Costos</h1>
          <p className="text-sm text-gray-600">
            Panel gráfico tipo Power BI para analizar horas y costos por
            persona, actividad, geocerca y moneda.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loading && (
            <span className="text-xs text-gray-500 animate-pulse">
              Actualizando datos...
            </span>
          )}
          <button
            type="button"
            onClick={fetchReport}
            className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={loading || loadingFilters}
          >
            Refrescar datos
          </button>
        </div>
      </div>

      {/* Filtros (igual lógica que CostosPage) */}
      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Filtros del dataset
          </h2>
          <span className="text-[11px] text-gray-500">
            Estos filtros afectan a todas las tarjetas y gráficos.
          </span>
        </div>

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

      {/* KPIs principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow p-3 flex flex-col">
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            Total de horas
          </span>
          <span className="text-xl font-bold">
            {formatNumber(totalGlobal.totalHours, 2)}
          </span>
          <span className="text-[11px] text-gray-500 mt-1">
            Horas totales del período y filtros seleccionados.
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
            Suma de costos sin distinguir moneda.
          </span>
        </div>

        <div className="bg-white rounded-xl shadow p-3 flex flex-col">
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            Registros
          </span>
          <span className="text-xl font-bold">{rows.length}</span>
          <span className="text-[11px] text-gray-500 mt-1">
            Filas de detalle que alimentan el dashboard.
          </span>
        </div>

        <div className="bg-white rounded-xl shadow p-3 flex flex-col">
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            Monedas detectadas
          </span>
          <span className="text-xl font-bold">{resumenMoneda.length}</span>
          <span className="text-[11px] text-gray-500 mt-1">
            Revisa el desglose por moneda más abajo.
          </span>
        </div>
      </div>

      {/* Controles del gráfico principal */}
      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">
              Gráfico principal
            </h2>
            <p className="text-[11px] text-gray-500">
              Cambia la dimensión, la métrica y el tipo de gráfico para explorar
              los datos como en un dashboard de BI.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            {/* Dimensión */}
            <div className="flex flex-col min-w-[140px]">
              <label className="text-[11px] font-medium text-gray-600 mb-1">
                Dimensión
              </label>
              <select
                className="border rounded-lg px-2 py-1"
                value={selectedDimension}
                onChange={(e) => setSelectedDimension(e.target.value)}
              >
                {Object.values(DIMENSIONS).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Métrica */}
            <div className="flex flex-col min-w-[140px]">
              <label className="text-[11px] font-medium text-gray-600 mb-1">
                Métrica
              </label>
              <select
                className="border rounded-lg px-2 py-1"
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
              >
                {Object.values(METRICS).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tipo de gráfico */}
            <div className="flex flex-col min-w-[140px]">
              <label className="text-[11px] font-medium text-gray-600 mb-1">
                Tipo de gráfico
              </label>
              <select
                className="border rounded-lg px-2 py-1"
                value={selectedChartType}
                onChange={(e) => setSelectedChartType(e.target.value)}
              >
                {Object.values(CHART_TYPES).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Gráfico principal */}
        <div className="mt-2">
          <ChartRenderer
            chartType={selectedChartType}
            data={aggregatedData}
            metricKey={metricKey}
            valueLabel={metricLabel}
          />
        </div>
      </div>

      {/* Resumen tabular del gráfico (Top 15) */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Top categorías según filtro
          </h2>
          <span className="text-[11px] text-gray-500">
            Se muestran hasta 15 categorías ordenadas por costo total.
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs table-auto">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left font-semibold text-gray-600">
                  Categoría
                </th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600">
                  Horas totales
                </th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600">
                  Costo total
                </th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600">
                  Registros
                </th>
              </tr>
            </thead>
            <tbody>
              {aggregatedData.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-2 py-6 text-center text-xs text-gray-500"
                  >
                    No hay datos agregados para mostrar.
                  </td>
                </tr>
              )}
              {aggregatedData.slice(0, 15).map((row) => (
                <tr key={row.key} className="border-t border-gray-100">
                  <td className="px-2 py-1">{row.label}</td>
                  <td className="px-2 py-1 text-right">
                    {formatNumber(row.totalHours, 2)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatNumber(row.totalCost, 2)}
                  </td>
                  <td className="px-2 py-1 text-right">{row.registros}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen por moneda */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          Resumen por moneda
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs table-auto">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left font-semibold text-gray-600">
                  Moneda
                </th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600">
                  Horas totales
                </th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600">
                  Costo total
                </th>
              </tr>
            </thead>
            <tbody>
              {resumenMoneda.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-2 py-6 text-center text-xs text-gray-500"
                  >
                    No hay datos para mostrar por moneda.
                  </td>
                </tr>
              )}
              {resumenMoneda.map((m) => (
                <tr key={m.currency} className="border-t border-gray-100">
                  <td className="px-2 py-1">{m.currency}</td>
                  <td className="px-2 py-1 text-right">
                    {formatNumber(m.totalHours, 2)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatNumber(m.totalCost, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CostosDashboardPage;
