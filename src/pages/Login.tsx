import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

function withTimeout<T>(promise: Promise<T>, ms: number, label = "Operación") {
  let timeoutId: any;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label}: tiempo de espera agotado (${ms / 1000}s).`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

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
    if (busy) return;

    setErr("");
    setMsg("");
    setBusy(true);

    try {
      const emailClean = email.trim().toLowerCase();
      if (!emailClean || !password) {
        setErr("Escribe tu correo y contraseña.");
        return;
      }

      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: emailClean, password }),
        12000,
        "Login"
      );

      if (error) throw error;

      navigate(next, { replace: true });
    } catch (e2: any) {
      console.error("[Login] password error", e2);

      const m = String(e2?.message || "");
      if (m.includes("Invalid login credentials")) {
        setErr("Correo o contraseña incorrectos.");
      } else if (m.includes("tiempo de espera")) {
        setErr(
          "Se tardó demasiado en responder. Revisa tu internet, extensiones (adblock) y vuelve a intentar."
        );
      } else {
        setErr("No se pudo iniciar sesión. Intenta nuevamente.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setErr("");
    setMsg("");
    setBusy(true);

    try {
      const emailClean = email.trim().toLowerCase();
      if (!emailClean) {
        setErr("Escribe tu correo.");
        return;
      }

      const { error } = await withTimeout(
        supabase.auth.signInWithOtp({
          email: emailClean,
          options: { emailRedirectTo: redirectTo },
        }),
        12000,
        "Magic Link"
      );

      if (error) throw error;

      setMsg("Te enviamos un enlace de acceso. Revisa tu correo.");
    } catch (e2: any) {
      console.error("[Login] magiclink error", e2);

      const m = String(e2?.message || "");
      if (m.includes("tiempo de espera")) {
        setErr("Se tardó demasiado en responder. Intenta otra vez o en incógnito.");
      } else {
        setErr("No se pudo enviar el Magic Link.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onForgotPassword() {
    if (busy) return;

    setErr("");
    setMsg("");

    const emailClean = email.trim().toLowerCase();
    if (!emailClean) {
      setErr("Escribe tu correo primero.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(emailClean, { redirectTo }),
        12000,
        "Recuperación"
      );

      if (error) throw error;

      setMsg("Te enviamos un correo para recuperar tu contraseña. Revisa inbox o spam.");
    } catch (e2: any) {
      console.error("[Login] recovery error", e2);

      const m = String(e2?.message || "");
      if (m.includes("tiempo de espera")) {
        setErr("Se tardó demasiado en responder. Intenta nuevamente en unos segundos.");
      } else {
        setErr("No se pudo enviar el correo de recuperación.");
      }
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 " +
    "text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-sky-500";

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
                disabled={busy}
                className={
                  "px-4 py-2 rounded-full text-sm font-medium border " +
                  (mode === "password"
                    ? "bg-white text-slate-900 border-white"
                    : "bg-slate-800 text-slate-100 border-slate-700 hover:bg-slate-700") +
                  (busy ? " opacity-70" : "")
                }
              >
                Contraseña
              </button>
              <button
                type="button"
                onClick={() => setMode("magic")}
                disabled={busy}
                className={
                  "px-4 py-2 rounded-full text-sm font-medium border " +
                  (mode === "magic"
                    ? "bg-white text-slate-900 border-white"
                    : "bg-slate-800 text-slate-100 border-slate-700 hover:bg-slate-700") +
                  (busy ? " opacity-70" : "")
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
                className={inputClass}
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
                    className={inputClass}
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
              <div className="mt-4 text-sm">
                {err ? <div className="text-red-300">{err}</div> : null}
                {msg ? <div className="text-emerald-300">{msg}</div> : null}
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
