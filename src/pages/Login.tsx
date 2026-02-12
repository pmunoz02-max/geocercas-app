// src/pages/Login.tsx
// LOGIN-IMPLICIT-V3 — Magic Link robusto contra previews random
// REGLA: SIEMPRE usar VITE_SITE_URL (alias estable). NUNCA window.location.origin.

import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function getStableSiteUrl() {
  const v = (import.meta as any).env?.VITE_SITE_URL || "";
  const s = String(v).trim().replace(/\/+$/, "");
  return s;
}

export default function Login() {
  const location = useLocation();
  const qp = useMemo(
    () => new URLSearchParams(location.search || ""),
    [location.search]
  );
  const next = qp.get("next") || "/inicio";
  const err = qp.get("err") || "";

  const [email, setEmail] = useState(qp.get("email") || "");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  const stableSite = getStableSiteUrl();

  useEffect(() => {
    const code = qp.get("code");
    if (code) {
      setStatus(
        "Este link llegó con ?code= (PKCE). Eso pasa si el link fue abierto en otro dominio (preview) o Supabase aún envía PKCE. Solicita un link nuevo desde el login del dominio estable."
      );
    }
  }, [qp]);

  async function sendMagicLink() {
    const e = String(email || "").trim().toLowerCase();
    if (!e.includes("@")) {
      setStatus("Correo inválido.");
      return;
    }

    // ✅ BLOQUEO: sin VITE_SITE_URL no dejamos enviar
    if (!stableSite) {
      setStatus(
        "Falta VITE_SITE_URL en Vercel. Debe ser el alias estable (ej: https://geocercas-app-v3-preview.vercel.app)."
      );
      return;
    }

    setSending(true);
    setStatus("Enviando Magic Link...");

    try {
      const emailRedirectTo = `${stableSite}/auth/callback?next=${encodeURIComponent(
        next
      )}`;

      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: { emailRedirectTo },
      });

      if (error) {
        setStatus(`Error: ${error.message}`);
        return;
      }

      setStatus(
        `Listo. Revisa tu correo. IMPORTANTE: abre el link en el mismo dominio estable.\nredirect: ${emailRedirectTo}`
      );
    } catch (ex: any) {
      setStatus(`Error inesperado: ${ex?.message ?? String(ex)}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <h1 className="text-3xl font-semibold">Iniciar sesión</h1>

          <div className="mt-4 bg-emerald-900/30 border border-emerald-700/40 rounded-2xl p-4 text-sm">
            Dominio estable (VITE_SITE_URL):{" "}
            <b>{stableSite || "NO CONFIGURADO"}</b>
            <div className="text-xs opacity-70 mt-2">
              Origen actual: <b>{window.location.origin}</b>
            </div>
          </div>

          {err ? (
            <div className="mt-4 text-sm bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
              {decodeURIComponent(err)}
            </div>
          ) : null}

          <div className="mt-8">
            <label className="text-sm opacity-80">Correo</label>
            <input
              className="mt-2 w-full rounded-2xl bg-slate-950/40 border border-slate-700 px-4 py-3 outline-none"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="tucorreo@dominio.com"
              autoComplete="email"
            />
          </div>

          <button
            onClick={sendMagicLink}
            disabled={sending}
            className="mt-6 w-full rounded-2xl bg-white text-slate-900 py-3 font-semibold disabled:opacity-60"
          >
            {sending ? "Enviando..." : "Enviar Magic Link"}
          </button>

          {status ? (
            <div className="mt-4 whitespace-pre-line text-sm bg-black/30 border border-white/10 rounded-2xl p-4">
              {status}
              <div className="mt-2 text-xs opacity-60">next: {next}</div>
            </div>
          ) : (
            <div className="mt-4 text-xs opacity-60">next: {next}</div>
          )}
        </div>
      </div>
    </div>
  );
}
