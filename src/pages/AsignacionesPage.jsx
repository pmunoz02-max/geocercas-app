// src/pages/AsignacionesPage.jsx
// Asignaciones v2.4 (Feb 2026) — Fix: calendar icon datepicker (react-datepicker)
// - UI usa DatePicker (calendario + hora) con icono
// - DB recibe date (YYYY-MM-DD)
// - Geofences filtradas por org_id = currentOrg.id (doble filtro)
// - Debug visual: muestra current org id para detectar cruce de org entre pantallas
// - Debug opcional: /asignaciones?debug=1

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const ESTADOS = ["todos", "activa", "inactiva"];

function dedupeById(arr) {
  const map = new Map();
  (Array.isArray(arr) ? arr : []).forEach((x) => {
    if (!x?.id) return;
    if (!map.has(x.id)) map.set(x.id, x);
  });
  return Array.from(map.values());
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function shortId(uuid) {
  if (!uuid) return "";
  const s = String(uuid);
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

// ---- Date helpers ----
// DB needs YYYY-MM-DD (date only)
function toDateOnlyFromDate(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

// backend returns "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DD HH:mm:ss"
function parseDateLoose(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;

  // If already Date
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  // "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // default time 08:00 local (solo UX)
    return new Date(`${s}T08:00:00`);
  }

  // "YYYY-MM-DDTHH:mm..."
  if (s.includes("T")) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // "YYYY-MM-DD HH:mm:ss"
  if (s.includes(" ")) {
    const [dPart, tPart] = s.split(" ");
    const iso = `${dPart}T${(tPart || "08:00").slice(0, 5)}:00`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // fallback
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nowDate() {
  return new Date();
}

function plusDays(days) {
  return new Date(Date.now() + days * 24 * 3600 * 1000);
}

// ---- UI: input with icon (calendar) ----
function CalendarInput({ value, onClick, placeholder }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full border rounded px-3 py-2 flex items-center justify-between gap-3 hover:bg-gray-50"
    >
      <span className={value ? "text-gray-900" : "text-gray-400"}>
        {value || placeholder || ""}
      </span>

      {/* simple inline SVG calendar icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        className="shrink-0 text-gray-500"
      >
        <path
          d="M7 3v2M17 3v2M4 9h16M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

export default function AsignacionesPage() {
  const { t } = useTranslation();
  const { loading, isAuthenticated, user, currentOrg } = useAuth();
  const orgId = useMemo(() => currentOrg?.id || null, [currentOrg?.id]);

  const [rows, setRows] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [estadoFilter, setEstadoFilter] = useState("todos");

  // Form
  const [selectedPersonalId, setSelectedPersonalId] = useState("");
  const [selectedGeofenceId, setSelectedGeofenceId] = useState("");

  // ✅ Date objects for DatePicker
  const [startDt, setStartDt] = useState(nowDate());
  const [endDt, setEndDt] = useState(plusDays(365));

  const [active, setActive] = useState(true);
  const [editingKey, setEditingKey] = useState(null);

  const [personalOptions, setPersonalOptions] = useState([]);
  const [geofenceOptions, setGeofenceOptions] = useState([]);

  const debugEnabled = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("debug") === "1";
    } catch {
      return false;
    }
  }, []);

  const [debugInfo, setDebugInfo] = useState({
    personalCount: 0,
    geofenceCount: 0,
    assignmentCount: 0,
    geofenceSelectError: null,
    orgIdUsed: null,
  });

  function resetForm() {
    setSelectedPersonalId("");
    setSelectedGeofenceId("");
    setStartDt(nowDate());
    setEndDt(plusDays(365));
    setActive(true);
    setEditingKey(null);
  }

  async function loadAll() {
    setLoadingData(true);
    setError(null);
    setSuccessMessage(null);

    if (!orgId) {
      setRows([]);
      setPersonalOptions([]);
      setGeofenceOptions([]);
      setLoadingData(false);
      setError("No hay organización activa (currentOrg).");
      return;
    }

    try {
      // 1) Personal
      const pRes = await supabase
        .from("personal")
        .select("id, org_id, nombre, apellido, email, user_id, is_deleted")
        .eq("org_id", orgId)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .order("nombre", { ascending: true });

      if (pRes.error) throw pRes.error;

      const personal = (pRes.data || [])
        .map((p) => ({
          id: p.id,
          org_id: p.org_id,
          user_id: p.user_id || null,
          label:
            `${(p.nombre || "").trim()} ${(p.apellido || "").trim()}`.trim() ||
            p.email ||
            p.id,
          email: p.email || "",
        }))
        .filter((p) => !!p.user_id);

      const personalDedup = dedupeById(personal);
      setPersonalOptions(personalDedup);

      // 2) Geofences (doble filtro)
      let geofenceSelectError = null;

      const gRes = await supabase
        .from("geofences")
        .select("id, org_id, name, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (gRes.error) {
        geofenceSelectError = gRes.error.message;
      }

      const rawGeofences = (gRes.data || []).map((g) => ({
        id: g.id,
        org_id: g.org_id,
        label: g.name || g.id,
      }));

      const geofences = rawGeofences.filter((g) => g.org_id === orgId);
      const geofencesDedup = dedupeById(geofences);
      setGeofenceOptions(geofencesDedup);

      if (selectedGeofenceId && !geofencesDedup.some((g) => g.id === selectedGeofenceId)) {
        setSelectedGeofenceId("");
      }

      // 3) Assignments
      const taRes = await supabase
        .from("tracker_assignments")
        .select("id, org_id, tracker_user_id, geofence_id, start_date, end_date, active, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (taRes.error) throw taRes.error;

      setRows(taRes.data || []);

      setDebugInfo({
        personalCount: personalDedup.length,
        geofenceCount: geofencesDedup.length,
        assignmentCount: (taRes.data || []).length,
        geofenceSelectError,
        orgIdUsed: orgId,
      });

      setLoadingData(false);
    } catch (e) {
      setLoadingData(false);
      setError(e?.message || String(e));
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || !user) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAuthenticated, user?.id, orgId]);

  const enriched = useMemo(() => {
    const geoMap = new Map((geofenceOptions || []).map((g) => [g.id, g]));
    const perByUser = new Map((personalOptions || []).map((p) => [p.user_id, p]));

    const base = Array.isArray(rows) ? rows : [];
    const filtered =
      estadoFilter === "todos"
        ? base
        : base.filter((r) => (r.active ? "activa" : "inactiva") === estadoFilter);

    return filtered.map((r) => {
      const geo = geoMap.get(r.geofence_id) || null;
      const per = perByUser.get(r.tracker_user_id) || null;

      return {
        ...r,
        estado: r.active ? "activa" : "inactiva",
        geofence_nombre: geo?.label || "",
        personal_label: per?.label || "",
        personal_email: per?.email || "",
      };
    });
  }, [rows, geofenceOptions, personalOptions, estadoFilter]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!orgId) return setError("No hay organización activa.");
    if (!selectedPersonalId) return setError("Selecciona una persona.");
    if (!selectedGeofenceId) return setError("Selecciona una geocerca.");
    if (!startDt || !endDt) return setError("Selecciona inicio y fin (fecha y hora).");

    const p = personalOptions.find((x) => x.id === selectedPersonalId);
    const trackerUserId = p?.user_id || null;
    if (!trackerUserId) return setError("La persona seleccionada no tiene user_id (tracker_user_id).");

    const startDate = toDateOnlyFromDate(startDt);
    const endDate = toDateOnlyFromDate(endDt);

    if (!startDate || !endDate) return setError("No se pudo convertir fecha/hora a fecha válida.");
    if (String(endDate) < String(startDate)) return setError("La fecha fin debe ser >= fecha inicio.");

    try {
      const { data, error: rpcErr } = await supabase.rpc("admin_upsert_tracker_assignment_v1", {
        p_org_id: orgId,
        p_tracker_user_id: trackerUserId,
        p_geofence_id: selectedGeofenceId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_active: !!active,
      });

      if (rpcErr) throw rpcErr;

      setSuccessMessage(editingKey ? "Asignación actualizada." : "Asignación creada/actualizada.");
      resetForm();
      await loadAll();

      if (debugEnabled) console.log("RPC result:", data);
    } catch (e2) {
      setError(e2?.message || String(e2));
    }
  }

  async function handleToggleActive(row) {
    setError(null);
    setSuccessMessage(null);

    try {
      const { error: rpcErr } = await supabase.rpc("admin_upsert_tracker_assignment_v1", {
        p_org_id: orgId,
        p_tracker_user_id: row.tracker_user_id,
        p_geofence_id: row.geofence_id,
        p_start_date: row.start_date,
        p_end_date: row.end_date,
        p_active: !row.active,
      });

      if (rpcErr) throw rpcErr;

      setSuccessMessage(!row.active ? "Asignación activada." : "Asignación pausada.");
      await loadAll();
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  function onEditRow(r) {
    setEditingKey(r.id);

    const per = personalOptions.find((p) => p.user_id === r.tracker_user_id);
    setSelectedPersonalId(per?.id || "");

    setSelectedGeofenceId(r.geofence_id || "");

    // DB guarda date, pero a UX le damos hora por defecto
    setStartDt(parseDateLoose(r.start_date) || nowDate());
    setEndDt(parseDateLoose(r.end_date) || plusDays(365));

    setActive(!!r.active);

    setError(null);
    setSuccessMessage(null);
  }

  const noGeofences = !loadingData && (geofenceOptions?.length || 0) === 0;

  if (loading) {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <div className="border rounded px-4 py-3 text-sm text-gray-600">Cargando…</div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <div className="border rounded bg-red-50 px-4 py-3 text-sm text-red-700">Debes iniciar sesión.</div>
      </div>
    );
  }

  return (
    <div className="w-full p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">{t("asignaciones.title", { defaultValue: "Asignaciones" })}</h1>
        <p className="text-xs text-gray-500 mt-1">
          Org actual: <span className="font-medium">{currentOrg?.name || "—"}</span>{" "}
          <span className="text-gray-400">({currentOrg?.id || "—"})</span>
        </p>
      </div>

      {error && <div className="mb-4 border rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {successMessage && (
        <div className="mb-4 border rounded bg-green-50 px-3 py-2 text-sm text-green-700">{successMessage}</div>
      )}

      {noGeofences && (
        <div className="mb-4 border rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          No hay geocercas para esta org ({shortId(orgId)}). Si en “Geocerca” ves otras, estás en otra organización.
          {debugEnabled && debugInfo.geofenceSelectError ? (
            <div className="text-xs mt-2">
              Error SELECT geofences: <b>{debugInfo.geofenceSelectError}</b>
            </div>
          ) : null}
        </div>
      )}

      <div className="mb-6 border rounded-lg bg-white shadow-sm p-4">
        <h2 className="text-lg font-semibold mb-4">{editingKey ? "Editar asignación" : "Nueva asignación"}</h2>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col">
            <label htmlFor="personal_id" className="mb-1 font-medium text-sm">
              Tracker (Persona)
            </label>
            <select
              id="personal_id"
              name="personal_id"
              className="border rounded px-3 py-2"
              value={selectedPersonalId}
              onChange={(e) => setSelectedPersonalId(e.target.value)}
              required
              autoComplete="off"
            >
              <option value="">Selecciona un tracker</option>
              {personalOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Se usa personal.user_id como tracker_user_id.</p>
          </div>

          <div className="flex flex-col">
            <label htmlFor="geofence_id" className="mb-1 font-medium text-sm">
              Geocerca (Geofence)
            </label>
            <select
              id="geofence_id"
              name="geofence_id"
              className="border rounded px-3 py-2"
              value={selectedGeofenceId}
              onChange={(e) => setSelectedGeofenceId(e.target.value)}
              required
              autoComplete="off"
            >
              <option value="">Selecciona una geocerca</option>
              {geofenceOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label} — ({shortId(g.org_id)})
                </option>
              ))}
            </select>
          </div>

          {/* ✅ Calendar icon DatePicker */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">Inicio (fecha + hora)</label>
            <DatePicker
              selected={startDt}
              onChange={(d) => setStartDt(d || null)}
              showTimeSelect
              timeIntervals={15}
              timeCaption="Hora"
              dateFormat="dd/MM/yyyy HH:mm"
              customInput={
                <CalendarInput
                  placeholder="Selecciona inicio"
                  value={startDt ? startDt.toLocaleString() : ""}
                />
              }
            />
          </div>

          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">Fin (fecha + hora)</label>
            <DatePicker
              selected={endDt}
              onChange={(d) => setEndDt(d || null)}
              showTimeSelect
              timeIntervals={15}
              timeCaption="Hora"
              dateFormat="dd/MM/yyyy HH:mm"
              minDate={startDt || undefined}
              customInput={
                <CalendarInput
                  placeholder="Selecciona fin"
                  value={endDt ? endDt.toLocaleString() : ""}
                />
              }
            />
            <p className="text-xs text-gray-500 mt-1">
              DB guarda solo fecha (YYYY-MM-DD). La hora es para UX; se recorta al guardar.
            </p>
          </div>

          <div className="flex flex-col">
            <label htmlFor="active" className="mb-1 font-medium text-sm">
              Estado
            </label>
            <select
              id="active"
              name="active"
              className="border rounded px-3 py-2"
              value={active ? "activa" : "inactiva"}
              onChange={(e) => setActive(e.target.value === "activa")}
              autoComplete="off"
            >
              <option value="activa">Activa</option>
              <option value="inactiva">Inactiva</option>
            </select>
          </div>

          <div className="md:col-span-2 flex flex-wrap gap-3 mt-2">
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
              disabled={loadingData}
            >
              {editingKey ? "Actualizar" : "Guardar"}
            </button>

            {editingKey && (
              <button type="button" onClick={resetForm} className="border px-4 py-2 rounded">
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <label htmlFor="estado_filter" className="font-medium">
          Estado
        </label>
        <select
          id="estado_filter"
          name="estado_filter"
          className="border rounded px-3 py-2"
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          autoComplete="off"
        >
          {ESTADOS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {debugEnabled && (
        <div className="mb-4 border rounded bg-gray-50 p-3 text-xs overflow-auto">
          <div className="font-semibold mb-2">DEBUG</div>
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(
              {
                orgId,
                debugInfo,
                geofenceOptionsSample: geofenceOptions?.[0] || null,
              },
              null,
              2
            )}
          </pre>
        </div>
      )}

      <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold">Asignaciones (tracker_assignments)</div>

        {loadingData ? (
          <div className="p-4 text-sm text-gray-600">Cargando asignaciones…</div>
        ) : enriched.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">No hay asignaciones.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2">Tracker</th>
                  <th className="text-left px-3 py-2">Geocerca</th>
                  <th className="text-left px-3 py-2">Inicio</th>
                  <th className="text-left px-3 py-2">Fin</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-left px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.personal_label || r.tracker_user_id}</div>
                      <div className="text-xs text-gray-500">{r.personal_email || ""}</div>
                    </td>
                    <td className="px-3 py-2">{r.geofence_nombre || r.geofence_id}</td>
                    <td className="px-3 py-2">{r.start_date}</td>
                    <td className="px-3 py-2">{r.end_date}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          r.active
                            ? "inline-flex px-2 py-1 rounded bg-green-50 text-green-700"
                            : "inline-flex px-2 py-1 rounded bg-gray-100 text-gray-700"
                        }
                      >
                        {r.estado}
                      </span>
                    </td>
                    <td className="px-3 py-2 flex gap-2">
                      <button className="border rounded px-2 py-1 hover:bg-gray-50" onClick={() => onEditRow(r)}>
                        Editar
                      </button>
                      <button
                        className="border rounded px-2 py-1 hover:bg-gray-50"
                        onClick={() => handleToggleActive(r)}
                      >
                        {r.active ? "Pausar" : "Activar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
