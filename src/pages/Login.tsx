// LOGIN-V16 – hard-timeout (sin depender de Abort) + reset PWA/cache
import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

type Diag = {
  at: string;
  step: string;
  status?: number | null;
  ms?: number | null;
  message?: string;
  raw?: string;
};

function redactTokens(text = "") {
  return text
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[redacted]"')
    .replace(/"refresh_token"\s*:\s*"[^"]+"/gi, '"refresh_token":"[redacted]"')
    .replace(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted_jwt]");
}

// ✅ Hard timeout aunque fetch quede colgado
async function postJsonHardTimeout(url: string, body: any, timeoutMs = 15000) {
  const t0 = performance.now();
  const diag: Diag = { at: new Date().toISOString(), step: "start" };

  const fetchPromise = (async () => {
    diag.step = "fetch";
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Cache-Control": "no-store",
      },
      cache: "no-store",
      credentials: "same-origin",
      body: JSON.stringify(body),
    });

    diag.step = "read_text";
    const rawText = await r.text();
    diag.status = r.status;
    diag.raw = rawText ? redactTokens(rawText).slice(0, 700) : "";

    diag.step = "parse";
    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { raw: rawText };
    }

    if (!r.ok) {
      diag.step = "http_error";
      diag.message = data?.error || data?.message || `HTTP ${r.status}`;
      throw new Error(diag.message);
    }

    diag.step = "ok";
    return { data, diag };
  })();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      diag.step = "timeout";
      diag.message = `Timeout ${Math.round(timeoutMs / 1000)}s esperando ${url}`;
      reject(new Error(diag.message));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([fetchPromise, timeoutPromise]);
    diag.ms = Math.round(performance.now() - t0);
    return result;
  } catch (e: any) {
    diag.ms = Math.round(performance.now() - t0);
    e.diag = diag;
    throw e;
  }
}

// ✅ Botón “Reset Cache/PWA” (para matar bundle viejo)
async function resetSiteCache() {
  try {
    // Unregister SW
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }

    // Clear Cache Storage
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }

    // Try clear storages (puede fallar si están bloqueados)
    try {
      localStorage.clear();
    } catch {}
    try {
      sessionStorage.clear();
    } catch {}
  } finally {
    // Hard reload
    window.location.href = window.location.pathname + "?v=" + Date.now();
  }
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = useMemo(() => searchParams.get("next") || "/inicio", [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [diag, setDiag] = useState<Diag | null>(null);
  const [showDiag, setShowDiag] = useState(true); // déjalo visible por ahora para cerrar el caso

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
    setDiag({ at: new Date().toISOString(), step: "clicked" });

    try {
      // 1) API con hard-timeout
      const { data, diag: d } = await postJsonHardTimeout(
        "/api/auth/password",
        { email: emailClean, password },
        15000
      );
      setDiag(d);

      // 2) Set session (en memoria)
      const { error } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (error) {
        const d2: Diag = {
          at: new Date().toISOString(),
          step: "setSession_error",
          message: String(error.message || error),
        };
        setDiag(d2);
        throw error;
      }

      // 3) Entrar
      setMsg("✅ Sesión creada. Entrando…");
      navigate(next, { replace: true });
    } catch (e: any) {
      setErr(String(e?.message || "No se pudo iniciar sesión."));
      if (e?.diag) setDiag(e.diag);
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
        onSubmit={onPasswordLogin}
        className="w-full max-w-xl bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 mb-8">
          <h1 className="text-3xl font-semibold">
            Entrar <span className="text-xs opacity-60">(LOGIN-V16)</span>
          </h1>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowDiag((v) => !v)}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-700 bg-slate-800 hover:bg-slate-700"
            >
              {showDiag ? "Ocultar diag" : "Ver diag"}
            </button>

            <button
              type="button"
              onClick={resetSiteCache}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-100"
              title="Desregistra Service Worker y limpia caches"
            >
              Reset Cache/PWA
            </button>
          </div>
        </div>

        <label className="block mb-2 text-sm text-slate-300">Correo</label>
        <input
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          inputMode="email"
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
          disabled={busy}
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

        {showDiag && (
          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4 text-white/70 space-y-1">
            <div className="font-semibold text-white/80">Diagnóstico</div>
            <div>href: {typeof window !== "undefined" ? window.location.href : "-"}</div>
            <div>next: {next}</div>
            <div>busy: {String(busy)}</div>
            <div>diag.step: {diag?.step || "-"}</div>
            <div>diag.status: {String(diag?.status ?? "-")}</div>
            <div>diag.ms: {String(diag?.ms ?? "-")}</div>
            <div>diag.message: {diag?.message || "-"}</div>
            <div className="break-words">diag.raw: {diag?.raw || "-"}</div>
          </div>
        )}

        <Link to="/" className="block mt-6 text-sm underline opacity-80 hover:opacity-100">
          Volver
        </Link>
      </form>
    </div>
  );
}
