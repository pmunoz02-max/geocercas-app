// LOGIN-V26 – Auto-login por cambios en inputs (sin click ni Enter)
import React, { useEffect, useMemo, useRef, useState } from "react";
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

function isValidEmail(v: string) {
  const s = v.trim().toLowerCase();
  return s.includes("@") && s.includes(".") && s.length >= 6;
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

  // Auto-login state
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  // Para evitar reintentos infinitos con el mismo par email+password
  const lastAttemptKeyRef = useRef<string>("");
  const lastResultRef = useRef<"none" | "success" | "error">("none");

  async function doLogin(origin: string) {
    if (busy) return;

    const emailClean = email.trim().toLowerCase();
    if (!isValidEmail(emailClean) || !password) return;

    const attemptKey = `${emailClean}|${password}`;
    lastAttemptKeyRef.current = attemptKey;

    setDiag({ step: `login_start(${origin})` });
    setBusy(true);
    setErr("");
    setMsg("");

    try {
      setDiag({ step: `fetching(${origin})` });

      const res = await withTimeout(
        fetch("/api/auth/password", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          body: JSON.stringify({ email: emailClean, password }),
        }),
        15000,
        "fetch(/api/auth/password)"
      );

      const text = await withTimeout(res.text(), 8000, "read response text");
      const data = JSON.parse(text);

      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);

      setDiag({ step: `token_received(${origin})`, status: res.status });

      // ✅ Token en memoria (NO setSession)
      setMemoryAccessToken(data.access_token);

      // ✅ Probe a tabla real (ajusta si en tu esquema se llama distinto)
      setDiag({ step: `probe_supabase(${origin})` });
      const probe = await withTimeout(
        supabase.from("organizations").select("id").limit(1),
        8000,
        "probe organizations"
      );
      if (probe.error) throw new Error(`Probe error: ${probe.error.message}`);

      lastResultRef.current = "success";
      setDiag({ step: `navigate(${origin})` });
      setMsg("✅ Sesión activa. Entrando…");
      navigate(next, { replace: true });
    } catch (e: any) {
      lastResultRef.current = "error";
      setDiag({ step: `error(${origin})`, message: String(e?.message || e) });
      setErr(String(e?.message || "No se pudo iniciar sesión."));
    } finally {
      setBusy(false);
    }
  }

  function clearTimers() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (tickRef.current) window.clearInterval(tickRef.current);
    timerRef.current = null;
    tickRef.current = null;
    setCountdown(null);
  }

  // ✅ AUTO-LOGIN por cambios en email/password
  useEffect(() => {
    clearTimers();

    const emailClean = email.trim().toLowerCase();
    const ready = isValidEmail(emailClean) && password.length > 0;

    // Si ya hubo error con el mismo par, NO auto-reintentar hasta que cambie algo
    const attemptKey = `${emailClean}|${password}`;
    const sameAsLast = attemptKey === lastAttemptKeyRef.current;
    const blocked = sameAsLast && lastResultRef.current === "error";

    if (!ready) {
      setDiag((d) => (d.step === "idle" ? d : { step: "idle" }));
      return;
    }

    if (busy) return;

    if (blocked) {
      setDiag({
        step: "auto_blocked_same_credentials",
        message: "Cambia la contraseña o el correo para reintentar.",
      });
      return;
    }

    // countdown visible (1.2s)
    setDiag({ step: "auto_countdown" });
    const start = Date.now();
    const total = 1200;

    setCountdown(total);

    tickRef.current = window.setInterval(() => {
      const left = total - (Date.now() - start);
      setCountdown(Math.max(0, Math.ceil(left)));
    }, 100);

    timerRef.current = window.setTimeout(() => {
      clearTimers();
      setDiag({ step: "auto_login_start" });
      doLogin("auto");
    }, total);

    return () => clearTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password]);

  const inputClass =
    "w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 " +
    "text-white placeholder:text-slate-400 caret-white " +
    "outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 " +
    "disabled:opacity-100 disabled:text-white disabled:cursor-not-allowed";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl relative z-[999999] pointer-events-auto">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl relative z-[999999] pointer-events-auto">
          <h1 className="text-3xl font-semibold mb-6">
            Entrar <span className="text-xs opacity-60">(LOGIN-V26)</span>
          </h1>

          <div className="mb-6 text-xs p-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-100">
            <div className="font-semibold mb-1">Modo Auto-Login</div>
            <div>
              Al detectar correo + contraseña, inicia login automáticamente en{" "}
              <b>{countdown === null ? "—" : `${countdown}ms`}</b>.
            </div>
            <div className="opacity-90 mt-1">
              Si falla, cambia la contraseña o el correo para reintentar (no reintenta infinito).
            </div>
          </div>

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
          />

          {/* Botón solo informativo (clicks están bloqueados en tu entorno) */}
          <div className="w-full mt-8 py-4 rounded-2xl bg-white/90 text-slate-900 font-semibold text-center opacity-90">
            Entrar (auto)
          </div>

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
