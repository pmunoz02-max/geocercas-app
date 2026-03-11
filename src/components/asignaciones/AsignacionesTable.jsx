// src/components/asignaciones/AsignacionesTable.jsx
// DEFINITIVO (preview): renderer estable basado en IDs + catálogos canónicos.
// - NO depende de shapes embebidos en /api/asignaciones
// - Tolerante a legacy (geocerca_id nullable, múltiples campos de persona/actividad)
// - Sin botón "Invitar tracker" en tabla

/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
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

function str(v) {
  return v == null ? "" : String(v);
}

function normalizePersonRow(p) {
  const id = p?.id || p?.personal_id || p?.org_people_id || p?.user_id || p?.uuid || "";
  const label =
    p?.label ||
    p?.display_name ||
    p?.full_name ||
    [p?.nombre || p?.first_name, p?.apellido || p?.last_name].filter(Boolean).join(" ") ||
    p?.email ||
    id;
  const email = p?.email || "";
  return { id: str(id).trim(), label: str(label).trim(), email: str(email).trim() };
}

function normalizeGeofenceRow(g) {
  const id = g?.id || g?.geofence_id || g?.uuid || "";
  const nombre = g?.nombre || g?.name || g?.label || "";
  return { id: str(id).trim(), nombre: str(nombre).trim() || str(id).trim() };
}

function normalizeActivityRow(a) {
  const id = a?.id || a?.activity_id || a?.uuid || "";
  const nombre = a?.nombre || a?.name || a?.label || a?.titulo || a?.title || "";
  return { id: str(id).trim(), nombre: str(nombre).trim() || str(id).trim() };
}

function pickPersonId(row) {
  return (
    row?.personal_id ||
    row?.person_id ||
    row?.org_people_id ||
    row?.user_id ||
    row?.uuid ||
    row?.personal?.id ||
    row?.person?.id ||
    row?.personalId ||
    ""
  );
}

function pickGeofenceId(row) {
  return (
    row?.geofence_id ||
    row?.geocerca_id ||
    row?.geofence?.id ||
    row?.geocerca?.id ||
    row?.geofenceId ||
    row?.geocercaId ||
    ""
  );
}

function pickActivityId(row) {
  return (
    row?.activity_id ||
    row?.actividad_id ||
    row?.activity?.id ||
    row?.actividad?.id ||
    row?.activityId ||
    ""
  );
}

export default function AsignacionesTable({
  asignaciones,
  loading,
  onEdit,
  onDelete,
  people,
  geofences,
  activities,
}) {
  const { t } = useTranslation();

  const peopleById = useMemo(() => {
    const m = new Map();
    (Array.isArray(people) ? people : []).forEach((p) => {
      const n = normalizePersonRow(p);
      if (n.id) m.set(n.id, n);
    });
    return m;
  }, [people]);

  const geofencesById = useMemo(() => {
    const m = new Map();
    (Array.isArray(geofences) ? geofences : []).forEach((g) => {
      const n = normalizeGeofenceRow(g);
      if (n.id) m.set(n.id, n);
    });
    return m;
  }, [geofences]);

  const activitiesById = useMemo(() => {
    const m = new Map();
    (Array.isArray(activities) ? activities : []).forEach((a) => {
      const n = normalizeActivityRow(a);
      if (n.id) m.set(n.id, n);
    });
    return m;
  }, [activities]);

  const resolvePerson = (row) => {
    const id = str(pickPersonId(row)).trim();
    const fromCatalog = id ? peopleById.get(id) : null;

    const personaNombre = row?.personal?.nombre || row?.personal_nombre || row?.person_name || "";
    const personaApellido = row?.personal?.apellido || row?.personal_apellido || row?.person_lastname || "";
    const personaEmail = row?.personal?.email || row?.personal_email || row?.person_email || "";
    const fallbackLabel = [personaNombre, personaApellido].filter(Boolean).join(" ").trim();

    return {
      id,
      label: fromCatalog?.label || fallbackLabel || (id ? id : ""),
      email: fromCatalog?.email || str(personaEmail).trim(),
    };
  };

  const resolveGeofenceLabel = (row) => {
    const id = str(pickGeofenceId(row)).trim();
    const fromCatalog = id ? geofencesById.get(id) : null;
    const legacyName =
      row?.geocerca?.nombre ||
      row?.geocerca_nombre ||
      row?.geofence?.name ||
      row?.geofence_name ||
      row?.geofence?.nombre ||
      row?.geofence_nombre ||
      "";
    return fromCatalog?.nombre || str(legacyName).trim() || (id ? id : "");
  };

  const resolveActivityLabel = (row) => {
    const id = str(pickActivityId(row)).trim();
    const fromCatalog = id ? activitiesById.get(id) : null;
    const legacyName =
      row?.activity?.nombre ||
      row?.activity?.name ||
      row?.activity_nombre ||
      row?.activity_name ||
      row?.actividad?.nombre ||
      row?.actividad?.name ||
      row?.actividad_nombre ||
      row?.actividad_name ||
      "";
    return fromCatalog?.nombre || str(legacyName).trim() || (id ? id : "");
  };

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
                const person = resolvePerson(row);
                const geofenceLabel = resolveGeofenceLabel(row);
                const activityLabel = resolveActivityLabel(row);

                const freqMin = row.frecuencia_envio_sec ? Math.round(row.frecuencia_envio_sec / 60) : "";
                const inicio = formatDateTimeLocal(row.start_time);
                const fin = formatDateTimeLocal(row.end_time);
                const estado = row.status || row.estado;

                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap align-top">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900">{person?.label || "—"}</span>
                        {person?.email ? (
                          <span className="text-xs font-medium text-gray-700">{person.email}</span>
                        ) : null}
                      </div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900 align-top">
                      {geofenceLabel || "—"}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900 align-top">
                      {activityLabel || "—"}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900 align-top">
                      {inicio || "—"}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900 align-top">
                      {fin || "—"}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-center font-semibold text-gray-900 align-top">
                      {freqMin || "—"}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap align-top">
                      <span
                        className={
                          estado === "activa"
                            ? "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200"
                            : "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200"
                        }
                      >
                        {estado === "activa"
                          ? t("asignaciones.actions.activate", { defaultValue: "Active" })
                          : t("asignaciones.actions.deactivate", { defaultValue: "Inactive" })}
                      </span>
                    </td>

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