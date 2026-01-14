// LOGIN-V31 (NO-JS) – WebView/TWA definitivo: submit nativo a /api/auth/password
import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function Login() {
  const [searchParams] = useSearchParams();
  const next = useMemo(() => searchParams.get("next") || "/inicio", [searchParams]);

  // Solo para UX (no depende de eventos para autenticación)
  const [email, setEmail] = useState("pruebatugeo@gmail.com");
  const [password, setPassword] = useState("");

  const inputClass =
    "w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 " +
    "text-white placeholder:text-slate-400 outline-none";

  const buttonClass =
    "w-full mt-8 py-4 rounded-2xl bg-white/90 text-slate-900 font-semibold text-center " +
    "active:bg-white select-none";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <h1 className="text-3xl font-semibold mb-6">
            Entrar <span className="text-xs opacity-60">(LOGIN-V31 NO-JS)</span>
          </h1>

          <div className="mb-6 text-xs p-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-100">
            Login estable en WebView/TWA: envío nativo (sin eventos JS), anti rate-limit por diseño.
          </div>

          {/* ✅ FORM NATIVO (NO depende de onClick/onBlur/onSubmit JS) */}
          <form method="POST" action="/api/auth/password">
            {/* next para que el backend redirija a callback preservando destino */}
            <input type="hidden" name="next" value={next} />

            <label className="block mb-2 text-sm">Correo</label>
            <input
              className={inputClass}
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)} // solo UX, no crítico
              required
            />

            <div className="h-6" />

            <label className="block mb-2 text-sm">Contraseña</label>
            <input
              className={inputClass}
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)} // solo UX, no crítico
              required
            />

            {/* ✅ Submit nativo */}
            <button type="submit" className={buttonClass}>
              Entrar
            </button>
          </form>

          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4">
            <div>Modo: NO-JS (form submit nativo)</div>
            <div>Si el login es correcto, el servidor redirige a /auth/callback con tokens.</div>
          </div>

          <Link to="/" className="block mt-6 text-sm underline opacity-80">
            Volver
          </Link>
        </div>
      </div>
    </div>
  );
}
