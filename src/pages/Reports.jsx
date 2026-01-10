// src/pages/Reports.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../context/AuthContext";

/**
 * Para filtros de fecha en columnas tipo DATE o TIMESTAMPTZ:
 * - startStr → "YYYY-MM-DD"
 * - endStr   → "YYYY-MM-DD"
 *
 * Devolvemos:
 *   { fromDate: "YYYY-MM-DD", toDateExclusive: "YYYY-MM-DD" }
 *
 * Y se aplica como:
 *   work_day >= fromDate
 *   work_day  < toDateExclusive
 *
 * Así el día "Hasta" se incluye completo.
 */
function buildDateRangeForDates(startStr, endStr) {
  let fromDate = null;
  let toDateExclusive = null;

  if (startStr) {
    fromDate = startStr;
  }

  if (endStr) {
    const d = new Date(endStr + "T00:00:00");
    if (!Number.isNaN(d.getTime())) {
      d.setDate(d.getDate() + 1);
      toDateExclusive = d.toISOString().slice(0, 10); // solo YYYY-MM-DD
    }
  }

  return { fromDate, toDateExclusive };
}

export default function Reports() {
  // ✅ Nuevo contrato AuthContext
  const { authReady, orgsReady, currentOrg } = useAuth();
  const orgId = currentOrg?.id || null;

  const [rows, setRows] = useState([]);
  const [geocercas, setGeocercas] = useState([]);
  const [selectedGeocercaName, setSelectedGeocercaName] = useState("");

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingGeocercas, setLoadingGeocercas] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const canRun = useMemo(() => !!authReady && !!orgsReady && !!orgId, [authReady, orgsReady, orgId]);

  // ============================
  // Cargar lista de geocercas por org
  // ============================
  useEffect(() => {
    if (!canRun) return;
    loadGeocercas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRun, orgId]);

  async function loadGeocercas() {
    setLoadingGeocercas(true);
    setErrorMsg("");

    try {
      // ✅ Tabla real usada en tu app: geocercas
      const { data, error } = await supabase
        .from("geocercas")
        .select("id, nombre")
        .eq("org_id", orgId)
        .order("nombre", { ascending: true });

      if (error) throw error;

      setGeocercas(data || []);
    } catch (e) {
      console.error("[Reports] loadGeocercas error:", e);
      setGeocercas([]);
      setErrorMsg(
        e?.message ||
          "Error cargando geocercas. Verifica permisos/RLS y que la tabla 'geocercas' exista."
      );
    } finally {
      setLoadingGeocercas(false);
    }
  }

  // ============================
  // Cargar reporte (multi-org)
  // ============================
  async function loadReport() {
    setErrorMsg("");
    setRows([]);
    setLoading(true);

    try {
      if (!orgId) {
        setErrorMsg("No hay organización activa.");
        return;
      }

      // Validación simple del rango
      if (start && end && start > end) {
        setErrorMsg('La fecha "Desde" no puede ser mayor que la fecha "Hasta".');
        return;
      }

      let query = supabase.from("v_attendance_daily").select("*");

      // ✅ Multi-tenant obligatorio (si la vista no tiene org_id, debemos corregirla en SQL)
      query = query.eq("org_id", orgId);

      const { fromDate, toDateExclusive } = buildDateRangeForDates(start, end);

      if (fromDate) query = query.gte("work_day", fromDate);
      if (toDateExclusive) query = query.lt("work_day", toDateExclusive);

      // Nota: tu vista filtra por "geofence_name" (legacy). Aquí usamos nombre de geocerca.
      if (selectedGeocercaName) query = query.eq("geofence_name", selectedGeocercaName);

      const { data, error } = await query.order("work_day", { ascending: false });

      if (error) {
        // Error típico si la vista no tiene org_id:
        // column "org_id" does not exist
        console.error("[Reports] loadReport error:", error);
        setErrorMsg(
          error.message ||
            "Error cargando reporte. Revisa que v_attendance_daily incluya org_id y que RLS permita lectura."
        );
        return;
      }

      setRows(data || []);
    } catch (e) {
      console.error("[Reports] loadReport exception:", e);
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
        .map((v) => `"${v ?? ""}"`)
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
  // Estados de carga correctos (nuevo contrato)
  // ============================
  if (!authReady || !orgsReady) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          Cargando tu sesión y organización actual…
        </div>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No hay organización activa para este usuario.
        </div>
      </div>
    );
  }

  // ============================
  // Renderizado
  // ============================
  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Reportes de Asistencia</h1>
        <p className="text-xs text-gray-500">
          Organización actual: <span className="font-medium">{currentOrg?.name || currentOrg?.id}</span>
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
            Geocerca {loadingGeocercas ? <span className="text-xs text-gray-400">(cargando…)</span> : null}
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
            (Filtro por nombre en la vista <code>v_attendance_daily.geofence_name</code>)
          </p>
        </div>

        <button
          onClick={loadReport}
          disabled={!orgId || loading}
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

      {/* Tip para el siguiente paso si falla org_id */}
      <div className="text-[11px] text-gray-400">
        Si ves un error tipo <code>column "org_id" does not exist</code>, hay que actualizar la vista{" "}
        <code>v_attendance_daily</code> para incluir <code>org_id</code> (multi-tenant real).
      </div>
    </div>
  );
}
