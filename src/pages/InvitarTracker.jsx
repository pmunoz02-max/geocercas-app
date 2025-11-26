// src/pages/InvitarTracker.jsx
// Invitar tracker por Magic Link
// Usa AuthContext para user + currentOrg y Supabase para PERSONAL.
// Incluye fallback robusto si la query "bonita" de PERSONAL da error 400.

import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function InvitarTracker() {
  const { user, currentOrg } = useAuth();

  const [personalList, setPersonalList] = useState([]);
  const [selectedPersonalId, setSelectedPersonalId] = useState("");
  const [trackerEmail, setTrackerEmail] = useState("");
  const [loadingPersonal, setLoadingPersonal] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // ------------------------------------------------------------
  // Cargar PERSONAL según organización activa (con fallback)
  // ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadPersonal() {
      setLoadingPersonal(true);
      setError(null);
      setWarning(null);

      if (!user) {
        setLoadingPersonal(false);
        return;
      }

      try {
        // -------- INTENTO 1: query "bonita" con org_id / owner_id ----------
        let query = supabase
          .from("personal")
          .select("id, full_name, email, org_id, owner_id")
          .order("full_name", { ascending: true });

        if (currentOrg && currentOrg.id) {
          // Personal de la org activa
          query = query.eq("org_id", currentOrg.id);
        } else {
          // Fallback lógico si no hay org activa: personal de este owner
          query = query.eq("owner_id", user.id);
        }

        let { data, error: pErr, status } = await query;

        // Si hay error 400 o de columnas, probamos un fallback más simple
        if (pErr && (status === 400 || pErr.code?.startsWith("42"))) {
          console.warn(
            "[InvitarTracker] PERSONAL query detallada falló, usando fallback simple:",
            pErr
          );
          setWarning(
            "No se pudo cargar el PERSONAL filtrado por organización. Se muestra un listado simplificado."
          );

          const fallback = await supabase
            .from("personal")
            .select("id, full_name, email");

          data = fallback.data;
          pErr = fallback.error;
          status = fallback.status;
        }

        if (pErr) {
          console.error("[InvitarTracker] error al cargar PERSONAL:", pErr);
          if (!cancelled) {
            setError("No se pudo cargar el PERSONAL.");
          }
          return;
        }

        if (!cancelled) {
          const list = data || [];
          setPersonalList(list);

          // seleccionar automáticamente el primero
          if (list.length > 0) {
            setSelectedPersonalId(list[0].id);
            setTrackerEmail(list[0].email || "");
          }
        }
      } catch (e) {
        console.error("[InvitarTracker] excepción al cargar PERSONAL:", e);
        if (!cancelled) {
          setError("Ocurrió un error inesperado al cargar PERSONAL.");
        }
      } finally {
        if (!cancelled) setLoadingPersonal(false);
      }
    }

    loadPersonal();
    return () => {
      cancelled = true;
    };
  }, [user, currentOrg]);

  // ------------------------------------------------------------
  // Cambiar selección de persona
  // ------------------------------------------------------------
  const handleChangePersonal = (e) => {
    const id = e.target.value;
    setSelectedPersonalId(id);

    const person = personalList.find((p) => p.id === id);
    setTrackerEmail(person?.email || "");
  };

  // ------------------------------------------------------------
  // Enviar Magic Link
  // ------------------------------------------------------------
  const handleSendMagicLink = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!trackerEmail) {
      setError("No hay email válido para el tracker seleccionado.");
      return;
    }

    setSending(true);
    try {
      const redirectUrl = `${window.location.origin}/login`;

      const { error: authErr } = await supabase.auth.signInWithOtp({
        email: trackerEmail,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (authErr) {
        console.error("[InvitarTracker] error al enviar Magic Link:", authErr);
        setError("No se pudo enviar el Magic Link. Revisa la consola.");
      } else {
        setSuccessMsg(
          `Se envió un Magic Link a ${trackerEmail}. Pídele que revise su correo.`
        );
      }
    } catch (e) {
      console.error("[InvitarTracker] excepción enviando Magic Link:", e);
      setError("Ocurrió un error inesperado al enviar el Magic Link.");
    } finally {
      setSending(false);
    }
  };

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------
  const orgName = currentOrg?.name || null;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Invitar Tracker por Magic Link</h1>
      <p className="text-gray-600 text-sm mb-6">
        Solo puedes enviar un Magic Link a personas registradas en PERSONAL.
        La invitación se enviará al correo registrado en esa ficha.
      </p>

      {/* Bloque de resumen usuario + organización */}
      <div className="border rounded-md p-4 mb-4 bg-slate-50">
        <p className="text-sm">
          <span className="font-semibold">Usuario que invita:</span>{" "}
          {user?.email ?? "(desconocido)"}
        </p>
        <p className="text-sm mt-1">
          <span className="font-semibold">Organización activa:</span>{" "}
          {orgName ?? "—"}
        </p>

        {!orgName && (
          <p className="text-xs text-amber-700 mt-2">
            No hay organización activa seleccionada. Se listará el PERSONAL
            asociado a tu usuario (owner_id).
          </p>
        )}
      </div>

      {/* Mensajes de error / aviso / éxito */}
      {error && (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded px-4 py-2 text-sm mb-3">
          {error}
        </div>
      )}
      {warning && !error && (
        <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded px-4 py-2 text-sm mb-3">
          {warning}
        </div>
      )}
      {successMsg && (
        <div className="border border-emerald-300 bg-emerald-50 text-emerald-800 rounded px-4 py-2 text-sm mb-3">
          {successMsg}
        </div>
      )}

      {/* Formulario */}
      <form onSubmit={handleSendMagicLink} className="space-y-4">
        {/* Selección de PERSONA */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Selecciona a la persona (PERSONAL)
          </label>
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={selectedPersonalId}
            onChange={handleChangePersonal}
            disabled={loadingPersonal || personalList.length === 0}
          >
            {loadingPersonal && <option>Cargando PERSONAL…</option>}
            {!loadingPersonal && personalList.length === 0 && (
              <option>No hay personas registradas</option>
            )}
            {!loadingPersonal &&
              personalList.length > 0 &&
              personalList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email || p.id}{" "}
                  {p.email ? `(${p.email})` : ""}
                </option>
              ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Se listan personas de la organización activa o, si no hay
            organización, todas las asociadas a tu usuario.
          </p>
        </div>

        {/* Email del tracker */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Email del tracker (desde PERSONAL)
          </label>
          <input
            type="email"
            className="w-full border rounded px-3 py-2 text-sm"
            value={trackerEmail}
            onChange={(e) => setTrackerEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
          />
          <p className="text-xs text-gray-500 mt-1">
            El correo se toma de la ficha de PERSONAL. Si está vacío o es
            incorrecto, corrígelo primero en el módulo Personal.
          </p>
        </div>

        {/* Botón */}
        <div>
          <button
            type="submit"
            disabled={sending || !trackerEmail}
            className="inline-flex items-center px-4 py-2 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {sending ? "Enviando…" : "Enviar Magic Link"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default InvitarTracker;
