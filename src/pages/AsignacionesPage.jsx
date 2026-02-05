// src/pages/AsignacionesPage.jsx
// Asignaciones v2.13 FINAL (Feb 2026) + i18n (ES/EN/FR)
// - Lectura canónica: v_tracker_assignments_ui
// - Escritura: RPC admin_upsert_tracker_assignment_v1
// - ✅ Migrado a DatePickerField (HTML nativo + icono) para consistencia y WebView/TWA
// - ✅ Fechas date-only (YYYY-MM-DD) coherentes con start_date/end_date (sin perder “hora” que igual no se guardaba)
// - Fix permanente: fuerza visibilidad (Geocerca/Inicio/Fin) ante CSS/herencia/ancho 0
// - DEBUG: ?debug=1

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";
import { useTranslation } from "react-i18next";

// ✅ DatePicker reutilizable (HTML nativo + icono)
import DatePickerField from "../components/ui/DatePickerField";

const ESTADOS = ["todos", "activa", "inactiva"];

function shortId(uuid) {
  if (!uuid) return "";
  const s = String(uuid);
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Convierte "YYYY-MM-DD" (o Date/string) a Date para mostrar en tabla (dd/mm/yyyy)
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
  // YYYY-MM-DD permite comparación lexicográfica segura
  return startDate > endDate;
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
  const [rows, setRows] = useState([]);

  const [selectedPersonalId, setSelectedPersonalId] = useState("");
  const [selectedGeofenceId, setSelectedGeofenceId] = useState("");

  // ✅ Ahora son strings "YYYY-MM-DD" (coherente con DB/RPC)
  const [startDate, setStartDate] = useState(todayYYYYMMDD());
  const [endDate, setEndDate] = useState(plusDaysYYYYMMDD(365));
  const [active, setActive] = useState(true);

  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [dateRangeError, setDateRangeError] = useState("");

  // ✅ Validación rango (solo si ambos existen)
  useEffect(() => {
    if (isDateRangeInvalid(startDate, endDate)) {
      setDateRangeError(t("asignaciones.messages.invalidDatesRange") || t("asignaciones.messages.invalidDates"));
    } else {
      setDateRangeError("");
    }
  }, [startDate, endDate, t]);

  async function loadAll() {
    if (!orgId) return;
    setLoadingData(true);
    setError(null);

    try {
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

      const { data: g, error: gErr } = await supabase
        .from("geofences")
        .select("id, name, org_id, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (gErr) throw gErr;

      setGeofenceOptions((g || []).map((x) => ({ id: x.id, label: x.name })));

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

    if (!selectedPersonalId || !selectedGeofenceId) {
      return setError(t("asignaciones.messages.selectTrackerAndGeofence"));
    }

    const p = personalOptions.find((x) => x.id === selectedPersonalId);
    if (!p?.user_id) return setError(t("asignaciones.messages.trackerMissingUserId"));

    if (!startDate || !endDate || isDateRangeInvalid(startDate, endDate)) {
      return setError(t("asignaciones.messages.invalidDates"));
    }

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

      setSuccess(t("asignaciones.banner.saved"));
      setSelectedPersonalId("");
      setSelectedGeofenceId("");
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
    return base;
  }, [rows, estadoFilter]);

  async function toggleActive(row) {
    setError(null);
    setSuccess(null);

    // row.start_date / row.end_date vienen como date; garantizamos formato YYYY-MM-DD para RPC
    const start = String(row?.start_date || "").slice(0, 10);
    const end = String(row?.end_date || "").slice(0, 10);
    if (!start || !end) return setError(t("asignaciones.messages.toggleInvalidDates"));

    try {
      const { error: rpcErr } = await supabase.rpc("admin_upsert_tracker_assignment_v1", {
        p_org_id: orgId,
        p_tracker_user_id: row.tracker_user_id,
        p_geofence_id: row.geofence_id,
        p_start_date: start,
        p_end_date: end,
        p_active: !row.active,
      });
      if (rpcErr) throw rpcErr;

      setSuccess(!row.active ? t("asignaciones.banner.activated") : t("asignaciones.banner.deactivated"));
      await loadAll();
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  if (!isAuthenticated) return <div className="p-4">{t("auth.loginRequired")}</div>;

  return (
    <div className="p-4 w-full">
      {debug ? (
        <div className="mb-3 border rounded bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
          <div className="font-semibold">DEBUG: src/pages/AsignacionesPage.jsx</div>
          <div>
            {t("asignaciones.debug.source")} <span className="font-mono">v_tracker_assignments_ui</span> |{" "}
            {t("asignaciones.debug.rows")}: {rows?.length || 0}
          </div>
        </div>
      ) : null}

      <h1 className="text-2xl font-bold mb-2">{t("asignaciones.title")}</h1>
      <p className="text-xs text-gray-500 mb-4">
        {t("asignaciones.orgCurrent")}: {currentOrg?.name} ({shortId(orgId)})
      </p>

      {error && <div className="mb-3 bg-red-50 border px-3 py-2 text-red-700">{error}</div>}
      {success && <div className="mb-3 bg-green-50 border px-3 py-2 text-green-700">{success}</div>}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 border rounded">
        <select
          className="border rounded px-3 py-2"
          value={selectedPersonalId}
          onChange={(e) => setSelectedPersonalId(e.target.value)}
        >
          <option value="">{t("asignaciones.form.selectTracker")}</option>
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
          <option value="">{t("asignaciones.form.selectGeofence")}</option>
          {geofenceOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>

        <div className="w-full">
          <DatePickerField
            label={t("asignaciones.form.start")}
            value={startDate}
            onChange={setStartDate}
            max={endDate || undefined}
          />
          <div className="text-xs text-gray-500 mt-1">{t("asignaciones.form.dateHint")}</div>
        </div>

        <div className="w-full">
          <DatePickerField
            label={t("asignaciones.form.end")}
            value={endDate}
            onChange={setEndDate}
            min={startDate || undefined}
          />
        </div>

        <select
          className="border rounded px-3 py-2"
          value={active ? "activa" : "inactiva"}
          onChange={(e) => setActive(e.target.value === "activa")}
        >
          <option value="activa">{t("asignaciones.status.active")}</option>
          <option value="inactiva">{t("asignaciones.status.inactive")}</option>
        </select>

        <button className="bg-blue-600 text-white rounded px-4 py-2" disabled={!!dateRangeError}>
          {t("common.actions.save")}
        </button>

        {dateRangeError ? (
          <div className="md:col-span-2 text-xs text-red-600">
            {dateRangeError}
          </div>
        ) : null}
      </form>

      <div className="mt-6 bg-white border rounded p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold">{t("asignaciones.table.title")}</h2>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{t("asignaciones.filters.statusLabel")}</span>
            <select
              className="border rounded px-3 py-2"
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
            >
              {ESTADOS.map((x) => (
                <option key={x} value={x}>
                  {x === "todos"
                    ? t("asignaciones.filters.status.todos")
                    : x === "activa"
                    ? t("asignaciones.filters.status.activa")
                    : t("asignaciones.filters.status.inactiva")}
                </option>
              ))}
            </select>

            <button type="button" className="border rounded px-3 py-2 hover:bg-gray-50" onClick={loadAll}>
              {t("common.actions.refresh")}
            </button>
          </div>
        </div>

        {loadingData ? (
          <div className="text-sm text-gray-600">{t("common.actions.loading")}</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-sm text-gray-600">{t("asignaciones.table.empty")}</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b bg-slate-900 text-white">
                  <th className="py-2 pr-3">{t("asignaciones.table.tracker")}</th>
                  <th className="py-2 pr-3">{t("asignaciones.table.geofence")}</th>
                  <th className="py-2 pr-3">{t("asignaciones.table.start")}</th>
                  <th className="py-2 pr-3">{t("asignaciones.table.end")}</th>
                  <th className="py-2 pr-3">{t("asignaciones.table.status")}</th>
                  <th className="py-2 pr-3 text-right">{t("asignaciones.table.action")}</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((r) => {
                  const trackerText =
                    r.tracker_label || r.tracker_name || r.tracker_email || shortId(r.tracker_user_id);
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
                        <span
                          className="inline-block min-w-[140px] text-gray-900 whitespace-nowrap"
                          title={String(geofenceText)}
                        >
                          {geofenceText}
                        </span>
                      </td>

                      <td className="py-2 pr-3">
                        <span
                          className="inline-block min-w-[120px] text-gray-900 whitespace-nowrap"
                          title={String(r.start_date)}
                        >
                          {startText}
                        </span>
                      </td>

                      <td className="py-2 pr-3">
                        <span
                          className="inline-block min-w-[120px] text-gray-900 whitespace-nowrap"
                          title={String(r.end_date)}
                        >
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
                          {r.active ? t("asignaciones.status.active") : t("asignaciones.status.inactive")}
                        </span>
                      </td>

                      <td className="py-2 pr-3 text-right">
                        <button
                          type="button"
                          className="border rounded px-3 py-1 hover:bg-gray-50"
                          onClick={() => toggleActive(r)}
                        >
                          {r.active ? t("asignaciones.actions.deactivate") : t("asignaciones.actions.activate")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-2 text-xs text-gray-500">
              {t("asignaciones.table.showing", { shown: filteredRows.length, total: rows.length })}
            </div>

            {debug ? (
              <pre className="mt-3 text-xs bg-gray-50 border rounded p-2 overflow-auto">
                {JSON.stringify(rows?.[0] || null, null, 2)}
              </pre>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
