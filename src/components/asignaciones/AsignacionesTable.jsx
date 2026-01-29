// src/components/asignaciones/AsignacionesTable.jsx
// v5 — Enero 2026
// Objetivo: NUNCA columnas “vacías invisibles” por CSS.
// - Fuerza color/visibilidad en celdas.
// - Incluye celda de prueba "TEXTO_FORZADO_OK" (rojo/amarillo) en Geocerca si no hay valor.
// - Fallbacks a IDs cortos y “—”.

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

function cell(v) {
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

  const email =
    safe(p?.email) || safe(row?.personal_email) || safe(row?.email) || "";

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

  const min = row?.frecuencia_envio_min ?? row?.freq_min ?? null;
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
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 700,
        background: isActive ? "#dcfce7" : "#f3f4f6",
        color: isActive ? "#166534" : "#111827",
        opacity: 1,
        visibility: "visible",
      }}
    >
      {isActive ? "Activa" : "Inactiva"}
    </span>
  );
}

// Estilo inline “anti-CSS invisible”
const tdForce = {
  color: "#111827",
  opacity: 1,
  visibility: "visible",
  WebkitTextFillColor: "#111827",
};

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
        <div
          className="px-4 py-3 border-b flex items-center justify-between"
          style={{ ...tdForce }}
        >
          <h3 className="font-semibold" style={{ ...tdForce }}>
            Listado de asignaciones (v5)
          </h3>
          <span className="text-xs text-gray-500" style={{ ...tdForce }}>
            rows: {rows.length}
          </span>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-sm text-gray-600" style={{ ...tdForce }}>
            Cargando…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-600" style={{ ...tdForce }}>
            No hay asignaciones.
          </div>
        ) : (
          <table
            className="min-w-full text-sm"
            style={{
              width: "100%",
              color: "#111827",
              opacity: 1,
              visibility: "visible",
            }}
          >
            <thead
              className="bg-gray-50 text-gray-700"
              style={{ color: "#111827", opacity: 1, visibility: "visible" }}
            >
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold" style={{ ...tdForce }}>
                  Persona
                </th>
                <th className="px-4 py-3 font-semibold" style={{ ...tdForce }}>
                  Geocerca
                </th>
                <th className="px-4 py-3 font-semibold" style={{ ...tdForce }}>
                  Actividad
                </th>
                <th className="px-4 py-3 font-semibold" style={{ ...tdForce }}>
                  Inicio
                </th>
                <th className="px-4 py-3 font-semibold" style={{ ...tdForce }}>
                  Fin
                </th>
                <th className="px-4 py-3 font-semibold" style={{ ...tdForce }}>
                  Freq (min)
                </th>
                <th className="px-4 py-3 font-semibold" style={{ ...tdForce }}>
                  Estado
                </th>
                <th
                  className="px-4 py-3 font-semibold text-right"
                  style={{ ...tdForce }}
                >
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody
              className="divide-y"
              style={{ color: "#111827", opacity: 1, visibility: "visible" }}
            >
              {rows.map((row) => {
                const { nombre, email } = personaInfo(row);

                const geo = geocercaText(row);
                const act = actividadText(row);

                const inicioRaw =
                  row?.start_time ||
                  row?.inicio ||
                  row?.start ||
                  row?.start_date ||
                  row?.fecha_inicio ||
                  "";
                const finRaw =
                  row?.end_time ||
                  row?.fin ||
                  row?.end ||
                  row?.end_date ||
                  row?.fecha_fin ||
                  "";

                const inicio = inicioRaw ? formatDateTime(inicioRaw) : "";
                const fin = finRaw ? formatDateTime(finRaw) : "";

                const freq = freqMin(row);
                const status = row?.status || row?.estado || "inactiva";

                const key =
                  row?.id ||
                  `${row?.personal_id || "p"}-${row?.geocerca_id || "g"}-${
                    row?.activity_id || "a"
                  }`;

                return (
                  <tr key={key}>
                    <td className="px-4 py-3" style={{ ...tdForce }}>
                      <div
                        className="font-semibold text-gray-900"
                        style={{ ...tdForce }}
                      >
                        {cell(nombre)}
                      </div>
                      {email ? (
                        <div className="text-xs text-gray-500" style={{ ...tdForce }}>
                          {email}
                        </div>
                      ) : null}
                    </td>

                    {/* Geocerca: si no hay valor, muestra TEXTO_FORZADO_OK visible */}
                    <td
                      className="px-4 py-3"
                      style={{
                        ...tdForce,
                        ...(geo
                          ? {}
                          : {
                              color: "#ff0000",
                              fontWeight: "bold",
                              background: "#ffff00",
                            }),
                      }}
                    >
                      {geo ? geo : "TEXTO_FORZADO_OK"}
                    </td>

                    <td className="px-4 py-3" style={{ ...tdForce }}>
                      {cell(act)}
                    </td>

                    <td className="px-4 py-3" style={{ ...tdForce }}>
                      {cell(inicio)}
                    </td>

                    <td className="px-4 py-3" style={{ ...tdForce }}>
                      {cell(fin)}
                    </td>

                    <td className="px-4 py-3" style={{ ...tdForce }}>
                      {cell(freq)}
                    </td>

                    <td className="px-4 py-3" style={{ ...tdForce }}>
                      <StatusPill status={status} />
                    </td>

                    <td className="px-4 py-3" style={{ ...tdForce }}>
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
