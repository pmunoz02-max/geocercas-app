// src/pages/Reports.jsx
import { useEffect, useMemo, useState } from "react";
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

export default function Reports() {
  const [reportType, setReportType] = useState("attendance");
  const { t } = useTranslation();
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

      if (reportType === "cost" && (!start || !end)) {
        setErrorMsg(
          tr(
            "reports.errors.missingStartEnd",
            "Please select both a start and end date to generate the costs report."
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

  function onMultiSelectChange(setter) {
    return (e) => {
      const values = Array.from(e.target.selectedOptions).map((o) => o.value);
      setter(values);
    };
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
                  {tr("reports.help.multiSelectIntro", "In multi-select lists use")}{" "}
                  <span className="font-medium text-gray-900">Ctrl</span> (Windows) /{" "}
                  <span className="font-medium text-gray-900">Command</span> (Mac){" "}
                  {tr("reports.help.multiSelectOutro", "to select multiple items.")}
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
                <select
                  multiple
                  value={selectedGeocercaIds}
                  onChange={onMultiSelectChange(setSelectedGeocercaIds)}
                  className={`${selectBase} mt-1 min-h-[160px]`}
                  disabled={loadingFilters}
                >
                  {filters.geocercas.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900">
                  {tr("reports.filters.people", "People")}{" "}
                  <span className="text-xs font-normal text-gray-600">
                    ({tr("reports.labels.multi", "multi")})
                  </span>
                </label>
                <select
                  multiple
                  value={selectedPersonalIds}
                  onChange={onMultiSelectChange(setSelectedPersonalIds)}
                  className={`${selectBase} mt-1 min-h-[160px]`}
                  disabled={loadingFilters}
                >
                  {filters.personas.map((p) => {
                    const label =
                      `${p.nombre || ""} ${p.apellido || ""}`.trim() ||
                      p.email ||
                      p.id;
                    return (
                      <option key={p.id} value={p.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900">
                  {tr("reports.filters.activities", "Activities")}{" "}
                  <span className="text-xs font-normal text-gray-600">
                    ({tr("reports.labels.multi", "multi")})
                  </span>
                </label>
                <select
                  multiple
                  value={selectedActivityIds}
                  onChange={onMultiSelectChange(setSelectedActivityIds)}
                  className={`${selectBase} mt-1 min-h-[160px]`}
                  disabled={loadingFilters}
                >
                  {filters.activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.hourly_rate ? ` (${a.hourly_rate} ${a.currency_code || ""})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900">
                  {tr("reports.filters.assignments", "Assignments")}{" "}
                  <span className="text-xs font-normal text-gray-600">
                    ({tr("reports.labels.multi", "multi")})
                  </span>
                </label>
                <select
                  multiple
                  value={selectedAsignacionIds}
                  onChange={onMultiSelectChange(setSelectedAsignacionIds)}
                  className={`${selectBase} mt-1 min-h-[160px]`}
                  disabled={loadingFilters}
                >
                  {filters.asignaciones.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.status || a.estado || tr("reports.labels.assignment", "assignment"))} —{" "}
                      {String(a.id).slice(0, 8)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-600">
                  {tr("reports.help.assignmentsNoteIntro", "Note: if your assignments do not have")}{" "}
                  <span className="font-medium">personal_id</span>,{" "}
                  {tr(
                    "reports.help.assignmentsNoteOutro",
                    "the match against attendance marks may come back empty."
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
                    {rows.map((r, i) => {
                      const rowKey = r.asignacion_id
                        ? `${r.asignacion_id}-${r.work_date || i}`
                        : i;

                      return (
                        <tr
                          key={rowKey}
                          className={`border-t border-gray-100 hover:bg-gray-50 ${
                            i % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                          }`}
                        >
                          <td className="p-2 text-gray-900">{r.work_date || "—"}</td>
                          <td className="p-2 text-gray-900">{r.personal_nombre || "—"}</td>
                          <td className="p-2 text-gray-900">{r.activity_nombre || "—"}</td>
                          <td className="p-2 text-gray-900">{r.geofence_nombre || "—"}</td>
                          <td className="p-2 text-right text-gray-900">{r.horas ?? "—"}</td>
                          <td className="p-2 text-right text-gray-900">
                            {formatMoney(r.costo_base)}
                          </td>
                          <td className="p-2 text-right">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getConfidenceBadgeClass(
                                r.nivel_confianza
                              )}`}
                            >
                              {r.nivel_confianza ?? "—"}
                            </span>
                          </td>
                          <td className="p-2 text-right">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getAuditBadgeClass(
                                r.estado_auditoria
                              )}`}
                            >
                              {r.estado_auditoria ?? "—"}
                            </span>
                          </td>
                          <td className="p-2 text-right font-semibold text-gray-900">
                            {formatMoney(r.costo_final)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-900">
                  <tr className="border-b border-gray-200">
                    <th className="p-2 text-left font-semibold">Fecha</th>
                    <th className="p-2 text-left font-semibold">Tracker User ID</th>
                    <th className="p-2 text-left font-semibold">Assignment ID</th>
                    <th className="p-2 text-left font-semibold">Activity ID</th>
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
                  {rows.map((r, i) => (
                    <tr
                      key={r.assignment_id ? `${r.assignment_id}-${i}` : i}
                      className={`border-t border-gray-100 hover:bg-gray-50 ${
                        i % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                      }`}
                    >
                      <td className="p-2 text-gray-900">{r.date || "—"}</td>
                      <td className="p-2 text-gray-900">{r.tracker_user_id || "—"}</td>
                      <td className="p-2 text-gray-900">{r.assignment_id || "—"}</td>
                      <td className="p-2 text-gray-900">{r.activity_id || "—"}</td>
                      <td className="p-2 text-right text-gray-900">{r.km_observados ?? "—"}</td>
                      <td className="p-2 text-right text-gray-900">{r.horas_observadas ?? "—"}</td>
                      <td className="p-2 text-right text-gray-900">
                        {r.minutos_sin_cobertura ?? "—"}
                      </td>
                      <td className="p-2 text-right text-gray-900">{r.numero_huecos ?? "—"}</td>
                      <td className="p-2 text-right text-gray-900">
                        {r.porcentaje_cobertura ?? "—"}
                      </td>
                      <td className="p-2 text-right text-gray-900">
                        {r.nivel_confianza ?? "—"}
                      </td>
                      <td className="p-2 text-right text-gray-900">{r.costo_total ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}