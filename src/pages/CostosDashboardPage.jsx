// src/pages/CostosDashboardPage.jsx
// Dashboard de Costos — alineado con Reports.jsx por Camino A
// Fuente canónica: /api/reportes?action=costs
// ✅ Usa costo_final como costo del dashboard
// ✅ Mantiene agregación por persona / actividad / geocerca / moneda
// ✅ Mantiene export CSV y PNG
// ✅ Sigue respetando authReady + currentOrg.id

import React, { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import { listGeofences } from "../lib/geofencesApi";
import { useAuth } from "@/context/auth.js";
import { useModuleAccess } from "../hooks/useModuleAccess";
import { MODULE_KEYS } from "../lib/permissions";
import { useTranslation } from "react-i18next";
import html2canvas from "html2canvas/dist/html2canvas.esm.js";

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

function normalizeGeofenceRow(g) {
  const id = g?.id || "";
  const nombre = String(g?.name || g?.nombre || g?.label || "").trim();
  return {
    id,
    nombre: nombre || id,
    source_geocerca_id: g?.source_geocerca_id || null,
  };
}

/* -----------------------------------------
   UTILIDADES
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

async function apiGet(url) {
  const resp = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error || `HTTP ${resp.status}`);
  return json;
}

function normalizeHybridCostRow(row) {
  return {
    ...row,

    personal_id: row.personal_id || "",
    personal_nombre: row.personal_nombre || "SIN_DATO",

    actividad_id: row.activity_id || row.actividad_id || "",
    actividad_nombre:
      row.activity_nombre || row.actividad_nombre || "SIN_DATO",

    geocerca_id: row.geofence_id || row.geocerca_id || "",
    geocerca_nombre:
      row.geofence_nombre || row.geocerca_nombre || "SIN_DATO",

    currency_code: row.currency_code || "N/A",
    horas: Number(row.horas) || 0,

    costo_base: Number(row.costo_base) || 0,
    costo_final: Number(row.costo_final) || 0,

    // Fuente de verdad del dashboard: costo_final
    costo: Number(row.costo_final) || 0,

    nivel_confianza: row.nivel_confianza || "SIN_EVIDENCIA",
    estado_auditoria: row.estado_auditoria || "NO_AUDITABLE",
    work_date: row.work_date || row.date || null,
  };
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

  const q1 = await supabase
    .from("activities")
    .select("id, name, org_id")
    .eq("org_id", orgId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (!q1.error && Array.isArray(q1.data) && q1.data.length > 0) return q1.data;

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
  const tr = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const getDefaultDates = () => {
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - 30);

    const format = (d) => d.toISOString().split("T")[0];

    return {
      from: format(past),
      to: format(today),
    };
  };

  const { from, to } = getDefaultDates();

  const chartRef = useRef(null);

  const { loading: authLoading, ready, currentOrg } = useAuth();

  const { role, canView, loading: loadingAccess } = useModuleAccess(
    MODULE_KEYS.DASHBOARD_COSTOS
  );

  const [fromDate, setFromDate] = useState(from);
  const [toDate, setToDate] = useState(to);
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [selectedActividadId, setSelectedActividadId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");

  const [personas, setPersonas] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [geocercas, setGeocercas] = useState([]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [missingView, setMissingView] = useState(false);

  const [selectedDimension, setSelectedDimension] = useState("persona");
  const [selectedChartType, setSelectedChartType] = useState("bar");
  const [selectedMetric, setSelectedMetric] = useState("cost");

  if (authLoading || !ready) {
    return (
      <div className="p-4 text-sm text-gray-600">
        {t(
          "dashboardCostos.loadingAuth",
          "Loading your session and current organization…"
        )}
      </div>
    );
  }

  if (!currentOrg?.id) {
    return (
      <div className="p-4 text-sm text-red-600">
        {t(
          "dashboardCostos.noOrgAssigned",
          "There is no active organization for this user."
        )}
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
          ({tr("dashboardCostos.currentRole", "Current role")}:{" "}
          {role || tr("dashboardCostos.noRole", "no role")})
        </p>
      </div>
    );
  }

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

          (async () => {
            const geofencesRaw = await listGeofences(currentOrg.id, true);
            return geofencesRaw
              .map(normalizeGeofenceRow)
              .filter((g) => g.id && g.source_geocerca_id);
          })(),
        ]);

        if (personasRes.error) throw personasRes.error;

        setPersonas(personasRes.data || []);
        setActividades(actData || []);
        setGeocercas(Array.isArray(geoRes) ? geoRes : []);
      } catch (e) {
        console.error("[CostosDashboard] loadFilters error:", e);
      }
    }

    loadFilters();
  }, [currentOrg?.id]);

  const fetchReport = async () => {
    if (!currentOrg?.id) return;

    setLoading(true);
    setError("");
    setMissingView(false);

    try {
      if (!fromDate || !toDate) {
        setRows([]);
        setError(
          t(
            "dashboardCostos.errors.missingDates",
            "You must select a date range"
          )
        );
        return;
      }

      if (fromDate && toDate && fromDate > toDate) {
        setRows([]);
        setError(
          t(
            "dashboardCostos.errors.invalidDateRange",
            'The "From" date cannot be later than the "To" date.'
          )
        );
        return;
      }

      const params = new URLSearchParams();
      params.set("action", "costs");

      if (fromDate) params.set("start", fromDate);
      if (toDate) params.set("end", toDate);

      if (selectedGeocercaId) params.set("geocerca_ids", selectedGeocercaId);
      if (selectedPersonaId) params.set("personal_ids", selectedPersonaId);
      if (selectedActividadId) params.set("activity_ids", selectedActividadId);

      params.set("limit", "5000");
      params.set("offset", "0");

      const json = await apiGet(`/api/reportes?${params.toString()}`);
      const rawRows = Array.isArray(json?.data) ? json.data : [];
      const normalizedRows = rawRows.map(normalizeHybridCostRow);

      setRows(normalizedRows);
    } catch (e) {
      console.error("[CostosDashboard] fetchReport error:", e);
      setRows([]);

      if (e?.message === "Missing required parameters: start, end") {
        setError(
          t(
            "dashboardCostos.errors.missingDates",
            "You must select a date range"
          )
        );
        return;
      }

      setError(
        e?.message ||
          t(
            "dashboardCostos.errors.load",
            "Could not load cost dashboard."
          )
      );
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
    return aggregateBy(rows, {
      groupKey: dim.groupKey,
      labelField: dim.labelField,
    });
  }, [rows, selectedDimension]);

  const metricConfig = METRICS[selectedMetric];

  const handleExportDataCSV = () => {
    if (!aggregatedData.length) {
      window.alert(t("dashboardCostos.exportNoData"));
      return;
    }

    const header = ["categoria", "total_horas", "total_costo", "tarifa_promedio", "registros"];

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
    a.download = `dashboard_costos_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportChartPNG = async () => {
    if (!chartRef.current) {
      window.alert(t("dashboardCostos.exportChartError"));
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
      link.download = `dashboard_costos_${today}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      window.alert(t("dashboardCostos.exportChartError"));
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("dashboardCostos.title")}</h1>
          <p className="text-sm text-gray-600">{t("dashboardCostos.subtitle")}</p>
          <p className="text-xs text-gray-500 mt-1">
            {t("dashboardCostos.currentOrganization")}:{" "}
            <span className="font-medium">
              {currentOrg?.name || "—"}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={fetchReport}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
            disabled={loading}
          >
            {loading
              ? t("dashboardCostos.loading")
              : t("dashboardCostos.actions.refresh")}
          </button>

          <button
            onClick={handleExportDataCSV}
            className="px-3 py-2 rounded-lg border text-xs md:text-sm hover:bg-gray-50"
          >
            {t("dashboardCostos.actions.exportData")}
          </button>

          <button
            onClick={handleExportChartPNG}
            className="px-3 py-2 rounded-lg border text-xs md:text-sm hover:bg-gray-50"
          >
            {t("dashboardCostos.actions.exportGraphic")}
          </button>
        </div>
      </div>

      {error && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            missingView
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3 shadow border-l-4 border-emerald-500">
          <p className="text-xs text-gray-500 uppercase">
            {t("dashboardCostos.kpis.totalHours")}
          </p>
          <p className="text-xl font-bold">{formatNumber(totalGlobal.totalHours)}</p>
        </div>

        <div className="bg-white rounded-xl p-3 shadow border-l-4 border-indigo-500">
          <p className="text-xs text-gray-500 uppercase">
            {t("dashboardCostos.kpis.totalCost")}
          </p>
          <p className="text-xl font-bold">{formatNumber(totalGlobal.totalCost)}</p>
        </div>

        <div className="bg-white rounded-xl p-3 shadow border-l-4 border-amber-500">
          <p className="text-xs text-gray-500 uppercase">
            {t("dashboardCostos.kpis.registrations")}
          </p>
          <p className="text-xl font-bold">{rows.length}</p>
        </div>

        <div className="bg-white rounded-xl p-3 shadow border-l-4 border-pink-500">
          <p className="text-xs text-gray-500 uppercase">
            {t("dashboardCostos.kpis.avgRate")}
          </p>
          <p className="text-xl font-bold">{formatNumber(globalAvgRate)}</p>
        </div>
      </div>

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
                <span className="font-semibold">{m.currency || "N/A"}</span>
                <span className="text-gray-500">
                  {formatNumber(m.totalCost)} / {formatNumber(m.totalHours)}{" "}
                  {t("dashboardCostos.labelHours")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white shadow rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          {t("dashboardCostos.filtersTitle")}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-600">
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
            <label className="text-xs text-gray-600">
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
            <label className="text-xs text-gray-600">
              {t("dashboardCostos.filtersPerson")}
            </label>
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
            <label className="text-xs text-gray-600">
              {t("dashboardCostos.filtersActivity")}
            </label>
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
            <label className="text-xs text-gray-600">
              {t("dashboardCostos.filtersGeofence")}
            </label>
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

        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-1 border rounded-lg text-xs md:text-sm hover:bg-gray-50"
            onClick={() => {
              setFromDate("");
              setToDate("");
              setSelectedPersonaId("");
              setSelectedActividadId("");
              setSelectedGeocercaId("");
              setError("");
              setMissingView(false);
            }}
          >
            {t("dashboardCostos.filtersClear")}
          </button>

          <button
            className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs md:text-sm hover:bg-emerald-700"
            onClick={fetchReport}
          >
            {t("dashboardCostos.filtersApply")}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow space-y-3">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            {t("dashboardCostos.chartTitle")}
          </h2>

          <div className="flex flex-wrap gap-3 text-xs">
            <div>
              <label className="text-[11px] text-gray-600">
                {t("dashboardCostos.chartDimension")}
              </label>
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
              <label className="text-[11px] text-gray-600">
                {t("dashboardCostos.chartMetric")}
              </label>
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
              <label className="text-[11px] text-gray-600">
                {t("dashboardCostos.chartType")}
              </label>
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

      <div className="bg-white rounded-xl p-4 shadow">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
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
                  {t("dashboardCostos.colTarifaPromedio")}
                </th>
                <th className="px-2 py-1 text-right">
                  {t("dashboardCostos.colRegistros")}
                </th>
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