// src/pages/InvitarTracker.jsx
// Invitar tracker por Magic Link (versión simplificada y correcta).
// - El admin escribe el email del tracker.
// - El Magic Link redirige a /tracker (página especial del tracker).
// - Usa AuthContext para mostrar usuario y organización activa.

import React, { useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function InvitarTracker() {
  const { user, currentOrg } = useAuth();

  const [trackerEmail, setTrackerEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const orgName = currentOrg?.name || null;

  // ------------------------------------------------------------
  // Enviar Magic Link para tracker
  // ------------------------------------------------------------
  const handleSendMagicLink = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const emailTrimmed = trackerEmail.trim();
    if (!emailTrimmed) {
      setError("Ingresa un email válido para el tracker.");
      return;
    }

    setSending(true);
    try {
      // 👇 IMPORTANTE: el Magic Link redirige a /tracker
      const redirectUrl = `${window.location.origin}/tracker`;

      const { error: authErr } = await supabase.auth.signInWithOtp({
        email: emailTrimmed,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (authErr) {
        console.error("[InvitarTracker] error al enviar Magic Link:", authErr);
        setError("No se pudo enviar el Magic Link. Revisa la consola.");
      } else {
        setSuccessMsg(
          `Se envió un Magic Link a ${emailTrimmed}. Pídele que revise su correo.`
        );
      }
    } catch (e) {
      console.error("[InvitarTracker] excepción enviando Magic Link:", e);
      setError("Ocurrió un error inesperado al enviar el Magic Link.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Invitar Tracker por Magic Link</h1>
      <p className="text-gray-600 text-sm mb-6">
        Ingresa el email del tracker al que quieres invitar. Se enviará un Magic
        Link a ese correo para que pueda acceder al módulo de tracking.
      </p>

      {/* Resumen usuario + organización */}
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
            No hay organización activa seleccionada. Recuerda elegir una en la
            pantalla de “Seleccionar organización”.
          </p>
        )}
      </div>

      {/* Mensajes de error / éxito */}
      {error && (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded px-4 py-2 text-sm mb-3">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="border border-emerald-300 bg-emerald-50 text-emerald-800 rounded px-4 py-2 text-sm mb-3">
          {successMsg}
        </div>
      )}

      {/* Formulario simple */}
      <form onSubmit={handleSendMagicLink} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Email del tracker
          </label>
          <input
            type="email"
            className="w-full border rounded px-3 py-2 text-sm"
            value={trackerEmail}
            onChange={(e) => setTrackerEmail(e.target.value)}
            placeholder="correo.del.tracker@ejemplo.com"
          />
          <p className="text-xs text-gray-500 mt-1">
            Escribe el correo electrónico del tracker. Si todavía no tiene
            cuenta, se creará automáticamente al usar el Magic Link.
          </p>
        </div>

        <div>
          <button
            type="submit"
            disabled={sending || !trackerEmail.trim()}
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
