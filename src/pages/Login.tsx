// LOGIN-V30 – Disparo explícito por TAP (WebView/TWA-safe), sin auto-login
import React, { useMemo, useRef, useState } from "react";
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

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = useMemo(() => searchParams.get("next") || "/inicio", [searchParams]);

  // Solo para UI (display). La lectura real se hace desde refs.
  const [emailUI, setEmailUI] = useState("pruebatugeo@gmail.com");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [diag, setDiag] = useState<Diag>({ step: "idle" });

  // 🔒 latch anti-rate-limit (un request por intento)
  const firedRef = useRef(false);

  // 🔐 refs DOM (fuente de verdad en WebView)
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passRef = useRef<HTMLInputElement | null>(null);

  async function doLoginByTap() {
    if (busy || firedRef.current) return;

    const emailClean = (emailRef.current?.value || emailUI || "").trim().toLowerCase();
    const password = passRef.current?.value || "";

    if (!isValidEmail(emailClean)) {
      setErr("Completa un correo válido.");
      setDiag({ step: "invalid_email" });
      return;
    }
    if (!password) {
      setErr("Complete la contraseña.");
      setDiag({ step: "missing_password" });
      return;
    }

    firedRef.current = true;
    setBusy(true);
    setErr("");
    setDiag({ step: "fetching" });

    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({ email: emailClean, password }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        const msg = data?.error || data?.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const token = data?.access_token;
      if (!token) throw new Error("No llegó access_token");

      setDiag({ step: "token_received", status: res.status });

      // ✅ token en memoria (compatible con AuthContext POSTLOGIN-V1)
      setMemoryAccessToken(token);

      setDiag({ step: "navigate" });
      navigate(next, { replace: true });
    } catch (e: any) {
      // Permite reintento manual (tap) si falló
      firedRef.current = false;
      setBusy(false);

      const msg = String(e?.message || e || "No se pudo iniciar sesión");
      setErr(msg);
      setDiag({ step: "error", message: msg });
    }
  }

  // Handler universal: se llama desde varios eventos para cubrir WebViews “rotos”
  function onTap() {
    // Nunca auto; siempre gesto humano explícito
    doLoginByTap();
  }

  const inputClass =
    "w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 " +
    "text-white placeholder:text-slate-400 outline-none";

  const buttonClass =
    "w-full mt-8 py-4 rounded-2xl font-semibold text-center select-none " +
    (busy
      ? "bg-white/60 text-slate-800"
      : "bg-white/90 text-slate-900 active:bg-white");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <h1 className="text-3xl font-semibold mb-6">
            Entrar <span className="text-xs opacity-60">(LOGIN-V30)</span>
          </h1>

          <div className="mb-6 text-xs p-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-100">
            Login estable sin reintentos automáticos (tap explícito, anti rate-limit).
          </div>

          <label className="block mb-2 text-sm">Correo</label>
          <input
            ref={emailRef}
            className={inputClass}
            value={emailUI}
            onChange={(e) => setEmailUI(e.target.value)}
            onInput={() => {}}
            type="email"
            autoComplete="email"
            disabled={busy}
          />

          <div className="h-6" />

          <label className="block mb-2 text-sm">Contraseña</label>
          <input
            ref={passRef}
            className={inputClass}
            type="password"
            autoComplete="current-password"
            disabled={busy}
            onInput={() => {}}
          />

          {/* ✅ Botón “tap-first” con fallbacks múltiples */}
          <div
            role="button"
            tabIndex={0}
            aria-disabled={busy ? "true" : "false"}
            className={buttonClass}
            // Principal (más confiable en WebView modernos)
            onPointerUpCapture={onTap}
            // Fallbacks para WebViews viejos / inconsistentes
            onTouchEndCapture={onTap}
            onMouseUpCapture={onTap}
            onClick={onTap}
          >
            {busy ? "Entrando…" : "Entrar"}
          </div>

          {err && <div className="mt-4 text-sm text-red-400">{err}</div>}

          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4">
            <div>step: {diag.step}</div>
            <div>status: {String(diag.status ?? "-")}</div>
            <div>message: {diag.message || "-"}</div>
          </div>

          <Link to="/" className="block mt-6 text-sm underline opacity-80">
            Volver
          </Link>
        </div>
      </div>
    </div>
  );
}
