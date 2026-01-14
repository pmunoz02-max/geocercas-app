// LOGIN-V28 – FINAL: login inmediato, sin probe RLS
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { setMemoryAccessToken } from "../supabaseClient";

type Diag = {
  step: string;
  status?: number;
  message?: string;
};

function isValidEmail(v: string) {
  const s = v.trim().toLowerCase();
  return s.includes("@") && s.includes(".") && s.length >= 6;
}

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

  // evita loops
  const attemptedRef = useRef(false);

  async function doLogin() {
    if (busy || attemptedRef.current) return;

    const emailClean = email.trim().toLowerCase();
    if (!isValidEmail(emailClean) || !password) return;

    attemptedRef.current = true;
    setBusy(true);
    setErr("");
    setMsg("");
    setDiag({ step: "login_start" });

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

      const text = await withTimeout(res.text(), 8000, "read response");
      const data = JSON.parse(text);

      if (!res.ok) {
        attemptedRef.current = false;
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      }

      setDiag({ step: "token_received", status: res.status });

      // 🔑 Token en memoria (NO setSession)
      setMemoryAccessToken(data.access_token);

      // ✅ ENTRAR DIRECTO
      setDiag({ step: "navigate" });
      setMsg("✅ Sesión activa. Entrando…");

      navigate(next, { replace: true });
    } catch (e: any) {
      attemptedRef.current = false;
      setBusy(false);
      setDiag({ step: "error", message: String(e?.message || e) });
      setErr(String(e?.message || "No se pudo iniciar sesión."));
    }
  }

  // 🔥 Auto-login inmediato, sin timers
  useEffect(() => {
    doLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password]);

  const inputClass =
    "w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 " +
    "text-white placeholder:text-slate-400 caret-white " +
    "outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <h1 className="text-3xl font-semibold mb-6">
            Entrar <span className="text-xs opacity-60">(LOGIN-V28)</span>
          </h1>

          <div className="mb-6 text-xs p-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-100">
            <b>Login estable (modo producción)</b>
            <div>Ingreso directo tras validar credenciales.</div>
          </div>

          <label className="block mb-2 text-sm text-slate-300">Correo</label>
          <input
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
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
            disabled={busy}
          />

          <div className="w-full mt-8 py-4 rounded-2xl bg-white/90 text-slate-900 font-semibold text-center opacity-90">
            Entrando…
          </div>

          {(err || msg) && (
            <div className="mt-4 text-sm">
              {err && <div className="text-red-400">{err}</div>}
              {msg && <div className="text-emerald-400">{msg}</div>}
            </div>
          )}

          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4 text-white/70">
            <div className="font-semibold">Diagnóstico</div>
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
