// src/pages/Reports.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";

/**
 * Rango inclusivo para "Hasta":
 * work_day >= fromDate
 * work_day <  toDateExclusive
 */
function buildDateRangeForDates(startStr, endStr) {
  let fromDate = null;
  let toDateExclusive = null;

  if (startStr) fromDate = startStr;

  if (endStr) {
    const d = new Date(endStr + "T00:00:00");
    if (!Number.isNaN(d.getTime())) {
      d.setDate(d.getDate() + 1);
      toDateExclusive = d.toISOString().slice(0, 10);
    }
  }

  return { fromDate, toDateExclusive };
}

export default function Reports() {
  // ============================
  // Sesión UNIVERSAL (no depende de AuthContext)
  // ============================
  const [sessionLoading, setSessionLoading] = useState(true);
  const [accessToken, setAccessToken] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const token = data?.session?.access_token || null;
        if (mounted) setAccessToken(token);
      } catch (e) {
        console.error("[Reports] getSession error:", e);
        if (mounted) setAccessToken(null);
      } finally {
        if (mounted) setSessionLoading(false);
      }
    }

    initSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setAccessToken(newSession?.access_token || null);
      setSessionLoading(false);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const canCallApi = useMemo(() => !sessionLoading && !!accessToken, [sessionLoading, accessToken]);

  // ============================
  // UI state
  // ============================
  const [rows, setRows] = useState([]);
  const [geocercas, setGeocercas] = useState([]);
  const [selectedGeocercaName, setSelectedGeocercaName] = useState("");

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingGeocercas, setLoadingGeocercas] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // ============================
  // Helper API
  // ============================
  async function apiGet(url) {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.error || `HTTP ${resp.status}`);
    return json;
  }

  // ============================
  // Cargar geocercas (via API)
  // ============================
  useEffect(() => {
    if (!canCallApi) return;
    loadGeocercas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCallApi]);

  async function loadGeocercas() {
    setLoadingGeocercas(true);
    setErrorMsg("");

    try {
      const json = await apiGet("/api/reportes?action=geocercas");
      setGeocercas(json?.data || []);
    } catch (e) {
      console.error("[Reports] loadGeocercas error:", e);
      setGeocercas([]);
      setErrorMsg(e?.message || "Error cargando geocercas.");
    } finally {
      setLoadingGeocercas(false);
    }
  }

  // ============================
  // Cargar reporte (via API)
  // ============================
  async function loadReport() {
    setErrorMsg("");
    setRows([]);
    setLoading(true);

    try {
      if (start && end && start > end) {
        setErrorMsg('La fecha "Desde" no puede ser mayor que la fecha "Hasta".');
        return;
      }

      // Mandamos end inclusivo, la API lo convierte a exclusive internamente
      const params = new URLSearchParams();
      params.set("action", "attendance");
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      if (selectedGeocercaName) params.set("geocerca_name", selectedGeocercaName);

      const json = await apiGet(`/api/reportes?${params.toString()}`);
      setRows(json?.data || []);
    } catch (e) {
      console.error("[Reports] loadReport error:", e);
      setErrorMsg(e?.message || "Error cargando reporte.");
    } finally {
      setLoading(false);
    }
  }

  // ============================
  // Exportar CSV
  // ============================
  function exportCSV() {
    if (rows.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }

    const header = Object.keys(rows[0]).join(",");
    const lines = rows.map((r) =>
      Object.values(r)
        .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
        .join(",")
    );

    const blob = new Blob([header + "\n" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_asistencia_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================
  // Estados de carga
  // ============================
  if (sessionLoading) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          Cargando tu sesión…
        </div>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No hay sesión activa. Inicia sesión nuevamente.
        </div>
      </div>
    );
  }

  // ============================
  // Render
  // ============================
  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Reportes de Asistencia</h1>
        <p className="text-xs text-gray-500">
          (Sesión resuelta directamente con Supabase; backend filtra por organización)
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* ====== FILTROS ====== */}
      <div className="flex flex-wrap gap-3 items-end border rounded-xl bg-white p-4 shadow-sm">
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

        <div>
          <label className="text-sm font-medium text-slate-700">
            Geocerca{" "}
            {loadingGeocercas ? <span className="text-xs text-gray-400">(cargando…)</span> : null}
          </label>
          <select
            value={selectedGeocercaName}
            onChange={(e) => setSelectedGeocercaName(e.target.value)}
            className="block border rounded-lg px-2 py-1 mt-1 min-w-[220px]"
            disabled={loadingGeocercas}
          >
            <option value="">Todas</option>
            {geocercas.map((g) => (
              <option key={g.id} value={g.nombre}>
                {g.nombre}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-400 mt-1">
            Filtro por nombre en <code>v_attendance_daily.geofence_name</code>
          </p>
        </div>

        <button
          onClick={loadReport}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {loading ? "Generando…" : "Generar"}
        </button>

        <button
          onClick={exportCSV}
          disabled={rows.length === 0}
          className="px-4 py-2 rounded-lg border hover:bg-slate-100 disabled:opacity-60"
        >
          Exportar CSV
        </button>
      </div>

      {/* ====== TABLA ====== */}
      <section className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No hay datos en el rango seleccionado.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-2 text-left">Fecha</th>
                <th className="p-2 text-left">Email</th>
                <th className="p-2 text-left">Geocerca</th>
                <th className="p-2 text-left">Entrada</th>
                <th className="p-2 text-left">Salida</th>
                <th className="p-2 text-left"># Marcajes</th>
                <th className="p-2 text-left">Dentro</th>
                <th className="p-2 text-left">Distancia (m)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={i}
                  className={`border-t hover:bg-slate-50 ${
                    i % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                  }`}
                >
                  <td className="p-2">{r.work_day ? String(r.work_day).slice(0, 10) : "—"}</td>
                  <td className="p-2">{r.email}</td>
                  <td className="p-2">{r.geofence_name}</td>
                  <td className="p-2">{r.first_check_in}</td>
                  <td className="p-2">{r.last_check_out}</td>
                  <td className="p-2 text-center">{r.total_marks}</td>
                  <td className="p-2 text-center">{r.inside_count}</td>
                  <td className="p-2 text-center">{r.avg_distance_m}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="text-[11px] text-gray-400">
        Si no hay filas, revisa que existan marcajes en <code>attendances</code> para la org del usuario autenticado (vista filtrada por <code>get_current_org_id()</code>).
      </div>
    </div>
  );
}
