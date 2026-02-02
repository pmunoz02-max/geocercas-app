// src/pages/AsignacionesPage.jsx
// Asignaciones v2.1 (Feb 2026) — Tracker Assignments reales
// - Source of truth: public.tracker_assignments + public.geofences + public.personal
// - personal: se selecciona persona (personal.id) pero se usa tracker_user_id (personal.user_id)
// - RLS-safe: lecturas planas sin joins; enrichment en frontend
// - CRUD via RPC: admin_upsert_tracker_assignment_v1 (idempotente)
// - end_date NOT NULL (se usa rango por fechas en DB)
// - UI: datetime-local (fecha+hora) y se convierte a date (YYYY-MM-DD) al guardar
// - Debug opcional: /asignaciones?debug=1

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";

const ESTADOS = ["todos", "activa", "inactiva"];

function dedupeById(arr) {
  const map = new Map();
  (Array.isArray(arr) ? arr : []).forEach((x) => {
    if (!x?.id) return;
    if (!map.has(x.id)) map.set(x.id, x);
  });
  return Array.from(map.values());
}

/**
 * Para inputs:
 * - date: "YYYY-MM-DD"
 * - datetime-local: "YYYY-MM-DDTHH:mm"
 */
function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateOnly(value) {
  if (!value) return "";
  const s = String(value);
  // "YYYY-MM-DDTHH:mm:ssZ" o "YYYY-MM-DDTHH:mm"
  if (s.includes("T")) return s.slice(0, 10);
  // "YYYY-MM-DD HH:mm:ss"
  if (s.includes(" ")) return s.split(" ")[0].slice(0, 10);
  // "YYYY-MM-DD"
  return s.slice(0, 10);
}

function toDateTimeLocalInput(value) {
  if (!value) return "";
  const s = String(value);

  // Si ya viene en formato datetime
  if (s.includes("T")) {
    // "YYYY-MM-DDTHH:mm:ssZ" -> "YYYY-MM-DDTHH:mm"
    return s.slice(0, 16);
  }
  if (s.includes(" ")) {
    // "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm"
    const [d, t] = s.split(" ");
    return `${d.slice(0, 10)}T${t.slice(0, 5)}`;
  }

  // Si solo viene date: completar hora 08:00 (neutro) para UX
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T08:00`;

  return "";
}

function nowDateTimeLocal() {
  const d = new Date();
  // datetime-local requiere local time, sin Z
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

function plusDaysDateTimeLocal(days) {
  const d = new Date(Date.now() + days * 24 * 3600 * 1000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
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

  // Form (selecciona personal.id pero guardamos tracker_user_id real)
  const [selectedPersonalId, setSelectedPersonalId] = useState("");
  const [selectedGeofenceId, setSelectedGeofenceId] = useState("");

  // UI fecha+hora (datetime-local) pero DB es date: convertimos en submit
  const [startDateTime, setStartDateTime] = useState(nowDateTimeLocal());
  const [endDateTime, setEndDateTime] = useState(plusDaysDateTimeLocal(365));

  const [active, setActive] = useState(true);
  const [editingKey, setEditingKey] = useState(null); // id de tracker_assignments

  const [personalOptions, setPersonalOptions] = useState([]);
  const [geofenceOptions, setGeofenceOptions] = useState([]);

  // Debug info
  const [debugInfo, setDebugInfo] = useState({
    personalCount: 0,
    geofenceCount: 0,
    assignmentCount: 0,
    geofenceQueryTried: "",
    geofenceError: null,
  });

  const debugEnabled = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("debug") === "1";
    } catch {
      return false;
    }
  }, []);

  function resetForm() {
    setSelectedPersonalId("");
    setSelectedGeofenceId("");
    setStartDateTime(nowDateTimeLocal());
    setEndDateTime(plusDaysDateTimeLocal(365));
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
      // 1) Catálogo personal (incluye user_id real del tracker)
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
        // para asignar tracker, necesitamos user_id
        .filter((p) => !!p.user_id);

      const personalDedup = dedupeById(personal);
      setPersonalOptions(personalDedup);

      // 2) Catálogo geofences (source of truth)
      // En algunos despliegues antiguos, el campo de org puede llamarse organization_id.
      // Intentamos org_id primero (correcto actual). Si falla por columna, intentamos organization_id.
      let geofencesData = null;
      let geofenceQueryTried = "org_id";
      let geofenceError = null;

      const gRes1 = await supabase
        .from("geofences")
        .select("id, org_id, name, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (!gRes1.error) {
        geofencesData = gRes1.data || [];
      } else {
        // fallback si la columna org_id no existe o si hay un esquema distinto
        geofenceError = gRes1.error;
        geofenceQueryTried = "organization_id (fallback)";

        const gRes2 = await supabase
          .from("geofences")
          .select("id, organization_id, name, created_at")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false });

        if (gRes2.error) {
          // si también falla, lanzamos el error más reciente
          throw gRes2.error;
        }
        geofencesData = gRes2.data || [];
      }

      const geofences = (geofencesData || []).map((g) => ({
        id: g.id,
        org_id: g.org_id || g.organization_id || null,
        label: g.name || g.id,
      }));

      const geofencesDedup = dedupeById(geofences);
      setGeofenceOptions(geofencesDedup);

      // 3) Asignaciones planas (tracker_assignments)
      const taRes = await supabase
        .from("tracker_assignments")
        .select("id, org_id, tracker_user_id, geofence_id, start_date, end_date, active, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (taRes.error) throw taRes.error;

      setRows(taRes.data || []);

      // Debug info
      setDebugInfo({
        personalCount: personalDedup.length,
        geofenceCount: geofencesDedup.length,
        assignmentCount: (taRes.data || []).length,
        geofenceQueryTried,
        geofenceError: geofenceError ? geofenceError.message : null,
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

  // Enrichment frontend
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
    if (!startDateTime || !endDateTime) return setError("Selecciona inicio y fin (fecha y hora).");

    const p = personalOptions.find((x) => x.id === selectedPersonalId);
    const trackerUserId = p?.user_id || null;
    if (!trackerUserId) return setError("La persona seleccionada no tiene user_id (tracker_user_id).");

    const startDate = toDateOnly(startDateTime);
    const endDate = toDateOnly(endDateTime);

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
    // DB guarda date; en UI lo mostramos con hora “08:00”
    setStartDateTime(toDateTimeLocalInput(r.start_date));
    setEndDateTime(toDateTimeLocalInput(r.end_date));
    setActive(!!r.active);

    setError(null);
    setSuccessMessage(null);
  }

  const noGeofences = !loadingData && (geofenceOptions?.length || 0) === 0;
  const noPersonal = !loadingData && (personalOptions?.length || 0) === 0;

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
          Org actual: <span className="font-medium">{currentOrg?.name || currentOrg?.id || "—"}</span>
        </p>
      </div>

      {error && <div className="mb-4 border rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {successMessage && (
        <div className="mb-4 border rounded bg-green-50 px-3 py-2 text-sm text-green-700">{successMessage}</div>
      )}

      {(noGeofences || noPersonal) && (
        <div className="mb-4 border rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          {noPersonal && (
            <div className="mb-1">
              No hay trackers disponibles para asignar (o RLS no permite ver <code>personal</code> con <code>user_id</code>).
            </div>
          )}
          {noGeofences && (
            <div>
              No hay geocercas disponibles (o RLS no permite ver <code>geofences</code> en esta organización).
              {debugEnabled && (
                <div className="text-xs mt-2">
                  Intento geofences por: <b>{debugInfo.geofenceQueryTried}</b>
                  {debugInfo.geofenceError ? <span> — error previo: {debugInfo.geofenceError}</span> : null}
                </div>
              )}
            </div>
          )}
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
                  {g.label}
                </option>
              ))}
            </select>

            {geofenceOptions.length > 0 ? (
              <p className="text-xs text-gray-500 mt-1">{geofenceOptions.length} geocerca(s) disponibles.</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                No hay geocercas cargadas (o RLS bloquea). Prueba <code>/asignaciones?debug=1</code>.
              </p>
            )}
          </div>

          <div className="flex flex-col">
            <label htmlFor="start_dt" className="mb-1 font-medium text-sm">
              Inicio (fecha + hora)
            </label>
            <input
              id="start_dt"
              name="start_dt"
              type="datetime-local"
              className="border rounded px-3 py-2"
              value={startDateTime}
              onChange={(e) => setStartDateTime(e.target.value)}
              required
              autoComplete="off"
            />
            <p className="text-xs text-gray-500 mt-1">Se convertirá a fecha (YYYY-MM-DD) al guardar.</p>
          </div>

          <div className="flex flex-col">
            <label htmlFor="end_dt" className="mb-1 font-medium text-sm">
              Fin (fecha + hora)
            </label>
            <input
              id="end_dt"
              name="end_dt"
              type="datetime-local"
              className="border rounded px-3 py-2"
              value={endDateTime}
              onChange={(e) => setEndDateTime(e.target.value)}
              required
              autoComplete="off"
            />
            <p className="text-xs text-gray-500 mt-1">
              end_date es NOT NULL en DB. Usa fin futuro (ej. +365 días) si quieres “vigencia larga”.
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
                selectedPersonalId,
                selectedGeofenceId,
                startDateTime,
                endDateTime,
                startDate: toDateOnly(startDateTime),
                endDate: toDateOnly(endDateTime),
                enrichedSample: enriched?.[0] || null,
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
