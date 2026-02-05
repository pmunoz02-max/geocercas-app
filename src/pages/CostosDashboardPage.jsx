// src/pages/CostosDashboardPage.jsx
// Dashboard de Costos — Versión PRO (roles centralizados + más métricas + export)
// ✅ Alineado a AuthContext nuevo: espera authReady + orgsReady, usa currentOrg.id
// ✅ FIX: activities por org_id (fallback legacy tenant_id)
// ✅ i18n: 100% dashboardCostos.* (sin strings hardcodeados)
// ✅ DatePicker con icono calendario (via DatePickerField) + validación Desde<=Hasta

import React, { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useModuleAccess } from "../hooks/useModuleAccess";
import { MODULE_KEYS } from "../lib/permissions";
import { useTranslation } from "react-i18next";
import html2canvas from "html2canvas/dist/html2canvas.esm.js";

// ✅ DatePicker reutilizable (HTML nativo + icono)
import DatePickerField from "../components/ui/DatePickerField";

// Recharts
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

/* -----------------------------------------
   UTILIDADES (alineadas con CostosPage)
----------------------------------------- */

function summarizeByCurrency(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const currency = row.currency_code || "N/A";
    const prev = map.get(currency) || {
      currency,
      totalCost: 0,
      totalHours: 0,
    };
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

function buildDateRange(fromDateStr, toDateStr) {
  let fromIso = null;
  let toIsoExclusive = null;

  if (fromDateStr) {
    const d = new Date(fromDateStr + "T00:00:00");
    if (!Number.isNaN(d.getTime())) fromIso = d.toISOString();
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

function isDateRangeInvalid(fromDateStr, toDateStr) {
  if (!fromDateStr || !toDateStr) return false;
  // YYYY-MM-DD permite comparación lexicográfica segura
  return fromDateStr > toDateStr;
}

/* -----------------------------------------
   DIMENSIONES
----------------------------------------- */

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

/* -----------------------------------------
   TIPOS DE GRÁFICO Y MÉTRICAS
----------------------------------------- */

const CHART_TYPES = {
  bar: { id: "bar", labelKey: "dashboardCostos.chartTypeBar" },
  line: { id: "line", labelKey: "dashboardCostos.chartTypeLine" },
  pie: { id: "pie", labelKey: "dashboardCostos.chartTypePie" },
};

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
  avgRate: {
    id: "avgRate",
    labelKey: "dashboardCostos.metricAvgRate",
    key: "avgRate",
  },
  records: {
    id: "records",
    labelKey: "dashboardCostos.metricRecords",
    key: "registros",
  },
};

/* -----------------------------------------
   COLORES
----------------------------------------- */

const COLOR_PALETTE = [
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

/* -----------------------------------------
   AGREGACIÓN
----------------------------------------- */

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

  const result = Array.from(map.values());

  for (const item of result) {
    item.avgRate = item.totalHours > 0 ? item.totalCost / item.totalHours : 0;
  }

  result.sort((a, b) => (b.totalCost || 0) - (a.totalCost || 0));

  return result;
}

/* -----------------------------------------
   CHART RENDERER
----------------------------------------- */

function ChartRenderer({ chartType, data, metricKey, valueLabel }) {
  const { t } = useTranslation();
  const trimmedData = (data || []).slice(0, 20);

  if (!trimmedData.length) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-gray-500">
        {t("dashboardCostos.chartNoData")}
      </div>
    );
  }

  if (chartType === "pie") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Tooltip formatter={(v) => formatNumber(v, 2)} />
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
                fill={COLOR_PALETTE[index % COLOR_PALETTE.length]}
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
        <LineChart data={trimmedData} margin={{ top: 10, right: 20, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" angle={-30} textAnchor="end" interval={0} height={60} />
          <YAxis />
          <Tooltip formatter={(v) => formatNumber(v, 2)} />
          <Legend />
          <Line type="monotone" dataKey={metricKey} stroke="#6366F1" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={trimmedData} margin={{ top: 10, right: 20, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" angle={-30} textAnchor="end" interval={0} height={60} />
        <YAxis />
        <Tooltip formatter={(v) => formatNumber(v, 2)} />
        <Legend />
        <Bar dataKey={metricKey} name={valueLabel} radius={[4, 4, 0, 0]}>
          {trimmedData.map((entry, index) => (
            <Cell
              key={`bar-${entry.key}-${index}`}
              fill={COLOR_PALETTE[index % COLOR_PALETTE.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* -----------------------------------------
   HELPERS DE CARGA (org_id primero)
----------------------------------------- */

async function loadActivitiesForOrg(orgId) {
  if (!orgId) return [];

  // ✅ Intento 1: org_id (modelo actual)
  const q1 = await supabase
    .from("activities")
    .select("id, name, org_id")
    .eq("org_id", orgId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (!q1.error && Array.isArray(q1.data) && q1.data.length > 0) return q1.data;

  // 🟡 Fallback legacy: tenant_id (por compatibilidad)
  const q2 = await supabase
    .from("activities")
    .select("id, name, tenant_id")
    .eq("tenant_id", orgId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (q2.error) throw q2.error;
  return q2.data || [];
}

/* -----------------------------------------
   PÁGINA PRINCIPAL
----------------------------------------- */

const CostosDashboardPage = () => {
  const { t } = useTranslation();
  const chartRef = useRef(null);

  // ✅ Nuevo contrato
  const { loading: authLoading, isAuthenticated, contextLoading, currentOrg } = useAuth();

  // Permisos (se mantiene tu hook)
  const { role, canView, loading: loadingAccess } = useModuleAccess(
    MODULE_KEYS.DASHBOARD_COSTOS
  );

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [selectedActividadId, setSelectedActividadId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");

  const [personas, setPersonas] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [geocercas, setGeocercas] = useState([]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedDimension, setSelectedDimension] = useState("persona");
  const [selectedChartType, setSelectedChartType] = useState("bar");
  const [selectedMetric, setSelectedMetric] = useState("cost");

  // ✅ Estado de validación rango fechas
  const [dateRangeError, setDateRangeError] = useState("");

  // ✅ Loading correcto del contexto (antes de decidir nada)
  if (authLoading) {
    return <div className="p-4 text-sm text-gray-600">{t("dashboardCostos.sessionLoading")}</div>;
  }

  if (!isAuthenticated) {
    return <div className="p-4 text-sm text-red-600">{t("dashboardCostos.noActiveSession")}</div>;
  }

  if (contextLoading && !currentOrg?.id) {
    return <div className="p-4 text-sm text-gray-600">{t("dashboardCostos.loadingCurrentOrg")}</div>;
  }

  if (!currentOrg?.id) {
    return (
      <div className="p-4 text-sm text-red-600">
        {t("dashboardCostos.noOrgAssigned")}
      </div>
    );
  }

  if (loadingAccess) {
    return (
      <div className="p-4 text-sm text-gray-600">
        {t("dashboardCostos.loadingPermissions")}
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="p-4 text-red-600">
        {t("dashboardCostos.noAccess")}
        <p className="mt-2 text-xs text-gray-400">
          ({t("dashboardCostos.currentRoleLabel")}: {role || t("dashboardCostos.roleNone")})
        </p>
      </div>
    );
  }

  // ------------------------------
  // Validación fechas (solo si ambos existen)
  // ------------------------------
  useEffect(() => {
    if (isDateRangeInvalid(fromDate, toDate)) {
      setDateRangeError(t("dashboardCostos.dateRangeInvalid") || "Rango de fechas inválido");
    } else {
      setDateRangeError("");
    }
  }, [fromDate, toDate, t]);

  // ------------------------------
  // Cargar filtros por org
  // ------------------------------
  useEffect(() => {
    if (!currentOrg?.id) return;

    async function loadFilters() {
      try {
        const [personasRes, actData, geoRes] = await Promise.all([
          supabase
            .from("personal")
            .select("id, nombre, email")
            .eq("org_id", currentOrg.id)
            .eq("is_deleted", false)
            .order("nombre", { ascending: true }),

          loadActivitiesForOrg(currentOrg.id),

          supabase
            .from("geocercas")
            .select("id, nombre")
            .eq("org_id", currentOrg.id)
            .order("nombre", { ascending: true }),
        ]);

        if (personasRes.error) throw personasRes.error;
        if (geoRes.error) throw geoRes.error;

        setPersonas(personasRes.data || []);
        setActividades(actData || []);
        setGeocercas(geoRes.data || []);
      } catch (e) {
        console.error("[CostosDashboard] loadFilters error:", e);
      }
    }

    loadFilters();
  }, [currentOrg?.id]);

  // ------------------------------
  // Fetch principal
  // ------------------------------
  const fetchReport = async () => {
    if (!currentOrg?.id) return;

    // ✅ Bloqueo si rango inválido
    if (isDateRangeInvalid(fromDate, toDate)) {
      setDateRangeError(t("dashboardCostos.dateRangeInvalid") || "Rango de fechas inválido");
      return;
    }

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

      const { data, error } = await query;
      if (error) throw error;

      setRows(data || []);
    } catch (e) {
      console.error("[CostosDashboard] fetchReport error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentOrg?.id) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id]);

  const resumenMoneda = useMemo(() => summarizeByCurrency(rows), [rows]);

  const totalGlobal = useMemo(() => {
    let totalCost = 0;
    let totalHours = 0;
    for (const r of rows || []) {
      totalCost += Number(r.costo) || 0;
      totalHours += Number(r.horas) || 0;
    }
    return { totalCost, totalHours };
  }, [rows]);

  const globalAvgRate =
    totalGlobal.totalHours > 0 ? totalGlobal.totalCost / totalGlobal.totalHours : 0;

  const aggregatedData = useMemo(() => {
    const dim = DIMENSIONS[selectedDimension];
    const raw = aggregateBy(rows, { groupKey: dim.groupKey, labelField: dim.labelField });

    return raw.map((item) => {
      const isUnknown = item.key === "SIN_DATO" || item.label === "SIN_DATO" || item.label == null;
      return {
        ...item,
        label: isUnknown ? t("dashboardCostos.unknownCategory") : item.label,
      };
    });
  }, [rows, selectedDimension, t]);

  const metricConfig = METRICS[selectedMetric];

  // ------------------------------
  // Exporters
  // ------------------------------
  const handleExportDataCSV = () => {
    if (!aggregatedData.length) {
      alert(t("dashboardCostos.exportNoData"));
      return;
    }

    const header = [
      t("dashboardCostos.csvHeaderCategoria"),
      t("dashboardCostos.csvHeaderTotalHoras"),
      t("dashboardCostos.csvHeaderTotalCosto"),
      t("dashboardCostos.csvHeaderTarifaPromedio"),
      t("dashboardCostos.csvHeaderRegistros"),
    ];

    const lines = aggregatedData.map((row) =>
      [
        (row.label || "").replace(/;/g, ","),
        String(row.totalHours ?? "").replace(/;/g, ","),
        String(row.totalCost ?? "").replace(/;/g, ","),
        String(row.avgRate ?? "").replace(/;/g, ","),
        String(row.registros ?? "").replace(/;/g, ","),
      ].join(";")
    );

    const csv = [header.join(";"), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${t("dashboardCostos.exportFilePrefix")}_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportChartPNG = async () => {
    if (!chartRef.current) {
      alert(t("dashboardCostos.exportChartContainerNotFound"));
      return;
    }

    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: "#ffffff",
        useCORS: true,
        scale: 2,
      });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      link.href = dataUrl;
      link.download = `${t("dashboardCostos.exportFilePrefix")}_${today}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("[CostosDashboard] exportChart error:", e);
      alert(t("dashboardCostos.exportChartError"));
    }
  };

  // ------------------------------
  // Render
  // ------------------------------
  return (
    <div className="p-4 space-y-4">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("dashboardCostos.title")}</h1>
          <p className="text-sm text-gray-600">{t("dashboardCostos.subtitle")}</p>
          <p className="text-xs text-gray-500 mt-1">
            {t("dashboardCostos.currentOrgLabel")}:{" "}
            <span className="font-medium">{currentOrg?.name || "—"}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={fetchReport}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
            disabled={loading || !!dateRangeError}
            title={dateRangeError ? dateRangeError : undefined}
          >
            {loading ? t("dashboardCostos.refreshing") : t("dashboardCostos.refreshButton")}
          </button>

          <button
            onClick={handleExportDataCSV}
            className="px-3 py-2 rounded-lg border text-xs md:text-sm hover:bg-gray-50"
          >
            {t("dashboardCostos.exportDataButton")}
          </button>

          <button
            onClick={handleExportChartPNG}
            className="px-3 py-2 rounded-lg border text-xs md:text-sm hover:bg-gray-50"
          >
            {t("dashboardCostos.exportChartButton")}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3 shadow border-l-4 border-emerald-500">
          <p className="text-xs text-gray-500 uppercase">{t("dashboardCostos.kpiTotalHours")}</p>
          <p className="text-xl font-bold">{formatNumber(totalGlobal.totalHours)}</p>
        </div>

        <div className="bg-white rounded-xl p-3 shadow border-l-4 border-indigo-500">
          <p className="text-xs text-gray-500 uppercase">{t("dashboardCostos.kpiTotalCost")}</p>
          <p className="text-xl font-bold">{formatNumber(totalGlobal.totalCost)}</p>
        </div>

        <div className="bg-white rounded-xl p-3 shadow border-l-4 border-amber-500">
          <p className="text-xs text-gray-500 uppercase">{t("dashboardCostos.kpiRecords")}</p>
          <p className="text-xl font-bold">{rows.length}</p>
        </div>

        <div className="bg-white rounded-xl p-3 shadow border-l-4 border-pink-500">
          <p className="text-xs text-gray-500 uppercase">{t("dashboardCostos.kpiAvgRate")}</p>
          <p className="text-xl font-bold">{formatNumber(globalAvgRate)}</p>
        </div>
      </div>

      {/* Resumen por moneda */}
      {resumenMoneda.length > 0 && (
        <div className="bg-white rounded-xl p-3 shadow">
          <h2 className="text-xs font-semibold text-gray-700 mb-2">
            {t("dashboardCostos.currenciesSummaryTitle")}
          </h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {resumenMoneda.map((m, idx) => (
              <div
                key={m.currency || idx}
                className="px-3 py-1 rounded-full border flex items-center gap-2"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: COLOR_PALETTE[idx % COLOR_PALETTE.length] }}
                />
                <span className="font-semibold">
                  {m.currency === "N/A" ? t("dashboardCostos.na") : (m.currency || t("dashboardCostos.na"))}
                </span>
                <span className="text-gray-500">
                  {formatNumber(m.totalCost)} / {formatNumber(m.totalHours)} {t("dashboardCostos.labelHours")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white shadow rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">{t("dashboardCostos.filtersTitle")}</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <DatePickerField
              label={t("dashboardCostos.filtersFrom")}
              value={fromDate}
              onChange={setFromDate}
              // ✅ si existe "Hasta", limita máximo en "Desde"
              max={toDate || undefined}
            />
          </div>

          <div>
            <DatePickerField
              label={t("dashboardCostos.filtersTo")}
              value={toDate}
              onChange={setToDate}
              // ✅ si existe "Desde", limita mínimo en "Hasta"
              min={fromDate || undefined}
            />
          </div>

          <div>
            <label className="text-xs text-gray-600">{t("dashboardCostos.filtersPerson")}</label>
            <select
              value={selectedPersonaId}
              onChange={(e) => setSelectedPersonaId(e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm w-full"
            >
              <option value="">{t("dashboardCostos.filtersAll")}</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre || p.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-600">{t("dashboardCostos.filtersActivity")}</label>
            <select
              value={selectedActividadId}
              onChange={(e) => setSelectedActividadId(e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm w-full"
            >
              <option value="">{t("dashboardCostos.filtersAll")}</option>
              {actividades.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">{t("dashboardCostos.filtersGeofence")}</label>
            <select
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm w-full"
            >
              <option value="">{t("dashboardCostos.filtersAll")}</option>
              {geocercas.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ✅ error rango fechas */}
        {dateRangeError && (
          <div className="text-xs text-red-600">
            {dateRangeError}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-1 border rounded-lg text-xs md:text-sm hover:bg-gray-50"
            onClick={() => {
              setFromDate("");
              setToDate("");
              setSelectedPersonaId("");
              setSelectedActividadId("");
              setSelectedGeocercaId("");
              setDateRangeError("");
            }}
          >
            {t("dashboardCostos.filtersClear")}
          </button>

          <button
            className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs md:text-sm hover:bg-emerald-700"
            onClick={fetchReport}
            disabled={!!dateRangeError}
            title={dateRangeError ? dateRangeError : undefined}
          >
            {t("dashboardCostos.filtersApply")}
          </button>
        </div>
      </div>

      {/* Gráfico principal */}
      <div className="bg-white rounded-xl p-4 shadow space-y-3">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <h2 className="text-sm font-semibold text-gray-700">{t("dashboardCostos.chartTitle")}</h2>

          <div className="flex flex-wrap gap-3 text-xs">
            <div>
              <label className="text-[11px] text-gray-600">{t("dashboardCostos.chartDimension")}</label>
              <select
                value={selectedDimension}
                onChange={(e) => setSelectedDimension(e.target.value)}
                className="border rounded-lg px-2 py-1 ml-1"
              >
                {Object.values(DIMENSIONS).map((d) => (
                  <option key={d.id} value={d.id}>
                    {t(d.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-gray-600">{t("dashboardCostos.chartMetric")}</label>
              <select
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
                className="border rounded-lg px-2 py-1 ml-1"
              >
                {Object.values(METRICS).map((m) => (
                  <option key={m.id} value={m.id}>
                    {t(m.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-gray-600">{t("dashboardCostos.chartType")}</label>
              <select
                value={selectedChartType}
                onChange={(e) => setSelectedChartType(e.target.value)}
                className="border rounded-lg px-2 py-1 ml-1"
              >
                {Object.values(CHART_TYPES).map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {t(ct.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div ref={chartRef}>
          <ChartRenderer
            chartType={selectedChartType}
            data={aggregatedData}
            metricKey={metricConfig.key}
            valueLabel={t(metricConfig.labelKey)}
          />
        </div>
      </div>

      {/* Tabla resumen */}
      <div className="bg-white rounded-xl p-4 shadow">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">{t("dashboardCostos.tableTitle")}</h2>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left">{t("dashboardCostos.colCategoria")}</th>
                <th className="px-2 py-1 text-right">{t("dashboardCostos.colHoras")}</th>
                <th className="px-2 py-1 text-right">{t("dashboardCostos.colCosto")}</th>
                <th className="px-2 py-1 text-right">{t("dashboardCostos.colTarifaPromedio")}</th>
                <th className="px-2 py-1 text-right">{t("dashboardCostos.colRegistros")}</th>
              </tr>
            </thead>
            <tbody>
              {aggregatedData.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-gray-500">
                    {t("dashboardCostos.tableEmpty")}
                  </td>
                </tr>
              )}

              {aggregatedData.slice(0, 30).map((row) => (
                <tr key={row.key} className="border-t border-gray-100">
                  <td className="px-2 py-1">{row.label}</td>
                  <td className="px-2 py-1 text-right">{formatNumber(row.totalHours)}</td>
                  <td className="px-2 py-1 text-right">{formatNumber(row.totalCost)}</td>
                  <td className="px-2 py-1 text-right">{formatNumber(row.avgRate)}</td>
                  <td className="px-2 py-1 text-right">{row.registros}</td>
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
