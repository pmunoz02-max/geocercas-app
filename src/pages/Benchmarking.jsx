import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";
import { useAuth } from "@/context/auth.js";

const ALL_VALUE = "all";
const INDICATORS = ["horas_m2", "costo_m2"];
const CHART_TYPES = ["bars", "lines"];
const PERIODS = ["day", "week", "month", "quarter", "semester", "year"];
const COMPARE_BY = ["assignment", "geofence", "person", "activity"];

const INITIAL_FILTERS = {
  geofenceId: ALL_VALUE,
  personalId: ALL_VALUE,
  activityId: ALL_VALUE,
  dateFrom: "",
  dateTo: "",
  period: "month",
  compareBy: "geofence",
  indicator: "horas_m2",
  chartType: "bars",
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNullableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDateKey(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function parseDateKey(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function compareDateKeys(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function periodField(period) {
  if (period === "day") return "period_day";
  if (period === "week") return "period_week";
  if (period === "quarter") return "period_quarter";
  if (period === "semester") return "period_semester";
  if (period === "year") return "period_year";
  return "period_month";
}

function getPeriodKey(row, period) {
  return toDateKey(row?.[periodField(period)] || row?.work_date || row?.start_time);
}

function getCompareKey(row, compareBy) {
  if (compareBy === "assignment") return row.asignacion_id || "assignment-none";
  if (compareBy === "person") return row.personal_id || "person-none";
  if (compareBy === "activity") return row.activity_id || "activity-none";
  return row.geofence_id || "geofence-none";
}

function getCompareLabel(row, compareBy, fallback) {
  if (compareBy === "assignment") {
    const assignmentId = row.asignacion_id ? String(row.asignacion_id).slice(0, 8).toUpperCase() : "—";
    return `${row.geofence_nombre || fallback.geofence} · ${row.personal_nombre || fallback.person} · ${assignmentId}`;
  }
  if (compareBy === "person") return row.personal_nombre || fallback.person;
  if (compareBy === "activity") return row.activity_nombre || fallback.activity;
  return row.geofence_nombre || fallback.geofence;
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

function uniqueOptions(rows, idKey, labelKey, fallbackLabel) {
  const map = new Map();
  rows.forEach((row) => {
    const id = row?.[idKey];
    if (!id) return;
    if (!map.has(String(id))) {
      map.set(String(id), row?.[labelKey] || fallbackLabel);
    }
  });

  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

function formatDateRangeLabel(periodKey, period, locale) {
  const date = parseDateKey(periodKey);
  if (!date) return periodKey || "—";
  const normalizedLocale = locale || "es";

  if (period === "day") {
    return new Intl.DateTimeFormat(normalizedLocale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(date);
  }

  if (period === "week") {
    return new Intl.DateTimeFormat(normalizedLocale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(date);
  }

  if (period === "year") {
    return String(date.getFullYear());
  }

  if (period === "semester") {
    const semester = date.getMonth() < 6 ? 1 : 2;
    return `${date.getFullYear()} S${semester}`;
  }

  if (period === "quarter") {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `${date.getFullYear()} Q${quarter}`;
  }

  return new Intl.DateTimeFormat(normalizedLocale, {
    year: "numeric",
    month: "short",
  }).format(date);
}

function getAreaDisplay(areaM2, locale) {
  const value = toNullableNumber(areaM2);
  if (value === null) return "—";

  if (value >= 1000000) {
    return `${formatNumber(value / 1000000, locale, 2)} km²`;
  }

  if (value >= 10000) {
    return `${formatNumber(value / 10000, locale, 2)} ha`;
  }

  return `${formatNumber(value, locale, 0)} m²`;
}

function formatNumber(value, locale, maximumFractionDigits = 2) {
  const n = toNullableNumber(value);
  if (n === null) return "—";
  return new Intl.NumberFormat(locale || "es", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(n);
}

function formatRateNumber(value, locale, preferredMaximumFractionDigits = 9) {
  const n = toNullableNumber(value);
  if (n === null) return "—";
  if (n === 0) return "0";

  const abs = Math.abs(n);
  let maximumFractionDigits = preferredMaximumFractionDigits;

  if (abs < 0.000000001) {
    maximumFractionDigits = Math.max(maximumFractionDigits, 12);
  } else if (abs < 0.000001) {
    maximumFractionDigits = Math.max(maximumFractionDigits, 9);
  } else if (abs < 0.001) {
    maximumFractionDigits = Math.max(maximumFractionDigits, 6);
  }

  return new Intl.NumberFormat(locale || "es", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(n);
}

function multiplyNullable(value, factor) {
  const n = toNullableNumber(value);
  return n === null ? null : n * factor;
}

function formatCurrency(value, locale, currency = "USD") {
  const n = toNullableNumber(value);
  if (n === null) return "—";
  return new Intl.NumberFormat(locale || "es", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatCurrencyRate(value, locale) {
  const n = toNullableNumber(value);
  if (n === null) return "—";
  return `${formatRateNumber(n, locale, 9)} US$`;
}

function formatCostPerM2(value, locale) {
  return formatCurrencyRate(value, locale);
}

function formatIndicator(value, indicator, locale) {
  if (indicator === "costo_m2") return formatCurrencyRate(value, locale);
  return formatRateNumber(value, locale, 9);
}

function getStatusTone(row) {
  if (!row || row.indicatorValue === null || row.averageValue === null || row.averageValue <= 0) {
    return "gray";
  }

  if (row.indicatorValue <= row.averageValue * 1.1) return "green";
  if (row.indicatorValue <= row.averageValue * 1.25) return "yellow";
  return "red";
}

function toneClasses(tone) {
  if (tone === "green") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (tone === "yellow") return "bg-amber-100 text-amber-800 border-amber-200";
  if (tone === "red") return "bg-rose-100 text-rose-800 border-rose-200";
  return "bg-gray-50 text-gray-700 border-gray-200";
}

function buildGroupedRows(rows, filters, t, locale) {
  const fallback = {
    geofence: t("benchmarking.fallbacks.geofence", { defaultValue: "Geocerca sin nombre" }),
    person: t("benchmarking.fallbacks.person", { defaultValue: "Persona sin nombre" }),
    activity: t("benchmarking.fallbacks.activity", { defaultValue: "Actividad sin nombre" }),
    multiple: t("benchmarking.labels.multiple", { defaultValue: "Varias" }),
  };

  const groups = new Map();

  rows.forEach((row) => {
    const periodKey = getPeriodKey(row, filters.period);
    const compareKey = getCompareKey(row, filters.compareBy);
    const groupKey = `${filters.compareBy}:${compareKey}:${periodKey}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        compareBy: filters.compareBy,
        compareKey,
        compareLabel: getCompareLabel(row, filters.compareBy, fallback),
        periodKey,
        periodLabel: formatDateRangeLabel(periodKey, filters.period, locale),
        assignmentId: filters.compareBy === "assignment" ? row.asignacion_id : null,
        geofenceName: filters.compareBy === "geofence" || filters.compareBy === "assignment" ? row.geofence_nombre || fallback.geofence : fallback.multiple,
        personName: filters.compareBy === "person" || filters.compareBy === "assignment" ? row.personal_nombre || fallback.person : fallback.multiple,
        activityName: filters.compareBy === "activity" || filters.compareBy === "assignment" ? row.activity_nombre || fallback.activity : fallback.multiple,
        geofenceAreas: new Map(),
        fallbackAreaTotal: 0,
        plannedHours: 0,
        observedHours: 0,
        observedRowsCount: 0,
        benchmarkHours: 0,
        costBase: 0,
        costFinal: 0,
        rowsCount: 0,
        trackingRowsCount: 0,
        statuses: new Set(),
      });
    }

    const group = groups.get(groupKey);
    const area = toNumber(row.area_m2, 0);
    const geofenceId = row.geofence_id ? String(row.geofence_id) : "";

    if (geofenceId && area > 0) {
      group.geofenceAreas.set(geofenceId, area);
    } else if (area > 0) {
      group.fallbackAreaTotal += area;
    }

    const observedHours = toNullableNumber(row.horas_observadas);

    group.plannedHours += toNumber(row.horas_planificadas, 0);
    if (observedHours !== null) {
      group.observedHours += observedHours;
      group.observedRowsCount += 1;
    }
    group.benchmarkHours += toNumber(row.horas_benchmark, 0);
    group.costBase += toNumber(row.costo_base, 0);
    group.costFinal += toNumber(row.costo_final, 0);
    group.rowsCount += 1;

    if (String(row.fuente_horas || "").toUpperCase() === "TRACKING") {
      group.trackingRowsCount += 1;
    }

    if (row.benchmarking_status) group.statuses.add(row.benchmarking_status);
  });

  const grouped = Array.from(groups.values()).map((group) => {
    const uniqueArea = Array.from(group.geofenceAreas.values()).reduce((acc, value) => acc + toNumber(value, 0), 0);
    const areaM2 = uniqueArea + group.fallbackAreaTotal;
    const horasM2 = areaM2 > 0 ? group.benchmarkHours / areaM2 : null;
    const costoM2 = areaM2 > 0 ? group.costFinal / areaM2 : null;
    const indicatorValue = filters.indicator === "costo_m2" ? costoM2 : horasM2;
    const observedHoursValue = group.observedRowsCount > 0 ? group.observedHours : null;

    return {
      ...group,
      observedHours: observedHoursValue,
      areaM2,
      horasM2,
      costoM2,
      indicatorValue,
      evidenceSource:
        group.trackingRowsCount > 0 && group.trackingRowsCount === group.rowsCount
          ? "TRACKING"
          : group.trackingRowsCount > 0
            ? "MIXTA"
            : "PLANIFICADA",
    };
  });

  const validIndicatorValues = grouped
    .map((row) => row.indicatorValue)
    .filter((value) => value !== null && Number.isFinite(value));
  const averageValue = validIndicatorValues.length
    ? validIndicatorValues.reduce((acc, value) => acc + value, 0) / validIndicatorValues.length
    : null;

  const validHorasM2 = grouped.map((row) => row.horasM2).filter((value) => value !== null && Number.isFinite(value));
  const averageHorasM2 = validHorasM2.length
    ? validHorasM2.reduce((acc, value) => acc + value, 0) / validHorasM2.length
    : null;

  const validCostoM2 = grouped.map((row) => row.costoM2).filter((value) => value !== null && Number.isFinite(value));
  const averageCostoM2 = validCostoM2.length
    ? validCostoM2.reduce((acc, value) => acc + value, 0) / validCostoM2.length
    : null;

  return grouped
    .map((row) => {
      const difference = row.indicatorValue !== null && averageValue !== null ? row.indicatorValue - averageValue : null;
      const cumulativeDifference = difference !== null ? difference * row.areaM2 : null;
      const horasOptimizable = averageHorasM2 !== null && row.horasM2 !== null ? Math.max(0, (row.horasM2 - averageHorasM2) * row.areaM2) : 0;
      const costoOptimizable = averageCostoM2 !== null && row.costoM2 !== null ? Math.max(0, (row.costoM2 - averageCostoM2) * row.areaM2) : 0;
      const enriched = {
        ...row,
        averageValue,
        averageHorasM2,
        averageCostoM2,
        difference,
        cumulativeDifference,
        horasOptimizable,
        costoOptimizable,
      };

      return {
        ...enriched,
        tone: getStatusTone(enriched),
      };
    })
    .sort((a, b) => {
      const periodCompare = compareDateKeys(b.periodKey, a.periodKey);
      if (periodCompare !== 0) return periodCompare;
      return String(a.compareLabel || "").localeCompare(String(b.compareLabel || ""));
    });
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block h-10 w-full rounded-xl border border-emerald-100 bg-white px-3.5 text-sm text-gray-900 shadow-sm shadow-emerald-900/5 transition hover:border-emerald-200 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateInput({ label, value, onChange }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
      <span>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block h-10 w-full rounded-xl border border-emerald-100 bg-white px-3.5 text-sm text-gray-900 shadow-sm shadow-emerald-900/5 transition hover:border-emerald-200 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </label>
  );
}

function KpiCard({ label, value, hint }) {
  return (
    <div className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-lg shadow-emerald-950/5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-600">{hint}</p> : null}
    </div>
  );
}

function formatPlainRateCell(value, locale, maximumFractionDigits = 9) {
  return formatRateNumber(value, locale, maximumFractionDigits);
}

function formatCurrencyRateCell(value, locale, compact = false) {
  if (compact) return formatCurrency(value, locale);
  return formatCurrencyRate(value, locale);
}

function BarsChart({ rows, indicator, locale, emptyLabel }) {
  const chartRows = rows
    .filter((row) => row.indicatorValue !== null && Number.isFinite(row.indicatorValue))
    .slice()
    .sort((a, b) => b.indicatorValue - a.indicatorValue)
    .slice(0, 12);

  const maxValue = Math.max(...chartRows.map((row) => row.indicatorValue), 0);

  if (!chartRows.length) {
    return <div className="rounded-2xl border border-dashed border-emerald-100 bg-emerald-50/80 p-8 text-center text-sm text-gray-600">{emptyLabel}</div>;
  }

  return (
    <div className="space-y-3">
      {chartRows.map((row) => {
        const width = maxValue > 0 ? Math.max(3, (row.indicatorValue / maxValue) * 100) : 0;
        return (
          <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3">
            <div>
              <div className="flex items-center justify-between gap-3 text-xs text-gray-600">
                <span className="truncate font-medium text-gray-700">{row.compareLabel}</span>
                <span className="shrink-0">{row.periodLabel}</span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-emerald-50">
                <div className="h-full rounded-full bg-emerald-800" style={{ width: `${width}%` }} />
              </div>
            </div>
            <div className="text-right text-sm font-semibold text-gray-900">{formatIndicator(row.indicatorValue, indicator, locale)}</div>
          </div>
        );
      })}
    </div>
  );
}

function LinesChart({ rows, indicator, locale, emptyLabel }) {
  const validRows = rows.filter((row) => row.indicatorValue !== null && Number.isFinite(row.indicatorValue));

  const periodMap = new Map();
  validRows.forEach((row) => {
    if (!periodMap.has(row.periodKey)) {
      periodMap.set(row.periodKey, { periodKey: row.periodKey, periodLabel: row.periodLabel });
    }
  });

  const periods = Array.from(periodMap.values()).sort((a, b) => compareDateKeys(a.periodKey, b.periodKey));

  const seriesMap = new Map();
  validRows.forEach((row) => {
    const seriesKey = String(row.compareKey || row.compareLabel || row.key);
    if (!seriesMap.has(seriesKey)) {
      seriesMap.set(seriesKey, {
        key: seriesKey,
        label: row.compareLabel || "—",
        pointsByPeriod: new Map(),
      });
    }

    seriesMap.get(seriesKey).pointsByPeriod.set(row.periodKey, {
      periodKey: row.periodKey,
      periodLabel: row.periodLabel,
      value: row.indicatorValue,
    });
  });

  const series = Array.from(seriesMap.values()).sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));

  if (!periods.length || !series.length) {
    return <div className="rounded-2xl border border-dashed border-emerald-100 bg-emerald-50/80 p-8 text-center text-sm text-gray-600">{emptyLabel}</div>;
  }

  const values = validRows.map((row) => row.indicatorValue);
  const maxValue = Math.max(...values, 0);
  const minValue = Math.min(0, ...values);
  const span = maxValue - minValue || 1;

  const width = Math.max(840, periods.length * 170);
  const height = 300;
  const paddingX = 56;
  const paddingTop = 34;
  const paddingBottom = 46;
  const plotHeight = height - paddingTop - paddingBottom;
  const plotWidth = width - paddingX * 2;
  const colors = [
    "#065f46",
    "#0f766e",
    "#047857",
    "#334155",
    "#0369a1",
    "#7c3aed",
    "#b45309",
    "#be123c",
    "#15803d",
    "#4338ca",
    "#0e7490",
    "#92400e",
  ];

  const xForPeriod = (periodKey) => {
    const index = periods.findIndex((period) => period.periodKey === periodKey);
    if (periods.length === 1) return paddingX + plotWidth / 2;
    return paddingX + (index * plotWidth) / Math.max(1, periods.length - 1);
  };

  const yForValue = (value) => paddingTop + ((maxValue - value) * plotHeight) / span;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-emerald-100 bg-white p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[840px]">
          {[0, 0.25, 0.5, 0.75, 1].map((step) => {
            const y = paddingTop + step * plotHeight;
            return <line key={step} x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="currentColor" className="text-emerald-50" />;
          })}

          <line x1={paddingX} y1={height - paddingBottom} x2={width - paddingX} y2={height - paddingBottom} stroke="currentColor" className="text-slate-200" />
          <line x1={paddingX} y1={paddingTop} x2={paddingX} y2={height - paddingBottom} stroke="currentColor" className="text-slate-200" />

          {periods.map((period) => {
            const x = xForPeriod(period.periodKey);
            return (
              <g key={period.periodKey}>
                <line x1={x} y1={paddingTop} x2={x} y2={height - paddingBottom} stroke="currentColor" className="text-emerald-50" />
                <text x={x} y={height - 14} textAnchor="middle" fontSize="11" fill="currentColor" className="text-gray-600">
                  {period.periodLabel}
                </text>
              </g>
            );
          })}

          {series.map((serie, index) => {
            const color = colors[index % colors.length];
            const points = periods
              .map((period) => serie.pointsByPeriod.get(period.periodKey))
              .filter(Boolean)
              .map((point) => ({ ...point, x: xForPeriod(point.periodKey), y: yForValue(point.value) }));
            const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(" ");

            return (
              <g key={serie.key}>
                {points.length > 1 ? <polyline fill="none" stroke={color} strokeWidth="2.5" points={polylinePoints} strokeLinecap="round" strokeLinejoin="round" /> : null}
                {points.map((point) => (
                  <g key={`${serie.key}:${point.periodKey}`}>
                    <circle cx={point.x} cy={point.y} r="4" fill={color} />
                    <title>{`${serie.label} · ${point.periodLabel}: ${formatIndicator(point.value, indicator, locale)}`}</title>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {series.map((serie, index) => {
          const color = colors[index % colors.length];
          const seriePoints = periods.map((period) => serie.pointsByPeriod.get(period.periodKey)).filter(Boolean);
          const lastPoint = seriePoints[seriePoints.length - 1];
          return (
            <div key={serie.key} className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="truncate font-semibold text-gray-700">{serie.label}</span>
              </div>
              <span className="shrink-0 font-semibold text-gray-900">{lastPoint ? formatIndicator(lastPoint.value, indicator, locale) : "—"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Benchmarking() {
  const { t, i18n } = useTranslation();
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id || null;
  const locale = String(i18n?.resolvedLanguage || i18n?.language || "es");

  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(INITIAL_FILTERS);

  const bt = useCallback(
    (key, defaultValue, values = {}) => t(`benchmarking.${key}`, { defaultValue, ...values }),
    [t]
  );

  const loadRows = useCallback(async () => {
    if (!orgId) {
      setRawRows([]);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data, error: queryError } = await supabase
        .from("v_benchmarking_efficiency_preview")
        .select("*")
        .eq("org_id", orgId)
        .order("work_date", { ascending: true });

      if (queryError) throw queryError;
      setRawRows(data || []);
    } catch (err) {
      console.error("[benchmarking] load error", err);
      setError(err?.message || bt("errors.load", "No se pudo cargar benchmarking."));
      setRawRows([]);
    } finally {
      setLoading(false);
    }
  }, [bt, orgId]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const options = useMemo(() => {
    return {
      geofences: uniqueOptions(rawRows, "geofence_id", "geofence_nombre", bt("fallbacks.geofence", "Geocerca sin nombre")),
      people: uniqueOptions(rawRows, "personal_id", "personal_nombre", bt("fallbacks.person", "Persona sin nombre")),
      activities: uniqueOptions(rawRows, "activity_id", "activity_nombre", bt("fallbacks.activity", "Actividad sin nombre")),
    };
  }, [bt, rawRows]);

  const filteredRows = useMemo(() => {
    return rawRows.filter((row) => {
      const geofenceId = row.geofence_id ? String(row.geofence_id) : "";
      const personalId = row.personal_id ? String(row.personal_id) : "";
      const activityId = row.activity_id ? String(row.activity_id) : "";
      const workDate = toDateKey(row.work_date || row.start_time);

      if (filters.geofenceId !== ALL_VALUE && geofenceId !== filters.geofenceId) return false;
      if (filters.personalId !== ALL_VALUE && personalId !== filters.personalId) return false;
      if (filters.activityId !== ALL_VALUE && activityId !== filters.activityId) return false;
      if (filters.dateFrom && workDate && workDate < filters.dateFrom) return false;
      if (filters.dateTo && workDate && workDate > filters.dateTo) return false;

      return true;
    });
  }, [filters, rawRows]);

  const groupedRows = useMemo(() => buildGroupedRows(filteredRows, filters, t, locale), [filteredRows, filters, t, locale]);

  const kpis = useMemo(() => {
    const valid = groupedRows.filter((row) => row.indicatorValue !== null && Number.isFinite(row.indicatorValue));
    const sorted = valid.slice().sort((a, b) => a.indicatorValue - b.indicatorValue);
    const average = valid.length ? valid.reduce((acc, row) => acc + row.indicatorValue, 0) / valid.length : null;
    const signedTotalDifference = groupedRows.reduce((acc, row) => acc + toNumber(row.cumulativeDifference, 0), 0);
    const optimizableCost = groupedRows.reduce((acc, row) => acc + toNumber(row.costoOptimizable, 0), 0);
    const optimizableHours = groupedRows.reduce((acc, row) => acc + toNumber(row.horasOptimizable, 0), 0);

    return {
      best: sorted[0] || null,
      worst: sorted[sorted.length - 1] || null,
      average,
      signedTotalDifference,
      optimizableCost,
      optimizableHours,
    };
  }, [groupedRows]);

  const hasTrackingEvidence = rawRows.some((row) => String(row.fuente_horas || "").toUpperCase() === "TRACKING");

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const handleExport = () => {
    const exportedAt = new Date().toISOString();
    const indicatorLabel = bt(`indicators.${filters.indicator}`, filters.indicator);
    const rows = [
      [bt("csv.title", "Benchmarking operativo")],
      [bt("csv.exportedAt", "Fecha de exportación"), exportedAt],
      [bt("filters.geofence", "Geocerca"), filters.geofenceId],
      [bt("filters.person", "Persona / trabajador"), filters.personalId],
      [bt("filters.activity", "Actividad"), filters.activityId],
      [bt("filters.dateFrom", "Desde"), filters.dateFrom],
      [bt("filters.dateTo", "Hasta"), filters.dateTo],
      [bt("filters.period", "Periodo agrupado"), bt(`periods.${filters.period}`, filters.period)],
      [bt("filters.compareBy", "Comparar por"), bt(`compareBy.${filters.compareBy}`, filters.compareBy)],
      [bt("filters.indicator", "Indicador"), indicatorLabel],
      [],
      [
        bt("table.geofence", "Geocerca"),
        bt("table.person", "Persona"),
        bt("table.activity", "Actividad"),
        bt("table.period", "Periodo"),
        bt("table.areaM2", "Área m²"),
        bt("table.areaReadable", "Área legible"),
        bt("table.observedHours", "Horas observadas"),
        bt("table.plannedHours", "Horas planificadas"),
        bt("table.costBase", "Costo base"),
        bt("table.costFinal", "Costo final auditado"),
        bt("table.hoursM2", "Horas/m²"),
        bt("table.costM2", "$/m²"),
        bt("table.hoursHa", "Horas/ha"),
        bt("table.costHa", "$/ha"),
        bt("table.hoursKm2", "Horas/km²"),
        bt("table.costKm2", "$/km²"),
        bt("table.diffAverage", "Diferencia contra promedio"),
        bt("table.cumulativeDiff", "Diferencia acumulada del periodo"),
        bt("table.evidence", "Fuente de horas"),
        bt("table.opportunity", "Oportunidad de mejora"),
      ],
      ...groupedRows.map((row) => [
        row.geofenceName,
        row.personName,
        row.activityName,
        row.periodLabel,
        row.areaM2,
        getAreaDisplay(row.areaM2, locale),
        row.observedHours,
        row.plannedHours,
        row.costBase,
        row.costFinal,
        row.horasM2,
        row.costoM2,
        multiplyNullable(row.horasM2, 10000),
        multiplyNullable(row.costoM2, 10000),
        multiplyNullable(row.horasM2, 1000000),
        multiplyNullable(row.costoM2, 1000000),
        row.difference,
        row.cumulativeDifference,
        row.evidenceSource,
        bt(`opportunities.${row.tone}`, "Revisar evidencia"),
      ]),
    ];

    downloadCsv(`benchmarking-${exportedAt.slice(0, 10)}.csv`, rows);
  };

  const allOption = { value: ALL_VALUE, label: bt("filters.all", "Todos") };
  const indicatorLabel = bt(`indicators.${filters.indicator}`, filters.indicator);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
      <section className="relative overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-950 via-emerald-800 to-teal-700 px-5 py-6 text-white shadow-xl shadow-emerald-950/15 md:px-7 md:py-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-lime-200/10 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50">
              {bt("header.badge", "Mejora continua")}
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{bt("header.title", "Benchmarking")}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/90">
                {bt(
                  "header.subtitle",
                  "Compara eficiencia operativa entre asignaciones, geocercas, personas o actividades usando horas/m² y $/m²."
                )}
              </p>
            </div>
          </div>

          <div className="w-full rounded-3xl border border-white/15 bg-white/10 p-2 shadow-lg shadow-emerald-950/10 backdrop-blur-sm lg:w-auto">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadRows}
                className="rounded-2xl border border-white/15 bg-white px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-50 hover:shadow-md"
              >
                {bt("actions.refresh", "Actualizar")}
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={!groupedRows.length}
                className="rounded-2xl border border-white/15 bg-emerald-950/70 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bt("actions.exportCsv", "Exportar CSV")}
              </button>
            </div>
          </div>
        </div>

        {!hasTrackingEvidence ? (
          <div className="relative mt-5 rounded-2xl border border-amber-200/80 bg-amber-50/95 p-4 text-sm text-amber-900 shadow-sm">
            <strong>{bt("alerts.plannedOnlyTitle", "Datos planificados.")}</strong>{" "}
            {bt(
              "alerts.plannedOnlyBody",
              "La vista actual no tiene horas de tracking vinculadas a asignaciones. Benchmarking usa horas planificadas y lo indica como fuente PLANIFICADA."
            )}
          </div>
        ) : null}
      </section>

      <section className="overflow-visible rounded-3xl border border-emerald-100 bg-white shadow-lg shadow-emerald-950/5">
        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-teal-50 px-4 py-4 md:px-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{bt("filters.title", "Filtros")}</h2>
            <p className="text-xs text-gray-600">{bt("filters.subtitle", "Ajusta la vista para comparar eficiencia operativa.")}</p>
          </div>
        </div>
        <div className="space-y-5 p-4 md:p-5">
          <div className="grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 md:grid-cols-2 xl:grid-cols-4">
          <FilterSelect
            label={bt("filters.geofence", "Geocerca")}
            value={filters.geofenceId}
            onChange={(value) => updateFilter("geofenceId", value)}
            options={[allOption, ...options.geofences]}
          />
          <FilterSelect
            label={bt("filters.person", "Persona / trabajador")}
            value={filters.personalId}
            onChange={(value) => updateFilter("personalId", value)}
            options={[allOption, ...options.people]}
          />
          <FilterSelect
            label={bt("filters.activity", "Actividad")}
            value={filters.activityId}
            onChange={(value) => updateFilter("activityId", value)}
            options={[allOption, ...options.activities]}
          />
          <FilterSelect
            label={bt("filters.period", "Periodo agrupado")}
            value={filters.period}
            onChange={(value) => updateFilter("period", value)}
            options={PERIODS.map((value) => ({ value, label: bt(`periods.${value}`, value) }))}
          />
          <DateInput label={bt("filters.dateFrom", "Desde")} value={filters.dateFrom} onChange={(value) => updateFilter("dateFrom", value)} />
          <DateInput label={bt("filters.dateTo", "Hasta")} value={filters.dateTo} onChange={(value) => updateFilter("dateTo", value)} />
          <FilterSelect
            label={bt("filters.compareBy", "Comparar por")}
            value={filters.compareBy}
            onChange={(value) => updateFilter("compareBy", value)}
            options={COMPARE_BY.map((value) => ({ value, label: bt(`compareBy.${value}`, value) }))}
          />
          <FilterSelect
            label={bt("filters.indicator", "Indicador")}
            value={filters.indicator}
            onChange={(value) => updateFilter("indicator", value)}
            options={INDICATORS.map((value) => ({ value, label: bt(`indicators.${value}`, value) }))}
          />
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-emerald-100 bg-white/80 p-4 shadow-sm shadow-emerald-900/5">
          <FilterSelect
            label={bt("filters.chartType", "Tipo de gráfico")}
            value={filters.chartType}
            onChange={(value) => updateFilter("chartType", value)}
            options={CHART_TYPES.map((value) => ({ value, label: bt(`chartTypes.${value}`, value) }))}
          />
          <button type="button" onClick={resetFilters} className="rounded-full border border-emerald-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-emerald-50">
            {bt("actions.resetFilters", "Limpiar filtros")}
          </button>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm font-medium text-rose-800 shadow-sm shadow-red-900/5">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          label={bt("kpis.best", "Mejor eficiencia")}
          value={kpis.best ? formatIndicator(kpis.best.indicatorValue, filters.indicator, locale) : "—"}
          hint={kpis.best?.compareLabel || ""}
        />
        <KpiCard
          label={bt("kpis.worst", "Peor eficiencia")}
          value={kpis.worst ? formatIndicator(kpis.worst.indicatorValue, filters.indicator, locale) : "—"}
          hint={kpis.worst?.compareLabel || ""}
        />
        <KpiCard label={bt("kpis.average", "Promedio general")} value={formatIndicator(kpis.average, filters.indicator, locale)} hint={indicatorLabel} />
        <KpiCard
          label={bt("kpis.totalDifference", "Diferencia acumulada total")}
          value={filters.indicator === "costo_m2" ? formatCurrency(kpis.signedTotalDifference, locale) : formatNumber(kpis.signedTotalDifference, locale, 2)}
          hint={bt("kpis.totalDifferenceHint", "Suma de diferencias contra promedio")}
        />
        <KpiCard
          label={bt("kpis.optimizableCost", "Costo potencialmente optimizable")}
          value={formatCurrency(kpis.optimizableCost, locale)}
          hint={bt("kpis.optimizableCostHint", "Exceso vs promedio")}
        />
        <KpiCard
          label={bt("kpis.optimizableHours", "Horas potencialmente optimizables")}
          value={formatNumber(kpis.optimizableHours, locale, 2)}
          hint={bt("kpis.optimizableHoursHint", "Exceso vs promedio")}
        />
      </div>

      <section className="overflow-visible rounded-3xl border border-emerald-100 bg-white shadow-lg shadow-emerald-950/5">
        <div className="flex flex-col gap-1 border-b border-emerald-100 bg-gradient-to-r from-white via-emerald-50/70 to-teal-50 px-4 py-4 sm:flex-row sm:items-end sm:justify-between md:px-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{bt("chart.title", "Visualización")}</h2>
            <p className="text-sm text-gray-600">{bt("chart.subtitle", "Barras comparan grupos; líneas muestran evolución temporal promedio.")}</p>
          </div>
          <p className="text-sm font-semibold text-gray-700">{indicatorLabel}</p>
        </div>
        <div className="p-4 md:p-5">
          {filters.chartType === "lines" ? (
          <LinesChart rows={groupedRows} indicator={filters.indicator} locale={locale} emptyLabel={bt("empty.chart", "No hay suficientes datos para graficar.")} />
          ) : (
            <BarsChart rows={groupedRows} indicator={filters.indicator} locale={locale} emptyLabel={bt("empty.chart", "No hay suficientes datos para graficar.")} />
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-lg shadow-emerald-950/5">
        <div className="flex flex-col gap-1 border-b border-emerald-100 bg-gradient-to-r from-white via-emerald-50/70 to-teal-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{bt("table.title", "Tabla comparativa")}</h2>
            <p className="text-sm text-gray-600">{bt("table.subtitle", "Las alertas muestran desviación contra el promedio visible; no toman decisiones automáticas.")}</p>
          </div>
          <span className="text-sm font-semibold text-gray-600">
            {bt("table.rows", "{{count}} filas", { count: groupedRows.length })}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1900px] w-full divide-y divide-emerald-100 text-sm">
            <thead className="bg-emerald-50/80 text-left text-xs font-semibold uppercase tracking-wide text-emerald-950">
              <tr>
                <th className="px-4 py-3">{bt("table.signal", "Semáforo")}</th>
                <th className="px-4 py-3">{bt("table.geofence", "Geocerca")}</th>
                <th className="px-4 py-3">{bt("table.person", "Persona")}</th>
                <th className="px-4 py-3">{bt("table.activity", "Actividad")}</th>
                <th className="px-4 py-3">{bt("table.period", "Periodo")}</th>
                <th className="px-4 py-3 text-right">{bt("table.areaM2", "Área m²")}</th>
                <th className="px-4 py-3 text-right">{bt("table.areaReadable", "Área legible")}</th>
                <th className="px-4 py-3 text-right">{bt("table.observedHours", "Horas observadas")}</th>
                <th className="px-4 py-3 text-right">{bt("table.costBase", "Costo base")}</th>
                <th className="px-4 py-3 text-right">{bt("table.costFinal", "Costo final auditado")}</th>
                <th className="px-4 py-3 text-right">{bt("table.hoursM2", "Horas/m²")}</th>
                <th className="px-4 py-3 text-right">{bt("table.costM2", "$/m²")}</th>
                <th className="px-4 py-3 text-right">{bt("table.hoursHa", "Horas/ha")}</th>
                <th className="px-4 py-3 text-right">{bt("table.costHa", "$/ha")}</th>
                <th className="px-4 py-3 text-right">{bt("table.hoursKm2", "Horas/km²")}</th>
                <th className="px-4 py-3 text-right">{bt("table.costKm2", "$/km²")}</th>
                <th className="px-4 py-3 text-right">{bt("table.diffAverage", "Diferencia contra promedio")}</th>
                <th className="px-4 py-3 text-right">{bt("table.cumulativeDiff", "Diferencia acumulada")}</th>
                <th className="px-4 py-3">{bt("table.evidence", "Fuente")}</th>
                <th className="px-4 py-3">{bt("table.opportunity", "Oportunidad de mejora")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="20" className="px-4 py-10 text-center text-gray-600">
                    {bt("loading", "Cargando benchmarking...")}
                  </td>
                </tr>
              ) : groupedRows.length ? (
                groupedRows.map((row) => (
                  <tr key={row.key} className="hover:bg-emerald-50">
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses(row.tone)}`}>
                        {bt(`traffic.${row.tone}`, row.tone)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.geofenceName}</td>
                    <td className="px-4 py-3 text-gray-700">{row.personName}</td>
                    <td className="px-4 py-3 text-gray-700">{row.activityName}</td>
                    <td className="px-4 py-3 text-gray-700">{row.periodLabel}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatNumber(row.areaM2, locale, 2)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{getAreaDisplay(row.areaM2, locale)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatNumber(row.observedHours, locale, 2)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(row.costBase, locale)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(row.costFinal, locale)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900">{formatPlainRateCell(row.horasM2, locale, 9)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900">{formatCurrencyRateCell(row.costoM2, locale)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatPlainRateCell(multiplyNullable(row.horasM2, 10000), locale, 6)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatCurrencyRateCell(multiplyNullable(row.costoM2, 10000), locale, true)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatPlainRateCell(multiplyNullable(row.horasM2, 1000000), locale, 4)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatCurrencyRateCell(multiplyNullable(row.costoM2, 1000000), locale, true)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatIndicator(row.difference, filters.indicator, locale)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {filters.indicator === "costo_m2" ? formatCurrency(row.cumulativeDifference, locale) : formatNumber(row.cumulativeDifference, locale, 2)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{bt(`evidence.${row.evidenceSource}`, row.evidenceSource)}</td>
                    <td className="px-4 py-3 text-gray-700">{bt(`opportunities.${row.tone}`, "Revisar evidencia")}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="20" className="px-4 py-10 text-center text-gray-600">
                    {bt("empty.table", "No hay datos de benchmarking con los filtros actuales.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
