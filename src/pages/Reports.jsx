// src/pages/Reports.jsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

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
  const [rows, setRows] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [selectedGeofence, setSelectedGeofence] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(false);

  // ============================
  // Cargar lista de geocercas
  // ============================
  useEffect(() => {
    loadGeofences();
  }, []);

  async function loadGeofences() {
    const { data, error } = await supabase
      .from("geofences")
      .select("id, name")
      .eq("active", true)
      .order("name", { ascending: true });
    if (error) {
      console.error(error);
      alert("Error cargando geocercas");
    } else {
      setGeofences(data || []);
    }
  }

  // ============================
  // Cargar reporte
  // ============================
  async function loadReport() {
    setLoading(true);

    // Validación simple del rango
    if (start && end && start > end) {
      alert('La fecha "Desde" no puede ser mayor que la fecha "Hasta".');
      setRows([]);
      setLoading(false);
      return;
    }

    let query = supabase.from("v_attendance_daily").select("*");

    const { fromDate, toDateExclusive } = buildDateRangeForDates(start, end);

    if (fromDate) {
      query = query.gte("work_day", fromDate);
    }
    if (toDateExclusive) {
      query = query.lt("work_day", toDateExclusive);
    }

    if (selectedGeofence)
      query = query.eq("geofence_name", selectedGeofence);

    const { data, error } = await query.order("work_day", {
      ascending: false,
    });

    if (error) {
      console.error(error);
      alert("Error cargando reporte: " + error.message);
    } else {
      setRows(data || []);
    }
    setLoading(false);
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
    a.download = `reporte_asistencia_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
  }

  // ============================
  // Renderizado
  // ============================
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reportes de Asistencia</h1>

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
          <label className="text-sm font-medium text-slate-700">Geocerca</label>
          <select
            value={selectedGeofence}
            onChange={(e) => setSelectedGeofence(e.target.value)}
            className="block border rounded-lg px-2 py-1 mt-1"
          >
            <option value="">Todas</option>
            {geofences.map((g) => (
              <option key={g.id} value={g.name}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={loadReport}
          className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
        >
          Generar
        </button>
        <button
          onClick={exportCSV}
          className="px-4 py-2 rounded-lg border hover:bg-slate-100"
        >
          Exportar CSV
        </button>
      </div>

      {/* ====== TABLA ====== */}
      <section className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">
            No hay datos en el rango seleccionado.
          </p>
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
                  <td className="p-2">
                    {r.work_day ? r.work_day.slice(0, 10) : "—"}
                  </td>
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
    </div>
  );
}
