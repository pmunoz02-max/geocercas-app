// src/pages/Login.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import LanguageSwitcher from "../components/LanguageSwitcher";

function getQueryParam(search: string, key: string) {
  const v = new URLSearchParams(search).get(key);
  return v ?? "";
}

function hasQueryParam(search: string, key: string) {
  return new URLSearchParams(search).has(key);
}

function safeNextPath(next: string) {
  if (!next) return "/inicio";
  if (next.startsWith("/")) return next;
  return "/inicio";
}

type Mode = "magic" | "password" | "reset";

function normalizeMode(m: string): Mode {
  const v = (m || "").toLowerCase().trim();
  if (v === "password") return "password";
  if (v === "reset") return "reset";
  return "magic";
}

const MODE_LS_KEY = "login_mode_v1";

const inputClass =
  "w-full rounded-xl border px-3 py-2 outline-none focus:ring " +
  "bg-white/5 text-slate-100 placeholder:text-slate-400 border-white/10 " +
  "focus:ring-emerald-500/30 focus:border-emerald-400/40 " +
  "autofill:shadow-[inset_0_0_0px_1000px_rgba(2,6,23,0.95)] " +
  "autofill:[-webkit-text-fill-color:rgb(241,245,249)] " +
  "autofill:caret-[rgb(241,245,249)]";

function hostFromUrl(u?: string) {
  try {
    if (!u) return "";
    return new URL(u).host;
  } catch {
    return "";
  }
}

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // ====== MODO (universal) ======
  const hasModeInUrl = useMemo(() => hasQueryParam(location.search, "mode"), [location.search]);

  const modeFromUrl = useMemo(
    () => normalizeMode(getQueryParam(location.search, "mode")),
    [location.search]
  );

  const modeFromStorage = useMemo(() => {
    try {
      return normalizeMode(localStorage.getItem(MODE_LS_KEY) || "");
    } catch {
      return "magic" as Mode;
    }
  }, []);

  const initialMode = useMemo<Mode>(() => {
    return hasModeInUrl ? modeFromUrl : modeFromStorage;
  }, [hasModeInUrl, modeFromUrl, modeFromStorage]);

  const [mode, setMode] = useState<Mode>(initialMode);

  // ====== FORM ======
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [nextInput, setNextInput] = useState("/inicio");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ====== NEXT / ERR from URL ======
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

  // ✅ Solo sincronizar desde URL si `mode=` existe
  useEffect(() => {
    if (!hasModeInUrl) return;
    if (modeFromUrl !== mode) setMode(modeFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasModeInUrl, modeFromUrl]);

  // ✅ Persist mode
  useEffect(() => {
    try {
      localStorage.setItem(MODE_LS_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode]);

  function setModePersist(nextMode: Mode) {
    setMode(nextMode);
    setErr(null);
    setMsg(null);

    const sp = new URLSearchParams(location.search || "");
    sp.set("mode", nextMode);
    navigate(`/login?${sp.toString()}`, { replace: true });
  }

  // ====== ENV (debug + UX universal) ======
  const supabaseUrlHost = useMemo(() => hostFromUrl(import.meta.env.VITE_SUPABASE_URL), []);
  const siteUrl = useMemo(() => {
    const envUrl = (import.meta.env.VITE_SITE_URL || "").trim();
    if (envUrl) return envUrl;
    return window.location.origin;
  }, []);

  // ====== Redirects ======
  const redirectTo = useMemo(() => {
    const next = safeNextPath(nextInput);
    const url = new URL("/auth/callback", siteUrl);
    url.searchParams.set("next", next);
    return url.toString();
  }, [siteUrl, nextInput]);

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
      const fallback = `Bootstrap failed (HTTP ${res.status}). ${txt || ""}`.trim();
      throw new Error(
        t("login.errors.bootstrapFailed", {
          defaultValue: fallback,
          status: res.status,
          details: txt || "",
        })
      );
    }
  }

  function prettyErr(e2: any) {
    // Supabase suele devolver message
    const m = e2?.message || "";
    const code = e2?.code ? ` [${e2.code}]` : "";
    const status = e2?.status ? ` (HTTP ${e2.status})` : "";
    const hint =
      /invalid login credentials/i.test(m)
        ? " — Si nunca creaste contraseña en ESTE entorno, usa “Restablecer contraseña” para crearla y luego entra con contraseña."
        : "";
    return `${m}${code}${status}${hint}`.trim() || t("login.errors.unknown");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErr(t("login.errors.invalidEmail"));
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
        setMsg(t("login.infoMagicLinkSent"));
        return;
      }

      // 2) PASSWORD
      if (mode === "password") {
        if (!password || password.length < 6) {
          setErr(t("login.errorMissingCredentials"));
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
        const expiresIn =
          typeof session?.expires_in === "number" ? session.expires_in : undefined;

        if (!accessToken) {
          setErr(t("login.errors.noAccessToken", { defaultValue: "Could not get access token." }));
          return;
        }
        if (!refreshToken) {
          setErr(
            t("login.errors.noRefreshToken", { defaultValue: "Could not get refresh token." })
          );
          return;
        }

        // 🔒 Cookie tg_at (fuente real de sesión)
        await bootstrapCookie(accessToken, refreshToken, expiresIn);

        setMsg(t("login.sessionStarted", { defaultValue: "✅ Session started. Entering…" }));
        navigate(safeNextPath(nextInput), { replace: true });
        return;
      }

      // 3) RESET PASSWORD (ENVIAR EMAIL)
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: resetRedirectTo,
        });
        if (error) throw error;

        setMsg(t("login.infoResetPasswordSent"));
        return;
      }
    } catch (e2: any) {
      setErr(prettyErr(e2));
    } finally {
      setBusy(false);
    }
  }

  const tabBase =
    "flex-1 rounded-xl px-3 py-2 text-sm font-semibold border transition select-none";
  const tabOn = "bg-white/10 text-white border-white/20 shadow-sm";
  const tabOff = "bg-white/[0.03] text-slate-200 border-white/10 hover:bg-white/[0.06]";

  const primaryText =
    mode === "magic"
      ? t("login.magicButton")
      : mode === "password"
      ? t("login.submit")
      : t("resetPassword.title");

  const modeHint =
    mode === "magic"
      ? t("login.magicDescription")
      : mode === "password"
      ? t("login.subtitle")
      : t("resetPassword.subtitle");

  const advTitle = t("login.advancedOptions");
  const goToNextLabel = t("login.goToNext", {
    defaultValue: t("login.goToDashboard", { defaultValue: "Go to" }),
  });
  const nextHint = t("login.nextHint", {
    defaultValue: "Useful for tests in PREVIEW. In production, normally you don’t change it.",
  });

  const resetTabLabel = t("login.modeReset", {
    defaultValue: t("resetPassword.title", { defaultValue: "Reset" }),
  });
  const okLabel = t("common.ok", { defaultValue: "OK" });
  const debugLabel = t("common.debug", { defaultValue: "Debug" });

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6 auth-bg">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
            {t("landing.heroBadge")}
          </div>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">
            {t("landing.heroTitlePrefix")}{" "}
            <span className="text-emerald-300">{t("landing.heroTitleHighlight")}</span>
          </h1>

          <p className="mt-2 text-sm text-slate-300">{t("landing.heroSubtitle")}</p>
        </div>

        <div className="auth-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{t("login.title")}</h2>
              <p className="mt-1 text-sm text-slate-300">{modeHint}</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-xs text-slate-400">
                <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
                  PREVIEW
                </span>
              </div>
              <LanguageSwitcher />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <button
              type="button"
              className={`${tabBase} ${mode === "magic" ? tabOn : tabOff}`}
              onClick={() => setModePersist("magic")}
            >
              {t("login.modeMagic")}
            </button>
            <button
              type="button"
              className={`${tabBase} ${mode === "password" ? tabOn : tabOff}`}
              onClick={() => setModePersist("password")}
            >
              {t("login.modePassword")}
            </button>
            <button
              type="button"
              className={`${tabBase} ${mode === "reset" ? tabOn : tabOff}`}
              onClick={() => setModePersist("reset")}
            >
              {resetTabLabel}
            </button>
          </div>

          {err && (
            <div className="mt-4 banner banner-error">
              <div className="font-semibold">{t("reportes.errorLabel")}</div>
              <div className="text-sm opacity-90 whitespace-pre-wrap">{err}</div>
            </div>
          )}
          {msg && (
            <div className="mt-4 banner banner-success">
              <div className="font-semibold">{okLabel}</div>
              <div className="text-sm opacity-90 whitespace-pre-wrap">{msg}</div>
            </div>
          )}

          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                {t("login.emailLabel")}
              </label>
              <input
                className={inputClass}
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("login.emailPlaceholder")}
              />
            </div>

            {mode === "password" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-200">
                  {t("login.passwordLabel")}
                </label>

                <div className="relative">
                  <input
                    className={`${inputClass} pr-12`}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("login.passwordPlaceholder")}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-200 hover:bg-white/[0.08]"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "🙈" : "👁"}
                  </button>
                </div>

                <div className="text-xs text-slate-400">
                  Tip: en Preview y Producción la contraseña es distinta (Supabase distinto).
                </div>
              </div>
            )}

            <details className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <summary className="cursor-pointer select-none text-sm text-slate-300">
                {advTitle}
              </summary>
              <div className="mt-3 space-y-2">
                <label className="block text-sm font-medium text-slate-200">
                  {goToNextLabel} (next)
                </label>
                <input
                  className={inputClass}
                  type="text"
                  value={nextInput}
                  onChange={(e) => setNextInput(e.target.value)}
                  placeholder="/inicio"
                />
                <p className="text-xs text-slate-400">{nextHint}</p>
              </div>
            </details>

            <button className="btn-primary w-full" disabled={busy} type="submit">
              {busy ? t("common.actions.loading") : primaryText}
            </button>

            <button type="button" className="btn-outline w-full" onClick={() => navigate("/")}>
              {t("common.actions.back")}
            </button>
          </form>

          <details className="mt-4 text-xs text-slate-400">
            <summary className="cursor-pointer select-none">{debugLabel}</summary>
            <div className="mt-2 space-y-2">
              <div>
                Supabase: <span className="break-all text-slate-300">{supabaseUrlHost}</span>
              </div>
              <div>
                Redirect Magic Link:{" "}
                <span className="break-all text-slate-300">{redirectTo}</span>
              </div>
              <div>
                Redirect Reset:{" "}
                <span className="break-all text-slate-300">{resetRedirectTo}</span>
              </div>
              <div>
                Mode: <span className="break-all text-slate-300">{mode}</span>
              </div>
              <div>
                hasModeInUrl:{" "}
                <span className="break-all text-slate-300">{String(hasModeInUrl)}</span>
              </div>
            </div>
          </details>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">{t("landing.privacyMiniNote")}</p>
      </div>
    </div>
  );
}
