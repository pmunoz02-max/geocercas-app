// src/pages/AsignacionesPage.jsx
// Asignaciones v2.5 FINAL (Feb 2026)
// - DatePicker con icono calendario (react-datepicker v8: showIcon + icon)
// - UI usa fecha + hora | DB guarda solo DATE
// - Filtro estricto por org_id
// - Compatible con admin_upsert_tracker_assignment_v1

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

/* ---------------- helpers ---------------- */

function dedupeById(arr) {
  const m = new Map();
  (arr || []).forEach((x) => x?.id && !m.has(x.id) && m.set(x.id, x));
  return Array.from(m.values());
}

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
  const { t } = useTranslation();
  const { loading, isAuthenticated, user, currentOrg } = useAuth();
  const orgId = currentOrg?.id || null;

  const [rows, setRows] = useState([]);
  const [personalOptions, setPersonalOptions] = useState([]);
  const [geofenceOptions, setGeofenceOptions] = useState([]);

  const [selectedPersonalId, setSelectedPersonalId] = useState("");
  const [selectedGeofenceId, setSelectedGeofenceId] = useState("");

  const [startDt, setStartDt] = useState(nowDate());
  const [endDt, setEndDt] = useState(plusDays(365));
  const [active, setActive] = useState(true);

  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  /* ---------------- load ---------------- */

  async function loadAll() {
    if (!orgId) return;

    setLoadingData(true);
    setError(null);

    try {
      // Personal
      const { data: p, error: pErr } = await supabase
        .from("personal")
        .select("id, nombre, apellido, email, user_id, org_id")
        .eq("org_id", orgId);

      if (pErr) throw pErr;

      setPersonalOptions(
        dedupeById(
          (p || [])
            .filter((x) => x.user_id)
            .map((x) => ({
              id: x.id,
              user_id: x.user_id,
              label:
                `${x.nombre || ""} ${x.apellido || ""}`.trim() ||
                x.email ||
                x.id,
              email: x.email || "",
            }))
        )
      );

      // Geofences
      const { data: g, error: gErr } = await supabase
        .from("geofences")
        .select("id, name, org_id")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (gErr) throw gErr;

      setGeofenceOptions(
        dedupeById((g || []).map((x) => ({ id: x.id, label: x.name, org_id: x.org_id })))
      );

      // Assignments
      const { data: a, error: aErr } = await supabase
        .from("tracker_assignments")
        .select("*")
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

      {error && (
        <div className="mb-3 bg-red-50 border px-3 py-2 text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 bg-green-50 border px-3 py-2 text-green-700">
          {success}
        </div>
      )}

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

        <button className="bg-blue-600 text-white rounded px-4 py-2">
          Guardar
        </button>
      </form>
    </div>
  );
}
