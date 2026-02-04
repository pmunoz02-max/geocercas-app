// src/pages/Reports.jsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";

function toCsvValue(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replaceAll('"', '""')}"`;
}

function exportRowsToCSV(rows, filenameBase = "reporte") {
  if (!rows?.length) return;
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
}

function dedupeById(arr) {
  const list = Array.isArray(arr) ? arr : [];
  const map = new Map();
  for (const it of list) {
    const id = it?.id;
    if (!id) continue;
    if (!map.has(id)) map.set(id, it);
  }
  return Array.from(map.values());
}

function normalizeGeocercas(arr) {
  return dedupeById(
    (Array.isArray(arr) ? arr : [])
      .map((g) => ({ ...g, nombre: (g?.nombre || g?.name || "").trim() || g?.id }))
      .filter((g) => g?.id)
  );
}

function normalizePersonas(arr) {
  return dedupeById(
    (Array.isArray(arr) ? arr : [])
      .map((p) => ({ ...p, nombre: p?.nombre || "", apellido: p?.apellido || "", email: p?.email || "" }))
      .filter((p) => p?.id)
  );
}

function normalizeActivities(arr) {
  return dedupeById(
    (Array.isArray(arr) ? arr : [])
      .map((a) => ({ ...a, name: (a?.name || a?.nombre || "").trim() || a?.id }))
      .filter((a) => a?.id)
  );
}

function normalizeAsignaciones(arr) {
  return dedupeById((Array.isArray(arr) ? arr : []).filter((a) => a?.id));
}

export default function Reports() {
  const { t } = useTranslation();
  const { loading, isAuthenticated, currentOrg, contextLoading, session } = useAuth();

  const orgId = currentOrg?.id || null;
  const token = session?.access_token || null;

  const [errorMsg, setErrorMsg] = useState("");
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [filters, setFilters] = useState({ geocercas: [], personas: [], activities: [], asignaciones: [] });

  const [selectedGeocercaIds, setSelectedGeocercaIds] = useState([]);
  const [selectedPersonalIds, setSelectedPersonalIds] = useState([]);
  const [selectedActivityIds, setSelectedActivityIds] = useState([]);
  const [selectedAsignacionIds, setSelectedAsignacionIds] = useState([]);

  const [rows, setRows] = useState([]);

  const canRun = useMemo(
    () => !loading && isAuthenticated && !!orgId && !!token,
    [loading, isAuthenticated, orgId, token]
  );

  async function apiGet(url) {
    if (!token) throw new Error(t("reportes.errorMissingAuth", { defaultValue: "Missing authentication" }));
    if (!orgId) throw new Error(t("reportes.errorMissingOrg", { defaultValue: "Cannot resolve current organization" }));

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-org-id": String(orgId),
        "cache-control": "no-cache",
        pragma: "no-cache"
      }
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
      const json = await apiGet("/api/reportes?action=filters");
      const data = json?.data || {};

      const geocercas = normalizeGeocercas(data.geocercas);
      const personas = normalizePersonas(data.personas);
      const activities = normalizeActivities(data.activities);
      const asignaciones = normalizeAsignaciones(data.asignaciones);

      setFilters({ geocercas, personas, activities, asignaciones });

      const mkSet = (arr) => new Set(arr.map((x) => String(x.id)));
      const gSet = mkSet(geocercas);
      const pSet = mkSet(personas);
      const aSet = mkSet(activities);
      const asSet = mkSet(asignaciones);

      setSelectedGeocercaIds((prev) => prev.filter((id) => gSet.has(String(id))));
      setSelectedPersonalIds((prev) => prev.filter((id) => pSet.has(String(id))));
      setSelectedActivityIds((prev) => prev.filter((id) => aSet.has(String(id))));
      setSelectedAsignacionIds((prev) => prev.filter((id) => asSet.has(String(id))));
    } catch (e) {
      console.error("[Reports] loadFilters:", e);
      setErrorMsg(e?.message || t("reportes.errorLoadFilters", { defaultValue: "Error cargando filtros." }));
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
      if (!canRun) throw new Error(!token ? t("reportes.errorMissingAuth") : t("reportes.errorMissingOrg"));
      if (start && end && start > end) {
        throw new Error(
          t("reportes.errorRangeInvalid", {
            defaultValue: 'La fecha "Desde" no puede ser mayor que la fecha "Hasta".'
          })
        );
      }

      const params = new URLSearchParams();
      params.set("action", "report");
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      if (selectedGeocercaIds.length) params.set("geocerca_ids", selectedGeocercaIds.join(","));
      if (selectedPersonalIds.length) params.set("personal_ids", selectedPersonalIds.join(","));
      if (selectedActivityIds.length) params.set("activity_ids", selectedActivityIds.join(","));
      if (selectedAsignacionIds.length) params.set("asignacion_ids", selectedAsignacionIds.join(","));
      params.set("limit", "500");
      params.set("offset", "0");

      const json = await apiGet(`/api/reportes?${params.toString()}`);
      setRows(Array.isArray(json?.data) ? json.data : []);
    } catch (e) {
      console.error("[Reports] loadReport:", e);
      setErrorMsg(e?.message || t("reportes.errorLoadReport", { defaultValue: "Error generando reporte." }));
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

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          {t("common.actions.loading", { defaultValue: "Cargando…" })}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("auth.loginRequired", { defaultValue: "No hay sesión activa. Inicia sesión nuevamente." })}
        </div>
      </div>
    );
  }

  if (contextLoading && !orgId) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          {t("home.missingContextBody", { defaultValue: "Cargando organización…" })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t("reportes.title", { defaultValue: "Reportes de costos" })}</h1>
        <p className="text-sm text-slate-600">
          {t("reportes.headerSubtitle", { defaultValue: "Consulta y exporta los costos por persona, actividad y geocerca." })}
        </p>
        <p className="text-xs text-gray-500">
          {t("reportes.currentOrg", { defaultValue: "Organización actual:" })}{" "}
          <span className="font-medium">{currentOrg?.name || currentOrg?.id}</span>
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
      )}

      <div className="border rounded-xl bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-sm font-medium text-slate-700">{t("reportes.filtersFrom", { defaultValue: "Desde" })}</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="block border rounded-lg px-2 py-1 mt-1" />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">{t("reportes.filtersTo", { defaultValue: "Hasta" })}</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="block border rounded-lg px-2 py-1 mt-1" />
          </div>

          <button
            onClick={loadReport}
            disabled={loadingReport}
            className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {loadingReport
              ? t("reportes.generating", { defaultValue: "Generando…" })
              : t("reportes.filtersApply", { defaultValue: "Aplicar filtros" })}
          </button>

          <button
            onClick={() => exportRowsToCSV(rows, "reportes")}
            disabled={!rows.length}
            className="px-4 py-2 rounded-lg border hover:bg-slate-100 disabled:opacity-60"
          >
            {t("reportes.tableExportButton", { defaultValue: "Exportar CSV" })}
          </button>

          <button
            onClick={loadFilters}
            disabled={loadingFilters}
            className="px-4 py-2 rounded-lg border hover:bg-slate-100 disabled:opacity-60"
          >
            {loadingFilters
              ? t("common.actions.loading", { defaultValue: "Cargando…" })
              : t("reportes.refreshFilters", { defaultValue: "Recargar filtros" })}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700">{t("reportes.filtersGeofence", { defaultValue: "Geocerca (multi)" })}</label>
            <select
              multiple
              value={selectedGeocercaIds}
              onChange={onMultiSelectChange(setSelectedGeocercaIds)}
              className="block w-full border rounded-lg px-2 py-2 mt-1 min-h-[140px]"
              disabled={loadingFilters}
            >
              {filters.geocercas.map((g) => (
                <option key={g.id} value={g.id}>{g.nombre}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">{t("reportes.multiTip", { defaultValue: "Tip: Ctrl/Command para seleccionar múltiples." })}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">{t("reportes.filtersPerson", { defaultValue: "Persona (multi)" })}</label>
            <select
              multiple
              value={selectedPersonalIds}
              onChange={onMultiSelectChange(setSelectedPersonalIds)}
              className="block w-full border rounded-lg px-2 py-2 mt-1 min-h-[140px]"
              disabled={loadingFilters}
            >
              {filters.personas.map((p) => {
                const label = `${p.nombre || ""} ${p.apellido || ""}`.trim() || p.email || p.id;
                return <option key={p.id} value={p.id}>{label}</option>;
              })}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">{t("reportes.filtersActivity", { defaultValue: "Actividad (multi)" })}</label>
            <select
              multiple
              value={selectedActivityIds}
              onChange={onMultiSelectChange(setSelectedActivityIds)}
              className="block w-full border rounded-lg px-2 py-2 mt-1 min-h-[140px]"
              disabled={loadingFilters}
            >
              {filters.activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.hourly_rate ? ` (${a.hourly_rate} ${a.currency_code || ""})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">{t("reportes.filtersAsignacion", { defaultValue: "Asignaciones (multi)" })}</label>
            <select
              multiple
              value={selectedAsignacionIds}
              onChange={onMultiSelectChange(setSelectedAsignacionIds)}
              className="block w-full border rounded-lg px-2 py-2 mt-1 min-h-[140px]"
              disabled={loadingFilters}
            >
              {filters.asignaciones.map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.status || a.estado || t("reportes.asignacion", { defaultValue: "asignación" }))} — {String(a.id).slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <section className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        {loadingReport ? (
          <p className="p-4 text-sm text-slate-500">{t("common.actions.loading", { defaultValue: "Cargando…" })}</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">{t("reportes.tableEmpty", { defaultValue: "No hay datos con los filtros seleccionados." })}</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-2 text-left">{t("reportes.colDia", { defaultValue: "Día" })}</th>
                <th className="p-2 text-left">{t("reportes.colPersona", { defaultValue: "Persona" })}</th>
                <th className="p-2 text-left">{t("reportes.colEmail", { defaultValue: "Email" })}</th>
                <th className="p-2 text-left">{t("reportes.colGeocerca", { defaultValue: "Geocerca" })}</th>
                <th className="p-2 text-left">{t("reportes.colActividad", { defaultValue: "Actividad" })}</th>
                <th className="p-2 text-left">{t("reportes.colAsignacion", { defaultValue: "Asignación" })}</th>
                <th className="p-2 text-left">{t("reportes.colEntrada", { defaultValue: "Entrada" })}</th>
                <th className="p-2 text-left">{t("reportes.colSalida", { defaultValue: "Salida" })}</th>
                <th className="p-2 text-center">{t("reportes.colMarcajes", { defaultValue: "Marcajes" })}</th>
                <th className="p-2 text-center">{t("reportes.colDentro", { defaultValue: "Dentro" })}</th>
                <th className="p-2 text-center">{t("reportes.colDist", { defaultValue: "Dist (m)" })}</th>
                <th className="p-2 text-left">{t("reportes.colTarifa", { defaultValue: "Tarifa" })}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.attendance_id ? `${r.attendance_id}-${i}` : i}
                  className={`border-t hover:bg-slate-50 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}
                >
                  <td className="p-2">{r.work_day || "—"}</td>
                  <td className="p-2">{r.personal_nombre || "—"}</td>
                  <td className="p-2">{r.email || "—"}</td>
                  <td className="p-2">{r.geofence_name || "—"}</td>
                  <td className="p-2">{r.activity_name || "—"}</td>
                  <td className="p-2">
                    {r.asignacion_id ? `${String(r.asignacion_id).slice(0, 8)} (${r.asignacion_status || "—"})` : "—"}
                  </td>
                  <td className="p-2">{r.first_check_in || "—"}</td>
                  <td className="p-2">{r.last_check_out || "—"}</td>
                  <td className="p-2 text-center">{r.total_marks ?? "—"}</td>
                  <td className="p-2 text-center">{r.inside_count ?? "—"}</td>
                  <td className="p-2 text-center">{r.avg_distance_m ?? "—"}</td>
                  <td className="p-2">{r.hourly_rate ? `${r.hourly_rate} ${r.currency_code || ""}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
