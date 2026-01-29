// src/pages/AsignacionesPage.jsx
// Fix definitivo Asignaciones (Enero 2026)
// - Persona: public.personal (FK-safe: asignaciones.personal_id -> personal.id)
// - Geocercas: Supabase client (no /api 401)
// - Listado: ENRIQUECIDO (nombres + fechas) para que no salgan columnas vacías
// - Payload: manda start_time/end_time + start_date/end_date (universal y compatible)

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";
import {
  getAsignacionesBundle,
  createAsignacion,
  updateAsignacion,
  deleteAsignacion,
} from "../lib/asignacionesApi";
import AsignacionesTable from "../components/asignaciones/AsignacionesTable";
import { supabase } from "../lib/supabaseClient";

function localDateTimeToISO(localDateTime) {
  if (!localDateTime) return null;
  const [d, t] = String(localDateTime).split("T");
  if (!d || !t) return null;
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return new Date(y, m - 1, day, hh, mm, 0, 0).toISOString();
}

function localDateTimeToDate(localDateTime) {
  // "YYYY-MM-DDTHH:mm" -> "YYYY-MM-DD"
  if (!localDateTime) return null;
  const [d] = String(localDateTime).split("T");
  return d || null;
}

const ESTADOS = ["todos", "activa", "inactiva"];

function CalendarIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3v2M16 3v2" />
      <path d="M3 9h18" />
      <path d="M6 5h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" />
    </svg>
  );
}

function openNativePicker(inputEl) {
  if (!inputEl) return;
  try {
    if (typeof inputEl.showPicker === "function") return inputEl.showPicker();
  } catch (_) {}
  inputEl.focus();
  inputEl.click();
}

function dedupeById(arr) {
  const map = new Map();
  (Array.isArray(arr) ? arr : []).forEach((x) => {
    if (!x?.id) return;
    if (!map.has(x.id)) map.set(x.id, x);
  });
  return Array.from(map.values());
}

function toIdMap(arr) {
  const m = new Map();
  (Array.isArray(arr) ? arr : []).forEach((x) => x?.id && m.set(x.id, x));
  return m;
}

function normalizeGeocercas(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  return dedupeById(
    arr
      .map((g) => ({
        ...g,
        id: g.id,
        nombre: (g.nombre || g.name || "").trim() || null,
        org_id: g.org_id || null,
      }))
      .filter((g) => g?.id)
  );
}

function filterByOrg(rows, orgId) {
  const arr = Array.isArray(rows) ? rows : [];
  if (!orgId) return [];
  return arr.filter((r) => r?.org_id === orgId);
}

async function fetchGeocercasSafeByOrg(orgId) {
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("geocercas")
    .select("id, nombre, org_id, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return normalizeGeocercas(data);
}

async function fetchActivitiesSafeByOrg(orgId) {
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("activities")
    .select("id, name, active, org_id, created_at")
    .eq("org_id", orgId)
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

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
      .filter((a) => a.org_id === orgId)
      .filter((a) => a.active !== false)
  );
}

/**
 * ✅ PERSONAL CORRECTO PARA ASIGNACIONES
 * Lee SOLO de public.personal y devuelve personal.id
 */
async function fetchPersonalSafeByOrg(orgId) {
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("personal")
    .select("id, org_id, nombre, apellido, email")
    .eq("org_id", orgId)
    .order("nombre", { ascending: true });
  if (error) throw error;

  return (data || []).map((p) => ({
    id: p.id,
    nombre: `${p.nombre || ""} ${p.apellido || ""}`.trim(),
    email: p.email || "",
    org_id: p.org_id || null,
  }));
}

function normalizeAsignacionRow(a) {
  if (!a || typeof a !== "object") return a;

  const startTime = a.start_time || a.inicio || a.start || a.startTime || null;
  const endTime = a.end_time || a.fin || a.end || a.endTime || null;

  // Compat: si vienen start_date/end_date (date), mantenlos
  const startDate = a.start_date || a.fecha_inicio || null;
  const endDate = a.end_date || a.fecha_fin || null;

  let freqSec = a.frecuencia_envio_sec ?? a.frecuenciaEnvioSec ?? a.freq_sec ?? null;
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
    start_time: startTime,
    end_time: endTime,
    start_date: startDate,
    end_date: endDate,
    frecuencia_envio_sec: freqSec,
    status: a.status || a.estado || a.state || a.status_asignacion || a.status,
  };
}

export default function AsignacionesPage() {
  const { t } = useTranslation();
  const { loading, isAuthenticated, user, currentOrg } = useAuth();

  const orgId = useMemo(() => currentOrg?.id || null, [currentOrg?.id]);

  const [asignaciones, setAsignaciones] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [estadoFilter, setEstadoFilter] = useState("todos");

  const [selectedPersonalId, setSelectedPersonalId] = useState(""); // personal.id
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [frecuenciaEnvioMin, setFrecuenciaEnvioMin] = useState(5);
  const [status, setStatus] = useState("activa");
  const [editingId, setEditingId] = useState(null);

  const startInputRef = useRef(null);
  const endInputRef = useRef(null);

  const [personalOptions, setPersonalOptions] = useState([]);
  const [geocercaOptions, setGeocercaOptions] = useState([]);
  const [activityOptions, setActivityOptions] = useState([]);

  async function loadAll() {
    setLoadingData(true);
    setError(null);

    if (!orgId) {
      setAsignaciones([]);
      setPersonalOptions([]);
      setGeocercaOptions([]);
      setActivityOptions([]);
      setLoadingData(false);
      setError("No hay organización activa (currentOrg).");
      return;
    }

    try { localStorage.setItem("tg_current_org_id", orgId); } catch (_) {}

    const { data, error: bundleError } = await getAsignacionesBundle();
    if (bundleError) {
      setError(bundleError.message || "Error cargando asignaciones.");
      setLoadingData(false);
      return;
    }

    const bundle = data || {};
    const rowsRaw = Array.isArray(bundle.asignaciones) ? bundle.asignaciones : [];
    const catalogs = bundle.catalogs || {};

    setAsignaciones(rowsRaw.map(normalizeAsignacionRow));

    const bundleGeosAll = normalizeGeocercas(catalogs.geocercas);
    setGeocercaOptions(filterByOrg(bundleGeosAll, orgId));

    const bundleActsRaw = Array.isArray(catalogs.activities) ? catalogs.activities : [];
    setActivityOptions(normalizeActivities(bundleActsRaw, orgId));

    // Geocercas SAFE
    try {
      const geosSafe = await fetchGeocercasSafeByOrg(orgId);
      setGeocercaOptions(dedupeById([...geosSafe, ...filterByOrg(bundleGeosAll, orgId)]));
    } catch (e) {
      setError((prev) => prev || `Error consultando geocercas: ${e?.message || e}`);
    }

    // Activities SAFE
    try {
      const actsSafe = await fetchActivitiesSafeByOrg(orgId);
      const actsNorm = normalizeActivities(actsSafe, orgId);
      if (actsNorm?.length) setActivityOptions(dedupeById([...actsNorm, ...normalizeActivities(bundleActsRaw, orgId)]));
    } catch (e) {
      setError((prev) => prev || `Error consultando actividades: ${e?.message || e}`);
    }

    // Personal SAFE (public.personal)
    try {
      const p = await fetchPersonalSafeByOrg(orgId);
      setPersonalOptions(p);
    } catch (e) {
      setError((prev) => prev || `Error consultando personal: ${e?.message || e}`);
      setPersonalOptions([]);
    }

    setLoadingData(false);
  }

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || !user) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAuthenticated, user?.id, orgId]);

  const filteredAsignaciones = useMemo(() => {
    let rows = Array.isArray(asignaciones) ? asignaciones : [];
    if (estadoFilter !== "todos") rows = rows.filter((a) => (a.status || a.estado) === estadoFilter);
    return rows;
  }, [asignaciones, estadoFilter]);

  // ✅ ENRIQUECIMIENTO PARA LISTADO (evita columnas vacías)
  const enrichedAsignaciones = useMemo(() => {
    const geoMap = toIdMap(geocercaOptions);
    const actMap = toIdMap(activityOptions);
    const perMap = toIdMap(personalOptions);

    return (Array.isArray(filteredAsignaciones) ? filteredAsignaciones : []).map((a0) => {
      const a = normalizeAsignacionRow(a0);

      const geocerca = a.geocerca || geoMap.get(a.geocerca_id) || null;
      const activity = a.activity || actMap.get(a.activity_id) || null;
      const personal = a.personal || perMap.get(a.personal_id) || null;

      // Inicio/Fin: usa time si existe, si no usa date
      const inicio = a.start_time || a.start_date || null;
      const fin = a.end_time || a.end_date || null;

      return {
        ...a,
        geocerca,
        activity,
        personal,
        geocerca_nombre: a.geocerca_nombre || geocerca?.nombre || "",
        activity_name: a.activity_name || activity?.name || "",
        inicio,
        fin,
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

    if (!orgId) return setError("No hay organización activa.");
    if (!selectedPersonalId || !selectedGeocercaId || !selectedActivityId)
      return setError("Selecciona persona, geocerca y actividad.");
    if (!startTime || !endTime) return setError("Selecciona Inicio y Fin.");

    const freqMin = Number(frecuenciaEnvioMin) || 0;
    if (freqMin < 5) return setError("La frecuencia mínima es 5 minutos.");

    const payload = {
      personal_id: selectedPersonalId, // ✅ FK personal(id)
      geocerca_id: selectedGeocercaId,
      activity_id: selectedActivityId,

      // ✅ Precisión
      start_time: localDateTimeToISO(startTime),
      end_time: localDateTimeToISO(endTime),

      // ✅ Compatibilidad (si la tabla/listado usa DATE)
      start_date: localDateTimeToDate(startTime),
      end_date: localDateTimeToDate(endTime),

      frecuencia_envio_sec: freqMin * 60,
      status,
    };

    const resp = editingId ? await updateAsignacion(editingId, payload) : await createAsignacion(payload);
    if (resp.error) return setError(resp.error.message || "Error guardando asignación.");

    setSuccessMessage(editingId ? "Asignación actualizada." : "Asignación creada.");
    resetForm();
    await loadAll();
  }

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
        <div className="border rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          Debes iniciar sesión.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">
          {t("asignaciones.title", { defaultValue: "Asignaciones" })}
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Org actual: <span className="font-medium">{currentOrg?.name || currentOrg?.id || "—"}</span>
        </p>
      </div>

      {error && (
        <div className="mb-4 border rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {successMessage && (
        <div className="mb-4 border rounded bg-green-50 px-3 py-2 text-sm text-green-700">
          {successMessage}
        </div>
      )}

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
                  {p.nombre || p.email || p.id}
                </option>
              ))}
            </select>
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
            {geocercaOptions.length === 0 && !loadingData && !error && (
              <p className="text-xs text-amber-700 mt-1">
                Esta organización no tiene geocercas. Crea una en “Geocercas” para poder asignar.
              </p>
            )}
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
            <select className="border rounded px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
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
              disabled={loadingData}
            >
              {editingId ? "Actualizar" : "Guardar"}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="border px-4 py-2 rounded">
                Cancelar
              </button>
            )}
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
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      <AsignacionesTable
        asignaciones={enrichedAsignaciones}
        loading={loadingData}
        onEdit={(a) => {
          setEditingId(a.id);
          setSelectedPersonalId(a.personal_id || "");
          setSelectedGeocercaId(a.geocerca_id || "");
          setSelectedActivityId(a.activity_id || "");
          setStartTime(a.start_time?.slice(0, 16) || "");
          setEndTime(a.end_time?.slice(0, 16) || "");
          // Si vienen solo DATE, no rompe: dejamos vacío (usuario puede elegir)
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
