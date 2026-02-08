// src/pages/AsignacionesPage.jsx
// Asignaciones v2.16 FINAL (Feb 2026) + i18n (ES/EN/FR)
// - Lectura canónica: v_tracker_assignments_ui
// - Escritura: RPC admin_upsert_tracker_assignment_v2 (con activity_id)
// - Compat: toggle/delete usan v2 si row.activity_id existe, si no usan v1
// - ✅ Geofences SOLO active=true
// - ✅ Activities SOLO active=true (por org_id)
// - ✅ Botón ELIMINAR (lógico) = desactivar + cerrar hoy
// - ✅ UX: por defecto muestra SOLO asignaciones ACTIVAS
// - DEBUG: ?debug=1

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";
import { useTranslation } from "react-i18next";

import DatePickerField from "../components/ui/DatePickerField";

const ESTADOS = ["activa", "todos", "inactiva"];

function shortId(uuid) {
  if (!uuid) return "";
  const s = String(uuid);
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseDateOnlyLoose(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T08:00:00`);
  const d = new Date(s.includes(" ") ? s.replace(" ", "T") : s);
  return isNaN(d) ? null : d;
}

function formatDateDDMMYYYY(v) {
  const d = parseDateOnlyLoose(v);
  if (!d) return "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function plusDaysYYYYMMDD(days) {
  const d = new Date();
  d.setDate(d.getDate() + (Number(days) || 0));
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function isDateRangeInvalid(startDate, endDate) {
  if (!startDate || !endDate) return false;
  return startDate > endDate;
}

function tSafe(t, key, fallback) {
  const v = t(key);
  if (!v) return fallback;
  if (v === key) return fallback;
  return v;
}

export default function AsignacionesPage() {
  const { t } = useTranslation();
  const { loading, isAuthenticated, user, currentOrg } = useAuth();
  const orgId = currentOrg?.id || null;

  const debug = useMemo(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      return qs.get("debug") === "1";
    } catch {
      return false;
    }
  }, []);

  const [personalOptions, setPersonalOptions] = useState([]);
  const [geofenceOptions, setGeofenceOptions] = useState([]);
  const [activityOptions, setActivityOptions] = useState([]);
  const [rows, setRows] = useState([]);

  const [selectedPersonalId, setSelectedPersonalId] = useState("");
  const [selectedGeofenceId, setSelectedGeofenceId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");

  const [startDate, setStartDate] = useState(todayYYYYMMDD());
  const [endDate, setEndDate] = useState(plusDaysYYYYMMDD(365));
  const [active, setActive] = useState(true);

  // ✅ UX: por defecto SOLO activas
  const [estadoFilter, setEstadoFilter] = useState("activa");

  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [dateRangeError, setDateRangeError] = useState("");

  // Mapa rápido id->name para mostrar Activity aun si la vista no trae activity_name
  const activityMap = useMemo(() => {
    const m = new Map();
    for (const a of activityOptions) m.set(String(a.id), a.label);
    return m;
  }, [activityOptions]);

  useEffect(() => {
    if (isDateRangeInvalid(startDate, endDate)) {
      setDateRangeError(
        tSafe(
          t,
          "asignaciones.messages.invalidDatesRange",
          tSafe(t, "asignaciones.messages.invalidDates", "Rango de fechas inválido")
        )
      );
    } else {
      setDateRangeError("");
    }
  }, [startDate, endDate, t]);

  async function loadAll() {
    if (!orgId) return;
    setLoadingData(true);
    setError(null);

    try {
      // 1) Personal: solo trackers válidos (user_id presente y no deleted)
      const { data: p, error: pErr } = await supabase
        .from("personal")
        .select("id, nombre, apellido, email, user_id, org_id, is_deleted")
        .eq("org_id", orgId);

      if (pErr) throw pErr;

      const ppl = (p || [])
        .filter((x) => x.user_id && !x.is_deleted)
        .map((x) => ({
          id: x.id,
          user_id: x.user_id,
          label: `${x.nombre || ""} ${x.apellido || ""}`.trim() || x.email || x.id,
          email: x.email || "",
        }));

      const seen = new Set();
      const deduped = [];
      for (const it of ppl) {
        if (!seen.has(it.id)) {
          seen.add(it.id);
          deduped.push(it);
        }
      }
      setPersonalOptions(deduped);

      // 2) Activities canónicas (✅ SOLO active=true)
      const { data: act, error: actErr } = await supabase
        .from("activities")
        .select("id, name, org_id, active, created_at")
        .eq("org_id", orgId)
        .eq("active", true)
        .order("created_at", { ascending: false });

      if (actErr) throw actErr;

      const acts = (act || []).map((x) => ({ id: x.id, label: x.name }));
      setActivityOptions(acts);

      // Si la actividad seleccionada ya no está activa, limpiamos selección
      if (selectedActivityId) {
        const stillExists = (act || []).some((x) => String(x.id) === String(selectedActivityId));
        if (!stillExists) setSelectedActivityId("");
      }

      // 3) Geofences canónicas (✅ SOLO active=true)
      const { data: g, error: gErr } = await supabase
        .from("geofences")
        .select("id, name, org_id, created_at, active")
        .eq("org_id", orgId)
        .eq("active", true)
        .order("created_at", { ascending: false });

      if (gErr) throw gErr;

      setGeofenceOptions((g || []).map((x) => ({ id: x.id, label: x.name })));

      if (selectedGeofenceId) {
        const stillExists = (g || []).some((x) => String(x.id) === String(selectedGeofenceId));
        if (!stillExists) setSelectedGeofenceId("");
      }

      // 4) Asignaciones del tracker (vista canónica)
      const { data: a, error: aErr } = await supabase
        .from("v_tracker_assignments_ui")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (aErr) throw aErr;

      setRows(a || []);

      if (debug) {
        // eslint-disable-next-line no-console
        console.log("DEBUG orgId:", orgId);
        // eslint-disable-next-line no-console
        console.log("DEBUG first row:", (a || [])[0] || null);
        // eslint-disable-next-line no-console
        console.log("DEBUG geofences(active) count:", (g || []).length);
        // eslint-disable-next-line no-console
        console.log("DEBUG activities(active) count:", (act || []).length);
      }

      setLoadingData(false);
    } catch (e) {
      setError(e?.message || String(e));
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (!loading && isAuthenticated) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAuthenticated, user?.id, orgId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedPersonalId || !selectedGeofenceId || !selectedActivityId) {
      return setError(
        tSafe(t, "asignaciones.messages.selectTrackerGeofenceActivity", "Selecciona tracker, geocerca y actividad")
      );
    }

    const p = personalOptions.find((x) => x.id === selectedPersonalId);
    if (!p?.user_id) return setError(tSafe(t, "asignaciones.messages.trackerMissingUserId", "El tracker no tiene user_id"));

    if (!startDate || !endDate || isDateRangeInvalid(startDate, endDate)) {
      return setError(tSafe(t, "asignaciones.messages.invalidDates", "Fechas inválidas"));
    }

    try {
      // ✅ v2 exige activity_id
      const { error: rpcErr } = await supabase.rpc("admin_upsert_tracker_assignment_v2", {
        p_org_id: orgId,
        p_tracker_user_id: p.user_id,
        p_geofence_id: selectedGeofenceId,
        p_activity_id: selectedActivityId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_active: active,
      });

      if (rpcErr) throw rpcErr;

      setSuccess(tSafe(t, "asignaciones.banner.saved", "Guardado"));

      setEstadoFilter("activa");

      setSelectedPersonalId("");
      setSelectedGeofenceId("");
      setSelectedActivityId("");
      setStartDate(todayYYYYMMDD());
      setEndDate(plusDaysYYYYMMDD(365));
      await loadAll();
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  const filteredRows = useMemo(() => {
    const base = rows || [];
    if (estadoFilter === "activa") return base.filter((r) => r?.active === true);
    if (estadoFilter === "inactiva") return base.filter((r) => r?.active === false);
    return base; // "todos"
  }, [rows, estadoFilter]);

  async function toggleActive(row) {
    setError(null);
    setSuccess(null);

    const start = String(row?.start_date || "").slice(0, 10);
    const end = String(row?.end_date || "").slice(0, 10);
    if (!start || !end) return setError(tSafe(t, "asignaciones.messages.toggleInvalidDates", "Fechas inválidas"));

    try {
      // Preferimos v2 si la fila ya tiene activity_id (cuando actualices la vista)
      const hasActivity = !!row?.activity_id;

      const rpcName = hasActivity ? "admin_upsert_tracker_assignment_v2" : "admin_upsert_tracker_assignment_v1";
      const rpcArgs = hasActivity
        ? {
            p_org_id: orgId,
            p_tracker_user_id: row.tracker_user_id,
            p_geofence_id: row.geofence_id,
            p_activity_id: row.activity_id,
            p_start_date: start,
            p_end_date: end,
            p_active: !row.active,
          }
        : {
            p_org_id: orgId,
            p_tracker_user_id: row.tracker_user_id,
            p_geofence_id: row.geofence_id,
            p_start_date: start,
            p_end_date: end,
            p_active: !row.active,
          };

      const { error: rpcErr } = await supabase.rpc(rpcName, rpcArgs);
      if (rpcErr) throw rpcErr;

      setSuccess(!row.active ? tSafe(t, "asignaciones.banner.activated", "Activado") : tSafe(t, "asignaciones.banner.deactivated", "Desactivado"));
      await loadAll();
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function deleteAssignment(row) {
    setError(null);
    setSuccess(null);

    const trackerText = row?.tracker_label || row?.tracker_name || row?.tracker_email || shortId(row?.tracker_user_id);
    const geofenceText = row?.geofence_name || shortId(row?.geofence_id) || "—";

    const activityText =
      row?.activity_name ||
      (row?.activity_id ? activityMap.get(String(row.activity_id)) : null) ||
      (row?.activity_id ? shortId(row.activity_id) : "—");

    const confirmMsg =
      tSafe(t, "asignaciones.confirmDelete", "¿Eliminar esta asignación?") +
      `\n\n${tSafe(t, "asignaciones.table.tracker", "Tracker")}: ${trackerText}` +
      `\n${tSafe(t, "asignaciones.table.activity", "Actividad")}: ${activityText}` +
      `\n${tSafe(t, "asignaciones.table.geofence", "Geocerca")}: ${geofenceText}`;

    if (!window.confirm(confirmMsg)) return;

    const start = String(row?.start_date || "").slice(0, 10);
    const endCurrent = String(row?.end_date || "").slice(0, 10);
    if (!start) return setError(tSafe(t, "asignaciones.messages.toggleInvalidDates", "Fechas inválidas"));

    const today = todayYYYYMMDD();
    let end = today;

    if (start > end) end = start;
    if (endCurrent && endCurrent < end) end = endCurrent;

    try {
      const hasActivity = !!row?.activity_id;

      // Si no hay activity_id en la fila (vista aún vieja), usamos v1 para no romper histórico
      const rpcName = hasActivity ? "admin_upsert_tracker_assignment_v2" : "admin_upsert_tracker_assignment_v1";
      const rpcArgs = hasActivity
        ? {
            p_org_id: orgId,
            p_tracker_user_id: row.tracker_user_id,
            p_geofence_id: row.geofence_id,
            p_activity_id: row.activity_id,
            p_start_date: start,
            p_end_date: end,
            p_active: false,
          }
        : {
            p_org_id: orgId,
            p_tracker_user_id: row.tracker_user_id,
            p_geofence_id: row.geofence_id,
            p_start_date: start,
            p_end_date: end,
            p_active: false,
          };

      const { error: rpcErr } = await supabase.rpc(rpcName, rpcArgs);
      if (rpcErr) throw rpcErr;

      setSuccess(tSafe(t, "asignaciones.banner.deleted", "Asignación eliminada"));
      setEstadoFilter("activa");
      await loadAll();
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  if (!isAuthenticated) return <div className="p-4">{tSafe(t, "auth.loginRequired", "Inicia sesión")}</div>;

  return (
    <div className="p-4 w-full">
      {debug ? (
        <div className="mb-3 border rounded bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
          <div className="font-semibold">DEBUG: src/pages/AsignacionesPage.jsx</div>
          <div>
            {tSafe(t, "asignaciones.debug.source", "Fuente")} <span className="font-mono">v_tracker_assignments_ui</span> |{" "}
            {tSafe(t, "asignaciones.debug.rows", "Filas")}: {rows?.length || 0}
          </div>
        </div>
      ) : null}

      <h1 className="text-2xl font-bold mb-2">{tSafe(t, "asignaciones.title", "Asignaciones")}</h1>
      <p className="text-xs text-gray-500 mb-4">
        {tSafe(t, "asignaciones.orgCurrent", "Org actual")}: {currentOrg?.name} ({shortId(orgId)})
      </p>

      {error && <div className="mb-3 bg-red-50 border px-3 py-2 text-red-700">{error}</div>}
      {success && <div className="mb-3 bg-green-50 border px-3 py-2 text-green-700">{success}</div>}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 border rounded">
        <select className="border rounded px-3 py-2" value={selectedPersonalId} onChange={(e) => setSelectedPersonalId(e.target.value)}>
          <option value="">{tSafe(t, "asignaciones.form.selectTracker", "Selecciona tracker")}</option>
          {personalOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        {/* ✅ NUEVO: Actividad */}
        <select className="border rounded px-3 py-2" value={selectedActivityId} onChange={(e) => setSelectedActivityId(e.target.value)}>
          <option value="">{tSafe(t, "asignaciones.form.selectActivity", "Selecciona actividad")}</option>
          {activityOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>

        <select className="border rounded px-3 py-2" value={selectedGeofenceId} onChange={(e) => setSelectedGeofenceId(e.target.value)}>
          <option value="">{tSafe(t, "asignaciones.form.selectGeofence", "Selecciona geocerca")}</option>
          {geofenceOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>

        <div className="w-full">
          <DatePickerField label={tSafe(t, "asignaciones.form.start", "Inicio")} value={startDate} onChange={setStartDate} max={endDate || undefined} />
          <div className="text-xs text-gray-500 mt-1">{tSafe(t, "asignaciones.form.dateHint", "Formato YYYY-MM-DD")}</div>
        </div>

        <div className="w-full">
          <DatePickerField label={tSafe(t, "asignaciones.form.end", "Fin")} value={endDate} onChange={setEndDate} min={startDate || undefined} />
        </div>

        <select className="border rounded px-3 py-2" value={active ? "activa" : "inactiva"} onChange={(e) => setActive(e.target.value === "activa")}>
          <option value="activa">{tSafe(t, "asignaciones.status.active", "Activa")}</option>
          <option value="inactiva">{tSafe(t, "asignaciones.status.inactive", "Inactiva")}</option>
        </select>

        <button className="bg-blue-600 text-white rounded px-4 py-2" disabled={!!dateRangeError}>
          {tSafe(t, "common.actions.save", "Guardar")}
        </button>

        {dateRangeError ? <div className="md:col-span-2 text-xs text-red-600">{dateRangeError}</div> : null}
      </form>

      <div className="mt-6 bg-white border rounded p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold">{tSafe(t, "asignaciones.table.title", "Asignaciones")}</h2>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{tSafe(t, "asignaciones.filters.statusLabel", "Estado")}</span>
            <select className="border rounded px-3 py-2" value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)}>
              {ESTADOS.map((x) => (
                <option key={x} value={x}>
                  {x === "todos"
                    ? tSafe(t, "asignaciones.filters.status.todos", "Todos")
                    : x === "activa"
                    ? tSafe(t, "asignaciones.filters.status.activa", "Activas")
                    : tSafe(t, "asignaciones.filters.status.inactiva", "Inactivas")}
                </option>
              ))}
            </select>

            <button type="button" className="border rounded px-3 py-2 hover:bg-gray-50" onClick={loadAll}>
              {tSafe(t, "common.actions.refresh", "Refrescar")}
            </button>
          </div>
        </div>

        {loadingData ? (
          <div className="text-sm text-gray-600">{tSafe(t, "common.actions.loading", "Cargando…")}</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-sm text-gray-600">{tSafe(t, "asignaciones.table.empty", "Sin registros")}</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b bg-slate-900 text-white">
                  <th className="py-2 pr-3">{tSafe(t, "asignaciones.table.tracker", "Tracker")}</th>
                  <th className="py-2 pr-3">{tSafe(t, "asignaciones.table.activity", "Actividad")}</th>
                  <th className="py-2 pr-3">{tSafe(t, "asignaciones.table.geofence", "Geocerca")}</th>
                  <th className="py-2 pr-3">{tSafe(t, "asignaciones.table.start", "Inicio")}</th>
                  <th className="py-2 pr-3">{tSafe(t, "asignaciones.table.end", "Fin")}</th>
                  <th className="py-2 pr-3">{tSafe(t, "asignaciones.table.status", "Estado")}</th>
                  <th className="py-2 pr-3 text-right">{tSafe(t, "asignaciones.table.action", "Acciones")}</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((r) => {
                  const trackerText = r.tracker_label || r.tracker_name || r.tracker_email || shortId(r.tracker_user_id);
                  const activityText =
                    r.activity_name ||
                    (r.activity_id ? activityMap.get(String(r.activity_id)) : null) ||
                    (r.activity_id ? shortId(r.activity_id) : "—");
                  const geofenceText = r.geofence_name || shortId(r.geofence_id) || "—";
                  const startText = formatDateDDMMYYYY(r.start_date) || "—";
                  const endText = formatDateDDMMYYYY(r.end_date) || "—";

                  return (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-gray-900">{trackerText || "—"}</div>
                        {r.tracker_email ? <div className="text-xs text-gray-500">{r.tracker_email}</div> : null}
                      </td>

                      <td className="py-2 pr-3">
                        <span className="inline-block min-w-[140px] text-gray-900 whitespace-nowrap" title={String(activityText)}>
                          {activityText}
                        </span>
                      </td>

                      <td className="py-2 pr-3">
                        <span className="inline-block min-w-[140px] text-gray-900 whitespace-nowrap" title={String(geofenceText)}>
                          {geofenceText}
                        </span>
                      </td>

                      <td className="py-2 pr-3">
                        <span className="inline-block min-w-[120px] text-gray-900 whitespace-nowrap" title={String(r.start_date)}>
                          {startText}
                        </span>
                      </td>

                      <td className="py-2 pr-3">
                        <span className="inline-block min-w-[120px] text-gray-900 whitespace-nowrap" title={String(r.end_date)}>
                          {endText}
                        </span>
                      </td>

                      <td className="py-2 pr-3">
                        <span
                          className={
                            r.active
                              ? "inline-flex items-center px-2 py-1 rounded bg-green-50 text-green-700 border"
                              : "inline-flex items-center px-2 py-1 rounded bg-gray-50 text-gray-700 border"
                          }
                        >
                          {r.active ? tSafe(t, "asignaciones.status.active", "Activa") : tSafe(t, "asignaciones.status.inactive", "Inactiva")}
                        </span>
                      </td>

                      <td className="py-2 pr-3 text-right">
                        <div className="inline-flex gap-2">
                          <button type="button" className="border rounded px-3 py-1 hover:bg-gray-50" onClick={() => toggleActive(r)}>
                            {r.active ? tSafe(t, "asignaciones.actions.deactivate", "Desactivar") : tSafe(t, "asignaciones.actions.activate", "Activar")}
                          </button>

                          <button
                            type="button"
                            className="border rounded px-3 py-1 hover:bg-red-50 text-red-700 border-red-200"
                            onClick={() => deleteAssignment(r)}
                            title={tSafe(t, "asignaciones.actions.deleteHint", "Eliminar (desactivar y cerrar hoy)")}
                          >
                            {tSafe(t, "common.actions.delete", "Eliminar")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-2 text-xs text-gray-500">
              {tSafe(t, "asignaciones.table.showing", "Mostrando {{shown}} de {{total}}")
                .replace("{{shown}}", String(filteredRows.length))
                .replace("{{total}}", String(rows.length))}
            </div>

            {debug ? (
              <pre className="mt-3 text-xs bg-gray-50 border rounded p-2 overflow-auto">{JSON.stringify(rows?.[0] || null, null, 2)}</pre>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
