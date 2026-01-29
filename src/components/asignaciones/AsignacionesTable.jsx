// src/components/asignaciones/AsignacionesTable.jsx
// Table UNIVERSAL: soporta shapes nuevos (joins) y legacy (strings)
// Enero 2026 — Fix permanente para render (incluye fallbacks a IDs para evitar columnas vacías)

import React, { useMemo } from "react";

function safeText(v) {
  if (v == null) return "";
  const s = String(v).trim();
  return s;
}

function shortId(id) {
  const s = safeText(id);
  if (!s) return "";
  return s.length > 10 ? `${s.slice(0, 8)}…` : s;
}

function formatDateTime(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
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

function getPersonaLabel(row) {
  const p = row?.personal || row?.persona || null;

  const nombreBase =
    p?.nombre ||
    p?.name ||
    row?.personal_nombre ||
    row?.persona_nombre ||
    row?.nombre ||
    "";

  const apellido = p?.apellido || row?.apellido || "";
  const email = p?.email || row?.personal_email || row?.email || "";

  const fullName = safeText(`${nombreBase} ${apellido}`);
  const nombre = fullName || safeText(email) || safeText(row?.personal_id) || "—";

  return { nombre, email: safeText(email) };
}

function getGeocercaLabel(row) {
  const nombre =
    row?.geocerca?.nombre ||
    row?.geocerca_nombre ||
    row?.geofence?.nombre ||
    row?.geofence_name ||
    row?.geocercaName ||
    row?.geofenceName ||
    "";

  // Fallback: si no hay nombre, mostrar el ID
  return safeText(nombre) || shortId(row?.geocerca_id) || shortId(row?.geofence_id) || shortId(row?.geocercaId) || "";
}

function getActividadLabel(row) {
  const nombre =
    row?.activity?.name ||
    row?.activity_name ||
    row?.actividad?.name ||
    row?.actividad_name ||
    row?.activityName ||
    row?.actividadName ||
    "";

  // Fallback: si no hay name, mostrar el ID
  return safeText(nombre) || shortId(row?.activity_id) || shortId(row?.actividad_id) || shortId(row?.activityId) || "";
}

function getStart(row) {
  return (
    row?.start_time ||
    row?.inicio ||
    row?.start ||
    row?.start_date ||
    row?.fecha_inicio ||
    ""
  );
}

function getEnd(row) {
  return (
    row?.end_time ||
    row?.fin ||
    row?.end ||
    row?.end_date ||
    row?.fecha_fin ||
    ""
  );
}

function getFreqMin(row) {
  if (row?.frecuencia_envio_sec != null) {
    const n = Number(row.frecuencia_envio_sec);
    if (Number.isFinite(n) && n > 0) return Math.round(n / 60);
  }
  if (row?.frecuencia_envio_min != null) {
    const n = Number(row.frecuencia_envio_min);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (row?.freq_min != null) {
    const n = Number(row.freq_min);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return "";
}

function StatusPill({ status }) {
  const s = safeText(status).toLowerCase();
  const isActive = s === "activa" || s === "active" || s === "on";
  return (
    <span
      className={
        "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold " +
        (isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800")
      }
    >
      {isActive ? "Activa" : "Inactiva"}
    </span>
  );
}

export default function AsignacionesTable({
  asignaciones,
  loading,
  onEdit,
  onDelete,
}) {
  const rows = useMemo(
    () => (Array.isArray(asignaciones) ? asignaciones : []),
    [asignaciones]
  );

  return (
    <div className="w-full">
      <div className="border rounded-lg bg-white overflow-x-auto">
        <div className="px-4 py-3 border-b">
          <h3 className="font-semibold">Listado de asignaciones</h3>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-sm text-gray-600">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-600">
            No hay asignaciones.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Persona</th>
                <th className="px-4 py-3 font-semibold">Geocerca</th>
                <th className="px-4 py-3 font-semibold">Actividad</th>
                <th className="px-4 py-3 font-semibold">Inicio</th>
                <th className="px-4 py-3 font-semibold">Fin</th>
                <th className="px-4 py-3 font-semibold">Freq (min)</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {rows.map((row) => {
                const persona = getPersonaLabel(row);
                const geocerca = getGeocercaLabel(row);
                const actividad = getActividadLabel(row);
                const inicio = getStart(row);
                const fin = getEnd(row);
                const freqMin = getFreqMin(row);
                const status = row?.status || row?.estado || "inactiva";

                const key =
                  row?.id ||
                  `${row?.personal_id || "p"}-${row?.geocerca_id || "g"}-${
                    row?.activity_id || "a"
                  }`;

                return (
                  <tr key={key}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">
                        {persona.nombre}
                      </div>
                      {persona.email ? (
                        <div className="text-xs text-gray-500">
                          {persona.email}
                        </div>
                      ) : null}
                    </td>

                    <td className="px-4 py-3">
                      {geocerca ? (
                        geocerca
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {actividad ? (
                        actividad
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {inicio ? (
                        formatDateTime(inicio)
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {fin ? (
                        formatDateTime(fin)
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {freqMin !== "" ? (
                        freqMin
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <StatusPill status={status} />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
                          onClick={() => onEdit?.(row)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="text-red-600 hover:underline px-2"
                          onClick={() => onDelete?.(row.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
