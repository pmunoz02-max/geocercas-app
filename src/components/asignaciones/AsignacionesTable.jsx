// src/components/asignaciones/AsignacionesTable.jsx
// v4 — Enero 2026
// - Nunca deja celdas vacías: si no hay dato => "—"
// - Fallback a IDs cortos
// - Marca visible "v4" para confirmar que ESTA versión está en producción

import React, { useMemo } from "react";

const DASH = "—";

function safe(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function shortId(id) {
  const s = safe(id);
  if (!s) return "";
  return s.length > 10 ? `${s.slice(0, 8)}…` : s;
}

function formatDateTime(value) {
  const s = safe(value);
  if (!s) return "";
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function cellText(v) {
  const s = safe(v);
  return s ? s : DASH;
}

function personaInfo(row) {
  const p = row?.personal || row?.persona || null;
  const nombre =
    safe(p?.nombre) ||
    safe(row?.personal_nombre) ||
    safe(row?.nombre) ||
    safe(p?.email) ||
    safe(row?.email) ||
    shortId(row?.personal_id) ||
    DASH;

  const email = safe(p?.email) || safe(row?.personal_email) || safe(row?.email) || "";
  return { nombre, email };
}

function geocercaText(row) {
  const nombre =
    safe(row?.geocerca?.nombre) ||
    safe(row?.geocerca_nombre) ||
    safe(row?.geofence?.nombre) ||
    safe(row?.geofence_name) ||
    "";
  const id =
    safe(row?.geocerca_id) ||
    safe(row?.geofence_id) ||
    safe(row?.geocercaId) ||
    "";
  return nombre || (id ? shortId(id) : "");
}

function actividadText(row) {
  const nombre =
    safe(row?.activity?.name) ||
    safe(row?.activity_name) ||
    safe(row?.actividad?.name) ||
    safe(row?.actividad_name) ||
    "";
  const id =
    safe(row?.activity_id) ||
    safe(row?.actividad_id) ||
    safe(row?.activityId) ||
    "";
  return nombre || (id ? shortId(id) : "");
}

function freqMin(row) {
  const sec =
    row?.frecuencia_envio_sec ??
    row?.freq_sec ??
    row?.frecuenciaEnvioSec ??
    null;

  if (sec != null && Number.isFinite(Number(sec)) && Number(sec) > 0) {
    return String(Math.round(Number(sec) / 60));
  }

  const min =
    row?.frecuencia_envio_min ??
    row?.freq_min ??
    null;

  if (min != null && Number.isFinite(Number(min)) && Number(min) > 0) {
    return String(Number(min));
  }

  return "";
}

function StatusPill({ status }) {
  const s = safe(status).toLowerCase();
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

export default function AsignacionesTable({ asignaciones, loading, onEdit, onDelete }) {
  const rows = useMemo(() => (Array.isArray(asignaciones) ? asignaciones : []), [asignaciones]);

  return (
    <div className="w-full">
      <div className="border rounded-lg bg-white overflow-x-auto">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold">Listado de asignaciones (v4)</h3>
          <span className="text-xs text-gray-500">
            rows: {rows.length}
          </span>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-sm text-gray-600">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-600">No hay asignaciones.</div>
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
                const { nombre, email } = personaInfo(row);

                const geo = geocercaText(row);
                const act = actividadText(row);

                const inicioRaw = row?.start_time || row?.inicio || row?.start || row?.start_date || row?.fecha_inicio || "";
                const finRaw = row?.end_time || row?.fin || row?.end || row?.end_date || row?.fecha_fin || "";

                const inicio = inicioRaw ? formatDateTime(inicioRaw) : "";
                const fin = finRaw ? formatDateTime(finRaw) : "";

                const freq = freqMin(row);
                const status = row?.status || row?.estado || "inactiva";

                const key = row?.id || `${row?.personal_id || "p"}-${row?.geocerca_id || "g"}-${row?.activity_id || "a"}`;

                return (
                  <tr key={key}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{cellText(nombre)}</div>
                      {email ? <div className="text-xs text-gray-500">{email}</div> : null}
                    </td>

                    <td className="px-4 py-3">{cellText(geo)}</td>
                    <td className="px-4 py-3">{cellText(act)}</td>
                    <td className="px-4 py-3">{cellText(inicio)}</td>
                    <td className="px-4 py-3">{cellText(fin)}</td>
                    <td className="px-4 py-3">{cellText(freq)}</td>

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
