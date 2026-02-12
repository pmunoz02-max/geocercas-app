// src/pages/Login.tsx
<<<<<<< HEAD
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  const [email, setEmail] = useState("ruebageo@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ✅ Si Supabase devuelve callback aquí, lo reenviamos a /auth/callback
  useEffect(() => {
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    const hasCode = search.includes("code=");
    const hasTokenHash = search.includes("token_hash=");
    const hasAccessToken = hash.includes("access_token=");

    if (hasCode || hasTokenHash || hasAccessToken) {
      window.location.replace(`/auth/callback${search}${hash}`);
      return;
    }

    // ✅ Si ya hay sesión, no debe quedarse en login
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        const next = sp.get("next");
        navigate(next ? String(next) : "/inicio", { replace: true });
      }
    })();
  }, [navigate, sp]);

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 6 && !loading;
  }, [email, password, loading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      const next = sp.get("next");
      navigate(next ? String(next) : "/inicio", { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form
        onSubmit={handleLogin}
        style={{
          width: "min(720px, 100%)",
          padding: 24,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(10,16,28,0.65)",
          color: "white",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800 }}>Iniciar sesión</h1>
        <p style={{ marginTop: 8, opacity: 0.85 }}>
          Accede con tu correo y contraseña (Supabase Auth).
        </p>

        {err && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,80,80,0.35)",
              background: "rgba(255,80,80,0.12)",
              color: "white",
            }}
          >
            {err}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <label style={{ display: "block", marginBottom: 6, opacity: 0.9 }}>Correo</label>
          <input
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            autoComplete="email"
            inputMode="email"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
            }}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ display: "block", marginBottom: 6, opacity: 0.9 }}>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            width: "100%",
            marginTop: 18,
            padding: "12px 14px",
            borderRadius: 12,
            border: "none",
            fontWeight: 800,
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: canSubmit ? 1 : 0.55,
          }}
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Link to="/forgot-password" style={{ color: "white", opacity: 0.85, textDecoration: "underline" }}>
            ¿Olvidaste tu contraseña?
          </Link>
          <Link to="/" style={{ color: "white", opacity: 0.85, textDecoration: "underline" }}>
            Volver al inicio
          </Link>
        </div>
      </form>
=======
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
>>>>>>> preview
    </div>
  );
}
