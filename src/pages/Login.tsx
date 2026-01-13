// LOGIN-V21 – Botón siempre clickeable (z-index + pointer-events) + login token en memoria
import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import supabase, { setMemoryAccessToken } from "../supabaseClient";

type Diag = {
  step: string;
  status?: number;
  message?: string;
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout ${ms}ms en ${label}`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = useMemo(() => searchParams.get("next") || "/inicio", [searchParams]);

  const [email, setEmail] = useState("pruebatugeo@gmail.com");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [diag, setDiag] = useState<Diag>({ step: "idle" });

  async function handleLogin() {
    if (busy) return;

    // ✅ Si el click llega, esto cambia SIEMPRE
    setDiag({ step: "clicked" });

    setBusy(true);
    setErr("");
    setMsg("");

    const emailClean = email.trim().toLowerCase();
    if (!emailClean || !password) {
      setDiag({ step: "validation_error", message: "Falta correo o contraseña" });
      setErr("Escribe tu correo y contraseña.");
      setBusy(false);
      return;
    }

    try {
      setDiag({ step: "fetching" });

      const res = await withTimeout(
        fetch("/api/auth/password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
          body: JSON.stringify({ email: emailClean, password }),
        }),
        15000,
        "fetch(/api/auth/password)"
      );

      const text = await withTimeout(res.text(), 8000, "read response text");
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (!res.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      }

      setDiag({ step: "token_received", status: res.status });

      // ✅ NO usamos setSession (se cuelga en tu entorno). Token en memoria:
      setMemoryAccessToken(data.access_token);

      // ✅ Probe a una tabla existente (si tu tabla no es organizations, cámbiala)
      setDiag({ step: "probe_supabase" });
      const probe = await withTimeout(
        supabase.from("organizations").select("id").limit(1),
        8000,
        "probe organizations"
      );
      if (probe.error) throw new Error(`Probe error: ${probe.error.message}`);

      setDiag({ step: "navigate" });
      setMsg("✅ Sesión activa. Entrando…");
      navigate(next, { replace: true });
    } catch (e: any) {
      setDiag({ step: "error", message: String(e?.message || e) });
      setErr(String(e?.message || "No se pudo iniciar sesión."));
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 " +
    "text-white placeholder:text-slate-400 caret-white " +
    "outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 " +
    "disabled:opacity-100 disabled:text-white disabled:cursor-not-allowed";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      {/* Capa base: aseguramos que nada “capture” clicks dentro del card */}
      <div className="w-full max-w-xl relative z-[9998] pointer-events-auto">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl relative z-[9998] pointer-events-auto">
          <h1 className="text-3xl font-semibold mb-8">
            Entrar <span className="text-xs opacity-60">(LOGIN-V21)</span>
          </h1>

          <label className="block mb-2 text-sm text-slate-300">Correo</label>
          <input
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            disabled={busy}
          />

          <div className="h-6" />

          <label className="block mb-2 text-sm text-slate-300">Contraseña</label>
          <input
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // ✅ Enter también dispara login, sin form
                e.preventDefault();
                handleLogin();
              }
            }}
          />

          <button
            type="button"
            onClick={handleLogin}
            disabled={busy}
            className="
              w-full mt-8 py-4 rounded-2xl
              bg-white text-slate-900 font-semibold
              disabled:opacity-60
              relative z-[9999] pointer-events-auto
            "
          >
            {busy ? "Procesando…" : "Entrar"}
          </button>

          {(err || msg) && (
            <div className="mt-4 text-sm">
              {err && <div className="text-red-400">{err}</div>}
              {msg && <div className="text-emerald-400">{msg}</div>}
            </div>
          )}

          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4 text-white/70 space-y-1">
            <div className="font-semibold text-white/80">Diagnóstico</div>
            <div>busy: {String(busy)}</div>
            <div>step: {diag.step}</div>
            <div>status: {String(diag.status ?? "-")}</div>
            <div>message: {diag.message || "-"}</div>
          </div>

          <Link to="/" className="block mt-6 text-sm underline opacity-80 hover:opacity-100">
            Volver
          </Link>
        </div>
      </div>
    </div>
  );
}
