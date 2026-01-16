// src/components/asignaciones/AsignacionesTable.jsx

/* eslint-disable react/prop-types */
import { useTranslation } from "react-i18next";

// Helper para formatear fechas en HORA LOCAL del navegador
function formatDateTimeLocal(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

export default function AsignacionesTable({
  asignaciones,
  loading,
  onEdit,
  onDelete,
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
        <h2 className="text-sm font-medium text-gray-700">
          {t("asignaciones.table.title", {
            defaultValue: "Active assignments",
          })}
        </h2>
      </div>

      {loading ? (
        <div className="px-4 py-6 text-sm text-gray-500">
          {t("asignaciones.messages.loadingData", {
            defaultValue: "Loading assignments…",
          })}
        </div>
      ) : !asignaciones || asignaciones.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-500">
          {t("asignaciones.table.noResults", {
            defaultValue: "No assignments for the selected filters.",
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2 whitespace-nowrap">
                  {t("asignaciones.table.person")}
                </th>
                <th className="px-4 py-2 whitespace-nowrap">
                  {t("asignaciones.table.geofence")}
                </th>
                <th className="px-4 py-2 whitespace-nowrap">
                  {t("asignaciones.table.activity")}
                </th>
                <th className="px-4 py-2 whitespace-nowrap">
                  {t("asignaciones.table.start")}
                </th>
                <th className="px-4 py-2 whitespace-nowrap">
                  {t("asignaciones.table.end")}
                </th>
                <th className="px-4 py-2 whitespace-nowrap">
                  {t("asignaciones.table.frequency", {
                    defaultValue: "Freq (min)",
                  })}
                </th>
                <th className="px-4 py-2 whitespace-nowrap">
                  {t("asignaciones.table.status")}
                </th>
                <th className="px-4 py-2 whitespace-nowrap text-right">
                  {t("asignaciones.table.actions")}
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

                const inicio = formatDateTimeLocal(row.start_time);
                const fin = formatDateTimeLocal(row.end_time);

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

                    {/* Frecuencia */}
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
                        {row.status === "activa"
                          ? t("asignaciones.actions.activate", {
                              defaultValue: "Active",
                            })
                          : t("asignaciones.actions.deactivate", {
                              defaultValue: "Inactive",
                            })}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-2 whitespace-nowrap text-right">
                      <div className="inline-flex gap-2">
                        {onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(row)}
                            className="px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
                          >
                            {t("asignaciones.actions.edit")}
                          </button>
                        )}
                        {onDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(row.id)}
                            className="px-3 py-1 text-xs font-semibold rounded-md border border-red-400 bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            {t("asignaciones.actions.delete")}
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
