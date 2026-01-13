// LOGIN-V19 – submit garantizado + diagnóstico desde el click
import React, { useMemo, useRef, useState } from "react";
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
  const formRef = useRef<HTMLFormElement | null>(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = useMemo(() => searchParams.get("next") || "/inicio", [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [diag, setDiag] = useState<Diag>({ step: "idle" });

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setErr("");
    setMsg("");
    setDiag({ step: "handler_entered" });

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

      // ✅ Sin setSession: token en memoria
      setMemoryAccessToken(data.access_token);

      // ✅ Probe ligero (si falla, lo veremos)
      setDiag({ step: "probe_supabase" });
      const probe = await withTimeout(
        supabase.from("organizations").select("id").limit(1),
        8000,
        "probe supabase query (organizations)"
      );

      if (probe.error) throw new Error(`Probe error: ${probe.error.message}`);

      setDiag({ step: "navigate" });
      setMsg("✅ Sesión en memoria activa. Entrando…");
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
      <form
        ref={formRef}
        onSubmit={onLogin}
        className="w-full max-w-xl bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl"
      >
        <h1 className="text-3xl font-semibold mb-8">
          Entrar <span className="text-xs opacity-60">(LOGIN-V19)</span>
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

        <button
          type="submit"
          disabled={busy}
          onClick={() => {
            // ✅ Si el click llega, esto cambia de inmediato
            setDiag({ step: "clicked_submit" });

            // ✅ Fuerza submit incluso si algo bloquea el submit normal
            try {
              formRef.current?.requestSubmit();
            } catch {}
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
        </div>

        <Link to="/" className="block mt-6 text-sm underline opacity-80 hover:opacity-100">
          Volver
        </Link>
      </form>
    </div>
  );
}
