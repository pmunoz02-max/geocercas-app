// src/pages/AsignacionesPage.jsx
// Fix Enero 2026:
// - El catálogo "personal" puede venir duplicado por email (migraciones / invites). Se deduplica por email.
// - Se desactiva el fallback de /api/activities si no es tenant-safe (para evitar activities de otra org).
// - La UI renderiza desde campos planos primero (geocerca_nombre / activity_name / start_time / end_time)
//   y solo luego usa relaciones.
// - Mantiene el comportamiento actual del módulo.

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

function dedupePersonalByEmail(arr) {
  const map = new Map();
  (Array.isArray(arr) ? arr : []).forEach((p) => {
    const id = p?.id || null;
    const email = String(p?.email || "").trim().toLowerCase();
    if (!id) return;

    const key = email || id; // si no hay email, cae a id
    if (!map.has(key)) {
      map.set(key, p);
      return;
    }

    // Preferencia: si uno tiene email y el otro no, gana el que tiene email.
    const cur = map.get(key);
    const curHasEmail = String(cur?.email || "").trim().length > 0;
    const newHasEmail = String(p?.email || "").trim().length > 0;
    if (!curHasEmail && newHasEmail) map.set(key, p);
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

// IMPORTANTE:
// Desactivamos fallback /api/activities porque NO es garantía de tenant-safe.
// Si más adelante confirmas que /api/activities filtra por tenant, lo reactivamos.
async function fetchActivitiesFallback() {
  return null;
}

function normalizePersonalFromBundle(catalogs) {
  const personal = Array.isArray(catalogs?.personal) ? catalogs.personal : [];
  const peopleLegacy = Array.isArray(catalogs?.people) ? catalogs.people : [];

  const normalized =
    personal.length > 0
      ? personal
      : peopleLegacy.map((p) => ({
          id: p.org_people_id,
          nombre: p.nombre,
          apellido: p.apellido,
          email: p.email,
          org_id: p.org_id || null,
        }));

  const cleaned = normalized
    .map((p) => ({
      ...p,
      id: p.id,
      nombre: p.nombre || "",
      apellido: p.apellido || "",
      email: p.email || "",
    }))
    .filter((p) => p?.id);

  // Dedup por email (evita "2 Pietro")
  return dedupePersonalByEmail(cleaned);
}

// Normaliza asignaciones aunque el backend cambie nombres
function normalizeAsignacionRow(a) {
  if (!a || typeof a !== "object") return a;

  const start =
    a.start_time || a.inicio || a.start || a.fecha_inicio || a.startTime || null;
  const end =
    a.end_time || a.fin || a.end || a.fecha_fin || a.endTime || null;

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

export default function AsignacionesPage() {
  const { t } = useTranslation();
  const { ready, currentOrg } = useAuth();
  const orgId = currentOrg?.id || null;

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

  async function loadAll() {
    setLoading(true);
    setError(null);

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

    const normalizedPersonal = normalizePersonalFromBundle(catalogs);
    setPersonalOptions(normalizedPersonal);

    const bundleGeos = normalizeGeocercas(catalogs.geocercas);
    setGeocercaOptions(bundleGeos);

    const acts = Array.isArray(catalogs.activities) ? dedupeById(catalogs.activities) : [];
    setActivityOptions(acts);

    // Ensure catalog contains referenced ids
    const referencedGeoIds = new Set(rows.map((a) => a.geocerca_id).filter(Boolean));
    const referencedActIds = new Set(rows.map((a) => a.activity_id).filter(Boolean));

    const geoMap = toIdMap(bundleGeos);
    const actMap = toIdMap(acts);

    const missingGeo = Array.from(referencedGeoIds).some((id) => !geoMap.has(id));
    const missingAct = Array.from(referencedActIds).some((id) => !actMap.has(id));

    if (bundleGeos.length === 0 || missingGeo) {
      try {
        const geos = await fetchGeocercasFallback();
        if (geos?.length) setGeocercaOptions(dedupeById([...geos, ...bundleGeos]));
      } catch (e) {
        console.warn("[AsignacionesPage] geocercas fallback failed:", e?.message || e);
      }
    }

    if (acts.length === 0 || missingAct) {
      const activities = await fetchActivitiesFallback();
      if (activities?.length) setActivityOptions(dedupeById([...activities, ...acts]));
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!ready || !orgId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, orgId]);

  const filteredAsignaciones = useMemo(() => {
    let rows = Array.isArray(asignaciones) ? asignaciones : [];
    if (estadoFilter !== "todos") rows = rows.filter((a) => (a.status || a.estado) === estadoFilter);
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
            {currentOrg?.name || currentOrg?.id || "—"}
          </span>
        </p>
      </div>

      <div className="mb-6 border rounded-lg bg-white shadow-sm p-4">
        <h2 className="text-lg font-semibold mb-4">
          {editingId ? "Editar asignación" : "Nueva asignación"}
        </h2>

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
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
                  {`${p.nombre || ""} ${p.apellido || ""}`.trim()}
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
                  {a.name || a.nombre || a.id}
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
              <button
                type="button"
                onClick={resetForm}
                className="border px-4 py-2 rounded"
              >
                Cancelar
              </button>
            )}
          </div>

          <div className="md:col-span-2">
            {successMessage && (
              <p className="text-green-600 font-semibold">{successMessage}</p>
            )}
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
          setFrecuenciaEnvioMin(
            Math.max(5, Math.round((a.frecuencia_envio_sec || 300) / 60))
          );
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
