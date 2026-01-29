// src/pages/AsignacionesPage.jsx
// Fix definitivo Asignaciones (Enero 2026)
// - Listado RLS-safe: trae asignaciones planas + catálogos y enriquece en frontend
// - Define enrichedAsignaciones (evita ReferenceError)
// - A11y: id/name + label htmlFor
// - Debug opcional: /asignaciones?debug=1

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";
import AsignacionesTable from "../components/asignaciones/AsignacionesTable";
import { supabase } from "../lib/supabaseClient";

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

function localDateTimeToISO(localDateTime) {
  if (!localDateTime) return null;
  const [d, t] = String(localDateTime).split("T");
  if (!d || !t) return null;
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return new Date(y, m - 1, day, hh, mm, 0, 0).toISOString();
}

function localDateTimeToDate(localDateTime) {
  if (!localDateTime) return null;
  const [d] = String(localDateTime).split("T");
  return d || null;
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const s = String(value);
  if (s.includes("T")) return s.slice(0, 16);
  const parts = s.split(" ");
  if (parts.length >= 2) return `${parts[0]}T${parts[1].slice(0, 5)}`;
  return s.slice(0, 16);
}

function normalizeAsignacionRow(a) {
  if (!a || typeof a !== "object") return a;

  const start_time = a.start_time || a.inicio || a.start || a.startTime || null;
  const end_time = a.end_time || a.fin || a.end || a.endTime || null;

  let frecuencia_envio_sec =
    a.frecuencia_envio_sec ?? a.frecuenciaEnvioSec ?? a.freq_sec ?? null;

  if (frecuencia_envio_sec == null && a.frecuencia_envio_min != null) {
    const n = Number(a.frecuencia_envio_min);
    if (Number.isFinite(n)) frecuencia_envio_sec = n * 60;
  }

  return {
    ...a,
    start_time,
    end_time,
    frecuencia_envio_sec,
    status: a.status || a.estado || a.state || "inactiva",
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

  const [personalOptions, setPersonalOptions] = useState([]);
  const [geocercaOptions, setGeocercaOptions] = useState([]);
  const [activityOptions, setActivityOptions] = useState([]);

  const debugEnabled = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("debug") === "1";
    } catch {
      return false;
    }
  }, []);

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

    try {
      // Catálogos para selects + enrichment
      const [pRes, gRes, aRes] = await Promise.all([
        supabase
          .from("personal")
          .select("id, org_id, nombre, apellido, email")
          .eq("org_id", orgId)
          .order("nombre", { ascending: true }),

        supabase
          .from("geocercas")
          .select("id, nombre, org_id, created_at")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false }),

        supabase
          .from("activities")
          .select("id, name, active, org_id, created_at")
          .eq("org_id", orgId)
          .order("name", { ascending: true }),
      ]);

      if (pRes.error) throw pRes.error;
      if (gRes.error) throw gRes.error;
      if (aRes.error) throw aRes.error;

      const personal = (pRes.data || []).map((p) => ({
        id: p.id,
        org_id: p.org_id,
        nombre: `${p.nombre || ""} ${p.apellido || ""}`.trim(),
        apellido: p.apellido || "",
        email: p.email || "",
      }));

      const personalOpts = dedupeById(personal);
      const geocercaOpts = dedupeById(gRes.data || []);
      const activityOpts = dedupeById(aRes.data || []);

      setPersonalOptions(personalOpts);
      setGeocercaOptions(geocercaOpts);
      setActivityOptions(activityOpts);

      // ✅ Asignaciones PLANAS (sin joins) => RLS-safe
      const asigRes = await supabase
        .from("asignaciones")
        .select(
          `
          id, org_id, personal_id, geocerca_id, activity_id,
          start_time, end_time,
          start_date, end_date,
          frecuencia_envio_sec, status,
          created_at, is_deleted, deleted_at
        `
        )
        .eq("org_id", orgId)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .order("created_at", { ascending: false });

      if (asigRes.error) throw asigRes.error;

      setAsignaciones((asigRes.data || []).map(normalizeAsignacionRow));
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

  const filteredAsignaciones = useMemo(() => {
    let rows = Array.isArray(asignaciones) ? asignaciones : [];
    if (estadoFilter !== "todos") {
      rows = rows.filter((a) => (a.status || "inactiva") === estadoFilter);
    }
    return rows;
  }, [asignaciones, estadoFilter]);

  // ✅ AQUÍ SE DEFINE enrichedAsignaciones (antes NO existía y por eso se cayó la página)
  const enrichedAsignaciones = useMemo(() => {
    const geoMap = new Map((geocercaOptions || []).map((g) => [g.id, g]));
    const actMap = new Map((activityOptions || []).map((a) => [a.id, a]));
    const perMap = new Map((personalOptions || []).map((p) => [p.id, p]));

    return (Array.isArray(filteredAsignaciones) ? filteredAsignaciones : []).map(
      (a0) => {
        const a = normalizeAsignacionRow(a0);

        const geocerca = geoMap.get(a.geocerca_id) || null;
        const activity = actMap.get(a.activity_id) || null;
        const personal = perMap.get(a.personal_id) || null;

        return {
          ...a,

          personal,
          geocerca,
          activity,

          geocerca_nombre: geocerca?.nombre || "",
          activity_name: activity?.name || "",

          // legacy fallback keys por si la tabla vieja las busca
          inicio: a.start_time || a.start_date || null,
          fin: a.end_time || a.end_date || null,
          freq_min:
            a.frecuencia_envio_sec != null
              ? Math.round(Number(a.frecuencia_envio_sec) / 60)
              : null,
        };
      }
    );
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
    if (!selectedPersonalId || !selectedGeocercaId || !selectedActivityId) {
      return setError("Selecciona persona, geocerca y actividad.");
    }
    if (!startTime || !endTime) return setError("Selecciona Inicio y Fin.");

    const freqMin = Number(frecuenciaEnvioMin) || 0;
    if (freqMin < 5) return setError("La frecuencia mínima es 5 minutos.");

    const payload = {
      org_id: orgId,
      personal_id: selectedPersonalId,
      geocerca_id: selectedGeocercaId,
      activity_id: selectedActivityId,
      start_time: localDateTimeToISO(startTime),
      end_time: localDateTimeToISO(endTime),
      start_date: localDateTimeToDate(startTime),
      end_date: localDateTimeToDate(endTime),
      frecuencia_envio_sec: freqMin * 60,
      status,
    };

    try {
      if (editingId) {
        const { error: upErr } = await supabase
          .from("asignaciones")
          .update(payload)
          .eq("id", editingId);
        if (upErr) throw upErr;
        setSuccessMessage("Asignación actualizada.");
      } else {
        const { error: inErr } = await supabase.from("asignaciones").insert(payload);
        if (inErr) throw inErr;
        setSuccessMessage("Asignación creada.");
      }

      resetForm();
      await loadAll();
    } catch (e2) {
      setError(e2?.message || String(e2));
    }
  }

  async function handleDelete(id) {
    const ok = window.confirm("¿Eliminar asignación?");
    if (!ok) return;

    try {
      const { error: delErr } = await supabase
        .from("asignaciones")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", id);

      if (delErr) {
        const { error: hardErr } = await supabase
          .from("asignaciones")
          .delete()
          .eq("id", id);
        if (hardErr) throw hardErr;
      }

      setSuccessMessage("Asignación eliminada.");
      await loadAll();
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  if (loading) {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <div className="border rounded px-4 py-3 text-sm text-gray-600">
          Cargando…
        </div>
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
          Org actual:{" "}
          <span className="font-medium">
            {currentOrg?.name || currentOrg?.id || "—"}
          </span>
        </p>
      </div>

      {error && (
        <div className="mb-4 border rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
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

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div className="flex flex-col">
            <label htmlFor="personal_id" className="mb-1 font-medium text-sm">
              Persona
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
              <option value="">Selecciona una persona</option>
              {personalOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre || p.email || p.id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label htmlFor="geocerca_id" className="mb-1 font-medium text-sm">
              Geocerca
            </label>
            <select
              id="geocerca_id"
              name="geocerca_id"
              className="border rounded px-3 py-2"
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
              required
              autoComplete="off"
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
            <label htmlFor="activity_id" className="mb-1 font-medium text-sm">
              Actividad
            </label>
            <select
              id="activity_id"
              name="activity_id"
              className="border rounded px-3 py-2"
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
              required
              autoComplete="off"
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
            <label htmlFor="start_time" className="mb-1 font-medium text-sm">
              Inicio
            </label>
            <div className="relative">
              <input
                id="start_time"
                name="start_time"
                ref={startInputRef}
                type="datetime-local"
                className="border rounded px-3 py-2 w-full pr-10"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                autoComplete="off"
              />
              <button
                type="button"
                aria-label="Abrir selector de inicio"
                onClick={() => openNativePicker(startInputRef.current)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-600 hover:bg-gray-100"
              >
                <CalendarIcon />
              </button>
            </div>
          </div>

          <div className="flex flex-col">
            <label htmlFor="end_time" className="mb-1 font-medium text-sm">
              Fin
            </label>
            <div className="relative">
              <input
                id="end_time"
                name="end_time"
                ref={endInputRef}
                type="datetime-local"
                className="border rounded px-3 py-2 w-full pr-10"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                autoComplete="off"
              />
              <button
                type="button"
                aria-label="Abrir selector de fin"
                onClick={() => openNativePicker(endInputRef.current)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-600 hover:bg-gray-100"
              >
                <CalendarIcon />
              </button>
            </div>
          </div>

          <div className="flex flex-col">
            <label htmlFor="status" className="mb-1 font-medium text-sm">
              Estado
            </label>
            <select
              id="status"
              name="status"
              className="border rounded px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              autoComplete="off"
            >
              <option value="activa">Activa</option>
              <option value="inactiva">Inactiva</option>
            </select>
          </div>

          <div className="flex flex-col">
            <label htmlFor="frecuencia_min" className="mb-1 font-medium text-sm">
              Frecuencia (min)
            </label>
            <input
              id="frecuencia_min"
              name="frecuencia_min"
              type="number"
              className="border rounded px-3 py-2"
              min={5}
              value={frecuenciaEnvioMin}
              onChange={(e) => setFrecuenciaEnvioMin(Number(e.target.value) || 5)}
              autoComplete="off"
              inputMode="numeric"
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
              <button
                type="button"
                onClick={resetForm}
                className="border px-4 py-2 rounded"
              >
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
          <div className="font-semibold mb-2">DEBUG asignaciones[0]</div>
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(enrichedAsignaciones?.[0] || null, null, 2)}
          </pre>
        </div>
      )}

      <AsignacionesTable
        asignaciones={enrichedAsignaciones}
        loading={loadingData}
        onEdit={(a) => {
          setEditingId(a.id);
          setSelectedPersonalId(a.personal_id || "");
          setSelectedGeocercaId(a.geocerca_id || "");
          setSelectedActivityId(a.activity_id || "");
          setStartTime(toDatetimeLocal(a.start_time));
          setEndTime(toDatetimeLocal(a.end_time));
          setFrecuenciaEnvioMin(
            Math.max(5, Math.round((a.frecuencia_envio_sec || 300) / 60))
          );
          setStatus(a.status || "activa");
          setError(null);
          setSuccessMessage(null);
        }}
        onDelete={handleDelete}
      />
    </div>
  );
}
