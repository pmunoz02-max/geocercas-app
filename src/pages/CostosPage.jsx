// src/pages/CostosPage.jsx
import React, { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { getCostosAsignaciones } from "../lib/costosApi";

function formatDateInput(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// Calcula fecha hoy y hace 7 días
function getDefaultRange() {
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);

  return {
    from: formatDateInput(sevenDaysAgo),
    to: formatDateInput(today),
  };
}

export default function CostosPage() {
  const { user } = useAuth();
  const [dateFrom, setDateFrom] = useState(getDefaultRange().from);
  const [dateTo, setDateTo] = useState(getDefaultRange().to);
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState([]);

  const fetchReportes = async () => {
    try {
      setLoading(true);
      const data = await getCostosAsignaciones({
        date_from: dateFrom,
        date_to: dateTo,
      });
      setResultados(data || []);
    } catch (error) {
      console.error("Error cargando reportes:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalGeneral = useMemo(() => {
    return resultados.reduce((acc, item) => acc + (item.costo_total || 0), 0);
  }, [resultados]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* 🔥 CAMBIO DE TÍTULO */}
      <h1 className="text-3xl font-semibold text-gray-800 mb-6">
        Reportes
      </h1>

      {/* Filtros */}
      <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Filtros
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Desde
            </label>
            <input
              type="date"
              className="w-full rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Hasta
            </label>
            <input
              type="date"
              className="w-full rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <button
            onClick={fetchReportes}
            disabled={loading}
            className="h-10 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition"
          >
            {loading ? "Cargando..." : "Generar"}
          </button>
        </div>
      </div>

      {/* Tabla de resultados */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="p-2 text-left">Persona</th>
              <th className="p-2 text-left">Actividad</th>
              <th className="p-2 text-left">Horas</th>
              <th className="p-2 text-left">Tarifa</th>
              <th className="p-2 text-left">Costo Total</th>
            </tr>
          </thead>

          <tbody>
            {resultados.length === 0 && (
              <tr>
                <td
                  colSpan="5"
                  className="text-center text-gray-500 py-4"
                >
                  No hay datos para este rango.
                </td>
              </tr>
            )}

            {resultados.map((row, idx) => (
              <tr key={idx} className="border-b hover:bg-gray-50">
                <td className="p-2">{row.nombre_personal}</td>
                <td className="p-2">{row.nombre_actividad}</td>
                <td className="p-2">{row.horas_trabajadas?.toFixed(2)}</td>
                <td className="p-2">${row.hourly_rate}</td>
                <td className="p-2 font-semibold">
                  ${row.costo_total?.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="p-4 text-right font-semibold bg-gray-50">
          Total General: ${totalGeneral.toFixed(2)}
        </div>
      </div>
    </div>
  );
}
