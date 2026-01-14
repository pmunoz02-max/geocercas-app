// LOGIN-V29.1 – WebView safe (DOM-ref + blur)
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

async function withTimeout<T>(p: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Timeout")), ms);
    p.then(v => { clearTimeout(t); resolve(v); })
     .catch(e => { clearTimeout(t); reject(e); });
  });
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = useMemo(() => searchParams.get("next") || "/inicio", [searchParams]);

  const [email, setEmail] = useState("pruebatugeo@gmail.com");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [diag, setDiag] = useState<Diag>({ step: "idle" });

  // 🔒 latch anti rate-limit
  const firedRef = useRef(false);

  // 🔐 refs DOM (CLAVE para WebView)
  const passwordRef = useRef<HTMLInputElement | null>(null);

  async function doLogin() {
    if (busy || firedRef.current) return;

    const emailClean = email.trim().toLowerCase();
    const password = passwordRef.current?.value || "";

    if (!isValidEmail(emailClean) || !password) {
      setDiag({ step: "waiting_password" });
      return;
    }

    firedRef.current = true;
    setBusy(true);
    setErr("");
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
        15000
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message);

      setDiag({ step: "token_received", status: res.status });

      // 🔐 token en memoria (LOGIN-V29)
      setMemoryAccessToken(data.access_token);

      setDiag({ step: "navigate" });
      navigate(next, { replace: true });
    } catch (e: any) {
      firedRef.current = false;
      setBusy(false);
      setDiag({ step: "error", message: String(e?.message || e) });
      setErr(String(e?.message || "No se pudo iniciar sesión"));
    }
  }

  const inputClass =
    "w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 " +
    "text-white placeholder:text-slate-400 outline-none";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <h1 className="text-3xl font-semibold mb-6">
            Entrar <span className="text-xs opacity-60">(LOGIN-V29.1)</span>
          </h1>

          <div className="mb-6 text-xs p-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-100">
            Login estable sin reintentos automáticos (protección anti rate-limit).
          </div>

          <label className="block mb-2 text-sm">Correo</label>
          <input
            className={inputClass}
            value={email}
            onChange={e => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            disabled={busy}
          />

          <div className="h-6" />

          <label className="block mb-2 text-sm">Contraseña</label>
          <input
            ref={passwordRef}
            className={inputClass}
            type="password"
            autoComplete="current-password"
            disabled={busy}
            onBlur={doLogin}          // 👈 disparo humano
            onInput={() => {}}        // 👈 asegura captura en WebView
          />

          <div className="w-full mt-8 py-4 rounded-2xl bg-white/90 text-slate-900 font-semibold text-center">
            {busy ? "Entrando…" : "Complete la contraseña"}
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
