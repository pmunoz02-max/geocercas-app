import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const next = useMemo(() => searchParams.get("next") || "/inicio", [searchParams]);

  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/auth/callback`;
  }, []);

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      navigate(next, { replace: true });
    } catch (e2: any) {
      console.error("[Login] password error", e2);
      setErr(e2?.message || "Credenciales inválidas.");
    } finally {
      setBusy(false);
    }
  }

  async function onSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setMsg("Te enviamos un enlace de acceso. Revisa tu correo.");
    } catch (e2: any) {
      console.error("[Login] magiclink error", e2);
      setErr(e2?.message || "No se pudo enviar el Magic Link.");
    } finally {
      setBusy(false);
    }
  }

  async function onForgotPassword() {
    setErr("");
    setMsg("");
    if (!email.trim()) {
      setErr("Escribe tu correo primero para recuperar contraseña.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) throw error;
      setMsg("Te enviamos un correo para recuperar tu contraseña. Revisa tu bandeja de entrada (y spam).");
    } catch (e2: any) {
      console.error("[Login] recovery error", e2);
      setErr(e2?.message || "No se pudo enviar el correo de recuperación.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm underline opacity-80 hover:opacity-100">
            Volver
          </Link>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="w-full max-w-3xl bg-slate-900/70 border border-slate-800 rounded-3xl p-8 shadow-xl">
            <h1 className="text-2xl font-semibold">Entrar</h1>

            <div className="mt-4 inline-flex gap-2">
              <button
                type="button"
                onClick={() => setMode("password")}
                className={
                  "px-4 py-2 rounded-full text-sm font-medium border " +
                  (mode === "password"
                    ? "bg-white text-slate-900 border-white"
                    : "bg-slate-800 text-slate-100 border-slate-700 hover:bg-slate-700")
                }
              >
                Contraseña
              </button>
              <button
                type="button"
                onClick={() => setMode("magic")}
                className={
                  "px-4 py-2 rounded-full text-sm font-medium border " +
                  (mode === "magic"
                    ? "bg-white text-slate-900 border-white"
                    : "bg-slate-800 text-slate-100 border-slate-700 hover:bg-slate-700")
                }
              >
                Magic Link
              </button>
            </div>

            <div className="mt-6">
              <label className="block text-sm mb-2 opacity-80">Correo</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                className="w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {mode === "password" ? (
              <form onSubmit={onPasswordLogin} className="mt-5 space-y-5">
                <div>
                  <label className="block text-sm mb-2 opacity-80">Contraseña</label>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    autoComplete="current-password"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 outline-none focus:ring-2 focus:ring-sky-500"
                  />

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={onForgotPassword}
                      disabled={busy}
                      className="px-4 py-2 rounded-xl text-sm font-semibold border border-emerald-400/50 text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/25 hover:text-white focus:ring-2 focus:ring-emerald-400/60 disabled:opacity-50"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                </div>

                <button
                  disabled={busy}
                  className="w-full py-3 rounded-2xl bg-white text-slate-900 font-semibold hover:opacity-95 disabled:opacity-60"
                >
                  {busy ? "Procesando…" : "Entrar"}
                </button>
              </form>
            ) : (
              <form onSubmit={onSendMagicLink} className="mt-5 space-y-5">
                <button
                  disabled={busy}
                  className="w-full py-3 rounded-2xl bg-white text-slate-900 font-semibold hover:opacity-95 disabled:opacity-60"
                >
                  {busy ? "Enviando…" : "Enviar Magic Link"}
                </button>
              </form>
            )}

            {(err || msg) && (
              <div className="mt-4">
                {err ? <div className="text-sm text-red-300">{err}</div> : null}
                {msg ? <div className="text-sm text-emerald-300">{msg}</div> : null}
              </div>
            )}

            <div className="mt-4 text-xs opacity-60">
              Tip: si un enlace falla, abre el correo en Chrome/Safari o intenta en incógnito y solicita un link nuevo.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
