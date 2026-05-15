// src/pages/Reports.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "../lib/authFetch";
import { useTranslation } from "react-i18next";
import { listGeofences } from "../lib/geofencesApi";
import { useAuth } from "@/context/auth.js";

function normalizeGeofenceRow(g) {
  const id = g?.id || "";
  const nombre = String(g?.name || g?.nombre || g?.label || "").trim();
  return {
    id,
    nombre: nombre || id,
    source_geocerca_id: g?.source_geocerca_id || null,
  };
}

function toCsvValue(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replaceAll('"', '""')}"`;
}

function exportRowsToCSV(rows, filenameBase = "reporte", reportType = "attendance") {
  if (!rows?.length) {
    return false;
  }

  if (reportType === "cost") {
    const columns = [
      { key: "work_date", label: "Fecha" },
      { key: "personal_nombre", label: "Colaborador" },
      { key: "activity_nombre", label: "Actividad" },
      { key: "geofence_nombre", label: "Geocerca" },
      { key: "horas", label: "Horas" },
      { key: "costo_base", label: "Costo base" },
      { key: "nivel_confianza", label: "Confianza" },
      { key: "estado_auditoria", label: "Auditoría" },
      { key: "costo_final", label: "Costo final" },
    ];

    const header = columns.map((c) => toCsvValue(c.label)).join(",");
    const lines = rows.map((r) =>
      columns
        .map((c) => {
          if (c.key === "work_date") {
            return toCsvValue(r.work_date || r.date || "");
          }
          return toCsvValue(r[c.key]);
        })
        .join(",")
    );

    const csv = [header, ...lines].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameBase}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();

    URL.revokeObjectURL(url);
    return true;
  }

  const columns = Object.keys(rows[0]);
  const header = columns.map(toCsvValue).join(",");
  const lines = rows.map((r) => columns.map((k) => toCsvValue(r[k])).join(","));
  const csv = [header, ...lines].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();

  URL.revokeObjectURL(url);
  return true;
}

function getAuditBadgeClass(status) {
  switch (status) {
    case "AUDITADO_ALTO":
      return "text-green-700 bg-green-50 border border-green-200";
    case "AUDITADO_MEDIO":
      return "text-yellow-700 bg-yellow-50 border border-yellow-200";
    case "AUDITADO_BAJO":
      return "text-red-700 bg-red-50 border border-red-200";
    case "SIN_EVIDENCIA":
      return "text-amber-700 bg-amber-50 border border-amber-200";
    case "NO_AUDITABLE":
    default:
      return "text-gray-700 bg-gray-50 border border-gray-200";
  }
}

function getConfidenceBadgeClass(level) {
  switch (level) {
    case "ALTO":
      return "text-green-700 bg-green-50 border border-green-200";
    case "MEDIO":
      return "text-yellow-700 bg-yellow-50 border border-yellow-200";
    case "BAJO":
      return "text-red-700 bg-red-50 border border-red-200";
    case "INSUFICIENTE":
    case "SIN_EVIDENCIA":
    default:
      return "text-gray-700 bg-gray-50 border border-gray-200";
  }
}


function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toFixed(2);
}

// Helper para mostrar moneda con símbolo
function formatCurrency(value, currencyCode, locale = "es-MX") {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  // Fallback seguro: si no hay currencyCode, solo dos decimales
  if (!currencyCode) return n.toFixed(2);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

function MultiSelectDropdown({
  options = [],
  value = [],
  onChange,
  disabled = false,
  placeholder = "Selecciona...",
  emptyLabel = "Sin opciones",
  clearLabel = "Limpiar",
  selectedCountLabel = "seleccionados",
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleOutsideClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  const selectedValues = Array.isArray(value) ? value.map((item) => String(item)) : [];
  const optionByValue = new Map(
    options.map((option) => [String(option.value), option])
  );
  const selectedOptions = selectedValues
    .map((selectedValue) => optionByValue.get(selectedValue))
    .filter(Boolean);

  const summary =
    selectedOptions.length === 0
      ? placeholder
      : selectedOptions.length <= 2
      ? selectedOptions.map((option) => option.label).join(", ")
      : `${selectedOptions.length} ${selectedCountLabel}`;

  const toggleOption = (optionValue) => {
    const normalized = String(optionValue);
    if (selectedValues.includes(normalized)) {
      onChange(selectedValues.filter((selectedValue) => selectedValue !== normalized));
      return;
    }
    onChange([...selectedValues, normalized]);
  };

  const clearSelection = () => {
    onChange([]);
  };

  return (
    <div ref={rootRef} className="relative mt-1">
      <div className="relative">
        <button
          type="button"
          className={`block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-20 text-left text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
            selectedOptions.length === 0 ? "text-gray-500" : ""
          }`}
          onClick={() => setOpen((current) => !current)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="block truncate">{summary}</span>
        </button>

        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          {selectedOptions.length > 0 && !disabled && (
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              onClick={(event) => {
                event.stopPropagation();
                clearSelection();
              }}
              title={clearLabel}
              aria-label={clearLabel}
            >
              ×
            </button>
          )}
          <span className="pointer-events-none text-xs text-gray-500">{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {open && !disabled && (
        <div
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-gray-200 bg-white p-1 shadow-xl"
          role="listbox"
          aria-multiselectable="true"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">{emptyLabel}</div>
          ) : (
            options.map((option) => {
              const selected = selectedValues.includes(String(option.value));
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm ${
                    selected
                      ? "bg-emerald-50 text-emerald-900"
                      : "text-gray-800 hover:bg-gray-50"
                  }`}
                  onClick={() => toggleOption(option.value)}
                  role="option"
                  aria-selected={selected}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    readOnly
                    className="mt-0.5 shrink-0 accent-emerald-700"
                  />
                  <span className="min-w-0 break-words">{option.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function toFiniteNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatNumericSummary(value, decimals = 3) {
  if (value === null || value === undefined || value === "") return "—";
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return String(value);
  return numberValue.toFixed(decimals);
}

function formatCoverageSummary(value) {
  if (value === null || value === undefined || value === "") return "—";
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return String(value);
  return numberValue.toFixed(4);
}

function getGroupFieldValue(row, fieldKey) {
  if (fieldKey === "date") return row?.date || row?.work_date || "—";
  if (fieldKey === "work_date") return row?.work_date || row?.date || "—";
  const rawValue = row?.[fieldKey];
  return rawValue === null || rawValue === undefined || rawValue === "" ? "—" : rawValue;
}

function summarizeGroupedRows(rows, reportType) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const currencyCodes = Array.from(
    new Set(
      safeRows
        .map((row) => String(row?.currency_code || "").trim())
        .filter(Boolean)
    )
  );
  const currencyCode = currencyCodes.length === 1 ? currencyCodes[0] : "";

  if (reportType === "cost") {
    return {
      rowCount: safeRows.length,
      horas: safeRows.reduce(
        (total, row) => total + toFiniteNumber(row?.horas ?? row?.horas_observadas),
        0
      ),
      costo_base: safeRows.reduce(
        (total, row) => total + toFiniteNumber(row?.costo_base ?? row?.costo_total),
        0
      ),
      costo_final: safeRows.reduce(
        (total, row) => total + toFiniteNumber(row?.costo_final ?? row?.costo_total),
        0
      ),
      currency_code: currencyCode,
    };
  }

  const pointsCount = safeRows.reduce(
    (total, row) => total + toFiniteNumber(row?.points_count),
    0
  );
  const horasObservadas = safeRows.reduce(
    (total, row) => total + toFiniteNumber(row?.horas_observadas),
    0
  );
  const expectedHours = safeRows.reduce(
    (total, row) => total + toFiniteNumber(row?.expected_hours),
    0
  );
  const porcentajeCobertura =
    expectedHours > 0 ? horasObservadas / expectedHours : null;

  let nivelConfianza = "—";
  if (pointsCount < 2) {
    nivelConfianza = "INSUFICIENTE";
  } else if (porcentajeCobertura !== null && porcentajeCobertura >= 0.85) {
    nivelConfianza = "ALTO";
  } else if (porcentajeCobertura !== null && porcentajeCobertura >= 0.6) {
    nivelConfianza = "MEDIO";
  } else if (porcentajeCobertura !== null) {
    nivelConfianza = "BAJO";
  }

  return {
    rowCount: safeRows.length,
    km_observados: safeRows.reduce(
      (total, row) => total + toFiniteNumber(row?.km_observados),
      0
    ),
    horas_observadas: horasObservadas,
    minutos_sin_cobertura: safeRows.reduce(
      (total, row) => total + toFiniteNumber(row?.minutos_sin_cobertura),
      0
    ),
    numero_huecos: safeRows.reduce(
      (total, row) => total + toFiniteNumber(row?.numero_huecos),
      0
    ),
    porcentaje_cobertura: porcentajeCobertura,
    nivel_confianza: nivelConfianza,
    costo_total: safeRows.reduce(
      (total, row) => total + toFiniteNumber(row?.costo_total),
      0
    ),
    currency_code: currencyCode,
  };
}

function buildGroupedReportTree(rows, groupKeys, groupFields, reportType, level = 0, parentId = "root") {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (!Array.isArray(groupKeys) || level >= groupKeys.length) return [];

  const fieldKey = groupKeys[level];
  const field = groupFields.find((candidate) => candidate.value === fieldKey);
  if (!field) return [];

  const buckets = new Map();

  rows.forEach((row) => {
    const rawValue = getGroupFieldValue(row, fieldKey);
    const normalizedValue = String(rawValue);
    if (!buckets.has(normalizedValue)) {
      buckets.set(normalizedValue, {
        rawValue,
        rows: [],
      });
    }
    buckets.get(normalizedValue).rows.push(row);
  });

  return Array.from(buckets.entries()).map(([normalizedValue, bucket]) => {
    const id = `${parentId}|${fieldKey}:${encodeURIComponent(normalizedValue)}`;
    return {
      id,
      fieldKey,
      fieldLabel: field.label,
      valueLabel: String(bucket.rawValue ?? "—"),
      rows: bucket.rows,
      summary: summarizeGroupedRows(bucket.rows, reportType),
      children: buildGroupedReportTree(
        bucket.rows,
        groupKeys,
        groupFields,
        reportType,
        level + 1,
        id
      ),
    };
  });
}

function collectGroupNodeIds(groups = []) {
  const ids = [];
  groups.forEach((group) => {
    ids.push(group.id);
    ids.push(...collectGroupNodeIds(group.children));
  });
  return ids;
}


export default function Reports() {
  const [reportType, setReportType] = useState("attendance");
  const { t, i18n } = useTranslation();
  const { ready, authenticated, currentOrg } = useAuth();

  const tr = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const [errorMsg, setErrorMsg] = useState("");
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [filters, setFilters] = useState({
    geocercas: [],
    personas: [],
    activities: [],
    asignaciones: [],
  });

  const [selectedGeocercaIds, setSelectedGeocercaIds] = useState([]);
  const [selectedPersonalIds, setSelectedPersonalIds] = useState([]);
  const [selectedActivityIds, setSelectedActivityIds] = useState([]);
  const [selectedAsignacionIds, setSelectedAsignacionIds] = useState([]);

  const [rows, setRows] = useState([]);
  const [groupByFields, setGroupByFields] = useState([]);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState(() => new Set());

  const canRun = useMemo(
    () => ready && authenticated && !!currentOrg?.id,
    [ready, authenticated, currentOrg]
  );

  const inputBase =
    "block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 " +
    "placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 " +
    "disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed";

  const selectBase =
    "block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 " +
    "shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 " +
    "disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed";

  const buttonPrimary =
    "inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm " +
    "hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 " +
    "disabled:opacity-60 disabled:cursor-not-allowed";

  const buttonSecondary =
    "inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm " +
    "hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

  async function apiGet(url) {
    const resp = await authFetch(url, {
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

  useEffect(() => {
    if (!canRun) return;
    loadFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRun]);

  async function loadFilters() {
    setLoadingFilters(true);
    setErrorMsg("");
    try {
      const url = "/api/reportes?action=filters";
      const json = await apiGet(url);
      const data = json?.data || {};

      let geocercas = [];
      if (currentOrg?.id) {
        const geofencesRaw = await listGeofences(currentOrg.id, true);
        geocercas = geofencesRaw
          .map(normalizeGeofenceRow)
          .filter((g) => g.id && g.source_geocerca_id);
      }

      setFilters({
        geocercas,
        personas: Array.isArray(data.personas) ? data.personas : [],
        activities: Array.isArray(data.activities) ? data.activities : [],
        asignaciones: Array.isArray(data.asignaciones) ? data.asignaciones : [],
      });
    } catch (e) {
      console.error("[Reports] loadFilters:", e);
      setErrorMsg(
        e?.message || tr("reports.errors.loadFilters", "Error loading filters.")
      );
      setFilters({ geocercas: [], personas: [], activities: [], asignaciones: [] });
    } finally {
      setLoadingFilters(false);
    }
  }

  async function loadReport() {
    setErrorMsg("");
    setRows([]);
    setLoadingReport(true);

    try {
      if (!canRun) {
        setErrorMsg(
          tr(
            "reports.errors.noActiveOrgOrSession",
            "There is no active organization or the session is not ready."
          )
        );
        return;
      }

      if (!start || !end) {
        setErrorMsg(
          tr(
            "reports.errors.missingStartEnd",
            "Please select both a start and end date to generate the report."
          )
        );
        return;
      }

      if (start && end && start > end) {
        setErrorMsg(
          tr(
            "reports.errors.invalidDateRange",
            'The "From" date cannot be later than the "To" date.'
          )
        );
        return;
      }

      const params = new URLSearchParams();
      params.set("action", reportType === "cost" ? "costs" : "report");

      if (start) params.set("start", start);
      if (end) params.set("end", end);

      if (selectedGeocercaIds.length) {
        params.set("geocerca_ids", selectedGeocercaIds.join(","));
      }
      if (selectedPersonalIds.length) {
        params.set("personal_ids", selectedPersonalIds.join(","));
      }
      if (selectedActivityIds.length) {
        params.set("activity_ids", selectedActivityIds.join(","));
      }
      if (selectedAsignacionIds.length) {
        params.set("asignacion_ids", selectedAsignacionIds.join(","));
      }

      params.set("limit", "500");
      params.set("offset", "0");

      const json = await apiGet(`/api/reportes?${params.toString()}`);
      setRows(Array.isArray(json?.data) ? json.data : []);
    } catch (e) {
      console.error("[Reports] loadReport:", e);
      setErrorMsg(
        e?.message || tr("reports.errors.generateReport", "Error generating report.")
      );
    } finally {
      setLoadingReport(false);
    }
  }


  function clearSelections() {
    setSelectedGeocercaIds([]);
    setSelectedPersonalIds([]);
    setSelectedActivityIds([]);
    setSelectedAsignacionIds([]);
  }

  function handleExport() {
    const ok = exportRowsToCSV(rows, "reportes", reportType);
    if (!ok) {
      setErrorMsg(tr("reports.errors.noDataToExport", "There is no data to export."));
    }
  }


  const geocercaFilterOptions = useMemo(
    () =>
      (filters.geocercas || []).map((geocerca) => ({
        value: String(geocerca.id),
        label: geocerca.nombre || "—",
      })),
    [filters.geocercas]
  );

  const personalFilterOptions = useMemo(
    () =>
      (filters.personas || []).map((persona) => ({
        value: String(persona.id),
        label:
          `${persona.nombre || ""} ${persona.apellido || ""}`.trim() ||
          persona.email ||
          "—",
      })),
    [filters.personas]
  );

  const activityFilterOptions = useMemo(
    () =>
      (filters.activities || []).map((activity) => ({
        value: String(activity.id),
        label:
          `${activity.name || "—"}${
            activity.hourly_rate
              ? ` (${activity.hourly_rate} ${activity.currency_code || ""})`
              : ""
          }`,
      })),
    [filters.activities]
  );

  const assignmentFilterOptions = useMemo(() => {
    const personasById = new Map(
      (filters.personas || [])
        .filter((persona) => persona?.id)
        .map((persona) => [String(persona.id), persona])
    );
    const activitiesById = new Map(
      (filters.activities || [])
        .filter((activity) => activity?.id)
        .map((activity) => [String(activity.id), activity])
    );
    const geocercasById = new Map(
      (filters.geocercas || [])
        .filter((geocerca) => geocerca?.id)
        .map((geocerca) => [String(geocerca.id), geocerca])
    );
    const geocercasBySourceId = new Map(
      (filters.geocercas || [])
        .filter((geocerca) => geocerca?.source_geocerca_id)
        .map((geocerca) => [String(geocerca.source_geocerca_id), geocerca])
    );

    return (filters.asignaciones || []).map((assignment) => {
      const persona = assignment?.personal_id
        ? personasById.get(String(assignment.personal_id))
        : null;
      const activity = assignment?.activity_id
        ? activitiesById.get(String(assignment.activity_id))
        : null;
      const geocerca =
        (assignment?.geofence_id
          ? geocercasById.get(String(assignment.geofence_id))
          : null) ||
        (assignment?.geocerca_id
          ? geocercasBySourceId.get(String(assignment.geocerca_id)) ||
            geocercasById.get(String(assignment.geocerca_id))
          : null);

      const personaLabel =
        `${persona?.nombre || ""} ${persona?.apellido || ""}`.trim() ||
        persona?.email ||
        "";
      const geocercaLabel = geocerca?.nombre || "";
      const activityLabel = activity?.name || "";
      const labelParts = [personaLabel, geocercaLabel, activityLabel].filter(Boolean);

      return {
        value: String(assignment.id),
        label:
          labelParts.join(" — ") ||
          assignment.status ||
          assignment.estado ||
          tr("reports.labels.assignment", "Asignación"),
      };
    });
  }, [filters.asignaciones, filters.personas, filters.activities, filters.geocercas, i18n.language]);

  const groupableFields = useMemo(
    () =>
      reportType === "cost"
        ? [
            { value: "work_date", label: tr("reports.groupBy.date", "Fecha") },
            { value: "personal_nombre", label: tr("reports.groupBy.person", "Colaborador") },
            { value: "activity_nombre", label: tr("reports.groupBy.activity", "Actividad") },
            { value: "geofence_nombre", label: tr("reports.groupBy.geofence", "Geocerca") },
            { value: "horas", label: tr("reports.groupBy.hours", "Horas") },
            { value: "costo_base", label: tr("reports.groupBy.baseCost", "Costo base") },
            { value: "nivel_confianza", label: tr("reports.groupBy.confidence", "Confianza") },
            { value: "estado_auditoria", label: tr("reports.groupBy.audit", "Auditoría") },
            { value: "costo_final", label: tr("reports.groupBy.finalCost", "Costo final") },
          ]
        : [
            { value: "date", label: tr("reports.groupBy.date", "Fecha") },
            { value: "tracker_nombre", label: tr("reports.groupBy.tracker", "Tracker") },
            { value: "geofence_nombre", label: tr("reports.groupBy.geofence", "Geocerca") },
            { value: "activity_nombre", label: tr("reports.groupBy.activity", "Actividad") },
            { value: "km_observados", label: tr("reports.groupBy.km", "Km observados") },
            { value: "horas_observadas", label: tr("reports.groupBy.hoursObserved", "Horas observadas") },
            {
              value: "minutos_sin_cobertura",
              label: tr("reports.groupBy.uncoveredMinutes", "Min sin cobertura"),
            },
            { value: "numero_huecos", label: tr("reports.groupBy.gaps", "# Huecos") },
            {
              value: "porcentaje_cobertura",
              label: tr("reports.groupBy.coverage", "% Cobertura"),
            },
            {
              value: "nivel_confianza",
              label: tr("reports.groupBy.confidenceLevel", "Nivel confianza"),
            },
            { value: "costo_total", label: tr("reports.groupBy.totalCost", "Costo total") },
          ],
    [reportType, i18n.language]
  );

  const groupedReportTree = useMemo(
    () => buildGroupedReportTree(rows, groupByFields, groupableFields, reportType),
    [rows, groupByFields, groupableFields, reportType]
  );

  const allGroupIds = useMemo(
    () => collectGroupNodeIds(groupedReportTree),
    [groupedReportTree]
  );
  const allGroupIdsKey = allGroupIds.join("||");

  useEffect(() => {
    setExpandedGroupKeys(new Set(allGroupIds));
  }, [allGroupIdsKey]);

  useEffect(() => {
    setGroupByFields([]);
    setExpandedGroupKeys(new Set());
  }, [reportType]);

  const isGrouped = groupByFields.length > 0;

  function toggleGroup(groupId) {
    setExpandedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function expandAllGroups() {
    setExpandedGroupKeys(new Set(allGroupIds));
  }

  function collapseAllGroups() {
    setExpandedGroupKeys(new Set());
  }

  function renderCostDetailRow(row, index, keyPrefix = "cost", level = 0) {
    const rowKey =
      row?.asignacion_id || row?.assignment_id
        ? `${keyPrefix}-${row.asignacion_id || row.assignment_id}-${row.work_date || row.date || index}`
        : `${keyPrefix}-${index}`;

    return (
      <tr
        key={rowKey}
        className={`border-t border-gray-100 hover:bg-gray-50 ${
          index % 2 === 0 ? "bg-white" : "bg-gray-50/40"
        }`}
      >
        <td className="p-2 text-gray-900" style={{ paddingLeft: `${8 + level * 14}px` }}>
          {row.work_date || row.date || "—"}
        </td>
        <td className="p-2 text-gray-900">{row.personal_nombre || row.tracker_nombre || "—"}</td>
        <td className="p-2 text-gray-900">{row.activity_nombre || row.actividad_nombre || "—"}</td>
        <td className="p-2 text-gray-900">{row.geofence_nombre || row.geocerca_nombre || "—"}</td>
        <td className="p-2 text-right text-gray-900">{row.horas ?? row.horas_observadas ?? "—"}</td>
        <td className="p-2 text-right text-gray-900">{formatMoney(row.costo_base)}</td>
        <td className="p-2 text-right">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getConfidenceBadgeClass(
              row.nivel_confianza
            )}`}
          >
            {row.nivel_confianza ?? "—"}
          </span>
        </td>
        <td className="p-2 text-right">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getAuditBadgeClass(
              row.estado_auditoria
            )}`}
          >
            {row.estado_auditoria ?? "—"}
          </span>
        </td>
        <td className="p-2 text-right font-semibold text-gray-900">
          {formatCurrency(row.costo_final, row.currency_code, i18n.language)}
        </td>
      </tr>
    );
  }

  function renderAttendanceDetailRow(row, index, keyPrefix = "attendance", level = 0) {
    const rowKey =
      row?.assignment_id
        ? `${keyPrefix}-${row.assignment_id}-${row.date || row.work_date || index}`
        : `${keyPrefix}-${index}`;

    return (
      <tr
        key={rowKey}
        className={`border-t border-gray-100 hover:bg-gray-50 ${
          index % 2 === 0 ? "bg-white" : "bg-gray-50/40"
        }`}
      >
        <td className="p-2 text-gray-900" style={{ paddingLeft: `${8 + level * 14}px` }}>
          {row.date || row.work_date || "—"}
        </td>
        <td className="p-2 text-gray-900">{row.tracker_nombre || row.personal_nombre || "—"}</td>
        <td className="p-2 text-gray-900">{row.geofence_nombre || row.geocerca_nombre || "—"}</td>
        <td className="p-2 text-gray-900">{row.activity_nombre || row.actividad_nombre || "—"}</td>
        <td className="p-2 text-right text-gray-900">{row.km_observados ?? "—"}</td>
        <td className="p-2 text-right text-gray-900">{row.horas_observadas ?? "—"}</td>
        <td className="p-2 text-right text-gray-900">{row.minutos_sin_cobertura ?? "—"}</td>
        <td className="p-2 text-right text-gray-900">{row.numero_huecos ?? "—"}</td>
        <td className="p-2 text-right text-gray-900">{row.porcentaje_cobertura ?? "—"}</td>
        <td className="p-2 text-right text-gray-900">{row.nivel_confianza ?? "—"}</td>
        <td className="p-2 text-right text-gray-900">
          {formatCurrency(row.costo_total, row.currency_code, i18n.language)}
        </td>
      </tr>
    );
  }

  function renderCostGroupedRows(groups, level = 0) {
    return groups.flatMap((group) => {
      const expanded = expandedGroupKeys.has(group.id);
      const summary = group.summary;
      const rowElements = [
        <tr key={`${group.id}-group`} className="border-t border-emerald-100 bg-emerald-50/70">
          <td colSpan={4} className="p-2 text-sm text-emerald-950">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="flex w-full items-center gap-2 text-left font-medium"
              style={{ paddingLeft: `${level * 18}px` }}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-emerald-300 bg-white text-xs">
                {expanded ? "−" : "+"}
              </span>
              <span>
                {group.fieldLabel}: <span className="font-semibold">{group.valueLabel}</span>
              </span>
              <span className="text-xs font-normal text-emerald-700">
                ({summary.rowCount}{" "}
                {summary.rowCount === 1
                  ? tr("reports.grouping.row", "fila")
                  : tr("reports.grouping.rows", "filas")})
              </span>
            </button>
          </td>
          <td className="p-2 text-right font-semibold text-emerald-950">
            {formatNumericSummary(summary.horas, 3)}
          </td>
          <td className="p-2 text-right font-semibold text-emerald-950">
            {formatCurrency(summary.costo_base, summary.currency_code, i18n.language)}
          </td>
          <td className="p-2 text-right text-emerald-800">—</td>
          <td className="p-2 text-right text-emerald-800">—</td>
          <td className="p-2 text-right font-semibold text-emerald-950">
            {formatCurrency(summary.costo_final, summary.currency_code, i18n.language)}
          </td>
        </tr>,
      ];

      if (expanded) {
        if (group.children.length) {
          rowElements.push(...renderCostGroupedRows(group.children, level + 1));
        } else {
          rowElements.push(
            ...group.rows.map((row, index) =>
              renderCostDetailRow(row, index, `${group.id}-detail`, level + 1)
            )
          );
        }
      }

      return rowElements;
    });
  }

  function renderAttendanceGroupedRows(groups, level = 0) {
    return groups.flatMap((group) => {
      const expanded = expandedGroupKeys.has(group.id);
      const summary = group.summary;
      const rowElements = [
        <tr key={`${group.id}-group`} className="border-t border-emerald-100 bg-emerald-50/70">
          <td colSpan={4} className="p-2 text-sm text-emerald-950">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="flex w-full items-center gap-2 text-left font-medium"
              style={{ paddingLeft: `${level * 18}px` }}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-emerald-300 bg-white text-xs">
                {expanded ? "−" : "+"}
              </span>
              <span>
                {group.fieldLabel}: <span className="font-semibold">{group.valueLabel}</span>
              </span>
              <span className="text-xs font-normal text-emerald-700">
                ({summary.rowCount}{" "}
                {summary.rowCount === 1
                  ? tr("reports.grouping.row", "fila")
                  : tr("reports.grouping.rows", "filas")})
              </span>
            </button>
          </td>
          <td className="p-2 text-right font-semibold text-emerald-950">
            {formatNumericSummary(summary.km_observados, 3)}
          </td>
          <td className="p-2 text-right font-semibold text-emerald-950">
            {formatNumericSummary(summary.horas_observadas, 3)}
          </td>
          <td className="p-2 text-right font-semibold text-emerald-950">
            {formatNumericSummary(summary.minutos_sin_cobertura, 1)}
          </td>
          <td className="p-2 text-right font-semibold text-emerald-950">
            {formatNumericSummary(summary.numero_huecos, 0)}
          </td>
          <td className="p-2 text-right font-semibold text-emerald-950">
            {formatCoverageSummary(summary.porcentaje_cobertura)}
          </td>
          <td className="p-2 text-right text-emerald-950">{summary.nivel_confianza}</td>
          <td className="p-2 text-right font-semibold text-emerald-950">
            {formatCurrency(summary.costo_total, summary.currency_code, i18n.language)}
          </td>
        </tr>,
      ];

      if (expanded) {
        if (group.children.length) {
          rowElements.push(...renderAttendanceGroupedRows(group.children, level + 1));
        } else {
          rowElements.push(
            ...group.rows.map((row, index) =>
              renderAttendanceDetailRow(row, index, `${group.id}-detail`, level + 1)
            )
          );
        }
      }

      return rowElements;
    });
  }

  if (!ready) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          {tr("reports.states.loadingSession", "Loading your session…")}
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {tr("reports.states.noActiveSession", "There is no active session. Sign in again.")}
        </div>
      </div>
    );
  }

  if (!currentOrg?.id) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {tr("reports.states.noActiveOrg", "There is no active organization for this user.")}
        </div>
      </div>
    );
  }

  const filtersDisabled = loadingFilters || loadingReport;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <label className="text-sm font-medium text-gray-900">Tipo de reporte:</label>
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            name="reportType"
            value="attendance"
            checked={reportType === "attendance"}
            onChange={() => setReportType("attendance")}
            className="accent-emerald-700"
          />
          <span>Asistencia</span>
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            name="reportType"
            value="cost"
            checked={reportType === "cost"}
            onChange={() => setReportType("cost")}
            className="accent-emerald-700"
          />
          <span>Costos</span>
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">
          {tr("reports.title", "Reports")}
        </h1>
        <p className="text-xs text-gray-600">
          {tr("reports.labels.currentOrg", "Current org")}:{" "}
          <span className="font-medium text-gray-900">
            {currentOrg?.name || currentOrg?.id}
          </span>
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {tr("reports.sections.filters", "Filters")}
                </h2>
                <p className="text-xs text-gray-600">
                  {tr("reports.help.filters", "Select ranges and lists. Then press")}{" "}
                  <span className="font-medium text-gray-900">
                    {tr("reports.actions.generate", "Generate")}
                  </span>
                  .
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadFilters}
                  disabled={loadingFilters}
                  className={buttonSecondary}
                  title={tr("reports.actions.reloadLists", "Reload lists")}
                >
                  {loadingFilters
                    ? tr("reports.states.loading", "Loading…")
                    : tr("reports.actions.reloadFilters", "Reload filters")}
                </button>

                <button
                  onClick={clearSelections}
                  disabled={filtersDisabled}
                  className={buttonSecondary}
                  title={tr(
                    "reports.actions.clearSelectionsTitle",
                    "Clear selections (does not clear dates)"
                  )}
                >
                  {tr("reports.actions.clearSelections", "Clear selections")}
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-900">
                  {tr("reports.labels.from", "From")}
                </label>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className={inputBase}
                  disabled={filtersDisabled}
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-900">
                  {tr("reports.labels.to", "To")}
                </label>
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className={inputBase}
                  disabled={filtersDisabled}
                />
              </div>

              <div className="md:col-span-6 flex flex-wrap gap-2 md:justify-end">
                <button
                  onClick={loadReport}
                  disabled={loadingReport}
                  className={buttonPrimary}
                >
                  {loadingReport
                    ? tr("reports.states.generating", "Generating…")
                    : tr("reports.actions.generate", "Generate")}
                </button>

                <button
                  onClick={handleExport}
                  disabled={!rows.length}
                  className={buttonSecondary}
                >
                  {tr("reports.actions.exportCsv", "Export CSV")}
                </button>
              </div>

              <div className="md:col-span-12">
                <div className="text-xs text-gray-600">
                  <span className="font-medium text-gray-900">
                    {tr("reports.labels.tip", "Tip")}:
                  </span>{" "}
                  {tr(
                    "reports.help.dropdownFilters",
                    "Open each dropdown and mark one or more values. The filter panel stays compact."
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900">
                  {tr("reports.filters.geofences", "Geofences")}{" "}
                  <span className="text-xs font-normal text-gray-600">
                    ({tr("reports.labels.multi", "multi")})
                  </span>
                </label>
                <MultiSelectDropdown
                  options={geocercaFilterOptions}
                  value={selectedGeocercaIds}
                  onChange={setSelectedGeocercaIds}
                  disabled={loadingFilters}
                  placeholder={tr("reports.placeholders.geofences", "Selecciona geocercas")}
                  emptyLabel={tr("reports.placeholders.noGeofences", "Sin geocercas")}
                  clearLabel={tr("reports.actions.clearFilter", "Limpiar filtro")}
                  selectedCountLabel={tr("reports.labels.selected", "seleccionados")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900">
                  {tr("reports.filters.people", "People")}{" "}
                  <span className="text-xs font-normal text-gray-600">
                    ({tr("reports.labels.multi", "multi")})
                  </span>
                </label>
                <MultiSelectDropdown
                  options={personalFilterOptions}
                  value={selectedPersonalIds}
                  onChange={setSelectedPersonalIds}
                  disabled={loadingFilters}
                  placeholder={tr("reports.placeholders.people", "Selecciona personas")}
                  emptyLabel={tr("reports.placeholders.noPeople", "Sin personas")}
                  clearLabel={tr("reports.actions.clearFilter", "Limpiar filtro")}
                  selectedCountLabel={tr("reports.labels.selected", "seleccionados")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900">
                  {tr("reports.filters.activities", "Activities")}{" "}
                  <span className="text-xs font-normal text-gray-600">
                    ({tr("reports.labels.multi", "multi")})
                  </span>
                </label>
                <MultiSelectDropdown
                  options={activityFilterOptions}
                  value={selectedActivityIds}
                  onChange={setSelectedActivityIds}
                  disabled={loadingFilters}
                  placeholder={tr("reports.placeholders.activities", "Selecciona actividades")}
                  emptyLabel={tr("reports.placeholders.noActivities", "Sin actividades")}
                  clearLabel={tr("reports.actions.clearFilter", "Limpiar filtro")}
                  selectedCountLabel={tr("reports.labels.selected", "seleccionados")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900">
                  {tr("reports.filters.assignments", "Assignments")}{" "}
                  <span className="text-xs font-normal text-gray-600">
                    ({tr("reports.labels.multi", "multi")})
                  </span>
                </label>
                <MultiSelectDropdown
                  options={assignmentFilterOptions}
                  value={selectedAsignacionIds}
                  onChange={setSelectedAsignacionIds}
                  disabled={loadingFilters}
                  placeholder={tr("reports.placeholders.assignments", "Selecciona asignaciones")}
                  emptyLabel={tr("reports.placeholders.noAssignments", "Sin asignaciones")}
                  clearLabel={tr("reports.actions.clearFilter", "Limpiar filtro")}
                  selectedCountLabel={tr("reports.labels.selected", "seleccionados")}
                />
                <p className="mt-1 text-[11px] text-gray-600">
                  {tr(
                    "reports.help.assignmentsHumanLabels",
                    "Las asignaciones se muestran como persona, geocerca y actividad para evitar IDs técnicos."
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {tr("reports.sections.results", "Results")}
              </h2>
              <p className="text-xs text-gray-600">
                {loadingReport
                  ? tr("reports.states.generatingReport", "Generating report…")
                  : rows.length
                  ? tr("reports.states.rowsCount", "Rows: {{count}}", { count: rows.length })
                  : tr(
                      "reports.states.noDataYet",
                      "There is no data yet. Adjust filters and generate."
                    )}
              </p>
            </div>
          </div>

          <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <label className="block text-sm font-medium text-gray-900">
                  {tr("reports.grouping.title", "Agrupar / totalizar")}
                </label>
                <MultiSelectDropdown
                  options={groupableFields}
                  value={groupByFields}
                  onChange={setGroupByFields}
                  disabled={!rows.length || loadingReport}
                  placeholder={tr(
                    "reports.grouping.placeholder",
                    "Sin agrupación: detalle completo"
                  )}
                  emptyLabel={tr("reports.grouping.noOptions", "Sin columnas disponibles")}
                  clearLabel={tr("reports.actions.clearGrouping", "Desagrupar")}
                  selectedCountLabel={tr("reports.labels.selected", "seleccionados")}
                />
                <p className="mt-1 text-xs text-gray-600">
                  {tr(
                    "reports.grouping.help",
                    "Selecciona columnas en el orden deseado. Los grupos se pueden expandir y contraer como en Excel, con totales por nivel."
                  )}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setGroupByFields([])}
                  disabled={!groupByFields.length}
                  className={buttonSecondary}
                >
                  {tr("reports.actions.ungroup", "Desagrupar")}
                </button>
                <button
                  type="button"
                  onClick={expandAllGroups}
                  disabled={!isGrouped || !allGroupIds.length}
                  className={buttonSecondary}
                >
                  {tr("reports.actions.expandAll", "Expandir todo")}
                </button>
                <button
                  type="button"
                  onClick={collapseAllGroups}
                  disabled={!isGrouped || !allGroupIds.length}
                  className={buttonSecondary}
                >
                  {tr("reports.actions.collapseAll", "Contraer todo")}
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loadingReport ? (
              <p className="p-4 text-sm text-gray-700">
                {tr("reports.states.loading", "Loading…")}
              </p>
            ) : rows.length === 0 ? (
              <p className="p-4 text-sm text-gray-700">
                {tr(
                  "reports.states.noDataWithFilters",
                  "There is no data with the selected filters."
                )}
              </p>
            ) : reportType === "cost" ? (
              <>
                <div className="mb-2 px-4 pt-3 text-xs text-gray-600">
                  <span className="font-medium">Nota:</span> El reporte híbrido usa{" "}
                  <b>costo base administrativo</b> y, cuando existe histórico técnico, agrega{" "}
                  <b>confianza</b> y <b>estado de auditoría</b>. Si no hay histórico GPS para el
                  período, el costo final queda igual al costo base.
                </div>

                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-900">
                    <tr className="border-b border-gray-200">
                      <th className="p-2 text-left font-semibold">Fecha</th>
                      <th className="p-2 text-left font-semibold">Colaborador</th>
                      <th className="p-2 text-left font-semibold">Actividad</th>
                      <th className="p-2 text-left font-semibold">Geocerca</th>
                      <th className="p-2 text-right font-semibold">Horas</th>
                      <th className="p-2 text-right font-semibold">Costo base</th>
                      <th className="p-2 text-right font-semibold">Confianza</th>
                      <th className="p-2 text-right font-semibold">Auditoría</th>
                      <th className="p-2 text-right font-semibold">Costo final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isGrouped
                      ? renderCostGroupedRows(groupedReportTree)
                      : rows.map((row, index) => renderCostDetailRow(row, index))}
                  </tbody>
                </table>
              </>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-900">
                  <tr className="border-b border-gray-200">
                    <th className="p-2 text-left font-semibold">Fecha</th>
                    <th className="p-2 text-left font-semibold">Tracker</th>
                    <th className="p-2 text-left font-semibold">Geocerca</th>
                    <th className="p-2 text-left font-semibold">Actividad</th>
                    <th className="p-2 text-right font-semibold">Km observados</th>
                    <th className="p-2 text-right font-semibold">Horas observadas</th>
                    <th className="p-2 text-right font-semibold">Min sin cobertura</th>
                    <th className="p-2 text-right font-semibold"># Huecos</th>
                    <th className="p-2 text-right font-semibold">% Cobertura</th>
                    <th className="p-2 text-right font-semibold">Nivel confianza</th>
                    <th className="p-2 text-right font-semibold">Costo total</th>
                  </tr>
                </thead>
                <tbody>
                  {isGrouped
                    ? renderAttendanceGroupedRows(groupedReportTree)
                    : rows.map((row, index) => renderAttendanceDetailRow(row, index))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}