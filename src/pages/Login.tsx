// LOGIN-V12 – bloqueo de storage-safe
import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = useMemo(() => searchParams.get("next") || "/inicio", [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const emailClean = email.trim().toLowerCase();
    if (!emailClean || !password) {
      setErr("Escribe tu correo y contraseña.");
      return;
    }

    setBusy(true);
    setErr("");
    setMsg("");

    try {
      const r = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailClean, password }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Login fallido");

      // ✅ Seteamos sesión en memoria (aunque storage esté bloqueado)
      const { error } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      if (error) throw error;

      // 🚀 REGLA SaaS: token válido = entrar
      setMsg("✅ Sesión creada. Entrando…");
      navigate(next, { replace: true });
    } catch (e: any) {
      setErr(e.message || "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
      <form
        onSubmit={onPasswordLogin}
        className="w-full max-w-md bg-slate-900/70 p-8 rounded-3xl border border-slate-800"
      >
        <h1 className="text-2xl font-semibold mb-6">
          Entrar <span className="text-xs opacity-60">(LOGIN-V12)</span>
        </h1>

        <label className="block mb-2 text-sm">Correo</label>
        <input
          className="w-full mb-4 px-4 py-3 rounded-xl bg-slate-800"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
        />

        <label className="block mb-2 text-sm">Contraseña</label>
        <input
          className="w-full mb-6 px-4 py-3 rounded-xl bg-slate-800"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
        />

        <button
          disabled={busy}
          className="w-full py-3 rounded-2xl bg-white text-slate-900 font-semibold disabled:opacity-60"
        >
          {busy ? "Procesando…" : "Entrar"}
        </button>

        {(err || msg) && (
          <div className="mt-4 text-sm">
            {err && <div className="text-red-400">{err}</div>}
            {msg && <div className="text-emerald-400">{msg}</div>}
          </div>
        )}

        <Link to="/" className="block mt-4 text-xs underline opacity-70">
          Volver
        </Link>
      </form>
    </div>
  );
}
