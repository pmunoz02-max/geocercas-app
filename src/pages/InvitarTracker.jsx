// src/pages/InvitarTracker.jsx
// Invitar tracker por Magic Link, ligado a PERSONAL.
// Si hay organización activa: filtra por org_id.
// Si no hay organización activa: filtra por owner_id (quien invita).
// La Magic Link redirige a http://192.168.100.12:5173/tracker para pruebas en red local.

import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthProvider.tsx";

export default function InvitarTracker() {
  const { currentOrg } = useAuth();

  const [inviterEmail, setInviterEmail] = useState("cargando...");
  const [inviterId, setInviterId] = useState(null);

  const [personalList, setPersonalList] = useState([]);
  const [selectedPersonalId, setSelectedPersonalId] = useState("");
  const [email, setEmail] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [dbWarning, setDbWarning] = useState(null);

  // -------------------------------------------------------------
  // 1) Cargar sesión de Supabase (quién invita)
  // -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("[InvitarTracker] Error sesión:", error);
          if (!cancelled) setInviterEmail("error de sesión");
          return;
        }
        const user = data?.session?.user || null;
        if (!cancelled) {
          setInviterEmail(user?.email || "no autenticado");
          setInviterId(user?.id || null);
        }
      } catch (e) {
        console.error("[InvitarTracker] Excepción sesión:", e);
        if (!cancelled) setInviterEmail("error de sesión");
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------
  // 2) Cargar PERSONAL:
  //    - por org_id si hay organización activa
  //    - si no, por owner_id = quien invita
  // -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadPersonal() {
      setPersonalList([]);
      setSelectedPersonalId("");
      setEmail("");

      if (!inviterId && !currentOrg?.id) {
        return;
      }

      try {
        let query = supabase
          .from("personal")
          .select(
            "id, org_id, nombre, apellido, email, position_interval_sec, vigente, is_deleted, owner_id"
          )
          .eq("vigente", true)
          .eq("is_deleted", false);

        if (currentOrg && currentOrg.id) {
          query = query.eq("org_id", currentOrg.id);
        } else if (inviterId) {
          query = query.eq("owner_id", inviterId);
        }

        const { data, error } = await query.order("nombre", {
          ascending: true,
        });

        if (error) {
          console.error("[InvitarTracker] Error cargando personal:", error);
          return;
        }

        if (!cancelled && Array.isArray(data)) {
          setPersonalList(data);
        }
      } catch (e) {
        console.error("[InvitarTracker] Excepción cargando personal:", e);
      }
    }

    loadPersonal();

    return () => {
      cancelled = true;
    };
  }, [inviterId, currentOrg]);

  // Cuando se selecciona una persona en el combo
  function handleSelectPersonal(e) {
    const id = e.target.value;
    setSelectedPersonalId(id);
    setMsg(null);
    setErrorMsg(null);
    setDbWarning(null);

    const p = personalList.find((row) => String(row.id) === String(id));
    if (p && p.email) {
      setEmail(p.email);
    } else {
      setEmail("");
    }
  }

  const canInvite = !!inviterId;

  // -------------------------------------------------------------
  // 3) Enviar Magic Link
  // -------------------------------------------------------------
  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);
    setErrorMsg(null);
    setDbWarning(null);

    if (!canInvite) {
      setErrorMsg("Debes iniciar sesión para invitar trackers.");
      return;
    }

    if (!selectedPersonalId) {
      setErrorMsg("Debes seleccionar primero a la persona (PERSONAL).");
      return;
    }

    const persona = personalList.find(
      (row) => String(row.id) === String(selectedPersonalId)
    );
    if (!persona) {
      setErrorMsg("La persona seleccionada no existe en la lista de PERSONAL.");
      return;
    }

    if (!persona.email) {
      setErrorMsg(
        "La persona seleccionada no tiene email registrado en PERSONAL."
      );
      return;
    }

    if (persona.email.toLowerCase() !== email.trim().toLowerCase()) {
      setErrorMsg(
        "El email no coincide con el registrado en PERSONAL. No se enviará la invitación."
      );
      return;
    }

    setBusy(true);
    try {
      // 👉 Para pruebas en LAN usamos la IP fija de tu PC:
      const baseUrl = "http://192.168.100.12:5173/tracker";
      const redirectTo = baseUrl;

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (otpError) {
        console.error("[InvitarTracker] Error Magic Link:", otpError);
        throw otpError;
      }

      // 2) Registrar en tabla trackers (si existe)
      try {
        const { error: dbError } = await supabase.from("trackers").insert([
          {
            org_id: persona.org_id || currentOrg?.id || null,
            owner_id: inviterId,
            personal_id: persona.id,
            email: email.trim().toLowerCase(),
            status: "pending",
          },
        ]);

        if (dbError) {
          console.warn(
            "[InvitarTracker] No se pudo registrar en 'trackers':",
            dbError
          );
          setDbWarning(
            "La Magic Link se envió, pero no se pudo registrar el tracker en la tabla 'trackers'. Revisa la BD/RLS."
          );
        }
      } catch (e2) {
        console.warn("[InvitarTracker] Error registrando tracker:", e2);
        setDbWarning(
          "La Magic Link se envió, pero hubo un error al registrar el tracker en la tabla."
        );
      }

      setMsg(
        `Magic Link enviada a ${email.trim()} (${persona.nombre}${
          persona.apellido ? " " + persona.apellido : ""
        }). Pídele que abra el correo desde su móvil e inicie sesión para comenzar a enviar posiciones.`
      );
    } catch (err) {
      console.error("[InvitarTracker] Error general:", err);
      setErrorMsg(err?.message || "Error al enviar la Magic Link.");
    } finally {
      setBusy(false);
    }
  }

  const orgName =
    (currentOrg &&
      (currentOrg.name ||
        currentOrg.org_name ||
        currentOrg.label ||
        currentOrg.descripcion)) ||
    "—";

  return (
    <div className="max-w-xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Invitar Tracker por Magic Link</h1>

      <p className="text-sm text-slate-600">
        Solo puedes enviar una Magic Link a personas registradas en{" "}
        <strong>PERSONAL</strong>. La invitación se enviará al correo registrado
        en esa ficha.
      </p>

      {/* Datos del que invita */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm space-y-1">
        <div>
          <span className="font-semibold text-slate-700">
            Usuario que invita:{" "}
          </span>
          <span className="text-slate-800">{inviterEmail}</span>
        </div>
        <div>
          <span className="font-semibold text-slate-700">
            Organización activa:{" "}
          </span>
          <span className="text-slate-800">{orgName}</span>
        </div>
        {!currentOrg?.id && (
          <p className="mt-1 text-xs text-amber-600">
            No hay organización activa seleccionada. Se listará el PERSONAL
            asociado a tu usuario (owner_id).
          </p>
        )}
        {!canInvite && (
          <p className="mt-1 text-xs text-red-600">
            Debes iniciar sesión para poder enviar invitaciones.
          </p>
        )}
      </div>

      {/* Selección de personal */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">
            Selecciona a la persona (PERSONAL)
          </label>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={selectedPersonalId}
            onChange={handleSelectPersonal}
            disabled={busy || personalList.length === 0}
          >
            <option value="">— Selecciona —</option>
            {personalList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.apellido ? ` ${p.apellido}` : ""} (
                {p.email || "sin email"})
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            Solo se listan personas de la organización activa o, si no hay
            organización, todas las asociadas a tu usuario.
          </p>
        </div>

        {/* Email (solo lectura, viene de PERSONAL) */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">
            Email del tracker (desde PERSONAL)
          </label>
          <input
            type="email"
            className="w-full border rounded-lg px-3 py-2 text-sm bg-slate-50"
            value={email}
            disabled
          />
          <p className="text-xs text-slate-500">
            El correo se toma de la ficha de PERSONAL. Si está vacío o es
            incorrecto, corrígelo primero en el módulo Personal.
          </p>
        </div>

        <button
          type="submit"
          disabled={busy || !canInvite || !selectedPersonalId || !email}
          className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
            busy || !canInvite || !selectedPersonalId || !email
              ? "bg-slate-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {busy ? "Enviando..." : "Enviar Magic Link"}
        </button>
      </form>

      {msg && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          {msg}
        </div>
      )}

      {errorMsg && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errorMsg}
        </div>
      )}

      {dbWarning && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          {dbWarning}
        </div>
      )}

      <div className="text-xs text-slate-500 border-t pt-3">
        En desarrollo la Magic Link apunta a{" "}
        <code className="bg-slate-100 px-1 py-0.5 rounded">
          http://192.168.100.12:5173/tracker
        </code>
        . Para que funcione en el móvil, este equipo y el teléfono deben estar
        en la misma red WiFi y el servidor Vite debe estar corriendo con{" "}
        <code>npm run dev -- --host</code>.
      </div>
    </div>
  );
}
