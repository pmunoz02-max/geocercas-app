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
  const { user, currentOrg, currentRole } = useAuth();
  const [dateFrom, setDateFrom] = useState(getDefaultRange().from);
  const [dateTo, setDateTo] = useState(getDefaultRange().to);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [rows, setRows] = useState([]);

  const isAdminOrOwner = currentRole === "owner" || currentRole === "admin";

  if (!user || !currentOrg) {
    return (
      <div className="p-4">
        <p>Debes iniciar sesión y tener una organización seleccionada.</p>
      </div>
    );
  }

  async function handleLoad(e) {
    if (e) e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      if (!dateFrom || !dateTo) {
        setErrorMsg("Debes seleccionar fecha inicio y fin.");
        setLoading(false);
        return;
      }

      const fromDate = new Date(`${dateFrom}T00:00:00`);
      const toDate = new Date(`${dateTo}T23:59:59`);

      if (fromDate > toDate) {
        setErrorMsg("La fecha inicio no puede ser mayor que la fecha fin.");
        setLoading(false);
        return;
      }

      const { data, error } = await getCostosAsignaciones({
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      });

      if (error) {
        console.error("[CostosPage] getCostosAsignaciones error:", error);
        setErrorMsg(error.message || "Error cargando costos.");
      } else {
        setRows(data || []);
      }
    } catch (err) {
      console.error("[CostosPage] handleLoad exception:", err);
      setErrorMsg(err.message || "Error inesperado cargando costos.");
    } finally {
      setLoading(false);
    }
  }

  // Totales por moneda
  const totalsByCurrency = useMemo(() => {
    const acc = {};
    for (const r of rows) {
      const curr = r.currency_code || "SIN_MONEDA";
      acc[curr] = (acc[curr] || 0) + Number(r.costo || 0);
    }
    return acc;
  }, [rows]);

  // Totales por actividad + moneda
  const totalsByActivity = useMemo(() => {
    const acc = {};
    for (const r of rows) {
      const key = `${r.activity_name || "Sin actividad"}|${
        r.currency_code || "SIN_MONEDA"
      }`;
      acc[key] = (acc[key] || 0) + Number(r.costo || 0);
    }
    return acc;
  }, [rows]);

  // Totales por persona + moneda
  const totalsByPersona = useMemo(() => {
    const acc = {};
    for (const r of rows) {
      const key = `${r.persona_nombre || "Sin persona"}|${
        r.currency_code || "SIN_MONEDA"
      }`;
      acc[key] = (acc[key] || 0) + Number(r.costo || 0);
    }
    return acc;
  }, [rows]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Reporte de costos</h1>
      <p className="text-sm text-gray-500 mb-4">
        Calcula costos aproximados por actividad, geocerca y persona, usando la
        tarifa horaria definida en cada actividad y las fechas de las
        asignaciones.
      </p>

      {!isAdminOrOwner && (
        <div className="mb-4 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 text-xs">
          Tu rol es <strong>{currentRole}</strong>. Puedes ver este reporte,
          pero solo los owners/admins deberían usarlo para decisiones de
          facturación.
        </div>
      )}

      {/* Filtros */}
      <form
        onSubmit={handleLoad}
        className="mb-6 bg-white shadow-sm rounded-lg p-4 border border-gray-100 space-y-3"
      >
        <h2 className="text-sm font-medium text-gray-700 mb-1">
          Filtros de rango de fechas
        </h2>
        <p className="text-xs text-gray-500 mb-2">
          El cálculo usa únicamente el tiempo de las asignaciones que cae dentro
          del rango seleccionado.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Desde
            </label>
            <input
              type="date"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Calculando..." : "Calcular costos"}
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
              onClick={() => {
                const def = getDefaultRange();
                setDateFrom(def.from);
                setDateTo(def.to);
              }}
              disabled={loading}
            >
              Últimos 7 días
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-2 rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
            {errorMsg}
          </div>
        )}
      </form>

      {/* Resumen de totales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white shadow-sm rounded-lg border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Totales por moneda
          </h2>
          {rows.length === 0 ? (
            <p className="text-xs text-gray-500">
              No hay datos en el rango seleccionado.
            </p>
          ) : (
            <ul className="text-sm space-y-1">
              {Object.entries(totalsByCurrency).map(([curr, total]) => (
                <li key={curr} className="flex justify-between">
                  <span className="text-gray-600">{curr}</span>
                  <span className="font-semibold">
                    {total.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white shadow-sm rounded-lg border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Totales por actividad
          </h2>
          {rows.length === 0 ? (
            <p className="text-xs text-gray-500">
              No hay datos en el rango seleccionado.
            </p>
          ) : (
            <ul className="text-xs space-y-1 max-h-56 overflow-y-auto">
              {Object.entries(totalsByActivity).map(([key, total]) => {
                const [name, curr] = key.split("|");
                return (
                  <li
                    key={key}
                    className="flex justify-between gap-2 border-b border-gray-100 pb-1"
                  >
                    <span className="text-gray-600 truncate">{name}</span>
                    <span className="font-semibold whitespace-nowrap">
                      {curr}{" "}
                      {total.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="bg-white shadow-sm rounded-lg border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Totales por persona
          </h2>
          {rows.length === 0 ? (
            <p className="text-xs text-gray-500">
              No hay datos en el rango seleccionado.
            </p>
          ) : (
            <ul className="text-xs space-y-1 max-h-56 overflow-y-auto">
              {Object.entries(totalsByPersona).map(([key, total]) => {
                const [name, curr] = key.split("|");
                return (
                  <li
                    key={key}
                    className="flex justify-between gap-2 border-b border-gray-100 pb-1"
                  >
                    <span className="text-gray-600 truncate">
                      {name || "Sin persona"}
                    </span>
                    <span className="font-semibold whitespace-nowrap">
                      {curr}{" "}
                      {total.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Tabla detalle */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-sm font-medium text-gray-700">
            Detalle de asignaciones con costo
          </h2>
          <span className="text-xs text-gray-400">
            {rows.length} registro(s)
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            No hay asignaciones con actividad y fechas en el rango seleccionado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">
                    Persona
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">
                    Geocerca
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">
                    Actividad
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">
                    Inicio (rango)
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">
                    Fin (rango)
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">
                    Horas
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">
                    Costo
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">
                    Moneda
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.asignacion_id}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.persona_nombre || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.geocerca_nombre || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.activity_name || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.start_time
                        ? new Date(r.start_time).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.end_time
                        ? new Date(r.end_time).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {Number(r.horas_trabajadas || 0).toLocaleString(
                        undefined,
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {Number(r.costo || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {r.currency_code || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
