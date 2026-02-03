// src/pages/AsignacionesPage.jsx
// Asignaciones v2.8 FINAL (Feb 2026)
// - Fuente canónica de lectura: public.v_tracker_assignments_ui (contrato estable DB->UI)
// - Escritura: RPC admin_upsert_tracker_assignment_v1
// - DatePicker con icono calendario (react-datepicker v8: showIcon + icon)
// - UI usa fecha + hora | DB guarda solo DATE
// - Filtro estricto por org_id (vía RLS + org_id en vista)

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

/* ---------------- helpers ---------------- */

const ESTADOS = ["todos", "activa", "inactiva"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function shortId(uuid) {
  if (!uuid) return "";
  return uuid.length > 12 ? `${uuid.slice(0, 6)}…${uuid.slice(-4)}` : uuid;
}

function toDateOnly(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateOnlyLoose(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T08:00:00`);
  const d = new Date(s.includes(" ") ? s.replace(" ", "T") : s);
  return isNaN(d) ? null : d;
}

function formatDateDDMMYYYY(v) {
  const d = parseDateOnlyLoose(v);
  if (!d) return "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function nowDate() {
  return new Date();
}

function plusDays(days) {
  return new Date(Date.now() + days * 86400000);
}

/* ---------- Calendar icon (SVG) ---------- */

function CalendarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className="text-gray-500"
    >
      <path
        d="M7 3v2M17 3v2M4 9h16M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ================= COMPONENT ================= */

export default function AsignacionesPage() {
  const { loading, isAuthenticated, user, currentOrg } = useAuth();
  const orgId = currentOrg?.id || null;

  // Options para crear asignación (inputs)
  const [personalOptions, setPersonalOptions] = useState([]);
  const [geofenceOptions, setGeofenceOptions] = useState([]);

  // Tabla desde vista canónica
  const [rows, setRows] = useState([]);

  // Form
  const [selectedPersonalId, setSelectedPersonalId] = useState("");
  const [selectedGeofenceId, setSelectedGeofenceId] = useState("");
  const [startDt, setStartDt] = useState(nowDate());
  const [endDt, setEndDt] = useState(plusDays(365));
  const [active, setActive] = useState(true);

  // UI states
  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  /* ---------------- load ---------------- */

  async function loadAll() {
    if (!orgId) return;

    setLoadingData(true);
    setError(null);

    try {
      // Personal (para selector)
      const { data: p, error: pErr } = await supabase
        .from("personal")
        .select("id, nombre, apellido, email, user_id, org_id, is_deleted")
        .eq("org_id", orgId);

      if (pErr) throw pErr;

      const ppl =
        (p || [])
          .filter((x) => x.user_id && !x.is_deleted)
          .map((x) => ({
            id: x.id,
            user_id: x.user_id,
            label:
              `${x.nombre || ""} ${x.apellido || ""}`.trim() ||
              x.email ||
              x.id,
            email: x.email || "",
          })) || [];

      // Dedupe por id
      const seen = new Set();
      const deduped = [];
      for (const it of ppl) {
        if (!seen.has(it.id)) {
          seen.add(it.id);
          deduped.push(it);
        }
      }
      setPersonalOptions(deduped);

      // Geofences (para selector)
      const { data: g, error: gErr } = await supabase
        .from("geofences")
        .select("id, name, org_id")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (gErr) throw gErr;

      setGeofenceOptions((g || []).map((x) => ({ id: x.id, label: x.name })));

      // Vista canónica (para tabla)
      const { data: a, error: aErr } = await supabase
        .from("v_tracker_assignments_ui")
        .select(
          "id, org_id, tracker_user_id, geofence_id, start_date, end_date, active, created_at, updated_at, geofence_name, tracker_email, tracker_name, tracker_label"
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (aErr) throw aErr;

      setRows(a || []);
      setLoadingData(false);
    } catch (e) {
      setError(e.message || String(e));
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (!loading && isAuthenticated) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAuthenticated, user?.id, orgId]);

  /* ---------------- submit ---------------- */

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedPersonalId || !selectedGeofenceId) {
      return setError("Selecciona tracker y geocerca.");
    }

    const p = personalOptions.find((x) => x.id === selectedPersonalId);
    if (!p?.user_id) return setError("Tracker sin user_id.");

    const startDate = toDateOnly(startDt);
    const endDate = toDateOnly(endDt);

    try {
      const { error: rpcErr } = await supabase.rpc("admin_upsert_tracker_assignment_v1", {
        p_org_id: orgId,
        p_tracker_user_id: p.user_id,
        p_geofence_id: selectedGeofenceId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_active: active,
      });

      if (rpcErr) throw rpcErr;

      setSuccess("Asignación guardada.");
      setSelectedPersonalId("");
      setSelectedGeofenceId("");
      setStartDt(nowDate());
      setEndDt(plusDays(365));
      await loadAll();
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  /* ---------------- list filters ---------------- */

  const filteredRows = useMemo(() => {
    const base = rows || [];
    if (estadoFilter === "activa") return base.filter((r) => r?.active === true);
    if (estadoFilter === "inactiva") return base.filter((r) => r?.active === false);
    return base;
  }, [rows, estadoFilter]);

  /* ---------------- toggle active ---------------- */

  async function toggleActive(row) {
    if (!row) return;
    setError(null);
    setSuccess(null);

    if (!row.tracker_user_id || !row.geofence_id || !row.start_date || !row.end_date) {
      return setError("Fila inválida (faltan ids/fechas).");
    }

    try {
      const { error: rpcErr } = await supabase.rpc("admin_upsert_tracker_assignment_v1", {
        p_org_id: orgId,
        p_tracker_user_id: row.tracker_user_id,
        p_geofence_id: row.geofence_id,
        p_start_date: String(row.start_date),
        p_end_date: String(row.end_date),
        p_active: !row.active,
      });

      if (rpcErr) throw rpcErr;

      setSuccess(!row.active ? "Asignación activada." : "Asignación inactivada.");
      await loadAll();
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  /* ================= RENDER ================= */

  if (!isAuthenticated) {
    return <div className="p-4">Debes iniciar sesión.</div>;
  }

  return (
    <div className="p-4 w-full">
      <h1 className="text-2xl font-bold mb-2">Asignaciones</h1>
      <p className="text-xs text-gray-500 mb-4">
        Org actual: {currentOrg?.name} ({shortId(orgId)})
      </p>

      {error && <div className="mb-3 bg-red-50 border px-3 py-2 text-red-700">{error}</div>}
      {success && <div className="mb-3 bg-green-50 border px-3 py-2 text-green-700">{success}</div>}

      {/* ================= FORM ================= */}
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 border rounded"
      >
        <select
          className="border rounded px-3 py-2"
          value={selectedPersonalId}
          onChange={(e) => setSelectedPersonalId(e.target.value)}
        >
          <option value="">Selecciona tracker</option>
          {personalOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <select
          className="border rounded px-3 py-2"
          value={selectedGeofenceId}
          onChange={(e) => setSelectedGeofenceId(e.target.value)}
        >
          <option value="">Selecciona geocerca</option>
          {geofenceOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>

        <div className="w-full">
          <DatePicker
            selected={startDt}
            onChange={(d) => d && setStartDt(d)}
            showTimeSelect
            dateFormat="dd/MM/yyyy HH:mm"
            placeholderText="Inicio"
            showIcon
            icon={<CalendarIcon />}
            toggleCalendarOnIconClick
            wrapperClassName="w-full"
            className="w-full border rounded px-3 py-2"
          />
          <div className="text-xs text-gray-500 mt-1">
            DB guarda solo fecha (YYYY-MM-DD). La hora es para UX; se recorta al guardar.
          </div>
        </div>

        <div className="w-full">
          <DatePicker
            selected={endDt}
            onChange={(d) => d && setEndDt(d)}
            showTimeSelect
            minDate={startDt}
            dateFormat="dd/MM/yyyy HH:mm"
            placeholderText="Fin"
            showIcon
            icon={<CalendarIcon />}
            toggleCalendarOnIconClick
            wrapperClassName="w-full"
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <select
          className="border rounded px-3 py-2"
          value={active ? "activa" : "inactiva"}
          onChange={(e) => setActive(e.target.value === "activa")}
        >
          <option value="activa">Activa</option>
          <option value="inactiva">Inactiva</option>
        </select>

        <button className="bg-blue-600 text-white rounded px-4 py-2">Guardar</button>
      </form>

      {/* ================= LISTADO ================= */}
      <div className="mt-6 bg-white border rounded p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold">Asignaciones guardadas</h2>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Estado:</span>
            <select
              className="border rounded px-3 py-2"
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
            >
              {ESTADOS.map((x) => (
                <option key={x} value={x}>
                  {x === "todos" ? "Todos" : x === "activa" ? "Activas" : "Inactivas"}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="border rounded px-3 py-2 hover:bg-gray-50"
              onClick={loadAll}
              title="Refrescar"
            >
              Refrescar
            </button>
          </div>
        </div>

        {loadingData ? (
          <div className="text-sm text-gray-600">Cargando…</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-sm text-gray-600">No hay asignaciones para mostrar.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">Tracker</th>
                  <th className="py-2 pr-3">Geocerca</th>
                  <th className="py-2 pr-3">Inicio</th>
                  <th className="py-2 pr-3">Fin</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const trackerText =
                    r.tracker_label || r.tracker_email || shortId(r.tracker_user_id);

                  const geofenceText =
                    r.geofence_name || shortId(r.geofence_id);

                  return (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{trackerText || "—"}</div>
                        {r.tracker_email ? (
                          <div className="text-xs text-gray-500">{r.tracker_email}</div>
                        ) : null}
                      </td>

                      <td className="py-2 pr-3">{geofenceText || "—"}</td>
                      <td className="py-2 pr-3">{formatDateDDMMYYYY(r.start_date)}</td>
                      <td className="py-2 pr-3">{formatDateDDMMYYYY(r.end_date)}</td>

                      <td className="py-2 pr-3">
                        <span
                          className={
                            r.active
                              ? "inline-flex items-center px-2 py-1 rounded bg-green-50 text-green-700 border"
                              : "inline-flex items-center px-2 py-1 rounded bg-gray-50 text-gray-700 border"
                          }
                        >
                          {r.active ? "Activa" : "Inactiva"}
                        </span>
                      </td>

                      <td className="py-2 pr-3 text-right">
                        <button
                          type="button"
                          className="border rounded px-3 py-1 hover:bg-gray-50"
                          onClick={() => toggleActive(r)}
                        >
                          {r.active ? "Inactivar" : "Activar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-2 text-xs text-gray-500">
              Mostrando {filteredRows.length} de {rows.length}.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
