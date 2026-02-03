// src/pages/AsignacionesPage.jsx
// Asignaciones v2.4 FINAL (Feb 2026)
// - DatePicker con icono calendario (react-datepicker + forwardRef)
// - UI usa fecha + hora | DB guarda solo DATE
// - Filtro estricto por org_id
// - Compatible con admin_upsert_tracker_assignment_v1

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

/* ---------------- helpers ---------------- */

const ESTADOS = ["todos", "activa", "inactiva"];

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

function parseDateLoose(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T08:00`);
  const d = new Date(s.includes(" ") ? s.replace(" ", "T") : s);
  return isNaN(d) ? null : d;
}

function nowDate() {
  return new Date();
}

function plusDays(days) {
  return new Date(Date.now() + days * 86400000);
}

/* ---------- Calendar input (ICONO) ---------- */

const CalendarInput = React.forwardRef(function CalendarInput(
  { value, onClick, placeholder },
  ref
) {
  return (
    <button
      type="button"
      ref={ref}
      onClick={onClick}
      className="w-full border rounded px-3 py-2 flex items-center justify-between gap-3 hover:bg-gray-50"
    >
      <span className={value ? "text-gray-900" : "text-gray-400"}>
        {value || placeholder || ""}
      </span>

      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        className="text-gray-500 shrink-0"
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
});

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

  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [editingKey, setEditingKey] = useState(null);

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
      const { data: p } = await supabase
        .from("personal")
        .select("id, nombre, apellido, email, user_id, org_id")
        .eq("org_id", orgId);

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
      const { data: g } = await supabase
        .from("geofences")
        .select("id, name, org_id")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      setGeofenceOptions(
        dedupeById((g || []).map((x) => ({ id: x.id, label: x.name, org_id: x.org_id })))
      );

      // Assignments
      const { data: a } = await supabase
        .from("tracker_assignments")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      setRows(a || []);
      setLoadingData(false);
    } catch (e) {
      setError(e.message || String(e));
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (!loading && isAuthenticated) loadAll();
  }, [loading, isAuthenticated, user?.id, orgId]);

  /* ---------------- submit ---------------- */

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedPersonalId || !selectedGeofenceId)
      return setError("Selecciona tracker y geocerca.");

    const p = personalOptions.find((x) => x.id === selectedPersonalId);
    if (!p?.user_id) return setError("Tracker sin user_id.");

    const startDate = toDateOnly(startDt);
    const endDate = toDateOnly(endDt);

    try {
      await supabase.rpc("admin_upsert_tracker_assignment_v1", {
        p_org_id: orgId,
        p_tracker_user_id: p.user_id,
        p_geofence_id: selectedGeofenceId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_active: active,
      });

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

      {error && <div className="mb-3 bg-red-50 border px-3 py-2 text-red-700">{error}</div>}
      {success && <div className="mb-3 bg-green-50 border px-3 py-2 text-green-700">{success}</div>}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 border rounded">
        <select
          className="border rounded px-3 py-2"
          value={selectedPersonalId}
          onChange={(e) => setSelectedPersonalId(e.target.value)}
        >
          <option value="">Selecciona tracker</option>
          {personalOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>

        <select
          className="border rounded px-3 py-2"
          value={selectedGeofenceId}
          onChange={(e) => setSelectedGeofenceId(e.target.value)}
        >
          <option value="">Selecciona geocerca</option>
          {geofenceOptions.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>

        <DatePicker
          selected={startDt}
          onChange={(d) => setStartDt(d)}
          showTimeSelect
          dateFormat="dd/MM/yyyy HH:mm"
          customInput={<CalendarInput placeholder="Inicio" />}
        />

        <DatePicker
          selected={endDt}
          onChange={(d) => setEndDt(d)}
          showTimeSelect
          minDate={startDt}
          dateFormat="dd/MM/yyyy HH:mm"
          customInput={<CalendarInput placeholder="Fin" />}
        />

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
