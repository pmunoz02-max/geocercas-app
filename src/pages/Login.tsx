import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function getQueryParam(search: string, key: string) {
  const v = new URLSearchParams(search).get(key);
  return v ?? "";
}

function safeNextPath(next: string) {
  if (!next) return "/inicio";
  if (next.startsWith("/")) return next;
  return "/inicio";
}

const inputClass =
  "w-full rounded-xl border px-3 py-2 outline-none focus:ring " +
  "bg-white !text-gray-900 caret-black !placeholder:text-gray-400 " +
  "autofill:shadow-[inset_0_0_0px_1000px_rgb(255,255,255)] " +
  "autofill:[-webkit-text-fill-color:rgb(17,24,39)] " +
  "autofill:caret-black";

type Mode = "magic" | "password" | "reset";

function normalizeMode(m: string): Mode {
  const v = (m || "").toLowerCase().trim();
  if (v === "password") return "password";
  if (v === "reset") return "reset";
  return "magic";
}

const MODE_LS_KEY = "login_mode_v1";

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();

  // ✅ Modo persistente (universal): URL ?mode= + fallback localStorage
  const modeFromUrl = useMemo(() => normalizeMode(getQueryParam(location.search, "mode")), [location.search]);

  const modeFromStorage = useMemo(() => {
    try {
      return normalizeMode(localStorage.getItem(MODE_LS_KEY) || "");
    } catch {
      return "magic" as Mode;
    }
  }, []);

  const initialMode = useMemo<Mode>(() => {
    return modeFromUrl !== "magic" ? modeFromUrl : modeFromStorage;
  }, [modeFromUrl, modeFromStorage]);

  const [mode, setMode] = useState<Mode>(initialMode);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [nextInput, setNextInput] = useState("/inicio");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const nextFromUrl = useMemo(() => {
    const n = getQueryParam(location.search, "next");
    return safeNextPath(n || "/inicio");
  }, [location.search]);

  const inboundErr = useMemo(() => {
    const e = getQueryParam(location.search, "err");
    return e || "";
  }, [location.search]);

  useEffect(() => {
    if (inboundErr) setErr(inboundErr);
  }, [inboundErr]);

  useEffect(() => {
    setNextInput(nextFromUrl);
  }, [nextFromUrl]);

  // ✅ Mantener el modo sincronizado con URL si viene explícito
  useEffect(() => {
    if (modeFromUrl && modeFromUrl !== mode) {
      setMode(modeFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeFromUrl]);

  // ✅ Guardar modo en localStorage (persistente ante remount)
  useEffect(() => {
    try {
      localStorage.setItem(MODE_LS_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode]);

  // ✅ Helper: setMode + actualizar query param sin romper next/err
  function setModePersist(nextMode: Mode) {
    setMode(nextMode);
    setErr(null);
    setMsg(null);

    const sp = new URLSearchParams(location.search || "");
    sp.set("mode", nextMode);
    // preserva next y err si existen
    navigate(`/login?${sp.toString()}`, { replace: true });
  }

  // IMPORTANTE: fallback robusto (si VITE_SITE_URL está vacío en preview)
  const siteUrl = useMemo(() => {
    const envUrl = (import.meta.env.VITE_SITE_URL || "").trim();
    if (envUrl) return envUrl;
    return window.location.origin;
  }, []);

  // Magic Link / Callback (APP)
  const redirectTo = useMemo(() => {
    const next = safeNextPath(nextInput);
    const url = new URL("/auth/callback", siteUrl);
    url.searchParams.set("next", next);
    return url.toString();
  }, [siteUrl, nextInput]);

  // Reset Password debe entrar por /auth/callback para setSession + bootstrap cookie
  const resetRedirectTo = useMemo(() => {
    const url = new URL("/auth/callback", siteUrl);
    url.searchParams.set("next", "/reset-password");
    url.searchParams.set("rp_next", safeNextPath(nextInput));
    return url.toString();
  }, [siteUrl, nextInput]);

  async function bootstrapCookie(accessToken: string, refreshToken: string, expiresIn?: number) {
    const res = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        refresh_token: refreshToken,
        expires_in: typeof expiresIn === "number" ? expiresIn : undefined,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(
        `No se pudo completar bootstrap de sesión (HTTP ${res.status}). ${txt || ""}`.trim()
      );
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErr("Ingresa un correo válido.");
      return;
    }

    try {
      setBusy(true);

      // 1) MAGIC LINK
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email: cleanEmail,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setMsg("Listo. Te enviamos un Magic Link. Ábrelo en el mismo navegador.");
        return;
      }

      // 2) PASSWORD
      if (mode === "password") {
        if (!password || password.length < 6) {
          setErr("Ingresa tu contraseña (mínimo 6 caracteres).");
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;

        const session = data?.session || (await supabase.auth.getSession()).data.session;

        const accessToken = session?.access_token || "";
        const refreshToken = session?.refresh_token || "";
        const expiresIn = typeof session?.expires_in === "number" ? session.expires_in : undefined;

        if (!accessToken) throw new Error("No se pudo obtener access_token de sesión.");
        if (!refreshToken) throw new Error("No se pudo obtener refresh_token de sesión.");

        await bootstrapCookie(accessToken, refreshToken, expiresIn);

        setMsg("✅ Sesión iniciada. Entrando...");
        navigate(safeNextPath(nextInput), { replace: true });
        return;
      }

      // 3) RESET PASSWORD (ENVIAR EMAIL)
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: resetRedirectTo,
        });
        if (error) throw error;

        setMsg("✅ Si el correo existe, te llegará un enlace para crear una nueva contraseña. Revisa SPAM.");
        return;
      }
    } catch (e2: any) {
      setErr(e2?.message || "No se pudo procesar la solicitud.");
    } finally {
      setBusy(false);
    }
  }

  const tabBase = "flex-1 rounded-xl px-3 py-2 text-sm font-medium border transition";
  const tabOn = "bg-slate-900 text-white border-slate-900";
  const tabOff = "bg-white text-slate-900 border-slate-300 hover:bg-slate-50";

  const primaryText =
    mode === "magic" ? "Enviar Magic Link" : mode === "password" ? "Entrar" : "Enviar enlace de reset";

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6 bg-slate-50 !text-gray-900">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm !text-gray-900">
        <h1 className="text-xl font-semibold !text-gray-900">Ingresar</h1>

        {/* Tabs */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={`${tabBase} ${mode === "magic" ? tabOn : tabOff}`}
            onClick={() => setModePersist("magic")}
          >
            Magic Link
          </button>
          <button
            type="button"
            className={`${tabBase} ${mode === "password" ? tabOn : tabOff}`}
            onClick={() => setModePersist("password")}
          >
            Password
          </button>
          <button
            type="button"
            className={`${tabBase} ${mode === "reset" ? tabOn : tabOff}`}
            onClick={() => setModePersist("reset")}
          >
            Reset
          </button>
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}
        {msg && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {msg}
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="block text-sm font-medium !text-gray-900">Email</label>
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />
          </div>

          {mode === "password" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium !text-gray-900">Contraseña</label>
              <input
                className={inputClass}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium !text-gray-900">Ir a (next)</label>
            <input
              className={inputClass}
              type="text"
              value={nextInput}
              onChange={(e) => setNextInput(e.target.value)}
              placeholder="/inicio"
            />
          </div>

          <button
            className="w-full rounded-xl !bg-black px-4 py-2 !text-white disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? "Procesando..." : primaryText}
          </button>

          <button
            type="button"
            className="w-full rounded-xl border px-4 py-2 !text-gray-900 bg-white"
            onClick={() => navigate("/")}
          >
            Volver
          </button>
        </form>

        {/* Debug / info */}
        <div className="mt-4 text-xs text-gray-500 space-y-2">
          <div>
            Redirect Magic Link: <span className="break-all">{redirectTo}</span>
          </div>
          <div>
            Redirect Reset: <span className="break-all">{resetRedirectTo}</span>
          </div>
          <div>
            Mode persistente: <span className="break-all">{mode}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
