// src/pages/AsignacionesPage.jsx
// DEFINITIVO: ASIGNACIONES resiliente
// - Bundle como fuente primaria
// - Normaliza campos (start_time/end_time/frecuencia_envio_sec)
// - Enrichment: geocerca/activity/person resueltos por ID
// - Auto-fallback y merge de catálogos si faltan IDs referenciados

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
  (Array.isArray(arr) ? arr : []).forEach((x) => {
    if (x?.id) m.set(x.id, x);
  });
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

async function fetchActivitiesFallback() {
  // Intento universal: si existe endpoint canónico /api/activities lo usamos
  // Si no existe, no rompe la página.
  try {
    const j = await fetchJson("/api/activities?onlyActive=1&limit=2000");
    const rows = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : Array.isArray(j?.data) ? j.data : [];
    return dedupeById(
      rows
        .map((a) => ({
          ...a,
          id: a.id,
          name: (a.name || a.nombre || "").trim() || a.id,
        }))
        .filter((a) => a?.id)
    );
  } catch {
    return null;
  }
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

  return dedupeById(
    normalized
      .map((p) => ({
        ...p,
        id: p.id,
        nombre: p.nombre || "",
        apellido: p.apellido || "",
        email: p.email || "",
      }))
      .filter((p) => p?.id)
  );
}

// Normaliza asignaciones aunque el backend cambie nombres
function normalizeAsignacionRow(a) {
  if (!a || typeof a !== "object") return a;

  const start =
    a.start_time ||
    a.inicio ||
    a.start ||
    a.fecha_inicio ||
    a.startTime ||
    null;

  const end =
    a.end_time ||
    a.fin ||
    a.end ||
    a.fecha_fin ||
    a.endTime ||
    null;

  let freqSec = a.frecuencia_envio_sec ?? a.freq_sec ?? null;
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
      setError(
        error.message ||
          t("asignaciones.messages.loadError", { defaultValue: "Error loading assignments." })
      );
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

    // ✅ Normaliza asignaciones (campos)
    const rows = rowsRaw.map(normalizeAsignacionRow);
    setAsignaciones(rows);

    // Personal
    const normalizedPersonal = normalizePersonalFromBundle(catalogs);
    setPersonalOptions(normalizedPersonal);

    // Geocercas
    const bundleGeos = normalizeGeocercas(catalogs.geocercas);
    setGeocercaOptions(bundleGeos);

    // Activities
    const acts = Array.isArray(catalogs.activities) ? dedupeById(catalogs.activities) : [];
    setActivityOptions(acts);

    // ✅ Auto-ensure: si faltan geocercas/activities referenciadas, hacemos fallback y merge
    const referencedGeoIds = new Set(rows.map((a) => a.geocerca_id).filter(Boolean));
    const referencedActIds = new Set(rows.map((a) => a.activity_id).filter(Boolean));

    const geoMap = toIdMap(bundleGeos);
    const actMap = toIdMap(acts);

    const missingGeo = Array.from(referencedGeoIds).some((id) => !geoMap.has(id));
    const missingAct = Array.from(referencedActIds).some((id) => !actMap.has(id));

    if (bundleGeos.length === 0 || missingGeo) {
      try {
        const geos = await fetchGeocercasFallback();
        if (geos?.length) {
          // merge
          const merged = dedupeById([...geos, ...bundleGeos]);
          setGeocercaOptions(merged);
        }
      } catch (e) {
        console.warn("[AsignacionesPage] geocercas fallback failed:", e?.message || e);
      }
    }

    if (acts.length === 0 || missingAct) {
      const activities = await fetchActivitiesFallback();
      if (activities?.length) {
        const merged = dedupeById([...activities, ...acts]);
        setActivityOptions(merged);
      }
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

  // ✅ ENRICHMENT FINAL (siempre)
  const enrichedAsignaciones = useMemo(() => {
    const geoMap = toIdMap(geocercaOptions);
    const actMap = toIdMap(activityOptions);
    const perMap = toIdMap(personalOptions);

    return (Array.isArray(filteredAsignaciones) ? filteredAsignaciones : []).map((a0) => {
      const a = normalizeAsignacionRow(a0);

      const geocerca = a.geocerca || geoMap.get(a.geocerca_id) || null;
      const activity = a.activity || actMap.get(a.activity_id) || null;
      const personal = a.personal || perMap.get(a.personal_id) || null;

      return {
        ...a,
        geocerca,
        activity,
        personal,
        geocerca_nombre:
          a.geocerca_nombre || geocerca?.nombre || geocerca?.name || (a.geocerca_id ? String(a.geocerca_id).slice(0, 8) : ""),
        activity_name:
          a.activity_name || activity?.name || activity?.nombre || (a.activity_id ? String(a.activity_id).slice(0, 8) : ""),
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
      setError(t("asignaciones.messages.noOrg", { defaultValue: "No active organization." }));
      return;
    }

    if (!selectedPersonalId || !selectedGeocercaId) {
      setError(
        t("asignaciones.messages.selectPersonAndFence", {
          defaultValue: "You must select a person and a geofence.",
        })
      );
      return;
    }

    if (!selectedActivityId) {
      setError(
        t("asignaciones.error.missingActivity", {
          defaultValue: "You must select an activity.",
        })
      );
      return;
    }

    if (!startTime || !endTime) {
      setError(
        t("asignaciones.messages.selectDates", {
          defaultValue: "You must enter start and end date/time.",
        })
      );
      return;
    }

    const freqMin = Number(frecuenciaEnvioMin) || 0;
    if (freqMin < 5) {
      setError(
        t("asignaciones.messages.frequencyTooLow", {
          defaultValue: "The minimum allowed frequency is 5 minutes.",
        })
      );
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

    const resp = editingId ? await updateAsignacion(editingId, payload) : await createAsignacion(payload);

    if (resp.error) {
      console.error("[AsignacionesPage] save error:", resp.error);
      setError(
        resp.error.message ||
          t("asignaciones.messages.saveGenericError", { defaultValue: "Error saving assignment." })
      );
      return;
    }

    setSuccessMessage(
      editingId
        ? t("asignaciones.banner.updated", { defaultValue: "Assignment updated." })
        : t("asignaciones.banner.created", { defaultValue: "Assignment created successfully." })
    );

    resetForm();
    await loadAll();
  }

  if (!ready) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          {t("asignaciones.messages.loadingData", { defaultValue: "Loading assignment data…" })}
        </div>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("asignaciones.messages.noOrg", { defaultValue: "No active organization." })}
        </div>
      </div>
    );
  }

  const labelForEstado = (v) => {
    if (v === "todos") return t("asignaciones.filters.status.todos", { defaultValue: "All" });
    if (v === "activa") return t("asignaciones.filters.status.activo", { defaultValue: "Active" });
    if (v === "inactiva") return t("asignaciones.filters.status.inactivo", { defaultValue: "Inactive" });
    return v;
  };

  return (
    <div className="w-full">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">{t("asignaciones.title", { defaultValue: "Asignaciones" })}</h1>
        <p className="text-xs text-gray-500 mt-1">
          {t("asignaciones.currentOrgLabel", { defaultValue: "Org actual" })}:{" "}
          <span className="font-medium">{currentOrg?.name || currentOrg?.id || "—"}</span>
        </p>
      </div>

      <div className="mb-6 border rounded-lg bg-white shadow-sm p-4">
        <h2 className="text-lg font-semibold mb-4">
          {editingId
            ? t("asignaciones.form.editTitle", { defaultValue: "Editar asignación" })
            : t("asignaciones.form.newTitle", { defaultValue: "Nueva asignación" })}
        </h2>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Persona */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.personLabel", { defaultValue: "Persona" })}</label>
            <select className="border rounded px-3 py-2" value={selectedPersonalId} onChange={(e) => setSelectedPersonalId(e.target.value)} required>
              <option value="">{t("asignaciones.form.personPlaceholder", { defaultValue: "Selecciona una persona" })}</option>
              {personalOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.nombre || ""} ${p.apellido || ""}`.trim()}
                </option>
              ))}
            </select>
          </div>

          {/* Geocerca */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.geofenceLabel", { defaultValue: "Geocerca" })}</label>
            <select className="border rounded px-3 py-2" value={selectedGeocercaId} onChange={(e) => setSelectedGeocercaId(e.target.value)} required>
              <option value="">{t("asignaciones.form.geofencePlaceholder", { defaultValue: "Selecciona una geocerca" })}</option>
              {geocercaOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre || g.id}
                </option>
              ))}
            </select>
          </div>

          {/* Actividad */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.activityLabel", { defaultValue: "Actividad" })}</label>
            <select
              className="border rounded px-3 py-2"
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
              required
              disabled={activityOptions.length === 0}
            >
              <option value="">{t("asignaciones.form.activityPlaceholder", { defaultValue: "Selecciona una actividad" })}</option>
              {activityOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.nombre || a.id}
                </option>
              ))}
            </select>
          </div>

          {/* Inicio */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.startLabel", { defaultValue: "Inicio" })}</label>
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
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                aria-label="Abrir calendario"
                title="Abrir calendario"
              >
                <CalendarIcon />
              </button>
            </div>
          </div>

          {/* Fin */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.endLabel", { defaultValue: "Fin" })}</label>
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
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                aria-label="Abrir calendario"
                title="Abrir calendario"
              >
                <CalendarIcon />
              </button>
            </div>
          </div>

          {/* Estado */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.statusLabel", { defaultValue: "Estado" })}</label>
            <select className="border rounded px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="activa">{t("asignaciones.form.statusActive", { defaultValue: "Activa" })}</option>
              <option value="inactiva">{t("asignaciones.form.statusInactive", { defaultValue: "Inactiva" })}</option>
            </select>
          </div>

          {/* Frecuencia */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium text-sm">{t("asignaciones.form.frequencyLabel", { defaultValue: "Frecuencia (min)" })}</label>
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
              disabled={loading || activityOptions.length === 0 || personalOptions.length === 0 || geocercaOptions.length === 0}
            >
              {editingId ? "Actualizar" : "Guardar"}
            </button>

            {editingId && (
              <button type="button" onClick={() => setEditingId(null)} className="border px-4 py-2 rounded">
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
          if (resp.error) {
            setError("No se pudo eliminar.");
          } else {
            setSuccessMessage("Asignación eliminada.");
            loadAll();
          }
        }}
      />
    </div>
  );
}
