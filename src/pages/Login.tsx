// src/pages/Login.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function hasHashAccessToken(hash: string) {
  return typeof hash === "string" && hash.includes("access_token=");
}

function getCanonicalSiteUrl() {
  // usa tu env (Vercel Preview ya lo bajas con vercel pull)
  const v = (import.meta as any).env?.PUBLIC_SITE_URL || "";
  const s = String(v).trim().replace(/\/+$/, "");
  return s || window.location.origin;
}

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();

  const qp = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const next = qp.get("next") || "/inicio";
  const err = qp.get("err") || "";
  const [email, setEmail] = useState(qp.get("email") || "");
  const [status, setStatus] = useState<string>("");
  const [sending, setSending] = useState(false);

  // ✅ Blindaje: si llega auth code/hash a /login, enviamos a /auth/callback
  useEffect(() => {
    const code = qp.get("code");
    if (code) {
      qp.set("next", next);
      navigate(`/auth/callback?${qp.toString()}`, { replace: true });
      return;
    }
    if (hasHashAccessToken(location.hash || "")) {
      navigate(`/auth/callback${location.search || ""}${location.hash || ""}`, { replace: true });
      return;
    }
  }, [location.hash, location.search, navigate, next, qp]);

  // ✅ Canonical host (opcional pero recomendado para evitar mismatches)
  useEffect(() => {
    const canonical = getCanonicalSiteUrl();
    const here = window.location.origin.replace(/\/+$/, "");
    if (canonical && canonical !== here) {
      const target = canonical + location.pathname + (location.search || "") + (location.hash || "");
      window.location.replace(target);
    }
  }, [location.pathname, location.search, location.hash]);

  async function sendMagicLink() {
    const e = String(email || "").trim().toLowerCase();
    if (!e.includes("@")) {
      setStatus("Correo inválido.");
      return;
    }

    setSending(true);
    setStatus("Enviando Magic Link...");

    try {
      const site = getCanonicalSiteUrl(); // IMPORTANTÍSIMO: el mismo origen
      const emailRedirectTo = `${site}/auth/callback?next=${encodeURIComponent(next)}`;

      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: {
          emailRedirectTo,
          // shouldCreateUser: false, // opcional si quieres bloquear auto-signup
        },
      });

      if (error) {
        setStatus(`Error: ${error.message}`);
        return;
      }

      setStatus("Listo. Revisa tu correo y abre el link en ESTE mismo navegador.");
    } catch (ex: any) {
      setStatus(`Error inesperado: ${ex?.message ?? String(ex)}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <div className="text-2xl font-semibold">Iniciar sesión</div>
          <div className="text-sm opacity-70 mt-2">
            Magic Link (recomendado para TWA/WebView). next: <span className="opacity-90">{next}</span>
          </div>

          {err ? (
            <div className="mt-4 text-sm bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
              {decodeURIComponent(err)}
            </div>
          ) : null}

          <div className="mt-6">
            <label className="text-sm opacity-80">Correo</label>
            <input
              className="mt-2 w-full rounded-2xl bg-slate-950/40 border border-slate-700 px-4 py-3 outline-none"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="tuemail@dominio.com"
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
            </div>
          ) : null}

          <div className="mt-6 text-xs opacity-60">
            Nota: si abres el link en otro navegador/app, PKCE puede fallar (code_verifier). Abre el link en este mismo navegador.
          </div>
        </div>
      </div>
    </div>
  );
}
