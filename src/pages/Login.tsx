// LOGIN-V22 – Bypass React events: native capture listeners + click target inspector
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import supabase, { setMemoryAccessToken } from "../supabaseClient";

type Diag = {
  step: string;
  status?: number;
  message?: string;
  target?: string;
  targetId?: string;
  targetClass?: string;
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

function describeTarget(t: any) {
  if (!t || typeof t !== "object") return { target: "-", targetId: "-", targetClass: "-" };
  const el = t as HTMLElement;
  const tag = (el.tagName || "-").toLowerCase();
  const id = (el.id || "").slice(0, 60) || "-";
  const cls =
    typeof el.className === "string"
      ? el.className.slice(0, 140) || "-"
      : (el.getAttribute?.("class") || "-").slice(0, 140);
  return { target: tag, targetId: id, targetClass: cls };
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

  const btnRef = useRef<HTMLButtonElement | null>(null);

  async function doLogin(origin: string) {
    if (busy) return;

    setDiag((d) => ({ ...d, step: `login_start(${origin})` }));
    setBusy(true);
    setErr("");
    setMsg("");

    const emailClean = email.trim().toLowerCase();
    if (!emailClean || !password) {
      setDiag((d) => ({ ...d, step: `validation_error(${origin})`, message: "Falta correo o contraseña" }));
      setErr("Escribe tu correo y contraseña.");
      setBusy(false);
      return;
    }

    try {
      setDiag((d) => ({ ...d, step: `fetching(${origin})` }));

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

      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);

      setDiag((d) => ({ ...d, step: `token_received(${origin})`, status: res.status }));

      // ✅ Token en memoria (NO setSession)
      setMemoryAccessToken(data.access_token);

      // ✅ Probe: usa una tabla que exista SI o SI
      setDiag((d) => ({ ...d, step: `probe_supabase(${origin})` }));
      const probe = await withTimeout(
        supabase.from("organizations").select("id").limit(1),
        8000,
        "probe organizations"
      );

      if (probe.error) throw new Error(`Probe error: ${probe.error.message}`);

      setDiag((d) => ({ ...d, step: `navigate(${origin})` }));
      setMsg("✅ Sesión activa. Entrando…");
      navigate(next, { replace: true });
    } catch (e: any) {
      setDiag((d) => ({ ...d, step: `error(${origin})`, message: String(e?.message || e) }));
      setErr(String(e?.message || "No se pudo iniciar sesión."));
    } finally {
      setBusy(false);
    }
  }

  // ✅ Listener nativo: captura TODOS los clicks aunque React no los procese
  useEffect(() => {
    const onDocClickCapture = (ev: MouseEvent) => {
      const info = describeTarget(ev.target);
      setDiag((d) => ({
        ...d,
        step: d.step === "idle" ? "doc_click_capture" : d.step,
        ...info,
      }));
    };

    const onBtnPointerDown = (ev: PointerEvent) => {
      // Si esto se ejecuta, el botón sí está recibiendo eventos reales
      const info = describeTarget(ev.target);
      setDiag((d) => ({ ...d, step: "native_button_pointerdown", ...info }));
      // Dispara login desde aquí también (bypass total)
      doLogin("native");
    };

    document.addEventListener("click", onDocClickCapture, true); // capture
    const btn = btnRef.current;
    if (btn) btn.addEventListener("pointerdown", onBtnPointerDown, true); // capture

    return () => {
      document.removeEventListener("click", onDocClickCapture, true);
      if (btn) btn.removeEventListener("pointerdown", onBtnPointerDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, email, password, next]);

  const inputClass =
    "w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 " +
    "text-white placeholder:text-slate-400 caret-white " +
    "outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 " +
    "disabled:opacity-100 disabled:text-white disabled:cursor-not-allowed";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl relative z-[999999] pointer-events-auto">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl relative z-[999999] pointer-events-auto">
          <h1 className="text-3xl font-semibold mb-8">
            Entrar <span className="text-xs opacity-60">(LOGIN-V22)</span>
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
          />

          {/* Botón React + estilos a prueba de overlays */}
          <button
            ref={btnRef}
            type="button"
            onClick={() => doLogin("react")}
            disabled={busy}
            style={{
              position: "relative",
              zIndex: 2147483647,
              pointerEvents: "auto",
            }}
            className="w-full mt-8 py-4 rounded-2xl bg-white text-slate-900 font-semibold disabled:opacity-60"
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
            <div>target: {diag.target || "-"}</div>
            <div>targetId: {diag.targetId || "-"}</div>
            <div>targetClass: {diag.targetClass || "-"}</div>
          </div>

          <Link to="/" className="block mt-6 text-sm underline opacity-80 hover:opacity-100">
            Volver
          </Link>
        </div>
      </div>
    </div>
  );
}
