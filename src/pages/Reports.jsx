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

function getItemOrgId(it) {
  return it?.org_id || it?.tenant_id || null;
}

function filterByOrgIfPossible(arr, orgId) {
  const list = Array.isArray(arr) ? arr : [];
  if (!orgId) return list;

  const hasOrgField = list.some((it) => !!getItemOrgId(it));
  if (!hasOrgField) return list;

  return list.filter((it) => String(getItemOrgId(it)) === String(orgId));
}

function normalizeGeocercas(arr) {
  return dedupeById(
    (Array.isArray(arr) ? arr : [])
      .map((g) => ({
        ...g,
        nombre: (g?.nombre || g?.name || "").trim() || g?.id,
      }))
      .filter((g) => g?.id)
  );
}

function normalizePersonas(arr) {
  return dedupeById(
    (Array.isArray(arr) ? arr : [])
      .map((p) => ({
        ...p,
        nombre: p?.nombre || "",
        apellido: p?.apellido || "",
        email: p?.email || "",
      }))
      .filter((p) => p?.id)
  );
}

function normalizeActivities(arr) {
  return dedupeById(
    (Array.isArray(arr) ? arr : [])
      .map((a) => ({
        ...a,
        name: (a?.name || a?.nombre || "").trim() || a?.id,
      }))
      .filter((a) => a?.id)
  );
}

function normalizeAsignaciones(arr) {
  return dedupeById((Array.isArray(arr) ? arr : []).filter((a) => a?.id));
}

export default function Reports() {
  const { loading, isAuthenticated, currentOrg, contextLoading, session } = useAuth();
  const orgId = currentOrg?.id || null;

  const [errorMsg, setErrorMsg] = useState("");
  const [warningMsg, setWarningMsg] = useState("");
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

  const token = session?.access_token || null;

  const canRun = useMemo(
    () => !loading && isAuthenticated && !!orgId && !!token,
    [loading, isAuthenticated, orgId, token]
  );

  // ✅ manda Authorization + x-org-id
  async function apiGet(url) {
    if (!token) throw new Error("Missing authentication");
    if (!orgId) throw new Error("Cannot resolve current organization");

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-org-id": String(orgId),
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
    setWarningMsg("");

    try {
      const json = await apiGet("/api/reportes?action=filters");
      const data = json?.data || {};

      let geocercas = normalizeGeocercas(data.geocercas);
      let personas = normalizePersonas(data.personas);
      let activities = normalizeActivities(data.activities);
      let asignaciones = normalizeAsignaciones(data.asignaciones);

      const beforeCounts = {
        geocercas: geocercas.length,
        personas: personas.length,
        activities: activities.length,
        asignaciones: asignaciones.length,
      };

      geocercas = filterByOrgIfPossible(geocercas, orgId);
      personas = filterByOrgIfPossible(personas, orgId);
      activities = filterByOrgIfPossible(activities, orgId);
      asignaciones = filterByOrgIfPossible(asignaciones, orgId);

      const afterCounts = {
        geocercas: geocercas.length,
        personas: personas.length,
        activities: activities.length,
        asignaciones: asignaciones.length,
      };

      const contaminated =
        afterCounts.geocercas < beforeCounts.geocercas ||
        afterCounts.personas < beforeCounts.personas ||
        afterCounts.activities < beforeCounts.activities ||
        afterCounts.asignaciones < beforeCounts.asignaciones;

      if (contaminated) {
        setWarningMsg(
          "Detecté catálogos de otras organizaciones y fueron filtrados por la org actual. " +
            "Recomendación: corregir /api/reportes?action=filters para que siempre filtre por org_id."
        );
      }

      setFilters({ geocercas, personas, activities, asignaciones });
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
        setErrorMsg(!token ? "Missing authentication" : "Cannot resolve current organization");
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

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          Cargando tu sesión…
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No hay sesión activa. Inicia sesión nuevamente.
        </div>
      </div>
    );
  }

  if (contextLoading && !orgId) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          Cargando organización…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Reportes</h1>
        <p className="text-xs text-gray-500">
          Org actual: <span className="font-medium">{currentOrg?.name || currentOrg?.id}</span>
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
      )}

      {warningMsg && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {warningMsg}
        </div>
      )}

      <div className="border rounded-xl bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-sm font-medium text-slate-700">Desde</label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="block border rounded-lg px-2 py-1 mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Hasta</label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="block border rounded-lg px-2 py-1 mt-1"
            />
          </div>

          <button
            onClick={loadReport}
            disabled={loadingReport}
            className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {loadingReport ? "Generando…" : "Generar"}
          </button>

          <button
            onClick={loadFilters}
            disabled={loadingFilters}
            className="px-4 py-2 rounded-lg border hover:bg-slate-100 disabled:opacity-60"
            title="Recargar listas"
          >
            {loadingFilters ? "Cargando…" : "Recargar filtros"}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          (Este paso solo envía el orgId al backend; el backend debe validarlo contra el usuario autenticado.)
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4 text-sm text-slate-500">
        {rows.length ? `Filas: ${rows.length}` : "Genera un reporte para ver datos."}
      </div>
    </div>
  );
}
