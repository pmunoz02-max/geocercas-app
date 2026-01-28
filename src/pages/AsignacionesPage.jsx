// src/pages/AsignacionesPage.jsx
// Fix Enero 2026 (hotfix UI):
// - Root cause: catálogos (bundle) no garantizan "activities" y "personal" por org, aunque existan en DB.
// - Se refuerza bootstrap de org: usa currentOrg.id y cae a localStorage("tg_current_org_id").
// - Se agrega fallback tenant-safe a Supabase:
//    * activities por org_id + active=true
//    * people por org_id desde org_people JOIN people (modelo real: org_people.person_id -> people.id)
// - Se evita mensaje falso de "no hay actividades" cuando en realidad hubo error de query.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import {
  getAsignacionesBundle,
  createAsignacion,
  updateAsignacion,
  deleteAsignacion,
} from "../lib/asignacionesApi";
import AsignacionesTable from "../components/asignaciones/AsignacionesTable";

// ✅ Ajusta este import si tu proyecto usa otro path/nombre
import { supabase } from "../lib/supabaseClient";

function localDateTimeToISO(localDateTime) {
  if (!localDateTime) return null;
  const [d, t] = String(localDateTime).split("T");
  if (!d || !t) return null;
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return new Date(y, m - 1, day, hh, mm, 0, 0).toISOString();
}

const ESTADOS = ["todos", "activa", "inactiva"];

function CalendarIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M8 3v2M16 3v2" />
      <path d="M3 9h18" />
      <path d="M6 5h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" />
    </svg>
  );
}

function openNativePicker(inputEl) {
  if (!inputEl) return;
  try {
    if (typeof inputEl.showPicker === "function") {
      inputEl.showPicker();
      return;
    }
  } catch (_) {}
  inputEl.focus();
  inputEl.click();
}

function toIdMap(arr) {
  const m = new Map();
  (Array.isArray(arr) ? arr : []).forEach((x) => x?.id && m.set(x.id, x));
  return m;
}

function dedupeById(arr) {
  const map = new Map();
  (Array.isArray(arr) ? arr : []).forEach((x) => {
    if (!x?.id) return;
    if (!map.has(x.id)) map.set(x.id, x);
  });
  return Array.from(map.values());
}

function normalizeGeocercas(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  return dedupeById(
    arr
      .map((g) => ({
        ...g,
        id: g.id,
        nombre: (g.nombre || g.name || "").trim() || null,
      }))
      .filter((g) => g?.id)
  );
}

async function fetchJson(url) {
  const r = await fetch(url, { credentials: "include" });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = (j && j.error) || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return j;
}

async function fetchGeocercasFallback() {
  const j = await fetchJson("/api/geocercas");
  const rows = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
  return normalizeGeocercas(rows);
}

// ✅ Fallback tenant-safe para activities: directo a Supabase por org_id + active=true
async function fetchActivitiesSafeByOrg(orgId) {
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("activities")
    .select("id, name, active, org_id, created_at")
    .eq("org_id", orgId)
    .eq("active", true) // boolean REAL
    .order("name", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// ✅ Fallback adicional via API (cuando el client Supabase no trae sesión o devuelve vacío)
// Intentamos varios endpoints comunes sin romper nada si no existen (404/500).
async function fetchActivitiesApiFallback(orgId) {
  if (!orgId) return [];
  const endpoints = [
    `/api/activities?org_id=${encodeURIComponent(orgId)}`,
    `/api/activities`,
    `/api/actividades?org_id=${encodeURIComponent(orgId)}`,
    `/api/actividades`,
    `/api/catalogs/activities?org_id=${encodeURIComponent(orgId)}`,
    `/api/catalogs/activities`,
  ];

  for (const url of endpoints) {
    try {
      const j = await fetchJson(url);
      const rows = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
      // Filtra por org si viene org_id en los rows
      const filtered = rows.filter((r) => !r?.org_id || r.org_id === orgId);
      if (filtered.length) return filtered;
    } catch (_) {
      // si falla, probamos siguiente endpoint
    }
  }
  return [];
}


// ✅ Fallback adicional vía API (usa cookies/credenciales del backend)
function normalizeActivities(rows, orgId) {
  const arr = Array.isArray(rows) ? rows : [];
  return dedupeById(
    arr
      .map((a) => ({
        ...a,
        id: a.id || a.activity_id || a.activityId || null,
        name: (a.name || a.nombre || "").trim() || null,
        active: a.active ?? true,
        org_id: a.org_id || null,
      }))
      .filter((a) => a?.id)
      .filter((a) => (orgId ? (a.org_id ? a.org_id === orgId : true) : true))
      .filter((a) => a.active !== false)
  );
}

/**
 * Personal (modelo real):
 *   org_people.id = vínculo (por org)
 *   org_people.person_id -> people.id
 *
 * Nota: No asumimos a ciegas si asignaciones.personal_id apunta a org_people.id o people.id.
 * - Si ya existen asignaciones, autodetectamos el "id mode" comparando ids.
 * - Si no hay asignaciones, default: org_people.id (lo más común en multi-tenant).
 */
async function fetchPersonalSafeByOrg(orgId) {
  if (!orgId) return [];

  const { data, error } = await supabase
    .from("org_people")
    .select(
      `
      id,
      org_id,
      person_id,
      person:people (
        id,
        nombre,
        apellido,
        email
      )
    `
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row) => {
      const p = row.person || {};
      const nombre =
        `${p.nombre || ""} ${p.apellido || ""}`.trim()
          || (p.email || "").trim()
          || row.person_id;

      return {
        org_people_id: row.id,
        people_id: row.person_id,
        nombre: nombre,
        apellido: "", // ya viene embebido en "nombre" si aplica
        email: (p.email || "").trim(),
      };
    })
    .filter((x) => x.org_people_id && x.people_id);
}

function normalizePersonalFromBundle(catalogs, orgId) {
  // IMPORTANTE:
  // El bundle histórico puede traer "people/personal" globales (sin org) => eso rompe multi-tenant.
  // Por seguridad, solo aceptamos filas que tengan org_id === orgId.
  // Si no vienen con org_id, devolvemos [] para forzar fallback seguro desde org_people.

  const personal = Array.isArray(catalogs?.personal) ? catalogs.personal : [];
  const peopleLegacy = Array.isArray(catalogs?.people) ? catalogs.people : [];

  const normalized =
    personal.length > 0
      ? personal
      : peopleLegacy.map((p) => ({
          id: p.org_people_id || p.id,
          nombre: p.nombre,
          apellido: p.apellido,
          email: p.email,
          org_id: p.org_id || null,
        }));

  const cleaned = (Array.isArray(normalized) ? normalized : [])
    .map((p) => ({
      ...p,
      id: p.id,
      nombre: p.nombre || "",
      apellido: p.apellido || "",
      email: p.email || "",
      org_id: p.org_id || null,
    }))
    .filter((p) => p?.id);

  const withOrg = cleaned.filter((p) => p.org_id && p.org_id === orgId);

  // Si el bundle no es confiable (sin org_id), no lo usamos.
  return dedupeById(withOrg);
}

// Normaliza asignaciones aunque el backend cambie nombres
function normalizeAsignacionRow(a) {
  if (!a || typeof a !== "object") return a;

  const start =
    a.start_time || a.inicio || a.start || a.fecha_inicio || a.startTime || null;
  const end = a.end_time || a.fin || a.end || a.fecha_fin || a.endTime || null;

  let freqSec =
    a.frecuencia_envio_sec ?? a.frecuenciaEnvioSec ?? a.freq_sec ?? null;

  if (freqSec == null && a.frecuencia_envio_min != null) {
    const n = Number(a.frecuencia_envio_min);
    if (Number.isFinite(n)) freqSec = n * 60;
  }
  if (freqSec == null && a.freq_min != null) {
    const n = Number(a.freq_min);
    if (Number.isFinite(n)) freqSec = n * 60;
  }

  return {
    ...a,
    start_time: start,
    end_time: end,
    frecuencia_envio_sec: freqSec,
    status: a.status || a.estado || a.state || a.status_asignacion || a.status,
  };
}

function getOrgIdSafe(currentOrg) {
  return (
    currentOrg?.id ||
    localStorage.getItem("tg_current_org_id") ||
    null
  );
}

export default function AsignacionesPage() {
  const { t } = useTranslation();
  const { ready, currentOrg } = useAuth();

  // ✅ orgId robusto: currentOrg.id o localStorage
  const orgId = useMemo(() => getOrgIdSafe(currentOrg), [currentOrg]);

  const [asignaciones, setAsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [estadoFilter, setEstadoFilter] = useState("todos");

  // FORM
  const [selectedPersonalId, setSelectedPersonalId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [frecuenciaEnvioMin, setFrecuenciaEnvioMin] = useState(5);
  const [status, setStatus] = useState("activa");
  const [editingId, setEditingId] = useState(null);

  const startInputRef = useRef(null);
  const endInputRef = useRef(null);

  // CATALOGOS
  const [personalOptions, setPersonalOptions] = useState([]);
  const [geocercaOptions, setGeocercaOptions] = useState([]);
  const [activityOptions, setActivityOptions] = useState([]);

  // autodetección de qué id usa asignaciones.personal_id (org_people.id vs people.id)
  const [personalIdMode, setPersonalIdMode] = useState("org_people"); // default

  function detectPersonalIdMode(rows, safePersonalRows) {
    // Si hay asignaciones, intentamos inferir el modo:
    // - si cualquier personal_id coincide con org_people_id => org_people
    // - si coincide con people_id => people
    const ids = new Set((rows || []).map((r) => r?.personal_id).filter(Boolean));
    if (!ids.size) return "org_people";

    const orgPeopleIds = new Set((safePersonalRows || []).map((p) => p.org_people_id));
    const peopleIds = new Set((safePersonalRows || []).map((p) => p.people_id));

    for (const id of ids) {
      if (orgPeopleIds.has(id)) return "org_people";
      if (peopleIds.has(id)) return "people";
    }
    return "org_people";
  }

  async function loadAll() {
    setLoading(true);
    setError(null);

    if (!orgId) {
      setAsignaciones([]);
      setPersonalOptions([]);
      setGeocercaOptions([]);
      setActivityOptions([]);
      setLoading(false);
      setError("No hay organización activa (orgId).");
      return;
    }

    // ✅ coherencia: si currentOrg existe y localStorage no, lo setea
    try {
      const ls = localStorage.getItem("tg_current_org_id");
      if (!ls && currentOrg?.id) localStorage.setItem("tg_current_org_id", currentOrg.id);
    } catch (_) {}

    const { data, error } = await getAsignacionesBundle();
    if (error) {
      console.error("[AsignacionesPage] bundle error:", error);
      setError(error.message || "Error cargando asignaciones.");
      setAsignaciones([]);
      setPersonalOptions([]);
      setGeocercaOptions([]);
      setActivityOptions([]);
      setLoading(false);
      return;
    }

    const bundle = data || {};
    const rowsRaw = Array.isArray(bundle.asignaciones) ? bundle.asignaciones : [];
    const catalogs = bundle.catalogs || {};

    const rows = rowsRaw.map(normalizeAsignacionRow);
    setAsignaciones(rows);

    // PERSONAL desde bundle
    const normalizedPersonal = normalizePersonalFromBundle(catalogs, orgId);
    setPersonalOptions(normalizedPersonal);

    // GEOCERCAS desde bundle
    const bundleGeos = normalizeGeocercas(catalogs.geocercas);
    setGeocercaOptions(bundleGeos);

    // ACTIVITIES desde bundle (filtra por org + active)
    const bundleActsRaw = Array.isArray(catalogs.activities) ? catalogs.activities : [];
    const bundleActs = normalizeActivities(bundleActsRaw, orgId);
    setActivityOptions(bundleActs);

    // Ensure catalog contains referenced ids
    const referencedGeoIds = new Set(rows.map((a) => a.geocerca_id).filter(Boolean));
    const referencedActIds = new Set(rows.map((a) => a.activity_id).filter(Boolean));

    const geoMap = toIdMap(bundleGeos);
    const actMap = toIdMap(bundleActs);

    const missingGeo = Array.from(referencedGeoIds).some((id) => !geoMap.has(id));
    const missingAct = Array.from(referencedActIds).some((id) => !actMap.has(id));

    // Geocercas fallback
    if (bundleGeos.length === 0 || missingGeo) {
      try {
        const geos = await fetchGeocercasFallback();
        if (geos?.length) setGeocercaOptions(dedupeById([...geos, ...bundleGeos]));
      } catch (e) {
        console.warn("[AsignacionesPage] geocercas fallback failed:", e?.message || e);
      }
    }

    // Activities fallback SAFE (Supabase directo por org)
    if (true) {
      try {
        const actsSafe = await fetchActivitiesSafeByOrg(orgId);
        const actsNorm = normalizeActivities(actsSafe, orgId);

        if (actsNorm?.length) {
          setActivityOptions(dedupeById([...actsNorm, ...bundleActs]));
        } else {
          // Si Supabase devuelve vacío (posible sesión client/RLS), intentamos vía API (backend con cookies)
          const actsApi = await fetchActivitiesApiFallback(orgId);
          const actsApiNorm = normalizeActivities(actsApi, orgId);
          if (actsApiNorm?.length) setActivityOptions(dedupeById([...actsApiNorm, ...bundleActs]));
        }
      } catch (e) {
        // IMPORTANTE: si falla, NO mostrar "no hay actividades", sino error real
        console.warn("[AsignacionesPage] activities fallback failed:", e?.message || e);
        setError((prev) => prev || `Error consultando actividades: ${e?.message || e}`);
      }
    }

    // ✅ Personal tenant-safe (Supabase: org_people JOIN people)
// Siempre se usa esta fuente para evitar "personas de otra org".
// El bundle solo se usa para mantener compatibilidad, pero no para poblar el selector.
    try {
      const safeRows = await fetchPersonalSafeByOrg(orgId);
      const mode = detectPersonalIdMode(rows, safeRows);
      setPersonalIdMode(mode);

      const opts = safeRows.map((p) => ({
        id: mode === "people" ? p.people_id : p.org_people_id,
        nombre: p.nombre || "",
        apellido: "",
        email: p.email || "",
        org_people_id: p.org_people_id,
        people_id: p.people_id,
      }));

      setPersonalOptions(dedupeById(opts));
    } catch (e) {
      console.warn("[AsignacionesPage] personal safe fallback failed:", e?.message || e);
      setError((prev) => prev || `Error consultando personas: ${e?.message || e}`);
      setPersonalOptions([]); // no mostramos personas cruzadas
    }

setLoading(false);
  }

  useEffect(() => {
    if (!ready) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, orgId]);

  const filteredAsignaciones = useMemo(() => {
    let rows = Array.isArray(asignaciones) ? asignaciones : [];
    if (estadoFilter !== "todos")
      rows = rows.filter((a) => (a.status || a.estado) === estadoFilter);
    if (selectedPersonalId) rows = rows.filter((a) => a.personal_id === selectedPersonalId);
    return rows;
  }, [asignaciones, estadoFilter, selectedPersonalId]);

  // ENRICHMENT FINAL (flat-first)
  const enrichedAsignaciones = useMemo(() => {
    const geoMap = toIdMap(geocercaOptions);
    const actMap = toIdMap(activityOptions);
    const perMap = toIdMap(personalOptions);

    return (Array.isArray(filteredAsignaciones) ? filteredAsignaciones : []).map((a0) => {
      const a = normalizeAsignacionRow(a0);

      const geocerca = a.geocerca || geoMap.get(a.geocerca_id) || null;
      const activity = a.activity || actMap.get(a.activity_id) || null;
      const personal = a.personal || perMap.get(a.personal_id) || null;

      const geocercaNombre =
        a.geocerca_nombre || geocerca?.nombre || geocerca?.name || "";

      const activityName =
        a.activity_name || activity?.name || activity?.nombre || "";

      return {
        ...a,
        geocerca,
        activity,
        personal,
        geocerca_nombre: geocercaNombre,
        activity_name: activityName,
      };
    });
  }, [filteredAsignaciones, geocercaOptions, activityOptions, personalOptions]);

  function resetForm() {
    setSelectedPersonalId("");
    setSelectedGeocercaId("");
    setSelectedActivityId("");
    setStartTime("");
    setEndTime("");
    setFrecuenciaEnvioMin(5);
    setStatus("activa");
    setEditingId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!orgId) {
      setError("No hay organización activa.");
      return;
    }
    if (!selectedPersonalId || !selectedGeocercaId || !selectedActivityId) {
      setError("Selecciona persona, geocerca y actividad.");
      return;
    }
    if (!startTime || !endTime) {
      setError("Selecciona Inicio y Fin.");
      return;
    }

    const freqMin = Number(frecuenciaEnvioMin) || 0;
    if (freqMin < 5) {
      setError("La frecuencia mínima es 5 minutos.");
      return;
    }

    const payload = {
      // OJO: personal_id se envía según "modo" detectado (org_people vs people)
      personal_id: selectedPersonalId,
      geocerca_id: selectedGeocercaId,
      activity_id: selectedActivityId,
      start_time: localDateTimeToISO(startTime),
      end_time: localDateTimeToISO(endTime),
      frecuencia_envio_sec: freqMin * 60,
      status,
    };

    const resp = editingId
      ? await updateAsignacion(editingId, payload)
      : await createAsignacion(payload);

    if (resp.error) {
      setError(resp.error.message || "Error guardando asignación.");
      return;
    }

    setSuccessMessage(editingId ? "Asignación actualizada." : "Asignación creada.");
    resetForm();
    await loadAll();
  }

  if (!ready) return null;

  return (
    <div className="w-full">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">
          {t("asignaciones.title", { defaultValue: "Asignaciones" })}
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Org actual:{" "}
          <span className="font-medium">
            {currentOrg?.name || currentOrg?.id || orgId || "—"}
          </span>
          <span className="ml-2 text-gray-400">
            (idMode: {personalIdMode})
          </span>
        </p>
      </div>

      <div className="mb-6 border rounded-lg bg-white shadow-sm p-4">
        <h2 className="text-lg font-semibold mb-4">
          {editingId ? "Editar asignación" : "Nueva asignación"}
        </h2>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">Persona</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedPersonalId}
              onChange={(e) => setSelectedPersonalId(e.target.value)}
              required
            >
              <option value="">Selecciona una persona</option>
              {personalOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.nombre || ""} ${p.apellido || ""}`.trim() || p.email || p.id}
                </option>
              ))}
            </select>

            {personalOptions.length === 0 && !loading && (
              <p className="text-xs text-amber-700 mt-1">
                No hay personas visibles para esta org (o falló la consulta). Revisa el error arriba.
              </p>
            )}
          </div>

          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">Geocerca</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
              required
            >
              <option value="">Selecciona una geocerca</option>
              {geocercaOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre || g.id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">Actividad</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
              required
            >
              <option value="">Selecciona una actividad</option>
              {activityOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.id}
                </option>
              ))}
            </select>

            {/* Mensaje SOLO si realmente no hay activities y NO hubo error */}
            {activityOptions.length === 0 && !loading && !error && (
              <p className="text-xs text-amber-700 mt-1">
                No hay actividades activas para esta org. Crea una en “Actividades” o revisa que esté Active=true.
              </p>
            )}
          </div>

          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">Inicio</label>
            <div className="relative">
              <input
                ref={startInputRef}
                type="datetime-local"
                className="border rounded px-3 py-2 w-full pr-10"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => openNativePicker(startInputRef.current)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-600 hover:bg-gray-100"
              >
                <CalendarIcon />
              </button>
            </div>
          </div>

          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">Fin</label>
            <div className="relative">
              <input
                ref={endInputRef}
                type="datetime-local"
                className="border rounded px-3 py-2 w-full pr-10"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => openNativePicker(endInputRef.current)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-600 hover:bg-gray-100"
              >
                <CalendarIcon />
              </button>
            </div>
          </div>

          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">Estado</label>
            <select
              className="border rounded px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="activa">Activa</option>
              <option value="inactiva">Inactiva</option>
            </select>
          </div>

          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">Frecuencia (min)</label>
            <input
              type="number"
              className="border rounded px-3 py-2"
              min={5}
              value={frecuenciaEnvioMin}
              onChange={(e) => setFrecuenciaEnvioMin(Number(e.target.value) || 5)}
            />
          </div>

          <div className="md:col-span-2 flex flex-wrap gap-3 mt-2">
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
              disabled={loading}
            >
              {editingId ? "Actualizar" : "Guardar"}
            </button>

            {editingId && (
              <button type="button" onClick={resetForm} className="border px-4 py-2 rounded">
                Cancelar
              </button>
            )}
          </div>

          <div className="md:col-span-2">
            {successMessage && <p className="text-green-600 font-semibold">{successMessage}</p>}
            {error && <p className="text-red-600 font-semibold">{error}</p>}
          </div>
        </form>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <label className="font-medium">Estado</label>
        <select
          className="border rounded px-3 py-2"
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
        >
          {ESTADOS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <AsignacionesTable
        asignaciones={enrichedAsignaciones}
        loading={loading}
        onEdit={(a) => {
          setEditingId(a.id);
          setSelectedPersonalId(a.personal_id || "");
          setSelectedGeocercaId(a.geocerca_id || "");
          setSelectedActivityId(a.activity_id || "");
          setStartTime(a.start_time?.slice(0, 16) || "");
          setEndTime(a.end_time?.slice(0, 16) || "");
          setFrecuenciaEnvioMin(Math.max(5, Math.round((a.frecuencia_envio_sec || 300) / 60)));
          setStatus(a.status || "activa");
          setError(null);
          setSuccessMessage(null);
        }}
        onDelete={async (id) => {
          const ok = window.confirm("¿Eliminar asignación?");
          if (!ok) return;
          const resp = await deleteAsignacion(id);
          if (resp.error) setError(resp.error.message || "No se pudo eliminar.");
          else {
            setSuccessMessage("Asignación eliminada.");
            await loadAll();
          }
        }}
      />
    </div>
  );
}
