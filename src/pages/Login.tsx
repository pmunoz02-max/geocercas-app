import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

type FetchDiag = {
  at: string;
  url: string;
  status: number | null;
  ok: boolean | null;
  ms: number | null;
  version?: string;
  message?: string;
  rawText?: string;
};

async function fetchJsonDiag(
  url: string,
  payload: any,
  timeoutMs = 20000
): Promise<{ data: any; diag: FetchDiag }> {
  const controller = new AbortController();
  const t0 = performance.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const diag: FetchDiag = {
    at: new Date().toISOString(),
    url,
    status: null,
    ok: null,
    ms: null,
  };

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Cache-Control": "no-store",
      },
      cache: "no-store",
      credentials: "same-origin",
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    diag.status = r.status;
    diag.ok = r.ok;

    const rawText = await r.text();
    diag.rawText = rawText;

    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { raw: rawText };
    }

    diag.version = data?.version;
    diag.message = data?.error || data?.message;

    if (!r.ok) {
      const err: any = new Error(diag.message || `Request failed (${r.status})`);
      err.data = data;
      err.status = r.status;
      throw err;
    }

    return { data, diag };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      diag.status = 0;
      diag.ok = false;
      diag.message = `Timeout ${Math.round(timeoutMs / 1000)}s (AbortController)`;
      throw Object.assign(new Error(diag.message), { status: 0, diag });
    }
    // errores tipo "Failed to fetch" / bloqueos
    if (!diag.message) diag.message = String(e?.message || e);
    throw Object.assign(e, { diag });
  } finally {
    clearTimeout(timer);
    diag.ms = Math.round(performance.now() - t0);
  }
}

async function ensureSessionOrThrow(timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) return data.session;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("No se pudo establecer sesión local (tokens no persistieron).");
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const next = useMemo(() => searchParams.get("next") || "/inicio", [searchParams]);

  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [diag, setDiag] = useState<FetchDiag | null>(null);

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/auth/callback`;
  }, []);

  async function testApi() {
    if (busy) return;
    setBusy(true);
    setErr("");
    setMsg("");
    setDiag(null);

    try {
      // ⚠️ payload controlado (NO usa tu password)
      await fetchJsonDiag("/api/auth/password", { email: "test@example.com", password: "badpass" }, 12000);
      // Si llegara aquí sería raro (debería fallar 400/401)
      setMsg("La API respondió OK (inesperado).");
    } catch (e: any) {
      const d: FetchDiag | undefined = e?.diag;
      if (d) setDiag(d);
      setMsg("Prueba API ejecutada. Revisa Diagnóstico abajo.");
    } finally {
      setBusy(false);
    }
  }

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const emailClean = email.trim().toLowerCase();
    const passwordClean = String(password || "");

    if (!emailClean || !passwordClean) {
      setMsg("");
      setErr("Escribe tu correo y contraseña.");
      return;
    }

    setErr("");
    setMsg("");
    setDiag(null);
    setBusy(true);

    try {
      const { data, diag: d } = await fetchJsonDiag(
        "/api/auth/password",
        { email: emailClean, password: passwordClean },
        20000
      );
      setDiag(d);

      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      await ensureSessionOrThrow(4000);

      // ✅ recarga limpia para que AuthContext/guards lo lean sin rebote
      window.location.replace(next);
    } catch (e2: any) {
      const d: FetchDiag | undefined = e2?.diag;
      if (d) setDiag(d);

      const message = String(e2?.message || "");
      const ml = message.toLowerCase();

      if (ml.includes("invalid") || ml.includes("credentials")) setErr("Correo o contraseña incorrectos.");
      else if (ml.includes("timeout")) setErr("Timeout. Algo está bloqueando el request o la Function está colgada.");
      else if (ml.includes("failed to fetch")) setErr("Failed to fetch. Bloqueo/extensión/antivirus o error de red.");
      else setErr(message || "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  async function onSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const emailClean = email.trim().toLowerCase();
    if (!emailClean) {
      setMsg("");
      setErr("Escribe tu correo.");
      return;
    }

    setErr("");
    setMsg("");
    setDiag(null);
    setBusy(true);

    try {
      const { diag: d } = await fetchJsonDiag("/api/auth/magic", { email: emailClean, redirectTo }, 20000);
      setDiag(d);
      setMsg("Te enviamos un enlace de acceso. Revisa tu correo.");
    } catch (e2: any) {
      const d: FetchDiag | undefined = e2?.diag;
      if (d) setDiag(d);
      setErr(String(e2?.message || "No se pudo enviar el Magic Link."));
    } finally {
      setBusy(false);
    }
  }

  async function onForgotPassword() {
    if (busy) return;

    const emailClean = email.trim().toLowerCase();
    if (!emailClean) {
      setMsg("");
      setErr("Escribe tu correo primero.");
      return;
    }

    setErr("");
    setMsg("");
    setDiag(null);
    setBusy(true);

    try {
      const { diag: d } = await fetchJsonDiag("/api/auth/recover", { email: emailClean, redirectTo }, 20000);
      setDiag(d);
      setMsg("Te enviamos un correo para recuperar tu contraseña.");
    } catch (e2: any) {
      const d: FetchDiag | undefined = e2?.diag;
      if (d) setDiag(d);
      setErr(String(e2?.message || "No se pudo enviar el correo de recuperación."));
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 " +
    "text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-sky-500";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm underline opacity-80 hover:opacity-100">
            Volver
          </Link>

          <button
            type="button"
            onClick={testApi}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50"
            title="Ejecuta una prueba controlada (sin tu contraseña) para ver si el browser puede llamar a /api/auth/password"
          >
            {busy ? "Probando…" : "Probar API"}
          </button>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="w-full max-w-3xl bg-slate-900/70 border border-slate-800 rounded-3xl p-8 shadow-xl">
            <h1 className="text-2xl font-semibold">Entrar</h1>

            <div className="mt-4 inline-flex gap-2">
              <button
                type="button"
                onClick={() => setMode("password")}
                disabled={busy}
                className={
                  "px-4 py-2 rounded-full text-sm font-medium border " +
                  (mode === "password"
                    ? "bg-white text-slate-900 border-white"
                    : "bg-slate-800 text-slate-100 border-slate-700 hover:bg-slate-700") +
                  (busy ? " opacity-70" : "")
                }
              >
                Contraseña
              </button>

              <button
                type="button"
                onClick={() => setMode("magic")}
                disabled={busy}
                className={
                  "px-4 py-2 rounded-full text-sm font-medium border " +
                  (mode === "magic"
                    ? "bg-white text-slate-900 border-white"
                    : "bg-slate-800 text-slate-100 border-slate-700 hover:bg-slate-700") +
                  (busy ? " opacity-70" : "")
                }
              >
                Magic Link
              </button>
            </div>

            <div className="mt-6">
              <label className="block text-sm mb-2 opacity-80">Correo</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                className={inputClass}
              />
            </div>

            {mode === "password" ? (
              <form onSubmit={onPasswordLogin} className="mt-5 space-y-5">
                <div>
                  <label className="block text-sm mb-2 opacity-80">Contraseña</label>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={inputClass}
                  />

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={onForgotPassword}
                      disabled={busy}
                      className="px-4 py-2 rounded-xl text-sm font-semibold border border-emerald-400/50 text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/25 hover:text-white focus:ring-2 focus:ring-emerald-400/60 disabled:opacity-50"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                </div>

                <button
                  disabled={busy}
                  className="w-full py-3 rounded-2xl bg-white text-slate-900 font-semibold hover:opacity-95 disabled:opacity-60"
                >
                  {busy ? "Procesando…" : "Entrar"}
                </button>
              </form>
            ) : (
              <form onSubmit={onSendMagicLink} className="mt-5 space-y-5">
                <button
                  disabled={busy}
                  className="w-full py-3 rounded-2xl bg-white text-slate-900 font-semibold hover:opacity-95 disabled:opacity-60"
                >
                  {busy ? "Enviando…" : "Enviar Magic Link"}
                </button>
              </form>
            )}

            {(err || msg) && (
              <div className="mt-4 text-sm space-y-2">
                {err ? <div className="text-red-300">{err}</div> : null}
                {msg ? <div className="text-emerald-300">{msg}</div> : null}
              </div>
            )}

            {/* Diagnóstico visible SIEMPRE */}
            {diag && (
              <div className="mt-5 text-xs bg-black/30 border border-white/10 rounded-2xl p-4 text-white/70">
                <div className="font-semibold text-white/80 mb-2">Diagnóstico</div>
                <div>url: {diag.url}</div>
                <div>status: {String(diag.status)}</div>
                <div>ok: {String(diag.ok)}</div>
                <div>ms: {String(diag.ms)}</div>
                <div>version: {diag.version || "-"}</div>
                <div>message: {diag.message || "-"}</div>
                <div className="mt-2 break-words">
                  raw: {diag.rawText ? diag.rawText.slice(0, 220) : "-"}
                  {diag.rawText && diag.rawText.length > 220 ? "…" : ""}
                </div>
              </div>
            )}

            <div className="mt-4 text-xs opacity-60">
              Tip: si un enlace falla, abre el correo en Chrome/Safari o intenta en incógnito y solicita un link nuevo.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
