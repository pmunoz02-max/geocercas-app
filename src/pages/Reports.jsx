// src/pages/Reports.jsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";

function toCsvValue(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replaceAll('"', '""')}"`;
}

function exportRowsToCSV(rows, filenameBase = "reporte") {
  if (!rows?.length) {
    alert("No hay datos para exportar.");
    return;
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
}

export default function Reports() {
  const { ready, authenticated, currentOrg } = useAuth();

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

  useEffect(() => {
    if (!canRun) return;
    loadFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRun]);

  async function loadFilters() {
    setLoadingFilters(true);
    setErrorMsg("");
    try {
      // ✅ mandamos org_id (pero el backend lo valida por memberships)
      const orgId = currentOrg?.id;
      const url = orgId
        ? `/api/reportes?action=filters&org_id=${encodeURIComponent(orgId)}`
        : "/api/reportes?action=filters";

      const json = await apiGet(url);
      const data = json?.data || {};
      setFilters({
        geocercas: Array.isArray(data.geocercas) ? data.geocercas : [],
        personas: Array.isArray(data.personas) ? data.personas : [],
        activities: Array.isArray(data.activities) ? data.activities : [],
        asignaciones: Array.isArray(data.asignaciones) ? data.asignaciones : [],
      });
    } catch (e) {
      console.error("[Reports] loadFilters:", e);
      setErrorMsg(e?.message || "Error cargando filtros.");
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
        setErrorMsg("No hay organización activa o la sesión no está lista.");
        return;
      }
      if (start && end && start > end) {
        setErrorMsg('La fecha "Desde" no puede ser mayor que la fecha "Hasta".');
        return;
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
      setErrorMsg(e?.message || "Error generando reporte.");
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

  if (!ready) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Cargando tu sesión…
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No hay sesión activa. Inicia sesión nuevamente.
        </div>
      </div>
    );
  }

  if (!currentOrg?.id) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No hay organización activa para este usuario.
        </div>
      </div>
    );
  }

  const filtersDisabled = loadingFilters || loadingReport;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <p className="text-xs text-gray-600">
          Org actual:{" "}
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
                <h2 className="text-sm font-semibold text-gray-900">Filtros</h2>
                <p className="text-xs text-gray-600">
                  Selecciona rangos y listas. Luego presiona{" "}
                  <span className="font-medium text-gray-900">Generar</span>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadFilters}
                  disabled={loadingFilters}
                  className={buttonSecondary}
                  title="Recargar listas"
                >
                  {loadingFilters ? "Cargando…" : "Recargar filtros"}
                </button>

                <button
                  onClick={clearSelections}
                  disabled={filtersDisabled}
                  className={buttonSecondary}
                  title="Limpiar selecciones (no borra fechas)"
                >
                  Limpiar selecciones
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-900">Desde</label>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className={inputBase}
                  disabled={filtersDisabled}
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-900">Hasta</label>
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className={inputBase}
                  disabled={filtersDisabled}
                />
              </div>

              <div className="md:col-span-6 flex flex-wrap gap-2 md:justify-end">
                <button onClick={loadReport} disabled={loadingReport} className={buttonPrimary}>
                  {loadingReport ? "Generando…" : "Generar"}
                </button>

                <button
                  onClick={() => exportRowsToCSV(rows, "reportes")}
                  disabled={!rows.length}
                  className={buttonSecondary}
                >
                  Exportar CSV
                </button>
              </div>

              <div className="md:col-span-12">
                <div className="text-xs text-gray-600">
                  <span className="font-medium text-gray-900">Tip:</span> En listas multi-select usa{" "}
                  <span className="font-medium text-gray-900">Ctrl</span> (Windows) /{" "}
                  <span className="font-medium text-gray-900">Command</span> (Mac) para seleccionar múltiples.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900">
                  Geocercas <span className="text-xs font-normal text-gray-600">(multi)</span>
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
                  Personas <span className="text-xs font-normal text-gray-600">(multi)</span>
                </label>
                <select
                  multiple
                  value={selectedPersonalIds}
                  onChange={onMultiSelectChange(setSelectedPersonalIds)}
                  className={`${selectBase} mt-1 min-h-[160px]`}
                  disabled={loadingFilters}
                >
                  {filters.personas.map((p) => {
                    const label = `${p.nombre || ""} ${p.apellido || ""}`.trim() || p.email || p.id;
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
                  Actividades <span className="text-xs font-normal text-gray-600">(multi)</span>
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
                  Asignaciones <span className="text-xs font-normal text-gray-600">(multi)</span>
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
                      {(a.status || a.estado || "asignación")} — {String(a.id).slice(0, 8)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-600">
                  Nota: si tus asignaciones no tienen{" "}
                  <span className="font-medium">personal_id</span>, el cruce con marcajes puede salir vacío.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Resultados</h2>
              <p className="text-xs text-gray-600">
                {loadingReport
                  ? "Generando reporte…"
                  : rows.length
                    ? `Filas: ${rows.length}`
                    : "Aún no hay datos. Ajusta filtros y genera."}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loadingReport ? (
              <p className="p-4 text-sm text-gray-700">Cargando…</p>
            ) : rows.length === 0 ? (
              <p className="p-4 text-sm text-gray-700">No hay datos con los filtros seleccionados.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-900">
                  <tr className="border-b border-gray-200">
                    <th className="p-2 text-left font-semibold">Día</th>
                    <th className="p-2 text-left font-semibold">Persona</th>
                    <th className="p-2 text-left font-semibold">Email</th>
                    <th className="p-2 text-left font-semibold">Geocerca</th>
                    <th className="p-2 text-left font-semibold">Actividad</th>
                    <th className="p-2 text-left font-semibold">Asignación</th>
                    <th className="p-2 text-left font-semibold">Entrada</th>
                    <th className="p-2 text-left font-semibold">Salida</th>
                    <th className="p-2 text-center font-semibold">Marcajes</th>
                    <th className="p-2 text-center font-semibold">Dentro</th>
                    <th className="p-2 text-center font-semibold">Dist (m)</th>
                    <th className="p-2 text-left font-semibold">Tarifa</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.attendance_id ? `${r.attendance_id}-${i}` : i}
                      className={`border-t border-gray-100 hover:bg-gray-50 ${
                        i % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                      }`}
                    >
                      <td className="p-2 text-gray-900">{r.work_day || "—"}</td>
                      <td className="p-2 text-gray-900">{r.personal_nombre || "—"}</td>
                      <td className="p-2 text-gray-900">{r.email || "—"}</td>
                      <td className="p-2 text-gray-900">{r.geofence_name || "—"}</td>
                      <td className="p-2 text-gray-900">{r.activity_name || "—"}</td>
                      <td className="p-2 text-gray-900">
                        {r.asignacion_id
                          ? `${String(r.asignacion_id).slice(0, 8)} (${r.asignacion_status || "—"})`
                          : "—"}
                      </td>
                      <td className="p-2 text-gray-900">{r.first_check_in || "—"}</td>
                      <td className="p-2 text-gray-900">{r.last_check_out || "—"}</td>
                      <td className="p-2 text-center text-gray-900">{r.total_marks ?? "—"}</td>
                      <td className="p-2 text-center text-gray-900">{r.inside_count ?? "—"}</td>
                      <td className="p-2 text-center text-gray-900">{r.avg_distance_m ?? "—"}</td>
                      <td className="p-2 text-gray-900">
                        {r.hourly_rate ? `${r.hourly_rate} ${r.currency_code || ""}` : "—"}
                      </td>
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
