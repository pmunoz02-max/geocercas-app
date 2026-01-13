// LOGIN-V23 – Detector de overlay encima del botón (sin necesidad de click)
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import supabase, { setMemoryAccessToken } from "../supabaseClient";

type Diag = {
  step: string;
  status?: number;
  message?: string;
};

type Cover = {
  tag: string;
  id: string;
  cls: string;
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

function elInfo(el: Element | null): Cover {
  if (!el) return { tag: "-", id: "-", cls: "-" };
  const h = el as HTMLElement;
  const tag = (h.tagName || "-").toLowerCase();
  const id = (h.id || "-").slice(0, 60) || "-";
  const cls =
    (typeof h.className === "string" ? h.className : h.getAttribute("class") || "-")
      .toString()
      .slice(0, 160) || "-";
  return { tag, id, cls };
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

  // 👇 detector de “qué está encima del botón”
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [cover, setCover] = useState<Cover>({ tag: "-", id: "-", cls: "-" });
  const [isButtonTop, setIsButtonTop] = useState<boolean>(false);

  useEffect(() => {
    const t = setInterval(() => {
      try {
        const btn = btnRef.current;
        if (!btn) return;

        const r = btn.getBoundingClientRect();
        const x = Math.floor(r.left + r.width / 2);
        const y = Math.floor(r.top + r.height / 2);

        const topEl = document.elementFromPoint(x, y);
        setCover(elInfo(topEl));

        // ¿el elemento top es el botón (o algo dentro del botón)?
        const ok = !!topEl && (topEl === btn || btn.contains(topEl));
        setIsButtonTop(ok);
      } catch {
        // ignore
      }
    }, 700);

    return () => clearInterval(t);
  }, []);

  async function handleLogin() {
    if (busy) return;

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
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          body: JSON.stringify({ email: emailClean, password }),
        }),
        15000,
        "fetch(/api/auth/password)"
      );

      const text = await withTimeout(res.text(), 8000, "read response text");
      const data = JSON.parse(text);

      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);

      setDiag({ step: "token_received", status: res.status });

      // token en memoria (NO setSession)
      setMemoryAccessToken(data.access_token);

      // probe (ajusta si tu tabla se llama distinto)
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
    "outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      {/* Card encima de todo */}
      <div className="w-full max-w-xl relative z-[999999] pointer-events-auto">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl relative z-[999999] pointer-events-auto">
          <h1 className="text-3xl font-semibold mb-8">
            Entrar <span className="text-xs opacity-60">(LOGIN-V23)</span>
          </h1>

          {/* Detector visible */}
          <div
            className={`mb-6 p-4 rounded-2xl border text-xs ${
              isButtonTop
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                : "border-red-400/30 bg-red-500/10 text-red-100"
            }`}
          >
            <div className="font-semibold mb-1">
              Overlay detector: {isButtonTop ? "✅ botón está arriba" : "❌ algo lo cubre"}
            </div>
            <div>Top element: {cover.tag}</div>
            <div>id: {cover.id}</div>
            <div>class: {cover.cls}</div>
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

          <button
            ref={btnRef}
            type="button"
            onClick={handleLogin}
            disabled={busy}
            style={{ position: "relative", zIndex: 2147483647, pointerEvents: "auto" }}
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
          </div>

          <Link to="/" className="block mt-6 text-sm underline opacity-80 hover:opacity-100">
            Volver
          </Link>
        </div>
      </div>
    </div>
  );
}
