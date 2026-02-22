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

export default function AsignacionesTable({ asignaciones, loading, onEdit, onDelete }) {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-sm font-semibold text-gray-900">
          {t("asignaciones.table.title", { defaultValue: "Active assignments" })}
        </h2>
      </div>

      {loading ? (
        <div className="px-4 py-6 text-sm text-gray-700">
          {t("asignaciones.messages.loadingData", { defaultValue: "Loading assignments…" })}
        </div>
      ) : !asignaciones || asignaciones.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-700">
          {t("asignaciones.table.noResults", {
            defaultValue: "No assignments for the selected filters.",
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-[12px] font-semibold text-gray-800 uppercase tracking-wide">
                <th className="px-4 py-3 whitespace-nowrap border-b border-gray-200">
                  {t("asignaciones.table.person")}
                </th>
                <th className="px-4 py-3 whitespace-nowrap border-b border-gray-200">
                  {t("asignaciones.table.geofence")}
                </th>
                <th className="px-4 py-3 whitespace-nowrap border-b border-gray-200">
                  {t("asignaciones.table.activity")}
                </th>
                <th className="px-4 py-3 whitespace-nowrap border-b border-gray-200">
                  {t("asignaciones.table.start")}
                </th>
                <th className="px-4 py-3 whitespace-nowrap border-b border-gray-200">
                  {t("asignaciones.table.end")}
                </th>
                <th className="px-4 py-3 whitespace-nowrap border-b border-gray-200 text-center">
                  {t("asignaciones.table.frequency", { defaultValue: "Freq (min)" })}
                </th>
                <th className="px-4 py-3 whitespace-nowrap border-b border-gray-200">
                  {t("asignaciones.table.status")}
                </th>
                <th className="px-4 py-3 whitespace-nowrap border-b border-gray-200 text-right">
                  {t("asignaciones.table.actions")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {asignaciones.map((row) => {
                const personaNombre = row.personal?.nombre || row.personal_nombre || "";
                const personaApellido = row.personal?.apellido || row.personal_apellido || "";
                const personaEmail = row.personal?.email || row.personal_email || "";

                const geocercaNombre = row.geocerca?.nombre || row.geocerca_nombre || "";
                const activityNombre =
                  row.activity?.nombre ||
                  row.activity?.name ||
                  row.activity_nombre ||
                  row.activity_name ||
                  "";

                const freqMin = row.frecuencia_envio_sec ? Math.round(row.frecuencia_envio_sec / 60) : "";

                const inicio = formatDateTimeLocal(row.start_time);
                const fin = formatDateTimeLocal(row.end_time);

                const personaFull =
                  [personaNombre, personaApellido].filter(Boolean).join(" ") || "—";

                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {/* Persona */}
                    <td className="px-4 py-3 whitespace-nowrap align-top">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900">{personaFull}</span>
                        {personaEmail ? (
                          <span className="text-xs font-medium text-gray-700">{personaEmail}</span>
                        ) : null}
                      </div>
                    </td>

                    {/* Geocerca */}
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900 align-top">
                      {geocercaNombre || "—"}
                    </td>

                    {/* Actividad */}
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900 align-top">
                      {activityNombre || "—"}
                    </td>

                    {/* Inicio */}
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900 align-top">
                      {inicio || "—"}
                    </td>

                    {/* Fin */}
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900 align-top">
                      {fin || "—"}
                    </td>

                    {/* Frecuencia */}
                    <td className="px-4 py-3 whitespace-nowrap text-center font-semibold text-gray-900 align-top">
                      {freqMin || "—"}
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-3 whitespace-nowrap align-top">
                      <span
                        className={
                          row.status === "activa"
                            ? "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200"
                            : "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200"
                        }
                      >
                        {row.status === "activa"
                          ? t("asignaciones.actions.activate", { defaultValue: "Active" })
                          : t("asignaciones.actions.deactivate", { defaultValue: "Inactive" })}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3 whitespace-nowrap text-right align-top">
                      <div className="inline-flex gap-2">
                        {onEdit ? (
                          <button
                            type="button"
                            onClick={() => onEdit(row)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {t("asignaciones.actions.edit")}
                          </button>
                        ) : null}

                        {onDelete ? (
                          <button
                            type="button"
                            onClick={() => onDelete(row.id)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-red-400 bg-red-50 text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400"
                          >
                            {t("asignaciones.actions.delete")}
                          </button>
                        ) : null}
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