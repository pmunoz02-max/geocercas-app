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
        <div className="p-4 text-sm text-gray-500">
          Cargando asignaciones…
        </div>
      ) : asignaciones.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">
          No hay asignaciones registradas con los filtros actuales.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">
                  Personal
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">
                  Geocerca
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">
                  Inicio
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">
                  Fin
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">
                  Frecuencia (min)
                </th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {asignaciones.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-gray-900">
                      {row.personal_nombre}
                    </div>
                    {row.personal_email && (
                      <div className="text-gray-500">
                        {row.personal_email}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="text-gray-800">
                      {row.geocerca_nombre}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.start_date || '—'}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.end_date || '—'}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.frecuencia_envio_sec
                      ? Math.round(row.frecuencia_envio_sec / 60)
                      : '-'}
                  </td>
                  <td className="px-3 py-2 align-top text-right space-x-2">
                    <button
                      type="button"
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      onClick={() => onEdit(row)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-red-600 hover:text-red-800"
                      onClick={() => onDelete(row)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
