// src/components/asignaciones/AsignacionesTable.jsx

/* eslint-disable react/prop-types */

export default function AsignacionesTable({
  asignaciones,
  loading,
  onEdit,
  onDelete,
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
        <h2 className="text-sm font-medium text-gray-700">
          Asignaciones vigentes
        </h2>
      </div>

      {loading ? (
        <div className="px-4 py-6 text-sm text-gray-500">
          Cargando asignaciones…
        </div>
      ) : !asignaciones || asignaciones.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-500">
          No hay asignaciones para los filtros seleccionados.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2 whitespace-nowrap">Persona</th>
                <th className="px-4 py-2 whitespace-nowrap">Geocerca</th>
                <th className="px-4 py-2 whitespace-nowrap">Actividad</th>
                <th className="px-4 py-2 whitespace-nowrap">Inicio</th>
                <th className="px-4 py-2 whitespace-nowrap">Fin</th>
                <th className="px-4 py-2 whitespace-nowrap">Freq (min)</th>
                <th className="px-4 py-2 whitespace-nowrap">Estado</th>
                <th className="px-4 py-2 whitespace-nowrap text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {asignaciones.map((row) => {
                const personaNombre =
                  row.personal?.nombre || row.personal_nombre || "";
                const personaApellido =
                  row.personal?.apellido || row.personal_apellido || "";
                const personaEmail =
                  row.personal?.email || row.personal_email || "";

                const geocercaNombre =
                  row.geocerca?.nombre || row.geocerca_nombre || "";
                const activityNombre =
                  row.activity?.nombre ||
                  row.activity?.name ||
                  row.activity_nombre ||
                  row.activity_name ||
                  "";

                const freqMin = row.frecuencia_envio_sec
                  ? Math.round(row.frecuencia_envio_sec / 60)
                  : "";

                const inicio = row.start_time
                  ? new Date(row.start_time).toLocaleString()
                  : "";
                const fin = row.end_time
                  ? new Date(row.end_time).toLocaleString()
                  : "";

                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {/* Persona */}
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-800">
                          {[personaNombre, personaApellido]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </span>
                        {personaEmail && (
                          <span className="text-xs text-gray-500">
                            {personaEmail}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Geocerca */}
                    <td className="px-4 py-2 whitespace-nowrap">
                      {geocercaNombre || "—"}
                    </td>

                    {/* Actividad */}
                    <td className="px-4 py-2 whitespace-nowrap">
                      {activityNombre || "—"}
                    </td>

                    {/* Inicio */}
                    <td className="px-4 py-2 whitespace-nowrap">{inicio}</td>

                    {/* Fin */}
                    <td className="px-4 py-2 whitespace-nowrap">{fin}</td>

                    {/* Frecuencia (min) */}
                    <td className="px-4 py-2 whitespace-nowrap text-center">
                      {freqMin || "—"}
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span
                        className={
                          row.status === "activa"
                            ? "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700"
                            : "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                        }
                      >
                        {row.status || "—"}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-2 whitespace-nowrap text-right">
                      <div className="inline-flex gap-2">
                        {onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(row)}
                            className="px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                          >
                            Editar
                          </button>
                        )}
                        {onDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(row.id)}
                            className="px-3 py-1 text-xs font-semibold rounded-md border border-red-400 bg-red-50 text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-1"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
