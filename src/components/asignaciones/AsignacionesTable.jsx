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

// Helper para formatear DATE (YYYY-MM-DD) a local
function formatDateLocal(value) {
  if (!value) return "";
  try {
    // Si viene "YYYY-MM-DD", forzamos medianoche local para que no cambie por TZ
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
      return dt.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
    }
    const dt = new Date(value);
    if (isNaN(dt.getTime())) return String(value);
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return String(value);
  }
}

function getStatus(row) {
  return row?.status || row?.estado || row?.state || row?.status_asignacion || "";
}

function getInicio(row) {
  // Soporta: inicio/enriched, start_time, start_date, period (daterange), etc.
  if (row?.inicio) return formatDateTimeLocal(row.inicio);
  if (row?.start_time) return formatDateTimeLocal(row.start_time);
  if (row?.start_date) return formatDateLocal(row.start_date);

  // Si usas "period" tipo daterange, a veces llega como string "[2026-01-01,2026-01-31)"
  if (typeof row?.period === "string" && row.period.includes(",")) {
    const left = row.period.split(",")[0]?.replace("[", "")?.trim();
    if (left) return formatDateLocal(left);
  }
  return "";
}

function getFin(row) {
  if (row?.fin) return formatDateTimeLocal(row.fin);
  if (row?.end_time) return formatDateTimeLocal(row.end_time);
  if (row?.end_date) return formatDateLocal(row.end_date);

  if (typeof row?.period === "string" && row.period.includes(",")) {
    const right = row.period.split(",")[1]?.replace(")", "")?.replace("]", "")?.trim();
    if (right) return formatDateLocal(right);
  }
  return "";
}

export default function AsignacionesTable({ asignaciones, loading, onEdit, onDelete }) {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
        <h2 className="text-sm font-medium text-gray-700">
          {t("asignaciones.table.title", { defaultValue: "Listado de asignaciones" })}
        </h2>
      </div>

      {loading ? (
        <div className="px-4 py-6 text-sm text-gray-500">
          {t("asignaciones.messages.loadingData", { defaultValue: "Cargando asignaciones…" })}
        </div>
      ) : !asignaciones || asignaciones.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-500">
          {t("asignaciones.table.noResults", { defaultValue: "No hay asignaciones para los filtros seleccionados." })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2 whitespace-nowrap">{t("asignaciones.table.person", { defaultValue: "Persona" })}</th>
                <th className="px-4 py-2 whitespace-nowrap">{t("asignaciones.table.geofence", { defaultValue: "Geocerca" })}</th>
                <th className="px-4 py-2 whitespace-nowrap">{t("asignaciones.table.activity", { defaultValue: "Actividad" })}</th>
                <th className="px-4 py-2 whitespace-nowrap">{t("asignaciones.table.start", { defaultValue: "Inicio" })}</th>
                <th className="px-4 py-2 whitespace-nowrap">{t("asignaciones.table.end", { defaultValue: "Fin" })}</th>
                <th className="px-4 py-2 whitespace-nowrap">
                  {t("asignaciones.table.frequency", { defaultValue: "Freq (min)" })}
                </th>
                <th className="px-4 py-2 whitespace-nowrap">{t("asignaciones.table.status", { defaultValue: "Estado" })}</th>
                <th className="px-4 py-2 whitespace-nowrap text-right">{t("asignaciones.table.actions", { defaultValue: "Acciones" })}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {asignaciones.map((row) => {
                // Persona
                const personaNombre = row.personal?.nombre || row.personal_nombre || row.nombre || "";
                const personaApellido = row.personal?.apellido || row.personal_apellido || row.apellido || "";
                const personaEmail = row.personal?.email || row.personal_email || row.email || "";

                // Geocerca
                const geocercaNombre =
                  row.geocerca?.nombre ||
                  row.geocerca_nombre ||
                  row.geofence_name ||
                  row.nombre_geocerca ||
                  "";

                // Actividad
                const activityNombre =
                  row.activity?.name ||
                  row.activity?.nombre ||
                  row.activity_name ||
                  row.activity_nombre ||
                  row.actividad ||
                  "";

                // Frecuencia
                const freqMin = row.frecuencia_envio_sec ? Math.round(row.frecuencia_envio_sec / 60) : "";

                // Fechas robustas (soporta time/date/enriched)
                const inicio = getInicio(row);
                const fin = getFin(row);

                // Estado robusto
                const st = getStatus(row);

                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {/* Persona */}
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-800">
                          {[personaNombre, personaApellido].filter(Boolean).join(" ") || "—"}
                        </span>
                        {personaEmail && <span className="text-xs text-gray-500">{personaEmail}</span>}
                      </div>
                    </td>

                    {/* Geocerca */}
                    <td className="px-4 py-2 whitespace-nowrap">{geocercaNombre || "—"}</td>

                    {/* Actividad */}
                    <td className="px-4 py-2 whitespace-nowrap">{activityNombre || "—"}</td>

                    {/* Inicio */}
                    <td className="px-4 py-2 whitespace-nowrap">{inicio || "—"}</td>

                    {/* Fin */}
                    <td className="px-4 py-2 whitespace-nowrap">{fin || "—"}</td>

                    {/* Frecuencia */}
                    <td className="px-4 py-2 whitespace-nowrap text-center">{freqMin || "—"}</td>

                    {/* Estado */}
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span
                        className={
                          st === "activa"
                            ? "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700"
                            : "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                        }
                      >
                        {st === "activa"
                          ? t("asignaciones.actions.activate", { defaultValue: "Activa" })
                          : t("asignaciones.actions.deactivate", { defaultValue: "Inactiva" })}
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
                            {t("asignaciones.actions.edit", { defaultValue: "Editar" })}
                          </button>
                        )}
                        {onDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(row.id)}
                            className="px-3 py-1 text-xs font-semibold rounded-md border border-red-400 bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            {t("asignaciones.actions.delete", { defaultValue: "Eliminar" })}
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
