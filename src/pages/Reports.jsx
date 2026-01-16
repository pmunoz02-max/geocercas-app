// src/pages/Reports.jsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";

/**
 * Reportes alineado al AuthContext cookie-based
 * - NO usa supabase.auth
 * - NO maneja tokens
 * - Backend valida sesión por cookie HttpOnly
 */

export default function Reports() {
  const {
    ready,
    authenticated,
    currentOrg,
  } = useAuth();

  const [rows, setRows] = useState([]);
  const [geocercas, setGeocercas] = useState([]);
  const [selectedGeocercaName, setSelectedGeocercaName] = useState("");

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingGeocercas, setLoadingGeocercas] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const canRun = useMemo(
    () => ready && authenticated && !!currentOrg?.id,
    [ready, authenticated, currentOrg]
  );

  // ============================
  // Helpers API (cookie-based)
  // ============================
  async function apiGet(url) {
    const resp = await fetch(url, {
      method: "GET",
      credentials: "include", // 🔑 cookie HttpOnly
      headers: {
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(json?.error || `HTTP ${resp.status}`);
    }
    return json;
  }

  // ============================
  // Cargar geocercas
  // ============================
  useEffect(() => {
    if (!canRun) return;
    loadGeocercas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRun]);

  async function loadGeocercas() {
    setLoadingGeocercas(true);
    setErrorMsg("");

    try {
      const json = await apiGet("/api/reportes?action=geocercas");
      setGeocercas(json?.data || []);
    } catch (e) {
      console.error("[Reports] loadGeocercas:", e);
      setGeocercas([]);
      setErrorMsg(e.message || "Error cargando geocercas");
    } finally {
      setLoadingGeocercas(false);
    }
  }

  // ============================
  // Generar reporte
  // ============================
  async function loadReport() {
    setRows([]);
    setErrorMsg("");
    setLoading(true);

    try {
      if (start && end && start > end) {
        setErrorMsg('La fecha "Desde" no puede ser mayor que "Hasta".');
        return;
      }

      const params = new URLSearchParams();
      params.set("action", "attendance");
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      if (selectedGeocercaName) params.set("geocerca_name", selectedGeocercaName);

      const json = await apiGet(`/api/reportes?${params.toString()}`);
      setRows(json?.data || []);
    } catch (e) {
      console.error("[Reports] loadReport:", e);
      setErrorMsg(e.message || "Error generando reporte");
    } finally {
      setLoading(false);
    }
  }

  // ============================
  // Estados globales
  // ============================
  if (!ready) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="border rounded-md p-4 text-sm text-gray-600 bg-white">
          Cargando tu sesión…
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="border border-red-200 rounded-md p-4 text-sm text-red-700 bg-red-50">
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
      <h1 className="text-2xl font-bold">Reportes de Asistencia</h1>

      {errorMsg && (
        <div className="border border-red-200 bg-red-50 rounded-md p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end border rounded-xl bg-white p-4 shadow-sm">
        <div>
          <label className="text-sm">Desde</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="block border rounded px-2 py-1"
          />
        </div>

        <div>
          <label className="text-sm">Hasta</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="block border rounded px-2 py-1"
          />
        </div>

        <div>
          <label className="text-sm">
            Geocerca {loadingGeocercas && "(cargando…)"}
          </label>
          <select
            value={selectedGeocercaName}
            onChange={(e) => setSelectedGeocercaName(e.target.value)}
            className="block border rounded px-2 py-1 min-w-[200px]"
          >
            <option value="">Todas</option>
            {geocercas.map((g) => (
              <option key={g.id} value={g.nombre}>
                {g.nombre}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={loadReport}
          disabled={loading}
          className="px-4 py-2 rounded bg-emerald-700 text-white disabled:opacity-60"
        >
          {loading ? "Generando…" : "Generar"}
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto border rounded-xl bg-white">
        {loading ? (
          <p className="p-4 text-sm text-gray-500">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No hay datos.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left">Fecha</th>
                <th className="p-2 text-left">Email</th>
                <th className="p-2 text-left">Geocerca</th>
                <th className="p-2 text-left">Entrada</th>
                <th className="p-2 text-left">Salida</th>
                <th className="p-2 text-center">#</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{String(r.work_day).slice(0, 10)}</td>
                  <td className="p-2">{r.email}</td>
                  <td className="p-2">{r.geofence_name}</td>
                  <td className="p-2">{r.first_check_in}</td>
                  <td className="p-2">{r.last_check_out}</td>
                  <td className="p-2 text-center">{r.total_marks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
