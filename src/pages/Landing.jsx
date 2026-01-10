// src/pages/Landing.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

/** =========================
 * Helpers (a prueba de i18n)
 * ========================= */
function safeT(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string") {
    const s = value.trim();
    return s ? s : fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const s = JSON.stringify(value);
    return s && s !== "{}" && s !== "[]" ? s : fallback;
  } catch {
    return fallback || String(value);
  }
}

export default function Landing() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session } = useAuth();

  const [email, setEmail] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const isLogged = !!session;

  const mode = useMemo(() => {
    const m = (searchParams.get("mode") || "").toLowerCase();
    return m; // "magic" | "" etc
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;

        // Si ya hay sesión, redirigimos a inicio (pero NO forzamos si estás solo viendo landing)
        if (data?.session) {
          setCheckingSession(false);
          return;
        }
      } catch {
        // ignore
      } finally {
        if (active) setCheckingSession(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const normEmail = (v) => String(v || "").trim().toLowerCase();
  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const handleSendMagicLink = async (e) => {
    e.preventDefault();
    setStatusMsg("");
    setErrorMsg("");

    const em = normEmail(email);
    if (!em || !isValidEmail(em)) {
      setErrorMsg(
        safeT(t("landing.invalidEmail", { defaultValue: "Correo inválido." })) ||
          "Correo inválido."
      );
      return;
    }

    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOtp({
        email: em,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        setErrorMsg(
          safeT(t("landing.magicLinkError", { defaultValue: "No se pudo enviar el link." })) ||
            "No se pudo enviar el link."
        );
        return;
      }

      setStatusMsg(
        safeT(
          t("landing.magicLinkSent", {
            defaultValue: "Te enviamos un enlace de acceso. Revisa tu correo.",
          })
        )
      );
    } catch (err) {
      console.error("[Landing] magic link exception", err);
      setErrorMsg(
        safeT(
          t("landing.magicLinkError", { defaultValue: "No se pudo enviar el link." })
        ) || "No se pudo enviar el link."
      );
    } finally {
      setLoading(false);
    }
  };

  const goToPanel = () => navigate("/inicio");

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="w-full border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center font-bold">
              AG
            </div>
            <div className="leading-tight">
              <div className="font-semibold">
                {safeT(t("landing.brandName", { defaultValue: "App Geocercas" }))}
              </div>
              <div className="text-xs text-white/60">
                {safeT(
                  t("landing.brandTagline", {
                    defaultValue: "Control de personal por geocercas",
                  })
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Idiomas los manejas en tu AppHeader/LanguageSwitcher si aplica */}
            {isLogged ? (
              <>
                <button
                  type="button"
                  onClick={goToPanel}
                  className="px-3 py-1.5 rounded-full text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10"
                >
                  {safeT(t("landing.goToPanel", { defaultValue: "Ir al panel" }))}
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="px-3 py-1.5 rounded-full text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10"
              >
                {safeT(t("landing.login", { defaultValue: "Entrar" }))}
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
              {safeT(
                t("landing.heroTitle", {
                  defaultValue:
                    "Controla a tu personal con geocercas inteligentes en cualquier parte del mundo",
                })
              )}
            </h1>

            <p className="mt-5 text-white/70 text-base sm:text-lg leading-relaxed">
              {safeT(
                t("landing.heroSubtitle", {
                  defaultValue:
                    "App Geocercas te permite asignar personas a zonas, registrar actividades y calcular costos en tiempo real.",
                })
              )}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {isLogged ? (
                <button
                  type="button"
                  onClick={goToPanel}
                  className="px-5 py-2.5 rounded-full font-semibold bg-emerald-600 hover:bg-emerald-500"
                >
                  {safeT(
                    t("landing.ctaGoPanel", { defaultValue: "Ir al panel" })
                  )}
                </button>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="px-5 py-2.5 rounded-full font-semibold bg-emerald-600 hover:bg-emerald-500"
                  >
                    {safeT(
                      t("landing.ctaLogin", { defaultValue: "Ingresar" })
                    )}
                  </Link>

                  <Link
                    to="/login?mode=magic"
                    className="px-5 py-2.5 rounded-full font-semibold bg-white/10 hover:bg-white/15 border border-white/10"
                  >
                    {safeT(
                      t("landing.ctaMagic", { defaultValue: "Magic Link" })
                    )}
                  </Link>
                </>
              )}
            </div>

            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <div className="font-semibold">
                  {safeT(
                    t("landing.feature1Title", { defaultValue: "Geocercas" })
                  )}
                </div>
                <div className="text-sm text-white/70 mt-1">
                  {safeT(
                    t("landing.feature1Desc", {
                      defaultValue:
                        "Crea zonas en el mapa y asigna personal por organización.",
                    })
                  )}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <div className="font-semibold">
                  {safeT(
                    t("landing.feature2Title", {
                      defaultValue: "Tracker GPS",
                    })
                  )}
                </div>
                <div className="text-sm text-white/70 mt-1">
                  {safeT(
                    t("landing.feature2Desc", {
                      defaultValue:
                        "Registro de posiciones y actividad con sincronización.",
                    })
                  )}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <div className="font-semibold">
                  {safeT(
                    t("landing.feature3Title", {
                      defaultValue: "Asignaciones",
                    })
                  )}
                </div>
                <div className="text-sm text-white/70 mt-1">
                  {safeT(
                    t("landing.feature3Desc", {
                      defaultValue:
                        "Asignación de personas a geocercas y seguimiento operativo.",
                    })
                  )}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <div className="font-semibold">
                  {safeT(
                    t("landing.feature4Title", {
                      defaultValue: "Costos y reportes",
                    })
                  )}
                </div>
                <div className="text-sm text-white/70 mt-1">
                  {safeT(
                    t("landing.feature4Desc", {
                      defaultValue:
                        "Dashboard de costos, reportes por persona, zona y fechas.",
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Panel derecho: Magic link rápido (opcional) */}
          <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
            <h2 className="text-xl font-bold">
              {safeT(
                t("landing.quickAccessTitle", {
                  defaultValue: "Acceso rápido",
                })
              )}
            </h2>

            <p className="mt-2 text-sm text-white/70">
              {safeT(
                t("landing.quickAccessDesc", {
                  defaultValue:
                    "Si prefieres, puedes ingresar con Magic Link (sin contraseña).",
                })
              )}
            </p>

            {checkingSession ? (
              <div className="mt-6 text-xs text-white/60">
                {safeT(
                  t("landing.checkingSession", { defaultValue: "Verificando..." }),
                  "Verificando..."
                )}
              </div>
            ) : isLogged ? (
              <div className="mt-6">
                <div className="text-sm text-white/70">
                  {safeT(
                    t("landing.alreadyLogged", {
                      defaultValue: "Ya tienes sesión activa.",
                    })
                  )}
                </div>
                <button
                  type="button"
                  onClick={goToPanel}
                  className="mt-3 w-full px-4 py-2.5 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-500"
                >
                  {safeT(
                    t("landing.goToPanel", { defaultValue: "Ir al panel" })
                  )}
                </button>
              </div>
            ) : (
              <>
                <form onSubmit={handleSendMagicLink} className="mt-6">
                  <label className="block text-xs text-white/70 mb-2">
                    {safeT(
                      t("landing.emailLabel", { defaultValue: "Correo" })
                    )}
                  </label>

                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder={safeT(
                      t("landing.emailPlaceholder", {
                        defaultValue: "correo@ejemplo.com",
                      })
                    )}
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-4 py-2.5 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-emerald-500"
                  />

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-4 w-full px-4 py-2.5 rounded-xl font-semibold bg-white text-slate-900 hover:bg-white/90 disabled:opacity-60"
                  >
                    {loading
                      ? safeT(
                          t("landing.sending", { defaultValue: "Enviando..." })
                        )
                      : safeT(
                          t("landing.sendMagicLink", {
                            defaultValue: "Enviar Magic Link",
                          })
                        )}
                  </button>

                  {statusMsg && (
                    <div className="mt-4 text-sm text-emerald-300">
                      {safeT(statusMsg)}
                    </div>
                  )}
                  {errorMsg && (
                    <div className="mt-4 text-sm text-red-300">
                      {safeT(errorMsg)}
                    </div>
                  )}
                </form>

                <div className="mt-6 text-xs text-white/60">
                  {safeT(
                    t("landing.securityNote", {
                      defaultValue:
                        "Importante: el acceso funciona solo con el Magic Link real.",
                    })
                  )}
                </div>
              </>
            )}

            {/* Link a soporte si existe */}
            <div className="mt-6 text-xs text-white/50">
              <Link to="/soporte" className="underline hover:text-white/80">
                {safeT(t("landing.support", { defaultValue: "Soporte" }))}
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-14 pt-6 border-t border-white/10 text-xs text-white/50 flex items-center justify-between">
          <span>© {new Date().getFullYear()} App Geocercas</span>
          <span>
            {safeT(
              t("landing.footerNote", { defaultValue: "Fenice Ecuador S.A.S." })
            )}
          </span>
        </footer>
      </main>
    </div>
  );
}
