// src/pages/Login.tsx
// LOGIN-IMPLICIT-V4 — Magic Link robusto contra previews random (DOMINIO ÚNICO)
// REGLA: SIEMPRE usar VITE_SITE_URL (alias estable). NUNCA window.location.origin.
// Incluye botón "Olvidé mi contraseña" (recovery) apuntando a /reset-password.

import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function getStableSiteUrl(): string {
  const v = (import.meta as any).env?.VITE_SITE_URL || "";
  const s = String(v).trim().replace(/\/+$/, "");
  // ✅ Sin fallback: si no está, se rompe (para no generar links con previews random)
  if (!s) return "";
  return s;
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
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
  const [sendingReset, setSendingReset] = useState(false);
  const [status, setStatus] = useState("");

  const stableSite = getStableSiteUrl();
  const origin =
    typeof window !== "undefined" ? window.location.origin : "unknown";

  // Mensaje si llegas con ?code= (PKCE viejo)
  useEffect(() => {
    const code = qp.get("code");
    if (code) {
      setStatus(
        "Este link llegó con ?code= (PKCE). Esto se rompe si el link se abre en un dominio distinto al que generó el code_verifier (previews). " +
          "Solución: generar links SIEMPRE con VITE_SITE_URL (alias estable) y pedir un link nuevo desde ese dominio."
      );
    }
  }, [qp]);

  function requireStableSiteOrExplain(): string | null {
    if (!stableSite) {
      setStatus(
        "Falta VITE_SITE_URL en Vercel. Debe ser el alias estable (ej: https://geocercas-app-v3-preview.vercel.app). " +
          "Sin esto, Vercel previews generan links con dominios aleatorios y PKCE se rompe."
      );
      return null;
    }
    return stableSite;
  }

  async function sendMagicLink() {
    const e = String(email || "").trim().toLowerCase();
    if (!e.includes("@")) {
      setStatus("Correo inválido.");
      return;
    }

    const site = requireStableSiteOrExplain();
    if (!site) return;

    setSending(true);
    setStatus("Enviando Magic Link...");

    try {
      const emailRedirectTo = `${site}/auth/callback?next=${encodeURIComponent(
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
        `Listo. Revisa tu correo.\n` +
          `IMPORTANTE: abre el link (o copia/pega) en el dominio estable.\n` +
          `redirect: ${emailRedirectTo}`
      );
    } catch (ex: any) {
      setStatus(`Error inesperado: ${ex?.message ?? String(ex)}`);
    } finally {
      setSending(false);
    }
  }

  async function sendResetPassword() {
    const e = String(email || "").trim().toLowerCase();
    if (!e.includes("@")) {
      setStatus("Correo inválido.");
      return;
    }

    const site = requireStableSiteOrExplain();
    if (!site) return;

    setSendingReset(true);
    setStatus("Enviando link de recuperación...");

    try {
      // ✅ Recovery debe ir directo a /reset-password (idealmente con hash implicit type=recovery)
      const redirectTo = `${site}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(e, {
        redirectTo,
      });

      if (error) {
        setStatus(`Error: ${error.message}`);
        return;
      }

      setStatus(
        `Listo. Revisa tu correo y abre el link de recuperación.\nredirect: ${redirectTo}`
      );
    } catch (ex: any) {
      setStatus(`Error inesperado: ${ex?.message ?? String(ex)}`);
    } finally {
      setSendingReset(false);
    }
  }

  const disabled = sending || sendingReset;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <h1 className="text-3xl font-semibold">Iniciar sesión</h1>

          <div className="mt-4 bg-emerald-900/30 border border-emerald-700/40 rounded-2xl p-4 text-sm">
            Dominio estable (VITE_SITE_URL):{" "}
            <b>{stableSite || "NO CONFIGURADO"}</b>
            <div className="text-xs opacity-70 mt-2">
              Origen actual (preview): <b>{origin}</b>
            </div>
            {!stableSite ? (
              <div className="mt-3 text-xs bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                ⚠️ No se permite enviar links mientras VITE_SITE_URL no esté
                configurado en Vercel.
              </div>
            ) : null}
          </div>

          {err ? (
            <div className="mt-4 text-sm bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
              {safeDecode(err)}
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
              inputMode="email"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={sendMagicLink}
              disabled={disabled || !stableSite}
              className="w-full rounded-2xl bg-white text-slate-900 py-3 font-semibold disabled:opacity-60"
            >
              {sending ? "Enviando..." : "Enviar Magic Link"}
            </button>

            <button
              onClick={sendResetPassword}
              disabled={disabled || !stableSite}
              className="w-full rounded-2xl bg-slate-800 text-slate-100 py-3 font-semibold border border-slate-700 disabled:opacity-60"
            >
              {sendingReset ? "Enviando..." : "Olvidé mi contraseña"}
            </button>
          </div>

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
