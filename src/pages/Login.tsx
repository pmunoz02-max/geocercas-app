// src/pages/Login.tsx
// LOGIN-IMPLICIT-V1 — Magic Link vía supabase-js (implicit hash)
// Mantiene UI similar a tu pantalla actual (oscura, V31-like)

import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function getSiteUrl() {
  const v = (import.meta as any).env?.PUBLIC_SITE_URL || "";
  const s = String(v).trim().replace(/\/+$/, "");
  return s || window.location.origin;
}

export default function Login() {
  const location = useLocation();
  const qp = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const next = qp.get("next") || "/inicio";
  const err = qp.get("err") || "";

  const [email, setEmail] = useState(qp.get("email") || "");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  // Si por alguna razón caes aquí con ?code=, lo reportamos (PKCE ya no se usa)
  useEffect(() => {
    const code = qp.get("code");
    if (code) {
      setStatus("Este link llegó con ?code= (PKCE). En modo B usamos hash token. Pide un link nuevo desde este login.");
    }
  }, [qp]);

  async function sendMagicLink() {
    const e = String(email || "").trim().toLowerCase();
    if (!e.includes("@")) {
      setStatus("Correo inválido.");
      return;
    }

    setSending(true);
    setStatus("Enviando Magic Link...");

    try {
      const site = getSiteUrl();
      const emailRedirectTo = `${site}/auth/callback?next=${encodeURIComponent(next)}`;

      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: {
          emailRedirectTo,
        },
      });

      if (error) {
        setStatus(`Error: ${error.message}`);
        return;
      }

      setStatus("Listo. Revisa tu correo y abre el link. (Puede abrirse en WebView sin romperse)");
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
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold">
              Iniciar sesión <span className="text-xs opacity-60">(LOGIN-IMPLICIT)</span>
            </h1>
            <div className="flex gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-xs">ES</span>
              <span className="px-3 py-1 rounded-full bg-sky-500/20 border border-sky-500/30 text-xs">EN</span>
              <span className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-xs">FR</span>
            </div>
          </div>

          <div className="mt-4 bg-emerald-900/30 border border-emerald-700/40 rounded-2xl p-4 text-sm">
            Magic Link estable para WebView/TWA: flujo <b>implicit</b> + cookie HttpOnly <b>tg_at</b>.
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
            <div className="mt-4 text-sm bg-black/30 border border-white/10 rounded-2xl p-4">
              {status}
              <div className="mt-2 text-xs opacity-60">next: {next}</div>
            </div>
          ) : (
            <div className="mt-4 text-xs opacity-60">
              next: {next} • redirect: {getSiteUrl()}/auth/callback
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
